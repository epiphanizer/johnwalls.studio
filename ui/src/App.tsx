import React, { useState, useEffect } from 'react';
import { PedalBoardCanvas } from './components/PedalBoardCanvas';
import { VirtualTerminal } from './components/VirtualTerminal';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { TopMenuBar } from './components/TopMenuBar';
import { StudioModuleFlowRibbon } from './components/StudioModuleFlowRibbon';
import { SP404Workstation } from './components/SP404Workstation';
import { StateWorkstation } from './components/StateWorkstation';
import { StudioWorkspaceModal, StudioWorkspace } from './components/StudioWorkspaceModal';
import { PedalLibraryModal } from './components/PedalLibraryModal';
import { StudioRoutingModal } from './components/StudioRoutingModal';
import { audioEngine } from './components/AudioEngineBridge';
import { sp404AudioEngine } from './components/SP404AudioEngine';
import { stateBridge } from './utils/stateBridge';
import {
  PedalInstance,
  PedalType,
  ReactiveRule,
  StateTelemetry,
  TerminalEntry,
  Parameter,
  RackPreset,
  StudioModule,
  StudioModuleType,
  StudioPedalBoardModule,
  StudioSP404Module,
  StudioStateModule,
  SuperColliderServerStatus,
  AbletonTrackInfo
} from './types';
import {
  loadUserPresets,
  saveUserPreset,
  deleteUserPreset,
  convertCurrentRackToPreset,
  FACTORY_PRESETS
} from './utils/rackLibrary';
import {
  LibraryPedalTemplate,
  instantiatePedalFromLibrary,
  saveUserPedalTemplate,
  getAllLibraryPedals
} from './utils/pedalLibrary';

const INITIAL_PEDALS: PedalInstance[] = [
  {
    id: 'dub_echo',
    type: 'delay',
    title: 'Dub Tape Echo',
    color: 'amber',
    bypassed: false,
    parameters: {
      time: { name: 'time', label: 'Time', value: 360, min: 20, max: 1200, step: 10, unit: 'ms' },
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

const INITIAL_RULES: ReactiveRule[] = [
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

const INITIAL_STUDIO_MODULES: StudioModule[] = [
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
    title: 'SP-404 MKII Sampler',
    bypassed: false
  },
  {
    id: 'state_1',
    type: 'state',
    title: 'State Cockpit',
    bypassed: false
  }
];

export const App: React.FC = () => {
  const [modules, setModules] = useState<StudioModule[]>(() => {
    try {
      const raw = localStorage.getItem('johnwalls_studio_modules');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return INITIAL_STUDIO_MODULES;
  });

  const [activeModuleId, setActiveModuleId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('johnwalls_active_module_id');
      if (saved) return saved;
    } catch {}
    return 'board_1';
  });

  const [rules, setRules] = useState<ReactiveRule[]>(INITIAL_RULES);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState<boolean>(false);
  const [userPresets, setUserPresets] = useState<RackPreset[]>(() => loadUserPresets());
  const [isScopeVisible, setIsScopeVisible] = useState<boolean>(true);
  const [inspectedNodeId, setInspectedNodeId] = useState<string>('master');
  const [isPedalLibraryOpen, setIsPedalLibraryOpen] = useState<boolean>(false);
  const [preselectedPedalToSaveId, setPreselectedPedalToSaveId] = useState<string | null>(null);
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('johnwalls_studio_modules', JSON.stringify(modules));
    } catch {}

    const sp404Index = modules.findIndex((m) => m.type === 'sp404');
    const boardIndex = modules.findIndex((m) => m.type === 'pedal_board');
    if (sp404Index !== -1 && boardIndex !== -1) {
      const order = sp404Index < boardIndex ? 'before' : 'after';
      const spBypassed = Boolean(modules[sp404Index]?.bypassed);
      try {
        audioEngine.routeSP404(order, sp404AudioEngine.getMasterGain(), spBypassed);
      } catch (err) {
        console.warn('SP-404 route update caught safely:', err);
      }
    }
  }, [modules]);

  useEffect(() => {
    try {
      localStorage.setItem('johnwalls_active_module_id', activeModuleId);
    } catch {}
  }, [activeModuleId]);

  // Derived current board information
  const activeModule = modules.find((m) => m.id === activeModuleId) || modules[0] || INITIAL_STUDIO_MODULES[0];
  const isBoardActive = activeModule.type === 'pedal_board';
  const currentBoard = isBoardActive ? (activeModule as StudioPedalBoardModule) : null;
  const currentPedals = currentBoard ? currentBoard.pedals : INITIAL_PEDALS;
  const currentAmpPlacement = currentBoard ? currentBoard.ampPlacement : 'outbound';
  const activeWorkspace: StudioWorkspace = activeModule.type === 'sp404' ? 'sp404' : activeModule.type === 'state' ? 'state' : 'pedal_lab';

  const updateCurrentBoard = (updater: (board: StudioPedalBoardModule) => StudioPedalBoardModule) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === activeModuleId && m.type === 'pedal_board') {
          return updater(m as StudioPedalBoardModule);
        }
        return m;
      })
    );
  };

  const [lastActiveModuleByType, setLastActiveModuleByType] = useState<Record<StudioModuleType, string>>(() => {
    try {
      const saved = localStorage.getItem('johnwalls_last_active_by_type');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      pedal_board: 'board_1',
      sp404: 'sp404_1',
      state: 'state_1'
    };
  });

  // Modal open on initial launch if workspace choice not yet configured
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('johnwalls_workspace_configured') !== 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const mod = modules.find((m) => m.id === activeModuleId);
    if (mod) {
      setLastActiveModuleByType((prev) => {
        const next = { ...prev, [mod.type]: mod.id };
        try {
          localStorage.setItem('johnwalls_last_active_by_type', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [activeModuleId, modules]);

  // Synchronize active pedal board parameters and amp placement whenever switching boards
  useEffect(() => {
    if (currentBoard) {
      audioEngine.updatePedalParams(currentBoard.pedals);
      audioEngine.setAmpPlacement(currentBoard.ampPlacement);
      audioEngine.syncRackToHost(currentBoard.pedals, currentBoard.ampPlacement);
    }
  }, [activeModuleId]);

  // Universal global keyboard listener for routing screen:
  // Alt+R / Option+R toggles routing everywhere.
  // 'R' / 'r' toggles routing when outside inputs and not in SP-404 pad trigger mode.
  // 'Escape' closes routing modal if open.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isInput) return;

      if (e.key === 'Escape' && isRoutingModalOpen) {
        setIsRoutingModalOpen(false);
        return;
      }

      const isRKey = e.key === 'r' || e.key === 'R';
      if (!isRKey) return;

      // Alt+R works unconditionally everywhere
      if (e.altKey) {
        e.preventDefault();
        setIsRoutingModalOpen((prev) => !prev);
        return;
      }

      // Plain 'R' works when not in SP-404 workspace (where 'r' plays pad 8)
      if (activeWorkspace !== 'sp404' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsRoutingModalOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRoutingModalOpen, activeWorkspace]);

  const handleSelectWorkspace = (ws: StudioWorkspace, remember: boolean = true) => {
    const targetType: StudioModuleType = ws === 'pedal_lab' ? 'pedal_board' : ws;
    const currentActive = modules.find((m) => m.id === activeModuleId);

    // If current active module is already of this workspace type, keep it!
    if (!currentActive || currentActive.type !== targetType) {
      const rememberedId = lastActiveModuleByType[targetType];
      const match =
        modules.find((m) => m.id === rememberedId) ||
        modules.find((m) => m.type === targetType);
      if (match) {
        setActiveModuleId(match.id);
      } else {
        handleAddModule(targetType);
      }
    }
    if (remember) {
      try {
        localStorage.setItem('johnwalls_active_workspace', ws);
        localStorage.setItem('johnwalls_workspace_configured', 'true');
      } catch {}
    }
  };

  const [telemetry, setTelemetry] = useState<StateTelemetry>({
    musicalState: 'STEADY_GROOVE',
    sidechainRMS: 0.45,
    bpm: 124,
    barNumber: 1,
    sensors: audioEngine.getSensoryChannels()
  });

  const [logs, setLogs] = useState<TerminalEntry[]>([
    {
      id: '1',
      timestamp: '18:04:10',
      type: 'system',
      content: 'johnwalls.studio Real-Time Audio Engine Active.\nAbleton Live Multi-Bus Linked. Waveform Scope active.'
    }
  ]);

  const handleSelectInspectNode = (nodeId: string) => {
    setInspectedNodeId(nodeId);
    audioEngine.sendInspectNodeToHost(nodeId);
  };

  useEffect(() => {
    // Start live audio engine and initialize SP-404 sampler upfront on the shared AudioContext
    audioEngine.startAudio().then(() => {
      sp404AudioEngine.initAudio(audioEngine.getAudioContext() || undefined).then(() => {
        const sp404Index = modules.findIndex((m) => m.type === 'sp404');
        const boardIndex = modules.findIndex((m) => m.type === 'pedal_board');
        if (sp404Index !== -1 && boardIndex !== -1) {
          const order = sp404Index < boardIndex ? 'before' : 'after';
          const spBypassed = Boolean(modules[sp404Index]?.bypassed);
          audioEngine.routeSP404(order, sp404AudioEngine.getMasterGain(), spBypassed);
        }
      });
    });

    audioEngine.setTelemetryCallback((t) => setTelemetry(t));
    // Decoupled from React state to avoid 60Hz DOM repaints and label flickering
    audioEngine.setModulationCallback((_nodeId, _depth) => {});
    audioEngine.setRules(rules);

    // Synchronize initial rack state directly with C++ audio processor host
    const initialBoard = (modules.find((m) => m.type === 'pedal_board') as StudioPedalBoardModule) || null;
    if (initialBoard) {
      audioEngine.syncRackToHost(initialBoard.pedals, initialBoard.ampPlacement);
    }

    const isFloatDiff = (current: number, target: unknown): target is number => {
      return typeof target === 'number' && Math.abs(current - target) > 0.05;
    };

    // Synchronize parameter automation incoming from Ableton Live host (only on genuine changes)
    audioEngine.setHostParametersCallback((hostParams) => {
      setModules((prevModules) => {
        let anyChanged = false;
        const nextModules = prevModules.map((module) => {
          if (module.type !== 'pedal_board') return module;
          const board = module as StudioPedalBoardModule;
          let boardChanged = false;
          const nextPedals = board.pedals.map((p) => {
            let pedalChanged = false;
            const newParams = { ...p.parameters };

            // Mesa Boogie
            if (p.id === 'mesa_mark3') {
              if (hostParams.mesa_bypass !== undefined) {
                const byp = Boolean(hostParams.mesa_bypass);
                if (p.bypassed !== byp) {
                  p = { ...p, bypassed: byp };
                  pedalChanged = true;
                }
              }
              if (isFloatDiff(newParams.gain.value, hostParams.mesa_gain)) {
                newParams.gain = { ...newParams.gain, value: hostParams.mesa_gain };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.master.value, hostParams.mesa_master)) {
                newParams.master = { ...newParams.master, value: hostParams.mesa_master };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.channel.value, hostParams.mesa_channel)) {
                newParams.channel = { ...newParams.channel, value: hostParams.mesa_channel };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.bass.value, hostParams.mesa_bass)) {
                newParams.bass = { ...newParams.bass, value: hostParams.mesa_bass };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.mid.value, hostParams.mesa_mid)) {
                newParams.mid = { ...newParams.mid, value: hostParams.mesa_mid };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.treble.value, hostParams.mesa_treble)) {
                newParams.treble = { ...newParams.treble, value: hostParams.mesa_treble };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.presence.value, hostParams.mesa_presence)) {
                newParams.presence = { ...newParams.presence, value: hostParams.mesa_presence };
                pedalChanged = true;
              }
            }

            // Vox AC-30
            if (p.id === 'vox_ac30') {
              if (hostParams.vox_bypass !== undefined) {
                const byp = Boolean(hostParams.vox_bypass);
                if (p.bypassed !== byp) {
                  p = { ...p, bypassed: byp };
                  pedalChanged = true;
                }
              }
              if (isFloatDiff(newParams.gain.value, hostParams.vox_gain)) {
                newParams.gain = { ...newParams.gain, value: hostParams.vox_gain };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.channel.value, hostParams.vox_channel)) {
                newParams.channel = { ...newParams.channel, value: hostParams.vox_channel };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.bass.value, hostParams.vox_bass)) {
                newParams.bass = { ...newParams.bass, value: hostParams.vox_bass };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.treble.value, hostParams.vox_treble)) {
                newParams.treble = { ...newParams.treble, value: hostParams.vox_treble };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.cut.value, hostParams.vox_cut)) {
                newParams.cut = { ...newParams.cut, value: hostParams.vox_cut };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.chime.value, hostParams.vox_chime)) {
                newParams.chime = { ...newParams.chime, value: hostParams.vox_chime };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.master.value, hostParams.vox_master)) {
                newParams.master = { ...newParams.master, value: hostParams.vox_master };
                pedalChanged = true;
              }
            }

            // Delay
            if (p.id === 'dub_echo') {
              if (hostParams.delay_bypass !== undefined) {
                const byp = Boolean(hostParams.delay_bypass);
                if (p.bypassed !== byp) {
                  p = { ...p, bypassed: byp };
                  pedalChanged = true;
                }
              }
              if (isFloatDiff(newParams.time.value, hostParams.delay_time)) {
                newParams.time = { ...newParams.time, value: hostParams.delay_time };
                pedalChanged = true;
              }
              if (isFloatDiff(newParams.feedback.value, hostParams.delay_fb)) {
                newParams.feedback = { ...newParams.feedback, value: hostParams.delay_fb };
                pedalChanged = true;
              }
            }

            // Filter
            if (p.id === 'resonant_filter') {
              if (hostParams.filter_bypass !== undefined) {
                const byp = Boolean(hostParams.filter_bypass);
                if (p.bypassed !== byp) {
                  p = { ...p, bypassed: byp };
                  pedalChanged = true;
                }
              }
              if (isFloatDiff(newParams.cutoff.value, hostParams.filter_cutoff)) {
                newParams.cutoff = { ...newParams.cutoff, value: hostParams.filter_cutoff };
                pedalChanged = true;
              }
            }

            // Ducker
            if (p.id === 'sidechain_ducker') {
              if (hostParams.ducker_bypass !== undefined) {
                const byp = Boolean(hostParams.ducker_bypass);
                if (p.bypassed !== byp) {
                  p = { ...p, bypassed: byp };
                  pedalChanged = true;
                }
              }
              if (isFloatDiff(newParams.depth.value, hostParams.ducker_depth)) {
                newParams.depth = { ...newParams.depth, value: hostParams.ducker_depth };
                pedalChanged = true;
              }
            }

            if (pedalChanged) {
              boardChanged = true;
              return { ...p, parameters: newParams };
            }
            return p;
          });

          if (boardChanged) {
            anyChanged = true;
            return { ...board, pedals: nextPedals };
          }
          return board;
        });

        return anyChanged ? nextModules : prevModules;
      });
    });
  }, [rules]);

  const getMidiNoteName = (noteNum?: number): string => {
    if (!noteNum || noteNum <= 0 || noteNum > 127) return '—';
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(noteNum / 12) - 1;
    const note = names[noteNum % 12];
    return `${note}${octave}`;
  };

  const addLog = (type: 'input' | 'output' | 'error' | 'system', content: string) => {
    const time = new Date().toTimeString().split(' ')[0];
    setLogs((prev) => [
      ...prev.slice(-400),
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: time,
        type,
        content
      }
    ]);
  };

  const handleUpdateParam = (pedalId: string, paramName: string, value: number) => {
    updateCurrentBoard((board) => {
      const updated = board.pedals.map((p) => {
        if (p.id === pedalId) {
          const currentParam = p.parameters[paramName];
          return {
            ...p,
            parameters: {
              ...p.parameters,
              [paramName]: currentParam
                ? { ...currentParam, value }
                : { name: paramName, label: paramName, value, min: 0, max: 10, step: 0.1, unit: '' }
            }
          };
        }
        return p;
      });
      audioEngine.updatePedalParams(updated);
      audioEngine.syncPedalParamToHost(pedalId, paramName, value);
      return { ...board, pedals: updated };
    });
  };

  const handleToggleBypass = (pedalId: string) => {
    updateCurrentBoard((board) => {
      let nextBypassed = false;
      const updated = board.pedals.map((p) => {
        if (p.id === pedalId) {
          nextBypassed = !p.bypassed;
          return { ...p, bypassed: nextBypassed };
        }
        return p;
      });
      audioEngine.updatePedalParams(updated);
      audioEngine.syncBypassToHost(pedalId, nextBypassed);
      audioEngine.syncRackToHost(updated, board.ampPlacement);
      const target = updated.find((p) => p.id === pedalId);
      if (target) {
        addLog('output', `${target.title} is now ${nextBypassed ? 'BYPASSED / STANDBY' : 'ENGAGED / ACTIVE'}.`);
      }
      return { ...board, pedals: updated };
    });
  };

  const handleRemovePedal = (pedalId: string) => {
    updateCurrentBoard((board) => {
      const updated = board.pedals.filter((p) => p.id !== pedalId);
      audioEngine.syncRemovePedalToHost(pedalId);
      audioEngine.updatePedalParams(updated);
      audioEngine.syncRackToHost(updated, board.ampPlacement);
      return { ...board, pedals: updated };
    });
    if (inspectedNodeId === pedalId) {
      handleSelectInspectNode('master');
    }
    addLog('output', `Removed component [${pedalId}] from active chain.`);
  };

  const handleToggleAmpPlacement = () => {
    updateCurrentBoard((board) => {
      const next = board.ampPlacement === 'outbound' ? 'inbound' : 'outbound';
      audioEngine.setAmpPlacement(next);
      audioEngine.syncRackToHost(board.pedals, next);
      addLog(
        'output',
        `Switched amplifier placement to ${next.toUpperCase()} (${
          next === 'outbound' ? 'Post-Effects' : 'Pre-Effects'
        }).`
      );
      return { ...board, ampPlacement: next };
    });
  };

  const handleToggleTerminal = () => {
    if (!isTerminalOpen) {
      setIsTerminalOpen(true);
      setIsTerminalExpanded(false); // Opens collapsed single-line input bar at bottom
    } else {
      setIsTerminalOpen(false);
      setIsTerminalExpanded(false);
    }
  };

  const handleSaveUserPreset = (name: string, description?: string) => {
    if (!name.trim()) return;
    const newPresetData = convertCurrentRackToPreset(name, currentPedals, currentAmpPlacement, description);
    const created = saveUserPreset(newPresetData);
    setUserPresets(loadUserPresets());
    addLog('output', `Saved patch [${created.name}] to Library.`);
  };

  const handleDeleteUserPreset = (id: string) => {
    deleteUserPreset(id);
    setUserPresets(loadUserPresets());
    addLog('output', `Deleted patch from Library.`);
  };

  const handleApplyRackPreset = (preset: RackPreset) => {
    updateCurrentBoard((board) => {
      audioEngine.setAmpPlacement(preset.ampPlacement);

      if (preset.category === 'user') {
        const updated: PedalInstance[] = preset.pedals.map((saved) => {
          const existing = board.pedals.find((p) => p.id === saved.id || p.type === saved.type) ||
                           INITIAL_PEDALS.find((p) => p.type === saved.type);
          const templateParams = existing ? existing.parameters : {};
          const newParams: Record<string, Parameter> = {};

          for (const [key, val] of Object.entries(saved.parameters)) {
            if (templateParams[key]) {
              newParams[key] = { ...templateParams[key], value: val };
            } else {
              newParams[key] = { name: key, label: key, value: val, min: 0, max: 10, step: 0.1, unit: '' };
            }
          }
          for (const [key, param] of Object.entries(templateParams)) {
            if (!newParams[key]) {
              newParams[key] = { ...param };
            }
          }

          return {
            id: saved.id,
            type: saved.type,
            category: saved.type === 'mesa' || saved.type === 'vox' ? 'amp' : 'pedal',
            title: saved.title || existing?.title || saved.type.toUpperCase(),
            color: saved.color || existing?.color || 'amber',
            bypassed: saved.bypassed !== undefined ? saved.bypassed : false,
            parameters: newParams
          };
        });

        audioEngine.updatePedalParams(updated);
        for (const p of updated) {
          audioEngine.syncBypassToHost(p.id, p.bypassed);
          for (const [paramKey, paramObj] of Object.entries(p.parameters)) {
            audioEngine.syncPedalParamToHost(p.id, paramKey, paramObj.value);
          }
        }
        audioEngine.syncRackToHost(updated, preset.ampPlacement);
        addLog('output', `Loaded User Patch: ${preset.name} (${preset.pedals.length} units).`);
        return { ...board, pedals: updated, ampPlacement: preset.ampPlacement };
      } else {
        // Factory Profiles
        if (preset.id === 'bypass_all') {
          const updated = board.pedals.map((p) => ({ ...p, bypassed: true }));
          audioEngine.updatePedalParams(updated);
          for (const p of updated) {
            audioEngine.syncBypassToHost(p.id, true);
          }
          audioEngine.syncRackToHost(updated, preset.ampPlacement);
          addLog('output', 'Bypassed all DSP effects and amplifiers (Direct Dry Passthrough).');
          return { ...board, pedals: updated, ampPlacement: preset.ampPlacement };
        } else if (preset.id.startsWith('mesa_')) {
          const mesaSaved = preset.pedals.find((p) => p.type === 'mesa');
          if (mesaSaved) {
            const updated = board.pedals.map((p) => {
              if (p.type === 'mesa') {
                const newParams = { ...p.parameters };
                for (const [k, v] of Object.entries(mesaSaved.parameters)) {
                  if (newParams[k]) {
                    newParams[k] = { ...newParams[k], value: v };
                    audioEngine.syncPedalParamToHost(p.id, k, v);
                  }
                }
                return { ...p, bypassed: false, parameters: newParams };
              }
              if (p.type === 'vox') {
                return { ...p, bypassed: true };
              }
              return p;
            });
            audioEngine.updatePedalParams(updated);
            audioEngine.syncBypassToHost('mesa_mark3', false);
            audioEngine.syncBypassToHost('vox_ac30', true);
            audioEngine.syncRackToHost(updated, preset.ampPlacement);
            handleSelectInspectNode('mesa_mark3');
            addLog('output', `Loaded Factory Profile: ${preset.name}.`);
            return { ...board, pedals: updated, ampPlacement: preset.ampPlacement };
          }
        } else if (preset.id.startsWith('vox_')) {
          const voxSaved = preset.pedals.find((p) => p.type === 'vox');
          if (voxSaved) {
            const updated = board.pedals.map((p) => {
              if (p.type === 'vox') {
                const newParams = { ...p.parameters };
                for (const [k, v] of Object.entries(voxSaved.parameters)) {
                  if (newParams[k]) {
                    newParams[k] = { ...newParams[k], value: v };
                    audioEngine.syncPedalParamToHost(p.id, k, v);
                  }
                }
                return { ...p, bypassed: false, parameters: newParams };
              }
              if (p.type === 'mesa') {
                return { ...p, bypassed: true };
              }
              return p;
            });
            audioEngine.updatePedalParams(updated);
            audioEngine.syncBypassToHost('vox_ac30', false);
            audioEngine.syncBypassToHost('mesa_mark3', true);
            audioEngine.syncRackToHost(updated, preset.ampPlacement);
            handleSelectInspectNode('vox_ac30');
            addLog('output', `Loaded Factory Profile: ${preset.name}.`);
            return { ...board, pedals: updated, ampPlacement: preset.ampPlacement };
          }
        } else if (preset.id === 'ambient_dub') {
          const delaySaved = preset.pedals.find((p) => p.type === 'delay');
          const filterSaved = preset.pedals.find((p) => p.type === 'filter');
          const updated = board.pedals.map((p) => {
            if (p.type === 'delay' && delaySaved) {
              const newParams = { ...p.parameters };
              for (const [k, v] of Object.entries(delaySaved.parameters)) {
                if (newParams[k]) {
                  newParams[k] = { ...newParams[k], value: v };
                  audioEngine.syncPedalParamToHost(p.id, k, v);
                }
              }
              return { ...p, bypassed: false, parameters: newParams };
            }
            if (p.type === 'filter' && filterSaved) {
              const newParams = { ...p.parameters };
              for (const [k, v] of Object.entries(filterSaved.parameters)) {
                if (newParams[k]) {
                  newParams[k] = { ...newParams[k], value: v };
                  audioEngine.syncPedalParamToHost(p.id, k, v);
                }
              }
              return { ...p, bypassed: false, parameters: newParams };
            }
            return p;
          });
          audioEngine.updatePedalParams(updated);
          audioEngine.syncBypassToHost('dub_echo', false);
          audioEngine.syncBypassToHost('resonant_filter', false);
          audioEngine.syncRackToHost(updated, preset.ampPlacement);
          handleSelectInspectNode('dub_echo');
          addLog('output', `Loaded Factory Profile: ${preset.name}.`);
          return { ...board, pedals: updated, ampPlacement: preset.ampPlacement };
        }
      }
      return board;
    });
  };

  const handleResetAll = () => {
    updateCurrentBoard((board) => {
      audioEngine.updatePedalParams(INITIAL_PEDALS);
      audioEngine.setAmpPlacement('outbound');
      audioEngine.syncRackToHost(INITIAL_PEDALS, 'outbound');
      addLog('system', 'Reset all pedals and amplifiers to factory default settings.');
      return { ...board, pedals: INITIAL_PEDALS, ampPlacement: 'outbound' };
    });
  };

  const handleAddPedal = (type: PedalType) => {
    const id = `${type}_${currentPedals.length + 1}`;
    let newPedal: PedalInstance;

    if (type === 'delay') {
      newPedal = {
        id,
        type: 'delay',
        title: 'Tape Echo',
        color: 'amber',
        bypassed: false,
        parameters: {
          time: { name: 'time', label: 'Time', value: 350, min: 20, max: 1200, step: 10, unit: 'ms' },
          feedback: { name: 'feedback', label: 'Repeat', value: 0.40, min: 0.0, max: 0.95, step: 0.01, unit: '' },
          mix: { name: 'mix', label: 'Mix', value: 0.50, min: 0.0, max: 1.0, step: 0.01, unit: '' }
        }
      };
    } else if (type === 'filter') {
      newPedal = {
        id,
        type: 'filter',
        title: 'Ladder Filter',
        color: 'crimson',
        bypassed: false,
        parameters: {
          cutoff: { name: 'cutoff', label: 'Cutoff', value: 1200, min: 60, max: 20000, step: 50, unit: 'Hz' },
          resonance: { name: 'resonance', label: 'Res', value: 0.50, min: 0.0, max: 0.98, step: 0.01, unit: '' }
        }
      };
    } else if (type === 'drive') {
      newPedal = {
        id,
        type: 'drive',
        title: 'Overdrive',
        color: 'gold',
        bypassed: false,
        parameters: {
          drive: { name: 'drive', label: 'Drive', value: 4.0, min: 1.0, max: 15.0, step: 0.5, unit: 'x' },
          tone: { name: 'tone', label: 'Tone', value: 0.65, min: 0.1, max: 1.0, step: 0.05, unit: '' }
        }
      };
    } else if (type === 'ducker') {
      newPedal = {
        id,
        type: 'ducker',
        title: 'Sidechain Ducker',
        color: 'cyan',
        bypassed: false,
        parameters: {
          depth: { name: 'depth', label: 'Depth', value: 16, min: 0, max: 36, step: 1, unit: 'dB' },
          release: { name: 'release', label: 'Release', value: 75, min: 10, max: 400, step: 5, unit: 'ms' }
        }
      };
    } else if (type === 'mesa') {
      newPedal = {
        id,
        type: 'mesa',
        category: 'amp',
        title: 'Mesa Boogie Mark III',
        color: 'rose',
        bypassed: false,
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
      };
    } else {
      newPedal = {
        id,
        type: 'vox',
        category: 'amp',
        title: 'Vox AC-30 Top Boost',
        color: 'amber',
        bypassed: false,
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
      };
    }

    updateCurrentBoard((board) => {
      const updated = [...board.pedals, newPedal];
      audioEngine.syncAddPedalToHost(type, id);
      audioEngine.updatePedalParams(updated);
      audioEngine.syncRackToHost(updated, board.ampPlacement);
      return { ...board, pedals: updated };
    });
    setInspectedNodeId(id);
    addLog('output', `Created ${newPedal.category === 'amp' ? 'amplifier' : 'pedal'} [${id}] (${newPedal.title}) in chain.`);
  };

  const handleAddPedalFromLibrary = (template: LibraryPedalTemplate) => {
    updateCurrentBoard((board) => {
      const newPedal = instantiatePedalFromLibrary(template, board.pedals.length);
      const updated = [...board.pedals, newPedal];
      audioEngine.syncAddPedalToHost(newPedal.type, newPedal.id);
      audioEngine.updatePedalParams(updated);
      audioEngine.syncBypassToHost(newPedal.id, newPedal.bypassed);
      for (const [k, v] of Object.entries(newPedal.parameters)) {
        audioEngine.syncPedalParamToHost(newPedal.id, k, v.value);
      }
      audioEngine.syncRackToHost(updated, board.ampPlacement);
      return { ...board, pedals: updated };
    });
    addLog('output', `Loaded [${template.title}] (${template.subtitle}) from Library into active board.`);
  };

  const handleSavePedalToLibrary = (pedal: PedalInstance, customName: string, description?: string) => {
    const saved = saveUserPedalTemplate(customName, pedal, description);
    addLog('output', `Saved custom pedal [${saved.title}] to your personal Pedal Library.`);
  };

  const handleOpenSavePedalModal = (pedal: PedalInstance) => {
    setPreselectedPedalToSaveId(pedal.id);
    setIsPedalLibraryOpen(true);
  };

  const handleAddSensor = (sensor: { id: string; label: string; freq: number; type: 'lowpass' | 'bandpass' | 'highpass'; color: string }) => {
    const ok = audioEngine.addSensoryChannel(sensor);
    if (ok) {
      setTelemetry((prev) => ({
        ...prev,
        sensors: audioEngine.getSensoryChannels()
      }));
      addLog('output', `Registered sensory channel [${sensor.id}] (${sensor.type} @ ${sensor.freq}Hz).`);
    } else {
      addLog('error', `Sensory channel [${sensor.id}] already exists.`);
    }
  };

  const handleSelectModule = (id: string) => {
    const mod = modules.find((m) => m.id === id);
    if (!mod) return;
    setActiveModuleId(id);
    try {
      const ws: StudioWorkspace =
        mod.type === 'sp404' ? 'sp404' : mod.type === 'state' ? 'state' : 'pedal_lab';
      localStorage.setItem('johnwalls_active_workspace', ws);
      localStorage.setItem('johnwalls_workspace_configured', 'true');
    } catch {}
  };

  const handleMoveModule = (fromIndex: number, toIndex: number) => {
    setModules((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, item);
      addLog('output', `Rearranged signal flow: Moved [${item.title}] ${fromIndex < toIndex ? 'later' : 'earlier'}.`);
      return copy;
    });
  };

  const handleToggleModuleBypass = (id: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          const nextBypassed = !m.bypassed;
          addLog('output', `Module [${m.title}] is now ${nextBypassed ? 'BYPASSED' : 'ACTIVE'}.`);
          if (m.type === 'sp404') {
            const sp404Index = prev.findIndex((mod) => mod.id === id);
            const boardIndex = prev.findIndex((mod) => mod.type === 'pedal_board');
            const order = (sp404Index !== -1 && boardIndex !== -1 && sp404Index < boardIndex) ? 'before' : 'after';
            audioEngine.routeSP404(order, sp404AudioEngine.getMasterGain(), nextBypassed);
          }
          return { ...m, bypassed: nextBypassed };
        }
        return m;
      })
    );
  };

  const handleAddModule = (type: StudioModuleType) => {
    if (type === 'pedal_board') {
      const boardNum = modules.filter((m) => m.type === 'pedal_board').length + 1;
      const newBoard: StudioPedalBoardModule = {
        id: `board_${Date.now()}`,
        type: 'pedal_board',
        title: `Pedal Board ${boardNum}`,
        bypassed: false,
        ampPlacement: 'outbound',
        pedals: [
          {
            id: `dub_echo_${Date.now()}`,
            type: 'delay',
            title: 'Tape Echo',
            color: 'amber',
            bypassed: false,
            parameters: {
              time: { name: 'time', label: 'Time', value: 350, min: 20, max: 1200, step: 10, unit: 'ms' },
              feedback: { name: 'feedback', label: 'Repeat', value: 0.4, min: 0.0, max: 0.95, step: 0.01, unit: '' },
              mix: { name: 'mix', label: 'Mix', value: 0.5, min: 0.0, max: 1.0, step: 0.01, unit: '' }
            }
          }
        ]
      };
      setModules((prev) => [...prev, newBoard]);
      setActiveModuleId(newBoard.id);
      addLog('output', `Created new modular board: ${newBoard.title}`);
    } else if (type === 'sp404') {
      const spNum = modules.filter((m) => m.type === 'sp404').length + 1;
      const newSp: StudioSP404Module = {
        id: `sp404_${Date.now()}`,
        type: 'sp404',
        title: spNum === 1 ? 'SP-404 MKII' : `SP-404 MKII #${spNum}`,
        bypassed: false
      };
      setModules((prev) => [...prev, newSp]);
      setActiveModuleId(newSp.id);
      addLog('output', `Created new sampler module: ${newSp.title}`);
    } else if (type === 'state') {
      const stateNum = modules.filter((m) => m.type === 'state').length + 1;
      const newState: StudioStateModule = {
        id: `state_${Date.now()}`,
        type: 'state',
        title: stateNum === 1 ? 'State Cockpit' : `State Cockpit #${stateNum}`,
        bypassed: false
      };
      setModules((prev) => [...prev, newState]);
      setActiveModuleId(newState.id);
      addLog('output', `Created new module: ${newState.title}`);
    }
  };

  const handleRemoveModule = (id: string) => {
    if (modules.length <= 1) {
      addLog('error', 'Cannot remove the last studio module in the pipeline.');
      return;
    }
    const target = modules.find((m) => m.id === id);
    setModules((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (activeModuleId === id && next.length > 0) {
        setActiveModuleId(next[0].id);
      }
      return next;
    });
    if (target) {
      addLog('output', `Removed module [${target.title}] from studio chain.`);
    }
  };

  const handleRenameModule = (id: string, newTitle: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          return { ...m, title: newTitle.trim() || m.title };
        }
        return m;
      })
    );
  };

  const handleExecuteCommand = (cmd: string) => {
    if (cmd.startsWith('__stream ')) {
      addLog('output', cmd.substring(9));
      return;
    }

    addLog('input', cmd);
    const tokens = cmd.trim().split(/\s+/);
    const verb = tokens[0]?.toLowerCase();

    if (verb === 'clear' || verb === 'cls') {
      setLogs([]);
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
          'SUPERCOLLIDER DSP ENGINE:\n' +
          '  sc <boot|kill|status|test|free> Control scsynth audio server with real OSC\n\n' +
          'STUDIO RACK & SIGNAL CHAIN:\n' +
          '  add pedal <delay|filter|drive|ducker|mesa|vox>   Instantiate DSP stompbox or amp\n' +
          '  remove <id>                                     Remove pedal from active board\n' +
          '  bypass <id>                                     Toggle pedal bypass\n' +
          '  placement <outbound|inbound>                    Switch amp stage (Post-FX vs Pre-FX)\n' +
          '  preset v-curve                                  Apply iconic Mesa 5-band EQ V-curve\n' +
          '  inspect <id|master>                             Route solo oscilloscope to target\n' +
          '  set <id>.<param> <val>                          Adjust pedal/amp parameter\n' +
          '  list [pedals|modules|sensors|tracks]            Inspect rack, modules, sensors or tracks\n' +
          '  routing                                         Open Universal Studio Signal Flow Matrix\n\n' +
          'TERMINAL CONTROLS:\n' +
          '  clear / cls                                     Clear terminal log buffer'
      );
      return;
    }

    if (verb === 'routing' || verb === 'route') {
      setIsRoutingModalOpen(true);
      addLog('output', 'Opened Universal Studio Signal Flow & Routing Matrix.');
      return;
    }

    if (verb === 'state' || verb === 'cockpit') {
      handleSelectWorkspace('state', true);
      addLog('output', 'Switched active workspace to STATE Cockpit.');
      return;
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
      } else {
        addLog('error', 'Usage: sc <boot|kill|status|test|free>');
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
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, [role="button"]')) {
      return;
    }
    const webkit = (window as any).webkit;
    if (webkit?.messageHandlers?.dragWindow) {
      webkit.messageHandlers.dragWindow.postMessage({});
    }
  };

  // Find info of currently inspected node
  const inspectedComponent =
    inspectedNodeId === 'master'
      ? { title: 'MASTER OUTPUT', color: 'emerald' }
      : currentPedals.find((p) => p.id === inspectedNodeId) || { title: inspectedNodeId.toUpperCase(), color: 'gold' };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0c12] text-slate-100 overflow-hidden font-sans">
      {/* Unified Studio Top Bar */}
      <div onMouseDown={handleHeaderMouseDown} style={{ WebkitAppRegion: 'drag' } as any}>
        <TopMenuBar
          onApplyRackPreset={handleApplyRackPreset}
          userPresets={userPresets}
          onSaveCurrentRack={handleSaveUserPreset}
          onDeleteUserPreset={handleDeleteUserPreset}
          ampPlacement={currentAmpPlacement}
          onToggleAmpPlacement={handleToggleAmpPlacement}
          inspectedNodeId={inspectedNodeId}
          onSelectInspectNode={handleSelectInspectNode}
          pedals={currentPedals}
          onToggleBypass={handleToggleBypass}
          onResetAll={handleResetAll}
          isTerminalOpen={isTerminalOpen}
          isTerminalExpanded={isTerminalExpanded}
          onToggleTerminal={handleToggleTerminal}
          isScopeVisible={isScopeVisible}
          onToggleScope={() => setIsScopeVisible(!isScopeVisible)}
          telemetry={telemetry}
          onAddSensor={handleAddSensor}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={(ws) => handleSelectWorkspace(ws, true)}
          onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
          onOpenPedalLibrary={() => setIsPedalLibraryOpen(true)}
          onOpenRoutingModal={() => setIsRoutingModalOpen(true)}
        />

        {/* Global Studio Signal Flow Ribbon */}
        <StudioModuleFlowRibbon
          modules={modules}
          activeModuleId={activeModuleId}
          onSelectModule={handleSelectModule}
          onMoveModule={handleMoveModule}
          onToggleModuleBypass={handleToggleModuleBypass}
          onAddModule={handleAddModule}
          onRemoveModule={handleRemoveModule}
          onRenameModule={handleRenameModule}
          onOpenRoutingModal={() => setIsRoutingModalOpen(true)}
        />
      </div>

      {/* Main Workspace Body */}
      {activeWorkspace === 'pedal_lab' ? (
        <>
          {/* Live Solo Waveform Oscilloscope Strip */}
          {isScopeVisible && (
            <div className="px-4 py-2 bg-[#090b10] border-b border-slate-800/80">
              <WaveformVisualizer
                inspectedNodeId={inspectedNodeId}
                inspectedNodeTitle={inspectedComponent.title}
                inspectedNodeColor={inspectedComponent.color}
                onSelectNode={handleSelectInspectNode}
                availableNodes={currentPedals.map((p) => ({
                  id: p.id,
                  title: p.title,
                  type: p.type,
                  color: p.color
                }))}
                bpm={telemetry.bpm}
              />
            </div>
          )}

          {/* Interactive Pedalboard & Outbound Amp Canvas */}
          <PedalBoardCanvas
            pedals={currentPedals}
            rules={rules}
            onUpdateParam={handleUpdateParam}
            onToggleBypass={handleToggleBypass}
            onRemovePedal={handleRemovePedal}
            onAddPedal={handleAddPedal}
            ampPlacement={currentAmpPlacement}
            onToggleAmpPlacement={handleToggleAmpPlacement}
            inspectedNodeId={inspectedNodeId}
            onSelectInspectNode={handleSelectInspectNode}
            onOpenLibrary={() => setIsPedalLibraryOpen(true)}
            onSavePedalToLibrary={handleOpenSavePedalModal}
          />
        </>
      ) : activeWorkspace === 'sp404' ? (
        <SP404Workstation
          onSwitchToPedalLab={() => handleSelectWorkspace('pedal_lab', true)}
          onSwitchToState={() => handleSelectWorkspace('state', true)}
          onOpenRoutingModal={() => setIsRoutingModalOpen(true)}
          telemetry={telemetry}
        />
      ) : (
        <StateWorkstation
          telemetry={telemetry}
          logs={logs}
          onExecuteCommand={handleExecuteCommand}
          onClearLogs={() => setLogs([])}
          onSwitchToPedalLab={() => handleSelectWorkspace('pedal_lab', true)}
          onSwitchToSP404={() => handleSelectWorkspace('sp404', true)}
          onOpenRoutingModal={() => setIsRoutingModalOpen(true)}
        />
      )}

      {/* Virtual Terminal Command Line */}
      <VirtualTerminal
        logs={logs}
        onExecuteCommand={handleExecuteCommand}
        isOpen={isTerminalOpen}
        isExpanded={isTerminalExpanded}
        onToggleExpand={() => setIsTerminalExpanded(!isTerminalExpanded)}
        onClose={() => {
          setIsTerminalOpen(false);
          setIsTerminalExpanded(false);
        }}
      />

      {/* Pedal & Amplifier Library Modal */}
      <PedalLibraryModal
        isOpen={isPedalLibraryOpen}
        onClose={() => {
          setIsPedalLibraryOpen(false);
          setPreselectedPedalToSaveId(null);
        }}
        onAddPedalToBoard={handleAddPedalFromLibrary}
        currentPedals={currentPedals}
        onSaveCurrentPedalToLibrary={handleSavePedalToLibrary}
        initialPedalIdToSave={preselectedPedalToSaveId}
      />

      {/* Startup & Module Chooser Modal */}
      <StudioWorkspaceModal
        currentWorkspace={activeWorkspace}
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSelectWorkspace={handleSelectWorkspace}
      />

      {/* Universal Studio Routing Screen Modal */}
      <StudioRoutingModal
        isOpen={isRoutingModalOpen}
        onClose={() => setIsRoutingModalOpen(false)}
        modules={modules}
        activeModuleId={activeModuleId}
        onSelectModule={handleSelectModule}
        onMoveModule={handleMoveModule}
        onToggleModuleBypass={handleToggleModuleBypass}
        ampPlacement={currentAmpPlacement}
        onToggleAmpPlacement={handleToggleAmpPlacement}
        bpm={telemetry.bpm}
        barNumber={telemetry.barNumber}
        isPlaying={telemetry.isPlaying}
      />
    </div>
  );
};

export default App;

