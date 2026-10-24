import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PedalBoardCanvas } from './components/PedalBoardCanvas';
import { VirtualTerminal } from './components/VirtualTerminal';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { TopMenuBar } from './components/TopMenuBar';
import { StudioModuleFlowRibbon } from './components/StudioModuleFlowRibbon';
import { SP404Workstation } from './components/SP404Workstation';
import { RC600Workstation } from './components/RC600Workstation';
import { StateWorkstation } from './components/StateWorkstation';
import { PerformanceDeck } from './components/PerformanceDeck';
import { StudioWorkspaceModal, StudioWorkspace } from './components/StudioWorkspaceModal';
import { PedalLibraryModal } from './components/PedalLibraryModal';
import { StudioRoutingModal } from './components/StudioRoutingModal';
import { TakeRecorderCockpit } from './components/TakeRecorderCockpit';
import { VisualizerModal } from './components/VisualizerModal';
import { GlobalCommandPalette } from './components/GlobalCommandPalette';
import { CopilotDrawer } from './components/CopilotDrawer';
import { SkipBackModal } from './components/SkipBackModal';
import { WaveformChopDeck } from './components/WaveformChopDeck';
import { audioEngine } from './components/AudioEngineBridge';
import { sp404AudioEngine, BankLetter } from './components/SP404AudioEngine';
import { stateBridge, AudioTakeMetadata } from './utils/stateBridge';
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

import {
  INITIAL_PEDALS,
  INITIAL_RULES,
  INITIAL_STUDIO_MODULES
} from './constants/initialState';
import { syncHostParametersToModules } from './utils/hostAutomation';
import { executeStudioCommand } from './utils/commandExecutor';

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
  const [isCaptureDispatchOpen, setIsCaptureDispatchOpen] = useState<boolean>(false);
  const [isVisualizerOpen, setIsVisualizerOpen] = useState<boolean>(false);
  const [visualizerTake, setVisualizerTake] = useState<AudioTakeMetadata | null>(null);
  const [isSkipBackOpen, setIsSkipBackOpen] = useState<boolean>(false);
  const [hasSkipBackAudio, setHasSkipBackAudio] = useState<boolean>(false);
  const [isAutoChopOpen, setIsAutoChopOpen] = useState<boolean>(false);
  const [chopDeckBuffer, setChopDeckBuffer] = useState<AudioBuffer | null>(null);

  const handleOpenAutoChop = useCallback((buffer: AudioBuffer) => {
    setChopDeckBuffer(buffer);
    setIsAutoChopOpen(true);
  }, []);

  useEffect(() => {
    sp404AudioEngine.setOnSkipBackActivity((hasAudio) => {
      setHasSkipBackAudio(hasAudio);
    });
    const ducker = audioEngine.getDuckerGain();
    if (ducker) {
      sp404AudioEngine.tapDryInput(ducker);
    }
  }, []);

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
  const activeModule = useMemo(
    () => modules.find((m) => m.id === activeModuleId) || modules[0] || INITIAL_STUDIO_MODULES[0],
    [modules, activeModuleId]
  );
  const isBoardActive = activeModule.type === 'pedal_board';
  const currentBoard = useMemo(
    () => (isBoardActive ? (activeModule as StudioPedalBoardModule) : null),
    [isBoardActive, activeModule]
  );
  const currentPedals = useMemo(
    () => (currentBoard ? currentBoard.pedals : INITIAL_PEDALS),
    [currentBoard]
  );
  const currentAmpPlacement = currentBoard ? currentBoard.ampPlacement : 'outbound';
  const [currentPresetName, setCurrentPresetName] = useState<string>(() => {
    try {
      return localStorage.getItem('johnwalls_active_preset_name') || 'Dub Echo & Space';
    } catch {
      return 'Dub Echo & Space';
    }
  });

  const [activeWorkspace, setActiveWorkspace] = useState<StudioWorkspace>(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const wsParam = params.get('workspace') as StudioWorkspace;
        if (wsParam && ['pedal_lab', 'sp404', 'rc600', 'state', 'performance', 'unified'].includes(wsParam)) {
          return wsParam;
        }
      }
      const saved = localStorage.getItem('johnwalls_active_workspace') as StudioWorkspace;
      if (saved && ['pedal_lab', 'sp404', 'rc600', 'state', 'performance', 'unified'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'pedal_lab';
  });

  const updateCurrentBoard = useCallback((updater: (board: StudioPedalBoardModule) => StudioPedalBoardModule) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === activeModuleId && m.type === 'pedal_board') {
          return updater(m as StudioPedalBoardModule);
        }
        return m;
      })
    );
  }, [activeModuleId]);

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
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('modal') === 'false' || params.has('workspace')) {
          return false;
        }
      }
      return localStorage.getItem('johnwalls_workspace_configured') !== 'true';
    } catch {
      return false;
    }
  });

  const [isUnifiedMode, setIsUnifiedMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('johnwalls_unified_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [isPedalDockExpanded, setIsPedalDockExpanded] = useState<boolean>(true);
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);

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

  // Global shortcut listener for Raycast-style command palette (Cmd+K, Ctrl+K, or ` when outside inputs)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        return;
      }
      if (e.key === '`' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        return;
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

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

  const addLog = useCallback((type: 'input' | 'output' | 'error' | 'system', content: string) => {
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
  }, []);

  const handleSelectInspectNode = useCallback((nodeId: string) => {
    setInspectedNodeId(nodeId);
    audioEngine.sendInspectNodeToHost(nodeId);
  }, []);

  const handleSelectModule = useCallback((id: string) => {
    setModules((prev) => {
      const mod = prev.find((m) => m.id === id);
      if (!mod) return prev;
      try {
        const ws: StudioWorkspace =
          mod.type === 'sp404' ? 'sp404' : mod.type === 'state' ? 'state' : 'pedal_lab';
        localStorage.setItem('johnwalls_active_workspace', ws);
        localStorage.setItem('johnwalls_workspace_configured', 'true');
      } catch {}
      return prev;
    });
    setActiveModuleId(id);
  }, []);

  const handleMoveModule = useCallback((fromIndex: number, toIndex: number) => {
    setModules((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, item);
      addLog('output', `Rearranged signal flow: Moved [${item.title}] ${fromIndex < toIndex ? 'later' : 'earlier'}.`);
      return copy;
    });
  }, [addLog]);

  const handleToggleModuleBypass = useCallback((id: string) => {
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
  }, [addLog]);

  const handleAddModule = useCallback((type: StudioModuleType) => {
    setModules((prev) => {
      if (type === 'pedal_board') {
        const boardNum = prev.filter((m) => m.type === 'pedal_board').length + 1;
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
        setActiveModuleId(newBoard.id);
        addLog('output', `Created new modular board: ${newBoard.title}`);
        return [...prev, newBoard];
      } else if (type === 'sp404') {
        const spNum = prev.filter((m) => m.type === 'sp404').length + 1;
        const newSp: StudioSP404Module = {
          id: `sp404_${Date.now()}`,
          type: 'sp404',
          title: spNum === 1 ? 'SP-404 Original / A' : `SP-404 Original / A #${spNum}`,
          bypassed: false
        };
        setActiveModuleId(newSp.id);
        addLog('output', `Created new sampler module: ${newSp.title}`);
        return [...prev, newSp];
      } else if (type === 'state') {
        const stateNum = prev.filter((m) => m.type === 'state').length + 1;
        const newState: StudioStateModule = {
          id: `state_${Date.now()}`,
          type: 'state',
          title: stateNum === 1 ? 'State Cockpit' : `State Cockpit #${stateNum}`,
          bypassed: false
        };
        setActiveModuleId(newState.id);
        addLog('output', `Created new module: ${newState.title}`);
        return [...prev, newState];
      }
      return prev;
    });
  }, [addLog]);

  const handleRemoveModule = useCallback((id: string) => {
    setModules((prev) => {
      if (prev.length <= 1) {
        addLog('error', 'Cannot remove the last studio module in the pipeline.');
        return prev;
      }
      const target = prev.find((m) => m.id === id);
      const next = prev.filter((m) => m.id !== id);
      setActiveModuleId((currentActiveId) => {
        if (currentActiveId === id && next.length > 0) {
          return next[0].id;
        }
        return currentActiveId;
      });
      if (target) {
        addLog('output', `Removed module [${target.title}] from studio chain.`);
      }
      return next;
    });
  }, [addLog]);

  const handleRenameModule = useCallback((id: string, newTitle: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          return { ...m, title: newTitle.trim() || m.title };
        }
        return m;
      })
    );
  }, []);

  const handleSelectWorkspace = useCallback((ws: StudioWorkspace, remember: boolean = true) => {
    setActiveWorkspace(ws);
    if (ws === 'unified') {
      setIsUnifiedMode(true);
    } else {
      setIsUnifiedMode(false);
    }

    if (remember) {
      try {
        localStorage.setItem('johnwalls_unified_mode', ws === 'unified' ? 'true' : 'false');
        localStorage.setItem('johnwalls_active_workspace', ws);
        localStorage.setItem('johnwalls_workspace_configured', 'true');
      } catch {}
    }

    const targetType: StudioModuleType =
      ws === 'sp404' ? 'sp404' : ws === 'state' ? 'state' : 'pedal_board';

    setModules((prev) => {
      const currentActive = prev.find((m) => m.id === activeModuleId);
      if (!currentActive || currentActive.type !== targetType) {
        const rememberedId = lastActiveModuleByType[targetType];
        const match =
          prev.find((m) => m.id === rememberedId) ||
          prev.find((m) => m.type === targetType);
        if (match) {
          setActiveModuleId(match.id);
        } else {
          handleAddModule(targetType);
        }
      }
      return prev;
    });
  }, [activeModuleId, lastActiveModuleByType, handleAddModule]);

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

    // Synchronize parameter automation incoming from Ableton Live host (only on genuine changes)
    audioEngine.setHostParametersCallback((hostParams) => {
      setModules((prevModules) => syncHostParametersToModules(prevModules, hostParams));
    });
  }, [rules]);

  const handleUpdateParam = useCallback((pedalId: string, paramName: string, value: number) => {
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
  }, [updateCurrentBoard]);

  const handleToggleBypass = useCallback((pedalId: string) => {
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
  }, [updateCurrentBoard, addLog]);

  const handleRemovePedal = useCallback((pedalId: string) => {
    updateCurrentBoard((board) => {
      const updated = board.pedals.filter((p) => p.id !== pedalId);
      audioEngine.syncRemovePedalToHost(pedalId);
      audioEngine.updatePedalParams(updated);
      audioEngine.syncRackToHost(updated, board.ampPlacement);
      return { ...board, pedals: updated };
    });
    setInspectedNodeId((prev) => {
      if (prev === pedalId) {
        audioEngine.sendInspectNodeToHost('master');
        return 'master';
      }
      return prev;
    });
    addLog('output', `Removed component [${pedalId}] from active chain.`);
  }, [updateCurrentBoard, addLog]);

  const handleToggleAmpPlacement = useCallback(() => {
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
  }, [updateCurrentBoard, addLog]);

  const handleToggleTerminal = useCallback(() => {
    setIsTerminalOpen((prev) => {
      if (!prev) {
        setIsTerminalExpanded(false);
        return true;
      }
      setIsTerminalExpanded(false);
      return false;
    });
  }, []);

  const handleSaveUserPreset = useCallback((name: string, description?: string) => {
    if (!name.trim()) return;
    const newPresetData = convertCurrentRackToPreset(name, currentPedals, currentAmpPlacement, description);
    const created = saveUserPreset(newPresetData);
    setUserPresets(loadUserPresets());
    setCurrentPresetName(created.name);
    try {
      localStorage.setItem('johnwalls_active_preset_name', created.name);
    } catch {}
    addLog('output', `Saved patch [${created.name}] to Library.`);
  }, [currentPedals, currentAmpPlacement, addLog]);

  const handleDeleteUserPreset = useCallback((id: string) => {
    deleteUserPreset(id);
    setUserPresets(loadUserPresets());
    addLog('output', `Deleted patch from Library.`);
  }, [addLog]);

  const handleApplyRackPreset = useCallback((preset: RackPreset) => {
    setCurrentPresetName(preset.name);
    try {
      localStorage.setItem('johnwalls_active_preset_name', preset.name);
    } catch {}
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
        // Universal Factory Profile Loader (Supports all curated production suites & calibrated amp voicings)
        const updated = board.pedals.map((pedal) => {
          const saved = preset.pedals.find((p) => p.id === pedal.id || p.type === pedal.type);
          if (saved) {
            const newParams = { ...pedal.parameters };
            for (const [k, v] of Object.entries(saved.parameters)) {
              if (newParams[k]) {
                newParams[k] = { ...newParams[k], value: v };
                audioEngine.syncPedalParamToHost(pedal.id, k, v);
              }
            }
            audioEngine.syncBypassToHost(pedal.id, saved.bypassed);
            return { ...pedal, bypassed: saved.bypassed, parameters: newParams };
          }
          // If not specified in preset, bypass cleanly
          audioEngine.syncBypassToHost(pedal.id, true);
          return { ...pedal, bypassed: true };
        });

        audioEngine.updatePedalParams(updated);
        audioEngine.syncRackToHost(updated, preset.ampPlacement);

        // Auto-inspect the primary active unit for real-time waveform display
        const primaryActive = updated.find((p) => !p.bypassed && (p.type === 'mesa' || p.type === 'vox' || p.type === 'delay' || p.type === 'filter'));
        if (primaryActive) {
          handleSelectInspectNode(primaryActive.id);
        } else {
          handleSelectInspectNode('master');
        }

        addLog('output', `Loaded Factory Profile: ${preset.name}.`);
        return { ...board, pedals: updated, ampPlacement: preset.ampPlacement };
      }
    });
  }, [updateCurrentBoard, handleSelectInspectNode, addLog]);

  const handleResetAll = useCallback(() => {
    updateCurrentBoard((board) => {
      audioEngine.updatePedalParams(INITIAL_PEDALS);
      audioEngine.setAmpPlacement('outbound');
      audioEngine.syncRackToHost(INITIAL_PEDALS, 'outbound');
      addLog('system', 'Reset all pedals and amplifiers to factory default settings.');
      return { ...board, pedals: INITIAL_PEDALS, ampPlacement: 'outbound' };
    });
  }, [updateCurrentBoard, addLog]);

  const handleAddPedal = useCallback((type: PedalType) => {
    updateCurrentBoard((board) => {
      const id = `${type}_${board.pedals.length + 1}`;
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

      const updated = [...board.pedals, newPedal];
      audioEngine.syncAddPedalToHost(type, id);
      audioEngine.updatePedalParams(updated);
      audioEngine.syncRackToHost(updated, board.ampPlacement);
      handleSelectInspectNode(id);
      addLog('output', `Created ${newPedal.category === 'amp' ? 'amplifier' : 'pedal'} [${id}] (${newPedal.title}) in chain.`);
      return { ...board, pedals: updated };
    });
  }, [updateCurrentBoard, handleSelectInspectNode, addLog]);

  const handleAddPedalFromLibrary = useCallback((template: LibraryPedalTemplate) => {
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
      addLog('output', `Loaded [${template.title}] (${template.subtitle}) from Library into active board.`);
      return { ...board, pedals: updated };
    });
  }, [updateCurrentBoard, addLog]);

  const handleSavePedalToLibrary = useCallback((pedal: PedalInstance, customName: string, description?: string) => {
    const saved = saveUserPedalTemplate(customName, pedal, description);
    addLog('output', `Saved custom pedal [${saved.title}] to your personal Pedal Library.`);
  }, [addLog]);

  const handleOpenSavePedalModal = useCallback((pedal: PedalInstance) => {
    setPreselectedPedalToSaveId(pedal.id);
    setIsPedalLibraryOpen(true);
  }, []);

  const handleAddSensor = useCallback((sensor: { id: string; label: string; freq: number; type: 'lowpass' | 'bandpass' | 'highpass'; color: string }) => {
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
  }, [addLog]);

  const handleExecuteCommand = useCallback((cmd: string) => {
    executeStudioCommand(cmd, {
      addLog,
      clearLogs: () => setLogs([]),
      telemetry,
      currentPedals,
      modules,
      rules,
      userPresets,
      setInspectedNodeId,
      handleUpdateParam,
      handleToggleBypass,
      handleRemovePedal,
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
    });
  }, [
    addLog,
    telemetry,
    currentPedals,
    modules,
    rules,
    userPresets,
    setInspectedNodeId,
    handleUpdateParam,
    handleToggleBypass,
    handleRemovePedal,
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
  ]);

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
          currentPresetName={currentPresetName}
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
          onOpenCaptureDispatch={() => setIsCaptureDispatchOpen(true)}
          onOpenSkipBack={() => setIsSkipBackOpen(true)}
          hasSkipBackAudio={hasSkipBackAudio}
          onOpenPalette={() => setIsPaletteOpen(true)}
          onToggleCopilot={() => setIsCopilotOpen(!isCopilotOpen)}
          isCopilotOpen={isCopilotOpen}
          onOpenVisualizer={() => {
            setVisualizerTake(null);
            setIsVisualizerOpen(true);
          }}
        />
      </div>

      {/* Main Workspace Body */}
      {activeWorkspace === 'performance' || isUnifiedMode ? (
        <PerformanceDeck
          pedals={currentPedals}
          onUpdateParam={handleUpdateParam}
          onToggleBypass={handleToggleBypass}
          inspectedNodeId={inspectedNodeId}
          onSelectInspectNode={handleSelectInspectNode}
          bpm={telemetry.bpm}
          telemetry={telemetry}
          onOpenFullSP404={() => handleSelectWorkspace('sp404', true)}
          onOpenFullPedals={() => handleSelectWorkspace('pedal_lab', true)}
          onOpenRC600={() => handleSelectWorkspace('rc600', true)}
          onOpenSkipBack={() => setIsSkipBackOpen(true)}
          onOpenAutoChop={handleOpenAutoChop}
        />
      ) : activeWorkspace === 'pedal_lab' ? (
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
          onSwitchToRC600={() => handleSelectWorkspace('rc600', true)}
          onSwitchToState={() => handleSelectWorkspace('state', true)}
          onOpenRoutingModal={() => setIsRoutingModalOpen(true)}
          onOpenSkipBack={() => setIsSkipBackOpen(true)}
          onOpenAutoChop={handleOpenAutoChop}
          telemetry={telemetry}
        />
      ) : activeWorkspace === 'rc600' ? (
        <RC600Workstation
          onSwitchToPedalLab={() => handleSelectWorkspace('pedal_lab', true)}
          onSwitchToSP404={() => handleSelectWorkspace('sp404', true)}
          onSwitchToPerformance={() => handleSelectWorkspace('performance', true)}
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
          onOpenCaptureDispatch={() => setIsCaptureDispatchOpen(true)}
          onOpenVisualizer={() => {
            setVisualizerTake(null);
            setIsVisualizerOpen(true);
          }}
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

      {/* Direct Ableton Live Audio Capture & Web Dispatch Cockpit */}
      <TakeRecorderCockpit
        isOpen={isCaptureDispatchOpen}
        onClose={() => setIsCaptureDispatchOpen(false)}
        currentTrackName={telemetry.currentTrackName || 'Master'}
        currentBpm={telemetry.bpm}
        sessionTracks={telemetry.sessionTracks || []}
        onOpenVisualizer={(take) => {
          setVisualizerTake(take || null);
          setIsVisualizerOpen(true);
        }}
      />

      {/* Real-Time Audio-Reactive 60 FPS SuperCollider Visualizer Modal */}
      <VisualizerModal
        isOpen={isVisualizerOpen}
        onClose={() => setIsVisualizerOpen(false)}
        telemetry={telemetry}
        auditionTake={visualizerTake}
        onOpenCaptureDispatch={() => setIsCaptureDispatchOpen(true)}
      />

      {/* 25-Second Retrospective Skip-Back Capture Modal */}
      <SkipBackModal
        isOpen={isSkipBackOpen}
        onClose={() => setIsSkipBackOpen(false)}
        sp404Engine={sp404AudioEngine}
        bpm={telemetry.bpm}
        onOpenAutoChop={handleOpenAutoChop}
      />

      {/* Hybrid Transient Auto-Chop Deck */}
      <WaveformChopDeck
        isOpen={isAutoChopOpen}
        onClose={() => {
          setIsAutoChopOpen(false);
          setChopDeckBuffer(null);
        }}
        audioBuffer={chopDeckBuffer}
        sp404Engine={sp404AudioEngine}
        bpm={telemetry.bpm}
        activeBank="A"
        onSlicesCommitted={(count) => {
          addLog('output', `Sliced sample into ${count} pads with Choke Group 2.`);
        }}
      />

      {/* Global Raycast Command Palette (Cmd+K / ~) */}
      <GlobalCommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onExecuteCommand={handleExecuteCommand}
        onSwitchWorkspace={(ws) => handleSelectWorkspace(ws as StudioWorkspace, true)}
        onOpenSkipBack={() => setIsSkipBackOpen(true)}
        onOpenAutoChop={() => {
          const buf = sp404AudioEngine.getSkipBackAudioBuffer('master', 15.0);
          if (buf) handleOpenAutoChop(buf);
        }}
      />

      {/* AI Copilot Drawer */}
      <CopilotDrawer
        isOpen={isCopilotOpen}
        onToggle={() => setIsCopilotOpen(!isCopilotOpen)}
        telemetry={telemetry}
        onExecuteCommand={handleExecuteCommand}
        commandHistory={logs.map((l) => l.content || '').filter(Boolean)}
      />
    </div>
  );
};

export default App;
