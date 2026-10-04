#pragma once

#include "pedalboard/feature_extractor.hpp"
#include <string>
#include <vector>
#include <unordered_map>
#include <functional>
#include <memory>
#include <mutex>

namespace johnwalls::pedalboard {

class PedalRack;

enum class ActionType {
    Snap,
    Ramp,
    Duck
};

struct ReactiveRule {
    std::string id;
    std::string triggerType{"sensor"}; // "sensor" (hit trigger) or "state" (state enter)
    std::string triggerTarget{"kick"}; // "kick", "snare", "hats", "vocal", "bass", "breakdown", "drop", etc.
    std::string targetNodeId;
    std::string targetParam;
    ActionType actionType{ActionType::Ramp};
    float targetValue{0.0f};
    float durationSeconds{1.0f};
    float depthDb{12.0f};
    bool active{true};
};

struct ActiveRamp {
    std::string targetNodeId;
    std::string targetParam;
    float startValue{0.0f};
    float targetValue{0.0f};
    float currentProgress{0.0f};
    float progressIncPerSample{0.0f};
    bool finished{false};
};

/**
 * Manages reactive rules, triggers parameter transitions upon state changes or arbitrary sensor events,
 * and interpolates parameter curves during audio block processing.
 */
class StateGovernor {
public:
    StateGovernor();

    void prepare(double sampleRate, size_t maxBlockSize);
    void reset();

    // Rule management
    bool addRule(ReactiveRule rule);
    bool removeRule(const std::string& ruleId);
    [[nodiscard]] std::vector<ReactiveRule> getRules() const;
    void clearRules();

    /**
     * Process state updates and sensory hits across all arbitrary detector channels,
     * triggering active rules and applying active parameter ramps/ducks to the pedal rack.
     */
    void process(PedalRack& rack, const SensoryHits& hits, MusicalState currentState, double bpm = 120.0);

private:
    double m_sampleRate{44100.0};
    MusicalState m_lastState{MusicalState::Idle};

    mutable std::mutex m_rulesMutex;
    std::vector<ReactiveRule> m_rules;
    std::vector<ActiveRamp> m_activeRamps;

    void triggerRules(PedalRack& rack, const std::string& triggerType, const std::string& triggerTarget, float velocity = 1.0f);
    void updateRamps(PedalRack& rack, size_t numSamples);
};

} // namespace johnwalls::pedalboard
