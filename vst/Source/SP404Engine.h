#pragma once

#include "johnwalls/audio_buffer.hpp"
#include "johnwalls/dsp_nodes.hpp"
#include <vector>
#include <array>
#include <string>
#include <atomic>
#include <mutex>
#include <memory>
#include <cmath>
#include <algorithm>
#include <cstdint>

namespace johnwalls::johnwalls {

enum class SP404Placement {
    BeforePedals = 0,
    AfterPedals = 1
};

enum class SP404MFX {
    Vinyl = 0,
    DJFX = 1,
    Isolator = 2,
    Cassette = 3,
    Filter = 4,
    Pitch = 5
};

struct SP404PadData {
    int id{1}; // 1 to 12 on the legacy Original / A profile
    int bank{0}; // 0 = A, 1 = B, ... 9 = J
    std::string label{"EMPTY"};
    std::string category{"custom"};
    std::vector<float> sampleL;
    std::vector<float> sampleR;
    float sampleRate{48000.0f};
    float durationSeconds{0.0f};
    float pitchSemitones{0.0f}; // -24 to +24
    float volume{1.0f};
    float pan{0.0f}; // -1.0 to 1.0
    bool isLoop{false};
    bool isReverse{false};
    int muteGroup{0}; // 0 = none, 1 = hihat choke group
};

struct SP404Voice {
    bool active{false};
    int bankIndex{0};
    int padId{1};
    double pos{0.0};
    double step{1.0};
    float volume{1.0f};
    float panL{1.0f};
    float panR{1.0f};
    int muteGroup{0};
    bool loop{false};
    bool reverse{false};
    float fadeOutGain{1.0f};
    bool fadingOut{false};
    const std::vector<float>* pSampleL{nullptr};
    const std::vector<float>* pSampleR{nullptr};
};

class SP404Engine {
public:
    static constexpr size_t kNumBanks = 10;
    static constexpr size_t kPadsPerBank = 12;
    static constexpr size_t kMaxVoices = 32;

    SP404Engine();
    ~SP404Engine() = default;

    void prepare(double sampleRate, int samplesPerBlock);
    void reset();

    // Audio rendering: mixes active voices & MFX directly into the host buffer
    void process(AudioBufferView& buffer, size_t numSamples, bool mixToOutput = true);

    // Voice triggering
    void triggerPad(int bankIndex, int padId, float velocity = 1.0f, float semitoneOffset = 0.0f);
    void releasePad(int bankIndex, int padId);
    void stopAll();

    // MIDI integration
    void handleMidiNoteOn(int noteNumber, float velocity);
    void handleMidiNoteOff(int noteNumber);

    // Routing & Placement
    void setPlacement(SP404Placement p) noexcept { m_placement.store(p, std::memory_order_relaxed); }
    [[nodiscard]] SP404Placement getPlacement() const noexcept { return m_placement.load(std::memory_order_relaxed); }

    void setBypassed(bool b) noexcept { m_bypassed.store(b, std::memory_order_relaxed); }
    [[nodiscard]] bool isBypassed() const noexcept { return m_bypassed.load(std::memory_order_relaxed); }

    // Parameters (Volume, CTRL 1, CTRL 2, CTRL 3, MFX type)
    void setParam(const std::string& name, float value);
    [[nodiscard]] float getParam(const std::string& name) const;

    // Custom sample loading from UI or files
    bool loadCustomSample(int bankIndex, int padId, const float* left, const float* right,
                          size_t numSamples, float sampleRate, const std::string& label,
                          float pitchSemitones = 0.0f, float volume = 1.0f, float pan = 0.0f,
                          bool isLoop = false, bool isReverse = false, int muteGroup = 0);
    void clearCustomSamples();
    std::vector<uint8_t> serializeState() const;
    bool deserializeState(const uint8_t* data, size_t size);

    // Chromatic mode settings
    void setChromaticMode(bool enabled, int rootBank = 0, int rootPad = 11) noexcept {
        m_isChromatic.store(enabled, std::memory_order_relaxed);
        m_chromaticRootBank.store(rootBank, std::memory_order_relaxed);
        m_chromaticRootPad.store(rootPad, std::memory_order_relaxed);
    }
    [[nodiscard]] bool isChromaticMode() const noexcept { return m_isChromatic.load(std::memory_order_relaxed); }
    [[nodiscard]] int getChromaticRootBank() const noexcept { return m_chromaticRootBank.load(std::memory_order_relaxed); }
    [[nodiscard]] int getChromaticRootPad() const noexcept { return m_chromaticRootPad.load(std::memory_order_relaxed); }

    SP404PadData* getPad(int bankIndex, int padId);
    const SP404PadData* getPad(int bankIndex, int padId) const;

private:
    // Lock-free MIDI hand-off (audio thread -> audio thread) so note events never block on m_voiceMutex.
    struct MidiEvent { bool noteOn{false}; int note{0}; float velocity{0.0f}; };
    static constexpr uint32_t kMidiQueueSize = 256;
    std::array<MidiEvent, kMidiQueueSize> m_midiQueue{};
    std::atomic<uint32_t> m_midiHead{0};
    std::atomic<uint32_t> m_midiTail{0};
    void enqueueMidi(bool noteOn, int noteNumber, float velocity);
    void drainMidiLocked();
    void triggerPadLocked(int bankIndex, int padId, float velocity, float semitoneOffset);
    void releasePadLocked(int bankIndex, int padId);

    void initDefaultBankA();
    void updateMfxFilters();

    double m_sampleRate{48000.0};
    std::atomic<SP404Placement> m_placement{SP404Placement::BeforePedals};
    std::atomic<bool> m_bypassed{false};

    // Knobs & Master settings
    std::atomic<float> m_volume{8.5f}; // 0.0 to 10.0
    std::atomic<float> m_ctrl1{6.5f};  // 0.0 to 10.0
    std::atomic<float> m_ctrl2{4.0f};  // 0.0 to 10.0
    std::atomic<float> m_ctrl3{8.0f};  // 0.0 to 10.0
    std::atomic<int> m_activeMfx{static_cast<int>(SP404MFX::Vinyl)};

    std::atomic<bool> m_isChromatic{false};
    std::atomic<int> m_chromaticRootBank{0};
    std::atomic<int> m_chromaticRootPad{11};

    // Bank & Voice storage
    std::array<std::array<SP404PadData, kPadsPerBank>, kNumBanks> m_banks{};
    std::array<SP404Voice, kMaxVoices> m_voices{};
    mutable std::mutex m_voiceMutex;

    // MFX DSP components
    RBJBiquad m_isoLowL, m_isoLowR;
    RBJBiquad m_isoMidL, m_isoMidR;
    RBJBiquad m_isoHighL, m_isoHighR;
    RBJBiquad m_filterL, m_filterR;
};

} // namespace johnwalls::johnwalls
