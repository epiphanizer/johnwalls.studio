#include "johnwalls/feature_extractor.hpp"
#include <cmath>
#include <algorithm>

namespace johnwalls::johnwalls {

void BiquadFilter::setup(Type type, float frequency, float sampleRate, float q) {
    m_type = type;
    if (type == Type::Broadband) {
        reset();
        return;
    }

    float omega = 2.0f * 3.14159265358979323846f * frequency / sampleRate;
    float sinOmega = std::sin(omega);
    float cosOmega = std::cos(omega);
    float alpha = sinOmega / (2.0f * q);

    float a0 = 1.0f;

    switch (type) {
        case Type::LowPass: {
            m_b0 = (1.0f - cosOmega) * 0.5f;
            m_b1 = 1.0f - cosOmega;
            m_b2 = (1.0f - cosOmega) * 0.5f;
            a0   = 1.0f + alpha;
            m_a1 = -2.0f * cosOmega;
            m_a2 = 1.0f - alpha;
            break;
        }
        case Type::BandPass: {
            m_b0 = alpha;
            m_b1 = 0.0f;
            m_b2 = -alpha;
            a0   = 1.0f + alpha;
            m_a1 = -2.0f * cosOmega;
            m_a2 = 1.0f - alpha;
            break;
        }
        case Type::HighPass: {
            m_b0 = (1.0f + cosOmega) * 0.5f;
            m_b1 = -(1.0f + cosOmega);
            m_b2 = (1.0f + cosOmega) * 0.5f;
            a0   = 1.0f + alpha;
            m_a1 = -2.0f * cosOmega;
            m_a2 = 1.0f - alpha;
            break;
        }
        default:
            break;
    }

    float invA0 = 1.0f / a0;
    m_b0 *= invA0;
    m_b1 *= invA0;
    m_b2 *= invA0;
    m_a1 *= invA0;
    m_a2 *= invA0;

    reset();
}

void BiquadFilter::reset() {
    m_s1 = 0.0f;
    m_s2 = 0.0f;
}

void EnvelopeFollower::setup(float attackMs, float releaseMs, float sampleRate) {
    if (attackMs <= 0.01f) {
        m_attackCoef = 0.0f;
    } else {
        m_attackCoef = std::exp(-1.0f / (attackMs * 0.001f * sampleRate));
    }

    if (releaseMs <= 0.01f) {
        m_releaseCoef = 0.0f;
    } else {
        m_releaseCoef = std::exp(-1.0f / (releaseMs * 0.001f * sampleRate));
    }

    reset();
}

void EnvelopeFollower::reset() {
    m_envelope = 0.0f;
}

// ---------------------------------------------------------------------------
// SensoryChannel Implementation
// ---------------------------------------------------------------------------

SensoryChannel::SensoryChannel(SensoryChannelConfig config)
    : m_config(std::move(config)) {
    prepare(44100.0);
}

void SensoryChannel::prepare(double sampleRate) {
    m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    m_filter.setup(m_config.filterType, m_config.frequencyHz, static_cast<float>(m_sampleRate), m_config.q);
    m_fastEnv.setup(m_config.fastAttackMs, m_config.fastReleaseMs, static_cast<float>(m_sampleRate));
    m_slowEnv.setup(m_config.slowAttackMs, m_config.slowReleaseMs, static_cast<float>(m_sampleRate));
    m_minHitDistanceSamples = static_cast<size_t>(m_sampleRate * (m_config.minHitDistanceMs * 0.001));
    reset();
}

void SensoryChannel::reset() {
    m_filter.reset();
    m_fastEnv.reset();
    m_slowEnv.reset();
    m_samplesSinceLastHit = m_minHitDistanceSamples + 1;
    m_totalHits = 0;
    m_hitsInWindow = 0;
    m_density = 0.0f;
}

bool SensoryChannel::processSample(float sample, float& outVelocity) {
    float filtered = m_filter.processSample(sample);
    float fastVal = m_fastEnv.processSample(filtered);
    float slowVal = m_slowEnv.processSample(filtered);

    m_samplesSinceLastHit++;

    // Transient detection: fast rise above adaptive slow floor & absolute threshold
    if (fastVal > m_config.threshold && (fastVal > slowVal * 1.25f || fastVal > 0.40f) && m_samplesSinceLastHit >= m_minHitDistanceSamples) {
        outVelocity = std::clamp(fastVal * 1.6f, 0.1f, 1.0f);
        m_totalHits++;
        m_hitsInWindow++;
        m_samplesSinceLastHit = 0;
        return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// FeatureExtractor Implementation
// ---------------------------------------------------------------------------

FeatureExtractor::FeatureExtractor() {
    // Populate factory default sensory channels
    SensoryChannelConfig kickCfg;
    kickCfg.id = "kick";
    kickCfg.filterType = BiquadFilter::Type::LowPass;
    kickCfg.frequencyHz = 95.0f;
    kickCfg.q = 1.1f;
    kickCfg.threshold = 0.18f;
    kickCfg.fastAttackMs = 1.5f;
    kickCfg.fastReleaseMs = 40.0f;
    m_sensors.push_back(std::make_unique<SensoryChannel>(kickCfg));

    SensoryChannelConfig snareCfg;
    snareCfg.id = "snare";
    snareCfg.filterType = BiquadFilter::Type::BandPass;
    snareCfg.frequencyHz = 1200.0f;
    snareCfg.q = 1.0f;
    snareCfg.threshold = 0.14f;
    snareCfg.fastAttackMs = 2.0f;
    snareCfg.fastReleaseMs = 45.0f;
    m_sensors.push_back(std::make_unique<SensoryChannel>(snareCfg));

    SensoryChannelConfig hatsCfg;
    hatsCfg.id = "hats";
    hatsCfg.filterType = BiquadFilter::Type::HighPass;
    hatsCfg.frequencyHz = 6500.0f;
    hatsCfg.q = 0.8f;
    hatsCfg.threshold = 0.08f;
    hatsCfg.fastAttackMs = 1.0f;
    hatsCfg.fastReleaseMs = 30.0f;
    m_sensors.push_back(std::make_unique<SensoryChannel>(hatsCfg));

    SensoryChannelConfig bassCfg;
    bassCfg.id = "bass";
    bassCfg.filterType = BiquadFilter::Type::LowPass;
    bassCfg.frequencyHz = 220.0f;
    bassCfg.q = 1.0f;
    bassCfg.threshold = 0.15f;
    bassCfg.fastAttackMs = 5.0f;
    bassCfg.fastReleaseMs = 60.0f;
    m_sensors.push_back(std::make_unique<SensoryChannel>(bassCfg));

    SensoryChannelConfig vocalCfg;
    vocalCfg.id = "vocal";
    vocalCfg.filterType = BiquadFilter::Type::BandPass;
    vocalCfg.frequencyHz = 2400.0f;
    vocalCfg.q = 1.2f;
    vocalCfg.threshold = 0.12f;
    vocalCfg.fastAttackMs = 4.0f;
    vocalCfg.fastReleaseMs = 80.0f;
    m_sensors.push_back(std::make_unique<SensoryChannel>(vocalCfg));

    prepare(44100.0, 512);
}

void FeatureExtractor::prepare(double sampleRate, size_t /*maxBlockSize*/) {
    m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    m_broadbandEnv.setup(10.0f, 150.0f, static_cast<float>(m_sampleRate));
    for (auto& s : m_sensors) {
        s->prepare(m_sampleRate);
    }
    m_windowSizeSamples = static_cast<size_t>(m_sampleRate * 2.0);
    reset();
}

void FeatureExtractor::reset() {
    m_broadbandEnv.reset();
    for (auto& s : m_sensors) {
        s->reset();
    }
    m_currentState = MusicalState::Idle;
    m_samplesInWindow = 0;
    m_samplesSinceKickHit = m_windowSizeSamples + 1;
}

bool FeatureExtractor::addSensor(SensoryChannelConfig config) {
    if (config.id.empty()) return false;
    for (const auto& s : m_sensors) {
        if (s->getId() == config.id) return false;
    }
    auto channel = std::make_unique<SensoryChannel>(std::move(config));
    channel->prepare(m_sampleRate);
    m_sensors.push_back(std::move(channel));
    return true;
}

bool FeatureExtractor::removeSensor(const std::string& id) {
    auto it = std::remove_if(m_sensors.begin(), m_sensors.end(),
        [&id](const std::unique_ptr<SensoryChannel>& s) {
            return s->getId() == id;
        });
    if (it != m_sensors.end()) {
        m_sensors.erase(it, m_sensors.end());
        return true;
    }
    return false;
}

SensoryChannel* FeatureExtractor::getSensor(const std::string& id) {
    for (auto& s : m_sensors) {
        if (s->getId() == id) return s.get();
    }
    return nullptr;
}

const SensoryChannel* FeatureExtractor::getSensor(const std::string& id) const {
    for (const auto& s : m_sensors) {
        if (s->getId() == id) return s.get();
    }
    return nullptr;
}

std::vector<std::string> FeatureExtractor::getSensorIds() const {
    std::vector<std::string> ids;
    ids.reserve(m_sensors.size());
    for (const auto& s : m_sensors) {
        ids.push_back(s->getId());
    }
    return ids;
}

void FeatureExtractor::setKickThreshold(float thresh) noexcept {
    if (auto* s = getSensor("kick")) s->setThreshold(thresh);
}

void FeatureExtractor::setSnareThreshold(float thresh) noexcept {
    if (auto* s = getSensor("snare")) s->setThreshold(thresh);
}

SensoryHits FeatureExtractor::processBlock(const AudioBufferView& sidechainBuffer, double bpm) {
    SensoryHits hits{};
    const size_t numSamples = sidechainBuffer.getNumSamples();
    const size_t numChannels = sidechainBuffer.getNumChannels();

    if (numSamples == 0 || numChannels == 0) {
        return hits;
    }

    double effectiveBpm = (bpm > 20.0 && bpm < 300.0) ? bpm : 120.0;
    m_windowSizeSamples = static_cast<size_t>((60.0 / effectiveBpm) * 4.0 * m_sampleRate);

    float sumSquared = 0.0f;

    for (size_t i = 0; i < numSamples; ++i) {
        float sample = 0.0f;
        for (size_t ch = 0; ch < numChannels; ++ch) {
            sample += sidechainBuffer.getSample(ch, i);
        }
        sample /= static_cast<float>(numChannels);
        sumSquared += sample * sample;

        (void)m_broadbandEnv.processSample(sample);
        m_samplesInWindow++;
        m_samplesSinceKickHit++;

        // Process through all registered sensory channels dynamically
        for (auto& sensor : m_sensors) {
            float vel = 0.0f;
            if (sensor->processSample(sample, vel)) {
                hits.triggers[sensor->getId()] = vel;
                if (sensor->getId() == "kick") {
                    hits.kickTriggered = true;
                    hits.kickVelocity = vel;
                    m_samplesSinceKickHit = 0;
                } else if (sensor->getId() == "snare") {
                    hits.snareTriggered = true;
                    hits.snareVelocity = vel;
                }
            }
        }

        // Rolling window density recalculation
        if (m_samplesInWindow >= m_windowSizeSamples) {
            for (auto& sensor : m_sensors) {
                sensor->updateDensity(static_cast<float>(sensor->extractHitsInWindow()));
            }
            m_samplesInWindow = 0;
            updateMusicalState();
        }
    }

    // Reactive immediate breakdown transition if kick disappeared during playback
    if (m_currentState == MusicalState::SteadyGroove && m_samplesSinceKickHit >= m_windowSizeSamples && m_broadbandEnv.getCurrentValue() > 0.010f) {
        m_currentState = MusicalState::Breakdown;
    }

    hits.sidechainRMS = std::sqrt(sumSquared / static_cast<float>(numSamples));
    return hits;
}

void FeatureExtractor::updateMusicalState() {
    float broadbandRMS = m_broadbandEnv.getCurrentValue();
    float kickDensity = 0.0f;
    float snareDensity = 0.0f;

    if (const auto* k = getSensor("kick")) kickDensity = k->getDensity();
    if (const auto* s = getSensor("snare")) snareDensity = s->getDensity();

    if (broadbandRMS < 0.005f && kickDensity < 0.5f && snareDensity < 0.5f) {
        m_currentState = MusicalState::Idle;
        return;
    }

    if (snareDensity >= 6.0f) {
        m_currentState = MusicalState::BuildFill;
        return;
    }

    if (kickDensity == 0.0f && broadbandRMS > 0.015f) {
        m_currentState = MusicalState::Breakdown;
        return;
    }

    if ((m_currentState == MusicalState::Breakdown || m_currentState == MusicalState::BuildFill) && kickDensity >= 2.0f) {
        m_currentState = MusicalState::Drop;
        return;
    }

    if (kickDensity >= 1.0f) {
        m_currentState = MusicalState::SteadyGroove;
        return;
    }
}

FeatureExtractorTelemetry FeatureExtractor::getTelemetry() const noexcept {
    FeatureExtractorTelemetry t;
    t.currentState = m_currentState;
    t.sidechainRMS = m_broadbandEnv.getCurrentValue();

    t.channels.reserve(m_sensors.size());
    for (const auto& s : m_sensors) {
        ChannelTelemetry ct;
        ct.id = s->getId();
        ct.energy = s->getEnergy();
        ct.densityPerBar = s->getDensity();
        ct.totalHits = s->getTotalHits();
        t.channels.push_back(std::move(ct));

        if (s->getId() == "kick") {
            t.kickEnergy = s->getEnergy();
            t.kickDensityPerBar = s->getDensity();
            t.totalKicksDetected = s->getTotalHits();
        } else if (s->getId() == "snare") {
            t.snareEnergy = s->getEnergy();
            t.snareDensityPerBar = s->getDensity();
            t.totalSnaresDetected = s->getTotalHits();
        }
    }
    return t;
}

} // namespace johnwalls::johnwalls
