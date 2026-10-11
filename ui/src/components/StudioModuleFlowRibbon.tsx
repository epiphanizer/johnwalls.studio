import React, { useState } from 'react';
import {
  Sliders,
  Disc,
  ArrowRight,
  Plus,
  ChevronLeft,
  ChevronRight,
  Power,
  Trash2,
  Edit2,
  Check,
  Maximize2,
  Activity,
  GitBranch,
  Radio
} from 'lucide-react';
import { StudioModule, StudioModuleType } from '../types';

interface StudioModuleFlowRibbonProps {
  modules: StudioModule[];
  activeModuleId: string;
  onSelectModule: (id: string) => void;
  onMoveModule: (fromIndex: number, toIndex: number) => void;
  onToggleModuleBypass: (id: string) => void;
  onAddModule: (type: StudioModuleType) => void;
  onRemoveModule: (id: string) => void;
  onRenameModule: (id: string, newTitle: string) => void;
  onOpenRoutingModal?: () => void;
  onOpenCaptureDispatch?: () => void;
}

export const StudioModuleFlowRibbon: React.FC<StudioModuleFlowRibbonProps> = ({
  modules,
  activeModuleId,
  onSelectModule,
  onMoveModule,
  onToggleModuleBypass,
  onAddModule,
  onRemoveModule,
  onRenameModule,
  onOpenRoutingModal,
  onOpenCaptureDispatch
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const saveRename = (id: string) => {
    if (editingTitle.trim()) {
      onRenameModule(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="h-12 bg-[#0c0e14] border-b border-slate-800/80 px-3 flex items-center justify-between gap-3 select-none font-mono text-xs overflow-x-auto">
      {/* 1. Signal Flow Label & Input Node */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] uppercase font-black tracking-widest text-slate-500">
          FLOW:
        </span>
        {onOpenRoutingModal && (
          <button
            type="button"
            onClick={onOpenRoutingModal}
            className="px-2.5 py-1 rounded-md bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 hover:text-cyan-200 border border-cyan-500/50 hover:border-cyan-400 text-[10px] font-extrabold tracking-wide transition flex items-center gap-1.5 shadow-sm group"
            title="Universal Studio Routing Matrix & Signal Flow (Alt+R)"
          >
            <GitBranch size={12} className="text-cyan-400 group-hover:rotate-45 transition-transform" />
            <span>ROUTING</span>
          </button>
        )}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#131622] border border-slate-700/80 text-[10px] text-cyan-400 font-bold shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] animate-pulse" />
          <span>LIVE IN</span>
        </div>
        <ArrowRight size={12} className="text-slate-600" />
      </div>

      {/* 2. Rearrangeable Module Pipeline Nodes */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 flex-1">
        {modules.map((mod, idx) => {
          const isActive = mod.id === activeModuleId;
          const isSp404 = mod.type === 'sp404';
          const isState = mod.type === 'state';

          return (
            <React.Fragment key={mod.id}>
              <div
                className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  isActive
                    ? isSp404
                      ? 'bg-[#ff5500]/20 border-[#ff5500] text-white shadow-[0_0_12px_rgba(255,85,0,0.35)]'
                      : isState
                      ? 'bg-purple-500/20 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.35)]'
                      : 'bg-emerald-500/20 border-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                    : mod.bypassed
                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                    : 'bg-[#141724] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white'
                }`}
                onClick={() => onSelectModule(mod.id)}
              >
                {/* Module Type Icon & Sequence Number */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-black text-slate-500">
                    {idx + 1}.
                  </span>
                  {isSp404 ? (
                    <Disc
                      size={13}
                      className={isActive ? 'text-[#ff5500]' : 'text-slate-400'}
                    />
                  ) : isState ? (
                    <Activity
                      size={13}
                      className={isActive ? 'text-purple-400' : 'text-slate-400'}
                    />
                  ) : (
                    <Sliders
                      size={13}
                      className={isActive ? 'text-emerald-400' : 'text-slate-400'}
                    />
                  )}
                </div>

                {/* Module Title / Inline Rename */}
                {editingId === mod.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveRename(mod.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => saveRename(mod.id)}
                      className="bg-black/60 border border-slate-600 rounded px-1.5 py-0.2 text-[10px] text-white font-mono w-28 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="p-0.5 text-emerald-400 hover:text-emerald-300"
                    >
                      <Check size={11} />
                    </button>
                  </form>
                ) : (
                  <div
                    className="flex items-center gap-1"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(mod.id, mod.title);
                    }}
                    title="Double click to rename module"
                  >
                    <span className="text-[10.5px] font-bold truncate max-w-[120px]">
                      {mod.title}
                    </span>
                    {mod.type === 'pedal_board' && (
                      <span className="text-[8.5px] font-mono opacity-60">
                        ({(mod as any).pedals?.length || 0})
                      </span>
                    )}
                  </div>
                )}

                {/* Module Bypass Power Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleModuleBypass(mod.id);
                  }}
                  className={`p-0.5 rounded transition ${
                    mod.bypassed
                      ? 'text-rose-400/80 hover:text-rose-300'
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                  title={mod.bypassed ? 'Module Bypassed (Click to Engage)' : 'Module Active (Click to Bypass)'}
                >
                  <Power size={11} />
                </button>

                {/* Reorder Buttons (Move Earlier / Later in Flow) */}
                <div className="flex items-center gap-0.5 ml-1 border-l border-slate-700/60 pl-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (idx > 0) onMoveModule(idx, idx - 1);
                    }}
                    className="p-0.5 rounded text-slate-500 hover:text-slate-200 disabled:opacity-20 hover:bg-slate-800 transition"
                    title="Move earlier in signal chain"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === modules.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (idx < modules.length - 1) onMoveModule(idx, idx + 1);
                    }}
                    className="p-0.5 rounded text-slate-500 hover:text-slate-200 disabled:opacity-20 hover:bg-slate-800 transition"
                    title="Move later in signal chain"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>

                {/* Delete button (if > 1 module) */}
                {modules.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveModule(mod.id);
                    }}
                    className="p-0.5 rounded text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                    title="Remove module from rack"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>

              {/* Arrow to Next Node */}
              {idx < modules.length - 1 && (
                <ArrowRight size={12} className="text-slate-600 shrink-0" />
              )}
            </React.Fragment>
          );
        })}

        {/* Master Output Destination */}
        <ArrowRight size={12} className="text-slate-600 shrink-0" />
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#131622] border border-slate-700/80 text-[10px] text-emerald-400 font-bold shadow-sm shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          <span>MASTER OUT</span>
        </div>
      </div>

      {/* 3. Add Module Button & Dropdown */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="px-2.5 py-1 rounded bg-[#161a26] hover:bg-[#1e2333] border border-slate-700 hover:border-slate-500 text-slate-200 text-[10px] font-bold transition flex items-center gap-1"
          title="Add a new modular processing stage"
        >
          <Plus size={12} className="text-[#e6af2e]" />
          <span>ADD MODULE</span>
        </button>

        {showAddMenu && (
          <div
            className="absolute top-8 right-0 w-52 bg-[#121520] border border-slate-700 rounded-lg shadow-2xl py-1 z-50 font-mono text-xs"
            onMouseLeave={() => setShowAddMenu(false)}
          >
            <div className="px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">
              Insert Module into Flow
            </div>
            <button
              type="button"
              onClick={() => {
                onAddModule('pedal_board');
                setShowAddMenu(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 flex items-center gap-2 transition"
            >
              <Sliders size={13} className="text-emerald-400" />
              <div>
                <div className="font-bold text-[10.5px]">Modular Pedal Board</div>
                <div className="text-[8.5px] text-slate-500">Stompboxes, delays & tube amps</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                onAddModule('sp404');
                setShowAddMenu(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-[#ff5500]/20 text-slate-200 hover:text-[#ff8844] flex items-center gap-2 transition"
            >
              <Disc size={13} className="text-[#ff5500]" />
              <div>
                <div className="font-bold text-[10.5px]">SP-404 Original / A</div>
                <div className="text-[8.5px] text-slate-500">120 pads, live resample & MFX</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                onAddModule('state');
                setShowAddMenu(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-purple-500/20 text-slate-200 hover:text-purple-300 flex items-center gap-2 transition"
            >
              <Activity size={13} className="text-purple-400" />
              <div>
                <div className="font-bold text-[10.5px]">State Cockpit</div>
                <div className="text-[8.5px] text-slate-500">MIDI matrix & SuperCollider server</div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* 4. Master Output & Web Dispatch Sink */}
      <div className="flex items-center gap-1.5 shrink-0 pl-1 border-l border-slate-800">
        <ArrowRight size={11} className="text-slate-600" />
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#131622] border border-slate-700/80 text-[10px] text-emerald-400 font-bold shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
          <span>OUT</span>
        </div>
        <ArrowRight size={11} className="text-slate-600" />
        {onOpenCaptureDispatch && (
          <button
            type="button"
            onClick={onOpenCaptureDispatch}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#e6af2e]/15 hover:bg-[#e6af2e]/30 text-[#e6af2e] border border-[#e6af2e]/50 hover:border-[#e6af2e] text-[10px] font-extrabold tracking-wide transition shadow-sm group"
            title="Capture Master Audio & Publish to johnwalls.studio"
          >
            <Radio size={11} className="text-[#e6af2e] animate-pulse" />
            <span>PUBLISH</span>
          </button>
        )}
      </div>
    </div>
  );
};
