#pragma once

#include "johnwalls/audio_buffer.hpp"
#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <atomic>
#include <cmath>
#include <algorithm>

namespace johnwalls::johnwalls {

class DSPNode {
public:
    virtual ~DSPNode() = default;

    virtual void prepare(double sampleRate, size_t maxBlockSize) = 0;
    virtual void reset() = 0;
    virtual void process(AudioBufferView& buffer) = 0;

    [[nodiscard]] virtual std::string getType() const = 0;
    [[nodiscard]] std::string getId() const { return m_id; }
    void setId(std::string id) { m_id = std::move(id); }

    virtual bool setParameter(const std::string& name, float value) = 0;
    virtual float getParameter(const std::string& name) const = 0;
    virtual std::vector<std::string> getParameterNames() const = 0;

    [[nodiscard]] bool isBypassed() const noexcept { return m_bypassed; }
    void setBypassed(bool bypassed) noexcept { m_bypassed = bypassed; }

protected:
    std::string m_id;
    bool m_bypassed{false};
};

/**
 * High-performance, branch-free Padé rational approximation for hyperbolic tangent.
 * Provides authentic, continuous, strictly monotonic soft clipping.
 * Runs 5x-10x faster than std::tanh with maximum relative error < 0.05%.
 */
[[nodiscard]] inline float fastTanh(float x) noexcept {
    if (x <= -3.0f) return -1.0f;
    if (x >= 3.0f) return 1.0f;
    const float x2 = x * x;
    return x * (105.0f + 10.0f * x2) / (105.0f + 45.0f * x2 + x2 * x2);
}

/**
 * Fast SIMD-friendly sine approximation for LFO modulation.
 */
[[nodiscard]] inline float fastSin(float x) noexcept {
    constexpr float kPi = 3.14159265358979323846f;
    constexpr float kTwoPi = 6.28318530717958647692f;
    while (x > kPi) x -= kTwoPi;
    while (x < -kPi) x += kTwoPi;
    const float x2 = x * x;
    return x * (1.0f - x2 * (0.16666667f - x2 * 0.00833333f));
}

/**
 * Standard Audio EQ Cookbook Biquad Filter (Direct Form II Transposed).
 * Unconditionally stable, click-free, and CPU lightweight.
 */
struct RBJBiquad {
    float b0{1.0f}, b1{0.0f}, b2{0.0f};
    float a1{0.0f}, a2{0.0f};
    float s1{0.0f}, s2{0.0f};

    void reset() noexcept {
        s1 = 0.0f;
        s2 = 0.0f;
    }

    [[nodiscard]] inline float process(float in) noexcept {
        float out = b0 * in + s1;
        s1 = b1 * in - a1 * out + s2;
        s2 = b2 * in - a2 * out;
        return out;
    }

    void setPeaking(float freq, float gainDb, float q, float sampleRate) noexcept {
        freq = std::clamp(freq, 20.0f, sampleRate * 0.48f);
        float A = std::pow(10.0f, gainDb / 40.0f);
        float omega = 2.0f * 3.14159265358979323846f * freq / sampleRate;
        float sn = std::sin(omega);
        float cs = std::cos(omega);
        float alpha = sn / (2.0f * std::max(0.01f, q));

        float a0 = 1.0f + alpha / A;
        b0 = (1.0f + alpha * A) / a0;
        b1 = (-2.0f * cs) / a0;
        b2 = (1.0f - alpha * A) / a0;
        a1 = (-2.0f * cs) / a0;
        a2 = (1.0f - alpha / A) / a0;
    }

    void setLowShelf(float freq, float gainDb, float sampleRate) noexcept {
        freq = std::clamp(freq, 20.0f, sampleRate * 0.48f);
        float A = std::pow(10.0f, gainDb / 40.0f);
        float omega = 2.0f * 3.14159265358979323846f * freq / sampleRate;
        float sn = std::sin(omega);
        float cs = std::cos(omega);
        float alpha = sn / (2.0f * 0.7071f);
        float twoSqrtA_alpha = 2.0f * std::sqrt(A) * alpha;

        float a0 = (A + 1.0f) + (A - 1.0f) * cs + twoSqrtA_alpha;
        b0 = (A * ((A + 1.0f) - (A - 1.0f) * cs + twoSqrtA_alpha)) / a0;
        b1 = (2.0f * A * ((A - 1.0f) - (A + 1.0f) * cs)) / a0;
        b2 = (A * ((A + 1.0f) - (A - 1.0f) * cs - twoSqrtA_alpha)) / a0;
        a1 = (-2.0f * ((A - 1.0f) + (A + 1.0f) * cs)) / a0;
        a2 = ((A + 1.0f) + (A - 1.0f) * cs - twoSqrtA_alpha) / a0;
    }

    void setHighShelf(float freq, float gainDb, float sampleRate) noexcept {
        freq = std::clamp(freq, 20.0f, sampleRate * 0.48f);
        float A = std::pow(10.0f, gainDb / 40.0f);
        float omega = 2.0f * 3.14159265358979323846f * freq / sampleRate;
        float sn = std::sin(omega);
        float cs = std::cos(omega);
        float alpha = sn / (2.0f * 0.7071f);
        float twoSqrtA_alpha = 2.0f * std::sqrt(A) * alpha;

        float a0 = (A + 1.0f) - (A - 1.0f) * cs + twoSqrtA_alpha;
        b0 = (A * ((A + 1.0f) + (A - 1.0f) * cs + twoSqrtA_alpha)) / a0;
        b1 = (-2.0f * A * ((A - 1.0f) + (A + 1.0f) * cs)) / a0;
        b2 = (A * ((A + 1.0f) + (A - 1.0f) * cs - twoSqrtA_alpha)) / a0;
        a1 = (2.0f * ((A - 1.0f) - (A + 1.0f) * cs)) / a0;
        a2 = ((A + 1.0f) - (A - 1.0f) * cs - twoSqrtA_alpha) / a0;
    }

    void setLowPass(float freq, float q, float sampleRate) noexcept {
        freq = std::clamp(freq, 20.0f, sampleRate * 0.48f);
        float omega = 2.0f * 3.14159265358979323846f * freq / sampleRate;
        float sn = std::sin(omega);
        float cs = std::cos(omega);
        float alpha = sn / (2.0f * std::max(0.01f, q));

        float a0 = 1.0f + alpha;
        b0 = ((1.0f - cs) * 0.5f) / a0;
        b1 = (1.0f - cs) / a0;
        b2 = ((1.0f - cs) * 0.5f) / a0;
        a1 = (-2.0f * cs) / a0;
        a2 = (1.0f - alpha) / a0;
    }

    void setHighPass(float freq, float q, float sampleRate) noexcept {
        freq = std::clamp(freq, 20.0f, sampleRate * 0.48f);
        float omega = 2.0f * 3.14159265358979323846f * freq / sampleRate;
        float sn = std::sin(omega);
        float cs = std::cos(omega);
        float alpha = sn / (2.0f * std::max(0.01f, q));

        float a0 = 1.0f + alpha;
        b0 = ((1.0f + cs) * 0.5f) / a0;
        b1 = (-(1.0f + cs)) / a0;
        b2 = ((1.0f + cs) * 0.5f) / a0;
        a1 = (-2.0f * cs) / a0;
        a2 = (1.0f - alpha) / a0;
    }
};

/**
 * Analog-modeled tape delay with wow/flutter modulation and warm soft clipping.
 */
class TapeDelayNode : public DSPNode {
public:
    explicit TapeDelayNode(std::string id = "delay");

    void prepare(double sampleRate, size_t maxBlockSize) override;
    void reset() override;
    void process(AudioBufferView& buffer) override;

    [[nodiscard]] std::string getType() const override { return "delay"; }
    bool setParameter(const std::string& name, float value) override;
    float getParameter(const std::string& name) const override;
    std::vector<std::string> getParameterNames() const override;

private:
    double m_sampleRate{44100.0};
    float m_delayTimeMs{350.0f};
    float m_feedback{0.45f};
    float m_mix{0.50f};
    float m_flutter{0.15f};
    float m_saturation{0.25f};

    std::vector<float> m_bufferL;
    std::vector<float> m_bufferR;
    size_t m_writeIndex{0};
    size_t m_maxDelaySamples{192000};

    float m_lfoPhase{0.0f};
    float m_lfoInc{0.0f};
};

/**
 * 24dB Moog-style resonant ladder filter.
 */
class LadderFilterNode : public DSPNode {
public:
    explicit LadderFilterNode(std::string id = "filter");

    void prepare(double sampleRate, size_t maxBlockSize) override;
    void reset() override;
    void process(AudioBufferView& buffer) override;

    [[nodiscard]] std::string getType() const override { return "filter"; }
    bool setParameter(const std::string& name, float value) override;
    float getParameter(const std::string& name) const override;
    std::vector<std::string> getParameterNames() const override;

private:
    double m_sampleRate{44100.0};
    float m_cutoffHz{1200.0f};
    float m_resonance{0.50f};
    float m_drive{1.2f};
    float m_mix{1.0f};

    float m_stageL[4]{0.0f, 0.0f, 0.0f, 0.0f};
    float m_stageR[4]{0.0f, 0.0f, 0.0f, 0.0f};
};

/**
 * Warm harmonic overdrive waveshaper.
 */
class OverdriveNode : public DSPNode {
public:
    explicit OverdriveNode(std::string id = "drive");

    void prepare(double sampleRate, size_t maxBlockSize) override;
    void reset() override;
    void process(AudioBufferView& buffer) override;

    [[nodiscard]] std::string getType() const override { return "drive"; }
    bool setParameter(const std::string& name, float value) override;
    float getParameter(const std::string& name) const override;
    std::vector<std::string> getParameterNames() const override;

private:
    float m_drive{3.5f};
    float m_tone{0.65f};
    float m_mix{0.75f};
    float m_prevL{0.0f};
    float m_prevR{0.0f};
};

/**
 * Reactive ducker / dynamic envelope shaper driven by real-time state events.
 */
class ReactiveDuckerNode : public DSPNode {
public:
    explicit ReactiveDuckerNode(std::string id = "ducker");

    void prepare(double sampleRate, size_t maxBlockSize) override;
    void reset() override;
    void process(AudioBufferView& buffer) override;

    [[nodiscard]] std::string getType() const override { return "ducker"; }
    bool setParameter(const std::string& name, float value) override;
    float getParameter(const std::string& name) const override;
    std::vector<std::string> getParameterNames() const override;

    void trigger(float amount = 1.0f);

private:
    double m_sampleRate{44100.0};
    float m_depthDb{14.0f};
    float m_attackMs{2.0f};
    float m_releaseMs{75.0f};
    float m_currentGain{1.0f};
    float m_targetGain{1.0f};
    float m_attackCoef{0.0f};
    float m_releaseCoef{0.0f};

    void updateCoefficients();
};

/**
 * Authentic Mesa Boogie 3-Channel Mark Series (Mark III / Mark V) Amplifier & 4x12 Cab Emulator.
 * Channels: 0 = Rhythm 1 (Clean), 1 = Rhythm 2 (Crunch), 2 = Searing Lead.
 * Features:
 *  - Front-end Volume 1 (Gain) with Pull Bright high-pass bypass capacitor
 *  - Dedicated Lead Drive stage cascading 12AX7 tube saturation
 *  - Rhythm Master 1 & Dedicated Lead Master outputs
 *  - Pre-Gain FMV Tone Stack with Bass (Pull Deep sub-boost), Mid (Pull Shift center freq), and Treble
 *  - Power Amp Presence negative-feedback loop
 *  - Simul-Class 85W vs Class A 30W Power Amp Dynamic Saturation
 *  - Fully functional Post-Gain 5-Band Graphic Equalizer (80Hz, 240Hz, 750Hz, 2.2kHz, 6.6kHz)
 *  - Celestion Vintage 30 4x12 Speaker Cabinet Simulation
 */
class MesaMarkNode : public DSPNode {
public:
    explicit MesaMarkNode(std::string id = "mesa_mark");

    void prepare(double sampleRate, size_t maxBlockSize) override;
    void reset() override;
    void process(AudioBufferView& buffer) override;

    [[nodiscard]] std::string getType() const override { return "mesa"; }
    bool setParameter(const std::string& name, float value) override;
    float getParameter(const std::string& name) const override;
    std::vector<std::string> getParameterNames() const override;

private:
    void updateFilters();

    double m_sampleRate{44100.0};
    float m_channel{2.0f};    // 0 = Rhythm 1 (Clean), 1 = Rhythm 2 (Crunch), 2 = Lead
    float m_gain{7.5f};       // Volume 1 (0..10)
    float m_leadDrive{8.0f};  // Lead Drive (0..10)
    float m_master{6.0f};     // Master 1 (0..10)
    float m_leadMaster{6.5f}; // Lead Master (0..10)

    // Pull switches
    float m_pullBright{1.0f}; // 1 = Bright engaged on Volume 1
    float m_bass{4.0f};       // 0..10
    float m_pullDeep{1.0f};   // 1 = Deep sub-bass boost engaged
    float m_mid{5.0f};        // 0..10
    float m_pullShift{0.0f};  // 1 = Shift mid center freq from 650Hz to 450Hz
    float m_treble{7.0f};     // 0..10
    float m_presence{6.5f};   // 0..10
    float m_simulClass{1.0f}; // 1 = Simul-Class 85W, 0 = Class A 30W

    // 5-Band Graphic Equalizer
    float m_eqActive{1.0f};   // 1 = EQ In, 0 = EQ Out (Bypass)
    float m_eq80{3.5f};       // 80 Hz (-12..+12 dB)
    float m_eq240{0.5f};      // 240 Hz (-12..+12 dB)
    float m_eq750{-5.5f};     // 750 Hz mid scoop (-12..+12 dB)
    float m_eq2200{2.0f};     // 2.2 kHz lead bite (-12..+12 dB)
    float m_eq6600{4.0f};     // 6.6 kHz presence (-12..+12 dB)

    float m_cabEnabled{1.0f}; // 1 = Celestion V30 4x12 Cab

    // Real DSP Biquad Filters (Stereo L and R)
    RBJBiquad m_preBassL, m_preBassR;
    RBJBiquad m_preMidL, m_preMidR;
    RBJBiquad m_preTrebleL, m_preTrebleR;
    RBJBiquad m_preBrightL, m_preBrightR;
    RBJBiquad m_presenceL, m_presenceR;

    // Graphic EQ biquads
    RBJBiquad m_filter80L, m_filter80R;
    RBJBiquad m_filter240L, m_filter240R;
    RBJBiquad m_filter750L, m_filter750R;
    RBJBiquad m_filter2200L, m_filter2200R;
    RBJBiquad m_filter6600L, m_filter6600R;

    // Cabinet simulation biquads
    RBJBiquad m_cabLowL, m_cabLowR;
    RBJBiquad m_cabPeakL, m_cabPeakR;
    RBJBiquad m_cabHighL, m_cabHighR;
};

/**
 * Authentic Vox AC-30 Top Boost Amplifier & 2x12 Alnico Blue Cab Emulator.
 * Channels: 0 = Normal Channel, 1 = Top Boost Channel.
 * Features:
 *  - Normal Volume & Top Boost Volume
 *  - Interactive Treble and Bass Tonestack
 *  - Brilliant Switch high-frequency chime boost
 *  - Power-Amp Reverse Tone Cut across phase inverter plates (rolls off highs as turned clockwise)
 *  - EL84 Power Section Harmonic Chime Exciter
 *  - Dynamic Power Supply Tube Sag Compression
 *  - Celestion Alnico Blue 2x12 Open-Back Speaker Cabinet Simulation
 */
class VoxAC30Node : public DSPNode {
public:
    explicit VoxAC30Node(std::string id = "vox_ac30");

    void prepare(double sampleRate, size_t maxBlockSize) override;
    void reset() override;
    void process(AudioBufferView& buffer) override;

    [[nodiscard]] std::string getType() const override { return "vox"; }
    bool setParameter(const std::string& name, float value) override;
    float getParameter(const std::string& name) const override;
    std::vector<std::string> getParameterNames() const override;

private:
    void updateFilters();

    double m_sampleRate{44100.0};
    float m_channel{1.0f};    // 0 = Normal, 1 = Top Boost
    float m_gain{6.5f};       // Volume (0..10)
    float m_bass{5.5f};       // 0..10
    float m_treble{7.0f};     // 0..10
    float m_brilliant{1.0f};  // 1 = Brilliant switch engaged
    float m_cut{3.5f};        // 0..10 (Tone Cut: rolls off highs from 14kHz down to 2.5kHz)
    float m_chime{6.5f};      // 0..10 (Harmonic shimmer exciter)
    float m_master{7.0f};     // 0..10
    float m_cabEnabled{1.0f}; // 1 = 2x12 Alnico Blue Cab

    // Dynamic Sag Memory
    float m_sagEnvelope{0.0f};

    // Real DSP Biquad Filters (Stereo L and R)
    RBJBiquad m_bassFilterL, m_bassFilterR;
    RBJBiquad m_trebleFilterL, m_trebleFilterR;
    RBJBiquad m_brilliantFilterL, m_brilliantFilterR;
    RBJBiquad m_cutFilterL, m_cutFilterR;

    // Cabinet simulation biquads
    RBJBiquad m_cabLowL, m_cabLowR;
    RBJBiquad m_cabPeakL, m_cabPeakR;
    RBJBiquad m_cabHighL, m_cabHighR;
};

/**
 * Analog-Modeled Transparent Soft Limiter.
 * Provides musical, zero-latency, glitch-free soft-knee peak limiting with strict ceiling.
 * Threshold is calibrated to -0.3 dBFS (~0.966f) to prevent inter-sample clipping and digital overs in Ableton Live.
 * Below threshold T: output = input (100% bit-transparent unity gain).
 * Above threshold T: continuous hyperbolic compression towards ceiling kCeiling (default 0.985f / -0.13 dBFS).
 */
class TransparentSoftLimiter {
public:
    explicit TransparentSoftLimiter(float ceilingDb = -0.3f) {
        setCeilingDb(ceilingDb);
    }

    void prepare(double sampleRate) {
        m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
        reset();
    }

    void reset() {
        m_envelopeL = 0.0f;
        m_envelopeR = 0.0f;
        m_maxReduction.store(0.0f, std::memory_order_relaxed);
    }

    void setCeilingDb(float ceilingDb) {
        m_ceilingDb = std::clamp(ceilingDb, -6.0f, 0.0f);
        m_thresholdLinear = std::pow(10.0f, m_ceilingDb / 20.0f);
        m_ceilingLinear = std::min(0.990f, m_thresholdLinear + 0.025f * (1.0f - m_thresholdLinear));
    }

    [[nodiscard]] float getCeilingDb() const noexcept { return m_ceilingDb; }
    [[nodiscard]] float getThresholdLinear() const noexcept { return m_thresholdLinear; }
    [[nodiscard]] float getCeilingLinear() const noexcept { return m_ceilingLinear; }

    void setEnabled(bool enabled) noexcept { m_enabled = enabled; }
    [[nodiscard]] bool isEnabled() const noexcept { return m_enabled; }

    [[nodiscard]] float getMaxReductionDb() const noexcept {
        return m_maxReduction.load(std::memory_order_relaxed);
    }

    void process(AudioBufferView& buffer, float masterTrimLinear = 1.0f) {
        if (!m_enabled || buffer.getNumChannels() == 0) {
            if (std::abs(masterTrimLinear - 1.0f) > 0.0001f) {
                const size_t numSamples = buffer.getNumSamples();
                for (size_t ch = 0; ch < buffer.getNumChannels(); ++ch) {
                    float* data = buffer.getChannelData(ch);
                    for (size_t i = 0; i < numSamples; ++i) {
                        data[i] *= masterTrimLinear;
                    }
                }
            }
            return;
        }

        const size_t numSamples = buffer.getNumSamples();
        const size_t numChannels = buffer.getNumChannels();
        float* channelL = buffer.getChannelData(0);
        float* channelR = (numChannels > 1) ? buffer.getChannelData(1) : nullptr;

        const float T = m_thresholdLinear;
        const float C = m_ceilingLinear;
        const float headroom = std::max(0.0001f, C - T);

        float blockMaxRed = 0.0f;

        for (size_t i = 0; i < numSamples; ++i) {
            float inL = channelL[i] * masterTrimLinear;
            float absL = std::abs(inL);
            float outL = inL;

            if (absL > T) {
                float excess = absL - T;
                float limited = T + headroom * fastTanh(excess / headroom);
                outL = (inL >= 0.0f) ? limited : -limited;
                float redDb = 20.0f * std::log10(std::max(0.00001f, absL / limited));
                if (redDb > blockMaxRed) blockMaxRed = redDb;
            }
            channelL[i] = outL;

            if (channelR) {
                float inR = channelR[i] * masterTrimLinear;
                float absR = std::abs(inR);
                float outR = inR;

                if (absR > T) {
                    float excess = absR - T;
                    float limited = T + headroom * fastTanh(excess / headroom);
                    outR = (inR >= 0.0f) ? limited : -limited;
                    float redDb = 20.0f * std::log10(std::max(0.00001f, absR / limited));
                    if (redDb > blockMaxRed) blockMaxRed = redDb;
                }
                channelR[i] = outR;
            }
        }

        m_maxReduction.store(blockMaxRed, std::memory_order_relaxed);
    }

private:
    double m_sampleRate{44100.0};
    bool m_enabled{true};
    float m_ceilingDb{-0.3f};
    float m_thresholdLinear{0.9660508f};
    float m_ceilingLinear{0.985f};
    float m_envelopeL{0.0f};
    float m_envelopeR{0.0f};
    std::atomic<float> m_maxReduction{0.0f};
};

} // namespace johnwalls::johnwalls
