#include "SP404Engine.h"
#include <cmath>
#include <random>

namespace johnwalls::johnwalls {

SP404Engine::SP404Engine() {
    initDefaultBankA();
    reset();
}

void SP404Engine::prepare(double sampleRate, int /*samplesPerBlock*/) {
    m_sampleRate = (sampleRate > 8000.0) ? sampleRate : 48000.0;
    updateMfxFilters();
}

void SP404Engine::reset() {
    std::lock_guard<std::mutex> lock(m_voiceMutex);
    for (auto& v : m_voices) {
        v.active = false;
        v.fadingOut = false;
        v.fadeOutGain = 1.0f;
    }
    m_isoLowL.reset(); m_isoLowR.reset();
    m_isoMidL.reset(); m_isoMidR.reset();
    m_isoHighL.reset(); m_isoHighR.reset();
    m_filterL.reset(); m_filterR.reset();
    updateMfxFilters();
}

void SP404Engine::updateMfxFilters() {
    const float sRate = static_cast<float>(m_sampleRate);
    const auto mfxType = static_cast<SP404MFX>(m_activeMfx.load(std::memory_order_relaxed));
    const float c1 = m_ctrl1.load(std::memory_order_relaxed); // 0..10
    const float c2 = m_ctrl2.load(std::memory_order_relaxed); // 0..10
    const float c3 = m_ctrl3.load(std::memory_order_relaxed); // 0..10

    if (mfxType == SP404MFX::Isolator) {
        // CTRL 1 = Low Kill (-36dB to +6dB, center 5 = 0dB)
        float lowGainDb = (c1 - 5.0f) * 7.2f;
        if (c1 <= 0.5f) lowGainDb = -72.0f;
        m_isoLowL.setLowShelf(280.0f, lowGainDb, sRate);
        m_isoLowR.setLowShelf(280.0f, lowGainDb, sRate);

        // CTRL 2 = Mid Kill
        float midGainDb = (c2 - 5.0f) * 6.0f;
        if (c2 <= 0.5f) midGainDb = -72.0f;
        m_isoMidL.setPeaking(1200.0f, midGainDb, 0.8f, sRate);
        m_isoMidR.setPeaking(1200.0f, midGainDb, 0.8f, sRate);

        // CTRL 3 = High Kill
        float highGainDb = (c3 - 5.0f) * 7.2f;
        if (c3 <= 0.5f) highGainDb = -72.0f;
        m_isoHighL.setHighShelf(4200.0f, highGainDb, sRate);
        m_isoHighR.setHighShelf(4200.0f, highGainDb, sRate);

        m_filterL.setLowPass(20000.0f, 0.7071f, sRate);
        m_filterR.setLowPass(20000.0f, 0.7071f, sRate);
    } else if (mfxType == SP404MFX::Filter) {
        // CTRL 1 = Cutoff (200Hz to 18000Hz exponential)
        float norm = std::clamp(c1 / 10.0f, 0.0f, 1.0f);
        float cutoff = 200.0f * std::pow(90.0f, norm);
        // CTRL 2 = Resonance Q (0.7 to 8.0)
        float q = 0.7071f + (c2 / 10.0f) * 7.0f;

        m_filterL.setLowPass(cutoff, q, sRate);
        m_filterR.setLowPass(cutoff, q, sRate);

        m_isoLowL.setLowShelf(280.0f, 0.0f, sRate);
        m_isoLowR.setLowShelf(280.0f, 0.0f, sRate);
        m_isoMidL.setPeaking(1200.0f, 0.0f, 0.8f, sRate);
        m_isoMidR.setPeaking(1200.0f, 0.0f, 0.8f, sRate);
        m_isoHighL.setHighShelf(4200.0f, 0.0f, sRate);
        m_isoHighR.setHighShelf(4200.0f, 0.0f, sRate);
    } else {
        // Transparent default for other MFX
        m_isoLowL.setLowShelf(280.0f, 0.0f, sRate);
        m_isoLowR.setLowShelf(280.0f, 0.0f, sRate);
        m_isoMidL.setPeaking(1200.0f, 0.0f, 0.8f, sRate);
        m_isoMidR.setPeaking(1200.0f, 0.0f, 0.8f, sRate);
        m_isoHighL.setHighShelf(4200.0f, 0.0f, sRate);
        m_isoHighR.setHighShelf(4200.0f, 0.0f, sRate);
        m_filterL.setLowPass(20000.0f, 0.7071f, sRate);
        m_filterR.setLowPass(20000.0f, 0.7071f, sRate);
    }
}

void SP404Engine::triggerPad(int bankIndex, int padId, float velocity, float semitoneOffset) {
    std::lock_guard<std::mutex> lock(m_voiceMutex);
    triggerPadLocked(bankIndex, padId, velocity, semitoneOffset);
}

void SP404Engine::triggerPadLocked(int bankIndex, int padId, float velocity, float semitoneOffset) {
    if (bankIndex < 0 || bankIndex >= static_cast<int>(kNumBanks)) return;
    if (padId < 1 || padId > static_cast<int>(kPadsPerBank)) return;

    int targetBank = bankIndex;
    int targetPad = padId;
    float effectivePitch = semitoneOffset;

    if (m_isChromatic.load(std::memory_order_relaxed)) {
        targetBank = m_chromaticRootBank.load(std::memory_order_relaxed);
        targetPad = m_chromaticRootPad.load(std::memory_order_relaxed);
        // Pad 1 = -12st, Pad 13 = 0st, Pad 16 = +3st
        effectivePitch = static_cast<float>((padId - 1) - 12);
    }

    auto* pad = getPad(targetBank, targetPad);
    if (!pad || pad->sampleL.empty()) return;

    // m_voiceMutex is held by the caller.

    // Handle Mute Group chokes (e.g. Closed Hat chokes Open Hat)
    if (pad->muteGroup > 0) {
        for (auto& v : m_voices) {
            if (v.active && v.muteGroup == pad->muteGroup) {
                v.fadingOut = true;
            }
        }
    }

    // Find available voice slot or steal oldest
    size_t voiceIdx = 0;
    bool found = false;
    for (size_t i = 0; i < kMaxVoices; ++i) {
        if (!m_voices[i].active) {
            voiceIdx = i;
            found = true;
            break;
        }
    }
    if (!found) {
        voiceIdx = 0; // steal slot 0
    }

    auto& voice = m_voices[voiceIdx];
    voice.bankIndex = targetBank;
    voice.padId = targetPad;
    voice.pSampleL = &pad->sampleL;
    voice.pSampleR = pad->sampleR.empty() ? &pad->sampleL : &pad->sampleR;
    voice.pos = pad->isReverse ? static_cast<double>(pad->sampleL.size() - 1) : 0.0;
    voice.loop = pad->isLoop;
    voice.reverse = pad->isReverse;
    voice.muteGroup = pad->muteGroup;
    voice.fadingOut = false;
    voice.fadeOutGain = 1.0f;

    // Calculate sample rate playback ratio & pitch transpose
    const double pitchRatio = std::pow(2.0, (pad->pitchSemitones + effectivePitch) / 12.0);
    const double sRateRatio = pad->sampleRate / m_sampleRate;
    voice.step = pitchRatio * sRateRatio;
    if (voice.reverse) {
        voice.step = -std::abs(voice.step);
    } else {
        voice.step = std::abs(voice.step);
    }

    // Panning (equal power)
    const float pan = std::clamp(pad->pan, -1.0f, 1.0f);
    const float panAngle = (pan + 1.0f) * 0.7853981633974483f; // (pan+1)*pi/4
    voice.panL = std::cos(panAngle);
    voice.panR = std::sin(panAngle);
    voice.volume = pad->volume * std::clamp(velocity, 0.05f, 1.0f);
    voice.active = true;
}

void SP404Engine::releasePad(int bankIndex, int padId) {
    std::lock_guard<std::mutex> lock(m_voiceMutex);
    releasePadLocked(bankIndex, padId);
}

void SP404Engine::releasePadLocked(int bankIndex, int padId) {

    for (auto& v : m_voices) {
        if (v.active && v.bankIndex == bankIndex && v.padId == padId) {
            v.fadingOut = true;
        }
    }
}

void SP404Engine::stopAll() {
    std::lock_guard<std::mutex> lock(m_voiceMutex);
    for (auto& v : m_voices) {
        v.active = false;
        v.fadingOut = false;
        v.fadeOutGain = 1.0f;
    }
}

void SP404Engine::enqueueMidi(bool noteOn, int noteNumber, float velocity) {
    // Single producer (audio thread). Never blocks and never allocates.
    const uint32_t head = m_midiHead.load(std::memory_order_relaxed);
    const uint32_t tail = m_midiTail.load(std::memory_order_acquire);
    if (head - tail >= kMidiQueueSize) return; // full: drop
    m_midiQueue[head % kMidiQueueSize] = {noteOn, noteNumber, velocity};
    m_midiHead.store(head + 1, std::memory_order_release);
}

void SP404Engine::handleMidiNoteOn(int noteNumber, float velocity) {
    enqueueMidi(true, noteNumber, velocity);
}

void SP404Engine::handleMidiNoteOff(int noteNumber) {
    enqueueMidi(false, noteNumber, 0.0f);
}

void SP404Engine::drainMidiLocked() {
    uint32_t tail = m_midiTail.load(std::memory_order_relaxed);
    const uint32_t head = m_midiHead.load(std::memory_order_acquire);
    while (tail != head) {
        const auto ev = m_midiQueue[tail % kMidiQueueSize];
        ++tail;
        const bool chromatic = m_isChromatic.load(std::memory_order_relaxed);
        const int rootBank = m_chromaticRootBank.load(std::memory_order_relaxed);
        const int rootPad = m_chromaticRootPad.load(std::memory_order_relaxed);
        if (ev.noteOn) {
            if (chromatic) {
                // Chromatic map: Note 60 (Middle C) = 0 semitone offset
                triggerPadLocked(rootBank, rootPad, ev.velocity, static_cast<float>(ev.note - 60));
            } else if (ev.note >= 36 && ev.note <= 51) {
                // Standard Roland SP-404 Drum Map: C1 (36) -> Pad 1 ... D#2 (51) -> Pad 16
                triggerPadLocked(0, (ev.note - 36) + 1, ev.velocity, 0.0f);
            } else if (ev.note >= 52 && ev.note <= 67) {
                triggerPadLocked(1, (ev.note - 52) + 1, ev.velocity, 0.0f); // Bank B
            }
        } else {
            if (chromatic) {
                releasePadLocked(rootBank, rootPad);
            } else if (ev.note >= 36 && ev.note <= 51) {
                releasePadLocked(0, (ev.note - 36) + 1);
            } else if (ev.note >= 52 && ev.note <= 67) {
                releasePadLocked(1, (ev.note - 52) + 1);
            }
        }
    }
    m_midiTail.store(tail, std::memory_order_release);
}

void SP404Engine::setParam(const std::string& name, float value) {
    if (name == "volume") {
        m_volume.store(std::clamp(value, 0.0f, 10.0f), std::memory_order_relaxed);
    } else if (name == "ctrl1") {
        m_ctrl1.store(std::clamp(value, 0.0f, 10.0f), std::memory_order_relaxed);
        updateMfxFilters();
    } else if (name == "ctrl2") {
        m_ctrl2.store(std::clamp(value, 0.0f, 10.0f), std::memory_order_relaxed);
        updateMfxFilters();
    } else if (name == "ctrl3") {
        m_ctrl3.store(std::clamp(value, 0.0f, 10.0f), std::memory_order_relaxed);
        updateMfxFilters();
    } else if (name == "mfx") {
        m_activeMfx.store(std::clamp(static_cast<int>(value), 0, 5), std::memory_order_relaxed);
        updateMfxFilters();
    } else if (name == "routing" || name == "placement") {
        m_placement.store(value > 0.5f ? SP404Placement::AfterPedals : SP404Placement::BeforePedals, std::memory_order_relaxed);
    } else if (name == "bypass") {
        m_bypassed.store(value > 0.5f, std::memory_order_relaxed);
    } else if (name == "stop_all" || name == "stopAll") {
        stopAll();
    }
}

float SP404Engine::getParam(const std::string& name) const {
    if (name == "volume") return m_volume.load(std::memory_order_relaxed);
    if (name == "ctrl1") return m_ctrl1.load(std::memory_order_relaxed);
    if (name == "ctrl2") return m_ctrl2.load(std::memory_order_relaxed);
    if (name == "ctrl3") return m_ctrl3.load(std::memory_order_relaxed);
    if (name == "mfx") return static_cast<float>(m_activeMfx.load(std::memory_order_relaxed));
    if (name == "routing" || name == "placement") return m_placement.load(std::memory_order_relaxed) == SP404Placement::AfterPedals ? 1.0f : 0.0f;
    if (name == "bypass") return m_bypassed.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    return 0.0f;
}

bool SP404Engine::loadCustomSample(int bankIndex, int padId, const float* left, const float* right,
                                   size_t numSamples, float sampleRate, const std::string& label) {
    auto* pad = getPad(bankIndex, padId);
    if (!pad || numSamples == 0 || !left) return false;

    std::lock_guard<std::mutex> lock(m_voiceMutex);
    pad->sampleL.assign(left, left + numSamples);
    if (right) {
        pad->sampleR.assign(right, right + numSamples);
    } else {
        pad->sampleR = pad->sampleL;
    }
    pad->sampleRate = (sampleRate > 8000.0f) ? sampleRate : 48000.0f;
    pad->durationSeconds = static_cast<float>(numSamples) / pad->sampleRate;
    if (!label.empty()) {
        pad->label = label;
    }
    return true;
}

SP404PadData* SP404Engine::getPad(int bankIndex, int padId) {
    if (bankIndex >= 0 && bankIndex < static_cast<int>(kNumBanks) &&
        padId >= 1 && padId <= static_cast<int>(kPadsPerBank)) {
        return &m_banks[static_cast<size_t>(bankIndex)][static_cast<size_t>(padId - 1)];
    }
    return nullptr;
}

const SP404PadData* SP404Engine::getPad(int bankIndex, int padId) const {
    if (bankIndex >= 0 && bankIndex < static_cast<int>(kNumBanks) &&
        padId >= 1 && padId <= static_cast<int>(kPadsPerBank)) {
        return &m_banks[static_cast<size_t>(bankIndex)][static_cast<size_t>(padId - 1)];
    }
    return nullptr;
}

void SP404Engine::process(AudioBufferView& buffer, size_t numSamples, bool mixToOutput) {
    if (m_bypassed.load(std::memory_order_relaxed)) {
        // Discard queued MIDI so stale notes don't fire when un-bypassed.
        m_midiTail.store(m_midiHead.load(std::memory_order_acquire), std::memory_order_release);
        return;
    }
    if (numSamples == 0 || buffer.getNumChannels() == 0) return;

    std::unique_lock<std::mutex> lock(m_voiceMutex, std::try_to_lock);
    if (!lock.owns_lock()) return; // queued MIDI is kept and applied on the next block
    drainMidiLocked();

    const float masterVol = (m_volume.load(std::memory_order_relaxed) / 10.0f) * 0.90f;
    const auto mfx = static_cast<SP404MFX>(m_activeMfx.load(std::memory_order_relaxed));
    const float fadeStep = 1.0f / (static_cast<float>(m_sampleRate) * 0.015f); // 15ms fade out

    float* leftChan = buffer.getChannelData(0);
    float* rightChan = buffer.getNumChannels() > 1 ? buffer.getChannelData(1) : nullptr;

    // Real-time render loop
    for (size_t s = 0; s < numSamples; ++s) {
        float sumL = 0.0f;
        float sumR = 0.0f;

        for (auto& v : m_voices) {
            if (!v.active || !v.pSampleL || v.pSampleL->empty()) continue;

            const auto& dataL = *v.pSampleL;
            const auto& dataR = (v.pSampleR && !v.pSampleR->empty()) ? *v.pSampleR : dataL;
            const size_t len = dataL.size();

            // Check boundary
            if (v.pos < 0.0 || v.pos >= static_cast<double>(len - 1)) {
                if (v.loop) {
                    v.pos = v.reverse ? static_cast<double>(len - 1) : 0.0;
                } else {
                    v.active = false;
                    continue;
                }
            }

            // High-precision linear interpolation
            const size_t idx0 = static_cast<size_t>(v.pos);
            const size_t idx1 = std::min(idx0 + 1, len - 1);
            const float frac = static_cast<float>(v.pos - static_cast<double>(idx0));

            const float sampleValL = dataL[idx0] + frac * (dataL[idx1] - dataL[idx0]);
            const float sampleValR = dataR[idx0] + frac * (dataR[idx1] - dataR[idx0]);

            float voiceGain = v.volume * v.fadeOutGain;
            sumL += sampleValL * voiceGain * v.panL;
            sumR += sampleValR * voiceGain * v.panR;

            // Advance playback position
            v.pos += v.step;

            // Handle choke/release fade out
            if (v.fadingOut) {
                v.fadeOutGain -= fadeStep;
                if (v.fadeOutGain <= 0.0f) {
                    v.active = false;
                    v.fadingOut = false;
                }
            }
        }

        // Apply MFX stage
        if (mfx == SP404MFX::Isolator) {
            sumL = m_isoLowL.process(sumL);
            sumL = m_isoMidL.process(sumL);
            sumL = m_isoHighL.process(sumL);

            sumR = m_isoLowR.process(sumR);
            sumR = m_isoMidR.process(sumR);
            sumR = m_isoHighR.process(sumR);
        } else if (mfx == SP404MFX::Filter) {
            sumL = m_filterL.process(sumL);
            sumR = m_filterR.process(sumR);
            // Drive saturation
            float drive = 1.0f + (m_ctrl3.load(std::memory_order_relaxed) / 10.0f) * 3.0f;
            sumL = fastTanh(sumL * drive);
            sumR = fastTanh(sumR * drive);
        } else if (mfx == SP404MFX::Vinyl) {
            // Vinyl subtle warmth saturation
            sumL = fastTanh(sumL * 1.15f);
            sumR = fastTanh(sumR * 1.15f);
        }

        // Apply Master Volume
        sumL *= masterVol;
        sumR *= masterVol;

        // Mix directly into the host audio buffer
        if (mixToOutput) {
            if (leftChan) {
                leftChan[s] += sumL;
            }
            if (rightChan) {
                rightChan[s] += sumR;
            }
        }
    }
}

void SP404Engine::initDefaultBankA() {
    constexpr double sr = 48000.0;
    const double twoPi = 6.28318530717958647692;

    // Helper lambda to initialize a pad with stereo synthesis
    auto createSample = [&](int padId, const std::string& label, const std::string& cat,
                            double durationSec, int muteGroup, auto generator) {
        auto* pad = getPad(0, padId);
        if (!pad) return;
        pad->id = padId;
        pad->bank = 0;
        pad->label = label;
        pad->category = cat;
        pad->sampleRate = static_cast<float>(sr);
        pad->durationSeconds = static_cast<float>(durationSec);
        pad->muteGroup = muteGroup;

        const size_t totalSamples = static_cast<size_t>(sr * durationSec);
        pad->sampleL.resize(totalSamples);
        pad->sampleR.resize(totalSamples);

        for (size_t i = 0; i < totalSamples; ++i) {
            double t = static_cast<double>(i) / sr;
            auto [l, r] = generator(t, i, totalSamples);
            pad->sampleL[i] = static_cast<float>(l);
            pad->sampleR[i] = static_cast<float>(r);
        }
    };

    // Pad 1: KICK 01 (Deep Booming 808 with Punch Click)
    createSample(1, "KICK 01", "kick", 0.65, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double phase = twoPi * (45.0 * t - (120.0 / 28.0) * std::exp(-t * 28.0));
        double body = std::sin(phase) * std::exp(-t * 4.5);
        double click = (t < 0.005) ? (1.0 - t / 0.005) * 0.4 : 0.0;
        double s = fastTanh(static_cast<float>(body * 1.4 + click));
        return std::pair{s, s};
    });

    // Pad 2: KICK 808 (Punchy 909-Style Dance Kick)
    createSample(2, "KICK 808", "kick", 0.45, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double phase = twoPi * (55.0 * t - (140.0 / 38.0) * std::exp(-t * 38.0));
        double body = std::sin(phase) * std::exp(-t * 6.5);
        double s = fastTanh(static_cast<float>(body * 1.3));
        return std::pair{s, s};
    });

    // Pad 3: CLAP CRISP (Multi-pulse handclap with stereo spread)
    createSample(3, "CLAP CRISP", "snare", 0.38, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double burst = 0.0;
        if (t < 0.012) burst = std::sin(t * 1200.0) * 0.7;
        else if (t < 0.024) burst = std::sin((t - 0.012) * 1400.0) * 0.85;
        else if (t < 0.038) burst = std::sin((t - 0.024) * 1500.0) * 1.0;
        double env = (t > 0.038) ? std::exp(-(t - 0.038) * 18.0) : 1.0;
        double noiseL = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0);
        double noiseR = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0);
        double sL = (burst + noiseL * 0.6) * env;
        double sR = (burst + noiseR * 0.6) * env;
        return std::pair{sL * 0.8, sR * 0.8};
    });

    // Pad 4: SNARE 90s (Tonal body with bright snappy wire)
    createSample(4, "SNARE 90s", "snare", 0.42, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double tone = std::sin(twoPi * 185.0 * t) * std::exp(-t * 16.0);
        double noise = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0) * std::exp(-t * 12.0);
        double s = fastTanh(static_cast<float>(tone * 0.6 + noise * 0.7));
        return std::pair{s, s};
    });

    // Pad 5: CH CLOSED (Tight metallic high-hat, MuteGroup 1)
    createSample(5, "CH CLOSED", "hat", 0.065, 1, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double n = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0);
        double s = n * std::exp(-t * 65.0) * 0.75;
        return std::pair{s, s};
    });

    // Pad 6: OH SIZZLE (Open shimmering hi-hat, MuteGroup 1)
    createSample(6, "OH SIZZLE", "hat", 0.55, 1, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double nL = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0);
        double nR = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0);
        double env = std::exp(-t * 7.5);
        return std::pair{nL * env * 0.7, nR * env * 0.7};
    });

    // Pad 7: TAMB SHAKE (Shaker / Tambourine)
    createSample(7, "TAMB SHAKE", "perc", 0.28, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double n = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0);
        double env = std::sin(t * 3.14159 / 0.28) * std::exp(-t * 6.0);
        double s = n * env * 0.6;
        return std::pair{s, s};
    });

    // Pad 8: RIM CLICK (Warm resonant acoustic wood click)
    createSample(8, "RIM CLICK", "perc", 0.12, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double tone = std::sin(twoPi * 1750.0 * t) * std::exp(-t * 55.0);
        double s = tone * 0.85;
        return std::pair{s, s};
    });

    // Pad 9: VOX CHOP A (Warm soul vocal "Hey")
    createSample(9, "VOX CHOP A", "vox", 0.45, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double f0 = 220.0;
        double s = (std::sin(twoPi * f0 * t) + 0.6 * std::sin(twoPi * 550.0 * t) + 0.4 * std::sin(twoPi * 1100.0 * t));
        double env = std::sin(std::min(1.0, t / 0.04) * 1.5708) * std::exp(-t * 5.0);
        double out = fastTanh(static_cast<float>(s * env * 0.75));
        return std::pair{out, out};
    });

    // Pad 10: VOX CHOP B (Bright vocal "Yeah")
    createSample(10, "VOX CHOP B", "vox", 0.50, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double f0 = 293.66; // D4
        double s = (std::sin(twoPi * f0 * t) + 0.7 * std::sin(twoPi * 720.0 * t) + 0.5 * std::sin(twoPi * 1800.0 * t));
        double env = std::sin(std::min(1.0, t / 0.05) * 1.5708) * std::exp(-t * 4.5);
        double out = fastTanh(static_cast<float>(s * env * 0.75));
        return std::pair{out, out};
    });

    // Pad 11: JAZZ RHODES (Rich FM electric piano Cmaj7 chord: C4, E4, G4, B4)
    createSample(11, "JAZZ RHODES", "sample", 1.8, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double notes[] = {261.63, 329.63, 392.00, 493.88}; // C4, E4, G4, B4
        double sum = 0.0;
        for (double f : notes) {
            double mod = std::sin(twoPi * f * 2.0 * t) * 0.4 * std::exp(-t * 2.5);
            sum += std::sin(twoPi * f * t + mod) * std::exp(-t * 1.8);
        }
        double s = fastTanh(static_cast<float>(sum * 0.35));
        return std::pair{s, s};
    });

    // Pad 12: LOFI CHORD (Moody Fm9 Rhodes: F3, Ab3, C4, Eb4, G4)
    createSample(12, "LOFI CHORD", "sample", 2.2, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double notes[] = {174.61, 207.65, 261.63, 311.13, 392.00}; // Fm9
        double sum = 0.0;
        for (double f : notes) {
            double mod = std::sin(twoPi * f * 1.5 * t) * 0.3 * std::exp(-t * 1.8);
            sum += std::sin(twoPi * f * t + mod) * std::exp(-t * 1.4);
        }
        double s = fastTanh(static_cast<float>(sum * 0.30));
        return std::pair{s, s};
    });

    // Pad 13: 808 SUB SLIDE (Deep 42Hz saturated sub bass)
    createSample(13, "808 SUB SLIDE", "bass", 1.2, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double freq = 42.0;
        if (t > 0.3) freq = 42.0 + (t - 0.3) * 20.0; // pitch slide
        double s = std::sin(twoPi * freq * t) * std::exp(-t * 1.8);
        double sat = fastTanh(static_cast<float>(s * 1.8)) * 0.85;
        return std::pair{sat, sat};
    });

    // Pad 14: UPRIGHT BASS (55Hz acoustic upright bass note with body resonance)
    createSample(14, "UPRIGHT BASS", "bass", 1.4, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double body = (std::sin(twoPi * 55.0 * t) + 0.5 * std::sin(twoPi * 110.0 * t) + 0.25 * std::sin(twoPi * 165.0 * t));
        double env = std::exp(-t * 2.2);
        double s = fastTanh(static_cast<float>(body * env * 1.2)) * 0.8;
        return std::pair{s, s};
    });

    // Pad 15: VINYL CRACKLE (Vintage vinyl surface noise & crackle loop)
    createSample(15, "VINYL CRACKLE", "fx", 1.5, 0, [&](double /*t*/, size_t /*i*/, size_t /*tot*/) {
        double hiss = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0) * 0.06;
        double pop = ((rand() % 3500) == 0) ? ((static_cast<double>(rand()) / RAND_MAX) * 0.8) : 0.0;
        double s = (hiss + pop) * 0.7;
        return std::pair{s, s * 0.9};
    });

    // Pad 16: REVERSE TAPE (Reverse tape noise swell with transient peak)
    createSample(16, "REVERSE TAPE", "fx", 0.9, 0, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double ramp = std::pow(t / 0.9, 3.0);
        double noise = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0) * ramp * 0.8;
        double s = fastTanh(static_cast<float>(noise));
        return std::pair{s, s};
    });

    // Initialize Banks B through J with clean empty pad descriptors
    for (size_t b = 1; b < kNumBanks; ++b) {
        char bankChar = static_cast<char>('A' + b);
        for (size_t p = 0; p < kPadsPerBank; ++p) {
            auto& pad = m_banks[b][p];
            pad.id = static_cast<int>(p + 1);
            pad.bank = static_cast<int>(b);
            pad.label = std::string("PAD ") + bankChar + (p < 9 ? "0" : "") + std::to_string(p + 1);
            pad.category = "custom";
            pad.sampleRate = static_cast<float>(sr);
            pad.durationSeconds = 0.0f;
            pad.muteGroup = 0;
            pad.sampleL.clear();
            pad.sampleR.clear();
        }
    }
}

} // namespace johnwalls::johnwalls
