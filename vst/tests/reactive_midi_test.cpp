
#include "ReactiveMidiEngine.h"
#include <iostream>
#include <map>
using namespace johnwalls::johnwalls;

static int failures = 0;
#define CHECK(c, msg) do { if (!(c)) { ++failures; std::cout << "FAIL: " << msg << " (line " << __LINE__ << ")" << std::endl; } else std::cout << "ok:   " << msg << std::endl; } while (0)

struct Out { std::map<int,int> sounding; std::vector<std::pair<double,int>> onEvents, offEvents; };

static void collect(const juce::MidiBuffer& mb, Out& o, double blockStart, double sr) {
    for (const auto m : mb) {
        if (m.numBytes < 3) continue;
        const uint8_t st = m.data[0] & 0xF0;
        const double t = (blockStart + m.samplePosition) / sr;
        if (st == 0x90 && m.data[2] > 0) { o.sounding[m.data[1]]++; o.onEvents.push_back({t, m.data[1]}); }
        else if (st == 0x80 || (st == 0x90 && m.data[2] == 0)) { o.sounding[m.data[1]]--; o.offEvents.push_back({t, m.data[1]}); }
    }
}
static int stuck(const Out& o) { int n = 0; for (auto& kv : o.sounding) if (kv.second != 0) ++n; return n; }

static ReactiveMidiRule rule(const std::string& action, const std::string& src, const std::string& trig, float param = 1.0f) {
    ReactiveMidiRule r; r.id = "t_" + action; r.name = "test " + action; r.sourceTrackFilter = src;
    r.triggerRhythm = trig; r.actionType = action; r.param = param; return r;
}
static void evaluate(ReactiveMidiEngine& eng, const std::string& bassRhythm) {
    TrackInstanceInfo bass; bass.instanceId = "bass1"; bass.trackName = "Bass"; bass.rhythmPattern = bassRhythm;
    TrackInstanceInfo me; me.instanceId = "me"; me.trackName = "Lead";
    eng.evaluateRules({bass, me}, "me", "Lead");
}
static juce::MidiBuffer noteOn(int n, int pos = 0) { juce::MidiBuffer b; b.addEvent(juce::MidiMessage::noteOn(1, n, (juce::uint8)100), pos); return b; }
static juce::MidiBuffer noteOff(int n, int pos = 0) { juce::MidiBuffer b; b.addEvent(juce::MidiMessage::noteOff(1, n), pos); return b; }

int main() {
    const double sr = 44100.0; const int N = 512; const double bpm = 120.0;
    ReactiveMidiEngine::setEnabled(true);

    // ---- 1. self is never a source ----
    {
        ReactiveMidiEngine::setRules({rule("transpose_12", "all", "any")});
        ReactiveMidiEngine eng;
        TrackInstanceInfo me; me.instanceId = "me"; me.trackName = "Lead";
        eng.evaluateRules({me}, "me", "Lead");
        CHECK(eng.getLastActiveRule().empty(), "rule does not react to its own track");
        evaluate(eng, "1/4");
        CHECK(!eng.getLastActiveRule().empty(), "rule reacts to another track");
    }

    // ---- 2. sustained: transposed on, delayed off, nothing stuck ----
    {
        ReactiveMidiEngine::setRules({rule("sustained", "bass", "1/4", 12.0f)});
        ReactiveMidiEngine eng; Out out; double ppq = 0, t = 0;
        evaluate(eng, "1/4");
        auto step = [&](juce::MidiBuffer mb) { eng.processMidi(mb, ppq, bpm, sr, N); collect(mb, out, t, sr); t += N; ppq += N / sr * bpm / 60.0; };
        step({}); // pick up rule
        step(noteOn(60, 10));
        CHECK(out.onEvents.size() == 1 && out.onEvents[0].second == 72, "sustained transposes +12");
        step(noteOff(60, 5));
        CHECK(out.offEvents.empty(), "sustained delays the note-off");
        for (int i = 0; i < 140; ++i) step({});
        CHECK(out.offEvents.size() == 1 && out.offEvents[0].second == 72, "sustained eventually releases the transposed note");
        CHECK(out.offEvents[0].first - 0.0116 > 1.4 && out.offEvents[0].first < 1.8 + 0.1, "sustained tail is ~1.5 s");
        CHECK(stuck(out) == 0, "no stuck notes after sustained");
    }

    // ---- 3. stabs: 40 ms staccato across block boundaries ----
    {
        ReactiveMidiEngine::setRules({rule("stabs_1_4", "bass", "1/4")});
        ReactiveMidiEngine eng; Out out; double ppq = 0, t = 0;
        evaluate(eng, "1/4");
        auto step = [&](juce::MidiBuffer mb) { eng.processMidi(mb, ppq, bpm, sr, N); collect(mb, out, t, sr); t += N; ppq += N / sr * bpm / 60.0; };
        step({});
        step(noteOn(64, 500)); // near end of block: 40ms off lands in a later block
        for (int i = 0; i < 10; ++i) step({});
        CHECK(out.onEvents.size() == 1 && out.offEvents.size() == 1, "stab on/off pair emitted");
        const double dt = out.offEvents[0].first - out.onEvents[0].first;
        CHECK(dt > 0.038 && dt < 0.042, "stab length is 40 ms even across blocks (got " + std::to_string(dt) + ")");
    }

    // ---- 4. arp on the 1/16 grid, released when rule deactivates ----
    {
        ReactiveMidiEngine::setRules({rule("arp_1_16", "bass", "1/4")});
        ReactiveMidiEngine eng; Out out; double ppq = 0, t = 0;
        evaluate(eng, "1/4");
        auto step = [&](juce::MidiBuffer mb) { eng.processMidi(mb, ppq, bpm, sr, N); collect(mb, out, t, sr); t += N; ppq += N / sr * bpm / 60.0; };
        step({});
        juce::MidiBuffer chord; chord.addEvent(juce::MidiMessage::noteOn(1, 60, (juce::uint8)100), 0); chord.addEvent(juce::MidiMessage::noteOn(1, 64, (juce::uint8)100), 0); chord.addEvent(juce::MidiMessage::noteOn(1, 67, (juce::uint8)100), 0);
        step(chord);
        for (int i = 0; i < 100; ++i) step({}); // 1.16 s = 2.3 beats at 120bpm -> ~9 sixteenths
        CHECK(out.onEvents.size() >= 8 && out.onEvents.size() <= 10, "arp fired ~16th notes (" + std::to_string(out.onEvents.size()) + ")");
        bool cyc = out.onEvents.size() >= 3 && out.onEvents[0].second != out.onEvents[1].second;
        CHECK(cyc, "arp cycles through held notes");
        // rule goes away -> sounding arp note must be released
        evaluate(eng, "idle");
        step({}); step({});
        CHECK(stuck(out) == 0, "arp note released when the rule deactivates");
    }

    // ---- 5. arp stops when keys released ----
    {
        ReactiveMidiEngine::setRules({rule("arp_1_16", "bass", "1/4")});
        ReactiveMidiEngine eng; Out out; double ppq = 0, t = 0;
        evaluate(eng, "1/4");
        auto step = [&](juce::MidiBuffer mb) { eng.processMidi(mb, ppq, bpm, sr, N); collect(mb, out, t, sr); t += N; ppq += N / sr * bpm / 60.0; };
        step({}); step(noteOn(60));
        for (int i = 0; i < 30; ++i) step({});
        step(noteOff(60));
        for (int i = 0; i < 5; ++i) step({});
        CHECK(stuck(out) == 0, "arp note released when the key is released");
    }

    // ---- 6. a note held in pass-through is released when a rule takes over ----
    {
        ReactiveMidiEngine::setRules({rule("mute", "bass", "1/4")});
        ReactiveMidiEngine eng; Out out; double ppq = 0, t = 0;
        auto step = [&](juce::MidiBuffer mb) { eng.processMidi(mb, ppq, bpm, sr, N); collect(mb, out, t, sr); t += N; ppq += N / sr * bpm / 60.0; };
        step({}); step(noteOn(60));
        CHECK(out.sounding[60] == 1, "passes through before the rule applies");
        evaluate(eng, "1/4");
        step({}); step({});
        step(noteOff(60)); // dropped by 'mute'
        CHECK(stuck(out) == 0, "rule takeover releases already-sounding passthrough notes");
    }

    // ---- 7. ratchet spans blocks, balanced ----
    {
        ReactiveMidiEngine::setRules({rule("ratchet_4x", "bass", "1/4")});
        ReactiveMidiEngine eng; Out out; double ppq = 0, t = 0;
        evaluate(eng, "1/4");
        auto step = [&](juce::MidiBuffer mb) { eng.processMidi(mb, ppq, bpm, sr, N); collect(mb, out, t, sr); t += N; ppq += N / sr * bpm / 60.0; };
        step({}); step(noteOn(60, 400));
        for (int i = 0; i < 20; ++i) step({});
        CHECK(out.onEvents.size() == 4 && out.offEvents.size() == 4 && stuck(out) == 0, "ratchet: 4 balanced bursts");
    }

    // ---- 8. shared rule list is process-wide, detector is per instance ----
    {
        ReactiveMidiEngine a, b;
        ReactiveMidiEngine::setRules({rule("transpose_12", "bass", "1/4")});
        Out o; double ppq = 0;
        for (int i = 0; i < 4; ++i) { auto mb = noteOn(60 + i); a.processMidi(mb, ppq, bpm, sr, N); ppq += 1.0; }
        CHECK(a.getCurrentRhythm().pattern != "idle", "instance A analysed its own notes");
        juce::MidiBuffer none; b.processMidi(none, ppq, bpm, sr, N);
        CHECK(b.getCurrentRhythm().pattern == "idle", "instance B is unaffected by A's MIDI");
        CHECK(ReactiveMidiEngine::getRules().size() == 1, "rule list is shared");
    }

    std::cout << (failures ? "FAILURES: " : "ALL PASSED ") << failures << std::endl;
    return failures;
}
