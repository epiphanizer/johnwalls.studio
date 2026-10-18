import React from 'react';
import { Trash2 } from 'lucide-react';
import { SP404Pad, sp404AudioEngine } from './SP404AudioEngine';

export interface SP404PadInspectorDrawerProps {
  editingPad: SP404Pad | null;
  onClose: () => void;
  onPadUpdated: () => void;
}

export const SP404PadInspectorDrawer: React.FC<SP404PadInspectorDrawerProps> = ({
  editingPad,
  onClose,
  onPadUpdated
}) => {
  if (!editingPad) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-mono text-xs">
      <div className="bg-[#151822] border-2 border-slate-600 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5500] shadow-[0_0_8px_#ff5500]" />
            <span className="font-black text-white text-sm">
              PAD {editingPad.bank}{editingPad.id.toString().padStart(2, '0')} PARAMETERS
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-slate-300">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Pad Label / Name</label>
            <input
              type="text"
              value={editingPad.label}
              onChange={(e) => {
                const newLabel = e.target.value;
                editingPad.label = newLabel;
                sp404AudioEngine.setPadLabel(editingPad.bank, editingPad.id, newLabel);
                onPadUpdated();
              }}
              className="w-full bg-[#0d0f17] border border-slate-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-[#ff5500]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Tune Pitch ({editingPad.pitch > 0 ? `+${editingPad.pitch}` : editingPad.pitch} st)
              </label>
              <input
                type="range"
                min={-24}
                max={24}
                step={1}
                value={editingPad.pitch}
                onChange={(e) => {
                  const p = parseInt(e.target.value, 10);
                  editingPad.pitch = p;
                  sp404AudioEngine.setPadParam(editingPad.bank, editingPad.id, 'pitch', p);
                  onPadUpdated();
                }}
                className="w-full accent-[#ff5500]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Volume Level ({(editingPad.volume * 100).toFixed(0)}%)
              </label>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={editingPad.volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  editingPad.volume = v;
                  sp404AudioEngine.setPadParam(editingPad.bank, editingPad.id, 'volume', v);
                  onPadUpdated();
                }}
                className="w-full accent-[#ff5500]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Playback Mode</label>
              <select
                value={editingPad.mode}
                onChange={(e) => {
                  const m = e.target.value as any;
                  editingPad.mode = m;
                  sp404AudioEngine.setPadParam(editingPad.bank, editingPad.id, 'mode', m);
                  onPadUpdated();
                }}
                className="w-full bg-[#0d0f17] border border-slate-600 rounded-lg px-2.5 py-1.5 text-white"
              >
                <option value="oneshot">One-Shot</option>
                <option value="gate">Gate (Hold)</option>
                <option value="loop">Loop</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Mute / Choke Group</label>
              <select
                value={editingPad.muteGroup}
                onChange={(e) => {
                  const g = parseInt(e.target.value, 10);
                  editingPad.muteGroup = g;
                  sp404AudioEngine.setPadParam(editingPad.bank, editingPad.id, 'muteGroup', g);
                  onPadUpdated();
                }}
                className="w-full bg-[#0d0f17] border border-slate-600 rounded-lg px-2.5 py-1.5 text-white"
              >
                <option value={0}>Off (Polyphonic)</option>
                <option value={1}>Group 1 (Hi-Hats)</option>
                <option value={2}>Group 2 (Chops)</option>
                <option value={3}>Group 3 (Bass/Lead)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                editingPad.reverse = !editingPad.reverse;
                sp404AudioEngine.setPadParam(editingPad.bank, editingPad.id, 'reverse', editingPad.reverse);
                onPadUpdated();
              }}
              className={`flex-1 py-1.5 rounded-lg border font-bold text-[11px] transition ${
                editingPad.reverse
                  ? 'bg-[#ff5500] text-black border-[#ff5500]'
                  : 'bg-[#1e2330] text-slate-300 border-slate-600'
              }`}
            >
              Reverse: {editingPad.reverse ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => {
                editingPad.audioBuffer = null;
                editingPad.waveform = [];
                editingPad.duration = 0;
                sp404AudioEngine.setPadParam(editingPad.bank, editingPad.id, 'volume', 0);
                onPadUpdated();
              }}
              className="py-1.5 px-3 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 font-bold text-[11px] flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              <span>CLEAR SAMPLE</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-xl bg-[#ff5500] hover:bg-amber-500 text-black font-black text-xs transition"
        >
          DONE
        </button>
      </div>
    </div>
  );
};
