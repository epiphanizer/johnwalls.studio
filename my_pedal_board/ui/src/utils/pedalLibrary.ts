import { PedalInstance, PedalType, Parameter } from '../types';

export interface LibraryPedalTemplate {
  id: string;
  type: PedalType;
  category: 'delay' | 'drive' | 'filter' | 'ducker' | 'amp';
  title: string;
  subtitle: string;
  description: string;
  color: string;
  tags: string[];
  parameters: Record<string, number>;
  isFactory?: boolean;
  isFavorite?: boolean;
  createdAt?: number;
}

export const FACTORY_PEDALS: LibraryPedalTemplate[] = [
  // Delays & Echoes
  {
    id: 'factory_dub_echo',
    type: 'delay',
    category: 'delay',
    title: 'Dub Tape Echo',
    subtitle: 'Space Echo RE-201 Style',
    description: 'Analog-modeled warm tape delay with organic wow/flutter modulation and soft saturation on repeats.',
    color: 'amber',
    tags: ['delay', 'tape', 'analog', 'dub', 'ambient'],
    isFactory: true,
    parameters: {
      time: 360,
      feedback: 0.45,
      mix: 0.50,
      flutter: 0.20
    }
  },
  {
    id: 'factory_bbd_delay',
    type: 'delay',
    category: 'delay',
    title: 'BBD Warm Memory Delay',
    subtitle: 'Bucket-Brigade Analog',
    description: 'Dark, warm bucket-brigade analog delay with decaying repeats and gentle high-frequency roll-off.',
    color: 'amber',
    tags: ['delay', 'bbd', 'analog', 'vintage'],
    isFactory: true,
    parameters: {
      time: 240,
      feedback: 0.55,
      mix: 0.42,
      flutter: 0.35
    }
  },
  {
    id: 'factory_slapback',
    type: 'delay',
    category: 'delay',
    title: '50s Rockabilly Slapback',
    subtitle: 'Tight Single-Tap Echo',
    description: 'Crisp, fast single repeat slapback echo for guitars, snares, and vocals.',
    color: 'amber',
    tags: ['delay', 'slapback', 'rockabilly', 'guitar'],
    isFactory: true,
    parameters: {
      time: 90,
      feedback: 0.15,
      mix: 0.60,
      flutter: 0.10
    }
  },
  {
    id: 'factory_ambient_wash',
    type: 'delay',
    category: 'delay',
    title: 'Infinite Space Wash',
    subtitle: 'Deep Ambient Repeats',
    description: 'Long ethereal echoes on the edge of oscillation, creating expansive cinematic soundscapes.',
    color: 'amber',
    tags: ['delay', 'ambient', 'space', 'cinematic'],
    isFactory: true,
    parameters: {
      time: 850,
      feedback: 0.88,
      mix: 0.65,
      flutter: 0.45
    }
  },

  // Overdrives & Distortions
  {
    id: 'factory_ts9_overdrive',
    type: 'drive',
    category: 'drive',
    title: 'TS-9 Tube Screamer',
    subtitle: 'Mid-Focused Tube Overdrive',
    description: 'Iconic green overdrive with vocal mid-range hump that pushes tube preamps into singing saturation.',
    color: 'gold',
    tags: ['drive', 'overdrive', 'tube', 'blues', 'boost'],
    isFactory: true,
    parameters: {
      drive: 5.5,
      tone: 0.70,
      mix: 0.85
    }
  },
  {
    id: 'factory_silicon_fuzz',
    type: 'drive',
    category: 'drive',
    title: 'Silicone Fuzz Beast',
    subtitle: 'Dynamic Asymmetric Fuzz',
    description: 'Aggressive, raw silicon transistor fuzz with heavy harmonic saturation and dynamic touch sensitivity.',
    color: 'gold',
    tags: ['drive', 'fuzz', 'silicon', 'vintage', 'heavy'],
    isFactory: true,
    parameters: {
      drive: 14.0,
      tone: 0.55,
      mix: 0.90
    }
  },
  {
    id: 'factory_rodent_dist',
    type: 'drive',
    category: 'drive',
    title: 'Rodent Hard Clipper',
    subtitle: 'Raw Harmonic Distortion',
    description: 'Hard-clipping op-amp distortion with rich odd-order harmonics and cutting bite.',
    color: 'gold',
    tags: ['drive', 'distortion', 'hard-clipping', 'rock'],
    isFactory: true,
    parameters: {
      drive: 8.5,
      tone: 0.45,
      mix: 0.80
    }
  },
  {
    id: 'factory_clean_preamp_boost',
    type: 'drive',
    category: 'drive',
    title: 'JFET Clean Preamp Boost',
    subtitle: 'Transparent +20dB Leveler',
    description: 'Ultra-transparent JFET clean boost designed to lift front-end signals without coloration.',
    color: 'gold',
    tags: ['drive', 'boost', 'preamp', 'transparent'],
    isFactory: true,
    parameters: {
      drive: 2.2,
      tone: 0.85,
      mix: 0.95
    }
  },

  // Filters & EQs
  {
    id: 'factory_moog_ladder',
    type: 'filter',
    category: 'filter',
    title: 'Moog Ladder 24',
    subtitle: '4-Pole Resonant Lowpass',
    description: 'Authentic 24dB/octave transistor ladder filter with warm non-linear drive and self-oscillating peak resonance.',
    color: 'crimson',
    tags: ['filter', 'ladder', 'moog', 'analog', 'synth'],
    isFactory: true,
    parameters: {
      cutoff: 1400,
      resonance: 0.65,
      drive: 1.5,
      mix: 1.0
    }
  },
  {
    id: 'factory_acid_filter',
    type: 'filter',
    category: 'filter',
    title: 'Acid Bass Squelch',
    subtitle: 'High-Resonance Sweeper',
    description: 'Aggressive 303-style resonant low-pass filter tuned for punchy synth basslines and squelchy filter sweeps.',
    color: 'crimson',
    tags: ['filter', 'acid', '303', 'squelch', 'bass'],
    isFactory: true,
    parameters: {
      cutoff: 750,
      resonance: 0.92,
      drive: 2.8,
      mix: 1.0
    }
  },
  {
    id: 'factory_warm_tone_smoother',
    type: 'filter',
    category: 'filter',
    title: 'Dark Analog Tone Smoother',
    subtitle: 'Gentle Top-End Roll-off',
    description: 'Smooth, non-resonant high-frequency roll-off to tame harsh digital highs and inject vintage warmth.',
    color: 'crimson',
    tags: ['filter', 'smooth', 'warm', 'gentle'],
    isFactory: true,
    parameters: {
      cutoff: 3200,
      resonance: 0.25,
      drive: 1.1,
      mix: 0.9
    }
  },
  {
    id: 'factory_vocal_formant',
    type: 'filter',
    category: 'filter',
    title: 'Vocal Formant Sweeper',
    subtitle: 'Resonant Mid-Peak Shaper',
    description: 'Tuned resonant peak filter that adds expressive, talkbox-like human vowel formants to leads and chords.',
    color: 'crimson',
    tags: ['filter', 'formant', 'vocal', 'talkbox'],
    isFactory: true,
    parameters: {
      cutoff: 1850,
      resonance: 0.80,
      drive: 1.8,
      mix: 1.0
    }
  },

  // Dynamics & Sidechains
  {
    id: 'factory_reactive_ducker',
    type: 'ducker',
    category: 'ducker',
    title: 'Reactive Sidechain Ducker',
    subtitle: 'Sensor & Kick Envelope Shaper',
    description: 'Automatic dynamic gain ducker driven by live kick detection, auxiliary Ableton sidechain, or arbitrary sensors.',
    color: 'cyan',
    tags: ['ducker', 'sidechain', 'dynamic', 'kick', 'pumping'],
    isFactory: true,
    parameters: {
      depth: 16,
      attack: 2.0,
      release: 75
    }
  },
  {
    id: 'factory_gentle_bus_leveler',
    type: 'ducker',
    category: 'ducker',
    title: 'Gentle Bus Leveler',
    subtitle: 'Subtle Pumping Shaper',
    description: 'Smooth, slow-release dynamic leveler that adds subtle groove breathing without jarring transients.',
    color: 'cyan',
    tags: ['ducker', 'bus', 'gentle', 'groove'],
    isFactory: true,
    parameters: {
      depth: 6,
      attack: 8.0,
      release: 160
    }
  },
  {
    id: 'factory_hard_edm_duck',
    type: 'ducker',
    category: 'ducker',
    title: 'Hard EDM Clamp Ducker',
    subtitle: 'Instant Trench Ducking',
    description: 'High-depth -32dB sidechain clamp with lightning 1ms attack for heavy four-on-the-floor dance drops.',
    color: 'cyan',
    tags: ['ducker', 'edm', 'heavy', 'hard-clamp'],
    isFactory: true,
    parameters: {
      depth: 32,
      attack: 1.0,
      release: 50
    }
  },

  // Tube Amplifiers & Cabinets
  {
    id: 'factory_mesa_lead_vcurve',
    type: 'mesa',
    category: 'amp',
    title: 'Mesa Mark III: Searing V-Curve',
    subtitle: 'Lead Channel + 5-Band Graphic EQ',
    description: 'High-gain cascading 12AX7 tube lead with the iconic scooped 5-band graphic EQ and Celestion V30 4x12 cab.',
    color: 'rose',
    tags: ['amp', 'mesa', 'lead', 'high-gain', 'v-curve', 'metal'],
    isFactory: true,
    parameters: {
      channel: 2,
      gain: 8.0,
      leadDrive: 8.5,
      master: 6.0,
      leadMaster: 6.5,
      pullBright: 1,
      bass: 4.0,
      mid: 5.0,
      treble: 7.0,
      presence: 6.5,
      eqActive: 1,
      eq80: 3.5,
      eq240: 0.5,
      eq750: -5.5,
      eq2200: 2.0,
      eq6600: 4.0,
      simulClass: 1,
      cab: 1
    }
  },
  {
    id: 'factory_mesa_santana_crunch',
    type: 'mesa',
    category: 'amp',
    title: 'Mesa Mark III: Santana Singing Crunch',
    subtitle: 'Rhythm 2 Harmonic Crunch',
    description: 'Singing, liquid sustain from Rhythm 2 crunch channel with boosted mids, Class A warm sag, and smooth top.',
    color: 'rose',
    tags: ['amp', 'mesa', 'crunch', 'santana', 'rock', 'blues'],
    isFactory: true,
    parameters: {
      channel: 1,
      gain: 7.5,
      master: 6.5,
      bass: 5.0,
      mid: 8.0,
      treble: 5.0,
      presence: 4.0,
      pullBright: 0,
      pullDeep: 1,
      pullShift: 1,
      simulClass: 0,
      eqActive: 0,
      cab: 1
    }
  },
  {
    id: 'factory_mesa_clean_rhythm',
    type: 'mesa',
    category: 'amp',
    title: 'Mesa Mark III: Blackface Crystal Clean',
    subtitle: 'Rhythm 1 Fender-Style Clean',
    description: 'High-headroom sparkling American clean channel with Pull Bright engaged and Simul-Class 85W power.',
    color: 'rose',
    tags: ['amp', 'mesa', 'clean', 'fender', 'sparkle'],
    isFactory: true,
    parameters: {
      channel: 0,
      gain: 6.0,
      master: 7.5,
      bass: 4.5,
      mid: 5.5,
      treble: 7.0,
      presence: 6.0,
      pullBright: 1,
      pullDeep: 0,
      pullShift: 0,
      simulClass: 1,
      eqActive: 0,
      cab: 1
    }
  },
  {
    id: 'factory_vox_top_boost_chime',
    type: 'vox',
    category: 'amp',
    title: 'Vox AC-30: British Top Boost Chime',
    subtitle: 'Class A EL84 Bell Chime',
    description: 'Jangle and bell chime from the Top Boost channel with brilliant switch and Celestion Alnico Blue 2x12 open-back cab.',
    color: 'amber',
    tags: ['amp', 'vox', 'chime', 'british', 'beatles', 'indie'],
    isFactory: true,
    parameters: {
      channel: 1,
      gain: 6.5,
      bass: 5.5,
      treble: 7.0,
      cut: 3.5,
      chime: 7.0,
      brilliant: 1,
      master: 7.0,
      cab: 1
    }
  },
  {
    id: 'factory_vox_normal_warmth',
    type: 'vox',
    category: 'amp',
    title: 'Vox AC-30: Normal Channel Edge',
    subtitle: 'Round Warm Vintage Clean',
    description: 'Warm, earthy tone from the classic Normal channel with gentle high roll-off from the reverse Tone Cut.',
    color: 'amber',
    tags: ['amp', 'vox', 'normal', 'warm', 'vintage'],
    isFactory: true,
    parameters: {
      channel: 0,
      gain: 7.0,
      bass: 6.0,
      treble: 5.5,
      cut: 6.0,
      chime: 3.5,
      brilliant: 0,
      master: 7.5,
      cab: 1
    }
  },
  {
    id: 'factory_vox_driven_sag',
    type: 'vox',
    category: 'amp',
    title: 'Vox AC-30: Cranked EL84 Sag',
    subtitle: 'Cathode Bias Tube Compression',
    description: 'Cranked British invasion overdrive with organic dynamic power-supply sag and natural harmonic shimmer.',
    color: 'amber',
    tags: ['amp', 'vox', 'cranked', 'overdrive', 'sag', 'queen'],
    isFactory: true,
    parameters: {
      channel: 1,
      gain: 9.0,
      bass: 6.5,
      treble: 7.5,
      cut: 2.0,
      chime: 8.5,
      brilliant: 1,
      master: 8.0,
      cab: 1
    }
  }
];

const USER_PEDALS_STORAGE_KEY = 'johnwalls_user_pedal_library';
const FAVORITES_STORAGE_KEY = 'johnwalls_favorite_pedals';

export function loadUserPedals(): LibraryPedalTemplate[] {
  try {
    const raw = localStorage.getItem(USER_PEDALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveUserPedals(pedals: LibraryPedalTemplate[]) {
  try {
    localStorage.setItem(USER_PEDALS_STORAGE_KEY, JSON.stringify(pedals));
  } catch {}
}

export function loadFavoritePedalIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveFavoritePedalIds(ids: string[]) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

export function getAllLibraryPedals(): LibraryPedalTemplate[] {
  const user = loadUserPedals();
  const favIds = new Set(loadFavoritePedalIds());

  const merged = [...FACTORY_PEDALS, ...user].map((p) => ({
    ...p,
    isFavorite: favIds.has(p.id)
  }));
  return merged;
}

export function saveUserPedalTemplate(
  title: string,
  sourcePedal: PedalInstance,
  description?: string,
  tags: string[] = []
): LibraryPedalTemplate {
  const userPedals = loadUserPedals();
  const paramValues: Record<string, number> = {};
  for (const [key, param] of Object.entries(sourcePedal.parameters)) {
    paramValues[key] = param.value;
  }

  const category =
    sourcePedal.type === 'mesa' || sourcePedal.type === 'vox'
      ? 'amp'
      : (sourcePedal.type as any);

  const newTemplate: LibraryPedalTemplate = {
    id: `user_pedal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: sourcePedal.type,
    category,
    title: title.trim() || sourcePedal.title,
    subtitle: 'User Custom Preset',
    description: description?.trim() || `Custom tuned ${sourcePedal.title} preset.`,
    color: sourcePedal.color,
    tags: tags.length > 0 ? tags : [sourcePedal.type, 'custom', 'user'],
    parameters: paramValues,
    isFactory: false,
    createdAt: Date.now()
  };

  userPedals.unshift(newTemplate);
  saveUserPedals(userPedals);
  return newTemplate;
}

export function deleteUserPedalTemplate(id: string) {
  const userPedals = loadUserPedals();
  const filtered = userPedals.filter((p) => p.id !== id);
  saveUserPedals(filtered);
}

export function toggleFavoritePedal(id: string): boolean {
  const favs = new Set(loadFavoritePedalIds());
  let nowFav = false;
  if (favs.has(id)) {
    favs.delete(id);
    nowFav = false;
  } else {
    favs.add(id);
    nowFav = true;
  }
  saveFavoritePedalIds(Array.from(favs));
  return nowFav;
}

export function instantiatePedalFromLibrary(
  template: LibraryPedalTemplate,
  existingCount: number = 0
): PedalInstance {
  const uniqueId = `${template.type}_${Date.now()}_${existingCount + 1}`;
  const isAmp = template.type === 'mesa' || template.type === 'vox';

  // Build full parameters record
  const params: Record<string, Parameter> = {};

  if (template.type === 'delay') {
    params.time = { name: 'time', label: 'Time', value: template.parameters.time ?? 360, min: 20, max: 1200, step: 10, unit: 'ms' };
    params.feedback = { name: 'feedback', label: 'Repeat', value: template.parameters.feedback ?? 0.45, min: 0.0, max: 0.95, step: 0.01, unit: '' };
    params.mix = { name: 'mix', label: 'Wet Mix', value: template.parameters.mix ?? 0.50, min: 0.0, max: 1.0, step: 0.01, unit: '' };
    params.flutter = { name: 'flutter', label: 'Flutter', value: template.parameters.flutter ?? 0.20, min: 0.0, max: 1.0, step: 0.01, unit: '' };
  } else if (template.type === 'drive') {
    params.drive = { name: 'drive', label: 'Drive', value: template.parameters.drive ?? 4.0, min: 1.0, max: 15.0, step: 0.5, unit: 'x' };
    params.tone = { name: 'tone', label: 'Tone', value: template.parameters.tone ?? 0.65, min: 0.1, max: 1.0, step: 0.05, unit: '' };
    params.mix = { name: 'mix', label: 'Mix', value: template.parameters.mix ?? 0.80, min: 0.0, max: 1.0, step: 0.01, unit: '' };
  } else if (template.type === 'filter') {
    params.cutoff = { name: 'cutoff', label: 'Cutoff', value: template.parameters.cutoff ?? 1400, min: 60, max: 20000, step: 50, unit: 'Hz' };
    params.resonance = { name: 'resonance', label: 'Peak Q', value: template.parameters.resonance ?? 0.65, min: 0.0, max: 0.98, step: 0.01, unit: '' };
    params.drive = { name: 'drive', label: 'Drive', value: template.parameters.drive ?? 1.5, min: 1.0, max: 5.0, step: 0.1, unit: 'x' };
  } else if (template.type === 'ducker') {
    params.depth = { name: 'depth', label: 'Duck Amt', value: template.parameters.depth ?? 16, min: 0, max: 36, step: 1, unit: 'dB' };
    params.attack = { name: 'attack', label: 'Attack', value: template.parameters.attack ?? 2.0, min: 0.1, max: 50, step: 0.5, unit: 'ms' };
    params.release = { name: 'release', label: 'Release', value: template.parameters.release ?? 75, min: 10, max: 500, step: 5, unit: 'ms' };
  } else if (template.type === 'mesa') {
    params.channel = { name: 'channel', label: 'Channel', value: template.parameters.channel ?? 2, min: 0, max: 2, step: 1, unit: '' };
    params.gain = { name: 'gain', label: 'Volume 1', value: template.parameters.gain ?? 7.5, min: 0, max: 10, step: 0.1, unit: '' };
    params.leadDrive = { name: 'leadDrive', label: 'Lead Drive', value: template.parameters.leadDrive ?? 8.0, min: 0, max: 10, step: 0.1, unit: '' };
    params.master = { name: 'master', label: 'Master 1', value: template.parameters.master ?? 6.0, min: 0, max: 10, step: 0.1, unit: '' };
    params.leadMaster = { name: 'leadMaster', label: 'Lead Master', value: template.parameters.leadMaster ?? 6.5, min: 0, max: 10, step: 0.1, unit: '' };
    params.bass = { name: 'bass', label: 'Bass', value: template.parameters.bass ?? 4.0, min: 0, max: 10, step: 0.1, unit: '' };
    params.mid = { name: 'mid', label: 'Middle', value: template.parameters.mid ?? 5.0, min: 0, max: 10, step: 0.1, unit: '' };
    params.treble = { name: 'treble', label: 'Treble', value: template.parameters.treble ?? 7.0, min: 0, max: 10, step: 0.1, unit: '' };
    params.presence = { name: 'presence', label: 'Presence', value: template.parameters.presence ?? 6.5, min: 0, max: 10, step: 0.1, unit: '' };
    params.eq80 = { name: 'eq80', label: '80 Hz', value: template.parameters.eq80 ?? 3.5, min: -12, max: 12, step: 0.5, unit: 'dB' };
    params.eq240 = { name: 'eq240', label: '240 Hz', value: template.parameters.eq240 ?? 0.5, min: -12, max: 12, step: 0.5, unit: 'dB' };
    params.eq750 = { name: 'eq750', label: '750 Hz', value: template.parameters.eq750 ?? -5.5, min: -12, max: 12, step: 0.5, unit: 'dB' };
    params.eq2200 = { name: 'eq2200', label: '2.2 kHz', value: template.parameters.eq2200 ?? 2.0, min: -12, max: 12, step: 0.5, unit: 'dB' };
    params.eq6600 = { name: 'eq6600', label: '6.6 kHz', value: template.parameters.eq6600 ?? 4.0, min: -12, max: 12, step: 0.5, unit: 'dB' };
    params.eqActive = { name: 'eqActive', label: 'Graphic EQ In', value: template.parameters.eqActive ?? 1.0, min: 0, max: 1, step: 1, unit: '' };
    params.pullBright = { name: 'pullBright', label: 'Pull Bright', value: template.parameters.pullBright ?? 1.0, min: 0, max: 1, step: 1, unit: '' };
    params.pullShift = { name: 'pullShift', label: 'Pull Shift', value: template.parameters.pullShift ?? 0.0, min: 0, max: 1, step: 1, unit: '' };
    params.pullDeep = { name: 'pullDeep', label: 'Pull Deep', value: template.parameters.pullDeep ?? 1.0, min: 0, max: 1, step: 1, unit: '' };
    params.simulClass = { name: 'simulClass', label: 'Simul-Class 85W', value: template.parameters.simulClass ?? 1.0, min: 0, max: 1, step: 1, unit: '' };
    params.cab = { name: 'cab', label: '4x12 V30 Cab', value: template.parameters.cab ?? 1.0, min: 0, max: 1, step: 1, unit: '' };
  } else if (template.type === 'vox') {
    params.channel = { name: 'channel', label: 'Channel', value: template.parameters.channel ?? 1, min: 0, max: 1, step: 1, unit: '' };
    params.gain = { name: 'gain', label: 'Volume', value: template.parameters.gain ?? 6.5, min: 0, max: 10, step: 0.1, unit: '' };
    params.bass = { name: 'bass', label: 'Bass', value: template.parameters.bass ?? 5.5, min: 0, max: 10, step: 0.1, unit: '' };
    params.treble = { name: 'treble', label: 'Treble', value: template.parameters.treble ?? 7.0, min: 0, max: 10, step: 0.1, unit: '' };
    params.cut = { name: 'cut', label: 'Tone Cut', value: template.parameters.cut ?? 3.5, min: 0, max: 10, step: 0.1, unit: '' };
    params.chime = { name: 'chime', label: 'Chime', value: template.parameters.chime ?? 6.5, min: 0, max: 10, step: 0.1, unit: '' };
    params.brilliant = { name: 'brilliant', label: 'Brilliant Switch', value: template.parameters.brilliant ?? 1.0, min: 0, max: 1, step: 1, unit: '' };
    params.master = { name: 'master', label: 'Master', value: template.parameters.master ?? 7.0, min: 0, max: 10, step: 0.1, unit: '' };
    params.cab = { name: 'cab', label: '2x12 Blue Cab', value: template.parameters.cab ?? 1.0, min: 0, max: 1, step: 1, unit: '' };
  }

  return {
    id: uniqueId,
    type: template.type,
    category: isAmp ? 'amp' : 'pedal',
    title: template.title,
    color: template.color,
    bypassed: false,
    parameters: params
  };
}
