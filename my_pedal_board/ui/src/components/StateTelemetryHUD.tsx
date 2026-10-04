import React, { useState } from 'react';
import { Plus, X, Radio } from 'lucide-react';
import { MusicalState, ReactiveRule, StateTelemetry } from '../types';

interface StateTelemetryHUDProps {
  telemetry: StateTelemetry;
  rules: ReactiveRule[];
  onAddSensor: (sensor: { id: string; label: string; freq: number; type: 'lowpass' | 'bandpass' | 'highpass'; color: string }) => void;
}

export const StateTelemetryHUD: React.FC<StateTelemetryHUDProps> = React.memo(({
  telemetry,
  rules,
  onAddSensor
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newId, setNewId] = useState('');
  const [newFreq, setNewFreq] = useState('3200');
  const [newType, setNewType] = useState<'lowpass' | 'bandpass' | 'highpass'>('bandpass');
  const [newColor, setNewColor] = useState('gold');

  const getStateBadge = (state: MusicalState) => {
    switch (state) {
      case 'STEADY_GROOVE':
        return {
          bg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
          dot: 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]',
          label: 'GROOVE (4/4 DETECTED)'
        };
      case 'BREAKDOWN':
        return {
          bg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
          dot: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]',
          label: 'BREAKDOWN (KICK SILENT)'
        };
      case 'BUILD_FILL':
        return {
          bg: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
          dot: 'bg-purple-400 shadow-[0_0_8px_#c084fc]',
          label: 'ROLL / BUILD DENSITY'
        };
      case 'DROP':
        return {
          bg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
          dot: 'bg-rose-400 shadow-[0_0_8px_#f43f5e]',
          label: 'SUB-DROP IMPACT'
        };
      default:
        return {
          bg: 'bg-slate-900 text-slate-400 border-slate-800',
          dot: 'bg-slate-600',
          label: 'IDLE / LISTENING'
        };
    }
  };

  const badge = getStateBadge(telemetry.musicalState);

  const getSensorColor = (color: string) => {
    switch (color) {
      case 'rose':
        return { activeLed: 'bg-rose-500 shadow-[0_0_8px_#f43f5e]', text: 'text-rose-400' };
      case 'amber':
        return { activeLed: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]', text: 'text-amber-400' };
      case 'cyan':
        return { activeLed: 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]', text: 'text-cyan-400' };
      case 'purple':
        return { activeLed: 'bg-purple-400 shadow-[0_0_8px_#c084fc]', text: 'text-purple-400' };
      case 'emerald':
        return { activeLed: 'bg-emerald-400 shadow-[0_0_8px_#34d399]', text: 'text-emerald-400' };
      default:
        return { activeLed: 'bg-[#e6af2e] shadow-[0_0_8px_#e6af2e]', text: 'text-[#e6af2e]' };
    }
  };

  const handleCreateSensor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim()) return;
    onAddSensor({
      id: newId.trim().toLowerCase(),
      label: newId.trim().toUpperCase(),
      freq: parseFloat(newFreq) || 1200,
      type: newType,
      color: newColor
    });
    setNewId('');
    setShowAddModal(false);
  };

  return (
    <div className="bg-[#0e111a] border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-3 select-none text-xs font-mono">
      {/* Left: Real-time Live State & Live Sensor Bank */}
      <div className="flex items-center gap-4 overflow-x-auto">
        {/* On-The-Fly State Display */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
            <Radio size={11} className="text-[#e6af2e]" /> On-The-Fly State:
          </span>
          <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${badge.bg} text-[11px] font-bold`}>
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            <span>{badge.label}</span>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Live Sensory Energy & Hit Detectors */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Sensors:</span>
          {telemetry.sensors.map((sensor) => {
            const sc = getSensorColor(sensor.color);
            const isLit = sensor.triggered || sensor.energy > 0.05;
            return (
              <div
                key={sensor.id}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/70 border border-slate-800/80"
                title={`${sensor.label} (${sensor.type} @ ${sensor.frequencyHz}Hz) - Total hits: ${sensor.totalHits}`}
              >
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    isLit ? `${sc.activeLed} opacity-100` : 'bg-slate-800 opacity-40'
                  }`}
                />
                <span className={`text-[10px] font-bold ${sc.text}`}>{sensor.id}</span>
                {sensor.totalHits > 0 && (
                  <span className="text-[9px] text-slate-500 font-normal">({sensor.totalHits})</span>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-1.5 py-0.5 rounded border border-dashed border-slate-700 hover:border-[#e6af2e] text-slate-500 hover:text-[#e6af2e] text-[9.5px] transition flex items-center gap-0.5"
            title="Register arbitrary sensory detector (e.g. cymbals, vocals, guitar)"
          >
            <Plus size={10} /> Sensor
          </button>
        </div>
      </div>

      {/* Right: Live Sidechain RMS Energy & Link Status */}
      <div className="flex items-center gap-3 text-slate-400 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">LIVE RMS:</span>
          <span className="text-slate-200 font-bold font-mono">
            {(telemetry.sidechainRMS * 100).toFixed(1)}%
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/30 border border-emerald-800/40 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          <span className="font-semibold text-[9.5px]">LIVE BUS LINKED</span>
        </div>
      </div>

      {/* Modal for Adding New Sensory Channel */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#141824] border border-slate-700 rounded-xl w-full max-w-sm p-5 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="font-bold text-white text-sm">Register Sensory Detector</span>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateSensor} className="space-y-3 mt-3">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Sensor ID (e.g. cymbals, bass, perc)</label>
                <input
                  type="text"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="e.g. cymbals"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#e6af2e]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">Center Freq (Hz)</label>
                  <input
                    type="number"
                    value={newFreq}
                    onChange={(e) => setNewFreq(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">Filter Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  >
                    <option value="bandpass">BandPass</option>
                    <option value="lowpass">LowPass</option>
                    <option value="highpass">HighPass</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Color Badge</label>
                <select
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                >
                  <option value="gold">Gold</option>
                  <option value="cyan">Cyan</option>
                  <option value="purple">Purple</option>
                  <option value="emerald">Emerald</option>
                  <option value="rose">Rose</option>
                  <option value="amber">Amber</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 rounded bg-[#e6af2e] hover:bg-amber-400 text-slate-950 font-bold"
                >
                  Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
