import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Terminal,
  Zap,
  Disc,
  Sliders,
  Play,
  Square,
  X,
  ArrowRight,
  CornerDownLeft,
  Sparkles,
  Activity,
  FolderOpen,
  Volume2,
  RotateCcw,
  Scissors,
  Radio
} from 'lucide-react';
import { FACTORY_PRESETS } from '../utils/rackLibrary';

interface CommandItem {
  id: string;
  category: 'workspace' | 'preset' | 'pad' | 'pedal' | 'take' | 'state' | 'looper';
  title: string;
  subtitle: string;
  command: string;
  icon: React.ReactNode;
}

interface GlobalCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteCommand: (cmd: string) => void;
  onSwitchWorkspace?: (ws: string) => void;
  onOpenSkipBack?: () => void;
  onOpenAutoChop?: () => void;
}

const STATIC_COMMANDS: CommandItem[] = [
  // Workspaces
  {
    id: 'ws_perf',
    category: 'workspace',
    title: 'Switch to Performance Deck',
    subtitle: 'Live 4x4 SP-404 pad matrix with pedal macro controls & oscilloscope',
    command: 'workspace performance',
    icon: <Sparkles className="text-amber-400" size={15} />
  },
  {
    id: 'ws_pedals',
    category: 'workspace',
    title: 'Switch to Pedal Lab',
    subtitle: 'Modular stompbox rack & tube amplifiers (Mesa & Vox)',
    command: 'workspace pedal_lab',
    icon: <Sliders className="text-emerald-400" size={15} />
  },
  {
    id: 'ws_sp404',
    category: 'workspace',
    title: 'Switch to SP-404 Sampler',
    subtitle: 'Linear wave sampler, sample chops, bank mapping & OLED effects',
    command: 'workspace sp404',
    icon: <Disc className="text-[#ff5500]" size={15} />
  },
  {
    id: 'ws_rc600',
    category: 'workspace',
    title: 'Switch to Boss RC-600 Looper',
    subtitle: '6-track stereo looper station, 9-footswitch pedalboard & 32-bit float stems',
    command: 'workspace rc600',
    icon: <Radio className="text-rose-400" size={15} />
  },
  {
    id: 'ws_state',
    category: 'workspace',
    title: 'Switch to State Cockpit',
    subtitle: 'Live DAW transport, reactive MIDI matrix & SuperCollider DSP',
    command: 'workspace state',
    icon: <Activity className="text-purple-400" size={15} />
  },

  // Boss RC-600 Quick Actions
  {
    id: 'rc600_start_all',
    category: 'looper',
    title: 'RC-600: All Start (Play All 6 Tracks)',
    subtitle: 'Simultaneously start all recorded loop stems in sync',
    command: 'rc600 start',
    icon: <Play className="text-emerald-400" size={15} />
  },
  {
    id: 'rc600_stop_all',
    category: 'looper',
    title: 'RC-600: All Stop (Halt Playback)',
    subtitle: 'Simultaneously stop all playing loop tracks',
    command: 'rc600 stop',
    icon: <Square className="text-amber-400" size={15} />
  },
  {
    id: 'rc600_sync_hw',
    category: 'looper',
    title: 'Sync Hardware (RC-600 & SP-404)',
    subtitle: 'Export 32-bit float stems to RC-600 USB & RIFF WAVs to SP-404 SD card',
    command: 'sync hardware',
    icon: <Radio className="text-rose-400" size={15} />
  },

  // SP-404 Quick Actions
  {
    id: 'pad_hold_toggle',
    category: 'pad',
    title: 'Toggle SP-404 Pad Hold Mode',
    subtitle: 'SP-404: Toggle latching pad sustain voice mode',
    command: 'hold toggle',
    icon: <Disc className="text-amber-400" size={15} />
  },
  {
    id: 'cmd_skipback',
    category: 'pad',
    title: 'Open Skip-Back Capture (Last 25s)',
    subtitle: 'Audition, trim, and dump unrecorded audio takes onto pads or auto-chop',
    command: 'skipback open',
    icon: <RotateCcw className="text-amber-400" size={15} />
  },
  {
    id: 'cmd_autochop',
    category: 'pad',
    title: 'Open Hybrid Auto-Chop Deck',
    subtitle: 'Slice sample across 16 pads using transient peak detection and BPM grid',
    command: 'chop open',
    icon: <Scissors className="text-amber-400" size={15} />
  },
  {
    id: 'pad_stop_all',
    category: 'pad',
    title: 'Stop All Playing Voices (Panic Mute)',
    subtitle: 'SP-404: Immediately silence all active voices',
    command: 'stop',
    icon: <Square className="text-rose-400" size={15} />
  },
  {
    id: 'trigger_a1',
    category: 'pad',
    title: 'Trigger Pad A01',
    subtitle: 'Bank A: Pad 1',
    command: 'trigger A 1',
    icon: <Play className="text-emerald-400" size={15} />
  },

  // Pedalboard Controls
  {
    id: 'add_dub_echo',
    category: 'pedal',
    title: 'Add Tape Delay Pedal',
    subtitle: 'Instantiate analog tape echo with flutter',
    command: 'add pedal delay --name dub_echo --time 360ms --fb 45%',
    icon: <Sliders className="text-cyan-400" size={15} />
  },
  {
    id: 'add_ladder_filter',
    category: 'pedal',
    title: 'Add Resonant Moog Ladder Filter',
    subtitle: 'Instantiate 24dB 4-pole resonant filter',
    command: 'add pedal filter --name sweep --cutoff 1400Hz --res 0.70',
    icon: <Sliders className="text-rose-400" size={15} />
  },
  {
    id: 'add_ducker',
    category: 'pedal',
    title: 'Add Reactive Sidechain Ducker',
    subtitle: 'Instantiate dynamic attenuator triggered by kick hits',
    command: 'add pedal ducker --name sidechain_pumper --depth 14dB',
    icon: <Zap className="text-purple-400" size={15} />
  },

  // Takes & Recording
  {
    id: 'take_start',
    category: 'take',
    title: 'Start Live Audio Take Recording',
    subtitle: 'Capture multitrack audio & visual HTML5 bundle',
    command: 'take start',
    icon: <Play className="text-orange-400" size={15} />
  },
  {
    id: 'take_stop',
    category: 'take',
    title: 'Stop Take Recording',
    subtitle: 'Finalize and package current audio take',
    command: 'take stop',
    icon: <Square className="text-amber-400" size={15} />
  },

  // State Manifest
  {
    id: 'manifest_export',
    category: 'state',
    title: 'Export Session Manifest',
    subtitle: 'Save declarative JSON session manifest to disk',
    command: 'manifest export',
    icon: <Terminal className="text-blue-400" size={15} />
  }
];

export const GlobalCommandPalette: React.FC<GlobalCommandPaletteProps> = ({
  isOpen,
  onClose,
  onExecuteCommand,
  onSwitchWorkspace,
  onOpenSkipBack,
  onOpenAutoChop
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Combine static commands with dynamic factory preset loader commands
  const allCommands = useMemo<CommandItem[]>(() => {
    const presetCommands: CommandItem[] = FACTORY_PRESETS.map((preset) => ({
      id: `preset_${preset.id}`,
      category: 'preset',
      title: `Load Preset: ${preset.name}`,
      subtitle: preset.description || `Factory preset with ${preset.pedals.length} units`,
      command: `library ${preset.id}`,
      icon: <FolderOpen className="text-amber-400" size={15} />
    }));
    return [...STATIC_COMMANDS, ...presetCommands];
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredCommands = useMemo(() => {
    let list = allCommands;
    if (selectedCategory !== 'all') {
      list = list.filter((c) => c.category === selectedCategory);
    }
    if (!query.trim()) return list;

    const q = query.toLowerCase();
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.command.toLowerCase().includes(q)
    );
  }, [allCommands, selectedCategory, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, selectedCategory]);

  const handleSelect = (cmd: CommandItem) => {
    if (cmd.id === 'cmd_skipback') {
      onOpenSkipBack?.();
      onClose();
      return;
    }
    if (cmd.id === 'cmd_autochop') {
      onOpenAutoChop?.();
      onClose();
      return;
    }
    if (cmd.category === 'workspace' && onSwitchWorkspace) {
      const ws = cmd.command.replace('workspace ', '');
      onSwitchWorkspace(ws);
      onClose();
      return;
    }
    onExecuteCommand(cmd.command);
    onClose();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredCommands.length > 0 && selectedIndex < filteredCommands.length) {
      handleSelect(filteredCommands[selectedIndex]);
    } else if (query.trim()) {
      onExecuteCommand(query.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-start justify-center pt-20 px-4 font-sans select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#10131d] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar Input */}
        <form onSubmit={handleCustomSubmit} className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-[#0c0e16]">
          <Search size={18} className="text-amber-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, search presets, or navigate workspaces (e.g. 'performance', 'dub', 'stop')..."
            className="flex-1 bg-transparent text-sm font-medium text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={16} />
          </button>
        </form>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-800/80 bg-[#0a0c12] text-[11px] font-semibold text-slate-400 overflow-x-auto">
          {[
            { id: 'all', label: 'All' },
            { id: 'workspace', label: 'Workspaces' },
            { id: 'looper', label: 'RC-600' },
            { id: 'pad', label: 'SP-404' },
            { id: 'preset', label: 'Presets' },
            { id: 'pedal', label: 'Pedals' },
            { id: 'take', label: 'Takes' }
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-0.5 rounded-full transition ${
                selectedCategory === cat.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Command Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No matching commands found. Press Enter to execute raw instruction.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => handleSelect(cmd)}
                  className={`px-3.5 py-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-[#182032] border border-amber-500/50 shadow-md'
                      : 'hover:bg-[#131724] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 mr-3">
                    <div className="p-2 rounded-lg bg-black/40 border border-slate-800 shrink-0">
                      {cmd.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white truncate">
                          {cmd.title}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/50 text-slate-400 uppercase">
                          {cmd.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {cmd.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                    <span className="text-[10px] font-mono bg-black/40 px-1.5 py-0.5 rounded text-slate-400 hidden sm:inline">
                      {cmd.command}
                    </span>
                    <CornerDownLeft size={13} className={isSelected ? 'text-amber-400' : 'text-slate-600'} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Helper */}
        <div className="px-4 py-2 border-t border-slate-800 bg-[#0c0e16] flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>johnwalls.studio Command Palette</span>
        </div>
      </div>
    </div>
  );
};
