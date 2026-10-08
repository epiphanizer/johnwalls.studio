#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <string>
#include <vector>
#include <array>
#include <atomic>
#include <bitset>
#include <mutex>
#include <algorithm>
#include "GlobalSessionHub.h"

namespace johnwalls::johnwalls {

struct ReactiveMidiRule {
    std::string id;
    std::string name;
    bool enabled{true};
    std::string sourceTrackFilter{"bass"}; // "all"/"any" (any OTHER track), "self", or a track-name substring
    std::string targetTrackFilter;         // optional: only transform on tracks whose name contains this
    std::string triggerRhythm{"1/4"};     // "1/4", "1/16", "1/8", "triplet", "half", "syncopated", "idle", "any"
    std::string actionType{"arp_1_16"};   // "arp_1_16", "arp_1_8", "stabs_1_4", "sustained", "ratchet_4x", "transpose_12", "harmony_5th", "mute"
    float param{1.0f};                    // semitone count for "sustained"
    std::string scOscAddress{"/state/rhythm"}; // OSC address note events are forwarded to while the rule is active
};

struct RhythmAnalysisResult {
    std::string pattern{"idle"}; // "1/4", "1/8", "1/16", "1/32", "triplet", "half", "syncopated", "idle"
    float noteDensity{0.0f};     // notes per second
    float avgIntervalBeats{0.0f};
    int dominantRegister{2};     // 0: Bass (<48), 1: Low-Mid (48-60), 2: Mid (60-72), 3: High (>72)
    int activeHeldNotes{0};
};

/** Audio-thread-safe rhythm detector: fixed storage, no allocation after construction. */
class MidiRhythmDetector {
public:
    MidiRhythmDetector() { m_heldNotes.reserve(128); }

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
    std::array<NoteStep, MAX_STEPS> m_steps{};
    size_t m_numSteps{0};
    std::vector<int> m_heldNotes;
    double m_lastNoteOnTimeMs{0.0};
    double m_lastNoteOnPpq{0.0};
    const char* m_lastClassifiedPattern{"idle"};
};

/**
 * Per-plugin-instance reactive MIDI processor.
 *
 * - The rule set and enable flag are process-wide (shared by every instance, edited from any UI).
 * - Rhythm detection and MIDI transformation state are per instance.
 * - Rule matching against the other tracks runs OFF the audio thread (evaluateRules) and is
 *   published to the audio thread through a spin-lock-protected POD snapshot.
 */
class ReactiveMidiEngine {
public:
    ReactiveMidiEngine();

    //== Shared rule set (thread-safe, non-realtime) ==
    static bool isEnabled();
    static void setEnabled(bool enabled);
    static void setRules(const std::vector<ReactiveMidiRule>& rules);
    static std::vector<ReactiveMidiRule> getRules();
    static juce::var getRulesAsVar();
    static juce::String getRulesJson();
    static void addRule(const ReactiveMidiRule& rule);
    static void removeRule(const std::string& ruleId);
    static void toggleRule(const std::string& ruleId);

    //== Per instance ==
    void setInstanceHash(int hash) { m_instanceHash = hash; }
    void reset();

    std::string getLastActiveRule() const;
    RhythmAnalysisResult getCurrentRhythm() const;
    std::vector<int> getHeldNotes() const;

    /** Non-realtime: decide which shared rule (if any) applies to this instance right now. */
    void evaluateRules(const std::vector<TrackInstanceInfo>& sessionTracks,
                       const std::string& myInstanceId,
                       const std::string& myTrackName);

    /** Realtime: detect rhythm, apply the active rule's transformation to the MIDI buffer in place.
        Never allocates, locks or blocks. */
    void processMidi(juce::MidiBuffer& midiMessages, double currentPpq, double bpm,
                     double sampleRate, int numSamples);

private:
    struct RhythmSnapshot {
        char pattern[16]{};
        float noteDensity{0.0f};
        float avgIntervalBeats{0.0f};
        int dominantRegister{2};
        int numHeld{0};
        uint8_t held[16]{};
    };
    struct ActiveRule {
        bool valid{false};
        char name[64]{};
        char action[24]{};
        char osc[48]{};
        float param{1.0f};
    };
    struct Pending {
        bool used{false};
        bool on{false};
        int channel{1};
        int note{0};
        int velocity{0};
        int64_t remaining{0};
    };

    void emitNoteOn(juce::MidiBuffer& out, int channel, int note, int velocity, int pos);
    void emitNoteOff(juce::MidiBuffer& out, int channel, int note, int pos);
    void scheduleEvent(juce::MidiBuffer& out, bool on, int channel, int note, int velocity,
                       int64_t absolutePos, int numSamples);
    void releaseAllSounding(juce::MidiBuffer& out);
    void emitDuePending(juce::MidiBuffer& out, int numSamples);
    void trackPassthrough(const juce::MidiBuffer& midi);

    MidiRhythmDetector m_detector;
    int m_instanceHash{0};

    // Snapshots exchanged between threads
    mutable juce::SpinLock m_snapshotLock;
    RhythmSnapshot m_snapshot;
    mutable juce::SpinLock m_ruleLock;
    ActiveRule m_published;       // written by evaluateRules()
    ActiveRule m_audioRule;       // audio-thread copy

    // Audio-thread-only state
    bool m_hadRule{false};
    char m_activeAction[24]{};
    juce::MidiBuffer m_scratch;
    std::array<Pending, 128> m_pending{};
    size_t m_numPending{0};
    std::array<std::bitset<128>, 17> m_sounding{}; // index = MIDI channel 1..16

    // Arpeggiator state
    int m_arpIndex{0};
    double m_lastArpPpq{-1.0};
    int m_lastEmittedNote{-1};
    int m_lastEmittedChannel{1};
};

} // namespace johnwalls::johnwalls
