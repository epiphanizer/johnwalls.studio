#pragma once

#include <juce_core/juce_core.h>
#include <atomic>
#include <memory>
#include <string>

namespace johnwalls::pedalboard {

class MyPedalBoardAudioProcessor;

/**
 * Lightweight local HTTP telemetry server.
 * Enables live 2-way real-time communication between Ableton Live's VST3 engine
 * and external or internal web interfaces (Chrome, Safari, macOS desktop runner).
 */
class LocalTelemetryServer : private juce::Thread {
public:
    explicit LocalTelemetryServer(MyPedalBoardAudioProcessor& processor, int port = 3012);
    ~LocalTelemetryServer() override;

    void start();
    void stop();

    [[nodiscard]] int getPort() const noexcept { return m_port; }

private:
    void run() override;
    void handleConnection(std::unique_ptr<juce::StreamingSocket> client);

    MyPedalBoardAudioProcessor& m_processor;
    int m_port{3012};
    std::atomic<bool> m_shouldExit{false};
    juce::StreamingSocket m_serverSocket;
};

} // namespace johnwalls::pedalboard
