import React from 'react';
import { Power, X, Eye, Bookmark } from 'lucide-react';
import { AudioKnob } from './AudioKnob';
import { PedalInstance } from '../types';

interface StompboxProps {
  pedal: PedalInstance;
  onUpdateParam: (pedalId: string, paramName: string, value: number) => void;
  onToggleBypass: (pedalId: string) => void;
  onRemove: (pedalId: string) => void;
  onInspect?: (pedalId: string) => void;
  isInspected?: boolean;
  onSaveToLibrary?: (pedal: PedalInstance) => void;
}

export const Stompbox: React.FC<StompboxProps> = ({
  pedal,
  onUpdateParam,
  onToggleBypass,
  onRemove,
  onInspect,
  isInspected = false,
  onSaveToLibrary
}) => {
  const getAccentClass = (color: string) => {
    switch (color) {
      case 'amber':
        return {
          border: 'border-amber-500/30',
          bg: 'bg-[#141210]',
          led: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]',
          badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20'
        };
      case 'crimson':
        return {
          border: 'border-rose-500/30',
          bg: 'bg-[#150f11]',
          led: 'bg-rose-500 shadow-[0_0_8px_#ef4444]',
          badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20'
        };
      case 'cyan':
        return {
          border: 'border-cyan-500/30',
          bg: 'bg-[#0d1418]',
          led: 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]',
          badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
        };
      default:
        return {
          border: 'border-[#e6af2e]/30',
          bg: 'bg-[#14130e]',
          led: 'bg-[#e6af2e] shadow-[0_0_8px_#e6af2e]',
          badge: 'bg-[#e6af2e]/10 text-[#e6af2e] border-[#e6af2e]/20'
        };
    }
  };

  const style = getAccentClass(pedal.color);
  const isModulating = (pedal.activeModulationDepth ?? 0) > 0.1;

  return (
    <div
      className={`relative w-64 rounded-xl border ${style.border} ${style.bg} p-4 flex flex-col justify-between shadow-xl transition-all duration-200 select-none ${
        pedal.bypassed ? 'opacity-60 filter grayscale-[30%]' : ''
      }`}
    >
      {/* Top Bar: Title, Model Badge, Inspect and Remove button */}
      <div className="flex items-start justify-between border-b border-slate-800/80 pb-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                pedal.bypassed ? 'bg-slate-700' : style.led
              }`}
            />
            <h3 className="font-bold font-mono text-xs tracking-wide text-white uppercase">
              {pedal.title}
            </h3>
          </div>
          <span className="text-[9px] font-mono text-slate-500 ml-3.5 block">
            [{pedal.id}]
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onSaveToLibrary && (
            <button
              type="button"
              onClick={() => onSaveToLibrary(pedal)}
              className="p-1 rounded text-[9px] font-mono transition text-slate-400 hover:text-[#e6af2e] border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60"
              title="Save as Custom Library Preset"
            >
              <Bookmark size={12} />
            </button>
          )}

          {onInspect && (
            <button
              type="button"
              onClick={() => onInspect(pedal.id)}
              className={`p-1 rounded text-[9px] font-mono transition border ${
                isInspected
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'text-slate-400 hover:text-white border-slate-800 hover:bg-slate-800/60'
              }`}
              title="Inspect Solo Waveform"
            >
              <Eye size={12} className={isInspected ? 'text-emerald-400' : 'text-slate-400'} />
            </button>
          )}

          <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${style.badge}`}>
            {pedal.type}
          </span>

          <button
            type="button"
            onClick={() => onRemove(pedal.id)}
            className="text-slate-500 hover:text-rose-400 p-0.5 rounded hover:bg-slate-800/50 transition"
            title="Remove Pedal"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Center Knobs Grid */}
      <div className="grid grid-cols-2 gap-3 my-3">
        {Object.entries(pedal.parameters).map(([key, param]) => (
          <AudioKnob
            key={key}
            label={param.label}
            value={param.value}
            min={param.min}
            max={param.max}
            step={param.step}
            unit={param.unit}
            color={
              pedal.color === 'crimson'
                ? 'rose'
                : pedal.color === 'amber'
                ? 'amber'
                : pedal.color === 'cyan'
                ? 'cyan'
                : 'default'
            }
            variant="modern"
            size={42}
            isModulating={isModulating}
            onChange={(val) => onUpdateParam(pedal.id, key, val)}
          />
        ))}
      </div>

      {/* Bottom Stomp Switch */}
      <div className="flex flex-col items-center border-t border-slate-800/80 pt-2.5">
        <button
          type="button"
          onClick={() => onToggleBypass(pedal.id)}
          className={`w-11 h-11 rounded-full bg-gradient-to-b from-slate-400 via-slate-600 to-slate-800 border-2 border-slate-900 shadow-lg active:scale-95 transition-all flex items-center justify-center group ${
            pedal.bypassed ? 'ring-1 ring-slate-800' : 'ring-2 ring-emerald-500/40'
          }`}
          title="Stomp Bypass"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-b from-slate-200 to-slate-400 border border-slate-500 flex items-center justify-center shadow-inner group-active:translate-y-0.5 transition-transform">
            <Power
              size={13}
              className={pedal.bypassed ? 'text-slate-600' : 'text-emerald-700 font-bold'}
            />
          </div>
        </button>

        <span className="text-[9px] font-mono text-slate-400 mt-1 font-semibold tracking-wider uppercase">
          {pedal.bypassed ? 'BYPASSED' : 'ACTIVE'}
        </span>
      </div>
    </div>
  );
};
