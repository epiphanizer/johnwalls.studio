import { AbletonTrackInfo, AbletonSceneInfo, SuperColliderServerStatus, ReactiveMidiRule } from '../types';
import { getTelemetryBaseUrl } from './nativeTransport';

declare global {
  interface Window {
    __JUCE_INVOKE_NATIVE__?: (fnName: string, payload: any) => boolean;
  }
}


export const DEFAULT_REACTIVE_MIDI_RULES: ReactiveMidiRule[] = [
  {
    id: 'rule_bass_1_4_lead_arp',
    name: 'Bass 1/4 ➔ Lead 1/16 Running Arp',
    enabled: true,
    sourceTrackFilter: 'bass',
    triggerRhythm: '1/4',
    actionType: 'arp_1_16',
    param: 1.0,
    scOscAddress: '/state/rhythm'
  },
  {
    id: 'rule_bass_1_16_lead_stabs',
    name: 'Bass 1/16 ➔ Lead 1/4 Offbeat Stabs',
    enabled: true,
    sourceTrackFilter: 'bass',
    triggerRhythm: '1/16',
    actionType: 'stabs_1_4',
    param: 1.0,
    scOscAddress: '/state/rhythm'
  },
  {
    id: 'rule_drum_idle_ambient',
    name: 'Breakdown / Idle ➔ Ambient Wash (+12st)',
    enabled: true,
    sourceTrackFilter: 'drum',
    triggerRhythm: 'idle',
    actionType: 'sustained',
    param: 12.0,
    scOscAddress: '/state/rhythm'
  }
];

import { parseAbletonSessionFile, loadSessionFromStorage, saveSessionToStorage, ParsedAbletonSession } from './alsParser';

export const DEFAULT_ABLETON_SCENES: AbletonSceneInfo[] = [];
export const INITIAL_TRACKS: AbletonTrackInfo[] = [];

export interface RecentAlsProject {
  name: string;
  projectName: string;
  path: string;
  modifiedTime: number;
  fileSizeBytes: number;
}

class StateBridge {
  private activeBaseUrl: string = '';

  public getActiveBaseUrl(): string {
    return this.activeBaseUrl || getTelemetryBaseUrl();
  }

  private getServerUrls(): string[] {
    const primary = getTelemetryBaseUrl();
    const ports = ['3012', '3013', '3014', '3015', '3016'];
    const list: string[] = [];
    if (primary && !list.includes(primary)) {
      list.push(primary);
    }
    if (this.activeBaseUrl && !list.includes(this.activeBaseUrl)) {
      list.push(this.activeBaseUrl);
    }
    for (const p of ports) {
      const u = `http://127.0.0.1:${p}`;
      if (!list.includes(u)) {
        list.push(u);
      }
    }
    return list;
  }

  private async tryFetch(path: string, options?: RequestInit): Promise<Response> {
    const urls = this.getServerUrls();
    for (const baseUrl of urls) {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options?.headers || {})
          }
        });
        if (res.ok) {
          this.activeBaseUrl = baseUrl;
          return res;
        }
      } catch {}
    }
    throw new Error('Could not connect to local telemetry server');
  }

  // SuperCollider controls. Every call goes to the real plugin (native event when hosted in the
  // JUCE WebView, otherwise the local telemetry HTTP server). There is no simulated fallback: if
  // the plugin can't be reached the returned status says so.
  public offlineStatus(error: string): SuperColliderServerStatus {
    return {
      isRunning: false,
      isBooting: false,
      statusText: 'OFFLINE',
      port: 57110,
      pid: 0,
      sampleRate: 0,
      numSynths: 0,
      numGroups: 0,
      numNodes: 0,
      numUGens: 0,
      numSynthDefs: 0,
      avgCPU: 0,
      peakCPU: 0,
      binaryPath: '',
      sclangPath: '',
      isExternal: false,
      lastError: error,
      serverLog: '',
      visualRunning: false,
      visualLog: '',
      langPort: 57120,
      oscSent: 0
    };
  }

  private async scRequest(
    nativeFn: string,
    nativePayload: any,
    path: string,
    body?: any
  ): Promise<SuperColliderServerStatus> {
    // Fire exactly one transport for the command (never both, or it would run twice).
    if (window.__JUCE_INVOKE_NATIVE__) {
      window.__JUCE_INVOKE_NATIVE__(nativeFn, nativePayload);
      // The native event has no reply; give the plugin a moment, then read the real status back.
      await new Promise((r) => setTimeout(r, 400));
      return (await this.fetchSuperColliderStatus()) ??
        this.offlineStatus('Command sent, but the plugin status endpoint is unreachable.');
    }
    try {
      const res = await this.tryFetch(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return await res.json();
    } catch {
      return this.offlineStatus('Could not reach the plugin. Is johnwalls.studio loaded in your DAW?');
    }
  }

  public bootSuperCollider(port: number = 57110): Promise<SuperColliderServerStatus> {
    return this.scRequest('bootSuperCollider', { port }, '/supercollider/boot', { port });
  }

  public killSuperCollider(): Promise<SuperColliderServerStatus> {
    return this.scRequest('killSuperCollider', {}, '/supercollider/kill');
  }

  public executeSuperColliderAction(
    action: 'freeAll' | 'testTone' | 'reboot' | 'runVisual' | 'openVisualWindow' | 'toggleVisual' | 'stopVisual' | 'osc',
    payload?: string
  ): Promise<SuperColliderServerStatus> {
    return this.scRequest('superColliderAction', { action, payload }, '/supercollider/action', { action, payload });
  }

  /** Run an sclang patch (visuals) that is wired to the plugin's scsynth and /state/* OSC stream. */
  public runVisual(presetOrCode: string = 'supercollider-lissajous'): Promise<SuperColliderServerStatus> {
    return this.executeSuperColliderAction('runVisual', presetOrCode);
  }

  /** Launch or pop out native SuperCollider visual window via sclang. */
  public openVisualWindow(presetOrCode: string = 'supercollider-lissajous'): Promise<SuperColliderServerStatus> {
    return this.executeSuperColliderAction('openVisualWindow', presetOrCode);
  }

  /** Toggle the native SuperCollider visual window on or off. */
  public toggleVisual(presetOrCode: string = 'supercollider-lissajous'): Promise<SuperColliderServerStatus> {
    return this.executeSuperColliderAction('toggleVisual', presetOrCode);
  }

  public stopVisual(): Promise<SuperColliderServerStatus> {
    return this.executeSuperColliderAction('stopVisual');
  }

  public async fetchSuperColliderStatus(): Promise<SuperColliderServerStatus | null> {
    try {
      const res = await this.tryFetch('/supercollider/status');
      return await res.json();
    } catch {
      return null;
    }
  }

  public async fetchSessionTracks(): Promise<AbletonTrackInfo[]> {
    try {
      const res = await this.tryFetch('/session/tracks');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch {}
    return INITIAL_TRACKS;
  }

  public getSuperColliderStatus(): Promise<SuperColliderServerStatus | null> {
    return this.fetchSuperColliderStatus();
  }

  public sendSuperColliderAction(
    action: 'freeAll' | 'testTone' | 'reboot' | 'runVisual' | 'stopVisual',
    payload?: string
  ): Promise<SuperColliderServerStatus> {
    return this.executeSuperColliderAction(action, payload);
  }

  public getSessionTracks(): Promise<AbletonTrackInfo[]> {
    return this.fetchSessionTracks();
  }

  public async fetchReactiveMidiRules(): Promise<ReactiveMidiRule[]> {
    try {
      const res = await this.tryFetch('/reactive_midi/rules');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch {}
    return DEFAULT_REACTIVE_MIDI_RULES;
  }

  public async toggleReactiveMidiRule(ruleId: string): Promise<boolean> {
    if (window.__JUCE_INVOKE_NATIVE__) {
      window.__JUCE_INVOKE_NATIVE__('toggleReactiveMidiRule', { id: ruleId });
      return true;
    }
    try {
      await this.tryFetch('/reactive_midi/toggle', {
        method: 'POST',
        body: JSON.stringify({ id: ruleId })
      });
      return true;
    } catch {
      return false;
    }
  }

  public async setReactiveMidiRules(rules: ReactiveMidiRule[]): Promise<boolean> {
    if (window.__JUCE_INVOKE_NATIVE__) {
      window.__JUCE_INVOKE_NATIVE__('setReactiveMidiRules', rules);
      return true;
    }
    try {
      await this.tryFetch('/reactive_midi/rules', {
        method: 'POST',
        body: JSON.stringify(rules)
      });
      return true;
    } catch {
      return false;
    }
  }

  public async addReactiveMidiRule(rule: Partial<ReactiveMidiRule>): Promise<boolean> {
    if (window.__JUCE_INVOKE_NATIVE__) {
      window.__JUCE_INVOKE_NATIVE__('addReactiveMidiRule', rule);
      return true;
    }
    try {
      await this.tryFetch('/reactive_midi/add', {
        method: 'POST',
        body: JSON.stringify(rule)
      });
      return true;
    } catch {
      return false;
    }
  }

  public async setReactiveMidiEnabled(enabled: boolean): Promise<boolean> {
    if (window.__JUCE_INVOKE_NATIVE__) {
      window.__JUCE_INVOKE_NATIVE__('setReactiveMidiEnabled', { enabled });
      return true;
    }
    try {
      await this.tryFetch('/reactive_midi/enable', {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
      return true;
    } catch {
      return false;
    }
  }

  // Real Ableton Live Set (.als) Inspection APIs
  public async fetchRecentAlsProjects(): Promise<RecentAlsProject[]> {
    try {
      const res = await this.tryFetch('/als/recent');
      if (res.ok) {
        const data = await res.json();
        return data.recentProjects || [];
      }
    } catch {}
    return [];
  }

  public async parseAlsByPath(path: string): Promise<ParsedAbletonSession | null> {
    try {
      const res = await this.tryFetch(`/als/parse?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const session: ParsedAbletonSession = await res.json();
        saveSessionToStorage(session);
        return session;
      }
    } catch (e) {
      console.warn('Failed to parse .als via server endpoint:', e);
    }
    return null;
  }

  public async parseAlsFile(file: File): Promise<ParsedAbletonSession> {
    return await parseAbletonSessionFile(file);
  }

  public loadSavedSession(): ParsedAbletonSession | null {
    return loadSessionFromStorage();
  }

  // ---- Audio Take Recorder & Studio Dispatch Methods ----
  public async getTakeStatus(): Promise<TakeRecorderStatus | null> {
    try {
      const res = await this.tryFetch('/take/status');
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  public async getRecentTakes(): Promise<AudioTakeMetadata[]> {
    try {
      const res = await this.tryFetch('/take/recent');
      if (res.ok) {
        const data = await res.json();
        return data.takes || [];
      }
    } catch {}
    return [];
  }

  public async startRecording(trackName?: string, projectName?: string, bpm?: number): Promise<boolean> {
    try {
      const res = await this.tryFetch('/take/record/start', {
        method: 'POST',
        body: JSON.stringify({ trackName, projectName, bpm })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async stopRecording(): Promise<AudioTakeMetadata | null> {
    try {
      const res = await this.tryFetch('/take/record/stop', {
        method: 'POST',
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        return data.take || null;
      }
    } catch {}
    return null;
  }

  public async setAutoRecEnabled(enabled: boolean): Promise<boolean> {
    try {
      const res = await this.tryFetch('/take/auto_rec', {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public getAudioTakeUrl(takeId: string): string {
    return `${this.activeBaseUrl}/take/audio?id=${encodeURIComponent(takeId)}`;
  }

  public getVisualTakeUrl(takeId: string): string {
    return `${this.activeBaseUrl}/take/visual?id=${encodeURIComponent(takeId)}`;
  }

  public async deleteTake(takeId: string): Promise<boolean> {
    try {
      const res = await this.tryFetch(`/take?id=${encodeURIComponent(takeId)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async publishTake(
    takeId: string,
    options: {
      title: string;
      artist?: string;
      description?: string;
      visualizerPreset?: string;
      targetUrl?: string;
    }
  ): Promise<{ ok: boolean; message?: string; publicUrl?: string; error?: string }> {
    const targetUrl = options.targetUrl || 'https://johnwalls.studio/api/johnwalls/publish';

    // 1. Primary: Dispatch via LocalTelemetryServer (local native plugin process)
    try {
      const res = await this.tryFetch('/take/publish', {
        method: 'POST',
        body: JSON.stringify({
          id: takeId,
          title: options.title,
          artist: options.artist || 'John Walls',
          description: options.description || '',
          visualizerPreset: options.visualizerPreset || 'supercollider-lissajous',
          targetUrl
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.ok || data.publicUrl)) {
          return data;
        }
      }
    } catch (err) {
      console.warn('LocalTelemetryServer publish attempt returned error, trying direct web fallback:', err);
    }

    // 2. Direct Web Fallback: Fetch audio WAV blob from local telemetry server and POST multipart directly
    try {
      const audioUrl = this.getAudioTakeUrl(takeId);
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        throw new Error(`Failed to load audio take file (${audioRes.status})`);
      }
      const audioBlob = await audioRes.blob();
      const formData = new FormData();
      formData.append('audio', audioBlob, `${takeId}.wav`);
      formData.append('id', takeId);
      formData.append('title', options.title);
      formData.append('artist', options.artist || 'John Walls');
      formData.append('description', options.description || '');
      formData.append('visualizerPreset', options.visualizerPreset || 'supercollider-lissajous');

      const publishRes = await fetch(targetUrl, {
        method: 'POST',
        body: formData
      });
      const publishData = await publishRes.json();
      return publishData;
    } catch (fallbackErr) {
      return {
        ok: false,
        error: fallbackErr instanceof Error ? fallbackErr.message : 'Publish connection error'
      };
    }
  }

  public async deployStudioApp(options?: {
    deployUrl?: string;
    deployToken?: string;
  }): Promise<{ ok: boolean; output?: string; publicUrl?: string; error?: string }> {
    const deployUrl = options?.deployUrl || 'https://johnwalls.studio/api/johnwalls/deploy';
    const deployToken = options?.deployToken || '';

    try {
      const res = await this.tryFetch('/studio/deploy', {
        method: 'POST',
        body: JSON.stringify({ deployUrl, deployToken })
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      console.warn('LocalTelemetryServer deploy trigger error:', err);
    }

    return {
      ok: false,
      error: 'Could not reach local telemetry server. Please run "npm run push" or "make push" in your terminal.'
    };
  }

  public async getHardwareStatus(): Promise<HardwareStatus> {
    try {
      const res = await this.tryFetch('/hardware/status');
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Hardware status check error:', err);
    }
    return {
      sp404: { mounted: false, mountPath: '', volumeName: '', freeBytes: 0, totalBytes: 0, sampleCount: 0 },
      rc600: { mounted: false, mountPath: '', volumeName: '', freeBytes: 0, totalBytes: 0, trackCount: 0 },
      anyMounted: false,
      error: 'Telemetry server unavailable or hardware not detected.'
    };
  }

  public async syncHardware(options?: { target?: 'all' | 'sp404' | 'rc600'; path?: string }): Promise<HardwareSyncResult> {
    try {
      const res = await this.tryFetch('/hardware/sync', {
        method: 'POST',
        body: JSON.stringify(options || { target: 'all' })
      });
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => null);
      return {
        ok: false,
        bytesWritten: 0,
        message: errData?.error || 'Hardware sync failed',
        error: errData?.error || 'Hardware sync failed'
      };
    } catch (err) {
      return {
        ok: false,
        bytesWritten: 0,
        message: 'Could not connect to telemetry server',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  public async getAbletonStatus(): Promise<any> {
    try {
      const res = await this.tryFetch('/bounce/status');
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('getAbletonStatus error:', err);
    }
    return { liveRunning: false, activeDocument: null, recentProjects: [] };
  }

  public async openAlsProject(target: string): Promise<{ ok: boolean; output: string }> {
    try {
      const res = await this.tryFetch('/bounce/open', {
        method: 'POST',
        body: JSON.stringify({ target })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('openAlsProject error:', err);
    }
    return { ok: false, output: 'Could not connect to telemetry server.' };
  }

  public async listAlsProject(alsPath?: string): Promise<{ ok: boolean; als: string; output: string }> {
    try {
      const q = alsPath ? `?als=${encodeURIComponent(alsPath)}` : '';
      const res = await this.tryFetch(`/bounce/list${q}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('listAlsProject error:', err);
    }
    return {
      ok: false,
      als: alsPath || '',
      output: 'Could not connect to telemetry server or parse .als project.'
    };
  }

  public async bounceAlsGroup(options: { als?: string; groups?: string; track?: string; memory?: number; rc600Track?: number; autoSong?: number }): Promise<any> {
    try {
      const res = await this.tryFetch('/bounce/group', {
        method: 'POST',
        body: JSON.stringify(options)
      });
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => null);
      return {
        ok: false,
        error: errData?.error || errData?.message || 'Bounce failed'
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  public async findSp404Samples(track: string, alsPath?: string): Promise<any> {
    try {
      const q = `?track=${encodeURIComponent(track)}${alsPath ? `&als=${encodeURIComponent(alsPath)}` : ''}`;
      const res = await this.tryFetch(`/sp404/finder/list${q}`);
      if (res.ok) {
        return await res.json();
      }
      return await res.json().catch(() => ({ ok: false, error: 'Failed to inspect track split waveforms.' }));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public async grabSp404Sample(options: {
    track: string;
    instance: number;
    bank?: string;
    pad?: number;
    als?: string;
    patchCard?: boolean;
    label?: string;
  }): Promise<any> {
    try {
      const res = await this.tryFetch('/sp404/finder/grab', {
        method: 'POST',
        body: JSON.stringify(options)
      });
      if (res.ok) {
        return await res.json();
      }
      return await res.json().catch(() => ({ ok: false, error: 'Failed to grab split instance sample.' }));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public async makeSp404Pattern(options: {
    track: string;
    bank?: string;
    count?: number;
    als?: string;
    patchCard?: boolean;
  }): Promise<any> {
    try {
      const res = await this.tryFetch('/sp404/finder/pattern', {
        method: 'POST',
        body: JSON.stringify(options)
      });
      if (res.ok) {
        return await res.json();
      }
      return await res.json().catch(() => ({ ok: false, error: 'Failed to create SP-404 pattern chop kit.' }));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public async getCardStatus(): Promise<CardStatus> {
    try {
      const res = await this.tryFetch('/card/status');
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Card status check error:', err);
    }
    return {
      mounted: false,
      mountPath: '',
      volumeName: '',
      freeBytes: 0,
      totalBytes: 0,
      hasRolandImport: false,
      hasRolandWave: false,
      hasNamedStems: false,
      sampleCount: 0,
      stemCount: 0,
      error: 'Telemetry server unavailable or card not detected.'
    };
  }

  public async exportToCard(options?: { targetDir?: string }): Promise<CardExportResult> {
    try {
      const res = await this.tryFetch('/card/export', {
        method: 'POST',
        body: JSON.stringify(options || {})
      });
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => null);
      return {
        ok: false,
        mountPath: '',
        samplesExported: 0,
        stemsExported: 0,
        rc600TracksExported: 0,
        bytesWritten: 0,
        message: errData?.error || 'Export failed',
        error: errData?.error || 'Export failed'
      };
    } catch (err) {
      return {
        ok: false,
        mountPath: '',
        samplesExported: 0,
        stemsExported: 0,
        rc600TracksExported: 0,
        bytesWritten: 0,
        message: 'Could not connect to telemetry server',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}

export interface HardwareDeviceStatus {
  mounted: boolean;
  mountPath: string;
  volumeName: string;
  freeBytes: number;
  totalBytes: number;
  sampleCount?: number;
  trackCount?: number;
  hasRolandSmpl?: boolean;
  hasRolandImport?: boolean;
  hasRolandWave?: boolean;
}

export interface HardwareStatus {
  sp404: HardwareDeviceStatus;
  rc600: HardwareDeviceStatus;
  anyMounted: boolean;
  error?: string;
}

export interface HardwareSyncResult {
  ok: boolean;
  target?: string;
  mountPath?: string;
  samplesExported?: number;
  tracksExported?: number;
  bytesWritten: number;
  message: string;
  sp404?: { ok: boolean; mountPath: string; samplesExported: number; bytesWritten: number; message: string; error?: string };
  rc600?: { ok: boolean; mountPath: string; tracksExported: number; bytesWritten: number; message: string; error?: string };
  error?: string;
}

export interface CardStatus {
  mounted: boolean;
  mountPath: string;
  volumeName: string;
  freeBytes: number;
  totalBytes: number;
  hasRolandImport: boolean;
  hasRolandWave: boolean;
  hasNamedStems: boolean;
  sampleCount: number;
  stemCount: number;
  error?: string;
}

export interface CardExportResult {
  ok: boolean;
  mountPath: string;
  samplesExported: number;
  stemsExported: number;
  rc600TracksExported: number;
  bytesWritten: number;
  message: string;
  error?: string;
}

export interface AudioTakeMetadata {
  takeId: string;
  trackName: string;
  projectName: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  durationSeconds: number;
  bpm: number;
  barCount: number;
  timeSignature: string;
  peakDb: number;
  rmsDb: number;
  recordedAt: string;
  visualizerPreset?: string;
  visualManifest?: {
    preset: string;
    visualizerName: string;
    engine: string;
    colorPalette: string;
    sampleCount: number;
    timeline?: Array<{
      t: number;
      peak: number;
      rms: number;
      bpm: number;
      bar: number;
      ppq: number;
    }>;
  };
}

export interface TakeRecorderStatus {
  isRecording: boolean;
  autoRecEnabled: boolean;
  currentTakeId: string;
  currentTrackName: string;
  currentProjectName: string;
  bpm: number;
  sampleRate: number;
  samplesRecorded: number;
  durationSeconds: number;
  peakDb: number;
  rmsDb: number;
}

export const stateBridge = new StateBridge();
