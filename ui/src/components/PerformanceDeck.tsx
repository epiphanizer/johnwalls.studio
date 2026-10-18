import React, { useState, useEffect } from 'react';
import { Play, Square, Disc, Sliders, Volume2, Power, Eye, Sparkles, Scissors, RotateCcw, Radio } from 'lucide-react';
import { PedalInstance, StateTelemetry } from '../types';
import { WaveformVisualizer } from './WaveformVisualizer';
import { AudioKnob } from './AudioKnob';
import { sp404AudioEngine, BankLetter, SP404Pad } from './SP404AudioEngine';
import { rc600AudioEngine, RC600Track } from './RC600AudioEngine';

interface PerformanceDeckProps {
  pedals: PedalInstance[];
  onUpdateParam: (pedalId: string, paramName: string, value: number) => void;
  onToggleBypass: (pedalId: string) => void;
  inspectedNodeId: string;
  onSelectInspectNode: (nodeId: string) => void;
  bpm: number;
  telemetry: StateTelemetry;
  onOpenFullSP404: () => void;
  onOpenFullPedals: () => void;
  onOpenRC600?: () => void;
  onOpenSkipBack?: () => void;
  onOpenAutoChop?: (buffer: AudioBuffer) => void;
}

const BANKS: BankLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const PerformanceDeck: React.FC<PerformanceDeckProps> = React.memo(({
  pedals,
  onUpdateParam,
  onToggleBypass,
  inspectedNodeId,
  onSelectInspectNode,
  bpm,
  telemetry,
  onOpenFullSP404,
  onOpenFullPedals,
  onOpenRC600,
  onOpenSkipBack,
  onOpenAutoChop
}) => {
  const [activeBank, setActiveBank] = useState<BankLetter>('A');
  const [isHoldMode, setIsHoldMode] = useState<boolean>(() => sp404AudioEngine.getIsHoldMode());
  const [masterVolume, setMasterVolume] = useState<number>(() => {
    const mg = sp404AudioEngine.getMasterGain();
    return mg ? mg.gain.value * 10 : 8.5;
  });
  const [pads, setPads] = useState<SP404Pad[]>(() => sp404AudioEngine.getBank('A'));
  const [activePadHit, setActivePadHit] = useState<number | null>(null);
  const [rc600Tracks, setRc600Tracks] = useState<RC600Track[]>(() => rc600AudioEngine.getTracks());

  useEffect(() => {
    const updateRc = () => setRc600Tracks(rc600AudioEngine.getTracks());
    rc600AudioEngine.setOnStateChange(updateRc);
  }, []);

  // Re-fetch pads when bank changes or engine triggers state updates
  useEffect(() => {
    setPads(sp404AudioEngine.getBank(activeBank));
  }, [activeBank]);

  useEffect(() => {
    sp404AudioEngine.setOnStateChange(() => {
      setPads(sp404AudioEngine.getBank(activeBank));
    });
  }, [activeBank]);

  const handlePadStrike = (padId: number) => {
    setActivePadHit(padId);
    sp404AudioEngine.triggerPad(activeBank, padId, 1.0);
    setTimeout(() => {
      setActivePadHit((current) => (current === padId ? null : current));
    }, 180);
  };

  const handleToggleHold = () => {
    const nextHold = !isHoldMode;
    setIsHoldMode(nextHold);
    sp404AudioEngine.setHoldMode(nextHold);
  };

  const handleVolumeChange = (val: number) => {
    setMasterVolume(val);
    sp404AudioEngine.setVolume(val);
  };

  const [dragTargetPadId, setDragTargetPadId] = useState<number | null>(null);
  const [isDragOverScope, setIsDragOverScope] = useState<boolean>(false);

  const handleDropOnPad = async (e: React.DragEvent, padId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTargetPadId(null);

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('audio/') || /\.(wav|aif|aiff|mp3|ogg|flac)$/i.test(f.name)
    );
    if (files.length === 0) return;

    const ctx = sp404AudioEngine.getAudioContext();
    if (!ctx) return;

    if (files.length === 1) {
      try {
        const arrayBuf = await files[0].arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        sp404AudioEngine.assignBufferToPad(
          activeBank,
          padId,
          decoded,
          files[0].name.replace(/\.[^/.]+$/, '').slice(0, 14)
        );
        setPads([...sp404AudioEngine.getBank(activeBank)]);
      } catch (err) {
        console.warn('Failed to decode dropped audio file:', err);
      }
    } else {
      for (let i = 0; i < files.length; i++) {
        const targetId = padId + i;
        if (targetId > 16) break;
        try {
          const arrayBuf = await files[i].arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuf);
          sp404AudioEngine.assignBufferToPad(
            activeBank,
            targetId,
            decoded,
            files[i].name.replace(/\.[^/.]+$/, '').slice(0, 14)
          );
        } catch (err) {
          console.warn('Failed to decode dropped audio file:', err);
        }
      }
      setPads([...sp404AudioEngine.getBank(activeBank)]);
    }
  };

  const handleDropOnScope = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverScope(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ctx = sp404AudioEngine.getAudioContext();
    if (!ctx) return;

    try {
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      onOpenAutoChop?.(decoded);
    } catch (err) {
      console.warn('Failed to decode audio file for chop:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#090b10] text-slate-200 font-sans select-none">
      {/* 1. Upper Section: Live Oscilloscope & Macro Pedalboard Strip */}
      <div className="bg-[#0c0e16] border-b border-[#1e2433] p-4 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Signal Monitor & Pedalboard Macro Deck
            </h2>
            <span className="text-[11px] text-slate-500 font-mono">
              ({pedals.length} active DSP nodes)
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenFullPedals}
            className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1"
          >
            <span>Open Full Pedal Lab ➔</span>
          </button>
        </div>

        {/* Solo/Master Oscilloscope with Drag-Drop Ingestion */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOverScope(true);
          }}
          onDragLeave={() => setIsDragOverScope(false)}
          onDrop={handleDropOnScope}
          className={`rounded-xl overflow-hidden border transition relative ${
            isDragOverScope
              ? 'border-amber-400 ring-2 ring-amber-400/50 bg-amber-500/10'
              : 'border-[#222838] bg-[#07090e]'
          }`}
        >
          {isDragOverScope && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm pointer-events-none">
              <span className="text-amber-300 font-bold text-xs flex items-center gap-2">
                <Scissors size={14} /> Drop audio file to open in Auto-Chop Deck
              </span>
            </div>
          )}
          <WaveformVisualizer
            inspectedNodeId={inspectedNodeId}
            inspectedNodeTitle={inspectedNodeId === 'master' ? 'MASTER STEREO OUTPUT' : inspectedNodeId.toUpperCase()}
            inspectedNodeColor="emerald"
            onSelectNode={onSelectInspectNode}
            availableNodes={pedals.map((p) => ({
              id: p.id,
              title: p.title,
              type: p.type,
              color: p.color
            }))}
            bpm={bpm}
          />
        </div>

        {/* Horizontal Macro Pedal Strip */}
        <div className="flex items-center gap-3 overflow-x-auto py-1">
          {pedals.map((pedal) => {
            const isBypassed = pedal.bypassed;
            const paramEntries = Object.entries(pedal.parameters).slice(0, 3);

            return (
              <div
                key={pedal.id}
                className={`flex-shrink-0 w-64 rounded-xl border p-3 flex flex-col justify-between transition-all duration-150 ${
                  isBypassed
                    ? 'bg-[#11141c]/60 border-[#1e2430] opacity-60'
                    : 'bg-[#141824] border-[#293247] shadow-lg'
                }`}
              >
                {/* Header: Title, Bypass toggle */}
                <div className="flex items-center justify-between border-b border-[#23293d] pb-2 mb-2">
                  <div className="flex items-center gap-2 truncate mr-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isBypassed ? 'bg-slate-700' : 'bg-emerald-400 shadow-[0_0_6px_#10b981]'
                      }`}
                    />
                    <span className="font-bold text-xs text-white truncate">
                      {pedal.title}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleBypass(pedal.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 ${
                      isBypassed
                        ? 'bg-slate-800 text-slate-500 hover:text-slate-300'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    <Power size={10} />
                    <span>{isBypassed ? 'OFF' : 'ON'}</span>
                  </button>
                </div>

                {/* Primary Macro Knobs */}
                <div className="flex items-center justify-around py-1">
                  {paramEntries.map(([key, param]) => (
                    <AudioKnob
                      key={key}
                      label={param.label}
                      value={param.value}
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      unit={param.unit}
                      size={36}
                      variant="modern"
                      onChange={(val) => onUpdateParam(pedal.id, key, val)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Lower Section: Tactile SP-404 16-Pad Performance Surface */}
      <div className="flex-1 flex flex-col p-4 overflow-y-auto bg-[#0a0c12]">
        {/* Hardware Control Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-[#121520] p-3 rounded-xl border border-[#222838]">
          {/* Left: Roland Header & Bank Selector */}
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 rounded bg-[#ff5500] text-black font-black text-xs tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
              <Disc size={13} />
              <span>SP-404</span>
            </div>

            {/* Bank Buttons A through J */}
            <div className="flex items-center bg-[#090b10] p-0.5 rounded-lg border border-[#222838]">
              {BANKS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setActiveBank(b)}
                  className={`w-7 h-7 rounded text-xs font-bold font-mono transition ${
                    activeBank === b
                      ? 'bg-[#ff5500] text-black shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Master Volume, Hold switch, Panic Stop All, Full View Link */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#090b10] px-3 py-1.5 rounded-lg border border-[#222838]">
              <Volume2 size={13} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">VOL</span>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={masterVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-20 accent-[#ff5500] cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-white min-w-[28px]">
                {masterVolume.toFixed(1)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleToggleHold}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition border ${
                isHoldMode
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                  : 'bg-[#090b10] text-slate-400 border-[#222838] hover:text-white'
              }`}
            >
              HOLD: {isHoldMode ? 'ON' : 'OFF'}
            </button>

            {onOpenSkipBack && (
              <button
                type="button"
                onClick={onOpenSkipBack}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30 text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                title="Retrospective Skip-Back Capture (Last 25s)"
              >
                <RotateCcw size={12} className="text-amber-400" />
                <span>SKIP-BACK</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const samplePad = pads.find((p) => p.audioBuffer);
                if (samplePad && samplePad.audioBuffer) {
                  onOpenAutoChop?.(samplePad.audioBuffer);
                } else {
                  const fallback = sp404AudioEngine.getSkipBackAudioBuffer('master', 10.0);
                  if (fallback) onOpenAutoChop?.(fallback);
                }
              }}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30 text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Open Hybrid Auto-Chop Deck"
            >
              <Scissors size={12} className="text-amber-400" />
              <span>AUTO-CHOP</span>
            </button>

            <button
              type="button"
              onClick={() => sp404AudioEngine.stopAllPads()}
              className="px-3 py-1.5 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-300 hover:bg-rose-900/60 font-bold text-xs flex items-center gap-1.5 transition"
              title="Stop All Playing Voices"
            >
              <Square size={12} className="fill-rose-400" />
              <span>STOP ALL</span>
            </button>

            <button
              type="button"
              onClick={onOpenFullSP404}
              className="text-[11px] font-bold text-[#ff8844] hover:text-[#ffaa66] hover:underline flex items-center gap-1"
            >
              <span>Full SP-404 View ➔</span>
            </button>
          </div>
        </div>

        {/* Roland/Boss RC-600 Compact Looper Bar */}
        <div className="bg-[#0e111a] border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
            <span className="font-mono text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Radio size={13} className="text-rose-400" />
              <span>RC-600 LOOPER</span>
            </span>
          </div>

          {/* 6 Track Stomp Pills */}
          <div className="flex items-center gap-2 flex-1 justify-center max-w-xl">
            {rc600Tracks.map((trk) => {
              const isRec = trk.status === 'recording';
              const isDub = trk.status === 'overdubbing';
              const isPlay = trk.status === 'playing';
              return (
                <button
                  key={trk.id}
                  type="button"
                  onClick={() => {
                    rc600AudioEngine.triggerFootswitch(trk.id);
                    setRc600Tracks(rc600AudioEngine.getTracks());
                  }}
                  className={`flex-1 py-1 px-1.5 rounded-lg border text-left font-mono transition-all duration-75 flex items-center justify-between gap-1 select-none active:scale-95 ${
                    isRec
                      ? 'bg-rose-500/25 border-rose-500 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                      : isDub
                      ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                      : isPlay
                      ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                      : trk.audioBuffer
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25'
                      : 'bg-[#121520] border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                  title={`T${trk.id}: ${trk.name} (${trk.status.toUpperCase()}) - Click to Trigger`}
                >
                  <div className="truncate">
                    <span className="font-bold text-[10px] block">T{trk.id}</span>
                    <span className="text-[8.5px] truncate block opacity-75">
                      {trk.name.replace(/^Track \d+:\s*/, '').slice(0, 7)}
                    </span>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isRec
                        ? 'bg-rose-500 animate-pulse shadow-[0_0_4px_#f43f5e]'
                        : isDub
                        ? 'bg-amber-400 animate-pulse'
                        : isPlay
                        ? 'bg-emerald-400'
                        : trk.audioBuffer
                        ? 'bg-cyan-400'
                        : 'bg-slate-700'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Quick All Start / All Stop and Full View */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const anyActive = rc600Tracks.some((t) => t.status === 'playing' || t.status === 'overdubbing');
                if (anyActive) rc600AudioEngine.allStop();
                else rc600AudioEngine.allStart();
                setRc600Tracks(rc600AudioEngine.getTracks());
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-bold transition flex items-center gap-1 border border-slate-700"
            >
              {rc600Tracks.some((t) => t.status === 'playing' || t.status === 'overdubbing') ? (
                <>
                  <Square size={10} className="fill-amber-400 text-amber-400" />
                  <span>STOP</span>
                </>
              ) : (
                <>
                  <Play size={10} className="fill-emerald-400 text-emerald-400" />
                  <span>ALL START</span>
                </>
              )}
            </button>

            {onOpenRC600 && (
              <button
                type="button"
                onClick={onOpenRC600}
                className="text-[11px] font-bold text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 font-mono"
              >
                <span>Full RC-600 ➔</span>
              </button>
            )}
          </div>
        </div>

        {/* 4x4 Tactile Pad Matrix with Drag-and-Drop Ingestion */}
        <div className="flex-1 grid grid-cols-4 gap-3 max-w-4xl mx-auto w-full min-h-[300px]">
          {pads.map((pad) => {
            const isPlaying = sp404AudioEngine.isPadPlaying(activeBank, pad.id);
            const isHit = activePadHit === pad.id || isPlaying;
            const isDragTarget = dragTargetPadId === pad.id;

            return (
              <button
                key={pad.id}
                type="button"
                onClick={() => handlePadStrike(pad.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragTargetPadId(pad.id);
                }}
                onDragLeave={() => setDragTargetPadId(null)}
                onDrop={(e) => handleDropOnPad(e, pad.id)}
                className={`relative rounded-xl border p-4 flex flex-col justify-between transition-all duration-75 active:scale-95 text-left select-none group shadow-md ${
                  isDragTarget
                    ? 'ring-2 ring-amber-400 border-amber-400 bg-amber-500/25'
                    : isHit
                    ? 'bg-gradient-to-b from-[#ff8844] to-[#ff5500] border-white text-black shadow-[0_0_25px_rgba(255,85,0,0.7)]'
                    : pad.audioBuffer || pad.nativeSampleAvailable
                    ? 'bg-[#151926] border-[#293247] text-white hover:border-[#ff5500]/60 hover:bg-[#1a2030]'
                    : 'bg-[#0f121a] border-[#1d2230] text-slate-500 hover:border-slate-700'
                }`}
              >
                {/* Pad Number & Status LED */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`font-mono text-xs font-black px-1.5 py-0.5 rounded ${
                      isHit
                        ? 'bg-black text-[#ff8844]'
                        : 'bg-black/60 text-slate-400'
                    }`}
                  >
                    {activeBank}{String(pad.id).padStart(2, '0')}
                  </span>

                  <span
                    className={`w-2 h-2 rounded-full ${
                      isHit
                        ? 'bg-white shadow-[0_0_8px_#ffffff]'
                        : pad.audioBuffer || pad.nativeSampleAvailable
                        ? 'bg-[#ff5500] shadow-[0_0_6px_#ff5500]'
                        : 'bg-slate-700'
                    }`}
                  />
                </div>

                {/* Pad Sample Label & Duration */}
                <div className="mt-2">
                  <span
                    className={`text-xs font-bold block truncate tracking-wide ${
                      isHit ? 'text-black' : 'text-slate-200'
                    }`}
                  >
                    {pad.label || `Pad ${pad.id}`}
                  </span>
                  <div className="flex items-center justify-between text-[10px] font-mono mt-1 opacity-80">
                    <span className="uppercase">{pad.category}</span>
                    <span>{pad.duration > 0 ? `${pad.duration.toFixed(1)}s` : 'EMPTY'}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
