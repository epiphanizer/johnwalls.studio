#include "ReactiveMidiEngine.h"
#include <cmath>

namespace johnwalls::pedalboard {

//==============================================================================
// MidiRhythmDetector
//==============================================================================

void MidiRhythmDetector::reset() {
    m_recentSteps.clear();
    m_heldNotes.clear();
    m_lastNoteOnTimeMs = 0.0;
    m_lastNoteOnPpq = 0.0;
    m_lastClassifiedPattern = "idle";
}

void MidiRhythmDetector::recordNoteOn(double ppq, int noteNumber, int velocity, double timeMs) {
    if (std::find(m_heldNotes.begin(), m_heldNotes.end(), noteNumber) == m_heldNotes.end()) {
        m_heldNotes.push_back(noteNumber);
    }

    // Filter out chord strikes that happen almost at the same instant (< 0.04 beats)
    const bool isNewStep = m_recentSteps.empty() || std::abs(ppq - m_lastNoteOnPpq) >= 0.04;
    if (isNewStep) {
        NoteStep step;
        step.ppq = ppq;
        step.noteNumber = noteNumber;
        step.velocity = velocity;
        step.timeMs = timeMs;

        m_recentSteps.push_back(step);
        if (m_recentSteps.size() > MAX_STEPS) {
            m_recentSteps.pop_front();
        }

        m_lastNoteOnPpq = ppq;
        m_lastNoteOnTimeMs = timeMs;
    }
}

void MidiRhythmDetector::recordNoteOff(int noteNumber) {
    auto it = std::find(m_heldNotes.begin(), m_heldNotes.end(), noteNumber);
    if (it != m_heldNotes.end()) {
        m_heldNotes.erase(it);
    }
}

RhythmAnalysisResult MidiRhythmDetector::analyze(double currentPpq, double timeMs) {
    RhythmAnalysisResult res;
    res.activeHeldNotes = static_cast<int>(m_heldNotes.size());

    // Check if idle (no note on for > 2.5 seconds or > 3 beats)
    if (m_recentSteps.empty() || (timeMs - m_lastNoteOnTimeMs > 2500.0) || (currentPpq - m_lastNoteOnPpq > 3.0)) {
        res.pattern = "idle";
        res.noteDensity = 0.0f;
        res.avgIntervalBeats = 0.0f;
        res.dominantRegister = 2;
        m_lastClassifiedPattern = "idle";
        return res;
    }

    // Calculate delta beats across consecutive steps
    std::vector<double> intervals;
    intervals.reserve(m_recentSteps.size());
    double sumNotes = 0.0;
    int noteCountInWindow = 0;

    for (size_t i = 1; i < m_recentSteps.size(); ++i) {
        double dt = m_recentSteps[i].ppq - m_recentSteps[i - 1].ppq;
        if (dt > 0.05 && dt < 4.0) {
            intervals.push_back(dt);
        }
    }

    for (const auto& step : m_recentSteps) {
        sumNotes += step.noteNumber;
        if (timeMs - step.timeMs <= 1000.0) {
            noteCountInWindow++;
        }
    }

    if (intervals.empty()) {
        res.pattern = m_lastClassifiedPattern;
        res.noteDensity = static_cast<float>(noteCountInWindow);
        res.avgIntervalBeats = 1.0f;
        res.dominantRegister = 2;
        return res;
    }

    std::sort(intervals.begin(), intervals.end());
    const double median = intervals[intervals.size() / 2];

    double sum = 0.0;
    for (double v : intervals) sum += v;
    const double mean = sum / static_cast<double>(intervals.size());

    double variance = 0.0;
    for (double v : intervals) variance += (v - mean) * (v - mean);
    const double stdDev = std::sqrt(variance / static_cast<double>(intervals.size()));

    // Pattern Classification
    std::string pattern = "syncopated";
    if (stdDev > 0.38 * mean) {
        pattern = "syncopated";
    } else if (median >= 0.80 && median <= 1.25) {
        pattern = "1/4";
    } else if (median >= 0.38 && median <= 0.65) {
        pattern = "1/8";
    } else if (median >= 0.18 && median <= 0.32) {
        pattern = "1/16";
    } else if (median >= 0.08 && median <= 0.16) {
        pattern = "1/32";
    } else if ((median >= 0.28 && median <= 0.36) || (median >= 0.60 && median <= 0.72)) {
        pattern = "triplet";
    } else if (median >= 1.70) {
        pattern = "half";
    } else {
        pattern = "groove";
    }

    // Dominant Register
    const double avgNote = !m_recentSteps.empty() ? (sumNotes / static_cast<double>(m_recentSteps.size())) : 60.0;
    int reg = 2;
    if (avgNote < 48.0) reg = 0;        // Bass (< C3)
    else if (avgNote < 60.0) reg = 1;   // Low-Mid (C3 - B3)
    else if (avgNote < 72.0) reg = 2;   // Mid (C4 - B4)
    else reg = 3;                       // High (>= C5)

    m_lastClassifiedPattern = pattern;

    res.pattern = pattern;
    res.noteDensity = static_cast<float>(noteCountInWindow);
    res.avgIntervalBeats = static_cast<float>(median);
    res.dominantRegister = reg;
    return res;
}

//==============================================================================
// ReactiveMidiEngine
//==============================================================================

ReactiveMidiEngine::ReactiveMidiEngine() {
    populateDefaultRules();
}

void ReactiveMidiEngine::populateDefaultRules() {
    m_rules.clear();

    // Rule 1: The flagship requested scenario:
    // If Bass plays 1/4 pattern -> Lead arpeggiates in 1/16
    ReactiveMidiRule r1;
    r1.id = "rule_bass_1_4_arp_1_16";
    r1.name = "Bass 1/4 ➔ Lead 1/16 Running Arp";
    r1.enabled = true;
    r1.sourceTrackFilter = "bass";
    r1.triggerRhythm = "1/4";
    r1.actionType = "arp_1_16";
    r1.param = 1.0f;
    m_rules.push_back(r1);

    // Rule 2:
    // If Bass plays 1/16 driving pattern -> Lead switches to 1/4 stabs or sustained chords
    ReactiveMidiRule r2;
    r2.id = "rule_bass_1_16_stabs_1_4";
    r2.name = "Bass 1/16 ➔ Lead 1/4 Offbeat Stabs";
    r2.enabled = true;
    r2.sourceTrackFilter = "bass";
    r2.triggerRhythm = "1/16";
    r2.actionType = "stabs_1_4";
    r2.param = 1.0f;
    m_rules.push_back(r2);

    // Rule 3:
    // If Drums / Beat is Idle or Breakdown -> Ambient Sustained Wash & Transpose Up
    ReactiveMidiRule r3;
    r3.id = "rule_drum_idle_ambient_wash";
    r3.name = "Drums Idle / Breakdown ➔ Ambient Wash (+12st)";
    r3.enabled = true;
    r3.sourceTrackFilter = "drum";
    r3.triggerRhythm = "idle";
    r3.actionType = "sustained";
    r3.param = 12.0f;
    m_rules.push_back(r3);
}

void ReactiveMidiEngine::setRules(const std::vector<ReactiveMidiRule>& rules) {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    m_rules = rules;
}

std::vector<ReactiveMidiRule> ReactiveMidiEngine::getRules() {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    return m_rules;
}

void ReactiveMidiEngine::addRule(const ReactiveMidiRule& rule) {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    m_rules.push_back(rule);
}

void ReactiveMidiEngine::removeRule(const std::string& ruleId) {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    m_rules.erase(
        std::remove_if(m_rules.begin(), m_rules.end(), [&](const ReactiveMidiRule& r) {
            return r.id == ruleId;
        }),
        m_rules.end()
    );
}

void ReactiveMidiEngine::toggleRule(const std::string& ruleId) {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    for (auto& r : m_rules) {
        if (r.id == ruleId) {
            r.enabled = !r.enabled;
            break;
        }
    }
}

juce::var ReactiveMidiEngine::getRulesAsVar() {
    std::lock_guard<std::mutex> lock(m_rulesMutex);
    juce::Array<juce::var> array;

    for (const auto& r : m_rules) {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("id", juce::String(r.id));
        obj->setProperty("name", juce::String(r.name));
        obj->setProperty("enabled", r.enabled);
        obj->setProperty("sourceTrackFilter", juce::String(r.sourceTrackFilter));
        obj->setProperty("triggerRhythm", juce::String(r.triggerRhythm));
        obj->setProperty("actionType", juce::String(r.actionType));
        obj->setProperty("param", r.param);
        obj->setProperty("scOscAddress", juce::String(r.scOscAddress));
        array.add(juce::var(obj));
    }

    return juce::var(array);
}

juce::String ReactiveMidiEngine::getRulesJson() {
    return juce::JSON::toString(getRulesAsVar());
}

std::string ReactiveMidiEngine::getLastActiveRule() const {
    return m_lastActiveRule;
}

RhythmAnalysisResult ReactiveMidiEngine::getCurrentRhythm() const {
    return m_currentRhythm;
}

void ReactiveMidiEngine::processMidi(
    juce::MidiBuffer& midiMessages,
    double currentPpq,
    double bpm,
    double sampleRate,
    int numSamples,
    const std::vector<TrackInstanceInfo>& sessionTracks,
    const std::string& currentTrackName
) {
    const double nowMs = static_cast<double>(juce::Time::currentTimeMillis());

    // 1. Record incoming notes into local rhythm detector
    for (const auto meta : midiMessages) {
        auto msg = meta.getMessage();
        if (msg.isNoteOn()) {
            m_detector.recordNoteOn(currentPpq, msg.getNoteNumber(), msg.getVelocity(), nowMs);
        } else if (msg.isNoteOff()) {
            m_detector.recordNoteOff(msg.getNoteNumber());
        }
    }

    // 2. Perform live analysis on this track's MIDI rhythm
    m_currentRhythm = m_detector.analyze(currentPpq, nowMs);

    if (!m_enabled.load(std::memory_order_relaxed)) {
        return;
    }

    // 3. Find first matching reactive rule across session tracks
    ReactiveMidiRule activeRule;
    bool hasActiveRule = false;

    {
        std::lock_guard<std::mutex> lock(m_rulesMutex);
        for (const auto& rule : m_rules) {
            if (!rule.enabled) continue;

            // Match against any track matching the source filter
            std::string filter = juce::String(rule.sourceTrackFilter).toLowerCase().toStdString();

            for (const auto& t : sessionTracks) {
                std::string tName = juce::String(t.trackName).toLowerCase().toStdString();
                bool matchesSource = (filter == "all" || filter == "any" || tName.find(filter) != std::string::npos);

                // If source track is "self" or current track
                if (filter == "self" && tName == juce::String(currentTrackName).toLowerCase().toStdString()) {
                    matchesSource = true;
                }

                if (matchesSource) {
                    bool matchesRhythm = (rule.triggerRhythm == "any" || t.rhythmPattern == rule.triggerRhythm);
                    if (matchesRhythm) {
                        activeRule = rule;
                        hasActiveRule = true;
                        break;
                    }
                }
            }
            if (hasActiveRule) break;
        }
    }

    if (!hasActiveRule) {
        m_lastActiveRule.clear();
        return;
    }

    m_lastActiveRule = activeRule.name;

    // 4. Apply Reactive Transformations
    const auto& heldNotes = m_detector.getHeldNotes();

    // Mode A: Running 1/16 Arpeggiator
    if (activeRule.actionType == "arp_1_16") {
        if (!heldNotes.empty() && bpm > 10.0 && sampleRate > 1000.0) {
            const double beatsPerSec = bpm / 60.0;

            // Clear original note-ons so we can emit tight, synchronized arpeggio notes
            juce::MidiBuffer transformed;
            for (const auto meta : midiMessages) {
                auto msg = meta.getMessage();
                if (!msg.isNoteOn()) {
                    transformed.addEvent(msg, meta.samplePosition);
                }
            }

            // Check if a 1/16 boundary occurs within [currentPpq, endPpq]
            const double blockBeats = (static_cast<double>(numSamples) / sampleRate) * beatsPerSec;
            const double startPpq = currentPpq;
            const double endPpq = currentPpq + blockBeats;

            // 1/16th grid index
            long long startStep = static_cast<long long>(std::floor(startPpq / 0.25));
            long long endStep = static_cast<long long>(std::floor(endPpq / 0.25));

            for (long long step = startStep; step <= endStep; ++step) {
                double stepPpq = static_cast<double>(step) * 0.25;
                if (stepPpq >= startPpq && stepPpq < endPpq && stepPpq > m_lastArpPpq) {
                    m_lastArpPpq = stepPpq;

                    double fractionInBlock = (stepPpq - startPpq) / (endPpq > startPpq ? (endPpq - startPpq) : 1.0);
                    int sampleOffset = std::clamp(static_cast<int>(fractionInBlock * numSamples), 0, numSamples - 1);

                    // Note off for previous note
                    if (m_lastEmittedNote >= 0) {
                        transformed.addEvent(
                            juce::MidiMessage::noteOff(m_lastEmittedChannel, m_lastEmittedNote),
                            sampleOffset
                        );
                    }

                    // Note on for next note in held chord
                    const size_t noteIdx = static_cast<size_t>(std::abs(m_arpIndex)) % heldNotes.size();
                    int noteToPlay = heldNotes[noteIdx];
                    m_arpIndex++;
                    m_lastEmittedNote = noteToPlay;
                    m_lastEmittedChannel = 1;

                    transformed.addEvent(
                        juce::MidiMessage::noteOn(1, noteToPlay, static_cast<juce::uint8>(105)),
                        sampleOffset
                    );
                }
            }

            midiMessages.swapWith(transformed);
        }
    }
    // Mode B: 1/4 Stabs (Quarter Note Staccato)
    else if (activeRule.actionType == "stabs_1_4") {
        juce::MidiBuffer transformed;
        for (const auto meta : midiMessages) {
            auto msg = meta.getMessage();
            if (msg.isNoteOn()) {
                // Punchy accented stab
                auto stab = juce::MidiMessage::noteOn(msg.getChannel(), msg.getNoteNumber(), static_cast<juce::uint8>(std::min(127, msg.getVelocity() + 15)));
                transformed.addEvent(stab, meta.samplePosition);

                // Add quick staccato note-off 40ms later
                int offOffset = std::min(numSamples - 1, meta.samplePosition + static_cast<int>(sampleRate * 0.04));
                transformed.addEvent(juce::MidiMessage::noteOff(msg.getChannel(), msg.getNoteNumber()), offOffset);
            } else if (!msg.isNoteOff()) {
                transformed.addEvent(msg, meta.samplePosition);
            }
        }
        midiMessages.swapWith(transformed);
    }
    // Mode C: Sustained Ambient Wash
    else if (activeRule.actionType == "sustained") {
        juce::MidiBuffer transformed;
        for (const auto meta : midiMessages) {
            auto msg = meta.getMessage();
            if (msg.isNoteOn()) {
                // If param has octave shift (e.g. 12 semitones)
                int note = std::clamp(msg.getNoteNumber() + static_cast<int>(activeRule.param), 0, 127);
                transformed.addEvent(juce::MidiMessage::noteOn(msg.getChannel(), note, msg.getVelocity()), meta.samplePosition);
            } else if (!msg.isNoteOff()) {
                transformed.addEvent(msg, meta.samplePosition);
            }
            // Delay note-offs so chords sustain
        }
        midiMessages.swapWith(transformed);
    }
    // Mode D: Ratchet 4x (Trap/IDM rapid roll)
    else if (activeRule.actionType == "ratchet_4x") {
        juce::MidiBuffer transformed;
        for (const auto meta : midiMessages) {
            auto msg = meta.getMessage();
            if (msg.isNoteOn()) {
                int spacing = std::max(8, numSamples / 5);
                for (int burst = 0; burst < 4; ++burst) {
                    int posOn = std::min(numSamples - 2, meta.samplePosition + burst * spacing);
                    int posOff = std::min(numSamples - 1, posOn + (spacing / 2));
                    transformed.addEvent(juce::MidiMessage::noteOn(msg.getChannel(), msg.getNoteNumber(), msg.getVelocity()), posOn);
                    transformed.addEvent(juce::MidiMessage::noteOff(msg.getChannel(), msg.getNoteNumber()), posOff);
                }
            } else if (!msg.isNoteOff()) {
                transformed.addEvent(msg, meta.samplePosition);
            }
        }
        midiMessages.swapWith(transformed);
    }
    // Mode E: Harmony 5th
    else if (activeRule.actionType == "harmony_5th") {
        juce::MidiBuffer transformed = midiMessages;
        for (const auto meta : midiMessages) {
            auto msg = meta.getMessage();
            if (msg.isNoteOn()) {
                int fifth = std::clamp(msg.getNoteNumber() + 7, 0, 127);
                transformed.addEvent(juce::MidiMessage::noteOn(msg.getChannel(), fifth, msg.getVelocity()), meta.samplePosition);
            } else if (msg.isNoteOff()) {
                int fifth = std::clamp(msg.getNoteNumber() + 7, 0, 127);
                transformed.addEvent(juce::MidiMessage::noteOff(msg.getChannel(), fifth), meta.samplePosition);
            }
        }
        midiMessages.swapWith(transformed);
    }
    // Mode F: Transpose
    else if (activeRule.actionType == "transpose_12") {
        juce::MidiBuffer transformed;
        for (const auto meta : midiMessages) {
            auto msg = meta.getMessage();
            if (msg.isNoteOn()) {
                int transposed = std::clamp(msg.getNoteNumber() + 12, 0, 127);
                transformed.addEvent(juce::MidiMessage::noteOn(msg.getChannel(), transposed, msg.getVelocity()), meta.samplePosition);
            } else if (msg.isNoteOff()) {
                int transposed = std::clamp(msg.getNoteNumber() + 12, 0, 127);
                transformed.addEvent(juce::MidiMessage::noteOff(msg.getChannel(), transposed), meta.samplePosition);
            } else {
                transformed.addEvent(msg, meta.samplePosition);
            }
        }
        midiMessages.swapWith(transformed);
    }
}

} // namespace johnwalls::pedalboard
