#include "pedalboard/feature_extractor.hpp"
#include "pedalboard/dsp_nodes.hpp"
#include "pedalboard/pedal_rack.hpp"
#include "pedalboard/state_governor.hpp"
#include "pedalboard/cli_grammar.hpp"

#include <iostream>
#include <cassert>
#include <cmath>
#include <vector>

using namespace johnwalls::pedalboard;

void testCLICommands() {
    std::cout << "[TEST] Running CLI Grammar Tests..." << std::endl;
    PedalRack rack;
    StateGovernor gov;
    FeatureExtractor extractor;
    CLIGrammar cli(rack, gov, extractor);

    // Test 1: Add Delay Pedal with flags
    auto res = cli.execute("add pedal delay --name dub_echo --time 350ms --fb 40%");
    assert(res.success);
    assert(rack.getNumNodes() == 1);
    auto timeVal = rack.getParameter("dub_echo", "time");
    assert(timeVal.has_value() && std::abs(timeVal.value() - 350.0f) < 0.01f);
    auto fbVal = rack.getParameter("dub_echo", "feedback");
    assert(fbVal.has_value() && std::abs(fbVal.value() - 0.40f) < 0.01f);

    // Test 2: Add Filter Pedal
    res = cli.execute("add pedal filter --name sweep --cutoff 1500Hz --res 0.70");
    assert(res.success);
    assert(rack.getNumNodes() == 2);
    auto cutoffVal = rack.getParameter("sweep", "cutoff");
    assert(cutoffVal.has_value() && std::abs(cutoffVal.value() - 1500.0f) < 0.01f);

    // Test 3: Set and Get
    res = cli.execute("set sweep.cutoff 800");
    assert(res.success);
    cutoffVal = rack.getParameter("sweep", "cutoff");
    assert(cutoffVal.has_value() && std::abs(cutoffVal.value() - 800.0f) < 0.01f);

    res = cli.execute("get sweep.cutoff");
    assert(res.success);

    // Test 4: Bypass
    res = cli.execute("bypass dub_echo --toggle");
    assert(res.success);
    assert(rack.getNode("dub_echo")->isBypassed());

    // Test 5: Reactive Rule Creation on State Transition
    res = cli.execute("react to breakdown do dub_echo.feedback -> 0.75 ramp 2s");
    assert(res.success);
    assert(gov.getRules().size() == 1);
    assert(gov.getRules()[0].triggerType == "state");
    assert(gov.getRules()[0].triggerTarget == "breakdown");
    assert(std::abs(gov.getRules()[0].targetValue - 0.75f) < 0.01f);

    // Test 6: Ducking Rule Creation on Kick Hit
    res = cli.execute("duck dub_echo.mix by kick amt 14dB release 80ms");
    assert(res.success);
    assert(gov.getRules().size() == 2);
    assert(gov.getRules()[1].triggerType == "sensor");
    assert(gov.getRules()[1].triggerTarget == "kick");
    assert(std::abs(gov.getRules()[1].depthDb - 14.0f) < 0.01f);

    // Test 7: Arbitrary Sensory Channel Creation
    res = cli.execute("add sensor hihats --type highpass --freq 7500Hz --thresh 0.09");
    assert(res.success);
    assert(extractor.getSensor("hihats") != nullptr);
    assert(std::abs(extractor.getSensor("hihats")->getConfig().frequencyHz - 7500.0f) < 0.1f);

    res = cli.execute("add sensor lead_vocal --type bandpass --freq 2200Hz --q 1.5 --thresh 0.12");
    assert(res.success);
    assert(extractor.getSensor("lead_vocal") != nullptr);

    // Test 8: Ducking by Arbitrary Sensory Channels (hats & vocal)
    res = cli.execute("duck dub_echo.mix by hihats amt 8dB release 40ms");
    assert(res.success);
    assert(gov.getRules().size() == 3);
    assert(gov.getRules()[2].triggerTarget == "hihats");

    res = cli.execute("duck sweep.cutoff by lead_vocal amt 18dB release 120ms");
    assert(res.success);
    assert(gov.getRules().size() == 4);
    assert(gov.getRules()[3].triggerTarget == "lead_vocal");

    // Test 9: List commands (pedals, sensors, rules)
    res = cli.execute("list pedals");
    assert(res.success);
    res = cli.execute("list sensors");
    assert(res.success);
    res = cli.execute("list rules");
    assert(res.success);

    // Test 10: Remove sensor
    res = cli.execute("remove sensor hihats");
    assert(res.success);
    assert(extractor.getSensor("hihats") == nullptr);

    // Test 11: Remove pedal
    res = cli.execute("remove dub_echo");
    assert(res.success);
    assert(rack.getNumNodes() == 1);

    std::cout << "  ✓ All CLI Grammar & Arbitrary Sensor tests passed!" << std::endl;
}

void testDSPNodes() {
    std::cout << "[TEST] Running DSP Nodes Processing Tests..." << std::endl;
    constexpr size_t numSamples = 512;
    OwnedAudioBuffer buffer(2, numSamples);

    for (size_t i = 0; i < numSamples; ++i) {
        float sample = std::sin(2.0f * 3.14159265f * 440.0f * static_cast<float>(i) / 44100.0f) * 0.5f;
        buffer.getChannelData(0)[i] = sample;
        buffer.getChannelData(1)[i] = sample;
    }

    auto view = buffer.getView();

    // 1. Tape Delay
    TapeDelayNode delay("test_delay");
    delay.prepare(44100.0, numSamples);
    delay.setParameter("time", 50.0f);
    delay.setParameter("feedback", 0.30f);
    delay.setParameter("mix", 0.5f);
    delay.process(view);
    for (size_t i = 0; i < numSamples; ++i) {
        assert(!std::isnan(view.getSample(0, i)));
        assert(!std::isinf(view.getSample(0, i)));
    }

    // 2. Ladder Filter
    LadderFilterNode filter("test_filter");
    filter.prepare(44100.0, numSamples);
    filter.setParameter("cutoff", 500.0f);
    filter.setParameter("resonance", 0.5f);
    filter.process(view);
    for (size_t i = 0; i < numSamples; ++i) {
        assert(!std::isnan(view.getSample(0, i)));
        assert(!std::isinf(view.getSample(0, i)));
    }

    // 3. Overdrive
    OverdriveNode drive("test_drive");
    drive.prepare(44100.0, numSamples);
    drive.setParameter("drive", 5.0f);
    drive.process(view);
    for (size_t i = 0; i < numSamples; ++i) {
        assert(!std::isnan(view.getSample(0, i)));
        assert(!std::isinf(view.getSample(0, i)));
    }

    // 4. Reactive Ducker
    ReactiveDuckerNode ducker("test_ducker");
    ducker.prepare(44100.0, numSamples);
    ducker.setParameter("depth", 18.0f);
    ducker.trigger(1.0f);
    float preGain = ducker.getParameter("gain");
    assert(preGain < 0.20f);
    ducker.process(view);
    float postGain = ducker.getParameter("gain");
    assert(postGain > preGain);

    // 5. Mesa Boogie Mark III Deep DSP Verification
    MesaMarkNode mesa("test_mesa");
    mesa.prepare(44100.0, numSamples);
    mesa.setParameter("channel", 2.0f); // Lead
    mesa.setParameter("gain", 8.0f);
    mesa.setParameter("lead_drive", 7.5f);
    mesa.setParameter("master", 6.0f);
    mesa.setParameter("lead_master", 6.5f);
    mesa.setParameter("pull_bright", 1.0f);
    mesa.setParameter("pull_deep", 1.0f);
    mesa.setParameter("pull_shift", 1.0f);
    mesa.setParameter("simul_class", 1.0f);
    mesa.setParameter("eq_active", 1.0f);
    mesa.setParameter("eq80", 4.0f);    // Thump
    mesa.setParameter("eq240", 1.0f);
    mesa.setParameter("eq750", -6.0f);  // Classic mid scoop
    mesa.setParameter("eq2200", 2.5f);
    mesa.setParameter("eq6600", 3.0f);  // Searing edge
    mesa.setParameter("cab", 1.0f);     // 4x12 V30
    mesa.process(view);
    for (size_t i = 0; i < numSamples; ++i) {
        assert(!std::isnan(view.getSample(0, i)));
        assert(!std::isinf(view.getSample(0, i)));
    }

    // Verify 5-Band EQ has measurable real effect:
    // Generate a 750 Hz test tone
    OwnedAudioBuffer eqToneBufBoost(1, 512);
    OwnedAudioBuffer eqToneBufCut(1, 512);
    for (size_t i = 0; i < 512; ++i) {
        float s = std::sin(2.0f * 3.14159265f * 750.0f * static_cast<float>(i) / 44100.0f) * 0.2f;
        eqToneBufBoost.getChannelData(0)[i] = s;
        eqToneBufCut.getChannelData(0)[i] = s;
    }
    MesaMarkNode mesaBoost("m_boost");
    mesaBoost.prepare(44100.0, 512);
    mesaBoost.setParameter("channel", 0.0f); // Clean
    mesaBoost.setParameter("eq750", 10.0f);
    auto boostView = eqToneBufBoost.getView();
    mesaBoost.process(boostView);

    MesaMarkNode mesaCut("m_cut");
    mesaCut.prepare(44100.0, 512);
    mesaCut.setParameter("channel", 0.0f); // Clean
    mesaCut.setParameter("eq750", -10.0f);
    auto cutView = eqToneBufCut.getView();
    mesaCut.process(cutView);

    float boostEnergy = 0.0f, cutEnergy = 0.0f;
    for (size_t i = 100; i < 500; ++i) {
        boostEnergy += std::abs(eqToneBufBoost.getChannelData(0)[i]);
        cutEnergy += std::abs(eqToneBufCut.getChannelData(0)[i]);
    }
    assert(boostEnergy > cutEnergy * 1.5f); // 750Hz boost is significantly louder than 750Hz scoop!

    // 6. Vox AC-30 Deep DSP Verification
    VoxAC30Node vox("test_vox");
    vox.prepare(44100.0, numSamples);
    vox.setParameter("channel", 1.0f); // Top Boost
    vox.setParameter("gain", 6.5f);
    vox.setParameter("bass", 6.0f);
    vox.setParameter("treble", 7.5f);
    vox.setParameter("brilliant", 1.0f);
    vox.setParameter("cut", 4.0f);     // Tone Cut
    vox.setParameter("chime", 7.0f);   // Chime
    vox.setParameter("cab", 1.0f);     // 2x12 Alnico Blue
    vox.process(view);
    for (size_t i = 0; i < numSamples; ++i) {
        assert(!std::isnan(view.getSample(0, i)));
        assert(!std::isinf(view.getSample(0, i)));
    }

    // Verify Reverse Tone Cut actually attenuates high frequencies:
    // Generate a 10 kHz test tone
    OwnedAudioBuffer toneCutBufOpen(1, 512);
    OwnedAudioBuffer toneCutBufClosed(1, 512);
    for (size_t i = 0; i < 512; ++i) {
        float s = std::sin(2.0f * 3.14159265f * 10000.0f * static_cast<float>(i) / 44100.0f) * 0.2f;
        toneCutBufOpen.getChannelData(0)[i] = s;
        toneCutBufClosed.getChannelData(0)[i] = s;
    }
    VoxAC30Node voxOpen("v_open");
    voxOpen.prepare(44100.0, 512);
    voxOpen.setParameter("channel", 0.0f);
    voxOpen.setParameter("cut", 0.0f); // Cut = 0 (highs wide open)
    auto openView = toneCutBufOpen.getView();
    voxOpen.process(openView);

    VoxAC30Node voxClosed("v_closed");
    voxClosed.prepare(44100.0, 512);
    voxClosed.setParameter("channel", 0.0f);
    voxClosed.setParameter("cut", 10.0f); // Cut = 10 (maximum treble attenuation)
    auto closedView = toneCutBufClosed.getView();
    voxClosed.process(closedView);

    float openEnergy = 0.0f, closedEnergy = 0.0f;
    for (size_t i = 100; i < 500; ++i) {
        openEnergy += std::abs(toneCutBufOpen.getChannelData(0)[i]);
        closedEnergy += std::abs(toneCutBufClosed.getChannelData(0)[i]);
    }
    assert(openEnergy > closedEnergy * 2.0f); // Tone Cut effectively rolled off 10kHz!

    std::cout << "  ✓ All DSP Nodes processing tests passed (including Mesa Mark III & Vox AC-30)!" << std::endl;
}

void testFeatureExtractorAndStates() {
    std::cout << "[TEST] Running Feature Extractor & Rhythm Analysis Tests..." << std::endl;
    FeatureExtractor extractor;
    extractor.prepare(44100.0, 512);

    constexpr size_t blockSize = 512;
    OwnedAudioBuffer buffer(2, blockSize);

    // Verify factory sensors exist
    auto sensorIds = extractor.getSensorIds();
    assert(sensorIds.size() >= 5); // kick, snare, hats, bass, vocal

    // 1. Simulate 4/4 Kick drum pulses
    int kicksDetected = 0;
    for (int block = 0; block < 220; ++block) {
        buffer.clear();
        if (block % 43 == 0) {
            for (size_t i = 0; i < blockSize; ++i) {
                float t = static_cast<float>(i) / 44100.0f;
                float freq = 110.0f * std::exp(-t * 50.0f) + 55.0f;
                float env = std::exp(-t * 30.0f);
                float val = std::sin(2.0f * 3.14159265f * freq * t) * env * 0.95f;
                buffer.getChannelData(0)[i] = val;
                buffer.getChannelData(1)[i] = val;
            }
        }
        auto hits = extractor.processBlock(buffer.getView(), 120.0);
        if (hits.kickTriggered) {
            kicksDetected++;
        }
    }

    assert(kicksDetected >= 3);
    auto tele = extractor.getTelemetry();
    assert(tele.totalKicksDetected >= 3);
    assert(extractor.getCurrentState() == MusicalState::SteadyGroove);

    // 2. Simulate Breakdown: Kick stops, quiet background pad continues
    for (int block = 0; block < 220; ++block) {
        buffer.clear();
        for (size_t i = 0; i < blockSize; ++i) {
            float val = std::sin(2.0f * 3.14159265f * 800.0f * static_cast<float>(i) / 44100.0f) * 0.08f;
            buffer.getChannelData(0)[i] = val;
            buffer.getChannelData(1)[i] = val;
        }
        extractor.processBlock(buffer.getView(), 120.0);
    }
    assert(extractor.getCurrentState() == MusicalState::Breakdown);

    // 3. Test High-Frequency Hi-Hat bursts on the arbitrary "hats" sensor channel
    buffer.clear();
    for (size_t i = 0; i < blockSize; ++i) {
        float val = std::sin(2.0f * 3.14159265f * 8000.0f * static_cast<float>(i) / 44100.0f) * 0.85f;
        buffer.getChannelData(0)[i] = val;
        buffer.getChannelData(1)[i] = val;
    }
    auto hatHits = extractor.processBlock(buffer.getView(), 120.0);
    assert(hatHits.isTriggered("hats"));
    assert(hatHits.getVelocity("hats") > 0.0f);

    std::cout << "  ✓ All Feature Extractor & Musical State tests passed!" << std::endl;
}

void testChainingAndCleanPassthrough() {
    std::cout << "[TEST] Running Chaining & Clean Bit-Exact Passthrough Tests..." << std::endl;
    constexpr size_t blockSize = 512;
    OwnedAudioBuffer buffer(2, blockSize);
    OwnedAudioBuffer cleanReference(2, blockSize);

    // Fill with distinct test signal
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            float val = std::sin(2.0f * 3.14159265f * 440.0f * static_cast<float>(s) / 44100.0f) * 0.5f;
            buffer.getChannelData(ch)[s] = val;
            cleanReference.getChannelData(ch)[s] = val;
        }
    }

    PedalRack rack;
    rack.prepare(44100.0, blockSize);

    // 1. Empty rack MUST pass signal 100% untouched
    auto view = buffer.getView();
    rack.process(view);
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            assert(buffer.getChannelData(ch)[s] == cleanReference.getChannelData(ch)[s]);
        }
    }

    // 2. Add Mesa and Vox, but BYPASSED - MUST pass signal 100% untouched
    rack.addPedalByType("mesa", "mesa_mark3");
    rack.addPedalByType("vox", "vox_ac30");
    rack.setBypassed("mesa_mark3", true);
    rack.setBypassed("vox_ac30", true);

    rack.process(view);
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            assert(buffer.getChannelData(ch)[s] == cleanReference.getChannelData(ch)[s]);
        }
    }

    // 3. Engage Mesa - Sound MUST be colored / amplified
    rack.setBypassed("mesa_mark3", false);
    rack.setParameter("mesa_mark3", "gain", 8.0f);
    rack.process(view);

    bool differed = false;
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            if (std::abs(buffer.getChannelData(ch)[s] - cleanReference.getChannelData(ch)[s]) > 1e-5f) {
                differed = true;
                break;
            }
        }
    }
    assert(differed);

    // 4. Remove Mesa completely - Reset buffer to clean, process, MUST pass signal 100% untouched!
    rack.removeNode("mesa_mark3");
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            buffer.getChannelData(ch)[s] = cleanReference.getChannelData(ch)[s];
        }
    }
    rack.process(view);
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            assert(buffer.getChannelData(ch)[s] == cleanReference.getChannelData(ch)[s]);
        }
    }

    // 5. Test dynamic pedal creation (delay and filter)
    rack.addPedalByType("delay", "delay_custom_1");
    rack.setParameter("delay_custom_1", "time", 250.0f);
    rack.setParameter("delay_custom_1", "feedback", 0.5f);
    rack.setParameter("delay_custom_1", "mix", 0.5f);
    assert(rack.getNode("delay_custom_1") != nullptr);
    assert(!rack.getNode("delay_custom_1")->isBypassed());

    // Bypass it
    rack.setBypassed("delay_custom_1", true);
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            buffer.getChannelData(ch)[s] = cleanReference.getChannelData(ch)[s];
        }
    }
    rack.process(view);
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            assert(buffer.getChannelData(ch)[s] == cleanReference.getChannelData(ch)[s]);
        }
    }

    // Clear rack completely
    rack.clear();
    assert(rack.getNumNodes() == 0);
    rack.process(view);
    for (size_t ch = 0; ch < 2; ++ch) {
        for (size_t s = 0; s < blockSize; ++s) {
            assert(buffer.getChannelData(ch)[s] == cleanReference.getChannelData(ch)[s]);
        }
    }

    std::cout << "  ✓ All Chaining & Clean Passthrough tests passed with 100% bit-exact accuracy!" << std::endl;
}

void testLockFreeWaveformAndCachedNodes() {
    std::cout << "[TEST] Running Lock-Free Waveform & Cached Pointers Tests..." << std::endl;
    PedalRack rack;
    rack.prepare(44100.0, 512);

    rack.addPedalByType("mesa", "mesa_mark3");
    rack.addPedalByType("vox", "vox_ac30");
    rack.addPedalByType("delay", "dub_echo");
    rack.addPedalByType("filter", "resonant_filter");
    rack.addPedalByType("ducker", "sidechain_ducker");

    // Verify zero-overhead cached node access
    assert(rack.getCachedMesa() != nullptr);
    assert(rack.getCachedMesa()->getId() == "mesa_mark3");
    assert(rack.getCachedVox() != nullptr);
    assert(rack.getCachedVox()->getId() == "vox_ac30");
    assert(rack.getCachedDelay() != nullptr);
    assert(rack.getCachedDelay()->getId() == "dub_echo");
    assert(rack.getCachedFilter() != nullptr);
    assert(rack.getCachedFilter()->getId() == "resonant_filter");
    assert(rack.getCachedDucker() != nullptr);
    assert(rack.getCachedDucker()->getId() == "sidechain_ducker");

    // Process a block and check lock-free waveform
    OwnedAudioBuffer buf(2, 512);
    for (size_t s = 0; s < 512; ++s) {
        buf.getChannelData(0)[s] = 0.5f * std::sin(2.0f * 3.14159265f * 440.0f * static_cast<float>(s) / 44100.0f);
        buf.getChannelData(1)[s] = buf.getChannelData(0)[s];
    }
    auto view = buf.getView();
    rack.process(view);

    std::array<float, 512> wave{};
    rack.getInspectedWaveform(wave);
    float maxVal = 0.0f;
    for (float v : wave) {
        maxVal = std::max(maxVal, std::abs(v));
    }
    assert(maxVal > 0.05f); // Real audio captured into lock-free double buffer!

    // Verify removal updates cached pointers cleanly
    rack.removeNode("mesa_mark3");
    assert(rack.getCachedMesa() == nullptr);

    std::cout << "  ✓ Lock-Free Waveform & Cached Pointers verified!" << std::endl;
}

int main() {
    std::cout << "==================================================" << std::endl;
    std::cout << "  johnwalls.studio: Audio Engine Suite            " << std::endl;
    std::cout << "==================================================" << std::endl;

    testCLICommands();
    testDSPNodes();
    testFeatureExtractorAndStates();
    testChainingAndCleanPassthrough();
    testLockFreeWaveformAndCachedNodes();

    std::cout << "==================================================" << std::endl;
    std::cout << "  All 5 test suites passed successfully! (100%)   " << std::endl;
    std::cout << "==================================================" << std::endl;
    return 0;
}

