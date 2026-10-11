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

export async function listSP404Libraries(): Promise<SP404LibraryManifest[]> {
  const db = await openDatabase();
  const libraries = await new Promise<SP404LibraryManifest[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const values = (request.result as StoredSP404Library[]).map((library) => library.manifest);
      values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(values);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not list SP-404 libraries.'));
  });
  db.close();
  return libraries;
}

export async function loadSP404Library(id: string): Promise<StoredSP404Library | null> {
  const db = await openDatabase();
  const library = await new Promise<StoredSP404Library | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as StoredSP404Library | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not load SP-404 library.'));
  });
  db.close();
  return library;
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
