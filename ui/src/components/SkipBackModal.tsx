import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Play, Square, Scissors, Download, Volume2, Check } from 'lucide-react';
import { SP404AudioEngine, BankLetter } from './SP404AudioEngine';
import { SP404_LEGACY_BANKS } from '../utils/sp404Library';
import { audioBufferToWav } from '../utils/wavEncoder';

interface SkipBackModalProps {
  isOpen: boolean;
  onClose: () => void;
  sp404Engine: SP404AudioEngine;
  bpm?: number;
  initialBank?: BankLetter;
  initialPadId?: number;
  onOpenAutoChop?: (buffer: AudioBuffer) => void;
}

export const SkipBackModal: React.FC<SkipBackModalProps> = ({
  isOpen,
  onClose,
  sp404Engine,
  bpm = 120,
  initialBank = 'A',
  initialPadId = 1,
  onOpenAutoChop
}) => {
  const [source, setSource] = useState<'master' | 'clean_di'>('master');
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playhead, setPlayhead] = useState<number>(0);
  const [targetBank, setTargetBank] = useState<BankLetter>(initialBank);
  const [targetPadId, setTargetPadId] = useState<number>(initialPadId);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playheadAnimRef = useRef<number | null>(null);
  const playheadStartTimeRef = useRef<number>(0);
  const playheadOffsetRef = useRef<number>(0);

  // Load the 25-second snapshot when modal opens or source toggles
  useEffect(() => {
    if (!isOpen) {
      stopAudition();
      return;
    }

    const buf = sp404Engine.getSkipBackAudioBuffer(source, 25.0);
    if (buf) {
      setAudioBuffer(buf);
      setTrimStart(0);
      setTrimEnd(buf.duration);
      setPlayhead(0);
    } else {
      setAudioBuffer(null);
    }
  }, [isOpen, source, sp404Engine]);

  // Stop playback when unmounting
  useEffect(() => {
    return () => {
      stopAudition();
    };
  }, []);

  const stopAudition = useCallback(() => {
    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.stop();
        playbackSourceRef.current.disconnect();
      } catch {}
      playbackSourceRef.current = null;
    }
    if (playheadAnimRef.current) {
      cancelAnimationFrame(playheadAnimRef.current);
      playheadAnimRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startAudition = useCallback(() => {
    if (!audioBuffer) return;
    const ctx = sp404Engine.getAudioContext();
    if (!ctx) return;

    stopAudition();

    const startSec = Math.max(0, trimStart);
    const endSec = Math.min(audioBuffer.duration, trimEnd > trimStart ? trimEnd : audioBuffer.duration);
    const duration = Math.max(0.05, endSec - startSec);

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    const auditionGain = ctx.createGain();
    auditionGain.gain.setValueAtTime(0.9, ctx.currentTime);

    sourceNode.connect(auditionGain);
    auditionGain.connect(ctx.destination);

    sourceNode.onended = () => {
      stopAudition();
      setPlayhead(startSec);
    };

    sourceNode.start(0, startSec, duration);
    playbackSourceRef.current = sourceNode;

    playheadStartTimeRef.current = ctx.currentTime;
    playheadOffsetRef.current = startSec;
    setIsPlaying(true);

    const updatePlayhead = () => {
      if (!ctx || !playbackSourceRef.current) return;
      const elapsed = ctx.currentTime - playheadStartTimeRef.current;
      const currentPos = playheadOffsetRef.current + elapsed;
      if (currentPos >= endSec) {
        setPlayhead(startSec);
        stopAudition();
      } else {
        setPlayhead(currentPos);
        playheadAnimRef.current = requestAnimationFrame(updatePlayhead);
      }
    };

    playheadAnimRef.current = requestAnimationFrame(updatePlayhead);
  }, [audioBuffer, trimStart, trimEnd, sp404Engine, stopAudition]);

  const toggleAudition = useCallback(() => {
    if (isPlaying) {
      stopAudition();
    } else {
      startAudition();
    }
  }, [isPlaying, startAudition, stopAudition]);

  // Spacebar hotkey to audition
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        toggleAudition();
      } else if (e.code === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggleAudition, onClose]);

  // Draw high-resolution waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const duration = audioBuffer.duration || 1;

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, width, height);

    // Center zero axis
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height * 0.44;

    // Draw waveform peaks
    ctx.fillStyle = '#f59e0b'; // Amber-400
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const yMin = (1 + min) * amp;
      const yMax = Math.max(1, (max - min) * amp);
      ctx.fillRect(i, height / 2 - (max * amp), 1, yMax);
    }

    // Dim non-selected trim areas
    const startX = (trimStart / duration) * width;
    const endX = (trimEnd / duration) * width;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Start handle line
    ctx.strokeStyle = '#10b981'; // Emerald
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();

    // End handle line
    ctx.strokeStyle = '#ef4444'; // Red
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();

    // Playhead line
    if (isPlaying && playhead >= trimStart && playhead <= trimEnd) {
      const playX = (playhead / duration) * width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
    }
  }, [audioBuffer, trimStart, trimEnd, isPlaying, playhead]);

  // Helper to extract trimmed AudioBuffer
  const getTrimmedBuffer = useCallback((): AudioBuffer | null => {
    if (!audioBuffer) return null;
    const ctx = sp404Engine.getAudioContext();
    if (!ctx) return null;

    const startSec = Math.max(0, trimStart);
    const endSec = Math.min(audioBuffer.duration, trimEnd > trimStart ? trimEnd : audioBuffer.duration);
    const startSample = Math.floor(startSec * audioBuffer.sampleRate);
    const endSample = Math.floor(endSec * audioBuffer.sampleRate);
    const len = Math.max(1, endSample - startSample);

    const subBuf = ctx.createBuffer(audioBuffer.numberOfChannels, len, audioBuffer.sampleRate);
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      const src = audioBuffer.getChannelData(c);
      const dest = subBuf.getChannelData(c);
      dest.set(src.subarray(startSample, endSample));
    }
    return subBuf;
  }, [audioBuffer, trimStart, trimEnd, sp404Engine]);

  const handleDumpToPad = () => {
    const trimmed = getTrimmedBuffer();
    if (!trimmed) return;

    sp404Engine.assignBufferToPad(targetBank, targetPadId, trimmed, 'SKIP-BACK', 'oneshot', 0);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 600);
  };

  const handleOpenAutoChop = () => {
    const trimmed = getTrimmedBuffer();
    if (!trimmed) return;
    stopAudition();
    onClose();
    onOpenAutoChop?.(trimmed);
  };

  const handleDownloadWav = () => {
    const trimmed = getTrimmedBuffer();
    if (!trimmed) return;
    const blob = audioBufferToWav(trimmed, 48000);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skipback_${source}_${targetBank}${targetPadId}_${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const duration = audioBuffer?.duration || 0;
  const selectionDuration = Math.max(0, trimEnd - trimStart);
  const beatsAtBpm = ((selectionDuration * (bpm / 60))).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="bg-[#0e111a] border border-amber-500/40 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#141824] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <RotateCcw size={18} className="animate-spin-once" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">SKIP-BACK CAPTURE</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                  LAST 25 SECONDS
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Continuous retrospective buffer. Never lose an unrecorded riff or live jam.
              </p>
            </div>
          </div>

          {/* Source Tap Toggle */}
          <div className="flex items-center gap-1 bg-[#090b10] p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setSource('master')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                source === 'master'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              WET MASTER
            </button>
            <button
              onClick={() => setSource('clean_di')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                source === 'clean_di'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              CLEAN DI
            </button>
          </div>
        </div>

        {/* Waveform Canvas Area */}
        <div className="p-5 flex flex-col gap-4">
          <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-black h-40">
            {audioBuffer ? (
              <canvas
                ref={canvasRef}
                width={800}
                height={160}
                className="w-full h-full cursor-crosshair"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const ratio = clickX / rect.width;
                  const clickTime = ratio * duration;
                  if (e.shiftKey) {
                    setTrimEnd(Math.max(trimStart + 0.05, clickTime));
                  } else {
                    setTrimStart(Math.min(trimEnd - 0.05, clickTime));
                  }
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                Awaiting audio signal... (Play your guitar, synth, or hit pads to fill buffer)
              </div>
            )}

            {/* Readout Badges */}
            <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
              <span className="px-2 py-0.5 rounded bg-black/80 text-amber-300 font-mono text-[10px] border border-amber-500/30">
                {source === 'master' ? 'TAP: MASTER POST-PEDAL' : 'TAP: CLEAN DI PRE-FX'}
              </span>
              <span className="px-2 py-0.5 rounded bg-black/80 text-white font-mono text-[10px] border border-slate-700">
                TOTAL: {duration.toFixed(2)}s
              </span>
            </div>

            <div className="absolute top-2 right-2 flex items-center gap-2 pointer-events-none">
              <span className="px-2 py-0.5 rounded bg-black/80 text-emerald-400 font-mono text-[10px] border border-emerald-500/30 font-bold">
                SELECTION: {selectionDuration.toFixed(2)}s ({beatsAtBpm} BEATS @ {bpm} BPM)
              </span>
            </div>
          </div>

          {/* Interactive Trim Sliders */}
          <div className="grid grid-cols-2 gap-4 bg-[#141824] p-3 rounded-xl border border-slate-800">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> START TRIM
                </span>
                <span className="font-mono text-slate-300 text-[11px]">{trimStart.toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0.01, duration)}
                step={0.01}
                value={trimStart}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setTrimStart(Math.min(val, trimEnd - 0.05));
                }}
                className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-red-400 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> END TRIM
                </span>
                <span className="font-mono text-slate-300 text-[11px]">{trimEnd.toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0.01, duration)}
                step={0.01}
                value={trimEnd}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setTrimEnd(Math.max(val, trimStart + 0.05));
                }}
                className="w-full accent-red-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* Target Pad Selector & Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Audition Trigger */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleAudition}
                disabled={!audioBuffer}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm ${
                  isPlaying
                    ? 'bg-amber-500 text-black hover:bg-amber-400'
                    : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'
                } disabled:opacity-50`}
              >
                {isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                <span>{isPlaying ? 'STOP AUDITION' : 'AUDITION (SPACE)'}</span>
              </button>

              <button
                onClick={handleDownloadWav}
                disabled={!audioBuffer}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
                title="Download WAV to drag into Ableton arrangement"
              >
                <Download size={14} />
                <span>EXPORT .WAV</span>
              </button>
            </div>

            {/* Target Pad & Commit Buttons */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#090b10] px-2 py-1 rounded-xl border border-slate-700 text-xs">
                <span className="text-slate-400 font-medium">Target:</span>
                <select
                  value={targetBank}
                  onChange={(e) => setTargetBank(e.target.value as BankLetter)}
                  className="bg-transparent text-amber-400 font-bold focus:outline-none cursor-pointer"
                >
                  {SP404_LEGACY_BANKS.map((b) => (
                    <option key={b} value={b} className="bg-slate-900 text-white">
                      BANK {b}
                    </option>
                  ))}
                </select>
                <select
                  value={targetPadId}
                  onChange={(e) => setTargetPadId(parseInt(e.target.value, 10))}
                  className="bg-transparent text-amber-400 font-bold focus:outline-none cursor-pointer"
                >
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((p) => (
                    <option key={p} value={p} className="bg-slate-900 text-white">
                      PAD {String(p).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleDumpToPad}
                disabled={!audioBuffer}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  isSuccess
                    ? 'bg-emerald-500 text-black'
                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-md'
                } disabled:opacity-50`}
              >
                {isSuccess ? <Check size={14} /> : <Volume2 size={14} />}
                <span>
                  {isSuccess
                    ? 'ASSIGNED!'
                    : `DUMP TO PAD ${targetBank}${String(targetPadId).padStart(2, '0')}`}
                </span>
              </button>

              <button
                onClick={handleOpenAutoChop}
                disabled={!audioBuffer}
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Scissors size={14} />
                <span>CHOP TO 16 PADS</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#090b10] border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Click on waveform to set start point. Shift+Click to set end point.</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white px-3 py-1 rounded-lg hover:bg-slate-800 transition"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
