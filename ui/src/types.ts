export type PedalType = 'delay' | 'filter' | 'drive' | 'ducker' | 'mesa' | 'vox';

export interface PedalParameter {
  name: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export type Parameter = PedalParameter;

export interface PedalInstance {
  id: string;
  type: PedalType;
  category?: 'pedal' | 'amp';
  title: string;
  color: string;
  bypassed: boolean;
  parameters: Record<string, PedalParameter>;
  activeModulationDepth?: number; // 0 to 1 for visual ring pulsing
}

export type MusicalState = 'IDLE' | 'STEADY_GROOVE' | 'BREAKDOWN' | 'BUILD_FILL' | 'DROP';

export interface ReactiveRule {
  id: string;
  triggerType: 'state' | 'sensor';
  triggerTarget: string; // "kick", "snare", "hats", "vocal", "bass", "breakdown", etc.
  targetNodeId: string;
  targetParam: string;
  action: 'snap' | 'ramp' | 'duck';
  targetValue?: number;
  duration?: number;
  depthDb?: number;
}

export interface SensoryChannelInfo {
  id: string;
  label: string;
  type: 'lowpass' | 'bandpass' | 'highpass' | 'broadband';
  frequencyHz: number;
  threshold: number;
  energy: number;
  density: number;
  totalHits: number;
  triggered: boolean;
  color: string;
}

export interface StateTelemetry {
  musicalState: MusicalState;
  sidechainRMS: number;
  bpm: number;
  barNumber: number;
  sensors: SensoryChannelInfo[];
  isPlaying?: boolean;
  ppqPosition?: number;
  peakDb?: number;
  rmsDb?: number;
  timeSigNum?: number;
  timeSigDen?: number;
  lastMidiNote?: number;
  lastMidiVelocity?: number;
  lastMidiChannel?: number;
  totalMidiEvents?: number;
  isMidiActive?: boolean;
  sessionTracks?: AbletonTrackInfo[];
  supercollider?: SuperColliderServerStatus;
  reactiveMidi?: ReactiveMidiTelemetry;
  currentTrackName?: string;
  currentTrackColor?: number;
}

export interface TerminalEntry {
  id: string;
  timestamp: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
}

export interface RackPreset {
  id: string;
  name: string;
  category: 'factory' | 'user';
  description?: string;
  ampPlacement: 'outbound' | 'inbound';
  pedals: {
    id: string;
    type: PedalType;
    title: string;
    color: string;
    bypassed: boolean;
    parameters: Record<string, number>;
  }[];
  createdAt?: string;
}

export type StudioModuleType = 'pedal_board' | 'sp404' | 'state';

export interface StudioPedalBoardModule {
  id: string;
  type: 'pedal_board';
  title: string;
  bypassed: boolean;
  ampPlacement: 'outbound' | 'inbound';
  pedals: PedalInstance[];
}

export interface StudioSP404Module {
  id: string;
  type: 'sp404';
  title: string;
  bypassed: boolean;
}

export interface StudioStateModule {
  id: string;
  type: 'state';
  title: string;
  bypassed: boolean;
}

export type StudioModule = StudioPedalBoardModule | StudioSP404Module | StudioStateModule;

export interface AbletonTrackInfo {
  instanceId: string;
  trackName: string;
  trackIndex: number;
  trackType: 'midi' | 'audio' | 'instrument' | 'return' | 'master';
  midiChannel: number;
  isMidiActive: boolean;
  lastNoteNumber: number;
  lastVelocity: number;
  totalMidiEvents: number;
  heldNotes: number[];
  peakDb: number;
  rmsDb: number;
  isArmed: boolean;
  isSolo?: boolean;
  isMute?: boolean;
  colorHex?: string;
  colorIndex?: number;
  rhythmPattern?: string; // "1/4", "1/8", "1/16", "1/32", "triplet", "half", "syncopated", "idle"
  noteDensity?: number;
  avgIntervalBeats?: number;
  dominantRegister?: number; // 0: Bass, 1: Low-Mid, 2: Mid, 3: High
  activeReactiveRule?: string;
  lastHeartbeatMs?: number;
}

export interface ReactiveMidiRule {
  id: string;
  name: string;
  enabled: boolean;
  sourceTrackFilter: string; // e.g. "bass", "all", or track name
  triggerRhythm: '1/4' | '1/8' | '1/16' | '1/32' | 'triplet' | 'half' | 'syncopated' | 'idle' | 'any';
  actionType: 'arp_1_16' | 'stabs_1_4' | 'arp_1_8' | 'sustained' | 'ratchet_4x' | 'transpose_12' | 'harmony_5th' | 'mute';
  param?: number;
  scOscAddress?: string;
}

export interface ReactiveMidiTelemetry {
  enabled: boolean;
  rhythmPattern: string;
  noteDensity: number;
  avgIntervalBeats: number;
  dominantRegister: number;
  lastActiveRule: string;
  rules: ReactiveMidiRule[];
}

export interface AbletonSceneInfo {
  id: string;
  index: number;
  name: string;
  tempo?: number;
  timeSignature?: string;
  color?: string;
  isCurrent?: boolean;
}

export interface SuperColliderServerStatus {
  isRunning: boolean;
  isBooting: boolean;
  statusText: string;
  port: number;
  pid: number;
  sampleRate: number;
  numSynths: number;
  numGroups: number;
  numNodes: number;
  numUGens: number;
  numSynthDefs: number;
  avgCPU: number;
  peakCPU: number;
  binaryPath: string;
  sclangPath: string;
  /** True when attached to an scsynth that was not launched by the plugin. */
  isExternal: boolean;
  lastError: string;
  serverLog: string;
  /** An sclang process is running the user's visual patch. */
  visualRunning: boolean;
  visualLog: string;
  /** UDP port /state/* OSC is sent to (sclang's langPort). */
  langPort: number;
  oscSent: number;
}


