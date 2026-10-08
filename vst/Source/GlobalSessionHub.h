#pragma once

#include <juce_core/juce_core.h>
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

/**
 * Thread-safe global session registry shared across all plugin instances in the DAW process.
 * Enables live telemetry and cross-track communication.
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

private:
    GlobalSessionHub() = default;
    ~GlobalSessionHub() = default;
    GlobalSessionHub(const GlobalSessionHub&) = delete;
    GlobalSessionHub& operator=(const GlobalSessionHub&) = delete;

    std::mutex m_mutex;
    std::unordered_map<std::string, TrackInstanceInfo> m_tracks;
};

} // namespace johnwalls::johnwalls
