import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Scissors, Play, Square, RefreshCw, Check, Sparkles, Grid, Sliders, Volume2 } from 'lucide-react';
import { SP404AudioEngine, BankLetter } from './SP404AudioEngine';
import { SP404_LEGACY_BANKS } from '../utils/sp404Library';
import { detectTransients, getGridSlicePoints } from '../utils/transientDetector';

interface WaveformChopDeckProps {
  isOpen: boolean;
  onClose: () => void;
  audioBuffer: AudioBuffer | null;
  sp404Engine: SP404AudioEngine;
  bpm?: number;
  activeBank?: BankLetter;
  onSlicesCommitted?: (count: number) => void;
}

export const WaveformChopDeck: React.FC<WaveformChopDeckProps> = ({
  isOpen,
  onClose,
  audioBuffer,
  sp404Engine,
  bpm = 120,
  activeBank = 'A',
  onSlicesCommitted
}) => {
  const [mode, setMode] = useState<'transient' | 'grid' | 'manual'>('transient');
  const [sensitivity, setSensitivity] = useState<number>(0.65);
  const [gridDivisions, setGridDivisions] = useState<4 | 8 | 12 | 16>(16);
  const [slicePoints, setSlicePoints] = useState<number[]>([0]);
  const [activeSliceIdx, setActiveSliceIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [targetBank, setTargetBank] = useState<BankLetter>(activeBank);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [draggedMarkerIdx, setDraggedMarkerIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState<1 | 2 | 4 | 8>(1);
  const [pan, setPan] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Recalculate slice points whenever buffer, mode, sensitivity, or grid divisions change
  useEffect(() => {
    if (!audioBuffer) return;

    if (mode === 'transient') {
      const onsets = detectTransients(audioBuffer, sensitivity, 0.07);
      // Cap at 16 slices for the 16-pad matrix
      setSlicePoints(onsets.slice(0, 16));
    } else if (mode === 'grid') {
      const grid = getGridSlicePoints(audioBuffer.duration, bpm, gridDivisions);
      setSlicePoints(grid);
    }
  }, [audioBuffer, mode, sensitivity, gridDivisions, bpm]);

  // Synchronize initial bank
  useEffect(() => {
    setTargetBank(activeBank);
  }, [activeBank]);

  const stopAudition = useCallback(() => {
    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.stop();
        playbackSourceRef.current.disconnect();
      } catch {}
      playbackSourceRef.current = null;
    }
    setIsPlaying(false);
    setActiveSliceIdx(null);
  }, []);

  const auditionSlice = useCallback((sliceIdx: number) => {
    if (!audioBuffer) return;
    const ctx = sp404Engine.getAudioContext();
    if (!ctx) return;

    stopAudition();

    const startSec = Math.max(0, slicePoints[sliceIdx] || 0);
    const endSec = sliceIdx < slicePoints.length - 1 ? Math.min(audioBuffer.duration, slicePoints[sliceIdx + 1]) : audioBuffer.duration;
    const duration = Math.max(0.04, endSec - startSec);

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.95, ctx.currentTime);

    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    sourceNode.onended = () => {
      stopAudition();
    };

    sourceNode.start(0, startSec, duration);
    playbackSourceRef.current = sourceNode;
    setIsPlaying(true);
    setActiveSliceIdx(sliceIdx);
  }, [audioBuffer, slicePoints, sp404Engine, stopAudition]);

  // Handle hotkeys
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          stopAudition();
        } else {
          auditionSlice(activeSliceIdx !== null ? activeSliceIdx : 0);
        }
      } else if (e.code === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPlaying, activeSliceIdx, auditionSlice, stopAudition, onClose]);

  // Waveform rendering with slice markers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const duration = audioBuffer.duration || 1;
    const viewStart = pan * duration * (1 - 1 / zoom);
    const viewDuration = duration / zoom;

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
    const sampleStart = Math.floor(viewStart * audioBuffer.sampleRate);
    const viewSamples = Math.max(1, Math.floor(viewDuration * audioBuffer.sampleRate));
    const step = Math.max(1, Math.ceil(viewSamples / width));
    const amp = height * 0.42;

    // Draw slices with alternating background tint
    for (let s = 0; s < slicePoints.length; s++) {
      const sStart = ((slicePoints[s] - viewStart) / viewDuration) * width;
      const sEnd = ((s < slicePoints.length - 1 ? slicePoints[s + 1] : duration) - viewStart) / viewDuration * width;

      if (activeSliceIdx === s) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)'; // Highlight active slice in amber
        ctx.fillRect(sStart, 0, sEnd - sStart, height);
      } else if (s % 2 === 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(sStart, 0, sEnd - sStart, height);
      }
    }

    // Draw waveform peaks
    ctx.fillStyle = '#38bdf8'; // Sky blue
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[Math.min(data.length - 1, sampleStart + i * step + j)] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const yMax = Math.max(1, (max - min) * amp);
      ctx.fillRect(i, height / 2 - (max * amp), 1, yMax);
    }

    // Draw vertical slice markers
    for (let s = 0; s < slicePoints.length; s++) {
      const x = ((slicePoints[s] - viewStart) / viewDuration) * width;
      if (x < 0 || x > width) continue;

      // Marker line
      ctx.strokeStyle = s === 0 ? '#10b981' : '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Grab handles at both edges make each editable slice boundary explicit.
      ctx.fillStyle = s === 0 ? '#10b981' : '#f59e0b';
      ctx.fillRect(x - 3, 22, 6, 10);
      ctx.fillRect(x - 3, height - 32, 6, 10);

      // Slice label badge
      ctx.fillStyle = s === activeSliceIdx ? '#f59e0b' : '#1e293b';
      ctx.fillRect(x + 2, 4, 22, 16);

      ctx.fillStyle = s === activeSliceIdx ? '#000000' : '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(String(s + 1), x + 6, 16);
    }
  }, [audioBuffer, slicePoints, activeSliceIdx, zoom, pan]);

  // Handle canvas mouse interactions for adding/moving markers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBuffer || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const duration = audioBuffer.duration;
    const clickTime = pan * duration * (1 - 1 / zoom) + (clickX / rect.width) * (duration / zoom);

    // Check if clicked near an existing marker to drag
    const markerThresholdSec = (12 / rect.width) * (duration / zoom);
    const nearbyIdx = slicePoints.findIndex((pt, idx) => idx > 0 && Math.abs(pt - clickTime) < markerThresholdSec);

    if (nearbyIdx !== -1) {
      setDraggedMarkerIdx(nearbyIdx);
    } else {
      // Find which slice was clicked to audition
      let clickedSlice = slicePoints.length - 1;
      for (let i = 0; i < slicePoints.length; i++) {
        const nextTime = i < slicePoints.length - 1 ? slicePoints[i + 1] : duration;
        if (clickTime >= slicePoints[i] && clickTime < nextTime) {
          clickedSlice = i;
          break;
        }
      }
      auditionSlice(clickedSlice);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedMarkerIdx === null || !audioBuffer || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const newTime = parseFloat((pan * audioBuffer.duration * (1 - 1 / zoom) + (clickX / rect.width) * (audioBuffer.duration / zoom)).toFixed(4));

    setSlicePoints((prev) => {
      const updated = [...prev];
      updated[draggedMarkerIdx] = Math.max(updated[draggedMarkerIdx - 1] + 0.005, Math.min(updated[draggedMarkerIdx + 1] ?? audioBuffer.duration - 0.005, newTime));
      return updated;
    });
  };

  const handleCanvasMouseUp = () => {
    setDraggedMarkerIdx(null);
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBuffer || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = parseFloat((pan * audioBuffer.duration * (1 - 1 / zoom) + (clickX / rect.width) * (audioBuffer.duration / zoom)).toFixed(4));

    setMode('manual');
    setSlicePoints((prev) => {
      if (prev.length >= 16) return prev;
      return Array.from(new Set([...prev, newTime])).sort((a, b) => a - b);
    });
  };

  // Commit Slices to 16 Pads (One-Shot, Choke Group 2)
  const handleCommitSlices = () => {
    if (!audioBuffer) return;

    const count = sp404Engine.sliceAndAssignToPads(targetBank, audioBuffer, slicePoints, 'CHOP');
    setIsSuccess(true);
    onSlicesCommitted?.(count);

    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150 font-sans">
      <div className="bg-[#0e111a] border border-amber-500/40 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header Ribbon */}
        <div className="px-5 py-3.5 bg-[#141824] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <Scissors size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">HYBRID AUTO-CHOP DECK</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                  {slicePoints.length} SLICES
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                  CHOKE GROUP 2 (ONE-SHOT)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Slice sample across 16 velocity pads with zero-crossing onset alignment.
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 bg-[#090b10] p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setMode('transient')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                mode === 'transient'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles size={12} />
              <span>TRANSIENT</span>
            </button>

            <button
              onClick={() => setMode('grid')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                mode === 'grid'
                  ? 'bg-sky-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid size={12} />
              <span>BPM GRID</span>
            </button>

            <button
              onClick={() => setMode('manual')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                mode === 'manual'
                  ? 'bg-purple-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders size={12} />
              <span>MANUAL</span>
            </button>
          </div>
        </div>

        {/* Waveform & Slicing Canvas */}
        <div className="p-5 flex flex-col gap-4">
          <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-black h-48 select-none">
            {audioBuffer ? (
              <canvas
                ref={canvasRef}
                width={900}
                height={192}
                className="w-full h-full cursor-pointer"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onDoubleClick={handleCanvasDoubleClick}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                No sample loaded. Drag an audio file onto the deck or use Skip-Back.
              </div>
            )}

            {/* Readout Badges */}
            <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
              <span className="px-2 py-0.5 rounded bg-black/80 text-amber-300 font-mono text-[10px] border border-amber-500/30">
                MODE: {mode.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded bg-black/80 text-white font-mono text-[10px] border border-slate-700">
                TOTAL: {audioBuffer?.duration.toFixed(2)}s
              </span>
            </div>

            <div className="absolute top-2 right-2 flex items-center gap-2 pointer-events-none">
              <span className="px-2 py-0.5 rounded bg-black/80 text-emerald-400 font-mono text-[10px] border border-emerald-500/30 font-bold">
                {activeSliceIdx !== null
                  ? `PLAYING SLICE #${activeSliceIdx + 1}`
                  : 'CLICK ANY SLICE TO AUDITION'}
              </span>
            </div>
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/80 p-1 border border-slate-700">
              {[1, 2, 4, 8].map((factor) => <button key={factor} type="button" onClick={() => { setZoom(factor as 1 | 2 | 4 | 8); setPan(0.5); }} className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${zoom === factor ? 'bg-amber-500 text-black' : 'text-slate-300 hover:bg-slate-800'}`}>{factor}x</button>)}
              {zoom > 1 && <input aria-label="Waveform pan" type="range" min={0} max={1} step={0.01} value={pan} onChange={(e) => setPan(parseFloat(e.target.value))} className="w-20 accent-amber-500" />}
            </div>
          </div>

          {/* Slicing Controls Ribbon */}
          <div className="bg-[#141824] p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
            {mode === 'transient' && (
              <div className="flex-1 flex items-center gap-3">
                <span className="text-xs text-amber-400 font-bold whitespace-nowrap flex items-center gap-1.5">
                  <Sparkles size={14} /> SENSITIVITY:
                </span>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.02}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="font-mono text-white text-xs w-12 text-right">
                  {Math.round(sensitivity * 100)}%
                </span>
              </div>
            )}

            {mode === 'grid' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-sky-400 font-bold flex items-center gap-1.5">
                  <Grid size={14} /> DIVISIONS:
                </span>
                {[4, 8, 12, 16].map((div) => (
                  <button
                    key={div}
                    onClick={() => setGridDivisions(div as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      gridDivisions === div
                        ? 'bg-sky-500 text-black shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {div} SLICES
                  </button>
                ))}
              </div>
            )}

            {mode === 'manual' && (
              <div className="text-xs text-slate-300 flex items-center gap-2">
                <span className="text-purple-400 font-bold">MANUAL MODE:</span>
                <span>Double-click waveform to add marker. Drag marker to nudge timing.</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (audioBuffer) {
                    if (mode === 'transient') {
                      setSlicePoints(detectTransients(audioBuffer, sensitivity, 0.07).slice(0, 16));
                    } else if (mode === 'grid') {
                      setSlicePoints(getGridSlicePoints(audioBuffer.duration, bpm, gridDivisions));
                    }
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition flex items-center gap-1"
                title="Reset Slices"
              >
                <RefreshCw size={12} />
                <span>RESET</span>
              </button>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Audition Trigger */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (isPlaying) {
                    stopAudition();
                  } else {
                    auditionSlice(activeSliceIdx !== null ? activeSliceIdx : 0);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm ${
                  isPlaying
                    ? 'bg-amber-500 text-black hover:bg-amber-400'
                    : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                <span>{isPlaying ? 'STOP AUDITION' : 'AUDITION (SPACE)'}</span>
              </button>
            </div>

            {/* Target Bank & Commit Button */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[#090b10] px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
                <span className="text-slate-400 font-medium">Target Bank:</span>
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
              </div>

              <button
                onClick={handleCommitSlices}
                disabled={!audioBuffer || slicePoints.length === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg ${
                  isSuccess
                    ? 'bg-emerald-500 text-black'
                    : 'bg-amber-500 hover:bg-amber-400 text-black'
                } disabled:opacity-50`}
              >
                {isSuccess ? <Check size={16} /> : <Scissors size={16} />}
                <span>
                  {isSuccess
                    ? `SLICED TO BANK ${targetBank}!`
                    : `SLICE TO ${slicePoints.length} PADS (BANK ${targetBank})`}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Notice */}
        <div className="px-5 py-3 bg-[#090b10] border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Slices mapped to Pads 1..{slicePoints.length} with One-Shot mode and Choke Group 2.</span>
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
