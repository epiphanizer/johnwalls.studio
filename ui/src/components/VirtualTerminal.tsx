import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, X, ChevronUp, ChevronDown } from 'lucide-react';
import { TerminalEntry } from '../types';
import { TerminalLogLine } from './TerminalLogLine';

interface VirtualTerminalProps {
  logs: TerminalEntry[];
  onExecuteCommand: (command: string) => void;
  isOpen: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
}

const QUICK_COMMANDS = [
  'help',
  'status',
  'list pedals',
  'list sensors',
  'preset v-curve',
  'placement inbound',
  'placement outbound',
  'add pedal delay',
  'add pedal filter',
  'add pedal drive'
];

export const VirtualTerminal: React.FC<VirtualTerminalProps> = ({
  logs,
  onExecuteCommand,
  isOpen,
  isExpanded,
  onToggleExpand,
  onClose
}) => {
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [history, setHistory] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    onExecuteCommand(trimmed);
    setInput('');

    // If collapsed, expand to reveal results
    if (!isExpanded) {
      onToggleExpand();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const match = QUICK_COMMANDS.find((cmd) => cmd.startsWith(input));
      if (match) {
        setInput(match);
      }
    }
  };

  if (!isOpen) return null;

  // 1. Collapsed Mode: Only the clean single-line input bar is visible at the bottom
  if (!isExpanded) {
    return (
      <div className="h-10 border-t border-slate-800 bg-[#090b10] px-4 flex items-center justify-between gap-3 text-xs font-mono select-none z-30">
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <Terminal size={13} className="text-[#e6af2e] shrink-0" />
          <span className="text-[#e6af2e] font-bold shrink-0">johnwalls $</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command (e.g. 'help', 'status', 'list', 'preset v-curve')... [Enter]"
            className="bg-transparent text-white placeholder-slate-600 focus:outline-none flex-1 font-mono text-xs"
          />
        </form>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleExpand}
            className="px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 transition flex items-center gap-1"
            title="Expand Terminal Logs Output"
          >
            <ChevronUp size={11} />
            <span>LOGS ({logs.length})</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800/80 transition"
            title="Close Terminal"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  // 2. Expanded Mode: Full terminal log drawer
  return (
    <div className="h-72 border-t border-slate-800 bg-[#0a0c12]/95 backdrop-blur-md transition-all duration-200 flex flex-col z-30 select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-[#0d0f17] text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#e6af2e]" />
          <span className="font-mono font-semibold text-slate-200">VIRTUAL REPL</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 font-mono text-[11px]">johnwalls-cli v1.0.0</span>
        </div>

        {/* Quick action buttons & window controls */}
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-1.5 overflow-x-auto max-w-md">
            {QUICK_COMMANDS.slice(0, 4).map((cmd, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInput(cmd)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-800 truncate transition"
              >
                {cmd}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleExpand}
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-mono text-xs transition flex items-center gap-1 border border-slate-800"
            title="Collapse to single-line input bar"
          >
            <ChevronDown size={12} />
            <span>MINIMIZE</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
            title="Fully Close Terminal"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-1 select-text bg-[#07080c]"
      >
        {logs.map((log) => (
          <TerminalLogLine key={log.id} log={log} />
        ))}
      </div>

      {/* Command input prompt */}
      <form onSubmit={handleSubmit} className="flex items-center px-4 py-2 border-t border-slate-800 bg-[#090b10]">
        <div className="flex items-center gap-2 w-full">
          <span className="text-[#e6af2e] font-mono text-xs font-bold">johnwalls $</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command and press Enter..."
            className="flex-1 bg-transparent text-slate-100 font-mono text-xs focus:outline-none"
          />
          <button
            type="submit"
            className="px-2.5 py-1 rounded bg-[#e6af2e] hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold flex items-center gap-1 transition"
          >
            <Send size={11} />
            <span>RUN</span>
          </button>
        </div>
      </form>
    </div>
  );
};
