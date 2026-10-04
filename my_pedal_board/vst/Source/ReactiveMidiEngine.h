#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <string>
#include <vector>
#include <array>
#include <atomic>
#include <mutex>
#include <deque>
#include <algorithm>
#include "GlobalSessionHub.h"

namespace johnwalls::pedalboard {

struct ReactiveMidiRule {
    std::string id;
    std::string name;
    bool enabled{true};
    std::string sourceTrackFilter{"bass"}; // "all", "bass", or specific substring match
    std::string triggerRhythm{"1/4"};     // "1/4", "1/16", "1/8", "triplet", "half", "syncopated", "idle", "any"
    std::string actionType{"arp_1_16"};   // "arp_1_16", "stabs_1_4", "arp_1_8", "sustained", "ratchet_4x", "transpose_12", "harmony_5th", "mute"
    float param{1.0f};                    // multiplier or semitone count
    std::string scOscAddress{"/state/rhythm"};
};

struct RhythmAnalysisResult {
    std::string pattern{"idle"}; // "1/4", "1/8", "1/16", "1/32", "triplet", "half", "syncopated", "idle"
    float noteDensity{0.0f};     // notes per second
    float avgIntervalBeats{0.0f};
    int dominantRegister{2};     // 0: Bass (<48), 1: Low-Mid (48-60), 2: Mid (60-72), 3: High (>72)
    int activeHeldNotes{0};
};

class MidiRhythmDetector {
public:
    MidiRhythmDetector() = default;

    void reset();
    void recordNoteOn(double ppq, int noteNumber, int velocity, double timeMs);
    void recordNoteOff(int noteNumber);
    RhythmAnalysisResult analyze(double currentPpq, double timeMs);

    const std::vector<int>& getHeldNotes() const { return m_heldNotes; }

private:
    struct NoteStep {
        double ppq{0.0};
        int noteNumber{60};
        int velocity{100};
        double timeMs{0.0};
    };

    static constexpr size_t MAX_STEPS = 16;
    std::deque<NoteStep> m_recentSteps;
    std::vector<int> m_heldNotes;
    double m_lastNoteOnTimeMs{0.0};
    double m_lastNoteOnPpq{0.0};
    std::string m_lastClassifiedPattern{"idle"};
};

class ReactiveMidiEngine {
public:
    static ReactiveMidiEngine& getInstance() {
        static ReactiveMidiEngine s_instance;
        return s_instance;
    }

    bool isEnabled() const { return m_enabled.load(std::memory_order_relaxed); }
    void setEnabled(bool enabled) { m_enabled.store(enabled, std::memory_order_relaxed); }

    void setRules(const std::vector<ReactiveMidiRule>& rules);
    std::vector<ReactiveMidiRule> getRules();
    juce::var getRulesAsVar();
    juce::String getRulesJson();

    void addRule(const ReactiveMidiRule& rule);
    void removeRule(const std::string& ruleId);
    void toggleRule(const std::string& ruleId);

    std::string getLastActiveRule() const;
    RhythmAnalysisResult getCurrentRhythm() const;

    /**
     * Real-time sample-accurate MIDI processing.
     * Evaluates incoming MIDI, detects rhythm pattern, evaluates cross-track reactive rules,
     * and transforms outgoing MIDI buffer accordingly.
     */
    void processMidi(
        juce::MidiBuffer& midiMessages,
        double currentPpq,
        double bpm,
        double sampleRate,
        int numSamples,
        const std::vector<TrackInstanceInfo>& sessionTracks,
        const std::string& currentTrackName = "Track"
    );

private:
    ReactiveMidiEngine();
    ~ReactiveMidiEngine() = default;
    ReactiveMidiEngine(const ReactiveMidiEngine&) = delete;
    ReactiveMidiEngine& operator=(const ReactiveMidiEngine&) = delete;

    void populateDefaultRules();

    std::atomic<bool> m_enabled{true};
    std::mutex m_rulesMutex;
    std::vector<ReactiveMidiRule> m_rules;

    MidiRhythmDetector m_detector;
    std::string m_lastActiveRule;
    RhythmAnalysisResult m_currentRhythm;

    // Arpeggiator state
    int m_arpIndex{0};
    double m_lastArpPpq{-1.0};
    int m_lastEmittedNote{-1};
    int m_lastEmittedChannel{1};
};

} // namespace johnwalls::pedalboard
