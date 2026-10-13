#include "AudioTakeRecorder.h"
#include <iostream>
#include <cassert>
#include <cmath>

using namespace johnwalls::johnwalls;

int main() {
    AudioTakeRecorder rec;
    rec.prepare(48000.0, 512);

    rec.setVisualizerPreset("supercollider-lissajous");
    bool started = rec.startRecording("Lead Synths", "Walls Devine Vol 1", 124.0);
    assert(started);
    assert(rec.isRecording());

    // Feed audio blocks and host timing
    juce::AudioBuffer<float> buffer(2, 512);
    for (int frame = 0; frame < 20; ++frame) {
        for (int ch = 0; ch < 2; ++ch) {
            auto* writePtr = buffer.getWritePointer(ch);
            for (int s = 0; s < 512; ++s) {
                writePtr[s] = std::sin(2.0f * 3.14159265f * 440.0f * (float)(frame * 512 + s) / 48000.0f) * 0.7f;
            }
        }
        rec.processBlock(buffer, true, 124.0, frame / 4 + 1, (double)frame * 0.1);
        juce::Thread::sleep(15);
    }

    juce::var takeVar = rec.stopRecording();
    assert(takeVar.isObject());
    
    juce::String takeId = takeVar["takeId"].toString();
    juce::String trackName = takeVar["trackName"].toString();
    juce::String preset = takeVar["visualizerPreset"].toString();
    auto* visObj = takeVar["visualManifest"].getDynamicObject();
    assert(visObj != nullptr);
    auto* manifestArray = visObj->getProperty("timeline").getArray();

    std::cout << "Recorded Take ID: " << takeId << std::endl;
    std::cout << "Track Name: " << trackName << std::endl;
    std::cout << "Preset: " << preset << std::endl;
    std::cout << "Visual Frames Captured: " << (manifestArray ? manifestArray->size() : 0) << std::endl;

    assert(preset == "supercollider-lissajous");
    assert(manifestArray != nullptr && !manifestArray->isEmpty());

    // Verify WAV file exists
    auto wavFile = rec.getTakeAudioFile(takeId);
    assert(wavFile.existsAsFile());
    std::cout << "WAV File exists: " << wavFile.getFullPathName() << " (" << wavFile.getSize() << " bytes)" << std::endl;
    assert(wavFile.getSize() > 0);

    // Verify JSON file exists and contains visualManifest
    auto jsonFile = rec.getTakeMetaFile(takeId);
    assert(jsonFile.existsAsFile());
    auto jsonContent = jsonFile.loadFileAsString();
    assert(jsonContent.contains("visualizerPreset"));
    assert(jsonContent.contains("visualManifest"));
    std::cout << "JSON File exists and contains visualManifest: " << jsonFile.getFullPathName() << std::endl;

    // Verify HTML5 standalone visualizer bundle exists
    auto htmlFile = rec.getTakeVisualHtmlFile(takeId);
    assert(htmlFile.existsAsFile());
    auto htmlContent = htmlFile.loadFileAsString();
    std::cout << "HTML5 Bundle exists: " << htmlFile.getFullPathName() << " (" << htmlFile.getSize() << " bytes)" << std::endl;
    assert(htmlContent.contains("<canvas id=\"scopeCanvas\">"));
    assert(htmlContent.contains("window.takeData"));
    assert(htmlContent.contains("drawScope"));
    assert(htmlFile.getSize() > 500);

    // Test cleanup
    assert(rec.deleteTake(takeId));
    assert(!wavFile.existsAsFile());
    assert(!jsonFile.existsAsFile());
    assert(!htmlFile.existsAsFile());
    std::cout << "Take deleted cleanly, verified all audio and visual files removed." << std::endl;

    std::cout << "TAKE VISUAL BUNDLE TEST: ALL PASSED" << std::endl;
    return 0;
}
