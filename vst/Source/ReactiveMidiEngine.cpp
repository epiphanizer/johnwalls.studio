#include "ReactiveMidiEngine.h"
#include "SuperColliderManager.h"
#include <cmath>
#include <cstring>

namespace johnwalls::johnwalls {

namespace {

template <size_t N>
void copyStr(char (&dst)[N], const std::string& src) {
    const size_t n = std::min(src.size(), N - 1);
    std::memcpy(dst, src.data(), n);
    dst[n] = '\0';
}

std::string lower(const std::string& s) {
    return juce::String(s).toLowerCase().toStdString();
}

inline bool isNoteOnMsg(uint8_t status, uint8_t vel) { return status == 0x90 && vel > 0; }
inline bool isNoteOffMsg(uint8_t status, uint8_t vel) { return status == 0x80 || (status == 0x90 && vel == 0); }

//==============================================================================
// Process-wide rule store
//==============================================================================
struct SharedRules {
    std::mutex mutex;
    std::vector<ReactiveMidiRule> rules;
    std::atomic<bool> enabled{true};

    SharedRules() {
        // Rule 1: If Bass plays 1/4 pattern -> Lead arpeggiates in 1/16
        ReactiveMidiRule r1;
        r1.id = "rule_bass_1_4_arp_1_16";
        r1.name = "Bass 1/4 ➔ Lead 1/16 Running Arp";
        r1.sourceTrackFilter = "bass";
        r1.triggerRhythm = "1/4";
        r1.actionType = "arp_1_16";
        rules.push_back(r1);

        // Rule 2: If Bass plays 1/16 driving pattern -> Lead switches to 1/4 stabs
        ReactiveMidiRule r2;
        r2.id = "rule_bass_1_16_stabs_1_4";
        r2.name = "Bass 1/16 ➔ Lead 1/4 Offbeat Stabs";
        r2.sourceTrackFilter = "bass";
        r2.triggerRhythm = "1/16";
        r2.actionType = "stabs_1_4";
        rules.push_back(r2);

        // Rule 3: If Drums are idle (breakdown) -> ambient sustained wash, transposed up an octave
        ReactiveMidiRule r3;
        r3.id = "rule_drum_idle_ambient_wash";
        r3.name = "Drums Idle / Breakdown ➔ Ambient Wash (+12st)";
        r3.sourceTrackFilter = "drum";
        r3.triggerRhythm = "idle";
        r3.actionType = "sustained";
        r3.param = 12.0f;
        rules.push_back(r3);
    }
};

SharedRules& shared() {
    static SharedRules s_shared;
    return s_shared;
}

} // namespace

//==============================================================================
// MidiRhythmDetector
//==============================================================================

void MidiRhythmDetector::reset() {
    m_numSteps = 0;
    m_heldNotes.clear();
    m_lastNoteOnTimeMs = 0.0;
    m_lastNoteOnPpq = 0.0;
    m_lastClassifiedPattern = "idle";
}

void MidiRhythmDetector::recordNoteOn(double ppq, int noteNumber, int velocity, double timeMs) {
    if (std::find(m_heldNotes.begin(), m_heldNotes.end(), noteNumber) == m_heldNotes.end()
        && m_heldNotes.size() < m_heldNotes.capacity()) {
        m_heldNotes.push_back(noteNumber);
    }

    // Filter out chord strikes that happen almost at the same instant (< 0.04 beats)
    const bool isNewStep = m_numSteps == 0 || std::abs(ppq - m_lastNoteOnPpq) >= 0.04;
    if (isNewStep) {
        if (m_numSteps == MAX_STEPS) {
            std::move(m_steps.begin() + 1, m_steps.end(), m_steps.begin());
            --m_numSteps;
        }
        m_steps[m_numSteps++] = NoteStep{ppq, noteNumber, velocity, timeMs};
        m_lastNoteOnPpq = ppq;
        m_lastNoteOnTimeMs = timeMs;
    }
}

void MidiRhythmDetector::recordNoteOff(int noteNumber) {
    auto it = std::find(m_heldNotes.begin(), m_heldNotes.end(), noteNumber);
    if (it != m_heldNotes.end()) m_heldNotes.erase(it);
}

RhythmAnalysisResult MidiRhythmDetector::analyze(double currentPpq, double timeMs) {
    RhythmAnalysisResult res;
    res.activeHeldNotes = static_cast<int>(m_heldNotes.size());

    // Idle if no note-on for > 2.5 seconds or > 3 beats
    if (m_numSteps == 0 || (timeMs - m_lastNoteOnTimeMs > 2500.0) || (currentPpq - m_lastNoteOnPpq > 3.0)) {
        res.pattern = "idle";
        res.noteDensity = 0.0f;
        res.avgIntervalBeats = 0.0f;
        res.dominantRegister = 2;
        m_lastClassifiedPattern = "idle";
        return res;
    }

    std::array<double, MAX_STEPS> intervals{};
    size_t numIntervals = 0;
    double sumNotes = 0.0;
    int noteCountInWindow = 0;

    for (size_t i = 1; i < m_numSteps; ++i) {
        const double dt = m_steps[i].ppq - m_steps[i - 1].ppq;
        if (dt > 0.05 && dt < 4.0) intervals[numIntervals++] = dt;
    }
    for (size_t i = 0; i < m_numSteps; ++i) {
        sumNotes += m_steps[i].noteNumber;
        if (timeMs - m_steps[i].timeMs <= 1000.0) ++noteCountInWindow;
    }

    if (numIntervals == 0) {
        res.pattern = m_lastClassifiedPattern;
        res.noteDensity = static_cast<float>(noteCountInWindow);
        res.avgIntervalBeats = 1.0f;
        res.dominantRegister = 2;
        return res;
    }

    std::sort(intervals.begin(), intervals.begin() + static_cast<std::ptrdiff_t>(numIntervals));
    const double median = intervals[numIntervals / 2];

    double sum = 0.0;
    for (size_t i = 0; i < numIntervals; ++i) sum += intervals[i];
    const double mean = sum / static_cast<double>(numIntervals);

    double variance = 0.0;
    for (size_t i = 0; i < numIntervals; ++i) variance += (intervals[i] - mean) * (intervals[i] - mean);
    const double stdDev = std::sqrt(variance / static_cast<double>(numIntervals));

    const char* pattern = "groove";
    if (stdDev > 0.38 * mean) pattern = "syncopated";
    else if (median >= 0.80 && median <= 1.25) pattern = "1/4";
    else if (median >= 0.38 && median <= 0.65) pattern = "1/8";
    else if (median >= 0.18 && median <= 0.32) pattern = "1/16";
    else if (median >= 0.08 && median <= 0.16) pattern = "1/32";
    else if ((median >= 0.28 && median <= 0.36) || (median >= 0.60 && median <= 0.72)) pattern = "triplet";
    else if (median >= 1.70) pattern = "half";

    const double avgNote = sumNotes / static_cast<double>(m_numSteps);
    int reg = 3;
    if (avgNote < 48.0) reg = 0;        // Bass (< C3)
    else if (avgNote < 60.0) reg = 1;   // Low-Mid (C3 - B3)
    else if (avgNote < 72.0) reg = 2;   // Mid (C4 - B4)

    m_lastClassifiedPattern = pattern;
    res.pattern = pattern;
    res.noteDensity = static_cast<float>(noteCountInWindow);
    res.avgIntervalBeats = static_cast<float>(median);
    res.dominantRegister = reg;
    return res;
}

//==============================================================================
// ReactiveMidiEngine – shared rule store
//==============================================================================

bool ReactiveMidiEngine::isEnabled() { return shared().enabled.load(std::memory_order_relaxed); }
void ReactiveMidiEngine::setEnabled(bool enabled) { shared().enabled.store(enabled, std::memory_order_relaxed); }

void ReactiveMidiEngine::setRules(const std::vector<ReactiveMidiRule>& rules) {
    std::lock_guard<std::mutex> lock(shared().mutex);
    shared().rules = rules;
}

std::vector<ReactiveMidiRule> ReactiveMidiEngine::getRules() {
    std::lock_guard<std::mutex> lock(shared().mutex);
    return shared().rules;
}

void ReactiveMidiEngine::addRule(const ReactiveMidiRule& rule) {
    std::lock_guard<std::mutex> lock(shared().mutex);
    shared().rules.push_back(rule);
}

void ReactiveMidiEngine::removeRule(const std::string& ruleId) {
    std::lock_guard<std::mutex> lock(shared().mutex);
    auto& rules = shared().rules;
    rules.erase(std::remove_if(rules.begin(), rules.end(),
                               [&](const ReactiveMidiRule& r) { return r.id == ruleId; }),
                rules.end());
}

void ReactiveMidiEngine::toggleRule(const std::string& ruleId) {
    std::lock_guard<std::mutex> lock(shared().mutex);
    for (auto& r : shared().rules) {
        if (r.id == ruleId) {
            r.enabled = !r.enabled;
            break;
        }
    }
}

juce::var ReactiveMidiEngine::getRulesAsVar() {
    std::lock_guard<std::mutex> lock(shared().mutex);
    juce::Array<juce::var> array;
    for (const auto& r : shared().rules) {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("id", juce::String(r.id));
        obj->setProperty("name", juce::String(r.name));
        obj->setProperty("enabled", r.enabled);
        obj->setProperty("sourceTrackFilter", juce::String(r.sourceTrackFilter));
        obj->setProperty("targetTrackFilter", juce::String(r.targetTrackFilter));
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

//==============================================================================
// ReactiveMidiEngine – per instance
//==============================================================================

ReactiveMidiEngine::ReactiveMidiEngine() {
    // Touch the singletons now so they are never first-constructed on the audio thread.
    (void) shared();
    (void) SuperColliderManager::getInstance();
    m_scratch.ensureSize(8192);
    std::strcpy(m_snapshot.pattern, "idle");
}

void ReactiveMidiEngine::reset() {
    m_detector.reset();
    m_hadRule = false;
    m_activeAction[0] = '\0';
    m_numPending = 0;
    for (auto& p : m_pending) p.used = false;
    for (auto& s : m_sounding) s.reset();
    m_arpIndex = 0;
    m_lastArpPpq = -1.0;
    m_lastEmittedNote = -1;
}

std::string ReactiveMidiEngine::getLastActiveRule() const {
    const juce::SpinLock::ScopedLockType lock(m_ruleLock);
    return m_published.valid ? std::string(m_published.name) : std::string();
}

RhythmAnalysisResult ReactiveMidiEngine::getCurrentRhythm() const {
    RhythmSnapshot snap;
    {
        const juce::SpinLock::ScopedLockType lock(m_snapshotLock);
        snap = m_snapshot;
    }
    RhythmAnalysisResult r;
    r.pattern = snap.pattern;
    r.noteDensity = snap.noteDensity;
    r.avgIntervalBeats = snap.avgIntervalBeats;
    r.dominantRegister = snap.dominantRegister;
    r.activeHeldNotes = snap.numHeld;
    return r;
}

std::vector<int> ReactiveMidiEngine::getHeldNotes() const {
    RhythmSnapshot snap;
    {
        const juce::SpinLock::ScopedLockType lock(m_snapshotLock);
        snap = m_snapshot;
    }
    return std::vector<int>(snap.held, snap.held + snap.numHeld);
}

void ReactiveMidiEngine::evaluateRules(const std::vector<TrackInstanceInfo>& sessionTracks,
                                       const std::string& myInstanceId,
                                       const std::string& myTrackName) {
    ActiveRule chosen;

    if (isEnabled()) {
        const auto myName = lower(myTrackName);
        std::lock_guard<std::mutex> lock(shared().mutex);
        for (const auto& rule : shared().rules) {
            if (!rule.enabled) continue;

            // Optional target filter: only transform on tracks whose name matches.
            if (!rule.targetTrackFilter.empty() && myName.find(lower(rule.targetTrackFilter)) == std::string::npos)
                continue;

            const auto filter = lower(rule.sourceTrackFilter);
            bool matched = false;
            for (const auto& t : sessionTracks) {
                const bool isSelf = t.instanceId == myInstanceId;
                bool matchesSource;
                if (filter == "self") {
                    matchesSource = isSelf;
                } else if (isSelf) {
                    matchesSource = false; // a rule reacts to OTHER tracks, never to the track it transforms
                } else {
                    matchesSource = filter == "all" || filter == "any"
                                 || lower(t.trackName).find(filter) != std::string::npos;
                }
                if (matchesSource && (rule.triggerRhythm == "any" || t.rhythmPattern == rule.triggerRhythm)) {
                    matched = true;
                    break;
                }
            }
            if (matched) {
                chosen.valid = true;
                copyStr(chosen.name, rule.name);
                copyStr(chosen.action, rule.actionType);
                copyStr(chosen.osc, rule.scOscAddress);
                chosen.param = rule.param;
                break;
            }
        }
    }

    const juce::SpinLock::ScopedLockType lock(m_ruleLock);
    m_published = chosen;
}

//==============================================================================
// Realtime MIDI helpers
//==============================================================================

void ReactiveMidiEngine::emitNoteOn(juce::MidiBuffer& out, int channel, int note, int velocity, int pos) {
    channel = juce::jlimit(1, 16, channel);
    note = juce::jlimit(0, 127, note);
    const uint8_t bytes[3] = {static_cast<uint8_t>(0x90 | (channel - 1)), static_cast<uint8_t>(note),
                              static_cast<uint8_t>(juce::jlimit(1, 127, velocity))};
    out.addEvent(bytes, 3, std::max(0, pos));
    m_sounding[static_cast<size_t>(channel)].set(static_cast<size_t>(note));
}

void ReactiveMidiEngine::emitNoteOff(juce::MidiBuffer& out, int channel, int note, int pos) {
    channel = juce::jlimit(1, 16, channel);
    note = juce::jlimit(0, 127, note);
    const uint8_t bytes[3] = {static_cast<uint8_t>(0x80 | (channel - 1)), static_cast<uint8_t>(note), 0};
    out.addEvent(bytes, 3, std::max(0, pos));
    m_sounding[static_cast<size_t>(channel)].reset(static_cast<size_t>(note));
}

void ReactiveMidiEngine::scheduleEvent(juce::MidiBuffer& out, bool on, int channel, int note, int velocity,
                                       int64_t absolutePos, int numSamples) {
    if (absolutePos < numSamples) {
        if (on) emitNoteOn(out, channel, note, velocity, static_cast<int>(absolutePos));
        else emitNoteOff(out, channel, note, static_cast<int>(absolutePos));
        return;
    }
    for (auto& p : m_pending) {
        if (!p.used) {
            p = Pending{true, on, channel, note, velocity, absolutePos - numSamples};
            ++m_numPending;
            return;
        }
    }
    // Pending list full: never leave a note hanging, release it at the end of this block instead.
    if (!on) emitNoteOff(out, channel, note, numSamples - 1);
}

void ReactiveMidiEngine::emitDuePending(juce::MidiBuffer& out, int numSamples) {
    if (m_numPending == 0) return;
    for (;;) {
        Pending* best = nullptr;
        for (auto& p : m_pending) {
            if (p.used && p.remaining < numSamples && (best == nullptr || p.remaining < best->remaining))
                best = &p;
        }
        if (best == nullptr) break;
        if (best->on) emitNoteOn(out, best->channel, best->note, best->velocity, static_cast<int>(best->remaining));
        else emitNoteOff(out, best->channel, best->note, static_cast<int>(best->remaining));
        best->used = false;
        --m_numPending;
    }
    for (auto& p : m_pending) {
        if (p.used) p.remaining -= numSamples;
    }
}

void ReactiveMidiEngine::releaseAllSounding(juce::MidiBuffer& out) {
    for (auto& p : m_pending) p.used = false;
    m_numPending = 0;
    for (int ch = 1; ch <= 16; ++ch) {
        auto& bits = m_sounding[static_cast<size_t>(ch)];
        if (!bits.any()) continue;
        for (size_t n = 0; n < 128; ++n) {
            if (bits.test(n)) emitNoteOff(out, ch, static_cast<int>(n), 0);
        }
    }
    m_lastEmittedNote = -1;
}

void ReactiveMidiEngine::trackPassthrough(const juce::MidiBuffer& midi) {
    for (const auto meta : midi) {
        if (meta.numBytes < 3) continue;
        const uint8_t status = meta.data[0] & 0xF0;
        const size_t ch = static_cast<size_t>((meta.data[0] & 0x0F) + 1);
        const size_t note = meta.data[1] & 0x7F;
        if (isNoteOnMsg(status, meta.data[2])) m_sounding[ch].set(note);
        else if (isNoteOffMsg(status, meta.data[2])) m_sounding[ch].reset(note);
    }
}

//==============================================================================
// Realtime entry point
//==============================================================================

void ReactiveMidiEngine::processMidi(juce::MidiBuffer& midi, double ppq, double bpm,
                                     double sampleRate, int numSamples) {
    if (numSamples <= 0) return;
    const double nowMs = juce::Time::getMillisecondCounterHiRes();

    // 1. Feed the rhythm detector and forward note-ons to SuperCollider (non-blocking).
    auto& sc = SuperColliderManager::getInstance();
    const bool forwardNotes = sc.isActive();
    for (const auto meta : midi) {
        if (meta.numBytes < 3) continue;
        const uint8_t status = meta.data[0] & 0xF0;
        if (isNoteOnMsg(status, meta.data[2])) {
            m_detector.recordNoteOn(ppq, meta.data[1], meta.data[2], nowMs);
            if (forwardNotes) {
                ScNoteEvent ev;
                if (m_audioRule.valid) {
                    std::memcpy(ev.address, m_audioRule.osc, sizeof(ev.address));
                    std::memcpy(ev.mode, m_audioRule.action, sizeof(ev.mode));
                } else {
                    std::strcpy(ev.mode, "none");
                }
                ev.note = meta.data[1];
                ev.velocity = meta.data[2];
                ev.instanceHash = m_instanceHash;
                sc.postNote(ev);
            }
        } else if (isNoteOffMsg(status, meta.data[2])) {
            m_detector.recordNoteOff(meta.data[1]);
        }
    }

    // 2. Analyse and publish a snapshot (never blocks: skip the publish if a reader holds the lock).
    {
        const auto res = m_detector.analyze(ppq, nowMs);
        const juce::SpinLock::ScopedTryLockType lock(m_snapshotLock);
        if (lock.isLocked()) {
            std::strncpy(m_snapshot.pattern, res.pattern.c_str(), sizeof(m_snapshot.pattern) - 1);
            m_snapshot.pattern[sizeof(m_snapshot.pattern) - 1] = '\0';
            m_snapshot.noteDensity = res.noteDensity;
            m_snapshot.avgIntervalBeats = res.avgIntervalBeats;
            m_snapshot.dominantRegister = res.dominantRegister;
            const auto& held = m_detector.getHeldNotes();
            m_snapshot.numHeld = static_cast<int>(std::min<size_t>(held.size(), sizeof(m_snapshot.held)));
            for (int i = 0; i < m_snapshot.numHeld; ++i) m_snapshot.held[i] = static_cast<uint8_t>(held[static_cast<size_t>(i)]);
        }
    }

    // 3. Pick up the rule decided off-thread.
    if (isEnabled()) {
        const juce::SpinLock::ScopedTryLockType lock(m_ruleLock);
        if (lock.isLocked()) m_audioRule = m_published;
    } else {
        m_audioRule.valid = false;
    }

    const bool ruleValid = m_audioRule.valid;
    const bool changed = (ruleValid != m_hadRule)
                      || (ruleValid && std::strcmp(m_audioRule.action, m_activeAction) != 0);

    // Fast path: nothing to transform and nothing pending -> leave the MIDI untouched.
    if (!ruleValid && !changed && m_numPending == 0) {
        trackPassthrough(midi);
        return;
    }

    // 4. Build the transformed buffer in preallocated scratch storage.
    m_scratch.clear();
    emitDuePending(m_scratch, numSamples);

    if (changed) {
        // Release anything the previous mode (or the pass-through) left sounding so no note can hang.
        releaseAllSounding(m_scratch);
        m_arpIndex = 0;
        m_lastArpPpq = -1.0;
        m_hadRule = ruleValid;
        std::strncpy(m_activeAction, ruleValid ? m_audioRule.action : "", sizeof(m_activeAction) - 1);
        m_activeAction[sizeof(m_activeAction) - 1] = '\0';
    }

    const char* action = ruleValid ? m_audioRule.action : "";
    const double sr = sampleRate > 1000.0 ? sampleRate : 44100.0;
    const double effectiveBpm = bpm > 10.0 ? bpm : 120.0;

    const bool isArp = std::strcmp(action, "arp_1_16") == 0 || std::strcmp(action, "arp_1_8") == 0;

    for (const auto meta : midi) {
        const bool isNote = meta.numBytes >= 3 && ((meta.data[0] & 0xF0) == 0x90 || (meta.data[0] & 0xF0) == 0x80);
        const int pos = meta.samplePosition;
        if (!isNote) {
            m_scratch.addEvent(meta.data, meta.numBytes, pos);
            continue;
        }

        const uint8_t status = meta.data[0] & 0xF0;
        const int ch = (meta.data[0] & 0x0F) + 1;
        const int note = meta.data[1];
        const int vel = meta.data[2];
        const bool on = isNoteOnMsg(status, static_cast<uint8_t>(vel));

        if (isArp || std::strcmp(action, "mute") == 0) {
            continue; // original notes are replaced (arp) or silenced (mute)
        } else if (std::strcmp(action, "stabs_1_4") == 0) {
            if (on) {
                emitNoteOn(m_scratch, ch, note, std::min(127, vel + 15), pos);
                // Punchy 40 ms staccato; scheduled across blocks if it doesn't fit in this one.
                scheduleEvent(m_scratch, false, ch, note, 0, pos + static_cast<int64_t>(sr * 0.04), numSamples);
            }
        } else if (std::strcmp(action, "sustained") == 0) {
            const int shifted = juce::jlimit(0, 127, note + static_cast<int>(m_audioRule.param));
            if (on) emitNoteOn(m_scratch, ch, shifted, vel, pos);
            else scheduleEvent(m_scratch, false, ch, shifted, 0, pos + static_cast<int64_t>(sr * 1.5), numSamples); // wash tail
        } else if (std::strcmp(action, "ratchet_4x") == 0) {
            if (on) {
                const int64_t spacing = std::max<int64_t>(8, static_cast<int64_t>(sr * 60.0 / effectiveBpm / 8.0)); // 1/32 note
                for (int burst = 0; burst < 4; ++burst) {
                    const int64_t onPos = pos + burst * spacing;
                    scheduleEvent(m_scratch, true, ch, note, vel, onPos, numSamples);
                    scheduleEvent(m_scratch, false, ch, note, 0, onPos + spacing / 2, numSamples);
                }
            }
        } else if (std::strcmp(action, "harmony_5th") == 0) {
            if (on) {
                emitNoteOn(m_scratch, ch, note, vel, pos);
                emitNoteOn(m_scratch, ch, note + 7, vel, pos);
            } else {
                emitNoteOff(m_scratch, ch, note, pos);
                emitNoteOff(m_scratch, ch, note + 7, pos);
            }
        } else if (std::strcmp(action, "transpose_12") == 0) {
            if (on) emitNoteOn(m_scratch, ch, note + 12, vel, pos);
            else emitNoteOff(m_scratch, ch, note + 12, pos);
        } else {
            // No rule (or unknown action): pass through, keeping the sounding-note table accurate.
            if (on) emitNoteOn(m_scratch, ch, note, vel, pos);
            else emitNoteOff(m_scratch, ch, note, pos);
        }
    }

    // 5. Running arpeggiator, locked to the host PPQ grid.
    if (isArp) {
        const double stepLen = std::strcmp(action, "arp_1_8") == 0 ? 0.5 : 0.25;
        const auto& held = m_detector.getHeldNotes();

        if (held.empty()) {
            if (m_lastEmittedNote >= 0) {
                emitNoteOff(m_scratch, m_lastEmittedChannel, m_lastEmittedNote, 0);
                m_lastEmittedNote = -1;
            }
        } else {
            const double blockBeats = (static_cast<double>(numSamples) / sr) * (effectiveBpm / 60.0);
            const double startPpq = ppq;
            const double endPpq = ppq + blockBeats;
            if (startPpq < m_lastArpPpq - 1e-6) m_lastArpPpq = startPpq - stepLen; // transport looped / jumped back

            const auto startStep = static_cast<long long>(std::floor(startPpq / stepLen));
            const auto endStep = static_cast<long long>(std::floor(endPpq / stepLen));
            for (long long step = startStep; step <= endStep; ++step) {
                const double stepPpq = static_cast<double>(step) * stepLen;
                if (stepPpq >= startPpq && stepPpq < endPpq && stepPpq > m_lastArpPpq) {
                    m_lastArpPpq = stepPpq;
                    const double fraction = (stepPpq - startPpq) / (endPpq > startPpq ? (endPpq - startPpq) : 1.0);
                    const int offset = juce::jlimit(0, numSamples - 1, static_cast<int>(fraction * numSamples));

                    if (m_lastEmittedNote >= 0) emitNoteOff(m_scratch, m_lastEmittedChannel, m_lastEmittedNote, offset);

                    const int noteToPlay = held[static_cast<size_t>(std::abs(m_arpIndex)) % held.size()];
                    ++m_arpIndex;
                    m_lastEmittedNote = noteToPlay;
                    m_lastEmittedChannel = 1;
                    emitNoteOn(m_scratch, 1, noteToPlay, 105, offset);
                }
            }
        }
    }

    midi.swapWith(m_scratch);
}

} // namespace johnwalls::johnwalls
