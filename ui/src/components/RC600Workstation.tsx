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

export type RC600PedalMode = 'mode1' | 'mode2' | 'mode3';

export const RC600Workstation: React.FC<RC600WorkstationProps> = ({
  onSwitchToPedalLab,
  onSwitchToSP404,
  onSwitchToPerformance,
  onSwitchToState,
  onOpenRoutingModal,
  telemetry
}) => {
  const [tracks, setTracks] = useState<RC600Track[]>(() => rc600AudioEngine.getTracks());
  const [pedalMode, setPedalMode] = useState<RC600PedalMode>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('pedal_mode') || params.get('mode');
      if (mode === 'mode1' || mode === 'mode2' || mode === 'mode3') {
        return mode as RC600PedalMode;
      }
    } catch {}
    return 'mode1';
  });
  const [focusedTrackId, setFocusedTrackId] = useState<number>(1);
  const [inputFxState, setInputFxState] = useState({ a: false, b: false, c: false });
  const [trackFxState, setTrackFxState] = useState({ a: false, b: false, c: false });
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

  const triggerStompVisual = (fsNumber: number) => {
    setActiveFootswitchStomp(fsNumber);
    setTimeout(() => {
      setActiveFootswitchStomp((curr) => (curr === fsNumber ? null : curr));
    }, 180);
  };

  const cyclePedalMode = () => {
    triggerStompVisual(7);
    setPedalMode((curr) => {
      const next = curr === 'mode1' ? 'mode2' : curr === 'mode2' ? 'mode3' : 'mode1';
      const label =
        next === 'mode1'
          ? 'Mode 1: Tracks 1–3 (White LED)'
          : next === 'mode2'
          ? 'Mode 2: Tracks 4–6 (Red LED)'
          : 'Mode 3: FX Control (Blue LED)';
      setSyncFeedback(`Pedalboard switched to ${label}`);
      setTimeout(() => setSyncFeedback(null), 3000);
      return next;
    });
  };

  const handleFootswitchTrigger = (trackId: number) => {
    const fsNum = trackId <= 3 ? trackId : trackId - 3;
    triggerStompVisual(fsNum);
    setFocusedTrackId(trackId);
    rc600AudioEngine.triggerFootswitch(trackId);
    refreshTracks();
  };

  const handleStopTrack = (trackId: number) => {
    const fsNum = (trackId <= 3 ? trackId : trackId - 3) + 3;
    triggerStompVisual(fsNum);
    rc600AudioEngine.stopTrack(trackId);
    refreshTracks();
  };

  const handleClearTrack = (trackId: number) => {
    const fsNum = (trackId <= 3 ? trackId : trackId - 3) + 3;
    triggerStompVisual(fsNum);
    rc600AudioEngine.clearTrack(trackId);
    refreshTracks();
    setSyncFeedback(`Cleared Track ${trackId}`);
    setTimeout(() => setSyncFeedback(null), 2500);
  };

  const isAnyPlaying = tracks.some((t) => t.status === 'playing' || t.status === 'overdubbing');

  const handleAllStartStop = () => {
    triggerStompVisual(9);
    if (isAnyPlaying) {
      rc600AudioEngine.allStop();
    } else {
      rc600AudioEngine.allStart();
    }
    refreshTracks();
  };

  const handleUndoFocused = () => {
    triggerStompVisual(8);
    rc600AudioEngine.undoTrack(focusedTrackId);
    refreshTracks();
    setSyncFeedback(`Undo applied to Track ${focusedTrackId}`);
    setTimeout(() => setSyncFeedback(null), 2500);
  };

  const toggleInputFx = (key: 'a' | 'b' | 'c', fsNum: number) => {
    triggerStompVisual(fsNum);
    setInputFxState((prev) => {
      const next = !prev[key];
      const names = { a: 'Dub Delay', b: 'Space Reverb', c: 'Pitch Shift' };
      setSyncFeedback(`Input FX ${key.toUpperCase()} (${names[key]}): ${next ? 'ENGAGED' : 'BYPASS'}`);
      setTimeout(() => setSyncFeedback(null), 2500);
      return { ...prev, [key]: next };
    });
  };

  const toggleTrackFx = (key: 'a' | 'b' | 'c', fsNum: number) => {
    triggerStompVisual(fsNum);
    setTrackFxState((prev) => {
      const next = !prev[key];
      const names = { a: 'Resonant Filter', b: 'Beat Repeat', c: 'Vinyl Warp' };
      setSyncFeedback(`Track FX ${key.toUpperCase()} (${names[key]}): ${next ? 'ENGAGED' : 'BYPASS'}`);
      setTimeout(() => setSyncFeedback(null), 2500);
      return { ...prev, [key]: next };
    });
  };

  // Keyboard shortcut listener matching authentic Boss RC-600 hardware logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const key = e.key.toLowerCase();
      if (key === '1' || key === '2' || key === '3') {
        e.preventDefault();
        const col = parseInt(key, 10) as 1 | 2 | 3;
        if (pedalMode === 'mode1') handleFootswitchTrigger(col);
        else if (pedalMode === 'mode2') handleFootswitchTrigger(col + 3);
        else if (pedalMode === 'mode3') {
          const fxKeys: ('a' | 'b' | 'c')[] = ['a', 'b', 'c'];
          toggleInputFx(fxKeys[col - 1], col);
        }
      } else if (key === '4' || key === '5' || key === '6') {
        e.preventDefault();
        const col = (parseInt(key, 10) - 3) as 1 | 2 | 3;
        if (pedalMode === 'mode1') handleStopTrack(col);
        else if (pedalMode === 'mode2') handleStopTrack(col + 3);
        else if (pedalMode === 'mode3') {
          const fxKeys: ('a' | 'b' | 'c')[] = ['a', 'b', 'c'];
          toggleTrackFx(fxKeys[col - 1], col + 3);
        }
      } else if (key === '7' || key === 'm') {
        e.preventDefault();
        cyclePedalMode();
      } else if (key === '8' || key === 'u') {
        e.preventDefault();
        if (pedalMode === 'mode3') {
          triggerStompVisual(8);
        } else {
          handleUndoFocused();
        }
      } else if (key === '9' || e.code === 'Space') {
        e.preventDefault();
        handleAllStartStop();
      } else if (key === 't') {
        e.preventDefault();
        triggerStompVisual(8);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracks, pedalMode, focusedTrackId]);

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
            <span className="px-2.5 py-1 rounded-lg bg-[#1c0508] border border-red-900/80 shadow-sm">
              HOTKEYS: <strong className="text-white">[1–3]</strong> REC/PLAY · <strong className="text-white">[4–6]</strong> STOP · <strong className="text-white">[7/M]</strong> BANK SELECT · <strong className="text-white">[8/U]</strong> UNDO · <strong className="text-white">[SPACE]</strong> ALL START/STOP
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
              isPedalboardActive={
                (pedalMode === 'mode1' && track.id <= 3) ||
                (pedalMode === 'mode2' && track.id >= 4 && track.id <= 6)
              }
              pedalRecNum={track.id <= 3 ? track.id : track.id - 3}
              pedalStopNum={track.id <= 3 ? track.id + 3 : track.id}
              isFocused={focusedTrackId === track.id}
              onSelectFocus={(id) => setFocusedTrackId(id)}
            />
          ))}
        </div>

        {/* 3. Boss RC-600 9-Footswitch Virtual Floorboard */}
        <div className="bg-gradient-to-b from-[#3a0a10] via-[#220508] to-[#120204] border-2 border-red-700/80 rounded-3xl p-6 shadow-[0_0_50px_rgba(185,28,28,0.3)]">
          <div className="flex flex-wrap items-center justify-between pb-4 mb-5 border-b border-red-900/80 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse" />
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-widest uppercase font-mono flex items-center gap-2">
                  <span>ROLAND / BOSS RC-600 9-FOOTSWITCH PEDALBOARD</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-950/80 border border-red-800 text-red-300 font-normal">
                    3 ROWS × 3 COLUMNS · DUAL-LAYER TRACK ARCHITECTURE
                  </span>
                </h3>
                <p className="text-[11px] text-red-300/80 font-mono mt-0.5">
                  Matches Factory RC-600 Hardware: Dedicated REC/PLAY (Row 3) & STOP (Row 2) per Track + Mode/Bank Cycling (Row 1)
                </p>
              </div>
            </div>

            {/* Mode Indicator & Direct Selector Pills */}
            <div className="flex items-center gap-2 bg-[#170305] p-1.5 rounded-xl border border-red-900/80 shadow-inner">
              <span className="text-[10px] font-mono font-bold text-red-300/80 px-1 uppercase">PEDAL MODE:</span>
              <button
                type="button"
                onClick={() => {
                  setPedalMode('mode1');
                  triggerStompVisual(7);
                }}
                className={`px-3 py-1 rounded-lg font-mono text-[10px] font-black transition flex items-center gap-1.5 ${
                  pedalMode === 'mode1'
                    ? 'bg-white text-black shadow-[0_0_14px_rgba(255,255,255,0.7)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="Mode 1: Footswitches control Tracks 1–3"
              >
                <span className={`w-2 h-2 rounded-full ${pedalMode === 'mode1' ? 'bg-black' : 'bg-white'}`} />
                <span>MODE 1 (TRK 1–3)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPedalMode('mode2');
                  triggerStompVisual(7);
                }}
                className={`px-3 py-1 rounded-lg font-mono text-[10px] font-black transition flex items-center gap-1.5 ${
                  pedalMode === 'mode2'
                    ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.7)]'
                    : 'text-red-400/70 hover:text-red-200 hover:bg-red-950/40'
                }`}
                title="Mode 2: Footswitches control Tracks 4–6"
              >
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span>MODE 2 (TRK 4–6)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPedalMode('mode3');
                  triggerStompVisual(7);
                }}
                className={`px-3 py-1 rounded-lg font-mono text-[10px] font-black transition flex items-center gap-1.5 ${
                  pedalMode === 'mode3'
                    ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.7)]'
                    : 'text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/40'
                }`}
                title="Mode 3: Footswitches control Input & Track FX"
              >
                <span className={`w-2 h-2 rounded-full ${pedalMode === 'mode3' ? 'bg-black' : 'bg-cyan-400'}`} />
                <span>MODE 3 (FX)</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* ============================================================== */}
            {/* ROW 1: TOP ROW (NAVIGATIONAL & GLOBAL MASTER CONTROLS)         */}
            {/* ============================================================== */}
            <div>
              <div className="text-[10px] font-mono font-bold text-red-300/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>TOP ROW · NAVIGATIONAL & GLOBAL CONTROLS</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* FS 7: TRACK SELECT / PEDAL MODE */}
                <button
                  type="button"
                  onClick={cyclePedalMode}
                  className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[145px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                    activeFootswitchStomp === 7
                      ? 'scale-95 bg-red-800 border-white'
                      : pedalMode === 'mode1'
                      ? 'bg-gradient-to-b from-[#2a080d] to-[#140306] border-white/80 shadow-[0_0_20px_rgba(255,255,255,0.25)]'
                      : pedalMode === 'mode2'
                      ? 'bg-gradient-to-b from-red-950/90 to-[#220407] border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.4)]'
                      : 'bg-gradient-to-b from-cyan-950/80 to-[#120306] border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-mono font-black text-red-200">FS 7 · TRACK SELECT</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border ${
                        pedalMode === 'mode1'
                          ? 'bg-white border-zinc-300 shadow-[0_0_12px_#ffffff]'
                          : pedalMode === 'mode2'
                          ? 'bg-red-500 border-red-200 shadow-[0_0_12px_#ef4444]'
                          : 'bg-cyan-400 border-cyan-200 shadow-[0_0_12px_#22d3ee]'
                      }`}
                    />
                  </div>

                  {/* Authentic Chrome/Steel Stomp Bezel with Mode-Colored Center */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                    <div
                      className={`w-12 h-12 rounded-full border flex items-center justify-center shadow-inner ${
                        pedalMode === 'mode1'
                          ? 'bg-gradient-to-b from-zinc-200 to-zinc-400 border-white text-black'
                          : pedalMode === 'mode2'
                          ? 'bg-gradient-to-b from-red-700 to-red-900 border-red-400 text-white'
                          : 'bg-gradient-to-b from-cyan-600 to-cyan-900 border-cyan-300 text-white'
                      }`}
                    >
                      <Layers size={18} />
                    </div>
                  </div>

                  <div className="w-full">
                    <span className="font-mono text-xs font-black text-white block">
                      {pedalMode === 'mode1'
                        ? 'MODE 1: TRK 1–3 (WHITE)'
                        : pedalMode === 'mode2'
                        ? 'MODE 2: TRK 4–6 (RED)'
                        : 'MODE 3: FX CONTROL (BLUE)'}
                    </span>
                    <span className="text-[10px] font-mono text-red-300/80 block mt-0.5">
                      KEY [7 / M] · TAP TO CYCLE BANK
                    </span>
                  </div>
                </button>

                {/* FS 8: UNDO / REDO (Modes 1 & 2) OR TAP TEMPO (Mode 3) */}
                {pedalMode === 'mode3' ? (
                  <button
                    type="button"
                    onClick={() => triggerStompVisual(8)}
                    className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[145px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                      activeFootswitchStomp === 8
                        ? 'scale-95 bg-red-800 border-white'
                        : 'bg-gradient-to-b from-[#240609] to-[#130204] border-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:border-cyan-400'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-mono font-black text-cyan-300">FS 8 · TAP TEMPO</span>
                      <span className="w-3.5 h-3.5 rounded-full border bg-cyan-400 border-cyan-200 shadow-[0_0_12px_#22d3ee] animate-pulse" />
                    </div>

                    <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-b from-cyan-800 to-cyan-950 border border-cyan-400 flex items-center justify-center shadow-inner">
                        <Radio size={18} className="text-cyan-300 animate-pulse" />
                      </div>
                    </div>

                    <div className="w-full">
                      <span className="font-mono text-xs font-black text-white block">TAP TEMPO / SYNC</span>
                      <span className="text-[10px] font-mono text-cyan-300/80 block mt-0.5">
                        {(telemetry?.bpm ?? 120).toFixed(1)} BPM · KEY [T]
                      </span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleUndoFocused}
                    className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[145px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                      activeFootswitchStomp === 8
                        ? 'scale-95 bg-red-800 border-white'
                        : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500 shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-mono font-black text-red-300">FS 8 · CUR.TRK UNDO</span>
                      <span
                        className={`w-3.5 h-3.5 rounded-full border ${
                          tracks[focusedTrackId - 1]?.undoBuffer
                            ? 'bg-cyan-400 border-cyan-100 shadow-[0_0_10px_#22d3ee]'
                            : 'bg-[#3b0a0e] border-red-900'
                        }`}
                      />
                    </div>

                    <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                        <RotateCcw size={18} className="text-cyan-400" />
                      </div>
                    </div>

                    <div className="w-full">
                      <span className="font-mono text-xs font-black text-white block">UNDO / REDO</span>
                      <span className="text-[10px] font-mono text-cyan-300 block mt-0.5">
                        TARGET: T{focusedTrackId} ({tracks[focusedTrackId - 1]?.name.replace(/^Track \d+:\s*/, '').slice(0, 10)}) · KEY [8/U]
                      </span>
                    </div>
                  </button>
                )}

                {/* FS 9: ALL START / STOP */}
                <button
                  type="button"
                  onClick={handleAllStartStop}
                  className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[145px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                    activeFootswitchStomp === 9
                      ? 'scale-95 bg-red-800 border-white'
                      : isAnyPlaying
                      ? 'bg-gradient-to-b from-amber-950/90 to-[#220407] border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.4)]'
                      : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-mono font-black text-red-300">FS 9 · ALL START / STOP</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border ${
                        isAnyPlaying
                          ? 'bg-amber-400 border-amber-100 shadow-[0_0_12px_#f59e0b]'
                          : 'bg-emerald-400 border-emerald-100 shadow-[0_0_12px_#10b981]'
                      }`}
                    />
                  </div>

                  <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                      {isAnyPlaying ? (
                        <Square size={18} className="text-amber-400 fill-amber-400" />
                      ) : (
                        <Play size={18} className="text-emerald-400 fill-emerald-400 ml-0.5" />
                      )}
                    </div>
                  </div>

                  <div className="w-full">
                    <span className="font-mono text-xs font-black text-white block">
                      {isAnyPlaying ? 'ALL STOP' : 'ALL START'}
                    </span>
                    <span className="text-[10px] font-mono text-red-300/80 block mt-0.5">
                      GLOBAL 6-TRACK TRANSPORT · KEY [SPACE]
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* ============================================================== */}
            {/* ROW 2: MIDDLE ROW (DEDICATED STOP / CLEAR SWITCHES)            */}
            {/* ============================================================== */}
            <div>
              <div className="text-[10px] font-mono font-bold text-red-300/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>
                  MIDDLE ROW ·{' '}
                  {pedalMode === 'mode3'
                    ? 'TRACK FX CONTROL (FS 4–6)'
                    : `DEDICATED STOP / CLEAR SWITCHES (FS 4–6) · ${pedalMode === 'mode1' ? 'TRACKS 1–3' : 'TRACKS 4–6'}`}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((colIndex) => {
                  const fsNum = colIndex + 3; // FS 4, FS 5, FS 6
                  const trackId = pedalMode === 'mode1' ? colIndex : colIndex + 3;
                  const trk = tracks.find((t) => t.id === trackId);
                  const isStomped = activeFootswitchStomp === fsNum;

                  if (pedalMode === 'mode3') {
                    const fxLabels = ['FILTER', 'BEAT REPEAT', 'CHOP/GATE'];
                    const fxKeys: ('a' | 'b' | 'c')[] = ['a', 'b', 'c'];
                    const fxKey = fxKeys[colIndex - 1];
                    const isFxActive = trackFxState[fxKey];

                    return (
                      <button
                        key={fsNum}
                        type="button"
                        onClick={() => toggleTrackFx(fxKey, fsNum)}
                        className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[145px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                          isStomped
                            ? 'scale-95 bg-cyan-800 border-white'
                            : isFxActive
                            ? 'bg-gradient-to-b from-cyan-950/80 to-[#220407] border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
                            : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-cyan-500'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] font-mono font-black text-cyan-300">
                            FS {fsNum} · TRK FX {String.fromCharCode(64 + colIndex)}
                          </span>
                          <span
                            className={`w-3.5 h-3.5 rounded-full border ${
                              isFxActive
                                ? 'bg-cyan-400 border-cyan-100 shadow-[0_0_12px_#22d3ee]'
                                : 'bg-[#3b0a0e] border-red-900'
                            }`}
                          />
                        </div>

                        <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                            <span className="font-mono text-base font-black text-white">{fsNum}</span>
                          </div>
                        </div>

                        <div className="w-full">
                          <span className="font-mono text-xs font-black text-white block">
                            {fxLabels[colIndex - 1]}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-300/80 block mt-0.5 uppercase">
                            {isFxActive ? 'ENGAGED' : 'BYPASS'} · KEY [{fsNum}]
                          </span>
                        </div>
                      </button>
                    );
                  }

                  const isPlayingOrRec =
                    trk?.status === 'playing' || trk?.status === 'recording' || trk?.status === 'overdubbing';

                  return (
                    <button
                      key={fsNum}
                      type="button"
                      onClick={() => handleStopTrack(trackId)}
                      className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[145px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                        isStomped
                          ? 'scale-95 bg-red-800 border-white'
                          : isPlayingOrRec
                          ? 'bg-gradient-to-b from-amber-950/80 to-[#220407] border-amber-500/90 shadow-[0_0_25px_rgba(245,158,11,0.35)]'
                          : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[11px] font-mono font-black text-red-300">
                          FS {fsNum} · T{trackId} STOP
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearTrack(trackId);
                            }}
                            className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold bg-red-950/90 hover:bg-red-800 text-red-300 border border-red-700 cursor-pointer"
                            title="Clear this track's recorded phrase"
                          >
                            CLEAR
                          </span>
                          <span
                            className={`w-3.5 h-3.5 rounded-full border ${
                              isPlayingOrRec
                                ? 'bg-amber-400 border-amber-100 shadow-[0_0_12px_#f59e0b]'
                                : 'bg-[#3b0a0e] border-red-900'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Stomp Bezel with Square Stop Indicator */}
                      <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                          <Square size={16} className={isPlayingOrRec ? 'text-amber-400 fill-amber-400' : 'text-zinc-400'} />
                        </div>
                      </div>

                      <div className="w-full">
                        <span className="font-mono text-xs font-black text-white block truncate">
                          {trk?.name || `Track ${trackId}`}
                        </span>
                        <span className="text-[10px] font-mono text-red-300/80 block mt-0.5 uppercase">
                          {trk?.status || 'EMPTY'} · TAP: STOP · KEY [{fsNum}]
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ============================================================== */}
            {/* ROW 3: BOTTOM ROW (DEDICATED REC / PLAY / DUB SWITCHES)        */}
            {/* ============================================================== */}
            <div>
              <div className="text-[10px] font-mono font-bold text-red-300/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>
                  BOTTOM ROW ·{' '}
                  {pedalMode === 'mode3'
                    ? 'INPUT FX CONTROL (FS 1–3)'
                    : `DEDICATED REC / PLAY / OVERDUB SWITCHES (FS 1–3) · ${pedalMode === 'mode1' ? 'TRACKS 1–3' : 'TRACKS 4–6'}`}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((colIndex) => {
                  const fsNum = colIndex; // FS 1, FS 2, FS 3
                  const trackId = pedalMode === 'mode1' ? colIndex : colIndex + 3;
                  const trk = tracks.find((t) => t.id === trackId);
                  const isStomped = activeFootswitchStomp === fsNum;

                  if (pedalMode === 'mode3') {
                    const fxLabels = ['DUB DELAY', 'SPACE REVERB', 'PITCH SHIFT'];
                    const fxKeys: ('a' | 'b' | 'c')[] = ['a', 'b', 'c'];
                    const fxKey = fxKeys[colIndex - 1];
                    const isFxActive = inputFxState[fxKey];

                    return (
                      <button
                        key={fsNum}
                        type="button"
                        onClick={() => toggleInputFx(fxKey, fsNum)}
                        className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[145px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                          isStomped
                            ? 'scale-95 bg-cyan-800 border-white'
                            : isFxActive
                            ? 'bg-gradient-to-b from-cyan-950/80 to-[#220407] border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
                            : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-cyan-500'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] font-mono font-black text-cyan-300">
                            FS {fsNum} · INPUT FX {String.fromCharCode(64 + colIndex)}
                          </span>
                          <span
                            className={`w-3.5 h-3.5 rounded-full border ${
                              isFxActive
                                ? 'bg-cyan-400 border-cyan-100 shadow-[0_0_12px_#22d3ee]'
                                : 'bg-[#3b0a0e] border-red-900'
                            }`}
                          />
                        </div>

                        <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border border-zinc-400 flex items-center justify-center shadow-inner">
                            <span className="font-mono text-base font-black text-white">{fsNum}</span>
                          </div>
                        </div>

                        <div className="w-full">
                          <span className="font-mono text-xs font-black text-white block">
                            {fxLabels[colIndex - 1]}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-300/80 block mt-0.5 uppercase">
                            {isFxActive ? 'ENGAGED' : 'BYPASS'} · KEY [{fsNum}]
                          </span>
                        </div>
                      </button>
                    );
                  }

                  const isRec = trk?.status === 'recording';
                  const isDub = trk?.status === 'overdubbing';
                  const isPlay = trk?.status === 'playing';

                  return (
                    <button
                      key={fsNum}
                      type="button"
                      onClick={() => handleFootswitchTrigger(trackId)}
                      className={`relative p-5 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[145px] transition-all duration-75 text-center group cursor-pointer shadow-lg select-none ${
                        isStomped
                          ? 'scale-95 bg-red-800 border-white'
                          : isRec
                          ? 'bg-gradient-to-b from-red-950/90 to-[#220407] border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.5)]'
                          : isDub
                          ? 'bg-gradient-to-b from-amber-950/90 to-[#220407] border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.5)]'
                          : isPlay
                          ? 'bg-gradient-to-b from-emerald-950/90 to-[#220407] border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                          : 'bg-gradient-to-b from-[#240609] to-[#130204] border-red-900/80 hover:border-red-500 hover:bg-[#32080d]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[11px] font-mono font-black text-red-200">
                          FS {fsNum} · T{trackId} REC/PLAY
                        </span>
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

                      {/* Stomp Bezel with Dynamic Color Halo */}
                      <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#d4d4d8] via-[#a1a1aa] to-[#52525b] border-2 border-zinc-200 flex items-center justify-center my-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] group-hover:border-white transition transform group-hover:scale-105">
                        <div
                          className={`w-12 h-12 rounded-full border flex items-center justify-center shadow-inner ${
                            isRec
                              ? 'bg-red-600 border-red-300 text-white'
                              : isDub
                              ? 'bg-amber-500 border-amber-200 text-black'
                              : isPlay
                              ? 'bg-emerald-500 border-emerald-200 text-black'
                              : 'bg-gradient-to-b from-[#71717a] via-[#3f3f46] to-[#18181b] border-zinc-400 text-white'
                          }`}
                        >
                          <span className="font-mono text-base font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            {fsNum}
                          </span>
                        </div>
                      </div>

                      <div className="w-full">
                        <span className="font-mono text-xs font-black text-white block truncate">
                          {trk?.name || `Track ${trackId}`}
                        </span>
                        <span className="text-[10px] font-mono text-red-300/80 block mt-0.5 uppercase">
                          {trk?.status || 'EMPTY'} · TAP CYCLE · KEY [{fsNum}]
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
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
