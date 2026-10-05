#include "SuperColliderManager.h"
#include <iostream>
using namespace johnwalls::johnwalls;
static void dump(const char* tag) {
    auto s = SuperColliderManager::getInstance().getStatus();
    std::cout << tag << ": " << s.statusText << " running=" << s.isRunning << " synths=" << s.numSynths
              << " groups=" << s.numGroups << " defs=" << s.numSynthDefs << " cpu=" << s.avgCPU
              << " sr=" << s.sampleRate << " err='" << s.lastError << "' visual=" << s.visualRunning
              << " lang=" << s.langPort << " osc=" << s.oscSent << std::endl;
}
int main() {

    auto& sc = SuperColliderManager::getInstance();
    std::cout << "boot=" << sc.boot(57110) << std::endl;
    for (int i = 0; i < 14; ++i) { juce::Thread::sleep(500); dump("boot"); if (sc.getStatus().isRunning) break; }
    std::cout << "testTone=" << sc.executeAction("testTone") << std::endl;
    juce::Thread::sleep(1000); dump("tone");
    juce::Thread::sleep(1500); dump("after-tone");
    const std::string code = R"(
var n = 0;
~jws[\onAudio].value({ |peak, rms, bpm, ppq, play, bar| ("AUDIO " ++ [peak, rms, bpm, ppq, play, bar]).postln });
~jws[\onRhythm].value({ |p, d, r, rule| ("RHYTHM " ++ [p, d, r, rule]).postln });
~jws[\onNote].value({ |note, vel, mode| ("NOTE " ++ [note, vel, mode]).postln });
("SERVER ALIVE? " ++ s.addr).postln;
s.sendMsg("/s_new", "jws_sine", 2000, 0, 1, "freq", 220, "amp", 0.05);
)";
    std::cout << "runVisual=" << sc.executeAction("runVisual", code) << std::endl;
    for (int i = 0; i < 10; ++i) {
        juce::Thread::sleep(500);
        sc.sendOsc("/state/audio", {OscArg::makeFloat(-12.5f), OscArg::makeFloat(-20.f), OscArg::makeFloat(128.f), OscArg::makeFloat(4.25f), OscArg::makeInt(1), OscArg::makeInt(3)}, false);
        sc.sendOsc("/state/pattern", {OscArg::makeString("1/16"), OscArg::makeFloat(6.f), OscArg::makeInt(1), OscArg::makeString("My Rule")}, false);
        ScNoteEvent ev; std::strcpy(ev.mode, "arp_1_16"); ev.note = 64; ev.velocity = 100; sc.postNote(ev);
    }
    dump("visual");
    std::cout << "---- sclang log ----\n" << sc.getStatus().visualLog << std::endl;
    std::cout << "freeAll=" << sc.executeAction("freeAll") << std::endl;
    juce::Thread::sleep(800); dump("freed");
    std::cout << "kill=" << sc.kill() << std::endl;
    dump("killed");
    return 0;
}
