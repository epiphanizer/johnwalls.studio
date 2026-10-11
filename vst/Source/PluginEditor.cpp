#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <juce_audio_formats/juce_audio_formats.h>

namespace johnwalls::johnwalls {

juce::String JohnwallsStudioAudioProcessorEditor::buildSP404NativeStateJson() const {
    const auto& engine = m_processorRef.getSP404Engine();
    auto state = new juce::DynamicObject();
    state->setProperty("source", "native-sp404");
    state->setProperty("version", 1);
    state->setProperty("volume", engine.getParam("volume"));
    state->setProperty("activeMfx", static_cast<int>(engine.getParam("mfx")));
    state->setProperty("ctrl1", engine.getParam("ctrl1"));
    state->setProperty("ctrl2", engine.getParam("ctrl2"));
    state->setProperty("ctrl3", engine.getParam("ctrl3"));
    state->setProperty("placement", engine.getPlacement() == SP404Placement::AfterPedals ? "after" : "before");
    state->setProperty("bypassed", engine.isBypassed());
    state->setProperty("chromatic", engine.isChromaticMode());
    state->setProperty("chromaticRootBank", engine.getChromaticRootBank());
    state->setProperty("chromaticRootPad", engine.getChromaticRootPad());

    juce::Array<juce::var> pads;
    for (int bank = 0; bank < static_cast<int>(SP404Engine::kNumBanks); ++bank) {
        for (int padId = 1; padId <= static_cast<int>(SP404Engine::kPadsPerBank); ++padId) {
            const auto* pad = engine.getPad(bank, padId);
            if (pad == nullptr) continue;
            auto item = new juce::DynamicObject();
            item->setProperty("bank", bank);
            item->setProperty("padId", padId);
            item->setProperty("hasSample", !pad->sampleL.empty());
            item->setProperty("label", juce::String(pad->label));
            item->setProperty("category", juce::String(pad->category));
            item->setProperty("duration", pad->durationSeconds);
            item->setProperty("sampleRate", pad->sampleRate);
            item->setProperty("pitch", pad->pitchSemitones);
            item->setProperty("volume", pad->volume);
            item->setProperty("pan", pad->pan);
            item->setProperty("mode", pad->isLoop ? "loop" : "oneshot");
            item->setProperty("reverse", pad->isReverse);
            item->setProperty("muteGroup", pad->muteGroup);
            pads.add(juce::var(item));
        }
    }
    state->setProperty("pads", juce::var(pads));
    return juce::JSON::toString(juce::var(state));
}

JohnwallsStudioAudioProcessorEditor::JohnwallsStudioAudioProcessorEditor(JohnwallsStudioAudioProcessor& p)
    : AudioProcessorEditor(&p), m_processorRef(p)
{
    juce::WebBrowserComponent::Options options;
    options = options.withNativeIntegrationEnabled(true)
                     .withResourceProvider([](const juce::String& path) -> std::optional<juce::WebBrowserComponent::Resource> {
                         juce::String localPath = path;
                         if (localPath.containsChar('?')) {
                             localPath = localPath.upToFirstOccurrenceOf("?", false, false);
                         }
                         if (localPath == "/" || localPath == "/index.html" || localPath.isEmpty()) {
                             localPath = "/index.html";
                         }
                         if (localPath.startsWithChar('/')) {
                             localPath = localPath.substring(1);
                         }

                         juce::File distDir("/Users/seanhalls/Desktop/sh/johnwalls_studio/ui/dist");
                         juce::File file = distDir.getChildFile(localPath);
                         if (!file.existsAsFile()) return std::nullopt;

                         juce::MemoryBlock mb;
                         file.loadFileAsData(mb);

                         juce::String mime = "text/plain";
                         if (file.hasFileExtension(".html")) mime = "text/html; charset=utf-8";
                         else if (file.hasFileExtension(".js")) mime = "application/javascript; charset=utf-8";
                         else if (file.hasFileExtension(".css")) mime = "text/css; charset=utf-8";
                         else if (file.hasFileExtension(".svg")) mime = "image/svg+xml";
                         else if (file.hasFileExtension(".woff2")) mime = "font/woff2";
                         else if (file.hasFileExtension(".woff")) mime = "font/woff";
                         else if (file.hasFileExtension(".json")) mime = "application/json";

                         std::vector<std::byte> bytes(mb.getSize());
                         std::memcpy(bytes.data(), mb.getData(), mb.getSize());
                         return juce::WebBrowserComponent::Resource{ std::move(bytes), mime };
                     });

    const auto nativeScript = juce::String(
        "window.__JUCE_INVOKE_NATIVE__ = function(fnName, payload) {\n"
        "  try {\n"
        "    if (window.__JUCE__ && window.__JUCE__.backend && typeof window.__JUCE__.backend.emitEvent === 'function') {\n"
        "      window.__JUCE__.backend.emitEvent(fnName, payload);\n"
        "      return true;\n"
        "    }\n"
        "  } catch (e) { console.error('JUCE native call error:', e); }\n"
        "  return false;\n"
        "};\n"
        "window.__JWS_SP404_NATIVE_STATE__ = ")
        + buildSP404NativeStateJson()
        + ";\n"
        + "window.__JWS_TELEMETRY_BASE_URL__ = 'http://127.0.0.1:"
        + juce::String(m_processorRef.getTelemetryServer().getPort())
        + "';\n";
    options = options.withUserScript(nativeScript);

    // Event Listeners for direct frontend emitEvent
    options = options.withEventListener("syncRackState", [this](const juce::var& data) {
        m_processorRef.syncRackFromUI(data);
    });

    options = options.withEventListener("setDspParameter", [this](const juce::var& data) {
        if (data.isObject()) {
            auto paramId = data.getProperty("id", data.getProperty("paramId", "")).toString();
            float val = static_cast<float>(data.getProperty("value", 0.0));
            m_processorRef.setParameterFromUI(paramId, val);
        } else if (data.isArray() && data.getArray()->size() >= 2) {
            auto paramId = (*data.getArray())[0].toString();
            float val = static_cast<float>((*data.getArray())[1]);
            m_processorRef.setParameterFromUI(paramId, val);
        }
    });

    options = options.withEventListener("setPedalParameter", [this](const juce::var& data) {
        if (data.isObject()) {
            auto id = data.getProperty("pedalId", data.getProperty("id", "")).toString();
            auto name = data.getProperty("paramName", data.getProperty("name", "")).toString();
            float val = static_cast<float>(data.getProperty("value", 0.0));
            m_processorRef.setPedalParamFromUI(id, name, val);
        }
    });

    options = options.withEventListener("setPedalBypassed", [this](const juce::var& data) {
        if (data.isObject()) {
            auto id = data.getProperty("pedalId", data.getProperty("id", "")).toString();
            bool byp = static_cast<bool>(data.getProperty("bypassed", false));
            m_processorRef.setPedalBypassedFromUI(id, byp);
        }
    });

    options = options.withEventListener("removePedal", [this](const juce::var& data) {
        if (data.isObject()) {
            auto id = data.getProperty("id", data.getProperty("pedalId", "")).toString();
            m_processorRef.removePedalFromUI(id);
        } else if (data.isString()) {
            m_processorRef.removePedalFromUI(data.toString());
        }
    });

    options = options.withEventListener("addPedal", [this](const juce::var& data) {
        if (data.isObject()) {
            auto type = data.getProperty("type", "").toString();
            auto id = data.getProperty("id", "").toString();
            m_processorRef.addPedalFromUI(type, id);
        }
    });

    options = options.withEventListener("setInspectedNode", [this](const juce::var& data) {
        if (data.isObject()) {
            auto id = data.getProperty("id", data.getProperty("nodeId", "master")).toString();
            m_processorRef.setInspectedNode(id.toStdString());
        } else if (data.isString()) {
            m_processorRef.setInspectedNode(data.toString().toStdString());
        }
    });

    options = options.withEventListener("bootSuperCollider", [this](const juce::var& data) {
        int port = 57110;
        if (data.isObject() && data.hasProperty("port")) {
            port = static_cast<int>(data.getProperty("port", 57110));
        }
        m_processorRef.bootSuperCollider(port);
    });

    options = options.withEventListener("killSuperCollider", [this](const juce::var& /*data*/) {
        m_processorRef.killSuperCollider();
    });

    options = options.withEventListener("superColliderAction", [this](const juce::var& data) {
        juce::String action = "freeAll";
        juce::String payload;
        if (data.isObject() && data.hasProperty("action")) {
            action = data.getProperty("action", "freeAll").toString();
            payload = data.getProperty("payload", "").toString();
        } else if (data.isString()) {
            action = data.toString();
        }
        m_processorRef.executeSuperColliderAction(action, payload);
    });

    options = options.withEventListener("setReactiveMidiRules", [this](const juce::var& data) {
        m_processorRef.setReactiveMidiRulesFromUI(data);
    });

    options = options.withEventListener("toggleReactiveMidiRule", [this](const juce::var& data) {
        if (data.isObject() && data.hasProperty("id")) {
            m_processorRef.toggleReactiveMidiRule(data.getProperty("id", "").toString());
        } else if (data.isString()) {
            m_processorRef.toggleReactiveMidiRule(data.toString());
        }
    });

    options = options.withEventListener("addReactiveMidiRule", [this](const juce::var& data) {
        m_processorRef.addReactiveMidiRule(data);
    });

    options = options.withEventListener("setReactiveMidiEnabled", [this](const juce::var& data) {
        bool en = true;
        if (data.isObject() && data.hasProperty("enabled")) {
            en = static_cast<bool>(data.getProperty("enabled", true));
        } else if (data.isBool()) {
            en = static_cast<bool>(data);
        }
        m_processorRef.setReactiveMidiEnabled(en);
    });

    // Native Functions for Promise-based invokes
    options = options.withNativeFunction("syncRackState", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (!args.isEmpty()) m_processorRef.syncRackFromUI(args[0]);
        if (completion) completion(true);
    });

    options = options.withNativeFunction("setDspParameter", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (args.size() >= 2) {
            auto paramId = args[0].toString();
            float val = static_cast<float>(args[1]);
            m_processorRef.setParameterFromUI(paramId, val);
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("setPedalParameter", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (args.size() >= 3) {
            m_processorRef.setPedalParamFromUI(args[0].toString(), args[1].toString(), static_cast<float>(args[2]));
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("setPedalBypassed", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (args.size() >= 2) {
            m_processorRef.setPedalBypassedFromUI(args[0].toString(), static_cast<bool>(args[1]));
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("removePedal", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (args.size() >= 1) {
            m_processorRef.removePedalFromUI(args[0].toString());
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("addPedal", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (args.size() >= 2) {
            m_processorRef.addPedalFromUI(args[0].toString(), args[1].toString());
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("setInspectedNode", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (args.size() >= 1) {
            auto nodeId = args[0].toString();
            m_processorRef.setInspectedNode(nodeId.toStdString());
        }
        if (completion) completion(true);
    });

    // Legacy SP-404 Original / A native event listeners
    options = options.withEventListener("sp404TriggerPad", [this](const juce::var& data) {
        if (data.isObject()) {
            int bank = 0;
            auto bankVar = data.getProperty("bank", "A");
            if (bankVar.isString()) {
                juce::String bStr = bankVar.toString().toUpperCase();
                if (!bStr.isEmpty()) bank = std::clamp(static_cast<int>(bStr[0] - 'A'), 0, 9);
            } else {
                bank = static_cast<int>(bankVar);
            }
            int padId = static_cast<int>(data.getProperty("padId", data.getProperty("pad", 1)));
            float vel = static_cast<float>(data.getProperty("velocity", 1.0));
            float offset = static_cast<float>(data.getProperty("chromaticOffset", 0.0));
            m_processorRef.triggerSP404Pad(bank, padId, vel, offset);
        }
    });

    options = options.withEventListener("sp404ReleasePad", [this](const juce::var& data) {
        if (data.isObject()) {
            int bank = 0;
            auto bankVar = data.getProperty("bank", "A");
            if (bankVar.isString()) {
                juce::String bStr = bankVar.toString().toUpperCase();
                if (!bStr.isEmpty()) bank = std::clamp(static_cast<int>(bStr[0] - 'A'), 0, 9);
            } else {
                bank = static_cast<int>(bankVar);
            }
            int padId = static_cast<int>(data.getProperty("padId", data.getProperty("pad", 1)));
            m_processorRef.releaseSP404Pad(bank, padId);
        }
    });

    options = options.withEventListener("sp404SetRouting", [this](const juce::var& data) {
        if (data.isObject()) {
            juce::String order = data.getProperty("order", "before").toString();
            bool bypassed = static_cast<bool>(data.getProperty("bypassed", false));
            m_processorRef.setSP404Routing(order, bypassed);
        }
    });

    options = options.withEventListener("sp404SetParam", [this](const juce::var& data) {
        if (data.isObject()) {
            juce::String name = data.getProperty("param", data.getProperty("name", "")).toString();
            float val = static_cast<float>(data.getProperty("value", 0.0));
            m_processorRef.setSP404Param(name, val);
        }
    });

    options = options.withEventListener("sp404StopAll", [this](const juce::var& /*data*/) {
        m_processorRef.getSP404Engine().stopAll();
    });

    auto loadSP404SampleFromData = [this](const juce::var& data) -> bool {
        if (!data.isObject()) return false;

        const auto encoded = data.getProperty("wavBase64", "").toString();
        if (encoded.isEmpty()) return false;

        juce::MemoryBlock wavData;
        juce::MemoryOutputStream decodedData(wavData, true);
        if (!juce::Base64::convertFromBase64(decodedData, encoded)) return false;

        juce::MemoryInputStream input(wavData.getData(), wavData.getSize(), false);
        juce::WavAudioFormat wavFormat;
        std::unique_ptr<juce::AudioFormatReader> reader(wavFormat.createReaderFor(&input, false));
        if (!reader || reader->lengthInSamples <= 0 || reader->lengthInSamples > 60 * 60 * 192000) return false;

        const int bank = juce::jlimit(0, 9, static_cast<int>(data.getProperty("bank", 0)));
        const int padId = static_cast<int>(data.getProperty("padId", 1));
        const int numChannels = juce::jlimit(1, 2, static_cast<int>(reader->numChannels));
        const int numSamples = static_cast<int>(reader->lengthInSamples);
        juce::AudioBuffer<float> sample(numChannels, numSamples);
        if (!reader->read(&sample, 0, numSamples, 0, true, numChannels > 1)) return false;

        const auto label = data.getProperty("label", "").toString().toStdString();
        const float pitch = static_cast<float>(data.getProperty("pitch", 0.0));
        const float volume = static_cast<float>(data.getProperty("volume", 1.0));
        const float pan = static_cast<float>(data.getProperty("pan", 0.0));
        const bool loop = static_cast<bool>(data.getProperty("loop", false));
        const bool reverse = static_cast<bool>(data.getProperty("reverse", false));
        const int muteGroup = static_cast<int>(data.getProperty("muteGroup", 0));

        return m_processorRef.getSP404Engine().loadCustomSample(
            bank, padId,
            sample.getReadPointer(0),
            numChannels > 1 ? sample.getReadPointer(1) : nullptr,
            static_cast<size_t>(numSamples),
            static_cast<float>(reader->sampleRate),
            label, pitch, volume, pan, loop, reverse, muteGroup);
    };

    options = options.withEventListener("sp404LoadSample", [loadSP404SampleFromData](const juce::var& data) {
        loadSP404SampleFromData(data);
    });

    options = options.withEventListener("sp404LoadSampleBegin", [this](const juce::var& data) {
        if (!data.isObject()) return;
        const auto transferId = data.getProperty("transferId", "").toString();
        const int totalChunks = static_cast<int>(data.getProperty("totalChunks", 0));
        const int totalBytes = static_cast<int>(data.getProperty("totalBytes", 0));
        if (transferId.isEmpty() || totalChunks <= 0 || totalChunks > 4096 || totalBytes <= 0 || totalBytes > 256 * 1024 * 1024) return;
        PendingSP404Transfer transfer;
        transfer.metadata = data;
        transfer.expectedChunks = totalChunks;
        m_sp404Transfers[transferId.toStdString()] = std::move(transfer);
    });

    options = options.withEventListener("sp404LoadSampleChunk", [this](const juce::var& data) {
        if (!data.isObject()) return;
        const auto transferId = data.getProperty("transferId", "").toString();
        auto it = m_sp404Transfers.find(transferId.toStdString());
        if (it == m_sp404Transfers.end()) return;
        const int index = static_cast<int>(data.getProperty("index", -1));
        const auto chunk = data.getProperty("data", "").toString();
        if (index != it->second.nextChunk || chunk.isEmpty() || it->second.base64.length() + chunk.length() > 256 * 1024 * 1024) {
            m_sp404Transfers.erase(it);
            return;
        }
        it->second.base64 += chunk;
        ++it->second.nextChunk;
    });

    options = options.withEventListener("sp404LoadSampleEnd", [this, loadSP404SampleFromData](const juce::var& data) {
        if (!data.isObject()) return;
        const auto transferId = data.getProperty("transferId", "").toString();
        auto it = m_sp404Transfers.find(transferId.toStdString());
        if (it == m_sp404Transfers.end()) return;
        auto transfer = std::move(it->second);
        m_sp404Transfers.erase(it);
        if (transfer.nextChunk != transfer.expectedChunks || !transfer.metadata.isObject()) return;
        const int expectedBytes = static_cast<int>(transfer.metadata.getProperty("totalBytes", 0));
        if (expectedBytes <= 0 || transfer.base64.length() != expectedBytes) return;
        transfer.metadata.getDynamicObject()->setProperty("wavBase64", transfer.base64);
        loadSP404SampleFromData(transfer.metadata);
    });

    options = options.withEventListener("sp404CancelSampleTransfer", [this](const juce::var& data) {
        if (data.isObject()) {
            const auto transferId = data.getProperty("transferId", "").toString();
            if (transferId.isEmpty()) m_sp404Transfers.clear();
            else m_sp404Transfers.erase(transferId.toStdString());
        } else {
            m_sp404Transfers.clear();
        }
    });

    options = options.withEventListener("sp404ClearSamples", [this](const juce::var& /*data*/) {
        m_sp404Transfers.clear();
        m_processorRef.getSP404Engine().clearCustomSamples();
    });

    // SP-404 Native Functions (Promise-based)
    options = options.withNativeFunction("sp404TriggerPad", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (!args.isEmpty() && args[0].isObject()) {
            const auto& data = args[0];
            int bank = 0;
            auto bankVar = data.getProperty("bank", "A");
            if (bankVar.isString()) {
                juce::String bStr = bankVar.toString().toUpperCase();
                if (!bStr.isEmpty()) bank = std::clamp(static_cast<int>(bStr[0] - 'A'), 0, 9);
            } else {
                bank = static_cast<int>(bankVar);
            }
            int padId = static_cast<int>(data.getProperty("padId", data.getProperty("pad", 1)));
            float vel = static_cast<float>(data.getProperty("velocity", 1.0));
            float offset = static_cast<float>(data.getProperty("chromaticOffset", 0.0));
            m_processorRef.triggerSP404Pad(bank, padId, vel, offset);
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("sp404ReleasePad", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (!args.isEmpty() && args[0].isObject()) {
            const auto& data = args[0];
            int bank = 0;
            auto bankVar = data.getProperty("bank", "A");
            if (bankVar.isString()) {
                juce::String bStr = bankVar.toString().toUpperCase();
                if (!bStr.isEmpty()) bank = std::clamp(static_cast<int>(bStr[0] - 'A'), 0, 9);
            } else {
                bank = static_cast<int>(bankVar);
            }
            int padId = static_cast<int>(data.getProperty("padId", data.getProperty("pad", 1)));
            m_processorRef.releaseSP404Pad(bank, padId);
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("sp404SetRouting", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (!args.isEmpty() && args[0].isObject()) {
            const auto& data = args[0];
            juce::String order = data.getProperty("order", "before").toString();
            bool bypassed = static_cast<bool>(data.getProperty("bypassed", false));
            m_processorRef.setSP404Routing(order, bypassed);
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("sp404SetParam", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        if (!args.isEmpty() && args[0].isObject()) {
            const auto& data = args[0];
            juce::String name = data.getProperty("param", data.getProperty("name", "")).toString();
            float val = static_cast<float>(data.getProperty("value", 0.0));
            m_processorRef.setSP404Param(name, val);
        }
        if (completion) completion(true);
    });

    options = options.withNativeFunction("sp404StopAll", [this](const juce::Array<juce::var>& /*args*/, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        m_processorRef.getSP404Engine().stopAll();
        if (completion) completion(true);
    });

    options = options.withNativeFunction("sp404LoadSample", [loadSP404SampleFromData](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        const bool loaded = !args.isEmpty() && loadSP404SampleFromData(args[0]);
        if (completion) completion(loaded);
    });

    options = options.withNativeFunction("sp404ClearSamples", [this](const juce::Array<juce::var>& /*args*/, juce::WebBrowserComponent::NativeFunctionCompletion completion) {
        m_processorRef.getSP404Engine().clearCustomSamples();
        if (completion) completion(true);
    });

    m_webView = std::make_unique<juce::WebBrowserComponent>(options);
    addAndMakeVisible(*m_webView);

    // Check if live Vite dev server is running on port 3010
    juce::StreamingSocket probe;
    bool isDevRunning = probe.connect("127.0.0.1", 3010, 60);
    probe.close();

    if (isDevRunning) {
        m_webView->goToURL("http://localhost:3010");
    } else {
        m_webView->goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
    }

    setSize(1320, 860);
    setResizable(true, true);
    setResizeLimits(1024, 680, 1920, 1200);

    // Run timer at 30Hz for real-time live telemetry stream
    startTimerHz(30);
}

JohnwallsStudioAudioProcessorEditor::~JohnwallsStudioAudioProcessorEditor() {
    stopTimer();
}

void JohnwallsStudioAudioProcessorEditor::timerCallback() {
    if (m_webView != nullptr) {
        auto json = m_processorRef.getTelemetryJsonString();
        m_webView->evaluateJavascript("if (window.__onJuceTelemetry) { window.__onJuceTelemetry(" + json + "); }");

        if (++m_sp404StatePushTicks >= 6) {
            m_sp404StatePushTicks = 0;
            m_webView->evaluateJavascript("if (window.__JWS_RECEIVE_SP404_NATIVE_STATE__) { window.__JWS_RECEIVE_SP404_NATIVE_STATE__(" + buildSP404NativeStateJson() + "); }");
        }
    }
}

void JohnwallsStudioAudioProcessorEditor::paint(juce::Graphics& g) {
    g.fillAll(juce::Colour::fromRGB(12, 14, 20));
}

void JohnwallsStudioAudioProcessorEditor::resized() {
    if (m_webView != nullptr) {
        m_webView->setBounds(getLocalBounds());
    }
}

} // namespace johnwalls::johnwalls
