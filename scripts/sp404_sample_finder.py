#!/usr/bin/env python3
"""
sp404_sample_finder.py
======================
SP-404 Sample Finder & Split-Form Waveform Chop Loader for johnwalls.studio.

Opposite of full-song stem bouncers:
  - Discovers edited waveform split instances across Ableton Live tracks (.als) or WAV files.
  - Slices the exact edited waveform length with sample-accurate start offsets and micro-fade de-clicking.
  - Identifies repeated waveforms and sounds across arrangements.
  - Grabs single nth instances or generates 12-pad pattern chop kits (Bank A..J, Pads 1..12).
  - Encodes 16-bit 44.1 kHz stereo Roland-compliant WAVs (with genuine 'RLND' chunks for hardware SD cards).
  - Streams Base64 sample payloads for real-time hydration of browser WebAudio and native JUCE VST pads.
"""

import os
import sys
import json
import math
import struct
import base64
import argparse
from collections import defaultdict
import numpy as np

# Ensure local script directory is in Python path for sibling imports
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

from als_group_bouncer import AlsProject, load_audio_file, resample_audio, get_ableton_status
from hardware_sync import detect_hardware, make_sp404sx_wav

DEFAULT_OUTPUT_DIR = "/Users/seanhalls/Desktop/sh/johnwalls_studio/ui/public/audio/sp404"
DEFAULT_SR = 44100

def apply_micro_fades(audio_data, sr=DEFAULT_SR, fade_ms=3.0):
    """
    Applies a smooth cosine micro-fade to the start and end of an audio slice
    to prevent clicks or pops when triggering one-shots.
    """
    if len(audio_data) == 0:
        return audio_data
    fade_len = int(round((fade_ms / 1000.0) * sr))
    fade_len = min(fade_len, len(audio_data) // 2)
    if fade_len <= 0:
        return audio_data

    # Cosine fade curve
    fade_in = 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, fade_len)))
    fade_out = 0.5 * (1.0 + np.cos(np.linspace(0, np.pi, fade_len)))

    out = audio_data.copy()
    if out.ndim == 1:
        out[:fade_len] *= fade_in
        out[-fade_len:] *= fade_out
    else:
        out[:fade_len, :] *= fade_in[:, np.newaxis]
        out[-fade_len:, :] *= fade_out[:, np.newaxis]
    return out

def normalize_audio(audio_data, target_db=-0.5):
    """
    Normalizes audio peak to target_db (dBFS).
    """
    pk = np.max(np.abs(audio_data))
    if pk <= 1e-6:
        return audio_data
    target_linear = 10.0 ** (target_db / 20.0)
    gain = target_linear / pk
    return np.clip(audio_data * gain, -1.0, 1.0)

def write_wav_16bit(dest_path, audio_data, sr=DEFAULT_SR):
    """
    Writes clean 16-bit 44.1 kHz stereo PCM WAV.
    """
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    if audio_data.ndim == 1:
        audio_data = np.column_stack([audio_data, audio_data])
    elif audio_data.shape[1] == 1:
        audio_data = np.column_stack([audio_data[:, 0], audio_data[:, 0]])

    pcm_int16 = np.clip(audio_data * 32767.0, -32768, 32767).astype("<i2")
    raw_bytes = pcm_int16.tobytes()

    ch = 2
    byte_rate = sr * ch * 2
    block_align = ch * 2
    total_len = len(raw_bytes)

    hdr = bytearray(44)
    hdr[0:4] = b"RIFF"
    struct.pack_into("<I", hdr, 4, 36 + total_len)
    hdr[8:12] = b"WAVE"
    hdr[12:16] = b"fmt "
    struct.pack_into("<I", hdr, 16, 16)
    struct.pack_into("<H", hdr, 20, 1)          # PCM
    struct.pack_into("<H", hdr, 22, ch)
    struct.pack_into("<I", hdr, 24, sr)
    struct.pack_into("<I", hdr, 28, byte_rate)
    struct.pack_into("<H", hdr, 32, block_align)
    struct.pack_into("<H", hdr, 34, 16)         # 16-bit
    hdr[36:40] = b"data"
    struct.pack_into("<I", hdr, 40, total_len)

    with open(dest_path, "wb") as f:
        f.write(hdr)
        f.write(raw_bytes)

    return os.path.getsize(dest_path)

def audio_to_base64_wav(audio_data, sr=DEFAULT_SR):
    """
    Encodes audio array directly to Base64 data URI / string for browser WebAudio decode.
    """
    if audio_data.ndim == 1:
        audio_data = np.column_stack([audio_data, audio_data])
    elif audio_data.shape[1] == 1:
        audio_data = np.column_stack([audio_data[:, 0], audio_data[:, 0]])

    pcm_int16 = np.clip(audio_data * 32767.0, -32768, 32767).astype("<i2")
    raw_bytes = pcm_int16.tobytes()

    ch = 2
    byte_rate = sr * ch * 2
    block_align = ch * 2
    total_len = len(raw_bytes)

    hdr = bytearray(44)
    hdr[0:4] = b"RIFF"
    struct.pack_into("<I", hdr, 4, 36 + total_len)
    hdr[8:12] = b"WAVE"
    hdr[12:16] = b"fmt "
    struct.pack_into("<I", hdr, 16, 16)
    struct.pack_into("<H", hdr, 20, 1)
    struct.pack_into("<H", hdr, 22, ch)
    struct.pack_into("<I", hdr, 24, sr)
    struct.pack_into("<I", hdr, 28, byte_rate)
    struct.pack_into("<H", hdr, 32, block_align)
    struct.pack_into("<H", hdr, 34, 16)
    hdr[36:40] = b"data"
    struct.pack_into("<I", hdr, 40, total_len)

    wav_bytes = bytes(hdr) + raw_bytes
    return base64.b64encode(wav_bytes).decode("ascii")

def find_track_clips(proj, track_query):
    """
    Finds track in Ableton project matching track_query and discovers all split instances.
    Clusters repeated split waveforms.
    """
    q = track_query.strip().lower()
    matched_track = None

    # Exact or substring match
    for tid, t in proj.tracks.items():
        if t["name"].strip().lower() == q:
            matched_track = t
            break

    if not matched_track:
        for tid, t in proj.tracks.items():
            if q in t["name"].strip().lower():
                matched_track = t
                break

    if not matched_track:
        available = [t["name"] for t in proj.tracks.values() if len(t.get("clips", [])) > 0]
        return None, f"Track '{track_query}' not found. Available tracks with clips: {', '.join(available)}"

    clips = matched_track.get("clips", [])
    if not clips:
        return matched_track, f"Track '{matched_track['name']}' has no audio clips or split forms."

    # Sort clips chronologically by start_beat
    sorted_clips = sorted(clips, key=lambda c: c["start_beat"])

    # Cluster identical split waveforms
    cluster_map = defaultdict(list)
    for idx, c in enumerate(sorted_clips, 1):
        dur = round(c["end_beat"] - c["start_beat"], 3)
        l_start = round(c.get("loop_start_beat", 0.0), 3)
        src = os.path.basename(c.get("relative_path") or c.get("absolute_path") or "unknown")
        key = (src, l_start, dur)
        cluster_map[key].append(idx)

    # Audio sample cache for fast peak and RMS scanning
    sample_cache = {}
    instances = []

    for idx, c in enumerate(sorted_clips, 1):
        dur_beats = c["end_beat"] - c["start_beat"]
        dur_sec = dur_beats * proj.beat_sec
        start_sec = c["start_beat"] * proj.beat_sec
        l_start_sec = c["loop_start_beat"] * proj.beat_sec

        resolved_path = proj.resolve_sample_path(c.get("relative_path"), c.get("absolute_path"))
        peak = 0.0
        rms = 0.0
        file_valid = False

        if resolved_path and os.path.exists(resolved_path):
            file_valid = True
            if resolved_path not in sample_cache:
                try:
                    raw_data, raw_sr = load_audio_file(resolved_path)
                    resampled = resample_audio(raw_data, raw_sr, DEFAULT_SR)
                    sample_cache[resolved_path] = resampled
                except Exception:
                    sample_cache[resolved_path] = None

            audio = sample_cache.get(resolved_path)
            if audio is not None:
                offset_samp = int(round(l_start_sec * DEFAULT_SR))
                len_samp = int(round(dur_sec * DEFAULT_SR))
                if offset_samp < audio.shape[0]:
                    sl = audio[offset_samp : offset_samp + len_samp]
                    if len(sl) > 0:
                        peak = float(np.max(np.abs(sl)))
                        rms = float(np.sqrt(np.mean(sl ** 2)))

        dur_round = round(dur_beats, 3)
        l_round = round(c.get("loop_start_beat", 0.0), 3)
        src_name = os.path.basename(resolved_path) if resolved_path else "missing"
        key = (src_name, l_round, dur_round)
        repeat_group = cluster_map.get(key, [idx])

        instances.append({
            "instance": idx,
            "track": matched_track["name"],
            "startBeat": round(c["start_beat"], 2),
            "endBeat": round(c["end_beat"], 2),
            "startTimeSec": round(start_sec, 3),
            "durationBeats": round(dur_beats, 2),
            "durationSec": round(dur_sec, 3),
            "loopStartBeat": round(c.get("loop_start_beat", 0.0), 2),
            "loopStartSec": round(l_start_sec, 3),
            "sourceFile": resolved_path or "",
            "sourceFilename": os.path.basename(resolved_path) if resolved_path else "missing",
            "fileExists": file_valid,
            "peak": round(peak, 4),
            "peakDb": round(20.0 * math.log10(peak) if peak > 1e-5 else -96.0, 1),
            "rms": round(rms, 4),
            "isAudible": peak >= 0.02,
            "repeatCount": len(repeat_group),
            "repeatInstances": repeat_group,
            "isFirstOfRepeat": repeat_group[0] == idx
        })

    return {
        "track": matched_track["name"],
        "trackId": matched_track["id"],
        "bpm": proj.bpm,
        "totalClips": len(instances),
        "distinctSplitForms": len(cluster_map),
        "instances": instances
    }, None

def extract_instance_audio(proj, track_query, instance_num, normalize=True, declick=True):
    """
    Extracts the exact audio waveform slice for the nth instance on a track.
    """
    track_info, err = find_track_clips(proj, track_query)
    if err:
        return None, err

    instances = track_info["instances"]
    if instance_num < 1 or instance_num > len(instances):
        return None, f"Invalid instance {instance_num}. Track '{track_info['track']}' has {len(instances)} instances (1..{len(instances)})."

    inst = instances[instance_num - 1]
    if not inst["fileExists"] or not inst["sourceFile"]:
        return None, f"Source audio file not found on disk for instance {instance_num}: {inst['sourceFilename']}"

    raw_data, raw_sr = load_audio_file(inst["sourceFile"])
    audio = resample_audio(raw_data, raw_sr, DEFAULT_SR)
    if audio.ndim == 1:
        audio = np.column_stack([audio, audio])
    elif audio.shape[1] == 1:
        audio = np.column_stack([audio[:, 0], audio[:, 0]])

    offset_samp = int(round(inst["loopStartSec"] * DEFAULT_SR))
    len_samp = int(round(inst["durationSec"] * DEFAULT_SR))

    if offset_samp >= audio.shape[0]:
        return None, f"Instance offset ({inst['loopStartSec']}s) exceeds source file duration."

    slice_data = audio[offset_samp : offset_samp + len_samp]
    if len(slice_data) == 0:
        return None, "Extracted audio slice is empty."

    if declick:
        slice_data = apply_micro_fades(slice_data, sr=DEFAULT_SR, fade_ms=3.0)

    if normalize:
        slice_data = normalize_audio(slice_data, target_db=-0.5)

    return {
        "metadata": inst,
        "audio": slice_data,
        "sampleRate": DEFAULT_SR,
        "durationSec": len(slice_data) / float(DEFAULT_SR),
        "samples": len(slice_data)
    }, None

def grab_sample(als_path, track_query, instance_num, bank="A", pad=1, out_dir=DEFAULT_OUTPUT_DIR, patch_card=False, label=""):
    """
    Extracts an instance slice, encodes it, saves to disk, and optionally patches to Roland SP-404 card.
    """
    proj = AlsProject(als_path)
    res, err = extract_instance_audio(proj, track_query, instance_num, normalize=True, declick=True)
    if err:
        return {"ok": False, "error": err}

    inst = res["metadata"]
    audio = res["audio"]

    bank_letter = bank.upper()
    pad_id = int(pad)
    bank_idx = max(0, min(9, ord(bank_letter) - ord("A")))
    sample_idx = (bank_idx * 12) + (pad_id - 1)

    clean_track = "".join(c for c in track_query if c.isalnum() or c in ("_", "-")).strip()
    sample_label = label or f"{clean_track[:8]}_i{instance_num}"
    filename = f"{bank_letter}{pad_id:02d}_{sample_label}.wav"
    out_path = os.path.join(out_dir, filename)

    bytes_written = write_wav_16bit(out_path, audio, DEFAULT_SR)
    base64_wav = audio_to_base64_wav(audio, DEFAULT_SR)

    card_patched = False
    card_path = None
    if patch_card:
        hw = detect_hardware()
        if hw["sp404"]["mounted"]:
            sp_root = hw["sp404"]["mountPath"]
            smpl_dir = os.path.join(sp_root, "ROLAND", "SP-404SX", "SMPL")
            os.makedirs(smpl_dir, exist_ok=True)
            card_filename = f"{bank_letter}{sample_idx + 1:07d}.WAV"
            card_path = os.path.join(smpl_dir, card_filename)
            make_sp404sx_wav(out_path, card_path, sample_idx)
            card_patched = True

    return {
        "ok": True,
        "track": inst["track"],
        "instance": instance_num,
        "bank": bank_letter,
        "padId": pad_id,
        "sampleIndex": sample_idx,
        "label": sample_label,
        "durationSec": round(res["durationSec"], 3),
        "durationBeats": inst["durationBeats"],
        "peak": round(float(np.max(np.abs(audio))), 4),
        "filePath": out_path,
        "bytesWritten": bytes_written,
        "cardPatched": card_patched,
        "cardPath": card_path,
        "wavBase64": base64_wav
    }

def make_pattern_kit(als_path, track_query, bank="A", max_pads=12, out_dir=DEFAULT_OUTPUT_DIR, patch_card=False, filter_silent=True):
    """
    Grabs up to max_pads split forms from a track, lays them out across Bank pads 1..12,
    and extracts the rhythmic trigger pattern metadata.
    """
    proj = AlsProject(als_path)
    track_info, err = find_track_clips(proj, track_query)
    if err:
        return {"ok": False, "error": err}

    instances = track_info["instances"]
    if filter_silent:
        instances = [inst for inst in instances if inst["isAudible"]]

    if not instances:
        return {"ok": False, "error": f"No audible split forms found on track '{track_info['track']}'."}

    selected = instances[:max_pads]
    bank_letter = bank.upper()

    loaded_pads = []
    pattern_steps = []
    first_beat = selected[0]["startBeat"] if selected else 0.0

    for i, inst in enumerate(selected):
        pad_num = i + 1
        res = grab_sample(
            als_path,
            track_query,
            inst["instance"],
            bank=bank_letter,
            pad=pad_num,
            out_dir=out_dir,
            patch_card=patch_card
        )
        if res.get("ok"):
            loaded_pads.append({
                "pad": pad_num,
                "bank": bank_letter,
                "instance": inst["instance"],
                "label": res["label"],
                "durationSec": res["durationSec"],
                "filePath": res["filePath"],
                "wavBase64": res["wavBase64"]
            })

            # Pattern step timing relative to first chop
            rel_beat = round(inst["startBeat"] - first_beat, 2)
            rel_sec = round(rel_beat * proj.beat_sec, 3)
            pattern_steps.append({
                "pad": pad_num,
                "bank": bank_letter,
                "beat": rel_beat,
                "timeSec": rel_sec,
                "durationBeats": inst["durationBeats"],
                "durationSec": inst["durationSec"]
            })

    total_pattern_beats = max(p["beat"] + p["durationBeats"] for p in pattern_steps) if pattern_steps else 0.0
    total_pattern_sec = total_pattern_beats * proj.beat_sec

    # Write pattern JSON descriptor
    clean_track = "".join(c for c in track_query if c.isalnum() or c in ("_", "-")).strip()
    pattern_meta = {
        "patternName": f"{clean_track}_Pattern_{bank_letter}",
        "track": track_info["track"],
        "bank": bank_letter,
        "bpm": proj.bpm,
        "padCount": len(loaded_pads),
        "totalDurationBeats": round(total_pattern_beats, 2),
        "totalDurationSec": round(total_pattern_sec, 3),
        "pads": loaded_pads,
        "steps": pattern_steps
    }

    pattern_file = os.path.join(out_dir, f"pattern_{bank_letter}_{clean_track}.json")
    with open(pattern_file, "w") as f:
        json.dump(pattern_meta, f, indent=2)

    pattern_meta["patternFile"] = pattern_file
    pattern_meta["ok"] = True
    return pattern_meta

def main():
    parser = argparse.ArgumentParser(description="SP-404 Sample Finder & Split-Form Chop Loader")
    parser.add_argument("--als", type=str, default="", help="Path or index to Ableton Live set (.als)")
    parser.add_argument("--find", type=str, default="", help="Find all split forms and clips on specified track")
    parser.add_argument("--grab", type=str, default="", help="Track name to grab a split instance from")
    parser.add_argument("--instance", type=int, default=1, help="Nth instance of the split form to grab (1-indexed)")
    parser.add_argument("--pattern", type=str, default="", help="Track name to extract a 12-pad pattern chop kit from")
    parser.add_argument("--bank", type=str, default="A", help="SP-404 target bank letter (A..J)")
    parser.add_argument("--pad", type=int, default=1, help="SP-404 target pad number (1..12)")
    parser.add_argument("--count", type=int, default=12, help="Number of chops for pattern kit (default 12)")
    parser.add_argument("--out", type=str, default=DEFAULT_OUTPUT_DIR, help="Destination directory for rendered samples")
    parser.add_argument("--patch-card", action="store_true", help="Patch directly into mounted Roland SP-404 card")
    parser.add_argument("--json", action="store_true", help="Emit raw JSON output for API/telemetry consumption")

    args = parser.parse_args()

    # Resolve ALS path
    st = get_ableton_status()
    als_target = args.als.strip()
    if als_target.isdigit():
        idx = int(als_target) - 1
        if 0 <= idx < len(st["recentProjects"]):
            als_target = st["recentProjects"][idx]

    if not als_target:
        if st["activeDocument"] and not st["isDefaultSet"] and st["activeDocumentExists"]:
            als_target = st["activeDocument"]
        elif st["recentProjects"]:
            als_target = st["recentProjects"][0]

    if not als_target or not os.path.exists(als_target):
        print(f"Error: Ableton project file not found: {als_target}", file=sys.stderr)
        return 1

    # 1. FIND SPLIT FORMS
    if args.find:
        proj = AlsProject(als_target)
        info, err = find_track_clips(proj, args.find)
        if err:
            if args.json:
                print(json.dumps({"ok": False, "error": err}))
            else:
                print(f"Error: {err}", file=sys.stderr)
            return 1

        if args.json:
            print(json.dumps({"ok": True, "data": info}, indent=2))
            return 0

        print("\n=======================================================")
        print(f"SP-404 SAMPLE FINDER: TRACK \"{info['track']}\"")
        print(f"Project: {os.path.basename(als_target)} ({info['bpm']} BPM)")
        print(f"Total Split Forms / Clips: {info['totalClips']}  (Distinct Shapes: {info['distinctSplitForms']})")
        print("=======================================================\n")
        print(f"{'Inst':<5} {'Start (Beat)':<13} {'Start (Time)':<13} {'Duration':<11} {'Peak':<8} {'Repeats':<9} {'Source File'}")
        print("-" * 88)
        for inst in info["instances"]:
            audible_marker = " " if inst["isAudible"] else "*"
            repeat_str = f"x{inst['repeatCount']}" if inst['repeatCount'] > 1 else "1"
            print(f"#{inst['instance']:<4}{audible_marker} {inst['startBeat']:<13.2f} {inst['startTimeSec']:<13.2f}s {inst['durationSec']:<10.2f}s {inst['peak']:<8.3f} {repeat_str:<9} {inst['sourceFilename']}")

        print("\n[Legend: '*' = low energy / silent slice]")
        print("\n[Quick Commands]")
        print(f"  Grab nth instance:  sp404 grab \"{info['track']}\" <n> --bank A --pad 1")
        print(f"  Make 12-pad kit:    sp404 pattern \"{info['track']}\" --bank A")
        return 0

    # 2. GRAB NTH INSTANCE
    if args.grab:
        res = grab_sample(
            als_target,
            args.grab,
            args.instance,
            bank=args.bank,
            pad=args.pad,
            out_dir=args.out,
            patch_card=args.patch_card
        )
        if args.json:
            print(json.dumps(res, indent=2))
            return 0 if res.get("ok") else 1

        if not res.get("ok"):
            print(f"Error: {res.get('error')}", file=sys.stderr)
            return 1

        print("\n=======================================================")
        print(f"SP-404 SAMPLE EXTRACTED & SAVED")
        print("=======================================================")
        print(f"  Track:           {res['track']}")
        print(f"  Instance:        #{res['instance']}")
        print(f"  Target Pad:      Bank {res['bank']} Pad {res['padId']} (Sample Index: {res['sampleIndex']})")
        print(f"  Edited Length:   {res['durationSec']:.3f}s ({res['durationBeats']} beats)")
        print(f"  Peak Amplitude:  {res['peak']:.3f}")
        print(f"  Saved File:      {res['filePath']}")
        if res.get("cardPatched"):
            print(f"  Roland SD Card:  PATCHED -> {res['cardPath']}")
        print("=======================================================\n")
        return 0

    # 3. MAKE 12-PAD PATTERN KIT
    if args.pattern:
        res = make_pattern_kit(
            als_target,
            args.pattern,
            bank=args.bank,
            max_pads=args.count,
            out_dir=args.out,
            patch_card=args.patch_card
        )
        if args.json:
            # Strip huge wavBase64 from stdout unless needed
            res_summary = dict(res)
            res_summary["pads"] = [{k: v for k, v in p.items() if k != "wavBase64"} for p in res.get("pads", [])]
            print(json.dumps(res_summary, indent=2))
            return 0 if res.get("ok") else 1

        if not res.get("ok"):
            print(f"Error: {res.get('error')}", file=sys.stderr)
            return 1

        print("\n=======================================================")
        print(f"SP-404 PATTERN CHOP KIT CREATED")
        print("=======================================================")
        print(f"  Track:           {res['track']}")
        print(f"  Target Bank:     Bank {res['bank']} (Pads 1..{res['padCount']})")
        print(f"  Tempo:           {res['bpm']} BPM")
        print(f"  Pattern Length:  {res['totalDurationSec']:.2f}s ({res['totalDurationBeats']} beats)")
        print(f"  Pattern JSON:    {res['patternFile']}")
        print("\nPAD ASSIGNMENTS:")
        for p in res["pads"]:
            print(f"  - Pad {p['pad']:02d}: \"{p['label']}\" ({p['durationSec']:.2f}s) -> {os.path.basename(p['filePath'])}")
        print("=======================================================\n")
        return 0

    print("Usage: sp404_sample_finder.py [--find <track> | --grab <track> --instance <n> | --pattern <track>]", file=sys.stderr)
    return 1

if __name__ == "__main__":
    sys.exit(main())
