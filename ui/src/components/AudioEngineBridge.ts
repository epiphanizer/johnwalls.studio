import { MusicalState, PedalInstance, ReactiveRule, SensoryChannelInfo, StateTelemetry } from '../types';
import { getSharedAudioContext } from '../utils/sharedAudioContext';
import { getTelemetryUrl } from '../utils/nativeTransport';

interface LiveSensorDetector {
  id: string;
  filter: BiquadFilterNode;
  analyser: AnalyserNode;
  dataBuffer: Uint8Array;
  fastEnv: number;
  slowEnv: number;
  lastHitTime: number;
  hitsInWindow: number;
}

export class AudioEngineBridge {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;
  private isLiveInputActive: boolean = false;
  private mediaStream: MediaStream | null = null;
  private liveInputSource: MediaStreamAudioSourceNode | null = null;

  private bpm: number = 124;
  private telemetryCallback: ((telemetry: StateTelemetry) => void) | null = null;
  private modulationCallback: ((nodeId: string, depth: number) => void) | null = null;
  private animFrameId: number | null = null;

  // Master & Node Chain
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private duckerGain: GainNode | null = null;

  // Stompbox Sub-Chain Nodes
  private pedalsInGain: GainNode | null = null;
  private pedalsOutGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayFilter: BiquadFilterNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private driveNode: WaveShaperNode | null = null;

  // Dedicated Amplifier & Cab Stage Nodes
  private ampPlacement: 'outbound' | 'inbound' = 'outbound';
  private ampInGain: GainNode | null = null;
  private ampOutGain: GainNode | null = null;
  private ampBypassGain: GainNode | null = null;
  private ampMasterGain: GainNode | null = null;
  private ampPreFilter: BiquadFilterNode | null = null;
  private ampDriveNode: WaveShaperNode | null = null;
  private ampToneFilter: BiquadFilterNode | null = null;
  private ampMidFilter: BiquadFilterNode | null = null;
  private ampPresenceFilter: BiquadFilterNode | null = null;
  private ampCabFilter: BiquadFilterNode | null = null;

  // On-the-Fly Musical State Tracking
  private currentState: MusicalState = 'IDLE';
  private lastKickTimestamp: number = 0;
  private windowStartTimestamp: number = 0;

  // Live Sensory Detectors Bank
  private sensorDetectors: LiveSensorDetector[] = [];
  private sensors: SensoryChannelInfo[] = [
    {
      id: 'kick',
      label: 'Kick Drum',
      type: 'lowpass',
      frequencyHz: 95,
      threshold: 0.18,
      energy: 0,
      density: 0,
      totalHits: 0,
      triggered: false,
      color: 'rose'
    },
    {
      id: 'snare',
      label: 'Snare Drum',
      type: 'bandpass',
      frequencyHz: 1200,
      threshold: 0.14,
      energy: 0,
      density: 0,
      totalHits: 0,
      triggered: false,
      color: 'amber'
    },
    {
      id: 'hats',
      label: 'Hi-Hats',
      type: 'highpass',
      frequencyHz: 6500,
      threshold: 0.08,
      energy: 0,
      density: 0,
      totalHits: 0,
      triggered: false,
      color: 'cyan'
    },
    {
      id: 'bass',
      label: 'Sub Bass',
      type: 'lowpass',
      frequencyHz: 180,
      threshold: 0.15,
      energy: 0,
      density: 0,
      totalHits: 0,
      triggered: false,
      color: 'purple'
    },
    {
      id: 'vocal',
      label: 'Vocal Chops',
      type: 'bandpass',
      frequencyHz: 2400,
      threshold: 0.12,
      energy: 0,
      density: 0,
      totalHits: 0,
      triggered: false,
      color: 'emerald'
    }
  ];

  // Rules
  private rules: ReactiveRule[] = [];

  // Real-time Ableton Live / JUCE Telemetry Bridge
  private juceLiveWaveform: Float32Array = new Float32Array(512);
  private lastJuceTelemetryTime: number = 0;
  private juceIsPlaying: boolean = false;
  private juceBarNumber: number = 1;
  private jucePpq: number = 0;
  private jucePeakDb: number = -96;
  private juceRmsDb: number = -96;
  private lastTelemetryEmitTime: number = 0;
  private lastHostParametersJson: string = '';
  private hostParametersCallback: ((params: Record<string, number | boolean>) => void) | null = null;

  constructor() {
    this.createCurve = this.createCurve.bind(this);
    this.analysisLoop = this.analysisLoop.bind(this);

    // 1. Direct In-Process WebBrowserComponent callback (injected when running inside Ableton)
    (window as any).__onJuceTelemetry = (data: any) => {
      this.handleTelemetryData(data);
    };

    // 2. High-speed local HTTP polling fallback to LocalTelemetryServer (port 3012)
    this.startHostPolling();
  }

  public setHostParametersCallback(cb: (params: Record<string, number | boolean>) => void) {
    this.hostParametersCallback = cb;
  }

  private startHostPolling() {
    const poll = async () => {
      // If direct in-process bridge hasn't emitted within last 150ms, poll local server
      if (performance.now() - this.lastJuceTelemetryTime > 150) {
        try {
          const res = await fetch(getTelemetryUrl('/telemetry'));
          if (res.ok) {
            const data = await res.json();
            this.handleTelemetryData(data);
          }
        } catch {
          // host server inactive or waiting
        }
      }
      setTimeout(poll, 40);
    };
    setTimeout(poll, 200);
  }

  public handleTelemetryData(data: any) {
    if (!data) return;
    this.lastJuceTelemetryTime = performance.now();

    // 1. Real Audio Waveform
    if (data.waveform && Array.isArray(data.waveform)) {
      const len = Math.min(data.waveform.length, 512);
      for (let i = 0; i < len; i++) {
        this.juceLiveWaveform[i] = data.waveform[i];
      }
    }

    // 2. Ableton Live BPM & Transport
    if (typeof data.bpm === 'number' && data.bpm > 20 && data.bpm < 999) {
      this.bpm = Math.round(data.bpm * 10) / 10;
    }
    if (typeof data.isPlaying === 'boolean') {
      this.juceIsPlaying = data.isPlaying;
    }
    if (typeof data.barNumber === 'number') {
      this.juceBarNumber = data.barNumber;
    }
    if (typeof data.ppq === 'number') {
      this.jucePpq = data.ppq;
    }
    if (typeof data.peakDb === 'number') {
      this.jucePeakDb = data.peakDb;
    }
    if (typeof data.rmsDb === 'number') {
      this.juceRmsDb = data.rmsDb;
    }

    // 3. Musical state
    if (data.musicalState) {
      this.currentState = data.musicalState;
    }

    // 4. Sensors
    if (data.sensors && Array.isArray(data.sensors)) {
      for (const remoteSensor of data.sensors) {
        const local = this.sensors.find((s) => s.id === remoteSensor.id);
        if (local) {
          local.energy = remoteSensor.energy;
          local.density = remoteSensor.density;
          local.totalHits = remoteSensor.totalHits;
          local.triggered = remoteSensor.triggered;
        }
      }
    }

    // Emit live telemetry to HUD and top bar (throttled to at most 10Hz to prevent DOM label jitter)
    const now = performance.now();
    if (this.telemetryCallback && now - this.lastTelemetryEmitTime >= 100) {
      this.lastTelemetryEmitTime = now;
      this.telemetryCallback({
        musicalState: this.currentState,
        sidechainRMS: data.sidechainRMS ?? 0,
        bpm: this.bpm,
        barNumber: this.juceBarNumber,
        sensors: [...this.sensors],
        isPlaying: this.juceIsPlaying,
        ppqPosition: this.jucePpq,
        peakDb: this.jucePeakDb,
        rmsDb: this.juceRmsDb,
        timeSigNum: typeof data.timeSigNum === 'number' ? data.timeSigNum : undefined,
        timeSigDen: typeof data.timeSigDen === 'number' ? data.timeSigDen : undefined,
        lastMidiNote: typeof data.lastMidiNote === 'number' ? data.lastMidiNote : undefined,
        lastMidiVelocity: typeof data.lastMidiVelocity === 'number' ? data.lastMidiVelocity : undefined,
        lastMidiChannel: typeof data.lastMidiChannel === 'number' ? data.lastMidiChannel : undefined,
        totalMidiEvents: typeof data.totalMidiEvents === 'number' ? data.totalMidiEvents : undefined,
        isMidiActive: typeof data.isMidiActive === 'boolean' ? data.isMidiActive : undefined,
        sessionTracks: Array.isArray(data.sessionTracks) ? data.sessionTracks : undefined,
        supercollider: data.supercollider,
        reactiveMidi: data.reactiveMidi,
        currentTrackName: typeof data.currentTrackName === 'string' ? data.currentTrackName : undefined,
        currentTrackColor: typeof data.currentTrackColor === 'number' ? data.currentTrackColor : undefined
      });
    }

    // Sync parameters from host automation only when they actually change
    if (data.parameters && this.hostParametersCallback) {
      const paramStr = JSON.stringify(data.parameters);
      if (paramStr !== this.lastHostParametersJson) {
        this.lastHostParametersJson = paramStr;
        this.hostParametersCallback(data.parameters);
      }
    }
  }

  public setTelemetryCallback(cb: (t: StateTelemetry) => void) {
    this.telemetryCallback = cb;
  }

  public setModulationCallback(cb: (nodeId: string, depth: number) => void) {
    this.modulationCallback = cb;
  }

  public setRules(rules: ReactiveRule[]) {
    this.rules = rules;
  }

  public addSensoryChannel(config: {
    id: string;
    label?: string;
    type?: 'lowpass' | 'bandpass' | 'highpass' | 'broadband';
    freq?: number;
    thresh?: number;
    color?: string;
  }) {
    if (this.sensors.some((s) => s.id === config.id)) return false;
    const newSensor: SensoryChannelInfo = {
      id: config.id,
      label: config.label || config.id.toUpperCase(),
      type: config.type || 'bandpass',
      frequencyHz: config.freq || 1500,
      threshold: config.thresh || 0.12,
      energy: 0,
      density: 0,
      totalHits: 0,
      triggered: false,
      color: config.color || 'gold'
    };
    this.sensors.push(newSensor);

    if (this.ctx && this.duckerGain) {
      this.attachSensorDetector(newSensor);
    }
    return true;
  }

  public removeSensoryChannel(id: string): boolean {
    const lenBefore = this.sensors.length;
    this.sensors = this.sensors.filter((s) => s.id !== id);
    this.sensorDetectors = this.sensorDetectors.filter((d) => d.id !== id);
    return this.sensors.length < lenBefore;
  }

  public getSensoryChannels(): SensoryChannelInfo[] {
    return [...this.sensors];
  }

  public setAmpPlacement(placement: 'outbound' | 'inbound') {
    if (this.ampPlacement === placement) return;
    this.ampPlacement = placement;
    if (this.isRunning && this.ctx) {
      this.reconnectSignalChain();
    }
  }

  public getAmpPlacement(): 'outbound' | 'inbound' {
    return this.ampPlacement;
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  private currentSP404Gain: GainNode | null = null;
  private currentSP404Order: 'before' | 'after' = 'after';

  public routeSP404(order: 'before' | 'after', sp404Gain: GainNode | null, bypassed: boolean = false) {
    this.currentSP404Order = order;
    if (sp404Gain) {
      this.currentSP404Gain = sp404Gain;
    }

    // Always inform native C++ VST processor of SP-404 order and bypass
    this.sendToHost(
      'sp404SetRouting',
      { order, bypassed },
      getTelemetryUrl('/sp404/routing')
    );

    if (!this.ctx || !this.currentSP404Gain) return;

    try {
      this.currentSP404Gain.disconnect();
    } catch {}

    try {
      if (order === 'before' && this.pedalsInGain) {
        // SP-404 output runs INTO the pedalboard input!
        if (this.currentSP404Gain.context === this.pedalsInGain.context) {
          this.currentSP404Gain.connect(this.pedalsInGain);
        }
      } else if (this.masterGain) {
        // SP-404 output runs to Master output
        if (this.currentSP404Gain.context === this.masterGain.context) {
          this.currentSP404Gain.connect(this.masterGain);
        }
      }
    } catch (e) {
      console.warn('SP-404 route connection handled safely:', e);
    }
  }

  private reconnectSignalChain() {
    if (
      !this.duckerGain ||
      !this.pedalsInGain ||
      !this.pedalsOutGain ||
      !this.ampInGain ||
      !this.ampOutGain ||
      !this.masterGain
    ) {
      return;
    }

    try {
      this.duckerGain.disconnect();
      this.pedalsOutGain.disconnect();
      this.ampOutGain.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    if (this.ampPlacement === 'inbound') {
      // Inbound: duckerGain -> amp -> pedals -> masterGain
      this.duckerGain.connect(this.ampInGain);
      this.ampOutGain.connect(this.pedalsInGain);
      this.pedalsOutGain.connect(this.masterGain);
    } else {
      // Outbound (default): duckerGain -> pedals -> amp -> masterGain
      this.duckerGain.connect(this.pedalsInGain);
      this.pedalsOutGain.connect(this.ampInGain);
      this.ampOutGain.connect(this.masterGain);
    }

    // Connect to sensory detector bank
    for (const d of this.sensorDetectors) {
      try {
        this.duckerGain.connect(d.filter);
      } catch {
        // already connected
      }
    }

    // Maintain SP-404 routing across chain reconfigurations
    if (this.currentSP404Gain) {
      this.routeSP404(this.currentSP404Order, this.currentSP404Gain);
    }
  }

  /**
   * Initializes the real DSP graph and attempts to bind live audio input on the fly.
   * NO pre-generated audio, NO step sequencer, NO synthetic loops.
   */
  public async startAudio(): Promise<boolean> {
    if (this.isRunning && this.ctx) return true;

    try {
      this.ctx = getSharedAudioContext();
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      const now = this.ctx.currentTime;

      // Master bus
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, now);

      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 512;
      this.masterAnalyser.smoothingTimeConstant = 0.8;

      this.masterGain.connect(this.masterAnalyser);
      // Only route Web Audio to physical destination if running in standalone browser
      const isInsideJuce = Boolean((window as any)?.__JUCE__ || (window as any)?.__onJuceTelemetry);
      if (!isInsideJuce) {
        this.masterAnalyser.connect(this.ctx.destination);
      }

      // Audio input node (from live track audio / microphone / line-in)
      this.duckerGain = this.ctx.createGain();
      this.duckerGain.gain.setValueAtTime(1.0, now);

      // Stompbox Sub-Chain Nodes
      this.pedalsInGain = this.ctx.createGain();
      this.pedalsOutGain = this.ctx.createGain();

      this.driveNode = this.ctx.createWaveShaper();
      this.driveNode.curve = this.createCurve(1.0);
      this.driveNode.oversample = '2x';

      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(1400, now);
      this.filterNode.Q.setValueAtTime(4.0, now);

      this.delayNode = this.ctx.createDelay(4.0);
      this.delayNode.delayTime.setValueAtTime(0.36, now);
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.setValueAtTime(0.45, now);
      this.delayFilter = this.ctx.createBiquadFilter();
      this.delayFilter.type = 'lowpass';
      this.delayFilter.frequency.setValueAtTime(3200, now);

      this.delayNode.connect(this.delayFilter);
      this.delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);

      // Internal stompbox routing
      this.pedalsInGain.connect(this.driveNode);
      this.driveNode.connect(this.filterNode);
      this.filterNode.connect(this.pedalsOutGain);
      this.filterNode.connect(this.delayNode);
      this.delayFilter.connect(this.pedalsOutGain);

      // Dedicated Outbound/Inbound Amplifier & Cab Stage Nodes
      this.ampInGain = this.ctx.createGain();
      this.ampOutGain = this.ctx.createGain();

      this.ampBypassGain = this.ctx.createGain();
      this.ampBypassGain.gain.setValueAtTime(0.0, now);

      this.ampMasterGain = this.ctx.createGain();
      this.ampMasterGain.gain.setValueAtTime(0.70, now);

      this.ampPreFilter = this.ctx.createBiquadFilter();
      this.ampPreFilter.type = 'highpass';
      this.ampPreFilter.frequency.setValueAtTime(80, now);

      this.ampDriveNode = this.ctx.createWaveShaper();
      this.ampDriveNode.curve = this.createMesaCurve(2, 7.5);
      this.ampDriveNode.oversample = '4x';

      this.ampToneFilter = this.ctx.createBiquadFilter();
      this.ampToneFilter.type = 'peaking';
      this.ampToneFilter.frequency.setValueAtTime(80, now);
      this.ampToneFilter.gain.setValueAtTime(3.5, now);

      this.ampMidFilter = this.ctx.createBiquadFilter();
      this.ampMidFilter.type = 'peaking';
      this.ampMidFilter.frequency.setValueAtTime(750, now);
      this.ampMidFilter.gain.setValueAtTime(-5.5, now);
      this.ampMidFilter.Q.setValueAtTime(1.4, now);

      this.ampPresenceFilter = this.ctx.createBiquadFilter();
      this.ampPresenceFilter.type = 'peaking';
      this.ampPresenceFilter.frequency.setValueAtTime(2200, now);
      this.ampPresenceFilter.gain.setValueAtTime(2.0, now);

      this.ampCabFilter = this.ctx.createBiquadFilter();
      this.ampCabFilter.type = 'lowpass';
      this.ampCabFilter.frequency.setValueAtTime(4200, now);
      this.ampCabFilter.Q.setValueAtTime(0.707, now);

      // Amp internal routing
      this.ampInGain.connect(this.ampBypassGain);
      this.ampBypassGain.connect(this.ampOutGain);

      this.ampInGain.connect(this.ampPreFilter);
      this.ampPreFilter.connect(this.ampDriveNode);
      this.ampDriveNode.connect(this.ampToneFilter);
      this.ampToneFilter.connect(this.ampMidFilter);
      this.ampMidFilter.connect(this.ampPresenceFilter);
      this.ampPresenceFilter.connect(this.ampCabFilter);
      this.ampCabFilter.connect(this.ampMasterGain);
      this.ampMasterGain.connect(this.ampOutGain);

      // Setup real-time sensory detector filters bank
      this.sensorDetectors = [];
      for (const s of this.sensors) {
        this.attachSensorDetector(s);
      }

      this.reconnectSignalChain();

      // Connect to Live Audio Input on the fly if user media is accessible
      this.connectLiveAudioStream();

      this.isRunning = true;
      this.windowStartTimestamp = performance.now();
      this.lastKickTimestamp = performance.now();
      this.startAnalysisLoop();

      return true;
    } catch (err) {
      console.warn('AudioEngine initialization notice:', err);
      return false;
    }
  }

  private attachSensorDetector(s: SensoryChannelInfo) {
    if (!this.ctx || !this.duckerGain) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = s.type === 'lowpass' ? 'lowpass' : s.type === 'highpass' ? 'highpass' : 'bandpass';
    filter.frequency.setValueAtTime(s.frequencyHz, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;

    this.duckerGain.connect(filter);
    filter.connect(analyser);

    this.sensorDetectors.push({
      id: s.id,
      filter,
      analyser,
      dataBuffer: new Uint8Array(analyser.frequencyBinCount),
      fastEnv: 0,
      slowEnv: 0,
      lastHitTime: 0,
      hitsInWindow: 0
    });
  }

  /**
   * Connects live physical audio input (microphone, line-in, or virtual audio device) on the fly.
   */
  public async connectLiveAudioStream(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia || !this.ctx || !this.duckerGain) {
      return false;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });

      this.liveInputSource = this.ctx.createMediaStreamSource(this.mediaStream);
      this.liveInputSource.connect(this.duckerGain);
      this.isLiveInputActive = true;
      return true;
    } catch {
      // If permission is denied or no physical mic attached, engine remains armed for DAW injection
      this.isLiveInputActive = false;
      return false;
    }
  }

  public isLiveInputEnabled(): boolean {
    return this.isLiveInputActive;
  }

  public stopAudio() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.currentState = 'IDLE';
    this.emitTelemetry(0);
  }

  /**
   * Real-time live audio analysis loop running on the fly.
   * Extracts energy, detects transients, updates density, and determines musical state
   * strictly from real physical incoming sound waves!
   */
  private startAnalysisLoop() {
    const loop = () => {
      if (!this.isRunning) return;
      this.analysisLoop();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private analysisLoop() {
    if (!this.ctx || !this.masterAnalyser) return;

    const nowMs = performance.now();
    const buffer = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteTimeDomainData(buffer);

    // 1. Calculate overall RMS energy from real buffer
    let sumSquared = 0;
    for (let i = 0; i < buffer.length; i++) {
      const norm = (buffer[i] - 128) / 128;
      sumSquared += norm * norm;
    }
    const currentRMS = Math.sqrt(sumSquared / buffer.length);

    // 2. Process each live sensory detector on the fly
    for (const d of this.sensorDetectors) {
      d.analyser.getByteTimeDomainData(d.dataBuffer as any);

      let bandSum = 0;
      for (let i = 0; i < d.dataBuffer.length; i++) {
        const val = (d.dataBuffer[i] - 128) / 128;
        bandSum += val * val;
      }
      const bandRMS = Math.sqrt(bandSum / d.dataBuffer.length);

      // Fast & slow envelope followers for on-the-fly transient detection
      d.fastEnv += (bandRMS - d.fastEnv) * 0.45;
      d.slowEnv += (bandRMS - d.slowEnv) * 0.05;

      const sensorInfo = this.sensors.find((s) => s.id === d.id);
      if (sensorInfo) {
        sensorInfo.energy = d.fastEnv;
        sensorInfo.triggered = false;

        // Transient hit trigger: fast jump above slow noise floor & threshold
        const timeSinceLastHit = nowMs - d.lastHitTime;
        const minHitDistanceMs = d.id === 'hats' ? 65 : 120;

        if (
          d.fastEnv > sensorInfo.threshold &&
          d.fastEnv > d.slowEnv * 1.35 &&
          timeSinceLastHit >= minHitDistanceMs
        ) {
          d.lastHitTime = nowMs;
          d.hitsInWindow++;
          sensorInfo.triggered = true;
          sensorInfo.totalHits++;

          if (d.id === 'kick') {
            this.lastKickTimestamp = nowMs;
          }

          // Trigger reactive rule modulation on the fly
          this.handleLiveSensorHit(d.id, Math.min(1.0, d.fastEnv * 1.8));
        }
      }
    }

    // 3. Recalculate 2-second rolling density on the fly
    const windowElapsedMs = nowMs - this.windowStartTimestamp;
    if (windowElapsedMs >= 2000) {
      for (const d of this.sensorDetectors) {
        const s = this.sensors.find((sensor) => sensor.id === d.id);
        if (s) {
          s.density = d.hitsInWindow;
        }
        d.hitsInWindow = 0;
      }
      this.windowStartTimestamp = nowMs;

      // Update Musical State strictly from real audio metrics on the fly!
      this.evaluateStateOnTheFly(currentRMS, nowMs);
    }

    this.emitTelemetry(currentRMS);
  }

  /**
   * Evaluates the musical state on the fly from real live incoming audio measurements.
   * NO simulation, NO pre-set modes.
   */
  private evaluateStateOnTheFly(rms: number, nowMs: number) {
    const kickSensor = this.sensors.find((s) => s.id === 'kick');
    const snareSensor = this.sensors.find((s) => s.id === 'snare');
    const kickDensity = kickSensor ? kickSensor.density : 0;
    const snareDensity = snareSensor ? snareSensor.density : 0;
    const timeSinceLastKick = nowMs - this.lastKickTimestamp;

    if (rms < 0.005) {
      // Silence or near-silence
      this.currentState = 'IDLE';
    } else if (snareDensity >= 6) {
      // High-density snare / percussion activity = drum roll or build-up
      this.currentState = 'BUILD_FILL';
    } else if (timeSinceLastKick > 2200 && rms > 0.02) {
      // Kick has stopped playing while other audio is still active = breakdown!
      this.currentState = 'BREAKDOWN';
    } else if ((this.currentState === 'BREAKDOWN' || this.currentState === 'BUILD_FILL') && kickDensity >= 2) {
      // Heavy low-end impact returning after a quiet breakdown or build = drop!
      this.currentState = 'DROP';
    } else if (kickDensity >= 1) {
      // Steady rhythm
      this.currentState = 'STEADY_GROOVE';
    }
  }

  private handleLiveSensorHit(sensorId: string, velocity: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    for (const r of this.rules) {
      if (r.triggerType === 'sensor' && r.triggerTarget.toLowerCase() === sensorId.toLowerCase()) {
        if (r.action === 'duck' && this.duckerGain) {
          const depthDb = r.depthDb ?? 14;
          const targetGain = Math.pow(10, (-depthDb * velocity) / 20);
          this.duckerGain.gain.cancelScheduledValues(now);
          this.duckerGain.gain.setValueAtTime(targetGain, now);
          this.duckerGain.gain.setTargetAtTime(1.0, now + 0.005, 0.08);
        }

        if (this.modulationCallback) {
          this.modulationCallback(r.targetNodeId, 1.0);
          setTimeout(() => {
            if (this.modulationCallback) this.modulationCallback(r.targetNodeId, 0.0);
          }, 85);
        }
      }
    }
  }

  /**
   * Retrieves real live time-domain samples from the plugin's actual audio buffer.
   */
  public getLiveWaveformData(outputArray: Float32Array): boolean {
    // If we have received live audio waveform from Ableton Live within the last 2000ms:
    if (performance.now() - this.lastJuceTelemetryTime < 2000) {
      outputArray.set(this.juceLiveWaveform);
      return true;
    }
    // Otherwise fall back to local Web Audio analyser if active
    if (this.masterAnalyser) {
      this.masterAnalyser.getFloatTimeDomainData(outputArray as any);
      return true;
    }
    outputArray.fill(0);
    return false;
  }

  private sendToHost(eventName: string, payload: any, fallbackHttpUrl?: string, httpBody?: any) {
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

    if (fallbackHttpUrl) {
      fetch(fallbackHttpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(httpBody ?? payload)
      }).catch(() => {});
    }
  }

  public sendParameterToHost(paramId: string, value: number) {
    this.sendToHost('setDspParameter', { id: paramId, value }, getTelemetryUrl('/parameter'), { id: paramId, value });
  }

  public sendInspectNodeToHost(nodeId: string) {
    this.sendToHost('setInspectedNode', { id: nodeId }, getTelemetryUrl('/inspect'), { id: nodeId });
  }

  public syncRackToHost(pedals: PedalInstance[], ampPlacement?: 'outbound' | 'inbound') {
    const payload = {
      ampPlacement: ampPlacement ?? this.ampPlacement,
      pedals: pedals.map((p) => ({
        id: p.id,
        type: p.type,
        bypassed: p.bypassed,
        parameters: Object.entries(p.parameters).reduce((acc, [k, v]) => {
          acc[k] = v.value;
          return acc;
        }, {} as Record<string, number>)
      }))
    };
    this.sendToHost('syncRackState', payload, getTelemetryUrl('/rack'), payload);
  }

  public syncAddPedalToHost(type: string, id: string) {
    this.sendToHost('addPedal', { type, id }, getTelemetryUrl('/pedal/add'), { type, id });
  }

  public syncRemovePedalToHost(pedalId: string) {
    this.sendToHost('removePedal', { id: pedalId }, getTelemetryUrl('/pedal/remove'), { id: pedalId });
  }

  public syncPedalParamToHost(pedalId: string, paramName: string, value: number) {
    const paramMap: Record<string, string> = {
      'mesa_mark3:channel': 'mesa_channel',
      'mesa_mark3:gain': 'mesa_gain',
      'mesa_mark3:leadDrive': 'mesa_lead_drive',
      'mesa_mark3:master': 'mesa_master',
      'mesa_mark3:leadMaster': 'mesa_lead_master',
      'mesa_mark3:pullBright': 'mesa_pull_bright',
      'mesa_mark3:bass': 'mesa_bass',
      'mesa_mark3:pullDeep': 'mesa_pull_deep',
      'mesa_mark3:mid': 'mesa_mid',
      'mesa_mark3:pullShift': 'mesa_pull_shift',
      'mesa_mark3:treble': 'mesa_treble',
      'mesa_mark3:presence': 'mesa_presence',
      'mesa_mark3:eqActive': 'mesa_eq_active',
      'mesa_mark3:eq80': 'mesa_eq80',
      'mesa_mark3:eq240': 'mesa_eq240',
      'mesa_mark3:eq750': 'mesa_eq750',
      'mesa_mark3:eq2200': 'mesa_eq2200',
      'mesa_mark3:eq6600': 'mesa_eq6600',
      'mesa_mark3:simulClass': 'mesa_simul_class',
      'mesa_mark3:cab': 'mesa_cab',

      'vox_ac30:channel': 'vox_channel',
      'vox_ac30:gain': 'vox_gain',
      'vox_ac30:bass': 'vox_bass',
      'vox_ac30:treble': 'vox_treble',
      'vox_ac30:cut': 'vox_cut',
      'vox_ac30:chime': 'vox_chime',
      'vox_ac30:brilliant': 'vox_brilliant',
      'vox_ac30:master': 'vox_master',
      'vox_ac30:cab': 'vox_cab',

      'dub_echo:time': 'delay_time',
      'dub_echo:feedback': 'delay_fb',

      'resonant_filter:cutoff': 'filter_cutoff',

      'sidechain_ducker:depth': 'ducker_depth'
    };

    const key = `${pedalId}:${paramName}`;
    const hostParamId = paramMap[key];
    if (hostParamId) {
      this.sendParameterToHost(hostParamId, value);
    }

    // Always notify C++ pedal rack for dynamic or unmapped parameters
    this.sendToHost('setPedalParameter', { pedalId, paramName, value }, getTelemetryUrl('/pedal/parameter'), { pedalId, paramName, value });
  }

  public syncBypassToHost(pedalId: string, bypassed: boolean) {
    if (pedalId === 'mesa_mark3') {
      this.sendParameterToHost('mesa_bypass', bypassed ? 1.0 : 0.0);
      this.sendParameterToHost('mesa_power', bypassed ? 0.0 : 1.0);
    } else if (pedalId === 'vox_ac30') {
      this.sendParameterToHost('vox_bypass', bypassed ? 1.0 : 0.0);
      this.sendParameterToHost('vox_power', bypassed ? 0.0 : 1.0);
    } else if (pedalId === 'dub_echo') {
      this.sendParameterToHost('delay_bypass', bypassed ? 1.0 : 0.0);
    } else if (pedalId === 'resonant_filter') {
      this.sendParameterToHost('filter_bypass', bypassed ? 1.0 : 0.0);
    } else if (pedalId === 'sidechain_ducker') {
      this.sendParameterToHost('ducker_bypass', bypassed ? 1.0 : 0.0);
    }

    this.sendToHost('setPedalBypassed', { pedalId, bypassed }, getTelemetryUrl('/pedal/bypass'), { pedalId, bypassed });
  }

  public updatePedalParams(pedals: PedalInstance[]) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Stompbox updates
    for (const p of pedals) {
      if (p.type === 'delay' && this.delayNode && this.delayFeedback) {
        if (p.bypassed) {
          this.delayFeedback.gain.setValueAtTime(0, now);
        } else {
          const time = (p.parameters.time?.value ?? 350) * 0.001;
          const fb = p.parameters.feedback?.value ?? 0.45;
          this.delayNode.delayTime.setTargetAtTime(time, now, 0.05);
          this.delayFeedback.gain.setTargetAtTime(fb, now, 0.05);
        }
      }

      if (p.type === 'filter' && this.filterNode) {
        if (p.bypassed) {
          this.filterNode.frequency.setValueAtTime(20000, now);
        } else {
          const cutoff = p.parameters.cutoff?.value ?? 1400;
          const q = (p.parameters.resonance?.value ?? 0.5) * 8.0;
          this.filterNode.frequency.setTargetAtTime(cutoff, now, 0.05);
          this.filterNode.Q.setTargetAtTime(q, now, 0.05);
        }
      }

      if (p.type === 'drive' && this.driveNode) {
        const drive = p.parameters.drive?.value ?? 3.5;
        this.driveNode.curve = p.bypassed ? null : this.createCurve(drive);
      }
    }

    // Amplifier updates
    const activeAmp = pedals.find((p) => (p.type === 'mesa' || p.type === 'vox') && !p.bypassed);
    if (this.ampDriveNode && this.ampBypassGain && this.ampMasterGain) {
      if (!activeAmp) {
        this.ampBypassGain.gain.setTargetAtTime(1.0, now, 0.02);
        this.ampMasterGain.gain.setTargetAtTime(0.0, now, 0.02);
        if (this.ampCabFilter) this.ampCabFilter.frequency.setTargetAtTime(20000, now, 0.02);
      } else {
        this.ampBypassGain.gain.setTargetAtTime(0.0, now, 0.02);
        const masterVal = activeAmp.parameters.master?.value ?? 6.0;
        this.ampMasterGain.gain.setTargetAtTime(masterVal * 0.12, now, 0.02);

        if (activeAmp.type === 'mesa') {
          const ch = Math.round(activeAmp.parameters.channel?.value ?? 2);
          const gain = activeAmp.parameters.gain?.value ?? 7.0;
          this.ampDriveNode.curve = this.createMesaCurve(ch, gain);

          if (this.ampPreFilter) {
            const bassParam = activeAmp.parameters.bass?.value ?? 4.5;
            this.ampPreFilter.frequency.setTargetAtTime(70 + bassParam * 8, now, 0.05);
          }
          if (this.ampToneFilter) {
            this.ampToneFilter.frequency.setValueAtTime(80, now);
            const eq80 = activeAmp.parameters.eq80?.value ?? 3.0;
            this.ampToneFilter.gain.setTargetAtTime(eq80, now, 0.05);
          }
          if (this.ampMidFilter) {
            this.ampMidFilter.frequency.setValueAtTime(750, now);
            const eq750 = activeAmp.parameters.eq750?.value ?? -4.5;
            this.ampMidFilter.gain.setTargetAtTime(eq750, now, 0.05);
          }
          if (this.ampPresenceFilter) {
            this.ampPresenceFilter.type = 'peaking';
            this.ampPresenceFilter.frequency.setValueAtTime(2200, now);
            const eq2200 = activeAmp.parameters.eq2200?.value ?? 2.0;
            const presence = (activeAmp.parameters.presence?.value ?? 6.0) - 5.0;
            this.ampPresenceFilter.gain.setTargetAtTime(eq2200 + presence, now, 0.05);
          }
          if (this.ampCabFilter) {
            const cabOn = (activeAmp.parameters.cab?.value ?? 1.0) > 0.5;
            this.ampCabFilter.frequency.setTargetAtTime(cabOn ? 4200 : 20000, now, 0.05);
          }
        } else if (activeAmp.type === 'vox') {
          const ch = Math.round(activeAmp.parameters.channel?.value ?? 1);
          const gain = activeAmp.parameters.gain?.value ?? 6.0;
          const chime = activeAmp.parameters.chime?.value ?? 6.5;
          this.ampDriveNode.curve = this.createVoxCurve(ch, gain, chime);

          const cut = activeAmp.parameters.cut?.value ?? 4.0;
          const cutFreq = Math.max(3500, 11000 - cut * 750);
          if (this.ampPresenceFilter) {
            this.ampPresenceFilter.type = 'lowpass';
            this.ampPresenceFilter.frequency.setTargetAtTime(cutFreq, now, 0.05);
          }
          if (this.ampToneFilter) {
            this.ampToneFilter.frequency.setValueAtTime(250, now);
            const bass = (activeAmp.parameters.bass?.value ?? 5.5) - 5.0;
            this.ampToneFilter.gain.setTargetAtTime(bass * 1.5, now, 0.05);
          }
          if (this.ampMidFilter) {
            this.ampMidFilter.frequency.setValueAtTime(3500, now);
            const treble = (activeAmp.parameters.treble?.value ?? 7.0) - 5.0;
            this.ampMidFilter.gain.setTargetAtTime(treble * 1.8, now, 0.05);
          }
          if (this.ampCabFilter) {
            const cabOn = (activeAmp.parameters.cab?.value ?? 1.0) > 0.5;
            this.ampCabFilter.frequency.setTargetAtTime(cabOn ? 5200 : 20000, now, 0.05);
          }
        }
      }
    }
  }

  private createCurve(amount: number): any {
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

  private createMesaCurve(channel: number, gainVal: number): any {
    const n = 512;
    const curve = new Float32Array(n);
    const drive =
      channel === 0
        ? 1.5 + gainVal * 0.35
        : channel === 1
        ? 3.8 + gainVal * 0.95
        : 8.5 + gainVal * 2.2;

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      const xDrive = x * drive;

      if (channel === 0) {
        curve[i] = Math.tanh(xDrive) * 0.85;
      } else if (channel === 1) {
        const asym = xDrive > 0 ? Math.tanh(xDrive) : Math.tanh(xDrive * 1.25) * 0.9;
        curve[i] = asym;
      } else {
        const sign = xDrive >= 0 ? 1 : -1;
        const absX = Math.abs(xDrive);
        const sat = sign * (1 - Math.exp(-absX * 0.85)) * 0.95;
        curve[i] = Math.max(-1, Math.min(1, sat + 0.05 * Math.sin(x * Math.PI)));
      }
    }
    return curve;
  }

  private createVoxCurve(channel: number, gainVal: number, chimeVal: number): any {
    const n = 512;
    const curve = new Float32Array(n);
    const drive = channel === 0 ? 2.0 + gainVal * 0.6 : 4.5 + gainVal * 1.4;

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      const xDrive = x * drive;

      if (channel === 0) {
        curve[i] = (2 / Math.PI) * Math.atan(xDrive * 1.25);
      } else {
        const baseSat = Math.tanh(xDrive * 1.1) * 0.82;
        const chimeHarmonic = Math.sin(x * Math.PI * (1.6 + chimeVal * 0.15)) * 0.14;
        curve[i] = Math.max(-1, Math.min(1, baseSat + chimeHarmonic));
      }
    }
    return curve;
  }

  private emitTelemetry(rms: number) {
    const now = performance.now();
    // Do not overwrite live Ableton Live host telemetry if active
    if (now - this.lastJuceTelemetryTime < 500) return;
    if (!this.telemetryCallback || now - this.lastTelemetryEmitTime < 100) return;
    this.lastTelemetryEmitTime = now;
    this.telemetryCallback({
      musicalState: this.currentState,
      sidechainRMS: rms,
      bpm: this.bpm,
      barNumber: 1,
      sensors: [...this.sensors]
    });
  }
}

export const audioEngine = new AudioEngineBridge();
