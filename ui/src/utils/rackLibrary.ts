import { PedalInstance, RackPreset } from '../types';

export const FACTORY_PRESETS: RackPreset[] = [
  // ── Curated Production Suites ─────────────────────────────────────────────
  {
    id: 'suite_shoegaze',
    name: 'Shoegaze: Wall of Sound',
    category: 'factory',
    description: 'Swirling tape echo and resonant ladder filter feeding into chiming Vox AC-30 Top Boost.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: false,
        parameters: { time: 420, feedback: 0.58, mix: 0.44, flutter: 0.32 }
      },
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: false,
        parameters: { cutoff: 2400, resonance: 0.38, drive: 1.05, mix: 0.75 }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: false,
        parameters: { channel: 1, gain: 6.2, bass: 5.0, treble: 7.0, cut: 3.5, chime: 6.8, brilliant: 1, master: 5.2, cab: 1 }
      },
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: true,
        parameters: { channel: 2, gain: 7.5, master: 5.0 }
      },
      {
        id: 'sidechain_ducker',
        type: 'ducker',
        title: 'Sidechain Ducker',
        color: 'cyan',
        bypassed: true,
        parameters: { depth: 10, release: 80 }
      }
    ]
  },
  {
    id: 'suite_neosoul',
    name: 'Neo-Soul: Edge of Breakup',
    category: 'factory',
    description: 'Dynamic Mesa Rhythm 1 clean channel with bright pull cap and subtle tape flutter.',
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
          gain: 4.8,
          master: 5.8,
          pullBright: 1,
          bass: 5.0,
          mid: 6.5,
          treble: 6.2,
          presence: 5.5,
          eqActive: 0,
          simulClass: 1,
          cab: 1
        }
      },
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: false,
        parameters: { time: 240, feedback: 0.28, mix: 0.20, flutter: 0.22 }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: true,
        parameters: { channel: 0, gain: 5.0, master: 5.5 }
      },
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: true,
        parameters: { cutoff: 1800, resonance: 0.4 }
      },
      {
        id: 'sidechain_ducker',
        type: 'ducker',
        title: 'Sidechain Ducker',
        color: 'cyan',
        bypassed: true,
        parameters: { depth: 8, release: 60 }
      }
    ]
  },
  {
    id: 'suite_dub_cavern',
    name: 'Dub Cavern: Space Echo',
    category: 'factory',
    description: 'Resonant 4-pole low-pass sweeps into deep tape echoes ducked by incoming kick hits.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: false,
        parameters: { cutoff: 1050, resonance: 0.65, drive: 1.1, mix: 0.85 }
      },
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: false,
        parameters: { time: 480, feedback: 0.58, mix: 0.48, flutter: 0.28 }
      },
      {
        id: 'sidechain_ducker',
        type: 'ducker',
        title: 'Sidechain Ducker',
        color: 'cyan',
        bypassed: false,
        parameters: { depth: 14, release: 80 }
      },
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: true,
        parameters: { channel: 0, gain: 4.0, master: 5.0 }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: true,
        parameters: { channel: 0, gain: 5.0, master: 5.0 }
      }
    ]
  },
  {
    id: 'suite_80s_thrash',
    name: '80s Thrash: Tight V-Scoop',
    category: 'factory',
    description: 'Mesa Mark III Lead Channel with aggressive scooped 5-band EQ and punchy low-end definition.',
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
          gain: 8.2,
          leadDrive: 8.0,
          master: 5.0,
          leadMaster: 5.0,
          pullBright: 1,
          bass: 4.0,
          mid: 4.5,
          treble: 6.8,
          presence: 6.0,
          eqActive: 1,
          eq80: 3.0,
          eq240: 0.8,
          eq750: -5.5,
          eq2200: 2.2,
          eq6600: 3.5,
          simulClass: 1,
          cab: 1
        }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: true,
        parameters: { channel: 1, gain: 6.0, master: 5.0 }
      },
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: true,
        parameters: { time: 350, feedback: 0.4, mix: 0.3 }
      },
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: true,
        parameters: { cutoff: 1400, resonance: 0.4 }
      },
      {
        id: 'sidechain_ducker',
        type: 'ducker',
        title: 'Sidechain Ducker',
        color: 'cyan',
        bypassed: true,
        parameters: { depth: 10, release: 80 }
      }
    ]
  },
  {
    id: 'suite_lofi_vinyl',
    name: 'Lo-Fi Vinyl: SP-404 Flutter',
    category: 'factory',
    description: 'Analog tape flutter, dark ladder filter roll-off, and vintage Vox normal channel cabinet warmth.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: false,
        parameters: { time: 190, feedback: 0.32, mix: 0.28, flutter: 0.42 }
      },
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: false,
        parameters: { cutoff: 2800, resonance: 0.22, drive: 1.0, mix: 0.80 }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: false,
        parameters: { channel: 0, gain: 4.8, cut: 5.5, brilliant: 0, master: 5.6, cab: 1 }
      },
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: true,
        parameters: { channel: 0, gain: 4.0, master: 5.0 }
      },
      {
        id: 'sidechain_ducker',
        type: 'ducker',
        title: 'Sidechain Ducker',
        color: 'cyan',
        bypassed: true,
        parameters: { depth: 8, release: 60 }
      }
    ]
  },
  {
    id: 'suite_clean_chime',
    name: 'British Top Boost Clean',
    category: 'factory',
    description: 'Vintage 1963 AC-30 jangly chime with brilliant high-frequency boost and high headroom.',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: false,
        parameters: { channel: 1, gain: 4.5, bass: 5.2, treble: 7.2, cut: 2.8, chime: 6.2, brilliant: 1, master: 5.8, cab: 1 }
      },
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: true,
        parameters: { channel: 0, gain: 4.0, master: 5.0 }
      },
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: true,
        parameters: { time: 350, feedback: 0.35, mix: 0.25 }
      },
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: true,
        parameters: { cutoff: 1800, resonance: 0.35 }
      },
      {
        id: 'sidechain_ducker',
        type: 'ducker',
        title: 'Sidechain Ducker',
        color: 'cyan',
        bypassed: true,
        parameters: { depth: 8, release: 60 }
      }
    ]
  },

  // ── Calibrated Factory Amp Profiles ───────────────────────────────────────
  {
    id: 'mesa_vcurve',
    name: 'Mesa Boogie: Heavy V-Curve',
    category: 'factory',
    description: 'Iconic Mark III Lead Channel with 5-band graphic EQ scooped V-curve (calibrated).',
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
          gain: 7.8,
          leadDrive: 8.0,
          master: 5.0,
          leadMaster: 5.2,
          pullBright: 1,
          bass: 4.0,
          mid: 5.0,
          treble: 6.8,
          presence: 6.0,
          eqActive: 1,
          eq80: 3.0,
          eq240: 0.5,
          eq750: -5.0,
          eq2200: 2.0,
          eq6600: 3.5,
          simulClass: 1,
          cab: 1
        }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: true,
        parameters: { channel: 0, gain: 5.0, master: 5.0 }
      }
    ]
  },
  {
    id: 'mesa_santana',
    name: 'Mesa Boogie: Smooth Santana',
    category: 'factory',
    description: 'Singing, smooth sustain from Rhythm 2 crunch channel with boosted mids (calibrated).',
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
          gain: 7.0,
          master: 5.4,
          bass: 5.0,
          mid: 7.5,
          treble: 5.0,
          presence: 4.0,
          eqActive: 1,
          eq750: 1.2,
          simulClass: 1,
          cab: 1
        }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: true,
        parameters: { channel: 0, gain: 5.0, master: 5.0 }
      }
    ]
  },
  {
    id: 'mesa_clean',
    name: 'Mesa Boogie: Clean Funk',
    category: 'factory',
    description: 'Crisp, articulate rhythm 1 clean channel with bright pull cap (calibrated).',
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
          gain: 4.2,
          master: 5.8,
          pullBright: 1,
          bass: 4.5,
          mid: 5.5,
          treble: 6.8,
          presence: 5.5,
          eqActive: 0,
          simulClass: 1,
          cab: 1
        }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: true,
        parameters: { channel: 0, gain: 5.0, master: 5.0 }
      }
    ]
  },
  {
    id: 'vox_chime',
    name: 'Vox AC-30: British Chime',
    category: 'factory',
    description: 'Authentic 1963 Top Boost sparkle with EL84 tube harmonic chime exciter (calibrated).',
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
          gain: 6.2,
          bass: 5.2,
          treble: 7.2,
          cut: 3.2,
          chime: 6.8,
          brilliant: 1,
          master: 5.4,
          cab: 1
        }
      },
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: true,
        parameters: { channel: 0, gain: 4.0, master: 5.0 }
      }
    ]
  },
  {
    id: 'vox_warm',
    name: 'Vox AC-30: Normal Warm Tube',
    category: 'factory',
    description: 'Vintage warm organic normal channel with natural speaker cone damping (calibrated).',
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
          gain: 5.0,
          cut: 5.0,
          brilliant: 0,
          master: 5.6,
          cab: 1
        }
      },
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: true,
        parameters: { channel: 0, gain: 4.0, master: 5.0 }
      }
    ]
  },
  {
    id: 'ambient_dub',
    name: 'Ambient Dub Spaces',
    category: 'factory',
    description: 'Tape echo feedback saturated through Moog 24dB resonant ladder filter (calibrated).',
    ampPlacement: 'outbound',
    pedals: [
      {
        id: 'dub_echo',
        type: 'delay',
        title: 'Dub Tape Echo',
        color: 'amber',
        bypassed: false,
        parameters: {
          time: 460,
          feedback: 0.52,
          mix: 0.46,
          flutter: 0.22
        }
      },
      {
        id: 'resonant_filter',
        type: 'filter',
        title: 'Moog Ladder 24',
        color: 'crimson',
        bypassed: false,
        parameters: {
          cutoff: 1150,
          resonance: 0.55,
          drive: 1.1,
          mix: 0.80
        }
      },
      {
        id: 'mesa_mark3',
        type: 'mesa',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: true,
        parameters: { channel: 0, gain: 4.0, master: 5.0 }
      },
      {
        id: 'vox_ac30',
        type: 'vox',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: true,
        parameters: { channel: 0, gain: 5.0, master: 5.0 }
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
