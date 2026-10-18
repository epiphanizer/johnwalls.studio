import {
  PedalInstance,
  PedalType,
  RackPreset,
  ReactiveRule,
  StateTelemetry,
  StudioModule,
  SuperColliderServerStatus,
  AbletonTrackInfo
} from '../types';
import { StudioWorkspace } from '../components/StudioWorkspaceModal';
import { stateBridge, AudioTakeMetadata } from './stateBridge';
import { getAllLibraryPedals, LibraryPedalTemplate } from './pedalLibrary';
import { FACTORY_PRESETS } from './rackLibrary';
import { sp404AudioEngine, BankLetter } from '../components/SP404AudioEngine';

export interface CommandExecutionContext {
  addLog: (type: 'input' | 'output' | 'error' | 'system', content: string) => void;
  clearLogs: () => void;
  telemetry: StateTelemetry;
  currentPedals: PedalInstance[];
  modules: StudioModule[];
  rules: ReactiveRule[];
  userPresets: RackPreset[];
  setInspectedNodeId: (id: string) => void;
  handleUpdateParam: (pedalId: string, paramName: string, val: number) => void;
  handleToggleBypass: (pedalId: string) => void;
  handleRemovePedal: (pedalId: string) => void;
  handleAddPedal: (type: PedalType) => void;
  handleAddPedalFromLibrary: (template: LibraryPedalTemplate) => void;
  handleSaveUserPreset: (name: string, description?: string) => void;
  handleApplyRackPreset: (preset: RackPreset) => void;
  handleToggleAmpPlacement: () => void;
  handleSelectWorkspace: (ws: StudioWorkspace, remember?: boolean) => void;
  setIsRoutingModalOpen: (open: boolean) => void;
  setIsPedalLibraryOpen: (open: boolean) => void;
  setIsCaptureDispatchOpen: (open: boolean) => void;
  setIsVisualizerOpen: (open: boolean) => void;
  setVisualizerTake: (take: AudioTakeMetadata | null) => void;
}

export function getMidiNoteName(noteNum?: number): string {
  if (!noteNum || noteNum <= 0 || noteNum > 127) return '—';
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(noteNum / 12) - 1;
  const note = names[noteNum % 12];
  return `${note}${octave}`;
}

export async function executeStudioCommand(cmd: string, ctx: CommandExecutionContext): Promise<void> {
  const {
    addLog,
    clearLogs,
    telemetry,
    currentPedals,
    modules,
    userPresets,
    setInspectedNodeId,
    handleUpdateParam,
    handleToggleBypass,
    handleAddPedal,
    handleAddPedalFromLibrary,
    handleSaveUserPreset,
    handleApplyRackPreset,
    handleToggleAmpPlacement,
    handleSelectWorkspace,
    setIsRoutingModalOpen,
    setIsPedalLibraryOpen,
    setIsCaptureDispatchOpen,
    setIsVisualizerOpen,
    setVisualizerTake
  } = ctx;

  if (cmd.startsWith('__stream ')) {
    addLog('output', cmd.substring(9));
    return;
  }

  addLog('input', cmd);
  const tokens = cmd.trim().split(/\s+/);
  const verb = tokens[0]?.toLowerCase();

  if (verb === 'clear' || verb === 'cls') {
    clearLogs();
    return;
  }

  if (verb === 'stream') {
    const mode = tokens[1]?.toLowerCase();
    addLog('output', `Live state streaming ${mode === 'off' ? 'PAUSED' : 'ACTIVE'}.`);
    return;
  }

  if (verb === 'help') {
    addLog(
      'output',
      '=== johnwalls.studio Virtual CLI Commands ===\n' +
        'ABLETON LIVE & DAW STATE:\n' +
        '  status / state / report         Live full-system Ableton state dossier\n' +
        '  transport                       Playhead timing, BPM, bar.beat, time signature, host track\n' +
        '  tracks / session                Inspect all Ableton Live session tracks across plugin instances\n' +
        '  midi [status|on|off]            Live MIDI monitor (last note, velocity, pitch, channel)\n' +
        '  audio / meters                  Real-time ASCII meters: Peak dB, RMS dB, sidechain & 5 sensors\n' +
        '  rhythm                          Detected rhythm pattern, density/bar, dominant register & state\n' +
        '  stream <on|off>                 Toggle live stream of Ableton events into terminal\n\n' +
        'AUDIO CAPTURE & WEB PUBLISHING (johnwalls.studio):\n' +
        '  record / rec [start|stop|status] Capture live audio directly from Ableton master\n' +
        '  takes / list takes               Inspect all local 24-bit/48kHz recorded audio takes\n' +
        '  publish [takeId|latest] [title]  Direct ship audio take to johnwalls.studio with SuperCollider visualizer\n' +
        '  ship [takeId|latest] [title]     Alias for \'publish\'\n' +
        '  push / deploy                    Build and auto-push studio app bundle to https://johnwalls.studio/app\n' +
        '  dispatch / publish open          Open tactile Audio Capture & Web Publishing Cockpit modal\n' +
        '  visual [native]                  Open 60 FPS real-time visualizer modal or native SC window\n\n' +
        'SUPERCOLLIDER DSP & VISUAL ENGINE:\n' +
        '  sc <boot|kill|status|test|free>  Control scsynth audio server with real OSC\n' +
        '  sc visual [preset]               Launch native SuperCollider 60 FPS Visual Window\n' +
        '  sc stopvisual                    Close native SuperCollider visual window\n' +
        '  sc modal                         Open in-plugin reactive visualizer modal\n\n' +
        'STUDIO RACK & SIGNAL CHAIN:\n' +
        '  add pedal <delay|filter|drive|ducker|mesa|vox>   Instantiate DSP stompbox or amp\n' +
        '  remove <id>                                     Remove pedal from active board\n' +
        '  bypass <id>                                     Toggle pedal bypass\n' +
        '  placement <outbound|inbound>                    Switch amp stage (Post-FX vs Pre-FX)\n' +
        '  preset v-curve                                  Apply iconic Mesa 5-band EQ V-curve\n' +
        '  inspect <id|master>                             Route solo oscilloscope to target\n' +
        '  set <id>.<param> <val>                          Adjust pedal/amp parameter\n' +
        '  list [pedals|modules|sensors|tracks|takes]      Inspect rack, modules, sensors, tracks or takes\n' +
        '  routing                                         Open Universal Studio Signal Flow Matrix\n\n' +
        'HARDWARE & MEMORY SYNC (SP-404SX & BOSS RC-600):\n' +
        '  hardware status / hw status                     Inspect mounted SP-404SX card, RC-600 USB storage & MIDI link\n' +
        '  hardware sync [all|sp404|rc600]                 Sync SP-404 RLND sample chops (Pad 1 D&B) & RC-600 32-bit stems\n' +
        '  card status / card export                       Legacy SD card shortcut commands\n\n' +
        'ABLETON GROUP BOUNCE & RC-600 STEM PATCHER:\n' +
        '  bounce list [als_path]                          Inspect groups, tracks & clips in Ableton Live project\n' +
        '  bounce song <slot_number> [als_path]            Render time-aligned 3-stem layout (Drums, Bass, Guitars) to RC-600\n' +
        '  bounce group <name> [--slot N] [--track 1-3]    Render group & patch directly onto Boss RC-600\n\n' +
        'TERMINAL CONTROLS:\n' +
        '  clear / cls                                     Clear terminal log buffer'
    );
    return;
  }

  if (verb === 'record' || verb === 'rec') {
    const sub = tokens[1]?.toLowerCase();
    if (!sub || sub === 'status') {
      stateBridge.getTakeStatus().then((st) => {
        if (!st) {
          addLog('output', 'Audio Take Recorder: Not responding.');
          return;
        }
        addLog(
          'output',
          `=== ABLETON AUDIO TAKE RECORDER ===\n` +
            `  Recording:     ${st.isRecording ? '● ACTIVE (RECORDING)' : '⏸ IDLE'}\n` +
            `  Duration:      ${st.durationSeconds.toFixed(2)}s\n` +
            `  Current Track: "${st.currentTrackName || telemetry.currentTrackName || 'Master'}"\n` +
            `  Peak Level:    ${st.peakDb > -60 ? st.peakDb.toFixed(1) + ' dBFS' : '-∞ dBFS'}\n` +
            `  Auto-Rec:      ${st.autoRecEnabled ? 'ENABLED (Sync with Ableton Play)' : 'DISABLED'}\n\n` +
            `Commands: 'record start', 'record stop', 'takes', 'publish latest "<title>"', 'dispatch'`
        );
      }).catch((err: any) => addLog('error', `Record Status Error: ${err?.message || String(err)}`));
    } else if (sub === 'start') {
      const track = tokens.slice(2).join(' ') || telemetry.currentTrackName || 'Master';
      stateBridge.startRecording(track, 'Ableton Live Session', telemetry.bpm).then((ok) => {
        if (ok) {
          addLog(
            'output',
            `● RECORDING LIVE AUDIO from "${track}" at ${telemetry.bpm.toFixed(1)} BPM...\n` +
              `  Writing 24-bit/48kHz WAV directly to local takes archive.\n` +
              `  Type 'record stop' to finish and prepare for publishing.`
          );
        } else {
          addLog('error', 'Failed to start audio take recording. Check telemetry connection.');
        }
      });
    } else if (sub === 'stop') {
      stateBridge.stopRecording().then((take) => {
        if (take) {
          addLog(
            'output',
            `■ RECORDING COMPLETE & FINALIZED.\n` +
              `  Take ID:   ${take.takeId}\n` +
              `  Track:     "${take.trackName}"\n` +
              `  Duration:  ${take.durationSeconds.toFixed(2)}s (${take.barCount} bars)\n` +
              `  BPM:       ${take.bpm}\n` +
              `  Peak:      ${take.peakDb.toFixed(1)} dBFS\n\n` +
              `Ready to ship! Type 'publish latest "${take.trackName} Take"' or 'dispatch' to ship to johnwalls.studio.`
          );
        } else {
          addLog('output', 'Recording stopped. No active take recorded.');
        }
      }).catch((err: any) => addLog('error', `Record Stop Error: ${err?.message || String(err)}`));
    } else {
      addLog('error', 'Usage: record <start [trackName]|stop|status>');
    }
    return;
  }

  if (verb === 'takes') {
    stateBridge.getRecentTakes().then((takes) => {
      if (!takes || takes.length === 0) {
        addLog('output', '=== AUDIO TAKES ARCHIVE ===\n  No recorded takes yet. Run "record start" to capture Ableton audio.');
        return;
      }
      const lines = takes
        .map((t, i) => `  [${i + 1}] ${t.takeId} | "${t.trackName}" | ${t.durationSeconds.toFixed(1)}s | ${t.barCount} bars | ${t.bpm} BPM | Peak: ${t.peakDb.toFixed(1)} dB`)
        .join('\n');
      addLog(
        'output',
        `=== AUDIO TAKES ARCHIVE (${takes.length} takes) ===\n${lines}\n\nType 'publish <takeId> "<title>"' or 'publish latest' to ship to johnwalls.studio.`
      );
    }).catch((err: any) => addLog('error', `Takes Error: ${err?.message || String(err)}`));
    return;
  }

  if (verb === 'publish' || verb === 'ship' || verb === 'dispatch') {
    const target = tokens[1]?.toLowerCase();
    if (!target || target === 'open' || target === 'cockpit' || target === 'modal' || verb === 'dispatch') {
      setIsCaptureDispatchOpen(true);
      addLog('output', 'Opened Audio Capture & Web Publishing Cockpit.');
      return;
    }

    stateBridge.getRecentTakes().then(async (takes) => {
      if (!takes || takes.length === 0) {
        addLog('error', 'No audio takes available to publish. Capture one first with "record start" or click PUBLISH TO WEB.');
        return;
      }

      let selectedTake = takes[0];
      let titleTokensStart = 2;

      if (target === 'latest') {
        selectedTake = takes[0];
        titleTokensStart = 2;
      } else {
        const match = takes.find((t) => t.takeId.toLowerCase().includes(target));
        if (match) {
          selectedTake = match;
          titleTokensStart = 2;
        } else {
          titleTokensStart = 1;
          selectedTake = takes[0];
        }
      }

      const title = tokens.slice(titleTokensStart).join(' ').replace(/^["']|["']$/g, '').trim() ||
        `${selectedTake.trackName || 'Ableton'} Live Take`;

      addLog(
        'output',
        `[1/2] Packaging audio take [${selectedTake.takeId}] ("${title}")...\n` +
          `[2/2] Transmitting to https://johnwalls.studio/api/johnwalls/publish...`
      );

      const res = await stateBridge.publishTake(selectedTake.takeId, {
        title,
        artist: 'John Walls',
        description: `Captured live from Ableton Live session ("${selectedTake.trackName}") at ${selectedTake.bpm} BPM.`,
        visualizerPreset: 'supercollider-lissajous',
        targetUrl: 'https://johnwalls.studio/api/johnwalls/publish'
      });

      if (res.ok) {
        addLog(
          'output',
          `✓ TRACK PUBLISHED SUCCESSFULLY TO JOHNWALLS.STUDIO!\n` +
            `  Title:       ${title}\n` +
            `  Take ID:     ${selectedTake.takeId}\n` +
            `  Public URL:  ${res.publicUrl || 'https://johnwalls.studio'}\n` +
            `  Listen Live: https://johnwalls.studio/studio\n` +
            `  Visualizer:  SuperCollider Lissajous (Dynamic Audio-Reactive)`
        );
      } else {
        addLog('error', `Publish failed: ${res.error || 'Server error'}`);
      }
    }).catch((err: any) => addLog('error', `Publish Error: ${err?.message || String(err)}`));
    return;
  }

  if (verb === 'push' || verb === 'deploy' || verb === 'autopush') {
    const targetUrl = tokens[1] || 'https://johnwalls.studio/api/johnwalls/deploy';
    addLog(
      'output',
      `🚀 [1/3] Kicking off johnwalls.studio auto-push & build pipeline...\n` +
        `   Target endpoint: ${targetUrl}`
    );
    stateBridge
      .deployStudioApp({ deployUrl: targetUrl })
      .then((res) => {
        if (res.ok) {
          addLog(
            'output',
            `✓ STUDIO WEB APP PUSHED & DEPLOYED SUCCESSFULLY!\n` +
              `  Public URL: ${res.publicUrl || 'https://johnwalls.studio/app'}\n` +
              `  Output:\n` +
              (res.output ? res.output.trim().split('\n').map((l) => '    ' + l).join('\n') : '    Deployed production web bundle cleanly.')
          );
        } else {
          addLog(
            'error',
            `Push failed: ${res.error || 'Server error'}\n` +
              (res.output ? `Output:\n${res.output}` : '')
          );
        }
      })
      .catch((err: any) => addLog('error', `Deploy Error: ${err?.message || String(err)}`));
    return;
  }

  if (verb === 'routing' || verb === 'route') {
    setIsRoutingModalOpen(true);
    addLog('output', 'Opened Universal Studio Signal Flow & Routing Matrix.');
    return;
  }

  if (verb === 'state' || verb === 'cockpit') {
    const sub = tokens[1]?.toLowerCase();
    if (sub === 'card') {
      tokens[0] = 'card';
      tokens[1] = 'status';
    } else {
      handleSelectWorkspace('state', true);
      addLog('output', 'Switched active workspace to STATE Cockpit.');
      return;
    }
  }

  if (
    verb === 'hardware' ||
    verb === 'hw' ||
    verb === 'devices' ||
    verb === 'card' ||
    (verb === 'export' && tokens[1]?.toLowerCase() === 'card') ||
    (verb === 'sync' && (tokens[1]?.toLowerCase() === 'hardware' || tokens[1]?.toLowerCase() === 'hw' || !tokens[1]))
  ) {
    let sub = (verb === 'export' ? 'export' : verb === 'sync' ? 'sync' : tokens[1]?.toLowerCase() || 'status');
    if (verb === 'card' && tokens[1]?.toLowerCase() === 'export') sub = 'export';
    if (verb === 'card' && (!tokens[1] || tokens[1]?.toLowerCase() === 'status')) sub = 'status';

    if (sub === 'status' || sub === 'check' || sub === 'list') {
      stateBridge.getHardwareStatus().then((hw) => {
        const sp = hw.sp404;
        const rc = hw.rc600;

        let spInfo = '  Card:          NOT DETECTED (Insert FAT32 SD card into laptop)';
        if (sp.mounted) {
          const freeGb = (sp.freeBytes / (1024 * 1024 * 1024)).toFixed(1);
          const totalGb = (sp.totalBytes / (1024 * 1024 * 1024)).toFixed(1);
          spInfo =
            `  Card:          MOUNTED (${sp.volumeName} at ${sp.mountPath})\n` +
            `  Capacity:      ${freeGb} GB Free / ${totalGb} GB Total (FAT32)\n` +
            `  Sample Engine: ${sp.sampleCount || 72} native chops (Roland RLND chunks, Banks A-F)\n` +
            `  Master Backing:Pad 1 across Banks A-F assigned to Full Drums & Bass Master\n` +
            `  Import Ready:  ${sp.hasRolandImport ? 'YES (ROLAND/IMPORT/ synchronized)' : 'READY ON SYNC'}`;
        }

        let rcInfo = '  USB Storage:   NOT DETECTED (Connect USB & set [MENU] -> [STORAGE] -> CONNECTED)';
        if (rc.mounted) {
          const freeGb = (rc.freeBytes / (1024 * 1024 * 1024)).toFixed(1);
          const totalGb = (rc.totalBytes / (1024 * 1024 * 1024)).toFixed(1);
          rcInfo =
            `  USB Storage:   CONNECTED (${rc.volumeName} at ${rc.mountPath})\n` +
            `  Capacity:      ${freeGb} GB Free / ${totalGb} GB Total\n` +
            `  Audio Tracks:  ${rc.trackCount || 18} tracks across Memories 001..006 (32-bit float stereo)\n` +
            `  Assignments:   Trk 1: Drums | Trk 2: Bass | Trk 3: Guitars & Instruments`;
        }

        addLog(
          'output',
          `=== STUDIO HARDWARE & SYNCHRONIZATION STATUS ===\n\n` +
          `[Roland SP-404SX / SP-404A Sampler]\n` +
          `${spInfo}\n\n` +
          `[Boss RC-600 Loop Station]\n` +
          `${rcInfo}\n\n` +
          `[MIDI Interconnect Topology]\n` +
          `  Wiring:        RC-600 MIDI OUT (DIN 5-Pin) -> SP-404SX MIDI IN (DIN 5-Pin)\n` +
          `  RC-600 Role:   Master Beat Clock & Footswitch Note-out\n` +
          `  SP-404SX Role: Slave Sound Module (MIDI Ch 1, Note 47 = Bank A Pad 1 Drums & Bass)\n` +
          `  Tempo Lock:    SP-404SX auto-syncs playback rate to RC-600 BPM\n\n` +
          `Commands: 'hardware sync [all|sp404|rc600]', 'card export'`
        );
      }).catch((err: any) => addLog('error', `Hardware Status Error: ${err?.message || String(err)}`));
      return;
    }

    if (sub === 'sync' || sub === 'export' || sub === 'write') {
      const target = (tokens[2]?.toLowerCase() === 'sp404' || tokens[1]?.toLowerCase() === 'sp404')
        ? 'sp404'
        : (tokens[2]?.toLowerCase() === 'rc600' || tokens[1]?.toLowerCase() === 'rc600')
        ? 'rc600'
        : 'all';

      addLog('output', `Starting hardware synchronization (Target: ${target.toUpperCase()})...`);
      stateBridge.syncHardware({ target }).then((res) => {
        if (!res.ok) {
          addLog('error', `Hardware Sync Failed: ${res.error || res.message}`);
          return;
        }
        const mbWritten = (res.bytesWritten / (1024 * 1024)).toFixed(1);
        let details = '';
        if (res.sp404) {
          details += `  SP-404SX:            ${res.sp404.samplesExported || 72} samples with RLND chunks -> ${res.sp404.mountPath}\n`;
        }
        if (res.rc600) {
          details += `  Boss RC-600:         ${res.rc600.tracksExported || 18} 32-bit float tracks (Mem 001..006) -> ${res.rc600.mountPath}\n`;
        }
        if (!details) {
          details = `  Summary:             ${res.message}\n`;
        }

        addLog(
          'output',
          `=== HARDWARE SYNCHRONIZATION COMPLETED ===\n` +
          details +
          `  Data Transferred:    ${mbWritten} MB\n` +
          `  Master Track (Pad 1):Full-length Drums & Bass backing master loaded\n` +
          `  Metadata Hygiene:    Cleaned macOS dot-underscore files via dot_clean\n` +
          `  Status:              READY FOR PERFORMANCE & HARDWARE USE`
        );
      }).catch((err: any) => addLog('error', `Hardware Sync Error: ${err?.message || String(err)}`));
      return;
    }
  }

  if (verb === 'bounce') {
    const sub = tokens[1]?.toLowerCase() || 'list';

    if (sub === 'list' || sub === 'inspect' || sub === 'tracks') {
      const alsPath = tokens[2] || '';
      if (alsPath) {
        addLog('output', `Inspecting Ableton project: ${alsPath}...`);
      } else {
        addLog('output', 'Detecting active Ableton Live project & session state...');
      }
      stateBridge.listAlsProject(alsPath).then((res) => {
        if (!res.ok) {
          addLog('error', `Failed to inspect project: ${res.output}`);
          return;
        }
        addLog('output', res.output);
      }).catch((err: any) => addLog('error', `Bounce List Error: ${err?.message || String(err)}`));
      return;
    }

    if (sub === 'status' || sub === 'host') {
      stateBridge.getAbletonStatus().then((st) => {
        const runStr = st.liveRunning ? `RUNNING (PID: ${st.livePid})` : 'NOT RUNNING';
        const actDoc = st.activeDocument ? `${st.activeDocument}${st.isDefaultSet ? ' (Untitled / Default Set)' : ''}` : 'None detected';
        let out = `=== ABLETON LIVE HOST STATUS ===\n  Process:         ${runStr}\n  Active Document: ${actDoc}\n`;
        if (st.recentProjects && st.recentProjects.length > 0) {
          out += `\n=== RECENT / ARCHIVED PROJECTS ===\n`;
          st.recentProjects.forEach((p: string, i: number) => {
            out += `  [${i + 1}] ${p}\n`;
          });
        }
        addLog('output', out);
      }).catch((err: any) => addLog('error', `Ableton Status Error: ${err?.message || String(err)}`));
      return;
    }

    if (sub === 'open') {
      const target = tokens[2] || '';
      if (!target) {
        addLog('error', 'Usage: bounce open <number|path> (e.g. "bounce open 1")');
        return;
      }
      addLog('output', `Opening project in Ableton Live: ${target}...`);
      stateBridge.openAlsProject(target).then((res) => {
        if (!res.ok) {
          addLog('error', `Failed to open project: ${res.output}`);
          return;
        }
        addLog('output', res.output || `Project opened in Ableton Live.`);
      }).catch((err: any) => addLog('error', `Bounce Open Error: ${err?.message || String(err)}`));
      return;
    }

    if (sub === 'song' || sub === 'auto') {
      const slot = parseInt(tokens[2], 10) || 6;
      const alsPath = tokens[3] || '';
      const targetLabel = alsPath ? `from ${alsPath}` : 'from active/default Ableton project';
      addLog('output', `Starting multi-track bounce for Song Slot ${slot} ${targetLabel}...\n  Rendering: Trk 1 (Drums), Trk 2 (Bass), Trk 3 (Guitars/Inst)...`);
      stateBridge.bounceAlsGroup({ als: alsPath, autoSong: slot }).then((res) => {
        if (!res.ok) {
          addLog('error', `Song Bounce Failed: ${res.error || res.message}`);
          return;
        }
        const mbWritten = (res.bytesWritten / (1024 * 1024)).toFixed(1);
        addLog(
          'output',
          `=== ABLETON STEM BOUNCE COMPLETED & PATCHED ===\n` +
          `  Project:             ${res.project} (${res.bpm} BPM)\n` +
          `  Master Length:       ${res.songDurationSeconds?.toFixed(1)}s (100% time-synchronized with leading silence preserved)\n` +
          `  RC-600 Target:       Memory Slot ${res.memorySlot} (/Volumes/RC-600/ROLAND/WAVE/)\n` +
          `  Stems Rendered:\n` +
          `    - Track 1: Drums & Percussion (32-bit float stereo)\n` +
          `    - Track 2: Bass (32-bit float stereo)\n` +
          `    - Track 3: Guitars & Instruments (32-bit float stereo)\n` +
          `  Data Transferred:    ${mbWritten} MB\n` +
          `  Status:              READY FOR HARDWARE PERFORMANCE`
        );
      }).catch((err: any) => addLog('error', `Song Bounce Error: ${err?.message || String(err)}`));
      return;
    }

    if (sub === 'group' || sub === 'track') {
      let groupNames = tokens[2] || 'Drums';
      let slot = 6;
      let trk = 1;
      let alsPath = '';

      for (let i = 3; i < tokens.length; ++i) {
        if ((tokens[i] === '--slot' || tokens[i] === '-s') && tokens[i+1]) slot = parseInt(tokens[i+1], 10);
        if ((tokens[i] === '--track' || tokens[i] === '-t') && tokens[i+1]) trk = parseInt(tokens[i+1], 10);
        if ((tokens[i] === '--als' || tokens[i] === '-a') && tokens[i+1]) alsPath = tokens[i+1];
      }

      addLog('output', `Bouncing group "${groupNames}" from ${alsPath} -> RC-600 Memory ${slot} Trk ${trk}...`);
      stateBridge.bounceAlsGroup({ als: alsPath, groups: groupNames, memory: slot, rc600Track: trk }).then((res) => {
        if (!res.ok) {
          addLog('error', `Group Bounce Failed: ${res.error || res.message}`);
          return;
        }
        const mbWritten = (res.bytesWritten / (1024 * 1024)).toFixed(1);
        addLog(
          'output',
          `=== GROUP BOUNCE COMPLETED & PATCHED ===\n` +
          `  Project:             ${res.project} (${res.bpm} BPM)\n` +
          `  Groups:              ${res.groups?.join(', ')}\n` +
          `  Clips Rendered:      ${res.clipsRendered}\n` +
          `  Duration:            ${res.durationSeconds?.toFixed(2)}s\n` +
          `  Peak Level:          ${res.peakDb?.toFixed(1)} dBFS\n` +
          `  RC-600 Target:       ${res.rc600Path || 'Local output only'}\n` +
          `  Data Transferred:    ${mbWritten} MB\n` +
          `  Status:              READY FOR HARDWARE USE`
        );
      }).catch((err: any) => addLog('error', `Group Bounce Error: ${err?.message || String(err)}`));
      return;
    }

    addLog('error', 'Usage: bounce <list [als_path] | song <slot_number> [als_path] | group <group_name> [--slot N] [--track 1-3] [--als path]>');
    return;
  }

  if (verb === 'sp404' || verb === 'chop') {
    const sub = tokens[1]?.toLowerCase();

    if (!sub || sub === 'help' || sub === 'status') {
      handleSelectWorkspace('sp404', true);
      addLog(
        'output',
        `=== ROLAND SP-404 SAMPLE FINDER & CHOP LOADER ===\n\n` +
        `[Quick Commands]\n` +
        `  sp404 find <track_name>                Find all split waveforms & clips on track\n` +
        `  sp404 grab <track> <n> [-b A] [-p 1]   Grab nth instance of split form & load to pad\n` +
        `  sp404 pattern <track> [-b A] [-c 12]   Generate 12-pad pattern chop kit across bank\n` +
        `  sp404 card                             Check mounted Roland SD card status\n\n` +
        `Examples:\n` +
        `  sp404 find "Chop Sample"\n` +
        `  sp404 find "Sean Beatbox"\n` +
        `  sp404 grab "Sean Beatbox" 15 --bank A --pad 1\n` +
        `  sp404 pattern "Sean Beatbox" --bank A`
      );
      return;
    }

    if (sub === 'find' || sub === 'list' || sub === 'search' || sub === 'inspect') {
      const trackName = tokens[2] || 'Chop Sample';
      let alsPath = '';
      for (let i = 3; i < tokens.length; ++i) {
        if ((tokens[i] === '--als' || tokens[i] === '-a') && tokens[i+1]) alsPath = tokens[i+1];
      }

      addLog('output', `Searching split forms on track "${trackName}"...`);
      stateBridge.findSp404Samples(trackName, alsPath).then((res) => {
        if (!res.ok) {
          addLog('error', `Sample Finder Error: ${res.error}`);
          return;
        }
        const d = res.data;
        let out =
          `=======================================================\n` +
          `SP-404 SAMPLE FINDER: TRACK "${d.track}"\n` +
          `Tempo: ${d.bpm} BPM | Total Splits: ${d.totalClips} (Distinct Shapes: ${d.distinctSplitForms})\n` +
          `=======================================================\n\n` +
          `Inst  Start (Beat)  Start (Time)  Duration    Peak     Repeats   Source File\n` +
          `--------------------------------------------------------------------------------\n`;

        d.instances.forEach((inst: any) => {
          const mark = inst.isAudible ? ' ' : '*';
          const rep = inst.repeatCount > 1 ? `x${inst.repeatCount}` : '1';
          const instStr = `#${inst.instance}`.padEnd(5);
          const sbStr = `${inst.startBeat.toFixed(2)}b`.padEnd(14);
          const stStr = `${inst.startTimeSec.toFixed(2)}s`.padEnd(14);
          const durStr = `${inst.durationSec.toFixed(2)}s`.padEnd(11);
          const pkStr = `${inst.peak.toFixed(3)}`.padEnd(9);
          const repStr = rep.padEnd(10);
          out += `${instStr}${mark} ${sbStr}${stStr}${durStr}${pkStr}${repStr}${inst.sourceFilename}\n`;
        });

        out += `\n[Legend: '*' = low energy / silent slice]\n`;
        out += `\n[Quick Commands]\n`;
        out += `  Grab nth instance:  sp404 grab "${d.track}" <n> --bank A --pad 1\n`;
        out += `  Make 12-pad kit:    sp404 pattern "${d.track}" --bank A\n`;
        addLog('output', out);
      }).catch((err: any) => addLog('error', `Sample Finder Error: ${err?.message || String(err)}`));
      return;
    }

    if (sub === 'grab' || sub === 'slice' || sub === 'load') {
      const trackName = tokens[2] || 'Chop Sample';
      const instanceNum = parseInt(tokens[3], 10) || 1;
      let bank = 'A';
      let pad = 1;
      let alsPath = '';
      let patchCard = false;

      for (let i = 4; i < tokens.length; ++i) {
        if ((tokens[i] === '--bank' || tokens[i] === '-b') && tokens[i+1]) bank = tokens[i+1].toUpperCase();
        if ((tokens[i] === '--pad' || tokens[i] === '-p') && tokens[i+1]) pad = parseInt(tokens[i+1], 10);
        if ((tokens[i] === '--als' || tokens[i] === '-a') && tokens[i+1]) alsPath = tokens[i+1];
        if (tokens[i] === '--card' || tokens[i] === '--patch-card') patchCard = true;
      }

      addLog('output', `Grabbing instance #${instanceNum} of "${trackName}" -> Bank ${bank} Pad ${pad}...`);
      stateBridge.grabSp404Sample({ track: trackName, instance: instanceNum, bank, pad, als: alsPath, patchCard }).then(async (res) => {
        if (!res.ok) {
          addLog('error', `Sample Grab Failed: ${res.error}`);
          return;
        }

        if (res.wavBase64) {
          await sp404AudioEngine.loadSampleBase64(res.bank as BankLetter, res.padId, res.wavBase64, res.label);
        }

        let cardMsg = '';
        if (res.cardPatched) {
          cardMsg = `  Roland SD Card:      PATCHED -> ${res.cardPath}\n`;
        }

        addLog(
          'output',
          `=== SP-404 SAMPLE EXTRACTED & LOADED ===\n` +
          `  Track:               ${res.track} (Instance #${res.instance})\n` +
          `  Target Pad:          Bank ${res.bank} Pad ${res.padId} (Sample Index: ${res.sampleIndex})\n` +
          `  Label:               "${res.label}"\n` +
          `  Edited Length:       ${res.durationSec.toFixed(3)}s (${res.durationBeats} beats)\n` +
          `  Peak Amplitude:      ${res.peak.toFixed(3)}\n` +
          `  File Saved:          ${res.filePath}\n` +
          cardMsg +
          `  Status:              LOADED INTO SP-404 ENGINE & READY TO PLAY`
        );
      }).catch((err: any) => addLog('error', `Sample Grab Error: ${err?.message || String(err)}`));
      return;
    }

    if (sub === 'pattern' || sub === 'kit') {
      const trackName = tokens[2] || 'Chop Sample';
      let bank = 'A';
      let count = 12;
      let alsPath = '';
      let patchCard = false;

      for (let i = 3; i < tokens.length; ++i) {
        if ((tokens[i] === '--bank' || tokens[i] === '-b') && tokens[i+1]) bank = tokens[i+1].toUpperCase();
        if ((tokens[i] === '--count' || tokens[i] === '-c') && tokens[i+1]) count = parseInt(tokens[i+1], 10);
        if ((tokens[i] === '--als' || tokens[i] === '-a') && tokens[i+1]) alsPath = tokens[i+1];
        if (tokens[i] === '--card' || tokens[i] === '--patch-card') patchCard = true;
      }

      addLog('output', `Creating ${count}-pad pattern chop kit from "${trackName}" on Bank ${bank}...`);
      stateBridge.makeSp404Pattern({ track: trackName, bank, count, als: alsPath, patchCard }).then(async (res) => {
        if (!res.ok) {
          addLog('error', `Pattern Kit Creation Failed: ${res.error}`);
          return;
        }

        if (Array.isArray(res.pads)) {
          for (const p of res.pads) {
            if (p.wavBase64) {
              await sp404AudioEngine.loadSampleBase64(p.bank as BankLetter, p.pad, p.wavBase64, p.label);
            }
          }
        }

        let padSummary = '';
        res.pads?.forEach((p: any) => {
          padSummary += `    - Pad ${String(p.pad).padStart(2, '0')}: "${p.label}" (${p.durationSec.toFixed(2)}s)\n`;
        });

        addLog(
          'output',
          `=== SP-404 PATTERN CHOP KIT CREATED ===\n` +
          `  Track:               ${res.track}\n` +
          `  Target Bank:         Bank ${res.bank} (Pads 1..${res.padCount})\n` +
          `  Tempo:               ${res.bpm} BPM\n` +
          `  Pattern Length:      ${res.totalDurationSec.toFixed(2)}s (${res.totalDurationBeats} beats)\n` +
          `  Pattern JSON:        ${res.patternFile}\n` +
          `  Pads Hydrated:\n` +
          padSummary +
          `  Status:              FULL 12-PAD BANK HYDRATED & READY TO TRIGGER`
        );
      }).catch((err: any) => addLog('error', `Pattern Kit Error: ${err?.message || String(err)}`));
      return;
    }
  }

  if (verb === 'sc' || verb === 'supercollider') {
    const sub = tokens[1]?.toLowerCase();
    if (!sub || sub === 'status') {
      stateBridge.getSuperColliderStatus().then((res: SuperColliderServerStatus | null) => {
        if (!res) {
          addLog('output', 'SuperCollider: plugin not reachable.');
          return;
        }
        addLog(
          'output',
          `=== SuperCollider Server ===\n  Status: ${res.statusText}\n  Port: ${res.port} | PID: ${res.pid}\n  CPU: ${res.avgCPU.toFixed(1)}% (Peak: ${res.peakCPU.toFixed(1)}%)\n  Synths: ${res.numSynths} | Nodes: ${res.numNodes} | SR: ${res.sampleRate}\n  Binary: ${res.binaryPath || 'not found'}\n  Visual patch: ${res.visualRunning ? 'running' : 'stopped'}${res.lastError ? `\n  Error: ${res.lastError}` : ''}`
        );
      }).catch((err: any) => addLog('error', `SC Status Error: ${err?.message || String(err)}`));
    } else if (sub === 'boot') {
      stateBridge.bootSuperCollider().then((res: SuperColliderServerStatus) => {
        addLog(res.lastError && !res.isBooting && !res.isRunning ? 'error' : 'output', res.lastError && !res.isBooting && !res.isRunning ? `SuperCollider boot failed: ${res.lastError}` : `SuperCollider: ${res.statusText} (Port: ${res.port}). Run 'sc status' to confirm it is up.`);
      }).catch((err: any) => addLog('error', `SC Boot Error: ${err?.message || String(err)}`));
    } else if (sub === 'kill') {
      stateBridge.killSuperCollider().then(() => {
        addLog('output', 'SuperCollider Server Stopped.');
      }).catch((err: any) => addLog('error', `SC Kill Error: ${err?.message || String(err)}`));
    } else if (sub === 'test') {
      stateBridge.sendSuperColliderAction('testTone').then((res: SuperColliderServerStatus) => {
        addLog(res.lastError ? 'error' : 'output', res.lastError || 'Sent 440Hz test tone to scsynth (plays on your system output).');
      }).catch((err: any) => addLog('error', `SC Test Tone Error: ${err?.message || String(err)}`));
    } else if (sub === 'free') {
      stateBridge.sendSuperColliderAction('freeAll').then((res: SuperColliderServerStatus) => {
        addLog(res.lastError ? 'error' : 'output', res.lastError || 'Sent /g_freeAll (free all active nodes) to scsynth.');
      }).catch((err: any) => addLog('error', `SC Free Error: ${err?.message || String(err)}`));
    } else if (sub === 'visual' || sub === 'gui' || sub === 'window') {
      const preset = tokens[2]?.toLowerCase() || 'lissajous';
      stateBridge.runVisual(preset).then((res: SuperColliderServerStatus) => {
        addLog(
          res.lastError ? 'error' : 'output',
          res.lastError || `Launched SuperCollider Native Visualizer Window (Preset: ${preset}). Window fronted at 60 FPS.`
        );
      }).catch((err: any) => addLog('error', `SC Visual Error: ${err?.message || String(err)}`));
    } else if (sub === 'stopvisual' || sub === 'closevisual') {
      stateBridge.sendSuperColliderAction('stopVisual').then((res: SuperColliderServerStatus) => {
        addLog(res.lastError ? 'error' : 'output', res.lastError || 'SuperCollider Visualizer Window closed.');
      }).catch((err: any) => addLog('error', `SC Stop Visual Error: ${err?.message || String(err)}`));
    } else if (sub === 'modal' || sub === 'view') {
      setVisualizerTake(null);
      setIsVisualizerOpen(true);
      addLog('output', 'Opened in-plugin Real-Time Visualizer Modal.');
    } else {
      addLog('error', 'Usage: sc <boot|kill|status|test|free|visual [preset]|stopvisual|modal>');
    }
    return;
  }

  if (verb === 'visual' || verb === 'visualizer' || verb === 'scope3d') {
    const sub = tokens[1]?.toLowerCase();
    if (sub === 'native' || sub === 'gui' || sub === 'window') {
      const patch = tokens[2]?.toLowerCase() || 'lissajous';
      stateBridge.runVisual(patch).then((res: SuperColliderServerStatus) => {
        addLog(
          res.lastError ? 'error' : 'output',
          res.lastError || `Launched SuperCollider Native Visualizer Window (Preset: ${patch}).`
        );
      }).catch((err: any) => addLog('error', `SC Visual Error: ${err?.message || String(err)}`));
    } else {
      setVisualizerTake(null);
      setIsVisualizerOpen(true);
      addLog('output', 'Opened in-plugin Real-Time Audio-Reactive Visualizer Modal.');
    }
    return;
  }

  if (verb === 'midi' || verb === 'reactive') {
    const sub = tokens[1]?.toLowerCase();
    if (!sub || sub === 'status' || sub === 'monitor') {
      const noteName = getMidiNoteName(telemetry.lastMidiNote);
      const vel = telemetry.lastMidiVelocity || 0;
      const velFrac = Math.min(1, Math.max(0, vel / 127));
      const velBar = '█'.repeat(Math.round(velFrac * 12)) + '░'.repeat(12 - Math.round(velFrac * 12));
      addLog(
        'output',
        `=== ABLETON LIVE MIDI MONITOR ===\n` +
          `  Status:          ${telemetry.isMidiActive ? 'ACTIVE' : 'IDLE'}\n` +
          `  MIDI Channel:    ${telemetry.lastMidiChannel || 1}\n` +
          `  Last Note:       ${noteName} (${telemetry.lastMidiNote || 0})\n` +
          `  Last Velocity:   ${vel} [${velBar}]\n` +
          `  Total Events:    ${telemetry.totalMidiEvents || 0}\n` +
          `  Reactive Engine: ${telemetry.reactiveMidi?.enabled ? 'ENGAGED' : 'BYPASSED'}\n\n` +
          `Tip: Type 'midi rules' or 'midi on' / 'midi off'.`
      );
      return;
    }
    if (sub === 'rules') {
      stateBridge.fetchReactiveMidiRules().then((rules) => {
        const ruleList = rules.map((r, i) => `  [${i + 1}] ${r.name} (${r.enabled ? 'ACTIVE' : 'MUTED'} | When [${r.sourceTrackFilter}] is ${r.triggerRhythm} -> ${r.actionType})`).join('\n');
        addLog(
          'output',
          `=== REACTIVE MIDI RULES (${rules.length}) ===\n${ruleList}`
        );
      }).catch((err) => addLog('error', `MIDI Error: ${err?.message || String(err)}`));
      return;
    } else if (sub === 'on' || sub === 'enable') {
      stateBridge.setReactiveMidiEnabled(true).then(() => {
        addLog('output', 'Reactive MIDI Engine ENGAGED (Observing all DAW tracks).');
      });
      return;
    } else if (sub === 'off' || sub === 'disable' || sub === 'bypass') {
      stateBridge.setReactiveMidiEnabled(false).then(() => {
        addLog('output', 'Reactive MIDI Engine BYPASSED.');
      });
      return;
    } else if (sub === 'preset') {
      const num = tokens[2];
      if (num === '1') {
        stateBridge.setReactiveMidiRules([
          {
            id: 'rule_bass_1_4',
            name: 'Bass 1/4 ➔ Lead 1/16 Running Arp',
            enabled: true,
            sourceTrackFilter: 'bass',
            triggerRhythm: '1/4',
            actionType: 'arp_1_16',
            param: 1.0,
            scOscAddress: '/state/rhythm'
          },
          {
            id: 'rule_bass_1_16',
            name: 'Bass 1/16 ➔ Lead 1/4 Offbeat Stabs',
            enabled: true,
            sourceTrackFilter: 'bass',
            triggerRhythm: '1/16',
            actionType: 'stabs_1_4',
            param: 1.0,
            scOscAddress: '/state/rhythm'
          }
        ]).then(() => {
          stateBridge.setReactiveMidiEnabled(true);
          addLog('output', 'Applied Reactive Preset 1: Bass 1/4 ➔ 1/16 Arp | Bass 1/16 ➔ 1/4 Stabs.');
        });
      } else if (num === '2') {
        stateBridge.setReactiveMidiRules([
          {
            id: 'rule_drum_ratchet',
            name: 'Drums 1/16 ➔ 4x Trap Ratchet Burst',
            enabled: true,
            sourceTrackFilter: 'drum',
            triggerRhythm: '1/16',
            actionType: 'ratchet_4x',
            param: 4.0,
            scOscAddress: '/state/ratchet'
          }
        ]).then(() => {
          stateBridge.setReactiveMidiEnabled(true);
          addLog('output', 'Applied Reactive Preset 2: Drums ➔ Trap 4x Ratchets.');
        });
      } else {
        addLog('error', 'Usage: midi preset <1|2>');
      }
      return;
    } else {
      addLog('error', 'Usage: midi <status|on|off|rules|preset <1|2>>');
      return;
    }
  }

  if (verb === 'transport' || verb === 'playhead') {
    const transportStr = telemetry.isPlaying ? '▶ PLAYING' : '⏸ STOPPED';
    const ppqStr = telemetry.ppqPosition ? telemetry.ppqPosition.toFixed(2) : '0.00';
    addLog(
      'output',
      `=== ABLETON LIVE TRANSPORT & TIMING ===\n` +
        `  Transport:      ${transportStr}\n` +
        `  Tempo:          ${telemetry.bpm.toFixed(2)} BPM\n` +
        `  Time Signature: ${telemetry.timeSigNum || 4}/${telemetry.timeSigDen || 4}\n` +
        `  Bar Position:   Bar ${telemetry.barNumber}\n` +
        `  Beat / PPQ:     ${ppqStr} PPQ\n` +
        `  Host Track:     "${telemetry.currentTrackName || 'Master'}"\n` +
        `  Audio Host:     Ableton Live (VST3/AU)`
    );
    return;
  }

  if (verb === 'tracks' || verb === 'session') {
    stateBridge.getSessionTracks().then((tracks: AbletonTrackInfo[]) => {
      const lines = tracks
        .map(
          (t: AbletonTrackInfo, i: number) =>
            `  • [${i + 1}] "${t.trackName}" (${t.trackType.toUpperCase()}) | MIDI Ch: ${t.midiChannel} | Events: ${t.totalMidiEvents} | Last Note: ${t.lastNoteNumber > 0 ? getMidiNoteName(t.lastNoteNumber) + ' (' + t.lastNoteNumber + ')' : 'None'} | Peak: ${t.peakDb.toFixed(1)} dB`
        )
        .join('\n');
      addLog(
        'output',
        `=== ABLETON LIVE SESSION TRACKS (${tracks.length}) ===\n${lines || '  (No other active tracks detected - load johnwalls.studio on other tracks to link)'}`
      );
    }).catch((err: any) => addLog('error', `Tracks Error: ${err?.message || String(err)}`));
    return;
  }

  if (verb === 'inspect' || verb === 'solo') {
    const target = tokens[1]?.toLowerCase();
    if (!target || target === 'master') {
      setInspectedNodeId('master');
      addLog('output', 'Solo oscilloscope routed to MASTER OUT.');
    } else if (currentPedals.some((p) => p.id === target)) {
      setInspectedNodeId(target);
      addLog('output', `Solo oscilloscope routed to [${target}].`);
    } else {
      addLog('error', `Node '${target}' not found. Available: master, ${currentPedals.map((p) => p.id).join(', ')}`);
    }
    return;
  }

  if (verb === 'placement') {
    const mode = tokens[1]?.toLowerCase();
    if (mode === 'inbound' || mode === 'outbound') {
      handleToggleAmpPlacement();
    } else {
      addLog('error', 'Usage: placement <outbound|inbound>');
    }
    return;
  }

  if (verb === 'preset' || verb === 'library') {
    const action = tokens[1]?.toLowerCase();
    if (!action || action === 'list') {
      const userList = userPresets.map((p, i) => `  [User ${i + 1}] ${p.name} (${p.pedals.length} units)`).join('\n');
      const factoryList = FACTORY_PRESETS.map((p, i) => `  [Factory ${i + 1}] ${p.name}`).join('\n');
      addLog('output', `=== STUDIO RACK LIBRARY ===\nUser Patches:\n${userList || '  (None)'}\n\nFactory Profiles:\n${factoryList}\n\nTip: Type 'library pedals' to browse individual pedals or 'library open' for GUI.`);
    } else if (action === 'pedals' || action === 'catalog') {
      const pedals = getAllLibraryPedals();
      const list = pedals
        .map((p, i) => `  [${i + 1}] ${p.title} (${p.category.toUpperCase()}): ${p.subtitle}`)
        .join('\n');
      addLog('output', `=== PEDAL & AMPLIFIER LIBRARY (${pedals.length} PRESETS) ===\n${list}\n\nType 'library add <title>' to load onto active board.`);
    } else if (action === 'add') {
      const query = tokens.slice(2).join(' ').toLowerCase();
      if (!query) {
        addLog('error', 'Usage: library add <pedal name or keyword>');
        return;
      }
      const pedals = getAllLibraryPedals();
      const match = pedals.find(
        (p) => p.title.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)
      );
      if (match) {
        handleAddPedalFromLibrary(match);
      } else {
        addLog('error', `No library pedal matched '${query}'. Run 'library pedals' to browse all.`);
      }
    } else if (action === 'open') {
      setIsPedalLibraryOpen(true);
      addLog('output', 'Opened Pedal & Amplifier Library in GUI.');
    } else if (action === 'save') {
      const name = tokens.slice(2).join(' ') || 'User Patch';
      handleSaveUserPreset(name);
    } else {
      const match = FACTORY_PRESETS.find(
        (p) => p.id.includes(action) || p.name.toLowerCase().includes(action)
      ) || userPresets.find((p) => p.name.toLowerCase().includes(action));
      if (match) {
        handleApplyRackPreset(match);
      } else {
        addLog('error', `Unknown preset or library action: '${tokens[1]}'. Type 'library list', 'library pedals', or 'library add <name>'.`);
      }
    }
    return;
  }

  if (verb === 'status' || verb === 'state' || verb === 'report') {
    const peak = telemetry.peakDb ?? -60;
    const rms = telemetry.rmsDb ?? -60;
    const peakFrac = Math.max(0, Math.min(1, (peak + 60) / 60));
    const rmsFrac = Math.max(0, Math.min(1, (rms + 60) / 60));
    const peakBar = '█'.repeat(Math.round(peakFrac * 12)) + '░'.repeat(12 - Math.round(peakFrac * 12));
    const rmsBar = '█'.repeat(Math.round(rmsFrac * 12)) + '░'.repeat(12 - Math.round(rmsFrac * 12));
    const transportStr = telemetry.isPlaying ? '▶ PLAYING' : '⏸ STOPPED';
    const timeSigStr = `${telemetry.timeSigNum || 4}/${telemetry.timeSigDen || 4}`;
    const ppqStr = telemetry.ppqPosition ? telemetry.ppqPosition.toFixed(2) : '0.00';
    const noteName = getMidiNoteName(telemetry.lastMidiNote);
    const sensorsText = telemetry.sensors
      .map((s) => `    • [${s.id}] @${s.frequencyHz}Hz: hits: ${s.totalHits.toString().padStart(3)} | energy: ${(s.energy * 100).toFixed(0)}%`)
      .join('\n');

    addLog(
      'output',
      `=== ABLETON LIVE TELEMETRY DOSSIER ===\n` +
        `  TRANSPORT:     ${transportStr} at ${telemetry.bpm.toFixed(2)} BPM | TimeSig: ${timeSigStr}\n` +
        `  PLAYHEAD:      Bar ${telemetry.barNumber} | PPQ: ${ppqStr}\n` +
        `  HOST TRACK:    "${telemetry.currentTrackName || 'Master'}"\n` +
        `  AUDIO LEVELS:  Peak: ${peak > -60 ? peak.toFixed(1) : '-∞'} dBFS [${peakBar}] | RMS: ${rms > -60 ? rms.toFixed(1) : '-∞'} dBFS [${rmsBar}]\n` +
        `  MUSICAL STATE: ${telemetry.musicalState}\n` +
        `  MIDI IN:       Ch: ${telemetry.lastMidiChannel || 1} | Note: ${noteName} (${telemetry.lastMidiNote || 0}) | Total: ${telemetry.totalMidiEvents || 0} events\n` +
        `  SENSORS:       ${telemetry.sensors.length} active frequency detectors:\n${sensorsText}\n` +
        `  SUPERCOLLIDER: ${telemetry.supercollider?.isRunning ? `ACTIVE (Port ${telemetry.supercollider.port}, PID ${telemetry.supercollider.pid})` : 'OFFLINE'}`
    );
    return;
  }

  if (verb === 'audio' || verb === 'meters' || verb === 'levels') {
    const peak = telemetry.peakDb ?? -60;
    const rms = telemetry.rmsDb ?? -60;
    const peakFrac = Math.max(0, Math.min(1, (peak + 60) / 60));
    const rmsFrac = Math.max(0, Math.min(1, (rms + 60) / 60));
    const peakBar = '█'.repeat(Math.round(peakFrac * 16)) + '░'.repeat(16 - Math.round(peakFrac * 16));
    const rmsBar = '█'.repeat(Math.round(rmsFrac * 16)) + '░'.repeat(16 - Math.round(rmsFrac * 16));
    const scFrac = Math.max(0, Math.min(1, telemetry.sidechainRMS));
    const scBar = '█'.repeat(Math.round(scFrac * 16)) + '░'.repeat(16 - Math.round(scFrac * 16));

    const sensorBars = telemetry.sensors
      .map((s) => {
        const frac = Math.max(0, Math.min(1, s.energy));
        const bar = '█'.repeat(Math.round(frac * 10)) + '░'.repeat(10 - Math.round(frac * 10));
        return `    • [${s.id}] @${s.frequencyHz}Hz: hits: ${s.totalHits.toString().padStart(4)} | [${bar}] ${(s.energy * 100).toFixed(0)}%`;
      })
      .join('\n');

    addLog(
      'output',
      `=== LIVE AUDIO & SENSOR METERS ===\n` +
        `  Master Peak:   ${peak > -60 ? peak.toFixed(1).padStart(5) : ' -∞  '} dBFS [${peakBar}]\n` +
        `  Master RMS:    ${rms > -60 ? rms.toFixed(1).padStart(5) : ' -∞  '} dBFS [${rmsBar}]\n` +
        `  Sidechain RMS: ${telemetry.sidechainRMS.toFixed(2).padStart(5)}      [${scBar}]\n` +
        `  Sensory Channels:\n${sensorBars}`
    );
    return;
  }

  if (verb === 'rhythm') {
    const r = telemetry.reactiveMidi;
    addLog(
      'output',
      `=== RHYTHM & MUSICAL STATE ANALYZER ===\n` +
        `  Musical State:    ${telemetry.musicalState}\n` +
        `  Rhythm Pattern:   ${r?.rhythmPattern || 'idle'}\n` +
        `  Note Density:     ${r?.noteDensity ? r.noteDensity.toFixed(1) : '0.0'} hits/bar\n` +
        `  Avg Interval:     ${r?.avgIntervalBeats ? r.avgIntervalBeats.toFixed(2) : '0.00'} beats\n` +
        `  Dominant Register:${r?.dominantRegister === 0 ? 'Bass' : r?.dominantRegister === 1 ? 'Low-Mid' : r?.dominantRegister === 2 ? 'Mid' : 'High'}`
    );
    return;
  }

  if (verb === 'list') {
    const target = tokens[1]?.toLowerCase() || 'pedals';
    if (target === 'pedals') {
      const text = currentPedals
        .map((p, i) => `  [${i + 1}] ${p.id} (${p.type}) [${p.bypassed ? 'BYPASSED' : 'ACTIVE'}]`)
        .join('\n');
      addLog('output', `Active Pedal Chain (${currentPedals.length}):\n${text}`);
    } else if (target === 'modules' || target === 'flow') {
      const text = modules
        .map((m, i) => `  [${i + 1}] ${m.id} (${m.type}) "${m.title}" [${m.bypassed ? 'BYPASSED' : 'ACTIVE'}]`)
        .join('\n');
      addLog('output', `Studio Pipeline Flow (${modules.length} modules):\n${text}`);
    } else if (target === 'sensors') {
      const text = telemetry.sensors
        .map((s) => `  • [${s.id}] ${s.label}: ${s.type} @ ${s.frequencyHz}Hz (Hits: ${s.totalHits})`)
        .join('\n');
      addLog('output', `Active Sensory Channels (${telemetry.sensors.length}):\n${text}`);
    } else if (target === 'tracks' || target === 'session') {
      stateBridge.getSessionTracks().then((tracks: AbletonTrackInfo[]) => {
        const lines = tracks
          .map(
            (t: AbletonTrackInfo, i: number) =>
              `  • [${i + 1}] ${t.trackName} (${t.trackType.toUpperCase()}) | MIDI Ch: ${t.midiChannel} | Total Events: ${t.totalMidiEvents} | Peak: ${t.peakDb.toFixed(1)} dB`
          )
          .join('\n');
        addLog('output', `Detected Session Tracks (${tracks.length}):\n${lines || '  (No tracks detected)'}`);
      }).catch((err: any) => addLog('error', `Tracks Error: ${err?.message || String(err)}`));
    } else if (target === 'takes') {
      stateBridge.getRecentTakes().then((takes) => {
        const lines = takes
          .map(
            (t, i) =>
              `  [${i + 1}] ${t.takeId} | "${t.trackName}" | ${t.durationSeconds.toFixed(1)}s (${t.barCount} bars) | ${t.bpm} BPM`
          )
          .join('\n');
        addLog('output', `Recorded Audio Takes (${takes.length}):\n${lines || '  (No takes recorded)'}`);
      }).catch((err: any) => addLog('error', `Takes Error: ${err?.message || String(err)}`));
    }
    return;
  }

  if (verb === 'add') {
    const type = tokens[2]?.toLowerCase() as PedalType;
    if (type && ['delay', 'filter', 'drive', 'ducker', 'mesa', 'vox'].includes(type)) {
      handleAddPedal(type);
    } else {
      addLog('error', `Unknown pedal type: '${tokens[2]}'. Valid types: delay, filter, drive, ducker, mesa, vox.`);
    }
    return;
  }

  if (verb === 'bypass') {
    const id = tokens[1];
    if (currentPedals.some((p) => p.id === id)) {
      handleToggleBypass(id);
    } else {
      addLog('error', `Component '${id}' not found in active board.`);
    }
    return;
  }

  if (verb === 'set') {
    const target = tokens[1];
    const val = parseFloat(tokens[2]);
    if (target && !isNaN(val)) {
      const [id, param] = target.split('.');
      handleUpdateParam(id, param, val);
      addLog('output', `Set [${id}.${param}] = ${val}`);
    } else {
      addLog('error', 'Usage: set <node_id>.<param> <value>');
    }
    return;
  }

  addLog('error', `Unknown command: '${cmd}'. Type 'help' for instructions.`);
}
