/**
 * Roland RC-600 6-Track Loop Station Audio Engine for johnwalls.studio
 *
 * Implements real-time 6-track stereo looping, overdubbing, non-destructive
 * undo/redo, tempo lock to host DAW, and bidirectional stem exchange with the SP-404.
 */

import { getSharedAudioContext } from '../utils/sharedAudioContext';
import { sp404AudioEngine, BankLetter } from './SP404AudioEngine';
import { extractWaveformProfile } from '../utils/wavEncoder';

export type RC600TrackStatus = 'empty' | 'recording' | 'overdubbing' | 'playing' | 'stopped';

export interface RC600Track {
  id: number; // 1 to 6
  name: string;
  status: RC600TrackStatus;
  audioBuffer: AudioBuffer | null;
  undoBuffer: AudioBuffer | null;
  redoBuffer: AudioBuffer | null;
  volume: number; // 0.0 to 1.5
  pan: number; // -1.0 to 1.0
  speed: 0.5 | 1.0 | 2.0;
  reverse: boolean;
  isOneShot: boolean;
  bars: number;
  durationSec: number;
  waveform: number[];
  isMuted: boolean;
  isSoloed: boolean;
}

/** Mix captured input into a loop, wrapping at the loop boundary. */
export function mixLoopSamples(
  base: Float32Array,
  chunks: Float32Array[],
  inputSampleRate: number,
  loopSampleRate: number,
  startOffset: number,
  playbackRate: number
): Float32Array {
  const mixed = new Float32Array(base);
  if (!mixed.length || inputSampleRate <= 0 || loopSampleRate <= 0) return mixed;
  let inputIndex = 0;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const loopIndex = (startOffset + Math.floor(inputIndex * loopSampleRate * playbackRate / inputSampleRate)) % mixed.length;
      mixed[loopIndex] += sample;
      inputIndex++;
    }
  }
  return mixed;
}

const DEFAULT_TRACK_NAMES = [
  'Track 1: Drums',
  'Track 2: Bass',
  'Track 3: Guitars',
  'Track 4: Vocals',
  'Track 5: Percussion',
  'Track 6: Aux / FX'
];

export class RC600AudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Master Looper Bus
  private looperMasterGain: GainNode | null = null;

  // Per-Track Audio Nodes & Active Voices
  private trackNodes: Map<
    number,
    {
      gainNode: GainNode;
      panNode: StereoPannerNode;
      sourceNode: AudioBufferSourceNode | null;
      startTime: number;
      startOffsetSec: number;
    }
  > = new Map();

  // Tracks State
  private tracks: RC600Track[] = [];
  private activeRecordingTrackId: number | null = null;
  private recordingChunksL: Float32Array[] = [];
  private recordingChunksR: Float32Array[] = [];
  private recordProcessor: ScriptProcessorNode | null = null;
  private recordMuteGain: GainNode | null = null;
  private activeCaptureMode: 'record' | 'overdub' | null = null;
  private overdubStartOffsetSec = 0;

  // Master Transport & Sync
  private isAllPlaying = false;
  private bpm = 120;
  private trackLinkEnabled = false;
  private quantizeBars: 1 | 2 | 4 | 0 = 4;
  private onStateChange: (() => void) | null = null;

  constructor() {
    this.tracks = this.createInitialTracks();
  }

  public setOnStateChange(cb: () => void) {
    this.onStateChange = cb;
  }

  private createInitialTracks(): RC600Track[] {
    return Array.from({ length: 6 }, (_, idx) => ({
      id: idx + 1,
      name: DEFAULT_TRACK_NAMES[idx] || `Track ${idx + 1}`,
      status: 'empty',
      audioBuffer: null,
      undoBuffer: null,
      redoBuffer: null,
      volume: 1.0,
      pan: 0.0,
      speed: 1.0,
      reverse: false,
      isOneShot: false,
      bars: 4,
      durationSec: 0,
      waveform: new Array(32).fill(0),
      isMuted: false,
      isSoloed: false
    }));
  }

  public async initAudio(): Promise<boolean> {
    if (this.isInitialized && this.ctx) return true;

    try {
      this.ctx = getSharedAudioContext();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      this.looperMasterGain = this.ctx.createGain();
      this.looperMasterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.looperMasterGain.connect(this.ctx.destination);

      // Create gain & pan nodes for each of the 6 tracks
      for (const track of this.tracks) {
        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(track.volume, this.ctx.currentTime);

        const panNode = this.ctx.createStereoPanner();
        panNode.pan.setValueAtTime(track.pan, this.ctx.currentTime);

        gainNode.connect(panNode);
        panNode.connect(this.looperMasterGain);

        this.trackNodes.set(track.id, {
          gainNode,
          panNode,
          sourceNode: null,
          startTime: 0,
          startOffsetSec: 0
        });
      }

      this.isInitialized = true;
      this.onStateChange?.();
      return true;
    } catch (err) {
      console.warn('RC-600 Audio Engine init warning:', err);
      return false;
    }
  }

  public getTracks(): RC600Track[] {
    return [...this.tracks];
  }

  public getTrack(trackId: number): RC600Track | undefined {
    return this.tracks.find((t) => t.id === trackId);
  }

  public getMasterGain(): GainNode | null {
    return this.looperMasterGain;
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public getTrackProgress(trackId: number): number {
    const track = this.getTrack(trackId);
    const nodes = this.trackNodes.get(trackId);
    if (!track || !nodes || !nodes.sourceNode || !['playing', 'overdubbing'].includes(track.status) || track.durationSec <= 0 || !this.ctx) return 0;
    const playbackRate = Math.max(0.01, this.getEffectivePlaybackRate(track));
    const loopDuration = track.durationSec / playbackRate;
    const elapsed = Math.max(0, this.ctx.currentTime - nodes.startTime);
    const position = (nodes.startOffsetSec || 0) + elapsed * playbackRate;
    return loopDuration > 0 ? (position % track.durationSec) / track.durationSec : 0;
  }

  public setBpm(newBpm: number) {
    if (!Number.isFinite(newBpm) || newBpm <= 0 || this.bpm === newBpm) return;
    this.bpm = newBpm;
    this.updateLinkedPlaybackRates();
  }

  public setQuantizeBars(bars: 1 | 2 | 4 | 0) {
    this.quantizeBars = bars;
  }

  public setTrackLinkEnabled(enabled: boolean) {
    if (this.trackLinkEnabled === enabled) return;
    this.trackLinkEnabled = enabled;
    const master = this.getTrack(1);
    if (enabled && master?.durationSec && this.bpm > 0) {
      master.bars = Math.max(1, Math.round((master.durationSec * this.bpm) / 240));
    }
    this.updateLinkedPlaybackRates();
    this.onStateChange?.();
  }

  public isTrackLinkEnabled(): boolean {
    return this.trackLinkEnabled;
  }

  private getTargetLoopDuration(track: RC600Track): number {
    if (!this.trackLinkEnabled) return track.durationSec;
    const master = this.getTrack(1);
    if (!master || !master.durationSec) return track.durationSec;
    const bars = Math.max(1, master.bars || 1);
    return this.bpm > 0 ? (bars * 240) / this.bpm : master.durationSec;
  }

  private getEffectivePlaybackRate(track: RC600Track): number {
    if (!track.audioBuffer || track.durationSec <= 0) return track.speed;
    if (!this.trackLinkEnabled) return track.speed;
    const targetDuration = this.getTargetLoopDuration(track);
    return targetDuration > 0 ? track.durationSec / targetDuration : track.speed;
  }

  private updateLinkedPlaybackRates() {
    if (!this.ctx) return;
    for (const track of this.tracks) {
      const source = this.trackNodes.get(track.id)?.sourceNode;
      if (source && (track.status === 'playing' || track.status === 'overdubbing')) {
        source.playbackRate.setTargetAtTime(this.getEffectivePlaybackRate(track), this.ctx.currentTime, 0.02);
      }
    }
  }

  // --- 1. Track Playback & Stop ---

  public playTrack(trackId: number, startOffsetSec = 0) {
    const track = this.getTrack(trackId);
    if (!track || !track.audioBuffer || !this.ctx) return;

    this.stopTrackVoice(trackId);

    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    let bufToPlay = track.audioBuffer;
    if (track.reverse) {
      bufToPlay = this.createReversedBuffer(track.audioBuffer);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = bufToPlay;
    source.loop = !track.isOneShot;
    source.playbackRate.setValueAtTime(this.getEffectivePlaybackRate(track), this.ctx.currentTime);

    source.connect(nodes.gainNode);
    const safeOffset = ((startOffsetSec % track.durationSec) + track.durationSec) % track.durationSec;
    source.start(0, safeOffset);

    nodes.sourceNode = source;
    nodes.startTime = this.ctx.currentTime;
    nodes.startOffsetSec = safeOffset;
    track.status = 'playing';

    source.onended = () => {
      if (track.isOneShot) {
        track.status = 'stopped';
        this.onStateChange?.();
      }
    };

    this.onStateChange?.();
  }

  public stopTrack(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track) return;

    if (track.status === 'overdubbing') this.stopOverdub(trackId);

    this.stopTrackVoice(trackId);
    track.status = track.audioBuffer ? 'stopped' : 'empty';
    this.onStateChange?.();
  }

  private stopTrackVoice(trackId: number) {
    const nodes = this.trackNodes.get(trackId);
    if (nodes && nodes.sourceNode) {
      try {
        nodes.sourceNode.stop();
        nodes.sourceNode.disconnect();
      } catch {}
      nodes.sourceNode = null;
    }
  }

  public allStart() {
    this.isAllPlaying = true;
    for (const track of this.tracks) {
      if (track.audioBuffer && track.status !== 'recording' && track.status !== 'overdubbing') {
        this.playTrack(track.id);
      }
    }
    this.onStateChange?.();
  }

  public allStop() {
    this.isAllPlaying = false;
    for (const track of this.tracks) {
      this.stopTrack(track.id);
    }
    this.onStateChange?.();
  }

  // --- 2. Track Parameters ---

  public setTrackVolume(trackId: number, volume: number) {
    const track = this.getTrack(trackId);
    if (!track || !this.ctx) return;
    track.volume = volume;
    const nodes = this.trackNodes.get(trackId);
    if (nodes) {
      nodes.gainNode.gain.setTargetAtTime(track.isMuted ? 0 : volume, this.ctx.currentTime, 0.05);
    }
    this.onStateChange?.();
  }

  public setTrackPan(trackId: number, pan: number) {
    const track = this.getTrack(trackId);
    if (!track || !this.ctx) return;
    track.pan = pan;
    const nodes = this.trackNodes.get(trackId);
    if (nodes) {
      nodes.panNode.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.05);
    }
    this.onStateChange?.();
  }

  public setTrackSpeed(trackId: number, speed: 0.5 | 1.0 | 2.0) {
    const track = this.getTrack(trackId);
    if (!track || !this.ctx) return;
    track.speed = speed;
    const nodes = this.trackNodes.get(trackId);
    if (nodes && nodes.sourceNode) {
      nodes.sourceNode.playbackRate.setValueAtTime(this.getEffectivePlaybackRate(track), this.ctx.currentTime);
    }
    this.onStateChange?.();
  }

  public toggleTrackReverse(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track) return;
    track.reverse = !track.reverse;
    if (track.status === 'playing') {
      this.playTrack(trackId);
    } else {
      this.onStateChange?.();
    }
    this.updateLinkedPlaybackRates();
  }

  public toggleTrackMute(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track || !this.ctx) return;
    track.isMuted = !track.isMuted;
    const nodes = this.trackNodes.get(trackId);
    if (nodes) {
      nodes.gainNode.gain.setTargetAtTime(track.isMuted ? 0 : track.volume, this.ctx.currentTime, 0.05);
    }
    this.onStateChange?.();
  }

  public clearTrack(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track) return;
    if (track.status === 'overdubbing') this.stopOverdub(trackId);
    this.stopTrackVoice(trackId);
    track.audioBuffer = null;
    track.undoBuffer = null;
    track.redoBuffer = null;
    track.status = 'empty';
    track.durationSec = 0;
    track.waveform = new Array(32).fill(0);
    this.onStateChange?.();
  }

  private restoreTrackBuffer(track: RC600Track, buffer: AudioBuffer | null) {
    if (!buffer) return;
    track.audioBuffer = buffer;
    track.durationSec = buffer.duration;
    track.waveform = extractWaveformProfile(buffer, 32);
    if (track.status === 'playing' || track.status === 'overdubbing') {
      const wasOverdubbing = track.status === 'overdubbing';
      this.playTrack(track.id);
      if (wasOverdubbing) {
        track.status = 'overdubbing';
        this.onStateChange?.();
      }
    } else {
      this.onStateChange?.();
    }
    this.updateLinkedPlaybackRates();
  }

  public undoTrack(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track || !track.undoBuffer) return;
    track.redoBuffer = track.audioBuffer;
    track.audioBuffer = track.undoBuffer;
    track.undoBuffer = null;
    this.restoreTrackBuffer(track, track.audioBuffer);
  }

  public redoTrack(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track || !track.redoBuffer) return;
    track.undoBuffer = track.audioBuffer;
    track.audioBuffer = track.redoBuffer;
    track.redoBuffer = null;
    this.restoreTrackBuffer(track, track.audioBuffer);
  }

  // --- 3. Footswitch Workflow (Rec -> Overdub -> Play -> Stop) ---

  public triggerFootswitch(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track) return;

    if (track.status === 'empty') {
      // Empty -> Start Recording
      this.startRecord(trackId);
    } else if (track.status === 'recording') {
      // Recording -> Switch to Play / Overdub
      this.stopRecord(trackId, true);
    } else if (track.status === 'playing') {
      // Playing -> Start Overdub
      this.startOverdub(trackId);
    } else if (track.status === 'overdubbing') {
      // Overdubbing -> Return to Play
      this.stopOverdub(trackId);
    } else if (track.status === 'stopped') {
      // Stopped -> Play
      this.playTrack(trackId);
    }
  }

  // --- 4. Recording & Overdub Engine ---

  public startRecord(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track || !this.ctx || this.activeRecordingTrackId !== null) return;

    this.activeRecordingTrackId = trackId;
    this.activeCaptureMode = 'record';
    track.status = 'recording';
    this.recordingChunksL = [];
    this.recordingChunksR = [];

    // Capture incoming wet master audio
    this.recordProcessor = this.ctx.createScriptProcessor(4096, 2, 2);
    this.recordMuteGain = this.ctx.createGain();
    this.recordMuteGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.recordProcessor.onaudioprocess = (e) => {
      const inL = e.inputBuffer.getChannelData(0);
      const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
      this.recordingChunksL.push(new Float32Array(inL));
      this.recordingChunksR.push(new Float32Array(inR));
    };

    const sp404Gain = sp404AudioEngine.getMasterGain();
    if (sp404Gain) {
      sp404Gain.connect(this.recordProcessor);
    }
    this.recordProcessor.connect(this.recordMuteGain);
    this.recordMuteGain.connect(this.ctx.destination);

    this.onStateChange?.();
  }

  public stopRecord(trackId: number, autoPlay = true) {
    const track = this.getTrack(trackId);
    if (!track || !this.ctx || this.activeRecordingTrackId !== trackId || this.activeCaptureMode !== 'record') return;
    this.stopCaptureNodes();

    const totalSamples = this.recordingChunksL.reduce((acc, c) => acc + c.length, 0);
    if (totalSamples > 256) {
      const audioBuf = this.ctx.createBuffer(2, totalSamples, this.ctx.sampleRate);
      const outL = audioBuf.getChannelData(0);
      const outR = audioBuf.getChannelData(1);

      let offset = 0;
      for (let i = 0; i < this.recordingChunksL.length; i++) {
        outL.set(this.recordingChunksL[i], offset);
        outR.set(this.recordingChunksR[i], offset);
        offset += this.recordingChunksL[i].length;
      }

      track.undoBuffer = track.audioBuffer;
      track.redoBuffer = null;
      track.audioBuffer = audioBuf;
      track.durationSec = audioBuf.duration;
      if (this.trackLinkEnabled) {
        const master = this.getTrack(1);
        if (trackId !== 1 && master?.durationSec) {
          track.bars = master.bars;
        } else {
          track.bars = this.quantizeBars || Math.max(1, Math.round((audioBuf.duration * this.bpm) / 240));
        }
      }
      track.waveform = extractWaveformProfile(audioBuf, 32);
      this.updateLinkedPlaybackRates();
    }

    this.recordingChunksL = [];
    this.recordingChunksR = [];
    this.activeRecordingTrackId = null;
    this.activeCaptureMode = null;

    if (autoPlay && track.audioBuffer) {
      this.playTrack(trackId);
    } else {
      track.status = track.audioBuffer ? 'stopped' : 'empty';
      this.onStateChange?.();
    }
  }

  public startOverdub(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track || !track.audioBuffer || !this.ctx || this.activeRecordingTrackId !== null) return;
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.sourceNode) this.playTrack(trackId);
    const activeNodes = this.trackNodes.get(trackId);
    this.overdubStartOffsetSec = activeNodes?.sourceNode
      ? this.getTrackProgress(trackId) * track.durationSec
      : 0;
    this.activeRecordingTrackId = trackId;
    this.activeCaptureMode = 'overdub';
    this.recordingChunksL = [];
    this.recordingChunksR = [];
    this.startCaptureNodes();
    track.status = 'overdubbing';
    this.onStateChange?.();
  }

  public stopOverdub(trackId: number) {
    const track = this.getTrack(trackId);
    if (!track || !this.ctx || this.activeRecordingTrackId !== trackId || this.activeCaptureMode !== 'overdub') return;
    this.stopCaptureNodes();
    const resumeOffsetSec = this.getTrackProgress(trackId) * track.durationSec;
    const capturedSamples = this.recordingChunksL.reduce((sum, chunk) => sum + chunk.length, 0);
    const original = track.audioBuffer;
    if (original && capturedSamples > 0) {
      const mixed = this.ctx.createBuffer(original.numberOfChannels, original.length, original.sampleRate);
      const inputRate = this.ctx.sampleRate;
      const offset = Math.round(this.overdubStartOffsetSec * original.sampleRate) % original.length;
      const playbackRate = this.getEffectivePlaybackRate(track);
      for (let channel = 0; channel < original.numberOfChannels; channel++) {
        const chunks = channel === 1 ? this.recordingChunksR : this.recordingChunksL;
        mixed.getChannelData(channel).set(mixLoopSamples(
          original.getChannelData(channel), chunks, inputRate, original.sampleRate, offset, playbackRate
        ));
      }
      track.undoBuffer = original;
      track.redoBuffer = null;
      track.audioBuffer = mixed;
      track.durationSec = mixed.duration;
      track.waveform = extractWaveformProfile(mixed, 32);
    }
    this.recordingChunksL = [];
    this.recordingChunksR = [];
    this.activeRecordingTrackId = null;
    this.activeCaptureMode = null;
    track.status = 'playing';
    if (track.audioBuffer) this.playTrack(trackId, resumeOffsetSec);
    this.onStateChange?.();
  }

  private startCaptureNodes() {
    if (!this.ctx) return;
    this.recordProcessor = this.ctx.createScriptProcessor(4096, 2, 2);
    this.recordMuteGain = this.ctx.createGain();
    this.recordMuteGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.recordProcessor.onaudioprocess = (e) => {
      const inL = e.inputBuffer.getChannelData(0);
      const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
      this.recordingChunksL.push(new Float32Array(inL));
      this.recordingChunksR.push(new Float32Array(inR));
    };
    sp404AudioEngine.getMasterGain()?.connect(this.recordProcessor);
    this.recordProcessor.connect(this.recordMuteGain);
    this.recordMuteGain.connect(this.ctx.destination);
  }

  private stopCaptureNodes() {
    try { this.recordProcessor?.disconnect(); } catch {}
    try { this.recordMuteGain?.disconnect(); } catch {}
    this.recordProcessor = null;
    this.recordMuteGain = null;
  }

  // --- 5. SP-404 <-> RC-600 Bidirectional Bridge ---

  /**
   * Bounces an RC-600 loop track directly onto an SP-404 pad.
   */
  public bounceTrackToSp404(trackId: number, bank: BankLetter, padId: number) {
    const track = this.getTrack(trackId);
    if (!track || !track.audioBuffer) return;

    sp404AudioEngine.assignBufferToPad(
      bank,
      padId,
      track.audioBuffer,
      `RC600 T${trackId}`,
      track.isOneShot ? 'oneshot' : 'gate',
      0
    );
  }

  /**
   * Loads an SP-404 pad sample directly into an RC-600 loop track.
   */
  public loadSp404PadToTrack(trackId: number, bank: BankLetter, padId: number) {
    const track = this.getTrack(trackId);
    const pad = sp404AudioEngine.getPad(bank, padId);
    if (!track || !pad || !pad.audioBuffer) return;

    track.undoBuffer = track.audioBuffer;
    track.redoBuffer = null;
    track.audioBuffer = pad.audioBuffer;
    track.name = `T${trackId}: ${pad.label || `Pad ${bank}${padId}`}`;
    track.durationSec = pad.audioBuffer.duration;
    if (this.trackLinkEnabled && track.id !== 1 && this.getTrack(1)?.durationSec) {
      track.bars = this.getTrack(1)!.bars;
    } else if (this.trackLinkEnabled && track.id === 1) {
      track.bars = Math.max(1, Math.round((track.durationSec * this.bpm) / 240));
    }
    track.status = 'stopped';
    track.waveform = extractWaveformProfile(pad.audioBuffer, 32);
    this.updateLinkedPlaybackRates();
    this.onStateChange?.();
  }

  /**
   * Directly sets an AudioBuffer onto an RC-600 track.
   */
  public setTrackBuffer(trackId: number, buffer: AudioBuffer, trackName?: string) {
    const track = this.getTrack(trackId);
    if (!track) return;

    track.undoBuffer = track.audioBuffer;
    track.redoBuffer = null;
    track.audioBuffer = buffer;
    if (trackName) track.name = trackName;
    track.durationSec = buffer.duration;
    if (this.trackLinkEnabled && track.id !== 1 && this.getTrack(1)?.durationSec) {
      track.bars = this.getTrack(1)!.bars;
    } else if (this.trackLinkEnabled && track.id === 1) {
      track.bars = Math.max(1, Math.round((track.durationSec * this.bpm) / 240));
    }
    track.status = 'stopped';
    track.waveform = extractWaveformProfile(buffer, 32);
    this.updateLinkedPlaybackRates();
    this.onStateChange?.();
  }

  /**
   * Loads pre-rendered Walls:Devine stem sets directly into Tracks 1..3
   */
  public async loadSongPreset(songIndex: number): Promise<boolean> {
    if (!this.ctx) await this.initAudio();
    if (!this.ctx) return false;

    const songs = [
      { name: '01_Decay', bank: 'A', prefix: 'A' },
      { name: '02_Conviction', bank: 'B', prefix: 'B' },
      { name: '03_Poetry', bank: 'C', prefix: 'C' },
      { name: '04_Gratitude', bank: 'D', prefix: 'D' },
      { name: '05_Stash_Daddy', bank: 'E', prefix: 'E' },
      { name: '06_Joint_Queen', bank: 'F', prefix: 'F' }
    ];

    const song = songs[songIndex - 1] || songs[0];

    try {
      // Fetch full D&B backing track from public/dist audio
      const url = `/audio/walls_devine/${song.prefix}01.WAV`;
      const res = await fetch(url);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(arrayBuf);

        // Assign to Track 1 (Drums & Bass Master Stem)
        this.setTrackBuffer(1, decoded, `${song.name} (D&B Stem)`);

        // If Pad B02 beat drop exists, assign to Track 4
        if (song.prefix === 'B') {
          const dropRes = await fetch(`/audio/walls_devine/B02.WAV`);
          if (dropRes.ok) {
            const dropBuf = await this.ctx.decodeAudioData(await dropRes.arrayBuffer());
            this.setTrackBuffer(4, dropBuf, 'Conviction Beat Drop');
          }
        }
        return true;
      }
    } catch (err) {
      console.warn('Failed to load song preset into RC-600:', err);
    }
    return false;
  }

  private createReversedBuffer(source: AudioBuffer): AudioBuffer {
    if (!this.ctx) return source;
    const reversed = this.ctx.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
    for (let c = 0; c < source.numberOfChannels; c++) {
      const srcData = source.getChannelData(c);
      const destData = reversed.getChannelData(c);
      for (let i = 0; i < source.length; i++) {
        destData[i] = srcData[source.length - 1 - i];
      }
    }
    return reversed;
  }
}

export const rc600AudioEngine = new RC600AudioEngine();
