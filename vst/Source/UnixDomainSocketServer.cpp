#include "UnixDomainSocketServer.h"
#include "PluginProcessor.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <poll.h>

namespace johnwalls::johnwalls {

UnixDomainSocketServer::UnixDomainSocketServer(JohnwallsStudioAudioProcessor& processor,
                                               std::string socketPath)
    : Thread("UnixDomainSocketServer"),
      m_processor(processor),
      m_socketPath(std::move(socketPath))
{
}

UnixDomainSocketServer::~UnixDomainSocketServer() {
    stop();
}

void UnixDomainSocketServer::start() {
    if (isThreadRunning()) return;
    m_shouldExit = false;

    // Create parent directory if needed
    juce::File sockFile(m_socketPath);
    sockFile.getParentDirectory().createDirectory();

    // Clean up existing dead socket file if present
    ::unlink(m_socketPath.c_str());

    m_serverFd = ::socket(AF_UNIX, SOCK_STREAM, 0);
    if (m_serverFd < 0) return;

    // Set non-blocking on listening socket
    int flags = ::fcntl(m_serverFd, F_GETFL, 0);
    if (flags >= 0) {
        ::fcntl(m_serverFd, F_SETFL, flags | O_NONBLOCK);
    }

    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, m_socketPath.c_str(), sizeof(addr.sun_path) - 1);

    if (::bind(m_serverFd, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) != 0) {
        ::close(m_serverFd);
        m_serverFd = -1;
        return;
    }

    // Set permissions so user scripts/agents can connect freely
    ::chmod(m_socketPath.c_str(), 0777);

    if (::listen(m_serverFd, 16) != 0) {
        ::close(m_serverFd);
        ::unlink(m_socketPath.c_str());
        m_serverFd = -1;
        return;
    }

    // Optional: create symlink in ~/.config/johnwalls/run/studio.sock for standardized user access
    auto configRunDir = juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                            .getChildFile(".config/johnwalls/run");
    configRunDir.createDirectory();
    auto runSock = configRunDir.getChildFile("studio.sock");
    runSock.deleteFile();
    ::symlink(m_socketPath.c_str(), runSock.getFullPathName().toRawUTF8());

    startThread(juce::Thread::Priority::normal);
}

void UnixDomainSocketServer::stop() {
    m_shouldExit = true;
    signalThreadShouldExit();

    if (m_serverFd >= 0) {
        ::close(m_serverFd);
        m_serverFd = -1;
    }
    ::unlink(m_socketPath.c_str());

    stopThread(2000);
}

void UnixDomainSocketServer::run() {
    while (!threadShouldExit() && !m_shouldExit.load() && m_serverFd >= 0) {
        struct pollfd pfd{};
        pfd.fd = m_serverFd;
        pfd.events = POLLIN;

        int pollRes = ::poll(&pfd, 1, 200); // 200ms tick for clean thread shutdown
        if (pollRes > 0 && (pfd.revents & POLLIN)) {
            sockaddr_un clientAddr{};
            socklen_t clientLen = sizeof(clientAddr);
            int clientFd = ::accept(m_serverFd, reinterpret_cast<struct sockaddr*>(&clientAddr), &clientLen);
            if (clientFd >= 0) {
                handleClient(clientFd);
                ::close(clientFd);
            }
        }
    }
}

void UnixDomainSocketServer::handleClient(int clientFd) {
    std::string buffer;
    buffer.reserve(4096);
    char chunk[2048];

    // Wait up to 500ms for incoming data
    struct pollfd pfd{};
    pfd.fd = clientFd;
    pfd.events = POLLIN;

    for (;;) {
        if (::poll(&pfd, 1, 500) <= 0) break;
        ssize_t bytesRead = ::read(clientFd, chunk, sizeof(chunk));
        if (bytesRead <= 0) break;
        buffer.append(chunk, static_cast<size_t>(bytesRead));

        // If line terminated or HTTP header terminated, proceed
        if (buffer.find('\n') != std::string::npos || buffer.find("\r\n\r\n") != std::string::npos) {
            break;
        }
    }

    if (buffer.empty()) return;

    juce::String request = juce::String::fromUTF8(buffer.data(), static_cast<int>(buffer.size())).trim();

    // Check if client sent an HTTP request (e.g. curl --unix-socket)
    if (request.startsWithIgnoreCase("GET ") || request.startsWithIgnoreCase("POST ") || request.startsWithIgnoreCase("OPTIONS ")) {
        juce::String firstLine = request.upToFirstOccurrenceOf("\r\n", false, false);
        juce::StringArray tokens;
        tokens.addTokens(firstLine, " ", "");
        if (tokens.size() >= 2) {
            juce::String method = tokens[0].toUpperCase();
            juce::String path = tokens[1];

            juce::String bodyJson;
            if (method == "GET" && path.startsWith("/telemetry")) {
                bodyJson = m_processor.getTelemetryJsonString();
            } else if (method == "GET" && path.startsWith("/sp404/state")) {
                bodyJson = m_processor.buildSP404NativeStateJson();
            } else {
                bodyJson = "{\"status\":\"ok\",\"source\":\"unix_domain_socket\"}";
            }

            juce::String httpResponse =
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " +
                juce::String(bodyJson.getNumBytesAsUTF8()) + "\r\nConnection: close\r\n\r\n" + bodyJson;

            ::write(clientFd, httpResponse.toRawUTF8(), static_cast<size_t>(httpResponse.getNumBytesAsUTF8()));
            return;
        }
    }

    // Process as JSON-RPC 2.0 command frame
    juce::String responseJson = executeJsonRpc(request);
    responseJson += "\n";
    ::write(clientFd, responseJson.toRawUTF8(), static_cast<size_t>(responseJson.getNumBytesAsUTF8()));
}

juce::String UnixDomainSocketServer::executeJsonRpc(const juce::String& requestStr) {
    auto parsed = juce::JSON::parse(requestStr);
    juce::var reqId = parsed.isObject() ? parsed.getProperty("id", juce::var(1)) : juce::var(1);
    juce::String method = parsed.isObject() ? parsed.getProperty("method", "").toString() : "";
    auto params = parsed.isObject() ? parsed.getProperty("params", juce::var()) : juce::var();

    auto makeSuccess = [&reqId](const juce::var& resultVal) -> juce::String {
        auto resp = new juce::DynamicObject();
        resp->setProperty("jsonrpc", "2.0");
        resp->setProperty("id", reqId);
        resp->setProperty("result", resultVal);
        return juce::JSON::toString(juce::var(resp));
    };

    auto makeError = [&reqId](int code, const juce::String& message) -> juce::String {
        auto resp = new juce::DynamicObject();
        resp->setProperty("jsonrpc", "2.0");
        resp->setProperty("id", reqId);
        auto err = new juce::DynamicObject();
        err->setProperty("code", code);
        err->setProperty("message", message);
        resp->setProperty("error", juce::var(err));
        return juce::JSON::toString(juce::var(resp));
    };

    if (method.isEmpty()) {
        return makeError(-32600, "Invalid Request: missing method");
    }

    // Helper to resolve bank index from integer or letter string 'A'-'G'
    auto parseBank = [](const juce::var& v) -> int {
        if (v.isString()) {
            juce::String s = v.toString().trim().toUpperCase();
            if (s.isNotEmpty()) {
                auto c = s[0];
                if (c >= 'A' && c <= 'G') return static_cast<int>(c - 'A');
            }
        }
        return juce::jlimit(0, 6, static_cast<int>(v));
    };

    if (method == "status" || method == "telemetry") {
        return makeSuccess(juce::JSON::parse(m_processor.getTelemetryJsonString()));
    }

    if (method == "sp404.state") {
        return makeSuccess(juce::JSON::parse(m_processor.buildSP404NativeStateJson()));
    }

    if (method == "sp404.trigger") {
        int bank = parseBank(params.getProperty("bank", 0));
        int pad = juce::jlimit(1, 16, static_cast<int>(params.getProperty("pad", 1)));
        float vel = static_cast<float>(params.getProperty("velocity", 1.0f));
        if (vel > 1.0f && vel <= 127.0f) vel /= 127.0f;
        float semitones = static_cast<float>(params.getProperty("transpose", 0.0f));

        m_processor.triggerSP404Pad(bank, pad, vel, semitones);
        auto res = new juce::DynamicObject();
        res->setProperty("triggered", true);
        res->setProperty("bank", bank);
        res->setProperty("pad", pad);
        return makeSuccess(juce::var(res));
    }

    if (method == "sp404.release") {
        int bank = parseBank(params.getProperty("bank", 0));
        int pad = juce::jlimit(1, 16, static_cast<int>(params.getProperty("pad", 1)));
        m_processor.releaseSP404Pad(bank, pad);
        return makeSuccess(true);
    }

    if (method == "sp404.hold") {
        bool hold = false;
        if (params.hasProperty("enabled")) {
            hold = static_cast<bool>(params.getProperty("enabled", false));
        } else if (params.hasProperty("toggle") && static_cast<bool>(params.getProperty("toggle", false))) {
            hold = !m_processor.getSP404Engine().isHoldMode();
        }
        m_processor.setSP404Hold(hold);
        auto res = new juce::DynamicObject();
        res->setProperty("hold", hold);
        return makeSuccess(juce::var(res));
    }

    if (method == "sp404.stop" || method == "sp404.stop_all") {
        m_processor.getSP404Engine().stopAll();
        return makeSuccess(true);
    }

    if (method == "sp404.transpose") {
        float semitones = static_cast<float>(params.getProperty("semitones", 0.0f));
        m_processor.setSP404GlobalTranspose(semitones);
        auto res = new juce::DynamicObject();
        res->setProperty("globalTranspose", semitones);
        return makeSuccess(juce::var(res));
    }

    if (method == "sp404.label") {
        int bank = parseBank(params.getProperty("bank", 0));
        int pad = juce::jlimit(1, 16, static_cast<int>(params.getProperty("pad", 1)));
        juce::String label = params.getProperty("label", "").toString();
        m_processor.setSP404PadLabel(bank, pad, label);
        return makeSuccess(true);
    }

    if (method == "sp404.param") {
        int bank = parseBank(params.getProperty("bank", 0));
        int pad = juce::jlimit(1, 16, static_cast<int>(params.getProperty("pad", 1)));
        juce::String param = params.getProperty("param", "").toString();
        float value = static_cast<float>(params.getProperty("value", 0.0f));
        m_processor.setSP404PadParam(bank, pad, param, value);
        return makeSuccess(true);
    }

    if (method == "rack.add") {
        juce::String type = params.getProperty("type", "delay").toString();
        juce::String id = params.getProperty("id", type).toString();
        m_processor.addPedalFromUI(type, id);
        return makeSuccess(true);
    }

    if (method == "rack.remove") {
        juce::String id = params.getProperty("id", "").toString();
        m_processor.removePedalFromUI(id);
        return makeSuccess(true);
    }

    if (method == "rack.bypass") {
        juce::String id = params.getProperty("id", "").toString();
        bool bypassed = static_cast<bool>(params.getProperty("bypassed", true));
        m_processor.setPedalBypassedFromUI(id, bypassed);
        return makeSuccess(true);
    }

    if (method == "rack.param") {
        juce::String id = params.getProperty("id", "").toString();
        juce::String param = params.getProperty("param", "").toString();
        float value = static_cast<float>(params.getProperty("value", 0.0f));
        m_processor.setPedalParamFromUI(id, param, value);
        return makeSuccess(true);
    }

    if (method == "take.start") {
        juce::String track = params.getProperty("track", juce::String(m_processor.getTrackName())).toString();
        juce::String preset = params.getProperty("preset", "supercollider-lissajous").toString();
        m_processor.getTakeRecorder().startRecording(track.toStdString(), preset.toStdString());
        return makeSuccess(true);
    }

    if (method == "take.stop") {
        m_processor.getTakeRecorder().stopRecording();
        return makeSuccess(true);
    }

    if (method == "manifest.export") {
        juce::String sessionName = params.getProperty("name", "current_session").toString();
        auto sessionsDir = juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                               .getChildFile(".config/johnwalls/sessions")
                               .getChildFile(sessionName);
        sessionsDir.createDirectory();
        auto manifestFile = sessionsDir.getChildFile("manifest.json");

        juce::String sp404Json = m_processor.buildSP404NativeStateJson();
        auto manifestObj = new juce::DynamicObject();
        manifestObj->setProperty("version", "2.0.0");
        manifestObj->setProperty("sessionName", sessionName);
        manifestObj->setProperty("exportedAt", juce::Time::getCurrentTime().toISO8601(true));
        manifestObj->setProperty("sp404", juce::JSON::parse(sp404Json));
        manifestObj->setProperty("bpm", m_processor.getCurrentBpm());

        juce::String content = juce::JSON::toString(juce::var(manifestObj), true);
        manifestFile.replaceWithText(content);

        auto res = new juce::DynamicObject();
        res->setProperty("path", manifestFile.getFullPathName());
        res->setProperty("written", true);
        return makeSuccess(juce::var(res));
    }

    return makeError(-32601, "Method not found: " + method);
}

} // namespace johnwalls::johnwalls
