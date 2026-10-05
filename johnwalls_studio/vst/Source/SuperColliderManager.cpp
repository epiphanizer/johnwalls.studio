#include "SuperColliderManager.h"
#include "SuperColliderSynthDefs.h"

#include <algorithm>
#include <cstring>

namespace johnwalls::johnwalls {

namespace {

//==============================================================================
// Minimal OSC 1.0 encoder / decoder (UDP datagrams only, no bundles needed)
//==============================================================================
void putPaddedString(std::string& out, const std::string& s) {
    out += s;
    out.push_back('\0');
    while (out.size() % 4 != 0) out.push_back('\0');
}

void putInt32(std::string& out, int32_t v) {
    const auto u = static_cast<uint32_t>(v);
    for (int shift = 24; shift >= 0; shift -= 8)
        out.push_back(static_cast<char>((u >> shift) & 0xff));
}

void putFloat32(std::string& out, float f) {
    uint32_t u = 0;
    std::memcpy(&u, &f, sizeof(u));
    putInt32(out, static_cast<int32_t>(u));
}

std::string encodeOsc(const std::string& address, const std::vector<OscArg>& args) {
    std::string tags = ",";
    for (const auto& a : args) {
        switch (a.type) {
            case OscArg::Type::Int:    tags.push_back('i'); break;
            case OscArg::Type::Float:  tags.push_back('f'); break;
            case OscArg::Type::String: tags.push_back('s'); break;
            case OscArg::Type::Blob:   tags.push_back('b'); break;
        }
    }
    std::string out;
    putPaddedString(out, address);
    putPaddedString(out, tags);
    for (const auto& a : args) {
        switch (a.type) {
            case OscArg::Type::Int:    putInt32(out, a.i); break;
            case OscArg::Type::Float:  putFloat32(out, a.f); break;
            case OscArg::Type::String: putPaddedString(out, a.s); break;
            case OscArg::Type::Blob:
                putInt32(out, static_cast<int32_t>(a.s.size()));
                out += a.s;
                while (out.size() % 4 != 0) out.push_back('\0');
                break;
        }
    }
    return out;
}

size_t align4(size_t n) { return (n + 3u) & ~static_cast<size_t>(3u); }

uint32_t readU32(const uint8_t* p) {
    return (static_cast<uint32_t>(p[0]) << 24) | (static_cast<uint32_t>(p[1]) << 16)
         | (static_cast<uint32_t>(p[2]) << 8) | static_cast<uint32_t>(p[3]);
}

struct StatusReply {
    bool valid{false};
    int ugens{0}, synths{0}, groups{0}, defs{0};
    float avgCpu{0.0f}, peakCpu{0.0f};
    double nominalSr{0.0}, actualSr{0.0};
};

StatusReply parseStatusReply(const uint8_t* data, size_t size) {
    StatusReply r;
    size_t pos = 0;
    auto readString = [&](std::string& out) {
        size_t end = pos;
        while (end < size && data[end] != 0) ++end;
        if (end >= size) return false;
        out.assign(reinterpret_cast<const char*>(data + pos), end - pos);
        pos = align4(end + 1);
        return true;
    };
    std::string address, tags;
    if (!readString(address) || address != "/status.reply") return r;
    if (!readString(tags) || tags.empty() || tags[0] != ',') return r;

    std::vector<double> values;
    for (size_t i = 1; i < tags.size(); ++i) {
        if (tags[i] == 'i' || tags[i] == 'f') {
            if (pos + 4 > size) return r;
            const uint32_t u = readU32(data + pos);
            pos += 4;
            if (tags[i] == 'i') {
                values.push_back(static_cast<double>(static_cast<int32_t>(u)));
            } else {
                float f = 0.0f;
                std::memcpy(&f, &u, sizeof(f));
                values.push_back(static_cast<double>(f));
            }
        } else if (tags[i] == 'd') {
            if (pos + 8 > size) return r;
            const uint64_t hi = readU32(data + pos), lo = readU32(data + pos + 4);
            const uint64_t u = (hi << 32) | lo;
            pos += 8;
            double d = 0.0;
            std::memcpy(&d, &u, sizeof(d));
            values.push_back(d);
        } else {
            return r;
        }
    }
    // /status.reply: unused, numUGens, numSynths, numGroups, numSynthDefs, avgCPU, peakCPU, nominalSR, actualSR
    if (values.size() < 9) return r;
    r.ugens = static_cast<int>(values[1]);
    r.synths = static_cast<int>(values[2]);
    r.groups = static_cast<int>(values[3]);
    r.defs = static_cast<int>(values[4]);
    r.avgCpu = static_cast<float>(values[5]);
    r.peakCpu = static_cast<float>(values[6]);
    r.nominalSr = values[7];
    r.actualSr = values[8];
    r.valid = true;
    return r;
}

std::string shQuote(const std::string& s) {
    std::string out = "'";
    for (char c : s) {
        if (c == '\'') out += "'\\''";
        else out.push_back(c);
    }
    out.push_back('\'');
    return out;
}

std::string lastLine(const std::string& text) {
    auto trimmed = juce::String(text).trim();
    auto lines = juce::StringArray::fromLines(trimmed);
    lines.removeEmptyStrings();
    return lines.isEmpty() ? std::string() : lines[lines.size() - 1].toStdString();
}

// Helpers injected in front of every visual patch. The patch gets:
//   s              -> Server.remote bound to our scsynth
//   ~jws[\onAudio] -> { |peakDb, rmsDb, bpm, ppq, isPlaying, bar| }   (~20 Hz)
//   ~jws[\onRhythm]-> { |pattern, density, register, rule| }          (~20 Hz, /state/pattern)
//   ~jws[\onNote]  -> { |note, velocity, instanceHash| }              (per MIDI note-on, /state/note)
const char* kVisualPreamble = R"SC(
// ---- johnwalls.studio preamble (auto-generated) ----
~jws = ();
~jws[\serverPort] = %PORT%;
~jws[\langPort] = NetAddr.langPort;
File(%PORTFILE%, "w").write(NetAddr.langPort.asString).close;
Server.default = s = Server.remote(\jws, NetAddr("127.0.0.1", ~jws[\serverPort]));
~jws[\onAudio]  = { |func| OSCdef(\jwsAudio,  { |msg| func.value(msg[1], msg[2], msg[3], msg[4], msg[5], msg[6]) }, '/state/audio') };
~jws[\onRhythm] = { |func| OSCdef(\jwsRhythm, { |msg| func.value(msg[1], msg[2], msg[3], msg[4]) }, '/state/pattern') };
~jws[\onNote]   = { |func| OSCdef(\jwsNote,   { |msg| func.value(msg[2], msg[3], msg[1]) }, '/state/note') };
// ---- your patch ----
)SC";

} // namespace

//==============================================================================
SuperColliderManager::SuperColliderManager() : juce::Thread("SuperColliderManager") {
    auto tmp = juce::File::getSpecialLocation(juce::File::tempDirectory);
    m_serverLogFile = tmp.getChildFile("jws_scsynth.log");
    m_visualLogFile = tmp.getChildFile("jws_sclang.log");
    m_visualCodeFile = tmp.getChildFile("jws_visual.scd");
    m_langPortFile = tmp.getChildFile("jws_sclang_port.txt");
    m_binaryPath = findSuperColliderBinary();
    m_sclangPath = findSclangBinary();
}

SuperColliderManager::~SuperColliderManager() {
    kill();
    stopThread(2000);
}

std::string SuperColliderManager::findSuperColliderBinary() {
    if (!m_customBinaryPath.empty()) {
        juce::File f(m_customBinaryPath);
        if (f.existsAsFile()) return m_customBinaryPath;
    }
    const char* candidates[] = {
        "/Applications/SuperCollider.app/Contents/Resources/scsynth",
        "/Applications/SuperCollider/SuperCollider.app/Contents/Resources/scsynth",
        "/opt/homebrew/bin/scsynth",
        "/usr/local/bin/scsynth",
        "/usr/bin/scsynth"
    };
    for (const auto* path : candidates) {
        if (juce::File(path).existsAsFile()) return std::string(path);
    }
    return {};
}

std::string SuperColliderManager::findSclangBinary() {
    const char* candidates[] = {
        "/Applications/SuperCollider.app/Contents/MacOS/sclang",
        "/Applications/SuperCollider/SuperCollider.app/Contents/MacOS/sclang",
        "/opt/homebrew/bin/sclang",
        "/usr/local/bin/sclang",
        "/usr/bin/sclang"
    };
    for (const auto* path : candidates) {
        if (juce::File(path).existsAsFile()) return std::string(path);
    }
    return {};
}

void SuperColliderManager::setCustomBinaryPath(const std::string& path) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_customBinaryPath = path;
    m_binaryPath = findSuperColliderBinary();
}

//==============================================================================
// Networking
//==============================================================================
bool SuperColliderManager::ensureSocket() {
    std::lock_guard<std::mutex> lock(m_sendMutex);
    if (!m_socketBound) m_socketBound = m_socket.bindToPort(0, "127.0.0.1");
    return m_socketBound;
}

bool SuperColliderManager::sendRaw(const std::string& packet, int port) {
    std::lock_guard<std::mutex> lock(m_sendMutex);
    if (!m_socketBound) return false;
    const int n = m_socket.write("127.0.0.1", port, packet.data(), static_cast<int>(packet.size()));
    if (n != static_cast<int>(packet.size())) return false;
    m_oscSent.fetch_add(1, std::memory_order_relaxed);
    return true;
}

bool SuperColliderManager::sendOsc(const std::string& address, const std::vector<OscArg>& args, bool toServer) {
    return sendRaw(encodeOsc(address, args), toServer ? m_port.load() : m_langPort.load());
}

void SuperColliderManager::sendStatusPoll() {
    sendRaw(encodeOsc("/status", {}), m_port.load());
    m_lastStatusSentMs = juce::Time::currentTimeMillis();
}

void SuperColliderManager::pumpReplies() {
    if (!m_socketBound) {
        wait(10);
        return;
    }
    int ready = m_socket.waitUntilReady(true, 10);
    while (ready == 1) {
        uint8_t buf[2048];
        const int n = m_socket.read(buf, sizeof(buf), false);
        if (n <= 0) break;
        const auto reply = parseStatusReply(buf, static_cast<size_t>(n));
        if (reply.valid) {
            m_numUGens.store(reply.ugens);
            m_numSynths.store(reply.synths);
            m_numGroups.store(reply.groups);
            m_numSynthDefs.store(reply.defs);
            m_avgCPU.store(reply.avgCpu);
            m_peakCPU.store(reply.peakCpu);
            m_sampleRate.store(static_cast<int>(reply.actualSr > 0.0 ? reply.actualSr : reply.nominalSr));
            m_lastReplyMs.store(juce::Time::currentTimeMillis());
        }
        ready = m_socket.waitUntilReady(true, 0);
    }
}

void SuperColliderManager::postNote(const ScNoteEvent& ev) noexcept {
    juce::SpinLock::ScopedTryLockType lock(m_noteLock);
    if (!lock.isLocked()) return;
    const int next = (m_noteHead + 1) % kNoteRing;
    if (next == m_noteTail) return; // full
    m_noteRing[m_noteHead] = ev;
    m_noteHead = next;
}

void SuperColliderManager::drainNotes() {
    for (;;) {
        ScNoteEvent ev;
        {
            const juce::SpinLock::ScopedLockType lock(m_noteLock);
            if (m_noteTail == m_noteHead) return;
            ev = m_noteRing[m_noteTail];
            m_noteTail = (m_noteTail + 1) % kNoteRing;
        }
        if (!isActive()) continue; // nobody listening
        sendOsc("/state/note", {OscArg::makeInt(ev.instanceHash), OscArg::makeInt(ev.note),
                                OscArg::makeInt(ev.velocity)}, false);
        if (ev.address[0] != '\0' && std::strcmp(ev.address, "/state/note") != 0) {
            sendOsc(ev.address, {OscArg::makeInt(ev.note), OscArg::makeInt(ev.velocity),
                                 OscArg::makeString(ev.mode)}, false);
        }
    }
}

void SuperColliderManager::schedule(int delayMs, std::function<void()> fn) {
    std::lock_guard<std::mutex> lock(m_schedMutex);
    m_scheduled.push_back({juce::Time::currentTimeMillis() + delayMs, std::move(fn)});
}

//==============================================================================
// Thread
//==============================================================================
void SuperColliderManager::ensureThread() {
    if (!isThreadRunning()) startThread(juce::Thread::Priority::normal);
}

void SuperColliderManager::run() {
    while (!threadShouldExit()) {
        drainNotes();
        pumpReplies();

        const auto now = juce::Time::currentTimeMillis();
        const bool booting = m_isBooting.load();
        if ((booting || m_isRunning.load()) && now - m_lastStatusSentMs >= (booting ? 250 : 500)) {
            sendStatusPoll();
        }

        // Run scheduled actions outside of any lock
        std::vector<std::function<void()>> due;
        {
            std::lock_guard<std::mutex> lock(m_schedMutex);
            for (auto it = m_scheduled.begin(); it != m_scheduled.end();) {
                if (it->due <= now) {
                    due.push_back(std::move(it->fn));
                    it = m_scheduled.erase(it);
                } else {
                    ++it;
                }
            }
        }
        for (auto& fn : due) fn();

        housekeeping(now);
    }
}

void SuperColliderManager::refreshLogs() {
    m_serverLog = tailOf(m_serverLogFile, 2000);
    m_visualLog = tailOf(m_visualLogFile, 4000);
    if (m_langPortFile.existsAsFile() && m_langPortFile.getLastModificationTime() != m_langPortFileTime) {
        m_langPortFileTime = m_langPortFile.getLastModificationTime();
        const int p = m_langPortFile.loadFileAsString().trim().getIntValue();
        if (p > 1023 && p < 65536) m_langPort.store(p);
    }
}

void SuperColliderManager::housekeeping(int64_t now) {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (now - m_lastLogMs >= 500) {
        m_lastLogMs = now;
        refreshLogs();
    }

    // ---- scsynth lifecycle ----
    if (m_isBooting.load()) {
        const bool answered = m_lastReplyMs.load() >= m_bootTimeMs && m_lastReplyMs.load() > 0;
        if (answered) {
            m_isBooting.store(false);
            m_isRunning.store(true);
            m_lastError.clear();
        } else if (m_server && !m_server->isRunning() && now - m_bootTimeMs > 1500) {
            m_lastError = "scsynth exited during boot: " + lastLine(m_serverLog);
            m_server.reset();
            m_isBooting.store(false);
        } else if (now - m_bootTimeMs > 20000) {
            m_lastError = "scsynth did not answer /status within 20s: " + lastLine(m_serverLog);
            if (m_server) m_server->kill();
            m_server.reset();
            m_isBooting.store(false);
        }
    } else if (m_isRunning.load()) {
        const bool fresh = now - m_lastReplyMs.load() < 2500;
        if (m_server && !m_server->isRunning()) {
            if (fresh) {
                // Our child died but something else owns the port and still answers: attach to it.
                m_isExternal.store(true);
                m_server.reset();
            } else {
                m_lastError = "scsynth exited: " + lastLine(m_serverLog);
                m_server.reset();
                m_isRunning.store(false);
            }
        } else if (now - m_lastReplyMs.load() > 5000) {
            m_lastError = "Lost connection to scsynth on UDP " + std::to_string(m_port.load());
            m_isRunning.store(false);
        }
        if (!m_isRunning.load()) {
            m_numSynths.store(0);
            m_numGroups.store(0);
            m_avgCPU.store(0.0f);
            m_peakCPU.store(0.0f);
        }
    }

    // ---- sclang visual lifecycle ----
    if (m_visual && !m_visual->isRunning()) {
        if (m_visual->getExitCode() != 0) {
            m_lastError = "sclang exited with code " + std::to_string(m_visual->getExitCode()) + ": " + lastLine(m_visualLog);
        }
        m_visual.reset();
        m_visualRunning.store(false);
    }
}

std::string SuperColliderManager::tailOf(const juce::File& f, size_t maxBytes) {
    if (!f.existsAsFile()) return {};
    juce::FileInputStream in(f);
    if (!in.openedOk()) return {};
    const auto total = static_cast<juce::int64>(in.getTotalLength());
    if (total > static_cast<juce::int64>(maxBytes)) in.setPosition(total - static_cast<juce::int64>(maxBytes));
    return in.readEntireStreamAsString().toStdString();
}

//==============================================================================
// Control
//==============================================================================
bool SuperColliderManager::boot(int port) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_isRunning.load() || m_isBooting.load()) return true;

    m_binaryPath = findSuperColliderBinary();
    if (m_binaryPath.empty()) {
        m_lastError = "scsynth not found. Install SuperCollider (https://supercollider.github.io) "
                      "into /Applications or via Homebrew.";
        return false;
    }
    if (!ensureSocket()) {
        m_lastError = "Could not open a local UDP socket for OSC.";
        return false;
    }

    m_port.store(port);
    m_serverLogFile.deleteFile();
    m_isExternal.store(false);
    m_lastReplyMs.store(0);

    const std::string script = "exec " + shQuote(m_binaryPath) + " -u " + std::to_string(port)
        + " -a 1024 -m 131072 -z 64 -l 32 -i 2 -o 2 > " + shQuote(m_serverLogFile.getFullPathName().toStdString())
        + " 2>&1 < /dev/null";

    m_server = std::make_unique<juce::ChildProcess>();
    if (!m_server->start(juce::StringArray{"/bin/sh", "-c", juce::String(script)}, 0)) {
        m_server.reset();
        m_lastError = "Failed to launch " + m_binaryPath;
        return false;
    }

    m_bootTimeMs = juce::Time::currentTimeMillis();
    m_lastError.clear();
    m_isBooting.store(true);
    ensureThread();
    return true;
}

bool SuperColliderManager::kill() {
    std::lock_guard<std::mutex> lock(m_mutex);

    stopVisual();

    if (m_server) {
        sendOsc("/quit", {}, true);
        const auto deadline = juce::Time::currentTimeMillis() + 500;
        while (m_server->isRunning() && juce::Time::currentTimeMillis() < deadline)
            juce::Thread::sleep(20);
        if (m_server->isRunning()) m_server->kill();
        m_server.reset();
    }
    m_isRunning.store(false);
    m_isBooting.store(false);
    m_isExternal.store(false);
    m_numSynths.store(0);
    m_numGroups.store(0);
    m_numUGens.store(0);
    m_avgCPU.store(0.0f);
    m_peakCPU.store(0.0f);
    return true;
}

bool SuperColliderManager::launchVisual(const std::string& code) {
    // m_mutex is held by the caller.
    stopVisual();

    m_sclangPath = findSclangBinary();
    if (m_sclangPath.empty()) {
        m_lastError = "sclang not found. Install SuperCollider into /Applications or via Homebrew.";
        return false;
    }
    if (!ensureSocket()) {
        m_lastError = "Could not open a local UDP socket for OSC.";
        return false;
    }
    if (code.empty()) {
        m_lastError = "Visual patch is empty.";
        return false;
    }

    std::string preamble = kVisualPreamble;
    auto replaceAll = [&](const std::string& what, const std::string& with) {
        for (size_t p = preamble.find(what); p != std::string::npos; p = preamble.find(what, p + with.size()))
            preamble.replace(p, what.size(), with);
    };
    replaceAll("%PORT%", std::to_string(m_port.load()));
    replaceAll("%PORTFILE%", "\"" + m_langPortFile.getFullPathName().toStdString() + "\"");

    // GUI/drawing code must run on the AppClock; errors are reported to the log instead of killing sclang.
    const std::string program = preamble + "\nAppClock.sched(0, {\n try {\n" + code
        + "\n } { |e| e.reportError };\n nil\n});\n";
    if (!m_visualCodeFile.replaceWithText(juce::String(program))) {
        m_lastError = "Could not write " + m_visualCodeFile.getFullPathName().toStdString();
        return false;
    }
    m_visualLogFile.deleteFile();
    m_langPortFile.deleteFile();
    m_langPortFileTime = juce::Time();

    const std::string script = "exec " + shQuote(m_sclangPath) + " -D "
        + shQuote(m_visualCodeFile.getFullPathName().toStdString()) + " > "
        + shQuote(m_visualLogFile.getFullPathName().toStdString()) + " 2>&1 < /dev/null";

    m_visual = std::make_unique<juce::ChildProcess>();
    if (!m_visual->start(juce::StringArray{"/bin/sh", "-c", juce::String(script)}, 0)) {
        m_visual.reset();
        m_lastError = "Failed to launch " + m_sclangPath;
        return false;
    }
    m_visualStartMs = juce::Time::currentTimeMillis();
    m_visualRunning.store(true);
    m_lastError.clear();
    ensureThread();
    return true;
}

void SuperColliderManager::stopVisual() {
    // m_mutex is held by the caller.
    if (m_visual) {
        if (m_visual->isRunning()) m_visual->kill();
        m_visual.reset();
    }
    m_visualRunning.store(false);
}

bool SuperColliderManager::executeAction(const std::string& action, const std::string& payload) {
    auto fail = [this](const std::string& msg) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_lastError = msg;
        return false;
    };

    if (action == "boot") return boot(m_port.load());
    if (action == "kill") return kill();
    if (action == "reboot") {
        const int port = m_port.load();
        kill();
        return boot(port);
    }
    if (action == "runVisual") {
        std::lock_guard<std::mutex> lock(m_mutex);
        return launchVisual(payload);
    }
    if (action == "stopVisual") {
        std::lock_guard<std::mutex> lock(m_mutex);
        stopVisual();
        return true;
    }

    if (!m_isRunning.load()) return fail("SuperCollider server is not running. Boot it first.");

    if (action == "freeAll") {
        sendOsc("/g_new", {OscArg::makeInt(1), OscArg::makeInt(0), OscArg::makeInt(0)}, true);
        const bool a = sendOsc("/g_freeAll", {OscArg::makeInt(1)}, true);
        const bool b = sendOsc("/clearSched", {}, true);
        return a && b;
    }

    if (action == "testTone") {
        if (!sendOsc("/d_recv", {OscArg::makeBlob(kSynthDefJwsSine, kSynthDefJwsSineSize)}, true))
            return fail("Could not send the test SynthDef to scsynth.");
        sendOsc("/g_new", {OscArg::makeInt(1), OscArg::makeInt(0), OscArg::makeInt(0)}, true);
        const int node = m_nextNodeId.fetch_add(1);
        // /d_recv is asynchronous: give scsynth time to load the def before instantiating it.
        schedule(150, [this, node] {
            sendOsc("/s_new", {OscArg::makeString("jws_sine"), OscArg::makeInt(node), OscArg::makeInt(0),
                               OscArg::makeInt(1), OscArg::makeString("freq"), OscArg::makeFloat(440.0f),
                               OscArg::makeString("amp"), OscArg::makeFloat(0.15f)}, true);
        });
        schedule(1650, [this, node] {
            sendOsc("/n_set", {OscArg::makeInt(node), OscArg::makeString("gate"), OscArg::makeFloat(0.0f)}, true);
        });
        return true;
    }

    if (action == "osc") {
        const auto parsed = juce::JSON::parse(juce::String(payload));
        if (!parsed.isObject()) return fail("osc: payload must be JSON {target,address,args}.");
        const auto address = parsed.getProperty("address", "").toString().toStdString();
        if (address.empty() || address[0] != '/') return fail("osc: address must start with '/'.");
        const bool toServer = parsed.getProperty("target", "server").toString() != "lang";
        std::vector<OscArg> args;
        if (const auto* arr = parsed.getProperty("args", juce::var()).getArray()) {
            for (const auto& v : *arr) {
                if (v.isInt() || v.isInt64() || v.isBool()) args.push_back(OscArg::makeInt(static_cast<int>(v)));
                else if (v.isDouble()) args.push_back(OscArg::makeFloat(static_cast<float>(static_cast<double>(v))));
                else args.push_back(OscArg::makeString(v.toString().toStdString()));
            }
        }
        return sendOsc(address, args, toServer);
    }

    return fail("Unknown SuperCollider action: " + action);
}

//==============================================================================
// Status
//==============================================================================
SuperColliderStatus SuperColliderManager::getStatus() {
    std::lock_guard<std::mutex> lock(m_mutex);
    SuperColliderStatus s;
    s.isRunning = m_isRunning.load();
    s.isBooting = m_isBooting.load();
    s.isExternal = m_isExternal.load();
    if (s.isBooting) s.statusText = "BOOTING";
    else if (s.isRunning) s.statusText = s.isExternal ? "RUNNING (EXTERNAL SCSYNTH)" : "RUNNING (NATIVE SCSYNTH)";
    else s.statusText = "OFFLINE";

    s.port = m_port.load();
    s.sampleRate = m_sampleRate.load();
    s.numSynths = m_numSynths.load();
    s.numGroups = m_numGroups.load();
    s.numNodes = s.numSynths + s.numGroups;
    s.numUGens = m_numUGens.load();
    s.numSynthDefs = m_numSynthDefs.load();
    s.avgCPU = m_avgCPU.load();
    s.peakCPU = m_peakCPU.load();
    s.binaryPath = m_binaryPath;
    s.sclangPath = m_sclangPath;
    s.lastError = m_lastError;
    s.serverLog = m_serverLog;
    s.visualRunning = m_visualRunning.load();
    s.visualLog = m_visualLog;
    s.langPort = m_langPort.load();
    s.oscSent = m_oscSent.load();
    return s;
}

juce::var SuperColliderManager::getStatusAsVar() {
    const auto status = getStatus();
    auto* obj = new juce::DynamicObject();
    obj->setProperty("isRunning", status.isRunning);
    obj->setProperty("isBooting", status.isBooting);
    obj->setProperty("statusText", juce::String(status.statusText));
    obj->setProperty("port", status.port);
    obj->setProperty("pid", status.pid);
    obj->setProperty("sampleRate", status.sampleRate);
    obj->setProperty("numSynths", status.numSynths);
    obj->setProperty("numGroups", status.numGroups);
    obj->setProperty("numNodes", status.numNodes);
    obj->setProperty("numUGens", status.numUGens);
    obj->setProperty("numSynthDefs", status.numSynthDefs);
    obj->setProperty("avgCPU", status.avgCPU);
    obj->setProperty("peakCPU", status.peakCPU);
    obj->setProperty("binaryPath", juce::String(status.binaryPath));
    obj->setProperty("sclangPath", juce::String(status.sclangPath));
    obj->setProperty("isExternal", status.isExternal);
    obj->setProperty("lastError", juce::String(status.lastError));
    obj->setProperty("serverLog", juce::String(status.serverLog));
    obj->setProperty("visualRunning", status.visualRunning);
    obj->setProperty("visualLog", juce::String(status.visualLog));
    obj->setProperty("langPort", status.langPort);
    obj->setProperty("oscSent", static_cast<double>(status.oscSent));
    return juce::var(obj);
}

juce::String SuperColliderManager::getStatusJson() {
    return juce::JSON::toString(getStatusAsVar());
}

} // namespace johnwalls::johnwalls
