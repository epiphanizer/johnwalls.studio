#include "AudioTakeRecorder.h"

#include <cmath>
#include <iomanip>
#include <sstream>

namespace johnwalls::johnwalls {

AudioTakeRecorder::AudioTakeRecorder() {
    m_thread.startThread(juce::Thread::Priority::normal);
    ensureTakesDirectory();
}

AudioTakeRecorder::~AudioTakeRecorder() {
    if (m_isRecording.load()) {
        stopRecording();
    }
    m_thread.stopThread(2000);
}

void AudioTakeRecorder::prepare(double sampleRate, int /*samplesPerBlock*/) {
    m_sampleRate.store(sampleRate > 0.0 ? sampleRate : 48000.0);
}

juce::File AudioTakeRecorder::getTakesDirectory() {
    auto dir = juce::File::getSpecialLocation(juce::File::userMusicDirectory)
                   .getChildFile("johnwalls.studio")
                   .getChildFile("takes");
    if (!dir.exists()) {
        dir.createDirectory();
    }
    return dir;
}

void AudioTakeRecorder::ensureTakesDirectory() {
    auto dir = getTakesDirectory();
    if (!dir.exists()) {
        dir.createDirectory();
    }
}

void AudioTakeRecorder::processBlock(const juce::AudioBuffer<float>& buffer,
                                    bool isPlaying,
                                    double bpm,
                                    int /*barNumber*/,
                                    double /*ppqPosition*/) noexcept {
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();
    if (numSamples <= 0 || numChannels <= 0) return;

    // Track DAW play transition for auto-rec
    const bool wasPlay = m_wasPlaying.exchange(isPlaying, std::memory_order_relaxed);
    if (m_autoRecEnabled.load(std::memory_order_relaxed)) {
        if (!wasPlay && isPlaying && !m_isRecording.load(std::memory_order_relaxed)) {
            // Transport started: start recording flag can be picked up
            // Note: startRecording involves file opening so it is handled safely outside RT thread
        }
    }

    auto* writer = m_activeWriter.load(std::memory_order_relaxed);
    if (writer != nullptr && m_isRecording.load(std::memory_order_relaxed)) {
        writer->write(buffer.getArrayOfReadPointers(), numSamples);
        m_samplesRecorded.fetch_add(numSamples, std::memory_order_relaxed);

        // Peak & RMS calculation for telemetry meters
        float peak = 0.0f;
        float sumSq = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch) {
            const float* p = buffer.getReadPointer(ch);
            for (int s = 0; s < numSamples; ++s) {
                const float val = std::abs(p[s]);
                if (val > peak) peak = val;
                sumSq += val * val;
            }
        }
        const float totalSamples = static_cast<float>(numSamples * numChannels);
        const float rms = (totalSamples > 0.0f) ? std::sqrt(sumSq / totalSamples) : 0.0f;
        const float pDb = (peak > 1e-4f) ? 20.0f * std::log10(peak) : -96.0f;
        const float rDb = (rms > 1e-4f) ? 20.0f * std::log10(rms) : -96.0f;
        m_peakDb.store(pDb, std::memory_order_relaxed);
        m_rmsDb.store(rDb, std::memory_order_relaxed);
    }
}

bool AudioTakeRecorder::startRecording(const juce::String& trackName,
                                       const juce::String& projectName,
                                       double bpm) {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (m_isRecording.load()) {
        stopRecording();
    }

    ensureTakesDirectory();
    auto dir = getTakesDirectory();

    auto now = juce::Time::getCurrentTime();
    juce::String timeStamp = now.formatted("%Y%m%d_%H%M%S");
    
    juce::String cleanTrack = trackName.trim().isEmpty() ? "Master" : trackName.trim();
    cleanTrack = juce::File::createLegalFileName(cleanTrack).replace(" ", "_");

    m_currentTakeId = "take_" + timeStamp + "_" + cleanTrack;
    m_currentTrackName = trackName.trim().isEmpty() ? "Master" : trackName.trim();
    m_currentProjectName = projectName.trim().isEmpty() ? "Ableton Session" : projectName.trim();
    m_currentBpm = bpm > 0.0 ? bpm : 120.0;
    m_recordingStartMs = now.toMilliseconds();
    m_samplesRecorded.store(0);

    m_currentWavFile = dir.getChildFile(m_currentTakeId + ".wav");
    m_currentMetaFile = dir.getChildFile(m_currentTakeId + ".json");

    if (m_currentWavFile.exists()) {
        m_currentWavFile.deleteFile();
    }

    auto outStream = m_currentWavFile.createOutputStream();
    if (outStream == nullptr) {
        return false;
    }

    juce::WavAudioFormat wavFormat;
    // Standard 24-bit PCM stereo WAV writer
    auto rawWriter = wavFormat.createWriterFor(outStream.release(),
                                               m_sampleRate.load(),
                                               2, // stereo
                                               24, // 24-bit
                                               {},
                                               0);
    if (rawWriter == nullptr) {
        return false;
    }

    // 65536 samples buffer ~ 1.36 seconds of audio FIFO at 48kHz
    m_threadedWriter = std::make_unique<juce::AudioFormatWriter::ThreadedWriter>(
        rawWriter, m_thread, 65536);

    m_activeWriter.store(m_threadedWriter.get(), std::memory_order_release);
    m_isRecording.store(true, std::memory_order_release);

    return true;
}

juce::var AudioTakeRecorder::stopRecording() {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (!m_isRecording.load()) {
        return juce::var();
    }

    m_isRecording.store(false, std::memory_order_release);
    m_activeWriter.store(nullptr, std::memory_order_release);

    // Destructing ThreadedWriter flushes all remaining samples and closes WAV header cleanly
    m_threadedWriter.reset();

    const double sr = m_sampleRate.load();
    const int64_t totalSamples = m_samplesRecorded.load();
    const double durationSec = (sr > 0.0) ? static_cast<double>(totalSamples) / sr : 0.0;
    const double bpm = m_currentBpm;
    const double beatsTotal = (bpm > 0.0) ? (durationSec / 60.0) * bpm : 0.0;
    const int barCount = static_cast<int>(std::ceil(beatsTotal / 4.0));

    juce::DynamicObject::Ptr meta = new juce::DynamicObject();
    meta->setProperty("takeId", m_currentTakeId);
    meta->setProperty("trackName", m_currentTrackName);
    meta->setProperty("projectName", m_currentProjectName);
    meta->setProperty("fileName", m_currentWavFile.getFileName());
    meta->setProperty("filePath", m_currentWavFile.getFullPathName());
    meta->setProperty("fileSizeBytes", static_cast<juce::int64>(m_currentWavFile.getSize()));
    meta->setProperty("sampleRate", static_cast<int>(sr));
    meta->setProperty("channels", 2);
    meta->setProperty("bitDepth", 24);
    meta->setProperty("durationSeconds", durationSec);
    meta->setProperty("bpm", bpm);
    meta->setProperty("barCount", barCount);
    meta->setProperty("timeSignature", "4/4");
    meta->setProperty("peakDb", static_cast<double>(m_peakDb.load()));
    meta->setProperty("rmsDb", static_cast<double>(m_rmsDb.load()));
    meta->setProperty("recordedAt", juce::Time::getCurrentTime().toISO8601(true));

    juce::String json = juce::JSON::toString(juce::var(meta.get()), true);
    m_currentMetaFile.replaceWithText(json);

    return juce::var(meta.get());
}

juce::var AudioTakeRecorder::getStatus() const {
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    const bool rec = m_isRecording.load(std::memory_order_relaxed);
    obj->setProperty("isRecording", rec);
    obj->setProperty("autoRecEnabled", m_autoRecEnabled.load(std::memory_order_relaxed));
    obj->setProperty("currentTakeId", m_currentTakeId);
    obj->setProperty("currentTrackName", m_currentTrackName);
    obj->setProperty("currentProjectName", m_currentProjectName);
    obj->setProperty("bpm", m_currentBpm);
    obj->setProperty("sampleRate", m_sampleRate.load());
    obj->setProperty("samplesRecorded", static_cast<juce::int64>(m_samplesRecorded.load()));

    const double sr = m_sampleRate.load();
    const double duration = (sr > 0.0) ? static_cast<double>(m_samplesRecorded.load()) / sr : 0.0;
    obj->setProperty("durationSeconds", duration);
    obj->setProperty("peakDb", static_cast<double>(m_peakDb.load()));
    obj->setProperty("rmsDb", static_cast<double>(m_rmsDb.load()));

    return juce::var(obj.get());
}

juce::Array<juce::var> AudioTakeRecorder::getRecentTakes() const {
    juce::Array<juce::var> list;
    auto dir = getTakesDirectory();
    if (!dir.isDirectory()) return list;

    juce::Array<juce::File> metaFiles;
    dir.findChildFiles(metaFiles, juce::File::findFiles, false, "*.json");

    std::sort(metaFiles.begin(), metaFiles.end(), [](const juce::File& a, const juce::File& b) {
        return a.getLastModificationTime() > b.getLastModificationTime();
    });

    for (const auto& mf : metaFiles) {
        auto parsed = juce::JSON::parse(mf);
        if (parsed.isObject()) {
            list.add(parsed);
        }
    }

    return list;
}

juce::File AudioTakeRecorder::getTakeAudioFile(const juce::String& takeId) const {
    auto dir = getTakesDirectory();
    auto f = dir.getChildFile(takeId + ".wav");
    if (f.existsAsFile()) return f;

    // Fallback search
    juce::Array<juce::File> files;
    dir.findChildFiles(files, juce::File::findFiles, false, takeId + "*.wav");
    if (!files.isEmpty()) return files[0];

    return juce::File();
}

juce::File AudioTakeRecorder::getTakeMetaFile(const juce::String& takeId) const {
    auto dir = getTakesDirectory();
    auto f = dir.getChildFile(takeId + ".json");
    if (f.existsAsFile()) return f;

    juce::Array<juce::File> files;
    dir.findChildFiles(files, juce::File::findFiles, false, takeId + "*.json");
    if (!files.isEmpty()) return files[0];

    return juce::File();
}

bool AudioTakeRecorder::deleteTake(const juce::String& takeId) {
    auto wav = getTakeAudioFile(takeId);
    auto meta = getTakeMetaFile(takeId);
    bool ok = false;
    if (wav.existsAsFile()) {
        ok |= wav.deleteFile();
    }
    if (meta.existsAsFile()) {
        ok |= meta.deleteFile();
    }
    return ok;
}

} // namespace johnwalls::johnwalls
