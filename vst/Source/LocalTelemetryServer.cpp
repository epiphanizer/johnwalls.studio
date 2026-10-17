#include "LocalTelemetryServer.h"
#include "PluginProcessor.h"

namespace johnwalls::johnwalls {

namespace {

juce::StringArray makeLoginPythonCommand(const juce::String& scriptPath)
{
    // Keep login-shell PATH setup while forwarding each argument separately.
    return { "/bin/zsh", "-lc", "exec python3 \"$@\"", "python3", scriptPath };
}

}

LocalTelemetryServer::LocalTelemetryServer(JohnwallsStudioAudioProcessor& processor, int port)
    : Thread("LocalTelemetryServer"), m_processor(processor), m_port(port)
{
}

LocalTelemetryServer::~LocalTelemetryServer() {
    stop();
}

void LocalTelemetryServer::start() {
    if (isThreadRunning()) return;
    m_shouldExit = false;

    // Try primary port, or fall back to higher ports if occupied by other plugin instances
    for (int p = m_port; p <= m_port + 20; ++p) {
        if (m_serverSocket.createListener(p, "127.0.0.1")) {
            m_port = p;
            break;
        }
    }

    startThread(juce::Thread::Priority::normal);
}

void LocalTelemetryServer::stop() {
    m_shouldExit = true;
    signalThreadShouldExit();
    m_serverSocket.close();
    stopThread(2000);
}

void LocalTelemetryServer::run() {
    while (!threadShouldExit() && !m_shouldExit.load()) {
        auto* client = m_serverSocket.waitForNextConnection();
        if (client != nullptr) {
            handleConnection(std::unique_ptr<juce::StreamingSocket>(client));
        }
    }
}

void LocalTelemetryServer::handleConnection(std::unique_ptr<juce::StreamingSocket> client) {
    if (!client || !client->isConnected()) return;

    // Read the full request: headers first, then exactly Content-Length body bytes (capped at 1 MB).
    // A single read() can return a partial request, which previously truncated POST bodies.
    constexpr int kMaxRequestBytes = 1024 * 1024;
    std::string raw;
    raw.reserve(4096);
    int headerEnd = -1;
    int contentLength = 0;
    for (;;) {
        if (client->waitUntilReady(true, 1000) != 1) break;
        char chunk[4096];
        const int n = client->read(chunk, sizeof(chunk), false);
        if (n <= 0) break;
        raw.append(chunk, static_cast<size_t>(n));
        if (static_cast<int>(raw.size()) > kMaxRequestBytes) return;

        if (headerEnd < 0) {
            const auto pos = raw.find("\r\n\r\n");
            if (pos != std::string::npos) {
                headerEnd = static_cast<int>(pos) + 4;
                const juce::String headersLower = juce::String(raw.substr(0, pos)).toLowerCase();
                const int clPos = headersLower.indexOf("content-length:");
                if (clPos >= 0)
                    contentLength = juce::jlimit(0, kMaxRequestBytes, headersLower.substring(clPos + 15).trim().getIntValue());
            }
        }
        if (headerEnd >= 0 && static_cast<int>(raw.size()) >= headerEnd + contentLength) break;
    }
    if (raw.empty()) return;

    juce::String request = juce::String::fromUTF8(raw.data(), static_cast<int>(raw.size()));
    juce::String firstLine = request.upToFirstOccurrenceOf("\r\n", false, false);
    juce::StringArray tokens;
    tokens.addTokens(firstLine, " ", "");

    if (tokens.size() < 2) return;
    juce::String method = tokens[0].toUpperCase();
    juce::String path = tokens[1];

    auto headerValue = [&request](const juce::String& name) -> juce::String {
        const auto headers = request.upToFirstOccurrenceOf("\r\n\r\n", false, false);
        for (const auto& line : juce::StringArray::fromLines(headers)) {
            if (line.startsWithIgnoreCase(name + ":")) return line.fromFirstOccurrenceOf(":", false, false).trim();
        }
        return {};
    };

    // Only the local UI may talk to this server. Without this any web page the user visits could
    // call POST /supercollider/action (which runs sclang code) via the browser (CSRF / DNS rebinding).
    //  - Host must be loopback (blocks DNS rebinding)
    //  - a browser-supplied Origin must be loopback too (blocks cross-site requests)
    auto isLoopbackHost = [](const juce::String& hostPort) {
        auto host = hostPort.trim().toLowerCase();
        if (host.startsWith("[")) host = host.upToFirstOccurrenceOf("]", true, false);
        else host = host.upToFirstOccurrenceOf(":", false, false);
        return host == "127.0.0.1" || host == "localhost" || host == "[::1]";
    };
    const juce::String hostHeader = headerValue("Host");
    const juce::String originHeader = headerValue("Origin");
    bool allowed = hostHeader.isEmpty() || isLoopbackHost(hostHeader);
    if (allowed && originHeader.isNotEmpty()) {
        const auto afterScheme = originHeader.fromFirstOccurrenceOf("://", false, false);
        const bool schemeOk = originHeader.startsWithIgnoreCase("http://") || originHeader.startsWithIgnoreCase("https://");
        // The plugin's own WebView serves the bundled UI from JUCE's resource provider (juce.backend).
        const bool isPluginWebView = afterScheme.trim().toLowerCase().startsWith("juce.backend")
                                  && (originHeader.startsWithIgnoreCase("juce://") || schemeOk);
        allowed = (schemeOk && isLoopbackHost(afterScheme)) || isPluginWebView;
    }
    if (!allowed) {
        const juce::String body = "{\"error\":\"forbidden origin\"}";
        juce::String response =
            "HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: " +
            juce::String(body.getNumBytesAsUTF8()) + "\r\nConnection: close\r\n\r\n" + body;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    juce::String corsHeaders =
        "Access-Control-Allow-Origin: " + (originHeader.isNotEmpty() ? originHeader : juce::String("http://127.0.0.1")) + "\r\n"
        "Vary: Origin\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n";

    if (method == "OPTIONS") {
        juce::String response =
            "HTTP/1.1 204 No Content\r\n" + corsHeaders +
            "Content-Length: 0\r\n"
            "Connection: close\r\n\r\n";
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/telemetry")) {
        juce::String json = m_processor.getTelemetryJsonString();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/sp404/state")) {
        juce::String json = m_processor.buildSP404NativeStateJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/session/tracks")) {
        juce::String json = m_processor.getSessionTracksJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/supercollider/status")) {
        juce::String json = m_processor.getSuperColliderJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/supercollider/boot")) {
        int port = 57110;
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject() && parsed.hasProperty("port")) {
            port = static_cast<int>(parsed.getProperty("port", 57110));
        }
        m_processor.bootSuperCollider(port);
        juce::String json = m_processor.getSuperColliderJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/supercollider/kill")) {
        m_processor.killSuperCollider();
        juce::String json = m_processor.getSuperColliderJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/supercollider/action")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        juce::String action = "freeAll";
        juce::String payload;
        if (parsed.isObject()) {
            action = parsed.getProperty("action", "freeAll").toString();
            payload = parsed.getProperty("payload", "").toString();
        }
        m_processor.executeSuperColliderAction(action, payload);
        juce::String json = m_processor.getSuperColliderJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/reactive_midi/rules")) {
        juce::String json = m_processor.getReactiveMidiRulesJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/reactive_midi/rules")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        m_processor.setReactiveMidiRulesFromUI(parsed);
        juce::String json = m_processor.getReactiveMidiRulesJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/reactive_midi/toggle")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject() && parsed.hasProperty("id")) {
            m_processor.toggleReactiveMidiRule(parsed.getProperty("id", "").toString());
        }
        juce::String json = m_processor.getReactiveMidiRulesJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/reactive_midi/add")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        m_processor.addReactiveMidiRule(parsed);
        juce::String json = m_processor.getReactiveMidiRulesJson();
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/reactive_midi/enable")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        bool en = true;
        if (parsed.isObject() && parsed.hasProperty("enabled")) {
            en = static_cast<bool>(parsed.getProperty("enabled", true));
        }
        m_processor.setReactiveMidiEnabled(en);
        juce::String json = "{\"enabled\":" + juce::String(en ? "true" : "false") + "}";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/als/recent")) {
        juce::Array<juce::File> files;
        auto searchDir = [&](const juce::File& dir) {
            if (dir.isDirectory()) {
                dir.findChildFiles(files, juce::File::findFiles, true, "*.als");
            }
        };

        searchDir(juce::File::getSpecialLocation(juce::File::userDesktopDirectory));
        searchDir(juce::File::getSpecialLocation(juce::File::userMusicDirectory));
        searchDir(juce::File::getSpecialLocation(juce::File::userDocumentsDirectory));
        juce::File cacheVol("/Volumes/cache/archive/music");
        if (cacheVol.isDirectory()) searchDir(cacheVol);
        juce::File jwVol("/Volumes/johnwalls");
        if (jwVol.isDirectory()) {
            juce::File v1 = jwVol.getChildFile("Archive up to Oct 5th 2026/Volume 1");
            if (v1.isDirectory()) searchDir(v1);
            juce::File v1b = jwVol.getChildFile("Backup Oct 6th/Volume 1");
            if (v1b.isDirectory()) searchDir(v1b);
        }

        std::sort(files.begin(), files.end(), [](const juce::File& a, const juce::File& b) {
            return a.getLastModificationTime() > b.getLastModificationTime();
        });

        juce::Array<juce::var> list;
        int count = 0;
        for (const auto& f : files) {
            if (f.getFileName().startsWith(".")) continue;
            juce::DynamicObject::Ptr item = new juce::DynamicObject();
            item->setProperty("name", f.getFileName());
            item->setProperty("projectName", f.getParentDirectory().getFileName());
            item->setProperty("path", f.getFullPathName());
            item->setProperty("modifiedTime", f.getLastModificationTime().toMilliseconds());
            item->setProperty("fileSizeBytes", static_cast<juce::int64>(f.getSize()));
            list.add(item.get());
            if (++count >= 15) break;
        }

        juce::DynamicObject::Ptr root = new juce::DynamicObject();
        root->setProperty("recentProjects", list);
        juce::String json = juce::JSON::toString(juce::var(root.get()), false);

        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/als/parse")) {
        auto queryParam = path.fromFirstOccurrenceOf("path=", false, false);
        queryParam = juce::URL::removeEscapeChars(queryParam);
        juce::File file(queryParam);
        if (file.existsAsFile()) {
            juce::FileInputStream fis(file);
            if (fis.openedOk()) {
                juce::GZIPDecompressorInputStream gz(&fis, false);
                juce::XmlDocument doc(gz.readEntireStreamAsString());
                auto xmlRoot = doc.getDocumentElement();
                if (xmlRoot != nullptr) {
                    auto* liveSet = xmlRoot->getChildByName("LiveSet");
                    if (liveSet != nullptr) {
                        juce::DynamicObject::Ptr res = new juce::DynamicObject();
                        res->setProperty("projectName", file.getFileNameWithoutExtension());
                        res->setProperty("alsPath", file.getFullPathName());
                        res->setProperty("creator", xmlRoot->getStringAttribute("Creator", "Ableton Live"));

                        double tempo = 120.0;
                        if (auto* master = liveSet->getChildByName("MasterTrack")) {
                            if (auto* dev = master->getChildByName("DeviceChain")) {
                                if (auto* mix = dev->getChildByName("Mixer")) {
                                    if (auto* t = mix->getChildByName("Tempo")) {
                                        if (auto* man = t->getChildByName("Manual")) {
                                            tempo = man->getDoubleAttribute("Value", 120.0);
                                        }
                                    }
                                }
                            }
                        }
                        res->setProperty("tempo", tempo);

                        juce::Array<juce::var> trackList;
                        if (auto* tracksEl = liveSet->getChildByName("Tracks")) {
                            int tIdx = 1;
                            for (auto* tNode : tracksEl->getChildIterator()) {
                                juce::DynamicObject::Ptr tObj = new juce::DynamicObject();
                                juce::String tType = tNode->getTagName().toLowerCase();
                                if (tType.contains("midi")) tType = "midi";
                                else if (tType.contains("return")) tType = "return";
                                else tType = "audio";

                                juce::String effName = "";
                                if (auto* nameEl = tNode->getChildByName("Name")) {
                                    if (auto* eff = nameEl->getChildByName("EffectiveName")) {
                                        effName = eff->getStringAttribute("Value", "");
                                    }
                                    if (effName.isEmpty()) {
                                        if (auto* usr = nameEl->getChildByName("UserName")) {
                                            effName = usr->getStringAttribute("Value", "");
                                        }
                                    }
                                }
                                if (effName.isEmpty()) effName = "Track " + juce::String(tIdx);

                                int colorVal = 0;
                                if (auto* col = tNode->getChildByName("Color")) {
                                    colorVal = col->getIntAttribute("Value", 0);
                                }

                                bool isMute = false;
                                bool isArmed = false;
                                bool isSolo = false;
                                double normVol = 0.85;

                                if (auto* dev = tNode->getChildByName("DeviceChain")) {
                                    if (auto* mix = dev->getChildByName("Mixer")) {
                                        if (auto* spk = mix->getChildByName("Speaker")) {
                                            if (auto* man = spk->getChildByName("Manual")) {
                                                isMute = (man->getStringAttribute("Value", "true") == "false");
                                            }
                                        }
                                        if (auto* arm = mix->getChildByName("Arm")) {
                                            if (auto* man = arm->getChildByName("Manual")) {
                                                isArmed = (man->getStringAttribute("Value", "false") == "true");
                                            }
                                        }
                                        if (auto* solo = mix->getChildByName("SoloSink")) {
                                            isSolo = (solo->getStringAttribute("Value", "false") == "true");
                                        }
                                        if (auto* vol = mix->getChildByName("Volume")) {
                                            if (auto* man = vol->getChildByName("Manual")) {
                                                normVol = man->getDoubleAttribute("Value", 0.85);
                                            }
                                        }
                                    }
                                }

                                double peakDb = (normVol > 0.001) ? 20.0 * std::log10(normVol) : -70.0;

                                tObj->setProperty("instanceId", "als_trk_" + juce::String(tIdx));
                                tObj->setProperty("trackName", effName);
                                tObj->setProperty("trackIndex", tIdx);
                                tObj->setProperty("trackType", tType);
                                tObj->setProperty("colorIndex", colorVal);
                                tObj->setProperty("isMute", isMute);
                                tObj->setProperty("isArmed", isArmed);
                                tObj->setProperty("isSolo", isSolo);
                                tObj->setProperty("peakDb", peakDb);
                                tObj->setProperty("rmsDb", peakDb - 8.0);
                                tObj->setProperty("midiChannel", (tIdx % 16) + 1);
                                tObj->setProperty("isMidiActive", false);

                                trackList.add(tObj.get());
                                tIdx++;
                            }
                        }
                        res->setProperty("tracks", trackList);

                        juce::Array<juce::var> sceneList;
                        if (auto* scenesEl = liveSet->getChildByName("Scenes")) {
                            int sIdx = 1;
                            for (auto* sNode : scenesEl->getChildIterator()) {
                                juce::DynamicObject::Ptr sObj = new juce::DynamicObject();
                                juce::String sName = "";
                                if (auto* n = sNode->getChildByName("Name")) {
                                    sName = n->getStringAttribute("Value", "");
                                }
                                if (sName.isEmpty()) sName = "Scene " + juce::String(sIdx);
                                sObj->setProperty("id", "scene_" + juce::String(sIdx));
                                sObj->setProperty("index", sIdx);
                                sObj->setProperty("name", sName);
                                sObj->setProperty("tempo", tempo);
                                sObj->setProperty("timeSignature", "4/4");
                                sObj->setProperty("isCurrent", (sIdx == 1));
                                sceneList.add(sObj.get());
                                sIdx++;
                            }
                        }
                        res->setProperty("scenes", sceneList);

                        juce::String json = juce::JSON::toString(juce::var(res.get()), false);
                        juce::String response =
                            "HTTP/1.1 200 OK\r\n"
                            "Content-Type: application/json\r\n" + corsHeaders +
                            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
                            "Connection: close\r\n\r\n" +
                            json;
                        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
                        return;
                    }
                }
            }
        }

        juce::String errJson = "{\"error\": \"Failed to read or parse .als file\"}";
        juce::String response =
            "HTTP/1.1 404 Not Found\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(errJson.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            errJson;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET") {
        juce::String localPath = path;
        if (localPath.containsChar('?')) {
            localPath = localPath.upToFirstOccurrenceOf("?", false, false);
        }
        if (localPath == "/" || localPath == "/index.html" || localPath.isEmpty()) {
            localPath = "/index.html";
        }

        juce::File distDir("/Users/seanhalls/Desktop/sh/johnwalls_studio/ui/dist");
        juce::File targetFile = distDir.getChildFile(localPath.substring(1));

        if (targetFile.existsAsFile()) {
            juce::MemoryBlock fileData;
            targetFile.loadFileAsData(fileData);

            juce::String mimeType = "text/plain";
            if (targetFile.hasFileExtension(".html")) mimeType = "text/html; charset=utf-8";
            else if (targetFile.hasFileExtension(".js")) mimeType = "application/javascript; charset=utf-8";
            else if (targetFile.hasFileExtension(".css")) mimeType = "text/css; charset=utf-8";
            else if (targetFile.hasFileExtension(".svg")) mimeType = "image/svg+xml";
            else if (targetFile.hasFileExtension(".woff2")) mimeType = "font/woff2";
            else if (targetFile.hasFileExtension(".woff")) mimeType = "font/woff";
            else if (targetFile.hasFileExtension(".json")) mimeType = "application/json";

            juce::String responseHeader =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: " + mimeType + "\r\n" + corsHeaders +
                "Content-Length: " + juce::String(fileData.getSize()) + "\r\n"
                "Connection: close\r\n\r\n";

            client->write(responseHeader.toRawUTF8(), static_cast<int>(responseHeader.getNumBytesAsUTF8()));
            client->write(fileData.getData(), static_cast<int>(fileData.getSize()));
            return;
        }
    }

    if (method == "POST" && path.startsWith("/sp404/trigger")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            int bank = 0;
            auto bankVar = parsed.getProperty("bank", "A");
            if (bankVar.isString()) {
                juce::String bStr = bankVar.toString().toUpperCase();
                if (!bStr.isEmpty()) bank = std::clamp(static_cast<int>(bStr[0] - 'A'), 0, 9);
            } else {
                bank = static_cast<int>(bankVar);
            }
            int padId = static_cast<int>(parsed.getProperty("padId", parsed.getProperty("pad", 1)));
            float vel = static_cast<float>(parsed.getProperty("velocity", 1.0));
            float offset = static_cast<float>(parsed.getProperty("chromaticOffset", 0.0));
            m_processor.triggerSP404Pad(bank, padId, vel, offset);
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/release")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            int bank = 0;
            auto bankVar = parsed.getProperty("bank", "A");
            if (bankVar.isString()) {
                juce::String bStr = bankVar.toString().toUpperCase();
                if (!bStr.isEmpty()) bank = std::clamp(static_cast<int>(bStr[0] - 'A'), 0, 9);
            } else {
                bank = static_cast<int>(bankVar);
            }
            int padId = static_cast<int>(parsed.getProperty("padId", parsed.getProperty("pad", 1)));
            m_processor.releaseSP404Pad(bank, padId);
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/routing")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            juce::String order = parsed.getProperty("order", "before").toString();
            bool bypassed = static_cast<bool>(parsed.getProperty("bypassed", false));
            m_processor.setSP404Routing(order, bypassed);
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/param")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            juce::String name = parsed.getProperty("param", parsed.getProperty("name", "")).toString();
            float val = static_cast<float>(parsed.getProperty("value", 0.0));
            m_processor.setSP404Param(name, val);
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && (path.startsWith("/sp404/stop_all") || path.startsWith("/sp404/stop"))) {
        m_processor.getSP404Engine().stopAll();
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/transpose")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            float val = static_cast<float>(parsed.getProperty("transpose", parsed.getProperty("value", 0.0)));
            m_processor.setSP404GlobalTranspose(val);
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/hold")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            bool hold = static_cast<bool>(parsed.getProperty("hold", parsed.getProperty("value", parsed.getProperty("enabled", false))));
            m_processor.setSP404Hold(hold);
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/pad/label")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            int bank = 0;
            auto bankVar = parsed.getProperty("bank", "A");
            if (bankVar.isString()) {
                juce::String bStr = bankVar.toString().toUpperCase();
                if (!bStr.isEmpty()) bank = std::clamp(static_cast<int>(bStr[0] - 'A'), 0, 9);
            } else {
                bank = static_cast<int>(bankVar);
            }
            int padId = static_cast<int>(parsed.getProperty("padId", parsed.getProperty("pad", 1)));
            juce::String label = parsed.getProperty("label", parsed.getProperty("value", "")).toString();
            m_processor.setSP404PadLabel(bank, padId, label);
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/pad/param")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            int bank = 0;
            auto bankVar = parsed.getProperty("bank", "A");
            if (bankVar.isString()) {
                juce::String bStr = bankVar.toString().toUpperCase();
                if (!bStr.isEmpty()) bank = std::clamp(static_cast<int>(bStr[0] - 'A'), 0, 9);
            } else {
                bank = static_cast<int>(bankVar);
            }
            int padId = static_cast<int>(parsed.getProperty("padId", parsed.getProperty("pad", 1)));
            juce::String param = parsed.getProperty("param", "").toString();
            if (param == "label") {
                juce::String label = parsed.getProperty("value", parsed.getProperty("label", "")).toString();
                m_processor.setSP404PadLabel(bank, padId, label);
            } else {
                float val = static_cast<float>(parsed.getProperty("value", 0.0));
                m_processor.setSP404PadParam(bank, padId, param, val);
            }
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/rack")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        m_processor.syncRackFromUI(parsed);
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/pedal/parameter")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            auto id = parsed.getProperty("pedalId", parsed.getProperty("id", "")).toString();
            auto name = parsed.getProperty("paramName", parsed.getProperty("name", "")).toString();
            float val = static_cast<float>(parsed.getProperty("value", 0.0f));
            if (id.isNotEmpty() && name.isNotEmpty()) {
                m_processor.setPedalParamFromUI(id, name, val);
            }
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/pedal/bypass")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            auto id = parsed.getProperty("pedalId", parsed.getProperty("id", "")).toString();
            bool byp = static_cast<bool>(parsed.getProperty("bypassed", false));
            if (id.isNotEmpty()) {
                m_processor.setPedalBypassedFromUI(id, byp);
            }
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/pedal/remove")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            auto id = parsed.getProperty("id", parsed.getProperty("pedalId", "")).toString();
            if (id.isNotEmpty()) {
                m_processor.removePedalFromUI(id);
            }
        } else if (parsed.isString()) {
            m_processor.removePedalFromUI(parsed.toString());
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/pedal/add")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            auto type = parsed.getProperty("type", "").toString();
            auto id = parsed.getProperty("id", "").toString();
            if (type.isNotEmpty() && id.isNotEmpty()) {
                m_processor.addPedalFromUI(type, id);
            }
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/parameter")) {
        // Extract JSON body after double CRLF
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            auto paramId = parsed.getProperty("id", "").toString();
            float val = static_cast<float>(parsed.getProperty("value", 0.0f));
            if (paramId.isNotEmpty()) {
                m_processor.setParameterFromUI(paramId, val);
            }
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/inspect")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        if (parsed.isObject()) {
            auto nodeId = parsed.getProperty("id", "master").toString();
            m_processor.setInspectedNode(nodeId.toStdString());
        }
        juce::String reply = "{\"ok\":true}\r\n";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" +
            reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    // ---- Audio Take Recorder & Studio Dispatch Endpoints ----
    if (method == "GET" && path.startsWith("/take/status")) {
        juce::var st = GlobalSessionHub::getInstance().getTakeStatus(&m_processor.getTakeRecorder());
        juce::String json = juce::JSON::toString(st, false);
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/take/recent")) {
        juce::Array<juce::var> list = m_processor.getTakeRecorder().getRecentTakes();
        juce::DynamicObject::Ptr root = new juce::DynamicObject();
        root->setProperty("takes", list);
        juce::String json = juce::JSON::toString(juce::var(root.get()), false);
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/take/record/start")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        juce::String defaultTrack = juce::String(m_processor.getTrackName());
        juce::String trackName = parsed.isObject() ? parsed.getProperty("trackName", defaultTrack).toString() : defaultTrack;
        juce::String projName = parsed.isObject() ? parsed.getProperty("projectName", "").toString() : "";
        double bpm = parsed.isObject() ? static_cast<double>(parsed.getProperty("bpm", m_processor.getCurrentBpm())) : static_cast<double>(m_processor.getCurrentBpm());

        juce::String resolvedTrack;
        juce::String errorMsg;
        bool ok = GlobalSessionHub::getInstance().startRecordingTake(trackName, projName, bpm, resolvedTrack, errorMsg);
        if (!ok) {
            ok = m_processor.getTakeRecorder().startRecording(trackName, projName, bpm);
            resolvedTrack = trackName;
        }

        juce::DynamicObject::Ptr replyObj = new juce::DynamicObject();
        replyObj->setProperty("ok", ok);
        replyObj->setProperty("isRecording", ok);
        replyObj->setProperty("trackName", resolvedTrack);
        if (!ok && errorMsg.isNotEmpty()) {
            replyObj->setProperty("error", errorMsg);
        }

        juce::String reply = juce::JSON::toString(juce::var(replyObj.get()), false);
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/take/record/stop")) {
        juce::var take = GlobalSessionHub::getInstance().stopRecordingTake();
        if (take.isVoid() || !take.isObject()) {
            take = m_processor.getTakeRecorder().stopRecording();
        }
        juce::DynamicObject::Ptr root = new juce::DynamicObject();
        root->setProperty("ok", true);
        root->setProperty("take", take);
        juce::String json = juce::JSON::toString(juce::var(root.get()), false);
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/take/auto_rec")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        bool enabled = parsed.isObject() && static_cast<bool>(parsed.getProperty("enabled", true));
        GlobalSessionHub::getInstance().setAutoRecTakeEnabled(enabled);
        juce::String reply = "{\"ok\":true,\"autoRecEnabled\":" + juce::String(enabled ? "true" : "false") + "}";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/take/audio")) {
        auto queryParam = path.fromFirstOccurrenceOf("id=", false, false);
        if (queryParam.containsChar('&')) queryParam = queryParam.upToFirstOccurrenceOf("&", false, false);
        queryParam = juce::URL::removeEscapeChars(queryParam);
        auto wavFile = m_processor.getTakeRecorder().getTakeAudioFile(queryParam);
        if (wavFile.existsAsFile()) {
            juce::MemoryBlock data;
            wavFile.loadFileAsData(data);
            juce::String responseHeader =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: audio/wav\r\n" + corsHeaders +
                "Content-Length: " + juce::String(data.getSize()) + "\r\n"
                "Connection: close\r\n\r\n";
            client->write(responseHeader.toRawUTF8(), static_cast<int>(responseHeader.getNumBytesAsUTF8()));
            client->write(data.getData(), static_cast<int>(data.getSize()));
            return;
        }
        juce::String notFoundJson = "{\"error\":\"Audio file not found\"}";
        juce::String response =
            "HTTP/1.1 404 Not Found\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(notFoundJson.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + notFoundJson;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/take/visual")) {
        auto queryParam = path.fromFirstOccurrenceOf("id=", false, false);
        if (queryParam.containsChar('&')) queryParam = queryParam.upToFirstOccurrenceOf("&", false, false);
        queryParam = juce::URL::removeEscapeChars(queryParam);
        auto htmlFile = m_processor.getTakeRecorder().getTakeVisualHtmlFile(queryParam);
        if (htmlFile.existsAsFile()) {
            juce::String content = htmlFile.loadFileAsString();
            juce::String response =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: text/html; charset=utf-8\r\n" + corsHeaders +
                "Content-Length: " + juce::String(content.getNumBytesAsUTF8()) + "\r\n"
                "Connection: close\r\n\r\n" + content;
            client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
            return;
        }
        juce::String notFoundJson = "{\"error\":\"Visual HTML file not found for take\"}";
        juce::String response =
            "HTTP/1.1 404 Not Found\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(notFoundJson.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + notFoundJson;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "DELETE" && path.startsWith("/take")) {
        auto queryParam = path.fromFirstOccurrenceOf("id=", false, false);
        if (queryParam.containsChar('&')) queryParam = queryParam.upToFirstOccurrenceOf("&", false, false);
        queryParam = juce::URL::removeEscapeChars(queryParam);
        bool deleted = m_processor.getTakeRecorder().deleteTake(queryParam);
        juce::String reply = deleted ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"Take not found or could not delete\"}";
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(reply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + reply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/take/publish")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        juce::String takeId = parsed.isObject() ? parsed.getProperty("id", parsed.getProperty("takeId", "")).toString() : "";
        juce::String title = parsed.isObject() ? parsed.getProperty("title", "").toString() : "";
        juce::String artist = parsed.isObject() ? parsed.getProperty("artist", "John Walls").toString() : "John Walls";
        juce::String desc = parsed.isObject() ? parsed.getProperty("description", "").toString() : "";
        juce::String preset = parsed.isObject() ? parsed.getProperty("visualizerPreset", "supercollider-lissajous").toString() : "supercollider-lissajous";
        juce::String targetUrl = parsed.isObject() ? parsed.getProperty("targetUrl", "https://johnwalls.studio/api/johnwalls/publish").toString() : "https://johnwalls.studio/api/johnwalls/publish";

        auto wavFile = m_processor.getTakeRecorder().getTakeAudioFile(takeId);
        auto metaFile = m_processor.getTakeRecorder().getTakeMetaFile(takeId);
        auto visHtmlFile = m_processor.getTakeRecorder().getTakeVisualHtmlFile(takeId);

        if (!wavFile.existsAsFile()) {
            juce::String errJson = "{\"ok\":false,\"error\":\"Audio take WAV file not found: " + takeId + "\"}";
            juce::String response =
                "HTTP/1.1 404 Not Found\r\n"
                "Content-Type: application/json\r\n" + corsHeaders +
                "Content-Length: " + juce::String(errJson.getNumBytesAsUTF8()) + "\r\n"
                "Connection: close\r\n\r\n" + errJson;
            client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
            return;
        }

        juce::String metaStr = metaFile.existsAsFile() ? metaFile.loadFileAsString() : "{}";

        // Dispatch HTTP multipart upload via juce::URL
        juce::URL url(targetUrl);
        url = url.withFileToUpload("audio", wavFile, "audio/wav")
                 .withParameter("id", takeId)
                 .withParameter("title", title.isEmpty() ? takeId : title)
                 .withParameter("artist", artist)
                 .withParameter("description", desc)
                 .withParameter("visualizerPreset", preset)
                 .withParameter("metadata", metaStr);
        if (visHtmlFile.existsAsFile()) {
            url = url.withFileToUpload("visualHtml", visHtmlFile, "text/html");
        }

        auto stream = url.createInputStream(juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inPostData)
                                                .withNumRedirectsToFollow(5)
                                                .withConnectionTimeoutMs(30000));
        juce::String serverReply;
        bool uploadSuccess = false;
        if (stream != nullptr) {
            serverReply = stream->readEntireStreamAsString();
            uploadSuccess = true;
        } else {
            // Local fallback bundle when offline or testing without cloud endpoint
            juce::DynamicObject::Ptr fallback = new juce::DynamicObject();
            fallback->setProperty("ok", true);
            fallback->setProperty("offlineBundle", true);
            fallback->setProperty("takeId", takeId);
            fallback->setProperty("title", title.isEmpty() ? takeId : title);
            fallback->setProperty("publicUrl", "https://johnwalls.studio/studio");
            fallback->setProperty("localHtmlUrl", "file://" + visHtmlFile.getFullPathName());
            fallback->setProperty("localAudioUrl", "file://" + wavFile.getFullPathName());
            fallback->setProperty("visualizerPreset", preset);
            fallback->setProperty("message", "Audio take and SuperCollider visualizer bundled locally in takes directory.");
            serverReply = juce::JSON::toString(juce::var(fallback.get()), false);
            uploadSuccess = true;
        }

        juce::String response =
            "HTTP/1.1 " + juce::String(uploadSuccess ? "200 OK" : "502 Bad Gateway") + "\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(serverReply.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + serverReply;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/studio/deploy")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        juce::String deployUrl = "https://johnwalls.studio/api/johnwalls/deploy";
        juce::String deployToken = "";
        if (parsed.isObject()) {
            if (parsed.hasProperty("deployUrl")) deployUrl = parsed.getProperty("deployUrl", deployUrl).toString();
            if (parsed.hasProperty("deployToken")) deployToken = parsed.getProperty("deployToken", "").toString();
        }

        juce::ChildProcess process;
        juce::StringArray cmd { "/bin/zsh", "-lc",
                                "export PATH=\"$HOME/.nvm/versions/node/v24.2.0/bin:$PATH:/usr/local/bin:/opt/homebrew/bin\" && cd /Users/seanhalls/Desktop/sh/johnwalls_studio && exec node scripts/push-to-studio.mjs \"$@\"",
                                "push-to-studio", "--url", deployUrl };
        if (deployToken.isNotEmpty()) {
            cmd.add("--token");
            cmd.add(deployToken);
        }
        bool started = process.start(cmd);
        if (started) {
            juce::String output = process.readAllProcessOutput();
            auto exitCode = process.getExitCode();
            bool ok = (exitCode == 0);
            juce::DynamicObject::Ptr replyObj = new juce::DynamicObject();
            replyObj->setProperty("ok", ok);
            replyObj->setProperty("exitCode", static_cast<int>(exitCode));
            replyObj->setProperty("output", output);
            replyObj->setProperty("publicUrl", "https://johnwalls.studio/app");

            juce::String json = juce::JSON::toString(juce::var(replyObj.get()), false);
            juce::String response =
                "HTTP/1.1 " + juce::String(ok ? "200 OK" : "500 Internal Server Error") + "\r\n"
                "Content-Type: application/json\r\n" + corsHeaders +
                "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
                "Connection: close\r\n\r\n" + json;
            client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
            return;
        } else {
            juce::String errJson = "{\"ok\":false,\"error\":\"Failed to spawn deploy process\"}";
            juce::String response =
                "HTTP/1.1 500 Internal Server Error\r\n"
                "Content-Type: application/json\r\n" + corsHeaders +
                "Content-Length: " + juce::String(errJson.getNumBytesAsUTF8()) + "\r\n"
                "Connection: close\r\n\r\n" + errJson;
            client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
            return;
        }
    }

    if (method == "GET" && (path.startsWith("/hardware/status") || path.startsWith("/card/status"))) {
        juce::ChildProcess process;
        juce::String pyCmd = "/bin/zsh -lc \"python3 /Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/hardware_sync.py --status\"";
        bool started = process.start(pyCmd);
        juce::String output = "";
        if (started) {
            output = process.readAllProcessOutput().trim();
        }

        auto parsed = juce::JSON::parse(output);
        if (path.startsWith("/hardware/status")) {
            juce::String json = parsed.isObject() ? juce::JSON::toString(parsed, false) : output;
            if (json.isEmpty() || !parsed.isObject()) {
                json = "{\"sp404\":{\"mounted\":false},\"rc600\":{\"mounted\":false},\"anyMounted\":false}";
            }
            juce::String response =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json\r\n" + corsHeaders +
                "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
                "Connection: close\r\n\r\n" + json;
            client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
            return;
        }

        // Backward-compatible /card/status synthesis
        juce::DynamicObject::Ptr res = new juce::DynamicObject();
        if (parsed.isObject()) {
            auto spObj = parsed.getProperty("sp404", juce::var()).getDynamicObject();
            auto rcObj = parsed.getProperty("rc600", juce::var()).getDynamicObject();
            bool spMounted = spObj != nullptr && static_cast<bool>(spObj->getProperty("mounted"));
            bool rcMounted = rcObj != nullptr && static_cast<bool>(rcObj->getProperty("mounted"));

            if (spMounted) {
                res->setProperty("mounted", true);
                res->setProperty("mountPath", spObj->getProperty("mountPath"));
                res->setProperty("volumeName", spObj->getProperty("volumeName"));
                res->setProperty("freeBytes", spObj->getProperty("freeBytes"));
                res->setProperty("totalBytes", spObj->getProperty("totalBytes"));
                res->setProperty("sampleCount", spObj->getProperty("sampleCount"));
                res->setProperty("hasRolandImport", spObj->getProperty("hasRolandImport"));
                res->setProperty("hasRolandWave", false);
                res->setProperty("hasNamedStems", false);
            } else if (rcMounted) {
                res->setProperty("mounted", true);
                res->setProperty("mountPath", rcObj->getProperty("mountPath"));
                res->setProperty("volumeName", rcObj->getProperty("volumeName"));
                res->setProperty("freeBytes", rcObj->getProperty("freeBytes"));
                res->setProperty("totalBytes", rcObj->getProperty("totalBytes"));
                res->setProperty("stemCount", rcObj->getProperty("trackCount"));
                res->setProperty("hasRolandImport", false);
                res->setProperty("hasRolandWave", rcObj->getProperty("hasRolandWave"));
                res->setProperty("hasNamedStems", false);
            } else {
                res->setProperty("mounted", false);
                res->setProperty("mountPath", "");
                res->setProperty("volumeName", "");
                res->setProperty("freeBytes", 0.0);
                res->setProperty("totalBytes", 0.0);
                res->setProperty("hasRolandImport", false);
                res->setProperty("hasRolandWave", false);
                res->setProperty("hasNamedStems", false);
                res->setProperty("sampleCount", 0);
                res->setProperty("stemCount", 0);
            }
        } else {
            res->setProperty("mounted", false);
            res->setProperty("mountPath", "");
            res->setProperty("volumeName", "");
            res->setProperty("freeBytes", 0.0);
            res->setProperty("totalBytes", 0.0);
            res->setProperty("hasRolandImport", false);
            res->setProperty("hasRolandWave", false);
            res->setProperty("hasNamedStems", false);
            res->setProperty("sampleCount", 0);
            res->setProperty("stemCount", 0);
        }

        juce::String json = juce::JSON::toString(juce::var(res.get()), false);
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && (path.startsWith("/hardware/sync") || path.startsWith("/card/export"))) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        juce::String target = "all";
        juce::String customPath = "";
        if (parsed.isObject()) {
            if (parsed.hasProperty("target")) {
                target = parsed.getProperty("target", "all").toString();
            }
            if (parsed.hasProperty("targetDir")) {
                customPath = parsed.getProperty("targetDir", "").toString();
            } else if (parsed.hasProperty("path")) {
                customPath = parsed.getProperty("path", "").toString();
            }
        }

        juce::ChildProcess process;
        juce::StringArray pyCmd = makeLoginPythonCommand("/Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/hardware_sync.py");
        pyCmd.add("--sync");
        pyCmd.add("--target");
        pyCmd.add(target);
        if (customPath.isNotEmpty()) {
            pyCmd.add("--path");
            pyCmd.add(customPath);
        }

        bool started = process.start(pyCmd);
        juce::String output = "";
        int exitCode = 0;
        if (started) {
            output = process.readAllProcessOutput().trim();
            exitCode = static_cast<int>(process.getExitCode());
        }

        auto resJson = juce::JSON::parse(output);
        juce::String jsonOut = resJson.isObject() ? juce::JSON::toString(resJson, false) : output;
        if (jsonOut.isEmpty()) {
            jsonOut = exitCode == 0 ? "{\"ok\":true,\"message\":\"Hardware sync completed successfully.\"}"
                                   : "{\"ok\":false,\"error\":\"Hardware sync failed or exited with an error.\"}";
        }

        juce::String response =
            "HTTP/1.1 " + juce::String(exitCode == 0 ? "200 OK" : "400 Bad Request") + "\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(jsonOut.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + jsonOut;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/bounce/status")) {
        juce::ChildProcess process;
        juce::String pyCmd = "/bin/zsh -lc \"python3 /Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/als_group_bouncer.py --status\"";
        bool started = process.start(pyCmd);
        juce::String output = "";
        if (started) {
            output = process.readAllProcessOutput();
        }
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(output.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + output;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/bounce/open")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);
        juce::String target = "";
        if (parsed.isObject() && parsed.hasProperty("target")) {
            target = parsed.getProperty("target", "").toString();
        }

        juce::ChildProcess process;
        juce::StringArray pyCmd = makeLoginPythonCommand("/Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/als_group_bouncer.py");
        pyCmd.add("--open");
        pyCmd.add(target);
        bool started = process.start(pyCmd);
        juce::String output = "";
        int exitCode = 0;
        if (started) {
            output = process.readAllProcessOutput();
            exitCode = static_cast<int>(process.getExitCode());
        }

        juce::DynamicObject::Ptr resObj = new juce::DynamicObject();
        resObj->setProperty("ok", exitCode == 0);
        resObj->setProperty("output", output);

        juce::String json = juce::JSON::toString(juce::var(resObj.get()), false);
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/bounce/list")) {
        juce::String alsPath = "";
        if (path.contains("?als=")) {
            alsPath = juce::URL::removeEscapeChars(path.fromFirstOccurrenceOf("?als=", false, false)).trim();
        }

        juce::ChildProcess process;
        juce::StringArray pyCmd = makeLoginPythonCommand("/Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/als_group_bouncer.py");
        pyCmd.add("--list");
        if (alsPath.isNotEmpty()) {
            pyCmd.add("--als");
            pyCmd.add(alsPath);
        }

        bool started = process.start(pyCmd);
        juce::String output = "";
        int exitCode = 0;
        if (started) {
            output = process.readAllProcessOutput();
            exitCode = static_cast<int>(process.getExitCode());
        }

        juce::DynamicObject::Ptr resObj = new juce::DynamicObject();
        resObj->setProperty("ok", exitCode == 0);
        resObj->setProperty("als", alsPath);
        resObj->setProperty("output", output);

        juce::String json = juce::JSON::toString(juce::var(resObj.get()), false);
        juce::String response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(json.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + json;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }


    if (method == "POST" && path.startsWith("/bounce/group")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);

        juce::String alsPath = "";
        juce::String groups = "";
        juce::String track = "";
        int memory = 0;
        int rc600Track = 0;
        int autoSong = 0;

        if (parsed.isObject()) {
            if (parsed.hasProperty("als")) alsPath = parsed.getProperty("als", "").toString().trim();
            if (parsed.hasProperty("groups")) groups = parsed.getProperty("groups", "").toString().trim();
            if (parsed.hasProperty("track")) track = parsed.getProperty("track", "").toString().trim();
            if (parsed.hasProperty("memory")) memory = static_cast<int>(parsed.getProperty("memory", 0));
            if (parsed.hasProperty("rc600Track")) rc600Track = static_cast<int>(parsed.getProperty("rc600Track", 0));
            if (parsed.hasProperty("autoSong")) autoSong = static_cast<int>(parsed.getProperty("autoSong", 0));
        }

        juce::StringArray pyArgs = makeLoginPythonCommand("/Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/als_group_bouncer.py");
        if (alsPath.isNotEmpty()) {
            pyArgs.add("--als");
            pyArgs.add(alsPath);
        }
        if (autoSong > 0) {
            pyArgs.add("--auto-song");
            pyArgs.add(juce::String(autoSong));
        } else {
            if (groups.isNotEmpty()) {
                pyArgs.add("--groups");
                pyArgs.add(groups);
            }
            if (track.isNotEmpty()) {
                pyArgs.add("--track");
                pyArgs.add(track);
            }
            if (memory > 0 && rc600Track > 0) {
                pyArgs.add("--patch-rc600");
                pyArgs.add("--memory");
                pyArgs.add(juce::String(memory));
                pyArgs.add("--rc600-track");
                pyArgs.add(juce::String(rc600Track));
            }
        }

        juce::ChildProcess process;
        bool started = process.start(pyArgs);
        juce::String output = "";
        int exitCode = 0;
        if (started) {
            output = process.readAllProcessOutput().trim();
            exitCode = static_cast<int>(process.getExitCode());
        }

        auto resJson = juce::JSON::parse(output);
        juce::String jsonOut = resJson.isObject() ? juce::JSON::toString(resJson, false) : output;
        if (jsonOut.isEmpty()) {
            jsonOut = exitCode == 0 ? "{\"ok\":true,\"message\":\"Bounce completed successfully.\"}"
                                   : "{\"ok\":false,\"error\":\"Bounce process failed.\"}";
        }

        juce::String response =
            "HTTP/1.1 " + juce::String(exitCode == 0 ? "200 OK" : "400 Bad Request") + "\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(jsonOut.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + jsonOut;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "GET" && path.startsWith("/sp404/finder/list")) {
        juce::String track = "";
        juce::String als = "";
        if (path.contains("?")) {
            auto query = path.fromFirstOccurrenceOf("?", false, false);
            juce::StringArray params;
            params.addTokens(query, "&", "");
            for (auto& p : params) {
                if (p.startsWith("track=")) track = juce::URL::removeEscapeChars(p.fromFirstOccurrenceOf("track=", false, false)).trim();
                if (p.startsWith("als=")) als = juce::URL::removeEscapeChars(p.fromFirstOccurrenceOf("als=", false, false)).trim();
            }
        }

        juce::StringArray pyArgs = makeLoginPythonCommand("/Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/sp404_sample_finder.py");
        pyArgs.add("--find");
        pyArgs.add(track);
        pyArgs.add("--json");
        if (als.isNotEmpty()) {
            pyArgs.add("--als");
            pyArgs.add(als);
        }

        juce::ChildProcess process;
        bool started = process.start(pyArgs);
        juce::String output = "";
        int exitCode = 0;
        if (started) {
            output = process.readAllProcessOutput().trim();
            exitCode = static_cast<int>(process.getExitCode());
        }

        juce::String response =
            "HTTP/1.1 " + juce::String(exitCode == 0 ? "200 OK" : "400 Bad Request") + "\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(output.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + output;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/finder/grab")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);

        juce::String track = "";
        int instance = 1;
        juce::String bank = "A";
        int pad = 1;
        juce::String als = "";
        bool patchCard = false;
        juce::String label = "";

        if (parsed.isObject()) {
            track = parsed.getProperty("track", "").toString().trim();
            instance = static_cast<int>(parsed.getProperty("instance", 1));
            bank = parsed.getProperty("bank", "A").toString().trim();
            pad = static_cast<int>(parsed.getProperty("pad", 1));
            als = parsed.getProperty("als", "").toString().trim();
            patchCard = static_cast<bool>(parsed.getProperty("patchCard", false));
            label = parsed.getProperty("label", "").toString().trim();
        }

        juce::StringArray pyArgs = makeLoginPythonCommand("/Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/sp404_sample_finder.py");
        pyArgs.add("--grab");
        pyArgs.add(track);
        pyArgs.add("--instance");
        pyArgs.add(juce::String(instance));
        pyArgs.add("--bank");
        pyArgs.add(bank);
        pyArgs.add("--pad");
        pyArgs.add(juce::String(pad));
        if (als.isNotEmpty()) {
            pyArgs.add("--als");
            pyArgs.add(als);
        }
        if (patchCard) pyArgs.add("--patch-card");
        pyArgs.add("--json");

        juce::ChildProcess process;
        bool started = process.start(pyArgs);
        juce::String output = "";
        int exitCode = 0;
        if (started) {
            output = process.readAllProcessOutput().trim();
            exitCode = static_cast<int>(process.getExitCode());
        }

        auto resJson = juce::JSON::parse(output);
        if (resJson.isObject() && static_cast<bool>(resJson.getProperty("ok", false))) {
            juce::String filePath = resJson.getProperty("filePath", "").toString();
            juce::File f(filePath);
            if (f.existsAsFile()) {
                juce::WavAudioFormat wavFormat;
                std::unique_ptr<juce::AudioFormatReader> reader(wavFormat.createReaderFor(f.createInputStream().release(), true));
                if (reader && reader->lengthInSamples > 0) {
                    const int bankIdx = std::clamp(static_cast<int>(bank.toUpperCase()[0] - 'A'), 0, 9);
                    const int numChannels = juce::jlimit(1, 2, static_cast<int>(reader->numChannels));
                    const int numSamples = static_cast<int>(reader->lengthInSamples);
                    juce::AudioBuffer<float> sampleBuf(numChannels, numSamples);
                    reader->read(&sampleBuf, 0, numSamples, 0, true, numChannels > 1);
                    m_processor.getSP404Engine().loadCustomSample(
                        bankIdx, pad,
                        sampleBuf.getReadPointer(0),
                        numChannels > 1 ? sampleBuf.getReadPointer(1) : nullptr,
                        static_cast<size_t>(numSamples),
                        static_cast<float>(reader->sampleRate),
                        label.isNotEmpty() ? label.toStdString() : track.toStdString(),
                        0.0f, 1.0f, 0.0f, false, false, 0
                    );
                }
            }
        }

        juce::String response =
            "HTTP/1.1 " + juce::String(exitCode == 0 ? "200 OK" : "400 Bad Request") + "\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(output.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + output;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    if (method == "POST" && path.startsWith("/sp404/finder/pattern")) {
        juce::String body = request.fromFirstOccurrenceOf("\r\n\r\n", false, false);
        auto parsed = juce::JSON::parse(body);

        juce::String track = "";
        juce::String bank = "A";
        int count = 12;
        juce::String als = "";
        bool patchCard = false;

        if (parsed.isObject()) {
            track = parsed.getProperty("track", "").toString().trim();
            bank = parsed.getProperty("bank", "A").toString().trim();
            count = static_cast<int>(parsed.getProperty("count", 12));
            als = parsed.getProperty("als", "").toString().trim();
            patchCard = static_cast<bool>(parsed.getProperty("patchCard", false));
        }

        juce::StringArray pyArgs = makeLoginPythonCommand("/Users/seanhalls/Desktop/sh/johnwalls_studio/scripts/sp404_sample_finder.py");
        pyArgs.add("--pattern");
        pyArgs.add(track);
        pyArgs.add("--bank");
        pyArgs.add(bank);
        pyArgs.add("--count");
        pyArgs.add(juce::String(count));
        if (als.isNotEmpty()) {
            pyArgs.add("--als");
            pyArgs.add(als);
        }
        if (patchCard) pyArgs.add("--patch-card");
        pyArgs.add("--json");

        juce::ChildProcess process;
        bool started = process.start(pyArgs);
        juce::String output = "";
        int exitCode = 0;
        if (started) {
            output = process.readAllProcessOutput().trim();
            exitCode = static_cast<int>(process.getExitCode());
        }

        auto resJson = juce::JSON::parse(output);
        if (resJson.isObject() && static_cast<bool>(resJson.getProperty("ok", false))) {
            const int bankIdx = std::clamp(static_cast<int>(bank.toUpperCase()[0] - 'A'), 0, 9);
            auto padsVar = resJson.getProperty("pads", juce::var());
            if (padsVar.isArray()) {
                juce::WavAudioFormat wavFormat;
                for (int i = 0; i < padsVar.size(); ++i) {
                    auto padObj = padsVar[i];
                    if (!padObj.isObject()) continue;
                    int padNum = static_cast<int>(padObj.getProperty("pad", i + 1));
                    juce::String fp = padObj.getProperty("filePath", "").toString();
                    juce::String plabel = padObj.getProperty("label", "").toString();
                    juce::File f(fp);
                    if (f.existsAsFile()) {
                        std::unique_ptr<juce::AudioFormatReader> reader(wavFormat.createReaderFor(f.createInputStream().release(), true));
                        if (reader && reader->lengthInSamples > 0) {
                            const int numChannels = juce::jlimit(1, 2, static_cast<int>(reader->numChannels));
                            const int numSamples = static_cast<int>(reader->lengthInSamples);
                            juce::AudioBuffer<float> sampleBuf(numChannels, numSamples);
                            reader->read(&sampleBuf, 0, numSamples, 0, true, numChannels > 1);
                            m_processor.getSP404Engine().loadCustomSample(
                                bankIdx, padNum,
                                sampleBuf.getReadPointer(0),
                                numChannels > 1 ? sampleBuf.getReadPointer(1) : nullptr,
                                static_cast<size_t>(numSamples),
                                static_cast<float>(reader->sampleRate),
                                plabel.toStdString(),
                                0.0f, 1.0f, 0.0f, false, false, 0
                            );
                        }
                    }
                }
            }
        }

        juce::String response =
            "HTTP/1.1 " + juce::String(exitCode == 0 ? "200 OK" : "400 Bad Request") + "\r\n"
            "Content-Type: application/json\r\n" + corsHeaders +
            "Content-Length: " + juce::String(output.getNumBytesAsUTF8()) + "\r\n"
            "Connection: close\r\n\r\n" + output;
        client->write(response.toRawUTF8(), static_cast<int>(response.getNumBytesAsUTF8()));
        return;
    }

    // 404
    juce::String notFound =
        "HTTP/1.1 404 Not Found\r\n" + corsHeaders +
        "Content-Length: 0\r\n"
        "Connection: close\r\n\r\n";
    client->write(notFound.toRawUTF8(), static_cast<int>(notFound.getNumBytesAsUTF8()));
}

} // namespace johnwalls::johnwalls
