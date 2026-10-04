#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "GlobalSessionHub.h"
#include "SuperColliderManager.h"
#include <cmath>

namespace johnwalls::pedalboard {

MyPedalBoardAudioProcessor::MyPedalBoardAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)
                         .withInput("Sidechain", juce::AudioChannelSet::stereo(), true)),
      m_telemetryServer(*this, 3012)
{
    // Mesa Boogie Mark III parameters (Standby / Bypassed by default)
    addParameter(m_paramMesaPower = new juce::AudioParameterBool(
                     juce::ParameterID{"mesa_power", 1}, "Mesa Power", false));
    addParameter(m_paramMesaBypass = new juce::AudioParameterBool(
                     juce::ParameterID{"mesa_bypass", 1}, "Mesa Standby/Bypass", true));
    addParameter(m_paramMesaChannel = new juce::AudioParameterInt(
                     juce::ParameterID{"mesa_channel", 1}, "Mesa Channel", 0, 2, 2));
    addParameter(m_paramMesaGain = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_gain", 1}, "Mesa Gain/Vol1", 0.0f, 10.0f, 7.5f));
    addParameter(m_paramMesaLeadDrive = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_lead_drive", 1}, "Mesa Lead Drive", 0.0f, 10.0f, 8.0f));
    addParameter(m_paramMesaMaster = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_master", 1}, "Mesa Master 1", 0.0f, 10.0f, 6.0f));
    addParameter(m_paramMesaLeadMaster = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_lead_master", 1}, "Mesa Lead Master", 0.0f, 10.0f, 6.5f));
    addParameter(m_paramMesaPullBright = new juce::AudioParameterBool(
                     juce::ParameterID{"mesa_pull_bright", 1}, "Mesa Pull Bright", true));
    addParameter(m_paramMesaBass = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_bass", 1}, "Mesa Bass", 0.0f, 10.0f, 4.0f));
    addParameter(m_paramMesaPullDeep = new juce::AudioParameterBool(
                     juce::ParameterID{"mesa_pull_deep", 1}, "Mesa Pull Deep", true));
    addParameter(m_paramMesaMid = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_mid", 1}, "Mesa Middle", 0.0f, 10.0f, 5.0f));
    addParameter(m_paramMesaPullShift = new juce::AudioParameterBool(
                     juce::ParameterID{"mesa_pull_shift", 1}, "Mesa Pull Shift", false));
    addParameter(m_paramMesaTreble = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_treble", 1}, "Mesa Treble", 0.0f, 10.0f, 7.0f));
    addParameter(m_paramMesaPresence = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_presence", 1}, "Mesa Presence", 0.0f, 10.0f, 6.5f));
    addParameter(m_paramMesaEQActive = new juce::AudioParameterBool(
                     juce::ParameterID{"mesa_eq_active", 1}, "Mesa EQ In", true));
    addParameter(m_paramMesaEQ80 = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_eq80", 1}, "Mesa EQ 80Hz", -12.0f, 12.0f, 3.5f));
    addParameter(m_paramMesaEQ240 = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_eq240", 1}, "Mesa EQ 240Hz", -12.0f, 12.0f, 0.5f));
    addParameter(m_paramMesaEQ750 = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_eq750", 1}, "Mesa EQ 750Hz", -12.0f, 12.0f, -5.5f));
    addParameter(m_paramMesaEQ2200 = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_eq2200", 1}, "Mesa EQ 2.2kHz", -12.0f, 12.0f, 2.0f));
    addParameter(m_paramMesaEQ6600 = new juce::AudioParameterFloat(
                     juce::ParameterID{"mesa_eq6600", 1}, "Mesa EQ 6.6kHz", -12.0f, 12.0f, 4.0f));
    addParameter(m_paramMesaSimulClass = new juce::AudioParameterBool(
                     juce::ParameterID{"mesa_simul_class", 1}, "Mesa Simul-Class 85W", true));
    addParameter(m_paramMesaCab = new juce::AudioParameterBool(
                     juce::ParameterID{"mesa_cab", 1}, "Mesa 4x12 Cab", true));

    // Vox AC-30 Top Boost parameters
    addParameter(m_paramVoxPower = new juce::AudioParameterBool(
                     juce::ParameterID{"vox_power", 1}, "Vox Power", false));
    addParameter(m_paramVoxBypass = new juce::AudioParameterBool(
                     juce::ParameterID{"vox_bypass", 1}, "Vox Standby/Bypass", true));
    addParameter(m_paramVoxChannel = new juce::AudioParameterInt(
                     juce::ParameterID{"vox_channel", 1}, "Vox Channel", 0, 1, 1));
    addParameter(m_paramVoxGain = new juce::AudioParameterFloat(
                     juce::ParameterID{"vox_gain", 1}, "Vox Top Boost Gain", 0.0f, 10.0f, 6.5f));
    addParameter(m_paramVoxBass = new juce::AudioParameterFloat(
                     juce::ParameterID{"vox_bass", 1}, "Vox Bass", 0.0f, 10.0f, 5.5f));
    addParameter(m_paramVoxTreble = new juce::AudioParameterFloat(
                     juce::ParameterID{"vox_treble", 1}, "Vox Treble", 0.0f, 10.0f, 7.0f));
    addParameter(m_paramVoxCut = new juce::AudioParameterFloat(
                     juce::ParameterID{"vox_cut", 1}, "Vox Tone Cut", 0.0f, 10.0f, 3.5f));
    addParameter(m_paramVoxChime = new juce::AudioParameterFloat(
                     juce::ParameterID{"vox_chime", 1}, "Vox Chime", 0.0f, 10.0f, 6.5f));
    addParameter(m_paramVoxBrilliant = new juce::AudioParameterBool(
                     juce::ParameterID{"vox_brilliant", 1}, "Vox Brilliant Switch", true));
    addParameter(m_paramVoxMaster = new juce::AudioParameterFloat(
                     juce::ParameterID{"vox_master", 1}, "Vox Master", 0.0f, 10.0f, 7.0f));
    addParameter(m_paramVoxCab = new juce::AudioParameterBool(
                     juce::ParameterID{"vox_cab", 1}, "Vox 2x12 Cab", true));

    // Stompbox parameters
    addParameter(m_paramDelayBypass = new juce::AudioParameterBool(
                     juce::ParameterID{"delay_bypass", 1}, "Delay Bypass", false));
    addParameter(m_paramDelayTime = new juce::AudioParameterFloat(
                     juce::ParameterID{"delay_time", 1}, "Delay Time", 20.0f, 1200.0f, 360.0f));
    addParameter(m_paramDelayFeedback = new juce::AudioParameterFloat(
                     juce::ParameterID{"delay_fb", 1}, "Delay Repeat", 0.0f, 0.95f, 0.45f));

    addParameter(m_paramFilterBypass = new juce::AudioParameterBool(
                     juce::ParameterID{"filter_bypass", 1}, "Filter Bypass", false));
    addParameter(m_paramFilterCutoff = new juce::AudioParameterFloat(
                     juce::ParameterID{"filter_cutoff", 1}, "Filter Cutoff", 60.0f, 20000.0f, 1400.0f));

    addParameter(m_paramDuckerBypass = new juce::AudioParameterBool(
                     juce::ParameterID{"ducker_bypass", 1}, "Ducker Bypass", false));
    addParameter(m_paramDuckerDepth = new juce::AudioParameterFloat(
                     juce::ParameterID{"ducker_depth", 1}, "Ducker Depth", 0.0f, 36.0f, 14.0f));

    // Populate default rack
    m_rack.addPedalByType("delay", "dub_echo");
    m_rack.addPedalByType("filter", "resonant_filter");
    m_rack.addPedalByType("ducker", "sidechain_ducker");
    m_rack.addPedalByType("mesa", "mesa_mark3");
    m_rack.addPedalByType("vox", "vox_ac30");

    m_rack.setBypassed("vox_ac30", true);
    m_rack.setBypassed("mesa_mark3", true);

    // Register with GlobalSessionHub for inter-plugin awareness across tracks
    m_instanceId = "jws_" + juce::Uuid().toString().substring(0, 8).toStdString();
    m_trackName = "Track (" + juce::String(m_instanceId).toStdString() + ")";
    TrackInstanceInfo initialInfo;
    initialInfo.instanceId = m_instanceId;
    initialInfo.trackName = m_trackName;
    initialInfo.trackType = "midi";
    initialInfo.lastHeartbeatMs = juce::Time::currentTimeMillis();
    GlobalSessionHub::getInstance().registerOrUpdate(initialInfo);

    // Launch local telemetry server for external/desktop sync
    m_telemetryServer.start();
}

MyPedalBoardAudioProcessor::~MyPedalBoardAudioProcessor() {
    GlobalSessionHub::getInstance().unregister(m_instanceId);
    m_telemetryServer.stop();
}

void MyPedalBoardAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    m_rack.prepare(sampleRate, static_cast<size_t>(samplesPerBlock));
    m_extractor.prepare(sampleRate, static_cast<size_t>(samplesPerBlock));
    m_sp404Engine.prepare(sampleRate, samplesPerBlock);
}

void MyPedalBoardAudioProcessor::releaseResources() {
    m_rack.reset();
    m_extractor.reset();
    m_sp404Engine.reset();
}

bool MyPedalBoardAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;
    if (layouts.getMainInputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    auto sidechain = layouts.getChannelSet(true, 1);
    if (!sidechain.isDisabled() && sidechain != juce::AudioChannelSet::mono() && sidechain != juce::AudioChannelSet::stereo())
        return false;

    return true;
}

void MyPedalBoardAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
    juce::ScopedNoDenormals noDenormals;

    // 0. Parse incoming MIDI messages (Real-time awareness of track MIDI activity)
    bool noteChanged = false;
    for (const auto metadata : midiMessages) {
        auto msg = metadata.getMessage();
        if (msg.isNoteOn()) {
            m_lastMidiNote.store(msg.getNoteNumber(), std::memory_order_relaxed);
            m_lastMidiVelocity.store(msg.getVelocity(), std::memory_order_relaxed);
            m_lastMidiChannel.store(msg.getChannel(), std::memory_order_relaxed);
            m_totalMidiEvents.fetch_add(1, std::memory_order_relaxed);
            m_isMidiActive.store(true, std::memory_order_relaxed);
            noteChanged = true;
            m_sp404Engine.handleMidiNoteOn(msg.getNoteNumber(), msg.getFloatVelocity());
        } else if (msg.isNoteOff()) {
            m_totalMidiEvents.fetch_add(1, std::memory_order_relaxed);
            noteChanged = true;
            m_sp404Engine.handleMidiNoteOff(msg.getNoteNumber());
        }
    }

    const auto totalNumInputChannels = getTotalNumInputChannels();
    const auto totalNumOutputChannels = getTotalNumOutputChannels();
    const auto numSamples = static_cast<size_t>(buffer.getNumSamples());

    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear(i, 0, static_cast<int>(numSamples));

    // 1. Query REAL Playhead & Transport info from Ableton Live
    if (auto* playHead = getPlayHead()) {
        if (auto pos = playHead->getPosition()) {
            if (pos->getBpm().hasValue()) {
                m_currentBpm.store(static_cast<float>(*pos->getBpm()), std::memory_order_relaxed);
            }
            m_isPlaying.store(pos->getIsPlaying(), std::memory_order_relaxed);
            if (pos->getPpqPosition().hasValue()) {
                m_ppqPosition.store(static_cast<float>(*pos->getPpqPosition()), std::memory_order_relaxed);
            }
            if (pos->getBarCount().hasValue()) {
                m_barNumber.store(static_cast<int>(*pos->getBarCount()) + 1, std::memory_order_relaxed);
            } else if (pos->getPpqPosition().hasValue() && pos->getTimeSignature().hasValue()) {
                double ppq = *pos->getPpqPosition();
                int num = pos->getTimeSignature()->numerator;
                int den = pos->getTimeSignature()->denominator;
                double beatsPerBar = (num * 4.0) / (den > 0 ? den : 4);
                if (beatsPerBar > 0.0) {
                    m_barNumber.store(static_cast<int>(ppq / beatsPerBar) + 1, std::memory_order_relaxed);
                }
            }
            if (pos->getTimeSignature().hasValue()) {
                m_timeSigNumerator.store(pos->getTimeSignature()->numerator, std::memory_order_relaxed);
                m_timeSigDenominator.store(pos->getTimeSignature()->denominator, std::memory_order_relaxed);
            }
        }
    }

    // 1b. Process Reactive MIDI (Cross-track pattern reaction)
    const double ppq = static_cast<double>(m_ppqPosition.load(std::memory_order_relaxed));
    const double bpm = static_cast<double>(m_currentBpm.load(std::memory_order_relaxed));
    const double sRate = getSampleRate();
    const int nSamples = static_cast<int>(numSamples);
    auto sessionTracks = GlobalSessionHub::getInstance().getAllTracks();

    ReactiveMidiEngine::getInstance().processMidi(
        midiMessages,
        ppq,
        bpm,
        sRate,
        nSamples,
        sessionTracks,
        m_trackName
    );

    // 2. Safely sync bypasses & parameters from Ableton Live Automations only when rack is not mutating
    std::unique_lock<std::recursive_mutex> rackLock = m_rack.tryLock();
    if (rackLock.owns_lock()) {
        if (auto* mesa = m_rack.getCachedMesa()) {
            const bool mesaBypassed = m_paramMesaBypass->get() || !m_paramMesaPower->get();
            mesa->setBypassed(mesaBypassed);
            mesa->setParameter("channel", static_cast<float>(m_paramMesaChannel->get()));
            mesa->setParameter("gain", m_paramMesaGain->get());
            mesa->setParameter("lead_drive", m_paramMesaLeadDrive->get());
            mesa->setParameter("master", m_paramMesaMaster->get());
            mesa->setParameter("lead_master", m_paramMesaLeadMaster->get());
            mesa->setParameter("pull_bright", m_paramMesaPullBright->get() ? 1.0f : 0.0f);
            mesa->setParameter("bass", m_paramMesaBass->get());
            mesa->setParameter("pull_deep", m_paramMesaPullDeep->get() ? 1.0f : 0.0f);
            mesa->setParameter("mid", m_paramMesaMid->get());
            mesa->setParameter("pull_shift", m_paramMesaPullShift->get() ? 1.0f : 0.0f);
            mesa->setParameter("treble", m_paramMesaTreble->get());
            mesa->setParameter("presence", m_paramMesaPresence->get());
            mesa->setParameter("simul_class", m_paramMesaSimulClass->get() ? 1.0f : 0.0f);
            mesa->setParameter("eq_active", m_paramMesaEQActive->get() ? 1.0f : 0.0f);
            if (m_paramMesaEQActive->get()) {
                mesa->setParameter("eq80", m_paramMesaEQ80->get());
                mesa->setParameter("eq240", m_paramMesaEQ240->get());
                mesa->setParameter("eq750", m_paramMesaEQ750->get());
                mesa->setParameter("eq2200", m_paramMesaEQ2200->get());
                mesa->setParameter("eq6600", m_paramMesaEQ6600->get());
            } else {
                mesa->setParameter("eq80", 0.0f);
                mesa->setParameter("eq240", 0.0f);
                mesa->setParameter("eq750", 0.0f);
                mesa->setParameter("eq2200", 0.0f);
                mesa->setParameter("eq6600", 0.0f);
            }
            mesa->setParameter("cab", m_paramMesaCab->get() ? 1.0f : 0.0f);
        }

        if (auto* vox = m_rack.getCachedVox()) {
            const bool voxBypassed = m_paramVoxBypass->get() || !m_paramVoxPower->get();
            vox->setBypassed(voxBypassed);
            vox->setParameter("channel", static_cast<float>(m_paramVoxChannel->get()));
            vox->setParameter("gain", m_paramVoxGain->get());
            vox->setParameter("bass", m_paramVoxBass->get());
            vox->setParameter("treble", m_paramVoxTreble->get());
            vox->setParameter("brilliant", m_paramVoxBrilliant->get() ? 1.0f : 0.0f);
            vox->setParameter("cut", m_paramVoxCut->get());
            vox->setParameter("chime", m_paramVoxChime->get());
            vox->setParameter("master", m_paramVoxMaster->get());
            vox->setParameter("cab", m_paramVoxCab->get() ? 1.0f : 0.0f);
        }

        if (auto* delay = m_rack.getCachedDelay()) {
            delay->setBypassed(m_paramDelayBypass->get());
            delay->setParameter("time", m_paramDelayTime->get());
            delay->setParameter("feedback", m_paramDelayFeedback->get());
        }

        if (auto* filter = m_rack.getCachedFilter()) {
            filter->setBypassed(m_paramFilterBypass->get());
            filter->setParameter("cutoff", m_paramFilterCutoff->get());
        }

        if (auto* ducker = m_rack.getCachedDucker()) {
            ducker->setBypassed(m_paramDuckerBypass->get());
            ducker->setParameter("depth", m_paramDuckerDepth->get());
        }
    }

    // 3. Process Ableton Auxiliary Sidechain Bus
    auto sidechainBus = getBus(true, 1);
    if (sidechainBus != nullptr && sidechainBus->isEnabled()) {
        auto sidechainBuffer = getBusBuffer(buffer, true, 1);
        if (sidechainBuffer.getNumChannels() >= 1) {
            float* const* scData = sidechainBuffer.getArrayOfWritePointers();
            AudioBufferView scView(scData, static_cast<size_t>(sidechainBuffer.getNumChannels()), numSamples);
            auto hits = m_extractor.processBlock(scView);
            m_sidechainEnergy.store(hits.sidechainRMS, std::memory_order_relaxed);

            if (hits.kickTriggered && rackLock.owns_lock()) {
                if (auto* ducker = m_rack.getCachedDucker()) {
                    ducker->trigger(hits.kickVelocity);
                }
            }
        }
    }

    // 4. Process Main Audio through SP-404, Rack & Outbound Amp
    auto mainOutputBus = getBusBuffer(buffer, false, 0);
    const int numOutChannels = mainOutputBus.getNumChannels();
    if (numOutChannels == 0) return;

    auto mainInputBus = getBusBuffer(buffer, true, 0);
    const int numInChannels = mainInputBus.getNumChannels();

    // Ensure output buffer contains input signal where present, and silence where not
    for (int ch = 0; ch < numOutChannels; ++ch) {
        if (ch >= numInChannels) {
            mainOutputBus.clear(ch, 0, static_cast<int>(numSamples));
        } else if (mainInputBus.getReadPointer(ch) != mainOutputBus.getWritePointer(ch)) {
            mainOutputBus.copyFrom(ch, 0, mainInputBus.getReadPointer(ch), static_cast<int>(numSamples));
        }
    }

    float* const* mainData = mainOutputBus.getArrayOfWritePointers();
    AudioBufferView mainView(mainData, static_cast<size_t>(numOutChannels), numSamples);

    const auto spPlacement = m_sp404Engine.getPlacement();
    const bool spBypassed = m_sp404Engine.isBypassed();

    if (!spBypassed && spPlacement == SP404Placement::BeforePedals) {
        // SP-404 rendered into buffer BEFORE pedals, so it passes through delay, filter, and tube amp
        m_sp404Engine.process(mainView, numSamples, true);
        if (rackLock.owns_lock()) {
            m_rack.processWithLock(mainView, rackLock);
        }
    } else {
        // Pedals process input first
        if (rackLock.owns_lock()) {
            m_rack.processWithLock(mainView, rackLock);
        }
        if (!spBypassed && spPlacement == SP404Placement::AfterPedals) {
            // SP-404 rendered clean into output buffer AFTER pedals
            m_sp404Engine.process(mainView, numSamples, true);
        }
    }

    // 5. Measure REAL audio peak and RMS from the active audio output buffer
    float peak = 0.0f;
    float sumSq = 0.0f;
    for (int ch = 0; ch < numOutChannels; ++ch) {
        const float* p = mainOutputBus.getReadPointer(ch);
        for (size_t s = 0; s < numSamples; ++s) {
            float v = std::abs(p[s]);
            if (v > peak) peak = v;
            sumSq += v * v;
        }
    }
    const auto totalSamples = static_cast<float>(numSamples * static_cast<size_t>(std::max(1, numOutChannels)));
    const float rms = (totalSamples > 0.0f) ? std::sqrt(sumSq / totalSamples) : 0.0f;
    const float peakDb = (peak > 1e-4f) ? 20.0f * std::log10(peak) : -96.0f;
    const float rmsDb = (rms > 1e-4f) ? 20.0f * std::log10(rms) : -96.0f;
    m_peakDb.store(peakDb, std::memory_order_relaxed);
    m_rmsDb.store(rmsDb, std::memory_order_relaxed);

    // 6. Broadcast track telemetry to GlobalSessionHub (inter-plugin session registry)
    static thread_local int s_telemetryBlockCount = 0;
    if (++s_telemetryBlockCount >= 25 || noteChanged) {
        s_telemetryBlockCount = 0;
        TrackInstanceInfo info;
        info.instanceId = m_instanceId;
        info.trackName = m_trackName;
        info.trackType = m_isMidiActive.load(std::memory_order_relaxed) ? "midi" : "audio";
        info.midiChannel = m_lastMidiChannel.load(std::memory_order_relaxed);
        info.isMidiActive = m_isMidiActive.load(std::memory_order_relaxed);
        info.lastNoteNumber = m_lastMidiNote.load(std::memory_order_relaxed);
        info.lastVelocity = m_lastMidiVelocity.load(std::memory_order_relaxed);
        info.totalMidiEvents = m_totalMidiEvents.load(std::memory_order_relaxed);
        info.peakDb = peakDb;
        info.rmsDb = rmsDb;

        auto rhythmRes = ReactiveMidiEngine::getInstance().getCurrentRhythm();
        info.rhythmPattern = rhythmRes.pattern;
        info.noteDensity = rhythmRes.noteDensity;
        info.avgIntervalBeats = rhythmRes.avgIntervalBeats;
        info.dominantRegister = rhythmRes.dominantRegister;
        info.activeReactiveRule = ReactiveMidiEngine::getInstance().getLastActiveRule();

        info.lastHeartbeatMs = juce::Time::currentTimeMillis();
        GlobalSessionHub::getInstance().registerOrUpdate(info);
    }
}

void MyPedalBoardAudioProcessor::setParameterFromUI(const juce::String& paramId, float value) {
    for (auto* param : getParameters()) {
        if (auto* p = dynamic_cast<juce::AudioProcessorParameterWithID*>(param)) {
            if (p->paramID == paramId) {
                if (auto* pf = dynamic_cast<juce::AudioParameterFloat*>(p)) {
                    *pf = value;
                } else if (auto* pb = dynamic_cast<juce::AudioParameterBool*>(p)) {
                    *pb = (value > 0.5f);
                } else if (auto* pi = dynamic_cast<juce::AudioParameterInt*>(p)) {
                    *pi = static_cast<int>(std::round(value));
                }
                break;
            }
        }
    }
}

void MyPedalBoardAudioProcessor::setInspectedNode(const std::string& nodeId) {
    m_rack.setInspectedNode(nodeId);
}

void MyPedalBoardAudioProcessor::setPedalParamFromUI(const juce::String& id, const juce::String& paramName, float value) {
    m_rack.setParameter(id.toStdString(), paramName.toStdString(), value);

    // Keep host parameters in sync if this matches
    if (id == "mesa_mark3") {
        if (paramName == "gain") setParameterFromUI("mesa_gain", value);
        else if (paramName == "master") setParameterFromUI("mesa_master", value);
        else if (paramName == "leadDrive" || paramName == "lead_drive") setParameterFromUI("mesa_lead_drive", value);
        else if (paramName == "leadMaster" || paramName == "lead_master") setParameterFromUI("mesa_lead_master", value);
        else if (paramName == "channel") setParameterFromUI("mesa_channel", value);
        else if (paramName == "bass") setParameterFromUI("mesa_bass", value);
        else if (paramName == "mid") setParameterFromUI("mesa_mid", value);
        else if (paramName == "treble") setParameterFromUI("mesa_treble", value);
        else if (paramName == "presence") setParameterFromUI("mesa_presence", value);
        else if (paramName == "pullBright" || paramName == "pull_bright") setParameterFromUI("mesa_pull_bright", value);
        else if (paramName == "pullDeep" || paramName == "pull_deep") setParameterFromUI("mesa_pull_deep", value);
        else if (paramName == "pullShift" || paramName == "pull_shift") setParameterFromUI("mesa_pull_shift", value);
        else if (paramName == "eqActive" || paramName == "eq_active") setParameterFromUI("mesa_eq_active", value);
        else if (paramName == "eq80") setParameterFromUI("mesa_eq80", value);
        else if (paramName == "eq240") setParameterFromUI("mesa_eq240", value);
        else if (paramName == "eq750") setParameterFromUI("mesa_eq750", value);
        else if (paramName == "eq2200") setParameterFromUI("mesa_eq2200", value);
        else if (paramName == "eq6600") setParameterFromUI("mesa_eq6600", value);
        else if (paramName == "simulClass" || paramName == "simul_class") setParameterFromUI("mesa_simul_class", value);
        else if (paramName == "cab") setParameterFromUI("mesa_cab", value);
    } else if (id == "vox_ac30") {
        if (paramName == "gain") setParameterFromUI("vox_gain", value);
        else if (paramName == "bass") setParameterFromUI("vox_bass", value);
        else if (paramName == "treble") setParameterFromUI("vox_treble", value);
        else if (paramName == "cut") setParameterFromUI("vox_cut", value);
        else if (paramName == "chime") setParameterFromUI("vox_chime", value);
        else if (paramName == "master") setParameterFromUI("vox_master", value);
        else if (paramName == "channel") setParameterFromUI("vox_channel", value);
        else if (paramName == "brilliant") setParameterFromUI("vox_brilliant", value);
        else if (paramName == "cab") setParameterFromUI("vox_cab", value);
    } else if (id == "dub_echo") {
        if (paramName == "time") setParameterFromUI("delay_time", value);
        else if (paramName == "feedback") setParameterFromUI("delay_fb", value);
    } else if (id == "resonant_filter") {
        if (paramName == "cutoff") setParameterFromUI("filter_cutoff", value);
    } else if (id == "sidechain_ducker") {
        if (paramName == "depth") setParameterFromUI("ducker_depth", value);
    }
}

void MyPedalBoardAudioProcessor::setPedalBypassedFromUI(const juce::String& id, bool bypassed) {
    m_rack.setBypassed(id.toStdString(), bypassed);
    if (id == "mesa_mark3") {
        setParameterFromUI("mesa_bypass", bypassed ? 1.0f : 0.0f);
        setParameterFromUI("mesa_power", bypassed ? 0.0f : 1.0f);
    } else if (id == "vox_ac30") {
        setParameterFromUI("vox_bypass", bypassed ? 1.0f : 0.0f);
        setParameterFromUI("vox_power", bypassed ? 0.0f : 1.0f);
    } else if (id == "dub_echo") {
        setParameterFromUI("delay_bypass", bypassed ? 1.0f : 0.0f);
    } else if (id == "resonant_filter") {
        setParameterFromUI("filter_bypass", bypassed ? 1.0f : 0.0f);
    } else if (id == "sidechain_ducker") {
        setParameterFromUI("ducker_bypass", bypassed ? 1.0f : 0.0f);
    }
}

void MyPedalBoardAudioProcessor::addPedalFromUI(const juce::String& type, const juce::String& id) {
    m_rack.addPedalByType(type.toStdString(), id.toStdString());
}

void MyPedalBoardAudioProcessor::removePedalFromUI(const juce::String& id) {
    m_rack.removeNode(id.toStdString());
    if (id == "mesa_mark3") {
        setParameterFromUI("mesa_bypass", 1.0f);
        setParameterFromUI("mesa_power", 0.0f);
    } else if (id == "vox_ac30") {
        setParameterFromUI("vox_bypass", 1.0f);
        setParameterFromUI("vox_power", 0.0f);
    } else if (id == "dub_echo") {
        setParameterFromUI("delay_bypass", 1.0f);
    } else if (id == "resonant_filter") {
        setParameterFromUI("filter_bypass", 1.0f);
    } else if (id == "sidechain_ducker") {
        setParameterFromUI("ducker_bypass", 1.0f);
    }
}

void MyPedalBoardAudioProcessor::syncRackFromUI(const juce::var& data) {
    juce::var parsedData = data;
    if (data.isString()) {
        parsedData = juce::JSON::parse(data.toString());
    }

    m_lastRackStateJson = juce::JSON::toString(parsedData, false);

    const juce::Array<juce::var>* list = nullptr;
    if (parsedData.isArray()) {
        list = parsedData.getArray();
    } else if (parsedData.isObject()) {
        auto pedalsProp = parsedData.getProperty("pedals", juce::var());
        if (pedalsProp.isArray()) {
            list = pedalsProp.getArray();
        }
    }

    if (list == nullptr) return;

    // Acquire recursive lock so audio thread gracefully skips mutating rack
    auto fullRackSyncLock = m_rack.lock();

    // 1. Desired IDs in exact order
    std::vector<std::string> desiredIds;
    for (const auto& item : *list) {
        if (!item.isObject()) continue;
        auto id = item.getProperty("id", "").toString().toStdString();
        if (!id.empty()) {
            desiredIds.push_back(id);
        }
    }

    // 2. Remove any existing node in m_rack that is not in desiredIds
    auto currentInfo = m_rack.getRackInfo();
    for (const auto& curr : currentInfo) {
        if (std::find(desiredIds.begin(), desiredIds.end(), curr.id) == desiredIds.end()) {
            removePedalFromUI(curr.id);
        }
    }

    // 3. Add or update each pedal in list
    for (const auto& item : *list) {
        if (!item.isObject()) continue;
        std::string id = item.getProperty("id", "").toString().toStdString();
        std::string type = item.getProperty("type", "").toString().toStdString();
        bool bypassed = static_cast<bool>(item.getProperty("bypassed", false));

        if (id.empty()) continue;

        if (m_rack.getNode(id) == nullptr) {
            m_rack.addPedalByType(type, id);
        }

        setPedalBypassedFromUI(id, bypassed);

        auto paramsVar = item.getProperty("parameters", juce::var());
        if (paramsVar.isObject()) {
            if (auto* obj = paramsVar.getDynamicObject()) {
                for (const auto& prop : obj->getProperties()) {
                    juce::String pName = prop.name.toString();
                    float val = 0.0f;
                    if (prop.value.isObject()) {
                        val = static_cast<float>(prop.value.getProperty("value", 0.0));
                    } else {
                        val = static_cast<float>(prop.value);
                    }
                    setPedalParamFromUI(id, pName, val);
                }
            }
        }
    }

    // 4. Reorder m_rack to match desired order
    for (size_t targetIdx = 0; targetIdx < desiredIds.size(); ++targetIdx) {
        auto info = m_rack.getRackInfo();
        for (size_t curIdx = targetIdx; curIdx < info.size(); ++curIdx) {
            if (info[curIdx].id == desiredIds[targetIdx]) {
                if (curIdx != targetIdx) {
                    m_rack.moveNode(curIdx, targetIdx);
                }
                break;
            }
        }
    }
}

juce::String MyPedalBoardAudioProcessor::getTelemetryJsonString() {
    juce::DynamicObject::Ptr root = new juce::DynamicObject();

    // 1. Ableton Live Playhead & Transport info
    root->setProperty("bpm", static_cast<double>(m_currentBpm.load(std::memory_order_relaxed)));
    root->setProperty("isPlaying", m_isPlaying.load(std::memory_order_relaxed));
    root->setProperty("barNumber", m_barNumber.load(std::memory_order_relaxed));
    root->setProperty("ppq", static_cast<double>(m_ppqPosition.load(std::memory_order_relaxed)));
    root->setProperty("timeSigNum", m_timeSigNumerator.load(std::memory_order_relaxed));
    root->setProperty("timeSigDen", m_timeSigDenominator.load(std::memory_order_relaxed));

    // 2. Real Audio Levels & Sidechain
    root->setProperty("peakDb", static_cast<double>(m_peakDb.load(std::memory_order_relaxed)));
    root->setProperty("rmsDb", static_cast<double>(m_rmsDb.load(std::memory_order_relaxed)));
    root->setProperty("sidechainRMS", static_cast<double>(m_sidechainEnergy.load(std::memory_order_relaxed)));

    // 3. Node inspection ID
    root->setProperty("inspectedNode", juce::String(m_rack.getInspectedNode()));

    // 4. Real 512-sample waveform buffer
    std::array<float, kWaveformBufferSize> wave{};
    m_rack.getInspectedWaveform(wave);
    juce::Array<juce::var> waveArray;
    waveArray.ensureStorageAllocated(static_cast<int>(kWaveformBufferSize));
    for (size_t i = 0; i < kWaveformBufferSize; ++i) {
        waveArray.add(static_cast<double>(wave[i]));
    }
    root->setProperty("waveform", waveArray);

    // 5. Host parameters for bidirectional sync
    juce::DynamicObject::Ptr paramsObj = new juce::DynamicObject();
    for (auto* param : getParameters()) {
        if (auto* p = dynamic_cast<juce::AudioProcessorParameterWithID*>(param)) {
            if (auto* pf = dynamic_cast<juce::AudioParameterFloat*>(p)) {
                paramsObj->setProperty(p->paramID, static_cast<double>(pf->get()));
            } else if (auto* pb = dynamic_cast<juce::AudioParameterBool*>(p)) {
                paramsObj->setProperty(p->paramID, pb->get());
            } else if (auto* pi = dynamic_cast<juce::AudioParameterInt*>(p)) {
                paramsObj->setProperty(p->paramID, pi->get());
            }
        }
    }
    root->setProperty("parameters", juce::var(paramsObj.get()));

    // 6. Real-time Feature Extractor Telemetry (Musical State & Sensory Detectors)
    auto featTelem = m_extractor.getTelemetry();
    root->setProperty("musicalState", juce::String(musicalStateToString(featTelem.currentState)));

    juce::Array<juce::var> sensorArray;
    for (const auto& ch : featTelem.channels) {
        juce::DynamicObject::Ptr sObj = new juce::DynamicObject();
        sObj->setProperty("id", juce::String(ch.id));
        sObj->setProperty("energy", static_cast<double>(ch.energy));
        sObj->setProperty("density", static_cast<double>(ch.densityPerBar));
        sObj->setProperty("totalHits", static_cast<int>(ch.totalHits));
        sObj->setProperty("triggered", ch.justTriggered);
        sensorArray.add(juce::var(sObj.get()));
    }
    root->setProperty("sensors", sensorArray);

    // 7. Live MIDI & State Telemetry
    root->setProperty("lastMidiNote", m_lastMidiNote.load(std::memory_order_relaxed));
    root->setProperty("lastMidiVelocity", m_lastMidiVelocity.load(std::memory_order_relaxed));
    root->setProperty("lastMidiChannel", m_lastMidiChannel.load(std::memory_order_relaxed));
    root->setProperty("totalMidiEvents", m_totalMidiEvents.load(std::memory_order_relaxed));
    root->setProperty("isMidiActive", m_isMidiActive.load(std::memory_order_relaxed));

    // 8. Session Tracks & SuperCollider Engine
    root->setProperty("sessionTracks", GlobalSessionHub::getInstance().getTracksAsVar());
    root->setProperty("supercollider", SuperColliderManager::getInstance().getStatusAsVar());

    // 9. Reactive MIDI Engine telemetry
    auto rhythm = ReactiveMidiEngine::getInstance().getCurrentRhythm();
    juce::DynamicObject::Ptr reactiveObj = new juce::DynamicObject();
    reactiveObj->setProperty("enabled", ReactiveMidiEngine::getInstance().isEnabled());
    reactiveObj->setProperty("rhythmPattern", juce::String(rhythm.pattern));
    reactiveObj->setProperty("noteDensity", static_cast<double>(rhythm.noteDensity));
    reactiveObj->setProperty("avgIntervalBeats", static_cast<double>(rhythm.avgIntervalBeats));
    reactiveObj->setProperty("dominantRegister", rhythm.dominantRegister);
    reactiveObj->setProperty("lastActiveRule", juce::String(ReactiveMidiEngine::getInstance().getLastActiveRule()));
    reactiveObj->setProperty("rules", ReactiveMidiEngine::getInstance().getRulesAsVar());
    root->setProperty("reactiveMidi", juce::var(reactiveObj.get()));

    // 8. Real Current Track Metadata from Ableton Live (via updateTrackProperties)
    root->setProperty("currentTrackName", juce::String(m_trackName));
    root->setProperty("currentTrackColor", static_cast<juce::int64>(m_trackColorARGB.load(std::memory_order_relaxed)));

    return juce::JSON::toString(juce::var(root.get()), true);
}

void MyPedalBoardAudioProcessor::updateTrackProperties(const TrackProperties& properties) {
    if (properties.name.has_value() && !properties.name->isEmpty()) {
        m_trackName = properties.name->toStdString();
    }
    if (properties.colourARGB.has_value()) {
        m_trackColorARGB.store(*properties.colourARGB, std::memory_order_relaxed);
    }

    TrackInstanceInfo info;
    info.instanceId = m_instanceId;
    info.trackName = m_trackName;
    info.trackType = m_isMidiActive.load(std::memory_order_relaxed) ? "midi" : "audio";
    info.midiChannel = m_lastMidiChannel.load(std::memory_order_relaxed);
    info.isMidiActive = m_isMidiActive.load(std::memory_order_relaxed);
    info.lastNoteNumber = m_lastMidiNote.load(std::memory_order_relaxed);
    info.lastVelocity = m_lastMidiVelocity.load(std::memory_order_relaxed);
    info.totalMidiEvents = m_totalMidiEvents.load(std::memory_order_relaxed);
    info.heldNotes = {m_lastMidiNote.load(std::memory_order_relaxed)};
    info.peakDb = m_peakDb.load(std::memory_order_relaxed);
    info.rmsDb = m_rmsDb.load(std::memory_order_relaxed);
    info.lastHeartbeatMs = juce::Time::currentTimeMillis();
    GlobalSessionHub::getInstance().registerOrUpdate(info);
}

juce::AudioProcessorEditor* MyPedalBoardAudioProcessor::createEditor() {
    return new MyPedalBoardAudioProcessorEditor(*this);
}

void MyPedalBoardAudioProcessor::getStateInformation(juce::MemoryBlock& destData) {
    juce::MemoryOutputStream stream(destData, true);
    stream.writeString("JWS_SESSION_V2");

    auto params = getParameters();
    stream.writeInt(params.size());
    for (auto* param : params) {
        if (auto* p = dynamic_cast<juce::AudioProcessorParameterWithID*>(param)) {
            stream.writeString(p->paramID);
            stream.writeFloat(p->getValue());
        }
    }

    stream.writeString(m_lastRackStateJson);
}

void MyPedalBoardAudioProcessor::setStateInformation(const void* data, int sizeInBytes) {
    if (sizeInBytes <= 0 || data == nullptr) return;
    juce::MemoryInputStream stream(data, static_cast<size_t>(sizeInBytes), false);
    juce::String header = stream.readString();

    if (header == "JWS_SESSION_V2") {
        int numParams = stream.readInt();
        for (int i = 0; i < numParams && !stream.isExhausted(); ++i) {
            auto paramID = stream.readString();
            auto value = stream.readFloat();
            for (auto* param : getParameters()) {
                if (auto* p = dynamic_cast<juce::AudioProcessorParameterWithID*>(param)) {
                    if (p->paramID == paramID) {
                        p->setValueNotifyingHost(value);
                        break;
                    }
                }
            }
        }

        if (!stream.isExhausted()) {
            m_lastRackStateJson = stream.readString();
            if (!m_lastRackStateJson.isEmpty()) {
                syncRackFromUI(juce::JSON::parse(m_lastRackStateJson));
            }
        }
    } else {
        // Fallback for legacy parameter-only stream
        auto paramID = header;
        if (!paramID.isEmpty()) {
            auto value = stream.readFloat();
            for (auto* param : getParameters()) {
                if (auto* p = dynamic_cast<juce::AudioProcessorParameterWithID*>(param)) {
                    if (p->paramID == paramID) {
                        p->setValueNotifyingHost(value);
                        break;
                    }
                }
            }
        }
        while (!stream.isExhausted()) {
            auto pid = stream.readString();
            auto val = stream.readFloat();
            for (auto* param : getParameters()) {
                if (auto* p = dynamic_cast<juce::AudioProcessorParameterWithID*>(param)) {
                    if (p->paramID == pid) {
                        p->setValueNotifyingHost(val);
                        break;
                    }
                }
            }
        }
    }
}

juce::String MyPedalBoardAudioProcessor::getSessionTracksJson() {
    return GlobalSessionHub::getInstance().getTracksJson();
}

juce::String MyPedalBoardAudioProcessor::getSuperColliderJson() {
    return SuperColliderManager::getInstance().getStatusJson();
}

bool MyPedalBoardAudioProcessor::bootSuperCollider(int port) {
    return SuperColliderManager::getInstance().boot(port);
}

bool MyPedalBoardAudioProcessor::killSuperCollider() {
    return SuperColliderManager::getInstance().kill();
}

bool MyPedalBoardAudioProcessor::executeSuperColliderAction(const juce::String& action) {
    return SuperColliderManager::getInstance().executeAction(action.toStdString());
}

juce::String MyPedalBoardAudioProcessor::getReactiveMidiRulesJson() {
    return ReactiveMidiEngine::getInstance().getRulesJson();
}

void MyPedalBoardAudioProcessor::setReactiveMidiRulesFromUI(const juce::var& data) {
    if (data.isArray()) {
        std::vector<ReactiveMidiRule> rules;
        for (int i = 0; i < data.size(); ++i) {
            auto item = data[i];
            if (item.isObject()) {
                ReactiveMidiRule r;
                r.id = item.getProperty("id", juce::String("rule_" + juce::String(i))).toString().toStdString();
                r.name = item.getProperty("name", "Custom Rule").toString().toStdString();
                r.enabled = static_cast<bool>(item.getProperty("enabled", true));
                r.sourceTrackFilter = item.getProperty("sourceTrackFilter", "bass").toString().toStdString();
                r.triggerRhythm = item.getProperty("triggerRhythm", "1/4").toString().toStdString();
                r.actionType = item.getProperty("actionType", "arp_1_16").toString().toStdString();
                r.param = static_cast<float>(item.getProperty("param", 1.0));
                r.scOscAddress = item.getProperty("scOscAddress", "/state/rhythm").toString().toStdString();
                rules.push_back(r);
            }
        }
        ReactiveMidiEngine::getInstance().setRules(rules);
    }
}

void MyPedalBoardAudioProcessor::toggleReactiveMidiRule(const juce::String& ruleId) {
    ReactiveMidiEngine::getInstance().toggleRule(ruleId.toStdString());
}

void MyPedalBoardAudioProcessor::addReactiveMidiRule(const juce::var& ruleData) {
    if (ruleData.isObject()) {
        ReactiveMidiRule r;
        r.id = ruleData.getProperty("id", juce::String("rule_" + juce::String(juce::Time::currentTimeMillis()))).toString().toStdString();
        r.name = ruleData.getProperty("name", "New Rule").toString().toStdString();
        r.enabled = static_cast<bool>(ruleData.getProperty("enabled", true));
        r.sourceTrackFilter = ruleData.getProperty("sourceTrackFilter", "bass").toString().toStdString();
        r.triggerRhythm = ruleData.getProperty("triggerRhythm", "1/4").toString().toStdString();
        r.actionType = ruleData.getProperty("actionType", "arp_1_16").toString().toStdString();
        r.param = static_cast<float>(ruleData.getProperty("param", 1.0));
        r.scOscAddress = ruleData.getProperty("scOscAddress", "/state/rhythm").toString().toStdString();
        ReactiveMidiEngine::getInstance().addRule(r);
    }
}

void MyPedalBoardAudioProcessor::setReactiveMidiEnabled(bool enabled) {
    ReactiveMidiEngine::getInstance().setEnabled(enabled);
}

bool MyPedalBoardAudioProcessor::isReactiveMidiEnabled() const {
    return ReactiveMidiEngine::getInstance().isEnabled();
}

void MyPedalBoardAudioProcessor::triggerSP404Pad(int bankIndex, int padId, float velocity, float semitoneOffset) {
    m_sp404Engine.triggerPad(bankIndex, padId, velocity, semitoneOffset);
}

void MyPedalBoardAudioProcessor::releaseSP404Pad(int bankIndex, int padId) {
    m_sp404Engine.releasePad(bankIndex, padId);
}

void MyPedalBoardAudioProcessor::setSP404Routing(const juce::String& order, bool bypassed) {
    m_sp404Engine.setPlacement(order == "before" ? SP404Placement::BeforePedals : SP404Placement::AfterPedals);
    m_sp404Engine.setBypassed(bypassed);
}

void MyPedalBoardAudioProcessor::setSP404Param(const juce::String& paramName, float value) {
    m_sp404Engine.setParam(paramName.toStdString(), value);
}

} // namespace johnwalls::pedalboard

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    return new johnwalls::pedalboard::MyPedalBoardAudioProcessor();
}
