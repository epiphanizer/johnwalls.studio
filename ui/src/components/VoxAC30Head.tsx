import React from 'react';
import { Power, X, Disc, Eye, Sparkles, Bookmark } from 'lucide-react';
import { AudioKnob } from './AudioKnob';
import { PedalInstance } from '../types';

interface VoxAC30HeadProps {
  amp: PedalInstance;
  onUpdateParam: (ampId: string, paramName: string, value: number) => void;
  onToggleBypass: (ampId: string) => void;
  onRemove: (ampId: string) => void;
  onInspect?: (ampId: string) => void;
  isInspected?: boolean;
  onSaveToLibrary?: (amp: PedalInstance) => void;
}

export const VoxAC30Head: React.FC<VoxAC30HeadProps> = ({
  amp,
  onUpdateParam,
  onToggleBypass,
  onRemove,
  onInspect,
  isInspected = false,
  onSaveToLibrary
}) => {
  const isModulating = (amp.activeModulationDepth ?? 0) > 0.1;
  const channel = Math.round(amp.parameters.channel?.value ?? 1); // 0 = Normal, 1 = Top Boost
  const isBrilliant = (amp.parameters.brilliant?.value ?? 0) > 0.5;

  // Chicken-head knob renderer with authentic rotary dragging
  const renderChickenHead = (
    key: string,
    label: string,
    sub?: string,
    minVal: number = 0,
    maxVal: number = 10,
    stepVal: number = 0.1
  ) => {
    const param = amp.parameters[key] || {
      value: key.includes('master') ? 7.0 : key.includes('cut') ? 3.5 : 6.0,
      min: minVal,
      max: maxVal,
      step: stepVal
    };

    return (
      <AudioKnob
        key={key}
        label={label}
        sub={sub}
        value={param.value}
        min={minVal}
        max={maxVal}
        step={stepVal}
        color="amber"
        variant="chicken-head"
        size={42}
        isModulating={isModulating}
        onChange={(val) => onUpdateParam(amp.id, key, val)}
      />
    );
  };

  return (
    <div
      className={`relative w-full max-w-3xl rounded-xl border border-amber-900/60 bg-[#0f0e0c] shadow-2xl flex flex-col justify-between overflow-hidden transition-all duration-200 select-none ${
        amp.bypassed ? 'border-slate-800' : 'border-amber-700/60 ring-1 ring-amber-500/20'
      }`}
    >
      {/* Top Header Strip with Brass Highlights */}
      <div className="h-8 bg-[#171412] border-b border-amber-950/80 px-3 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-600 shadow-sm" />
          <span className="text-[10px] font-serif font-bold text-amber-300/90 tracking-widest uppercase">
            VOX · TOP BOOST AMPLIFIER · DARTFORD KENT
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Save Preset to Library */}
          {onSaveToLibrary && (
            <button
              type="button"
              onClick={() => onSaveToLibrary(amp)}
              className="px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold transition border bg-[#1e0a0d] text-amber-400/80 border-amber-900/60 hover:text-amber-200 hover:border-amber-700"
              title="Save Vox dialed settings to Library"
            >
              <Bookmark size={11} />
              <span>SAVE</span>
            </button>
          )}

          {onInspect && (
            <button
              type="button"
              onClick={() => onInspect(amp.id)}
              className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold transition border ${
                isInspected
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/60 shadow-sm'
                  : 'bg-[#1e0a0d] text-amber-400/70 border-amber-900/60 hover:text-amber-200'
              }`}
              title="Solo & Inspect Real-time Waveform"
            >
              <Eye size={11} className={isInspected ? 'text-amber-400' : 'text-amber-600'} />
              <span>{isInspected ? 'INSPECTING' : 'SOLO SCOPE'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onRemove(amp.id)}
            className="text-amber-600 hover:text-amber-300 p-1 rounded hover:bg-amber-950/60 transition"
            title="Remove Vox Head from Rack"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main Oxblood/Burgundy Enamel Chassis */}
      <div className="relative p-3.5 bg-gradient-to-b from-[#4a141d] via-[#350c13] to-[#20060b]">
        {/* Top Chassis Banner: Gold Emblem, Mode Pill, Pilot Light & Mains Power Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 pb-3">
          <div className="flex items-center gap-3">
            <div className="px-3.5 py-1 rounded bg-[#1c0508] border border-amber-400/70 shadow flex items-center gap-2">
              <span className="font-serif font-black text-xl tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 uppercase">
                VOX
              </span>
              <span className="text-[9.5px] font-serif font-bold text-amber-200 tracking-wider border-l border-amber-500/50 pl-2">
                AC-30 TOP BOOST
              </span>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-[8.5px] font-serif font-bold tracking-widest text-amber-200/90 uppercase">
                CLASS A ALL-TUBE TWIN 30W
              </span>
              <span className="text-[7.5px] font-mono text-amber-400/70">
                EL84 POWER SECTION WITH TONE CUT & CHIME
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Indicator */}
            <div className="flex items-center gap-1.5 bg-[#170407] px-2.5 py-1 rounded border border-amber-900/80">
              <span className="text-[8px] font-mono text-amber-400 font-bold uppercase">MODE:</span>
              <span className="text-[9px] font-serif font-bold text-amber-200">
                {channel === 0 ? 'NORMAL CHANNEL' : 'TOP BOOST'}
              </span>
            </div>

            {/* Amber Pilot Light */}
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 border border-amber-800 shadow flex items-center justify-center p-0.5">
                <div
                  className={`w-4 h-4 rounded-full transition-all duration-300 ${
                    amp.bypassed
                      ? 'bg-[#291404] border border-amber-950'
                      : 'bg-gradient-to-br from-amber-300 via-amber-500 to-amber-900 shadow-[0_0_15px_#f59e0b,inset_0_0_4px_#fff]'
                  }`}
                />
              </div>
              <span className="text-[7px] font-mono text-amber-300 font-bold mt-0.5">MAINS</span>
            </div>

            {/* Power / Standby Switch (ABLETON & DSP BYPASS) */}
            <button
              type="button"
              onClick={() => onToggleBypass(amp.id)}
              className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-serif text-xs font-bold transition shadow-lg ${
                amp.bypassed
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-700'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30'
              }`}
              title="Click to toggle Vox Standby / Power (Turns off Vox processing in Ableton Live)"
            >
              <Power size={13} className={amp.bypassed ? 'text-slate-500' : 'text-slate-950 font-black'} />
              <span>{amp.bypassed ? 'STANDBY (OFF)' : 'POWER: ENGAGED'}</span>
            </button>
          </div>
        </div>

        {/* If Amp is Bypassed/Standby: Show Standby Bar */}
        {amp.bypassed && (
          <div className="my-2.5 px-3 py-2 rounded-lg bg-amber-950/20 border border-amber-900/40 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-amber-200 font-bold">
                VOX AC-30 IS CURRENTLY IN STANDBY / BYPASS
              </span>
              <span className="text-amber-500/70 text-[10px]">
                (Audio passes through clean uncolored; DSP disengaged in Ableton)
              </span>
            </div>
            <button
              type="button"
              onClick={() => onToggleBypass(amp.id)}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10.5px] transition shadow font-serif"
            >
              CLICK TO ENGAGE VOX
            </button>
          </div>
        )}

        {/* Authentic Gold Frame Sections: Normal vs Top Boost vs Power Amp */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-3">
          {/* Section 1: Normal Channel */}
          <div className="border border-amber-500/40 rounded-lg p-2.5 bg-[#25080e]/60 flex flex-col justify-between">
            <div className="flex items-center justify-between w-full border-b border-amber-500/30 pb-1 mb-2">
              <span className="text-[9.5px] font-serif font-black tracking-widest text-amber-300 uppercase">
                NORMAL CHANNEL
              </span>
              <div className="flex items-center gap-1.5">
                {/* Brilliant Switch */}
                <button
                  type="button"
                  onClick={() => onUpdateParam(amp.id, 'brilliant', isBrilliant ? 0 : 1)}
                  className={`text-[8px] font-mono px-1.5 py-0.5 rounded border transition ${
                    isBrilliant
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-300'
                      : 'text-amber-500/70 border-amber-900/50 hover:text-amber-300'
                  }`}
                  title="Toggle Normal Channel Brilliant High-End Boost"
                >
                  {isBrilliant ? 'BRILLIANT ON' : 'BRILLIANT'}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateParam(amp.id, 'channel', 0)}
                  className={`text-[9px] font-serif px-2 py-0.5 rounded transition ${
                    channel === 0
                      ? 'bg-amber-400 text-slate-950 font-black shadow-sm'
                      : 'text-amber-400/80 hover:text-amber-200'
                  }`}
                >
                  {channel === 0 ? '● ACTIVE' : 'SELECT'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-around w-full">
              {renderChickenHead('gain', 'VOLUME', 'NORMAL')}
            </div>
          </div>

          {/* Section 2: Top Boost Channel */}
          <div className="border border-amber-500/40 rounded-lg p-2.5 bg-[#25080e]/60 flex flex-col justify-between">
            <div className="flex items-center justify-between w-full border-b border-amber-500/30 pb-1 mb-2">
              <span className="text-[9.5px] font-serif font-black tracking-widest text-amber-300 uppercase">
                TOP BOOST CHANNEL
              </span>
              <button
                type="button"
                onClick={() => onUpdateParam(amp.id, 'channel', 1)}
                className={`text-[9px] font-serif px-2 py-0.5 rounded transition ${
                  channel === 1
                    ? 'bg-amber-400 text-slate-950 font-black shadow-sm'
                    : 'text-amber-400/80 hover:text-amber-200'
                }`}
              >
                {channel === 1 ? '● ACTIVE' : 'SELECT'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full">
              {renderChickenHead('treble', 'TREBLE', 'CHIME')}
              {renderChickenHead('bass', 'BASS', 'BODY')}
            </div>
          </div>

          {/* Section 3: Master & Tone Cut Power Section */}
          <div className="border border-amber-500/40 rounded-lg p-2.5 bg-[#25080e]/60 flex flex-col justify-between">
            <div className="flex items-center justify-between w-full border-b border-amber-500/30 pb-1 mb-2">
              <span className="text-[9.5px] font-serif font-black tracking-widest text-amber-300 uppercase">
                POWER SECTION
              </span>
              <span className="text-[7.5px] font-mono text-amber-400/80">EL84 CLASS A</span>
            </div>

            <div className="grid grid-cols-3 gap-1 w-full">
              {renderChickenHead('cut', 'TONE CUT', 'REV CUT')}
              {renderChickenHead('chime', 'CHIME', 'HARMONIC')}
              {renderChickenHead('master', 'MASTER', 'OUTPUT')}
            </div>
          </div>
        </div>

        {/* Lower Speaker Cabinet Stage */}
        <div className="border-t border-amber-500/40 pt-2 mt-2 flex items-center justify-between text-xs font-mono text-amber-300">
          <div className="flex items-center gap-2">
            <Disc size={13} className="text-amber-400" />
            <span className="text-[10px]">Cabinet Simulation:</span>
            <span className="text-amber-200 font-serif font-bold text-[10px]">
              Celestion Alnico Blue 2x12 Open-Back
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateParam(amp.id, 'cab', (amp.parameters.cab?.value ?? 1) > 0.5 ? 0 : 1)
            }
            className={`px-2.5 py-0.5 rounded text-[10px] font-serif font-bold border transition ${
              (amp.parameters.cab?.value ?? 1) > 0.5
                ? 'bg-amber-400/20 text-amber-200 border-amber-400/60 shadow-sm'
                : 'bg-transparent text-amber-700/60 border-amber-900/60 line-through'
            }`}
          >
            {(amp.parameters.cab?.value ?? 1) > 0.5 ? '2x12 CAB ENGAGED' : 'CAB BYPASS'}
          </button>
        </div>
      </div>
    </div>
  );
};
