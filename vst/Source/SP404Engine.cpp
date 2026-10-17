#include "SP404Engine.h"
#include <cmath>
#include <random>
#include <cstring>

namespace johnwalls::johnwalls {

SP404Engine::SP404Engine() {
    initDefaultBankA();
    reset();
}

void SP404Engine::prepare(double sampleRate, int /*samplesPerBlock*/) {
    m_sampleRate = (sampleRate > 8000.0) ? sampleRate : 48000.0;

    const size_t djfxSize = static_cast<size_t>(m_sampleRate * 2.0);
    m_djfxBufL.assign(djfxSize, 0.0f);
    m_djfxBufR.assign(djfxSize, 0.0f);
    m_djfxWriteIdx = 0;
    m_djfxReadIdx = 0.0;
    m_djfxLoopLen = static_cast<size_t>(m_sampleRate * 0.1);

    const size_t modDelaySize = static_cast<size_t>(m_sampleRate * 0.25);
    m_modDelayBufL.assign(modDelaySize, 0.0f);
    m_modDelayBufR.assign(modDelaySize, 0.0f);
    m_modDelayWriteIdx = 0;
    m_tapeLfo1 = 0.0;
    m_tapeLfo2 = 0.0;
    m_vinylLfo = 0.0;

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
    m_tapeToneL.reset(); m_tapeToneR.reset();

    std::fill(m_djfxBufL.begin(), m_djfxBufL.end(), 0.0f);
    std::fill(m_djfxBufR.begin(), m_djfxBufR.end(), 0.0f);
    std::fill(m_modDelayBufL.begin(), m_modDelayBufL.end(), 0.0f);
    std::fill(m_modDelayBufR.begin(), m_modDelayBufR.end(), 0.0f);
    m_djfxWriteIdx = 0;
    m_djfxReadIdx = 0.0;
    m_modDelayWriteIdx = 0;

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
    } else if (mfxType == SP404MFX::Cassette) {
        // CTRL 2 = Tape Tone / High Shelf damping
        float toneGainDb = -((10.0f - c2) * 2.2f);
        m_tapeToneL.setHighShelf(6500.0f, toneGainDb, sRate);
        m_tapeToneR.setHighShelf(6500.0f, toneGainDb, sRate);
    } else if (mfxType == SP404MFX::Pitch) {
        // Real-time varispeed modulation on active voices!
        const float globalT = m_globalTranspose.load(std::memory_order_relaxed);
        const float coarseSt = ((c1 - 5.0f) / 5.0f) * 12.0f;
        const float fineSt = ((c2 - 5.0f) / 5.0f) * 1.0f;
        const float mfxPitchOffset = coarseSt + fineSt;
        for (auto& voice : m_voices) {
            if (!voice.active) continue;
            const auto* pad = getPad(voice.bankIndex, voice.padId);
            if (!pad) continue;
            const double pitchRatio = std::pow(2.0, (pad->pitchSemitones + globalT + mfxPitchOffset) / 12.0);
            const double sRateRatio = pad->sampleRate / m_sampleRate;
            voice.step = (voice.reverse ? -1.0 : 1.0) * std::abs(pitchRatio * sRateRatio);
        }
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
        // Legacy profile chromatic range: pad 1 = -12st through pad 12 = -1st.
        effectivePitch = static_cast<float>((padId - 1) - 12);
    }

    auto* pad = getPad(targetBank, targetPad);
    if (!pad || pad->sampleL.empty()) return;

    // If HOLD mode or LOOP mode is active, hitting an already playing pad toggles it OFF!
    if (m_isHold.load(std::memory_order_relaxed) || pad->isLoop) {
        bool toggledOff = false;
        for (auto& v : m_voices) {
            if (v.active && !v.fadingOut && v.bankIndex == targetBank && v.padId == targetPad) {
                // Debounce check: only toggle off if the voice has been rendering for at least ~120ms (prevents jitter / double-clicks)
                if (v.samplesRendered > static_cast<uint64_t>(m_sampleRate * 0.12)) {
                    v.fadingOut = true;
                    toggledOff = true;
                } else {
                    return; // Ignore rapid double-trigger jitter
                }
            }
        }
        if (toggledOff) return;
    }

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
    voice.loop = pad->isLoop || m_isHold.load(std::memory_order_relaxed);
    voice.gate = pad->isGate;
    voice.reverse = pad->isReverse;
    voice.muteGroup = pad->muteGroup;
    voice.fadingOut = false;
    voice.fadeOutGain = 1.0f;
    voice.samplesRendered = 0;

    // Calculate sample rate playback ratio & pitch transpose
    float mfxPitchOffset = 0.0f;
    if (m_activeMfx.load(std::memory_order_relaxed) == static_cast<int>(SP404MFX::Pitch)) {
        const float c1 = m_ctrl1.load(std::memory_order_relaxed);
        const float c2 = m_ctrl2.load(std::memory_order_relaxed);
        mfxPitchOffset = ((c1 - 5.0f) / 5.0f) * 12.0f + ((c2 - 5.0f) / 5.0f) * 1.0f;
    }
    const float globalT = m_globalTranspose.load(std::memory_order_relaxed);
    const double pitchRatio = std::pow(2.0, (pad->pitchSemitones + effectivePitch + globalT + mfxPitchOffset) / 12.0);
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
    // If HOLD mode is active, ignore release - pad remains latched on!
    if (m_isHold.load(std::memory_order_relaxed)) {
        return;
    }
    for (auto& v : m_voices) {
        if (v.active && v.bankIndex == bankIndex && v.padId == padId) {
            // Only Gate mode voices fade out on release!
            if (v.gate) {
                v.fadingOut = true;
            }
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

void SP404Engine::setHoldMode(bool enabled) {
    m_isHold.store(enabled, std::memory_order_relaxed);
    if (!enabled) {
        std::unique_lock<std::mutex> lock(m_voiceMutex, std::try_to_lock);
        if (lock.owns_lock()) {
            for (auto& v : m_voices) {
                if (v.active) {
                    const auto* pad = getPad(v.bankIndex, v.padId);
                    if (pad && !pad->isLoop) {
                        v.loop = false;
                    }
                }
            }
        }
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
            } else if (ev.note >= 36 && ev.note < 36 + static_cast<int>(kNumBanks * kPadsPerBank)) {
                // Bank A (36-47), Bank B (48-59), Bank C (60-71), Bank D (72-83), Bank E (84-95), Bank F (96-107)...
                const int noteOffset = ev.note - 36;
                const int targetBank = noteOffset / static_cast<int>(kPadsPerBank);
                const int targetPad = (noteOffset % static_cast<int>(kPadsPerBank)) + 1;
                triggerPadLocked(targetBank, targetPad, ev.velocity, 0.0f);
            }
        } else {
            if (chromatic) {
                releasePadLocked(rootBank, rootPad);
            } else if (ev.note >= 36 && ev.note < 36 + static_cast<int>(kNumBanks * kPadsPerBank)) {
                const int noteOffset = ev.note - 36;
                const int targetBank = noteOffset / static_cast<int>(kPadsPerBank);
                const int targetPad = (noteOffset % static_cast<int>(kPadsPerBank)) + 1;
                releasePadLocked(targetBank, targetPad);
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
    } else if (name == "transpose" || name == "globalTranspose") {
        setGlobalTranspose(value);
        updateMfxFilters();
    } else if (name == "hold" || name == "isHold") {
        setHoldMode(value > 0.5f);
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
    if (name == "transpose" || name == "globalTranspose") return m_globalTranspose.load(std::memory_order_relaxed);
    if (name == "hold" || name == "isHold") return m_isHold.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    if (name == "routing" || name == "placement") return m_placement.load(std::memory_order_relaxed) == SP404Placement::AfterPedals ? 1.0f : 0.0f;
    if (name == "bypass") return m_bypassed.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    return 0.0f;
}

void SP404Engine::setPadParam(int bankIndex, int padId, const std::string& param, float value) {
    std::lock_guard<std::mutex> lock(m_voiceMutex);
    auto* pad = getPad(bankIndex, padId);
    if (!pad) return;

    if (param == "pitch") {
        pad->pitchSemitones = std::clamp(value, -24.0f, 24.0f);
        const float globalT = m_globalTranspose.load(std::memory_order_relaxed);
        float mfxPitchOffset = 0.0f;
        if (m_activeMfx.load(std::memory_order_relaxed) == static_cast<int>(SP404MFX::Pitch)) {
            const float c1 = m_ctrl1.load(std::memory_order_relaxed);
            const float c2 = m_ctrl2.load(std::memory_order_relaxed);
            mfxPitchOffset = ((c1 - 5.0f) / 5.0f) * 12.0f + ((c2 - 5.0f) / 5.0f) * 1.0f;
        }
        for (auto& voice : m_voices) {
            if (voice.active && voice.bankIndex == bankIndex && voice.padId == padId) {
                const double pitchRatio = std::pow(2.0, (pad->pitchSemitones + globalT + mfxPitchOffset) / 12.0);
                const double sRateRatio = pad->sampleRate / m_sampleRate;
                voice.step = (voice.reverse ? -1.0 : 1.0) * std::abs(pitchRatio * sRateRatio);
            }
        }
    } else if (param == "volume") {
        pad->volume = std::clamp(value, 0.0f, 2.0f);
        for (auto& voice : m_voices) {
            if (voice.active && voice.bankIndex == bankIndex && voice.padId == padId) {
                voice.volume = pad->volume;
            }
        }
    } else if (param == "pan") {
        pad->pan = std::clamp(value, -1.0f, 1.0f);
        const float pan = pad->pan;
        for (auto& voice : m_voices) {
            if (voice.active && voice.bankIndex == bankIndex && voice.padId == padId) {
                const float panAngle = (pan + 1.0f) * 0.7853981633974483f;
                voice.panL = std::cos(panAngle);
                voice.panR = std::sin(panAngle);
            }
        }
    } else if (param == "muteGroup") {
        pad->muteGroup = static_cast<int>(value);
        for (auto& voice : m_voices) {
            if (voice.active && voice.bankIndex == bankIndex && voice.padId == padId) {
                voice.muteGroup = pad->muteGroup;
            }
        }
    } else if (param == "reverse") {
        pad->isReverse = (value > 0.5f);
        for (auto& voice : m_voices) {
            if (voice.active && voice.bankIndex == bankIndex && voice.padId == padId) {
                voice.reverse = pad->isReverse;
                voice.step = (voice.reverse ? -1.0 : 1.0) * std::abs(voice.step);
            }
        }
    } else if (param == "mode" || param == "isLoop") {
        pad->isLoop = (value >= 1.5f);
        pad->isGate = (value >= 0.5f && value < 1.5f);
        for (auto& voice : m_voices) {
            if (voice.active && voice.bankIndex == bankIndex && voice.padId == padId) {
                voice.loop = pad->isLoop;
                voice.gate = pad->isGate;
            }
        }
    }
}

void SP404Engine::setPadLabel(int bankIndex, int padId, const std::string& label) {
    std::lock_guard<std::mutex> lock(m_voiceMutex);
    auto* pad = getPad(bankIndex, padId);
    if (!pad) return;
    pad->label = label;
}

bool SP404Engine::loadCustomSample(int bankIndex, int padId, const float* left, const float* right,
                                   size_t numSamples, float sampleRate, const std::string& label,
                                   float pitchSemitones, float volume, float pan,
                                   bool isLoop, bool isReverse, int muteGroup,
                                   const std::vector<float>& waveform) {
    auto* pad = getPad(bankIndex, padId);
    if (!pad || numSamples == 0 || !left) return false;

    // Allocate and copy audio data OUTSIDE the voice mutex so audio thread never waits on heap allocation
    std::vector<float> newL(left, left + numSamples);
    std::vector<float> newR;
    if (right) {
        newR.assign(right, right + numSamples);
    } else {
        newR = newL;
    }

    std::vector<float> newWaveform = waveform;
    if (newWaveform.empty() && numSamples > 0) {
        newWaveform.assign(32, 0.0f);
        size_t blockSize = std::max<size_t>(1, numSamples / 32);
        for (size_t w = 0; w < 32; ++w) {
            float peak = 0.0f;
            size_t start = w * blockSize;
            size_t end = std::min(numSamples, start + blockSize);
            for (size_t s = start; s < end; ++s) {
                float v = std::abs(newL[s]);
                if (v > peak) peak = v;
            }
            newWaveform[w] = std::min(1.0f, peak);
        }
    }

    {
        std::lock_guard<std::mutex> lock(m_voiceMutex);
        for (auto& v : m_voices) {
            if (v.active && v.bankIndex == bankIndex && v.padId == padId) {
                v.active = false;
            }
        }
        pad->sampleL.swap(newL);
        pad->sampleR.swap(newR);
        pad->waveform.swap(newWaveform);
        pad->sampleRate = (sampleRate > 8000.0f) ? sampleRate : 48000.0f;
        pad->durationSeconds = static_cast<float>(numSamples) / pad->sampleRate;
        pad->pitchSemitones = std::clamp(pitchSemitones, -24.0f, 24.0f);
        pad->volume = std::clamp(volume, 0.0f, 1.5f);
        pad->pan = std::clamp(pan, -1.0f, 1.0f);
        pad->isLoop = isLoop;
        pad->isReverse = isReverse;
        pad->muteGroup = std::max(0, muteGroup);
        pad->category = "custom";
        if (!label.empty()) {
            pad->label = label;
        }
    }
    // newL, newR and old pad buffers destruct here OUTSIDE the mutex lock
    return true;
}

void SP404Engine::clearCustomSamples() {
    std::lock_guard<std::mutex> lock(m_voiceMutex);
    for (auto& bank : m_banks) {
        for (auto& pad : bank) {
            pad.sampleL.clear();
            pad.sampleR.clear();
            pad.waveform.clear();
            pad.label = "EMPTY";
            pad.category = "custom";
            pad.sampleRate = 48000.0f;
            pad.durationSeconds = 0.0f;
            pad.pitchSemitones = 0.0f;
            pad.volume = 1.0f;
            pad.pan = 0.0f;
            pad.isLoop = false;
            pad.isReverse = false;
            pad.muteGroup = 0;
        }
    }
    for (auto& voice : m_voices) {
        voice.active = false;
        voice.fadingOut = false;
        voice.fadeOutGain = 1.0f;
    }
}

std::vector<uint8_t> SP404Engine::serializeState() const {
    std::lock_guard<std::mutex> lock(m_voiceMutex);
    std::vector<uint8_t> result;
    result.reserve(4096);

    auto appendBytes = [&result](const void* source, size_t byteCount) {
        const auto* bytes = static_cast<const uint8_t*>(source);
        result.insert(result.end(), bytes, bytes + byteCount);
    };
    auto appendValue = [&appendBytes](const auto& value) {
        appendBytes(&value, sizeof(value));
    };
    auto appendString = [&appendValue, &appendBytes](const std::string& value) {
        const uint32_t length = static_cast<uint32_t>(value.size());
        appendValue(length);
        if (length > 0) appendBytes(value.data(), length);
    };

    constexpr uint32_t magic = 0x4A573334; // "JW34"
    constexpr uint32_t version = 2;
    appendValue(magic);
    appendValue(version);

    const float volume = m_volume.load(std::memory_order_relaxed);
    const float ctrl1 = m_ctrl1.load(std::memory_order_relaxed);
    const float ctrl2 = m_ctrl2.load(std::memory_order_relaxed);
    const float ctrl3 = m_ctrl3.load(std::memory_order_relaxed);
    const int32_t activeMfx = m_activeMfx.load(std::memory_order_relaxed);
    const int32_t placement = static_cast<int32_t>(m_placement.load(std::memory_order_relaxed));
    const uint8_t bypassed = m_bypassed.load(std::memory_order_relaxed) ? 1 : 0;
    const uint8_t chromatic = m_isChromatic.load(std::memory_order_relaxed) ? 1 : 0;
    const int32_t rootBank = m_chromaticRootBank.load(std::memory_order_relaxed);
    const int32_t rootPad = m_chromaticRootPad.load(std::memory_order_relaxed);
    const float globalTranspose = m_globalTranspose.load(std::memory_order_relaxed);
    appendValue(volume); appendValue(ctrl1); appendValue(ctrl2); appendValue(ctrl3);
    appendValue(activeMfx); appendValue(placement); appendValue(bypassed); appendValue(chromatic);
    appendValue(rootBank); appendValue(rootPad); appendValue(globalTranspose);

    for (const auto& bank : m_banks) {
        for (const auto& pad : bank) {
            const uint32_t leftCount = static_cast<uint32_t>(pad.sampleL.size());
            const uint32_t rightCount = static_cast<uint32_t>(pad.sampleR.size());
            const float sampleRate = pad.sampleRate;
            const float duration = pad.durationSeconds;
            const float pitch = pad.pitchSemitones;
            const float padVolume = pad.volume;
            const float pan = pad.pan;
            const uint8_t loop = pad.isLoop ? 1 : 0;
            const uint8_t reverse = pad.isReverse ? 1 : 0;
            const int32_t muteGroup = pad.muteGroup;
            appendValue(leftCount); appendValue(rightCount);
            appendValue(sampleRate); appendValue(duration); appendValue(pitch);
            appendValue(padVolume); appendValue(pan); appendValue(loop); appendValue(reverse);
            appendValue(muteGroup);
            appendString(pad.label); appendString(pad.category);
            if (leftCount > 0) appendBytes(pad.sampleL.data(), leftCount * sizeof(float));
            if (rightCount > 0) appendBytes(pad.sampleR.data(), rightCount * sizeof(float));
        }
    }
    return result;
}

bool SP404Engine::deserializeState(const uint8_t* data, size_t size) {
    if (data == nullptr || size < sizeof(uint32_t) * 2) return false;

    const uint8_t* cursor = data;
    const uint8_t* end = data + size;
    auto readBytes = [&cursor, end](void* destination, size_t byteCount) -> bool {
        if (byteCount > static_cast<size_t>(end - cursor)) return false;
        std::memcpy(destination, cursor, byteCount);
        cursor += byteCount;
        return true;
    };
    auto readValue = [&readBytes](auto& value) -> bool {
        return readBytes(&value, sizeof(value));
    };
    auto readString = [&readValue, &readBytes](std::string& value) -> bool {
        uint32_t length = 0;
        if (!readValue(length) || length > 1024) return false;
        value.resize(length);
        return length == 0 || readBytes(value.data(), length);
    };

    uint32_t magic = 0;
    uint32_t version = 0;
    if (!readValue(magic) || !readValue(version) || magic != 0x4A573334 || (version != 1 && version != 2)) return false;

    float volume = 0.0f, ctrl1 = 0.0f, ctrl2 = 0.0f, ctrl3 = 0.0f;
    int32_t activeMfx = 0, placement = 0, rootBank = 0, rootPad = 11;
    uint8_t bypassed = 0, chromatic = 0;
    float globalTranspose = 0.0f;
    if (!readValue(volume) || !readValue(ctrl1) || !readValue(ctrl2) || !readValue(ctrl3)
        || !readValue(activeMfx) || !readValue(placement) || !readValue(bypassed)
        || !readValue(chromatic) || !readValue(rootBank) || !readValue(rootPad)) return false;

    if (version >= 2) {
        if (!readValue(globalTranspose)) return false;
    }

    std::array<std::array<SP404PadData, kPadsPerBank>, kNumBanks> loaded{};
    size_t totalSampleBytes = 0;
    constexpr size_t kMaxSerializedSampleBytes = 256u * 1024u * 1024u;
    for (size_t bankIndex = 0; bankIndex < kNumBanks; ++bankIndex) {
        for (size_t padIndex = 0; padIndex < kPadsPerBank; ++padIndex) {
            auto& pad = loaded[bankIndex][padIndex];
            pad.id = static_cast<int>(padIndex + 1);
            pad.bank = static_cast<int>(bankIndex);
            uint32_t leftCount = 0, rightCount = 0;
            uint8_t loop = 0, reverse = 0;
            int32_t muteGroup = 0;
            if (!readValue(leftCount) || !readValue(rightCount)
                || leftCount > 60u * 60u * 192000u || rightCount > 60u * 60u * 192000u) return false;
            if (!readValue(pad.sampleRate) || !readValue(pad.durationSeconds)
                || !readValue(pad.pitchSemitones) || !readValue(pad.volume)
                || !readValue(pad.pan) || !readValue(loop) || !readValue(reverse)
                || !readValue(muteGroup) || !readString(pad.label) || !readString(pad.category)) return false;

            const size_t leftBytes = static_cast<size_t>(leftCount) * sizeof(float);
            const size_t rightBytes = static_cast<size_t>(rightCount) * sizeof(float);
            if (leftBytes > kMaxSerializedSampleBytes - totalSampleBytes
                || rightBytes > kMaxSerializedSampleBytes - totalSampleBytes - leftBytes) return false;
            pad.sampleL.resize(leftCount);
            pad.sampleR.resize(rightCount);
            if ((leftBytes > 0 && !readBytes(pad.sampleL.data(), leftBytes))
                || (rightBytes > 0 && !readBytes(pad.sampleR.data(), rightBytes))) return false;
            totalSampleBytes += leftBytes + rightBytes;
            pad.isLoop = loop != 0;
            pad.isReverse = reverse != 0;
            pad.muteGroup = std::max(0, muteGroup);
            pad.waveform.assign(32, 0.0f);
            if (!pad.sampleL.empty()) {
                size_t bs = std::max<size_t>(1, pad.sampleL.size() / 32);
                for (size_t w = 0; w < 32; ++w) {
                    float peak = 0.0f;
                    size_t s = w * bs;
                    size_t e = std::min(pad.sampleL.size(), s + bs);
                    for (size_t i = s; i < e; ++i) {
                        float v = std::abs(pad.sampleL[i]);
                        if (v > peak) peak = v;
                    }
                    pad.waveform[w] = std::min(1.0f, peak);
                }
            }
        }
    }

    {
        std::lock_guard<std::mutex> lock(m_voiceMutex);
        m_banks = std::move(loaded);
        for (auto& voice : m_voices) {
            voice.active = false;
            voice.fadingOut = false;
            voice.fadeOutGain = 1.0f;
        }
    }
    m_volume.store(std::clamp(volume, 0.0f, 10.0f), std::memory_order_relaxed);
    m_ctrl1.store(std::clamp(ctrl1, 0.0f, 10.0f), std::memory_order_relaxed);
    m_ctrl2.store(std::clamp(ctrl2, 0.0f, 10.0f), std::memory_order_relaxed);
    m_ctrl3.store(std::clamp(ctrl3, 0.0f, 10.0f), std::memory_order_relaxed);
    m_activeMfx.store(std::clamp(activeMfx, 0, 5), std::memory_order_relaxed);
    m_placement.store(placement > 0 ? SP404Placement::AfterPedals : SP404Placement::BeforePedals, std::memory_order_relaxed);
    m_bypassed.store(bypassed != 0, std::memory_order_relaxed);
    m_isChromatic.store(chromatic != 0, std::memory_order_relaxed);
    m_chromaticRootBank.store(std::clamp(rootBank, 0, static_cast<int>(kNumBanks - 1)), std::memory_order_relaxed);
    m_chromaticRootPad.store(std::clamp(rootPad, 1, static_cast<int>(kPadsPerBank)), std::memory_order_relaxed);
    setGlobalTranspose(globalTranspose);
    updateMfxFilters();
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

    // Check if any voice is actually active. If idle, do not process MFX or inject static.
    bool anyVoiceActive = false;
    for (const auto& v : m_voices) {
        if (v.active && v.pSampleL && !v.pSampleL->empty()) {
            anyVoiceActive = true;
            break;
        }
    }

    if (!anyVoiceActive) {
        // Sampler is idle. Zero MFX delay buffers so no recirculating noise remains.
        std::fill(m_modDelayBufL.begin(), m_modDelayBufL.end(), 0.0f);
        std::fill(m_modDelayBufR.begin(), m_modDelayBufR.end(), 0.0f);
        std::fill(m_djfxBufL.begin(), m_djfxBufL.end(), 0.0f);
        std::fill(m_djfxBufR.begin(), m_djfxBufR.end(), 0.0f);
        return;
    }

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
            v.samplesRendered += 1;

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
        if (mfx == SP404MFX::DJFX) {
            const size_t bufSize = m_djfxBufL.size();
            if (bufSize > 1024) {
                m_djfxBufL[m_djfxWriteIdx] = sumL;
                m_djfxBufR[m_djfxWriteIdx] = sumR;

                const float c1 = m_ctrl1.load(std::memory_order_relaxed);
                const float c2 = m_ctrl2.load(std::memory_order_relaxed);
                const float c3 = m_ctrl3.load(std::memory_order_relaxed);

                // Loop slice length (20ms to 800ms)
                const double loopSec = 0.020 + (static_cast<double>(c1) / 10.0) * 0.780;
                m_djfxLoopLen = std::clamp(static_cast<size_t>(loopSec * m_sampleRate), static_cast<size_t>(64), bufSize - 1);

                // Speed / reverse modulation from CTRL 2:
                // 5.0 = 1.0x forward; < 4.8 = reverse stutter; > 5.2 = accelerated stutter
                double speed = 1.0;
                if (c2 < 4.8f) {
                    speed = -((5.0 - static_cast<double>(c2)) / 5.0) * 1.5;
                } else if (c2 > 5.2f) {
                    speed = 1.0 + ((static_cast<double>(c2) - 5.0) / 5.0) * 1.5;
                }

                m_djfxReadIdx += speed;
                if (m_djfxReadIdx >= static_cast<double>(m_djfxLoopLen)) {
                    m_djfxReadIdx = 0.0;
                } else if (m_djfxReadIdx < 0.0) {
                    m_djfxReadIdx = static_cast<double>(m_djfxLoopLen - 1);
                }

                const size_t offset = static_cast<size_t>(m_djfxReadIdx);
                const size_t rPos = (m_djfxWriteIdx + bufSize - m_djfxLoopLen + offset) % bufSize;
                const float wetL = m_djfxBufL[rPos];
                const float wetR = m_djfxBufR[rPos];

                const float wetMix = std::clamp(c3 / 10.0f, 0.0f, 1.0f);
                sumL = sumL * (1.0f - wetMix) + wetL * wetMix;
                sumR = sumR * (1.0f - wetMix) + wetR * wetMix;

                m_djfxWriteIdx = (m_djfxWriteIdx + 1) % bufSize;
            }
        } else if (mfx == SP404MFX::Isolator) {
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
        } else if (mfx == SP404MFX::Cassette) {
            const size_t bufSize = m_modDelayBufL.size();
            if (bufSize > 1024) {
                m_modDelayBufL[m_modDelayWriteIdx] = sumL;
                m_modDelayBufR[m_modDelayWriteIdx] = sumR;

                const float c1 = m_ctrl1.load(std::memory_order_relaxed); // wow/flutter depth
                const float c3 = m_ctrl3.load(std::memory_order_relaxed); // tape drive

                const double dt = 1.0 / m_sampleRate;
                m_tapeLfo1 += 0.8 * 6.28318530718 * dt;
                if (m_tapeLfo1 >= 6.28318530718) m_tapeLfo1 -= 6.28318530718;
                m_tapeLfo2 += 5.5 * 6.28318530718 * dt;
                if (m_tapeLfo2 >= 6.28318530718) m_tapeLfo2 -= 6.28318530718;

                const double modSamples = (std::sin(m_tapeLfo1) * 0.7 + std::sin(m_tapeLfo2) * 0.3) * (static_cast<double>(c1) / 10.0 * 35.0);
                const double centerDelay = 120.0;
                const double rPos = static_cast<double>(m_modDelayWriteIdx) + static_cast<double>(bufSize) - centerDelay + modSamples;
                const size_t r0 = static_cast<size_t>(rPos) % bufSize;
                const size_t r1 = (r0 + 1) % bufSize;
                const float frac = static_cast<float>(rPos - static_cast<double>(static_cast<size_t>(rPos)));

                float tapeL = m_modDelayBufL[r0] + frac * (m_modDelayBufL[r1] - m_modDelayBufL[r0]);
                float tapeR = m_modDelayBufR[r0] + frac * (m_modDelayBufR[r1] - m_modDelayBufR[r0]);

                tapeL = m_tapeToneL.process(tapeL);
                tapeR = m_tapeToneR.process(tapeR);

                float drive = 1.0f + (c3 / 10.0f) * 2.5f;
                sumL = fastTanh((tapeL + 0.05f * tapeL * tapeL) * drive);
                sumR = fastTanh((tapeR + 0.05f * tapeR * tapeR) * drive);

                m_modDelayWriteIdx = (m_modDelayWriteIdx + 1) % bufSize;
            }
        } else if (mfx == SP404MFX::Vinyl) {
            const size_t bufSize = m_modDelayBufL.size();
            if (bufSize > 1024) {
                m_modDelayBufL[m_modDelayWriteIdx] = sumL;
                m_modDelayBufR[m_modDelayWriteIdx] = sumR;

                const float c1 = m_ctrl1.load(std::memory_order_relaxed); // wow/flutter
                const float c2 = m_ctrl2.load(std::memory_order_relaxed); // crackle
                const float c3 = m_ctrl3.load(std::memory_order_relaxed); // saturation

                const double dt = 1.0 / m_sampleRate;
                m_vinylLfo += 0.55 * 6.28318530718 * dt;
                if (m_vinylLfo >= 6.28318530718) m_vinylLfo -= 6.28318530718;

                const double modSamples = std::sin(m_vinylLfo) * (static_cast<double>(c1) / 10.0 * 25.0);
                const double centerDelay = 80.0;
                const double rPos = static_cast<double>(m_modDelayWriteIdx) + static_cast<double>(bufSize) - centerDelay + modSamples;
                const size_t r0 = static_cast<size_t>(rPos) % bufSize;
                const size_t r1 = (r0 + 1) % bufSize;
                const float frac = static_cast<float>(rPos - static_cast<double>(static_cast<size_t>(rPos)));

                float vinylL = m_modDelayBufL[r0] + frac * (m_modDelayBufL[r1] - m_modDelayBufL[r0]);
                float vinylR = m_modDelayBufR[r0] + frac * (m_modDelayBufR[r1] - m_modDelayBufR[r0]);

                m_noiseRng = m_noiseRng * 1664525u + 1013904223u;
                float crackle = 0.0f;
                if (c2 > 0.05f && (m_noiseRng & 0x3FFF) < static_cast<uint32_t>((c2 / 10.0f) * 80.0f)) {
                    crackle = ((static_cast<float>(m_noiseRng & 0xFF) / 128.0f) - 1.0f) * 0.005f;
                }

                float drive = 1.0f + (c3 / 10.0f) * 1.2f;
                sumL = fastTanh((vinylL + crackle) * drive);
                sumR = fastTanh((vinylR + crackle) * drive);

                m_modDelayWriteIdx = (m_modDelayWriteIdx + 1) % bufSize;
            }
        } else if (mfx == SP404MFX::Pitch) {
            const float c3 = m_ctrl3.load(std::memory_order_relaxed);
            float drive = 1.0f + (c3 / 10.0f) * 1.2f;
            sumL = fastTanh(sumL * drive);
            sumR = fastTanh(sumR * drive);
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
                            double durationSec, int muteGroup, bool isLoop, auto generator) {
        auto* pad = getPad(0, padId);
        if (!pad) return;
        pad->id = padId;
        pad->bank = 0;
        pad->label = label;
        pad->category = cat;
        pad->sampleRate = static_cast<float>(sr);
        pad->durationSeconds = static_cast<float>(durationSec);
        pad->muteGroup = muteGroup;
        pad->isLoop = isLoop;

        const size_t totalSamples = static_cast<size_t>(sr * durationSec);
        pad->sampleL.resize(totalSamples);
        pad->sampleR.resize(totalSamples);

        for (size_t i = 0; i < totalSamples; ++i) {
            double t = static_cast<double>(i) / sr;
            auto [l, r] = generator(t, i, totalSamples);
            pad->sampleL[i] = static_cast<float>(l);
            pad->sampleR[i] = static_cast<float>(r);
        }

        pad->waveform.assign(32, 0.0f);
        size_t blockSize = std::max<size_t>(1, totalSamples / 32);
        for (size_t w = 0; w < 32; ++w) {
            float peak = 0.0f;
            size_t start = w * blockSize;
            size_t end = std::min(totalSamples, start + blockSize);
            for (size_t s = start; s < end; ++s) {
                float v = std::abs(pad->sampleL[s]);
                if (v > peak) peak = v;
            }
            pad->waveform[w] = std::min(1.0f, peak);
        }
    };

    // Pad 1: INTRO HOOK (Slow brooding reverse fuzz swell)
    createSample(1, "INTRO HOOK", "sample", 1.8, 0, false, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double chord = std::sin(twoPi * 110.0 * t) + 0.5 * std::sin(twoPi * 146.83 * t);
        double s = fastTanh(static_cast<float>(chord * 1.5)) * std::exp(-t * 1.2);
        return std::pair{s * 0.8, s * 0.8};
    });

    // Pad 2: BEAT DROP (Deep Sub Kick)
    createSample(2, "BEAT DROP", "kick", 0.65, 0, true, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double phase = twoPi * (48.0 * t - (120.0 / 24.0) * std::exp(-t * 24.0));
        double body = std::sin(phase) * std::exp(-t * 4.0);
        double click = (t < 0.005) ? (1.0 - t / 0.005) * 0.4 : 0.0;
        double s = fastTanh(static_cast<float>(body * 1.4 + click));
        return std::pair{s, s};
    });

    // Pad 3: VERSE GROOVE (Warm saturated post-punk bass)
    createSample(3, "VERSE GROOVE", "bass", 1.2, 0, true, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double b = std::sin(twoPi * 55.0 * t) + 0.4 * std::sin(twoPi * 110.0 * t);
        double s = fastTanh(static_cast<float>(b * 2.0)) * std::exp(-t * 1.5) * 0.85;
        return std::pair{s, s};
    });

    // Pad 4: SEAN SPOKEN (Vocal phrase)
    createSample(4, "SEAN SPOKEN", "vox", 0.75, 0, false, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double f0 = 196.0;
        double s = (std::sin(twoPi * f0 * t) + 0.6 * std::sin(twoPi * 588.0 * t));
        double env = std::sin(std::min(1.0, t / 0.04) * 1.5708) * std::exp(-t * 4.0);
        double out = fastTanh(static_cast<float>(s * env * 0.8));
        return std::pair{out, out};
    });

    // Pad 5: HARMONIUM SYN (Harmonium Reed Riff)
    createSample(5, "HARMONIUM SYN", "sample", 1.6, 0, false, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double h = std::sin(twoPi * 220.0 * t) + 0.5 * std::sin(twoPi * 330.0 * t) + 0.3 * std::sin(twoPi * 440.0 * t);
        double s = fastTanh(static_cast<float>(h * 1.2)) * std::exp(-t * 1.0) * 0.8;
        return std::pair{s, s};
    });

    // Pad 6: CHORUS DROP (Indie Chorus Hook)
    createSample(6, "CHORUS DROP", "sample", 2.2, 0, true, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double chord = std::sin(twoPi * 146.83 * t) + std::sin(twoPi * 220.0 * t) + std::sin(twoPi * 293.66 * t);
        double s = (chord / 3.0) * std::exp(-t * 1.2) * 0.85;
        return std::pair{s, s};
    });

    // Pad 7: CHORUS VOCAL (Harmonies)
    createSample(7, "CHORUS VOCAL", "vox", 1.2, 0, false, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double f0 = 293.66;
        double s = (std::sin(twoPi * f0 * t) + 0.7 * std::sin(twoPi * 720.0 * t));
        double env = std::sin(std::min(1.0, t / 0.05) * 1.5708) * std::exp(-t * 3.5);
        double out = fastTanh(static_cast<float>(s * env * 0.8));
        return std::pair{out, out};
    });

    // Pad 8: BREAKDOWN GRV (Breakdown rhythm)
    createSample(8, "BREAKDOWN GRV", "sample", 1.4, 0, true, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double tone = std::sin(twoPi * 180.0 * t) * std::exp(-t * 16.0);
        double noise = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0) * std::exp(-t * 12.0);
        double s = fastTanh(static_cast<float>(tone * 0.7 + noise * 0.8)) * 0.9;
        return std::pair{s, s};
    });

    // Pad 9: TERRY EPIC GTR (Lead delay guitar swell)
    createSample(9, "TERRY EPIC GTR", "sample", 1.8, 0, false, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double gtr = std::sin(twoPi * 440.0 * t) + 0.6 * std::sin(twoPi * 660.0 * t);
        double s = fastTanh(static_cast<float>(gtr * 3.0)) * std::exp(-t * 1.5) * 0.8;
        return std::pair{s, s * 0.9};
    });

    // Pad 10: TERRY ROBOT (Formant vocal)
    createSample(10, "TERRY ROBOT", "vox", 1.5, 0, false, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double carrier = (std::sin(twoPi * 220.0 * t) > 0.0 ? 1.0 : -1.0);
        double mod = std::sin(twoPi * 14.0 * t);
        double s = carrier * mod * std::exp(-t * 1.8) * 0.7;
        return std::pair{s, s};
    });

    // Pad 11: OUTRO DECAY (Ambient reverb decay)
    createSample(11, "OUTRO DECAY", "sample", 2.2, 0, false, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double chord = std::sin(twoPi * 110.0 * t) + 0.5 * std::sin(twoPi * 164.81 * t);
        double s = fastTanh(static_cast<float>(chord * 1.2)) * std::exp(-t * 1.0) * 0.7;
        return std::pair{s, s};
    });

    // Pad 12: FULL MASTER (Full Decay master loop)
    createSample(12, "FULL MASTER", "sample", 3.0, 0, true, [&](double t, size_t /*i*/, size_t /*tot*/) {
        double sub = std::sin(twoPi * 45.0 * t) * 0.5;
        double body = std::sin(twoPi * 146.83 * t) * 0.3;
        double s = fastTanh(static_cast<float>(sub + body)) * 0.85;
        return std::pair{s, s};
    });

    // Canonical pad definitions for Banks B through F (matching Walls:Devine Vol. 1)
    struct BankDefaultDef {
        const char* label;
        const char* category;
        bool isLoop;
    };

    static const BankDefaultDef kBankDefs[5][kPadsPerBank] = {
        // Bank B - Conviction
        {
            {"AMBIENT GLASS", "sample", false}, {"EPIANO DROP", "sample", false},
            {"VERSE GROOVE", "bass", true},     {"CONVICTION HOOK", "vox", false},
            {"TERRY GUITAR", "sample", false},  {"CHORUS STRINGS", "sample", true},
            {"CHORUS HARMONY", "vox", false},   {"UPLIFT STRINGS", "sample", false},
            {"CHORUS IMPACT", "sample", false}, {"PIANO BRIDGE", "sample", false},
            {"OUTRO DECAY", "sample", false},   {"FULL MASTER", "sample", true}
        },
        // Bank C - Poetry
        {
            {"ACOUSTIC INTRO", "sample", false}, {"BEATBOX DROP", "kick", true},
            {"SHAKER POCKET", "perc", true},     {"SEAN POETRY", "vox", false},
            {"HARMONIUM REED", "sample", false}, {"CHORUS DROP", "sample", true},
            {"TERRY HARMONY", "vox", false},     {"VERSE EXTENSION", "sample", false},
            {"TERRY RODE GTR", "sample", false}, {"POETRY CLIMAX", "sample", false},
            {"POETRY ENDING", "sample", false},  {"FULL MASTER", "sample", true}
        },
        // Bank D - Gratitude
        {
            {"AMBIENT CHORDS", "sample", false}, {"BEAT DROP", "kick", true},
            {"VERSE GROOVE", "bass", true},      {"SEAN VOX HOOK", "vox", false},
            {"TERRY LEAD GTR", "sample", false}, {"CHORUS DROP", "sample", true},
            {"GRATITUDE HARM", "vox", false},    {"MINIBRUTE SYN", "sample", false},
            {"TERRY PEAK", "sample", false},     {"BRIDGE BREAK", "sample", false},
            {"OUTRO VOCAL", "vox", false},       {"FULL MASTER", "sample", true}
        },
        // Bank E - Joint Queen
        {
            {"INTRO HOOK", "sample", false},     {"BEAT DROP", "kick", true},
            {"VERSE GROOVE", "bass", true},      {"PUFF PUFF VOX", "vox", false},
            {"BOGART QUOTE", "vox", false},      {"CHORUS DROP", "sample", true},
            {"TERRY HARMONY", "vox", false},     {"ACOUSTIC SOLO", "sample", false},
            {"TERRY DELAY GTR", "sample", false},{"SUGAR SPICE", "vox", false},
            {"OUTRO DECAY", "sample", false},    {"FULL MASTER", "sample", true}
        },
        // Bank F - Stash Daddy
        {
            {"BEATBOX INTRO", "perc", false},    {"CONGA POCKET", "perc", true},
            {"SEAN RAP HOOK", "vox", false},     {"ISHIKA VOCAL", "vox", false},
            {"TERRY LEAD GTR", "sample", false}, {"CHORUS HOOK", "sample", true},
            {"BREAK SPOT", "sample", false},     {"ROGUE BASS", "bass", true},
            {"TERRY WHISTLES", "sample", false}, {"SATURATED CLX", "vox", false},
            {"APHEX BRIDGE", "sample", false},   {"FULL MASTER", "sample", true}
        }
    };

    // Helper lambda to initialize a pad with stereo synthesis across any bank
    auto createBankSample = [&](int bankIndex, int padId, const std::string& label, const std::string& cat,
                                double durationSec, int muteGroup, bool isLoop, auto generator) {
        auto* pad = getPad(bankIndex, padId);
        if (!pad) return;
        pad->id = padId;
        pad->bank = bankIndex;
        pad->label = label;
        pad->category = cat;
        pad->sampleRate = static_cast<float>(sr);
        pad->durationSeconds = static_cast<float>(durationSec);
        pad->muteGroup = muteGroup;
        pad->isLoop = isLoop;

        const size_t totalSamples = static_cast<size_t>(sr * durationSec);
        pad->sampleL.resize(totalSamples);
        pad->sampleR.resize(totalSamples);

        for (size_t i = 0; i < totalSamples; ++i) {
            double t = static_cast<double>(i) / sr;
            auto [l, r] = generator(t, i, totalSamples);
            pad->sampleL[i] = static_cast<float>(l);
            pad->sampleR[i] = static_cast<float>(r);
        }

        pad->waveform.assign(32, 0.0f);
        size_t blockSize = std::max<size_t>(1, totalSamples / 32);
        for (size_t w = 0; w < 32; ++w) {
            float peak = 0.0f;
            size_t start = w * blockSize;
            size_t end = std::min(totalSamples, start + blockSize);
            for (size_t s = start; s < end; ++s) {
                float v = std::abs(pad->sampleL[s]);
                if (v > peak) peak = v;
            }
            pad->waveform[w] = std::min(1.0f, peak);
        }
    };

    // Initialize Banks B through F with canonical metadata and instant synthetic audio
    for (size_t b = 1; b <= 5; ++b) {
        double rootFreq = 55.0 * std::pow(1.05946309436, static_cast<double>(b * 2));
        for (size_t p = 0; p < kPadsPerBank; ++p) {
            const auto& def = kBankDefs[b - 1][p];
            int padNum = static_cast<int>(p + 1);
            std::string cat = def.category;

            if (p == 0) {
                // Pad 1: DRUMS & BASS full groove loop (2.4s)
                createBankSample(static_cast<int>(b), padNum, def.label, cat, 2.4, 0, true, [&](double t, size_t, size_t) {
                    double sub = std::sin(twoPi * rootFreq * t) * std::exp(-std::fmod(t, 0.6) * 3.0);
                    double beat = std::sin(twoPi * (50.0 * t - (100.0 / 25.0) * std::exp(-std::fmod(t, 0.6) * 25.0)));
                    double s = fastTanh(static_cast<float>(sub * 0.9 + beat * 0.7));
                    return std::pair{s * 0.85, s * 0.85};
                });
            } else if (cat == "kick") {
                createBankSample(static_cast<int>(b), padNum, def.label, cat, 0.65, 0, def.isLoop, [&](double t, size_t, size_t) {
                    double phase = twoPi * (48.0 * t - (130.0 / 26.0) * std::exp(-t * 26.0));
                    double s = fastTanh(static_cast<float>(std::sin(phase) * std::exp(-t * 4.5) * 1.4));
                    return std::pair{s, s};
                });
            } else if (cat == "bass") {
                createBankSample(static_cast<int>(b), padNum, def.label, cat, 1.2, 0, def.isLoop, [&](double t, size_t, size_t) {
                    double bTone = std::sin(twoPi * (rootFreq * 0.5) * t) + 0.3 * std::sin(twoPi * rootFreq * t);
                    double s = fastTanh(static_cast<float>(bTone * 2.0)) * std::exp(-t * 1.5) * 0.85;
                    return std::pair{s, s};
                });
            } else if (cat == "vox") {
                createBankSample(static_cast<int>(b), padNum, def.label, cat, 1.1, 0, def.isLoop, [&](double t, size_t, size_t) {
                    double f0 = rootFreq * 2.0;
                    double s = (std::sin(twoPi * f0 * t) + 0.5 * std::sin(twoPi * f0 * 3.0 * t)) * std::exp(-t * 3.0);
                    double out = fastTanh(static_cast<float>(s * 1.2)) * 0.8;
                    return std::pair{out, out};
                });
            } else if (cat == "perc") {
                createBankSample(static_cast<int>(b), padNum, def.label, cat, 0.45, 0, def.isLoop, [&](double t, size_t, size_t) {
                    double tone = std::sin(twoPi * 280.0 * t) * std::exp(-t * 22.0);
                    double noise = ((static_cast<double>(rand()) / RAND_MAX) * 2.0 - 1.0) * std::exp(-t * 18.0);
                    double s = fastTanh(static_cast<float>(tone * 0.6 + noise * 0.7)) * 0.85;
                    return std::pair{s, s};
                });
            } else {
                // sample / melodic / synth
                createBankSample(static_cast<int>(b), padNum, def.label, cat, 1.8, 0, def.isLoop, [&](double t, size_t, size_t) {
                    double c1 = std::sin(twoPi * (rootFreq * 2.0) * t);
                    double c2 = std::sin(twoPi * (rootFreq * 2.5) * t);
                    double c3 = std::sin(twoPi * (rootFreq * 3.0) * t);
                    double s = fastTanh(static_cast<float>((c1 + c2 * 0.7 + c3 * 0.5) * 1.1)) * std::exp(-t * 1.2) * 0.8;
                    return std::pair{s * 0.9, s};
                });
            }
        }
    }

    // Initialize Banks G through J with clean empty pad descriptors
    for (size_t b = 6; b < kNumBanks; ++b) {
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
