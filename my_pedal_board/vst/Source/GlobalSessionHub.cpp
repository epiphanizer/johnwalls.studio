#include "GlobalSessionHub.h"

namespace johnwalls::pedalboard {

void GlobalSessionHub::registerOrUpdate(const TrackInstanceInfo& info) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_tracks[info.instanceId] = info;

    // Prune stale instances older than 15 seconds
    const auto now = juce::Time::currentTimeMillis();
    for (auto it = m_tracks.begin(); it != m_tracks.end(); ) {
        if (now - it->second.lastHeartbeatMs > 15000 && it->first != info.instanceId) {
            it = m_tracks.erase(it);
        } else {
            ++it;
        }
    }
}

void GlobalSessionHub::unregister(const std::string& instanceId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_tracks.erase(instanceId);
}

std::vector<TrackInstanceInfo> GlobalSessionHub::getAllTracks() {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<TrackInstanceInfo> result;
    result.reserve(m_tracks.size());
    for (const auto& pair : m_tracks) {
        result.push_back(pair.second);
    }
    return result;
}

juce::var GlobalSessionHub::getTracksAsVar() {
    std::lock_guard<std::mutex> lock(m_mutex);
    juce::Array<juce::var> array;

    for (const auto& pair : m_tracks) {
        const auto& t = pair.second;
        auto* obj = new juce::DynamicObject();
        obj->setProperty("instanceId", juce::String(t.instanceId));
        obj->setProperty("trackName", juce::String(t.trackName));
        obj->setProperty("trackIndex", t.trackIndex);
        obj->setProperty("trackType", juce::String(t.trackType));
        obj->setProperty("midiChannel", t.midiChannel);
        obj->setProperty("isMidiActive", t.isMidiActive);
        obj->setProperty("lastNoteNumber", t.lastNoteNumber);
        obj->setProperty("lastVelocity", t.lastVelocity);
        obj->setProperty("totalMidiEvents", t.totalMidiEvents);

        juce::Array<juce::var> heldNotesArray;
        for (int note : t.heldNotes) {
            heldNotesArray.add(note);
        }
        obj->setProperty("heldNotes", heldNotesArray);

        obj->setProperty("peakDb", t.peakDb);
        obj->setProperty("rmsDb", t.rmsDb);
        obj->setProperty("isArmed", t.isArmed);
        obj->setProperty("rhythmPattern", juce::String(t.rhythmPattern));
        obj->setProperty("noteDensity", t.noteDensity);
        obj->setProperty("avgIntervalBeats", t.avgIntervalBeats);
        obj->setProperty("dominantRegister", t.dominantRegister);
        obj->setProperty("activeReactiveRule", juce::String(t.activeReactiveRule));
        obj->setProperty("lastHeartbeatMs", static_cast<double>(t.lastHeartbeatMs));

        array.add(juce::var(obj));
    }

    return juce::var(array);
}

juce::String GlobalSessionHub::getTracksJson() {
    return juce::JSON::toString(getTracksAsVar());
}

} // namespace johnwalls::pedalboard
