#include "AudioTakeRecorder.h"

#include <cmath>
#include <iomanip>
#include <sstream>

namespace johnwalls::johnwalls {

AudioTakeRecorder::AudioTakeRecorder() {
    m_thread.startThread(juce::Thread::Priority::normal);
    ensureTakesDirectory();
}

AudioTakeRecorder::~AudioTakeRecorder() {
    if (m_isRecording.load()) {
        stopRecording();
    }
    m_thread.stopThread(2000);
}

void AudioTakeRecorder::prepare(double sampleRate, int /*samplesPerBlock*/) {
    m_sampleRate.store(sampleRate > 0.0 ? sampleRate : 48000.0);
}

juce::File AudioTakeRecorder::getTakesDirectory() {
    auto dir = juce::File::getSpecialLocation(juce::File::userMusicDirectory)
                   .getChildFile("johnwalls.studio")
                   .getChildFile("takes");
    if (!dir.exists()) {
        dir.createDirectory();
    }
    return dir;
}

void AudioTakeRecorder::ensureTakesDirectory() {
    auto dir = getTakesDirectory();
    if (!dir.exists()) {
        dir.createDirectory();
    }
}

void AudioTakeRecorder::processBlock(const juce::AudioBuffer<float>& buffer,
                                    bool isPlaying,
                                    double bpm,
                                    int barNumber,
                                    double ppqPosition) noexcept {
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();
    if (numSamples <= 0 || numChannels <= 0) return;

    // Track DAW play transition for auto-rec
    const bool wasPlay = m_wasPlaying.exchange(isPlaying, std::memory_order_relaxed);
    if (m_autoRecEnabled.load(std::memory_order_relaxed)) {
        if (!wasPlay && isPlaying && !m_isRecording.load(std::memory_order_relaxed)) {
            // Transport started: start recording flag can be picked up
            // Note: startRecording involves file opening so it is handled safely outside RT thread
        }
    }

    auto* writer = m_activeWriter.load(std::memory_order_relaxed);
    if (writer != nullptr && m_isRecording.load(std::memory_order_relaxed)) {
        writer->write(buffer.getArrayOfReadPointers(), numSamples);
        const int64_t total = m_samplesRecorded.fetch_add(numSamples, std::memory_order_relaxed) + numSamples;

        // Peak & RMS calculation for telemetry meters
        float peak = 0.0f;
        float sumSq = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch) {
            const float* p = buffer.getReadPointer(ch);
            for (int s = 0; s < numSamples; ++s) {
                const float val = std::abs(p[s]);
                if (val > peak) peak = val;
                sumSq += val * val;
            }
        }
        const float totalSamples = static_cast<float>(numSamples * numChannels);
        const float rms = (totalSamples > 0.0f) ? std::sqrt(sumSq / totalSamples) : 0.0f;
        const float pDb = (peak > 1e-4f) ? 20.0f * std::log10(peak) : -96.0f;
        const float rDb = (rms > 1e-4f) ? 20.0f * std::log10(rms) : -96.0f;
        m_peakDb.store(pDb, std::memory_order_relaxed);
        m_rmsDb.store(rDb, std::memory_order_relaxed);

        m_samplesSinceLastVisualFrame += numSamples;
        const double sr = m_sampleRate.load(std::memory_order_relaxed);
        if (m_samplesSinceLastVisualFrame >= static_cast<int>(sr * 0.1)) {
            m_samplesSinceLastVisualFrame = 0;
            int idx = m_visualFrameCount.load(std::memory_order_relaxed);
            if (idx < kMaxVisualFrames) {
                const double tSec = (sr > 0.0) ? static_cast<double>(total) / sr : 0.0;
                m_visualFrames[idx] = { tSec, pDb, rDb, static_cast<float>(bpm), barNumber, static_cast<float>(ppqPosition) };
                m_visualFrameCount.store(idx + 1, std::memory_order_release);
            }
        }
    }
}

bool AudioTakeRecorder::startRecording(const juce::String& trackName,
                                       const juce::String& projectName,
                                       double bpm) {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (m_isRecording.load()) {
        stopRecording();
    }

    ensureTakesDirectory();
    auto dir = getTakesDirectory();

    auto now = juce::Time::getCurrentTime();
    juce::String timeStamp = now.formatted("%Y%m%d_%H%M%S");
    
    juce::String cleanTrack = trackName.trim().isEmpty() ? "Master" : trackName.trim();
    cleanTrack = juce::File::createLegalFileName(cleanTrack).replace(" ", "_");

    m_currentTakeId = "take_" + timeStamp + "_" + cleanTrack;
    m_currentTrackName = trackName.trim().isEmpty() ? "Master" : trackName.trim();
    m_currentProjectName = projectName.trim().isEmpty() ? "Ableton Session" : projectName.trim();
    m_currentBpm = bpm > 0.0 ? bpm : 120.0;
    m_recordingStartMs = now.toMilliseconds();
    m_samplesRecorded.store(0);

    m_currentWavFile = dir.getChildFile(m_currentTakeId + ".wav");
    m_currentMetaFile = dir.getChildFile(m_currentTakeId + ".json");
    m_currentVisualHtmlFile = dir.getChildFile(m_currentTakeId + "_visual.html");

    m_visualFrameCount.store(0, std::memory_order_release);
    m_samplesSinceLastVisualFrame = 0;

    if (m_currentWavFile.exists()) {
        m_currentWavFile.deleteFile();
    }
    if (m_currentVisualHtmlFile.exists()) {
        m_currentVisualHtmlFile.deleteFile();
    }

    auto outStream = m_currentWavFile.createOutputStream();
    if (outStream == nullptr) {
        return false;
    }

    std::unique_ptr<juce::OutputStream> stream = std::move(outStream);
    juce::WavAudioFormat wavFormat;
    // Standard 24-bit PCM stereo WAV writer
    auto rawWriter = wavFormat.createWriterFor(
        stream,
        juce::AudioFormatWriterOptions{}
            .withSampleRate(m_sampleRate.load())
            .withNumChannels(2)
            .withBitsPerSample(24));
    if (rawWriter == nullptr) {
        return false;
    }

    // 65536 samples buffer ~ 1.36 seconds of audio FIFO at 48kHz
    m_threadedWriter = std::make_unique<juce::AudioFormatWriter::ThreadedWriter>(
        rawWriter.release(), m_thread, 65536);

    m_activeWriter.store(m_threadedWriter.get(), std::memory_order_release);
    m_isRecording.store(true, std::memory_order_release);

    return true;
}

namespace {
juce::String generateStandaloneVisualHtml(const juce::String& takeId,
                                         const juce::String& trackName,
                                         double bpm,
                                         double durationSec,
                                         const juce::String& preset,
                                         const juce::String& visJson) {
    juce::String html = R"HTML(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>johnwalls.studio // )HTML" + trackName + R"HTML( [)HTML" + takeId + R"HTML(]</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #06080d; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; overflow-x: hidden; }
    .header { padding: 14px 20px; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; background: #0b0e17; }
    .title { font-size: 13px; font-weight: 800; color: #e6af2e; letter-spacing: 1px; font-family: monospace; }
    .meta { font-size: 11px; color: #94a3b8; font-family: monospace; }
    .scope-box { position: relative; width: 100vw; height: calc(100vh - 120px); background: #040508; display: flex; justify-content: center; align-items: center; }
    canvas { display: block; width: 100%; height: 100%; }
    .hud { position: absolute; top: 16px; left: 20px; font-size: 11px; color: #94a3b8; font-family: monospace; pointer-events: none; }
    .hud-amber { color: #e6af2e; font-weight: bold; }
    .controls { height: 60px; padding: 10px 20px; background: #0b0e17; border-top: 1px solid #1e293b; display: flex; align-items: center; gap: 16px; }
    audio { height: 36px; flex: 1; max-width: 600px; accent-color: #e6af2e; }
    .badge { font-size: 10px; font-weight: bold; padding: 3px 8px; border-radius: 4px; background: rgba(230,175,46,0.15); border: 1px solid rgba(230,175,46,0.4); color: #e6af2e; font-family: monospace; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">JOHNWALLS.STUDIO // SUPERCOLLIDER BUNDLE</div>
      <div class="meta">TRACK: )HTML" + trackName + R"HTML( | BPM: )HTML" + juce::String(bpm, 1) + R"HTML( | DURATION: )HTML" + juce::String(durationSec, 1) + R"HTML(s</div>
    </div>
    <div class="badge">PRESET: )HTML" + preset.toUpperCase() + R"HTML(</div>
  </div>
  <div class="scope-box">
    <canvas id="c"></canvas>
    <div class="hud" id="hud">
      <div class="hud-amber">SUPERCOLLIDER DUAL-VECTOR PHOSPHOR SCOPE</div>
      <div id="telemetry">CLICK PLAY BELOW TO START REAL-TIME VISUALIZER</div>
    </div>
  </div>
  <div class="controls">
    <audio id="audio" controls src="./)HTML" + takeId + R"HTML(.wav"></audio>
    <span class="meta">24-BIT 48kHz WAV + TIME-SERIES VISUALIZER BUNDLE</span>
  </div>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const audio = document.getElementById('audio');
    const telemEl = document.getElementById('telemetry');
    const manifest = )HTML" + visJson + R"HTML(;

    let audioCtx, analyser, dataArray;
    let phase = 0;

    function resize() {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
    }
    window.addEventListener('resize', resize);
    resize();

    audio.addEventListener('play', () => {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(audio);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        src.connect(analyser);
        analyser.connect(audioCtx.destination);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    });

    function render() {
      requestAnimationFrame(render);
      const w = canvas.width, h = canvas.height;
      const cx = w * 0.5, cy = h * 0.5;

      ctx.fillStyle = 'rgba(4, 5, 8, 0.25)';
      ctx.fillRect(0, 0, w, h);

      // Reticle
      ctx.strokeStyle = 'rgba(25, 35, 50, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
      ctx.stroke();

      let rms = 0.05, peak = 0.05;
      if (analyser && !audio.paused) {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          if (Math.abs(v) > peak) peak = Math.abs(v);
          sum += v * v;
        }
        rms = Math.sqrt(sum / dataArray.length);
        telemEl.textContent = `LIVE: RMS ${(rms * 100).toFixed(1)}% | PEAK ${(peak * 100).toFixed(1)}% | TIME ${audio.currentTime.toFixed(1)}s`;
      } else {
        telemEl.textContent = `IDLE: Click play on the audio player to activate live phosphor scope`;
      }

      const amp = Math.max(20, Math.min(cx, cy) * 0.8 * (rms * 2.5 + 0.1));
      phase += 0.03;
      const pts = 320;

      // Outer Phosphor Glow
      ctx.strokeStyle = 'rgba(230, 175, 46, ' + (peak * 0.7 + 0.25) + ')';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#e6af2e';
      ctx.shadowBlur = peak > 0.1 ? 16 : 4;
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const theta = (i / pts) * Math.PI * 2;
        const px = cx + Math.sin(theta * 2 + phase) * amp;
        const py = cy + Math.cos(theta * 3 + phase * 1.33) * amp;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Sharp Core
      ctx.strokeStyle = '#fff8e7';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }
    render();
  </script>
</body>
</html>)HTML";
    return html;
}
} // namespace

juce::var AudioTakeRecorder::stopRecording() {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (!m_isRecording.load()) {
        return juce::var();
    }

    m_isRecording.store(false, std::memory_order_release);
    m_activeWriter.store(nullptr, std::memory_order_release);

    // Destructing ThreadedWriter flushes all remaining samples and closes WAV header cleanly
    m_threadedWriter.reset();

    const double sr = m_sampleRate.load();
    const int64_t totalSamples = m_samplesRecorded.load();
    const double durationSec = (sr > 0.0) ? static_cast<double>(totalSamples) / sr : 0.0;
    const double bpm = m_currentBpm;
    const double beatsTotal = (bpm > 0.0) ? (durationSec / 60.0) * bpm : 0.0;
    const int barCount = static_cast<int>(std::ceil(beatsTotal / 4.0));

    juce::DynamicObject::Ptr meta = new juce::DynamicObject();
    meta->setProperty("takeId", m_currentTakeId);
    meta->setProperty("trackName", m_currentTrackName);
    meta->setProperty("projectName", m_currentProjectName);
    meta->setProperty("fileName", m_currentWavFile.getFileName());
    meta->setProperty("filePath", m_currentWavFile.getFullPathName());
    meta->setProperty("fileSizeBytes", static_cast<juce::int64>(m_currentWavFile.getSize()));
    meta->setProperty("sampleRate", static_cast<int>(sr));
    meta->setProperty("channels", 2);
    meta->setProperty("bitDepth", 24);
    meta->setProperty("durationSeconds", durationSec);
    meta->setProperty("bpm", bpm);
    meta->setProperty("barCount", barCount);
    meta->setProperty("timeSignature", "4/4");
    meta->setProperty("peakDb", static_cast<double>(m_peakDb.load()));
    meta->setProperty("rmsDb", static_cast<double>(m_rmsDb.load()));
    meta->setProperty("recordedAt", juce::Time::getCurrentTime().toISO8601(true));

    // Bundled Visualizer Metadata & Timeline
    juce::String preset = m_visualizerPreset.isEmpty() ? "supercollider-lissajous" : m_visualizerPreset;
    juce::DynamicObject::Ptr visManifest = new juce::DynamicObject();
    visManifest->setProperty("preset", preset);
    visManifest->setProperty("visualizerName", "SuperCollider Lissajous (Dual-Vector Phosphor Scope)");
    visManifest->setProperty("engine", "SuperCollider 3.14 & Web Visualizer");
    visManifest->setProperty("colorPalette", "#e6af2e");

    const int frameCount = std::min(m_visualFrameCount.load(std::memory_order_relaxed), kMaxVisualFrames);
    visManifest->setProperty("sampleCount", frameCount);

    juce::Array<juce::var> framesVar;
    framesVar.ensureStorageAllocated(frameCount);
    for (int i = 0; i < frameCount; ++i) {
        const auto& vf = m_visualFrames[i];
        juce::DynamicObject::Ptr fObj = new juce::DynamicObject();
        fObj->setProperty("t", vf.timeSec);
        fObj->setProperty("peak", static_cast<double>(vf.peakDb));
        fObj->setProperty("rms", static_cast<double>(vf.rmsDb));
        fObj->setProperty("bpm", static_cast<double>(vf.bpm));
        fObj->setProperty("bar", vf.bar);
        fObj->setProperty("ppq", static_cast<double>(vf.ppq));
        framesVar.add(juce::var(fObj.get()));
    }
    visManifest->setProperty("timeline", framesVar);

    meta->setProperty("visualizerPreset", preset);
    meta->setProperty("visualManifest", juce::var(visManifest.get()));

    juce::String json = juce::JSON::toString(juce::var(meta.get()), true);
    m_currentMetaFile.replaceWithText(json);

    // Export standalone HTML5 bundled audio-reactive player
    juce::String visJsonStr = juce::JSON::toString(juce::var(visManifest.get()), false);
    juce::String html = generateStandaloneVisualHtml(m_currentTakeId, m_currentTrackName, bpm, durationSec, preset, visJsonStr);
    m_currentVisualHtmlFile.replaceWithText(html);

    return juce::var(meta.get());
}

juce::var AudioTakeRecorder::getStatus() const {
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    const bool rec = m_isRecording.load(std::memory_order_relaxed);
    obj->setProperty("isRecording", rec);
    obj->setProperty("autoRecEnabled", m_autoRecEnabled.load(std::memory_order_relaxed));
    obj->setProperty("currentTakeId", m_currentTakeId);
    obj->setProperty("currentTrackName", m_currentTrackName);
    obj->setProperty("currentProjectName", m_currentProjectName);
    obj->setProperty("bpm", m_currentBpm);
    obj->setProperty("sampleRate", m_sampleRate.load());
    obj->setProperty("samplesRecorded", static_cast<juce::int64>(m_samplesRecorded.load()));

    const double sr = m_sampleRate.load();
    const double duration = (sr > 0.0) ? static_cast<double>(m_samplesRecorded.load()) / sr : 0.0;
    obj->setProperty("durationSeconds", duration);
    obj->setProperty("peakDb", static_cast<double>(m_peakDb.load()));
    obj->setProperty("rmsDb", static_cast<double>(m_rmsDb.load()));

    return juce::var(obj.get());
}

juce::Array<juce::var> AudioTakeRecorder::getRecentTakes() const {
    juce::Array<juce::var> list;
    auto dir = getTakesDirectory();
    if (!dir.isDirectory()) return list;

    juce::Array<juce::File> metaFiles;
    dir.findChildFiles(metaFiles, juce::File::findFiles, false, "*.json");

    std::sort(metaFiles.begin(), metaFiles.end(), [](const juce::File& a, const juce::File& b) {
        return a.getLastModificationTime() > b.getLastModificationTime();
    });

    for (const auto& mf : metaFiles) {
        auto parsed = juce::JSON::parse(mf);
        if (parsed.isObject()) {
            list.add(parsed);
        }
    }

    return list;
}

juce::File AudioTakeRecorder::getTakeAudioFile(const juce::String& takeId) const {
    auto dir = getTakesDirectory();
    auto f = dir.getChildFile(takeId + ".wav");
    if (f.existsAsFile()) return f;

    // Fallback search
    juce::Array<juce::File> files;
    dir.findChildFiles(files, juce::File::findFiles, false, takeId + "*.wav");
    if (!files.isEmpty()) return files[0];

    return juce::File();
}

juce::File AudioTakeRecorder::getTakeMetaFile(const juce::String& takeId) const {
    auto dir = getTakesDirectory();
    auto f = dir.getChildFile(takeId + ".json");
    if (f.existsAsFile()) return f;

    juce::Array<juce::File> files;
    dir.findChildFiles(files, juce::File::findFiles, false, takeId + "*.json");
    if (!files.isEmpty()) return files[0];

    return juce::File();
}

juce::File AudioTakeRecorder::getTakeVisualHtmlFile(const juce::String& takeId) const {
    auto dir = getTakesDirectory();
    auto f = dir.getChildFile(takeId + "_visual.html");
    if (f.existsAsFile()) return f;

    juce::Array<juce::File> files;
    dir.findChildFiles(files, juce::File::findFiles, false, takeId + "*_visual.html");
    if (!files.isEmpty()) return files[0];

    return juce::File();
}

bool AudioTakeRecorder::deleteTake(const juce::String& takeId) {
    auto wav = getTakeAudioFile(takeId);
    auto meta = getTakeMetaFile(takeId);
    auto vis = getTakeVisualHtmlFile(takeId);
    bool ok = false;
    if (wav.existsAsFile()) {
        ok |= wav.deleteFile();
    }
    if (meta.existsAsFile()) {
        ok |= meta.deleteFile();
    }
    if (vis.existsAsFile()) {
        vis.deleteFile();
    }
    return ok;
}

} // namespace johnwalls::johnwalls
