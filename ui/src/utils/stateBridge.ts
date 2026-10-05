import { AbletonTrackInfo, AbletonSceneInfo, SuperColliderServerStatus, ReactiveMidiRule } from '../types';

declare global {
  interface Window {
    __JUCE_INVOKE_NATIVE__?: (fnName: string, payload: any) => boolean;
  }
}

const DEFAULT_SERVER_URLS = ['http://127.0.0.1:3012', 'http://127.0.0.1:3013', 'http://127.0.0.1:3014'];

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
  private activeBaseUrl: string = DEFAULT_SERVER_URLS[0];

  private async tryFetch(path: string, options?: RequestInit): Promise<Response> {
    for (const baseUrl of DEFAULT_SERVER_URLS) {
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
    action: 'freeAll' | 'testTone' | 'reboot' | 'runVisual' | 'stopVisual' | 'osc',
    payload?: string
  ): Promise<SuperColliderServerStatus> {
    return this.scRequest('superColliderAction', { action, payload }, '/supercollider/action', { action, payload });
  }

  /** Run an sclang patch (visuals) that is wired to the plugin's scsynth and /state/* OSC stream. */
  public runVisual(code: string): Promise<SuperColliderServerStatus> {
    return this.executeSuperColliderAction('runVisual', code);
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
}

export const stateBridge = new StateBridge();
