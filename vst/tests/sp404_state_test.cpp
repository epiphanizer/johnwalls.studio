#include "SP404Engine.h"
#include <cmath>
#include <iostream>
#include <vector>

using namespace johnwalls::johnwalls;

static int failures = 0;

#define CHECK(condition, message) \
    do { \
        if (!(condition)) { ++failures; std::cout << "FAIL: " << message << std::endl; } \
        else { std::cout << "ok:   " << message << std::endl; } \
    } while (false)

int main() {
    SP404Engine source;
    source.prepare(44100.0, 512);

    std::vector<float> left{0.0f, 0.25f, -0.5f, 0.75f};
    std::vector<float> right{0.1f, 0.2f, -0.3f, 0.4f};
    CHECK(source.loadCustomSample(2, 7, left.data(), right.data(), left.size(), 44100.0f,
                                  "STATE TEST", 3.0f, 0.75f, -0.25f, true, true, 2),
          "loads a custom sample into bank C pad 7");
    source.setParam("volume", 6.5f);
    source.setParam("ctrl1", 2.5f);
    source.setParam("ctrl2", 8.0f);
    source.setParam("ctrl3", 4.0f);
    source.setParam("mfx", 4.0f);
    source.setChromaticMode(true, 2, 7);

    const auto state = source.serializeState();
    CHECK(!state.empty(), "serializes native SP-404 state");

    SP404Engine restored;
    CHECK(restored.deserializeState(state.data(), state.size()), "deserializes native SP-404 state");
    const auto* pad = restored.getPad(2, 7);
    CHECK(pad != nullptr && pad->sampleL.size() == left.size(), "restores sample frame count");
    CHECK(pad != nullptr && pad->sampleR.size() == right.size(), "restores stereo sample data");
    CHECK(pad != nullptr && pad->label == "STATE TEST", "restores pad label");
    CHECK(pad != nullptr && pad->category == "custom", "restores pad category");
    CHECK(pad != nullptr && std::abs(pad->pitchSemitones - 3.0f) < 0.001f, "restores pad pitch");
    CHECK(pad != nullptr && std::abs(pad->volume - 0.75f) < 0.001f, "restores pad volume");
    CHECK(pad != nullptr && pad->isLoop && pad->isReverse && pad->muteGroup == 2,
          "restores loop, reverse, and mute-group metadata");
    CHECK(restored.isChromaticMode() && restored.getPad(2, 7) != nullptr,
          "restores chromatic sampler state");

    std::cout << (failures ? "FAILURES: " : "ALL PASSED ") << failures << std::endl;
    return failures;
}
