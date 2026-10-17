#pragma once

#include <juce_core/juce_core.h>
#include <atomic>
#include <string>
#include <memory>

namespace johnwalls::johnwalls {

class JohnwallsStudioAudioProcessor;

/**
 * High-performance POSIX Unix Domain Socket server for johnwalls.studio.
 * Listens on /tmp/johnwalls.sock (and registers to ~/.config/johnwalls/run/studio.sock)
 * to enable zero-overhead external control from:
 *   - The `jw` command-line utility
 *   - Local AI agents (Claude, Gemini, Antigravity, ClinePass) via MCP
 *   - Shell automation scripts and background daemons
 *
 * Supports both JSON-RPC 2.0 command frames and HTTP-style single requests (e.g. curl --unix-socket).
 */
class UnixDomainSocketServer : private juce::Thread {
public:
    explicit UnixDomainSocketServer(JohnwallsStudioAudioProcessor& processor,
                                    std::string socketPath = "/tmp/johnwalls.sock");
    ~UnixDomainSocketServer() override;

    void start();
    void stop();

    [[nodiscard]] const std::string& getSocketPath() const noexcept { return m_socketPath; }
    [[nodiscard]] bool isListening() const noexcept { return m_serverFd >= 0; }

private:
    void run() override;
    void handleClient(int clientFd);
    juce::String executeJsonRpc(const juce::String& requestStr);

    JohnwallsStudioAudioProcessor& m_processor;
    std::string m_socketPath;
    std::atomic<bool> m_shouldExit{false};
    int m_serverFd{-1};
};

} // namespace johnwalls::johnwalls
