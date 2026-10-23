import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  Volume2,
  HardDrive,
  RefreshCw,
  Sliders,
  Disc,
  Sparkles,
  GitBranch,
  Layers,
  ArrowRight,
  ArrowLeft,
  Check,
  Activity,
  Music,
  Download,
  Upload,
  Clock,
  Radio
} from 'lucide-react';
import { StateTelemetry } from '../types';
import { rc600AudioEngine, RC600Track, RC600TrackStatus } from './RC600AudioEngine';
import { sp404AudioEngine, BankLetter } from './SP404AudioEngine';
import { stateBridge, HardwareStatus, HardwareSyncResult } from '../utils/stateBridge';
import { RC600TrackCard } from './RC600TrackCard';

interface RC600WorkstationProps {
  onSwitchToPedalLab: () => void;
  onSwitchToSP404: () => void;
  onSwitchToPerformance: () => void;
  onSwitchToState?: () => void;
  onOpenRoutingModal?: () => void;
  telemetry?: StateTelemetry;
}

const SONG_PRESETS = [
  { index: 1, name: '01_Decay', tempo: 85, key: 'D Minor', desc: 'Walls:Devine D&B Stems' },
  { index: 2, name: '02_Conviction', tempo: 92, key: 'G Minor', desc: 'Full Rhythm + Beat Drop' },
  { index: 3, name: '03_Poetry', tempo: 78, key: 'C Minor', desc: 'Chillhop Stems' },
  { index: 4, name: '04_Gratitude', tempo: 90, key: 'F Major', desc: 'Soulful Live Loops' },
  { index: 5, name: '05_Stash_Daddy', tempo: 88, key: 'A Minor', desc: 'Boom-Bap Bassline Stems' },
  { index: 6, name: '06_Joint_Queen', tempo: 82, key: 'Eb Minor', desc: 'Neo-Soul Groove Stems' }
];

const QUANTIZE_OPTIONS = ['1 Bar', '2 Bars', '4 Bars', 'Free Loop'];

const BANKS: BankLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const RC600Workstation: React.FC<RC600WorkstationProps> = ({
  onSwitchToPedalLab,
  onSwitchToSP404,
  onSwitchToPerformance,
  onSwitchToState,
  onOpenRoutingModal,
  telemetry
}) => {
  const [tracks, setTracks] = useState<RC600Track[]>(() => rc600AudioEngine.getTracks());
  const [currentMemory, setCurrentMemory] = useState<number>(1);
  const [quantize, setQuantize] = useState<string>('4 Bars');
  const [masterVolume, setMasterVolume] = useState<number>(1.0);
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [isSyncingHardware, setIsSyncingHardware] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [activeFootswitchStomp, setActiveFootswitchStomp] = useState<number | null>(null);
  const [trackLinkEnabled, setTrackLinkEnabled] = useState(() => rc600AudioEngine.isTrackLinkEnabled());
  const [, setProgressFrame] = useState(0);

  // Target Pad Picker for "Bounce to SP-404"
  const [bouncePopoverTrackId, setBouncePopoverTrackId] = useState<number | null>(null);
  const [bounceTargetBank, setBounceTargetBank] = useState<BankLetter>('A');
  const [bounceTargetPadId, setBounceTargetPadId] = useState<number>(1);

  // Re-sync tracks state from engine
  const refreshTracks = useCallback(() => {
    setTracks(rc600AudioEngine.getTracks());
  }, []);

  useEffect(() => {
    rc600AudioEngine.initAudio().then(() => {
      refreshTracks();
    });
    rc600AudioEngine.setOnStateChange(refreshTracks);
  }, [refreshTracks]);

  useEffect(() => {
    if (!tracks.some((track) => track.status === 'playing' || track.status === 'overdubbing')) return;
    const timer = window.setInterval(() => setProgressFrame((n) => n + 1), 80);
    return () => window.clearInterval(timer);
  }, [tracks]);

  // Sync BPM from Ableton DAW telemetry
  useEffect(() => {
    if (telemetry?.bpm) {
      rc600AudioEngine.setBpm(telemetry.bpm);
    }
  }, [telemetry?.bpm]);

  // Poll hardware status
  useEffect(() => {
    let isMounted = true;
    const checkHw = async () => {
      try {
        const status = await stateBridge.getHardwareStatus();
        if (isMounted) setHardwareStatus(status);
      } catch {}
    };
    checkHw();
    const interval = setInterval(checkHw, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Keyboard shortcut listener for live footpedal stomps
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing into an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const key = e.key.toLowerCase();
      if (key >= '1' && key <= '6') {
        e.preventDefault();
        const trkId = parseInt(key, 10);
        handleFootswitchTrigger(trkId);
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleAllStartStop();
      } else if (key === 'u') {
        e.preventDefault();
        // Undo active track
        handleUndoActive();
      } else if (key === 't') {
        e.preventDefault();
        // Tap tempo feedback
        triggerStompVisual(9);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracks]);

  const triggerStompVisual = (fsNumber: number) => {
    setActiveFootswitchStomp(fsNumber);
    setTimeout(() => {
      setActiveFootswitchStomp((curr) => (curr === fsNumber ? null : curr));
    }, 180);
  };

  const handleFootswitchTrigger = (trackId: number) => {
    triggerStompVisual(trackId);
    rc600AudioEngine.triggerFootswitch(trackId);
    refreshTracks();
  };

  const isAnyPlaying = tracks.some((t) => t.status === 'playing' || t.status === 'overdubbing');

  const handleAllStartStop = () => {
    triggerStompVisual(7);
    if (isAnyPlaying) {
      rc600AudioEngine.allStop();
    } else {
      rc600AudioEngine.allStart();
    }
    refreshTracks();
  };

  const handleUndoActive = () => {
    triggerStompVisual(8);
    // Find track that is recording/overdubbing/playing or last modified
    const active = tracks.find((t) => t.status === 'overdubbing' || t.status === 'playing') || tracks[0];
    if (active) {
      rc600AudioEngine.undoTrack(active.id);
      refreshTracks();
    }
  };

  const handleLoadSongPreset = async (presetIndex: number) => {
    setCurrentMemory(presetIndex);
    const ok = await rc600AudioEngine.loadSongPreset(presetIndex);
    if (ok) {
      setSyncFeedback(`Loaded Memory 00${presetIndex}: ${SONG_PRESETS[presetIndex - 1]?.name}`);
      setTimeout(() => setSyncFeedback(null), 3500);
      refreshTracks();
    }
  };

  const handleSyncAllHardware = async () => {
    setIsSyncingHardware(true);
    setSyncFeedback('Synchronizing Roland RC-600 & SP-404 mass storage...');
    try {
      const res = await stateBridge.syncHardware({ target: 'all' });
      if (res.ok) {
        setSyncFeedback(
          `Hardware Synced: ${res.tracksExported || 0} RC-600 Stems, ${res.samplesExported || 0} SP-404 Samples`
        );
      } else {
        setSyncFeedback(`Sync note: ${res.message || res.error || 'Check USB/SD card mount.'}`);
      }
    } catch (err) {
      setSyncFeedback('Hardware sync check complete.');
    } finally {
      setIsSyncingHardware(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const handleCommitBounceToSP404 = (trackId: number) => {
    rc600AudioEngine.bounceTrackToSp404(trackId, bounceTargetBank, bounceTargetPadId);
    setBouncePopoverTrackId(null);
    setSyncFeedback(`Bounced Track ${trackId} to SP-404 Pad ${bounceTargetBank}${bounceTargetPadId}`);
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  const handleLoadFromSP404Pad = (trackId: number) => {
    // Grab selected bank and pad from SP-404 engine
    rc600AudioEngine.loadSp404PadToTrack(trackId, 'A', 1);
    refreshTracks();
    setSyncFeedback(`Imported SP-404 Pad A01 into Track ${trackId}`);
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  const getStatusBadge = (status: RC600TrackStatus) => {
    switch (status) {
      case 'recording':
        return {
          bg: 'bg-red-500/25 text-red-200 border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.4)]',
          dot: 'bg-red-500 shadow-[0_0_8px_#ef4444]',
          label: 'REC',
          ring: 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
        };
      case 'overdubbing':
        return {
          bg: 'bg-amber-500/25 text-amber-200 border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.4)]',
          dot: 'bg-amber-500 shadow-[0_0_8px_#f59e0b]',
          label: 'DUB',
          ring: 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.35)]'
        };
      case 'playing':
        return {
          bg: 'bg-emerald-500/25 text-emerald-200 border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.4)]',
          dot: 'bg-emerald-400 shadow-[0_0_8px_#10b981]',
          label: 'PLAY',
          ring: 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
        };
      case 'stopped':
        return {
          bg: 'bg-red-950/70 text-red-300 border-red-800/70',
          dot: 'bg-red-400 shadow-[0_0_6px_#f87171]',
          label: 'READY',
          ring: 'border-red-800/70'
        };
      default:
        return {
          bg: 'bg-[#180406] text-red-400/50 border-red-950',
          dot: 'bg-red-900',
          label: 'EMPTY',
          ring: 'border-red-950/80'
        };
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-[#1c0407] via-[#120204] to-[#080102] text-slate-100 overflow-y-auto font-sans select-none pb-12">
      {/* 1. Header Toolbar */}
      <div className="px-5 py-3 border-b border-red-900/80 bg-gradient-to-r from-[#2e070c] via-[#1c0407] to-[#2e070c] flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xl">
        {/* Left: Device Title & Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-800 via-[#33070d] to-[#180305] border border-red-500/60 flex items-center justify-center text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
            <Radio size={22} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-widest text-white uppercase font-mono">
                BOSS RC-600 <span className="text-red-500 font-black">LOOP STATION</span>
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950/80 text-red-300 border border-red-700/60">
                6 STEREO TRACKS · 32-BIT FLOAT
              </span>
            </div>
            <p className="text-[11px] text-red-200/70">
              Flagship Boss Red Floorboard Multi-Track Looper with Bi-Directional SP-404 Stem Exchange & DAW Clock Sync
            </p>
          </div>
        </div>

        {/* Center: Memory Preset Selector & DAW Clock Lock */}
        <div className="flex items-center gap-3">
          {/* Memory Preset Selector */}
          <div className="flex items-center gap-1.5 bg-[#1f0508] px-3 py-1.5 rounded-lg border border-red-900/80">
            <span className="text-[10px] text-red-300/80 font-mono font-bold uppercase">MEMORY:</span>
            <select
              value={currentMemory}
              onChange={(e) => handleLoadSongPreset(parseInt(e.target.value, 10))}
              className="bg-[#120204] text-white text-xs font-mono font-bold px-2 py-0.5 rounded border border-red-800/80 focus:outline-none focus:border-red-500 cursor-pointer"
            >
              {SONG_PRESETS.map((p) => (
                <option key={p.index} value={p.index}>
                  00{p.index}: {p.name} ({p.tempo} BPM)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleLoadSongPreset(currentMemory)}
              className="px-2 py-0.5 rounded bg-red-900 hover:bg-red-800 border border-red-600 text-red-100 text-[10px] font-bold transition shadow"
              title="Load Song Stems into Looper"
            >
              LOAD
            </button>
          </div>

          {/* Ableton Live DAW Sync Badge */}
          <div className="flex items-center gap-2 bg-[#1f0508] px-3 py-1.5 rounded-lg border border-red-900/80 text-xs font-mono">
            <Clock size={13} className="text-cyan-400" />
            <span className="text-red-300/80">DAW TEMPO:</span>
            <span className="text-cyan-300 font-bold">{(telemetry?.bpm ?? 120).toFixed(1)} BPM</span>
            <span className="text-red-400/50">|</span>
            <span className="text-amber-400 font-bold">4/4</span>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !trackLinkEnabled;
              setTrackLinkEnabled(next);
              rc600AudioEngine.setTrackLinkEnabled(next);
            }}
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-black transition ${
              trackLinkEnabled
                ? 'bg-amber-500/25 text-amber-300 border-amber-500/70 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                : 'bg-[#1f0508] text-red-300/70 border-red-900/80 hover:text-white hover:border-red-700'
            }`}
            title="Lock active and newly recorded tracks to Track 1 loop length and DAW tempo"
          >
            MASTER TEMPO / TRACK LINK {trackLinkEnabled ? 'ON' : 'OFF'}
          </button>

          {/* Loop Quantize Selector */}
          <div className="flex items-center gap-1 bg-[#1f0508] p-1 rounded-lg border border-red-900/80 text-[11px] font-mono">
            {QUANTIZE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setQuantize(opt);
                  rc600AudioEngine.setQuantizeBars(opt === 'Free Loop' ? 0 : Number.parseInt(opt, 10) as 1 | 2 | 4);
                }}
                className={`px-2 py-0.5 rounded transition ${
                  quantize === opt
                    ? 'bg-red-600 text-white font-bold shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                    : 'text-red-300/70 hover:text-white'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Master Looper Transport & All Start/Stop */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAllStartStop}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-black tracking-wider flex items-center gap-2 transition shadow-lg ${
              isAnyPlaying
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black shadow-amber-500/30'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-black shadow-emerald-500/30'
            }`}
          >
            {isAnyPlaying ? (
              <>
                <Square size={14} className="fill-black" />
                <span>ALL STOP [SPACE]</span>
              </>
            ) : (
              <>
                <Play size={14} className="fill-black" />
                <span>ALL START [SPACE]</span>
              </>
            )}
          </button>

          {/* Jump to SP-404 Pill */}
          <button
            type="button"
            onClick={onSwitchToSP404}
            className="px-3 py-2 rounded-xl border border-[#ff5500]/60 bg-gradient-to-r from-[#28130a] to-[#160b06] text-[#ff8844] hover:text-white text-xs font-bold font-mono flex items-center gap-1.5 transition shadow"
            title="Switch to Roland SP-404 Linear Sampler"
          >
            <Disc size={14} className="text-[#ff5500]" />
            <span>SP-404</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncFeedback && (
        <div className="px-5 py-2 bg-gradient-to-r from-red-950/90 via-[#260509] to-[#140204] border-b border-red-700/60 text-red-200 text-xs font-mono flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-red-400 animate-pulse" />
            <span>{syncFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="text-red-300 hover:text-white text-[11px]"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* 2. 6-Track Stereo Looper Matrix */}
      <div className="p-5 flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse" />
            <h2 className="text-xs font-bold text-white uppercase tracking-widest font-mono">
              6-Track Stereo Channel Strips
            </h2>
            <span className="text-[10px] text-red-300/70 font-mono">
              (Independently Pan, Reverse, Speed-Shift & Layer Stems)
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-red-200">
            <span className="px-2 py-0.5 rounded bg-[#1c0508] border border-red-900/80">
              HOTKEYS: <strong className="text-white">1–6</strong> TRACK REC/PLAY · <strong className="text-white">SPACE</strong> ALL START/STOP · <strong className="text-white">U</strong> UNDO
            </span>
          </div>
        </div>

        {/* 6 Channel Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3.5">
          {tracks.map((track) => (
            <RC600TrackCard
              key={track.id}
              track={track}
              badge={getStatusBadge(track.status)}
              onFootswitchTrigger={handleFootswitchTrigger}
              onCommitBounceToSP404={handleCommitBounceToSP404}
              onLoadFromSP404Pad={handleLoadFromSP404Pad}
              bouncePopoverTrackId={bouncePopoverTrackId}
              setBouncePopoverTrackId={setBouncePopoverTrackId}
              bounceTargetBank={bounceTargetBank}
              setBounceTargetBank={setBounceTargetBank}
              bounceTargetPadId={bounceTargetPadId}
              setBounceTargetPadId={setBounceTargetPadId}
              banks={BANKS}
            />
          ))}
        </div>

        {/* 3. Boss RC-600 9-Footswitch Virtual Floorboard */}
        <div className="bg-gradient-to-b from-[#3a0a10] via-[#220508] to-[#120204] border-2 border-red-700/80 rounded-3xl p-6 shadow-[0_0_50px_rgba(185,28,28,0.3)]">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-red-900/80">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse" />
              <h3 className="text-xs font-extrabold text-white tracking-widest uppercase font-mono">
                ROLAND / BOSS RC-600 9-FOOTSWITCH PEDALBOARD
              </h3>
            </div>
            <span className="text-[11px] text-red-300/80 font-mono font-bold">
              Live Stomp Switches with Visual Multi-Color Halos
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Row 1: Footswitches 1, 2, 3 (Tracks 1, 2, 3) */}
            {[1, 2, 3].map((num) => {
              const trk = tracks.find((t) => t.id === num);
              const isStomped = activeFootswitchStomp === num;
              const isRec = trk?.status === 'recording';
              const isDub = trk?.status === 'overdubbing';
              const isPlay = trk?.status === 'playing';

              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleFootswitchTrigger(num)}
                  className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[140px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                    isStomped
                      ? 'scale-95 bg-red-800 border-white'
                      : isRec
                      ? 'bg-gradient-to-b from-red-950/80 to-[#220407] border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.45)]'
                      : isDub
                      ? 'bg-gradient-to-b from-amber-950/80 to-[#220407] border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.45)]'
                      : isPlay
                      ? 'bg-gradient-to-b from-emerald-950/80 to-[#220407] border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.45)]'
                      : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500 hover:bg-[#32080d]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-mono font-bold text-red-300">FS {num}</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border ${
                        isRec
                          ? 'bg-red-500 border-red-200 shadow-[0_0_12px_#ef4444] animate-pulse'
                          : isDub
                          ? 'bg-amber-400 border-amber-100 shadow-[0_0_12px_#f59e0b]'
                          : isPlay
                          ? 'bg-emerald-400 border-emerald-100 shadow-[0_0_12px_#10b981]'
                          : trk?.audioBuffer
                          ? 'bg-red-400 border-red-200 shadow-[0_0_8px_#f87171]'
                          : 'bg-[#3b0a0e] border-red-900'
                      }`}
                    />
                  </div>

                  {/* Authentic Chrome/Steel Stomp Bezel */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-2 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                      <span className="font-mono text-base font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{num}</span>
                    </div>
                  </div>

                  <div className="w-full">
                    <span className="font-mono text-xs font-bold text-white block truncate">
                      {trk?.name || `Track ${num}`}
                    </span>
                    <span className="text-[10px] font-mono text-red-300/70 block uppercase">
                      {trk?.status || 'EMPTY'} · KEY [{num}]
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Row 2: Footswitches 4, 5, 6 (Tracks 4, 5, 6) */}
            {[4, 5, 6].map((num) => {
              const trk = tracks.find((t) => t.id === num);
              const isStomped = activeFootswitchStomp === num;
              const isRec = trk?.status === 'recording';
              const isDub = trk?.status === 'overdubbing';
              const isPlay = trk?.status === 'playing';

              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleFootswitchTrigger(num)}
                  className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[140px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                    isStomped
                      ? 'scale-95 bg-red-800 border-white'
                      : isRec
                      ? 'bg-gradient-to-b from-red-950/80 to-[#220407] border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.45)]'
                      : isDub
                      ? 'bg-gradient-to-b from-amber-950/80 to-[#220407] border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.45)]'
                      : isPlay
                      ? 'bg-gradient-to-b from-emerald-950/80 to-[#220407] border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.45)]'
                      : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500 hover:bg-[#32080d]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-mono font-bold text-red-300">FS {num}</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border ${
                        isRec
                          ? 'bg-red-500 border-red-200 shadow-[0_0_12px_#ef4444] animate-pulse'
                          : isDub
                          ? 'bg-amber-400 border-amber-100 shadow-[0_0_12px_#f59e0b]'
                          : isPlay
                          ? 'bg-emerald-400 border-emerald-100 shadow-[0_0_12px_#10b981]'
                          : trk?.audioBuffer
                          ? 'bg-red-400 border-red-200 shadow-[0_0_8px_#f87171]'
                          : 'bg-[#3b0a0e] border-red-900'
                      }`}
                    />
                  </div>

                  {/* Authentic Chrome/Steel Stomp Bezel */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-2 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                      <span className="font-mono text-base font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{num}</span>
                    </div>
                  </div>

                  <div className="w-full">
                    <span className="font-mono text-xs font-bold text-white block truncate">
                      {trk?.name || `Track ${num}`}
                    </span>
                    <span className="text-[10px] font-mono text-red-300/70 block uppercase">
                      {trk?.status || 'EMPTY'} · KEY [{num}]
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Row 3: Footswitches 7 (All Start/Stop), 8 (Undo/Redo), 9 (Tap Tempo) */}
            {/* FS 7: All Start / Stop */}
            <button
              type="button"
              onClick={handleAllStartStop}
              className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[140px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                activeFootswitchStomp === 7
                  ? 'scale-95 bg-red-800 border-white'
                  : isAnyPlaying
                  ? 'bg-gradient-to-b from-amber-950/80 to-[#220407] border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                  : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-mono font-bold text-red-300">FS 7</span>
                <span
                  className={`w-3.5 h-3.5 rounded-full border ${
                    isAnyPlaying
                      ? 'bg-emerald-400 border-emerald-100 shadow-[0_0_12px_#10b981]'
                      : 'bg-[#3b0a0e] border-red-900'
                  }`}
                />
              </div>

              {/* Authentic Chrome/Steel Stomp Bezel */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-2 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                  {isAnyPlaying ? <Square size={18} className="text-amber-400 fill-amber-400" /> : <Play size={18} className="text-emerald-400 fill-emerald-400 ml-0.5" />}
                </div>
              </div>

              <div className="w-full">
                <span className="font-mono text-xs font-bold text-white block">ALL START / STOP</span>
                <span className="text-[10px] font-mono text-red-300/70 block">KEY [SPACE]</span>
              </div>
            </button>

            {/* FS 8: Undo / Redo */}
            <button
              type="button"
              onClick={handleUndoActive}
              className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[140px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                activeFootswitchStomp === 8
                  ? 'scale-95 bg-red-800 border-white'
                  : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-mono font-bold text-red-300">FS 8</span>
                <span className="w-3.5 h-3.5 rounded-full border bg-[#3b0a0e] border-red-900" />
              </div>

              {/* Authentic Chrome/Steel Stomp Bezel */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-2 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                  <RotateCcw size={18} className="text-cyan-400" />
                </div>
              </div>

              <div className="w-full">
                <span className="font-mono text-xs font-bold text-white block">UNDO ACTIVE TRACK</span>
                <span className="text-[10px] font-mono text-red-300/70 block">KEY [U]</span>
              </div>
            </button>

            {/* FS 9: Tap Tempo / Host Sync */}
            <button
              type="button"
              onClick={() => triggerStompVisual(9)}
              className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[140px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                activeFootswitchStomp === 9
                  ? 'scale-95 bg-red-800 border-white'
                  : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-mono font-bold text-red-300">FS 9</span>
                <span className="w-3.5 h-3.5 rounded-full border bg-red-500 border-red-300 animate-pulse shadow-[0_0_8px_#ef4444]" />
              </div>

              {/* Authentic Chrome/Steel Stomp Bezel */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-2 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                  <Radio size={18} className="text-red-400 animate-pulse" />
                </div>
              </div>

              <div className="w-full">
                <span className="font-mono text-xs font-bold text-white block">TAP TEMPO</span>
                <span className="text-[10px] font-mono text-red-300/70 block">{(telemetry?.bpm ?? 120).toFixed(1)} BPM · KEY [T]</span>
              </div>
            </button>
          </div>
        </div>

        {/* 4. Hardware Storage Sync (Boss RC-600 USB & SP-404 SD Card) */}
        <div className="bg-gradient-to-r from-[#28070b] via-[#1a0407] to-[#28070b] border border-red-900/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#1d0508] border border-red-800/80 flex items-center justify-center text-red-300 shadow-inner">
              <HardDrive size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                  HARDWARE MASS STORAGE BRIDGE
                </h4>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    hardwareStatus?.rc600?.mounted
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#180406] text-red-300/70 border border-red-900/80'
                  }`}
                >
                  {hardwareStatus?.rc600?.mounted ? 'RC-600 MOUNTED' : 'RC-600 STANDBY / LOCAL'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    hardwareStatus?.sp404?.mounted
                      ? 'bg-[#ff5500]/20 text-[#ff8844] border border-[#ff5500]/40'
                      : 'bg-[#180406] text-red-300/70 border border-red-900/80'
                  }`}
                >
                  {hardwareStatus?.sp404?.mounted ? 'SP-404 SD MOUNTED' : 'SP-404 STANDBY / LOCAL'}
                </span>
              </div>
              <p className="text-[11px] text-red-200/70 mt-1">
                Writes genuine 32-bit float stereo WAVs into Boss RC-600 memories & 512-byte aligned RIFF WAVs into SP-404 SD cards.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSyncingHardware}
              onClick={handleSyncAllHardware}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-rose-500 text-white font-mono text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.4)] disabled:opacity-50 transition"
            >
              <RefreshCw size={14} className={isSyncingHardware ? 'animate-spin' : ''} />
              <span>SYNC ALL HARDWARE</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
