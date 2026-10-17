#include "SP404Engine.h"
#include "johnwalls/audio_buffer.hpp"
#include <new>
#include <cstdlib>
#include <atomic>
#include <cmath>
#include <iostream>
#include <iomanip>
#include <vector>
#include <string>
#include <algorithm>

using namespace johnwalls::johnwalls;

// ==============================================================================
// 1. REAL-TIME THREAD ALLOCATION TRACKER & GUARD
// ==============================================================================
static thread_local bool g_realtimeAudioThreadActive = false;
static std::atomic<uint64_t> g_realtimeAllocCount{0};
static std::atomic<uint64_t> g_realtimeAllocBytes{0};
static std::atomic<uint64_t> g_realtimeDeallocCount{0};

void* operator new(size_t size) {
    if (g_realtimeAudioThreadActive) {
        g_realtimeAllocCount.fetch_add(1, std::memory_order_relaxed);
        g_realtimeAllocBytes.fetch_add(size, std::memory_order_relaxed);
    }
    void* p = std::malloc(size);
    if (!p) throw std::bad_alloc();
    return p;
}

void* operator new[](size_t size) {
    if (g_realtimeAudioThreadActive) {
        g_realtimeAllocCount.fetch_add(1, std::memory_order_relaxed);
        g_realtimeAllocBytes.fetch_add(size, std::memory_order_relaxed);
    }
    void* p = std::malloc(size);
    if (!p) throw std::bad_alloc();
    return p;
}

void* operator new(size_t size, const std::nothrow_t&) noexcept {
    if (g_realtimeAudioThreadActive) {
        g_realtimeAllocCount.fetch_add(1, std::memory_order_relaxed);
        g_realtimeAllocBytes.fetch_add(size, std::memory_order_relaxed);
    }
    return std::malloc(size);
}

void* operator new[](size_t size, const std::nothrow_t&) noexcept {
    if (g_realtimeAudioThreadActive) {
        g_realtimeAllocCount.fetch_add(1, std::memory_order_relaxed);
        g_realtimeAllocBytes.fetch_add(size, std::memory_order_relaxed);
    }
    return std::malloc(size);
}

void operator delete(void* p) noexcept {
    if (g_realtimeAudioThreadActive && p != nullptr) {
        g_realtimeDeallocCount.fetch_add(1, std::memory_order_relaxed);
    }
    std::free(p);
}

void operator delete[](void* p) noexcept {
    if (g_realtimeAudioThreadActive && p != nullptr) {
        g_realtimeDeallocCount.fetch_add(1, std::memory_order_relaxed);
    }
    std::free(p);
}

void operator delete(void* p, size_t) noexcept {
    if (g_realtimeAudioThreadActive && p != nullptr) {
        g_realtimeDeallocCount.fetch_add(1, std::memory_order_relaxed);
    }
    std::free(p);
}

void operator delete[](void* p, size_t) noexcept {
    if (g_realtimeAudioThreadActive && p != nullptr) {
        g_realtimeDeallocCount.fetch_add(1, std::memory_order_relaxed);
    }
    std::free(p);
}

struct RealtimeScopeGuard {
    RealtimeScopeGuard() {
        g_realtimeAudioThreadActive = true;
    }
    ~RealtimeScopeGuard() {
        g_realtimeAudioThreadActive = false;
    }
};

static void resetAllocationCounters() noexcept {
    g_realtimeAllocCount.store(0, std::memory_order_relaxed);
    g_realtimeAllocBytes.store(0, std::memory_order_relaxed);
    g_realtimeDeallocCount.store(0, std::memory_order_relaxed);
}

// ==============================================================================
// 2. MATHEMATICAL DSP ANALYSIS METRICS (SNR, THD+N, THD, RMS)
// ==============================================================================
struct DspAnalysisResult {
    double fundamentalFreqHz{0.0};
    double fundamentalAmpPeak{0.0};
    double fundamentalAmpRms{0.0};
    double residualRms{0.0};
    double thdPlusN_ratio{0.0};
    double thdPlusN_dB{-160.0};
    double thdPlusN_percent{0.0};
    double thd_ratio{0.0};
    double thd_dB{-160.0};
    double thd_percent{0.0};
    double snr_dB{160.0};
    double dcOffset{0.0};
    double peakMagnitude{0.0};
    double totalRms{0.0};
};

/**
 * Perform high-precision discrete quadrature Fourier analysis and residual evaluation.
 * Computes exact fundamental component, harmonic decomposition (2nd..10th harmonics),
 * Total Harmonic Distortion (THD), Total Harmonic Distortion + Noise (THD+N), and SNR.
 */
static DspAnalysisResult analyzeSignal(const float* buffer, size_t numSamples,
                                      double sampleRate, double targetFreqHz,
                                      int maxHarmonics = 10) {
    DspAnalysisResult r;
    if (numSamples == 0 || buffer == nullptr || sampleRate <= 0.0 || targetFreqHz <= 0.0) {
        return r;
    }

    constexpr double kPi = 3.14159265358979323846;
    const double twoPi = 2.0 * kPi;
    const double invN = 1.0 / static_cast<double>(numSamples);

    // 1. Basic amplitude statistics & DC offset
    double sumSamples = 0.0;
    double sumSq = 0.0;
    double maxAbs = 0.0;
    for (size_t i = 0; i < numSamples; ++i) {
        const double s = static_cast<double>(buffer[i]);
        sumSamples += s;
        sumSq += s * s;
        maxAbs = std::max(maxAbs, std::abs(s));
    }
    r.dcOffset = sumSamples * invN;
    r.totalRms = std::sqrt(sumSq * invN);
    r.peakMagnitude = maxAbs;
    r.fundamentalFreqHz = targetFreqHz;

    // 2. Quadrature projection at fundamental frequency
    double fundCosSum = 0.0;
    double fundSinSum = 0.0;
    const double omega0 = twoPi * targetFreqHz / sampleRate;

    for (size_t n = 0; n < numSamples; ++n) {
        const double s = static_cast<double>(buffer[n]);
        const double angle = omega0 * static_cast<double>(n);
        fundCosSum += s * std::cos(angle);
        fundSinSum += s * std::sin(angle);
    }

    const double I0 = 2.0 * invN * fundCosSum;
    const double Q0 = 2.0 * invN * fundSinSum;
    r.fundamentalAmpPeak = std::sqrt(I0 * I0 + Q0 * Q0);
    r.fundamentalAmpRms = r.fundamentalAmpPeak / std::sqrt(2.0);

    // 3. Compute sample-by-sample residual (Signal minus pure fundamental sine)
    double residualSqSum = 0.0;
    for (size_t n = 0; n < numSamples; ++n) {
        const double s = static_cast<double>(buffer[n]);
        const double angle = omega0 * static_cast<double>(n);
        const double fundVal = I0 * std::cos(angle) + Q0 * std::sin(angle);
        const double diff = s - fundVal;
        residualSqSum += diff * diff;
    }
    r.residualRms = std::sqrt(residualSqSum * invN);

    // 4. Harmonic components analysis (k = 2 .. maxHarmonics)
    double harmonicPowerSum = 0.0;
    const double nyquist = sampleRate * 0.5;

    for (int k = 2; k <= maxHarmonics; ++k) {
        const double hkFreq = targetFreqHz * static_cast<double>(k);
        if (hkFreq >= nyquist) break;

        const double omegaK = twoPi * hkFreq / sampleRate;
        double hkCosSum = 0.0;
        double hkSinSum = 0.0;
        for (size_t n = 0; n < numSamples; ++n) {
            const double s = static_cast<double>(buffer[n]);
            const double angle = omegaK * static_cast<double>(n);
            hkCosSum += s * std::cos(angle);
            hkSinSum += s * std::sin(angle);
        }
        const double Ik = 2.0 * invN * hkCosSum;
        const double Qk = 2.0 * invN * hkSinSum;
        const double hkPeak = std::sqrt(Ik * Ik + Qk * Qk);
        const double hkRms = hkPeak / std::sqrt(2.0);
        harmonicPowerSum += hkRms * hkRms;
    }

    const double harmonicRms = std::sqrt(harmonicPowerSum);

    // 5. THD, THD+N, and SNR calculation
    if (r.fundamentalAmpRms > 1e-12) {
        r.thdPlusN_ratio = r.residualRms / r.fundamentalAmpRms;
        r.thdPlusN_dB = 20.0 * std::log10(std::max(1e-12, r.thdPlusN_ratio));
        r.thdPlusN_percent = r.thdPlusN_ratio * 100.0;

        r.thd_ratio = harmonicRms / r.fundamentalAmpRms;
        r.thd_dB = 20.0 * std::log10(std::max(1e-12, r.thd_ratio));
        r.thd_percent = r.thd_ratio * 100.0;

        // Noise alone: residual power minus harmonic power
        const double noisePower = std::max(0.0, (r.residualRms * r.residualRms) - harmonicPowerSum);
        const double noiseRms = std::sqrt(noisePower);
        if (noiseRms > 1e-12) {
            r.snr_dB = 20.0 * std::log10(r.fundamentalAmpRms / noiseRms);
        } else {
            r.snr_dB = 160.0;
        }
    } else {
        r.thdPlusN_ratio = 1.0;
        r.thdPlusN_dB = 0.0;
        r.thdPlusN_percent = 100.0;
        r.snr_dB = 0.0;
    }

    return r;
}

// Synthetic pure sine generator
static std::vector<float> generateSineWave(double freqHz, double amp, double sampleRate, size_t numSamples) {
    std::vector<float> data(numSamples);
    constexpr double twoPi = 2.0 * 3.14159265358979323846;
    for (size_t i = 0; i < numSamples; ++i) {
        data[i] = static_cast<float>(amp * std::sin(twoPi * freqHz * (static_cast<double>(i) / sampleRate)));
    }
    return data;
}

// ==============================================================================
// 3. TEST RUNNER & VERIFICATION HARNESS
// ==============================================================================
static int g_failures = 0;
static int g_testCount = 0;

#define TEST_CHECK(condition, label) \
    do { \
        ++g_testCount; \
        if (!(condition)) { \
            ++g_failures; \
            std::cout << "  [FAIL] " << label << std::endl; \
        } else { \
            std::cout << "  [PASS] " << label << std::endl; \
        } \
    } while (false)

int main() {
    std::cout << "=================================================================" << std::endl;
    std::cout << " johnwalls.studio | SP404Engine C++ DSP Verification & Benchmark" << std::endl;
    std::cout << " Headless Synthetic Buffer Real-Time Harness (SNR / THD+N / Alloc)" << std::endl;
    std::cout << "=================================================================" << std::endl;

    constexpr double kSampleRate = 48000.0;
    constexpr int kBlockSize = 512;

    // --------------------------------------------------------------------------
    // TEST SUITE 1: Allocation Sentinel Verification (Positive & Negative Controls)
    // --------------------------------------------------------------------------
    std::cout << "\n--- SUITE 1: Allocation Sentinel Verification ---" << std::endl;
    {
        resetAllocationCounters();
        // Outside RealtimeScope: allocation should not increment counter
        void* pOutside = ::operator new(128);
        ::operator delete(pOutside);
        TEST_CHECK(g_realtimeAllocCount.load() == 0, "Non-audio thread allocations are untracked");

        // Negative Control: Inside RealtimeScope, allocate via ::operator new and assert it is intercepted
        {
            RealtimeScopeGuard guard;
            void* volatile pInside = ::operator new(256);
            ::operator delete(pInside);
        }
        TEST_CHECK(g_realtimeAllocCount.load() >= 1, "RealtimeScope intercepts heap operator new on audio thread");
        TEST_CHECK(g_realtimeDeallocCount.load() >= 1, "RealtimeScope intercepts heap operator delete on audio thread");
        resetAllocationCounters();
    }

    // --------------------------------------------------------------------------
    // TEST SUITE 2: Strict Zero Real-Time Memory Allocations Under Heavy Audio Load
    // --------------------------------------------------------------------------
    std::cout << "\n--- SUITE 2: Zero Memory Allocations on Real-Time Audio Thread ---" << std::endl;
    {
        SP404Engine engine;
        engine.prepare(kSampleRate, kBlockSize);

        // Pre-load pads with synthetic audio on the non-real-time thread
        auto pad1Sine = generateSineWave(440.0, 0.8, kSampleRate, 48000);
        auto pad2Sine = generateSineWave(880.0, 0.8, kSampleRate, 48000);
        auto pad3HiHat = generateSineWave(4000.0, 0.5, kSampleRate, 12000);

        engine.loadCustomSample(0, 1, pad1Sine.data(), pad1Sine.data(), pad1Sine.size(), static_cast<float>(kSampleRate), "PAD_1", 0.0f, 1.0f, 0.0f, true, false, 0);
        engine.loadCustomSample(0, 2, pad2Sine.data(), pad2Sine.data(), pad2Sine.size(), static_cast<float>(kSampleRate), "PAD_2", 0.0f, 1.0f, 0.0f, true, false, 0);
        engine.loadCustomSample(0, 3, pad3HiHat.data(), pad3HiHat.data(), pad3HiHat.size(), static_cast<float>(kSampleRate), "PAD_3", 0.0f, 1.0f, 0.0f, false, false, 1);
        engine.loadCustomSample(0, 4, pad3HiHat.data(), pad3HiHat.data(), pad3HiHat.size(), static_cast<float>(kSampleRate), "PAD_4", 0.0f, 1.0f, 0.0f, false, false, 1); // same mute group

        OwnedAudioBuffer audioBuffer(2, kBlockSize);
        resetAllocationCounters();

        // ACTIVATE REAL-TIME AUDIO THREAD GUARD
        {
            RealtimeScopeGuard rtGuard;

            // Simulate 1,000 continuous audio blocks (512,000 samples = ~10.6 seconds of DAW playback)
            for (size_t block = 0; block < 1000; ++block) {
                audioBuffer.clear();
                auto view = audioBuffer.getView();

                // 1. Dynamic pad triggers & releases
                if (block == 5)   engine.triggerPad(0, 1, 0.9f);
                if (block == 100) engine.triggerPad(0, 2, 0.85f);
                if (block == 200) engine.releasePad(0, 1);
                if (block == 250) engine.triggerPad(0, 3, 1.0f); // Mute group 1
                if (block == 300) engine.triggerPad(0, 4, 1.0f); // Chokes pad 3

                // 2. Lock-free MIDI ingress (audio thread)
                if (block % 25 == 0) {
                    engine.handleMidiNoteOn(36 + static_cast<int>(block % 12), 0.8f);
                }
                if (block % 35 == 0) {
                    engine.handleMidiNoteOff(36 + static_cast<int>(block % 12));
                }

                // 3. Concurrent parameter modulation
                if (block % 10 == 0) {
                    engine.setParam("volume", 8.0f + static_cast<float>(block % 20) * 0.1f);
                    engine.setParam("ctrl1", static_cast<float>(block % 100) * 0.1f);
                }

                // 4. Polyphony voice stress: trigger all 32 voices
                if (block == 500) {
                    for (int v = 0; v < 36; ++v) { // 36 triggers -> exercises voice stealing!
                        engine.triggerPad(0, (v % 4) + 1, 0.7f, static_cast<float>(v - 16));
                    }
                }

                // 5. Render audio block
                engine.process(view, kBlockSize, true);
            }
        }

        TEST_CHECK(g_realtimeAllocCount.load() == 0, "Zero dynamic heap allocations during 1,000 real-time audio blocks");
        TEST_CHECK(g_realtimeAllocBytes.load() == 0, "Zero bytes allocated on real-time audio thread");
        TEST_CHECK(g_realtimeDeallocCount.load() == 0, "Zero heap deallocations on real-time audio thread");

        std::cout << "    [Audit] Blocks processed: 1000 (" << (1000 * kBlockSize) << " samples)" << std::endl;
        std::cout << "    [Audit] Real-time Allocations:   " << g_realtimeAllocCount.load() << std::endl;
        std::cout << "    [Audit] Real-time Deallocations: " << g_realtimeDeallocCount.load() << std::endl;
    }

    // --------------------------------------------------------------------------
    // TEST SUITE 3: Idle Channel Noise Floor & Dynamic Range (Zero Signal Injection)
    // --------------------------------------------------------------------------
    std::cout << "\n--- SUITE 3: Idle Channel Noise Floor & Zero Leakage ---" << std::endl;
    {
        SP404Engine engine;
        engine.prepare(kSampleRate, kBlockSize);
        engine.stopAll();

        // 3A. Transparent / Linear MFX (Isolator neutral or Bypassed)
        engine.setParam("mfx", static_cast<float>(SP404MFX::Isolator));
        engine.setParam("ctrl1", 5.0f);
        engine.setParam("ctrl2", 5.0f);
        engine.setParam("ctrl3", 5.0f);

        OwnedAudioBuffer audioBuffer(2, kBlockSize);
        audioBuffer.clear();
        auto view = audioBuffer.getView();

        // Process 100 blocks while idle
        for (int b = 0; b < 100; ++b) {
            engine.process(view, kBlockSize, true);
        }

        const float* left = audioBuffer.getChannelData(0);
        const float* right = audioBuffer.getChannelData(1);

        double maxLeft = 0.0, maxRight = 0.0;
        for (size_t s = 0; s < kBlockSize; ++s) {
            maxLeft = std::max(maxLeft, static_cast<double>(std::abs(left[s])));
            maxRight = std::max(maxRight, static_cast<double>(std::abs(right[s])));
        }

        TEST_CHECK(maxLeft == 0.0, "Idle channel Left has zero DC/noise leakage in clean mode (0.000000 V)");
        TEST_CHECK(maxRight == 0.0, "Idle channel Right has zero DC/noise leakage in clean mode (0.000000 V)");

        // 3B. Engine Bypass Mode Verification
        engine.setBypassed(true);
        audioBuffer.clear();
        for (int b = 0; b < 50; ++b) {
            engine.process(view, kBlockSize, true);
        }
        maxLeft = 0.0; maxRight = 0.0;
        for (size_t s = 0; s < kBlockSize; ++s) {
            maxLeft = std::max(maxLeft, static_cast<double>(std::abs(left[s])));
            maxRight = std::max(maxRight, static_cast<double>(std::abs(right[s])));
        }
        TEST_CHECK(maxLeft == 0.0 && maxRight == 0.0, "Bypassed engine produces zero output modifications");
    }

    // --------------------------------------------------------------------------
    // TEST SUITE 4: Clean Synthetic Tone Playback (SNR & THD+N Verification)
    // --------------------------------------------------------------------------
    std::cout << "\n--- SUITE 4: Pristine Synthetic Tone Playback Fidelity ---" << std::endl;
    {
        SP404Engine engine;
        engine.prepare(kSampleRate, kBlockSize);

        // Generate synthetic 1000 Hz pure sine wave at 48000 Hz (exact integer cycles per block)
        constexpr double kTargetFreq = 1000.0;
        constexpr size_t kToneSamples = 48000; // 1 full second
        auto pureSine = generateSineWave(kTargetFreq, 1.0, kSampleRate, kToneSamples);

        // Load into Bank 0 Pad 1: pitch=0, vol=1.0, pan=0.0 (center)
        engine.loadCustomSample(0, 1, pureSine.data(), pureSine.data(), pureSine.size(),
                                static_cast<float>(kSampleRate), "PURE_1K_TONE", 0.0f, 1.0f, 0.0f, true, false, 0);

        // Configure engine for pristine linear response:
        // Isolator MFX at neutral 5.0 (0dB LowShelf, 0dB Peaking, 0dB HighShelf, 20kHz LPF)
        engine.setParam("mfx", static_cast<float>(SP404MFX::Isolator));
        engine.setParam("ctrl1", 5.0f);
        engine.setParam("ctrl2", 5.0f);
        engine.setParam("ctrl3", 5.0f);
        engine.setParam("volume", 10.0f); // 1.0 master volume factor

        // Trigger pad
        engine.triggerPad(0, 1, 1.0f);

        // Render 4,800 samples (exactly 100 complete integer cycles of 1000 Hz at 48000 Hz)
        constexpr size_t kAnalysisLength = 4800;
        OwnedAudioBuffer outBuffer(2, kAnalysisLength);
        outBuffer.clear();
        auto view = outBuffer.getView();

        engine.process(view, kAnalysisLength, true);

        const float* leftOut = outBuffer.getChannelData(0);
        DspAnalysisResult res = analyzeSignal(leftOut, kAnalysisLength, kSampleRate, kTargetFreq);

        std::cout << "    [1kHz Benchmark Results]" << std::endl;
        std::cout << "    - Fundamental RMS: " << std::fixed << std::setprecision(5) << res.fundamentalAmpRms << std::endl;
        std::cout << "    - Residual RMS:    " << std::scientific << std::setprecision(3) << res.residualRms << std::endl;
        std::cout << "    - SNR:             " << std::fixed << std::setprecision(2) << res.snr_dB << " dB" << std::endl;
        std::cout << "    - THD+N (dB):      " << std::fixed << std::setprecision(2) << res.thdPlusN_dB << " dB" << std::endl;
        std::cout << "    - THD+N (%):       " << std::fixed << std::setprecision(5) << res.thdPlusN_percent << " %" << std::endl;
        std::cout << "    - THD (%):         " << std::fixed << std::setprecision(5) << res.thd_percent << " %" << std::endl;

        TEST_CHECK(res.fundamentalAmpRms > 0.40 && res.fundamentalAmpRms < 0.70, "Fundamental tone recovered with proper gain");
        TEST_CHECK(res.snr_dB >= 85.0, "SNR exceeds 85.0 dB on clean playback (achieved: " + std::to_string(res.snr_dB) + " dB)");
        TEST_CHECK(res.thdPlusN_dB <= -85.0, "THD+N is below -85.0 dB (achieved: " + std::to_string(res.thdPlusN_dB) + " dB)");
        TEST_CHECK(res.thdPlusN_percent < 0.01, "THD+N is below 0.01% on linear playback");
    }

    // --------------------------------------------------------------------------
    // TEST SUITE 5: Non-Integer Resampling & Pitch Transposition Fidelity
    // --------------------------------------------------------------------------
    std::cout << "\n--- SUITE 5: Non-Integer Resampling & Pitch Transposition ---" << std::endl;
    {
        // 5A. 44.1 kHz sample played back in 48.0 kHz engine (Fractional linear interpolation active)
        {
            SP404Engine engine;
            engine.prepare(kSampleRate, kBlockSize);

            constexpr double kSourceRate = 44100.0;
            constexpr double kTargetFreq = 1000.0;
            auto sine441 = generateSineWave(kTargetFreq, 1.0, kSourceRate, 44100);

            engine.loadCustomSample(0, 1, sine441.data(), sine441.data(), sine441.size(),
                                    static_cast<float>(kSourceRate), "SINE_44K1", 0.0f, 1.0f, 0.0f, true, false, 0);
            engine.setParam("mfx", static_cast<float>(SP404MFX::Isolator));
            engine.setParam("ctrl1", 5.0f);
            engine.setParam("ctrl2", 5.0f);
            engine.setParam("ctrl3", 5.0f);
            engine.setParam("volume", 10.0f);
            engine.triggerPad(0, 1, 1.0f);

            constexpr size_t kAnalysisLength = 4800;
            OwnedAudioBuffer outBuffer(2, kAnalysisLength);
            outBuffer.clear();
            auto view = outBuffer.getView();
            engine.process(view, kAnalysisLength, true);

            DspAnalysisResult res = analyzeSignal(outBuffer.getChannelData(0), kAnalysisLength, kSampleRate, kTargetFreq);
            std::cout << "    [44.1kHz -> 48kHz Resampling] SNR: " << std::fixed << std::setprecision(2) << res.snr_dB
                      << " dB | THD+N: " << res.thdPlusN_dB << " dB (" << res.thdPlusN_percent << "%)" << std::endl;

            TEST_CHECK(res.snr_dB >= 60.0, "Fractional resampler preserves SNR >= 60.0 dB (achieved: " + std::to_string(res.snr_dB) + " dB)");
            TEST_CHECK(res.thdPlusN_dB <= -60.0, "Fractional resampler maintains THD+N <= -60.0 dB");
        }

        // 5B. Pitch transposition (+7 semitones = fifth, pitchRatio = 2^(7/12) ≈ 1.4983)
        {
            SP404Engine engine;
            engine.prepare(kSampleRate, kBlockSize);

            constexpr double kBaseFreq = 500.0;
            auto sineBase = generateSineWave(kBaseFreq, 1.0, kSampleRate, 48000);
            engine.loadCustomSample(0, 1, sineBase.data(), sineBase.data(), sineBase.size(),
                                    static_cast<float>(kSampleRate), "SINE_PITCH", 7.0f, 1.0f, 0.0f, true, false, 0);
            engine.setParam("mfx", static_cast<float>(SP404MFX::Isolator));
            engine.setParam("ctrl1", 5.0f);
            engine.setParam("ctrl2", 5.0f);
            engine.setParam("ctrl3", 5.0f);
            engine.setParam("volume", 10.0f);
            engine.triggerPad(0, 1, 1.0f);

            const double expectedTransposedFreq = kBaseFreq * std::pow(2.0, 7.0 / 12.0); // ~749.15 Hz
            constexpr size_t kAnalysisLength = 4800;
            OwnedAudioBuffer outBuffer(2, kAnalysisLength);
            outBuffer.clear();
            auto view = outBuffer.getView();
            engine.process(view, kAnalysisLength, true);

            DspAnalysisResult res = analyzeSignal(outBuffer.getChannelData(0), kAnalysisLength, kSampleRate, expectedTransposedFreq);
            std::cout << "    [+7 Semitones Transposition] Expected: " << expectedTransposedFreq << " Hz | SNR: "
                      << std::fixed << std::setprecision(2) << res.snr_dB << " dB | THD+N: " << res.thdPlusN_dB << " dB" << std::endl;

            TEST_CHECK(res.fundamentalAmpRms > 0.35, "Pitch-shifted fundamental carries expected energy");
            TEST_CHECK(res.snr_dB >= 55.0, "Transposed playback preserves SNR >= 55.0 dB");
            TEST_CHECK(res.thdPlusN_dB <= -55.0, "Transposed playback maintains THD+N <= -55.0 dB");
        }
    }

    // --------------------------------------------------------------------------
    // TEST SUITE 6: MFX Non-Linear Saturation & Harmonic Distribution
    // --------------------------------------------------------------------------
    std::cout << "\n--- SUITE 6: MFX Harmonic Saturation Characterization ---" << std::endl;
    {
        // 6A. Filter Mode Saturation Drive scaling
        SP404Engine engine;
        engine.prepare(kSampleRate, kBlockSize);

        constexpr double kFreq = 440.0;
        auto tone = generateSineWave(kFreq, 0.8, kSampleRate, 48000);
        engine.loadCustomSample(0, 1, tone.data(), tone.data(), tone.size(),
                                static_cast<float>(kSampleRate), "DRIVE_TEST", 0.0f, 1.0f, 0.0f, true, false, 0);

        engine.setParam("mfx", static_cast<float>(SP404MFX::Filter));
        engine.setParam("ctrl1", 10.0f); // Cutoff wide open (18kHz)
        engine.setParam("ctrl2", 0.0f);  // Q flat (0.707)
        engine.setParam("volume", 10.0f);
        engine.triggerPad(0, 1, 1.0f);

        // Low Drive (CTRL 3 = 0.0f)
        engine.setParam("ctrl3", 0.0f);
        constexpr size_t kAnalysisLength = 4800;
        OwnedAudioBuffer bufLow(2, kAnalysisLength);
        bufLow.clear();
        auto viewLow = bufLow.getView();
        engine.process(viewLow, kAnalysisLength, true);
        DspAnalysisResult resLow = analyzeSignal(bufLow.getChannelData(0), kAnalysisLength, kSampleRate, kFreq);

        // High Drive (CTRL 3 = 10.0f) -> fastTanh drive saturation generates odd harmonics
        engine.setParam("ctrl3", 10.0f);
        OwnedAudioBuffer bufHigh(2, kAnalysisLength);
        bufHigh.clear();
        auto viewHigh = bufHigh.getView();
        engine.process(viewHigh, kAnalysisLength, true);
        DspAnalysisResult resHigh = analyzeSignal(bufHigh.getChannelData(0), kAnalysisLength, kSampleRate, kFreq);

        std::cout << "    [Filter MFX Clean (Drive 0.0)] THD: " << std::fixed << std::setprecision(3) << resLow.thd_percent
                  << "% (" << resLow.thd_dB << " dB)" << std::endl;
        std::cout << "    [Filter MFX Saturated (Drive 10.0)] THD: " << std::fixed << std::setprecision(3) << resHigh.thd_percent
                  << "% (" << resHigh.thd_dB << " dB)" << std::endl;

        TEST_CHECK(resHigh.thd_percent > resLow.thd_percent, "Increasing MFX Drive increases harmonic saturation smoothly");
        TEST_CHECK(resHigh.peakMagnitude <= 1.5, "fastTanh saturation keeps output bounded (no blowups or clipping overflows)");
        TEST_CHECK(!std::isnan(resHigh.totalRms) && !std::isinf(resHigh.totalRms), "Saturated audio output is strictly finite (no NaN/Inf)");
    }

    // --------------------------------------------------------------------------
    // TEST SUMMARY
    // --------------------------------------------------------------------------
    std::cout << "\n=================================================================" << std::endl;
    std::cout << " TEST SUMMARY: " << (g_testCount - g_failures) << "/" << g_testCount << " checks passed ("
              << (g_failures == 0 ? "ALL PASSED" : "FAILED") << ")" << std::endl;
    std::cout << "=================================================================" << std::endl;

    return g_failures;
}
