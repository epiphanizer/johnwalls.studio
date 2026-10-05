#include "johnwalls/cli_grammar.hpp"
#include <sstream>
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <cctype>

namespace johnwalls::johnwalls {

CLIGrammar::CLIGrammar(PedalRack& rack, StateGovernor& governor, FeatureExtractor& extractor)
    : m_rack(rack), m_governor(governor), m_extractor(extractor) {}

std::vector<std::string> CLIGrammar::tokenize(const std::string& input) {
    std::vector<std::string> tokens;
    std::string current;
    bool inQuotes = false;

    for (size_t i = 0; i < input.size(); ++i) {
        char c = input[i];
        if (c == '"' || c == '\'') {
            inQuotes = !inQuotes;
        } else if (std::isspace(static_cast<unsigned char>(c)) && !inQuotes) {
            if (!current.empty()) {
                tokens.push_back(current);
                current.clear();
            }
        } else {
            current += c;
        }
    }
    if (!current.empty()) {
        tokens.push_back(current);
    }
    return tokens;
}

std::unordered_map<std::string, std::string> CLIGrammar::parseFlags(const std::vector<std::string>& tokens, size_t startIndex) {
    std::unordered_map<std::string, std::string> flags;
    for (size_t i = startIndex; i < tokens.size(); ++i) {
        const std::string& tok = tokens[i];
        if (tok.rfind("--", 0) == 0) {
            std::string key = tok.substr(2);
            if (i + 1 < tokens.size() && tokens[i + 1].rfind("--", 0) != 0) {
                flags[key] = tokens[++i];
            } else {
                flags[key] = "true";
            }
        }
    }
    return flags;
}

float CLIGrammar::parseValueWithUnit(const std::string& str) {
    std::string clean = str;
    if (clean.size() > 2 && (clean.substr(clean.size() - 2) == "ms" || clean.substr(clean.size() - 2) == "Hz" || clean.substr(clean.size() - 2) == "dB")) {
        clean = clean.substr(0, clean.size() - 2);
    } else if (clean.size() > 1 && (clean.back() == 's' || clean.back() == 'm')) {
        clean = clean.substr(0, clean.size() - 1);
    } else if (!clean.empty() && clean.back() == '%') {
        clean = clean.substr(0, clean.size() - 1);
        try {
            return std::stof(clean) * 0.01f;
        } catch (...) {
            return 0.0f;
        }
    }
    try {
        return std::stof(clean);
    } catch (...) {
        return 0.0f;
    }
}

CLIExecutionResult CLIGrammar::execute(const std::string& commandLine) {
    std::vector<std::string> tokens = tokenize(commandLine);
    if (tokens.empty()) {
        return {true, "", "{}"};
    }

    std::string verb = tokens[0];
    std::transform(verb.begin(), verb.end(), verb.begin(), ::tolower);

    if (verb == "add") {
        return handleAdd(tokens);
    }
    if (verb == "remove" || verb == "rm") {
        return handleRemove(tokens);
    }
    if (verb == "bypass") {
        return handleBypass(tokens);
    }
    if (verb == "set") {
        return handleSet(tokens);
    }
    if (verb == "get") {
        return handleGet(tokens);
    }
    if (verb == "react") {
        return handleReact(tokens);
    }
    if (verb == "duck") {
        return handleDuck(tokens);
    }
    if (verb == "list" || verb == "ls") {
        return handleList(tokens);
    }
    if (verb == "status") {
        return handleStatus(tokens);
    }
    if (verb == "clear") {
        return handleClear(tokens);
    }
    if (verb == "help") {
        std::string topic = (tokens.size() > 1) ? tokens[1] : "";
        return {true, getHelpText(topic), "{}"};
    }

    return {false, "Unknown command: '" + verb + "'. Type 'help' for usage.", "{}"};
}

CLIExecutionResult CLIGrammar::handleAdd(const std::vector<std::string>& tokens) {
    if (tokens.size() < 3) {
        return {false, "Usage: add pedal <type> [--name <id>] [params...] OR add sensor <id> [--type <lp|bp|hp>] [--freq <hz>]", "{}"};
    }

    std::string sub = tokens[1];
    std::transform(sub.begin(), sub.end(), sub.begin(), ::tolower);

    // 1. Add Sensory Channel (arbitrary detector)
    if (sub == "sensor" || sub == "detector") {
        std::string sensorId = tokens[2];
        auto flags = parseFlags(tokens, 3);

        SensoryChannelConfig cfg;
        cfg.id = sensorId;
        cfg.frequencyHz = flags.count("freq") ? parseValueWithUnit(flags["freq"]) : 1200.0f;
        cfg.q = flags.count("q") ? parseValueWithUnit(flags["q"]) : 1.0f;
        cfg.threshold = flags.count("thresh") ? parseValueWithUnit(flags["thresh"]) : 0.15f;

        std::string filterTypeStr = flags.count("type") ? flags["type"] : "bandpass";
        std::transform(filterTypeStr.begin(), filterTypeStr.end(), filterTypeStr.begin(), ::tolower);

        if (filterTypeStr == "lowpass" || filterTypeStr == "lp") {
            cfg.filterType = BiquadFilter::Type::LowPass;
        } else if (filterTypeStr == "highpass" || filterTypeStr == "hp") {
            cfg.filterType = BiquadFilter::Type::HighPass;
        } else if (filterTypeStr == "broadband") {
            cfg.filterType = BiquadFilter::Type::Broadband;
        } else {
            cfg.filterType = BiquadFilter::Type::BandPass;
        }

        bool ok = m_extractor.addSensor(cfg);
        if (!ok) {
            return {false, "Failed to add sensor: ID '" + sensorId + "' already exists.", "{}"};
        }
        std::ostringstream oss;
        oss << "Registered sensory detector [" << sensorId << "] (" << filterTypeStr << " @" << cfg.frequencyHz << "Hz, thresh=" << cfg.threshold << ").";
        return {true, oss.str(), "{\"action\":\"add_sensor\",\"id\":\"" + sensorId + "\"}"};
    }

    // 2. Add DSP Pedal
    if (sub != "pedal" && sub != "vst") {
        return {false, "Unknown add target: '" + sub + "'. Expected 'pedal', 'sensor', or 'vst'.", "{}"};
    }

    std::string type = tokens[2];
    std::transform(type.begin(), type.end(), type.begin(), ::tolower);

    auto flags = parseFlags(tokens, 3);
    std::string id = flags.count("name") ? flags["name"] : (type + "_" + std::to_string(m_rack.getNumNodes() + 1));

    bool added = m_rack.addPedalByType(type, id);
    if (!added) {
        return {false, "Failed to instantiate pedal: invalid type '" + type + "' or duplicate name '" + id + "'.", "{}"};
    }

    for (const auto& [param, valStr] : flags) {
        if (param != "name") {
            float val = parseValueWithUnit(valStr);
            m_rack.setParameter(id, param, val);
        }
    }

    std::ostringstream oss;
    oss << "Created pedal [" << id << "] (" << type << ") in active chain.";
    return {true, oss.str(), "{\"action\":\"add\",\"id\":\"" + id + "\",\"type\":\"" + type + "\"}"};
}

CLIExecutionResult CLIGrammar::handleRemove(const std::vector<std::string>& tokens) {
    if (tokens.size() < 2) {
        return {false, "Usage: remove <pedal_id> OR remove sensor <sensor_id>", "{}"};
    }

    if (tokens[1] == "sensor" && tokens.size() >= 3) {
        std::string sensorId = tokens[2];
        bool ok = m_extractor.removeSensor(sensorId);
        if (!ok) {
            return {false, "Sensor '" + sensorId + "' not found.", "{}"};
        }
        return {true, "Removed sensory detector [" + sensorId + "].", "{\"action\":\"remove_sensor\",\"id\":\"" + sensorId + "\"}"};
    }

    std::string id = tokens[1];
    bool removed = m_rack.removeNode(id);
    if (!removed) {
        return {false, "Pedal '" + id + "' not found.", "{}"};
    }
    return {true, "Removed pedal [" + id + "] from rack.", "{\"action\":\"remove\",\"id\":\"" + id + "\"}"};
}

CLIExecutionResult CLIGrammar::handleBypass(const std::vector<std::string>& tokens) {
    if (tokens.size() < 2) {
        return {false, "Usage: bypass <pedal_id> [--on | --off | --toggle]", "{}"};
    }
    std::string id = tokens[1];
    DSPNode* node = m_rack.getNode(id);
    if (!node) {
        return {false, "Pedal '" + id + "' not found.", "{}"};
    }

    auto flags = parseFlags(tokens, 2);
    bool newState = !node->isBypassed();
    if (flags.count("on")) newState = true;
    if (flags.count("off")) newState = false;

    m_rack.setBypassed(id, newState);
    return {true, "Pedal [" + id + "] bypass set to: " + (newState ? "ENABLED (bypassed)" : "DISABLED (active)"),
            "{\"action\":\"bypass\",\"id\":\"" + id + "\",\"bypassed\":" + (newState ? "true" : "false") + "}"};
}

CLIExecutionResult CLIGrammar::handleSet(const std::vector<std::string>& tokens) {
    if (tokens.size() < 3) {
        return {false, "Usage: set <pedal_id>.<param> <value>", "{}"};
    }
    std::string target = tokens[1];
    size_t dotPos = target.find('.');
    if (dotPos == std::string::npos) {
        return {false, "Invalid target '" + target + "'. Expected format: <pedal_id>.<param>", "{}"};
    }

    std::string id = target.substr(0, dotPos);
    std::string param = target.substr(dotPos + 1);
    float value = parseValueWithUnit(tokens[2]);

    bool ok = m_rack.setParameter(id, param, value);
    if (!ok) {
        return {false, "Failed to set " + id + "." + param + " to " + std::to_string(value) + " (unknown pedal or param).", "{}"};
    }

    std::ostringstream oss;
    oss << "Set [" << id << "." << param << "] = " << value;
    return {true, oss.str(), "{\"action\":\"set\",\"id\":\"" + id + "\",\"param\":\"" + param + "\",\"value\":" + std::to_string(value) + "}"};
}

CLIExecutionResult CLIGrammar::handleGet(const std::vector<std::string>& tokens) {
    if (tokens.size() < 2) {
        return {false, "Usage: get <pedal_id>.<param>", "{}"};
    }
    std::string target = tokens[1];
    size_t dotPos = target.find('.');
    if (dotPos == std::string::npos) {
        return {false, "Invalid target '" + target + "'. Expected format: <pedal_id>.<param>", "{}"};
    }
    std::string id = target.substr(0, dotPos);
    std::string param = target.substr(dotPos + 1);

    auto val = m_rack.getParameter(id, param);
    if (!val.has_value()) {
        return {false, "Param '" + param + "' on pedal '" + id + "' not found.", "{}"};
    }

    std::ostringstream oss;
    oss << "[" << id << "." << param << "] = " << val.value();
    return {true, oss.str(), "{\"id\":\"" + id + "\",\"param\":\"" + param + "\",\"value\":" + std::to_string(val.value()) + "}"};
}

CLIExecutionResult CLIGrammar::handleReact(const std::vector<std::string>& tokens) {
    // Syntax: react to <state_name> do <node>.<param> -> <val> [ramp <duration>]
    if (tokens.size() < 7 || tokens[1] != "to" || tokens[3] != "do") {
        return {false, "Usage: react to <state> do <node>.<param> -> <value> [ramp <duration>]", "{}"};
    }

    std::string stateStr = tokens[2];
    std::transform(stateStr.begin(), stateStr.end(), stateStr.begin(), ::tolower);

    std::string target = tokens[4];
    size_t dotPos = target.find('.');
    if (dotPos == std::string::npos) {
        return {false, "Invalid target '" + target + "'. Expected <node>.<param>", "{}"};
    }
    std::string nodeId = target.substr(0, dotPos);
    std::string param = target.substr(dotPos + 1);

    if (tokens[5] != "->") {
        return {false, "Expected '->' before value.", "{}"};
    }
    float targetVal = parseValueWithUnit(tokens[6]);

    ActionType action = ActionType::Snap;
    float duration = 0.0f;
    if (tokens.size() >= 9 && tokens[7] == "ramp") {
        action = ActionType::Ramp;
        duration = parseValueWithUnit(tokens[8]);
    }

    ReactiveRule rule;
    rule.id = "rule_" + stateStr + "_" + nodeId + "_" + param;
    rule.triggerType = "state";
    rule.triggerTarget = stateStr;
    rule.targetNodeId = nodeId;
    rule.targetParam = param;
    rule.actionType = action;
    rule.targetValue = targetVal;
    rule.durationSeconds = duration;
    rule.active = true;

    m_governor.addRule(rule);

    std::ostringstream oss;
    oss << "Created reactive rule: on state [" << stateStr << "] -> set " << nodeId << "." << param << " to " << targetVal;
    if (action == ActionType::Ramp) {
        oss << " (ramp " << duration << "s)";
    }
    return {true, oss.str(), "{\"action\":\"react\",\"ruleId\":\"" + rule.id + "\"}"};
}

CLIExecutionResult CLIGrammar::handleDuck(const std::vector<std::string>& tokens) {
    // Syntax: duck <node>.<param> by <sensor_id> [amt <depthDb>] [release <duration>]
    // Works with ANY arbitrary sensory channel: kick, snare, hats, vocal, bass, perc, etc.
    if (tokens.size() < 4 || tokens[2] != "by") {
        return {false, "Usage: duck <node>.<param> by <sensor_id> [amt <dB>] [release <duration>]", "{}"};
    }

    std::string target = tokens[1];
    std::string nodeId = target;
    std::string param = "gain";
    size_t dotPos = target.find('.');
    if (dotPos != std::string::npos) {
        nodeId = target.substr(0, dotPos);
        param = target.substr(dotPos + 1);
    }

    std::string sensorId = tokens[3];
    std::transform(sensorId.begin(), sensorId.end(), sensorId.begin(), ::tolower);

    float amt = 12.0f;
    float duration = 0.080f;

    for (size_t i = 4; i < tokens.size(); ++i) {
        if (tokens[i] == "amt" && i + 1 < tokens.size()) {
            amt = parseValueWithUnit(tokens[++i]);
        } else if (tokens[i] == "release" && i + 1 < tokens.size()) {
            duration = parseValueWithUnit(tokens[++i]);
            if (duration > 2.0f) duration *= 0.001f;
        }
    }

    ReactiveRule rule;
    rule.id = "duck_" + nodeId + "_" + param + "_by_" + sensorId;
    rule.triggerType = "sensor";
    rule.triggerTarget = sensorId;
    rule.targetNodeId = nodeId;
    rule.targetParam = param;
    rule.actionType = ActionType::Duck;
    rule.depthDb = amt;
    rule.durationSeconds = duration;
    rule.active = true;

    m_governor.addRule(rule);

    std::ostringstream oss;
    oss << "Created ducking rule: duck " << nodeId << "." << param << " by sensor [" << sensorId << "] -" << amt << "dB (release " << (duration * 1000.0f) << "ms)";
    return {true, oss.str(), "{\"action\":\"duck\",\"ruleId\":\"" + rule.id + "\"}"};
}

CLIExecutionResult CLIGrammar::handleList(const std::vector<std::string>& tokens) {
    std::string target = (tokens.size() > 1) ? tokens[1] : "pedals";
    std::transform(target.begin(), target.end(), target.begin(), ::tolower);

    std::ostringstream oss;
    if (target == "pedals" || target == "rack") {
        auto pedals = m_rack.getRackInfo();
        if (pedals.empty()) {
            return {true, "Rack is currently empty. Use 'add pedal <type>' to create pedals.", "[]"};
        }
        oss << "Active Pedal Chain (" << pedals.size() << " pedals):\n";
        for (size_t i = 0; i < pedals.size(); ++i) {
            const auto& p = pedals[i];
            oss << "  [" << (i + 1) << "] " << p.id << " (" << p.type << ")"
                << (p.bypassed ? " [BYPASSED]" : " [ACTIVE]") << "\n";
            for (const auto& [param, val] : p.parameters) {
                oss << "      • " << param << " = " << val << "\n";
            }
        }
        return {true, oss.str(), "{}"};
    }

    if (target == "sensors" || target == "detectors") {
        auto ids = m_extractor.getSensorIds();
        oss << "Active Sensory Detectors (" << ids.size() << " channels):\n";
        for (const auto& id : ids) {
            if (const auto* s = m_extractor.getSensor(id)) {
                oss << "  • [" << id << "] "
                    << "@" << s->getConfig().frequencyHz << "Hz (thresh=" << s->getConfig().threshold
                    << ") | Energy: " << std::fixed << std::setprecision(3) << s->getEnergy()
                    << " | Hits: " << s->getTotalHits() << "\n";
            }
        }
        return {true, oss.str(), "{}"};
    }

    if (target == "rules") {
        auto rules = m_governor.getRules();
        if (rules.empty()) {
            return {true, "No active reactive rules.", "[]"};
        }
        oss << "Active Reactive Rules (" << rules.size() << "):\n";
        for (const auto& r : rules) {
            oss << "  • " << r.id << ": " << r.triggerType << "(" << r.triggerTarget << ")"
                << " -> " << r.targetNodeId << "." << r.targetParam;
            if (r.actionType == ActionType::Ramp) {
                oss << " ramp to " << r.targetValue << " (" << r.durationSeconds << "s)";
            } else if (r.actionType == ActionType::Duck) {
                oss << " duck -" << r.depthDb << "dB (release " << (r.durationSeconds * 1000.0f) << "ms)";
            } else {
                oss << " snap to " << r.targetValue;
            }
            oss << "\n";
        }
        return {true, oss.str(), "{}"};
    }

    return {false, "Unknown list target '" + target + "'. Options: pedals, sensors, rules.", "{}"};
}

CLIExecutionResult CLIGrammar::handleStatus(const std::vector<std::string>& /*tokens*/) {
    auto tele = m_extractor.getTelemetry();
    std::ostringstream oss;
    oss << "=== johnwalls.studio Telemetry ===\n"
        << "  Musical State:    " << musicalStateToString(tele.currentState) << "\n"
        << "  Sidechain RMS:    " << std::fixed << std::setprecision(4) << tele.sidechainRMS << "\n"
        << "  Sensory Channels: " << tele.channels.size() << " active\n";
    for (const auto& ch : tele.channels) {
        oss << "    [" << ch.id << "] hits: " << ch.totalHits << ", density: "
            << std::setprecision(2) << ch.densityPerBar << " hits/bar\n";
    }
    oss << "  Active Pedals:    " << m_rack.getNumNodes() << "\n"
        << "  Active Rules:     " << m_governor.getRules().size();
    return {true, oss.str(), "{}"};
}

CLIExecutionResult CLIGrammar::handleClear(const std::vector<std::string>& tokens) {
    std::string target = (tokens.size() > 1) ? tokens[1] : "all";
    std::transform(target.begin(), target.end(), target.begin(), ::tolower);

    if (target == "pedals" || target == "rack") {
        m_rack.clear();
        return {true, "Cleared all pedals from rack.", "{}"};
    }
    if (target == "rules") {
        m_governor.clearRules();
        return {true, "Cleared all reactive rules.", "{}"};
    }
    if (target == "all") {
        m_rack.clear();
        m_governor.clearRules();
        return {true, "Reset entire rack and reactive rules.", "{}"};
    }
    return {false, "Unknown clear target '" + target + "'. Options: rack, rules, all.", "{}"};
}

std::vector<std::string> CLIGrammar::getAutocompleteSuggestions(const std::string& prefix) const {
    const std::vector<std::string> candidates = {
        "add pedal delay --name dub_echo --time 350ms --fb 45%",
        "add pedal filter --name resonant_sweep --cutoff 1400Hz --res 0.65",
        "add pedal drive --name warm_overdrive --drive 4.0 --tone 0.70",
        "add pedal ducker --name sidechain_pumper --depth 18dB",
        "add pedal mesa --name mesa_boogie --channel 2 --gain 7.5 --eq750 -4.5",
        "add pedal vox --name vox_ac30 --channel 1 --gain 6.0 --cut 4.0",
        "add sensor hats --type highpass --freq 6500Hz --thresh 0.08",
        "add sensor vocal --type bandpass --freq 2500Hz --thresh 0.12",
        "add sensor bass --type lowpass --freq 200Hz --thresh 0.15",
        "react to breakdown do dub_echo.feedback -> 0.70 ramp 2s",
        "react to drop do mesa_boogie.channel -> 2 snap",
        "duck dub_echo.mix by kick amt 14dB release 80ms",
        "duck dub_echo.mix by hats amt 8dB release 40ms",
        "duck dub_echo.mix by vocal amt 16dB release 120ms",
        "list pedals",
        "list sensors",
        "list rules",
        "status",
        "help"
    };

    std::vector<std::string> matches;
    for (const auto& c : candidates) {
        if (c.rfind(prefix, 0) == 0) {
            matches.push_back(c);
        }
    }
    return matches;
}

std::string CLIGrammar::getHelpText(const std::string& topic) const {
    if (topic == "sensor") {
        return "add sensor <id> [--type <lowpass|bandpass|highpass|broadband>] [--freq <hz>] [--q <val>] [--thresh <val>]\n"
               "Example: add sensor hats --type highpass --freq 6500Hz --thresh 0.08\n"
               "Example: add sensor vocal --type bandpass --freq 2500Hz --thresh 0.12";
    }
    if (topic == "react") {
        return "react to <state> do <pedal_id>.<param> -> <val> [ramp <duration>]\n"
               "Example: react to breakdown do dub_echo.feedback -> 0.75 ramp 2s";
    }
    if (topic == "duck") {
        return "duck <pedal_id>.<param> by <sensor_id> [amt <dB>] [release <duration>]\n"
               "Works with ANY sensory detector (kick, snare, hats, vocal, bass, custom).\n"
               "Example: duck delay.mix by vocal amt 16dB release 100ms";
    }
    return "johnwalls.studio Virtual CLI Commands:\n"
           "  add pedal <type> [--name <id>] [params...]   Add DSP stompbox (delay, filter, drive, ducker)\n"
           "  add sensor <id> [flags...]                   Add arbitrary acoustic sensory detector\n"
           "  remove <id>                                  Remove a pedal or sensor\n"
           "  bypass <id> [--on | --off | --toggle]        Bypass or activate a pedal\n"
           "  set <id>.<param> <value>                     Set parameter value\n"
           "  get <id>.<param>                             Read parameter value\n"
           "  react to <state> do <id>.<param> -> <val>    Create reactive rule on musical state transition\n"
           "  duck <id>.<param> by <sensor> [amt] [rel]    Duck parameter by ANY sensory detector (kick, hats, vocal, etc.)\n"
           "  list [pedals|sensors|rules]                  List rack, sensors, or active rules\n"
           "  status                                       View real-time telemetry across all sensory channels\n"
           "  clear [rack|rules|all]                       Clear rack or rules";
}

} // namespace johnwalls::johnwalls
