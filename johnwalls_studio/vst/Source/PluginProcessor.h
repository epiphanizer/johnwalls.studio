#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "johnwalls/pedal_rack.hpp"
#include "johnwalls/feature_extractor.hpp"
#include "LocalTelemetryServer.h"
#include "ReactiveMidiEngine.h"
#include "SP404Engine.h"
#include "AudioTakeRecorder.h"
#include <array>
#include <atomic>
#include <string>

namespace johnwalls::johnwalls {

class JohnwallsStudioAudioProcessor : public juce::AudioProcessor {
public:
    static constexpr size_t kWaveformBufferSize = 512;

    JohnwallsStudioAudioProcessor();
    ~JohnwallsStudioAudioProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "johnwalls.studio"; }

    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return "Default"; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;
    void updateTrackProperties(const TrackProperties& properties) override;
    std::string getTrackName() const;
    void publishSessionState();

    PedalRack& getRack() { return m_rack; }
    FeatureExtractor& getExtractor() { return m_extractor; }

    void getLatestWaveform(std::array<float, kWaveformBufferSize>& dest) const {
        m_rack.getInspectedWaveform(dest);
    }

    // Telemetry and UI linkage methods
    juce::String getTelemetryJsonString();
    void setParameterFromUI(const juce::String& paramId, float value);
    void setInspectedNode(const std::string& nodeId);

    // Dynamic rack and pedal chain synchronization methods
    void syncRackFromUI(const juce::var& data);
    void addPedalFromUI(const juce::String& type, const juce::String& id);
    void removePedalFromUI(const juce::String& id);
    void setPedalBypassedFromUI(const juce::String& id, bool bypassed);
    void setPedalParamFromUI(const juce::String& id, const juce::String& paramName, float value);

    // State Module, Global Session Hub & SuperCollider integration
    juce::String getSessionTracksJson();
    juce::String getSuperColliderJson();
    bool bootSuperCollider(int port = 57110);
    bool killSuperCollider();
    bool executeSuperColliderAction(const juce::String& action, const juce::String& payload = {});

    // Reactive MIDI Engine methods
    juce::String getReactiveMidiRulesJson();
    void setReactiveMidiRulesFromUI(const juce::var& data);
    void toggleReactiveMidiRule(const juce::String& ruleId);
    void addReactiveMidiRule(const juce::var& ruleData);
    void setReactiveMidiEnabled(bool enabled);
    bool isReactiveMidiEnabled() const;

    // SP-404 MKII Real-Time Sampler Engine methods
    SP404Engine& getSP404Engine() noexcept { return m_sp404Engine; }
    void triggerSP404Pad(int bankIndex, int padId, float velocity = 1.0f, float semitoneOffset = 0.0f);
    void releaseSP404Pad(int bankIndex, int padId);
    void setSP404Routing(const juce::String& order, bool bypassed);
    void setSP404Param(const juce::String& paramName, float value);

    LocalTelemetryServer& getTelemetryServer() { return m_telemetryServer; }
    AudioTakeRecorder& getTakeRecorder() noexcept { return m_takeRecorder; }
    const AudioTakeRecorder& getTakeRecorder() const noexcept { return m_takeRecorder; }
    float getCurrentBpm() const noexcept { return m_currentBpm.load(std::memory_order_relaxed); }

private:
    PedalRack m_rack;
    FeatureExtractor m_extractor;
    SP404Engine m_sp404Engine;
    AudioTakeRecorder m_takeRecorder;
    LocalTelemetryServer m_telemetryServer;

    std::string m_instanceId;
    std::string m_trackName{"Track"};
    mutable juce::CriticalSection m_nameLock; // m_trackName is written by the host/message thread

    // Reactive MIDI is per instance; its rules are shared process-wide.
    ReactiveMidiEngine m_reactive;

    // Last host-parameter values pushed into the rack (NaN = unknown). See processBlock().
    float m_pushed[48];
    const void* m_pushedNode[5]{};

    // Publishes session state / evaluates reactive rules / streams OSC off the audio thread.
    class SessionWorker : public juce::Thread {
    public:
        explicit SessionWorker(JohnwallsStudioAudioProcessor& owner) : juce::Thread("JWS Session Worker"), m_owner(owner) {}
        void run() override {
            while (!threadShouldExit()) {
                m_owner.publishSessionState();
                wait(50);
            }
        }
    private:
        JohnwallsStudioAudioProcessor& m_owner;
    };
    SessionWorker m_sessionWorker{*this};
    std::atomic<uint32_t> m_trackColorARGB{0xff22d3ee};
    std::atomic<int> m_lastMidiNote{0};
    std::atomic<int> m_lastMidiVelocity{0};
    std::atomic<int> m_lastMidiChannel{1};
    std::atomic<int> m_totalMidiEvents{0};
    std::atomic<bool> m_isMidiActive{false};

    // Real-time Ableton Live transport state
    std::atomic<float> m_currentBpm{120.0f};
    std::atomic<bool> m_isPlaying{false};
    std::atomic<float> m_ppqPosition{0.0f};
    std::atomic<int> m_barNumber{1};
    std::atomic<int> m_timeSigNumerator{4};
    std::atomic<int> m_timeSigDenominator{4};

    // Real-time audio levels & sidechain
    std::atomic<float> m_peakDb{-96.0f};
    std::atomic<float> m_rmsDb{-96.0f};
    std::atomic<float> m_sidechainEnergy{0.0f};

    // Parameters exposed to Ableton Live
    juce::AudioParameterBool* m_paramMesaPower{nullptr};
    juce::AudioParameterBool* m_paramMesaBypass{nullptr};
    juce::AudioParameterInt* m_paramMesaChannel{nullptr};
    juce::AudioParameterFloat* m_paramMesaGain{nullptr};
    juce::AudioParameterFloat* m_paramMesaLeadDrive{nullptr};
    juce::AudioParameterFloat* m_paramMesaMaster{nullptr};
    juce::AudioParameterFloat* m_paramMesaLeadMaster{nullptr};
    juce::AudioParameterBool* m_paramMesaPullBright{nullptr};
    juce::AudioParameterFloat* m_paramMesaBass{nullptr};
    juce::AudioParameterBool* m_paramMesaPullDeep{nullptr};
    juce::AudioParameterFloat* m_paramMesaMid{nullptr};
    juce::AudioParameterBool* m_paramMesaPullShift{nullptr};
    juce::AudioParameterFloat* m_paramMesaTreble{nullptr};
    juce::AudioParameterFloat* m_paramMesaPresence{nullptr};
    juce::AudioParameterBool* m_paramMesaEQActive{nullptr};
    juce::AudioParameterFloat* m_paramMesaEQ80{nullptr};
    juce::AudioParameterFloat* m_paramMesaEQ240{nullptr};
    juce::AudioParameterFloat* m_paramMesaEQ750{nullptr};
    juce::AudioParameterFloat* m_paramMesaEQ2200{nullptr};
    juce::AudioParameterFloat* m_paramMesaEQ6600{nullptr};
    juce::AudioParameterBool* m_paramMesaSimulClass{nullptr};
    juce::AudioParameterBool* m_paramMesaCab{nullptr};

    juce::AudioParameterBool* m_paramVoxPower{nullptr};
    juce::AudioParameterBool* m_paramVoxBypass{nullptr};
    juce::AudioParameterInt* m_paramVoxChannel{nullptr};
    juce::AudioParameterFloat* m_paramVoxGain{nullptr};
    juce::AudioParameterFloat* m_paramVoxBass{nullptr};
    juce::AudioParameterFloat* m_paramVoxTreble{nullptr};
    juce::AudioParameterFloat* m_paramVoxCut{nullptr};
    juce::AudioParameterFloat* m_paramVoxChime{nullptr};
    juce::AudioParameterBool* m_paramVoxBrilliant{nullptr};
    juce::AudioParameterFloat* m_paramVoxMaster{nullptr};
    juce::AudioParameterBool* m_paramVoxCab{nullptr};

    juce::AudioParameterBool* m_paramDelayBypass{nullptr};
    juce::AudioParameterFloat* m_paramDelayTime{nullptr};
    juce::AudioParameterFloat* m_paramDelayFeedback{nullptr};

    juce::AudioParameterBool* m_paramFilterBypass{nullptr};
    juce::AudioParameterFloat* m_paramFilterCutoff{nullptr};

    juce::AudioParameterBool* m_paramDuckerBypass{nullptr};
    juce::AudioParameterFloat* m_paramDuckerDepth{nullptr};

    // Full studio rack session state serialization
    juce::String m_lastRackStateJson;

public:
    const juce::String& getLastRackStateJson() const noexcept { return m_lastRackStateJson; }

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(JohnwallsStudioAudioProcessor)
};

} // namespace johnwalls::johnwalls
