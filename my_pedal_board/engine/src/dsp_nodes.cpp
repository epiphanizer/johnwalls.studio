#include "pedalboard/dsp_nodes.hpp"
#include <cmath>
#include <algorithm>

namespace johnwalls::pedalboard {

// ---------------------------------------------------------------------------
// TapeDelayNode Implementation
// ---------------------------------------------------------------------------

TapeDelayNode::TapeDelayNode(std::string id) {
    m_id = std::move(id);
    m_bufferL.assign(m_maxDelaySamples, 0.0f);
    m_bufferR.assign(m_maxDelaySamples, 0.0f);
}

void TapeDelayNode::prepare(double sampleRate, size_t /*maxBlockSize*/) {
    m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    m_maxDelaySamples = static_cast<size_t>(m_sampleRate * 4.0); // 4 seconds max
    m_bufferL.assign(m_maxDelaySamples, 0.0f);
    m_bufferR.assign(m_maxDelaySamples, 0.0f);
    m_writeIndex = 0;
    m_lfoInc = static_cast<float>(2.0 * 3.1415926535 * 1.2 / m_sampleRate); // 1.2 Hz flutter
    reset();
}

void TapeDelayNode::reset() {
    std::fill(m_bufferL.begin(), m_bufferL.end(), 0.0f);
    std::fill(m_bufferR.begin(), m_bufferR.end(), 0.0f);
    m_writeIndex = 0;
    m_lfoPhase = 0.0f;
}

void TapeDelayNode::process(AudioBufferView& buffer) {
    if (m_bypassed || buffer.getNumChannels() == 0) return;

    const size_t numSamples = buffer.getNumSamples();
    float* channelL = buffer.getChannelData(0);
    float* channelR = (buffer.getNumChannels() > 1) ? buffer.getChannelData(1) : channelL;

    float baseDelaySamples = (m_delayTimeMs * 0.001f) * static_cast<float>(m_sampleRate);
    baseDelaySamples = std::clamp(baseDelaySamples, 10.0f, static_cast<float>(m_maxDelaySamples - 100));

    for (size_t i = 0; i < numSamples; ++i) {
        // Wow/flutter subtle sinusoidal modulation
        m_lfoPhase += m_lfoInc;
        if (m_lfoPhase >= 2.0f * 3.1415926535f) m_lfoPhase -= 2.0f * 3.1415926535f;
        float flutterOffset = fastSin(m_lfoPhase) * (m_flutter * 24.0f);

        float currentDelay = baseDelaySamples + flutterOffset;
        float readPos = static_cast<float>(m_writeIndex) - currentDelay;
        if (readPos < 0.0f) readPos += static_cast<float>(m_maxDelaySamples);

        // Linear interpolation
        auto rIndex0 = static_cast<size_t>(readPos);
        size_t rIndex1 = (rIndex0 + 1) % m_maxDelaySamples;
        float frac = readPos - static_cast<float>(rIndex0);

        float delayedL = m_bufferL[rIndex0] + frac * (m_bufferL[rIndex1] - m_bufferL[rIndex0]);
        float delayedR = m_bufferR[rIndex0] + frac * (m_bufferR[rIndex1] - m_bufferR[rIndex0]);

        // Tape saturation on feedback path
        float fbL = fastTanh(delayedL * (1.0f + m_saturation * 2.0f)) * m_feedback;
        float fbR = fastTanh(delayedR * (1.0f + m_saturation * 2.0f)) * m_feedback;

        float inL = channelL[i];
        float inR = channelR[i];

        m_bufferL[m_writeIndex] = inL + fbL;
        m_bufferR[m_writeIndex] = inR + fbR;

        m_writeIndex = (m_writeIndex + 1) % m_maxDelaySamples;

        // Wet/Dry mix
        channelL[i] = (1.0f - m_mix) * inL + m_mix * delayedL;
        channelR[i] = (1.0f - m_mix) * inR + m_mix * delayedR;
    }
}

bool TapeDelayNode::setParameter(const std::string& name, float value) {
    if (name == "time") {
        m_delayTimeMs = std::clamp(value, 5.0f, 2500.0f);
        return true;
    }
    if (name == "feedback" || name == "fb") {
        m_feedback = std::clamp(value, 0.0f, 0.98f);
        return true;
    }
    if (name == "mix") {
        m_mix = std::clamp(value, 0.0f, 1.0f);
        return true;
    }
    if (name == "flutter") {
        m_flutter = std::clamp(value, 0.0f, 1.0f);
        return true;
    }
    if (name == "saturation") {
        m_saturation = std::clamp(value, 0.0f, 1.0f);
        return true;
    }
    return false;
}

float TapeDelayNode::getParameter(const std::string& name) const {
    if (name == "time") return m_delayTimeMs;
    if (name == "feedback" || name == "fb") return m_feedback;
    if (name == "mix") return m_mix;
    if (name == "flutter") return m_flutter;
    if (name == "saturation") return m_saturation;
    return 0.0f;
}

std::vector<std::string> TapeDelayNode::getParameterNames() const {
    return {"time", "feedback", "mix", "flutter", "saturation"};
}

// ---------------------------------------------------------------------------
// LadderFilterNode Implementation
// ---------------------------------------------------------------------------

LadderFilterNode::LadderFilterNode(std::string id) {
    m_id = std::move(id);
    reset();
}

void LadderFilterNode::prepare(double sampleRate, size_t /*maxBlockSize*/) {
    m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    reset();
}

void LadderFilterNode::reset() {
    for (int i = 0; i < 4; ++i) {
        m_stageL[i] = 0.0f;
        m_stageR[i] = 0.0f;
    }
}

void LadderFilterNode::process(AudioBufferView& buffer) {
    if (m_bypassed || buffer.getNumChannels() == 0) return;

    const size_t numSamples = buffer.getNumSamples();
    float* channelL = buffer.getChannelData(0);
    float* channelR = (buffer.getNumChannels() > 1) ? buffer.getChannelData(1) : channelL;

    // Approximate 24dB 4-pole cascaded non-linear ladder
    float omega = 2.0f * 3.1415926535f * m_cutoffHz / static_cast<float>(m_sampleRate);
    omega = std::clamp(omega, 0.001f, 3.10f);
    float g = 0.9892f * omega - 0.4342f * omega * omega + 0.1381f * omega * omega * omega;
    g = std::clamp(g, 0.001f, 0.999f);
    float res = m_resonance * 3.95f;

    for (size_t i = 0; i < numSamples; ++i) {
        float dryL = channelL[i];
        float dryR = channelR[i];

        // Left channel ladder step
        float inputL = fastTanh(dryL * m_drive - res * m_stageL[3]);
        m_stageL[0] += g * (inputL - m_stageL[0]);
        m_stageL[1] += g * (m_stageL[0] - m_stageL[1]);
        m_stageL[2] += g * (m_stageL[1] - m_stageL[2]);
        m_stageL[3] += g * (m_stageL[2] - m_stageL[3]);
        float wetL = m_stageL[3];

        // Right channel ladder step
        float inputR = fastTanh(dryR * m_drive - res * m_stageR[3]);
        m_stageR[0] += g * (inputR - m_stageR[0]);
        m_stageR[1] += g * (m_stageR[0] - m_stageR[1]);
        m_stageR[2] += g * (m_stageR[1] - m_stageR[2]);
        m_stageR[3] += g * (m_stageR[2] - m_stageR[3]);
        float wetR = m_stageR[3];

        channelL[i] = (1.0f - m_mix) * dryL + m_mix * wetL;
        channelR[i] = (1.0f - m_mix) * dryR + m_mix * wetR;
    }
}

bool LadderFilterNode::setParameter(const std::string& name, float value) {
    if (name == "cutoff") {
        m_cutoffHz = std::clamp(value, 20.0f, 20000.0f);
        return true;
    }
    if (name == "resonance" || name == "res") {
        m_resonance = std::clamp(value, 0.0f, 0.99f);
        return true;
    }
    if (name == "drive") {
        m_drive = std::clamp(value, 1.0f, 6.0f);
        return true;
    }
    if (name == "mix") {
        m_mix = std::clamp(value, 0.0f, 1.0f);
        return true;
    }
    return false;
}

float LadderFilterNode::getParameter(const std::string& name) const {
    if (name == "cutoff") return m_cutoffHz;
    if (name == "resonance" || name == "res") return m_resonance;
    if (name == "drive") return m_drive;
    if (name == "mix") return m_mix;
    return 0.0f;
}

std::vector<std::string> LadderFilterNode::getParameterNames() const {
    return {"cutoff", "resonance", "drive", "mix"};
}

// ---------------------------------------------------------------------------
// OverdriveNode Implementation
// ---------------------------------------------------------------------------

OverdriveNode::OverdriveNode(std::string id) {
    m_id = std::move(id);
    reset();
}

void OverdriveNode::prepare(double /*sampleRate*/, size_t /*maxBlockSize*/) {
    reset();
}

void OverdriveNode::reset() {
    m_prevL = 0.0f;
    m_prevR = 0.0f;
}

void OverdriveNode::process(AudioBufferView& buffer) {
    if (m_bypassed || buffer.getNumChannels() == 0) return;

    const size_t numSamples = buffer.getNumSamples();
    float* channelL = buffer.getChannelData(0);
    float* channelR = (buffer.getNumChannels() > 1) ? buffer.getChannelData(1) : channelL;

    float toneAlpha = std::clamp(m_tone, 0.05f, 0.95f);

    for (size_t i = 0; i < numSamples; ++i) {
        float inL = channelL[i];
        float inR = channelR[i];

        // Soft-knee asymmetric waveshaper
        float drivenL = inL * m_drive;
        float shapedL = (drivenL > 0.0f) ? fastTanh(drivenL) : (fastTanh(drivenL * 1.2f) * 0.833f);

        float drivenR = inR * m_drive;
        float shapedR = (drivenR > 0.0f) ? fastTanh(drivenR) : (fastTanh(drivenR * 1.2f) * 0.833f);

        // Tone filtering (low-pass smoothing)
        m_prevL += toneAlpha * (shapedL - m_prevL);
        m_prevR += toneAlpha * (shapedR - m_prevR);

        channelL[i] = (1.0f - m_mix) * inL + m_mix * m_prevL;
        channelR[i] = (1.0f - m_mix) * inR + m_mix * m_prevR;
    }
}

bool OverdriveNode::setParameter(const std::string& name, float value) {
    if (name == "drive") {
        m_drive = std::clamp(value, 1.0f, 30.0f);
        return true;
    }
    if (name == "tone") {
        m_tone = std::clamp(value, 0.05f, 1.0f);
        return true;
    }
    if (name == "mix") {
        m_mix = std::clamp(value, 0.0f, 1.0f);
        return true;
    }
    return false;
}

float OverdriveNode::getParameter(const std::string& name) const {
    if (name == "drive") return m_drive;
    if (name == "tone") return m_tone;
    if (name == "mix") return m_mix;
    return 0.0f;
}

std::vector<std::string> OverdriveNode::getParameterNames() const {
    return {"drive", "tone", "mix"};
}

// ---------------------------------------------------------------------------
// ReactiveDuckerNode Implementation
// ---------------------------------------------------------------------------

ReactiveDuckerNode::ReactiveDuckerNode(std::string id) {
    m_id = std::move(id);
    updateCoefficients();
}

void ReactiveDuckerNode::prepare(double sampleRate, size_t /*maxBlockSize*/) {
    m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    updateCoefficients();
    reset();
}

void ReactiveDuckerNode::reset() {
    m_currentGain = 1.0f;
    m_targetGain = 1.0f;
}

void ReactiveDuckerNode::updateCoefficients() {
    m_attackCoef = std::exp(-1.0f / (std::max(0.1f, m_attackMs) * 0.001f * static_cast<float>(m_sampleRate)));
    m_releaseCoef = std::exp(-1.0f / (std::max(1.0f, m_releaseMs) * 0.001f * static_cast<float>(m_sampleRate)));
}

void ReactiveDuckerNode::trigger(float amount) {
    float clampedAmount = std::clamp(amount, 0.0f, 1.0f);
    float duckedGain = std::pow(10.0f, (-m_depthDb * clampedAmount) / 20.0f);
    m_targetGain = duckedGain;
    // Fast initial jump towards target
    m_currentGain = duckedGain;
}

void ReactiveDuckerNode::process(AudioBufferView& buffer) {
    if (m_bypassed || buffer.getNumChannels() == 0) return;

    const size_t numSamples = buffer.getNumSamples();
    float* channelL = buffer.getChannelData(0);
    float* channelR = (buffer.getNumChannels() > 1) ? buffer.getChannelData(1) : channelL;

    for (size_t i = 0; i < numSamples; ++i) {
        // Smoothly release back to 1.0
        m_currentGain = m_releaseCoef * (m_currentGain - 1.0f) + 1.0f;

        channelL[i] *= m_currentGain;
        channelR[i] *= m_currentGain;
    }
}

bool ReactiveDuckerNode::setParameter(const std::string& name, float value) {
    if (name == "depth") {
        m_depthDb = std::clamp(value, 0.0f, 48.0f);
        return true;
    }
    if (name == "attack") {
        m_attackMs = std::clamp(value, 0.1f, 100.0f);
        updateCoefficients();
        return true;
    }
    if (name == "release") {
        m_releaseMs = std::clamp(value, 5.0f, 1000.0f);
        updateCoefficients();
        return true;
    }
    return false;
}

float ReactiveDuckerNode::getParameter(const std::string& name) const {
    if (name == "depth") return m_depthDb;
    if (name == "attack") return m_attackMs;
    if (name == "release") return m_releaseMs;
    if (name == "gain") return m_currentGain;
    return 0.0f;
}

std::vector<std::string> ReactiveDuckerNode::getParameterNames() const {
    return {"depth", "attack", "release"};
}

// ---------------------------------------------------------------------------
// MesaMarkNode Implementation (Mesa Boogie Mark III / Mark Series)
// ---------------------------------------------------------------------------

MesaMarkNode::MesaMarkNode(std::string id) {
    m_id = std::move(id);
    m_bypassed = false;
    updateFilters();
    reset();
}

void MesaMarkNode::prepare(double sampleRate, size_t /*maxBlockSize*/) {
    m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    updateFilters();
    reset();
}

void MesaMarkNode::reset() {
    m_preBassL.reset(); m_preBassR.reset();
    m_preMidL.reset(); m_preMidR.reset();
    m_preTrebleL.reset(); m_preTrebleR.reset();
    m_preBrightL.reset(); m_preBrightR.reset();
    m_presenceL.reset(); m_presenceR.reset();

    m_filter80L.reset(); m_filter80R.reset();
    m_filter240L.reset(); m_filter240R.reset();
    m_filter750L.reset(); m_filter750R.reset();
    m_filter2200L.reset(); m_filter2200R.reset();
    m_filter6600L.reset(); m_filter6600R.reset();

    m_cabLowL.reset(); m_cabLowR.reset();
    m_cabPeakL.reset(); m_cabPeakR.reset();
    m_cabHighL.reset(); m_cabHighR.reset();
}

void MesaMarkNode::updateFilters() {
    float sr = static_cast<float>(m_sampleRate);

    // 1. Pre-Gain Tone Stack Filters
    // Pull Bright: If engaged, treble boost on lower gain settings (authentic 120pF cap bypass)
    float brightGainDb = (m_pullBright > 0.5f) ? (10.0f - m_gain) * 0.7f : 0.0f;
    m_preBrightL.setHighShelf(3500.0f, brightGainDb, sr);
    m_preBrightR.setHighShelf(3500.0f, brightGainDb, sr);

    // Bass: 0..10 maps to -10dB .. +10dB. Pull Deep shifts corner from 120Hz down to 55Hz
    float bassFreq = (m_pullDeep > 0.5f) ? 55.0f : 120.0f;
    float bassGainDb = (m_bass - 5.0f) * 2.0f;
    m_preBassL.setLowShelf(bassFreq, bassGainDb, sr);
    m_preBassR.setLowShelf(bassFreq, bassGainDb, sr);

    // Mid: 0..10 maps to -10dB .. +8dB. Pull Shift shifts center from 650Hz down to 450Hz
    float midFreq = (m_pullShift > 0.5f) ? 450.0f : 650.0f;
    float midGainDb = (m_mid - 5.0f) * 1.8f;
    m_preMidL.setPeaking(midFreq, midGainDb, 0.75f, sr);
    m_preMidR.setPeaking(midFreq, midGainDb, 0.75f, sr);

    // Treble: 0..10 maps to -10dB .. +10dB high-shelf at 3200Hz
    float trebleGainDb = (m_treble - 5.0f) * 2.0f;
    m_preTrebleL.setHighShelf(3200.0f, trebleGainDb, sr);
    m_preTrebleR.setHighShelf(3200.0f, trebleGainDb, sr);

    // Presence: Power amp negative feedback high shelf / peak at 4800Hz
    float presenceDb = (m_presence - 5.0f) * 1.6f;
    m_presenceL.setPeaking(4800.0f, presenceDb, 1.0f, sr);
    m_presenceR.setPeaking(4800.0f, presenceDb, 1.0f, sr);

    // 2. Post-Gain 5-Band Graphic Equalizer (Real LC-inductor peaking curves)
    m_filter80L.setPeaking(80.0f, m_eq80, 1.4f, sr);
    m_filter80R.setPeaking(80.0f, m_eq80, 1.4f, sr);

    m_filter240L.setPeaking(240.0f, m_eq240, 1.4f, sr);
    m_filter240R.setPeaking(240.0f, m_eq240, 1.4f, sr);

    m_filter750L.setPeaking(750.0f, m_eq750, 1.4f, sr);
    m_filter750R.setPeaking(750.0f, m_eq750, 1.4f, sr);

    m_filter2200L.setPeaking(2200.0f, m_eq2200, 1.4f, sr);
    m_filter2200R.setPeaking(2200.0f, m_eq2200, 1.4f, sr);

    m_filter6600L.setPeaking(6600.0f, m_eq6600, 1.4f, sr);
    m_filter6600R.setPeaking(6600.0f, m_eq6600, 1.4f, sr);

    // 3. Celestion Vintage 30 4x12 Cabinet Impulse Emulation
    m_cabLowL.setHighPass(75.0f, 0.707f, sr);
    m_cabLowR.setHighPass(75.0f, 0.707f, sr);

    m_cabPeakL.setPeaking(2400.0f, 3.8f, 1.8f, sr); // Characteristic V30 upper-mid bite
    m_cabPeakR.setPeaking(2400.0f, 3.8f, 1.8f, sr);

    m_cabHighL.setLowPass(5400.0f, 0.707f, sr);     // Natural guitar speaker cone roll-off
    m_cabHighR.setLowPass(5400.0f, 0.707f, sr);
}

void MesaMarkNode::process(AudioBufferView& buffer) {
    if (m_bypassed || buffer.getNumChannels() == 0) return;

    const size_t numSamples = buffer.getNumSamples();
    float* channelL = buffer.getChannelData(0);
    float* channelR = (buffer.getNumChannels() > 1) ? buffer.getChannelData(1) : channelL;

    int ch = static_cast<int>(std::round(m_channel));
    float vol1 = m_gain * 0.1f;
    float leadDrv = m_leadDrive * 0.1f;
    float masterVol = (ch == 2 ? m_leadMaster : m_master) * 0.12f;
    bool isSimulClass = (m_simulClass > 0.5f);
    bool eqOn = (m_eqActive > 0.5f);
    bool cabOn = (m_cabEnabled > 0.5f);

    for (size_t i = 0; i < numSamples; ++i) {
        float inL = channelL[i];
        float inR = channelR[i];

        // 1. Pre-Gain Tone Stack
        float sL = m_preBrightL.process(inL);
        float sR = m_preBrightR.process(inR);

        sL = m_preBassL.process(sL);
        sR = m_preBassR.process(sR);

        sL = m_preMidL.process(sL);
        sR = m_preMidR.process(sR);

        sL = m_preTrebleL.process(sL);
        sR = m_preTrebleR.process(sR);

        // 2. Cascaded 12AX7 Multi-Stage Tube Preamp Non-Linearity
        float satL = 0.0f;
        float satR = 0.0f;

        if (ch == 0) {
            // Rhythm 1 (Clean): Single warm triode stage with cathode-bias compression
            float drive = 1.0f + vol1 * 2.5f;
            satL = fastTanh(sL * drive);
            satR = fastTanh(sR * drive);
        } else if (ch == 1) {
            // Rhythm 2 (Crunch): Dual cascaded 12AX7 stages with asymmetric grid-current conduction
            float drive = 2.0f + vol1 * 5.0f;
            float v1L = fastTanh(sL * drive);
            float v1R = fastTanh(sR * drive);
            satL = fastTanh(v1L * 2.2f + 0.15f * v1L * v1L);
            satR = fastTanh(v1R * 2.2f + 0.15f * v1R * v1R);
        } else {
            // Searing Lead: Cascaded 12AX7 triodes with interstage attenuation and dedicated Lead Drive
            float v1_drive = 2.5f + vol1 * 4.0f;
            float v1L = fastTanh(sL * v1_drive);
            float v1R = fastTanh(sR * v1_drive);

            float v2_drive = 1.5f + leadDrv * 8.5f;
            float v2L = fastTanh(v1L * v2_drive);
            float v2R = fastTanh(v1R * v2_drive);

            satL = fastTanh(v2L * 2.8f - 0.12f * v2L * v2L);
            satR = fastTanh(v2R * 2.8f - 0.12f * v2R * v2R);
        }

        // 3. Simul-Class Power Section & Negative Feedback Presence
        satL = m_presenceL.process(satL);
        satR = m_presenceR.process(satR);

        if (!isSimulClass) {
            // Class A 30W Mode: earlier power-tube saturation and warmer sag
            satL = fastTanh(satL * 1.35f) * 0.9f;
            satR = fastTanh(satR * 1.35f) * 0.9f;
        }

        // 4. Mesa 5-Band Graphic Equalizer (Post-Distortion shaping)
        float eqL = satL;
        float eqR = satR;
        if (eqOn) {
            eqL = m_filter80L.process(eqL);
            eqR = m_filter80R.process(eqR);

            eqL = m_filter240L.process(eqL);
            eqR = m_filter240R.process(eqR);

            eqL = m_filter750L.process(eqL);
            eqR = m_filter750R.process(eqR);

            eqL = m_filter2200L.process(eqL);
            eqR = m_filter2200R.process(eqR);

            eqL = m_filter6600L.process(eqL);
            eqR = m_filter6600R.process(eqR);
        }

        // 5. Celestion Vintage 30 4x12 Speaker Cabinet Simulation
        if (cabOn) {
            eqL = m_cabLowL.process(eqL);
            eqR = m_cabLowR.process(eqR);

            eqL = m_cabPeakL.process(eqL);
            eqR = m_cabPeakR.process(eqR);

            eqL = m_cabHighL.process(eqL);
            eqR = m_cabHighR.process(eqR);
        }

        channelL[i] = eqL * masterVol;
        if (buffer.getNumChannels() > 1) {
            channelR[i] = eqR * masterVol;
        }
    }
}

bool MesaMarkNode::setParameter(const std::string& name, float value) {
    if (name == "channel" || name == "ch") {
        m_channel = std::clamp(value, 0.0f, 2.0f);
        return true;
    }
    if (name == "gain" || name == "drive" || name == "vol1" || name == "volume1") {
        m_gain = std::clamp(value, 0.0f, 10.0f);
        updateFilters();
        return true;
    }
    if (name == "lead_drive" || name == "leadDrive" || name == "leaddrive") {
        m_leadDrive = std::clamp(value, 0.0f, 10.0f);
        return true;
    }
    if (name == "master" || name == "master1" || name == "master_1") {
        m_master = std::clamp(value, 0.0f, 10.0f);
        return true;
    }
    if (name == "lead_master" || name == "leadMaster" || name == "leadmaster") {
        m_leadMaster = std::clamp(value, 0.0f, 10.0f);
        return true;
    }
    if (name == "pull_bright" || name == "pullBright" || name == "bright") {
        m_pullBright = (value > 0.5f) ? 1.0f : 0.0f;
        updateFilters();
        return true;
    }
    if (name == "bass") {
        m_bass = std::clamp(value, 0.0f, 10.0f);
        updateFilters();
        return true;
    }
    if (name == "pull_deep" || name == "pullDeep" || name == "deep") {
        m_pullDeep = (value > 0.5f) ? 1.0f : 0.0f;
        updateFilters();
        return true;
    }
    if (name == "mid") {
        m_mid = std::clamp(value, 0.0f, 10.0f);
        updateFilters();
        return true;
    }
    if (name == "pull_shift" || name == "pullShift" || name == "shift") {
        m_pullShift = (value > 0.5f) ? 1.0f : 0.0f;
        updateFilters();
        return true;
    }
    if (name == "treble") {
        m_treble = std::clamp(value, 0.0f, 10.0f);
        updateFilters();
        return true;
    }
    if (name == "presence") {
        m_presence = std::clamp(value, 0.0f, 10.0f);
        updateFilters();
        return true;
    }
    if (name == "simul_class" || name == "simulClass") {
        m_simulClass = (value > 0.5f) ? 1.0f : 0.0f;
        return true;
    }
    if (name == "eq_active" || name == "eqActive" || name == "eq") {
        m_eqActive = (value > 0.5f) ? 1.0f : 0.0f;
        return true;
    }
    if (name == "eq80" || name == "eq_80") {
        m_eq80 = std::clamp(value, -12.0f, 12.0f);
        updateFilters();
        return true;
    }
    if (name == "eq240" || name == "eq_240") {
        m_eq240 = std::clamp(value, -12.0f, 12.0f);
        updateFilters();
        return true;
    }
    if (name == "eq750" || name == "eq_750") {
        m_eq750 = std::clamp(value, -12.0f, 12.0f);
        updateFilters();
        return true;
    }
    if (name == "eq2200" || name == "eq_2200") {
        m_eq2200 = std::clamp(value, -12.0f, 12.0f);
        updateFilters();
        return true;
    }
    if (name == "eq6600" || name == "eq_6600") {
        m_eq6600 = std::clamp(value, -12.0f, 12.0f);
        updateFilters();
        return true;
    }
    if (name == "cab" || name == "cab_enabled" || name == "cabEnabled") {
        m_cabEnabled = (value > 0.5f) ? 1.0f : 0.0f;
        return true;
    }
    return false;
}

float MesaMarkNode::getParameter(const std::string& name) const {
    if (name == "channel" || name == "ch") return m_channel;
    if (name == "gain" || name == "drive" || name == "vol1" || name == "volume1") return m_gain;
    if (name == "lead_drive" || name == "leadDrive" || name == "leaddrive") return m_leadDrive;
    if (name == "master" || name == "master1" || name == "master_1") return m_master;
    if (name == "lead_master" || name == "leadMaster" || name == "leadmaster") return m_leadMaster;
    if (name == "pull_bright" || name == "pullBright" || name == "bright") return m_pullBright;
    if (name == "bass") return m_bass;
    if (name == "pull_deep" || name == "pullDeep" || name == "deep") return m_pullDeep;
    if (name == "mid") return m_mid;
    if (name == "pull_shift" || name == "pullShift" || name == "shift") return m_pullShift;
    if (name == "treble") return m_treble;
    if (name == "presence") return m_presence;
    if (name == "simul_class" || name == "simulClass") return m_simulClass;
    if (name == "eq_active" || name == "eqActive" || name == "eq") return m_eqActive;
    if (name == "eq80" || name == "eq_80") return m_eq80;
    if (name == "eq240" || name == "eq_240") return m_eq240;
    if (name == "eq750" || name == "eq_750") return m_eq750;
    if (name == "eq2200" || name == "eq_2200") return m_eq2200;
    if (name == "eq6600" || name == "eq_6600") return m_eq6600;
    if (name == "cab" || name == "cab_enabled" || name == "cabEnabled") return m_cabEnabled;
    return 0.0f;
}

std::vector<std::string> MesaMarkNode::getParameterNames() const {
    return {
        "channel", "gain", "lead_drive", "master", "lead_master",
        "pull_bright", "bass", "pull_deep", "mid", "pull_shift",
        "treble", "presence", "simul_class", "eq_active",
        "eq80", "eq240", "eq750", "eq2200", "eq6600", "cab"
    };
}

// ---------------------------------------------------------------------------
// VoxAC30Node Implementation (Vox AC-30 Top Boost & 2x12 Alnico Blue)
// ---------------------------------------------------------------------------

VoxAC30Node::VoxAC30Node(std::string id) {
    m_id = std::move(id);
    m_bypassed = false;
    updateFilters();
    reset();
}

void VoxAC30Node::prepare(double sampleRate, size_t /*maxBlockSize*/) {
    m_sampleRate = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    updateFilters();
    reset();
}

void VoxAC30Node::reset() {
    m_sagEnvelope = 0.0f;
    m_bassFilterL.reset(); m_bassFilterR.reset();
    m_trebleFilterL.reset(); m_trebleFilterR.reset();
    m_brilliantFilterL.reset(); m_brilliantFilterR.reset();
    m_cutFilterL.reset(); m_cutFilterR.reset();

    m_cabLowL.reset(); m_cabLowR.reset();
    m_cabPeakL.reset(); m_cabPeakR.reset();
    m_cabHighL.reset(); m_cabHighR.reset();
}

void VoxAC30Node::updateFilters() {
    float sr = static_cast<float>(m_sampleRate);

    // 1. Top Boost Tone Stack: Interactive Treble and Bass
    // Bass shelf at 110Hz (-8dB to +10dB)
    float bassGainDb = (m_bass - 5.0f) * 1.8f;
    m_bassFilterL.setLowShelf(110.0f, bassGainDb, sr);
    m_bassFilterR.setLowShelf(110.0f, bassGainDb, sr);

    // Treble shelf at 3600Hz (-8dB to +12dB)
    float trebleGainDb = (m_treble - 5.0f) * 2.0f;
    m_trebleFilterL.setHighShelf(3600.0f, trebleGainDb, sr);
    m_trebleFilterR.setHighShelf(3600.0f, trebleGainDb, sr);

    // Brilliant switch: adds +4.5dB high shelf at 4200Hz
    float brilliantDb = (m_brilliant > 0.5f) ? 4.5f : 0.0f;
    m_brilliantFilterL.setHighShelf(4200.0f, brilliantDb, sr);
    m_brilliantFilterR.setHighShelf(4200.0f, brilliantDb, sr);

    // Reverse Tone Cut: Across the phase inverter plates.
    // At m_cut = 0, cut-off is 15kHz (wide open). At m_cut = 10, cut-off is 2400Hz (dark & warm).
    float cutFreq = 15000.0f - (m_cut * 1260.0f);
    cutFreq = std::clamp(cutFreq, 2200.0f, 16000.0f);
    m_cutFilterL.setLowPass(cutFreq, 0.707f, sr);
    m_cutFilterR.setLowPass(cutFreq, 0.707f, sr);

    // 2. Celestion Alnico Blue 2x12 Open-Back Cabinet
    m_cabLowL.setHighPass(85.0f, 0.707f, sr);     // Open-back 2x12 bass roll-off
    m_cabLowR.setHighPass(85.0f, 0.707f, sr);

    m_cabPeakL.setPeaking(3200.0f, 3.2f, 1.5f, sr); // Alnico bell chime peak
    m_cabPeakR.setPeaking(3200.0f, 3.2f, 1.5f, sr);

    m_cabHighL.setLowPass(6200.0f, 0.707f, sr);    // 12" speaker acoustic cone roll-off
    m_cabHighR.setLowPass(6200.0f, 0.707f, sr);
}

void VoxAC30Node::process(AudioBufferView& buffer) {
    if (m_bypassed || buffer.getNumChannels() == 0) return;

    const size_t numSamples = buffer.getNumSamples();
    float* channelL = buffer.getChannelData(0);
    float* channelR = (buffer.getNumChannels() > 1) ? buffer.getChannelData(1) : channelL;

    int ch = static_cast<int>(std::round(m_channel));
    float driveMult = 1.0f + (m_gain * 0.75f);
    if (ch == 1) {
        driveMult *= 1.9f; // Top Boost channel has an additional high-gain 12AX7 stage
    }

    float chimeAmount = m_chime * 0.1f;
    float masterVol = (m_master * 0.14f);
    bool cabOn = (m_cabEnabled > 0.5f);

    for (size_t i = 0; i < numSamples; ++i) {
        float inL = channelL[i];
        float inR = channelR[i];

        // 1. Dynamic Cathode Bias Power Sag (Rectifier tube voltage drop on loud transients)
        float peak = std::max(std::abs(inL), std::abs(inR));
        if (peak > m_sagEnvelope) {
            m_sagEnvelope += 0.015f * (peak - m_sagEnvelope);
        } else {
            m_sagEnvelope += 0.0018f * (peak - m_sagEnvelope);
        }
        float sagFactor = 1.0f / (1.0f + m_sagEnvelope * 1.8f);

        // 2. Channel & Tone Stack Processing
        float preL = inL;
        float preR = inR;

        if (ch == 1) {
            // Top Boost channel runs through interactive Treble & Bass
            preL = m_bassFilterL.process(preL);
            preR = m_bassFilterR.process(preR);

            preL = m_trebleFilterL.process(preL);
            preR = m_trebleFilterR.process(preR);

            preL = m_brilliantFilterL.process(preL);
            preR = m_brilliantFilterR.process(preR);
        }

        // 3. Class A Push-Pull EL84 Saturation
        float driveL = preL * driveMult * sagFactor;
        float driveR = preR * driveMult * sagFactor;

        float satL = fastTanh(driveL);
        float satR = fastTanh(driveR);

        // 4. Harmonic Chime Exciter: injects shimmering harmonics
        if (chimeAmount > 0.01f) {
            float h2L = driveL * driveL * 0.18f * chimeAmount;
            float h2R = driveR * driveR * 0.18f * chimeAmount;
            satL += (driveL > 0 ? h2L : -h2L);
            satR += (driveR > 0 ? h2R : -h2R);
        }

        // 5. Phase-Inverter Reverse Tone Cut (Rolls off highs post-saturation)
        float cutL = m_cutFilterL.process(satL);
        float cutR = m_cutFilterR.process(satR);

        // 6. Celestion Alnico Blue 2x12 Speaker Cabinet Simulation
        if (cabOn) {
            cutL = m_cabLowL.process(cutL);
            cutR = m_cabLowR.process(cutR);

            cutL = m_cabPeakL.process(cutL);
            cutR = m_cabPeakR.process(cutR);

            cutL = m_cabHighL.process(cutL);
            cutR = m_cabHighR.process(cutR);
        }

        channelL[i] = cutL * masterVol;
        if (buffer.getNumChannels() > 1) {
            channelR[i] = cutR * masterVol;
        }
    }
}

bool VoxAC30Node::setParameter(const std::string& name, float value) {
    if (name == "channel" || name == "ch") {
        m_channel = std::clamp(value, 0.0f, 1.0f);
        return true;
    }
    if (name == "gain" || name == "drive" || name == "volume") {
        m_gain = std::clamp(value, 0.0f, 10.0f);
        return true;
    }
    if (name == "bass") {
        m_bass = std::clamp(value, 0.0f, 10.0f);
        updateFilters();
        return true;
    }
    if (name == "treble") {
        m_treble = std::clamp(value, 0.0f, 10.0f);
        updateFilters();
        return true;
    }
    if (name == "brilliant") {
        m_brilliant = (value > 0.5f) ? 1.0f : 0.0f;
        updateFilters();
        return true;
    }
    if (name == "cut" || name == "tone_cut" || name == "toneCut") {
        m_cut = std::clamp(value, 0.0f, 10.0f);
        updateFilters();
        return true;
    }
    if (name == "chime") {
        m_chime = std::clamp(value, 0.0f, 10.0f);
        return true;
    }
    if (name == "master") {
        m_master = std::clamp(value, 0.0f, 10.0f);
        return true;
    }
    if (name == "cab" || name == "cab_enabled" || name == "cabEnabled") {
        m_cabEnabled = (value > 0.5f) ? 1.0f : 0.0f;
        return true;
    }
    return false;
}

float VoxAC30Node::getParameter(const std::string& name) const {
    if (name == "channel" || name == "ch") return m_channel;
    if (name == "gain" || name == "drive" || name == "volume") return m_gain;
    if (name == "bass") return m_bass;
    if (name == "treble") return m_treble;
    if (name == "brilliant") return m_brilliant;
    if (name == "cut" || name == "tone_cut" || name == "toneCut") return m_cut;
    if (name == "chime") return m_chime;
    if (name == "master") return m_master;
    if (name == "cab" || name == "cab_enabled" || name == "cabEnabled") return m_cabEnabled;
    return 0.0f;
}

std::vector<std::string> VoxAC30Node::getParameterNames() const {
    return {"channel", "gain", "bass", "treble", "brilliant", "cut", "chime", "master", "cab"};
}

} // namespace johnwalls::pedalboard

