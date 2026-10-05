import { PedalInstance, RackPreset } from '../types';

export const FACTORY_PRESETS: RackPreset[] = [
  {
    id: 'mesa_vcurve',
    name: 'Mesa Boogie: Heavy V-Curve',
    category: 'factory',
    description: 'Iconic Mark III Lead Channel with 5-band graphic EQ scooped V-curve.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: false,
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
      }
    ]
  },
  {
    id: 'mesa_santana',
    name: 'Mesa Boogie: Smooth Santana',
    category: 'factory',
    description: 'Singing, smooth sustain from Rhythm 2 crunch channel with boosted mids.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: false,
        parameters: {
          channel: 1,
          gain: 7.5,
          master: 6.5,
          bass: 5.0,
          mid: 8.0,
          treble: 5.0,
          presence: 4.0,
          eqActive: 1,
          eq750: 1.5,
          simulClass: 1,
          cab: 1
        }
      }
    ]
  },
  {
    id: 'mesa_clean',
    name: 'Mesa Boogie: Clean Funk',
    category: 'factory',
    description: 'Crisp, articulate rhythm 1 clean channel with bright pull cap.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: false,
        parameters: {
          channel: 0,
          gain: 4.5,
          master: 7.0,
          pullBright: 1,
          bass: 4.5,
          mid: 5.5,
          treble: 7.0,
          presence: 6.0,
          eqActive: 0,
          simulClass: 1,
          cab: 1
        }
      }
    ]
  },
  {
    id: 'vox_chime',
    name: 'Vox AC-30: British Chime',
    category: 'factory',
    description: 'Authentic 1963 Top Boost sparkle with EL84 tube harmonic chime exciter.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: false,
        parameters: {
          channel: 1,
          gain: 7.0,
          bass: 5.5,
          treble: 7.5,
          cut: 3.0,
          chime: 8.5,
          brilliant: 1,
          master: 7.0,
          cab: 1
        }
      }
    ]
  },
  {
    id: 'vox_warm',
    name: 'Vox AC-30: Normal Warm Tube',
    category: 'factory',
    description: 'Vintage warm organic normal channel with natural speaker cone damping.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: false,
        parameters: {
          channel: 0,
          gain: 5.5,
          cut: 5.0,
          brilliant: 0,
          master: 6.5,
          cab: 1
        }
      }
    ]
  },
  {
    id: 'ambient_dub',
    name: 'Ambient Dub Spaces',
    category: 'factory',
    description: 'Tape echo feedback saturated through Moog 24dB resonant ladder filter.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: false,
        parameters: {
          time: 480,
          feedback: 0.65,
          mix: 0.55,
          flutter: 0.25
        }
      },
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: false,
        parameters: {
          cutoff: 1100,
          resonance: 0.62,
          drive: 1.5,
          mix: 0.85
        }
      }
    ]
  },
  {
    id: 'bypass_all',
    name: 'Direct Dry Passthrough',
    category: 'factory',
    description: 'All DSP effects and tube amplifiers set to Standby / Bypass.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: true,
        parameters: { time: 360, feedback: 0.45, mix: 0.5 }
      },
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: true,
        parameters: { cutoff: 1400, resonance: 0.5 }
      },
      {
        id: 'sidechain_ducker',
        type: 'ducker',
        title: 'Sidechain Ducker',
        color: 'cyan',
        bypassed: true,
        parameters: { depth: 14, release: 80 }
      },
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: true,
        parameters: { channel: 2, gain: 7.5, master: 6.0 }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: true,
        parameters: { channel: 1, gain: 6.5, master: 7.0 }
      }
    ]
  }
];

const STORAGE_KEY = 'johnwalls_user_rack_library';

export function loadUserPresets(): RackPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to load user presets from localStorage:', err);
  }
  return [];
}

export function saveUserPreset(preset: Omit<RackPreset, 'id' | 'category' | 'createdAt'>): RackPreset {
  const userPresets = loadUserPresets();
  const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newPreset: RackPreset = {
    ...preset,
    id,
    category: 'user',
    createdAt: new Date().toLocaleDateString()
  };

  const updated = [newPreset, ...userPresets];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save user preset to localStorage:', err);
  }
  return newPreset;
}

export function deleteUserPreset(id: string): void {
  const userPresets = loadUserPresets();
  const filtered = userPresets.filter((p) => p.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to delete user preset from localStorage:', err);
  }
}

export function convertCurrentRackToPreset(
  name: string,
  pedals: PedalInstance[],
  ampPlacement: 'outbound' | 'inbound',
  description?: string
): Omit<RackPreset, 'id' | 'category' | 'createdAt'> {
  return {
    name: name.trim(),
    description: description?.trim() || `User patch saved with ${pedals.length} active units`,
    ampPlacement,
    pedals: pedals.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      color: p.color,
      bypassed: p.bypassed,
      parameters: Object.entries(p.parameters).reduce((acc, [k, v]) => {
        acc[k] = v.value;
        return acc;
      }, {} as Record<string, number>)
    }))
  };
}
