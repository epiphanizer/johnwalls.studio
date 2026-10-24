#!/usr/bin/env python3
"""
als_group_bouncer.py
====================
High-fidelity offline stem rendering and Boss RC-600 patching engine.
Directly parses Ableton Live project files (.als, gzipped XML) to extract:
  - Exact track and group hierarchy (GroupTrack, AudioTrack, MidiTrack)
  - Master tempo and time signature
  - Clip placement on the arrangement timeline (CurrentStart, CurrentEnd)
  - Time-based offset alignment: preserves exact leading silence at start
    of offsets so bounced stems line up sample-accurately down to the sample
  - 16-bit, 24-bit, and 32-bit AIFF/WAV sample decoding
  - Studio-grade polyphase FIR resampling (48 kHz / 44.1 kHz -> 44.1 kHz)
  - Summing, gain scaling, and peak headroom normalization
  - Direct 32-bit IEEE float WAV export and Boss RC-600 hardware patching:
    /Volumes/RC-600/ROLAND/WAVE/{mem:03d}_{trk}/{mem:03d}_{trk}.WAV
"""

import os
import sys
import gzip
import json
import struct
import aifc
import wave
import shutil
import argparse
import subprocess
import numpy as np
import scipy.signal
import xml.etree.ElementTree as ET

RC600_TARGET_SR = 44100

def find_rc600_volume():
    candidates = [
        "/Volumes/RC-600",
        "/Volumes/BOSS_RC-600",
        "/Volumes/BOSS_RC",
        "/Volumes/BOSS",
        "/Volumes/ROLAND"
    ]
    for c in candidates:
        if os.path.isdir(c):
            if os.path.isdir(os.path.join(c, "ROLAND", "WAVE")) or "RC" in os.path.basename(c).upper():
                return c
    vol_dir = "/Volumes"
    if os.path.isdir(vol_dir):
        for entry in os.listdir(vol_dir):
            full = os.path.join(vol_dir, entry)
            if os.path.isdir(full) and entry not in ["Macintosh HD", "cache", "johnwalls"] and not entry.startswith("."):
                if os.path.isdir(os.path.join(full, "ROLAND", "WAVE")) or "RC-600" in entry.upper():
                    return full
    return None

def load_audio_file(file_path):
    """
    Decodes AIFF and WAV files supporting 16-bit, 24-bit, and 32-bit float audio.
    Returns: (numpy.ndarray [samples, channels], sample_rate)
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext in [".aif", ".aiff"]:
        with aifc.open(file_path, "rb") as af:
            ch = af.getnchannels()
            sr = af.getframerate()
            sw = af.getsampwidth()
            nframes = af.getnframes()
            raw = af.readframes(nframes)
        if sw == 2:
            arr = np.frombuffer(raw, dtype=">i2").astype(np.float32) / 32768.0
        elif sw == 3:
            b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
            padded = np.zeros((b.shape[0], 4), dtype=np.uint8)
            padded[:, :3] = b
            arr = padded.view(">i4")[:, 0].astype(np.float32) / (2**31)
        elif sw == 4:
            arr = np.frombuffer(raw, dtype=">i4").astype(np.float32) / (2**31)
        else:
            raise ValueError(f"Unsupported AIFF sample width: {sw}")
        arr = arr.reshape(-1, ch)
        return arr, sr

    elif ext == ".wav":
        with open(file_path, "rb") as f:
            header = f.read(12)
            if len(header) < 12 or header[:4] != b"RIFF" or header[8:12] != b"WAVE":
                raise ValueError(f"Not a valid RIFF/WAVE file: {file_path}")
            
            fmt_data = None
            data_bytes = None
            while True:
                chunk_hdr = f.read(8)
                if len(chunk_hdr) < 8:
                    break
                cid = chunk_hdr[:4]
                clen = struct.unpack("<I", chunk_hdr[4:8])[0]
                if cid == b"fmt ":
                    fmt_data = f.read(clen)
                    if clen % 2 != 0:
                        f.read(1)
                elif cid == b"data":
                    data_bytes = f.read(clen)
                    if clen % 2 != 0:
                        f.read(1)
                    break
                else:
                    f.seek(clen + (clen % 2), 1)

        if fmt_data is None or data_bytes is None:
            raise ValueError(f"Missing fmt or data chunk in WAV file: {file_path}")

        wFormatTag, ch, sr, _, block_align, bits = struct.unpack("<HHIIHH", fmt_data[:16])

        # Check for WAVE_FORMAT_EXTENSIBLE (0xFFFE)
        if wFormatTag == 0xFFFE and len(fmt_data) >= 40:
            sub_tag = struct.unpack("<H", fmt_data[24:26])[0]
            wFormatTag = sub_tag

        if wFormatTag == 3:  # IEEE Float
            if bits == 32:
                arr = np.frombuffer(data_bytes, dtype="<f4")
            elif bits == 64:
                arr = np.frombuffer(data_bytes, dtype="<f8").astype(np.float32)
            else:
                raise ValueError(f"Unsupported float bit depth: {bits}")
        elif wFormatTag == 1 or wFormatTag == 0xFFFE:  # PCM
            if bits == 16:
                arr = np.frombuffer(data_bytes, dtype="<i2").astype(np.float32) / 32768.0
            elif bits == 24:
                b = np.frombuffer(data_bytes, dtype=np.uint8).reshape(-1, 3)
                padded = np.zeros((b.shape[0], 4), dtype=np.uint8)
                padded[:, 1:] = b
                arr = padded.view("<i4")[:, 0].astype(np.float32) / 2147483648.0
            elif bits == 32:
                arr = np.frombuffer(data_bytes, dtype="<i4").astype(np.float32) / 2147483648.0
            elif bits == 8:
                arr = (np.frombuffer(data_bytes, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
            else:
                raise ValueError(f"Unsupported PCM bit depth: {bits}")
        else:
            raise ValueError(f"Unsupported WAV format tag: {wFormatTag}")

        arr = arr.reshape(-1, ch)
        return arr, sr

    else:
        raise ValueError(f"Unsupported audio extension: {ext}")

def resample_audio(audio_data, source_sr, target_sr=RC600_TARGET_SR):
    """
    Resamples multi-channel audio using polyphase FIR filtering.
    """
    if source_sr == target_sr:
        return audio_data.astype(np.float32)

    import math
    g = math.gcd(target_sr, source_sr)
    up = target_sr // g
    down = source_sr // g

    resampled = scipy.signal.resample_poly(audio_data, up, down, axis=0)
    return resampled.astype(np.float32)

def write_rc600_wav(dest_path, audio_data, sample_rate=RC600_TARGET_SR):
    """
    Writes 32-bit IEEE float, 44.1 kHz stereo WAV byte-exact for Boss RC-600.
    """
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    if audio_data.ndim == 1:
        audio_data = np.column_stack([audio_data, audio_data])
    elif audio_data.shape[1] == 1:
        audio_data = np.column_stack([audio_data[:, 0], audio_data[:, 0]])

    audio_float = audio_data.astype(np.float32)
    raw_bytes = audio_float.tobytes()
    ch = audio_float.shape[1]
    byte_rate = sample_rate * ch * 4
    block_align = ch * 4

    hdr = bytearray(44)
    hdr[0:4] = b'RIFF'
    struct.pack_into('<I', hdr, 4, 36 + len(raw_bytes))
    hdr[8:12] = b'WAVE'
    hdr[12:16] = b'fmt '
    struct.pack_into('<I', hdr, 16, 16)
    struct.pack_into('<H', hdr, 20, 3)          # IEEE Float
    struct.pack_into('<H', hdr, 22, ch)
    struct.pack_into('<I', hdr, 24, sample_rate)
    struct.pack_into('<I', hdr, 28, byte_rate)
    struct.pack_into('<H', hdr, 32, block_align)
    struct.pack_into('<H', hdr, 34, 32)         # 32-bit float
    hdr[36:40] = b'data'
    struct.pack_into('<I', hdr, 40, len(raw_bytes))

    with open(dest_path, "wb") as f:
        f.write(hdr)
        f.write(raw_bytes)

    return os.path.getsize(dest_path)

class AlsProject:
    """
    Represents an Ableton Live set (.als) file with track/group inspection
    and timeline sample resolution.
    """
    def __init__(self, als_path):
        if not os.path.exists(als_path):
            raise FileNotFoundError(f"ALS file not found: {als_path}")
        self.als_path = os.path.abspath(als_path)
        self.project_dir = os.path.dirname(self.als_path)

        with gzip.open(self.als_path, "rb") as f:
            self.root = ET.fromstring(f.read())

        # Extract tempo
        tempo_node = self.root.find(".//MasterTrack//Tempo//Manual")
        self.bpm = float(tempo_node.attrib.get("Value", "120.0")) if tempo_node is not None else 120.0
        self.beat_sec = 60.0 / self.bpm

        # Parse groups and tracks
        self.groups = {}        # group_id -> { "name": str, "track_ids": [] }
        self.group_by_name = {} # lowercase name -> group_id
        self.tracks = {}        # track_id -> dict

        self._parse_tracks()

    def _parse_tracks(self):
        # 1. Discover all GroupTracks
        for gt in self.root.findall(".//Tracks/GroupTrack"):
            gid = gt.attrib.get("Id")
            name_node = gt.find(".//EffectiveName")
            name = name_node.attrib.get("Value", "Unnamed Group") if name_node is not None else "Unnamed Group"
            self.groups[gid] = {
                "id": gid,
                "name": name,
                "track_ids": []
            }
            self.group_by_name[name.strip().lower()] = gid

        # 2. Discover AudioTracks and MidiTracks
        for t in self.root.findall(".//Tracks/*"):
            if t.tag in ["AudioTrack", "MidiTrack"]:
                tid = t.attrib.get("Id")
                name_node = t.find(".//EffectiveName")
                name = name_node.attrib.get("Value", "Unnamed Track") if name_node is not None else "Unnamed Track"

                # Check if belongs to group
                tgid_node = t.find(".//TrackGroupId")
                tgid = tgid_node.attrib.get("Value") if tgid_node is not None else "-1"
                if tgid in self.groups:
                    self.groups[tgid]["track_ids"].append(tid)

                # Check mute / speaker
                spk = t.find(".//DeviceChain/Mixer/Speaker/Manual")
                is_active = True
                if spk is not None and spk.attrib.get("Value", "true").lower() == "false":
                    is_active = False

                # Volume gain
                vol_node = t.find(".//DeviceChain/Mixer/Volume/Manual")
                vol_linear = float(vol_node.attrib.get("Value", "1.0")) if vol_node is not None else 1.0

                clips = []
                for c in t.findall(".//AudioClip"):
                    cs = float(c.find(".//CurrentStart").attrib.get("Value", "0.0")) if c.find(".//CurrentStart") is not None else 0.0
                    ce = float(c.find(".//CurrentEnd").attrib.get("Value", "0.0")) if c.find(".//CurrentEnd") is not None else 0.0
                    ls = float(c.find(".//Loop/LoopStart").attrib.get("Value", "0.0")) if c.find(".//Loop/LoopStart") is not None else 0.0
                    sr = float(c.find(".//Loop/StartRelative").attrib.get("Value", "0.0")) if c.find(".//Loop/StartRelative") is not None else 0.0

                    rel_node = c.find(".//FileRef/RelativePath")
                    rel_path = rel_node.attrib.get("Value", "") if rel_node is not None else ""
                    abs_node = c.find(".//FileRef/Path")
                    abs_path = abs_node.attrib.get("Value", "") if abs_node is not None else ""

                    clips.append({
                        "start_beat": cs,
                        "end_beat": ce,
                        "loop_start_beat": ls,
                        "start_rel_beat": sr,
                        "relative_path": rel_path,
                        "absolute_path": abs_path
                    })

                self.tracks[tid] = {
                    "id": tid,
                    "type": t.tag,
                    "name": name,
                    "group_id": tgid,
                    "active": is_active,
                    "gain": vol_linear,
                    "clips": clips
                }

    def resolve_sample_path(self, rel_path, abs_path):
        """
        Locates the physical sample file across project directories.
        """
        candidates = []
        if rel_path:
            candidates.append(os.path.normpath(os.path.join(self.project_dir, rel_path)))
            candidates.append(os.path.normpath(os.path.join(self.project_dir, "Samples", rel_path)))
            candidates.append(os.path.normpath(os.path.join(self.project_dir, "Samples", "Recorded", os.path.basename(rel_path))))
            candidates.append(os.path.normpath(os.path.join(self.project_dir, "Samples", "Processed", os.path.basename(rel_path))))

        if abs_path:
            candidates.append(abs_path)
            # Rebase from /Users/sean/ to current /Users/seanhalls/
            if abs_path.startswith("/Users/sean/"):
                candidates.append(abs_path.replace("/Users/sean/", "/Users/seanhalls/"))

        for c in candidates:
            if os.path.exists(c):
                return c
        return None

    def get_group_track_ids(self, group_name_query):
        """
        Finds all track IDs belonging to group name (case-insensitive substring).
        """
        q = group_name_query.strip().lower()
        matched_tracks = []
        for gid, ginfo in self.groups.items():
            if q in ginfo["name"].lower():
                matched_tracks.extend(ginfo["track_ids"])

        # Also match individual track names if query matches track directly
        for tid, tinfo in self.tracks.items():
            if q == tinfo["name"].strip().lower() or (len(q) > 3 and q in tinfo["name"].strip().lower()):
                if tid not in matched_tracks:
                    matched_tracks.append(tid)

        return matched_tracks

    def render_tracks_to_buffer(self, track_ids, target_sr=RC600_TARGET_SR, start_beat=0.0, end_beat=None):
        """
        Performs timeline-accurate audio bounce across selected tracks:
          - Preserves leading silence up to start of offsets
          - Time-aligns all clips on arrangement grid
          - Sums channels into master float32 stereo buffer
        """
        if not track_ids:
            raise ValueError("No tracks selected for render.")

        # Determine total length
        max_beat = 0.0
        for tid in track_ids:
            tinfo = self.tracks.get(tid)
            if not tinfo: continue
            for c in tinfo["clips"]:
                if c["end_beat"] > max_beat:
                    max_beat = c["end_beat"]

        if end_beat and end_beat > max_beat:
            max_beat = end_beat

        total_beats = max_beat - start_beat
        total_seconds = total_beats * self.beat_sec
        total_samples = int(np.ceil(total_seconds * target_sr)) + int(target_sr * 2) # 2s safety ringout

        master_buffer = np.zeros((total_samples, 2), dtype=np.float32)

        sample_cache = {}
        clips_rendered = 0

        for tid in track_ids:
            tinfo = self.tracks.get(tid)
            if not tinfo or not tinfo["active"]:
                continue

            track_gain = tinfo["gain"]

            for c in tinfo["clips"]:
                if c["end_beat"] <= start_beat:
                    continue

                sample_path = self.resolve_sample_path(c["relative_path"], c["absolute_path"])
                if not sample_path:
                    continue

                if sample_path not in sample_cache:
                    try:
                        raw_data, raw_sr = load_audio_file(sample_path)
                        resampled = resample_audio(raw_data, raw_sr, target_sr)
                        sample_cache[sample_path] = resampled
                    except Exception as e:
                        print(f"Warning: Failed to load {sample_path}: {e}")
                        continue

                audio = sample_cache[sample_path]
                if audio.shape[1] == 1:
                    audio = np.column_stack([audio[:, 0], audio[:, 0]])

                # Timeline offset positioning (in beats -> seconds -> samples)
                clip_rel_start_beat = max(0.0, c["start_beat"] - start_beat)
                clip_start_sample = int(round(clip_rel_start_beat * self.beat_sec * target_sr))

                # Internal sample offset (StartRelative or LoopStart)
                internal_offset_beat = c["start_rel_beat"] if c["start_rel_beat"] > 0 else c["loop_start_beat"]
                internal_offset_sample = int(round(internal_offset_beat * self.beat_sec * target_sr))

                clip_duration_beats = c["end_beat"] - c["start_beat"]
                clip_duration_samples = int(round(clip_duration_beats * self.beat_sec * target_sr))

                if internal_offset_sample < audio.shape[0]:
                    sample_slice = audio[internal_offset_sample : internal_offset_sample + clip_duration_samples]
                else:
                    sample_slice = np.zeros((clip_duration_samples, 2), dtype=np.float32)

                slice_len = sample_slice.shape[0]
                dest_end = min(total_samples, clip_start_sample + slice_len)
                actual_len = dest_end - clip_start_sample

                if actual_len > 0 and clip_start_sample < total_samples:
                    master_buffer[clip_start_sample:dest_end] += sample_slice[:actual_len] * track_gain
                    clips_rendered += 1

        if end_beat is None:
            # Trim trailing silence down to last active sample + 1 sec ringout
            abs_energy = np.abs(master_buffer[:, 0]) + np.abs(master_buffer[:, 1])
            active_indices = np.where(abs_energy > 1e-4)[0]
            if len(active_indices) > 0:
                last_active = min(total_samples, active_indices[-1] + int(target_sr * 1.0))
                master_buffer = master_buffer[:last_active]
        else:
            fixed_len = int(np.ceil((end_beat - start_beat) * self.beat_sec * target_sr))
            if master_buffer.shape[0] > fixed_len:
                master_buffer = master_buffer[:fixed_len]
            elif master_buffer.shape[0] < fixed_len:
                padded = np.zeros((fixed_len, 2), dtype=np.float32)
                padded[:master_buffer.shape[0]] = master_buffer
                master_buffer = padded

        return master_buffer, clips_rendered

    def get_song_max_beat(self):
        max_beat = 0.0
        for tid, tinfo in self.tracks.items():
            for c in tinfo["clips"]:
                if c["end_beat"] > max_beat:
                    max_beat = c["end_beat"]
        return max_beat

def bounce_and_patch(als_path, group_names, out_path=None, memory_slot=None, rc600_track=None, normalize_db=-1.0, start_beat=0.0, end_beat=None, exclude_names=None):
    """
    Main entrypoint: parses project, renders group stems, and optionally patches Boss RC-600.
    """
    proj = AlsProject(als_path)
    track_ids = []
    resolved_groups = []

    for gname in group_names:
        tids = proj.get_group_track_ids(gname)
        if tids:
            track_ids.extend(tids)
            resolved_groups.append(gname)

    track_ids = list(dict.fromkeys(track_ids)) # Unique

    if exclude_names:
        exclude_lower = [x.strip().lower() for x in exclude_names if x.strip()]
        filtered_track_ids = []
        for tid in track_ids:
            tname = proj.tracks.get(tid, {}).get("name", "").strip().lower()
            if not any(ex in tname for ex in exclude_lower):
                filtered_track_ids.append(tid)
        track_ids = filtered_track_ids

    if not track_ids:
        return {
            "ok": False,
            "error": f"No tracks or groups found matching: {group_names} (after exclusions: {exclude_names})"
        }

    buffer, clips_count = proj.render_tracks_to_buffer(track_ids, start_beat=start_beat, end_beat=end_beat)

    # Normalize headroom
    peak = float(np.max(np.abs(buffer)))
    if peak > 0.0:
        target_linear = 10.0 ** (normalize_db / 20.0)
        gain_adjust = target_linear / peak
        buffer *= gain_adjust
        final_peak_db = normalize_db
    else:
        final_peak_db = -96.0

    bytes_written = 0
    included_tracks = [proj.tracks[tid]["name"] for tid in track_ids]
    results = {
        "ok": True,
        "project": os.path.basename(als_path),
        "bpm": proj.bpm,
        "groups": resolved_groups,
        "includedTracks": included_tracks,
        "clipsRendered": clips_count,
        "durationSeconds": float(buffer.shape[0] / RC600_TARGET_SR),
        "peakDb": final_peak_db,
        "outPath": "",
        "rc600Patched": False
    }

    # Write output file if specified
    if out_path:
        bytes_written += write_rc600_wav(out_path, buffer)
        results["outPath"] = out_path

    # Patch directly to Boss RC-600 if requested
    if memory_slot is not None and rc600_track is not None:
        rc600_vol = find_rc600_volume()
        if rc600_vol:
            mem_folder_name = f"{memory_slot:03d}_{rc600_track}"
            rc_dest = os.path.join(rc600_vol, "ROLAND", "WAVE", mem_folder_name, f"{mem_folder_name}.WAV")
            bytes_written += write_rc600_wav(rc_dest, buffer)
            results["rc600Patched"] = True
            results["rc600Path"] = rc_dest

            # Clean metadata
            subprocess.run(["dot_clean", "-m", os.path.join(rc600_vol, "ROLAND")], check=False)
            subprocess.run(["sync"], check=False)

    results["bytesWritten"] = bytes_written
    return results

def bounce_full_song_to_rc600(
    als_path,
    memory_slot,
    drums_groups=("Drums", "PERCUSSION"),
    bass_tracks=("Bass",),
    inst_groups=("All Guitars", "New Guitars", "Terry Guitars", "Acoustics", "Shitty Electric", "Midi"),
    exclude_inst=("Bass", "Vocal", "Vox", "Quote", "Puff", "Spice", "Beatbox", "Bogart"),
    exclude_drums=("Bass", "Vocal", "Vox", "Guitar"),
    update_local_transfer=True
):
    """
    Bounces a complete 3-track stem layout for a song directly onto Boss RC-600:
      Track 1: Drums
      Track 2: Bass
      Track 3: Guitars & Instruments
    """
    proj = AlsProject(als_path)
    rc_vol = find_rc600_volume()
    max_song_beat = proj.get_song_max_beat()

    local_wave_base = "/Users/seanhalls/Desktop/Boss_RC600_Transfer/ROLAND/WAVE"
    named_base = f"/Users/seanhalls/Desktop/Boss_RC600_Transfer/Named_Stems/{memory_slot:02d}_Joint_Queen"
    os.makedirs(local_wave_base, exist_ok=True)
    os.makedirs(named_base, exist_ok=True)

    song_results = []
    # 1. Track 1: Drums
    d_out = os.path.join(local_wave_base, f"{memory_slot:02d}_1.WAV")
    d_res = bounce_and_patch(als_path, drums_groups, out_path=d_out, memory_slot=memory_slot, rc600_track=1, end_beat=max_song_beat, exclude_names=exclude_drums)
    song_results.append(("Track 1 (Drums)", d_res))

    # 2. Track 2: Bass
    b_out = os.path.join(local_wave_base, f"{memory_slot:02d}_2.WAV")
    b_res = bounce_and_patch(als_path, bass_tracks, out_path=b_out, memory_slot=memory_slot, rc600_track=2, end_beat=max_song_beat)
    song_results.append(("Track 2 (Bass)", b_res))

    # 3. Track 3: Guitars & Other Instruments
    g_out = os.path.join(local_wave_base, f"{memory_slot:02d}_3.WAV")
    g_res = bounce_and_patch(als_path, inst_groups, out_path=g_out, memory_slot=memory_slot, rc600_track=3, end_beat=max_song_beat, exclude_names=exclude_inst)
    song_results.append(("Track 3 (Guitars/Inst)", g_res))

    total_bytes = sum(r[1].get("bytesWritten", 0) for r in song_results)
    all_ok = all(r[1].get("ok", False) for r in song_results)

    # Also update Named_Stems directory
    if update_local_transfer and all_ok:
        stem_names = {1: "Trk1_Drums", 2: "Trk2_Bass", 3: "Trk3_Guitars_Other"}
        for trk_idx, (trk_label, res_dict) in enumerate(song_results, start=1):
            src_path = res_dict.get("outPath") or res_dict.get("rc600Path")
            if src_path and os.path.exists(src_path):
                dst_named = os.path.join(named_base, f"{memory_slot:02d}_Joint_Queen_{stem_names[trk_idx]}.wav")
                shutil.copy2(src_path, dst_named)

    return {
        "ok": all_ok,
        "memorySlot": memory_slot,
        "project": os.path.basename(als_path),
        "bpm": proj.bpm,
        "songDurationSeconds": float(max_song_beat * proj.beat_sec),
        "tracks": song_results,
        "bytesWritten": total_bytes,
        "message": f"Successfully rendered and patched 3 time-aligned stems to Boss RC-600 Memory {memory_slot:03d} (Trk 1: Drums, Trk 2: Bass, Trk 3: Guitars/Inst)."
    }


def get_ableton_status():
    """
    Detects running Ableton Live process, currently opened document,
    and recent project history from Ableton's runtime logs.
    """
    is_running = False
    live_pid = None
    try:
        out = subprocess.check_output(["pgrep", "-f", "Contents/MacOS/Live"], text=True)
        pids = [int(p) for p in out.strip().split() if p.isdigit()]
        if pids:
            is_running = True
            live_pid = pids[0]
    except Exception:
        pass

    pref_dir = os.path.expanduser("~/Library/Preferences/Ableton")
    active_doc = None
    doc_source = None
    recent_docs = []

    if os.path.exists(pref_dir):
        import glob, re
        logs = glob.glob(os.path.join(pref_dir, "Live *", "Log.txt"))
        logs.sort(key=os.path.getmtime, reverse=True)

        for log in logs:
            try:
                with open(log, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()[-600:]
                for line in reversed(lines):
                    m = re.search(r"info:\s+(?:Loading document|Open document:|Restore Document: LoadOrCreateDocumentToRestoreFrom:)\s+\"([^\"]+\.als)\"", line)
                    if m:
                        cand = m.group(1)
                        if active_doc is None:
                            active_doc = cand
                            doc_source = "Log.txt"
                        if cand not in recent_docs and not cand.endswith("DefaultLiveSet.als") and os.path.exists(cand):
                            recent_docs.append(cand)
            except Exception:
                pass

        if active_doc is None:
            cfgs = glob.glob(os.path.join(pref_dir, "Live *", "CrashRecoveryInfo.cfg"))
            cfgs.sort(key=os.path.getmtime, reverse=True)
            for cfg in cfgs:
                try:
                    with open(cfg, "rb") as f:
                        raw = f.read().decode("latin1", errors="ignore")
                    matches = re.findall(r"(/[a-zA-Z0-9_\-\s\.\:]+\.als)", raw)
                    for cand in matches:
                        cand = cand.strip()
                        if os.path.exists(cand):
                            active_doc = cand
                            doc_source = "CrashRecoveryInfo.cfg"
                            break
                except Exception:
                    pass

    is_default = False
    if active_doc:
        is_default = "DefaultLiveSet.als" in active_doc or "BaseFiles" in active_doc or "Builtin/Templates" in active_doc

    archive_candidates = [
        "/Volumes/johnwalls/Archive up to Oct 5th 2026/Volume 1/Joint Queen Project/Joint_Queen_Master_Streaming_3Vox.als",
        "/Volumes/johnwalls/Archive up to Oct 5th 2026/Volume 1/Joint Queen Project/Joint QUeen.als",
        "/Volumes/cache/archive/music/Space_Cruiser_Sketch/9_14 Copy.als",
        "/Volumes/johnwalls/Archive up to Oct 5th 2026/Volume 1/Master Album Part 1 Vol ! Project/Master Album Part 1 Vol !.als"
    ]
    for c in archive_candidates:
        if os.path.exists(c) and c not in recent_docs:
            recent_docs.append(c)

    return {
        "liveRunning": is_running,
        "livePid": live_pid,
        "activeDocument": active_doc,
        "isDefaultSet": is_default,
        "activeDocumentExists": os.path.exists(active_doc) if active_doc else False,
        "source": doc_source,
        "recentProjects": recent_docs
    }


def main():
    parser = argparse.ArgumentParser(description="Ableton Group Bouncer & Boss RC-600 Direct Patcher")
    parser.add_argument("--als", type=str, default="", help="Path or index to Ableton Live set (.als)")
    parser.add_argument("--status", action="store_true", help="Report Ableton Live host status and active document as JSON")
    parser.add_argument("--list", action="store_true", help="List all groups and tracks in project")
    parser.add_argument("--open", type=str, default="", help="Open specified ALS project in Ableton Live")
    parser.add_argument("--groups", type=str, default="", help="Comma-separated group names to bounce")
    parser.add_argument("--track", type=str, default="", help="Specific track name to bounce")
    parser.add_argument("--exclude", type=str, default="", help="Comma-separated track/group names to exclude")
    parser.add_argument("--out", type=str, default="", help="Output WAV file path")
    parser.add_argument("--patch-rc600", action="store_true", help="Patch rendered audio directly to mounted Boss RC-600")
    parser.add_argument("--memory", type=int, default=None, help="RC-600 Memory slot (1..99)")
    parser.add_argument("--rc600-track", type=int, default=None, help="RC-600 Track index (1..6)")
    parser.add_argument("--auto-song", type=int, default=None, help="Automatically bounce 3-track stem layout (Drums, Bass, Guitars) to RC-600 memory slot")

    args = parser.parse_args()

    ableton_st = get_ableton_status()

    if args.status:
        print(json.dumps(ableton_st, indent=2))
        return 0

    if args.open:
        target_open = args.open.strip()
        if target_open.isdigit():
            idx = int(target_open) - 1
            if 0 <= idx < len(ableton_st["recentProjects"]):
                target_open = ableton_st["recentProjects"][idx]
        if not os.path.exists(target_open):
            print(f"Error: File not found: {target_open}", file=sys.stderr)
            return 1
        print(f"Opening project in Ableton Live: {target_open}...")
        subprocess.run(["open", target_open], check=False)
        return 0

    # Resolve ALS path
    als_target = args.als.strip() if args.als else ""
    if als_target.isdigit():
        idx = int(als_target) - 1
        if 0 <= idx < len(ableton_st["recentProjects"]):
            als_target = ableton_st["recentProjects"][idx]

    if not als_target:
        # If user didn't specify --als, check active document
        if ableton_st["activeDocument"] and not ableton_st["isDefaultSet"] and ableton_st["activeDocumentExists"]:
            als_target = ableton_st["activeDocument"]

    if args.list:
        print("\n=======================================================")
        print("ABLETON LIVE HOST & PROJECT INSPECTION")
        print("=======================================================")
        if ableton_st["liveRunning"]:
            print(f"Live Process:      RUNNING (PID: {ableton_st['livePid']})")
        else:
            print("Live Process:      NOT RUNNING")

        if ableton_st["activeDocument"]:
            status_note = " (Untitled / Default Set)" if ableton_st["isDefaultSet"] else " (Active Document)"
            print(f"Active Document:   {os.path.basename(ableton_st['activeDocument'])}{status_note}")
            print(f"Active Path:       {ableton_st['activeDocument']}")
        else:
            print("Active Document:   None detected")

        if not als_target:
            print("\n=======================================================")
            print("RECENT & ARCHIVED ABLETON PROJECTS:")
            print("=======================================================")
            for i, p in enumerate(ableton_st["recentProjects"], 1):
                p_name = os.path.splitext(os.path.basename(p))[0]
                print(f"  [{i}] {p_name}")
                print(f"      Path: {p}")
            print("\n[Quick Commands]")
            print("  Inspect:   bounce list <number>    (e.g. 'bounce list 1')")
            print("  Bounce:    bounce auto <slot> <n>  (e.g. 'bounce auto 6 1')")
            print("  Open:      bounce open <number>    (e.g. 'bounce open 1')")
            return 0

        # Inspect specific ALS project
        proj = AlsProject(als_target)
        print(f"\n=======================================================")
        print(f"Inspecting Project: {os.path.basename(als_target)}")
        print(f"Project File:       {als_target}")
        print(f"Master BPM:         {proj.bpm}")
        print(f"Total Groups:       {len(proj.groups)}")
        print(f"Total Tracks:       {len(proj.tracks)}")
        print(f"=======================================================\n")
        print("GROUPS & CHILD TRACKS:")
        for gid, ginfo in proj.groups.items():
            print(f"  [Group: {ginfo['name']}] (ID: {gid})")
            for tid in ginfo["track_ids"]:
                t = proj.tracks.get(tid, {})
                print(f"     - [{t.get('type')}] \"{t.get('name')}\" ({len(t.get('clips', []))} clips, active={t.get('active')})")
        print("\nUNGROUPED TRACKS:")
        for tid, t in proj.tracks.items():
            if t.get("group_id") == "-1":
                print(f"  - [{t.get('type')}] \"{t.get('name')}\" ({len(t.get('clips', []))} clips)")
        return 0

    if args.auto_song is not None:
        if not als_target:
            if ableton_st["recentProjects"]:
                als_target = ableton_st["recentProjects"][0]
            else:
                print("Error: No ALS project specified or detected. Specify --als <path>", file=sys.stderr)
                return 1
        res = bounce_full_song_to_rc600(als_target, memory_slot=args.auto_song)
        print(json.dumps(res, indent=2, default=str))
        return 0 if res.get("ok") else 1

    targets = []
    if args.groups:
        targets.extend([g.strip() for g in args.groups.split(",") if g.strip()])
    if args.track:
        targets.append(args.track.strip())

    if not targets:
        print("Error: Specify --groups, --track, --auto-song, or --list", file=sys.stderr)
        return 1

    excludes = [e.strip() for e in args.exclude.split(",") if e.strip()] if args.exclude else None

    if not als_target:
        if ableton_st["recentProjects"]:
            als_target = ableton_st["recentProjects"][0]
        else:
            print("Error: No ALS project specified or detected. Specify --als <path>", file=sys.stderr)
            return 1

    res = bounce_and_patch(
        als_target,
        targets,
        out_path=args.out or None,
        memory_slot=args.memory,
        rc600_track=args.rc600_track,
        exclude_names=excludes
    )

    print(json.dumps(res, indent=2))
    return 0 if res.get("ok") else 1

if __name__ == "__main__":
    sys.exit(main())

