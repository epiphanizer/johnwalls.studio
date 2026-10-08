#pragma once

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

namespace johnwalls::johnwalls {

/**
 * Thread-safe, zero-allocation Audio Take Recorder for Ableton Live sessions.
 * 
 * Runs a background TimeSliceThread with juce::AudioFormatWriter::ThreadedWriter.
 * Captures 24-bit 48kHz / host-rate stereo WAV files with rich metadata
 * (Ableton project name, track name, tempo, bar length, peak, RMS, timestamp).
 */
class AudioTakeRecorder {
public:
    AudioTakeRecorder();
    ~AudioTakeRecorder();

    // Non-copyable
    AudioTakeRecorder(const AudioTakeRecorder&) = delete;
    AudioTakeRecorder& operator=(const AudioTakeRecorder&) = delete;

    void prepare(double sampleRate, int samplesPerBlock);

    /**
     * Real-time audio thread callback. Completely lock-free and non-allocating.
     */
    void processBlock(const juce::AudioBuffer<float>& buffer,
                      bool isPlaying,
                      double bpm,
                      int barNumber,
                      double ppqPosition) noexcept;

    /**
     * Start recording a new audio take.
     */
    bool startRecording(const juce::String& trackName = "",
                        const juce::String& projectName = "",
                        double bpm = 120.0);

    /**
     * Stop recording, finalize WAV header and metadata JSON.
     * Returns JSON object representing the finished take.
     */
    juce::var stopRecording();

    bool isRecording() const noexcept { return m_isRecording.load(std::memory_order_relaxed); }

    void setAutoRecEnabled(bool enabled) noexcept { m_autoRecEnabled.store(enabled); }
    bool isAutoRecEnabled() const noexcept { return m_autoRecEnabled.load(std::memory_order_relaxed); }

    /** Returns current recording telemetry state. */
    juce::var getStatus() const;

    /** Lists recent audio takes stored on disk (sorted newest first). */
    juce::Array<juce::var> getRecentTakes() const;

    /** Locates the WAV file for a given take ID. */
    juce::File getTakeAudioFile(const juce::String& takeId) const;

    /** Locates the JSON metadata file for a given take ID. */
    juce::File getTakeMetaFile(const juce::String& takeId) const;

    /** Deletes both WAV and JSON files for a take. */
    bool deleteTake(const juce::String& takeId);

    /** Resolves the default directory for saving takes (~/Music/johnwalls.studio/takes). */
    static juce::File getTakesDirectory();

private:
    void ensureTakesDirectory();

    std::atomic<bool> m_isRecording{false};
    std::atomic<bool> m_autoRecEnabled{false};
    std::atomic<bool> m_wasPlaying{false};

    std::atomic<double> m_sampleRate{48000.0};
    std::atomic<int64_t> m_samplesRecorded{0};
    std::atomic<float> m_peakDb{-96.0f};
    std::atomic<float> m_rmsDb{-96.0f};

    // Thread-safe writer access
    juce::TimeSliceThread m_thread{"AudioTakeRecorderThread"};
    std::unique_ptr<juce::AudioFormatWriter::ThreadedWriter> m_threadedWriter;
    std::atomic<juce::AudioFormatWriter::ThreadedWriter*> m_activeWriter{nullptr};

    mutable std::mutex m_mutex;
    juce::String m_currentTakeId;
    juce::String m_currentTrackName;
    juce::String m_currentProjectName;
    double m_currentBpm{120.0};
    int64_t m_recordingStartMs{0};
    juce::File m_currentWavFile;
    juce::File m_currentMetaFile;

    // Peak tracking during take
    float m_takeMaxPeak{0.0f};
    double m_takeSumSq{0.0};
    int64_t m_takeSumSamples{0};
};

} // namespace johnwalls::johnwalls
