import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Tv,
  Play,
  Pause,
  Volume2,
  Activity,
  Layers,
  Sparkles,
  Download,
  Share2,
  Cpu
} from 'lucide-react';
import { stateBridge, AudioTakeMetadata } from '../utils/stateBridge';
import { StateTelemetry, SuperColliderServerStatus } from '../types';
import { audioEngine } from './AudioEngineBridge';

export interface VisualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: StateTelemetry;
  auditionTake?: AudioTakeMetadata | null;
  initialPreset?: string;
  onOpenCaptureDispatch?: () => void;
}

export type VisualPresetType =
  | 'supercollider-lissajous'
  | 'supercollider-vector-cascade'
  | 'supercollider-spectral-waterfall'
  | 'solar-corona';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export const VisualizerModal: React.FC<VisualizerModalProps> = ({
  isOpen,
  onClose,
  telemetry,
  auditionTake = null,
  initialPreset = 'supercollider-lissajous',
  onOpenCaptureDispatch
}) => {
  const [preset, setPreset] = useState<VisualPresetType>(initialPreset as VisualPresetType);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isNativeScLaunching, setIsNativeScLaunching] = useState(false);
  const [scStatus, setScStatus] = useState<SuperColliderServerStatus | null>(telemetry.supercollider || null);

  // Audition take audio player
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const waterfallHistoryRef = useRef<Array<{ peak: number; rms: number; note: number }>>([]);

  // Sync SC status from telemetry or polling
  useEffect(() => {
    if (telemetry.supercollider) {
      setScStatus(telemetry.supercollider);
    }
  }, [telemetry.supercollider]);

  useEffect(() => {
    if (!isOpen) return;
    stateBridge.getSuperColliderStatus().then((st) => {
      if (st) setScStatus(st);
    });
  }, [isOpen]);

  // Handle native SC window launch
  const handleToggleNativeScVisual = async () => {
    setIsNativeScLaunching(true);
    try {
      if (scStatus?.visualRunning) {
        const res = await stateBridge.stopVisual();
        setScStatus(res);
      } else {
        const res = await stateBridge.openVisualWindow(preset);
        setScStatus(res);
      }
    } catch (err) {
      console.error('Failed to toggle SuperCollider visual window:', err);
    } finally {
      setIsNativeScLaunching(false);
    }
  };

  // Canvas render loop
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const waveBuffer = new Float32Array(512);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) return;

      const cx = width * 0.5;
      const cy = height * 0.5;

      // Extract real audio waveform
      audioEngine.getLiveWaveformData(waveBuffer);

      // Compute peak and RMS
      let peak = 0;
      let sumSq = 0;
      for (let i = 0; i < waveBuffer.length; i++) {
        const v = Math.abs(waveBuffer[i]);
        if (v > peak) peak = v;
        sumSq += v * v;
      }
      const liveRms = Math.sqrt(sumSq / waveBuffer.length);
      const effectiveRms = Math.max(liveRms, telemetry.sidechainRMS || 0);
      const effectivePeak = Math.max(peak, telemetry.peakDb ? Math.pow(10, telemetry.peakDb / 20) : 0);

      const bpm = telemetry.bpm || 120;
      const bpmFactor = bpm / 120;
      phaseRef.current += 0.025 * bpmFactor;
      const phase = phaseRef.current;

      // Background clearing with phosphor trail persistence
      ctx.fillStyle = preset === 'supercollider-lissajous' ? 'rgba(5, 7, 12, 0.28)' : 'rgba(4, 5, 8, 0.32)';
      ctx.fillRect(0, 0, width, height);

      // Oscilloscope Reticle
      ctx.strokeStyle = 'rgba(25, 36, 54, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(width, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
      ctx.stroke();

      // Range Circles
      const minDim = Math.min(cx, cy);
      ctx.strokeStyle = 'rgba(30, 42, 65, 0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, minDim * 0.82, 0, Math.PI * 2);
      ctx.arc(cx, cy, minDim * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      // ==========================================
      // PRESET 1: SuperCollider Lissajous Phosphor Scope
      // ==========================================
      if (preset === 'supercollider-lissajous') {
        const lastNote = telemetry.lastMidiNote || 60;
        const lastVel = telemetry.lastMidiVelocity || 0;
        const ratioX = (lastNote % 7) + 1;
        const ratioY = ((Math.floor(lastNote / 7)) % 5) + 2;

        const baseAmp = minDim * 0.8;
        const amp = Math.max(20, baseAmp * (effectiveRms * 2.2 + 0.12));
        const numPts = 320;

        // Outer amber glow beam
        ctx.strokeStyle = `rgba(230, 175, 46, ${Math.min(1, effectivePeak * 0.7 + 0.25)})`;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#e6af2e';
        ctx.shadowBlur = effectivePeak > 0.05 ? 18 : 6;

        ctx.beginPath();
        for (let i = 0; i < numPts; i++) {
          const theta = (i / numPts) * Math.PI * 2;
          const px = cx + Math.sin(theta * ratioX + phase) * amp;
          const py = cy + Math.cos(theta * ratioY + phase * 1.33) * amp;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Sharp core electron beam
        ctx.strokeStyle = '#fffbf0';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.stroke();

        // Real waveform superposition ring
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 256; i++) {
          const sample = waveBuffer[i * 2] || 0;
          const r = minDim * 0.35 + sample * minDim * 0.25;
          const th = (i / 256) * Math.PI * 2;
          const px = cx + Math.cos(th) * r;
          const py = cy + Math.sin(th) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // ==========================================
      // PRESET 2: SuperCollider Vector Cascade
      // ==========================================
      else if (preset === 'supercollider-vector-cascade') {
        // Spawn particles on energy or note triggers
        if (effectivePeak > 0.12 || telemetry.isMidiActive) {
          const count = Math.min(8, Math.floor(effectivePeak * 12) + 2);
          for (let k = 0; k < count; k++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 2;
            particlesRef.current.push({
              x: cx,
              y: cy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1.0,
              maxLife: 1.0,
              color: effectivePeak > 0.5 ? '#f43f5e' : effectivePeak > 0.25 ? '#fbbf24' : '#34d399'
            });
          }
        }

        // Center pulse ring
        const ringRadius = effectiveRms * minDim * 0.6 + 15;
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Update & render particles
        const alive: Particle[] = [];
        for (const p of particlesRef.current) {
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.02;
          if (p.life > 0) {
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            alive.push(p);
          }
        }
        particlesRef.current = alive.slice(-250);
      }

      // ==========================================
      // PRESET 3: SuperCollider Spectral Waterfall
      // ==========================================
      else if (preset === 'supercollider-spectral-waterfall') {
        const hist = waterfallHistoryRef.current;
        hist.unshift({
          peak: effectivePeak,
          rms: effectiveRms,
          note: telemetry.lastMidiNote || 60
        });
        if (hist.length > 50) hist.pop();

        for (let idx = 0; idx < hist.length; idx++) {
          const frame = hist[idx];
          const y = (idx / 50) * height;
          const alpha = 1.0 - idx / 50;
          const barW = Math.min(width * 0.95, frame.peak * width * 1.2 + 20);
          const barX = (width - barW) * 0.5;

          ctx.fillStyle = `rgba(${Math.floor(180 + 75 * alpha)}, ${Math.floor(80 * alpha)}, ${Math.floor(250 * alpha)}, ${alpha * 0.75})`;
          ctx.fillRect(barX, y, barW, height / 50 + 1);
        }
      }

      // ==========================================
      // PRESET 4: Solar Flare Warp
      // ==========================================
      else {
        const spikes = 64;
        const radius = minDim * 0.45;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        for (let i = 0; i <= spikes; i++) {
          const theta = (i / spikes) * Math.PI * 2;
          const sample = waveBuffer[i * 4] || 0;
          const r = radius + sample * minDim * 0.4 + Math.sin(theta * 6 + phase * 2) * (effectiveRms * 30);
          const px = cx + Math.cos(theta) * r;
          const py = cy + Math.sin(theta) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, preset, telemetry]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/85 backdrop-blur-md flex flex-col justify-between z-50 transition-all font-mono select-none ${
        isFullScreen ? 'p-0' : 'p-4 sm:p-6'
      }`}
    >
      <div
        className={`bg-[#080b12] border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-2xl flex-1 ${
          isFullScreen ? 'rounded-none border-none h-full' : 'max-h-full'
        }`}
      >
        {/* Top Control Bar */}
        <div className="bg-[#0e121d] border-b border-slate-800/90 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#e6af2e]/15 border border-[#e6af2e]/40 flex items-center justify-center text-[#e6af2e]">
              <Tv size={15} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-extrabold text-xs tracking-wider">
                  REAL-TIME SUPERCOLLIDER VISUALIZER
                </span>
                <span
                  className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                    scStatus?.isRunning
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      scStatus?.isRunning ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-slate-600'
                    }`}
                  />
                  <span>
                    SC {scStatus?.isRunning ? `RUNNING (UDP ${scStatus.port})` : 'ENGINE STANDBY'}
                  </span>
                </span>
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-2">
                <span>Native macOS sclang Bridge & HTML5 Vector Phosphor Scope</span>
                {scStatus?.visualRunning && (
                  <span className="text-amber-400 font-bold">· Native Pop-up Window Active</span>
                )}
              </div>
            </div>
          </div>

          {/* Center: Preset Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setPreset('supercollider-lissajous')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
                preset === 'supercollider-lissajous'
                  ? 'bg-[#e6af2e] text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity size={12} />
              <span>Lissajous Scope</span>
            </button>
            <button
              type="button"
              onClick={() => setPreset('supercollider-vector-cascade')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
                preset === 'supercollider-vector-cascade'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles size={12} />
              <span>Vector Cascade</span>
            </button>
            <button
              type="button"
              onClick={() => setPreset('supercollider-spectral-waterfall')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
                preset === 'supercollider-spectral-waterfall'
                  ? 'bg-purple-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers size={12} />
              <span>Spectral Waterfall</span>
            </button>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Pop-up Native SuperCollider Window */}
            <button
              type="button"
              onClick={handleToggleNativeScVisual}
              disabled={isNativeScLaunching}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border shadow-sm ${
                scStatus?.visualRunning
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30'
                  : 'bg-[#e6af2e]/20 text-[#e6af2e] border-[#e6af2e]/60 hover:bg-[#e6af2e]/30'
              }`}
              title="Pop up / close native SuperCollider macOS GUI Window"
            >
              <Tv size={13} className={scStatus?.visualRunning ? 'animate-pulse text-rose-400' : 'text-[#e6af2e]'} />
              <span>
                {isNativeScLaunching
                  ? 'Launching...'
                  : scStatus?.visualRunning
                  ? 'Close Native SC Window'
                  : 'Pop Up Native SC Window'}
              </span>
            </button>

            {onOpenCaptureDispatch && (
              <button
                type="button"
                onClick={onOpenCaptureDispatch}
                className="px-3 py-1.5 rounded-lg bg-[#e6af2e] hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                title="Ship take and bundled visuals to johnwalls.studio"
              >
                <Share2 size={13} />
                <span>Bundle & Publish</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
            >
              {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-800"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Canvas Display Viewport */}
        <div className="relative flex-1 bg-[#040508] overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full object-contain"
          />

          {/* Live Telemetry HUD Overlay */}
          <div className="absolute top-4 left-4 pointer-events-none space-y-1 text-xs text-slate-400 font-mono">
            <div className="text-[#e6af2e] font-bold text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#e6af2e] animate-ping" />
              <span>LIVE ABLETON AUDIO OSCILLOSCOPE & VECTOR SCOPE</span>
            </div>
            <div>
              TEMPO: <span className="text-white font-bold">{telemetry.bpm?.toFixed(1) || '120.0'} BPM</span> ·
              BAR: <span className="text-amber-400 font-bold">{telemetry.barNumber || 1}</span> ·
              PPQ: <span className="text-cyan-400 font-bold">{telemetry.ppqPosition ? telemetry.ppqPosition.toFixed(2) : '0.00'}</span>
            </div>
            <div>
              RMS: <span className="text-emerald-400 font-bold">{telemetry.rmsDb ? `${telemetry.rmsDb.toFixed(1)} dB` : '-∞'}</span> ·
              PEAK: <span className="text-rose-400 font-bold">{telemetry.peakDb ? `${telemetry.peakDb.toFixed(1)} dB` : '-∞'}</span> ·
              NOTE: <span className="text-purple-300 font-bold">{telemetry.lastMidiNote ? `MIDI ${telemetry.lastMidiNote}` : '—'}</span>
            </div>
            <div>
              STATE: <span className="text-pink-400 font-bold">{telemetry.musicalState || 'IDLE'}</span>
            </div>
          </div>

          {/* Audition Bar (if auditioning a take) */}
          {auditionTake && (
            <div className="absolute bottom-4 left-4 right-4 bg-[#0a0d16]/90 border border-slate-800 backdrop-blur-md rounded-lg p-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (audioRef.current) {
                      if (isPlayingAudio) audioRef.current.pause();
                      else audioRef.current.play().catch(() => {});
                      setIsPlayingAudio(!isPlayingAudio);
                    }
                  }}
                  className="w-8 h-8 rounded-full bg-[#e6af2e] hover:bg-amber-400 text-black flex items-center justify-center font-bold"
                >
                  {isPlayingAudio ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>
                <div>
                  <div className="text-xs font-bold text-white">
                    AUDITIONING TAKE: {auditionTake.fileName}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {auditionTake.bpm} BPM · {auditionTake.sampleRate}Hz · 24-bit PCM
                  </div>
                </div>
              </div>
              <audio
                ref={audioRef}
                src={stateBridge.getAudioTakeUrl(auditionTake.takeId)}
                onPlay={() => setIsPlayingAudio(true)}
                onPause={() => setIsPlayingAudio(false)}
                onEnded={() => setIsPlayingAudio(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
