import React, { useState, useEffect, useRef } from 'react';
import { Search, Terminal, Zap, Disc, Sliders, Play, Square, X, ArrowRight, CornerDownLeft } from 'lucide-react';

interface CommandItem {
  id: string;
  category: 'pad' | 'pedal' | 'workspace' | 'take' | 'state';
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
}

const DEFAULT_COMMANDS: CommandItem[] = [
  {
    id: 'pad_hold_toggle',
    category: 'pad',
    title: 'Toggle Pad Hold Mode',
    subtitle: 'SP-404: Toggle latching pad sustain',
    command: 'hold toggle',
    icon: <Disc className="text-amber-400" size={15} />
  },
  {
    id: 'pad_stop_all',
    category: 'pad',
    title: 'Stop All Pads',
    subtitle: 'SP-404: Immediately silence all playing voices',
    command: 'stop',
    icon: <Square className="text-red-400" size={15} />
  },
  {
    id: 'trigger_a1',
    category: 'pad',
    title: 'Trigger Pad A01 (Intro Hook)',
    subtitle: 'Bank A: Decay · Pad 1',
    command: 'trigger A 1',
    icon: <Play className="text-emerald-400" size={15} />
  },
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
  {
    id: 'manifest_export',
    category: 'state',
    title: 'Export Session Manifest',
    subtitle: 'Save declarative JSON session manifest to ~/.config/johnwalls/',
    command: 'manifest export',
    icon: <Terminal className="text-blue-400" size={15} />
  },
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
  }
];

export const GlobalCommandPalette: React.FC<GlobalCommandPaletteProps> = ({
  isOpen,
  onClose,
  onExecuteCommand,
  onSwitchWorkspace
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredCommands = query.trim() === ''
    ? DEFAULT_COMMANDS
    : DEFAULT_COMMANDS.filter(c =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.subtitle.toLowerCase().includes(query.toLowerCase()) ||
        c.command.toLowerCase().includes(query.toLowerCase())
      );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (cmd: CommandItem) => {
    onExecuteCommand(cmd.command);
    onClose();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredCommands.length > 0 && selectedIndex < filteredCommands.length && !query.startsWith(':') && !query.startsWith('/')) {
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
      className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-start justify-center pt-24 px-4 font-mono select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0c0e14] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <form onSubmit={handleCustomSubmit} className="relative flex items-center px-4 py-3.5 border-b border-slate-800 bg-[#090b10]">
          <Search className="text-slate-500 mr-3 flex-shrink-0" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a Unix command or search actions (e.g. 'hold', 'add delay', 'trigger A 1')..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none tracking-wide"
          />
          <div className="flex items-center gap-1.5 ml-2 text-[10px] text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
            <span>ESC</span>
          </div>
        </form>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => handleSelect(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-500/20 to-slate-800/60 border border-amber-500/40 text-white'
                      : 'hover:bg-slate-800/40 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex-shrink-0">
                      {cmd.icon}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold truncate flex items-center gap-2">
                        <span>{cmd.title}</span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-normal">
                          [{cmd.category}]
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{cmd.subtitle}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-[11px] text-amber-400/80 font-mono bg-black/40 px-2 py-0.5 rounded border border-slate-800">
                      {cmd.command}
                    </span>
                    {isSelected && (
                      <CornerDownLeft size={13} className="text-amber-400" />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-slate-500 text-xs">
              Press <span className="text-amber-400 font-bold">Enter</span> to execute custom command:
              <div className="mt-2 text-white font-mono bg-black/50 p-2 rounded border border-slate-800">
                {query}
              </div>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[#090b10] border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span><strong className="text-slate-400">↑↓</strong> Navigate</span>
            <span><strong className="text-slate-400">↵</strong> Execute</span>
            <span><strong className="text-slate-400">ESC</strong> Close</span>
          </div>
          <div className="text-slate-400 text-[10px]">
            johnwalls.studio · Raycast Palette
          </div>
        </div>
      </div>
    </div>
  );
};
