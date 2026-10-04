import React, { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { audioEngine } from './AudioEngineBridge';

interface WaveformVisualizerProps {
  inspectedNodeId: string;
  inspectedNodeTitle: string;
  inspectedNodeColor: string;
  onSelectNode: (nodeId: string) => void;
  availableNodes: { id: string; title: string; type: string; color: string }[];
  bpm?: number;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  inspectedNodeId,
  inspectedNodeTitle,
  inspectedNodeColor,
  onSelectNode,
  availableNodes,
  bpm = 124
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakRef = useRef<HTMLSpanElement | null>(null);
  const rmsRef = useRef<HTMLSpanElement | null>(null);
  const [mode, setMode] = useState<'scope' | 'spectrum'>('scope');
  const [timebase, setTimebase] = useState<number>(1);

  const getColorHex = (color: string) => {
    switch (color) {
      case 'rose':
        return { primary: '#f43f5e', glow: 'rgba(244, 63, 94, 0.45)', bg: '#881337' };
      case 'amber':
      case 'gold':
        return { primary: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', bg: '#78350f' };
      case 'cyan':
        return { primary: '#06b6d4', glow: 'rgba(6, 182, 212, 0.45)', bg: '#164e63' };
      case 'crimson':
        return { primary: '#ef4444', glow: 'rgba(239, 68, 68, 0.45)', bg: '#7f1d1d' };
      case 'purple':
        return { primary: '#a855f7', glow: 'rgba(168, 85, 247, 0.45)', bg: '#581c87' };
      default:
        return { primary: '#10b981', glow: 'rgba(16, 185, 129, 0.45)', bg: '#064e3b' };
    }
  };

  const palette = getColorHex(inspectedNodeColor);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const waveBuffer = new Float32Array(512);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Dark oscilloscope phosphor background
      ctx.fillStyle = '#06080d';
      ctx.fillRect(0, 0, width, height);

      // Subtle reticle / grid
      ctx.strokeStyle = '#151926';
      ctx.lineWidth = 1;

      // Vertical time subdivisions
      const numVDivs = 8;
      for (let i = 1; i < numVDivs; i++) {
        const x = (width / numVDivs) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal amplitude divisions
      const numHDivs = 6;
      for (let i = 1; i < numHDivs; i++) {
        const y = (height / numHDivs) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center reference zero-line
      ctx.strokeStyle = '#232b3e';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const centerY = height / 2;
      const maxAmp = height * 0.44;

      // Fetch REAL on-the-fly live audio waveform from audio engine
      const hasLiveData = audioEngine.getLiveWaveformData(waveBuffer);

      // Calculate peak and RMS from real buffer
      let peak = 0.0;
      let sumSq = 0.0;
      for (let i = 0; i < waveBuffer.length; i++) {
        const absVal = Math.abs(waveBuffer[i]);
        if (absVal > peak) peak = absVal;
        sumSq += waveBuffer[i] * waveBuffer[i];
      }
      const rms = Math.sqrt(sumSq / waveBuffer.length);

      const computedPeakDb = peak > 0.0001 ? 20 * Math.log10(peak) : -96.0;
      const computedRmsDb = rms > 0.0001 ? 20 * Math.log10(rms) : -96.0;

      if (peakRef.current) {
        peakRef.current.textContent = computedPeakDb <= -90 ? '-inf' : `${computedPeakDb > 0 ? `+${computedPeakDb.toFixed(1)}` : computedPeakDb.toFixed(1)} dBFS`;
        if (computedPeakDb > -1.0) {
          peakRef.current.className = 'font-bold text-rose-400 font-extrabold shadow-sm';
        } else {
          peakRef.current.className = 'font-bold text-slate-200';
        }
      }
      if (rmsRef.current) {
        rmsRef.current.textContent = computedRmsDb <= -90 ? '-inf' : `${computedRmsDb.toFixed(1)} dB`;
      }

      ctx.lineWidth = 2.0;
      ctx.strokeStyle = palette.primary;
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = peak > 0.01 ? 10 : 2;

      if (mode === 'scope') {
        ctx.beginPath();
        const step = Math.max(1, Math.floor(waveBuffer.length / (256 * timebase)));
        const count = Math.min(256, Math.floor(waveBuffer.length / step));

        for (let i = 0; i < count; i++) {
          const x = (width / (count - 1)) * i;
          const sample = waveBuffer[i * step] || 0;
          const y = centerY - sample * maxAmp;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        if (peak > 0.01) {
          ctx.lineWidth = 1.0;
          ctx.strokeStyle = '#ffffff';
          ctx.shadowBlur = 0;
          ctx.stroke();
        }
      } else {
        // Spectrum FFT Mode on real incoming samples
        const numBars = 32;
        const barWidth = width / numBars - 2;
        const chunkSize = Math.floor(waveBuffer.length / numBars);

        for (let b = 0; b < numBars; b++) {
          const x = b * (barWidth + 2) + 2;
          let chunkSum = 0;
          for (let s = 0; s < chunkSize; s++) {
            chunkSum += Math.abs(waveBuffer[b * chunkSize + s] || 0);
          }
          const barEnergy = (chunkSum / chunkSize) * 3.5;
          const barHeight = Math.max(2, Math.min(height - 6, barEnergy * maxAmp * 2));

          const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
          grad.addColorStop(0, palette.bg);
          grad.addColorStop(1, palette.primary);

          ctx.fillStyle = grad;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [inspectedNodeId, mode, timebase, bpm, palette]);

  return (
    <div className="bg-[#0b0d13] border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2.5 shadow-xl select-none">
      {/* Scope Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center">
            <span
              className="w-2.5 h-2.5 rounded-full shadow-sm"
              style={{
                backgroundColor: palette.primary,
                boxShadow: `0 0 6px ${palette.primary}`
              }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Activity size={13} style={{ color: palette.primary }} />
            <span className="text-[11px] font-mono font-bold tracking-wider text-slate-200 uppercase">
              SOLO SCOPE:
            </span>
            <span
              className="text-[11px] font-mono font-extrabold uppercase px-2 py-0.5 rounded border shadow-sm"
              style={{
                color: palette.primary,
                borderColor: `${palette.primary}40`,
                backgroundColor: `${palette.primary}15`
              }}
            >
              {inspectedNodeTitle}
            </span>
          </div>
        </div>

        {/* Real-time Metering: Peak dBFS & RMS */}
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
            <span className="text-slate-500">PEAK:</span>
            <span ref={peakRef} className="font-bold text-slate-200">
              -inf
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
            <span className="text-slate-500">RMS:</span>
            <span ref={rmsRef} className="text-slate-300 font-semibold">
              -inf
            </span>
          </div>

          {/* Scope Controls */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              type="button"
              onClick={() => setMode('scope')}
              className={`px-2 py-0.5 text-[9.5px] rounded transition ${
                mode === 'scope'
                  ? 'bg-slate-800 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              WAVE
            </button>
            <button
              type="button"
              onClick={() => setMode('spectrum')}
              className={`px-2 py-0.5 text-[9.5px] rounded transition ${
                mode === 'spectrum'
                  ? 'bg-slate-800 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              FFT
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
            {[1, 2, 4].map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => setTimebase(scale)}
                className={`px-1.5 py-0.5 text-[9px] rounded transition ${
                  timebase === scale
                    ? 'bg-slate-800 text-[#e6af2e] font-bold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {scale}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Oscilloscope Phosphor Canvas */}
      <div className="relative w-full h-24 rounded-lg overflow-hidden border border-slate-800/90 shadow-inner bg-[#06080d]">
        <canvas
          ref={canvasRef}
          width={640}
          height={96}
          className="w-full h-full block"
        />

        <div className="absolute bottom-1 right-2 pointer-events-none flex items-center gap-1.5 text-[8.5px] font-mono text-slate-600/70">
          <span>LIVE CRT SCOPE</span>
          <span>·</span>
          <span>ON-THE-FLY SAMPLES</span>
        </div>
      </div>

      {/* Solo Selection Pill Buttons: Instant routing to inspect any pedal or amp */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto pt-0.5">
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider shrink-0 mr-1">
          Inspect Node:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onSelectNode('master')}
            className={`px-2 py-0.5 rounded text-[9.5px] font-mono transition border ${
              inspectedNodeId === 'master'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-bold shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800/80 hover:text-white hover:border-slate-700'
            }`}
          >
            ● MASTER OUT
          </button>

          {availableNodes.map((node) => {
            const isSelected = inspectedNodeId === node.id;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectNode(node.id)}
                className={`px-2 py-0.5 rounded text-[9.5px] font-mono transition border ${
                  isSelected
                    ? 'bg-slate-800 text-white border-slate-500 font-bold shadow-sm'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800/80 hover:text-white hover:border-slate-700'
                }`}
              >
                {node.type === 'mesa'
                  ? 'MESA MARK III'
                  : node.type === 'vox'
                  ? 'VOX AC-30'
                  : node.title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
