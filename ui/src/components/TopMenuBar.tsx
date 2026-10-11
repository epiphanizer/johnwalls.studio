import React, { useState, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Eye,
  RotateCcw,
  Terminal,
  Activity,
  ChevronDown,
  Layers,
  Plus,
  X,
  Radio,
  Save,
  Trash2,
  Bookmark,
  GitBranch
} from 'lucide-react';
import { PedalInstance, StateTelemetry, MusicalState, RackPreset } from '../types';
import { FACTORY_PRESETS } from '../utils/rackLibrary';
import { StudioWorkspace } from './StudioWorkspaceModal';

interface TopMenuBarProps {
  onApplyRackPreset: (preset: RackPreset) => void;
  userPresets: RackPreset[];
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
  onOpenRoutingModal?: () => void;
  onOpenCaptureDispatch?: () => void;
}

export const TopMenuBar: React.FC<TopMenuBarProps> = React.memo(({
  onApplyRackPreset,
  userPresets,
  onSaveCurrentRack,
  onDeleteUserPreset,
  ampPlacement,
  onToggleAmpPlacement,
  inspectedNodeId,
  onSelectInspectNode,
  pedals,
  onResetAll,
  isTerminalOpen,
  isTerminalExpanded,
  onToggleTerminal,
  isScopeVisible,
  onToggleScope,
  telemetry,
  onAddSensor,
  activeWorkspace = 'pedal_lab',
  onSelectWorkspace,
  onOpenWorkspaceModal,
  onOpenPedalLibrary,
  onOpenRoutingModal,
  onOpenCaptureDispatch
}) => {
  const [openMenu, setOpenMenu] = useState<'library' | 'routing' | 'inspect' | 'sensors' | null>(null);
  const [savePatchName, setSavePatchName] = useState('');
  const [showAddSensorModal, setShowAddSensorModal] = useState(false);
  const [newId, setNewId] = useState('');
  const [newFreq, setNewFreq] = useState('3200');
  const [newType, setNewType] = useState<'lowpass' | 'bandpass' | 'highpass'>('bandpass');
  const [newColor, setNewColor] = useState('gold');

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

  const getStateBadge = (state?: MusicalState) => {
    switch (state) {
      case 'STEADY_GROOVE':
        return {
          bg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40',
          dot: 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]',
          label: 'GROOVE'
        };
      case 'BREAKDOWN':
        return {
          bg: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]',
          label: 'BREAKDOWN'
        };
      case 'BUILD_FILL':
        return {
          bg: 'bg-purple-500/10 text-purple-300 border-purple-500/40',
          dot: 'bg-purple-400 shadow-[0_0_8px_#c084fc]',
          label: 'BUILD'
        };
      case 'DROP':
        return {
          bg: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
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

  const getSensorColor = (color: string) => {
    switch (color) {
      case 'rose':
        return { activeLed: 'bg-rose-500 shadow-[0_0_8px_#f43f5e]', text: 'text-rose-400' };
      case 'amber':
        return { activeLed: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]', text: 'text-amber-400' };
      case 'cyan':
        return { activeLed: 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]', text: 'text-cyan-400' };
      case 'purple':
        return { activeLed: 'bg-purple-400 shadow-[0_0_8px_#c084fc]', text: 'text-purple-400' };
      case 'emerald':
        return { activeLed: 'bg-emerald-400 shadow-[0_0_8px_#34d399]', text: 'text-emerald-400' };
      default:
        return { activeLed: 'bg-[#e6af2e] shadow-[0_0_8px_#e6af2e]', text: 'text-[#e6af2e]' };
    }
  };

  const stateBadge = getStateBadge(telemetry?.musicalState);

  const handleCreateSensor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim()) return;
    onAddSensor?.({
      id: newId.trim().toLowerCase(),
      label: newId.trim().toUpperCase(),
      freq: parseFloat(newFreq) || 1200,
      type: newType,
      color: newColor
    });
    setNewId('');
    setShowAddSensorModal(false);
  };

  return (
    <div
      ref={menuRef}
      className="h-11 bg-[#090b10] border-b border-slate-800/80 px-3 flex items-center justify-between z-40 select-none text-xs font-mono"
    >
      {/* 1. Left: Studio Branding & Workspace Quick Switcher */}
      <div className="flex items-center gap-2.5">
        {/* Brand Mark */}
        <div className="flex items-center gap-2 mr-1">
          <div className="w-2.5 h-2.5 rounded-full bg-[#e6af2e] shadow-[0_0_8px_#e6af2e]" />
          <span className="font-extrabold tracking-wider text-white text-[11.5px] uppercase">
            JOHNWALLS<span className="text-[#e6af2e]">.STUDIO</span>
          </span>
        </div>

        {/* Workspace Quick Switcher */}
        <div className="flex items-center bg-[#11141e] p-0.5 rounded border border-slate-800">
          <button
            type="button"
            onClick={() => onSelectWorkspace?.('pedal_lab')}
            className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition flex items-center gap-1 ${
              activeWorkspace === 'pedal_lab'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Modular Pedal Lab & Tube Amps"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeWorkspace === 'pedal_lab' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <span>PEDAL LAB</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectWorkspace?.('sp404')}
            className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition flex items-center gap-1 ${
              activeWorkspace === 'sp404'
                ? 'bg-[#ff5500]/25 text-[#ff8844] border border-[#ff5500]/60 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Inspect SP-404 Original / A Sampler"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeWorkspace === 'sp404' ? 'bg-[#ff5500]' : 'bg-slate-600'}`} />
            <span>SP-404</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectWorkspace?.('state')}
            className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition flex items-center gap-1 ${
              activeWorkspace === 'state'
                ? 'bg-purple-500/25 text-purple-300 border border-purple-500/60 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="State Cockpit: MIDI Matrix & SuperCollider Server"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeWorkspace === 'state' ? 'bg-purple-400' : 'bg-slate-600'}`} />
            <span>STATE</span>
          </button>
          {onOpenRoutingModal && (
            <button
              type="button"
              onClick={onOpenRoutingModal}
              className="px-2 py-0.5 rounded text-[9.5px] font-bold transition flex items-center gap-1 bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/25 shadow-sm"
              title="Studio Signal Flow & Routing Matrix (Alt+R)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#06b6d4]" />
              <span>ROUTING</span>
            </button>
          )}
        </div>

        {onOpenWorkspaceModal && (
          <button
            type="button"
            onClick={onOpenWorkspaceModal}
            className="px-1.5 py-0.5 rounded text-[9.5px] text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 transition"
            title="Open Studio Module Chooser"
          >
            MODULES
          </button>
        )}

        <div className="h-4 w-px bg-slate-800/80" />

        {/* Dedicated Pedal Catalog Button */}
        {onOpenPedalLibrary && (
          <button
            type="button"
            onClick={onOpenPedalLibrary}
            className="px-2 py-1 rounded flex items-center gap-1.5 transition text-[11px] text-slate-300 hover:text-white hover:bg-slate-800/60"
            title="Browse & Save Individual Pedals and Amplifiers"
          >
            <Layers size={12} className="text-[#e6af2e]" />
            <span className="font-semibold">Pedals</span>
          </button>
        )}

        {/* Rack Presets Library Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'library' ? null : 'library')}
            className={`px-2 py-1 rounded flex items-center gap-1.5 transition text-[11px] ${
              openMenu === 'library'
                ? 'bg-slate-800 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FolderOpen size={12} className="text-[#e6af2e]" />
            <span className="font-semibold">Racks</span>
            {userPresets.length > 0 && (
              <span className="text-[9px] bg-[#e6af2e]/20 text-[#e6af2e] px-1 rounded font-bold">
                {userPresets.length}
              </span>
            )}
            <ChevronDown size={11} className="text-slate-500" />
          </button>

          {openMenu === 'library' && (
            <div className="absolute top-8 left-0 w-80 bg-[#12151f] border border-slate-700/80 rounded-lg shadow-2xl py-2 z-50 max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="px-3 pb-2 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-white font-bold text-[11px] tracking-wide uppercase">
                  <FolderOpen size={13} className="text-[#e6af2e]" />
                  <span>STUDIO RACK LIBRARY</span>
                </div>
                <span className="text-[9.5px] text-slate-500 font-mono">
                  {userPresets.length} USER / {FACTORY_PRESETS.length} FACTORY
                </span>
              </div>

              {/* Quick Save Current Rack Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!savePatchName.trim()) return;
                  onSaveCurrentRack(savePatchName.trim());
                  setSavePatchName('');
                }}
                className="p-2.5 bg-[#0e111a] border-b border-slate-800 flex flex-col gap-1.5"
              >
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                  Save Current Sound
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={savePatchName}
                    onChange={(e) => setSavePatchName(e.target.value)}
                    placeholder="Patch name (e.g. Dreamy Tape Lead)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-slate-200 placeholder-slate-500 text-[10.5px] focus:outline-none focus:border-[#e6af2e]"
                  />
                  <button
                    type="submit"
                    disabled={!savePatchName.trim()}
                    className="px-2.5 py-1 rounded bg-[#e6af2e] hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-[10px] flex items-center gap-1 transition shrink-0"
                  >
                    <Save size={11} />
                    <span>SAVE</span>
                  </button>
                </div>
              </form>

              {/* User Patches Section */}
              <div className="px-3 pt-2 pb-1 text-[9.5px] font-bold text-amber-400/90 uppercase tracking-widest flex items-center justify-between">
                <span>USER SAVED PATCHES</span>
                <span className="text-slate-500 text-[9px]">{userPresets.length}</span>
              </div>

              {userPresets.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-slate-500 italic">
                  No custom patches saved yet. Type a name above & click Save.
                </div>
              ) : (
                <div className="space-y-0.5 px-1">
                  {userPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="group px-2 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-slate-200 hover:text-white transition cursor-pointer"
                      onClick={() => {
                        onApplyRackPreset(preset);
                        setOpenMenu(null);
                      }}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="text-[11px] font-semibold truncate group-hover:text-[#e6af2e]">
                          {preset.name}
                        </div>
                        <div className="text-[9px] text-slate-500 truncate">
                          {preset.pedals.length} units • {preset.ampPlacement.toUpperCase()} • {preset.createdAt || 'Saved'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteUserPreset(preset.id);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/20 opacity-0 group-hover:opacity-100 transition shrink-0"
                        title="Delete Patch"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Factory Profiles Section */}
              <div className="px-3 pt-2.5 pb-1 text-[9.5px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-800/80 mt-1.5">
                FACTORY PROFILES
              </div>
              <div className="space-y-0.5 px-1">
                {FACTORY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onApplyRackPreset(preset);
                      setOpenMenu(null);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800/80 text-slate-200 hover:text-white flex items-center justify-between transition group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-[11px] font-medium group-hover:text-amber-300 truncate">
                        {preset.name}
                      </div>
                      {preset.description && (
                        <div className="text-[8.5px] text-slate-500 truncate">
                          {preset.description}
                        </div>
                      )}
                    </div>
                    <span className="text-[8.5px] px-1 py-0.5 rounded font-mono font-bold bg-slate-900 border border-slate-700 text-slate-400 shrink-0">
                      {preset.id.startsWith('mesa') ? 'MESA' : preset.id.startsWith('vox') ? 'VOX' : 'FX'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Reset Defaults */}
              <div className="border-t border-slate-800/80 mt-1 pt-1 px-1">
                <button
                  type="button"
                  onClick={() => {
                    onResetAll();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800/80 text-slate-400 hover:text-white text-[10.5px] flex items-center justify-between"
                >
                  <span>Reset Factory Default Chain</span>
                  <RotateCcw size={11} className="text-slate-500" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Direct Routing Screen Universal Button */}
        <div>
          <button
            type="button"
            onClick={onOpenRoutingModal}
            className="px-2.5 py-1 rounded bg-[#131622] hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/40 hover:border-cyan-400 flex items-center gap-1.5 transition text-[11px] font-bold shadow-sm"
            title="Open Universal Studio Signal Flow & Routing Screen"
          >
            <GitBranch size={12} className="text-cyan-400" />
            <span className="font-semibold">ROUTING</span>
            <span className="text-[9px] text-cyan-300 bg-cyan-950/80 px-1.5 py-0.2 rounded border border-cyan-800">
              {ampPlacement.toUpperCase()}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Center: Consolidated Real-Time Studio Telemetry Ribbon */}
      <div className="hidden lg:flex items-center gap-2.5 px-3 py-1 bg-[#10131d] border border-slate-700/60 rounded-md">
        {/* Ableton Status */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full transition-all ${
              telemetry?.isPlaying
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                : 'bg-emerald-600'
            }`}
          />
          <span className="text-[9.5px] font-bold text-emerald-300 tracking-wider">
            ABLETON LIVE
          </span>
        </div>

        <div className="h-3 w-px bg-slate-800" />

        {/* BPM & Bar */}
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-slate-500 font-medium">BPM</span>
          <span className="text-[#e6af2e] font-bold">
            {telemetry?.bpm ? telemetry.bpm.toFixed(1) : '124.0'}
          </span>
        </div>

        <div className="h-3 w-px bg-slate-800" />

        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <span className="text-slate-500">BAR</span>
          <span className="text-slate-200 font-bold">{telemetry?.barNumber ?? 1}</span>
        </div>

        <div className="h-3 w-px bg-slate-800" />

        {/* Real-time Musical State Badge */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${stateBadge.bg} text-[10px] font-bold`}>
          <span className={`w-1.5 h-1.5 rounded-full ${stateBadge.dot}`} />
          <span>{stateBadge.label}</span>
        </div>

        <div className="h-3 w-px bg-slate-800" />

        {/* RMS Energy */}
        <div className="flex items-center gap-1 text-[10px]">
          <span className="text-slate-500">RMS</span>
          <span className="text-slate-200 font-bold font-mono">
            {((telemetry?.sidechainRMS ?? 0) * 100).toFixed(0)}%
          </span>
        </div>

        {/* Sensors Quick Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'sensors' ? null : 'sensors')}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition"
            title="Inspect Reactive Sensory Detectors"
          >
            <span className="text-[9px] text-slate-500 uppercase font-semibold">Sensors</span>
            <div className="flex items-center gap-1">
              {(telemetry?.sensors ?? []).slice(0, 5).map((s) => {
                const sc = getSensorColor(s.color);
                const isLit = s.triggered || s.energy > 0.05;
                return (
                  <span
                    key={s.id}
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-150 ${
                      isLit ? sc.activeLed : 'bg-slate-700'
                    }`}
                    title={`${s.label}: ${s.totalHits} hits`}
                  />
                );
              })}
            </div>
            <ChevronDown size={10} className="text-slate-500" />
          </button>

          {openMenu === 'sensors' && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-64 bg-[#12151f] border border-slate-700/80 rounded-xl shadow-2xl p-2.5 z-50">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-2">
                <span className="text-[9.5px] uppercase font-bold text-slate-400">Sensory Detectors</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSensorModal(true);
                    setOpenMenu(null);
                  }}
                  className="text-[9px] text-[#e6af2e] hover:underline flex items-center gap-0.5"
                >
                  <Plus size={10} /> Add Sensor
                </button>
              </div>
              <div className="space-y-1">
                {(telemetry?.sensors ?? []).map((s) => {
                  const sc = getSensorColor(s.color);
                  const isLit = s.triggered || s.energy > 0.05;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-2 py-1 rounded bg-slate-900/60 border border-slate-800/80 text-[10px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isLit ? sc.activeLed : 'bg-slate-700'}`} />
                        <span className={`font-bold ${sc.text}`}>{s.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-[9px]">
                        <span>{s.frequencyHz}Hz</span>
                        <span className="text-slate-400 font-mono font-semibold">{s.totalHits} hits</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Right: Studio Action Controls (Solo Scope, Terminal, Reset) */}
      <div className="flex items-center gap-2">
        {/* Solo / Inspect Waveform Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'inspect' ? null : 'inspect')}
            className={`px-2 py-1 rounded flex items-center gap-1.5 transition text-[11px] ${
              openMenu === 'inspect'
                ? 'bg-slate-800 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Eye size={12} className="text-emerald-400" />
            <span className="font-semibold">Solo:</span>
            <span className="text-[10px] text-emerald-300 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/80 uppercase">
              {inspectedNodeId === 'master' ? 'Master' : inspectedNodeId.split('_')[0]}
            </span>
            <ChevronDown size={11} className="text-slate-500" />
          </button>

          {openMenu === 'inspect' && (
            <div className="absolute top-8 right-0 w-56 bg-[#12151f] border border-slate-700/80 rounded-lg shadow-2xl py-1 z-50">
              <div className="px-3 py-1 text-[9.5px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">
                Oscilloscope Solo Target
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectInspectNode('master');
                  setOpenMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between ${
                  inspectedNodeId === 'master'
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span>● Master Bus Out</span>
                {inspectedNodeId === 'master' && <span className="text-emerald-400">✓</span>}
              </button>

              {pedals.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectInspectNode(p.id);
                    setOpenMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between ${
                    inspectedNodeId === p.id
                      ? 'bg-slate-800 text-white font-bold'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <span>{p.title}</span>
                  {inspectedNodeId === p.id && <span className="text-emerald-400">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-slate-800/80" />

        {/* Toggle Scope Visibility */}
        <button
          type="button"
          onClick={onToggleScope}
          className={`px-2 py-1 rounded flex items-center gap-1 transition text-[11px] ${
            isScopeVisible
              ? 'bg-slate-800 text-emerald-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Real-Time Waveform Oscilloscope"
        >
          <Activity size={12} />
          <span>Scope</span>
        </button>

        {/* Toggle Virtual Terminal */}
        <button
          type="button"
          onClick={onToggleTerminal}
          className={`px-2 py-1 rounded flex items-center gap-1 transition text-[11px] ${
            isTerminalOpen
              ? 'bg-[#e6af2e]/20 text-[#e6af2e] border border-[#e6af2e]/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title={isTerminalOpen ? 'Close Virtual Terminal CLI' : 'Open Virtual Terminal CLI (Single-Line REPL)'}
        >
          <Terminal size={12} />
          <span>CLI</span>
        </button>

        {/* Capture Audio & Studio Dispatch to johnwalls.studio */}
        <button
          type="button"
          onClick={onOpenCaptureDispatch}
          className="px-3 py-1 rounded bg-[#e6af2e]/20 border border-[#e6af2e]/60 hover:bg-[#e6af2e]/35 text-[#e6af2e] flex items-center gap-1.5 transition text-[11px] font-extrabold shadow-[0_0_12px_rgba(230,175,46,0.25)] hover:shadow-[0_0_16px_rgba(230,175,46,0.45)] group"
          title="Capture Live Audio & Publish to johnwalls.studio with SuperCollider Visuals"
        >
          <Radio size={12} className="text-[#e6af2e] animate-pulse group-hover:scale-110 transition-transform" />
          <span>PUBLISH TO WEB</span>
        </button>

        {/* Reset All */}
        <button
          type="button"
          onClick={onResetAll}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition"
          title="Reset Rack to Factory Settings"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* Modal for Registering Custom Sensor */}
      {showAddSensorModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#141824] border border-slate-700 rounded-xl w-full max-w-sm p-5 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="font-bold text-white text-sm">Register Sensory Detector</span>
              <button
                type="button"
                onClick={() => setShowAddSensorModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateSensor} className="space-y-3 mt-3">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Sensor ID (e.g. cymbals, bass, perc)</label>
                <input
                  type="text"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="e.g. cymbals"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#e6af2e]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">Center Freq (Hz)</label>
                  <input
                    type="number"
                    value={newFreq}
                    onChange={(e) => setNewFreq(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">Filter Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  >
                    <option value="bandpass">BandPass</option>
                    <option value="lowpass">LowPass</option>
                    <option value="highpass">HighPass</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Color Badge</label>
                <select
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                >
                  <option value="gold">Gold</option>
                  <option value="cyan">Cyan</option>
                  <option value="purple">Purple</option>
                  <option value="emerald">Emerald</option>
                  <option value="rose">Rose</option>
                  <option value="amber">Amber</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddSensorModal(false)}
                  className="flex-1 px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 rounded bg-[#e6af2e] hover:bg-amber-400 text-slate-950 font-bold"
                >
                  Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
