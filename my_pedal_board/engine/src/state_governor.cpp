#include "pedalboard/state_governor.hpp"
#include "pedalboard/pedal_rack.hpp"
#include <algorithm>

namespace johnwalls::pedalboard {

StateGovernor::StateGovernor() = default;

void StateGovernor::prepare(double sampleRate, size_t /*maxBlockSize*/) {
    m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    reset();
}

void StateGovernor::reset() {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    m_lastState = MusicalState::Idle;
    m_activeRamps.clear();
}

bool StateGovernor::addRule(ReactiveRule rule) {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    if (rule.id.empty()) {
        rule.id = "rule_" + std::to_string(m_rules.size() + 1);
    }
    m_rules.erase(
        std::remove_if(m_rules.begin(), m_rules.end(),
            [&rule](const ReactiveRule& r) { return r.id == rule.id; }),
        m_rules.end());
    m_rules.push_back(std::move(rule));
    return true;
}

bool StateGovernor::removeRule(const std::string& ruleId) {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    auto it = std::remove_if(m_rules.begin(), m_rules.end(),
        [&ruleId](const ReactiveRule& r) { return r.id == ruleId; });
    if (it != m_rules.end()) {
        m_rules.erase(it, m_rules.end());
        return true;
    }
    return false;
}

std::vector<ReactiveRule> StateGovernor::getRules() const {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    return m_rules;
}

void StateGovernor::clearRules() {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    m_rules.clear();
    m_activeRamps.clear();
}

void StateGovernor::triggerRules(PedalRack& rack, const std::string& triggerType, const std::string& triggerTarget, float velocity) {
    for (const auto& rule : m_rules) {
        if (!rule.active) continue;
        if (rule.triggerType != triggerType || rule.triggerTarget != triggerTarget) continue;

        switch (rule.actionType) {
            case ActionType::Snap: {
                rack.setParameter(rule.targetNodeId, rule.targetParam, rule.targetValue);
                break;
            }
            case ActionType::Ramp: {
                auto currentValOpt = rack.getParameter(rule.targetNodeId, rule.targetParam);
                float startVal = currentValOpt.value_or(rule.targetValue);
                float totalSamples = std::max(1.0f, rule.durationSeconds * static_cast<float>(m_sampleRate));

                ActiveRamp ramp;
                ramp.targetNodeId = rule.targetNodeId;
                ramp.targetParam = rule.targetParam;
                ramp.startValue = startVal;
                ramp.targetValue = rule.targetValue;
                ramp.currentProgress = 0.0f;
                ramp.progressIncPerSample = 1.0f / totalSamples;
                ramp.finished = false;

                auto it = std::find_if(m_activeRamps.begin(), m_activeRamps.end(),
                    [&ramp](const ActiveRamp& r) {
                        return r.targetNodeId == ramp.targetNodeId && r.targetParam == ramp.targetParam;
                    });
                if (it != m_activeRamps.end()) {
                    *it = ramp;
                } else {
                    m_activeRamps.push_back(ramp);
                }
                break;
            }
            case ActionType::Duck: {
                DSPNode* node = rack.getNode(rule.targetNodeId);
                if (auto* ducker = dynamic_cast<ReactiveDuckerNode*>(node)) {
                    ducker->trigger(velocity);
                } else {
                    auto currentValOpt = rack.getParameter(rule.targetNodeId, rule.targetParam);
                    if (currentValOpt.has_value()) {
                        float nominal = currentValOpt.value();
                        float ducked = nominal * std::pow(10.0f, (-rule.depthDb * velocity) / 20.0f);
                        rack.setParameter(rule.targetNodeId, rule.targetParam, ducked);

                        float totalSamples = std::max(1.0f, rule.durationSeconds * static_cast<float>(m_sampleRate));
                        ActiveRamp recover;
                        recover.targetNodeId = rule.targetNodeId;
                        recover.targetParam = rule.targetParam;
                        recover.startValue = ducked;
                        recover.targetValue = nominal;
                        recover.currentProgress = 0.0f;
                        recover.progressIncPerSample = 1.0f / totalSamples;
                        recover.finished = false;
                        m_activeRamps.push_back(recover);
                    }
                }
                break;
            }
        }
    }
}

void StateGovernor::updateRamps(PedalRack& rack, size_t numSamples) {
    if (m_activeRamps.empty()) return;

    for (auto& ramp : m_activeRamps) {
        if (ramp.finished) continue;

        ramp.currentProgress += ramp.progressIncPerSample * static_cast<float>(numSamples);
        if (ramp.currentProgress >= 1.0f) {
            ramp.currentProgress = 1.0f;
            ramp.finished = true;
            rack.setParameter(ramp.targetNodeId, ramp.targetParam, ramp.targetValue);
        } else {
            float t = ramp.currentProgress;
            float smoothT = 0.5f * (1.0f - std::cos(t * 3.1415926535f));
            float interpVal = ramp.startValue + smoothT * (ramp.targetValue - ramp.startValue);
            rack.setParameter(ramp.targetNodeId, ramp.targetParam, interpVal);
        }
    }

    m_activeRamps.erase(
        std::remove_if(m_activeRamps.begin(), m_activeRamps.end(),
            [](const ActiveRamp& r) { return r.finished; }),
        m_activeRamps.end());
}

void StateGovernor::process(PedalRack& rack, const SensoryHits& hits, MusicalState currentState, double /*bpm*/) {
    std::lock_guard<std::mutex> lock(m_rulesMutex);

    // State transition detection
    if (currentState != m_lastState) {
        std::string stateStr;
        switch (currentState) {
            case MusicalState::SteadyGroove: stateStr = "steady_groove"; break;
            case MusicalState::Breakdown:    stateStr = "breakdown"; break;
            case MusicalState::BuildFill:    stateStr = "build_fill"; break;
            case MusicalState::Drop:         stateStr = "drop"; break;
            case MusicalState::Idle:         stateStr = "idle"; break;
        }
        if (!stateStr.empty()) {
            triggerRules(rack, "state", stateStr);
        }
        m_lastState = currentState;
    }

    // Sensory channel hit triggers (arbitrary amount!)
    for (const auto& [sensorId, velocity] : hits.triggers) {
        triggerRules(rack, "sensor", sensorId, velocity);
    }

    // Update ongoing parameter ramps
    updateRamps(rack, 512);
}

} // namespace johnwalls::pedalboard
