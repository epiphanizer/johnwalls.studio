import React, { useState } from 'react';
import { Sliders, Disc, Sparkles, Check, ArrowRight, X, Layers, Activity } from 'lucide-react';

export type StudioWorkspace = 'pedal_lab' | 'sp404' | 'state';

interface StudioWorkspaceModalProps {
  currentWorkspace: StudioWorkspace;
  isOpen: boolean;
  onClose: () => void;
  onSelectWorkspace: (workspace: StudioWorkspace, remember: boolean) => void;
}

export const StudioWorkspaceModal: React.FC<StudioWorkspaceModalProps> = ({
  currentWorkspace,
  isOpen,
  onClose,
  onSelectWorkspace
}) => {
  const [selected, setSelected] = useState<StudioWorkspace>(currentWorkspace);
  const [remember, setRemember] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSelectWorkspace(selected, remember);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none font-mono">
      <div className="bg-[#10121a] border border-slate-700/80 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#0b0d13] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-[#e6af2e] shadow-[0_0_8px_#e6af2e]" />
            <h2 className="text-sm font-extrabold text-white tracking-widest uppercase">
              johnwalls.studio · Select Studio Module
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Choice Cards (Pedal Lab / SP-404 / State) */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Pedal Lab (Active) */}
          <div
            onClick={() => setSelected('pedal_lab')}
            className={`cursor-pointer rounded-xl p-5 border-2 transition-all flex flex-col justify-between relative ${
              selected === 'pedal_lab'
                ? 'bg-gradient-to-b from-[#182030] to-[#0f1420] border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                : 'bg-[#0e1017] border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
            }`}
          >
            {/* Status Pill */}
            <div className="flex items-center justify-between mb-4">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ACTIVE ENGINE
              </span>
              {selected === 'pedal_lab' && (
                <div className="w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center font-bold text-xs shadow">
                  <Check size={13} />
                </div>
              )}
            </div>

            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-700/50 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
                <Sliders size={24} />
              </div>

              <h3 className="text-base font-black text-white uppercase tracking-wider mb-1">
                Pedal Lab
              </h3>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                Modular Stompbox Effects Rack & Authentic Tube Amplifiers (Mesa Boogie Mark III & Vox AC-30 Top Boost).
              </p>

              <div className="space-y-1.5 text-[10.5px] text-slate-400 border-t border-slate-800 pt-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400">✓</span> Dynamic stompbox chaining (Delay, Filter, Overdrive, Ducker)
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400">✓</span> Real 12AX7 & EL84 tube physics & 5-band graphic EQ
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400">✓</span> Live CRT Oscilloscope & reactive sidechain sensory ducking
                </div>
              </div>
            </div>

            <button
              type="button"
              className={`w-full mt-5 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition ${
                selected === 'pedal_lab'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <span>Launch Pedal Lab</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Card 2: SP-404 */}
          <div
            onClick={() => setSelected('sp404')}
            className={`cursor-pointer rounded-xl p-5 border-2 transition-all flex flex-col justify-between relative ${
              selected === 'sp404'
                ? 'bg-gradient-to-b from-[#241710] to-[#120d09] border-[#ff5500] shadow-[0_0_20px_rgba(255,85,0,0.25)]'
                : 'bg-[#0e1017] border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
            }`}
          >
            {/* Status Pill */}
            <div className="flex items-center justify-between mb-4">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ff5500]/20 text-[#ff8844] border border-[#ff5500]/50 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff5500] animate-pulse" />
                ACTIVE SAMPLER ENGINE
              </span>
              {selected === 'sp404' && (
                <div className="w-5 h-5 rounded-full bg-[#ff5500] text-black flex items-center justify-center font-bold text-xs shadow">
                  <Check size={13} />
                </div>
              )}
            </div>

            <div>
              <div className="w-12 h-12 rounded-xl bg-orange-950/60 border border-orange-700/50 flex items-center justify-center text-[#ff5500] mb-3 shadow-inner">
                <Disc size={24} />
              </div>

              <h3 className="text-base font-black text-white uppercase tracking-wider mb-1">
                SP-404 MKII
              </h3>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                Live Performance Sampler, Roland SD Card Manager, Chromatic Transpose & Real-Time Simultaneous Recording.
              </p>

              <div className="space-y-1.5 text-[10.5px] text-slate-400 border-t border-slate-800 pt-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#ff5500]">✓</span> Instant memory card patch loading & export to 404 SD card
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#ff5500]">✓</span> Live Ableton input recording & resample WHILE playing pads
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#ff5500]">✓</span> Chromatic 16-pad pitch keyboard & global transpose
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#ff5500]">✓</span> Authentic MFX (Vinyl Sim 33/45, DJFX, Isolator, Cassette)
                </div>
              </div>
            </div>

            <button
              type="button"
              className={`w-full mt-5 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition ${
                selected === 'sp404'
                  ? 'bg-[#ff5500] hover:bg-[#ff6611] text-black shadow-lg'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <span>Launch SP-404 Sampler</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Card 3: State (Observability & SuperCollider) */}
          <div
            onClick={() => setSelected('state')}
            className={`cursor-pointer rounded-xl p-5 border-2 transition-all flex flex-col justify-between relative ${
              selected === 'state'
                ? 'bg-gradient-to-b from-[#1e1430] to-[#0f0b18] border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.25)]'
                : 'bg-[#0e1017] border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
            }`}
          >
            {/* Status Pill */}
            <div className="flex items-center justify-between mb-4">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/50 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                GLOBAL TELEMETRY & SC
              </span>
              {selected === 'state' && (
                <div className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold text-xs shadow">
                  <Check size={13} />
                </div>
              )}
            </div>

            <div>
              <div className="w-12 h-12 rounded-xl bg-purple-950/60 border border-purple-700/50 flex items-center justify-center text-purple-400 mb-3 shadow-inner">
                <Activity size={24} />
              </div>

              <h3 className="text-base font-black text-white uppercase tracking-wider mb-1">
                State Cockpit
              </h3>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                Global Ableton Live Session Awareness, Multi-Track MIDI Matrix & SuperCollider Server Cockpit.
              </p>

              <div className="space-y-1.5 text-[10.5px] text-slate-400 border-t border-slate-800 pt-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-purple-400">✓</span> Instant SuperCollider server boot (UDP: 57110) & OSC control
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-purple-400">✓</span> Real Ableton Live session (.als) track matrix & MIDI recognition
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-purple-400">✓</span> Real-time Ableton Live Scene matrix and playhead sync
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-purple-400">✓</span> Pure telemetry & reporting cockpit with zero coloration
                </div>
              </div>
            </div>

            <button
              type="button"
              className={`w-full mt-5 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition ${
                selected === 'state'
                  ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <span>Launch State Cockpit</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Footer with Remember Option */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#090b0e] flex flex-wrap items-center justify-between gap-3 text-xs">
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
            />
            <span className="text-[11px]">Save selection as default for future sessions</span>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 font-semibold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-5 py-1.5 rounded-lg font-bold text-xs transition shadow flex items-center gap-1.5 ${
                selected === 'pedal_lab'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : selected === 'sp404'
                  ? 'bg-[#ff5500] hover:bg-[#ff6611] text-black'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
            >
              <span>Continue to {selected === 'pedal_lab' ? 'Pedal Lab' : selected === 'sp404' ? 'SP-404' : 'State'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
