import React from 'react';
import { Power, X, Sliders, Disc, Eye, Zap, Activity, Bookmark } from 'lucide-react';
import { AudioKnob } from './AudioKnob';
import { VerticalSlider } from './VerticalSlider';
import { PedalInstance } from '../types';

interface MesaMarkHeadProps {
  amp: PedalInstance;
  onUpdateParam: (ampId: string, paramName: string, value: number) => void;
  onToggleBypass: (ampId: string) => void;
  onRemove: (ampId: string) => void;
  onInspect?: (ampId: string) => void;
  isInspected?: boolean;
  onSaveToLibrary?: (amp: PedalInstance) => void;
}

export const MesaMarkHead: React.FC<MesaMarkHeadProps> = ({
  amp,
  onUpdateParam,
  onToggleBypass,
  onRemove,
  onInspect,
  isInspected = false,
  onSaveToLibrary
}) => {
  const isModulating = (amp.activeModulationDepth ?? 0) > 0.1;
  const channel = Math.round(amp.parameters.channel?.value ?? 2); // 0 = Clean (R1), 1 = Crunch (R2), 2 = Lead
  const isEqIn = (amp.parameters.eqActive?.value ?? 1) > 0.5;
  const isSimulClass = (amp.parameters.simulClass?.value ?? 1) > 0.5; // 1 = Simul-Class 85W, 0 = Class A 30W
  const isPullBright = (amp.parameters.pullBright?.value ?? 0) > 0.5;
  const isPullShift = (amp.parameters.pullShift?.value ?? 0) > 0.5;
  const isPullDeep = (amp.parameters.pullDeep?.value ?? 0) > 0.5;

  const applyVScorePreset = () => {
    onUpdateParam(amp.id, 'eq80', 3.5);
    onUpdateParam(amp.id, 'eq240', 0.5);
    onUpdateParam(amp.id, 'eq750', -5.5);
    onUpdateParam(amp.id, 'eq2200', 2.0);
    onUpdateParam(amp.id, 'eq6600', 4.0);
    onUpdateParam(amp.id, 'eqActive', 1.0);
  };

  // Knobs configuration matching authentic Mark III front panel
  const mesaKnobs = [
    {
      key: 'gain',
      label: 'VOLUME 1',
      pullKey: 'pullBright',
      pullLabel: 'BRIGHT',
      isPulled: isPullBright,
      min: 0,
      max: 10
    },
    {
      key: 'treble',
      label: 'TREBLE',
      pullKey: 'pullShift',
      pullLabel: 'SHIFT',
      isPulled: isPullShift,
      min: 0,
      max: 10
    },
    {
      key: 'bass',
      label: 'BASS',
      pullKey: 'pullShift',
      pullLabel: '',
      isPulled: false,
      min: 0,
      max: 10
    },
    {
      key: 'mid',
      label: 'MIDDLE',
      pullKey: '',
      pullLabel: '',
      isPulled: false,
      min: 0,
      max: 10
    },
    {
      key: 'master',
      label: 'MASTER 1',
      pullKey: '',
      pullLabel: '',
      isPulled: false,
      min: 0,
      max: 10
    },
    {
      key: 'leadDrive',
      label: 'LEAD DRIVE',
      pullKey: '',
      pullLabel: '',
      isPulled: false,
      min: 0,
      max: 10
    },
    {
      key: 'leadMaster',
      label: 'LEAD MASTER',
      pullKey: 'pullDeep',
      pullLabel: 'DEEP',
      isPulled: isPullDeep,
      min: 0,
      max: 10
    },
    {
      key: 'presence',
      label: 'PRESENCE',
      pullKey: '',
      pullLabel: '',
      isPulled: false,
      min: 0,
      max: 10
    }
  ];

  const eqBands = [
    { id: 'eq80', label: '80 Hz' },
    { id: 'eq240', label: '240 Hz' },
    { id: 'eq750', label: '750 Hz' },
    { id: 'eq2200', label: '2.2 kHz' },
    { id: 'eq6600', label: '6.6 kHz' }
  ];

  return (
    <div
      className={`relative w-full max-w-3xl rounded-xl border border-slate-700/80 bg-[#090b0e] shadow-2xl flex flex-col justify-between overflow-hidden transition-all duration-200 select-none ${
        amp.bypassed ? 'border-slate-800' : 'border-rose-900/40 ring-1 ring-rose-500/20'
      }`}
    >
      {/* Top Chassis Header: Authentic Chrome/Brushed Stripe */}
      <div className="h-8 bg-[#11131a] border-b border-slate-800/80 px-3 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          {/* Chrome Corner Rivet */}
          <div className="w-2.5 h-2.5 rounded-full bg-slate-400 border border-slate-600 shadow-sm" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            MESA ENGINEERING · MARK III VACUUM TUBE HEAD
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Save Preset to Library */}
          {onSaveToLibrary && (
            <button
              type="button"
              onClick={() => onSaveToLibrary(amp)}
              className="px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold transition border bg-slate-900 text-slate-400 border-slate-700/80 hover:text-[#e6af2e] hover:border-slate-600"
              title="Save Mesa dialed settings to Library"
            >
              <Bookmark size={11} />
              <span>SAVE</span>
            </button>
          )}

          {/* Inspect / Solo Waveform Button */}
          {onInspect && (
            <button
              type="button"
              onClick={() => onInspect(amp.id)}
              className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold transition border ${
                isInspected
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-700/80 hover:text-white'
              }`}
              title="Solo & Inspect Real-time Waveform"
            >
              <Eye size={11} className={isInspected ? 'text-rose-400' : 'text-slate-400'} />
              <span>{isInspected ? 'INSPECTING' : 'SOLO SCOPE'}</span>
            </button>
          )}

          {/* Remove Amp Button */}
          <button
            type="button"
            onClick={() => onRemove(amp.id)}
            className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800/80 transition"
            title="Remove Mesa Head from Rack"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main Brushed Black Aluminum Control Faceplate */}
      <div className="relative p-3.5 bg-gradient-to-b from-[#181a22] via-[#101217] to-[#0c0d12]">
        {/* Top Control Bar: Logo, Channel Indicators, Power/Standby & Pilot */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
          {/* Authentic Mesa / Boogie Emblem */}
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 rounded bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 border border-slate-400 shadow flex items-center gap-2">
              <span className="font-black italic font-sans text-sm tracking-tighter text-slate-950 uppercase">
                MESA / BOOGIE
              </span>
              <span className="text-[9px] font-mono font-black text-rose-800 tracking-wider bg-rose-200/80 px-1 rounded">
                MARK III
              </span>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-[8.5px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                SIMUL-CLASS™ TUBE AMPLIFIER
              </span>
              <span className="text-[7.5px] font-mono text-slate-500">
                PATENTED GRAPHIC EQUALIZER & CASCADED PREAMP
              </span>
            </div>
          </div>

          {/* Channel Selector + Simul-Class Switch + Pilot Light + Standby */}
          <div className="flex items-center gap-3">
            {/* 3 Channels Switch */}
            <div className="flex items-center gap-1 bg-[#090b0e] p-1 rounded border border-slate-800">
              <button
                type="button"
                onClick={() => onUpdateParam(amp.id, 'channel', 0)}
                className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-bold transition ${
                  channel === 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                R1 (Clean)
              </button>
              <button
                type="button"
                onClick={() => onUpdateParam(amp.id, 'channel', 1)}
                className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-bold transition ${
                  channel === 1
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                R2 (Crunch)
              </button>
              <button
                type="button"
                onClick={() => onUpdateParam(amp.id, 'channel', 2)}
                className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-bold transition ${
                  channel === 2
                    ? 'bg-rose-500/25 text-rose-300 border border-rose-500/70 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Lead
              </button>
            </div>

            {/* Simul-Class / Class A Power Switch */}
            <button
              type="button"
              onClick={() => onUpdateParam(amp.id, 'simulClass', isSimulClass ? 0 : 1)}
              className={`px-2 py-1 rounded text-[9px] font-mono font-bold border transition ${
                isSimulClass
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
              title="Toggle Simul-Class (85W: 6L6+EL34) vs Class A (30W: EL34 Only)"
            >
              {isSimulClass ? 'SIMUL-CLASS (85W)' : 'CLASS A (30W)'}
            </button>

            {/* Faceted Ruby Jewel Pilot Light */}
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-gradient-to-b from-slate-300 to-slate-500 border border-slate-600 shadow flex items-center justify-center p-0.5">
                <div
                  className={`w-4 h-4 rounded-full transition-all duration-300 ${
                    amp.bypassed
                      ? 'bg-[#3b0b11] border border-[#59141c]'
                      : 'bg-gradient-to-br from-rose-400 via-red-600 to-rose-950 shadow-[0_0_15px_#ef4444,inset_0_0_4px_#fff]'
                  }`}
                />
              </div>
              <span className="text-[7px] font-mono text-slate-400 font-bold mt-0.5">PILOT</span>
            </div>

            {/* Heavy-Duty Standby / Power Toggle (ABLETON & DSP BYPASS) */}
            <button
              type="button"
              onClick={() => onToggleBypass(amp.id)}
              className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-mono text-xs font-bold transition shadow-lg ${
                amp.bypassed
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-700'
                  : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-rose-600/30'
              }`}
              title="Click to toggle Mesa Standby / Power (Turns off Mesa processing in Ableton Live)"
            >
              <Power size={13} className={amp.bypassed ? 'text-slate-500' : 'text-white'} />
              <span>{amp.bypassed ? 'STANDBY (OFF)' : 'POWER: ENGAGED'}</span>
            </button>
          </div>
        </div>

        {/* If Amp is Bypassed/Standby: Show Sleek Hardware Standby Bar with 1-Click Re-Engage */}
        {amp.bypassed && (
          <div className="my-2.5 px-3 py-2 rounded-lg bg-rose-950/20 border border-rose-900/40 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-slate-300 font-bold">
                MESA BOOGIE IS CURRENTLY IN STANDBY / BYPASS
              </span>
              <span className="text-slate-500 text-[10px]">
                (Audio passes through clean uncolored; DSP disengaged in Ableton)
              </span>
            </div>
            <button
              type="button"
              onClick={() => onToggleBypass(amp.id)}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10.5px] transition shadow"
            >
              CLICK TO ENGAGE MESA
            </button>
          </div>
        )}

        {/* Fluted Mesa Knobs Strip with Push-Pull Buttons */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 my-3">
          {mesaKnobs.map(({ key, label, pullKey, pullLabel, isPulled, min, max }) => {
            const param = amp.parameters[key] || {
              value: key.includes('master') ? 6.0 : key.includes('gain') || key.includes('treble') ? 7.0 : 5.0,
              min,
              max,
              step: 0.1
            };
            const val = param.value;

            return (
              <div key={key} className="flex flex-col items-center">
                <AudioKnob
                  label={label}
                  value={val}
                  min={min}
                  max={max}
                  step={0.1}
                  color="rose"
                  variant="fluted"
                  size={42}
                  isModulating={isModulating}
                  onChange={(newVal) => onUpdateParam(amp.id, key, newVal)}
                />

                {/* Push-Pull Button (e.g. PULL BRIGHT, PULL SHIFT, PULL DEEP) */}
                {pullKey && pullLabel && (
                  <button
                    type="button"
                    onClick={() => onUpdateParam(amp.id, pullKey, isPulled ? 0 : 1)}
                    className={`mt-1 px-1.5 py-0.5 rounded text-[7.5px] font-mono font-bold transition border ${
                      isPulled
                        ? 'bg-rose-500/25 text-rose-300 border-rose-500/60 shadow-sm'
                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                    title={`Toggle Pull ${pullLabel}`}
                  >
                    PULL {pullLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Mesa 5-Band Graphic Equalizer Section */}
        <div className="mt-2.5 pt-2 border-t border-slate-700/60 bg-[#07080b] p-3 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sliders size={13} className="text-rose-400" />
              <span className="text-[10px] font-mono uppercase text-rose-400 font-extrabold tracking-wider">
                MESA 5-BAND GRAPHIC EQUALIZER
              </span>

              {/* EQ In / Out Switch */}
              <button
                type="button"
                onClick={() => onUpdateParam(amp.id, 'eqActive', isEqIn ? 0 : 1)}
                className={`ml-2 px-2 py-0.5 rounded text-[8.5px] font-mono font-bold border transition ${
                  isEqIn
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                    : 'bg-slate-900 text-slate-500 border-slate-800 line-through'
                }`}
              >
                {isEqIn ? 'EQ: IN (ACTIVE)' : 'EQ: OUT (BYPASS)'}
              </button>
            </div>

            <button
              type="button"
              onClick={applyVScorePreset}
              className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition shadow-sm"
              title="Apply iconic Metallica / Petrucci V-Scoop curve"
            >
              Apply "V-Curve" Scoop
            </button>
          </div>

          {/* 5-Band Sliders with Calibrated Decibel Scale */}
          <div className="grid grid-cols-5 gap-3 px-2 py-1.5 bg-[#0b0d13] rounded border border-slate-800/80">
            {eqBands.map((band) => {
              const val = amp.parameters[band.id]?.value ?? 0;
              return (
                <VerticalSlider
                  key={band.id}
                  label={band.label}
                  value={val}
                  min={-12}
                  max={12}
                  step={0.5}
                  unit="dB"
                  color="rose"
                  height={80}
                  defaultValue={0}
                  onChange={(newVal) => onUpdateParam(amp.id, band.id, newVal)}
                />
              );
            })}
          </div>
        </div>

        {/* Lower Speaker Cabinet Stage */}
        <div className="flex items-center justify-between border-t border-slate-700/60 mt-2.5 pt-2 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <Disc size={13} className="text-rose-400" />
            <span className="text-[10px]">Cabinet Simulation:</span>
            <span className="text-slate-200 font-bold text-[10px]">
              Celestion Vintage 30 (V30) 4x12 Closed-Back
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateParam(amp.id, 'cab', (amp.parameters.cab?.value ?? 1) > 0.5 ? 0 : 1)
            }
            className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border transition ${
              (amp.parameters.cab?.value ?? 1) > 0.5
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                : 'bg-transparent text-slate-500 border-slate-800 line-through'
            }`}
          >
            {(amp.parameters.cab?.value ?? 1) > 0.5 ? '4x12 CAB ENGAGED' : 'CAB BYPASS'}
          </button>
        </div>
      </div>
    </div>
  );
};
