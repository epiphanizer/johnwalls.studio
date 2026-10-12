#pragma once

#include <juce_core/juce_core.h>
#include "AudioTakeRecorder.h"
#include <string>
#include <vector>
#include <mutex>
#include <unordered_map>
#include <cstdint>

namespace johnwalls::johnwalls {

struct TrackInstanceInfo {
    std::string instanceId;
    std::string trackName{"Track"};
    int trackIndex{1};
    std::string trackType{"midi"}; // "midi", "audio", "instrument", "master"
    int midiChannel{1};
    bool isMidiActive{false};
    int lastNoteNumber{0};
    int lastVelocity{0};
    int totalMidiEvents{0};
    std::vector<int> heldNotes;
    float peakDb{-96.0f};
    float rmsDb{-96.0f};
    bool isArmed{false};
    std::string rhythmPattern{"idle"}; // "1/4", "1/8", "1/16", "1/32", "triplet", "half", "syncopated", "idle"
    float noteDensity{0.0f};          // notes per second
    float avgIntervalBeats{0.0f};     // average inter-onset interval in beats
    int dominantRegister{2};          // 0: Sub/Bass (<48), 1: Low-Mid (48-60), 2: Mid (60-72), 3: High (>72)
    std::string activeReactiveRule;   // Currently firing reactive rule name
    int64_t lastHeartbeatMs{0};
};

struct InstanceRecorderEntry {
    std::string instanceId;
    std::string trackName;
    AudioTakeRecorder* recorder{nullptr};
};

/**
 * Thread-safe global session registry shared across all plugin instances in the DAW process.
 * Enables live telemetry, cross-track communication, and multi-track audio take recording.
 */
class GlobalSessionHub {
public:
    static GlobalSessionHub& getInstance() {
        static GlobalSessionHub s_instance;
        return s_instance;
    }

    void registerOrUpdate(const TrackInstanceInfo& info);
    void unregister(const std::string& instanceId);
    std::vector<TrackInstanceInfo> getAllTracks();
    juce::var getTracksAsVar();
    juce::String getTracksJson();

    // Multi-track audio take recording coordination
    void registerRecorder(const std::string& instanceId, const std::string& trackName, AudioTakeRecorder* recorder);
    void updateRecorderTrackName(const std::string& instanceId, const std::string& trackName);
    void unregisterRecorder(const std::string& instanceId);

    bool startRecordingTake(const juce::String& trackNameQuery,
                            const juce::String& projectName,
                            double bpm,
                            juce::String& outResolvedTrack,
                            juce::String& outError);

    juce::var stopRecordingTake();
    juce::var getTakeStatus(const AudioTakeRecorder* fallback = nullptr);
    bool isRecordingTake() const;

    void setAutoRecTakeEnabled(bool enabled);
    bool isAutoRecTakeEnabled() const;

private:
    GlobalSessionHub() = default;
    ~GlobalSessionHub() = default;
    GlobalSessionHub(const GlobalSessionHub&) = delete;
    GlobalSessionHub& operator=(const GlobalSessionHub&) = delete;

    mutable std::mutex m_mutex;
    std::unordered_map<std::string, TrackInstanceInfo> m_tracks;
    std::unordered_map<std::string, InstanceRecorderEntry> m_recorders;
    AudioTakeRecorder* m_activeRecorder{nullptr};
    std::string m_activeRecorderInstanceId;
    std::string m_activeRecordingTrackName;
};

} // namespace johnwalls::johnwalls
