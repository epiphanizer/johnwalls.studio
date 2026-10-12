#include "GlobalSessionHub.h"

namespace johnwalls::johnwalls {

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

void GlobalSessionHub::registerRecorder(const std::string& instanceId, const std::string& trackName, AudioTakeRecorder* recorder) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_recorders[instanceId] = { instanceId, trackName, recorder };
}

void GlobalSessionHub::updateRecorderTrackName(const std::string& instanceId, const std::string& trackName) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_recorders.find(instanceId);
    if (it != m_recorders.end()) {
        it->second.trackName = trackName;
    }
}

void GlobalSessionHub::unregisterRecorder(const std::string& instanceId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_activeRecorderInstanceId == instanceId) {
        if (m_activeRecorder != nullptr && m_activeRecorder->isRecording()) {
            m_activeRecorder->stopRecording();
        }
        m_activeRecorder = nullptr;
        m_activeRecorderInstanceId.clear();
        m_activeRecordingTrackName.clear();
    }
    m_recorders.erase(instanceId);
}

bool GlobalSessionHub::startRecordingTake(const juce::String& trackNameQuery,
                                        const juce::String& projectName,
                                        double bpm,
                                        juce::String& outResolvedTrack,
                                        juce::String& outError) {
    std::lock_guard<std::mutex> lock(m_mutex);

    // If currently recording, stop existing take first
    if (m_activeRecorder != nullptr && m_activeRecorder->isRecording()) {
        m_activeRecorder->stopRecording();
        m_activeRecorder = nullptr;
        m_activeRecorderInstanceId.clear();
        m_activeRecordingTrackName.clear();
    }

    if (m_recorders.empty()) {
        outError = "No plugin instances registered in session hub";
        return false;
    }

    juce::String cleanQuery = trackNameQuery.trim();
    AudioTakeRecorder* targetRecorder = nullptr;
    std::string targetInstanceId;
    std::string targetTrackName;

    auto normalizeStr = [](const juce::String& s) -> juce::String {
        juce::String norm;
        for (auto c : s.toLowerCase()) {
            if (juce::CharacterFunctions::isLetterOrDigit(c)) norm += c;
        }
        return norm;
    };

    juce::String normQuery = normalizeStr(cleanQuery);
    const bool isMasterQuery = cleanQuery.isEmpty() ||
                               cleanQuery.equalsIgnoreCase("Master") ||
                               cleanQuery.equalsIgnoreCase("Main") ||
                               cleanQuery.equalsIgnoreCase("Master Track");

    if (!isMasterQuery) {
        // 1. Exact match (case-insensitive)
        for (const auto& pair : m_recorders) {
            if (pair.second.recorder != nullptr &&
                juce::String(pair.second.trackName).equalsIgnoreCase(cleanQuery)) {
                targetRecorder = pair.second.recorder;
                targetInstanceId = pair.first;
                targetTrackName = pair.second.trackName;
                break;
            }
        }

        // 2. Substring or normalized match (e.g. "Childhood Piano" matches "1-Childhood Home Piano")
        if (targetRecorder == nullptr) {
            for (const auto& pair : m_recorders) {
                if (pair.second.recorder == nullptr) continue;
                juce::String tName = juce::String(pair.second.trackName);
                juce::String normT = normalizeStr(tName);
                if (normT.contains(normQuery) || normQuery.contains(normT) ||
                    tName.containsIgnoreCase(cleanQuery) || cleanQuery.containsIgnoreCase(tName)) {
                    targetRecorder = pair.second.recorder;
                    targetInstanceId = pair.first;
                    targetTrackName = pair.second.trackName;
                    break;
                }
            }
        }
    }

    // If query is Master or no specific track matched:
    if (targetRecorder == nullptr) {
        // Look for Master track instance
        for (const auto& pair : m_recorders) {
            if (pair.second.recorder == nullptr) continue;
            juce::String tName = juce::String(pair.second.trackName);
            if (tName.equalsIgnoreCase("Master") || tName.containsIgnoreCase("Master") || tName.equalsIgnoreCase("Main")) {
                targetRecorder = pair.second.recorder;
                targetInstanceId = pair.first;
                targetTrackName = pair.second.trackName;
                break;
            }
        }
    }

    // Fallback: pick first available recorder
    if (targetRecorder == nullptr && !m_recorders.empty()) {
        auto firstIt = m_recorders.begin();
        targetRecorder = firstIt->second.recorder;
        targetInstanceId = firstIt->first;
        targetTrackName = firstIt->second.trackName;
    }

    if (targetRecorder == nullptr) {
        outError = "Could not find a valid audio recorder instance";
        return false;
    }

    juce::String recTrackName = targetTrackName.empty() ? cleanQuery : juce::String(targetTrackName);
    bool started = targetRecorder->startRecording(recTrackName, projectName, bpm);
    if (!started) {
        outError = "Failed to start audio recorder on track: " + recTrackName;
        return false;
    }

    m_activeRecorder = targetRecorder;
    m_activeRecorderInstanceId = targetInstanceId;
    m_activeRecordingTrackName = recTrackName.toStdString();
    outResolvedTrack = recTrackName;
    return true;
}

juce::var GlobalSessionHub::stopRecordingTake() {
    std::lock_guard<std::mutex> lock(m_mutex);

    juce::var result;
    if (m_activeRecorder != nullptr) {
        result = m_activeRecorder->stopRecording();
        m_activeRecorder = nullptr;
        m_activeRecorderInstanceId.clear();
        m_activeRecordingTrackName.clear();
        return result;
    }

    // Check if any recorder is recording
    for (auto& pair : m_recorders) {
        if (pair.second.recorder != nullptr && pair.second.recorder->isRecording()) {
            result = pair.second.recorder->stopRecording();
            return result;
        }
    }

    return juce::var();
}

juce::var GlobalSessionHub::getTakeStatus(const AudioTakeRecorder* fallback) {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (m_activeRecorder != nullptr) {
        return m_activeRecorder->getStatus();
    }

    for (const auto& pair : m_recorders) {
        if (pair.second.recorder != nullptr && pair.second.recorder->isRecording()) {
            return pair.second.recorder->getStatus();
        }
    }

    if (fallback != nullptr) {
        return fallback->getStatus();
    }

    if (!m_recorders.empty()) {
        auto it = m_recorders.begin();
        if (it->second.recorder != nullptr) {
            return it->second.recorder->getStatus();
        }
    }

    juce::DynamicObject::Ptr st = new juce::DynamicObject();
    st->setProperty("isRecording", false);
    st->setProperty("autoRecEnabled", false);
    st->setProperty("samplesRecorded", 0);
    st->setProperty("durationSeconds", 0.0);
    st->setProperty("peakDb", -96.0);
    st->setProperty("rmsDb", -96.0);
    st->setProperty("sampleRate", 48000.0);
    st->setProperty("currentTrackName", "");
    st->setProperty("currentTakeId", "");
    return juce::var(st.get());
}

bool GlobalSessionHub::isRecordingTake() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_activeRecorder != nullptr && m_activeRecorder->isRecording()) {
        return true;
    }
    for (const auto& pair : m_recorders) {
        if (pair.second.recorder != nullptr && pair.second.recorder->isRecording()) {
            return true;
        }
    }
    return false;
}

void GlobalSessionHub::setAutoRecTakeEnabled(bool enabled) {
    std::lock_guard<std::mutex> lock(m_mutex);
    for (auto& pair : m_recorders) {
        if (pair.second.recorder != nullptr) {
            pair.second.recorder->setAutoRecEnabled(enabled);
        }
    }
}

bool GlobalSessionHub::isAutoRecTakeEnabled() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    for (const auto& pair : m_recorders) {
        if (pair.second.recorder != nullptr && pair.second.recorder->isAutoRecEnabled()) {
            return true;
        }
    }
    return false;
}

} // namespace johnwalls::johnwalls
