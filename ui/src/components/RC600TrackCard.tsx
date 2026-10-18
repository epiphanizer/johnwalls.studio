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
  banks
}) => {
  const isRec = track.status === 'recording';
  const isDub = track.status === 'overdubbing';
  const isPlay = track.status === 'playing';

  return (
    <div
      className={`rounded-2xl border-2 p-3.5 bg-gradient-to-b from-[#121520] to-[#0a0c12] flex flex-col justify-between transition-all duration-150 relative ${
        badge.ring
      }`}
    >
      {/* Track Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-black text-rose-400">T{track.id}</span>
          <span className="font-mono text-[10px] font-bold text-slate-300 truncate max-w-[85px]" title={track.name}>
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

      {/* Waveform Visualization Canvas & Progress */}
      <div className="my-3 bg-[#07080e] rounded-xl p-2 border border-slate-800/80 flex flex-col justify-between h-24 relative overflow-hidden">
        {/* Waveform Bars */}
        <div className="flex items-center justify-between h-14 w-full gap-0.5 px-1">
          {track.waveform.map((amp, wIdx) => {
            const barH = Math.max(3, Math.round(amp * 48));
            return (
              <div
                key={wIdx}
                className={`flex-1 rounded-full transition-all duration-75 ${
                  isRec
                    ? 'bg-rose-500'
                    : isDub
                    ? 'bg-amber-400'
                    : isPlay
                    ? 'bg-emerald-400'
                    : track.audioBuffer
                    ? 'bg-cyan-500/70'
                    : 'bg-slate-800'
                }`}
                style={{ height: `${barH}px` }}
              />
            );
          })}
        </div>

        {/* Duration & Bar Count Tag */}
        <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-400 border-t border-slate-800/60 pt-1">
          <span>{track.durationSec > 0 ? `${track.durationSec.toFixed(2)}s` : '0.00s'}</span>
          <span className="text-slate-500">{track.isOneShot ? '1-SHOT' : 'LOOP'}</span>
          <span className="text-slate-300 font-bold">{track.speed}x</span>
        </div>
      </div>

      {/* Volume Fader & Pan Controls */}
      <div className="space-y-2.5 my-1">
        {/* Volume Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-slate-400">LEVEL</span>
            <span className="text-white font-bold">{Math.round(track.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={track.volume}
            onChange={(e) => rc600AudioEngine.setTrackVolume(track.id, parseFloat(e.target.value))}
            className="w-full accent-rose-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Pan Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-slate-400">PAN</span>
            <span className="text-slate-300">
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
            className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
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
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
          }`}
          title="Toggle Speed (0.5x Half, 1.0x Normal, 2.0x Double)"
        >
          {track.speed}x
        </button>

        <button
          type="button"
          onClick={() => rc600AudioEngine.toggleTrackReverse(track.id)}
          className={`py-1 rounded text-[10px] font-mono font-bold border transition ${
            track.reverse
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
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
              ? 'bg-rose-500 text-black border-rose-400'
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
          }`}
          title="Mute Track"
        >
          M
        </button>

        <button
          type="button"
          onClick={() => rc600AudioEngine.clearTrack(track.id)}
          className="py-1 rounded text-[10px] font-mono font-bold bg-slate-800/80 text-slate-400 border border-slate-700 hover:text-rose-400 hover:border-rose-700/50 transition"
          title="Clear Track Audio"
        >
          CLR
        </button>
      </div>

      {/* Primary Footswitch Action Trigger Button */}
      <button
        type="button"
        onClick={() => onFootswitchTrigger(track.id)}
        className={`w-full py-2.5 rounded-xl font-mono text-xs font-black tracking-wider flex items-center justify-center gap-1.5 transition duration-75 active:scale-95 shadow-md ${
          isRec
            ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
            : isDub
            ? 'bg-amber-500 hover:bg-amber-400 text-black'
            : isPlay
            ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
            : track.audioBuffer
            ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
        }`}
      >
        {isRec ? 'PLAY / DUB' : isDub ? 'PLAY' : isPlay ? 'OVERDUB' : track.audioBuffer ? 'PLAY' : 'RECORD'}
        <span className="text-[10px] opacity-75">[{track.id}]</span>
      </button>

      {/* SP-404 Cross-Bridge Bar */}
      <div className="pt-2.5 mt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono gap-1">
        <button
          type="button"
          onClick={() => setBouncePopoverTrackId(track.id)}
          disabled={!track.audioBuffer}
          className="flex-1 py-1 rounded bg-[#1c1410] hover:bg-[#2c1d14] text-[#ff8844] border border-[#ff5500]/40 disabled:opacity-30 disabled:pointer-events-none transition flex items-center justify-center gap-1"
          title="Bounce this loop directly to an SP-404 Pad"
        >
          <span>→ SP-404</span>
        </button>

        <button
          type="button"
          onClick={() => onLoadFromSP404Pad(track.id)}
          className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center justify-center gap-1"
          title="Import active SP-404 pad into this track"
        >
          <span>← Grab</span>
        </button>
      </div>

      {/* Bounce Popover Modal Dialog for this Track */}
      {bouncePopoverTrackId === track.id && (
        <div className="absolute inset-0 bg-[#0d0f17]/95 backdrop-blur-md rounded-2xl p-4 flex flex-col justify-between z-20 border-2 border-[#ff5500]">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <span className="font-mono text-xs font-bold text-white">BOUNCE TO SP-404</span>
              <button
                type="button"
                onClick={() => setBouncePopoverTrackId(null)}
                className="text-slate-400 hover:text-white text-xs font-mono font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mt-2 mb-3">
              Assign Track {track.id} stem to an SP-404 pad:
            </p>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">SELECT BANK:</label>
                <div className="grid grid-cols-5 gap-1">
                  {banks.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBounceTargetBank(b)}
                      className={`py-1 rounded font-mono text-xs font-bold transition ${
                        bounceTargetBank === b
                          ? 'bg-[#ff5500] text-black'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">SELECT PAD (1-16):</label>
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((padNum) => (
                    <button
                      key={padNum}
                      type="button"
                      onClick={() => setBounceTargetPadId(padNum)}
                      className={`py-1 rounded font-mono text-[11px] font-bold transition ${
                        bounceTargetPadId === padNum
                          ? 'bg-amber-400 text-black'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
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
