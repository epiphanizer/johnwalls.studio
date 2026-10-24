import type { BankLetter } from '../components/SP404AudioEngine';

export const SP404_LEGACY_BANKS: BankLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export type SP404HardwareProfileId = 'sp404-original' | 'sp404a';
export type SP404CardLayout = 'fuguefat-root' | 'roland-import';

export interface SP404HardwareProfile {
  id: SP404HardwareProfileId;
  label: string;
  padsPerBank: 12;
  sampleRate: 44100;
  audioExtension: 'WAV' | 'AIF';
  cardLayout: SP404CardLayout;
  importPath: string;
  samplePath: string;
  importLimit: 120;
  importOrder: 'filename-ascending';
}

export const SP404_ORIGINAL_PROFILE: SP404HardwareProfile = {
  id: 'sp404-original',
  label: 'SP-404 Original',
  padsPerBank: 12,
  sampleRate: 44100,
  audioExtension: 'WAV',
  cardLayout: 'fuguefat-root',
  importPath: 'FUGUEFAT/',
  samplePath: 'FUGUEFAT/',
  importLimit: 120,
  importOrder: 'filename-ascending'
};

export const SP404A_PROFILE: SP404HardwareProfile = {
  id: 'sp404a',
  label: 'SP-404A',
  padsPerBank: 12,
  sampleRate: 44100,
  audioExtension: 'WAV',
  cardLayout: 'roland-import',
  importPath: 'ROLAND/IMPORT/',
  samplePath: 'ROLAND/SP-404A/SMPL/',
  importLimit: 120,
  importOrder: 'filename-ascending'
};

export const SP404_LEGACY_PROFILES: Record<SP404HardwareProfileId, SP404HardwareProfile> = {
  'sp404-original': SP404_ORIGINAL_PROFILE,
  sp404a: SP404A_PROFILE
};

// Kept as the compatibility default for existing callers and v1 libraries.
export const SP404_LEGACY_PROFILE = SP404_ORIGINAL_PROFILE;

export interface SP404LibraryPadManifest {
  bank: BankLetter;
  padId: number;
  label: string;
  category: string;
  audioFile: string | null;
  duration: number;
  sourceSampleRate: number;
  pitch: number;
  volume: number;
  pan: number;
  mode: 'oneshot' | 'gate' | 'loop';
  reverse: boolean;
  muteGroup: number;
}

export interface SP404LibraryManifest {
  format: 'johnwalls-sp404-library';
  version: 1 | 2;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  hardware: SP404HardwareProfile;
  pads: SP404LibraryPadManifest[];
  settings: {
    volume: number;
    activeMFX: string;
    ctrl1: number;
    ctrl2: number;
    ctrl3: number;
    globalTranspose: number;
    isChromaticMode: boolean;
    chromaticRootPad: { bank: BankLetter; padId: number };
  };
}

export interface StoredSP404Library {
  manifest: SP404LibraryManifest;
  assets: Record<string, Blob>;
}

const DATABASE_NAME = 'johnwalls-sp404-library';
const DATABASE_VERSION = 1;
const STORE_NAME = 'sets';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'manifest.id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open SP-404 library storage.'));
  });
}

export async function saveSP404Library(library: StoredSP404Library): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(library);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save SP-404 library.'));
  });
  db.close();
}

export const WALLS_DEVINE_VOL1_ID = 'factory-walls-devine-vol1';

export function getWallsDevineVol1Manifest(): SP404LibraryManifest {
  const profile = SP404A_PROFILE;
  const padConfigs: Record<string, Array<{ id: number; label: string; cat: string; mode?: 'oneshot' | 'loop'; mute?: number }>> = {
    A: [
      { id: 1, label: 'DRUMS & BASS', cat: 'sample' },
      { id: 2, label: 'BEAT DROP', cat: 'kick' },
      { id: 3, label: 'VERSE GROOVE', cat: 'bass' },
      { id: 4, label: 'SEAN SPOKEN', cat: 'vox' },
      { id: 5, label: 'HARMONIUM SYN', cat: 'sample' },
      { id: 6, label: 'CHORUS DROP', cat: 'sample', mode: 'loop' },
      { id: 7, label: 'CHORUS VOCAL', cat: 'vox' },
      { id: 8, label: 'BREAKDOWN GRV', cat: 'sample', mode: 'loop' },
      { id: 9, label: 'TERRY EPIC GTR', cat: 'sample' },
      { id: 10, label: 'TERRY ROBOT', cat: 'vox' },
      { id: 11, label: 'OUTRO DECAY', cat: 'sample' },
      { id: 12, label: 'FULL MASTER', cat: 'sample', mode: 'loop' }
    ],
    B: [
      { id: 1, label: 'DRUMS & BASS', cat: 'sample' },
      { id: 2, label: 'BEAT DROP', cat: 'kick' },
      { id: 3, label: 'VERSE GROOVE', cat: 'bass' },
      { id: 4, label: 'CONVICTION HOOK', cat: 'vox' },
      { id: 5, label: 'TERRY GUITAR', cat: 'sample' },
      { id: 6, label: 'CHORUS STRINGS', cat: 'sample', mode: 'loop' },
      { id: 7, label: 'CHORUS HARMONY', cat: 'vox' },
      { id: 8, label: 'UPLIFT STRINGS', cat: 'sample' },
      { id: 9, label: 'CHORUS IMPACT', cat: 'sample' },
      { id: 10, label: 'PIANO BRIDGE', cat: 'sample' },
      { id: 11, label: 'OUTRO DECAY', cat: 'sample' },
      { id: 12, label: 'FULL MASTER', cat: 'sample', mode: 'loop' }
    ],
    C: [
      { id: 1, label: 'DRUMS & BASS', cat: 'sample' },
      { id: 2, label: 'BEATBOX DROP', cat: 'kick' },
      { id: 3, label: 'SHAKER POCKET', cat: 'perc' },
      { id: 4, label: 'SEAN POETRY', cat: 'vox' },
      { id: 5, label: 'HARMONIUM REED', cat: 'sample' },
      { id: 6, label: 'CHORUS DROP', cat: 'sample', mode: 'loop' },
      { id: 7, label: 'TERRY HARMONY', cat: 'vox' },
      { id: 8, label: 'VERSE EXTENSION', cat: 'sample' },
      { id: 9, label: 'TERRY RODE GTR', cat: 'sample' },
      { id: 10, label: 'POETRY CLIMAX', cat: 'sample' },
      { id: 11, label: 'POETRY ENDING', cat: 'sample' },
      { id: 12, label: 'FULL MASTER', cat: 'sample', mode: 'loop' }
    ],
    D: [
      { id: 1, label: 'DRUMS & BASS', cat: 'sample' },
      { id: 2, label: 'BEAT DROP', cat: 'kick' },
      { id: 3, label: 'VERSE GROOVE', cat: 'bass' },
      { id: 4, label: 'SEAN VOX HOOK', cat: 'vox' },
      { id: 5, label: 'TERRY LEAD GTR', cat: 'sample' },
      { id: 6, label: 'CHORUS DROP', cat: 'sample', mode: 'loop' },
      { id: 7, label: 'GRATITUDE HARM', cat: 'vox' },
      { id: 8, label: 'MINIBRUTE SYN', cat: 'sample' },
      { id: 9, label: 'TERRY PEAK', cat: 'sample' },
      { id: 10, label: 'BRIDGE BREAK', cat: 'sample' },
      { id: 11, label: 'OUTRO VOCAL', cat: 'vox' },
      { id: 12, label: 'FULL MASTER', cat: 'sample', mode: 'loop' }
    ],
    E: [
      { id: 1, label: 'DRUMS & BASS', cat: 'sample' },
      { id: 2, label: 'BEAT DROP', cat: 'kick' },
      { id: 3, label: 'VERSE GROOVE', cat: 'bass' },
      { id: 4, label: 'PUFF PUFF VOX', cat: 'vox' },
      { id: 5, label: 'BOGART QUOTE', cat: 'vox' },
      { id: 6, label: 'CHORUS DROP', cat: 'sample', mode: 'loop' },
      { id: 7, label: 'TERRY HARMONY', cat: 'vox' },
      { id: 8, label: 'ACOUSTIC SOLO', cat: 'sample' },
      { id: 9, label: 'TERRY DELAY GTR', cat: 'sample' },
      { id: 10, label: 'SUGAR SPICE', cat: 'vox' },
      { id: 11, label: 'OUTRO DECAY', cat: 'sample' },
      { id: 12, label: 'FULL MASTER', cat: 'sample', mode: 'loop' }
    ],
    F: [
      { id: 1, label: 'DRUMS & BASS', cat: 'sample' },
      { id: 2, label: 'CONGA POCKET', cat: 'perc' },
      { id: 3, label: 'SEAN RAP HOOK', cat: 'vox' },
      { id: 4, label: 'ISHIKA VOCAL', cat: 'vox' },
      { id: 5, label: 'TERRY LEAD GTR', cat: 'sample' },
      { id: 6, label: 'CHORUS HOOK', cat: 'sample', mode: 'loop' },
      { id: 7, label: 'BREAK SPOT', cat: 'sample' },
      { id: 8, label: 'ROGUE BASS', cat: 'bass', mode: 'loop' },
      { id: 9, label: 'TERRY WHISTLES', cat: 'sample' },
      { id: 10, label: 'SATURATED CLX', cat: 'vox' },
      { id: 11, label: 'APHEX BRIDGE', cat: 'sample' },
      { id: 12, label: 'FULL MASTER', cat: 'sample', mode: 'loop' }
    ],
    G: [
      { id: 1, label: 'LIVE KICK', cat: 'kick' },
      { id: 2, label: 'LIVE SNARE', cat: 'snare' },
      { id: 3, label: 'LIVE HAT', cat: 'hat' },
      { id: 4, label: 'LIVE BASS', cat: 'bass' },
      { id: 5, label: 'KEYS CHORD', cat: 'sample' },
      { id: 6, label: 'LEAD SYNTH', cat: 'sample' },
      { id: 7, label: 'PERC HIT', cat: 'perc' },
      { id: 8, label: 'SUB DROP', cat: 'bass' },
      { id: 9, label: 'FX RISER', cat: 'fx' },
      { id: 10, label: 'ATMOSPHERE', cat: 'sample' },
      { id: 11, label: 'VINYL DIRT', cat: 'fx' },
      { id: 12, label: 'MASTER ROOM', cat: 'sample', mode: 'loop' }
    ],
    H: [
      { id: 1, label: 'RESOLVE DRUMS', cat: 'kick', mode: 'loop' },
      { id: 2, label: 'RESOLVE BASS', cat: 'bass', mode: 'loop' },
      { id: 3, label: 'RESOLVE GTRS', cat: 'sample', mode: 'loop' },
      { id: 4, label: 'CLEAN TONE', cat: 'sample' },
      { id: 5, label: 'PIANO MOTIF', cat: 'sample' },
      { id: 6, label: 'CHORUS SWELL', cat: 'sample', mode: 'loop' },
      { id: 7, label: 'HARMONY BED', cat: 'vox' },
      { id: 8, label: 'DRIVE LEAD', cat: 'sample' },
      { id: 9, label: 'CYMBAL CRUSH', cat: 'hat' },
      { id: 10, label: 'OCTAVE DROP', cat: 'bass' },
      { id: 11, label: 'FADE VERB', cat: 'fx' },
      { id: 12, label: 'FULL MASTER', cat: 'sample', mode: 'loop' }
    ],
    I: [
      { id: 1, label: 'LIVE KICK', cat: 'kick' },
      { id: 2, label: 'LIVE SNARE', cat: 'snare' },
      { id: 3, label: 'LIVE CLAP', cat: 'perc' },
      { id: 4, label: 'LIVE HAT', cat: 'hat' },
      { id: 5, label: 'BASS PLUCK', cat: 'bass' },
      { id: 6, label: 'CHORD STAB', cat: 'sample' },
      { id: 7, label: 'VOX CHOP', cat: 'vox' },
      { id: 8, label: 'SIREN FX', cat: 'fx' },
      { id: 9, label: 'NOISE SWEEP', cat: 'fx' },
      { id: 10, label: 'TAPE STOP', cat: 'fx' },
      { id: 11, label: 'VINYL DROP', cat: 'fx' },
      { id: 12, label: 'LOOP JAM', cat: 'sample', mode: 'loop' }
    ],
    J: [
      { id: 1, label: 'USER PAD 1', cat: 'custom' },
      { id: 2, label: 'USER PAD 2', cat: 'custom' },
      { id: 3, label: 'USER PAD 3', cat: 'custom' },
      { id: 4, label: 'USER PAD 4', cat: 'custom' },
      { id: 5, label: 'USER PAD 5', cat: 'custom' },
      { id: 6, label: 'USER PAD 6', cat: 'custom' },
      { id: 7, label: 'USER PAD 7', cat: 'custom' },
      { id: 8, label: 'USER PAD 8', cat: 'custom' },
      { id: 9, label: 'USER PAD 9', cat: 'custom' },
      { id: 10, label: 'USER PAD 10', cat: 'custom' },
      { id: 11, label: 'USER PAD 11', cat: 'custom' },
      { id: 12, label: 'USER PAD 12', cat: 'custom' }
    ]
  };

  const pads: SP404LibraryPadManifest[] = [];
  for (const bank of SP404_LEGACY_BANKS) {
    const bankPads = padConfigs[bank] || [];
    for (let i = 1; i <= profile.padsPerBank; i++) {
      const cfg = bankPads.find((p) => p.id === i);
      pads.push({
        bank,
        padId: i,
        label: cfg ? cfg.label : `PAD ${bank}${i.toString().padStart(2, '0')}`,
        category: cfg ? cfg.cat : 'custom',
        audioFile: cfg ? `audio/${getLegacyPadFilename(bank, i)}` : null,
        duration: 0,
        sourceSampleRate: 44100,
        pitch: 0,
        volume: 1.0,
        pan: 0,
        mode: cfg?.mode ?? 'oneshot',
        reverse: false,
        muteGroup: cfg?.mute ?? 0
      });
    }
  }

  return {
    format: 'johnwalls-sp404-library',
    version: 2,
    id: WALLS_DEVINE_VOL1_ID,
    name: 'Walls:Devine Vol. 1 (Decay · Conviction · Poetry · Gratitude · Joint Queen · Stash Daddy)',
    createdAt: '2026-10-16T17:25:00.000Z',
    updatedAt: '2026-10-16T19:50:00.000Z',
    hardware: profile,
    pads,
    settings: {
      volume: 8.8,
      activeMFX: 'vinyl',
      ctrl1: 6.5,
      ctrl2: 4.0,
      ctrl3: 8.0,
      globalTranspose: 0,
      isChromaticMode: false,
      chromaticRootPad: { bank: 'A', padId: 11 }
    }
  };
}

export async function listSP404Libraries(): Promise<SP404LibraryManifest[]> {
  const factory = getWallsDevineVol1Manifest();
  try {
    const db = await openDatabase();
    const userLibs = await new Promise<SP404LibraryManifest[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const values = (request.result as StoredSP404Library[])
          .map((library) => library.manifest)
          .filter((m) => m.id !== factory.id);
        values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        resolve(values);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not list SP-404 libraries.'));
    });
    db.close();
    return [factory, ...userLibs];
  } catch (err) {
    return [factory];
  }
}

export async function loadSP404Library(id: string): Promise<StoredSP404Library | null> {
  if (id === WALLS_DEVINE_VOL1_ID) {
    return {
      manifest: getWallsDevineVol1Manifest(),
      assets: {}
    };
  }

  const db = await openDatabase();
  const library = await new Promise<StoredSP404Library | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as StoredSP404Library | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not load SP-404 library.'));
  });
  db.close();
  return library;
}

export async function renameSP404Library(id: string, newName: string): Promise<SP404LibraryManifest | null> {
  const trimmed = newName.trim();
  if (!trimmed) return null;

  if (id === WALLS_DEVINE_VOL1_ID) {
    const factory = getWallsDevineVol1Manifest();
    const customId = `custom-set-${Date.now()}`;
    const now = new Date().toISOString();
    const copy: StoredSP404Library = {
      manifest: {
        ...factory,
        id: customId,
        name: trimmed,
        createdAt: now,
        updatedAt: now
      },
      assets: {}
    };
    await saveSP404Library(copy);
    return copy.manifest;
  }

  const db = await openDatabase();
  const library = await new Promise<StoredSP404Library | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as StoredSP404Library | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not load SP-404 library to rename.'));
  });

  if (!library) {
    db.close();
    return null;
  }

  library.manifest.name = trimmed;
  library.manifest.updatedAt = new Date().toISOString();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(library);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save renamed SP-404 library.'));
  });
  db.close();

  return library.manifest;
}

export function getLegacyPadFilename(bank: BankLetter, padId: number, extension: 'WAV' | 'AIF' = 'WAV'): string {
  return `${bank}_${padId.toString().padStart(2, '0')}.${extension}`;
}

export function getSP404Profile(id: SP404HardwareProfileId): SP404HardwareProfile {
  return SP404_LEGACY_PROFILES[id];
}

export function isSP404HardwareProfile(value: unknown): value is SP404HardwareProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SP404HardwareProfile>;
  return candidate.id === 'sp404-original' || candidate.id === 'sp404a';
}
