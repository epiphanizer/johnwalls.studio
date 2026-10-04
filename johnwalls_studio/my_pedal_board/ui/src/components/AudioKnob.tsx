import React, { useRef, useState, useCallback, useEffect } from 'react';

export interface AudioKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  sub?: string;
  defaultValue?: number;
  color?: 'amber' | 'rose' | 'cyan' | 'gold' | 'purple' | 'emerald' | 'orange' | 'default';
  variant?: 'fluted' | 'chicken-head' | 'modern' | 'sp404';
  isModulating?: boolean;
  size?: number; // Diameter in pixels, default 44
  onChange: (val: number) => void;
}

export const AudioKnob: React.FC<AudioKnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  sub,
  defaultValue,
  color = 'default',
  variant = 'modern',
  isModulating = false,
  size = 44,
  onChange
}) => {
  const knobRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number; val: number }>({ x: 0, y: 0, val: value });
  const [isFocused, setIsFocused] = useState(false);

  const defaultVal = defaultValue !== undefined ? defaultValue : (min + max) / 2;
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  // Standard 270 degree rotation (-135deg to +135deg)
  const rotation = -135 + pct * 270;

  const clampAndStep = useCallback(
    (rawVal: number): number => {
      const clamped = Math.max(min, Math.min(max, rawVal));
      if (step <= 0) return clamped;
      const precision = step.toString().split('.')[1]?.length || 0;
      const stepped = Math.round((clamped - min) / step) * step + min;
      return parseFloat(stepped.toFixed(precision));
    },
    [min, max, step]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      val: value
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();

    const dy = startPosRef.current.y - e.clientY;
    const dx = e.clientX - startPosRef.current.x;
    // Primary vertical dragging with horizontal assist
    const dragDelta = dy + dx * 0.5;

    // Normal sensitivity: 150px drag covers full range. Shift key gives 10x fine control.
    const dragRange = e.shiftKey ? 1500 : 150;
    const range = max - min;
    const valueDelta = (dragDelta / dragRange) * range;

    const nextVal = clampAndStep(startPosRef.current.val + valueDelta);
    if (nextVal !== value) {
      onChange(nextVal);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      isDraggingRef.current = false;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const direction = e.deltaY < 0 ? 1 : -1;
    const fineMultiplier = e.shiftKey ? 0.2 : 1.0;
    const stepDelta = (step || 0.1) * direction * fineMultiplier;
    const nextVal = clampAndStep(value + stepDelta);
    if (nextVal !== value) {
      onChange(nextVal);
    }
  };

  const handleDoubleClick = () => {
    onChange(defaultVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let nextVal = value;
    const inc = (step || 0.1) * (e.shiftKey ? 0.2 : 1.0);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      nextVal = clampAndStep(value + inc);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      nextVal = clampAndStep(value - inc);
    } else if (e.key === 'Home') {
      nextVal = min;
    } else if (e.key === 'End') {
      nextVal = max;
    } else {
      return;
    }
    e.preventDefault();
    if (nextVal !== value) {
      onChange(nextVal);
    }
  };

  const getColorTheme = () => {
    switch (color) {
      case 'rose':
        return {
          accent: '#f43f5e',
          glow: 'rgba(244, 63, 94, 0.4)',
          text: 'text-rose-300',
          indicator: 'bg-rose-400'
        };
      case 'amber':
        return {
          accent: '#f59e0b',
          glow: 'rgba(245, 158, 11, 0.4)',
          text: 'text-amber-300',
          indicator: 'bg-amber-400'
        };
      case 'orange':
        return {
          accent: '#ff5500',
          glow: 'rgba(255, 85, 0, 0.4)',
          text: 'text-orange-400',
          indicator: 'bg-orange-500'
        };
      case 'cyan':
        return {
          accent: '#06b6d4',
          glow: 'rgba(6, 182, 212, 0.4)',
          text: 'text-cyan-300',
          indicator: 'bg-cyan-400'
        };
      case 'emerald':
        return {
          accent: '#10b981',
          glow: 'rgba(16, 185, 129, 0.4)',
          text: 'text-emerald-300',
          indicator: 'bg-emerald-400'
        };
      default:
        return {
          accent: '#e6af2e',
          glow: 'rgba(230, 175, 46, 0.4)',
          text: 'text-[#e6af2e]',
          indicator: 'bg-[#e6af2e]'
        };
    }
  };

  const theme = getColorTheme();

  return (
    <div className="flex flex-col items-center select-none group touch-none">
      {/* Knob Dial Container */}
      <div
        ref={knobRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`relative cursor-ns-resize flex items-center justify-center p-1 rounded-full outline-none transition-shadow ${
          isFocused ? 'ring-1 ring-white/30' : ''
        }`}
        style={{ width: size + 8, height: size + 8 }}
        title={`${label}: ${value} ${unit} (Drag up/down, Scroll, or Dbl-Click to reset)`}
      >
        {/* Modulating Halo */}
        {isModulating && (
          <div
            className="absolute inset-0 rounded-full transition-opacity duration-300 opacity-60 pointer-events-none"
            style={{ boxShadow: `0 0 12px ${theme.accent}` }}
          />
        )}

        {/* VARIANT 1: FLUTED (Mesa Boogie Style) */}
        {variant === 'fluted' && (
          <div
            className="rounded-full bg-gradient-to-b from-[#2a2e3d] via-[#1a1c24] to-[#0c0d12] border border-slate-600 shadow-md flex items-center justify-center relative pointer-events-none"
            style={{ width: size, height: size }}
          >
            {/* Spun Aluminum Inner Cap */}
            <div
              className="rounded-full bg-gradient-to-br from-slate-200 via-slate-400 to-slate-200 border border-slate-500 flex items-center justify-center shadow-inner relative"
              style={{
                width: size * 0.65,
                height: size * 0.65,
                transform: `rotate(${rotation}deg)`
              }}
            >
              {/* Pointer Needle */}
              <div
                className="w-0.5 bg-slate-950 rounded-full absolute top-0.5 shadow-sm"
                style={{ height: size * 0.3 }}
              />
              <div className="w-2 h-2 rounded-full bg-slate-600 border border-slate-400" />
            </div>
          </div>
        )}

        {/* VARIANT 2: CHICKEN-HEAD (Vox AC-30 Style) */}
        {variant === 'chicken-head' && (
          <div
            className="rounded-full bg-[#180709] border border-amber-900/60 shadow-md flex items-center justify-center relative pointer-events-none"
            style={{ width: size, height: size }}
          >
            <div
              className="flex items-center justify-center relative transition-transform"
              style={{
                width: size * 0.82,
                height: size * 0.82,
                transform: `rotate(${rotation}deg)`
              }}
            >
              <svg viewBox="0 0 44 44" className="w-full h-full drop-shadow">
                <circle cx="22" cy="22" r="14" fill="#0d0e12" stroke="#27272a" strokeWidth="1.5" />
                <path d="M 17 22 L 22 2 L 27 22 Z" fill="#0d0e12" stroke="#27272a" strokeWidth="1.2" />
                <circle cx="22" cy="22" r="7" fill="#18181b" />
                <line x1="22" y1="5" x2="22" y2="18" stroke="#fef08a" strokeWidth="2.0" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}

        {/* VARIANT 3: SP-404 (Grooved Roland Rotary Encoder) */}
        {variant === 'sp404' && (
          <div
            className="rounded-full bg-gradient-to-b from-[#2a2b30] via-[#1a1b1f] to-[#0c0d10] border border-neutral-700 shadow-xl flex items-center justify-center relative pointer-events-none"
            style={{ width: size, height: size }}
          >
            <div
              className="rounded-full bg-gradient-to-b from-[#18191c] to-[#0e0f12] border border-neutral-800 flex items-center justify-center relative shadow-inner"
              style={{
                width: size * 0.8,
                height: size * 0.8,
                transform: `rotate(${rotation}deg)`
              }}
            >
              {/* Roland Orange Notch */}
              <div
                className="w-1 bg-[#ff5500] rounded-full absolute top-1 shadow-[0_0_6px_#ff5500]"
                style={{ height: size * 0.3 }}
              />
              <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-700" />
            </div>
          </div>
        )}

        {/* VARIANT 4: MODERN STOMPBOX */}
        {variant === 'modern' && (
          <div
            className="rounded-full bg-gradient-to-b from-[#262c3e] to-[#11141e] border border-slate-700 shadow-inner flex items-center justify-center relative pointer-events-none"
            style={{ width: size, height: size }}
          >
            <div
              className="w-full h-full flex items-center justify-center relative transition-transform"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              {/* Luminous Tip Pointer */}
              <div
                className={`w-0.5 rounded-full absolute top-1 shadow-sm ${theme.indicator}`}
                style={{ height: size * 0.32, boxShadow: `0 0 6px ${theme.accent}` }}
              />
              <div className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shadow">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Label */}
      <span className="text-[9.5px] font-mono font-bold text-slate-200 tracking-wider uppercase mt-0.5 text-center leading-tight">
        {label}
      </span>
      {sub && (
        <span className="text-[7.5px] font-mono text-slate-400 uppercase -mt-0.5 tracking-tight">
          {sub}
        </span>
      )}

      {/* Numeric Readout Badge */}
      <div className="flex items-center gap-0.5 mt-0.5 px-1.5 py-0.2 rounded bg-slate-950/80 border border-slate-800/80 text-[8.5px] font-mono font-semibold text-slate-300">
        <span>{step < 0.1 ? value.toFixed(2) : step < 1 ? value.toFixed(1) : Math.round(value)}</span>
        {unit && <span className="text-slate-500 font-normal">{unit}</span>}
      </div>
    </div>
  );
};
