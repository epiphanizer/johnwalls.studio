import React, { useState, useEffect, useRef } from 'react';
import {
  Disc,
  Sliders,
  Sparkles,
  RotateCcw,
  Music,
  Download,
  Mic,
  Repeat,
  Square,
  Upload,
  ChevronDown,
  Trash2,
  Volume2,
  GitBranch,
  Activity
} from 'lucide-react';
import { AudioKnob } from './AudioKnob';
import { StateTelemetry } from '../types';
import {
  sp404AudioEngine,
  BankLetter,
  MFXType,
  SP404Pad,
  type NativeSP404State,
  type SP404TransferProgress
} from './SP404AudioEngine';
import {
  SP404_LEGACY_PROFILE,
  SP404_LEGACY_PROFILES,
  type SP404HardwareProfileId,
  type SP404LibraryManifest
} from '../utils/sp404Library';
import { hasJuceNativeHost } from '../utils/nativeTransport';
import { summarizeSP404CardValidation, validateSP404CardFiles } from '../utils/sp404CardValidation';

interface SP404WorkstationProps {
  onSwitchToPedalLab: () => void;
  onSwitchToState?: () => void;
  onOpenRoutingModal?: () => void;
  telemetry?: StateTelemetry;
}

const CHROMATIC_NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

const PAD_SUB_LABELS = [
  'HOLD', 'EXT SOURCE', 'SUB PAD', 'REVERSE',
  'CHOP', 'PITCH/SPEED', 'AUTO SYNC', 'LOOP/GATE',
  'BEND -', 'BEND +', 'ROLL', 'MARK'
];

export const SP404Workstation: React.FC<SP404WorkstationProps> = ({
  onSwitchToPedalLab,
  onSwitchToState,
  onOpenRoutingModal,
  telemetry
}) => {
  const [activeBank, setActiveBank] = useState<BankLetter>('A');
  const [activeEffect, setActiveEffect] = useState<MFXType>('vinyl');
  const [isVinyl33Rpm, setIsVinyl33Rpm] = useState<boolean>(true);

  // Rotary knobs state
  const [volume, setVolume] = useState<number>(8.5);
  const [ctrl1, setCtrl1] = useState<number>(6.5);
  const [ctrl2, setCtrl2] = useState<number>(4.0);
  const [ctrl3, setCtrl3] = useState<number>(8.0);

  // Global Transpose & Chromatic Mode
  const [globalTranspose, setGlobalTranspose] = useState<number>(0);
  const [isChromaticMode, setIsChromaticMode] = useState<boolean>(false);
  const [chromaticOctave] = useState<number>(3); // Base octave C3
  const [selectedPadId, setSelectedPadId] = useState<number>(1);

  // Simultaneous Recording & Resampling State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordMode, setRecordMode] = useState<'ext_in' | 'resample'>('ext_in');
  const [recordingElapsedMs, setRecordingElapsedMs] = useState<number>(0);
  const [armedRecordPad, setArmedRecordPad] = useState<{ bank: BankLetter; id: number } | null>(null);

  // Memory Card Notification / Status
  const [cardStatusMessage, setCardStatusMessage] = useState<string>('LEGACY CARD WORKFLOW · 120 SLOTS');
  const [hardwareProfileId, setHardwareProfileId] = useState<SP404HardwareProfileId>(SP404_LEGACY_PROFILE.id);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [libraryName, setLibraryName] = useState<string>('Untitled SP-404 Set');
  const [libraries, setLibraries] = useState<SP404LibraryManifest[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [nativeStateReady, setNativeStateReady] = useState<boolean>(() => !hasJuceNativeHost());
  const [transferProgress, setTransferProgress] = useState<SP404TransferProgress | null>(null);

  // Edit Pad Details Drawer
  const [editingPad, setEditingPad] = useState<SP404Pad | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  // Force re-render on engine state change with safe unmount guard
  const [, setTick] = useState(0);
  useEffect(() => {
    let isMounted = true;
    const nativeHost = hasJuceNativeHost();
    sp404AudioEngine.setOnStateChange(() => {
      if (isMounted) {
        setTick((t) => t + 1);
        setIsRecording(sp404AudioEngine.getIsRecording());
      }
    });
    sp404AudioEngine.setOnRecordingProgress((ms) => {
      if (isMounted) {
        setRecordingElapsedMs(ms);
      }
    });
    sp404AudioEngine.setOnNativeState((state: NativeSP404State) => {
      if (!isMounted) return;
      setVolume(state.volume);
      setActiveEffect((['vinyl', 'djfx', 'isolator', 'cassette', 'filter', 'pitch'][state.activeMfx] || 'vinyl') as MFXType);
      setCtrl1(state.ctrl1);
      setCtrl2(state.ctrl2);
      setCtrl3(state.ctrl3);
      setIsChromaticMode(state.chromatic);
      setNativeStateReady(true);
      setCardStatusMessage('NATIVE SP-404 STATE RESTORED · UI HYDRATED');
    });
    sp404AudioEngine.setOnTransferProgress((progress) => {
      if (isMounted) setTransferProgress(progress.phase === 'complete' || progress.phase === 'cancelled' || progress.phase === 'error' ? null : progress);
    });

    // Initialize audio context on mount safely
    sp404AudioEngine.initAudio();
    sp404AudioEngine.listLibraries().then(setLibraries).catch(() => setLibraries([]));
    const nativeStateFallback = nativeHost
      ? window.setTimeout(() => setNativeStateReady(true), 1000)
      : null;

    return () => {
      isMounted = false;
      if (nativeStateFallback) window.clearTimeout(nativeStateFallback);
      sp404AudioEngine.stopAllPads();
      sp404AudioEngine.cancelSampleTransfers();
      sp404AudioEngine.setOnStateChange(() => {});
      sp404AudioEngine.setOnRecordingProgress(() => {});
      sp404AudioEngine.setOnNativeState(() => {});
      sp404AudioEngine.setOnTransferProgress(() => {});
      if (sp404AudioEngine.getIsRecording()) {
        sp404AudioEngine.stopRecording();
      }
    };
  }, []);

  const nativeControlsReady = !hasJuceNativeHost() || nativeStateReady;

  // Sync MFX & Volume controls to engine
  useEffect(() => {
    if (!nativeControlsReady) return;
    sp404AudioEngine.setVolume(volume);
  }, [volume, nativeControlsReady]);

  useEffect(() => {
    if (!nativeControlsReady) return;
    sp404AudioEngine.setMFXType(activeEffect);
  }, [activeEffect, nativeControlsReady]);

  useEffect(() => {
    if (!nativeControlsReady) return;
    sp404AudioEngine.setCtrl1(ctrl1);
  }, [ctrl1, nativeControlsReady]);

  useEffect(() => {
    if (!nativeControlsReady) return;
    sp404AudioEngine.setCtrl2(ctrl2);
  }, [ctrl2, nativeControlsReady]);

  useEffect(() => {
    if (!nativeControlsReady) return;
    sp404AudioEngine.setCtrl3(ctrl3);
  }, [ctrl3, nativeControlsReady]);

  useEffect(() => {
    if (!nativeControlsReady) return;
    sp404AudioEngine.setVinylRpm(isVinyl33Rpm);
  }, [isVinyl33Rpm, nativeControlsReady]);

  useEffect(() => {
    if (!nativeControlsReady) return;
    sp404AudioEngine.setGlobalTranspose(globalTranspose);
  }, [globalTranspose, nativeControlsReady]);

  useEffect(() => {
    if (!nativeControlsReady) return;
    sp404AudioEngine.setChromaticMode(isChromaticMode, activeBank, selectedPadId);
  }, [isChromaticMode, activeBank, selectedPadId, nativeControlsReady]);

  // Current Bank Pads
  const currentPads = sp404AudioEngine.getBank(activeBank).slice(0, SP404_LEGACY_PROFILE.padsPerBank);

  // Handle Triggering Pads
  const handlePadPress = (padId: number) => {
    setSelectedPadId(padId);

    // If an arming target is waiting and user clicks it, toggle record
    if (armedRecordPad && armedRecordPad.bank === activeBank && armedRecordPad.id === padId) {
      if (isRecording) {
        handleStopRecording();
      } else {
        handleStartRecording();
      }
      return;
    }

    if (isChromaticMode) {
      sp404AudioEngine.triggerPad(activeBank, padId, (padId - 1) - 12);
    } else {
      sp404AudioEngine.triggerPad(activeBank, padId);
    }
  };

  const handlePadRelease = (padId: number) => {
    sp404AudioEngine.releasePad(activeBank, padId);
  };

  // Keyboard triggering shortcuts for live playing (1-4, Q-R, A-F, Z-V)
  const keyMap: Record<string, number> = {
    '1': 1, '2': 2, '3': 3, '4': 4,
    'q': 5, 'w': 6, 'e': 7, 'r': 8,
    'a': 9, 's': 10, 'd': 11, 'f': 12
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const padId = keyMap[key];
      if (padId && !e.repeat) {
        handlePadPress(padId);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const padId = keyMap[key];
      if (padId) {
        handlePadRelease(padId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeBank, isChromaticMode, armedRecordPad, isRecording]);

  // Simultaneous Recording & Resampling Handlers
  const handleArmRecord = (mode: 'ext_in' | 'resample') => {
    if (isRecording) {
      handleStopRecording();
      return;
    }

    setRecordMode(mode);
    setArmedRecordPad({ bank: activeBank, id: selectedPadId });
    setCardStatusMessage(
      mode === 'ext_in'
        ? `ARMED PAD ${activeBank}${selectedPadId}: Click START REC to record live input while playing pads!`
        : `ARMED PAD ${activeBank}${selectedPadId}: Click START REC to resample pad playback!`
    );
  };

  const handleStartRecording = async () => {
    if (!armedRecordPad) return;
    const ok = await sp404AudioEngine.startRecording(armedRecordPad.bank, armedRecordPad.id, recordMode);
    if (ok) {
      setIsRecording(true);
      setCardStatusMessage(
        recordMode === 'ext_in'
          ? `RECORDING TO PAD ${armedRecordPad.bank}${armedRecordPad.id} (PAD PLAYBACK UNLOCKED)`
          : `RESAMPLING TO PAD ${armedRecordPad.bank}${armedRecordPad.id} (PLAY ANY PADS NOW)`
      );
    }
  };

  const handleStopRecording = () => {
    const buffer = sp404AudioEngine.stopRecording();
    setIsRecording(false);
    setArmedRecordPad(null);
    if (buffer) {
      setCardStatusMessage(`SAVED (${buffer.duration.toFixed(2)}s). READY ON PAD!`);
    } else {
      setCardStatusMessage('RECORDING CANCELLED.');
    }
  };

  // SD Card Import / Export
  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const profile = SP404_LEGACY_PROFILES[hardwareProfileId];
    const isCardFolder = Array.from(e.target.files).some((file) => Boolean((file as File & { webkitRelativePath?: string }).webkitRelativePath));
    let expectedCount = e.target.files.length;
    if (isCardFolder) {
      const report = validateSP404CardFiles(e.target.files, profile);
      setCardStatusMessage(summarizeSP404CardValidation(report));
      if (!report.valid) {
        e.target.value = '';
        return;
      }
      expectedCount = report.audioFileCount;
      setCardStatusMessage(`VALIDATED · ${report.audioFileCount} FILES · DECODING ${profile.label.toUpperCase()} SAMPLES...`);
    } else {
      setCardStatusMessage(`IMPORTING ${e.target.files.length} AUDIO FILES...`);
    }
    const res = await sp404AudioEngine.importFromCardFiles(e.target.files);
    setCardStatusMessage(`LOADED ${res.loadedCount}/${expectedCount} ${profile.label.toUpperCase()} SAMPLES.`);
    e.target.value = '';
  };

  const handleSaveLibrary = async () => {
    try {
      const profile = SP404_LEGACY_PROFILES[hardwareProfileId];
      sp404AudioEngine.setHardwareProfile(hardwareProfileId);
      const manifest = await sp404AudioEngine.saveLibrary(libraryName, profile);
      const next = await sp404AudioEngine.listLibraries();
      setLibraries(next);
      setSelectedLibraryId(manifest.id);
      setCardStatusMessage(`SET SAVED: ${manifest.name.toUpperCase()}`);
    } catch (err) {
      console.error('Could not save SP-404 set:', err);
      setCardStatusMessage('SET SAVE ERROR: BROWSER STORAGE UNAVAILABLE.');
    }
  };

  const handleLoadLibrary = async () => {
    if (!selectedLibraryId) return;
    const manifest = libraries.find((item) => item.id === selectedLibraryId);
    const loaded = await sp404AudioEngine.loadLibrary(selectedLibraryId);
    if (loaded && manifest) {
      setLibraryName(manifest.name);
      setHardwareProfileId(manifest.hardware.id);
      setVolume(manifest.settings.volume);
      setActiveEffect(manifest.settings.activeMFX as MFXType);
      setCtrl1(manifest.settings.ctrl1);
      setCtrl2(manifest.settings.ctrl2);
      setCtrl3(manifest.settings.ctrl3);
      setGlobalTranspose(manifest.settings.globalTranspose);
      setIsChromaticMode(manifest.settings.isChromaticMode);
      setCardStatusMessage(`SET LOADED: ${manifest.name.toUpperCase()}`);
    } else {
      setCardStatusMessage('SET LOAD ERROR: INCOMPATIBLE LEGACY PROFILE.');
    }
  };

  const handleExportLibrary = async () => {
    setIsExporting(true);
    try {
      const profile = SP404_LEGACY_PROFILES[hardwareProfileId];
      sp404AudioEngine.setHardwareProfile(hardwareProfileId);
      const zipBlob = await sp404AudioEngine.exportLibraryPackage(libraryName, profile);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${libraryName.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'sp404-set'}.jw404`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCardStatusMessage('PORTABLE .JW404 LIBRARY EXPORTED.');
    } catch (err) {
      console.error('Could not export SP-404 library:', err);
      setCardStatusMessage('SET EXPORT ERROR.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportLibrary = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const manifest = await sp404AudioEngine.importLibraryPackage(file);
      const next = await sp404AudioEngine.listLibraries();
      setLibraries(next);
      setSelectedLibraryId(manifest.id);
      setLibraryName(manifest.name);
      setHardwareProfileId(manifest.hardware.id);
      setCardStatusMessage(`LIBRARY IMPORTED: ${manifest.name.toUpperCase()}`);
    } catch (err) {
      console.error('Could not import SP-404 library:', err);
      setCardStatusMessage('LIBRARY IMPORT ERROR: UNSUPPORTED OR CORRUPT FILE.');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportCardTemplate = async () => {
    setIsExporting(true);
    setCardStatusMessage('PACKAGING LEGACY SP-404 IMPORT FILES...');
    try {
      const profile = SP404_LEGACY_PROFILES[hardwareProfileId];
      sp404AudioEngine.setHardwareProfile(hardwareProfileId);
      const zipBlob = await sp404AudioEngine.exportToCardZip(profile);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SP404_LEGACY_IMPORT_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCardStatusMessage('IMPORT PACKAGE READY: LOAD EACH BANK FOLDER SEPARATELY.');
    } catch (err) {
      console.error('Export failed:', err);
      setCardStatusMessage('EXPORT ERROR: COULD NOT PACKAGE SAMPLES.');
    } finally {
      setIsExporting(false);
    }
  };

  const bpm = telemetry?.bpm ? telemetry.bpm.toFixed(1) : '124.0';
  const selectedPad = sp404AudioEngine.getPad(activeBank, selectedPadId);

  const getChromaticNoteLabel = (padIndex: number) => {
    const semitone = (padIndex - 1) - 12;
    const noteIdx = ((semitone % 12) + 12) % 12;
    const noteName = CHROMATIC_NOTE_NAMES[noteIdx];
    const oct = chromaticOctave + Math.floor(semitone / 12);
    const sign = semitone > 0 ? `+${semitone}` : `${semitone}`;
    return `${noteName}${oct} (${sign})`;
  };

  return (
    <div className="flex-1 flex flex-col justify-between bg-[#0b0c10] p-4 md:p-6 overflow-y-auto select-none font-mono">
      {/* 1. High-Contrast SD Card & Hardware Status Top Bar */}
      <div className="bg-[#151821] border border-slate-700/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl mb-4">
        {/* Left: Authentic Roland Header Block */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-[#ff5500] text-black font-black text-sm tracking-wider uppercase flex items-center gap-2 shadow-md">
            <Disc size={15} className={isRecording ? 'animate-spin' : ''} />
            <span>Roland</span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white uppercase tracking-widest">
                SP-404 ORIGINAL / A
              </span>
              <span className="text-[10px] font-bold text-[#ff8844] tracking-wider">
                LINEAR WAVE SAMPLER
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                LIVE
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold text-amber-400 truncate max-w-md">
              {transferProgress
                ? `SYNCING ${transferProgress.label} · ${transferProgress.completedChunks}/${transferProgress.totalChunks} CHUNKS`
                : cardStatusMessage}
            </span>
          </div>
        </div>

        {/* Right: SD Card Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*,.wav,.aiff,.mp3"
            onChange={handleImportFiles}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
            onChange={handleImportFiles}
            className="hidden"
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept=".jw404,application/zip"
            onChange={handleImportLibrary}
            className="hidden"
          />

          <div className="flex items-center gap-1.5 bg-[#11131a] border border-slate-700 rounded-lg px-2 py-1">
            <span className="text-[9px] text-slate-400 font-bold">SET</span>
            <input
              value={libraryName}
              onChange={(e) => setLibraryName(e.target.value)}
              className="w-36 bg-transparent text-[10px] text-white outline-none"
              aria-label="SP-404 set name"
            />
            <button
              type="button"
              onClick={handleSaveLibrary}
              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black"
            >
              SAVE
            </button>
            <button
              type="button"
              onClick={handleExportLibrary}
              className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-black"
            >
              EXPORT
            </button>
          </div>

          <select
            value={hardwareProfileId}
            onChange={(e) => {
              const nextProfile = e.target.value as SP404HardwareProfileId;
              setHardwareProfileId(nextProfile);
              sp404AudioEngine.setHardwareProfile(nextProfile);
              setCardStatusMessage(`${SP404_LEGACY_PROFILES[nextProfile].label.toUpperCase()} PROFILE ACTIVE.`);
            }}
            className="max-w-44 px-2 py-1.5 rounded-lg bg-[#1e2330] border border-slate-600 text-[10px] text-slate-200"
            aria-label="SP-404 hardware profile"
          >
            {Object.values(SP404_LEGACY_PROFILES).map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>

          <select
            value={selectedLibraryId}
            onChange={(e) => setSelectedLibraryId(e.target.value)}
            className="max-w-40 px-2 py-1.5 rounded-lg bg-[#1e2330] border border-slate-600 text-[10px] text-slate-200"
            aria-label="Saved SP-404 sets"
          >
            <option value="">LOAD SAVED SET...</option>
            {libraries.map((library) => (
              <option key={library.id} value={library.id}>{library.name}</option>
            ))}
          </select>

          <button
            type="button"
            disabled={!selectedLibraryId}
            onClick={handleLoadLibrary}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-black disabled:opacity-40"
          >
            LOAD SET
          </button>

          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-black"
          >
            IMPORT .JW404
          </button>

          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-[#1e2330] border border-slate-600 hover:border-[#ff5500] text-white hover:text-[#ff8844] text-[11px] font-bold transition flex items-center gap-1.5 shadow"
            title="Import legacy SP-404 card files such as A_01.WAV or A0000001.WAV"
          >
            <Upload size={13} className="text-[#ff5500]" />
            <span>LOAD CARD FILES</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg bg-[#1e2330] border border-slate-600 hover:border-slate-400 text-slate-200 hover:text-white text-[10.5px] font-bold transition"
            title="Import single/multiple audio samples"
          >
            + SAMPLES
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportCardTemplate}
            className="px-3 py-1.5 rounded-lg bg-[#ff5500]/25 hover:bg-[#ff5500]/35 text-[#ff8844] border border-[#ff5500]/60 text-[11px] font-bold transition flex items-center gap-1.5 shadow"
            title={`Export a ${SP404_LEGACY_PROFILES[hardwareProfileId].label} card-import package`}
          >
            <Download size={13} />
            <span>{isExporting ? 'EXPORTING...' : 'SAVE 404 TEMPLATE'}</span>
          </button>

          <div className="h-5 w-px bg-slate-700 mx-1" />

          {/* Universal Module & Routing Nav Buttons */}
          {onOpenRoutingModal && (
            <button
              type="button"
              onClick={onOpenRoutingModal}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 text-[11px] font-bold transition flex items-center gap-1.5 shadow"
              title="Open Universal Studio Signal Flow & Routing Screen"
            >
              <GitBranch size={13} />
              <span>ROUTING</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSwitchToPedalLab}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 text-[11px] font-bold transition flex items-center gap-1.5 shadow"
            title="Switch to Pedal Lab Workspace"
          >
            <Sliders size={13} />
            <span>PEDAL LAB</span>
          </button>

          {onSwitchToState && (
            <button
              type="button"
              onClick={onSwitchToState}
              className="px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/50 text-[11px] font-bold transition flex items-center gap-1.5 shadow"
              title="Switch to State Cockpit Workspace"
            >
              <Activity size={13} />
              <span>STATE</span>
            </button>
          )}
        </div>
      </div>

          {/* 2. Main Hardware Chassis: Legacy SP-404 faceplate */}
      <div className="relative max-w-4xl mx-auto w-full bg-[#181a22] border-2 border-slate-700/90 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Corner Hex Socket Screws */}
        <div className="absolute top-3 left-3 w-3.5 h-3.5 rounded-full bg-slate-700 border border-slate-500 shadow-inner flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-slate-900 rounded-sm" />
        </div>
        <div className="absolute top-3 right-3 w-3.5 h-3.5 rounded-full bg-slate-700 border border-slate-500 shadow-inner flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-slate-900 rounded-sm" />
        </div>
        <div className="absolute bottom-3 left-3 w-3.5 h-3.5 rounded-full bg-slate-700 border border-slate-500 shadow-inner flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-slate-900 rounded-sm" />
        </div>
        <div className="absolute bottom-3 right-3 w-3.5 h-3.5 rounded-full bg-slate-700 border border-slate-500 shadow-inner flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-slate-900 rounded-sm" />
        </div>

        {/* Top Control Section: 4 Rotary Encoders & Circular Graphic OLED Display */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center border-b border-slate-700/80 pb-5">
          {/* Rotary Knobs 1 & 2 */}
          <div className="flex items-center justify-around gap-4">
            <AudioKnob
              label="VOLUME"
              value={volume}
              min={0}
              max={10}
              step={0.1}
              color="orange"
              variant="sp404"
              onChange={setVolume}
            />
            <AudioKnob
              label="CTRL 1"
              sub={activeEffect === 'filter' ? 'CUTOFF' : activeEffect === 'isolator' ? 'LOW KILL' : 'DRIVE/PARAM'}
              value={ctrl1}
              min={0}
              max={10}
              step={0.1}
              color="orange"
              variant="sp404"
              onChange={setCtrl1}
            />
          </div>

          {/* Center Iconic Circular OLED Display */}
          <div className="md:col-span-2 flex justify-center">
            <div className="relative w-48 h-48 rounded-full bg-gradient-to-b from-slate-600 via-slate-800 to-slate-900 p-1.5 shadow-[0_10px_25px_rgba(0,0,0,0.8)] border border-slate-600">
              <div className="w-full h-full rounded-full bg-[#030406] border border-slate-700/80 flex flex-col items-center justify-between p-3.5 text-center relative overflow-hidden">
                {/* Simulated Glass Reflection Sheen */}
                <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-white/10 to-transparent rounded-t-full pointer-events-none" />

                {/* Left VU Meter */}
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 pointer-events-none">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1 rounded-sm ${
                        i < 2 ? 'bg-rose-500' : i < 4 ? 'bg-amber-400' : 'bg-emerald-400'
                      } ${padIsPlaying() ? 'opacity-100 shadow-[0_0_4px_currentColor]' : 'opacity-25'}`}
                    />
                  ))}
                </div>

                {/* Right VU Meter */}
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 pointer-events-none">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1 rounded-sm ${
                        i < 2 ? 'bg-rose-500' : i < 4 ? 'bg-amber-400' : 'bg-emerald-400'
                      } ${padIsPlaying() ? 'opacity-100 shadow-[0_0_4px_currentColor]' : 'opacity-25'}`}
                    />
                  ))}
                </div>

                {/* Header Mode Status */}
                <div className="pt-1 z-10">
                  <span className={`text-[9.5px] font-black uppercase tracking-widest ${
                    isRecording ? 'text-rose-400 animate-pulse' : 'text-[#ff5500]'
                  }`}>
                    {isRecording
                      ? `REC: ${(recordingElapsedMs / 1000).toFixed(1)}s`
                      : activeEffect === 'vinyl'
                      ? `VINYL (${isVinyl33Rpm ? '33 RPM' : '45 RPM'})`
                      : activeEffect.toUpperCase()}
                  </span>
                </div>

                {/* Center Dynamic Waveform & Bold High-Contrast Sample Name */}
                <div className="flex flex-col items-center justify-center my-auto z-10 w-full px-4">
                  {/* Waveform graphic */}
                  <div className="w-28 h-7 flex items-center justify-center gap-0.5 overflow-hidden my-1 bg-black/40 rounded px-1 border border-slate-800">
                    {selectedPad?.waveform && selectedPad.waveform.length > 0 ? (
                      selectedPad.waveform.slice(0, 18).map((h, i) => (
                        <div
                          key={i}
                          className={`w-1 rounded-full transition-all duration-75 ${
                            isRecording ? 'bg-rose-500' : 'bg-[#ff5500] shadow-[0_0_4px_#ff5500]'
                          }`}
                          style={{ height: `${Math.max(3, h * 24)}px` }}
                        />
                      ))
                    ) : (
                      [0.4, 0.7, 0.9, 0.3, 0.6, 0.8, 0.5, 0.9, 0.7, 0.4, 0.6, 0.2, 0.8, 0.5].map((h, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full bg-[#ff5500]/70"
                          style={{ height: `${h * 20}px` }}
                        />
                      ))
                    )}
                  </div>

                  {/* Sample / Note Title (Crisp Pure White) */}
                  <span className="text-xs font-black text-white tracking-wider truncate max-w-[140px] drop-shadow">
                    {isChromaticMode ? getChromaticNoteLabel(selectedPadId) : selectedPad?.label || 'EMPTY SLOT'}
                  </span>

                  {/* Pad Info & BPM */}
                  <div className="flex items-center gap-2 mt-1 text-[9px] font-bold">
                    <span className="text-[#ff5500] bg-[#ff5500]/20 px-1 py-0.2 rounded border border-[#ff5500]/40">
                      PAD {activeBank}{selectedPadId.toString().padStart(2, '0')}
                    </span>
                    <span className="text-amber-300">
                      {globalTranspose !== 0 ? `PITCH: ${globalTranspose > 0 ? `+${globalTranspose}` : globalTranspose}st` : `${bpm} BPM`}
                    </span>
                  </div>
                </div>

                {/* Footer Mode Tag */}
                <div className="pb-1 text-[8.5px] text-slate-400 font-bold uppercase tracking-wider z-10">
                  {isChromaticMode ? 'CHROMATIC MODE' : `BANK ${activeBank} · ${SP404_LEGACY_PROFILE.padsPerBank} PADS`}
                </div>
              </div>
            </div>
          </div>

          {/* Rotary Knobs 3 & 4 */}
          <div className="flex items-center justify-around gap-4">
            <AudioKnob
              label="CTRL 2"
              sub={activeEffect === 'filter' ? 'RESONANCE' : activeEffect === 'isolator' ? 'MID KILL' : 'FLUTTER'}
              value={ctrl2}
              min={0}
              max={10}
              step={0.1}
              color="orange"
              variant="sp404"
              onChange={setCtrl2}
            />
            <AudioKnob
              label="CTRL 3"
              sub={activeEffect === 'filter' ? 'DRIVE' : activeEffect === 'isolator' ? 'HIGH KILL' : 'BALANCE'}
              value={ctrl3}
              min={0}
              max={10}
              step={0.1}
              color="orange"
              variant="sp404"
              onChange={setCtrl3}
            />
          </div>
        </div>

        {/* 3. Multi-FX & Pitch Transpose Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#11131a] p-3 rounded-2xl border border-slate-700/80 shadow-md">
          {/* MFX Type Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-white font-black uppercase tracking-wider mr-1">
              MFX:
            </span>
            {[
              { id: 'vinyl', label: 'VINYL SIM' },
              { id: 'djfx', label: 'DJFX LOOPER' },
              { id: 'isolator', label: 'ISOLATOR' },
              { id: 'cassette', label: 'CASSETTE' },
              { id: 'filter', label: 'FILTER+DRIVE' },
              { id: 'pitch', label: 'PITCH/SPEED' }
            ].map((fx) => {
              const isFxActive = activeEffect === fx.id;
              return (
                <button
                  key={fx.id}
                  type="button"
                  onClick={() => setActiveEffect(fx.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition border shadow-sm flex items-center gap-1.5 ${
                    isFxActive
                      ? 'bg-[#ff5500] text-black border-[#ff5500] shadow-[0_0_10px_#ff5500]'
                      : 'bg-[#1b1f2b] text-slate-200 border-slate-600 hover:border-slate-400 hover:text-white'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isFxActive ? 'bg-black' : 'bg-slate-500'}`} />
                  <span>{fx.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Pitch Transpose & Vinyl Speed Options */}
          <div className="flex items-center gap-2">
            {activeEffect === 'vinyl' && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-slate-400 font-bold">SPEED:</span>
                <button
                  type="button"
                  onClick={() => setIsVinyl33Rpm(!isVinyl33Rpm)}
                  className="px-2.5 py-1 rounded bg-[#1e2330] border border-slate-600 text-[#ff8844] font-black"
                >
                  {isVinyl33Rpm ? '33 ⅓ RPM' : '45 RPM'}
                </button>
              </div>
            )}

            {/* Global Transpose Buttons */}
            <div className="flex items-center gap-1 bg-[#14161f] p-1 rounded-lg border border-slate-700">
              <span className="text-[9px] text-slate-400 px-1 font-bold">TRANSPOSE:</span>
              <button
                type="button"
                onClick={() => setGlobalTranspose((p) => p - 1)}
                className="w-6 h-6 rounded bg-[#202535] hover:bg-[#282f42] text-white text-[11px] font-black flex items-center justify-center border border-slate-600"
                title="Transpose down 1 semitone"
              >
                -1
              </button>
              <span className="text-[11px] font-mono font-black text-amber-400 px-1.5">
                {globalTranspose > 0 ? `+${globalTranspose}` : globalTranspose}
              </span>
              <button
                type="button"
                onClick={() => setGlobalTranspose((p) => p + 1)}
                className="w-6 h-6 rounded bg-[#202535] hover:bg-[#282f42] text-white text-[11px] font-black flex items-center justify-center border border-slate-600"
                title="Transpose up 1 semitone"
              >
                +1
              </button>
              {globalTranspose !== 0 && (
                <button
                  type="button"
                  onClick={() => setGlobalTranspose(0)}
                  className="px-1 text-[9px] text-slate-400 hover:text-white"
                  title="Reset transpose to 0"
                >
                  RESET
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4. Bank Selection, Chromatic Mode, and Live Rec / Resample Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-4">
          {/* Banks A to J */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white font-black uppercase tracking-widest mr-1">
              BANK:
            </span>
            {(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setActiveBank(b)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs border transition ${
                  activeBank === b
                    ? 'bg-[#ff5500] text-black border-white shadow-[0_0_10px_#ff5500]'
                    : 'bg-[#1e2330] text-slate-200 border-slate-600 hover:text-white hover:border-slate-400'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Performance & Recording Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Chromatic Keyboard Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsChromaticMode(!isChromaticMode)}
              className={`px-3 py-1.5 rounded-lg text-[10.5px] font-black border transition flex items-center gap-1.5 shadow ${
                isChromaticMode
                  ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_12px_#c084fc]'
                  : 'bg-[#1e2330] text-slate-200 border-slate-600 hover:text-white hover:border-slate-400'
              }`}
              title="Transform 12 pads into a chromatic pitch keyboard"
            >
              <Music size={13} />
              <span>CHROMATIC {isChromaticMode ? 'ON' : 'OFF'}</span>
            </button>

            {/* Real-time Simultaneous External Input Recording */}
            <button
              type="button"
              onClick={() => {
                if (isRecording) {
                  handleStopRecording();
                } else if (armedRecordPad) {
                  handleStartRecording();
                } else {
                  handleArmRecord('ext_in');
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-[11px] font-black border transition flex items-center gap-1.5 shadow ${
                isRecording && recordMode === 'ext_in'
                  ? 'bg-rose-600 text-white border-white animate-pulse shadow-[0_0_16px_#f43f5e]'
                  : armedRecordPad && recordMode === 'ext_in'
                  ? 'bg-amber-500 text-black border-white'
                  : 'bg-rose-950/80 text-rose-300 border-rose-700 hover:bg-rose-900'
              }`}
              title="Record Ableton track input in real-time WHILE still playing back 404 keys!"
            >
              {isRecording ? <Square size={13} /> : <Mic size={13} />}
              <span>
                {isRecording && recordMode === 'ext_in'
                  ? 'STOP REC'
                  : armedRecordPad && recordMode === 'ext_in'
                  ? 'START REC'
                  : 'REC (EXT IN)'}
              </span>
            </button>

            {/* Resample Mode */}
            <button
              type="button"
              onClick={() => {
                if (isRecording) {
                  handleStopRecording();
                } else if (armedRecordPad) {
                  handleStartRecording();
                } else {
                  handleArmRecord('resample');
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-[11px] font-black border transition flex items-center gap-1.5 shadow ${
                isRecording && recordMode === 'resample'
                  ? 'bg-purple-600 text-white border-white animate-pulse shadow-[0_0_16px_#c084fc]'
                  : armedRecordPad && recordMode === 'resample'
                  ? 'bg-amber-500 text-black border-white'
                  : 'bg-purple-950/80 text-purple-300 border-purple-700 hover:bg-purple-900'
              }`}
              title="Resample combined pad playback + live input directly into an armed pad!"
            >
              <Repeat size={13} />
              <span>
                {isRecording && recordMode === 'resample'
                  ? 'STOP RESAMPLE'
                  : armedRecordPad && recordMode === 'resample'
                  ? 'START RESAMPLE'
                  : 'RESAMPLE'}
              </span>
            </button>

            {/* Stop / Mute All Voices */}
            <button
              type="button"
              onClick={() => sp404AudioEngine.stopAllPads()}
              className="p-1.5 rounded-lg bg-[#1e2330] text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400"
              title="Stop all currently playing sample voices"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* 5. The 4x4 High-Contrast Rubber Pads Matrix */}
        <div className="grid grid-cols-4 gap-3.5 max-w-2xl mx-auto p-5 bg-[#0e1017] rounded-3xl border-2 border-slate-700/80 shadow-2xl">
          {currentPads.map((pad, idx) => {
            const isArmedTarget = armedRecordPad && armedRecordPad.bank === activeBank && armedRecordPad.id === pad.id;
            const isSelected = selectedPadId === pad.id;

            return (
              <button
                key={pad.id}
                type="button"
                onMouseDown={() => handlePadPress(pad.id)}
                onMouseUp={() => handlePadRelease(pad.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setEditingPad(pad);
                }}
                className={`relative h-24 rounded-2xl flex flex-col justify-between p-3 text-left transition-all duration-75 active:scale-95 border-2 shadow-lg ${
                  pad.isHit
                    ? 'bg-[#ff5500] text-black border-white shadow-[0_0_24px_#ff5500]'
                    : isArmedTarget
                    ? recordMode === 'resample'
                      ? 'bg-purple-900 text-white border-purple-300 animate-pulse shadow-[0_0_16px_#c084fc]'
                      : 'bg-rose-900 text-white border-rose-300 animate-pulse shadow-[0_0_16px_#f43f5e]'
                    : isSelected
                    ? 'bg-[#293042] text-white border-[#ff5500] ring-2 ring-[#ff5500]/60 shadow-xl'
                    : pad.audioBuffer || pad.nativeSampleAvailable
                    ? 'bg-[#1e2331] text-white border-slate-500 hover:border-slate-300 hover:bg-[#252c3d]'
                    : 'bg-[#131620] text-slate-400 border-slate-700/80 hover:border-slate-500'
                }`}
              >
                {/* Top Pad Header: Number & Key mapping indicator */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-white">
                      {pad.id}
                    </span>
                    {(pad.audioBuffer || pad.nativeSampleAvailable) && (
                      <span className={`w-1.5 h-1.5 rounded-full ${pad.isHit ? 'bg-black' : 'bg-emerald-400 shadow-[0_0_4px_#34d399]'}`} />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {pad.muteGroup > 0 && (
                      <span className="text-[8px] font-black px-1 rounded bg-amber-500 text-black">
                        M{pad.muteGroup}
                      </span>
                    )}
                    <span className="text-[9px] font-mono font-bold text-slate-400 bg-black/40 border border-slate-700 px-1 rounded">
                      {['1','2','3','4','Q','W','E','R','A','S','D','F'][idx]}
                    </span>
                  </div>
                </div>

                {/* Center Mini Waveform Preview */}
                {pad.waveform && pad.waveform.length > 0 && (
                  <div className="w-full h-3.5 flex items-center justify-start gap-0.5 overflow-hidden my-auto">
                    {pad.waveform.slice(0, 16).map((val, wIdx) => (
                      <div
                        key={wIdx}
                        className={`w-0.5 rounded-full ${
                          pad.isHit ? 'bg-black' : isSelected ? 'bg-[#ff5500]' : 'bg-slate-300'
                        }`}
                        style={{ height: `${Math.max(2, val * 14)}px` }}
                      />
                    ))}
                  </div>
                )}

                {/* Bottom Label & Hardware Sub-Label */}
                <div className="w-full mt-auto">
                  <span className="text-[10.5px] font-black tracking-tight truncate leading-tight block text-white">
                    {isChromaticMode ? getChromaticNoteLabel(pad.id) : pad.label}
                  </span>
                  <span className="text-[7.5px] font-black tracking-widest text-[#ff8844] uppercase block truncate opacity-90">
                    {pad.nativeSampleAvailable && !pad.audioBuffer ? 'NATIVE RESTORED' : PAD_SUB_LABELS[idx]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 6. Live Simultaneous Recording Feature Callout */}
        <div className="bg-[#12141c] border border-slate-700/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} className="text-[#ff5500] shrink-0" />
              <span className="text-[11.5px] leading-relaxed text-slate-200">
                <strong className="text-white">Real-Time Continuous Sampling:</strong> Hit{' '}
              <span className="text-rose-400 font-bold">REC (EXT IN)</span> to capture real-time audio from Ableton continuously while simultaneously triggering and playing any of the {SP404_LEGACY_PROFILE.padsPerBank} pads!
            </span>
          </div>

          <div className="flex items-center gap-2 text-[10.5px] text-emerald-400 font-bold font-mono shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            <span>PLAYBACK + REC UNLOCKED</span>
          </div>
        </div>
      </div>

      {/* 7. Pad Details & Parameter Inspector Drawer */}
      {editingPad && (
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
                onClick={() => setEditingPad(null)}
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
                    editingPad.label = e.target.value;
                    setTick((t) => t + 1);
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
                      editingPad.pitch = parseInt(e.target.value, 10);
                      setTick((t) => t + 1);
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
                      editingPad.volume = parseFloat(e.target.value);
                      setTick((t) => t + 1);
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
                      editingPad.mode = e.target.value as any;
                      setTick((t) => t + 1);
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
                      editingPad.muteGroup = parseInt(e.target.value, 10);
                      setTick((t) => t + 1);
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
                    setTick((t) => t + 1);
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
                    setTick((t) => t + 1);
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
              onClick={() => setEditingPad(null)}
              className="w-full py-2 rounded-xl bg-[#ff5500] hover:bg-amber-500 text-black font-black text-xs transition"
            >
              DONE
            </button>
          </div>
        </div>
      )}
    </div>
  );

  function padIsPlaying(): boolean {
    return currentPads.some((p) => p.isHit);
  }
};
