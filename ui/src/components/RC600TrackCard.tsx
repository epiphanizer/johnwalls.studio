import React from 'react';
import { RC600Track, rc600AudioEngine } from './RC600AudioEngine';
import { BankLetter } from './SP404AudioEngine';

export interface RC600TrackCardProps {
  track: RC600Track;
  badge: { label: string; bg: string; dot: string; ring: string };
  onFootswitchTrigger: (trackId: number) => void;
  onCommitBounceToSP404: (trackId: number) => void;
  onLoadFromSP404Pad: (trackId: number) => void;
  bouncePopoverTrackId: number | null;
  setBouncePopoverTrackId: (trackId: number | null) => void;
  bounceTargetBank: BankLetter;
  setBounceTargetBank: (bank: BankLetter) => void;
  bounceTargetPadId: number;
  setBounceTargetPadId: (pad: number) => void;
  banks: BankLetter[];
  isPedalboardActive?: boolean;
  pedalRecNum?: number;
  pedalStopNum?: number;
  isFocused?: boolean;
  onSelectFocus?: (trackId: number) => void;
}

export const RC600TrackCard: React.FC<RC600TrackCardProps> = ({
  track,
  badge,
  onFootswitchTrigger,
  onCommitBounceToSP404,
  onLoadFromSP404Pad,
  bouncePopoverTrackId,
  setBouncePopoverTrackId,
  bounceTargetBank,
  setBounceTargetBank,
  bounceTargetPadId,
  setBounceTargetPadId,
  banks,
  isPedalboardActive = false,
  pedalRecNum,
  pedalStopNum,
  isFocused = false,
  onSelectFocus
}) => {
  const isRec = track.status === 'recording';
  const isDub = track.status === 'overdubbing';
  const isPlay = track.status === 'playing';
  const isTrackLinked = rc600AudioEngine.isTrackLinkEnabled();
  const progress = rc600AudioEngine.getTrackProgress(track.id);
  const ringRadius = 22;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div
      onClick={() => onSelectFocus?.(track.id)}
      className={`rounded-2xl border-2 p-3 bg-gradient-to-b from-[#23060a] via-[#160305] to-[#0c0203] flex flex-col justify-between transition-all duration-150 relative shadow-xl cursor-pointer ${
        isFocused
          ? 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.35)] ring-1 ring-cyan-400/50'
          : isPedalboardActive
          ? 'border-red-600/90 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
          : badge.ring
      }`}
    >
      {/* Track Top Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-red-900/70">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-black text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]">T{track.id}</span>
          <span className="font-mono text-[10px] font-bold text-red-100 truncate max-w-[80px]" title={track.name}>
            {track.name.replace(/^Track \d+:\s*/, '')}
          </span>
        </div>

        <span
          className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-black border flex items-center gap-1 ${
            badge.bg
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} ${isRec || isDub ? 'animate-pulse' : ''}`} />
          {badge.label}
        </span>
      </div>

      {/* Pedalboard Active / Standby Indicator Pill */}
      <div className="my-1 flex items-center justify-between gap-1">
        {isPedalboardActive && pedalRecNum && pedalStopNum ? (
          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black bg-red-600/30 text-red-200 border border-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.3)] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>PEDAL: FS{pedalRecNum} REC · FS{pedalStopNum} STOP</span>
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-red-400/50 border border-red-950/80 bg-[#120305]">
            BANK {track.id <= 3 ? '1' : '2'} (STANDBY)
          </span>
        )}
        {isFocused && (
          <span className="px-1 py-0.2 rounded text-[7.5px] font-mono font-black bg-cyan-950 text-cyan-300 border border-cyan-500/70">
            FOCUS [U]
          </span>
        )}
      </div>

      {/* Loop position ring and waveform */}
      <div className="flex items-center gap-3 my-2">
        <div className="relative w-14 h-14 shrink-0">
          <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
            <circle cx="28" cy="28" r={ringRadius} fill="none" stroke="#3b0a0e" strokeWidth="4" />
            <circle cx="28" cy="28" r={ringRadius} fill="none" stroke={isDub ? '#f59e0b' : isPlay ? '#10b981' : '#f87171'} strokeWidth="4" strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={ringCircumference * (1 - progress)} className="transition-[stroke-dashoffset] duration-75" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-red-200 font-bold">{Math.round(progress * 100)}%</span>
        </div>
        <div className="flex-1 min-w-0 my-1 bg-[#090102] rounded-xl p-2 border border-red-950/90 flex flex-col justify-between h-24 relative overflow-hidden shadow-inner">
        {/* Waveform Bars */}
        <div className="flex items-center justify-between h-14 w-full gap-0.5 px-1">
          {track.waveform.map((amp, wIdx) => {
            const barH = Math.max(3, Math.round(amp * 48));
            return (
              <div
                key={wIdx}
                className={`flex-1 rounded-full transition-all duration-75 ${
                  isRec
                    ? 'bg-red-500'
                    : isDub
                    ? 'bg-amber-400'
                    : isPlay
                    ? 'bg-emerald-400'
                    : track.audioBuffer
                    ? 'bg-red-400/80'
                    : 'bg-red-950/60'
                }`}
                style={{ height: `${barH}px` }}
              />
            );
          })}
        </div>

        {/* Duration & Bar Count Tag */}
        <div className="flex items-center justify-between text-[9.5px] font-mono text-red-300/70 border-t border-red-950/80 pt-1">
          <span>{track.durationSec > 0 ? `${track.durationSec.toFixed(2)}s` : '0.00s'}</span>
          <span className="text-red-400/60">{track.isOneShot ? '1-SHOT' : 'LOOP'}</span>
          <span className="text-red-200 font-bold">{track.speed}x</span>
        </div>
        </div>
      </div>

      {/* Volume Fader & Pan Controls */}
      <div className="space-y-2.5 my-1">
        {/* Volume Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-red-300/80 font-bold">LEVEL</span>
            <span className="text-white font-bold">{Math.round(track.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={track.volume}
            onChange={(e) => rc600AudioEngine.setTrackVolume(track.id, parseFloat(e.target.value))}
            className="w-full accent-red-500 bg-red-950/80 h-1.5 rounded-lg appearance-none cursor-pointer border border-red-900/40"
          />
        </div>

        {/* Pan Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-red-300/80 font-bold">PAN</span>
            <span className="text-red-200 font-semibold">
              {track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 100)}` : `R${Math.round(track.pan * 100)}`}
            </span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={track.pan}
            onChange={(e) => rc600AudioEngine.setTrackPan(track.id, parseFloat(e.target.value))}
            className="w-full accent-cyan-400 bg-red-950/80 h-1.5 rounded-lg appearance-none cursor-pointer border border-red-900/40"
          />
        </div>
      </div>

      {/* Modifier Buttons (Speed, Reverse, Mute, Solo) */}
      <div className="grid grid-cols-4 gap-1 my-2">
        <button
          type="button"
          onClick={() => {
            const nextSpeed = track.speed === 1.0 ? 0.5 : track.speed === 0.5 ? 2.0 : 1.0;
            rc600AudioEngine.setTrackSpeed(track.id, nextSpeed as 0.5 | 1.0 | 2.0);
          }}
          className={`py-1 rounded text-[10px] font-mono font-bold border transition ${
            track.speed !== 1.0
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              : 'bg-[#1f0508] text-red-300/80 border-red-900/70 hover:text-white hover:bg-[#30080c] hover:border-red-600'
          }`}
          disabled={isTrackLinked}
          title={isTrackLinked ? 'Track speed is governed by the Master Tempo / Track Link lock' : 'Toggle Speed (0.5x Half, 1.0x Normal, 2.0x Double)'}
        >
          {track.speed}x
        </button>

        <button
          type="button"
          onClick={() => rc600AudioEngine.toggleTrackReverse(track.id)}
          className={`py-1 rounded text-[10px] font-mono font-bold border transition ${
            track.reverse
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
              : 'bg-[#1f0508] text-red-300/80 border-red-900/70 hover:text-white hover:bg-[#30080c] hover:border-red-600'
          }`}
          title="Reverse Audio Loop"
        >
          REV
        </button>

        <button
          type="button"
          onClick={() => rc600AudioEngine.toggleTrackMute(track.id)}
          className={`py-1 rounded text-[10px] font-mono font-bold border transition ${
            track.isMuted
              ? 'bg-red-600 text-white border-red-400 font-black shadow-[0_0_8px_#ef4444]'
              : 'bg-[#1f0508] text-red-300/80 border-red-900/70 hover:text-white hover:bg-[#30080c] hover:border-red-600'
          }`}
          title="Mute Track"
        >
          M
        </button>

        <button
          type="button"
          onClick={() => rc600AudioEngine.clearTrack(track.id)}
          className="py-1 rounded text-[10px] font-mono font-bold bg-[#1f0508] text-red-300/80 border border-red-900/70 hover:text-red-400 hover:border-red-600 hover:bg-[#30080c] transition"
          title="Clear Track Audio"
        >
          CLR
        </button>
      </div>

      {/* Dedicated undo/redo state controls; the engine keeps the two most recent buffers as a toggle pair. */}
      <div className="grid grid-cols-2 gap-1 my-1">
        <button type="button" onClick={() => rc600AudioEngine.undoTrack(track.id)} disabled={!track.undoBuffer} className="rounded-lg border py-1 text-[9px] font-mono font-black bg-[#160406] text-cyan-300 border-red-900/80 disabled:opacity-30 hover:border-cyan-500/60">UNDO</button>
        <button type="button" onClick={() => rc600AudioEngine.redoTrack(track.id)} disabled={!track.redoBuffer} className="rounded-lg border py-1 text-[9px] font-mono font-black bg-[#160406] text-sky-300 border-red-900/80 disabled:opacity-30 hover:border-sky-500/60">REDO</button>
      </div>

      {/* Dedicated Boss-style transport LEDs */}
      <div className="grid grid-cols-3 gap-1 my-1">
        <button type="button" onClick={() => isDub ? rc600AudioEngine.stopOverdub(track.id) : rc600AudioEngine.startOverdub(track.id)} disabled={!track.audioBuffer} className={`rounded-lg border py-1.5 text-[9px] font-mono font-black ${isDub ? 'bg-amber-500 text-black border-amber-300 shadow-[0_0_10px_#f59e0b]' : 'bg-[#240c06] text-amber-300 border-amber-800/70 hover:bg-[#351208]'} disabled:opacity-30`}>DUB</button>
        <button type="button" onClick={() => rc600AudioEngine.playTrack(track.id)} disabled={!track.audioBuffer} className={`rounded-lg border py-1.5 text-[9px] font-mono font-black ${isPlay ? 'bg-emerald-500 text-black border-emerald-300 shadow-[0_0_10px_#10b981]' : 'bg-[#0b1c12] text-emerald-300 border-emerald-800/70 hover:bg-[#10291a]'} disabled:opacity-30`}>PLAY</button>
        <button type="button" onClick={() => rc600AudioEngine.stopTrack(track.id)} className="rounded-lg border py-1.5 text-[9px] font-mono font-black bg-[#2b070b] text-red-300 border-red-800/70 hover:bg-[#3d0a0f]">STOP</button>
      </div>

      {/* Primary Footswitch Action Trigger Button */}
      <button
        type="button"
        onClick={() => onFootswitchTrigger(track.id)}
        className={`w-full py-2.5 rounded-xl font-mono text-xs font-black tracking-wider flex items-center justify-center gap-1.5 transition duration-75 active:scale-95 shadow-md ${
          isRec
            ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]'
            : isDub
            ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.5)]'
            : isPlay
            ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]'
            : track.audioBuffer
            ? 'bg-red-600 hover:bg-red-500 text-white font-black shadow-[0_0_12px_rgba(239,68,68,0.5)]'
            : 'bg-[#240609] hover:bg-[#34090e] text-red-200 border border-red-900/80'
        }`}
      >
        {isRec ? 'PLAY / DUB' : isDub ? 'PLAY' : isPlay ? 'OVERDUB' : track.audioBuffer ? 'PLAY' : 'RECORD'}
        <span className="text-[10px] opacity-75">[{track.id}]</span>
      </button>

      {/* SP-404 Cross-Bridge Bar */}
      <div className="pt-2.5 mt-2.5 border-t border-red-900/70 flex items-center justify-between text-[10px] font-mono gap-1">
        <button
          type="button"
          onClick={() => setBouncePopoverTrackId(track.id)}
          disabled={!track.audioBuffer}
          className="flex-1 py-1 rounded bg-[#200a06] hover:bg-[#30100a] text-[#ff8844] border border-[#ff5500]/50 disabled:opacity-30 disabled:pointer-events-none transition flex items-center justify-center gap-1 font-bold"
          title="Bounce this loop directly to an SP-404 Pad"
        >
          <span>→ SP-404</span>
        </button>

        <button
          type="button"
          onClick={() => onLoadFromSP404Pad(track.id)}
          className="flex-1 py-1 rounded bg-[#1c0608] hover:bg-[#2c0a0e] text-red-200 border border-red-900/70 transition flex items-center justify-center gap-1 font-bold"
          title="Import active SP-404 pad into this track"
        >
          <span>← Grab</span>
        </button>
      </div>

      {/* Bounce Popover Modal Dialog for this Track */}
      {bouncePopoverTrackId === track.id && (
        <div className="absolute inset-0 bg-[#160407]/95 backdrop-blur-md rounded-2xl p-4 flex flex-col justify-between z-20 border-2 border-[#ff5500] shadow-2xl">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-red-900/80">
              <span className="font-mono text-xs font-bold text-white">BOUNCE TO SP-404</span>
              <button
                type="button"
                onClick={() => setBouncePopoverTrackId(null)}
                className="text-red-300 hover:text-white text-xs font-mono font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-red-200 mt-2 mb-3">
              Assign Track {track.id} stem to an SP-404 pad:
            </p>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-mono text-red-300/80 block mb-1">SELECT BANK:</label>
                <div className="grid grid-cols-5 gap-1">
                  {banks.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBounceTargetBank(b)}
                      className={`py-1 rounded font-mono text-xs font-bold transition ${
                        bounceTargetBank === b
                          ? 'bg-[#ff5500] text-black shadow'
                          : 'bg-[#22070a] text-red-300/80 hover:text-white border border-red-900/60'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-red-300/80 block mb-1">SELECT PAD (1-16):</label>
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((padNum) => (
                    <button
                      key={padNum}
                      type="button"
                      onClick={() => setBounceTargetPadId(padNum)}
                      className={`py-1 rounded font-mono text-[11px] font-bold transition ${
                        bounceTargetPadId === padNum
                          ? 'bg-amber-400 text-black shadow'
                          : 'bg-[#22070a] text-red-200 hover:text-white border border-red-900/60'
                      }`}
                    >
                      {padNum}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onCommitBounceToSP404(track.id)}
            className="w-full mt-3 py-2 rounded-xl bg-gradient-to-r from-[#ff5500] to-amber-500 hover:from-[#ff6611] hover:to-amber-400 text-black font-mono text-xs font-black shadow-lg"
          >
            COMMIT TO PAD {bounceTargetBank}{bounceTargetPadId}
          </button>
        </div>
      )}
    </div>
  );
};
