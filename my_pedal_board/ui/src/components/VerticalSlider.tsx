import React, { useRef, useState, useCallback } from 'react';

export interface VerticalSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  color?: 'rose' | 'amber' | 'cyan' | 'default';
  height?: number; // Total track height in px, default 80
  defaultValue?: number;
  onChange: (val: number) => void;
}

export const VerticalSlider: React.FC<VerticalSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 0.5,
  unit = 'dB',
  color = 'rose',
  height = 80,
  defaultValue = 0,
  onChange
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const startPosRef = useRef<{ y: number; val: number }>({ y: 0, val: value });
  const [isFocused, setIsFocused] = useState(false);

  const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

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
    startPosRef.current = { y: e.clientY, val: value };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();

    // Dragging UP decreases clientY -> positive delta
    const dy = startPosRef.current.y - e.clientY;
    const range = max - min;
    const dragRange = height * 1.2; // Full height drag
    const valueDelta = (dy / dragRange) * range;

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
    const stepDelta = (step || 0.5) * direction * fineMultiplier;
    const nextVal = clampAndStep(value + stepDelta);
    if (nextVal !== value) {
      onChange(nextVal);
    }
  };

  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  const getAccent = () => {
    switch (color) {
      case 'amber':
        return { cap: 'bg-amber-400', glow: 'shadow-[0_0_8px_#f59e0b]', text: 'text-amber-300' };
      case 'cyan':
        return { cap: 'bg-cyan-400', glow: 'shadow-[0_0_8px_#06b6d4]', text: 'text-cyan-300' };
      default:
        return { cap: 'bg-rose-500', glow: 'shadow-[0_0_8px_#f43f5e]', text: 'text-rose-400' };
    }
  };

  const accent = getAccent();

  return (
    <div className="flex flex-col items-center select-none group touch-none">
      {/* Decibel Readout */}
      <span className={`text-[8.5px] font-mono font-bold mb-1 ${accent.text}`}>
        {value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}
        <span className="text-slate-500 text-[7px] ml-0.5">{unit}</span>
      </span>

      {/* Fader Track Container */}
      <div
        ref={trackRef}
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
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`relative w-8 bg-[#08090d] border border-slate-800 rounded flex items-center justify-center cursor-ns-resize p-1 outline-none transition-shadow ${
          isFocused ? 'ring-1 ring-white/30' : ''
        }`}
        style={{ height }}
        title={`${label}: ${value}${unit} (Drag up/down, Scroll, Dbl-click to reset)`}
      >
        {/* Center Zero Detent Marker */}
        <div className="absolute w-full h-[1px] bg-slate-700/80 top-1/2 left-0 pointer-events-none" />

        {/* Vertical Slot Groove */}
        <div className="w-1.5 h-full bg-[#030406] rounded-full border border-slate-900 pointer-events-none" />

        {/* Machined Aluminum Slider Handle / Fader Cap */}
        <div
          className="absolute w-7 h-3.5 rounded bg-gradient-to-b from-slate-200 via-slate-400 to-slate-300 border border-slate-500 shadow-md flex items-center justify-center pointer-events-none transition-all duration-75"
          style={{
            bottom: `${pct * (height - 18)}px`
          }}
        >
          {/* Illuminated Center Tick */}
          <div className={`w-3.5 h-0.5 rounded-full ${accent.cap} ${accent.glow}`} />
        </div>
      </div>

      {/* Label */}
      <span className="text-[9.5px] font-mono font-extrabold text-slate-200 mt-1 text-center">
        {label}
      </span>
    </div>
  );
};
