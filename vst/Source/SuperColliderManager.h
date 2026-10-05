#pragma once

#include <juce_core/juce_core.h>
#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace johnwalls::johnwalls {

/** One OSC argument (int32, float32, string or blob). */
struct OscArg {
    enum class Type { Int, Float, String, Blob };
    Type type{Type::Int};
    int32_t i{0};
    float f{0.0f};
    std::string s; // string or blob bytes

    static OscArg makeInt(int32_t v) { OscArg a; a.type = Type::Int; a.i = v; return a; }
    static OscArg makeFloat(float v) { OscArg a; a.type = Type::Float; a.f = v; return a; }
    static OscArg makeString(std::string v) { OscArg a; a.type = Type::String; a.s = std::move(v); return a; }
    static OscArg makeBlob(const void* data, size_t n) {
        OscArg a; a.type = Type::Blob; a.s.assign(static_cast<const char*>(data), n); return a;
    }
};

/** Everything the UI shows about the SuperCollider integration. All values are measured, never invented. */
struct SuperColliderStatus {
    bool isRunning{false};
    bool isBooting{false};
    std::string statusText{"OFFLINE"};
    int port{57110};
    int pid{0};              // 0 when unknown
    int sampleRate{0};       // actual rate reported by scsynth (/status.reply)
    int numSynths{0};
    int numGroups{0};
    int numNodes{0};
    int numUGens{0};
    int numSynthDefs{0};
    float avgCPU{0.0f};
    float peakCPU{0.0f};
    std::string binaryPath;
    std::string sclangPath;
    bool isExternal{false};  // attached to an scsynth we did not launch
    std::string lastError;
    std::string serverLog;   // tail of scsynth output
    bool visualRunning{false};
    std::string visualLog;   // tail of sclang output
    int langPort{57120};     // where /state/* OSC for visuals is sent
    int64_t oscSent{0};      // total OSC packets sent
};

/** A MIDI note event forwarded to SuperCollider (posted from the audio thread, lock-free-ish). */
struct ScNoteEvent {
    char address[48]{};
    char mode[24]{};
    int note{0};
    int velocity{0};
    int instanceHash{0};
};

/**
 * Manages a real scsynth server process and an optional sclang process (for on-the-fly visuals),
 * talks to scsynth over OSC/UDP, and streams musical state (/state/audio, /state/rhythm, /state/note)
 * to sclang so visuals can react to the music.
 */
class SuperColliderManager : private juce::Thread {
public:
    static SuperColliderManager& getInstance() {
        static SuperColliderManager s_instance;
        return s_instance;
    }

    bool boot(int port = 57110);
    bool kill();

    /** Actions: freeAll, testTone, reboot, runVisual (payload = sclang code), stopVisual,
        osc (payload = JSON {"target":"server"|"lang","address":"/x","args":[...]}). */
    bool executeAction(const std::string& action, const std::string& payload = "");

    SuperColliderStatus getStatus();
    juce::var getStatusAsVar();
    juce::String getStatusJson();

    void setCustomBinaryPath(const std::string& path);
    std::string findSuperColliderBinary();
    std::string findSclangBinary();

    /** True if anything is listening for state OSC (server or visual running). */
    bool isActive() const noexcept { return m_isRunning.load() || m_visualRunning.load(); }

    /** Thread-safe. Sends one OSC packet to scsynth (toServer) or sclang. */
    bool sendOsc(const std::string& address, const std::vector<OscArg>& args, bool toServer);

    /** Audio-thread safe: never blocks or allocates. Dropped if contended. */
    void postNote(const ScNoteEvent& ev) noexcept;

private:
    SuperColliderManager();
    ~SuperColliderManager() override;
    SuperColliderManager(const SuperColliderManager&) = delete;
    SuperColliderManager& operator=(const SuperColliderManager&) = delete;

    void run() override;
    void ensureThread();
    bool ensureSocket();
    void pumpReplies();
    void sendStatusPoll();
    void housekeeping(int64_t now);
    void drainNotes();
    void schedule(int delayMs, std::function<void()> fn);
    bool launchVisual(const std::string& code);
    void stopVisual();
    void refreshLogs();
    static std::string tailOf(const juce::File& f, size_t maxBytes);
    bool sendRaw(const std::string& packet, int port);

    std::mutex m_mutex; // guards processes + strings below
    std::unique_ptr<juce::ChildProcess> m_server;
    std::unique_ptr<juce::ChildProcess> m_visual;
    std::string m_binaryPath, m_customBinaryPath, m_sclangPath;
    std::string m_lastError, m_serverLog, m_visualLog;
    int64_t m_bootTimeMs{0};
    int64_t m_visualStartMs{0};
    int64_t m_lastStatusSentMs{0};
    std::atomic<int64_t> m_lastReplyMs{0};
    int64_t m_lastLogMs{0};
    juce::File m_serverLogFile, m_visualLogFile, m_visualCodeFile, m_langPortFile;
    juce::Time m_langPortFileTime;

    std::mutex m_sendMutex;
    juce::DatagramSocket m_socket{false};
    bool m_socketBound{false};

    struct Scheduled { int64_t due; std::function<void()> fn; };
    std::mutex m_schedMutex;
    std::vector<Scheduled> m_scheduled;

    // Audio-thread -> manager-thread note ring
    static constexpr int kNoteRing = 128;
    juce::SpinLock m_noteLock;
    ScNoteEvent m_noteRing[kNoteRing];
    int m_noteHead{0}, m_noteTail{0};

    std::atomic<bool> m_isRunning{false};
    std::atomic<bool> m_isBooting{false};
    std::atomic<bool> m_isExternal{false};
    std::atomic<bool> m_visualRunning{false};
    std::atomic<int> m_port{57110};
    std::atomic<int> m_langPort{57120};
    std::atomic<int> m_sampleRate{0};
    std::atomic<int> m_numSynths{0};
    std::atomic<int> m_numGroups{0};
    std::atomic<int> m_numUGens{0};
    std::atomic<int> m_numSynthDefs{0};
    std::atomic<float> m_avgCPU{0.0f};
    std::atomic<float> m_peakCPU{0.0f};
    std::atomic<int64_t> m_oscSent{0};
    std::atomic<int> m_nextNodeId{1000};
};

} // namespace johnwalls::johnwalls
