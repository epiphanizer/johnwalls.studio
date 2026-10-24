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
  Activity,
  Lock,
  Edit2,
  Check,
  Scissors,
  Radio
} from 'lucide-react';
import { AudioKnob } from './AudioKnob';
import { StateTelemetry } from '../types';
import { stateBridge } from '../utils/stateBridge';
import { rc600AudioEngine } from './RC600AudioEngine';
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
  WALLS_DEVINE_VOL1_ID,
  getWallsDevineVol1Manifest,
  type SP404HardwareProfileId,
  type SP404LibraryManifest
} from '../utils/sp404Library';
import { hasJuceNativeHost } from '../utils/nativeTransport';
import { summarizeSP404CardValidation, validateSP404CardFiles } from '../utils/sp404CardValidation';
import { SP404PadInspectorDrawer } from './SP404PadInspectorDrawer';
import { SP404ChopFinderModal } from './SP404ChopFinderModal';

interface SP404WorkstationProps {
  onSwitchToPedalLab: () => void;
  onSwitchToRC600?: () => void;
  onSwitchToState?: () => void;
  onOpenRoutingModal?: () => void;
  onOpenSkipBack?: () => void;
  onOpenAutoChop?: (buffer: AudioBuffer) => void;
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

const SP404WorkstationComponent: React.FC<SP404WorkstationProps> = ({
  onSwitchToPedalLab,
  onSwitchToRC600,
  onSwitchToState,
  onOpenRoutingModal,
  onOpenSkipBack,
  onOpenAutoChop,
  telemetry
}) => {
  const [activeBank, setActiveBank] = useState<BankLetter>('A');
  const [activeEffect, setActiveEffect] = useState<MFXType>('isolator');
  const [isVinyl33Rpm, setIsVinyl33Rpm] = useState<boolean>(true);
  const [isRc600ExchangeOpen, setIsRc600ExchangeOpen] = useState<boolean>(false);
  const [rc600TargetTrack, setRc600TargetTrack] = useState<number>(1);
  const [rc600ExchangeMsg, setRc600ExchangeMsg] = useState<string | null>(null);

  // Rotary knobs state
  const [volume, setVolume] = useState<number>(8.5);
  const [ctrl1, setCtrl1] = useState<number>(5.0);
  const [ctrl2, setCtrl2] = useState<number>(0.0);
  const [ctrl3, setCtrl3] = useState<number>(5.0);

  // Global Transpose & Chromatic Mode
  const [globalTranspose, setGlobalTranspose] = useState<number>(0);
  const [isChromaticMode, setIsChromaticMode] = useState<boolean>(false);
  const [isHoldMode, setIsHoldMode] = useState<boolean>(() => sp404AudioEngine.getIsHoldMode());
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
  const [libraryName, setLibraryName] = useState<string>('Walls:Devine Vol. 1');
  const [libraries, setLibraries] = useState<SP404LibraryManifest[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>(WALLS_DEVINE_VOL1_ID);
  const [nativeStateReady, setNativeStateReady] = useState<boolean>(() => !hasJuceNativeHost());
  const [transferProgress, setTransferProgress] = useState<SP404TransferProgress | null>(null);

  // Edit Pad Details Drawer
  const [editingPad, setEditingPad] = useState<SP404Pad | null>(null);

  // Inline Pad & OLED Sample Renaming States
  const [inlineEditingPadId, setInlineEditingPadId] = useState<number | null>(null);
  const [inlinePadName, setInlinePadName] = useState<string>('');
  const [isEditingOledLabel, setIsEditingOledLabel] = useState<boolean>(false);
  const [oledLabelDraft, setOledLabelDraft] = useState<string>('');

  // Sample Finder & Split Waveform Chop Loader State
  const [isChopFinderOpen, setIsChopFinderOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  const [dragTargetPadId, setDragTargetPadId] = useState<number | null>(null);
  const [isDragOverOled, setIsDragOverOled] = useState<boolean>(false);

  const handleDropOnPad = async (e: React.DragEvent, padId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTargetPadId(null);

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('audio/') || /\.(wav|aif|aiff|mp3|ogg|flac)$/i.test(f.name)
    );
    if (files.length === 0) return;

    const ctx = sp404AudioEngine.getAudioContext();
    if (!ctx) return;

    if (files.length === 1) {
      try {
        const arrayBuf = await files[0].arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        sp404AudioEngine.assignBufferToPad(
          activeBank,
          padId,
          decoded,
          files[0].name.replace(/\.[^/.]+$/, '').slice(0, 14)
        );
        setCardStatusMessage(`LOADED ${files[0].name} -> PAD ${activeBank}${String(padId).padStart(2, '0')}`);
      } catch (err) {
        console.warn('Failed to decode dropped audio file:', err);
      }
    } else {
      for (let i = 0; i < files.length; i++) {
        const targetId = padId + i;
        if (targetId > 16) break;
        try {
          const arrayBuf = await files[i].arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuf);
          sp404AudioEngine.assignBufferToPad(
            activeBank,
            targetId,
            decoded,
            files[i].name.replace(/\.[^/.]+$/, '').slice(0, 14)
          );
        } catch (err) {
          console.warn('Failed to decode dropped audio file:', err);
        }
      }
      setCardStatusMessage(`LOADED ${files.length} SAMPLES TO BANK ${activeBank}`);
    }
  };

  const handleDropOnOled = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverOled(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ctx = sp404AudioEngine.getAudioContext();
    if (!ctx) return;

    try {
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      onOpenAutoChop?.(decoded);
    } catch (err) {
      console.warn('Failed to decode audio file for chop:', err);
    }
  };

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
      if (typeof state.hold === 'boolean') {
        setIsHoldMode(state.hold);
      }
      if (typeof state.globalTranspose === 'number') {
        setGlobalTranspose(state.globalTranspose);
      }
      setNativeStateReady(true);
      setCardStatusMessage('NATIVE SP-404 STATE RESTORED · UI HYDRATED');
    });
    sp404AudioEngine.setOnTransferProgress((progress) => {
      if (isMounted) setTransferProgress(progress.phase === 'complete' || progress.phase === 'cancelled' || progress.phase === 'error' ? null : progress);
    });

    // Initialize audio context on mount safely and load default Walls:Devine library
    sp404AudioEngine.initAudio().then(() => {
      if (isMounted) {
        sp404AudioEngine.loadLibrary(WALLS_DEVINE_VOL1_ID).then(() => {
          if (isMounted) setTick((t) => t + 1);
        });
      }
    });
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
      if (key === ' ' || key === 'escape') {
        e.preventDefault();
        sp404AudioEngine.stopAllPads();
        setCardStatusMessage('STOP ALL PADS (SILENCE)');
        return;
      }
      if (key === 'h' && !e.repeat) {
        setIsHoldMode((prev) => {
          const next = !prev;
          sp404AudioEngine.setHoldMode(next);
          setCardStatusMessage(next ? 'HOLD MODE ACTIVE · PADS LATCH PLAYBACK' : 'HOLD MODE OFF');
          return next;
        });
        return;
      }
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
      const manifest = await sp404AudioEngine.saveLibrary(libraryName, profile, selectedLibraryId);
      const next = await sp404AudioEngine.listLibraries();
      setLibraries(next);
      setSelectedLibraryId(manifest.id);
      setLibraryName(manifest.name);
      setCardStatusMessage(`SET SAVED: ${manifest.name.toUpperCase()}`);
    } catch (err) {
      console.error('Could not save SP-404 set:', err);
      setCardStatusMessage('SET SAVE ERROR: BROWSER STORAGE UNAVAILABLE.');
    }
  };

  const handleRenameLibrary = async () => {
    const trimmed = libraryName.trim();
    if (!trimmed) return;
    try {
      const updated = await sp404AudioEngine.renameLibrary(selectedLibraryId, trimmed);
      if (updated) {
        const next = await sp404AudioEngine.listLibraries();
        setLibraries(next);
        setSelectedLibraryId(updated.id);
        setLibraryName(updated.name);
        setCardStatusMessage(`SET RENAMED: ${updated.name.toUpperCase()}`);
      }
    } catch (err) {
      console.error('Could not rename SP-404 set:', err);
      setCardStatusMessage('SET RENAME ERROR: BROWSER STORAGE UNAVAILABLE.');
    }
  };

  const handleLoadPresetId = async (id: string) => {
    setSelectedLibraryId(id);
    const manifest = libraries.find((item) => item.id === id) || (id === WALLS_DEVINE_VOL1_ID ? getWallsDevineVol1Manifest() : undefined);
    const loaded = await sp404AudioEngine.loadLibrary(id);
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

  const getWallsDevineSongName = (bank: BankLetter): string | null => {
    if (!libraryName.toLowerCase().includes('walls') && selectedLibraryId !== WALLS_DEVINE_VOL1_ID) return null;
    switch (bank) {
      case 'A': return 'DECAY';
      case 'B': return 'CONVICTION';
      case 'C': return 'POETRY';
      case 'D': return 'GRATITUDE';
      case 'E': return 'STASH DADDY';
      case 'F': return 'JOINT QUEEN';
      case 'G': return 'AUXILIARY';
      case 'H': return 'RESOLVE';
      case 'I': return 'LIVE AUX';
      case 'J': return 'SCRATCH';
      default: return null;
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

  const padIsPlaying = (): boolean => {
    return currentPads.some((p) => p.isHit || sp404AudioEngine.isPadPlaying(activeBank, p.id));
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

        {/* Right: SD Card & Set Actions Toolbar */}
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

          {/* Active Set Pill with Inline Rename, Save & Export */}
          <div className="flex items-center gap-1.5 bg-[#10131d] border border-slate-700/80 rounded-lg px-2.5 py-1 shadow-sm">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SET:</span>
            <input
              value={libraryName}
              onChange={(e) => setLibraryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameLibrary();
              }}
              className="w-32 bg-transparent text-xs font-bold text-white outline-none focus:border-b focus:border-amber-400"
              aria-label="SP-404 set name"
              title="Click RENAME or press Enter to rename active set"
            />
            <button
              type="button"
              onClick={handleSaveLibrary}
              className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold hover:bg-emerald-500/30 transition"
              title="Save current state to library"
            >
              SAVE
            </button>
            <button
              type="button"
              onClick={handleExportLibrary}
              className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold hover:bg-cyan-500/30 transition"
              title="Export .jw404 library bundle"
            >
              EXPORT
            </button>
          </div>

          {/* Sample Tools: Skip-Back, Auto-Chop Deck, Chop Finder & Card Loader */}
          {onOpenSkipBack && (
            <button
              type="button"
              onClick={onOpenSkipBack}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Retrospective Skip-Back Capture (Last 25s)"
            >
              <RotateCcw size={12} className="text-amber-400" />
              <span>SKIP-BACK</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const currentPad = sp404AudioEngine.getPad(activeBank, selectedPadId);
              if (currentPad?.audioBuffer) {
                onOpenAutoChop?.(currentPad.audioBuffer);
              } else {
                const fallback = sp404AudioEngine.getSkipBackAudioBuffer('master', 15.0);
                if (fallback) onOpenAutoChop?.(fallback);
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm"
            title="Open Hybrid Auto-Chop Deck on Current Sample"
          >
            <Scissors size={12} className="text-amber-400" />
            <span>AUTO-CHOP</span>
          </button>

          <button
            type="button"
            onClick={() => setIsChopFinderOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm"
            title="Open Sample Finder & Split Waveform Chop Loader"
          >
            <Scissors size={12} className="text-amber-400" />
            <span>CHOP FINDER</span>
          </button>

          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-[#1a2030] hover:bg-[#222a3f] border border-slate-600 hover:border-[#ff5500] text-slate-200 hover:text-white text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm"
            title="Import legacy SP-404 card files such as A_01.WAV or A0000001.WAV"
          >
            <Upload size={12} className="text-[#ff5500]" />
            <span>LOAD SAMPLES</span>
          </button>

          {/* RC-600 Stem Exchange Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRc600ExchangeOpen(!isRc600ExchangeOpen)}
              className="px-2.5 py-1 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-700/80 text-red-200 hover:text-white text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Exchange stems and loops with Boss RC-600 Loop Station"
            >
              <Radio size={12} className="text-red-400" />
              <span>RC-600 BRIDGE</span>
            </button>

            {isRc600ExchangeOpen && (
              <div className="absolute top-9 left-0 w-72 bg-gradient-to-b from-[#24060a] to-[#120204] border-2 border-red-700/90 rounded-xl shadow-[0_10px_35px_rgba(185,28,28,0.35)] p-3.5 z-50 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-red-900/80">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Radio size={13} className="text-red-400 animate-pulse" />
                    <span>BOSS RC-600 BRIDGE</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsRc600ExchangeOpen(false)}
                    className="text-red-300 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-red-200">
                  Selected: <strong className="text-[#ff5500]">Pad {activeBank}{String(selectedPadId).padStart(2, '0')}</strong> ({selectedPad?.label || 'Empty'})
                </div>

                <div className="my-2.5 space-y-2">
                  <div>
                    <label className="text-[10px] text-red-300/80 block mb-1">TARGET RC-600 TRACK (1-6):</label>
                    <div className="grid grid-cols-6 gap-1">
                      {[1, 2, 3, 4, 5, 6].map((trkNum) => (
                        <button
                          key={trkNum}
                          type="button"
                          onClick={() => setRc600TargetTrack(trkNum)}
                          className={`py-1 rounded text-center font-bold text-xs transition border ${
                            rc600TargetTrack === trkNum
                              ? 'bg-red-600 text-white border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                              : 'bg-[#180406] text-red-300/70 border-red-950 hover:border-red-700 hover:text-white'
                          }`}
                        >
                          T{trkNum}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={!selectedPad?.audioBuffer}
                      onClick={() => {
                        if (selectedPad?.audioBuffer) {
                          rc600AudioEngine.setTrackBuffer(
                            rc600TargetTrack,
                            selectedPad.audioBuffer,
                            `SP404: ${selectedPad.label || `Pad ${activeBank}${selectedPadId}`}`
                          );
                          setRc600ExchangeMsg(`Sent Pad ${activeBank}${selectedPadId} to RC-600 Track ${rc600TargetTrack}!`);
                          setTimeout(() => setRc600ExchangeMsg(null), 3000);
                        }
                      }}
                      className="py-1.5 px-2 rounded bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 border border-red-500/80 disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-[10px] text-center transition shadow"
                      title="Send this pad's audio into RC-600 track"
                    >
                      SEND ➔ T{rc600TargetTrack}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const trk = rc600AudioEngine.getTrack(rc600TargetTrack);
                        if (trk?.audioBuffer) {
                          rc600AudioEngine.bounceTrackToSp404(rc600TargetTrack, activeBank, selectedPadId);
                          setRc600ExchangeMsg(`Imported Track ${rc600TargetTrack} into Pad ${activeBank}${selectedPadId}!`);
                          setTimeout(() => setRc600ExchangeMsg(null), 3000);
                        } else {
                          setRc600ExchangeMsg(`Track ${rc600TargetTrack} is empty!`);
                          setTimeout(() => setRc600ExchangeMsg(null), 3000);
                        }
                      }}
                      className="py-1.5 px-2 rounded bg-[#ff5500] hover:bg-[#ff6611] text-black font-bold text-[10px] text-center transition"
                      title="Import RC-600 track audio into this pad"
                    >
                      GRAB ➔ PAD
                    </button>
                  </div>
                </div>

                {rc600ExchangeMsg && (
                  <div className="text-[10px] text-emerald-300 font-bold p-1 bg-emerald-950/60 rounded border border-emerald-700/60 mb-2">
                    {rc600ExchangeMsg}
                  </div>
                )}

                {onSwitchToRC600 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsRc600ExchangeOpen(false);
                      onSwitchToRC600();
                    }}
                    className="w-full py-1.5 rounded bg-[#1c0407] hover:bg-[#2c080d] text-red-200 font-bold text-[10px] text-center transition flex items-center justify-center gap-1 border border-red-800/80 shadow"
                  >
                    <span>Open Full RC-600 Looper ➔</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Saved Sets Dropdown */}
          <select
            value={selectedLibraryId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedLibraryId(val);
              if (val) handleLoadPresetId(val);
            }}
            className="px-2.5 py-1 rounded-lg bg-[#141824] border border-slate-700 text-[11px] text-slate-200 font-sans focus:outline-none focus:border-amber-400"
            aria-label="Saved SP-404 sets"
          >
            <option value="">SAVED SETS...</option>
            <option value={WALLS_DEVINE_VOL1_ID}>★ Walls:Devine Vol. 1</option>
            {libraries.filter(l => l.id !== WALLS_DEVINE_VOL1_ID).map((library) => (
              <option key={library.id} value={library.id}>{library.name}</option>
            ))}
          </select>

          {/* Hardware Profile Selector */}
          <select
            value={hardwareProfileId}
            onChange={(e) => {
              const nextProfile = e.target.value as SP404HardwareProfileId;
              setHardwareProfileId(nextProfile);
              sp404AudioEngine.setHardwareProfile(nextProfile);
              setCardStatusMessage(`${SP404_LEGACY_PROFILES[nextProfile].label.toUpperCase()} PROFILE ACTIVE.`);
            }}
            className="px-2 py-1 rounded-lg bg-[#141824] border border-slate-700 text-[10px] text-slate-300 font-mono focus:outline-none"
            aria-label="SP-404 hardware profile"
          >
            {Object.values(SP404_LEGACY_PROFILES).map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportCardTemplate}
            className="px-2.5 py-1 rounded-lg bg-[#ff5500]/20 hover:bg-[#ff5500]/30 text-[#ff8844] border border-[#ff5500]/50 text-[11px] font-bold transition flex items-center gap-1 shadow-sm"
            title={`Export a ${SP404_LEGACY_PROFILES[hardwareProfileId].label} card-import package`}
          >
            <Download size={12} />
            <span>{isExporting ? 'EXPORTING...' : 'TEMPLATE'}</span>
          </button>
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
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverOled(true);
                  }}
                  onDragLeave={() => setIsDragOverOled(false)}
                  onDrop={handleDropOnOled}
                  className={`flex flex-col items-center justify-center my-auto z-10 w-full px-4 transition rounded-lg ${
                    isDragOverOled ? 'bg-amber-500/20 ring-1 ring-amber-400' : ''
                  }`}
                  title="Drop audio file to open in Auto-Chop Deck"
                >
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
                  {isEditingOledLabel ? (
                    <div className="flex items-center justify-center gap-1 my-0.5">
                      <input
                        type="text"
                        value={oledLabelDraft}
                        onChange={(e) => setOledLabelDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const trimmed = oledLabelDraft.trim();
                            if (trimmed) {
                              sp404AudioEngine.setPadLabel(activeBank, selectedPadId, trimmed);
                            }
                            setIsEditingOledLabel(false);
                          } else if (e.key === 'Escape') {
                            setIsEditingOledLabel(false);
                          }
                        }}
                        onBlur={() => {
                          const trimmed = oledLabelDraft.trim();
                          if (trimmed) {
                            sp404AudioEngine.setPadLabel(activeBank, selectedPadId, trimmed);
                          }
                          setIsEditingOledLabel(false);
                        }}
                        autoFocus
                        className="w-28 text-center text-[10.5px] font-black bg-black/90 border border-[#ff5500] text-white rounded px-1.5 py-0.5 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = oledLabelDraft.trim();
                          if (trimmed) {
                            sp404AudioEngine.setPadLabel(activeBank, selectedPadId, trimmed);
                          }
                          setIsEditingOledLabel(false);
                        }}
                        className="text-emerald-400 hover:text-emerald-300 p-0.5"
                        title="Confirm rename"
                      >
                        <Check size={11} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="group flex items-center justify-center gap-1 cursor-pointer max-w-[150px]"
                      onClick={() => {
                        if (!isChromaticMode && selectedPad) {
                          setOledLabelDraft(selectedPad.label || '');
                          setIsEditingOledLabel(true);
                        }
                      }}
                      title="Click to rename sample"
                    >
                      <span className="text-xs font-black text-white tracking-wider truncate max-w-[130px] drop-shadow group-hover:text-[#ff8844] transition">
                        {isChromaticMode ? getChromaticNoteLabel(selectedPadId) : selectedPad?.label || 'EMPTY SLOT'}
                      </span>
                      {!isChromaticMode && (
                        <Edit2 size={10} className="text-slate-400 opacity-0 group-hover:opacity-100 hover:text-[#ff5500] transition shrink-0" />
                      )}
                    </div>
                  )}

                  {/* Pad Info & BPM */}
                  <div className="flex items-center gap-2 mt-1 text-[9px] font-bold">
                    <span className="text-[#ff5500] bg-[#ff5500]/20 px-1 py-0.2 rounded border border-[#ff5500]/40">
                      PAD {activeBank}{selectedPadId.toString().padStart(2, '0')}
                    </span>
                    <span className="text-amber-300">
                      {globalTranspose !== 0
                        ? `TRANSPOSE: ${globalTranspose > 0 ? `+${globalTranspose}` : globalTranspose}st`
                        : activeEffect === 'pitch'
                        ? `VARISPEED: ${(((ctrl1 - 5) / 5) * 12 + ((ctrl2 - 5) / 5) * 1.0) >= 0 ? '+' : ''}${(((ctrl1 - 5) / 5) * 12 + ((ctrl2 - 5) / 5) * 1.0).toFixed(1)}st`
                        : `${bpm} BPM`}
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

          {/* Quick Pitch Transpose & Vinyl / Varispeed / MFX Options */}
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

            {activeEffect === 'pitch' && (
              <div className="flex items-center gap-1.5 text-[10px] bg-[#1a1e2b] px-2 py-1 rounded-lg border border-purple-500/40 shadow">
                <span className="text-purple-300 font-bold">VARISPEED:</span>
                <span className="text-amber-400 font-mono font-black">
                  {(((ctrl1 - 5) / 5) * 12 + ((ctrl2 - 5) / 5) * 1.0) >= 0 ? '+' : ''}
                  {(((ctrl1 - 5) / 5) * 12 + ((ctrl2 - 5) / 5) * 1.0).toFixed(1)} st
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCtrl1(5.0);
                    setCtrl2(5.0);
                    sp404AudioEngine.setCtrl1(5.0);
                    sp404AudioEngine.setCtrl2(5.0);
                  }}
                  className="px-1.5 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[9px] font-bold border border-purple-500/30"
                  title="Reset Pitch/Speed knobs to 0 semitone offset"
                >
                  RESET
                </button>
              </div>
            )}

            {activeEffect === 'djfx' && (
              <div className="flex items-center gap-1.5 text-[10px] bg-[#1a1e2b] px-2 py-1 rounded-lg border border-cyan-500/40 shadow">
                <span className="text-cyan-300 font-bold">DJFX:</span>
                <span className="text-slate-300 text-[9px]">
                  Loop: {(20 + (ctrl1 / 10) * 780).toFixed(0)}ms · Speed: {ctrl2 < 4.8 ? 'REV' : ctrl2 > 5.2 ? 'FAST' : '1X'} · Mix: {(ctrl3 * 10).toFixed(0)}%
                </span>
              </div>
            )}

            {activeEffect === 'cassette' && (
              <div className="flex items-center gap-1.5 text-[10px] bg-[#1a1e2b] px-2 py-1 rounded-lg border border-amber-500/40 shadow">
                <span className="text-amber-300 font-bold">TAPE:</span>
                <span className="text-slate-300 text-[9px]">
                  Flutter: {(ctrl1 * 10).toFixed(0)}% · Tone: {ctrl2.toFixed(1)} · Sat: {ctrl3.toFixed(1)}
                </span>
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
          {/* Banks A to J: Two Lines (Line 1: A-E, Line 2: F-J directly underneath) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-300 font-black uppercase tracking-widest w-12 text-right mr-1">
                BANK:
              </span>
              {(['A', 'B', 'C', 'D', 'E'] as const).map((b) => {
                const songTitle = getWallsDevineSongName(b);
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setActiveBank(b);
                      sp404AudioEngine.ensureBankLoaded(b);
                    }}
                    className={`h-7 min-w-[48px] px-2.5 rounded-lg flex items-center justify-center font-black text-xs border transition gap-1.5 ${
                      activeBank === b
                        ? 'bg-[#ff5500] text-black border-white shadow-[0_0_12px_#ff5500]'
                        : 'bg-[#1e2330] text-slate-200 border-slate-600 hover:text-white hover:border-slate-400'
                    }`}
                    title={songTitle ? `Bank ${b}: ${songTitle}` : `Bank ${b}`}
                  >
                    <span>{b}</span>
                    {songTitle && (
                      <span className={`text-[8.5px] font-mono tracking-tight hidden sm:inline ${
                        activeBank === b ? 'text-black/90 font-black' : 'text-[#ff8844]'
                      }`}>
                        {songTitle}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-transparent font-black uppercase tracking-widest w-12 text-right mr-1 select-none">
                BANK:
              </span>
              {(['F', 'G', 'H', 'I', 'J'] as const).map((b) => {
                const songTitle = getWallsDevineSongName(b);
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setActiveBank(b);
                      sp404AudioEngine.ensureBankLoaded(b);
                    }}
                    className={`h-7 min-w-[48px] px-2.5 rounded-lg flex items-center justify-center font-black text-xs border transition gap-1.5 ${
                      activeBank === b
                        ? 'bg-[#ff5500] text-black border-white shadow-[0_0_12px_#ff5500]'
                        : 'bg-[#1e2330] text-slate-200 border-slate-600 hover:text-white hover:border-slate-400'
                    }`}
                    title={songTitle ? `Bank ${b}: ${songTitle}` : `Bank ${b}`}
                  >
                    <span>{b}</span>
                    {songTitle && (
                      <span className={`text-[8.5px] font-mono tracking-tight hidden sm:inline ${
                        activeBank === b ? 'text-black/90 font-black' : 'text-[#ff8844]'
                      }`}>
                        {songTitle}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Performance & Recording Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Authentic Roland SP-404 Latching HOLD Button */}
            <button
              type="button"
              onClick={() => {
                const nextHold = !isHoldMode;
                setIsHoldMode(nextHold);
                sp404AudioEngine.setHoldMode(nextHold);
                setCardStatusMessage(nextHold ? 'HOLD MODE ACTIVE · PADS LATCH PLAYBACK' : 'HOLD MODE OFF');
              }}
              className={`px-3 py-1.5 rounded-lg text-[10.5px] font-black border transition flex items-center gap-1.5 shadow ${
                isHoldMode
                  ? 'bg-amber-500 text-black border-amber-300 shadow-[0_0_14px_#f59e0b]'
                  : 'bg-[#1e2330] text-slate-200 border-slate-600 hover:text-white hover:border-slate-400'
              }`}
              title="Latching Hold Mode (H): Sustains pad playback continuously"
            >
              <Lock size={13} className={isHoldMode ? 'animate-pulse' : ''} />
              <span>HOLD {isHoldMode ? 'ON' : 'OFF'}</span>
            </button>

            {/* Instant Stop All Voices Button */}
            <button
              type="button"
              onClick={() => {
                sp404AudioEngine.stopAllPads();
                setCardStatusMessage('STOP ALL PADS (SILENCE)');
              }}
              className="px-3 py-1.5 rounded-lg text-[10.5px] font-black border transition flex items-center gap-1.5 shadow bg-rose-950/80 text-rose-300 border-rose-700/80 hover:bg-rose-900 hover:text-white"
              title="Stop all playing voices (Space / Esc)"
            >
              <Square size={11} className="fill-current" />
              <span>STOP ALL</span>
            </button>

            {/* Chromatic Keyboard Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsChromaticMode(!isChromaticMode)}
              className={`px-3 py-1.5 rounded-lg text-[10.5px] font-black border transition flex items-center gap-1.5 shadow ${
                isChromaticMode
                  ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_12px_#c084fc]'
                  : 'bg-[#1e2330] text-slate-200 border-slate-600 hover:text-white hover:border-slate-400'
              }`}
              title="Chromatic Mode: Maps active sample across 12-pad chromatic range"
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
              title="Record external track input directly to armed pad"
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
              title="Resample master output directly to armed pad"
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
            const isPlaying = sp404AudioEngine.isPadPlaying(activeBank, pad.id);
            const isHeld = isPlaying && isHoldMode;
            const isDragTarget = dragTargetPadId === pad.id;

            return (
              <button
                key={pad.id}
                type="button"
                onMouseDown={() => handlePadPress(pad.id)}
                onMouseUp={() => handlePadRelease(pad.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragTargetPadId(pad.id);
                }}
                onDragLeave={() => setDragTargetPadId(null)}
                onDrop={(e) => handleDropOnPad(e, pad.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setEditingPad(pad);
                }}
                className={`relative h-24 rounded-2xl flex flex-col justify-between p-3 text-left transition-all duration-75 active:scale-95 border-2 shadow-lg ${
                  isDragTarget
                    ? 'ring-4 ring-amber-400 border-amber-400 bg-amber-500/30'
                    : pad.isHit
                    ? 'bg-[#ff5500] text-black border-white shadow-[0_0_24px_#ff5500]'
                    : isHeld
                    ? 'bg-[#252014] text-white border-amber-400 ring-2 ring-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.55)]'
                    : isArmedTarget
                    ? recordMode === 'resample'
                      ? 'bg-purple-900 text-white border-purple-300 animate-pulse shadow-[0_0_16px_#c084fc]'
                      : 'bg-rose-900 text-white border-rose-300 animate-pulse shadow-[0_0_16px_#f43f5e]'
                    : isSelected
                    ? 'bg-[#293042] text-white border-[#ff5500] ring-2 ring-[#ff5500]/60 shadow-xl'
                    : isPlaying
                    ? 'bg-[#222a3a] text-white border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
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
                    {isHeld ? (
                      <span className="text-[7.5px] font-black px-1 py-0.2 rounded bg-amber-400 text-black animate-pulse flex items-center gap-0.5 shadow">
                        <Lock size={8} />
                        HELD ↻
                      </span>
                    ) : (pad.audioBuffer || pad.nativeSampleAvailable) && (
                      <span className={`w-1.5 h-1.5 rounded-full ${pad.isHit || isPlaying ? 'bg-black' : 'bg-emerald-400 shadow-[0_0_4px_#34d399]'}`} />
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
                  {inlineEditingPadId === pad.id ? (
                    <input
                      type="text"
                      value={inlinePadName}
                      onChange={(e) => setInlinePadName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          const trimmed = inlinePadName.trim();
                          if (trimmed) {
                            sp404AudioEngine.setPadLabel(pad.bank, pad.id, trimmed);
                          }
                          setInlineEditingPadId(null);
                        } else if (e.key === 'Escape') {
                          setInlineEditingPadId(null);
                        }
                      }}
                      onBlur={() => {
                        const trimmed = inlinePadName.trim();
                        if (trimmed) {
                          sp404AudioEngine.setPadLabel(pad.bank, pad.id, trimmed);
                        }
                        setInlineEditingPadId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      autoFocus
                      className="w-full bg-black/95 border border-[#ff5500] text-white text-[10px] font-black rounded px-1 py-0.5 outline-none mb-0.5"
                    />
                  ) : (
                    <div
                      className="group/lbl flex items-center justify-between w-full"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setInlineEditingPadId(pad.id);
                        setInlinePadName(pad.label);
                      }}
                      title="Double-click to rename pad"
                    >
                      <span className="text-[10.5px] font-black tracking-tight truncate leading-tight block text-white group-hover/lbl:text-[#ff8844] transition">
                        {isChromaticMode ? getChromaticNoteLabel(pad.id) : pad.label}
                      </span>
                      {!isChromaticMode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInlineEditingPadId(pad.id);
                            setInlinePadName(pad.label);
                          }}
                          className="opacity-0 group-hover/lbl:opacity-100 hover:text-[#ff5500] text-slate-400 p-0.5 transition shrink-0"
                          title="Rename pad"
                        >
                          <Edit2 size={9} />
                        </button>
                      )}
                    </div>
                  )}
                  <span className={`text-[7.5px] font-black tracking-widest uppercase block truncate opacity-90 ${
                    isHeld ? 'text-amber-300 font-extrabold' : 'text-[#ff8844]'
                  }`}>
                    {isHeld ? 'HOLD LATCHED' : pad.nativeSampleAvailable && !pad.audioBuffer ? 'NATIVE RESTORED' : PAD_SUB_LABELS[idx]}
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
      <SP404PadInspectorDrawer
        editingPad={editingPad}
        onClose={() => setEditingPad(null)}
        onPadUpdated={() => setTick((t) => t + 1)}
      />

      {/* 8. Sample Finder & Split Waveform Chop Loader Modal */}
      <SP404ChopFinderModal
        isOpen={isChopFinderOpen}
        onClose={() => setIsChopFinderOpen(false)}
        activeBank={activeBank}
        selectedPadId={selectedPadId}
        onStatusMessage={(msg) => setCardStatusMessage(msg)}
      />
    </div>
  );
};

export const SP404Workstation = React.memo(SP404WorkstationComponent, (prev, next) => {
  return (
    prev.onSwitchToPedalLab === next.onSwitchToPedalLab &&
    prev.onSwitchToState === next.onSwitchToState &&
    prev.onOpenRoutingModal === next.onOpenRoutingModal &&
    prev.telemetry?.bpm === next.telemetry?.bpm
  );
});
