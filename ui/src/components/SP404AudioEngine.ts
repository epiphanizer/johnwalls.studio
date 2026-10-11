import JSZip from 'jszip';
import { audioBufferToWav, extractWaveformProfile } from '../utils/wavEncoder';
import { generateDefaultSample } from '../utils/sp404DefaultSamples';
import { getSharedAudioContext } from '../utils/sharedAudioContext';
import { getTelemetryUrl, hasJuceNativeHost } from '../utils/nativeTransport';
import {
  getLegacyPadFilename,
  listSP404Libraries,
  loadSP404Library,
  saveSP404Library,
  SP404_LEGACY_BANKS,
  SP404_LEGACY_PROFILE,
  getSP404Profile,
  isSP404HardwareProfile,
  type SP404HardwareProfile,
  type SP404HardwareProfileId,
  type SP404LibraryManifest
} from '../utils/sp404Library';

export type BankLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';
export type MFXType = 'vinyl' | 'djfx' | 'isolator' | 'cassette' | 'filter' | 'pitch';

export interface SP404Pad {
  id: number; // 1 to 12 on the legacy Original / A profile
  bank: BankLetter;
  label: string;
  category: 'kick' | 'snare' | 'hat' | 'perc' | 'vox' | 'sample' | 'bass' | 'fx' | 'custom';
  audioBuffer: AudioBuffer | null;
  waveform: number[];
  duration: number;
  sampleRate: number;
  pitch: number; // Semitones (-24 to +24)
  volume: number; // 0.0 to 1.5
  pan: number; // -1.0 to 1.0
  mode: 'oneshot' | 'gate' | 'loop';
  reverse: boolean;
  muteGroup: number; // 0 = off, 1 = choke group
  isHit: boolean;
  isRecordingTarget?: boolean;
  /** True when the restored native sampler has a sample even if the browser has no audio asset. */
  nativeSampleAvailable?: boolean;
}

export interface NativeSP404PadState {
  bank: number;
  padId: number;
  hasSample: boolean;
  label: string;
  category: string;
  duration: number;
  sampleRate: number;
  pitch: number;
  volume: number;
  pan: number;
  mode: 'oneshot' | 'gate' | 'loop';
  reverse: boolean;
  muteGroup: number;
}

export interface NativeSP404State {
  source: 'native-sp404';
  version: 1;
  volume: number;
  activeMfx: number;
  ctrl1: number;
  ctrl2: number;
  ctrl3: number;
  placement: 'before' | 'after';
  bypassed: boolean;
  chromatic: boolean;
  chromaticRootBank: number;
  chromaticRootPad: number;
  pads: NativeSP404PadState[];
}

export interface SP404TransferProgress {
  transferId: string;
  bank: BankLetter;
  padId: number;
  label: string;
  completedChunks: number;
  totalChunks: number;
  phase: 'starting' | 'transferring' | 'complete' | 'cancelled' | 'error';
}

export interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  padKey: string;
  muteGroup: number;
}

function sendToHost(eventName: string, payload: any, fallbackHttpUrl?: string, httpBody?: any) {
  let handled = false;
  const w = window as any;
  if (typeof w.__JUCE_INVOKE_NATIVE__ === 'function') {
    try {
      handled = Boolean(w.__JUCE_INVOKE_NATIVE__(eventName, payload));
    } catch {}
  }
  if (!handled && w?.__JUCE__?.backend?.emitEvent) {
    try {
      w.__JUCE__.backend.emitEvent(eventName, payload);
      w.__JUCE__.backend.emitEvent('__juce__invoke', {
        name: eventName,
        params: Array.isArray(payload) ? payload : [payload],
        resultId: Date.now()
      });
      handled = true;
    } catch {}
  }

  if (!handled && fallbackHttpUrl) {
    fetch(fallbackHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(httpBody ?? payload)
    }).catch(() => {});
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function nextTransferId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sp404-transfer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class SP404AudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized: boolean = false;

  // Master & MFX nodes
  private masterGain: GainNode | null = null;
  private mfxInputGain: GainNode | null = null;
  private mfxOutputGain: GainNode | null = null;

  // Isolator nodes
  private isoLow: BiquadFilterNode | null = null;
  private isoMid: BiquadFilterNode | null = null;
  private isoHigh: BiquadFilterNode | null = null;
  private isoGainLow: GainNode | null = null;
  private isoGainMid: GainNode | null = null;
  private isoGainHigh: GainNode | null = null;

  // Filter+Drive nodes
  private filterNode: BiquadFilterNode | null = null;
  private driveNode: WaveShaperNode | null = null;

  // Active playing voices
  private activeVoices: Map<string, ActiveVoice[]> = new Map();

  // Legacy SP-404 profile: 10 banks A-J with 12 pads each.
  private banks: Record<BankLetter, SP404Pad[]>;
  private hardwareProfile: SP404HardwareProfile = SP404_LEGACY_PROFILE;

  // Global Sampler Settings
  private globalTranspose: number = 0; // Semitones
  private masterVolume: number = 8.5;
  private activeMFX: MFXType = 'vinyl';
  private ctrl1: number = 6.5;
  private ctrl2: number = 4.0;
  private ctrl3: number = 8.0;
  private isVinyl33: boolean = true;

  // Chromatic Mode State
  private isChromaticMode: boolean = false;
  private chromaticRootPad: { bank: BankLetter; padId: number } = { bank: 'A', padId: 11 };

  // Simultaneous Real-Time Recording & Resampling State
  private isRecording: boolean = false;
  private recordMode: 'ext_in' | 'resample' = 'ext_in';
  private targetRecordBank: BankLetter = 'A';
  private targetRecordPadId: number = 1;
  private recordAudioContext: AudioContext | null = null;
  private recordInputNode: MediaStreamAudioSourceNode | null = null;
  private recordMediaStream: MediaStream | null = null;
  private recordProcessor: ScriptProcessorNode | null = null;
  private recordMuteNode: GainNode | null = null;
  private recordedChunksL: Float32Array[] = [];
  private recordedChunksR: Float32Array[] = [];
  private recordingDurationMs: number = 0;
  private recordTimer: number | null = null;

  // Callbacks
  private onStateChange: (() => void) | null = null;
  private onRecordingProgress: ((elapsedMs: number) => void) | null = null;
  private onNativeState: ((state: NativeSP404State) => void) | null = null;
  private onTransferProgress: ((progress: SP404TransferProgress) => void) | null = null;
  private transferController = new AbortController();
  private hasReceivedNativeState = false;
  private lastNativeStateSignature = '';

  constructor() {
    this.banks = this.createInitialBanks();
    if (typeof window !== 'undefined') {
      window.__JWS_RECEIVE_SP404_NATIVE_STATE__ = (state: unknown) => {
        this.applyNativeState(state);
      };
    }
  }

  public setOnStateChange(cb: () => void) {
    this.onStateChange = cb;
  }

  public setOnRecordingProgress(cb: (elapsedMs: number) => void) {
    this.onRecordingProgress = cb;
  }

  public setOnNativeState(cb: (state: NativeSP404State) => void) {
    this.onNativeState = cb;
    const initialState = typeof window !== 'undefined' ? window.__JWS_SP404_NATIVE_STATE__ : undefined;
    if (initialState) this.applyNativeState(initialState);
  }

  public setOnTransferProgress(cb: (progress: SP404TransferProgress) => void) {
    this.onTransferProgress = cb;
  }

  public hasNativeState(): boolean {
    return typeof window !== 'undefined' && Boolean(window.__JWS_SP404_NATIVE_STATE__);
  }

  private applyNativeState(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const state = value as NativeSP404State;
    if (state.source !== 'native-sp404' || state.version !== 1 || !Array.isArray(state.pads)) return;
    const signature = JSON.stringify(state);
    if (signature === this.lastNativeStateSignature) return;
    this.lastNativeStateSignature = signature;

    this.masterVolume = Number.isFinite(state.volume) ? state.volume : this.masterVolume;
    const nativeMfx = ['vinyl', 'djfx', 'isolator', 'cassette', 'filter', 'pitch'][state.activeMfx] as MFXType | undefined;
    if (nativeMfx) this.activeMFX = nativeMfx;
    this.ctrl1 = Number.isFinite(state.ctrl1) ? state.ctrl1 : this.ctrl1;
    this.ctrl2 = Number.isFinite(state.ctrl2) ? state.ctrl2 : this.ctrl2;
    this.ctrl3 = Number.isFinite(state.ctrl3) ? state.ctrl3 : this.ctrl3;
    this.isChromaticMode = Boolean(state.chromatic);
    this.chromaticRootPad = {
      bank: SP404_LEGACY_BANKS[Math.max(0, Math.min(SP404_LEGACY_BANKS.length - 1, state.chromaticRootBank))],
      padId: Math.max(1, Math.min(SP404_LEGACY_PROFILE.padsPerBank, state.chromaticRootPad))
    };

    for (const nativePad of state.pads) {
      const bank = SP404_LEGACY_BANKS[nativePad.bank];
      const pad = bank ? this.getPad(bank, nativePad.padId) : undefined;
      if (!pad) continue;
      pad.label = nativePad.label || pad.label;
      pad.category = nativePad.category as SP404Pad['category'];
      pad.duration = nativePad.duration;
      pad.sampleRate = nativePad.sampleRate;
      pad.pitch = nativePad.pitch;
      pad.volume = nativePad.volume;
      pad.pan = nativePad.pan;
      pad.mode = nativePad.mode;
      pad.reverse = nativePad.reverse;
      pad.muteGroup = nativePad.muteGroup;
      pad.nativeSampleAvailable = nativePad.hasSample;
      if (!this.hasReceivedNativeState && !nativePad.hasSample) {
        pad.audioBuffer = null;
        pad.waveform = [];
      }
    }
    this.hasReceivedNativeState = true;

    if (this.ctx) {
      this.updateMFXNodes();
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime((this.masterVolume / 10) * 0.85, this.ctx.currentTime, 0.05);
      }
    }
    this.onNativeState?.(state);
    this.onStateChange?.();
  }

  private createInitialBanks(): Record<BankLetter, SP404Pad[]> {
    const letters: BankLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const result = {} as Record<BankLetter, SP404Pad[]>;

    const defaultLabelsBankA = [
      { id: 1, label: 'KICK 01', category: 'kick', type: 'kick' },
      { id: 2, label: 'KICK 808', category: 'kick', type: 'kick' },
      { id: 3, label: 'CLAP CRISP', category: 'snare', type: 'clap' },
      { id: 4, label: 'SNARE 90s', category: 'snare', type: 'snare' },
      { id: 5, label: 'CH CLOSED', category: 'hat', type: 'hat_closed', muteGroup: 1 },
      { id: 6, label: 'OH SIZZLE', category: 'hat', type: 'hat_open', muteGroup: 1 },
      { id: 7, label: 'TAMB SHAKE', category: 'perc', type: 'perc' },
      { id: 8, label: 'RIM CLICK', category: 'perc', type: 'perc' },
      { id: 9, label: 'VOX CHOP A', category: 'vox', type: 'vox' },
      { id: 10, label: 'VOX CHOP B', category: 'vox', type: 'vox' },
      { id: 11, label: 'JAZZ RHODES', category: 'sample', type: 'rhodes' },
      { id: 12, label: 'LOFI CHORD', category: 'sample', type: 'rhodes' },
      { id: 13, label: '808 SUB SLIDE', category: 'bass', type: 'bass' },
      { id: 14, label: 'UPRIGHT BASS', category: 'bass', type: 'bass' },
      { id: 15, label: 'VINYL CRACKLE', category: 'fx', type: 'vinyl' },
      { id: 16, label: 'REVERSE TAPE', category: 'fx', type: 'reverse' }
    ];

    for (const letter of letters) {
      result[letter] = Array.from({ length: SP404_LEGACY_PROFILE.padsPerBank }, (_, idx) => {
        const padId = idx + 1;
        const preset = letter === 'A' ? defaultLabelsBankA[idx] : null;

        return {
          id: padId,
          bank: letter,
          label: preset ? preset.label : `PAD ${letter}${padId.toString().padStart(2, '0')}`,
          category: (preset ? preset.category : 'custom') as any,
          audioBuffer: null,
          waveform: [],
          duration: 0,
          sampleRate: 48000,
          pitch: 0,
          volume: 1.0,
          pan: 0,
          mode: 'oneshot',
          reverse: false,
          muteGroup: preset?.muteGroup ?? 0,
          isHit: false
        };
      });
    }

    return result;
  }

  public getMasterGain(): GainNode | null {
    return this.masterGain;
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public async initAudio(existingContext?: AudioContext): Promise<boolean> {
    if (this.isInitialized && this.ctx) return true;

    try {
      this.ctx = existingContext || getSharedAudioContext();
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      const now = this.ctx.currentTime;

      // Master output
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, now);

      // Only connect to browser physical output when running standalone, not in VST
      const isInsideJuce = Boolean(
        (window as any)?.__JUCE__ ||
        (window as any)?.__onJuceTelemetry ||
        window.__JUCE_INVOKE_NATIVE__
      );
      if (!isInsideJuce) {
        this.masterGain.connect(this.ctx.destination);
      }

      // MFX chain nodes
      this.mfxInputGain = this.ctx.createGain();
      this.mfxOutputGain = this.ctx.createGain();

      // Isolator 3-band kill EQ
      this.isoLow = this.ctx.createBiquadFilter();
      this.isoLow.type = 'lowshelf';
      this.isoLow.frequency.setValueAtTime(280, now);

      this.isoMid = this.ctx.createBiquadFilter();
      this.isoMid.type = 'peaking';
      this.isoMid.frequency.setValueAtTime(1200, now);
      this.isoMid.Q.setValueAtTime(0.8, now);

      this.isoHigh = this.ctx.createBiquadFilter();
      this.isoHigh.type = 'highshelf';
      this.isoHigh.frequency.setValueAtTime(4200, now);

      this.isoGainLow = this.ctx.createGain();
      this.isoGainMid = this.ctx.createGain();
      this.isoGainHigh = this.ctx.createGain();

      // Filter + Drive
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(18000, now);
      this.filterNode.Q.setValueAtTime(3.0, now);

      this.driveNode = this.ctx.createWaveShaper();
      this.driveNode.curve = this.createDistortionCurve(1.0);
      this.driveNode.oversample = '2x';

      // Connect MFX chain
      this.mfxInputGain.connect(this.isoLow);
      this.isoLow.connect(this.isoMid);
      this.isoMid.connect(this.isoHigh);
      this.isoHigh.connect(this.filterNode);
      this.filterNode.connect(this.driveNode);
      this.driveNode.connect(this.mfxOutputGain);
      this.mfxOutputGain.connect(this.masterGain);

      // Synthesize Bank A default audio buffers if not already populated
      this.populateDefaultBankA();

      this.isInitialized = true;
      this.onStateChange?.();
      return true;
    } catch (e) {
      console.warn('SP-404 Audio Engine init warning:', e);
      return false;
    }
  }

  private populateDefaultBankA() {
    // A native project is authoritative. Do not repopulate browser demo
    // samples after the native sampler has hydrated the page.
    if (!this.ctx || this.hasReceivedNativeState) return;
    const bankA = this.banks['A'];

    const types = [
      'kick', 'kick', 'clap', 'snare',
      'hat_closed', 'hat_open', 'perc', 'perc',
      'vox', 'vox', 'rhodes', 'rhodes',
      'bass', 'bass', 'vinyl', 'reverse'
    ];

    for (let i = 0; i < SP404_LEGACY_PROFILE.padsPerBank; i++) {
      if (!bankA[i].audioBuffer) {
        const buffer = generateDefaultSample(this.ctx, types[i]);
        bankA[i].audioBuffer = buffer;
        bankA[i].duration = buffer.duration;
        bankA[i].waveform = extractWaveformProfile(buffer, 32);
      }
    }
  }

  private createDistortionCurve(amount: number): any {
    const k = Math.max(1, amount);
    const n = 256;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // --- Pad Triggering & Transposition ---

  public triggerPad(
    bank: BankLetter,
    padId: number,
    chromaticSemitoneOffset: number = 0,
    velocity: number = 1.0
  ) {
    // If chromatic mode is active, override target sample with the chromatic root pad
    let targetBank = bank;
    let targetPadId = padId;
    let effectivePitch = chromaticSemitoneOffset;

    if (this.isChromaticMode) {
      targetBank = this.chromaticRootPad.bank;
      targetPadId = this.chromaticRootPad.padId;
      // Legacy profile exposes twelve chromatic pads.
      effectivePitch = (padId - 1) - 12;
    }

    // Always notify native C++ VST sampler engine directly for Ableton Live audio output
    sendToHost(
      'sp404TriggerPad',
      {
        bank,
        padId,
        chromaticOffset: effectivePitch,
        velocity: velocity ?? 1.0
      },
      getTelemetryUrl('/sp404/trigger')
    );

    if (!this.ctx) {
      this.initAudio().then(() => this.triggerPad(bank, padId, chromaticSemitoneOffset, velocity));
      return;
    }

    const pad = this.getPad(targetBank, targetPadId);
    if (!pad || !pad.audioBuffer) return;

    // Visual feedback
    this.flashPad(bank, padId);

    // Mute group choke handling (e.g. closed hat chokes open hat)
    if (pad.muteGroup > 0) {
      for (const [key, voices] of this.activeVoices.entries()) {
        const activePadMute = voices[0]?.muteGroup;
        if (activePadMute === pad.muteGroup) {
          voices.forEach((v) => {
            try {
              v.gain.gain.setTargetAtTime(0.001, this.ctx!.currentTime, 0.015);
              v.source.stop(this.ctx!.currentTime + 0.02);
            } catch {}
          });
          this.activeVoices.delete(key);
        }
      }
    }

    // Prepare buffer source
    let sourceBuffer = pad.audioBuffer;
    if (pad.reverse) {
      sourceBuffer = this.createReversedBuffer(pad.audioBuffer);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = sourceBuffer;

    // Pitch & Transpose calculation
    const totalSemitones = this.globalTranspose + pad.pitch + effectivePitch;
    const playbackRate = Math.pow(2, totalSemitones / 12);
    source.playbackRate.setValueAtTime(playbackRate, this.ctx.currentTime);

    if (pad.mode === 'loop') {
      source.loop = true;
    }

    // Voice gain
    const voiceGain = this.ctx.createGain();
    const finalVolume = (pad.volume * velocity) * (this.isChromaticMode ? 0.9 : 1.0);
    voiceGain.gain.setValueAtTime(finalVolume, this.ctx.currentTime);

    // Voice Panner
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pad.pan, this.ctx.currentTime);

    source.connect(voiceGain);
    voiceGain.connect(panner);

    // Route to MFX input
    if (this.mfxInputGain) {
      panner.connect(this.mfxInputGain);
    } else if (this.masterGain) {
      panner.connect(this.masterGain);
    }

    // Voice tracking
    const padKey = `${bank}_${padId}`;
    if (!this.activeVoices.has(padKey)) {
      this.activeVoices.set(padKey, []);
    }
    const voiceObj: ActiveVoice = { source, gain: voiceGain, padKey, muteGroup: pad.muteGroup };
    this.activeVoices.get(padKey)!.push(voiceObj);

    source.onended = () => {
      const arr = this.activeVoices.get(padKey);
      if (arr) {
        const filtered = arr.filter((v) => v !== voiceObj);
        if (filtered.length > 0) {
          this.activeVoices.set(padKey, filtered);
        } else {
          this.activeVoices.delete(padKey);
        }
      }
    };

    source.start(this.ctx.currentTime);
  }

  public releasePad(bank: BankLetter, padId: number) {
    sendToHost(
      'sp404ReleasePad',
      { bank, padId },
      getTelemetryUrl('/sp404/release')
    );

    if (!this.ctx) return;
    const pad = this.getPad(bank, padId);
    if (!pad) return;

    if (pad.mode === 'gate') {
      const padKey = `${bank}_${padId}`;
      const voices = this.activeVoices.get(padKey);
      if (voices) {
        voices.forEach((v) => {
          try {
            v.gain.gain.setTargetAtTime(0.001, this.ctx!.currentTime, 0.03);
            v.source.stop(this.ctx!.currentTime + 0.04);
          } catch {}
        });
        this.activeVoices.delete(padKey);
      }
    }
  }

  public stopAllPads() {
    sendToHost(
      'sp404StopAll',
      {},
      getTelemetryUrl('/sp404/stop_all')
    );
    sendToHost(
      'sp404SetParam',
      { param: 'stop_all', value: 1.0 },
      getTelemetryUrl('/sp404/param')
    );

    if (!this.ctx) return;
    for (const [key, voices] of this.activeVoices.entries()) {
      voices.forEach((v) => {
        try {
          v.gain.gain.setValueAtTime(0, this.ctx!.currentTime);
          v.source.stop();
        } catch {}
      });
    }
    this.activeVoices.clear();
  }

  private createReversedBuffer(src: AudioBuffer): AudioBuffer {
    if (!this.ctx) return src;
    const rev = this.ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    for (let c = 0; c < src.numberOfChannels; c++) {
      const srcData = src.getChannelData(c);
      const revData = rev.getChannelData(c);
      for (let i = 0; i < src.length; i++) {
        revData[i] = srcData[src.length - 1 - i];
      }
    }
    return rev;
  }

  private flashPad(bank: BankLetter, padId: number) {
    const pad = this.getPad(bank, padId);
    if (pad) {
      pad.isHit = true;
      this.onStateChange?.();
      setTimeout(() => {
        pad.isHit = false;
        this.onStateChange?.();
      }, 120);
    }
  }

  // --- Real-Time Simultaneous Recording & Resampling ---

  /**
   * Starts real-time recording from Ableton live input or Resample master
   * WITHOUT interrupting pad playback!
   */
  public async startRecording(
    targetBank: BankLetter,
    targetPadId: number,
    mode: 'ext_in' | 'resample' = 'ext_in'
  ): Promise<boolean> {
    if (this.isRecording) return false;
    await this.initAudio();

    this.targetRecordBank = targetBank;
    this.targetRecordPadId = targetPadId;
    this.recordMode = mode;
    this.recordedChunksL = [];
    this.recordedChunksR = [];
    this.recordingDurationMs = 0;

    const pad = this.getPad(targetBank, targetPadId);
    if (pad) {
      pad.isRecordingTarget = true;
      this.onStateChange?.();
    }

    try {
      const sampleRate = this.ctx?.sampleRate || 48000;
      this.recordProcessor = this.ctx!.createScriptProcessor(4096, 2, 2);

      this.recordProcessor.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const inputL = e.inputBuffer.getChannelData(0);
        const inputR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inputL;

        this.recordedChunksL.push(new Float32Array(inputL));
        this.recordedChunksR.push(new Float32Array(inputR));
      };

      // Create silent destination sink node so onaudioprocess ticks without speaker output/feedback
      this.recordMuteNode = this.ctx!.createGain();
      this.recordMuteNode.gain.setValueAtTime(0, this.ctx!.currentTime);
      this.recordProcessor.connect(this.recordMuteNode);
      this.recordMuteNode.connect(this.ctx!.destination);

      if (mode === 'resample') {
        // Tap straight from master sampler output
        this.masterGain?.connect(this.recordProcessor);
      } else {
        // Capture live physical / virtual line input from Ableton or user media
        try {
          if (!this.recordMediaStream) {
            this.recordMediaStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              },
              video: false
            });
          }
          this.recordInputNode = this.ctx!.createMediaStreamSource(this.recordMediaStream);
          this.recordInputNode.connect(this.recordProcessor);
        } catch (streamErr) {
          console.warn('Microphone permission fallback: tapping internal audio bus', streamErr);
          this.masterGain?.connect(this.recordProcessor);
        }
      }

      this.isRecording = true;
      const startTime = performance.now();
      this.recordTimer = window.setInterval(() => {
        this.recordingDurationMs = Math.round(performance.now() - startTime);
        this.onRecordingProgress?.(this.recordingDurationMs);
      }, 50);

      this.onStateChange?.();
      return true;
    } catch (err) {
      console.error('Failed to start sampler recording:', err);
      this.isRecording = false;
      return false;
    }
  }

  /**
   * Finalizes the recording, creates an AudioBuffer, and maps it to the target pad.
   */
  public stopRecording(): AudioBuffer | null {
    if (!this.isRecording) return null;

    this.isRecording = false;
    if (this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }

    try {
      if (this.recordProcessor) {
        this.recordProcessor.onaudioprocess = null;
        this.recordProcessor.disconnect();
        this.recordProcessor = null;
      }
    } catch {}

    try {
      if (this.recordMuteNode) {
        this.recordMuteNode.disconnect();
        this.recordMuteNode = null;
      }
    } catch {}

    try {
      if (this.recordInputNode) {
        this.recordInputNode.disconnect();
        this.recordInputNode = null;
      }
    } catch {}

    try {
      if (this.recordMediaStream) {
        this.recordMediaStream.getTracks().forEach((track) => track.stop());
        this.recordMediaStream = null;
      }
    } catch {}

    if (!this.ctx) return null;

    // Assemble Float32Arrays into a single AudioBuffer
    const totalSamples = this.recordedChunksL.reduce((acc, c) => acc + c.length, 0);
    if (totalSamples === 0) {
      const pad = this.getPad(this.targetRecordBank, this.targetRecordPadId);
      if (pad) pad.isRecordingTarget = false;
      this.onStateChange?.();
      return null;
    }

    const sampleRate = this.ctx.sampleRate;
    const finalBuffer = this.ctx.createBuffer(2, totalSamples, sampleRate);
    const outL = finalBuffer.getChannelData(0);
    const outR = finalBuffer.getChannelData(1);

    let offset = 0;
    for (let chunkIdx = 0; chunkIdx < this.recordedChunksL.length; chunkIdx++) {
      const cL = this.recordedChunksL[chunkIdx];
      const cR = this.recordedChunksR[chunkIdx];
      outL.set(cL, offset);
      outR.set(cR, offset);
      offset += cL.length;
    }

    // Assign to target pad
    const pad = this.getPad(this.targetRecordBank, this.targetRecordPadId);
    if (pad) {
      pad.audioBuffer = finalBuffer;
      pad.duration = finalBuffer.duration;
      pad.waveform = extractWaveformProfile(finalBuffer, 32);
      pad.label = `${this.recordMode === 'resample' ? 'RESAMPLE' : 'REC'} ${this.targetRecordBank}${this.targetRecordPadId}`;
      pad.category = 'sample';
      pad.isRecordingTarget = false;
      void this.syncPadToHost(this.targetRecordBank, pad);
    }

    this.onStateChange?.();
    return finalBuffer;
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  // --- SD Card & Memory Card Import / Export ---

  /**
   * Imports files from an SD Card or drag-and-drop batch.
   * Recognizes legacy Roland SP-404/SP-404A names such as A_01.WAV and
   * A_01.AIF, plus compact A01.WAV names from user libraries.
   */
  public async importFromCardFiles(files: FileList | File[]): Promise<{ loadedCount: number }> {
    await this.initAudio();
    if (!this.ctx) return { loadedCount: 0 };

    let count = 0;
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const name = file.name.toUpperCase();
      if (!name.endsWith('.WAV') && !name.endsWith('.AIFF') && !name.endsWith('.MP3') && !name.endsWith('.OGG')) {
        continue;
      }

      // Accept both user-library names (A_01.WAV) and Roland card names
      // (A0000001.WAV / A0000012.WAV). Card imports are ordered by filename.
      const match = name.match(/^(?:SMPL_)?([A-J])[_-]?0*([0-9]{1,2})\.(WAV|AIFF|AIF)$/i);
      let targetBank: BankLetter = 'A';
      let targetPadId = 1;

      if (match) {
        targetBank = match[1].toUpperCase() as BankLetter;
        targetPadId = parseInt(match[2], 10);
      } else {
        // Find next empty pad in current active bank
        const emptyPad = this.findFirstEmptyPad(12);
        if (emptyPad) {
          targetBank = emptyPad.bank;
          targetPadId = emptyPad.id;
        } else {
          continue; // All slots full
        }
      }

      if (targetPadId < 1 || targetPadId > this.hardwareProfile.padsPerBank) continue;

      try {
        const arrayBuf = await file.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(arrayBuf);

        const pad = this.getPad(targetBank, targetPadId);
        if (pad) {
          pad.audioBuffer = decoded;
          pad.duration = decoded.duration;
          pad.waveform = extractWaveformProfile(decoded, 32);
          pad.label = file.name.replace(/\.[^/.]+$/, '').slice(0, 14);
          await this.syncPadToHost(targetBank, pad);
          count++;
        }
      } catch (err) {
        console.warn(`Failed to decode sample ${file.name}:`, err);
      }
    }

    this.onStateChange?.();
    return { loadedCount: count };
  }

  /**
   * Packages card-import files for one legacy hardware profile. The hardware
   * card must already be formatted by the device; each bank is isolated so a
   * user can copy one batch at a time and choose its destination pad on-device.
   */
  public async exportToCardZip(profile?: SP404HardwareProfile): Promise<Blob> {
    const targetProfile = profile ?? this.hardwareProfile;
    const zip = new JSZip();
    const importBanks = zip.folder('IMPORT_BANKS');
    const letters = SP404_LEGACY_BANKS;
    let manifestText = `=== ${targetProfile.label} IMPORT PACKAGE ===\nGenerated by johnwalls.studio\n\n`;
    const cardInstructions = targetProfile.cardLayout === 'roland-import'
      ? `Copy the contents of one IMPORT_BANKS/BANK_X/ROLAND/IMPORT folder into the formatted card's /ROLAND/IMPORT folder. On the SP-404A, run IMPORT, select the target bank and starting pad, then confirm. The SP-404A imports files in filename order.`
      : `Copy the contents of one IMPORT_BANKS/BANK_X/FUGUEFAT folder into the root FUGUEFAT volume of a CompactFlash card formatted by the SP-404 Original. On the unit, choose the target bank and starting pad, then confirm the import.`;

    for (const bank of letters) {
      const pads = this.banks[bank];
      const bankFolder = importBanks?.folder(`BANK_${bank}`);
      const destinationFolder = targetProfile.cardLayout === 'roland-import'
        ? bankFolder?.folder('ROLAND/IMPORT')
        : bankFolder?.folder('FUGUEFAT');
      for (const pad of pads.slice(0, targetProfile.padsPerBank)) {
        if (pad.audioBuffer && destinationFolder) {
          const fileName = getLegacyPadFilename(bank, pad.id, targetProfile.audioExtension);
          const audioBlob = audioBufferToWav(pad.audioBuffer, targetProfile.sampleRate);
          destinationFolder.file(fileName, audioBlob);
          manifestText += `Bank ${bank} Pad ${pad.id.toString().padStart(2, '0')} -> ${fileName} (${pad.label}, ${pad.duration.toFixed(2)}s)\n`;
        }
      }
    }

    zip.file('README_SP404_IMPORT.txt', `${manifestText}\n${cardInstructions}\nThis is a sample-import package, not a proprietary full-card backup. Existing samples at the destination may be overwritten.\n`);
    return await zip.generateAsync({ type: 'blob' });
  }

  public setHardwareProfile(profileId: SP404HardwareProfileId) {
    this.hardwareProfile = getSP404Profile(profileId);
  }

  public getHardwareProfile(): SP404HardwareProfile {
    return this.hardwareProfile;
  }

  private async syncPadToHost(bank: BankLetter, pad: SP404Pad): Promise<void> {
    if (!hasJuceNativeHost() || !pad.audioBuffer) return;
    const controller = this.transferController;
    const transferId = nextTransferId();
    const chunkSize = 96 * 1024;
    try {
      const wavBase64 = await blobToBase64(audioBufferToWav(pad.audioBuffer, this.hardwareProfile.sampleRate));
      const totalChunks = Math.max(1, Math.ceil(wavBase64.length / chunkSize));
      const metadata = {
        transferId,
        bank: SP404_LEGACY_BANKS.indexOf(bank),
        padId: pad.id,
        label: pad.label,
        totalBytes: wavBase64.length,
        totalChunks,
        pitch: pad.pitch,
        volume: pad.volume,
        pan: pad.pan,
        loop: pad.mode === 'loop',
        reverse: pad.reverse,
        muteGroup: pad.muteGroup
      };

      sendToHost('sp404LoadSampleBegin', metadata);
      this.onTransferProgress?.({
        transferId,
        bank,
        padId: pad.id,
        label: pad.label,
        completedChunks: 0,
        totalChunks,
        phase: 'starting'
      });

      for (let index = 0; index < totalChunks; index += 1) {
        if (controller.signal.aborted) {
          sendToHost('sp404CancelSampleTransfer', { transferId });
          this.onTransferProgress?.({ transferId, bank, padId: pad.id, label: pad.label, completedChunks: index, totalChunks, phase: 'cancelled' });
          return;
        }
        sendToHost('sp404LoadSampleChunk', {
          transferId,
          index,
          data: wavBase64.slice(index * chunkSize, (index + 1) * chunkSize)
        });
        this.onTransferProgress?.({ transferId, bank, padId: pad.id, label: pad.label, completedChunks: index + 1, totalChunks, phase: 'transferring' });
        // Yield between chunks so a large set does not monopolize the WebView.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      if (controller.signal.aborted) {
        sendToHost('sp404CancelSampleTransfer', { transferId });
        this.onTransferProgress?.({ transferId, bank, padId: pad.id, label: pad.label, completedChunks: totalChunks, totalChunks, phase: 'cancelled' });
        return;
      }

      sendToHost('sp404LoadSampleEnd', { transferId });
      pad.nativeSampleAvailable = true;
      this.onTransferProgress?.({ transferId, bank, padId: pad.id, label: pad.label, completedChunks: totalChunks, totalChunks, phase: 'complete' });
    } catch (err) {
      this.onTransferProgress?.({ transferId, bank, padId: pad.id, label: pad.label, completedChunks: 0, totalChunks: 0, phase: 'error' });
      console.warn(`Could not sync SP-404 pad ${bank}${pad.id} to native sampler:`, err);
    }
  }

  public cancelSampleTransfers() {
    this.transferController.abort();
    this.transferController = new AbortController();
    if (hasJuceNativeHost()) sendToHost('sp404CancelSampleTransfer', {});
  }

  private clearNativeSamples() {
    this.cancelSampleTransfers();
    if (hasJuceNativeHost()) {
      sendToHost('sp404ClearSamples', {});
    }
  }

  public async saveLibrary(name: string, profile: SP404HardwareProfile = this.hardwareProfile): Promise<SP404LibraryManifest> {
    const now = new Date().toISOString();
    const manifest: SP404LibraryManifest = {
      format: 'johnwalls-sp404-library',
      version: 2,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `set-${Date.now()}`,
      name: name.trim() || 'Untitled SP-404 Set',
      createdAt: now,
      updatedAt: now,
      hardware: profile,
      pads: [],
      settings: {
        volume: this.masterVolume,
        activeMFX: this.activeMFX,
        ctrl1: this.ctrl1,
        ctrl2: this.ctrl2,
        ctrl3: this.ctrl3,
        globalTranspose: this.globalTranspose,
        isChromaticMode: this.isChromaticMode,
        chromaticRootPad: this.chromaticRootPad
      }
    };
    const assets: Record<string, Blob> = {};

    for (const bank of SP404_LEGACY_BANKS) {
      for (const pad of this.banks[bank].slice(0, profile.padsPerBank)) {
        const audioFile = pad.audioBuffer ? `audio/${getLegacyPadFilename(bank, pad.id)}` : null;
        if (pad.audioBuffer && audioFile) {
          assets[audioFile] = audioBufferToWav(pad.audioBuffer, profile.sampleRate);
        }
        manifest.pads.push({
          bank,
          padId: pad.id,
          label: pad.label,
          category: pad.category,
          audioFile,
          duration: pad.duration,
          sourceSampleRate: pad.sampleRate,
          pitch: pad.pitch,
          volume: pad.volume,
          pan: pad.pan,
          mode: pad.mode,
          reverse: pad.reverse,
          muteGroup: pad.muteGroup
        });
      }
    }

    await saveSP404Library({ manifest, assets });
    return manifest;
  }

  public async listLibraries(): Promise<SP404LibraryManifest[]> {
    return listSP404Libraries();
  }

  public async exportLibraryPackage(name: string, profile: SP404HardwareProfile = this.hardwareProfile): Promise<Blob> {
    const manifest = await this.saveLibrary(name, profile);
    const stored = await loadSP404Library(manifest.id);
    if (!stored) throw new Error('Saved SP-404 set could not be reopened for export.');

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(stored.manifest, null, 2));
    for (const [path, asset] of Object.entries(stored.assets)) {
      zip.file(path, asset);
    }
    return zip.generateAsync({ type: 'blob' });
  }

  public async importLibraryPackage(file: File): Promise<SP404LibraryManifest> {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const manifestEntry = zip.file('manifest.json');
    if (!manifestEntry) throw new Error('This file is not a johnwalls.studio SP-404 library.');

    const rawManifest = JSON.parse(await manifestEntry.async('text')) as Partial<SP404LibraryManifest>;
    if (rawManifest.format !== 'johnwalls-sp404-library' || (rawManifest.version !== 1 && rawManifest.version !== 2)) {
      throw new Error('Unsupported SP-404 library format.');
    }
    const hardwareId = rawManifest.hardware?.id;
    if (!hardwareId || !isSP404HardwareProfile(rawManifest.hardware)) {
      throw new Error('This library targets a different SP-404 hardware profile.');
    }
    const manifest = {
      ...rawManifest,
      version: 2,
      hardware: getSP404Profile(hardwareId)
    } as SP404LibraryManifest;

    const assets: Record<string, Blob> = {};
    for (const item of manifest.pads) {
      if (!item.audioFile) continue;
      const entry = zip.file(item.audioFile);
      if (entry) {
        assets[item.audioFile] = await entry.async('blob');
      }
    }
    await saveSP404Library({ manifest, assets });
    await this.loadLibrary(manifest.id);
    return manifest;
  }

  public async loadLibrary(id: string): Promise<boolean> {
    const stored = await loadSP404Library(id);
    if (!stored || !isSP404HardwareProfile(stored.manifest.hardware)) return false;
    this.hardwareProfile = getSP404Profile(stored.manifest.hardware.id);
    await this.initAudio();
    this.clearNativeSamples();

    for (const item of stored.manifest.pads) {
      const pad = this.getPad(item.bank, item.padId);
      if (!pad) continue;
      pad.label = item.label;
      pad.category = item.category as SP404Pad['category'];
      pad.pitch = item.pitch;
      pad.volume = item.volume;
      pad.pan = item.pan;
      pad.mode = item.mode;
      pad.reverse = item.reverse;
      pad.muteGroup = item.muteGroup;
      const audioBlob = item.audioFile ? stored.assets[item.audioFile] : undefined;
      if (audioBlob && this.ctx) {
        pad.audioBuffer = await this.ctx.decodeAudioData(await audioBlob.arrayBuffer());
        pad.duration = pad.audioBuffer.duration;
        pad.sampleRate = pad.audioBuffer.sampleRate;
        pad.waveform = extractWaveformProfile(pad.audioBuffer, 32);
        await this.syncPadToHost(item.bank, pad);
      } else {
        pad.audioBuffer = null;
        pad.duration = 0;
        pad.waveform = [];
      }
    }

    const settings = stored.manifest.settings;
    this.setVolume(settings.volume);
    this.setMFXType(settings.activeMFX as MFXType);
    this.setCtrl1(settings.ctrl1);
    this.setCtrl2(settings.ctrl2);
    this.setCtrl3(settings.ctrl3);
    this.setGlobalTranspose(settings.globalTranspose);
    this.setChromaticMode(settings.isChromaticMode, settings.chromaticRootPad.bank, settings.chromaticRootPad.padId);
    this.onStateChange?.();
    return true;
  }

  private findFirstEmptyPad(padsPerBank: number = SP404_LEGACY_PROFILE.padsPerBank): { bank: BankLetter; id: number } | null {
    const letters: BankLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    for (const b of letters) {
      for (const p of this.banks[b].slice(0, padsPerBank)) {
        if (!p.audioBuffer) return { bank: b, id: p.id };
      }
    }
    return null;
  }

  // --- MFX Engine Controls & Volume ---

  public setVolume(val: number) {
    this.masterVolume = Math.max(0, Math.min(10, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime((this.masterVolume / 10) * 0.85, this.ctx.currentTime, 0.05);
    }
    sendToHost(
      'sp404SetParam',
      { param: 'volume', value: val },
      getTelemetryUrl('/sp404/param')
    );
  }

  public setMFXType(type: MFXType) {
    this.activeMFX = type;
    this.updateMFXNodes();
    const mfxIdx = type === 'vinyl' ? 0 : type === 'djfx' ? 1 : type === 'isolator' ? 2 : type === 'cassette' ? 3 : type === 'filter' ? 4 : 5;
    sendToHost(
      'sp404SetParam',
      { param: 'mfx', value: mfxIdx },
      getTelemetryUrl('/sp404/param')
    );
    this.onStateChange?.();
  }

  public setCtrl1(val: number) {
    this.ctrl1 = val;
    this.updateMFXNodes();
    sendToHost('sp404SetParam', { param: 'ctrl1', value: val }, getTelemetryUrl('/sp404/param'));
  }

  public setCtrl2(val: number) {
    this.ctrl2 = val;
    this.updateMFXNodes();
    sendToHost('sp404SetParam', { param: 'ctrl2', value: val }, getTelemetryUrl('/sp404/param'));
  }

  public setCtrl3(val: number) {
    this.ctrl3 = val;
    this.updateMFXNodes();
    sendToHost('sp404SetParam', { param: 'ctrl3', value: val }, getTelemetryUrl('/sp404/param'));
  }

  public setVinylRpm(is33: boolean) {
    this.isVinyl33 = is33;
    this.updateMFXNodes();
    this.onStateChange?.();
  }

  public setGlobalTranspose(semitones: number) {
    this.globalTranspose = Math.max(-24, Math.min(24, semitones));
    this.onStateChange?.();
  }

  public getGlobalTranspose(): number {
    return this.globalTranspose;
  }

  public setChromaticMode(enabled: boolean, rootBank?: BankLetter, rootPadId?: number) {
    this.isChromaticMode = enabled;
    if (rootBank && rootPadId) {
      this.chromaticRootPad = { bank: rootBank, padId: rootPadId };
    }
    sendToHost(
      'sp404SetParam',
      { param: 'chromatic', value: enabled ? 1.0 : 0.0 },
      getTelemetryUrl('/sp404/param')
    );
    this.onStateChange?.();
  }

  public getIsChromaticMode(): boolean {
    return this.isChromaticMode;
  }

  public getChromaticRootPad(): { bank: BankLetter; padId: number } {
    return this.chromaticRootPad;
  }

  private updateMFXNodes() {
    if (!this.ctx || !this.filterNode || !this.driveNode) return;
    const now = this.ctx.currentTime;

    if (this.activeMFX === 'vinyl') {
      // Vinyl Sim: Ctrl 1 = Flutter, Ctrl 2 = Crackle/Noise, Ctrl 3 = Low-pass filter
      const cutoff = this.isVinyl33 ? 6500 : 9200;
      this.filterNode.frequency.setTargetAtTime(cutoff, now, 0.05);
      this.filterNode.Q.setTargetAtTime(1.5, now, 0.05);
      this.driveNode.curve = this.createDistortionCurve(1.0 + (this.ctrl3 / 10) * 1.5);
    } else if (this.activeMFX === 'filter') {
      // Filter+Drive: Ctrl 1 = Cutoff, Ctrl 2 = Res, Ctrl 3 = Drive
      const cutoff = 60 + Math.pow(this.ctrl1 / 10, 2) * 19000;
      const q = (this.ctrl2 / 10) * 12;
      this.filterNode.frequency.setTargetAtTime(cutoff, now, 0.05);
      this.filterNode.Q.setTargetAtTime(q, now, 0.05);
      this.driveNode.curve = this.createDistortionCurve(1.0 + (this.ctrl3 / 10) * 8.0);
    } else if (this.activeMFX === 'isolator') {
      // Isolator: Ctrl 1 = Low Kill, Ctrl 2 = Mid Kill, Ctrl 3 = High Kill
      if (this.isoLow && this.isoMid && this.isoHigh) {
        const lowGain = (this.ctrl1 - 5) * 4;
        const midGain = (this.ctrl2 - 5) * 4;
        const highGain = (this.ctrl3 - 5) * 4;
        this.isoLow.gain.setTargetAtTime(lowGain, now, 0.05);
        this.isoMid.gain.setTargetAtTime(midGain, now, 0.05);
        this.isoHigh.gain.setTargetAtTime(highGain, now, 0.05);
      }
    } else {
      this.filterNode.frequency.setTargetAtTime(20000, now, 0.05);
      this.driveNode.curve = this.createDistortionCurve(1.0);
    }
  }

  // --- Getters & Accessors ---

  public getPad(bank: BankLetter, padId: number): SP404Pad | undefined {
    return this.banks[bank]?.find((p) => p.id === padId);
  }

  public getBank(bank: BankLetter): SP404Pad[] {
    return this.banks[bank] || [];
  }

  public updatePad(bank: BankLetter, padId: number, updates: Partial<SP404Pad>) {
    const pad = this.getPad(bank, padId);
    if (pad) {
      Object.assign(pad, updates);
      this.onStateChange?.();
    }
  }

  public clearPad(bank: BankLetter, padId: number) {
    const pad = this.getPad(bank, padId);
    if (pad) {
      pad.audioBuffer = null;
      pad.waveform = [];
      pad.duration = 0;
      pad.label = `PAD ${bank}${padId.toString().padStart(2, '0')}`;
      this.onStateChange?.();
    }
  }
}

export const sp404AudioEngine = new SP404AudioEngine();
