#pragma once

#include <juce_core/juce_core.h>
#include <string>
#include <mutex>
#include <atomic>
#include <memory>

namespace johnwalls::pedalboard {

struct SuperColliderStatus {
    bool isRunning{false};
    bool isBooting{false};
    std::string statusText{"OFFLINE"};
    int port{57110};
    int pid{0};
    int sampleRate{48000};
    int numSynths{0};
    int numGroups{0};
    int numNodes{0};
    float avgCPU{0.0f};
    float peakCPU{0.0f};
    float bufferMemoryMb{0.0f};
    std::string binaryPath;
    bool isVirtual{false};
};

class SuperColliderManager {
public:
    static SuperColliderManager& getInstance() {
        static SuperColliderManager s_instance;
        return s_instance;
    }

    bool boot(int port = 57110, int sampleRate = 48000);
    bool kill();
    bool executeAction(const std::string& action, const std::string& payload = "");
    SuperColliderStatus getStatus();
    juce::var getStatusAsVar();
    juce::String getStatusJson();

    void setCustomBinaryPath(const std::string& path);
    std::string findSuperColliderBinary();

private:
    SuperColliderManager();
    ~SuperColliderManager();
    SuperColliderManager(const SuperColliderManager&) = delete;
    SuperColliderManager& operator=(const SuperColliderManager&) = delete;

    std::mutex m_mutex;
    std::unique_ptr<juce::ChildProcess> m_childProcess;
    std::string m_binaryPath;
    std::string m_customBinaryPath;

    std::atomic<bool> m_isRunning{false};
    std::atomic<bool> m_isBooting{false};
    std::atomic<int> m_port{57110};
    std::atomic<int> m_pid{0};
    std::atomic<int> m_sampleRate{48000};
    std::atomic<int> m_numSynths{0};
    std::atomic<int> m_numGroups{0};
    std::atomic<int> m_numNodes{0};
    std::atomic<float> m_avgCPU{0.0f};
    std::atomic<float> m_peakCPU{0.0f};
    std::atomic<float> m_bufferMemoryMb{0.0f};
    std::atomic<bool> m_isVirtual{true};
    int64_t m_bootTimeMs{0};
};

} // namespace johnwalls::pedalboard
