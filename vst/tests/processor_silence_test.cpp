#include "PluginProcessor.h"
#include <iostream>
#include <cmath>
#include <cassert>

using namespace johnwalls::johnwalls;

int main() {
    juce::ScopedJuceInitialiser_GUI gui;
    std::cout << "Testing JohnwallsStudioAudioProcessor on pure silence..." << std::endl;
    JohnwallsStudioAudioProcessor processor;
    processor.prepareToPlay(48000.0, 512);

    juce::AudioBuffer<float> buffer(2, 512);
    juce::MidiBuffer midi;

    // Process 200 blocks of silent audio with empty MIDI
    float maxAmp = 0.0f;
    for (int block = 0; block < 200; ++block) {
        buffer.clear();
        midi.clear();
        processor.processBlock(buffer, midi);

        const float* l = buffer.getReadPointer(0);
        const float* r = buffer.getReadPointer(1);
        for (int s = 0; s < 512; ++s) {
            float absL = std::abs(l[s]);
            float absR = std::abs(r[s]);
            if (absL > maxAmp) maxAmp = absL;
            if (absR > maxAmp) maxAmp = absR;
        }
    }

    std::cout << "Processor Max Output on Silence: " << maxAmp << " V" << std::endl;
    if (maxAmp == 0.0f) {
        std::cout << "[PASS] JohnwallsStudioAudioProcessor is 100% dead silent on idle/silence." << std::endl;
        processor.releaseResources();
        return 0;
    } else {
        std::cout << "[FAIL] Audio leakage detected: " << maxAmp << " V (" 
                  << (20.0f * std::log10(maxAmp)) << " dBFS)" << std::endl;
        processor.releaseResources();
        return 1;
    }
}
