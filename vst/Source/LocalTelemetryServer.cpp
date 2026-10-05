#include "LocalTelemetryServer.h"
#include "PluginProcessor.h"

namespace johnwalls::johnwalls {

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

    // Try primary port, or fall back to 3013 / 3014 if occupied
    if (!m_serverSocket.createListener(m_port, "127.0.0.1")) {
        m_port = 3013;
        if (!m_serverSocket.createListener(m_port, "127.0.0.1")) {
            m_port = 3014;
            m_serverSocket.createListener(m_port, "127.0.0.1");
        }
    }

    startThread(juce::Thread::Priority::normal);
}

void LocalTelemetryServer::stop() {
    m_shouldExit = true;
    signalThreadShouldExit();
    m_serverSocket.close();
    stopThread(500);
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

    // 404
    juce::String notFound =
        "HTTP/1.1 404 Not Found\r\n" + corsHeaders +
        "Content-Length: 0\r\n"
        "Connection: close\r\n\r\n";
    client->write(notFound.toRawUTF8(), static_cast<int>(notFound.getNumBytesAsUTF8()));
}

} // namespace johnwalls::johnwalls
