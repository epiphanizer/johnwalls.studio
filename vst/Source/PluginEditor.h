#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"
#include <unordered_map>

namespace johnwalls::johnwalls {

class JohnwallsStudioAudioProcessorEditor : public juce::AudioProcessorEditor,
                                         private juce::Timer {
public:
    explicit JohnwallsStudioAudioProcessorEditor(JohnwallsStudioAudioProcessor&);
    ~JohnwallsStudioAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

    void timerCallback() override;

private:
    struct PendingSP404Transfer {
        juce::var metadata;
        juce::String base64;
        int expectedChunks{0};
        int nextChunk{0};
    };

    juce::String buildSP404NativeStateJson() const;

    JohnwallsStudioAudioProcessor& m_processorRef;
    std::unique_ptr<juce::WebBrowserComponent> m_webView;
    std::unordered_map<std::string, PendingSP404Transfer> m_sp404Transfers;
    int m_sp404StatePushTicks{0};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(JohnwallsStudioAudioProcessorEditor)
};

} // namespace johnwalls::johnwalls
