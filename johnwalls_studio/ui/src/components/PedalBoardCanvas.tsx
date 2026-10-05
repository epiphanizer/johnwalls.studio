import React, { useState } from 'react';
import { Plus, Sliders, ArrowRight, Flame, ArrowLeftRight, FolderOpen } from 'lucide-react';
import { PedalInstance, PedalType, ReactiveRule } from '../types';
import { Stompbox } from './Stompbox';
import { AmpHead } from './AmpHead';

interface PedalBoardCanvasProps {
  pedals: PedalInstance[];
  rules: ReactiveRule[];
  onUpdateParam: (pedalId: string, paramName: string, value: number) => void;
  onToggleBypass: (pedalId: string) => void;
  onRemovePedal: (pedalId: string) => void;
  onAddPedal: (type: PedalType) => void;
  ampPlacement: 'outbound' | 'inbound';
  onToggleAmpPlacement: () => void;
  inspectedNodeId: string;
  onSelectInspectNode: (id: string) => void;
  onOpenLibrary?: () => void;
  onSavePedalToLibrary?: (pedal: PedalInstance) => void;
}

export const PedalBoardCanvas: React.FC<PedalBoardCanvasProps> = React.memo(({
  pedals,
  rules,
  onUpdateParam,
  onToggleBypass,
  onRemovePedal,
  onAddPedal,
  ampPlacement,
  onToggleAmpPlacement,
  inspectedNodeId,
  onSelectInspectNode,
  onOpenLibrary,
  onSavePedalToLibrary
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const stompboxes = pedals.filter((p) => p.type !== 'mesa' && p.type !== 'vox');
  const amps = pedals.filter((p) => p.type === 'mesa' || p.type === 'vox');

  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto p-6 flex flex-col justify-between bg-[#0a0c12]">
      {/* Top Signal Flow Info & Active Rules Banner */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 overflow-x-auto">
          <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Signal Chain:</span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">
            Ableton In
          </span>
          <ArrowRight size={12} className="text-slate-600" />

          {ampPlacement === 'inbound' && amps.length > 0 && (
            <>
              <span className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/80 font-bold text-[11px]">
                [PRE-FX] {amps.map((a) => a.title).join(', ')}
              </span>
              <ArrowRight size={12} className="text-slate-600" />
            </>
          )}

          {stompboxes.map((p) => (
            <React.Fragment key={p.id}>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                  p.bypassed
                    ? 'bg-slate-900 text-slate-600 border-slate-800 line-through'
                    : 'bg-slate-800/80 text-white border-slate-700'
                }`}
              >
                {p.title}
              </span>
              <ArrowRight size={12} className="text-slate-600" />
            </React.Fragment>
          ))}

          {ampPlacement === 'outbound' && amps.length > 0 && (
            <>
              <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/80 font-bold text-[11px]">
                [OUTBOUND] {amps.map((a) => a.title).join(', ')}
              </span>
              <ArrowRight size={12} className="text-slate-600" />
            </>
          )}

          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">
            Master Out
          </span>
        </div>

        {/* Right side buttons: Pedal Library & Amp Placement */}
        <div className="flex items-center gap-2">
          {onOpenLibrary && (
            <button
              type="button"
              onClick={onOpenLibrary}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#e6af2e]/15 border border-[#e6af2e]/40 hover:bg-[#e6af2e]/25 text-[11px] font-mono text-[#e6af2e] hover:text-white transition font-bold"
              title="Open Pedal & Amplifier Library"
            >
              <FolderOpen size={12} />
              <span>Pedal Library</span>
            </button>
          )}

          {/* Placement Toggle Button */}
          {amps.length > 0 && (
            <button
              type="button"
              onClick={onToggleAmpPlacement}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white transition"
            >
              <ArrowLeftRight size={12} className="text-[#e6af2e]" />
              Placement: {ampPlacement === 'outbound' ? 'POST-EFFECTS (Outbound)' : 'PRE-EFFECTS (Inbound)'}
            </button>
          )}
        </div>
      </div>

      {/* Main Signal Rack Layout */}
      <div className="space-y-6 min-w-max pb-4">
        {/* Section 1: Pre-FX Amps (if placement is inbound) */}
        {ampPlacement === 'inbound' && amps.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-rose-400 font-bold border-b border-slate-800 pb-1">
              <span>INBOUND AMPLIFIER STAGE (PRE-EFFECTS)</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {amps.map((amp) => (
                <AmpHead
                  key={amp.id}
                  amp={amp}
                  onUpdateParam={onUpdateParam}
                  onToggleBypass={onToggleBypass}
                  onRemove={onRemovePedal}
                  onInspect={onSelectInspectNode}
                  isInspected={inspectedNodeId === amp.id}
                  onSaveToLibrary={onSavePedalToLibrary}
                />
              ))}
            </div>
          </div>
        )}

        {/* Section 2: Stompbox Pedal Chain */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-800 pb-1">
            <span className="font-semibold text-slate-300">EFFECTS STOMPBOX CHAIN</span>
            <span className="text-slate-500 text-[10px]">{stompboxes.length} active pedals</span>
          </div>

          <div className="flex items-center gap-6 py-2">
            {stompboxes.length === 0 ? (
              <div className="h-56 w-80 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl p-4 text-center text-slate-500 font-mono">
                <Sliders size={24} className="text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-300">No Modulation Pedals</p>
                <p className="text-[10px] text-slate-500 mt-1">Add delays, filters, overdrive or duckers.</p>
                {onOpenLibrary && (
                  <button
                    type="button"
                    onClick={onOpenLibrary}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-[#e6af2e] hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                  >
                    <FolderOpen size={13} />
                    <span>Browse Pedal Library</span>
                  </button>
                )}
              </div>
            ) : (
              stompboxes.map((pedal, idx) => (
                <React.Fragment key={pedal.id}>
                  <Stompbox
                    pedal={pedal}
                    onUpdateParam={onUpdateParam}
                    onToggleBypass={onToggleBypass}
                    onRemove={onRemovePedal}
                    onInspect={onSelectInspectNode}
                    isInspected={inspectedNodeId === pedal.id}
                    onSaveToLibrary={onSavePedalToLibrary}
                  />
                  {idx < stompboxes.length - 1 && (
                    <div className="h-1 w-4 bg-slate-800 rounded-full self-center" />
                  )}
                </React.Fragment>
              ))
            )}

            {/* Add Pedal / Amp Trigger */}
            <div className="relative self-center">
              <button
                type="button"
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="w-14 h-56 border border-dashed border-slate-800 hover:border-slate-600 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-slate-200 hover:bg-slate-900/50 transition group"
                title="Add Component"
              >
                <div className="w-7 h-7 rounded-full border border-slate-700 group-hover:border-[#e6af2e] flex items-center justify-center">
                  <Plus size={14} />
                </div>
                <span className="text-[9px] font-mono [writing-mode:vertical-lr] tracking-widest uppercase font-semibold">
                  Add Unit
                </span>
              </button>

              {showAddMenu && (
                <div className="absolute left-16 top-1/2 -translate-y-1/2 w-56 bg-[#12151f] border border-slate-700/80 rounded-xl shadow-2xl p-2 z-50 font-mono text-xs space-y-1">
                  {onOpenLibrary && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenLibrary();
                        setShowAddMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded bg-[#e6af2e]/15 border border-[#e6af2e]/40 hover:bg-[#e6af2e]/25 text-[#e6af2e] flex items-center justify-between font-bold mb-1.5 transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <FolderOpen size={13} />
                        <span>Browse Pedal Library</span>
                      </span>
                      <span className="text-[9.5px] bg-[#e6af2e] text-slate-950 px-1.5 py-0.5 rounded font-black">
                        CATALOG
                      </span>
                    </button>
                  )}

                  <div className="px-2 py-1 text-[9px] uppercase text-slate-500 font-bold tracking-wider">
                    Modulation & Dynamics
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onAddPedal('delay');
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-amber-300 flex items-center justify-between"
                  >
                    <span>Tape Delay</span>
                    <span className="text-[9px] text-slate-500">delay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddPedal('filter');
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-rose-300 flex items-center justify-between"
                  >
                    <span>Ladder Filter</span>
                    <span className="text-[9px] text-slate-500">filter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddPedal('drive');
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-[#e6af2e] flex items-center justify-between"
                  >
                    <span>Overdrive</span>
                    <span className="text-[9px] text-slate-500">drive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddPedal('ducker');
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-cyan-300 flex items-center justify-between"
                  >
                    <span>Reactive Ducker</span>
                    <span className="text-[9px] text-slate-500">ducker</span>
                  </button>

                  <div className="px-2 py-1 text-[9px] uppercase text-slate-500 font-bold tracking-wider border-t border-slate-800 mt-1">
                    Amplifier & Cabs
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onAddPedal('mesa');
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-rose-400 flex items-center justify-between font-bold"
                  >
                    <span>Mesa Mark III</span>
                    <span className="text-[9px] text-rose-500">mesa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddPedal('vox');
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-amber-400 flex items-center justify-between font-bold"
                  >
                    <span>Vox AC-30</span>
                    <span className="text-[9px] text-amber-500">vox</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Outbound Amp Stage (Default placement) */}
        {ampPlacement === 'outbound' && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-amber-400 font-bold border-b border-slate-800 pb-1">
              <span className="flex items-center gap-1.5">
                <Flame size={13} className="text-amber-500" />
                DEDICATED OUTBOUND AMPLIFIER & CABINET STAGE
              </span>
              <span className="text-slate-500 text-[10px] font-normal">
                Feeds into Ableton Master Out
              </span>
            </div>

            {amps.length === 0 ? (
              <div className="h-36 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center p-4 text-center text-slate-500 font-mono">
                <Flame size={24} className="text-slate-700 mb-1" />
                <p className="text-xs font-semibold text-slate-300">No Outbound Amplifier Loaded</p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => onAddPedal('mesa')}
                    className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 text-xs transition"
                  >
                    + Load Mesa Boogie Mark III
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddPedal('vox')}
                    className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 text-xs transition"
                  >
                    + Load Vox AC-30 Top Boost
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                {amps.map((amp) => (
                  <AmpHead
                    key={amp.id}
                    amp={amp}
                    onUpdateParam={onUpdateParam}
                    onToggleBypass={onToggleBypass}
                    onRemove={onRemovePedal}
                    onInspect={onSelectInspectNode}
                    isInspected={inspectedNodeId === amp.id}
                    onSaveToLibrary={onSavePedalToLibrary}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div />
    </div>
  );
});
