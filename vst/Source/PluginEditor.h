#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

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
    JohnwallsStudioAudioProcessor& m_processorRef;
    std::unique_ptr<juce::WebBrowserComponent> m_webView;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(JohnwallsStudioAudioProcessorEditor)
};

} // namespace johnwalls::johnwalls
