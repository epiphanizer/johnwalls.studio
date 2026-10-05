import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Square,
  UploadCloud,
  CheckCircle2,
  Trash2,
  Play,
  Pause,
  ExternalLink,
  Sparkles,
  RefreshCw,
  X
} from 'lucide-react';
import { stateBridge, AudioTakeMetadata, TakeRecorderStatus } from '../utils/stateBridge';

interface TakeRecorderCockpitProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrackName?: string;
  currentBpm?: number;
}

export const TakeRecorderCockpit: React.FC<TakeRecorderCockpitProps> = ({
  isOpen,
  onClose,
  currentTrackName = 'Master',
  currentBpm = 120
}) => {
  const [status, setStatus] = useState<TakeRecorderStatus | null>(null);
  const [recentTakes, setRecentTakes] = useState<AudioTakeMetadata[]>([]);
  const [selectedTake, setSelectedTake] = useState<AudioTakeMetadata | null>(null);

  // Form State for Publishing
  const [publishTitle, setPublishTitle] = useState('');
  const [publishArtist, setPublishArtist] = useState('John Walls');
  const [publishDesc, setPublishDesc] = useState('');
  const [publishPreset, setPublishPreset] = useState('supercollider-lissajous');
  const [targetEndpoint, setTargetEndpoint] = useState('https://johnwalls.studio/api/johnwalls/publish');
  
  // Audition playback
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Status & Progress
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessUrl, setPublishSuccessUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Poll status while open
  useEffect(() => {
    if (!isOpen) return;

    const fetchStatusAndTakes = async () => {
      const st = await stateBridge.getTakeStatus();
      if (st) setStatus(st);

      const takes = await stateBridge.getRecentTakes();
      setRecentTakes(takes);

      if (takes.length > 0 && !selectedTake) {
        setSelectedTake(takes[0]);
        setPublishTitle(takes[0].trackName + ' Pass');
      }
    };

    fetchStatusAndTakes();
    const interval = setInterval(fetchStatusAndTakes, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const isRecording = status?.isRecording ?? false;

  const handleToggleRecord = async () => {
    if (isRecording) {
      const finished = await stateBridge.stopRecording();
      if (finished) {
        setSelectedTake(finished);
        setPublishTitle(finished.trackName + ' Pass');
      }
    } else {
      await stateBridge.startRecording(currentTrackName, 'Ableton Session', currentBpm);
    }
    const st = await stateBridge.getTakeStatus();
    if (st) setStatus(st);
    const takes = await stateBridge.getRecentTakes();
    setRecentTakes(takes);
  };

  const handleToggleAutoRec = async () => {
    if (!status) return;
    await stateBridge.setAutoRecEnabled(!status.autoRecEnabled);
    const st = await stateBridge.getTakeStatus();
    if (st) setStatus(st);
  };

  const handleAudition = (take: AudioTakeMetadata) => {
    if (auditioningId === take.takeId) {
      audioPreviewRef.current?.pause();
      setAuditioningId(null);
    } else {
      setAuditioningId(take.takeId);
      if (audioPreviewRef.current) {
        audioPreviewRef.current.src = stateBridge.getAudioTakeUrl(take.takeId);
        audioPreviewRef.current.play().catch(() => {});
      }
    }
  };

  const handleDelete = async (takeId: string) => {
    await stateBridge.deleteTake(takeId);
    if (selectedTake?.takeId === takeId) {
      setSelectedTake(null);
    }
    const takes = await stateBridge.getRecentTakes();
    setRecentTakes(takes);
  };

  const handlePublish = async () => {
    if (!selectedTake) return;
    setIsPublishing(true);
    setPublishError(null);
    setPublishSuccessUrl(null);

    const result = await stateBridge.publishTake(selectedTake.takeId, {
      title: publishTitle.trim() || selectedTake.trackName,
      artist: publishArtist.trim() || 'John Walls',
      description: publishDesc.trim(),
      visualizerPreset: publishPreset,
      targetUrl: targetEndpoint
    });

    setIsPublishing(false);
    if (result.ok && result.publicUrl) {
      setPublishSuccessUrl(result.publicUrl);
    } else {
      setPublishError(result.error || 'Failed to publish audio take.');
    }
  };

  const formatSecs = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <audio
        ref={audioPreviewRef}
        onEnded={() => setAuditioningId(null)}
        onError={() => setAuditioningId(null)}
      />

      <div className="bg-[#0f1219] border border-amber-500/30 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 bg-[#141824] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[#e6af2e]">
              <Radio size={20} className={isRecording ? 'animate-pulse text-red-500' : ''} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-wide uppercase text-white">
                  ABLETON AUDIO CAPTURE & STUDIO DISPATCH
                </h2>
                <span className="text-[10px] font-mono bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 px-2 py-0.5 rounded-full font-semibold">
                  PORT 3012 ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Direct take recording from Ableton Live session · Single-click ship to johnwalls.studio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Direct Recording Deck */}
          <div className="flex flex-col gap-4">
            <div className="p-5 bg-[#171b28] border border-slate-800 rounded-xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-mono tracking-wider text-slate-400 font-semibold">
                  RECORDING DECK
                </span>
                <span className="text-xs font-mono text-[#e6af2e]">
                  {status ? `${status.sampleRate} Hz · 24-bit PCM` : '48000 Hz · 24-bit'}
                </span>
              </div>

              {/* Huge Record Button & Duration Meter */}
              <div className="flex items-center justify-between p-4 bg-[#0d1017] border border-slate-800/80 rounded-xl">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleToggleRecord}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-lg ${
                      isRecording
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/50 animate-pulse'
                        : 'bg-[#e6af2e] hover:bg-amber-400 text-slate-950 shadow-amber-900/30'
                    }`}
                  >
                    {isRecording ? <Square size={24} className="fill-current" /> : <Radio size={26} />}
                  </button>
                  <div>
                    <div className="text-xs text-slate-400 font-mono uppercase">
                      {isRecording ? 'RECORDING LIVE TAKE' : 'READY TO CAPTURE'}
                    </div>
                    <div className="text-2xl font-mono font-bold text-white tracking-wider">
                      {formatSecs(status?.durationSeconds ?? 0)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end text-xs font-mono text-slate-400 gap-1">
                  <div>
                    TRACK: <strong className="text-slate-200">{currentTrackName}</strong>
                  </div>
                  <div>
                    BPM: <strong className="text-cyan-400">{currentBpm}</strong>
                  </div>
                  <div>
                    PEAK: <strong className="text-slate-200">{status?.peakDb?.toFixed(1) ?? '-96.0'} dB</strong>
                  </div>
                </div>
              </div>

              {/* Auto Record on DAW Playback */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Auto-Rec on Transport Play</div>
                  <div className="text-[11px] text-slate-400">Arms automatically when Ableton spacebar is pressed</div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAutoRec}
                  className={`px-3 py-1 text-xs font-mono rounded-lg transition border ${
                    status?.autoRecEnabled
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {status?.autoRecEnabled ? 'ENABLED' : 'MANUAL'}
                </button>
              </div>
            </div>

            {/* Recent Takes Shelf */}
            <div className="flex-1 flex flex-col p-4 bg-[#141824] border border-slate-800 rounded-xl min-h-[200px]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
                  SESSION TAKES ({recentTakes.length})
                </span>
                <span className="text-[11px] text-slate-500">Saved to ~/Music/johnwalls.studio/takes</span>
              </div>

              {recentTakes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-500 italic p-6">
                  No takes recorded this session yet. Press Record to capture audio.
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
                  {recentTakes.map((take) => {
                    const isSelected = selectedTake?.takeId === take.takeId;
                    const isAuditioning = auditioningId === take.takeId;
                    return (
                      <div
                        key={take.takeId}
                        onClick={() => {
                          setSelectedTake(take);
                          if (!publishTitle || publishTitle.endsWith('Pass')) {
                            setPublishTitle(take.trackName + ' Pass');
                          }
                        }}
                        className={`p-3 rounded-lg border transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/40 text-white'
                            : 'bg-[#0f1219] border-slate-800/80 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAudition(take);
                            }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                              isAuditioning
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                            }`}
                          >
                            {isAuditioning ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                          </button>
                          <div>
                            <div className="text-xs font-semibold">{take.trackName}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {formatSecs(take.durationSeconds)} · {take.bpm} BPM · {take.barCount} bars
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(take.takeId);
                            }}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-800 transition"
                            title="Delete take"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Publishing & SuperCollider Dispatch Deck */}
          <div className="flex flex-col gap-4 p-5 bg-[#171b28] border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#e6af2e]" />
                <span className="text-xs font-bold font-mono tracking-wider uppercase text-white">
                  SHIP TO JOHNWALLS.STUDIO
                </span>
              </div>
              <span className="text-[11px] text-[#e6af2e] font-mono">D2C WEB PUBLISH</span>
            </div>

            {selectedTake ? (
              <div className="space-y-4">
                <div className="p-3 bg-[#0d1017] rounded-lg border border-slate-800 text-xs font-mono space-y-1">
                  <div className="text-slate-400">SELECTED TAKE:</div>
                  <div className="text-amber-400 font-semibold">{selectedTake.fileName}</div>
                  <div className="text-slate-400">
                    {formatSecs(selectedTake.durationSeconds)} · {selectedTake.sampleRate}Hz · {selectedTake.bpm} BPM
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Track Title (Public)
                    </label>
                    <input
                      type="text"
                      value={publishTitle}
                      onChange={(e) => setPublishTitle(e.target.value)}
                      placeholder="e.g. Echo Chamber Loop Pass 1"
                      className="w-full bg-[#0d1017] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Artist / Creator
                    </label>
                    <input
                      type="text"
                      value={publishArtist}
                      onChange={(e) => setPublishArtist(e.target.value)}
                      placeholder="John Walls"
                      className="w-full bg-[#0d1017] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Visualizer Preset (SuperCollider Style)
                    </label>
                    <select
                      value={publishPreset}
                      onChange={(e) => setPublishPreset(e.target.value)}
                      className="w-full bg-[#0d1017] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="supercollider-lissajous">
                        SuperCollider Lissajous (Dual-Vector Phosphor Scope)
                      </option>
                      <option value="spectral-waterfall">
                        Spectral Harmonic Waterfall (3D Ribbons)
                      </option>
                      <option value="sumi-ink-pulse">
                        Archival Sumi-e Ink Pulse (Sumi Dynamics)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Session Notes / Gear Used
                    </label>
                    <textarea
                      rows={2}
                      value={publishDesc}
                      onChange={(e) => setPublishDesc(e.target.value)}
                      placeholder="Ableton Live master bus pass through Mesa Mark III and SP-404 vinyl sim..."
                      className="w-full bg-[#0d1017] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 mb-1">
                      Publishing Ingestion URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={targetEndpoint}
                        onChange={(e) => setTargetEndpoint(e.target.value)}
                        className="flex-1 bg-[#0d1017] border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setTargetEndpoint(
                            targetEndpoint.includes('localhost')
                              ? 'https://johnwalls.studio/api/johnwalls/publish'
                              : 'http://localhost:3000/api/johnwalls/publish'
                          )
                        }
                        className="px-2 py-1 text-[10px] font-mono rounded bg-slate-800 text-slate-300 hover:text-white"
                      >
                        {targetEndpoint.includes('localhost') ? 'Live' : 'Local'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notifications & Success link */}
                {publishError && (
                  <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-200 text-xs">
                    {publishError}
                  </div>
                )}

                {publishSuccessUrl && (
                  <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-200 text-xs flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span>TRACK SHIPPED LIVE!</span>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      View live with reactive SuperCollider visualizer at:
                    </div>
                    <a
                      href="https://johnwalls.studio"
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:underline flex items-center gap-1 font-mono text-[11px]"
                    >
                      https://johnwalls.studio ↗
                    </a>
                  </div>
                )}

                {/* Big Ship Button */}
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-[#e6af2e] hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm tracking-wide uppercase flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30 transition disabled:opacity-50"
                >
                  {isPublishing ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>SHIPPING TRACK TO WEB...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={18} />
                      <span>SHIP TO JOHNWALLS.STUDIO</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-3">
                <Radio size={32} className="text-slate-600" />
                <div className="text-xs">
                  Record or select an audio take on the left to configure and publish to johnwalls.studio.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default TakeRecorderCockpit;
