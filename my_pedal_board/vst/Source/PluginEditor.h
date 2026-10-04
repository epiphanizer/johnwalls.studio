#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

namespace johnwalls::pedalboard {

class MyPedalBoardAudioProcessorEditor : public juce::AudioProcessorEditor,
                                         private juce::Timer {
public:
    explicit MyPedalBoardAudioProcessorEditor(MyPedalBoardAudioProcessor&);
    ~MyPedalBoardAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

    void timerCallback() override;

private:
    MyPedalBoardAudioProcessor& m_processorRef;
    std::unique_ptr<juce::WebBrowserComponent> m_webView;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MyPedalBoardAudioProcessorEditor)
};

} // namespace johnwalls::pedalboard
