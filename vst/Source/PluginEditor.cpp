#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace johnwalls::johnwalls {

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

    options = options.withUserScript(
        "window.__JUCE_INVOKE_NATIVE__ = function(fnName, payload) {\n"
        "  try {\n"
        "    if (window.__JUCE__ && window.__JUCE__.backend && typeof window.__JUCE__.backend.emitEvent === 'function') {\n"
        "      window.__JUCE__.backend.emitEvent(fnName, payload);\n"
        "      return true;\n"
        "    }\n"
        "  } catch (e) { console.error('JUCE native call error:', e); }\n"
        "  return false;\n"
        "};\n"
    );

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

    // SP-404 MKII Native Event Listeners
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
