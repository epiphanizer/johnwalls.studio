import React, { useState, useEffect } from 'react';
import { stateBridge } from '../utils/stateBridge';
import { sp404AudioEngine, BankLetter } from './SP404AudioEngine';

export interface SP404ChopFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBank: BankLetter;
  selectedPadId: number;
  onStatusMessage: (message: string) => void;
}

export const SP404ChopFinderModal: React.FC<SP404ChopFinderModalProps> = ({
  isOpen,
  onClose,
  activeBank,
  selectedPadId,
  onStatusMessage
}) => {
  const [chopTrackName, setChopTrackName] = useState<string>('Sean Beatbox');
  const [chopInstances, setChopInstances] = useState<any[]>([]);
  const [chopSessionInfo, setChopSessionInfo] = useState<{ bpm: number; totalClips: number; distinctShapes: number } | null>(null);
  const [chopScanError, setChopScanError] = useState<string | null>(null);
  const [isScanningChops, setIsScanningChops] = useState<boolean>(false);
  const [loadingChopIndex, setLoadingChopIndex] = useState<number | null>(null);
  const [auditioningInstance, setAuditioningInstance] = useState<number | null>(null);

  const handleScanChopTrack = async (targetTrack = chopTrackName) => {
    setIsScanningChops(true);
    setChopScanError(null);
    try {
      const res = await stateBridge.findSp404Samples(targetTrack);
      if (!res.ok) {
        setChopScanError(res.error || 'Failed to scan track split waveforms.');
        setChopInstances([]);
        return;
      }
      setChopSessionInfo({
        bpm: res.data.bpm,
        totalClips: res.data.totalClips,
        distinctShapes: res.data.distinctSplitForms
      });
      setChopInstances(res.data.instances || []);
    } catch (err: any) {
      setChopScanError(err?.message || String(err));
    } finally {
      setIsScanningChops(false);
    }
  };

  const handleGrabChop = async (instNum: number, targetPad = selectedPadId) => {
    setLoadingChopIndex(instNum);
    try {
      const res = await stateBridge.grabSp404Sample({
        track: chopTrackName,
        instance: instNum,
        bank: activeBank,
        pad: targetPad
      });
      if (res.ok && res.wavBase64) {
        await sp404AudioEngine.loadSampleBase64(res.bank, res.padId, res.wavBase64, res.label);
        onStatusMessage(`LOADED INST #${instNum} -> PAD ${res.bank}${String(res.padId).padStart(2, '0')}`);
      }
    } catch (err: any) {
      console.warn('Failed to grab chop:', err);
    } finally {
      setLoadingChopIndex(null);
    }
  };

  const handleMake12PadPattern = async () => {
    setIsScanningChops(true);
    try {
      const res = await stateBridge.makeSp404Pattern({
        track: chopTrackName,
        bank: activeBank,
        count: 12
      });
      if (res.ok && Array.isArray(res.pads)) {
        for (const p of res.pads) {
          if (p.wavBase64) {
            await sp404AudioEngine.loadSampleBase64(p.bank, p.pad, p.wavBase64, p.label);
          }
        }
        onStatusMessage(`12-PAD CHOP KIT LOADED ONTO BANK ${activeBank}`);
      }
    } catch (err: any) {
      console.warn('Failed to make pattern kit:', err);
    } finally {
      setIsScanningChops(false);
    }
  };

  const handleAuditionChop = async (instNum: number) => {
    setAuditioningInstance(instNum);
    try {
      const res = await stateBridge.grabSp404Sample({
        track: chopTrackName,
        instance: instNum,
        bank: activeBank,
        pad: selectedPadId
      });
      if (res.ok && res.wavBase64) {
        const ctx = sp404AudioEngine.getAudioContext();
        if (ctx) {
          const binary = atob(res.wavBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const buf = await ctx.decodeAudioData(bytes.buffer);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start();
          src.onended = () => setAuditioningInstance(null);
        }
      }
    } catch {
      setAuditioningInstance(null);
    }
  };

  useEffect(() => {
    if (isOpen && chopInstances.length === 0 && !isScanningChops) {
      handleScanChopTrack();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-mono text-xs">
      <div className="bg-[#12151f] border-2 border-amber-500/50 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-pulse" />
            <div>
              <h3 className="font-black text-amber-300 text-sm tracking-wide">
                SP-404 SAMPLE FINDER & SPLIT WAVEFORM CHOP LOADER
              </h3>
              <p className="text-[10px] text-slate-400">
                Extract edited waveform lengths, repeated sounds, and pattern kits from active Ableton session
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {/* Track Selector & Action Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-[#181d2a] p-3 rounded-xl border border-slate-700/60">
          <span className="text-[11px] text-slate-300 font-bold">Track:</span>
          <input
            type="text"
            value={chopTrackName}
            onChange={(e) => setChopTrackName(e.target.value)}
            placeholder="e.g. Sean Beatbox, Chop Sample, Snare"
            className="px-3 py-1.5 rounded-lg bg-[#0e1118] border border-slate-600 text-amber-200 text-xs flex-1 min-w-44 focus:outline-none focus:border-amber-400"
          />
          <button
            type="button"
            disabled={isScanningChops}
            onClick={() => handleScanChopTrack()}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition disabled:opacity-50"
          >
            {isScanningChops ? 'SCANNING...' : 'SCAN TRACK'}
          </button>
          <button
            type="button"
            disabled={isScanningChops || chopInstances.length === 0}
            onClick={handleMake12PadPattern}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-black text-xs hover:bg-emerald-500/30 transition disabled:opacity-40"
          >
            MAKE 12-PAD KIT ({activeBank}1..{activeBank}12)
          </button>
        </div>

        {/* Session Stats */}
        {chopSessionInfo && (
          <div className="flex items-center gap-6 text-[10.5px] text-slate-400 px-1">
            <span>Tempo: <strong className="text-slate-200">{chopSessionInfo.bpm} BPM</strong></span>
            <span>Total Split Forms: <strong className="text-slate-200">{chopSessionInfo.totalClips}</strong></span>
            <span>Distinct Waveform Shapes: <strong className="text-amber-300">{chopSessionInfo.distinctShapes}</strong></span>
            <span>Target: <strong className="text-cyan-300">Bank {activeBank} Pad {selectedPadId}</strong></span>
          </div>
        )}

        {/* Error Message */}
        {chopScanError && (
          <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-2.5 rounded-xl text-xs">
            {chopScanError}
          </div>
        )}

        {/* Split Form Instances List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {chopInstances.length === 0 && !isScanningChops && (
            <div className="text-center py-12 text-slate-500 text-xs">
              Enter a track name above (or click SCAN TRACK) to discover split waveform instances.
            </div>
          )}

          {chopInstances.map((inst) => {
            const isAuditioning = auditioningInstance === inst.instance;
            const isLoading = loadingChopIndex === inst.instance;
            return (
              <div
                key={inst.instance}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                  inst.isAudible
                    ? 'bg-[#151926] border-slate-700/60 hover:border-slate-500'
                    : 'bg-[#12141c] border-slate-800/40 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-slate-800 text-amber-300 font-bold flex items-center justify-center text-xs border border-slate-700">
                    #{inst.instance}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200 text-xs">
                        {inst.durationSec.toFixed(2)}s ({inst.durationBeats.toFixed(2)} beats)
                      </span>
                      {inst.repeatCount > 1 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                          REPEATS x{inst.repeatCount}
                        </span>
                      )}
                      {!inst.isAudible && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700 text-slate-400">
                          LOW ENERGY
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-sm">
                      Start: {inst.startBeat.toFixed(2)}b ({inst.startTimeSec.toFixed(2)}s) · Peak: {inst.peak.toFixed(3)} · {inst.sourceFilename}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAuditionChop(inst.instance)}
                    disabled={isAuditioning}
                    className="px-2.5 py-1 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 text-xs font-bold transition disabled:opacity-50"
                  >
                    {isAuditioning ? 'PLAYING...' : 'AUDITION'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGrabChop(inst.instance)}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-xs font-black transition disabled:opacity-50"
                  >
                    {isLoading ? 'LOADING...' : `LOAD PAD ${activeBank}${String(selectedPadId).padStart(2, '0')}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
