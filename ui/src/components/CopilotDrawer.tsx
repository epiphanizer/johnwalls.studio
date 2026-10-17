import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, Terminal, Activity, X, ChevronRight, Zap, RefreshCw, CheckCircle2 } from 'lucide-react';
import { StateTelemetry } from '../types';

interface CopilotMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  command?: string;
  timestamp: string;
}

interface CopilotDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  telemetry: StateTelemetry;
  onExecuteCommand: (cmd: string) => void;
  commandHistory: string[];
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onToggle,
  telemetry,
  onExecuteCommand,
  commandHistory
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'init-1',
      sender: 'agent',
      text: 'johnwalls.studio AI Copilot ready. Connected to local IPC socket (/tmp/johnwalls.sock).',
      timestamp: '00:00'
    }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = input.trim();
    if (!prompt) return;

    const userMsg: CopilotMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    // Intent classifier & auto-action responder
    setTimeout(() => {
      const lower = prompt.toLowerCase();
      let reply = '';
      let generatedCmd = '';

      if (lower.includes('delay') || lower.includes('echo')) {
        reply = 'Instantiating Tape Echo with 360ms sync and analog flutter.';
        generatedCmd = 'add pedal delay --name dub_echo --time 360ms --fb 45%';
      } else if (lower.includes('filter') || lower.includes('moog')) {
        reply = 'Adding Moog 24dB resonant ladder filter.';
        generatedCmd = 'add pedal filter --name sweep --cutoff 1400Hz --res 0.70';
      } else if (lower.includes('duck') || lower.includes('sidechain')) {
        reply = 'Configuring reactive sidechain ducker triggered by kick hits.';
        generatedCmd = 'add pedal ducker --name sidechain_pumper --depth 14dB';
      } else if (lower.includes('manifest') || lower.includes('save') || lower.includes('export')) {
        reply = 'Exporting declarative session manifest to ~/.config/johnwalls/sessions/';
        generatedCmd = 'manifest export';
      } else if (lower.includes('hold')) {
        reply = 'Toggling SP-404 pad hold sustain mode.';
        generatedCmd = 'hold toggle';
      } else if (lower.includes('stop') || lower.includes('silence')) {
        reply = 'Stopping all active SP-404 playback voices.';
        generatedCmd = 'stop';
      } else if (lower.includes('status') || lower.includes('state') || lower.includes('bpm')) {
        reply = `Rhythm state is currently ${telemetry.musicalState || 'STEADY_GROOVE'} at ${telemetry.bpm.toFixed(1)} BPM. Sidechain RMS: ${(telemetry.sidechainRMS * 100).toFixed(1)}%.`;
      } else {
        reply = `Executing command instruction: "${prompt}"`;
        generatedCmd = prompt;
      }

      const agentMsg: CopilotMessage = {
        id: `a-${Date.now()}`,
        sender: 'agent',
        text: reply,
        command: generatedCmd || undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, agentMsg]);
      setIsProcessing(false);

      if (generatedCmd) {
        onExecuteCommand(generatedCmd);
      }
    }, 400);
  };

  const handleChip = (prompt: string) => {
    setInput(prompt);
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-3 top-20 z-40 bg-[#121620] hover:bg-[#1a2130] text-amber-400 border border-amber-500/40 px-3 py-2 rounded-xl shadow-lg flex items-center gap-2 font-mono text-xs transition-all hover:scale-105"
        title="Open AI Copilot Drawer"
      >
        <Sparkles size={14} className="text-amber-400 animate-pulse" />
        <span className="font-bold tracking-wider">COPILOT</span>
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-14 bottom-0 w-80 bg-[#0d0f16] border-l border-slate-800/90 z-40 flex flex-col font-mono shadow-2xl text-slate-200 select-none">
      {/* Drawer Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-[#080a0f] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-amber-500/20 text-amber-400">
            <Sparkles size={14} />
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-wider flex items-center gap-2">
              <span>AI COPILOT</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="text-[10px] text-slate-500">IPC Socket · /tmp/johnwalls.sock</div>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800 transition"
        >
          <X size={15} />
        </button>
      </div>

      {/* Live State Mini-HUD */}
      <div className="px-4 py-2 bg-[#090c12] border-b border-slate-800/70 grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-[#12151e] p-1.5 rounded border border-slate-800">
          <span className="text-slate-500">GROOVE: </span>
          <span className="text-emerald-400 font-bold">{telemetry.musicalState || 'STEADY'}</span>
        </div>
        <div className="bg-[#12151e] p-1.5 rounded border border-slate-800">
          <span className="text-slate-500">TEMPO: </span>
          <span className="text-amber-400 font-bold">{telemetry.bpm.toFixed(1)} BPM</span>
        </div>
      </div>

      {/* Quick Action Suggestion Chips */}
      <div className="px-3 py-2 border-b border-slate-800/60 bg-[#0a0d14] flex flex-wrap gap-1.5 text-[10px]">
        <button
          onClick={() => handleChip('Add Tape Delay with Flutter')}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        >
          + Tape Delay
        </button>
        <button
          onClick={() => handleChip('Duck delay on kick hits')}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        >
          + Reactive Ducker
        </button>
        <button
          onClick={() => handleChip('Toggle Pad Hold Mode')}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        >
          Hold Toggle
        </button>
        <button
          onClick={() => handleChip('Export session manifest')}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        >
          Export Manifest
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${
              m.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500">
              <span>{m.sender === 'user' ? 'You' : 'Copilot'}</span>
              <span>· {m.timestamp}</span>
            </div>
            <div
              className={`p-2.5 rounded-xl max-w-[90%] leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 rounded-tr-none'
                  : 'bg-[#151924] text-slate-200 border border-slate-800 rounded-tl-none'
              }`}
            >
              {m.text}
              {m.command && (
                <div className="mt-2 pt-2 border-t border-slate-700/60 font-mono text-[10px] text-amber-400 bg-black/40 p-1.5 rounded">
                  <div className="text-[9px] text-slate-400 mb-0.5">Executed Command:</div>
                  <code>{m.command}</code>
                </div>
              )}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex items-center gap-2 text-slate-500 text-xs italic">
            <RefreshCw size={12} className="animate-spin text-amber-400" />
            <span>Analyzing audio state & dispatching...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Prompt Form */}
      <form onSubmit={handleSend} className="p-2 border-t border-slate-800 bg-[#080a0f] flex items-center gap-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Instruct Copilot (e.g. 'Add dub delay')..."
          className="flex-1 bg-[#121620] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 tracking-wide"
        />
        <button
          type="submit"
          className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition flex items-center justify-center"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  );
};
