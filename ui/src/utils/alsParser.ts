import { AbletonTrackInfo, AbletonSceneInfo } from '../types';

export interface ParsedAbletonSession {
  projectName: string;
  alsPath?: string;
  creator: string;
  tempo: number;
  timeSignature: string;
  tracks: AbletonTrackInfo[];
  scenes: AbletonSceneInfo[];
  loadedAt: string;
  fileSizeBytes?: number;
}

// Ableton Live 11/12 standard 70-color palette mapping
const ABLETON_PALETTE_HEX: string[] = [
  '#f8b69b', '#f9c57e', '#fbe07a', '#c7e48b', '#8ad28f', '#77d4b4', '#70c9d7', '#7faee5', '#9e9fe8', '#bc9ae2',
  '#d68fc4', '#e2889e', '#e77a5d', '#ef9b35', '#eed840', '#94d13d', '#38c568', '#24bfaf', '#33a7e2', '#597ced',
  '#a367ea', '#e465ba', '#d64848', '#d66e2c', '#cda620', '#6aa32a', '#1e8f49', '#158e82', '#1f7ba7', '#3455b8',
  '#7442b8', '#ab3d8e', '#9e2e2e', '#9b4c1a', '#91730f', '#476f17', '#125f2e', '#0b5d55', '#11506e', '#1f347a',
  '#4a2979', '#73235d', '#e5e5e5', '#a5a5a5', '#606060', '#303030', '#101010', '#ffffff', '#ffd1c1', '#ffe4b5',
  '#fff3b5', '#e1f4be', '#bef0c2', '#b5f2df', '#b1ebf4', '#bad5f8', '#cdcffb', '#decbf7', '#ecc8e1', '#f3c4d0',
  '#c58f7e', '#c59f67', '#c2b260', '#8fb363', '#66a877', '#5aab94', '#57a3ae', '#668ebc', '#7c7ebb', '#947bb3'
];

export function getAbletonTrackColor(colorIndex?: number): string {
  if (colorIndex === undefined || colorIndex === null) return '#22d3ee';
  if (colorIndex >= 0 && colorIndex < ABLETON_PALETTE_HEX.length) {
    return ABLETON_PALETTE_HEX[colorIndex];
  }
  return '#22d3ee';
}

/**
 * Decompresses an Ableton Live Set (.als) gzip file into raw XML string.
 * Uses the native browser DecompressionStream standard.
 */
export async function decompressAlsBlob(blob: Blob): Promise<string> {
  // If browser supports native DecompressionStream
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip');
      const decompressedStream = blob.stream().pipeThrough(ds);
      const res = new Response(decompressedStream);
      return await res.text();
    } catch (err) {
      console.warn('DecompressionStream failed, trying fallback:', err);
    }
  }

  // Fallback: If not gzipped (already raw XML)
  const rawText = await blob.text();
  if (rawText.includes('<Ableton') || rawText.includes('<LiveSet')) {
    return rawText;
  }

  throw new Error('Could not decompress .als file: browser DecompressionStream unavailable.');
}

/**
 * Parses raw Ableton Live XML document into high-fidelity session metadata.
 */
export function parseAbletonXml(xmlText: string, projectName: string = 'Ableton Project', alsPath?: string): ParsedAbletonSession {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const abletonRoot = doc.querySelector('Ableton');
  const creator = abletonRoot?.getAttribute('Creator') || 'Ableton Live';

  // Master Tempo & Time Signature
  const masterTrack = doc.querySelector('MasterTrack');
  const tempoEl = masterTrack?.querySelector('DeviceChain Mixer Tempo Manual');
  const tempo = tempoEl ? parseFloat(tempoEl.getAttribute('Value') || '120.0') : 120.0;

  const timeSigNumEl = masterTrack?.querySelector('DeviceChain Mixer TimeSignature TimeSignatures RemoteableTimeSignature Numerator');
  const timeSigDenEl = masterTrack?.querySelector('DeviceChain Mixer TimeSignature TimeSignatures RemoteableTimeSignature Denominator');
  const num = timeSigNumEl?.getAttribute('Value') || '4';
  const den = timeSigDenEl?.getAttribute('Value') || '4';
  const timeSignature = `${num}/${den}`;

  // Parse all real tracks
  const tracks: AbletonTrackInfo[] = [];
  const trackNodes = doc.querySelectorAll('Tracks > *');

  trackNodes.forEach((node, idx) => {
    const tagName = node.tagName.toLowerCase();
    let trackType: AbletonTrackInfo['trackType'] = 'audio';
    if (tagName.includes('midi')) {
      trackType = 'midi';
    } else if (tagName.includes('return')) {
      trackType = 'return';
    } else if (tagName.includes('group')) {
      trackType = 'audio';
    }

    const effNameEl = node.querySelector('Name > EffectiveName');
    const userNameEl = node.querySelector('Name > UserName');
    const effName = effNameEl?.getAttribute('Value');
    const userName = userNameEl?.getAttribute('Value');
    const trackName = (userName && userName.trim()) || (effName && effName.trim()) || `Track ${idx + 1}`;

    const colorEl = node.querySelector('Color');
    const colorIndex = colorEl ? parseInt(colorEl.getAttribute('Value') || '0', 10) : undefined;
    const colorHex = getAbletonTrackColor(colorIndex);

    // Mute / Solo / Arm
    const speakerEl = node.querySelector('DeviceChain Mixer Speaker Manual');
    const isMute = speakerEl ? speakerEl.getAttribute('Value') === 'false' : false;

    const soloEl = node.querySelector('DeviceChain Mixer SoloSink');
    const isSolo = soloEl ? soloEl.getAttribute('Value') === 'true' : false;

    const armEl = node.querySelector('DeviceChain Mixer Arm Manual');
    const isArmed = armEl ? armEl.getAttribute('Value') === 'true' : false;

    // Track volume normalized (0..1)
    const volEl = node.querySelector('DeviceChain Mixer Volume Manual');
    const normVol = volEl ? parseFloat(volEl.getAttribute('Value') || '0.85') : 0.85;
    const peakDb = normVol > 0.001 ? Math.round(20 * Math.log10(normVol) * 10) / 10 : -70;

    tracks.push({
      instanceId: `als_trk_${idx + 1}`,
      trackName,
      trackIndex: idx + 1,
      trackType,
      midiChannel: trackType === 'midi' ? ((idx % 16) + 1) : 1,
      isMidiActive: false,
      lastNoteNumber: 0,
      lastVelocity: 0,
      totalMidiEvents: 0,
      heldNotes: [],
      peakDb,
      rmsDb: peakDb - 8,
      isArmed,
      isSolo,
      isMute,
      colorIndex,
      colorHex
    });
  });

  // Parse all real scenes
  const scenes: AbletonSceneInfo[] = [];
  const sceneNodes = doc.querySelectorAll('Scenes > Scene');

  sceneNodes.forEach((node, idx) => {
    const nameEl = node.querySelector('Name');
    const rawName = nameEl?.getAttribute('Value') || '';
    const sceneName = rawName.trim() || `Scene ${idx + 1}`;

    const sceneTempoEl = node.querySelector('Tempo');
    const sceneTempo = sceneTempoEl ? parseFloat(sceneTempoEl.getAttribute('Value') || `${tempo}`) : tempo;

    scenes.push({
      id: `scene_${idx + 1}`,
      index: idx + 1,
      name: sceneName,
      tempo: sceneTempo,
      timeSignature,
      isCurrent: idx === 0
    });
  });

  return {
    projectName,
    alsPath,
    creator,
    tempo: Math.round(tempo * 10) / 10,
    timeSignature,
    tracks,
    scenes,
    loadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
}

/**
 * End-to-end parser taking a File or Blob and returning ParsedAbletonSession.
 */
export async function parseAbletonSessionFile(file: File): Promise<ParsedAbletonSession> {
  const xml = await decompressAlsBlob(file);
  const cleanName = file.name.replace(/\.als$/i, '');
  const session = parseAbletonXml(xml, cleanName);
  session.fileSizeBytes = file.size;
  saveSessionToStorage(session);
  return session;
}

const STORAGE_KEY = 'johnwalls_active_als_session';

export function saveSessionToStorage(session: ParsedAbletonSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('Could not persist parsed session to localStorage:', e);
  }
}

export function loadSessionFromStorage(): ParsedAbletonSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

export function clearSessionFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
