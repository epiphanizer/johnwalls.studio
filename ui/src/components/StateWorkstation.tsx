import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Terminal,
  Play,
  Pause,
  Activity,
  Maximize2,
  Minimize2,
  Trash2,
  Radio,
  Sliders,
  Disc,
  GitBranch,
  Send,
  Volume2,
  Music,
  Cpu
} from 'lucide-react';
import { StateTelemetry, TerminalEntry } from '../types';
import { TerminalLogLine } from './TerminalLogLine';

export interface StateWorkstationProps {
  telemetry: StateTelemetry;
  logs?: TerminalEntry[];
  onExecuteCommand?: (command: string) => void;
  onClearLogs?: () => void;
  onSwitchToPedalLab: () => void;
  onSwitchToSP404?: () => void;
  onOpenRoutingModal?: () => void;
  onOpenCaptureDispatch?: () => void;
}

const QUICK_COMMANDS = [
  'status',
  'transport',
  'record',
  'takes',
  'publish',
  'tracks',
  'midi',
  'meters',
  'rhythm',
  'sc status',
  'help'
];

function getMidiNoteName(noteNum?: number): string {
  if (!noteNum || noteNum <= 0 || noteNum > 127) return '—';
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(noteNum / 12) - 1;
  const note = notes[noteNum % 12];
  return `${note}${octave}`;
}

export const StateWorkstation: React.FC<StateWorkstationProps> = ({
  telemetry,
  logs = [],
  onExecuteCommand,
  onClearLogs,
  onSwitchToPedalLab,
  onSwitchToSP404,
  onOpenRoutingModal,
  onOpenCaptureDispatch
}) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [isStreamActive, setIsStreamActive] = useState<boolean>(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new log entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Focus input on mount or toggle
  useEffect(() => {
    inputRef.current?.focus();
  }, [isFullScreen]);

  // Real-time Ableton Live State Streamer
  // When stream is active, report changes in Transport, Bar, MIDI note, and Musical State
  const prevIsPlaying = useRef<boolean | undefined>(telemetry.isPlaying);
  const prevBarNumber = useRef<number | undefined>(telemetry.barNumber);
  const prevMidiEvents = useRef<number | undefined>(telemetry.totalMidiEvents);
  const prevMusicalState = useRef<string>(telemetry.musicalState);

  useEffect(() => {
    if (!isStreamActive || !onExecuteCommand) return;

    // 1. Ableton Transport change
    if (telemetry.isPlaying !== undefined && telemetry.isPlaying !== prevIsPlaying.current) {
      prevIsPlaying.current = telemetry.isPlaying;
      if (telemetry.isPlaying) {
        onExecuteCommand('__stream [ABLETON] Transport ▶ PLAYING at ' + telemetry.bpm.toFixed(2) + ' BPM (TimeSig ' + (telemetry.timeSigNum || 4) + '/' + (telemetry.timeSigDen || 4) + ')');
      } else {
        onExecuteCommand('__stream [ABLETON] Transport ⏸ STOPPED at Bar ' + telemetry.barNumber);
      }
    }

    // 2. Bar change (only when playing)
    if (telemetry.isPlaying && telemetry.barNumber !== undefined && telemetry.barNumber !== prevBarNumber.current) {
      prevBarNumber.current = telemetry.barNumber;
      if (telemetry.barNumber % 4 === 1 || telemetry.barNumber === 1) {
        const ppqStr = telemetry.ppqPosition ? telemetry.ppqPosition.toFixed(2) : '0.00';
        onExecuteCommand('__stream [TRANSPORT] Bar ' + telemetry.barNumber + ' | PPQ ' + ppqStr + ' | Track: "' + (telemetry.currentTrackName || 'Main') + '"');
      }
    }

    // 3. Incoming MIDI event
    if (
      telemetry.totalMidiEvents !== undefined &&
      telemetry.totalMidiEvents !== prevMidiEvents.current &&
      telemetry.lastMidiNote &&
      telemetry.lastMidiNote > 0
    ) {
      prevMidiEvents.current = telemetry.totalMidiEvents;
      const noteName = getMidiNoteName(telemetry.lastMidiNote);
      const vel = telemetry.lastMidiVelocity ?? 100;
      const velFrac = Math.min(1, Math.max(0, vel / 127));
      const velBlocks = '█'.repeat(Math.round(velFrac * 10)) + '░'.repeat(10 - Math.round(velFrac * 10));
      onExecuteCommand('__stream [MIDI IN] Ch:' + (telemetry.lastMidiChannel || 1) + ' Note: ' + noteName + ' (' + telemetry.lastMidiNote + ') Vel: ' + vel + ' [' + velBlocks + ']');
    }

    // 4. Musical State transition
    if (telemetry.musicalState && telemetry.musicalState !== prevMusicalState.current) {
      prevMusicalState.current = telemetry.musicalState;
      onExecuteCommand('__stream [STATE] Musical State -> ' + telemetry.musicalState);
    }
  }, [
    isStreamActive,
    telemetry.isPlaying,
    telemetry.barNumber,
    telemetry.totalMidiEvents,
    telemetry.musicalState,
    telemetry.bpm,
    telemetry.ppqPosition,
    telemetry.currentTrackName,
    telemetry.lastMidiNote,
    telemetry.lastMidiVelocity,
    telemetry.lastMidiChannel,
    telemetry.timeSigNum,
    telemetry.timeSigDen,
    onExecuteCommand
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    onExecuteCommand?.(trimmed);
    setInput('');
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
      const match = QUICK_COMMANDS.find((cmd) => cmd.startsWith(input.toLowerCase()));
      if (match) {
        setInput(match);
      }
    }
  };

  // Convert track color ARGB integer to hex
  const trackColorHex = useMemo(() => {
    if (!telemetry.currentTrackColor) return '#06b6d4';
    const rgb = telemetry.currentTrackColor & 0x00ffffff;
    return `#${rgb.toString(16).padStart(6, '0')}`;
  }, [telemetry.currentTrackColor]);

  // Audio Peak meter calculation
  const peakDb = telemetry.peakDb ?? -60;
  const peakPct = Math.max(0, Math.min(100, ((peakDb + 60) / 60) * 100));
  const isClipping = peakDb >= -0.5;

  return (
    <div
      className={`flex flex-col bg-[#07080c] select-none text-slate-200 font-sans transition-all duration-200 ${
        isFullScreen ? 'fixed inset-0 z-50 p-4' : 'flex-1 h-full overflow-hidden'
      }`}
    >
      {/* 1. Real-time Live Ableton State Telemetry Ribbon */}
      <div className="bg-[#0b0e15] border-b border-slate-800/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 z-10 shadow-md">
        {/* Left: Ableton Transport & Playhead status */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Play/Stop Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold border transition ${
              telemetry.isPlaying
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
            }`}
          >
            {telemetry.isPlaying ? (
              <>
                <Play size={11} className="fill-emerald-400 animate-pulse" />
                <span>PLAYING</span>
              </>
            ) : (
              <>
                <Pause size={11} className="fill-amber-400" />
                <span>STOPPED</span>
              </>
            )}
          </div>

          {/* Real BPM from Ableton */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs">
            <span className="text-slate-500 font-sans text-[10px]">TEMPO</span>
            <span className="text-cyan-300 font-bold">{telemetry.bpm.toFixed(1)}</span>
            <span className="text-slate-500 text-[10px]">BPM</span>
          </div>

          {/* Real Bar & Beat Position */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs">
            <span className="text-slate-500 font-sans text-[10px]">POS</span>
            <span className="text-amber-300 font-bold">BAR {telemetry.barNumber}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 text-[11px]">
              {telemetry.ppqPosition ? telemetry.ppqPosition.toFixed(2) : '0.00'} PPQ
            </span>
          </div>

          {/* Time Signature */}
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-purple-300 font-mono text-xs font-bold">
            <span>{telemetry.timeSigNum || 4}/{telemetry.timeSigDen || 4}</span>
          </div>

          {/* Ableton Host Track Name & Color */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-semibold">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: trackColorHex }}
            />
            <span className="text-slate-400 text-[10px] uppercase font-sans">TRACK:</span>
            <span className="text-white font-bold truncate max-w-[140px]">
              "{telemetry.currentTrackName || 'Master'}"
            </span>
          </div>
        </div>

        {/* Right: Live Audio Level & MIDI Monitor */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Peak dB Meter Bar */}
          <div className="flex items-center gap-2 bg-slate-900 px-2.5 py-1 rounded border border-slate-800 font-mono text-xs">
            <Volume2 size={13} className={isClipping ? 'text-rose-400' : 'text-slate-400'} />
            <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden flex">
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
            <span
              className={`text-[11px] font-bold min-w-[50px] text-right ${
                isClipping
                  ? 'text-rose-400'
                  : peakDb > -6
                  ? 'text-amber-300'
                  : 'text-slate-300'
              }`}
            >
              {peakDb > -60 ? `${peakDb.toFixed(1)} dB` : '-∞ dB'}
            </span>
          </div>

          {/* Live MIDI Note indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono">
            <Music size={12} className={telemetry.isMidiActive ? 'text-purple-400' : 'text-slate-500'} />
            <span className="text-slate-500 font-sans text-[10px]">MIDI</span>
            <span className="text-purple-300 font-bold min-w-[28px]">
              {getMidiNoteName(telemetry.lastMidiNote)}
            </span>
            {telemetry.lastMidiVelocity && telemetry.lastMidiVelocity > 0 ? (
              <span className="text-slate-500 text-[10px]">
                v:{telemetry.lastMidiVelocity}
              </span>
            ) : null}
          </div>

          {/* Musical State badge */}
          <div className="px-2 py-0.5 rounded bg-pink-500/10 border border-pink-500/30 text-pink-300 text-[10.5px] font-bold tracking-wide">
            {telemetry.musicalState}
          </div>
        </div>
      </div>

      {/* 2. Terminal Header Bar & Quick Actions */}
      <div className="bg-[#0d0f17] border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#e6af2e]" />
          <span className="font-mono font-bold text-slate-200 tracking-wider">
            ABLETON LIVE STATE TERMINAL
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500 font-mono text-[11px]">johnwalls-cli v1.0.0</span>
        </div>

        {/* Action Controls & Navigation */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live Ticker Stream Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsStreamActive(!isStreamActive);
              onExecuteCommand?.(isStreamActive ? 'stream off' : 'stream on');
            }}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition flex items-center gap-1.5 border ${
              isStreamActive
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
            title="Toggle live event stream ticker into terminal"
          >
            <Radio size={12} className={isStreamActive ? 'animate-pulse text-emerald-400' : 'text-slate-600'} />
            <span>STREAM {isStreamActive ? 'ON' : 'PAUSED'}</span>
          </button>

          {/* Clear Logs */}
          <button
            type="button"
            onClick={onClearLogs}
            className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-300 font-mono text-xs transition flex items-center gap-1 border border-slate-800"
            title="Clear terminal log window"
          >
            <Trash2 size={12} />
            <span>CLEAR</span>
          </button>

          {/* Fullscreen Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono text-xs transition flex items-center gap-1 border border-slate-800 hover:border-slate-700"
            title={isFullScreen ? 'Restore standard workspace view' : 'Expand terminal to full screen'}
          >
            {isFullScreen ? (
              <>
                <Minimize2 size={12} className="text-[#e6af2e]" />
                <span>COLLAPSE</span>
              </>
            ) : (
              <>
                <Maximize2 size={12} className="text-[#e6af2e]" />
                <span>EXPAND FULL</span>
              </>
            )}
          </button>

          {/* Direct Publish to johnwalls.studio Cockpit */}
          {onOpenCaptureDispatch && (
            <button
              type="button"
              onClick={onOpenCaptureDispatch}
              className="px-2.5 py-1 rounded bg-[#e6af2e]/15 hover:bg-[#e6af2e]/30 text-[#e6af2e] font-mono text-xs font-bold transition flex items-center gap-1.5 border border-[#e6af2e]/50 shadow-sm"
              title="Capture Live Audio & Publish to johnwalls.studio"
            >
              <Radio size={12} className="animate-pulse text-[#e6af2e]" />
              <span>PUBLISH TO WEB</span>
            </button>
          )}

          <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

          {/* Workspace Switches */}
          {onOpenRoutingModal && (
            <button
              type="button"
              onClick={onOpenRoutingModal}
              className="px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold border border-cyan-500/30 flex items-center gap-1 transition"
              title="Open Universal Routing Matrix"
            >
              <GitBranch size={12} />
              <span>ROUTING</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSwitchToPedalLab}
            className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-1 transition"
            title="Switch to Pedal Lab"
          >
            <Sliders size={12} />
            <span>PEDAL LAB</span>
          </button>

          {onSwitchToSP404 && (
            <button
              type="button"
              onClick={onSwitchToSP404}
              className="px-2 py-1 rounded bg-[#ff5500]/10 hover:bg-[#ff5500]/20 text-[#ff8844] text-xs font-bold border border-[#ff5500]/30 flex items-center gap-1 transition"
              title="Switch to SP-404 Sampler"
            >
              <Disc size={12} />
              <span>SP-404</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Command Chips */}
      <div className="bg-[#090b10] border-b border-slate-800/60 px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0 select-none">
        <span className="text-slate-600 font-mono text-[10px] uppercase mr-1">QUICK:</span>
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            type="button"
            onClick={() => onExecuteCommand?.(cmd)}
            className="px-2 py-0.5 rounded bg-slate-900/90 hover:bg-slate-800 text-[11px] font-mono text-slate-300 hover:text-white border border-slate-800/80 hover:border-slate-700 transition shrink-0"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* 3. Terminal Log Output Screen */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-1 select-text bg-[#050609]"
      >
        {logs.map((log) => (
          <TerminalLogLine key={log.id} log={log} />
        ))}
      </div>

      {/* 4. Interactive Command Input Prompt */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-800 bg-[#090b10] px-4 py-2.5 flex items-center gap-2 shrink-0 z-10"
      >
        <span className="text-[#e6af2e] font-mono text-xs font-bold shrink-0 select-none">
          johnwalls $
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type Ableton state command (e.g. 'status', 'transport', 'tracks', 'midi', 'meters', 'rhythm', 'help')... [Enter]"
          className="flex-1 bg-transparent text-white font-mono text-xs focus:outline-none placeholder-slate-600"
        />
        <button
          type="submit"
          className="px-3 py-1 rounded bg-[#e6af2e] hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold flex items-center gap-1 transition shadow-sm shrink-0"
        >
          <Send size={11} />
          <span>RUN</span>
        </button>
      </form>
    </div>
  );
};
