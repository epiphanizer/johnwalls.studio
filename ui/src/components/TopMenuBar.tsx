import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  Eye,
  RotateCcw,
  Terminal,
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Save,
  Trash2,
  GitBranch,
  Tv,
  Sparkles,
  Command,
  Disc,
  Sliders,
  Play,
  Pause,
  Music,
  Volume2,
  Radio,
  Zap,
  X
} from 'lucide-react';
import { PedalInstance, StateTelemetry, MusicalState, RackPreset } from '../types';
import { FACTORY_PRESETS } from '../utils/rackLibrary';
import { StudioWorkspace } from './StudioWorkspaceModal';

interface TopMenuBarProps {
  onApplyRackPreset: (preset: RackPreset) => void;
  userPresets: RackPreset[];
  currentPresetName?: string;
  onSaveCurrentRack: (name: string, description?: string) => void;
  onDeleteUserPreset: (id: string) => void;
  ampPlacement: 'outbound' | 'inbound';
  onToggleAmpPlacement: () => void;
  inspectedNodeId: string;
  onSelectInspectNode: (nodeId: string) => void;
  pedals: PedalInstance[];
  onToggleBypass: (id: string) => void;
  onResetAll: () => void;
  isTerminalOpen: boolean;
  isTerminalExpanded: boolean;
  onToggleTerminal: () => void;
  isScopeVisible: boolean;
  onToggleScope: () => void;
  telemetry?: StateTelemetry;
  onAddSensor?: (sensor: { id: string; label: string; freq: number; type: 'lowpass' | 'bandpass' | 'highpass'; color: string }) => void;
  activeWorkspace?: StudioWorkspace;
  onSelectWorkspace?: (workspace: StudioWorkspace) => void;
  onOpenWorkspaceModal?: () => void;
  onOpenPedalLibrary?: () => void;
  onOpenSkipBack?: () => void;
  hasSkipBackAudio?: boolean;
  onOpenRoutingModal?: () => void;
  onOpenCaptureDispatch?: () => void;
  onOpenVisualizer?: () => void;
  onOpenPalette?: () => void;
  onToggleCopilot?: () => void;
  isCopilotOpen?: boolean;
}

function formatMidiNote(noteNum?: number): string {
  if (!noteNum || noteNum <= 0 || noteNum > 127) return '—';
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(noteNum / 12) - 1;
  const note = notes[noteNum % 12];
  return `${note}${octave}`;
}

export const TopMenuBar: React.FC<TopMenuBarProps> = React.memo(({
  onApplyRackPreset,
  userPresets,
  currentPresetName,
  onSaveCurrentRack,
  onDeleteUserPreset,
  ampPlacement,
  onToggleAmpPlacement,
  inspectedNodeId,
  onSelectInspectNode,
  pedals,
  onResetAll,
  isTerminalOpen,
  onToggleTerminal,
  isScopeVisible,
  onToggleScope,
  telemetry,
  activeWorkspace = 'pedal_lab',
  onSelectWorkspace,
  onOpenPedalLibrary,
  onOpenSkipBack,
  hasSkipBackAudio = false,
  onOpenRoutingModal,
  onOpenCaptureDispatch,
  onOpenVisualizer,
  onOpenPalette,
  onToggleCopilot,
  isCopilotOpen = false
}) => {
  const [openMenu, setOpenMenu] = useState<'preset_menu' | 'save_popover' | null>(null);
  const [savePatchName, setSavePatchName] = useState('');
  const [presetSearch, setPresetSearch] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const allPresets = useMemo(() => [...FACTORY_PRESETS, ...userPresets], [userPresets]);

  const activePresetIndex = useMemo(() => {
    if (!currentPresetName) return 0;
    const idx = allPresets.findIndex((p) => p.name === currentPresetName);
    return idx >= 0 ? idx : 0;
  }, [allPresets, currentPresetName]);

  const activePreset = allPresets[activePresetIndex] || allPresets[0];

  const handlePrevPreset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allPresets.length === 0) return;
    const nextIdx = (activePresetIndex - 1 + allPresets.length) % allPresets.length;
    onApplyRackPreset(allPresets[nextIdx]);
  };

  const handleNextPreset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allPresets.length === 0) return;
    const nextIdx = (activePresetIndex + 1) % allPresets.length;
    onApplyRackPreset(allPresets[nextIdx]);
  };

  const getStateBadge = (state?: MusicalState) => {
    switch (state) {
      case 'STEADY_GROOVE':
        return {
          bg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.25)]',
          dot: 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]',
          label: 'GROOVE'
        };
      case 'BREAKDOWN':
        return {
          bg: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.25)]',
          dot: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]',
          label: 'BREAKDOWN'
        };
      case 'BUILD_FILL':
        return {
          bg: 'bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.25)]',
          dot: 'bg-purple-400 shadow-[0_0_8px_#c084fc]',
          label: 'BUILD'
        };
      case 'DROP':
        return {
          bg: 'bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.25)]',
          dot: 'bg-rose-400 shadow-[0_0_8px_#f43f5e]',
          label: 'DROP'
        };
      default:
        return {
          bg: 'bg-slate-900/90 text-slate-400 border-slate-800',
          dot: 'bg-slate-600',
          label: 'IDLE'
        };
    }
  };

  const stateBadge = getStateBadge(telemetry?.musicalState);

  // Peak Audio Meter
  const peakDb = telemetry?.peakDb ?? -60;
  const peakPct = Math.max(0, Math.min(100, ((peakDb + 60) / 60) * 100));
  const isClipping = peakDb >= -0.2;

  const filteredPresets = useMemo(() => {
    if (!presetSearch.trim()) return allPresets;
    const q = presetSearch.toLowerCase();
    return allPresets.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    );
  }, [allPresets, presetSearch]);

  return (
    <header
      ref={menuRef}
      className="h-12 bg-[#090b10] border-b border-[#1e2433] px-3.5 flex items-center justify-between z-40 select-none text-xs font-sans text-slate-200"
    >
      {/* 1. Left: Brand Mark & Primary Mode Switcher */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Brand Mark */}
        <div className="flex items-center gap-2 mr-0.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#e6af2e] shadow-[0_0_8px_#e6af2e]" />
          <span className="font-extrabold tracking-wider text-white text-xs uppercase font-mono">
            JOHNWALLS<span className="text-[#e6af2e]">.STUDIO</span>
          </span>
        </div>

        {/* Primary View Modes */}
        <nav aria-label="Studio Workspaces" className="flex items-center bg-[#11141f] p-0.5 rounded-lg border border-[#222838]">
          <button
            type="button"
            onClick={() => onSelectWorkspace?.('pedal_lab')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeWorkspace === 'pedal_lab'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161a29]'
            }`}
            title="Modular Stompbox Effects Rack & Tube Amplifiers"
          >
            <Sliders size={13} className={activeWorkspace === 'pedal_lab' ? 'text-emerald-400' : 'text-slate-400'} />
            <span>PEDAL LAB</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace?.('sp404')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeWorkspace === 'sp404'
                ? 'bg-[#ff5500]/25 text-[#ff8844] border border-[#ff5500]/60 shadow-[0_0_10px_rgba(255,85,0,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161a29]'
            }`}
            title="SP-404 Linear Wave Sampler & Chop Matrix"
          >
            <Disc size={13} className={activeWorkspace === 'sp404' ? 'text-[#ff5500]' : 'text-slate-400'} />
            <span>SP-404</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace?.('rc600')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeWorkspace === 'rc600'
                ? 'bg-red-600/30 text-red-200 border border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.35)]'
                : 'text-slate-400 hover:text-red-300 hover:bg-[#1a0508]'
            }`}
            title="Boss RC-600 6-Track Loop Station & Virtual Floorboard"
          >
            <Radio size={13} className={activeWorkspace === 'rc600' ? 'text-red-400' : 'text-slate-400'} />
            <span>RC-600</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace?.('performance')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeWorkspace === 'performance'
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161a29]'
            }`}
            title="Performance Deck: 4x4 Pads + Macro Knobs & Oscilloscope"
          >
            <Sparkles size={13} className={activeWorkspace === 'performance' ? 'text-amber-400' : 'text-slate-400'} />
            <span>PERFORMANCE</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectWorkspace?.('state')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 ${
              activeWorkspace === 'state'
                ? 'bg-purple-500/25 text-purple-300 border border-purple-500/60 shadow-[0_0_10px_rgba(168,85,247,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161a29]'
            }`}
            title="State Cockpit: DAW Transport, Reactive MIDI & SuperCollider"
          >
            <Activity size={13} className={activeWorkspace === 'state' ? 'text-purple-400' : 'text-slate-400'} />
            <span>STATE</span>
          </button>

          {onOpenRoutingModal && (
            <button
              type="button"
              onClick={onOpenRoutingModal}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/20"
              title="Studio Signal Flow & Routing Matrix (Alt+R)"
            >
              <GitBranch size={13} className="text-cyan-400" />
              <span>ROUTING</span>
            </button>
          )}
        </nav>
      </div>

      {/* 2. Center: Preset Navigation Strip & Quick Audition */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center bg-[#11141f] border border-[#222838] rounded-lg p-0.5 shadow-sm">
          {/* Previous Preset Button */}
          <button
            type="button"
            onClick={handlePrevPreset}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#191e2e] transition"
            title="Previous Preset"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Current Preset Badge / Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'preset_menu' ? null : 'preset_menu')}
              className="px-2.5 py-1 rounded hover:bg-[#191e2e] transition flex items-center gap-2 max-w-[200px]"
            >
              <span className="font-bold text-white text-xs truncate">
                {currentPresetName || activePreset?.name || 'Default Rack'}
              </span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold uppercase ${
                  activePreset?.category === 'user'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {activePreset?.category === 'user' ? 'USER' : 'FACTORY'}
              </span>
              <ChevronDown size={12} className="text-slate-500" />
            </button>

            {/* Presets Library Dropdown Popover */}
            {openMenu === 'preset_menu' && (
              <div className="absolute top-9 left-1/2 -translate-x-1/2 w-80 bg-[#121622] border border-slate-700/80 rounded-xl shadow-2xl py-2 z-50 max-h-[80vh] overflow-y-auto font-sans">
                <div className="px-3 pb-2 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Rack Preset Library
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {userPresets.length} USER / {FACTORY_PRESETS.length} FACTORY
                  </span>
                </div>

                <div className="p-2 border-b border-slate-800">
                  <input
                    type="text"
                    value={presetSearch}
                    onChange={(e) => setPresetSearch(e.target.value)}
                    placeholder="Search presets..."
                    className="w-full bg-[#0a0c12] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="py-1">
                  {filteredPresets.map((preset) => (
                    <div
                      key={preset.id}
                      onClick={() => {
                        onApplyRackPreset(preset);
                        setOpenMenu(null);
                      }}
                      className="px-3 py-2 hover:bg-[#1a2030] cursor-pointer flex items-center justify-between group transition"
                    >
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                            {preset.name}
                          </span>
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                              preset.category === 'user'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {preset.category}
                          </span>
                        </div>
                        {preset.description && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {preset.description}
                          </p>
                        )}
                      </div>

                      {preset.category === 'user' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteUserPreset(preset.id);
                          }}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                          title="Delete User Preset"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Next Preset Button */}
          <button
            type="button"
            onClick={handleNextPreset}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#191e2e] transition"
            title="Next Preset"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Quick Save Popover Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'save_popover' ? null : 'save_popover')}
            className="p-1.5 rounded-lg border border-[#222838] bg-[#11141f] text-slate-300 hover:text-[#e6af2e] hover:border-[#e6af2e]/40 transition shadow-sm"
            title="Save Current Sound Preset"
          >
            <Save size={14} />
          </button>

          {openMenu === 'save_popover' && (
            <div className="absolute top-9 left-1/2 -translate-x-1/2 w-64 bg-[#121622] border border-slate-700 rounded-xl shadow-2xl p-3 z-50">
              <span className="text-xs font-bold text-white block mb-1">Save Current Patch</span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!savePatchName.trim()) return;
                  onSaveCurrentRack(savePatchName.trim());
                  setSavePatchName('');
                  setOpenMenu(null);
                }}
                className="space-y-2"
              >
                <input
                  type="text"
                  autoFocus
                  value={savePatchName}
                  onChange={(e) => setSavePatchName(e.target.value)}
                  placeholder="e.g. Dreamy Tape Lead"
                  className="w-full bg-[#0a0c12] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenMenu(null)}
                    className="flex-1 py-1 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!savePatchName.trim()}
                    className="flex-1 py-1 rounded bg-[#e6af2e] disabled:opacity-40 text-black font-bold text-xs hover:bg-amber-400"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Dedicated Individual Pedals Catalog */}
        {onOpenPedalLibrary && (
          <button
            type="button"
            onClick={onOpenPedalLibrary}
            className="px-2 py-1.5 rounded-lg border border-[#222838] bg-[#11141f] text-slate-300 hover:text-white hover:border-slate-700 transition flex items-center gap-1.5 text-[11px] font-semibold"
            title="Browse & Save Individual Pedals and Amplifiers"
          >
            <Layers size={13} className="text-[#e6af2e]" />
            <span>Pedals</span>
          </button>
        )}

        {/* Oscilloscope Toggle Button */}
        <button
          type="button"
          onClick={onToggleScope}
          className={`px-2 py-1.5 rounded-lg border transition flex items-center gap-1.5 text-[11px] font-semibold ${
            isScopeVisible
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm'
              : 'border-[#222838] bg-[#11141f] text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Solo Live Oscilloscope Strip"
        >
          <Eye size={13} className={isScopeVisible ? 'text-emerald-400' : 'text-slate-400'} />
          <span>Scope</span>
        </button>

        {/* Retrospective 25-Second Skip-Back Capture Pill */}
        {onOpenSkipBack && (
          <button
            type="button"
            onClick={onOpenSkipBack}
            className={`px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 text-[11px] font-bold ${
              hasSkipBackAudio
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.25)] hover:bg-amber-500/30'
                : 'border-[#222838] bg-[#11141f] text-slate-400 hover:text-slate-200'
            }`}
            title="Open Retrospective Skip-Back Capture (Last 25s)"
          >
            <RotateCcw size={13} className={hasSkipBackAudio ? 'text-amber-400 animate-pulse' : 'text-slate-400'} />
            <span>SKIP-BACK</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">25s</span>
          </button>
        )}
      </div>

      {/* 3. Right: Live DAW Telemetry, Metering & Transport */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Ableton Host Transport State */}
        <div className="flex items-center gap-2 bg-[#11141f] px-2.5 py-1 rounded-lg border border-[#222838]">
          <div
            className={`flex items-center gap-1 text-[11px] font-bold ${
              telemetry?.isPlaying ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {telemetry?.isPlaying ? (
              <>
                <Play size={10} className="fill-emerald-400 animate-pulse" />
                <span>PLAY</span>
              </>
            ) : (
              <>
                <Pause size={10} className="fill-amber-400" />
                <span>STOP</span>
              </>
            )}
          </div>

          <div className="h-3 w-px bg-slate-800" />

          {/* Tempo BPM */}
          <div className="flex items-baseline gap-1 font-mono text-xs">
            <span className="text-cyan-300 font-bold">
              {(telemetry?.bpm ?? 120).toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-500 font-sans">BPM</span>
          </div>

          <div className="h-3 w-px bg-slate-800" />

          {/* Bar & PPQ Position */}
          <div className="flex items-baseline gap-1 font-mono text-[11px] text-slate-300">
            <span className="text-amber-300 font-bold">BAR {telemetry?.barNumber ?? 1}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              {telemetry?.ppqPosition ? telemetry.ppqPosition.toFixed(2) : '1.00'}
            </span>
          </div>
        </div>

        {/* Peak dB Meter Bar */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all ${
            isClipping
              ? 'bg-rose-950/60 border-rose-600 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
              : 'bg-[#11141f] border-[#222838]'
          }`}
          title="Master Output Peak Meter"
        >
          <Volume2 size={12} className={isClipping ? 'text-rose-400 animate-pulse' : 'text-slate-400'} />
          <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-75 rounded-full ${
                isClipping
                  ? 'bg-rose-500'
                  : peakDb > -6
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
              style={{ width: `${peakPct}%` }}
            />
          </div>
          <span className="font-mono text-[10.5px] font-bold min-w-[42px] text-right">
            {isClipping ? 'CLIP' : peakDb > -60 ? `${peakDb.toFixed(1)}` : '-∞'}
          </span>
        </div>

        {/* Musical State Classification Badge */}
        <div
          className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold flex items-center gap-1.5 ${stateBadge.bg}`}
          title={`Detected Musical State: ${stateBadge.label}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${stateBadge.dot} animate-pulse`} />
          <span>{stateBadge.label}</span>
        </div>

        {/* Live MIDI Note Badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#11141f] border border-[#222838] font-mono text-[11px]">
          <Music size={12} className={telemetry?.isMidiActive ? 'text-purple-400 animate-pulse' : 'text-slate-500'} />
          <span className="text-purple-300 font-bold min-w-[24px]">
            {formatMidiNote(telemetry?.lastMidiNote)}
          </span>
        </div>

        {/* Global Command Palette Trigger (Cmd+K) */}
        {onOpenPalette && (
          <button
            type="button"
            onClick={onOpenPalette}
            className="p-1.5 rounded-lg border border-[#222838] bg-[#11141f] text-slate-300 hover:text-white hover:border-slate-600 transition flex items-center gap-1 shadow-sm"
            title="Global Command Palette (Cmd+K)"
          >
            <Command size={13} className="text-[#e6af2e]" />
            <span className="text-[10px] font-mono text-slate-400 font-bold">K</span>
          </button>
        )}

        {/* Terminal REPL Dock Toggle */}
        <button
          type="button"
          onClick={onToggleTerminal}
          className={`p-1.5 rounded-lg border transition ${
            isTerminalOpen
              ? 'bg-[#e6af2e]/20 text-[#e6af2e] border-[#e6af2e]/50 shadow-sm'
              : 'border-[#222838] bg-[#11141f] text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Command Line Terminal & Event Stream (~)"
        >
          <Terminal size={13} />
        </button>

        {/* Publish to Web Button */}
        {onOpenCaptureDispatch && (
          <button
            type="button"
            onClick={onOpenCaptureDispatch}
            className="px-2.5 py-1 rounded-lg bg-[#e6af2e]/20 border border-[#e6af2e]/50 hover:bg-[#e6af2e]/30 text-[#e6af2e] hover:text-white flex items-center gap-1.5 transition text-[11px] font-bold shadow-sm"
            title="Record Take & Publish to johnwalls.studio"
          >
            <Radio size={12} className="text-[#e6af2e] animate-pulse" />
            <span className="hidden xl:inline">PUBLISH</span>
          </button>
        )}

        {/* Reset All Rack State */}
        <button
          type="button"
          onClick={onResetAll}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
          title="Reset Rack to Factory Settings"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </header>
  );
});
