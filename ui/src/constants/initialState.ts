import { PedalInstance, ReactiveRule, StudioModule } from '../types';

export const INITIAL_PEDALS: PedalInstance[] = [
  {
    id: 'dub_echo',
    type: 'delay',
    title: 'Dub Tape Echo',
    color: 'amber',
    bypassed: false,
    parameters: {
      time: { name: 'time', label: 'Time', value: 360, min: 20, max: 1200, step: 10, unit: 'ms' },
      sync: { name: 'sync', label: 'Sync', value: 1, min: 0, max: 1, step: 1, unit: '' },
      division: { name: 'division', label: 'Division', value: 7, min: 0, max: 13, step: 1, unit: '' },
      feedback: { name: 'feedback', label: 'Repeat', value: 0.45, min: 0.0, max: 0.95, step: 0.01, unit: '' },
      mix: { name: 'mix', label: 'Wet Mix', value: 0.50, min: 0.0, max: 1.0, step: 0.01, unit: '' },
      flutter: { name: 'flutter', label: 'Flutter', value: 0.20, min: 0.0, max: 1.0, step: 0.01, unit: '' }
    }
  },
  {
    id: 'resonant_filter',
    type: 'filter',
    title: 'Moog Ladder 24',
    color: 'crimson',
    bypassed: false,
    parameters: {
      cutoff: { name: 'cutoff', label: 'Cutoff', value: 1400, min: 60, max: 20000, step: 50, unit: 'Hz' },
      resonance: { name: 'resonance', label: 'Peak Q', value: 0.65, min: 0.0, max: 0.98, step: 0.01, unit: '' },
      drive: { name: 'drive', label: 'Drive', value: 1.5, min: 1.0, max: 5.0, step: 0.1, unit: 'x' }
    }
  },
  {
    id: 'sidechain_ducker',
    type: 'ducker',
    title: 'Reactive Ducker',
    color: 'cyan',
    bypassed: false,
    parameters: {
      depth: { name: 'depth', label: 'Duck Amt', value: 14, min: 0, max: 36, step: 1, unit: 'dB' },
      attack: { name: 'attack', label: 'Attack', value: 2.0, min: 0.1, max: 50, step: 0.5, unit: 'ms' },
      release: { name: 'release', label: 'Release', value: 80, min: 10, max: 500, step: 5, unit: 'ms' }
    }
  },
  {
    id: 'mesa_mark3',
    type: 'mesa',
    category: 'amp',
    title: 'Mesa Boogie Mark III',
    color: 'rose',
    bypassed: true,
    parameters: {
      channel: { name: 'channel', label: 'Channel', value: 2, min: 0, max: 2, step: 1, unit: '' },
      gain: { name: 'gain', label: 'Volume 1', value: 7.5, min: 0, max: 10, step: 0.1, unit: '' },
      leadDrive: { name: 'leadDrive', label: 'Lead Drive', value: 8.0, min: 0, max: 10, step: 0.1, unit: '' },
      master: { name: 'master', label: 'Master 1', value: 6.0, min: 0, max: 10, step: 0.1, unit: '' },
      leadMaster: { name: 'leadMaster', label: 'Lead Master', value: 6.5, min: 0, max: 10, step: 0.1, unit: '' },
      bass: { name: 'bass', label: 'Bass', value: 4.0, min: 0, max: 10, step: 0.1, unit: '' },
      mid: { name: 'mid', label: 'Middle', value: 5.0, min: 0, max: 10, step: 0.1, unit: '' },
      treble: { name: 'treble', label: 'Treble', value: 7.0, min: 0, max: 10, step: 0.1, unit: '' },
      presence: { name: 'presence', label: 'Presence', value: 6.5, min: 0, max: 10, step: 0.1, unit: '' },
      eq80: { name: 'eq80', label: '80 Hz', value: 3.5, min: -12, max: 12, step: 0.5, unit: 'dB' },
      eq240: { name: 'eq240', label: '240 Hz', value: 0.5, min: -12, max: 12, step: 0.5, unit: 'dB' },
      eq750: { name: 'eq750', label: '750 Hz', value: -5.5, min: -12, max: 12, step: 0.5, unit: 'dB' },
      eq2200: { name: 'eq2200', label: '2.2 kHz', value: 2.0, min: -12, max: 12, step: 0.5, unit: 'dB' },
      eq6600: { name: 'eq6600', label: '6.6 kHz', value: 4.0, min: -12, max: 12, step: 0.5, unit: 'dB' },
      eqActive: { name: 'eqActive', label: 'Graphic EQ In', value: 1.0, min: 0, max: 1, step: 1, unit: '' },
      pullBright: { name: 'pullBright', label: 'Pull Bright', value: 1.0, min: 0, max: 1, step: 1, unit: '' },
      pullShift: { name: 'pullShift', label: 'Pull Shift', value: 0.0, min: 0, max: 1, step: 1, unit: '' },
      pullDeep: { name: 'pullDeep', label: 'Pull Deep', value: 1.0, min: 0, max: 1, step: 1, unit: '' },
      simulClass: { name: 'simulClass', label: 'Simul-Class 85W', value: 1.0, min: 0, max: 1, step: 1, unit: '' },
      cab: { name: 'cab', label: '4x12 V30 Cab', value: 1.0, min: 0, max: 1, step: 1, unit: '' }
    }
  },
  {
    id: 'vox_ac30',
    type: 'vox',
    category: 'amp',
    title: 'Vox AC-30 Top Boost',
    color: 'amber',
    bypassed: true,
    parameters: {
      channel: { name: 'channel', label: 'Channel', value: 1, min: 0, max: 1, step: 1, unit: '' },
      gain: { name: 'gain', label: 'Volume', value: 6.5, min: 0, max: 10, step: 0.1, unit: '' },
      bass: { name: 'bass', label: 'Bass', value: 5.5, min: 0, max: 10, step: 0.1, unit: '' },
      treble: { name: 'treble', label: 'Treble', value: 7.0, min: 0, max: 10, step: 0.1, unit: '' },
      cut: { name: 'cut', label: 'Tone Cut', value: 3.5, min: 0, max: 10, step: 0.1, unit: '' },
      chime: { name: 'chime', label: 'Chime', value: 6.5, min: 0, max: 10, step: 0.1, unit: '' },
      brilliant: { name: 'brilliant', label: 'Brilliant Switch', value: 1.0, min: 0, max: 1, step: 1, unit: '' },
      master: { name: 'master', label: 'Master', value: 7.0, min: 0, max: 10, step: 0.1, unit: '' },
      cab: { name: 'cab', label: '2x12 Blue Cab', value: 1.0, min: 0, max: 1, step: 1, unit: '' }
    }
  }
];

export const INITIAL_RULES: ReactiveRule[] = [
  {
    id: 'rule_breakdown_echo',
    triggerType: 'state',
    triggerTarget: 'breakdown',
    targetNodeId: 'dub_echo',
    targetParam: 'feedback',
    action: 'ramp',
    targetValue: 0.75,
    duration: 2.0
  },
  {
    id: 'rule_drop_filter',
    triggerType: 'state',
    triggerTarget: 'drop',
    targetNodeId: 'resonant_filter',
    targetParam: 'cutoff',
    action: 'snap',
    targetValue: 18000
  },
  {
    id: 'rule_kick_duck',
    triggerType: 'sensor',
    triggerTarget: 'kick',
    targetNodeId: 'sidechain_ducker',
    targetParam: 'gain',
    action: 'duck',
    depthDb: 14
  }
];

export const INITIAL_STUDIO_MODULES: StudioModule[] = [
  {
    id: 'board_1',
    type: 'pedal_board',
    title: 'Pedal Board 1',
    bypassed: false,
    ampPlacement: 'outbound',
    pedals: INITIAL_PEDALS
  },
  {
    id: 'sp404_1',
    type: 'sp404',
    title: 'SP-404 Original / A',
    bypassed: false
  },
  {
    id: 'state_1',
    type: 'state',
    title: 'State Cockpit',
    bypassed: false
  }
];
