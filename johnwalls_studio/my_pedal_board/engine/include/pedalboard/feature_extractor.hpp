#pragma once

#include "pedalboard/audio_buffer.hpp"
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <cstdint>
#include <cmath>

namespace johnwalls::pedalboard {

enum class MusicalState {
    Idle,           // No meaningful signal
    SteadyGroove,   // Consistent 4/4 or rhythmic kick/snare pattern
    Breakdown,      // Drop in low-frequency/kick energy while track continues
    BuildFill,      // Rapid snare/percussive transient acceleration
    Drop            // Dynamic return of heavy kick after breakdown/build
};

inline const char* musicalStateToString(MusicalState state) {
    switch (state) {
        case MusicalState::Idle: return "IDLE";
        case MusicalState::SteadyGroove: return "STEADY_GROOVE";
        case MusicalState::Breakdown: return "BREAKDOWN";
        case MusicalState::BuildFill: return "BUILD_FILL";
        case MusicalState::Drop: return "DROP";
    }
    return "UNKNOWN";
}

/**
 * Standard biquad filter for frequency-band isolation.
 */
class BiquadFilter {
public:
    enum class Type { LowPass, BandPass, HighPass, Broadband };

    void setup(Type type, float frequency, float sampleRate, float q = 0.7071f);
    void reset();

    [[nodiscard]] float processSample(float in) noexcept {
        if (m_type == Type::Broadband) return in;
        float out = m_b0 * in + m_s1;
        m_s1 = m_b1 * in - m_a1 * out + m_s2;
        m_s2 = m_b2 * in - m_a2 * out;
        return out;
    }

private:
    Type m_type{Type::LowPass};
    float m_b0{1.0f}, m_b1{0.0f}, m_b2{0.0f};
    float m_a1{0.0f}, m_a2{0.0f};
    float m_s1{0.0f}, m_s2{0.0f};
};

/**
 * Envelope follower with configurable attack and release smoothing.
 */
class EnvelopeFollower {
public:
    void setup(float attackMs, float releaseMs, float sampleRate);
    void reset();

    [[nodiscard]] float processSample(float in) noexcept {
        float absIn = std::abs(in);
        if (absIn > m_envelope) {
            m_envelope = m_attackCoef * (m_envelope - absIn) + absIn;
        } else {
            m_envelope = m_releaseCoef * (m_envelope - absIn) + absIn;
        }
        return m_envelope;
    }

    [[nodiscard]] float getCurrentValue() const noexcept { return m_envelope; }

private:
    float m_attackCoef{0.0f};
    float m_releaseCoef{0.0f};
    float m_envelope{0.0f};
};

/**
 * Configuration for an arbitrary sensory/detector channel.
 */
struct SensoryChannelConfig {
    std::string id;
    BiquadFilter::Type filterType{BiquadFilter::Type::BandPass};
    float frequencyHz{1000.0f};
    float q{1.0f};
    float threshold{0.15f};
    float fastAttackMs{2.0f};
    float fastReleaseMs{45.0f};
    float slowAttackMs{15.0f};
    float slowReleaseMs{120.0f};
    float minHitDistanceMs{50.0f};
};

/**
 * An individual sensory detector channel that can isolate any acoustic band,
 * transient characteristic, or track stem dynamically.
 */
class SensoryChannel {
public:
    explicit SensoryChannel(SensoryChannelConfig config);

    void prepare(double sampleRate);
    void reset();

    /**
     * Process a mono sample. Returns true if transient hit triggered, setting outVelocity.
     */
    bool processSample(float sample, float& outVelocity);

    [[nodiscard]] const std::string& getId() const noexcept { return m_config.id; }
    [[nodiscard]] const SensoryChannelConfig& getConfig() const noexcept { return m_config; }
    [[nodiscard]] float getEnergy() const noexcept { return m_fastEnv.getCurrentValue(); }
    [[nodiscard]] float getDensity() const noexcept { return m_density; }
    [[nodiscard]] uint64_t getTotalHits() const noexcept { return m_totalHits; }

    void setThreshold(float thresh) noexcept { m_config.threshold = thresh; }
    void updateDensity(float density) noexcept { m_density = density; }
    size_t extractHitsInWindow() noexcept {
        size_t h = m_hitsInWindow;
        m_hitsInWindow = 0;
        return h;
    }

private:
    SensoryChannelConfig m_config;
    double m_sampleRate{44100.0};
    BiquadFilter m_filter;
    EnvelopeFollower m_fastEnv;
    EnvelopeFollower m_slowEnv;

    size_t m_samplesSinceLastHit{0};
    size_t m_minHitDistanceSamples{1800};
    uint64_t m_totalHits{0};
    size_t m_hitsInWindow{0};
    float m_density{0.0f};
};

/**
 * Container of hits triggered across all arbitrary sensory channels in an audio block.
 */
struct SensoryHits {
    std::unordered_map<std::string, float> triggers; // sensorId -> velocity (0..1)
    float sidechainRMS{0.0f};

    // Convenience accessors
    [[nodiscard]] bool isTriggered(const std::string& sensorId) const {
        return triggers.find(sensorId) != triggers.end();
    }
    [[nodiscard]] float getVelocity(const std::string& sensorId) const {
        auto it = triggers.find(sensorId);
        return it != triggers.end() ? it->second : 0.0f;
    }

    // Backward compatibility helpers
    bool kickTriggered{false};
    bool snareTriggered{false};
    float kickVelocity{0.0f};
    float snareVelocity{0.0f};
};

// Aliased for backward compatibility with existing code
using DrumHits = SensoryHits;

struct ChannelTelemetry {
    std::string id;
    float energy{0.0f};
    float densityPerBar{0.0f};
    uint64_t totalHits{0};
    bool justTriggered{false};
};

struct FeatureExtractorTelemetry {
    MusicalState currentState{MusicalState::Idle};
    float sidechainRMS{0.0f};
    std::vector<ChannelTelemetry> channels;

    // Convenience accessors
    float kickEnergy{0.0f};
    float snareEnergy{0.0f};
    float kickDensityPerBar{0.0f};
    float snareDensityPerBar{0.0f};
    uint64_t totalKicksDetected{0};
    uint64_t totalSnaresDetected{0};
};

/**
 * Extensible real-time rhythm analyzer and sensory manager capable of monitoring
 * an arbitrary number of acoustic channels, frequency bands, and musical state parameters.
 */
class FeatureExtractor {
public:
    FeatureExtractor();

    void prepare(double sampleRate, size_t maxBlockSize);
    void reset();

    // Arbitrary Sensory Channel Management
    bool addSensor(SensoryChannelConfig config);
    bool removeSensor(const std::string& id);
    [[nodiscard]] SensoryChannel* getSensor(const std::string& id);
    [[nodiscard]] const SensoryChannel* getSensor(const std::string& id) const;
    [[nodiscard]] std::vector<std::string> getSensorIds() const;

    /**
     * Process an incoming audio block across all arbitrary sensory channels.
     */
    SensoryHits processBlock(const AudioBufferView& sidechainBuffer, double bpm = 120.0);

    [[nodiscard]] FeatureExtractorTelemetry getTelemetry() const noexcept;
    [[nodiscard]] MusicalState getCurrentState() const noexcept { return m_currentState; }

    void setKickThreshold(float thresh) noexcept;
    void setSnareThreshold(float thresh) noexcept;

private:
    double m_sampleRate{44100.0};
    MusicalState m_currentState{MusicalState::Idle};
    EnvelopeFollower m_broadbandEnv;

    // Dynamic arbitrary sensory channels
    std::vector<std::unique_ptr<SensoryChannel>> m_sensors;

    // Rolling analysis window
    size_t m_samplesInWindow{0};
    size_t m_windowSizeSamples{88200};
    size_t m_samplesSinceKickHit{0};

    void updateMusicalState();
};

} // namespace johnwalls::pedalboard
