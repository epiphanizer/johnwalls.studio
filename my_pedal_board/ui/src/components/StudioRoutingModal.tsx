import React from 'react';
import {
  X,
  GitBranch,
  Sliders,
  Disc,
  Activity,
  ArrowRight,
  Power,
  ChevronLeft,
  ChevronRight,
  Zap,
  Volume2,
  Check,
  Layers,
  Sparkles,
  ArrowDownRight,
  Radio
} from 'lucide-react';
import { StudioModule, StudioModuleType, StudioPedalBoardModule } from '../types';
import { StudioWorkspace } from './StudioWorkspaceModal';

interface StudioRoutingModalProps {
  isOpen: boolean;
  onClose: () => void;
  modules: StudioModule[];
  activeModuleId: string;
  onSelectModule: (id: string) => void;
  onMoveModule: (fromIndex: number, toIndex: number) => void;
  onToggleModuleBypass: (id: string) => void;
  ampPlacement: 'outbound' | 'inbound';
  onToggleAmpPlacement: () => void;
  onApplyRoutingPreset?: (presetId: string) => void;
  bpm?: number;
  barNumber?: number;
  isPlaying?: boolean;
}

export const StudioRoutingModal: React.FC<StudioRoutingModalProps> = ({
  isOpen,
  onClose,
  modules,
  activeModuleId,
  onSelectModule,
  onMoveModule,
  onToggleModuleBypass,
  ampPlacement,
  onToggleAmpPlacement,
  onApplyRoutingPreset,
  bpm = 124,
  barNumber = 1,
  isPlaying = false
}) => {
  if (!isOpen) return null;

  const sp404Index = modules.findIndex((m) => m.type === 'sp404');
  const boardIndex = modules.findIndex((m) => m.type === 'pedal_board');
  const sp404Order = sp404Index !== -1 && boardIndex !== -1 && sp404Index < boardIndex ? 'before' : 'after';

  const handleSelectAndClose = (id: string) => {
    onSelectModule(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none font-mono">
      <div className="relative w-full max-w-5xl bg-[#0e1017] border-2 border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col max-h-[92vh] overflow-hidden text-slate-200 animate-fade-in">
        {/* 1. Modal Header Bar */}
        <div className="px-6 py-4 bg-[#121622] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <GitBranch size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-white tracking-widest uppercase">
                  STUDIO SIGNAL FLOW & ROUTING MATRIX
                </h2>
                <span className="text-[9.5px] px-2 py-0.5 rounded font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  UNIVERSAL SIGNAL GRAPH
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                DAW Project Multi-Bus ➔ Modular Pipeline Sequence ➔ Master Stereo Output
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Transport HUD */}
            <div className="hidden sm:flex items-center gap-2 bg-[#090b10] px-3 py-1 rounded-lg border border-slate-800 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                }`}
              />
              <span className="text-slate-400 font-bold">{bpm.toFixed(1)} BPM</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">BAR {barNumber}</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700"
              title="Close Routing Matrix"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 2. Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SECTION 1: VISUAL SIGNAL FLOW GRAPH */}
          <div className="p-5 bg-[#121622] border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers size={15} className="text-cyan-400" />
                Live Modular Pipeline Sequence
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Click any module to jump directly to its workspace
              </span>
            </div>

            {/* Interactive Node Ribbon */}
            <div className="flex flex-wrap items-center gap-3 p-4 bg-[#090b10] rounded-xl border border-slate-800/90 overflow-x-auto">
              {/* Input Node */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#141824] border border-cyan-500/40 text-cyan-300 font-bold text-xs shrink-0 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-500 uppercase">SIGNAL IN</span>
                  <span className="text-white text-xs font-black">LIVE DAW BUS</span>
                </div>
              </div>

              <ArrowRight size={16} className="text-slate-600 shrink-0" />

              {/* Dynamic Module Chain */}
              {modules.map((mod, idx) => {
                const isActive = mod.id === activeModuleId;
                const isSp404 = mod.type === 'sp404';
                const isState = mod.type === 'state';

                return (
                  <React.Fragment key={mod.id}>
                    <div
                      onClick={() => handleSelectAndClose(mod.id)}
                      className={`group relative p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between min-w-[210px] max-w-[240px] shrink-0 ${
                        isActive
                          ? isSp404
                            ? 'bg-[#ff5500]/15 border-[#ff5500] shadow-[0_0_20px_rgba(255,85,0,0.3)] text-white'
                            : isState
                            ? 'bg-purple-500/15 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.3)] text-white'
                            : 'bg-emerald-500/15 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] text-white'
                          : mod.bypassed
                          ? 'bg-[#10131d]/60 border-slate-800 text-slate-500 hover:border-slate-700'
                          : 'bg-[#141824] border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
                      }`}
                    >
                      {/* Top Bar: Sequence Number & Bypass Switch */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-slate-400">
                          STAGE #{idx + 1}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleModuleBypass(mod.id);
                            }}
                            className={`p-1 rounded transition ${
                              mod.bypassed
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            }`}
                            title={mod.bypassed ? 'Module Bypassed' : 'Module Active'}
                          >
                            <Power size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Title & Icon */}
                      <div className="flex items-center gap-2 my-1">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            isSp404
                              ? 'bg-[#ff5500]/20 text-[#ff8844]'
                              : isState
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {isSp404 ? (
                            <Disc size={15} />
                          ) : isState ? (
                            <Activity size={15} />
                          ) : (
                            <Sliders size={15} />
                          )}
                        </div>
                        <div>
                          <div className="font-black text-white text-xs truncate max-w-[150px]">
                            {mod.title}
                          </div>
                          <span className="text-[9px] uppercase font-bold text-slate-500">
                            {mod.type.toUpperCase().replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Module Quick Spec */}
                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[9.5px] text-slate-400">
                        {isSp404 ? (
                          <span>160 Samples · Bank A-J</span>
                        ) : isState ? (
                          <span>Telemetry & SC Bridge</span>
                        ) : (
                          <span>
                            {(mod as StudioPedalBoardModule).pedals?.length || 0} Units · {ampPlacement.toUpperCase()}
                          </span>
                        )}

                        <span className="text-cyan-400 font-bold group-hover:underline">
                          FOCUS ➔
                        </span>
                      </div>

                      {/* Reorder Buttons */}
                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (idx > 0) onMoveModule(idx, idx - 1);
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-20 text-[10px] text-slate-300 font-bold flex items-center gap-1 transition"
                        >
                          <ChevronLeft size={11} />
                          <span>Earlier</span>
                        </button>

                        <button
                          type="button"
                          disabled={idx === modules.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (idx < modules.length - 1) onMoveModule(idx, idx + 1);
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-20 text-[10px] text-slate-300 font-bold flex items-center gap-1 transition"
                        >
                          <span>Later</span>
                          <ChevronRight size={11} />
                        </button>
                      </div>
                    </div>

                    {idx < modules.length - 1 && (
                      <ArrowRight size={16} className="text-slate-600 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}

              <ArrowRight size={16} className="text-slate-600 shrink-0" />

              {/* Master Output Node */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#141824] border border-emerald-500/40 text-emerald-300 font-bold text-xs shrink-0 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-500 uppercase">OUTPUT BUS</span>
                  <span className="text-white text-xs font-black">MASTER STEREO</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: HARDWARE MODULE CONFIGURATION & STAGING */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Pedal Board Amplifier Placement Stage */}
            <div className="p-5 bg-[#121622] border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={14} className="text-cyan-400" />
                  Pedal Board Amp Stage Placement
                </span>
                <span className="text-[9.5px] px-2 py-0.5 rounded font-black bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  CURRENT: {ampPlacement.toUpperCase()}
                </span>
              </div>

              <div className="space-y-3">
                {/* Option 1: Outbound (Post-Effects) */}
                <div
                  onClick={() => {
                    if (ampPlacement !== 'outbound') onToggleAmpPlacement();
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    ampPlacement === 'outbound'
                      ? 'bg-cyan-500/15 border-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                      : 'bg-[#090b10] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-xs text-white">
                      1. OUTBOUND (Post-Effects Amp Stage)
                    </span>
                    {ampPlacement === 'outbound' && (
                      <span className="w-4 h-4 rounded-full bg-cyan-400 text-slate-950 font-black flex items-center justify-center text-[10px]">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Pedals In ➔ Stompboxes (Delays, Filters, Overdrive, Ducker) ➔ Tube Amp & Speaker Cabinet ➔ Out.
                  </p>
                  <span className="inline-block mt-2 text-[9px] text-cyan-400 font-bold bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                    Recommended for classic guitar & synthesizer pedalboards
                  </span>
                </div>

                {/* Option 2: Inbound (Pre-Effects) */}
                <div
                  onClick={() => {
                    if (ampPlacement !== 'inbound') onToggleAmpPlacement();
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    ampPlacement === 'inbound'
                      ? 'bg-cyan-500/15 border-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                      : 'bg-[#090b10] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-xs text-white">
                      2. INBOUND (Pre-Effects Amp Stage)
                    </span>
                    {ampPlacement === 'inbound' && (
                      <span className="w-4 h-4 rounded-full bg-cyan-400 text-slate-950 font-black flex items-center justify-center text-[10px]">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Pedals In ➔ Tube Amp & Speaker Cabinet ➔ Stompboxes (Delays, Filters, Overdrive, Ducker) ➔ Out.
                  </p>
                  <span className="inline-block mt-2 text-[9px] text-amber-400 font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                    FX-Loop Style: Tube saturation occurs before time-based delays & modulations
                  </span>
                </div>
              </div>
            </div>

            {/* Right: SP-404 MKII Signal Bus Routing */}
            <div className="p-5 bg-[#121622] border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Disc size={14} className="text-[#ff5500]" />
                  SP-404 MKII Signal Bus Routing
                </span>
                <span className="text-[9.5px] px-2 py-0.5 rounded font-black bg-[#ff5500]/20 text-[#ff8844] border border-[#ff5500]/40">
                  {sp404Order === 'before' ? 'PRE-EFFECTS LOOP' : 'POST-EFFECTS / DIRECT'}
                </span>
              </div>

              <div className="space-y-3">
                {/* Mode A: SP-404 Before Pedal Board */}
                <div
                  onClick={() => {
                    if (sp404Index !== -1 && boardIndex !== -1 && sp404Index > boardIndex) {
                      onMoveModule(sp404Index, boardIndex);
                    }
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    sp404Order === 'before'
                      ? 'bg-[#ff5500]/15 border-[#ff5500] text-white shadow-[0_0_12px_rgba(255,85,0,0.2)]'
                      : 'bg-[#090b10] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-xs text-white">
                      Route SP-404 Through Pedal Board
                    </span>
                    {sp404Order === 'before' && (
                      <span className="w-4 h-4 rounded-full bg-[#ff5500] text-black font-black flex items-center justify-center text-[10px]">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Sampler pads play directly into the pedal board input. Samples are processed through distortion, resonant filter sweeps, tape echo, and amplifier cabinet modeling.
                  </p>
                </div>

                {/* Mode B: SP-404 After Pedal Board (Direct to Master) */}
                <div
                  onClick={() => {
                    if (sp404Index !== -1 && boardIndex !== -1 && sp404Index < boardIndex) {
                      onMoveModule(sp404Index, boardIndex);
                    }
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    sp404Order === 'after'
                      ? 'bg-[#ff5500]/15 border-[#ff5500] text-white shadow-[0_0_12px_rgba(255,85,0,0.2)]'
                      : 'bg-[#090b10] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-xs text-white">
                      Route SP-404 Clean to Master Bus
                    </span>
                    {sp404Order === 'after' && (
                      <span className="w-4 h-4 rounded-full bg-[#ff5500] text-black font-black flex items-center justify-center text-[10px]">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Clean sampler playback directly to the stereo master bus. The pedal board independently processes live audio without coloring sampler chops.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: 1-CLICK STUDIO ROUTING PRESETS */}
          <div className="p-5 bg-[#121622] border border-slate-800 rounded-xl space-y-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider block">
              1-Click Studio Routing Templates
            </span>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  if (sp404Index > boardIndex && sp404Index !== -1 && boardIndex !== -1) {
                    onMoveModule(sp404Index, boardIndex);
                  }
                  if (ampPlacement !== 'outbound') onToggleAmpPlacement();
                }}
                className="p-3 rounded-lg bg-[#090b10] border border-slate-800 hover:border-cyan-500/50 text-left transition space-y-1 group"
              >
                <div className="font-black text-white group-hover:text-cyan-300">
                  1. Classic Linear
                </div>
                <div className="text-[10px] text-slate-500">
                  SP-404 ➔ Stompboxes ➔ Outbound Amp ➔ Master
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (sp404Index > boardIndex && sp404Index !== -1 && boardIndex !== -1) {
                    onMoveModule(sp404Index, boardIndex);
                  }
                  if (ampPlacement !== 'inbound') onToggleAmpPlacement();
                }}
                className="p-3 rounded-lg bg-[#090b10] border border-slate-800 hover:border-cyan-500/50 text-left transition space-y-1 group"
              >
                <div className="font-black text-white group-hover:text-cyan-300">
                  2. Preamp Loop Rig
                </div>
                <div className="text-[10px] text-slate-500">
                  SP-404 ➔ Inbound Amp ➔ Stompboxes ➔ Master
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (sp404Index < boardIndex && sp404Index !== -1 && boardIndex !== -1) {
                    onMoveModule(sp404Index, boardIndex);
                  }
                }}
                className="p-3 rounded-lg bg-[#090b10] border border-slate-800 hover:border-cyan-500/50 text-left transition space-y-1 group"
              >
                <div className="font-black text-white group-hover:text-cyan-300">
                  3. Clean Sampler
                </div>
                <div className="text-[10px] text-slate-500">
                  Pedal Board ➔ SP-404 Clean Output ➔ Master
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  modules.forEach((m) => {
                    if (!m.bypassed) onToggleModuleBypass(m.id);
                  });
                }}
                className="p-3 rounded-lg bg-[#090b10] border border-slate-800 hover:border-cyan-500/50 text-left transition space-y-1 group"
              >
                <div className="font-black text-white group-hover:text-cyan-300">
                  4. Direct Dry Pass
                </div>
                <div className="text-[10px] text-slate-500">
                  Bypass All Modules (100% Bit-Identical Dry)
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Modal Footer Bar */}
        <div className="px-6 py-3.5 bg-[#121622] border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10.5px] text-slate-400">
            Signal chain updates are applied in real-time with sample-accurate phase alignment.
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition shadow-lg shadow-cyan-500/20"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
