#pragma once

#include "pedalboard/pedal_rack.hpp"
#include "pedalboard/state_governor.hpp"
#include "pedalboard/feature_extractor.hpp"
#include <string>
#include <vector>
#include <unordered_map>

namespace johnwalls::pedalboard {

struct CLIExecutionResult {
    bool success{false};
    std::string message;
    std::string jsonPayload;
};

/**
 * Unix/Flag style virtual command line parser and execution engine for johnwalls.studio.
 */
class CLIGrammar {
public:
    CLIGrammar(PedalRack& rack, StateGovernor& governor, FeatureExtractor& extractor);

    /**
     * Parse and execute a command string (e.g. "add pedal delay --name dub_echo --time 350 --fb 0.45").
     */
    CLIExecutionResult execute(const std::string& commandLine);

    /**
     * Generate interactive autocomplete suggestions for a given input prefix.
     */
    [[nodiscard]] std::vector<std::string> getAutocompleteSuggestions(const std::string& prefix) const;

    [[nodiscard]] std::string getHelpText(const std::string& topic = "") const;

private:
    PedalRack& m_rack;
    StateGovernor& m_governor;
    FeatureExtractor& m_extractor;

    // Command dispatchers
    CLIExecutionResult handleAdd(const std::vector<std::string>& tokens);
    CLIExecutionResult handleRemove(const std::vector<std::string>& tokens);
    CLIExecutionResult handleBypass(const std::vector<std::string>& tokens);
    CLIExecutionResult handleSet(const std::vector<std::string>& tokens);
    CLIExecutionResult handleGet(const std::vector<std::string>& tokens);
    CLIExecutionResult handleReact(const std::vector<std::string>& tokens);
    CLIExecutionResult handleDuck(const std::vector<std::string>& tokens);
    CLIExecutionResult handleList(const std::vector<std::string>& tokens);
    CLIExecutionResult handleStatus(const std::vector<std::string>& tokens);
    CLIExecutionResult handleClear(const std::vector<std::string>& tokens);

    // Helpers
    static std::vector<std::string> tokenize(const std::string& input);
    static std::unordered_map<std::string, std::string> parseFlags(const std::vector<std::string>& tokens, size_t startIndex);
    static float parseValueWithUnit(const std::string& str);
};

} // namespace johnwalls::pedalboard
