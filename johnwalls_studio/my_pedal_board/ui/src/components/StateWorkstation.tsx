import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Play,
  Pause,
  Server,
  Radio,
  Zap,
  Cpu,
  Layers,
  Flame,
  Volume2,
  RefreshCw,
  Power,
  Music,
  Sliders,
  Check,
  Disc,
  ArrowRight,
  Info,
  Terminal,
  Clock,
  Eye,
  Sparkles,
  Plus,
  Trash2,
  Copy,
  SlidersHorizontal,
  VolumeX,
  GitBranch,
  ChevronRight,
  FolderOpen,
  Upload,
  X,
  ChevronDown,
  FileText
} from 'lucide-react';
import {
  AbletonTrackInfo,
  AbletonSceneInfo,
  SuperColliderServerStatus,
  StateTelemetry,
  ReactiveMidiRule
} from '../types';
import {
  stateBridge,
  DEFAULT_REACTIVE_MIDI_RULES,
  RecentAlsProject
} from '../utils/stateBridge';
import { ParsedAbletonSession, clearSessionFromStorage } from '../utils/alsParser';

interface StateWorkstationProps {
  telemetry: StateTelemetry;
  onSwitchToPedalLab: () => void;
  onSwitchToSP404?: () => void;
  onOpenRoutingModal?: () => void;
}

const PRESET_SCENARIOS: {
  id: string;
  name: string;
  description: string;
  rules: ReactiveMidiRule[];
}[] = [
  {
    id: 'user_bass_reactive',
    name: 'Bass 1/4 ➔ 1/16 Arp | Bass 1/16 ➔ 1/4 Stabs',
    description: 'Dynamic lead response: Runs 1/16 arps during slow bass pulses; switches to punchy 1/4 stabs when bass plays 1/16th notes.',
    rules: [
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
    ]
  },
  {
    id: 'trap_ratchet_drum',
    name: 'Kick & Drums ➔ Trap 4x Ratchet Rolls',
    description: 'Instantly bursts into 4x ratchets when 1/16 drum fills occur; relaxes into ambient sustained chords during breakdowns.',
    rules: [
      {
        id: 'rule_drum_ratchet',
        name: 'Drums 1/16 ➔ 4x Trap Ratchet Burst',
        enabled: true,
        sourceTrackFilter: 'drum',
        triggerRhythm: '1/16',
        actionType: 'ratchet_4x',
        param: 4.0,
        scOscAddress: '/state/ratchet'
      },
      {
        id: 'rule_drum_idle_pad',
        name: 'Drums Idle ➔ Sustained Ambient Wash',
        enabled: true,
        sourceTrackFilter: 'drum',
        triggerRhythm: 'idle',
        actionType: 'sustained',
        param: 1.0,
        scOscAddress: '/state/pad'
      }
    ]
  },
  {
    id: 'call_and_response_vocal',
    name: 'Call & Response: Lead Mutes During Vocal',
    description: 'Lead instruments automatically duck to zero volume when vocals are active; bursts into 1/16 riffs when vocal is silent.',
    rules: [
      {
        id: 'rule_vocal_duck',
        name: 'Vocal Active ➔ Mute / Duck Lead Keys',
        enabled: true,
        sourceTrackFilter: 'vocal',
        triggerRhythm: 'any',
        actionType: 'mute',
        param: 0.0,
        scOscAddress: '/state/duck'
      },
      {
        id: 'rule_vocal_idle_solo',
        name: 'Vocal Idle ➔ Lead 1/16 Solo Arp',
        enabled: true,
        sourceTrackFilter: 'vocal',
        triggerRhythm: 'idle',
        actionType: 'arp_1_16',
        param: 1.0,
        scOscAddress: '/state/solo'
      }
    ]
  },
  {
    id: 'harmonic_fifth_power',
    name: 'Harmonic Companion: Auto +7st (5th) & +12st',
    description: 'Generates powerful 5th harmonies (+7 semitones) when bass drives at 1/16; shifts up an octave (+12st) on slow 1/4 bass.',
    rules: [
      {
        id: 'rule_power_5th',
        name: 'Bass 1/16 ➔ Add 5th Power Harmony (+7st)',
        enabled: true,
        sourceTrackFilter: 'bass',
        triggerRhythm: '1/16',
        actionType: 'harmony_5th',
        param: 7.0,
        scOscAddress: '/state/harmony'
      },
      {
        id: 'rule_octave_up',
        name: 'Bass 1/4 ➔ Octave Transpose (+12st)',
        enabled: true,
        sourceTrackFilter: 'bass',
        triggerRhythm: '1/4',
        actionType: 'transpose_12',
        param: 12.0,
        scOscAddress: '/state/octave'
      }
    ]
  }
];

export const StateWorkstation: React.FC<StateWorkstationProps> = ({
  telemetry,
  onSwitchToPedalLab,
  onSwitchToSP404,
  onOpenRoutingModal
}) => {
  // SuperCollider Server State
  const [scStatus, setScStatus] = useState<SuperColliderServerStatus>(() => {
    return (
      telemetry.supercollider || {
        isRunning: false,
        isBooting: false,
        statusText: 'OFFLINE',
        port: 57110,
        pid: 0,
        sampleRate: 48000,
        numSynths: 0,
        numGroups: 0,
        numNodes: 0,
        avgCPU: 0.0,
        peakCPU: 0.0,
        bufferMemoryMb: 0.0,
        binaryPath: '/usr/local/bin/scsynth',
        isVirtual: true
      }
    );
  });

  const [scLoading, setScLoading] = useState(false);
  const [scFeedback, setScFeedback] = useState<string | null>(null);

  // Real Ableton Live Set (.als) Session State
  const [activeSession, setActiveSession] = useState<ParsedAbletonSession | null>(() => {
    return stateBridge.loadSavedSession();
  });
  const [recentProjects, setRecentProjects] = useState<RecentAlsProject[]>([]);
  const [isRecentDropdownOpen, setIsRecentDropdownOpen] = useState(false);
  const [isParsingAls, setIsParsingAls] = useState(false);
  const [alsParseError, setAlsParseError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Real Session Tracks (from parsed .als or host telemetry)
  const [tracks, setTracks] = useState<AbletonTrackInfo[]>(() => {
    const saved = stateBridge.loadSavedSession();
    if (saved && saved.tracks && saved.tracks.length > 0) {
      return saved.tracks;
    }
    return telemetry.sessionTracks && telemetry.sessionTracks.length > 0
      ? telemetry.sessionTracks
      : [];
  });

  // Reactive MIDI Rules and Master Toggle
  const [reactiveRules, setReactiveRules] = useState<ReactiveMidiRule[]>(() => {
    if (telemetry.reactiveMidi?.rules && telemetry.reactiveMidi.rules.length > 0) {
      return telemetry.reactiveMidi.rules;
    }
    return DEFAULT_REACTIVE_MIDI_RULES;
  });
  const [isReactiveEnabled, setIsReactiveEnabled] = useState<boolean>(() => {
    return telemetry.reactiveMidi?.enabled ?? true;
  });

  // Real Ableton Scenes (from parsed .als)
  const [scenes, setScenes] = useState<AbletonSceneInfo[]>(() => {
    const saved = stateBridge.loadSavedSession();
    if (saved && saved.scenes && saved.scenes.length > 0) {
      return saved.scenes;
    }
    return [];
  });
  const [activeTab, setActiveTab] = useState<'reactive' | 'matrix' | 'supercollider' | 'scenes'>('reactive');

  // Rule creation modal / drawer
  const [isAddingRule, setIsAddingRule] = useState<boolean>(false);
  const [newRuleName, setNewRuleName] = useState<string>('Custom Rhythm Rule');
  const [newRuleFilter, setNewRuleFilter] = useState<string>('bass');
  const [newRuleTrigger, setNewRuleTrigger] = useState<ReactiveMidiRule['triggerRhythm']>('1/4');
  const [newRuleAction, setNewRuleAction] = useState<ReactiveMidiRule['actionType']>('arp_1_16');
  const [newRuleOsc, setNewRuleOsc] = useState<string>('/state/rhythm');
  const [copiedOsc, setCopiedOsc] = useState<boolean>(false);

  // Sync telemetry updates
  useEffect(() => {
    if (telemetry.supercollider) {
      setScStatus(telemetry.supercollider);
    }
    if (telemetry.sessionTracks && telemetry.sessionTracks.length > 0) {
      setTracks(telemetry.sessionTracks);
    }
    if (telemetry.reactiveMidi) {
      if (telemetry.reactiveMidi.rules && telemetry.reactiveMidi.rules.length > 0) {
        setReactiveRules(telemetry.reactiveMidi.rules);
      }
      setIsReactiveEnabled(telemetry.reactiveMidi.enabled);
    }
  }, [telemetry]);

  // Live polling of session tracks, SC status & reactive MIDI rules every 1.5s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const fetchedTracks = await stateBridge.fetchSessionTracks();
        if (fetchedTracks && fetchedTracks.length > 0) {
          setTracks(fetchedTracks);
        }
        const fetchedSC = await stateBridge.fetchSuperColliderStatus();
        if (fetchedSC) {
          setScStatus(fetchedSC);
        }
        const fetchedRules = await stateBridge.fetchReactiveMidiRules();
        if (fetchedRules && fetchedRules.length > 0) {
          setReactiveRules(fetchedRules);
        }
      } catch {}
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Discover recent Ableton Live Sets on disk and auto-load if none active
  useEffect(() => {
    let isMounted = true;
    stateBridge.fetchRecentAlsProjects().then((list) => {
      if (!isMounted) return;
      if (list && list.length > 0) {
        setRecentProjects(list);
        const saved = stateBridge.loadSavedSession();
        if (!saved && list[0]?.path) {
          setIsParsingAls(true);
          stateBridge
            .parseAlsByPath(list[0].path)
            .then((parsed) => {
              if (!isMounted) return;
              if (parsed) {
                setActiveSession(parsed);
                setTracks(parsed.tracks);
                setScenes(parsed.scenes);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (isMounted) setIsParsingAls(false);
            });
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectRecentProject = async (project: RecentAlsProject) => {
    setIsParsingAls(true);
    setAlsParseError(null);
    setIsRecentDropdownOpen(false);
    try {
      const parsed = await stateBridge.parseAlsByPath(project.path);
      if (parsed) {
        setActiveSession(parsed);
        setTracks(parsed.tracks);
        setScenes(parsed.scenes);
      } else {
        setAlsParseError(`Could not parse ${project.name}`);
      }
    } catch (err: any) {
      setAlsParseError(err.message || 'Failed to parse project');
    } finally {
      setIsParsingAls(false);
    }
  };

  const handleAlsFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingAls(true);
    setAlsParseError(null);
    try {
      const parsed = await stateBridge.parseAlsFile(file);
      setActiveSession(parsed);
      setTracks(parsed.tracks);
      setScenes(parsed.scenes);
    } catch (err: any) {
      setAlsParseError(err.message || 'Failed to parse .als file');
    } finally {
      setIsParsingAls(false);
    }
  };

  const handleClearSession = () => {
    clearSessionFromStorage();
    setActiveSession(null);
    setTracks([]);
    setScenes([]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.als') || file.name.endsWith('.xml'))) {
      setIsParsingAls(true);
      setAlsParseError(null);
      try {
        const parsed = await stateBridge.parseAlsFile(file);
        setActiveSession(parsed);
        setTracks(parsed.tracks);
        setScenes(parsed.scenes);
      } catch (err: any) {
        setAlsParseError(err.message || 'Failed to parse .als file');
      } finally {
        setIsParsingAls(false);
      }
    }
  };

  const handleBootSC = async () => {
    setScLoading(true);
    setScFeedback('Booting SuperCollider server on UDP 57110...');
    const result = await stateBridge.bootSuperCollider(57110);
    setScStatus(result);
    setScLoading(false);
    setScFeedback('SuperCollider server booted successfully!');
    setTimeout(() => setScFeedback(null), 2500);
  };

  const handleKillSC = async () => {
    setScLoading(true);
    setScFeedback('Stopping SuperCollider server...');
    const result = await stateBridge.killSuperCollider();
    setScStatus(result);
    setScLoading(false);
    setScFeedback('SuperCollider server stopped.');
    setTimeout(() => setScFeedback(null), 2500);
  };

  const handleActionSC = async (action: 'freeAll' | 'testTone' | 'reboot' | 'clearBuffers') => {
    setScLoading(true);
    const actionLabel =
      action === 'freeAll'
        ? 'Freeing all nodes (/g_freeAll 1)...'
        : action === 'testTone'
        ? 'Sending 440Hz test sine tone...'
        : action === 'reboot'
        ? 'Rebooting SuperCollider engine...'
        : 'Clearing audio buffers...';

    setScFeedback(actionLabel);
    const result = await stateBridge.executeSuperColliderAction(action);
    setScStatus(result);
    setScLoading(false);
    setTimeout(() => setScFeedback(null), 2000);
  };

  // Reactive MIDI rule actions
  const handleToggleReactiveMaster = async () => {
    const nextVal = !isReactiveEnabled;
    setIsReactiveEnabled(nextVal);
    await stateBridge.setReactiveMidiEnabled(nextVal);
  };

  const handleToggleRule = async (ruleId: string) => {
    const updated = reactiveRules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    setReactiveRules(updated);
    await stateBridge.toggleReactiveMidiRule(ruleId);
  };

  const handleDeleteRule = async (ruleId: string) => {
    const updated = reactiveRules.filter((r) => r.id !== ruleId);
    setReactiveRules(updated);
    await stateBridge.setReactiveMidiRules(updated);
  };

  const handleApplyPreset = async (presetId: string) => {
    const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (!preset) return;
    setReactiveRules(preset.rules);
    setIsReactiveEnabled(true);
    await stateBridge.setReactiveMidiRules(preset.rules);
    await stateBridge.setReactiveMidiEnabled(true);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const newRule: ReactiveMidiRule = {
      id: `rule_${Date.now()}`,
      name: newRuleName.trim() || 'New Reactive Rule',
      enabled: true,
      sourceTrackFilter: newRuleFilter.trim() || 'all',
      triggerRhythm: newRuleTrigger,
      actionType: newRuleAction,
      param: 1.0,
      scOscAddress: newRuleOsc.trim() || '/state/rhythm'
    };
    const updated = [...reactiveRules, newRule];
    setReactiveRules(updated);
    await stateBridge.addReactiveMidiRule(newRule);
    setIsAddingRule(false);
    setNewRuleName('Custom Rhythm Rule');
  };

  // Note number to Pitch name helper
  const getNoteName = (noteNum: number) => {
    if (noteNum <= 0) return '—';
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const oct = Math.floor(noteNum / 12) - 1;
    const note = notes[noteNum % 12];
    return `${note}${oct}`;
  };

  const currentScene = useMemo(() => {
    if (!scenes || scenes.length === 0) return null;
    const bar = telemetry.barNumber || 1;
    const sceneIndex = Math.min(scenes.length - 1, Math.max(0, Math.floor((bar - 1) / 8)));
    return scenes[sceneIndex] || scenes[0];
  }, [telemetry.barNumber, scenes]);

  const midiTracksCount = tracks.filter((t) => t.trackType === 'midi').length;
  const audioTracksCount = tracks.filter((t) => t.trackType === 'audio').length;

  // Active Bass Track for Dual Visualizer
  const bassTrack = useMemo(() => {
    if (!tracks || tracks.length === 0) return null;
    return (
      tracks.find((t) => t.trackName.toLowerCase().includes('bass')) ||
      tracks.find((t) => t.trackType === 'midi') ||
      tracks[0]
    );
  }, [tracks]);

  // Detected active rhythm on this track or bass
  const detectedBassRhythm = bassTrack?.rhythmPattern || '1/4';
  const detectedLocalRhythm = telemetry.reactiveMidi?.rhythmPattern || '1/16';

  // Find currently firing rule
  const firingRule = useMemo(() => {
    if (!isReactiveEnabled) return null;
    return reactiveRules.find((rule) => {
      if (!rule.enabled) return false;
      const matchingTrack = tracks.find((t) => {
        if (rule.sourceTrackFilter === 'all') return true;
        return t.trackName.toLowerCase().includes(rule.sourceTrackFilter.toLowerCase());
      });
      if (!matchingTrack) return false;
      if (rule.triggerRhythm === 'any') return matchingTrack.isMidiActive;
      return matchingTrack.rhythmPattern === rule.triggerRhythm;
    });
  }, [reactiveRules, tracks, isReactiveEnabled]);

  const handleCopyOscCode = () => {
    const code = `// SuperCollider Reactive OSC Listener:
OSCdef(\\reactiveMidiResponder, { |msg, time, addr, recvPort|
    var note = msg[1];
    var vel = msg[2];
    var mode = msg[3]; // 'arp_1_16', 'stabs_1_4', etc.
    ("Reactive MIDI Event from Ableton: " ++ mode ++ " Note: " ++ note).postln;
    
    Synth(\\jws_fmpad, [
        \\freq, note.midicps,
        \\amp, (vel / 127.0) * 0.5,
        \\pan, 0.0
    ]);
}, '/state/rhythm');`;
    navigator.clipboard.writeText(code);
    setCopiedOsc(true);
    setTimeout(() => setCopiedOsc(false), 2000);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 bg-[#090b10] flex flex-col overflow-hidden font-mono select-none text-slate-200"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-[#090b10]/92 backdrop-blur-sm border-2 border-dashed border-cyan-400 flex flex-col items-center justify-center p-8 pointer-events-none">
          <Upload size={48} className="text-cyan-400 animate-bounce mb-3" />
          <h2 className="text-lg font-black text-white">Drop Ableton Live Set (.als) to Link Session</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-md text-center">
            Instantly extracts all real MIDI & audio stems, Ableton track colors, and scenes directly from the session file.
          </p>
        </div>
      )}

      {/* 1. Header Bar: Status, Ableton Live Transport & View Switcher */}
      <div className="h-12 bg-[#0d1017] border-b border-slate-800 px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Radio size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest uppercase text-white">
                STATE
              </span>
              <span className="text-[9.5px] px-2 py-0.5 rounded font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                REACTIVE MIDI & GLOBAL HUB
              </span>
            </div>
          </div>
        </div>

        {/* Live Ableton Transport HUD */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-[#121520] px-3 py-1 rounded-lg border border-slate-800">
            <div
              className={`w-2 h-2 rounded-full ${
                telemetry.isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="text-[10px] text-slate-400 uppercase font-bold">LIVE:</span>
            <span className="font-bold text-white">
              {telemetry.isPlaying ? 'PLAYING' : 'STOPPED'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#121520] px-3 py-1 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400">TEMPO:</span>
            <span className="font-bold text-amber-300">
              {(telemetry.bpm || 120).toFixed(1)} BPM
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#121520] px-3 py-1 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400">BAR:</span>
            <span className="font-bold text-white">{telemetry.barNumber || 1}</span>
            <span className="text-[10px] text-slate-500 font-mono">
              ({telemetry.timeSigNum || 4}/{telemetry.timeSigDen || 4})
            </span>
          </div>

          {/* Reactive Status Badge */}
          <div
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-bold ${
              isReactiveEnabled
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            <Sparkles size={12} className={isReactiveEnabled ? 'text-purple-400' : 'text-slate-600'} />
            <span>{isReactiveEnabled ? 'REACTIVE MIDI ENGAGED' : 'REACTIVE BYPASS'}</span>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#121520] p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('reactive')}
              className={`px-3 py-1 rounded transition font-bold flex items-center gap-1.5 ${
                activeTab === 'reactive'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles size={13} className={activeTab === 'reactive' ? 'text-amber-300' : 'text-purple-400'} />
              <span>Reactive MIDI</span>
              {isReactiveEnabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1 rounded transition font-bold flex items-center gap-1.5 ${
                activeTab === 'matrix'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers size={13} className="text-cyan-400" />
              <span>Track Matrix ({tracks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('supercollider')}
              className={`px-3 py-1 rounded transition font-bold flex items-center gap-1.5 ${
                activeTab === 'supercollider'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server size={13} className="text-emerald-400" />
              <span>SuperCollider</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  scStatus.isRunning ? 'bg-emerald-400' : 'bg-slate-600'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('scenes')}
              className={`px-3 py-1 rounded transition font-bold flex items-center gap-1.5 ${
                activeTab === 'scenes'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Disc size={13} className="text-amber-400" />
              <span>Ableton Scenes</span>
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1" />

            {/* Universal Module & Routing Nav Buttons */}
            {onOpenRoutingModal && (
              <button
                type="button"
                onClick={onOpenRoutingModal}
                className="px-2.5 py-1 rounded transition font-bold flex items-center gap-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs shadow-sm"
                title="Open Universal Studio Signal Flow & Routing Screen"
              >
                <GitBranch size={13} className="text-cyan-400" />
                <span>Routing</span>
              </button>
            )}

            <button
              type="button"
              onClick={onSwitchToPedalLab}
              className="px-2.5 py-1 rounded transition font-bold flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs shadow-sm"
              title="Switch to Pedal Lab Workspace"
            >
              <Sliders size={13} className="text-emerald-400" />
              <span>Pedal Lab</span>
            </button>

            {onSwitchToSP404 && (
              <button
                type="button"
                onClick={onSwitchToSP404}
                className="px-2.5 py-1 rounded transition font-bold flex items-center gap-1.5 bg-[#ff5500]/20 hover:bg-[#ff5500]/30 text-[#ff8844] border border-[#ff5500]/40 text-xs shadow-sm"
                title="Switch to SP-404 MKII Workspace"
              >
                <Disc size={13} className="text-[#ff5500]" />
                <span>SP-404</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Real Ableton Session (.als) Project Bar */}
      <div className="bg-[#0b0e15] border-b border-slate-800/80 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs z-20">
        <div className="flex items-center gap-3">
          {activeSession ? (
            <>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>ABLETON SET LINKED:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm">{activeSession.projectName}</span>
                <span className="text-[10px] text-slate-500 font-mono">({activeSession.creator || 'Live Set'})</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                  {activeSession.tracks.length} Tracks ({activeSession.tracks.filter((t) => t.trackType === 'midi').length} MIDI)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                  {activeSession.scenes.length} Scenes
                </span>
                {activeSession.tempo && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300">
                    {activeSession.tempo.toFixed(1)} BPM
                  </span>
                )}
                {telemetry.currentTrackName && (
                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold">
                    Host Track: "{telemetry.currentTrackName}"
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold text-[11px]">
                <Info size={13} />
                <span>NO LIVE SET (.ALS) LINKED</span>
              </div>
              <span className="text-[11px] text-slate-400">
                DAW plugins are sandboxed to their track. Drop your project's .als to inspect all tracks & scenes.
              </span>
            </>
          )}
        </div>

        {/* Action Controls: Recent Picker, Upload, Unlink */}
        <div className="flex items-center gap-2 relative">
          {/* Recent projects dropdown */}
          {recentProjects.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsRecentDropdownOpen(!isRecentDropdownOpen)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition"
              >
                <FolderOpen size={13} className="text-cyan-400" />
                <span>Recent Sets ({recentProjects.length})</span>
                <ChevronDown size={12} />
              </button>

              {isRecentDropdownOpen && (
                <div className="absolute right-0 mt-1 w-72 bg-[#121622] border border-slate-700 rounded-xl shadow-2xl py-1 z-50 divide-y divide-slate-800/80">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Detected Ableton Projects
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {recentProjects.map((p) => (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => handleSelectRecentProject(p)}
                        className="w-full px-3 py-2 text-left hover:bg-cyan-500/15 transition flex flex-col gap-0.5 group"
                      >
                        <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                          {p.name}
                        </div>
                        <div className="text-[9.5px] text-slate-500 truncate font-mono">
                          {p.path}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* File Upload Button */}
          <label className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition shadow-sm">
            <Upload size={13} />
            <span>Load .als</span>
            <input
              type="file"
              accept=".als,.xml"
              onChange={handleAlsFileSelect}
              className="hidden"
            />
          </label>

          {/* Unlink / Eject Button */}
          {activeSession && (
            <button
              type="button"
              onClick={handleClearSession}
              className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition"
              title="Unlink current project session"
            >
              <X size={14} />
            </button>
          )}

          {isParsingAls && (
            <div className="flex items-center gap-1.5 text-cyan-400 text-xs">
              <RefreshCw size={13} className="animate-spin" />
              <span>Parsing .als...</span>
            </div>
          )}
        </div>
      </div>

      {alsParseError && (
        <div className="bg-rose-500/15 border-b border-rose-500/30 px-6 py-2 text-rose-300 text-xs flex items-center justify-between">
          <span>Error parsing project: {alsParseError}</span>
          <button type="button" onClick={() => setAlsParseError(null)} className="text-rose-400 hover:text-white">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Main Body Content based on active tab */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ======================================================== */}
        {/* TAB 0: REACTIVE MIDI ENGINE & CROSS-TRACK RULES           */}
        {/* ======================================================== */}
        {activeTab === 'reactive' && (
          <div className="space-y-6">
            {/* Top Master Controller Card */}
            <div className="p-6 bg-gradient-to-r from-[#141224] via-[#111422] to-[#0f172a] border border-purple-500/30 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.25)]">
                  <Sparkles size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white tracking-wide">
                      SAMPLE-ACCURATE REACTIVE MIDI ENGINE
                    </h3>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border ${
                        isReactiveEnabled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 animate-pulse'
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}
                    >
                      {isReactiveEnabled ? 'LIVE & SENSING' : 'BYPASSED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Observes incoming rhythms across all Ableton Live stems and transforms this track’s MIDI in real-time
                    (e.g., switches to 1/16 arpeggio when Bass plays 1/4; switches to 1/4 stabs when Bass plays 1/16).
                  </p>
                </div>
              </div>

              {/* Master Engine Switch */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleReactiveMaster}
                  className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition shadow-lg ${
                    isReactiveEnabled
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 border border-purple-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
                  }`}
                >
                  <Power size={15} />
                  <span>{isReactiveEnabled ? 'REACTIVE ENGINE ON' : 'ENABLE REACTIVE'}</span>
                </button>
              </div>
            </div>

            {/* Real-time Rhythm & Registration Meters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                  <span>Detected Local Rhythm</span>
                  <Activity size={14} className="text-purple-400" />
                </div>
                <div className="text-2xl font-black text-white mt-1 flex items-center gap-2">
                  <span>{detectedLocalRhythm}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <span className="text-[10px] text-slate-400">Current Lead Pattern</span>
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-cyan-500/30">
                <div className="flex items-center justify-between text-cyan-400 text-[10px] font-bold uppercase">
                  <span>Observed Bass Rhythm</span>
                  <Radio size={14} />
                </div>
                <div className="text-2xl font-black text-cyan-300 mt-1">
                  {detectedBassRhythm}
                </div>
                <span className="text-[10px] text-slate-400">
                  {bassTrack?.trackName || 'Bass Track'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                  <span>Note Density</span>
                  <SlidersHorizontal size={14} />
                </div>
                <div className="text-2xl font-black text-white mt-1">
                  {(telemetry.reactiveMidi?.noteDensity || 4.0).toFixed(1)} /s
                </div>
                <span className="text-[10px] text-slate-400">Events per second</span>
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-emerald-500/30">
                <div className="flex items-center justify-between text-emerald-400 text-[10px] font-bold uppercase">
                  <span>Active Transform</span>
                  <Zap size={14} />
                </div>
                <div className="text-sm font-black text-emerald-300 mt-1 truncate">
                  {firingRule ? firingRule.name : 'Direct Passthrough'}
                </div>
                <span className="text-[10px] text-slate-400">
                  {firingRule ? `Action: ${firingRule.actionType}` : 'No rule triggered'}
                </span>
              </div>
            </div>

            {/* DUAL-TRACK RHYTHM COMPARISON VISUALIZER LANE */}
            <div className="p-5 bg-[#10131d] border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <GitBranch size={15} className="text-purple-400" />
                  Dual-Track Reactive Flow Lane (Source Track ➔ Local MIDI Output)
                </span>
                <span className="text-[10px] text-slate-400">
                  Sample-Accurate Zero-Allocation Transform
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-11 items-center gap-3 bg-[#090b10] p-4 rounded-xl border border-slate-800/80">
                {/* Source Track Display */}
                <div className="md:col-span-4 p-3 rounded-lg bg-[#121622] border border-cyan-500/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-cyan-400 font-bold uppercase">
                      Source Track (Observer)
                    </span>
                    <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono">
                      CH #{bassTrack?.midiChannel || 2}
                    </span>
                  </div>
                  <div className="font-black text-white text-sm">
                    {bassTrack?.trackName || 'Track 2: Sub Bass (303)'}
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span className="text-slate-400 text-[10px]">Detected Rhythm:</span>
                    <span className="font-black px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/50">
                      {detectedBassRhythm} NOTES
                    </span>
                    <span className="text-slate-500 text-[10px]">
                      (~{bassTrack?.avgIntervalBeats || 1.0} beats)
                    </span>
                  </div>
                </div>

                {/* Animated Flow Arrow */}
                <div className="md:col-span-3 flex flex-col items-center justify-center text-center p-2">
                  <div className="flex items-center gap-1 text-purple-400 font-black text-xs">
                    <Sparkles size={14} className="animate-spin" />
                    <span>REACTS ON THE FLY</span>
                    <ArrowRight size={14} />
                  </div>
                  <span className="text-[9.5px] text-slate-500 mt-1 font-mono">
                    {firingRule ? firingRule.name : 'Listening to project bus...'}
                  </span>
                </div>

                {/* Local Track Transformed Output */}
                <div className="md:col-span-4 p-3 rounded-lg bg-[#141222] border border-purple-500/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-purple-400 font-bold uppercase">
                      This Track (Reactive Output)
                    </span>
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono">
                      LEAD / KEYS
                    </span>
                  </div>
                  <div className="font-black text-white text-sm">
                    {firingRule
                      ? `Transformation: ${firingRule.actionType.toUpperCase().replace('_', ' ')}`
                      : 'Unmodified Dry MIDI In'}
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span className="text-slate-400 text-[10px]">Generated Pattern:</span>
                    <span className="font-black px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700/50">
                      {firingRule?.actionType === 'arp_1_16'
                        ? '1/16 ARPEGGIO'
                        : firingRule?.actionType === 'stabs_1_4'
                        ? '1/4 PUNCHY STABS'
                        : firingRule?.actionType === 'sustained'
                        ? 'SUSTAINED WASH'
                        : firingRule?.actionType === 'ratchet_4x'
                        ? '4X RATCHET BURST'
                        : 'DRY PASSTHROUGH'}
                    </span>
                    <span className="text-slate-500 text-[10px]">OSC: {firingRule?.scOscAddress || '/state/rhythm'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* INSTANT SCENARIO PRESETS BAR */}
            <div className="p-5 bg-[#11141e] border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Flame size={14} className="text-amber-400" />
                  Instant Scenario Presets (1-Click Application)
                </span>
                <span className="text-[10px] text-slate-400">
                  Select a workflow pattern or create custom rules below
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {PRESET_SCENARIOS.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-3.5 rounded-xl bg-[#090b10] border border-slate-800 hover:border-purple-500/50 transition flex flex-col justify-between group"
                  >
                    <div>
                      <div className="font-black text-xs text-white group-hover:text-purple-300 transition">
                        {preset.name}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyPreset(preset.id)}
                      className="mt-3 w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-purple-600 text-slate-200 hover:text-white font-bold text-[10.5px] transition flex items-center justify-center gap-1.5"
                    >
                      <Zap size={12} className="text-amber-400" />
                      <span>Apply Preset</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ACTIVE REACTIVE RULES MATRIX */}
            <div className="bg-[#11141e] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 bg-[#0e111a] border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    ACTIVE REACTIVE RULES MATRIX
                  </span>
                  <span className="text-[9.5px] text-slate-400 font-mono">
                    ({reactiveRules.length} Defined Rules)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddingRule(!isAddingRule)}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-[11px] flex items-center gap-1.5 transition shadow"
                >
                  <Plus size={13} />
                  <span>Add Reactive Rule</span>
                </button>
              </div>

              {/* Inline Rule Creator Form */}
              {isAddingRule && (
                <form
                  onSubmit={handleCreateRule}
                  className="p-5 bg-[#141220] border-b border-purple-500/30 space-y-4 animate-fade-in"
                >
                  <div className="text-xs font-extrabold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} />
                    <span>Create Custom Cross-Track Reactive Rule</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        Rule Name
                      </label>
                      <input
                        type="text"
                        value={newRuleName}
                        onChange={(e) => setNewRuleName(e.target.value)}
                        placeholder="e.g. Bass 1/4 ➔ 1/16 Arp"
                        className="w-full bg-[#090b10] border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-purple-400 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        Source Track Filter
                      </label>
                      <input
                        type="text"
                        value={newRuleFilter}
                        onChange={(e) => setNewRuleFilter(e.target.value)}
                        placeholder="e.g. bass, drum, vocal, all"
                        className="w-full bg-[#090b10] border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-purple-400 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        When Rhythm Pattern Is
                      </label>
                      <select
                        value={newRuleTrigger}
                        onChange={(e) => setNewRuleTrigger(e.target.value as any)}
                        className="w-full bg-[#090b10] border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-purple-400 outline-none"
                      >
                        <option value="1/4">1/4 Quarter Notes</option>
                        <option value="1/8">1/8 Eighth Notes</option>
                        <option value="1/16">1/16 Sixteenth Notes</option>
                        <option value="1/32">1/32 Thirty-Second Notes</option>
                        <option value="triplet">Triplet Rhythm</option>
                        <option value="half">Half / Sustained</option>
                        <option value="idle">Idle / Silence</option>
                        <option value="any">Any Note Activity</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        Transform Local MIDI To
                      </label>
                      <select
                        value={newRuleAction}
                        onChange={(e) => setNewRuleAction(e.target.value as any)}
                        className="w-full bg-[#090b10] border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-purple-400 outline-none"
                      >
                        <option value="arp_1_16">1/16 Running Arpeggio</option>
                        <option value="stabs_1_4">1/4 Offbeat Stabs</option>
                        <option value="arp_1_8">1/8 Walking Arp</option>
                        <option value="sustained">Sustained Atmospheric Wash</option>
                        <option value="ratchet_4x">4x Trap Ratchet Burst</option>
                        <option value="harmony_5th">Add 5th Power Harmony (+7st)</option>
                        <option value="transpose_12">Transpose Up Octave (+12st)</option>
                        <option value="mute">Mute / Silence (Duck)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        SuperCollider OSC Target
                      </label>
                      <input
                        type="text"
                        value={newRuleOsc}
                        onChange={(e) => setNewRuleOsc(e.target.value)}
                        placeholder="/state/rhythm"
                        className="w-full bg-[#090b10] border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-purple-400 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingRule(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs font-bold transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-black transition shadow"
                    >
                      Save Rule & Activate
                    </button>
                  </div>
                </form>
              )}

              {/* Rules List */}
              <div className="divide-y divide-slate-800/80">
                {reactiveRules.map((rule) => {
                  const isFiring =
                    isReactiveEnabled &&
                    rule.enabled &&
                    firingRule?.id === rule.id;

                  return (
                    <div
                      key={rule.id}
                      className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 transition text-xs ${
                        isFiring ? 'bg-purple-950/30 border-l-4 border-purple-500' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      {/* Name & Active Status Indicator */}
                      <div className="flex items-center gap-3 w-80">
                        <button
                          type="button"
                          onClick={() => handleToggleRule(rule.id)}
                          className={`w-5 h-5 rounded flex items-center justify-center border transition ${
                            rule.enabled
                              ? 'bg-purple-600 border-purple-400 text-white'
                              : 'bg-slate-900 border-slate-700 text-transparent'
                          }`}
                          title={rule.enabled ? 'Click to disable' : 'Click to enable'}
                        >
                          <Check size={12} />
                        </button>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-[13px]">
                              {rule.name}
                            </span>
                            {isFiring && (
                              <span className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                FIRING LIVE
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            OSC: {rule.scOscAddress || '/state/rhythm'}
                          </span>
                        </div>
                      </div>

                      {/* Source Track Condition */}
                      <div className="flex items-center gap-2 w-64">
                        <span className="text-[10px] text-slate-500 uppercase">When:</span>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold text-[10px]">
                          [{rule.sourceTrackFilter.toUpperCase()}]
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">is</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-black text-[10px]">
                          {rule.triggerRhythm.toUpperCase()}
                        </span>
                      </div>

                      {/* Target Action */}
                      <div className="flex items-center gap-2 w-56">
                        <ArrowRight size={13} className="text-purple-400" />
                        <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/40 font-black text-[10px]">
                          {rule.actionType.toUpperCase().replace('_', ' ')}
                        </span>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleRule(rule.id)}
                          className={`text-[10px] px-2.5 py-1 rounded font-bold border transition ${
                            rule.enabled
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                              : 'bg-slate-900 text-slate-500 border-slate-800'
                          }`}
                        >
                          {rule.enabled ? 'ACTIVE' : 'MUTED'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                          title="Delete rule"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SUPERCOLLIDER LIVE OSC INTEGRATION CODE CARD */}
            <div className="bg-[#11141e] border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Server size={14} className="text-emerald-400" />
                  SuperCollider OSC Live Link (Auto-Dispatched by Reactive Rules)
                </span>
                <button
                  type="button"
                  onClick={handleCopyOscCode}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition"
                >
                  {copiedOsc ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedOsc ? 'Copied to Clipboard!' : 'Copy OSCdef Code'}</span>
                </button>
              </div>

              <pre className="text-[11px] text-slate-400 bg-[#090b10] p-3 rounded-lg border border-slate-800/80 overflow-x-auto leading-relaxed">
{`// SuperCollider Reactive OSC Listener:
OSCdef(\\reactiveMidiResponder, { |msg, time, addr, recvPort|
    var note = msg[1];
    var vel = msg[2];
    var mode = msg[3]; // 'arp_1_16', 'stabs_1_4', 'sustained', etc.
    ("Reactive MIDI Event from Ableton: " ++ mode ++ " Note: " ++ note).postln;
    
    Synth(\\jws_fmpad, [
        \\freq, note.midicps,
        \\amp, (vel / 127.0) * 0.5,
        \\pan, 0.0
    ]);
}, '/state/rhythm');`}
              </pre>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 1: GLOBAL TRACK MATRIX & LIVE SESSION AWARENESS       */}
        {/* ======================================================== */}
        {activeTab === 'matrix' && (
          <div className="space-y-6">
            {/* Top Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Total Tracks</span>
                  <div className="text-2xl font-black text-white mt-1">{tracks.length}</div>
                  <span className="text-[10px] text-slate-400">All Session Stems</span>
                </div>
                <Layers size={28} className="text-slate-700" />
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-cyan-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-cyan-400 uppercase font-bold">Tracks With MIDI</span>
                  <div className="text-2xl font-black text-cyan-300 mt-1">{midiTracksCount}</div>
                  <span className="text-[10px] text-slate-400">Active Controllers & Clips</span>
                </div>
                <Music size={28} className="text-cyan-500/40" />
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Audio Stems</span>
                  <div className="text-2xl font-black text-white mt-1">{audioTracksCount}</div>
                  <span className="text-[10px] text-slate-400">Line & Mic Inputs</span>
                </div>
                <Volume2 size={28} className="text-slate-700" />
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-400 uppercase font-bold">Live Set Source</span>
                  <div className="text-sm font-black text-emerald-300 mt-1 truncate max-w-[160px]">
                    {activeSession ? activeSession.projectName : 'WAITING FOR .ALS'}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {activeSession ? `${tracks.length} Real Project Stems` : 'Drop .als to Load'}
                  </span>
                </div>
                <Zap size={28} className="text-emerald-500/40" />
              </div>
            </div>

            {/* If no tracks are loaded, show clean helpful guidance */}
            {tracks.length === 0 ? (
              <div className="p-12 bg-[#11141e] border border-slate-800 rounded-2xl text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <FileText size={32} />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-base font-extrabold text-white">No Ableton Tracks Loaded Yet</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Ableton Live isolates VST3/AU plugins to their assigned track. State inspects your actual 
                    <code className="text-cyan-300 bg-slate-900 px-1.5 py-0.5 rounded mx-1">.als</code> project file 
                    to discover all real MIDI tracks, audio stems, track colors, and scenes in your song.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <label className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center gap-2 cursor-pointer transition shadow-lg shadow-cyan-500/20">
                    <Upload size={14} />
                    <span>Drop or Select .als File</span>
                    <input type="file" accept=".als,.xml" onChange={handleAlsFileSelect} className="hidden" />
                  </label>

                  {recentProjects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSelectRecentProject(recentProjects[0])}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition"
                    >
                      <FolderOpen size={14} className="text-cyan-400" />
                      <span>Load Recent: {recentProjects[0].name}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Session Track Awareness Table */
              <div className="bg-[#11141e] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="px-5 py-3.5 bg-[#0e111a] border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      ABLETON LIVE TRACK MATRIX & REAL-TIME SENSING
                    </span>
                    <span className="text-[9.5px] text-slate-400 font-mono">
                      ({activeSession?.projectName || 'Live Set'} · {tracks.length} Stems)
                    </span>
                  </div>
                  <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    REAL-TIME SENSING
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {tracks.map((track) => {
                    const isMidi = track.trackType === 'midi';
                    const activeNoteStr =
                      isMidi && track.lastNoteNumber > 0
                        ? getNoteName(track.lastNoteNumber)
                        : '—';
                    const isCurrentHostTrack = Boolean(
                      telemetry.currentTrackName &&
                      track.trackName.trim().toLowerCase() === telemetry.currentTrackName.trim().toLowerCase()
                    );

                    return (
                      <div
                        key={track.instanceId}
                        className={`px-5 py-3 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-800/30 transition text-xs ${
                          isCurrentHostTrack ? 'bg-cyan-950/20 border-l-2 border-cyan-400' : ''
                        }`}
                      >
                        {/* Track Identification & Ableton Color */}
                        <div className="flex items-center gap-3 w-72">
                          {track.colorHex && (
                            <div
                              className="w-2.5 h-8 rounded-sm shrink-0 shadow-sm"
                              style={{ backgroundColor: track.colorHex }}
                              title={`Ableton Color: ${track.colorHex}`}
                            />
                          )}
                          <span className="w-5 text-slate-500 font-mono text-[11px]">
                            #{track.trackIndex}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-white text-[13px]">
                                {track.trackName}
                              </span>
                              {isCurrentHostTrack && (
                                <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-black">
                                  THIS TRACK
                                </span>
                              )}
                            </div>
                            <span className="text-[9.5px] text-slate-500 font-mono">
                              ID: [{track.instanceId}]
                            </span>
                          </div>
                        </div>

                        {/* Type Badge */}
                        <div className="w-28">
                          <span
                            className={`text-[9.5px] uppercase font-bold px-2 py-0.5 rounded border ${
                              isMidi
                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                                : track.trackType === 'master'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {isMidi ? 'MIDI TRACK' : track.trackType.toUpperCase()}
                          </span>
                        </div>

                        {/* MIDI Channel & Rhythm Details */}
                        <div className="flex items-center gap-3 w-72">
                          {isMidi ? (
                            <>
                              <div className="flex items-center gap-1.5 bg-[#090b10] px-2 py-1 rounded border border-slate-800">
                                <span className="text-[9px] text-slate-500">CH</span>
                                <span className="font-bold text-cyan-300">{track.midiChannel}</span>
                              </div>

                              <div className="flex items-center gap-1.5 bg-[#090b10] px-2.5 py-1 rounded border border-cyan-500/30">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                <span className="text-[10px] text-slate-400">NOTE:</span>
                                <span className="font-bold text-white text-xs">
                                  {activeNoteStr}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 bg-[#090b10] px-2 py-1 rounded border border-purple-500/30">
                                <span className="text-[9px] text-purple-400 font-bold">
                                  {track.rhythmPattern || '1/4'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-600 text-[10px]">Audio Track</span>
                          )}
                        </div>

                        {/* Live Audio Level Meters */}
                        <div className="flex items-center gap-3 w-44">
                          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800 relative">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-rose-500 transition-all duration-150"
                              style={{
                                width: `${Math.min(100, Math.max(5, (track.peakDb + 60) * 1.66))}%`
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 w-12 text-right">
                            {track.peakDb.toFixed(1)}dB
                          </span>
                        </div>

                        {/* Status Flags: Armed, Solo, Mute */}
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                              track.isArmed
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                                : 'bg-slate-900 text-slate-600 border-slate-800'
                            }`}
                          >
                            REC
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                              track.isSolo
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                : 'bg-slate-900 text-slate-600 border-slate-800'
                            }`}
                          >
                            S
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                              track.isMute
                                ? 'bg-red-500/20 text-red-300 border-red-500/50'
                                : 'bg-slate-900 text-slate-600 border-slate-800'
                            }`}
                          >
                            M
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Live Interactive MIDI Octave Visualizer */}
            <div className="p-5 bg-[#11141e] border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Music size={14} className="text-cyan-400" />
                  Live MIDI Keyboard Octave Monitor (All Active Tracks)
                </span>
                <span className="text-[10px] text-slate-400">
                  Global Note Sensing Range C1 – B5
                </span>
              </div>

              {/* 36-Key Visual Piano Strip */}
              <div className="flex h-16 bg-[#090b10] p-1 rounded-lg border border-slate-800 overflow-x-auto">
                {Array.from({ length: 36 }).map((_, idx) => {
                  const midiNote = 36 + idx; // C2 to B4
                  const isBlackKey = [1, 3, 6, 8, 10].includes(midiNote % 12);
                  const isHit = tracks.some(
                    (t) => t.isMidiActive && (t.lastNoteNumber === midiNote || t.heldNotes?.includes(midiNote))
                  );

                  return (
                    <div
                      key={midiNote}
                      className={`flex-1 flex flex-col justify-end items-center pb-1 text-[8px] font-mono border-r border-slate-800/80 transition-all ${
                        isHit
                          ? 'bg-cyan-400 text-slate-950 font-black shadow-[0_0_12px_#22d3ee]'
                          : isBlackKey
                          ? 'bg-[#141822] text-slate-600'
                          : 'bg-[#1f2433] text-slate-400'
                      }`}
                      title={`${getNoteName(midiNote)} (MIDI ${midiNote})`}
                    >
                      {midiNote % 12 === 0 && <span className="font-bold">C{Math.floor(midiNote / 12) - 1}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: SUPERCOLLIDER SERVER CONTROL & WORKFLOW SPIN-UP    */}
        {/* ======================================================== */}
        {activeTab === 'supercollider' && (
          <div className="space-y-6">
            {/* Top SuperCollider Server Deck */}
            <div className="p-6 bg-[#11141e] border border-slate-800 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Server size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">
                      SUPERCOLLIDER AUDIO SERVER ENGINE
                    </h3>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        scStatus.isRunning
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : scStatus.isBooting
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {scStatus.statusText}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Direct UDP OSC control bus (Port {scStatus.port}) for real-time algorithmic synthesis & sound design.
                  </p>
                </div>
              </div>

              {/* Server Boot / Kill Action Controls */}
              <div className="flex items-center gap-3">
                {scStatus.isRunning ? (
                  <button
                    type="button"
                    disabled={scLoading}
                    onClick={handleKillSC}
                    className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 font-bold text-xs flex items-center gap-2 transition"
                  >
                    <Power size={14} />
                    <span>Kill Server</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={scLoading}
                    onClick={handleBootSC}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
                  >
                    <Zap size={15} />
                    <span>Boot SC Server</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={scLoading || !scStatus.isRunning}
                  onClick={() => handleActionSC('reboot')}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition"
                  title="Reboot SuperCollider"
                >
                  <RefreshCw size={13} className={scLoading ? 'animate-spin' : ''} />
                  <span>Reboot</span>
                </button>
              </div>
            </div>

            {/* Notification / Feedback Banner */}
            {scFeedback && (
              <div className="p-3 bg-cyan-500/15 border border-cyan-500/40 rounded-xl text-cyan-300 text-xs font-bold flex items-center gap-2 animate-fade-in">
                <Check size={14} />
                <span>{scFeedback}</span>
              </div>
            )}

            {/* Real-time Server Gauges Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                  <span>DSP CPU Usage</span>
                  <Cpu size={14} />
                </div>
                <div className="text-xl font-extrabold text-white mt-1">
                  {scStatus.avgCPU.toFixed(1)}%
                </div>
                <span className="text-[10px] text-slate-400">Peak: {scStatus.peakCPU.toFixed(1)}%</span>
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                  <span>Active Synths</span>
                  <Flame size={14} />
                </div>
                <div className="text-xl font-extrabold text-white mt-1">
                  {scStatus.numSynths}
                </div>
                <span className="text-[10px] text-slate-400">Audio Graph Synths</span>
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                  <span>Graph Nodes</span>
                  <Layers size={14} />
                </div>
                <div className="text-xl font-extrabold text-white mt-1">
                  {scStatus.numNodes}
                </div>
                <span className="text-[10px] text-slate-400">{scStatus.numGroups} Node Groups</span>
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                  <span>Sample Rate</span>
                  <Activity size={14} />
                </div>
                <div className="text-xl font-extrabold text-white mt-1">
                  {(scStatus.sampleRate / 1000).toFixed(1)} kHz
                </div>
                <span className="text-[10px] text-slate-400">scsynth Core Clock</span>
              </div>

              <div className="p-4 rounded-xl bg-[#11141e] border border-slate-800">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                  <span>Buffer Memory</span>
                  <Disc size={14} />
                </div>
                <div className="text-xl font-extrabold text-white mt-1">
                  {scStatus.bufferMemoryMb.toFixed(0)} MB
                </div>
                <span className="text-[10px] text-slate-400">Wavetable & Grain RAM</span>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="p-5 bg-[#11141e] border border-slate-800 rounded-xl space-y-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider block">
                SUPERCOLLIDER WORKFLOW ACTIONS & OSC DISPATCH
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!scStatus.isRunning || scLoading}
                  onClick={() => handleActionSC('freeAll')}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-2"
                >
                  <RefreshCw size={13} />
                  <span>Free All Nodes (/g_freeAll 1)</span>
                </button>

                <button
                  type="button"
                  disabled={!scStatus.isRunning || scLoading}
                  onClick={() => handleActionSC('testTone')}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-bold transition flex items-center gap-2"
                >
                  <Volume2 size={13} />
                  <span>Audition 440Hz Sine Ping</span>
                </button>

                <button
                  type="button"
                  disabled={!scStatus.isRunning || scLoading}
                  onClick={() => handleActionSC('clearBuffers')}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-2"
                >
                  <Disc size={13} />
                  <span>Flush Audio Buffers</span>
                </button>
              </div>
            </div>

            {/* SuperCollider Workflow Snippets */}
            <div className="bg-[#11141e] border border-slate-800 rounded-xl p-5 space-y-4">
              <span className="text-xs font-bold text-white uppercase tracking-wider block">
                INTEGRATED SUPERCOLLIDER WORKFLOW TEMPLATES
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3.5 rounded-lg bg-[#090b10] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-cyan-300 font-bold">
                    <span>1. Polyphonic FM Ambient Pad</span>
                    <span className="text-[10px] text-slate-500">MIDI Track Link</span>
                  </div>
                  <pre className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded overflow-x-auto leading-relaxed">
{`SynthDef(\\jws_fmpad, { |out=0, freq=440, gate=1, amp=0.5|
    var mod = SinOsc.ar(freq * 1.5) * freq * 0.8;
    var car = SinOsc.ar(freq + mod);
    var env = EnvGen.kr(Env.adsr(0.8, 0.4, 0.7, 1.2), gate, doneAction: 2);
    Out.ar(out, Pan2.ar(car * env * amp, 0.0));
}).add;`}
                  </pre>
                </div>

                <div className="p-3.5 rounded-lg bg-[#090b10] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-amber-300 font-bold">
                    <span>2. Granular Cloud & Tape Glitch</span>
                    <span className="text-[10px] text-slate-500">Buffer Texture</span>
                  </div>
                  <pre className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded overflow-x-auto leading-relaxed">
{`SynthDef(\\jws_grain, { |out=0, bufnum=0, rate=1.0, pan=0.0|
    var trig = Dust.kr(32);
    var grain = GrainBuf.ar(2, trig, 0.12, bufnum, rate, 0.5, 2, pan);
    Out.ar(out, grain * 0.4);
}).add;`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: ABLETON LIVE SCENES & ARRANGEMENT MONITOR          */}
        {/* ======================================================== */}
        {activeTab === 'scenes' && (
          <div className="space-y-6">
            <div className="p-5 bg-[#11141e] border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider block">
                ABLETON LIVE SCENE MATRIX & PLAYHEAD TRACKING
              </span>
              <p className="text-xs text-slate-400">
                Observes session clips and scene progression without interfering with Ableton Live transport or automation.
              </p>
            </div>

            {scenes.length === 0 ? (
              <div className="p-12 bg-[#11141e] border border-slate-800 rounded-2xl text-center flex flex-col items-center justify-center space-y-3">
                <Disc size={32} className="text-slate-600" />
                <h3 className="text-sm font-bold text-white">No Ableton Scenes Detected</h3>
                <p className="text-xs text-slate-400 max-w-md">
                  Load an .als Live Set containing arrangement or session scenes to monitor scene names and tempo triggers.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scenes.map((scene) => {
                  const isCurrent = currentScene ? scene.id === currentScene.id : false;

                  return (
                    <div
                      key={scene.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-gradient-to-b from-[#182333] to-[#0f1622] border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                          : 'bg-[#11141e] border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">
                          SCENE #{scene.index}
                        </span>
                        {isCurrent ? (
                          <span className="text-[9.5px] px-2 py-0.5 rounded font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            ACTIVE NOW
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-600 font-mono">STANDBY</span>
                        )}
                      </div>

                      <h4 className="text-sm font-extrabold text-white">{scene.name}</h4>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">
                          {scene.tempo || (telemetry.bpm || 120).toFixed(1)} BPM · {scene.timeSignature || `${telemetry.timeSigNum || 4}/${telemetry.timeSigDen || 4}`}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {scene.index * 8} Bars
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
