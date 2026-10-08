import React from 'react';
import { TerminalEntry } from '../types';

interface TerminalLogLineProps {
  log: TerminalEntry;
}

/**
 * Color-codes an individual line of terminal text based on Ableton / audio telemetry syntax.
 */
function renderFormattedLine(text: string, lineIndex: number): React.ReactNode {
  const trimmed = text.trim();

  // 1. Header Banners: === TITLE ===
  if (trimmed.startsWith('===') && trimmed.endsWith('===')) {
    return (
      <div key={lineIndex} className="text-[#e6af2e] font-bold tracking-wider py-0.5 border-b border-amber-500/20 text-[12px]">
        {text}
      </div>
    );
  }

  // 2. Sub-headers / dividers: --- SUBTITLE ---
  if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
    return (
      <div key={lineIndex} className="text-cyan-400/80 font-semibold tracking-wide py-0.5 text-[11.5px]">
        {text}
      </div>
    );
  }

  // 3. Tokenize by spaces / tags to color-code keywords
  const parts = text.split(/(\[ABLETON\]|\[TRANSPORT\]|\[MIDI IN\]|\[MIDI\]|\[STATE\]|\[AUDIO\]|\[METERS\]|\[RHYTHM\]|\[SC\]|\[WARN\]|\[CLIP\]|▶ PLAYING|⏸ STOPPED|ACTIVE|BYPASSED|MUTED|OFFLINE|\[[█░]+\])/g);

  return (
    <div key={lineIndex} className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, pIdx) => {
        if (!part) return null;

        // Tags
        if (part === '[ABLETON]' || part === '[TRANSPORT]') {
          return <span key={pIdx} className="text-cyan-400 font-bold mr-1">{part}</span>;
        }
        if (part === '[MIDI IN]' || part === '[MIDI]') {
          return <span key={pIdx} className="text-purple-400 font-bold mr-1">{part}</span>;
        }
        if (part === '[STATE]' || part === '[RHYTHM]') {
          return <span key={pIdx} className="text-pink-400 font-bold mr-1">{part}</span>;
        }
        if (part === '[AUDIO]' || part === '[METERS]') {
          return <span key={pIdx} className="text-emerald-400 font-bold mr-1">{part}</span>;
        }
        if (part === '[SC]') {
          return <span key={pIdx} className="text-sky-400 font-bold mr-1">{part}</span>;
        }
        if (part === '[WARN]' || part === '[CLIP]') {
          return <span key={pIdx} className="text-rose-400 font-bold mr-1">{part}</span>;
        }

        // Status keywords
        if (part === '▶ PLAYING') {
          return <span key={pIdx} className="text-emerald-400 font-extrabold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">{part}</span>;
        }
        if (part === '⏸ STOPPED') {
          return <span key={pIdx} className="text-amber-400 font-bold bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/30">{part}</span>;
        }
        if (part === 'ACTIVE') {
          return <span key={pIdx} className="text-emerald-400 font-semibold">{part}</span>;
        }
        if (part === 'BYPASSED' || part === 'MUTED' || part === 'OFFLINE') {
          return <span key={pIdx} className="text-slate-500 font-semibold">{part}</span>;
        }

        // ASCII Meters e.g. [██████░░░░]
        if (part.startsWith('[') && (part.includes('█') || part.includes('░')) && part.endsWith(']')) {
          return <span key={pIdx} className="text-emerald-400 tracking-tight font-mono">{part}</span>;
        }

        // Default text: subtle coloring for keys vs values
        if (part.includes(':')) {
          const colonIdx = part.indexOf(':');
          const key = part.substring(0, colonIdx + 1);
          const val = part.substring(colonIdx + 1);
          return (
            <span key={pIdx}>
              <span className="text-slate-400">{key}</span>
              <span className="text-slate-200">{val}</span>
            </span>
          );
        }

        return <span key={pIdx} className="text-slate-300">{part}</span>;
      })}
    </div>
  );
}

export const TerminalLogLine: React.FC<TerminalLogLineProps> = ({ log }) => {
  return (
    <div className="flex gap-2.5 items-start font-mono text-[11.5px] py-0.5 select-text hover:bg-slate-900/40 px-1.5 rounded transition">
      <span className="text-slate-600 select-none shrink-0 text-[10.5px] pt-0.5">
        [{log.timestamp}]
      </span>

      {log.type === 'input' && (
        <div className="flex-1 text-slate-300">
          <span className="text-[#e6af2e] font-bold select-none mr-2">johnwalls $</span>
          <span className="text-white font-semibold">{log.content}</span>
        </div>
      )}

      {log.type === 'output' && (
        <div className="flex-1">
          {log.content.split('\n').map((line, idx) => renderFormattedLine(line, idx))}
        </div>
      )}

      {log.type === 'error' && (
        <div className="flex-1 text-rose-400 font-semibold whitespace-pre-wrap">
          <span className="text-rose-500 font-bold mr-1">Error:</span>
          {log.content}
        </div>
      )}

      {log.type === 'system' && (
        <div className="flex-1 text-sky-400 italic whitespace-pre-wrap">
          {log.content.split('\n').map((line, idx) => (
            <div key={idx} className="text-sky-300/90">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};
