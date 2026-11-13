#!/usr/bin/env python3
"""
migrate_nov27_to_rc600.py
=========================
High-fidelity stem migration pipeline for Boss RC-600 Loop Station.
Migrates the complete 9-song Walls Devine live show from:
  /Volumes/sean/Desktop/Nov 27th Show

Coordinates:
  - Audio Conversion: 48.0 kHz 24-bit PCM -> 44.1 kHz 32-bit IEEE float stereo WAV.
  - Phase Alignment: Aligns and zero-pads stems within each song to identical sample lengths
    so multi-track loops remain in sample-locked sync on the RC-600.
  - Dual Directory Structure:
    1. Folder-based: ROLAND/WAVE/{slot:03d}_{trk}/{slot:03d}_{trk}.WAV (RC-600 native storage)
    2. Flat:         ROLAND/WAVE/{slot:02d}_{trk}.WAV (Boss Tone Studio / drag-and-drop)
    3. Named Stems:  Named_Stems/{slot:02d}_{name}/...
  - Hardware Detection & Auto-Sync:
    Scans for mounted Boss RC-600 volume (/Volumes/BOSS_RC-600, /Volumes/ROLAND, etc.)
  - Metadata Sanitization:
    Executes 'dot_clean -m' and filesystem 'sync' to strip macOS dot-underscore files.
"""

import os
import sys
import math
import wave
import struct
import shutil
import argparse
import subprocess
import numpy as np
import scipy.signal

SOURCE_DIR = "/Volumes/sean/Desktop/Nov 27th Show"
LOCAL_TRANSFER_DIR = "/Users/seanhalls/Desktop/Boss_RC600_Transfer"
LOCAL_WAVE_DIR = os.path.join(LOCAL_TRANSFER_DIR, "ROLAND", "WAVE")
LOCAL_STEMS_DIR = os.path.join(LOCAL_TRANSFER_DIR, "Named_Stems")

TARGET_SAMPLE_RATE = 44100
SOURCE_SAMPLE_RATE = 48000

SHOW_TRACKS = [
    {
        "slot": 1,
        "name": "01_Decay",
        "stems": [
            ("01_Decay_Drums&Waves.wav", 1, "Drums_Waves"),
            ("01_Decay_Ambience.wav", 2, "Ambience"),
            ("01_Decay_Terry_Harmonies.wav", 3, "Terry_Harmonies"),
        ]
    },
    {
        "slot": 2,
        "name": "02_Conviction",
        "stems": [
            ("02_ConvictionDrumBass.wav", 1, "Drum_Bass"),
            ("02_ConvictionAccompaniment.wav", 2, "Accompaniment"),
            ("02_ConvictionTerryLove.wav", 3, "Terry_Love"),
        ]
    },
    {
        "slot": 3,
        "name": "03_Poetry",
        "stems": [
            ("03_Poetry_Drum_Bass.wav", 1, "Drum_Bass"),
            ("03_Poetry_Ish.wav", 2, "Ish"),
            ("03_Poetry_Midi_Peace_Feather.wav", 3, "Midi_Peace_Feather"),
        ]
    },
    {
        "slot": 4,
        "name": "04_JointQueen",
        "stems": [
            ("04_JointQueen_Drum_Bass.wav", 1, "Drum_Bass"),
            ("04_JointQueen_Midi.wav", 2, "Midi"),
        ]
    },
    {
        "slot": 5,
        "name": "05_Stash_Daddy",
        "stems": [
            ("05_Stash_Daddy_DrumBassIntro.wav", 1, "Drum_Bass_Intro"),
            ("05_Stash_Daddy_AccompanimentMidi.wav", 2, "Accompaniment_Midi"),
        ]
    },
    {
        "slot": 6,
        "name": "06_Space_Cruiser",
        "stems": [
            ("06_Space Cruiser_Drum&Bass.wav", 1, "Drum_Bass"),
            ("06_Space Cruiser_Cool.wav", 2, "Cool"),
            ("06_Space Cruiser_Atmosphere.wav", 3, "Atmosphere"),
        ]
    },
    {
        "slot": 7,
        "name": "07_Resolve",
        "stems": [
            ("07_Resolve_Drum_Bass.wav", 1, "Drum_Bass"),
            ("07_Resolve_Midi.wav", 2, "Midi"),
        ]
    },
    {
        "slot": 8,
        "name": "08_Gratitude",
        "stems": [
            ("8_Gratitude_Drum_Bass_Micro.wav", 1, "Drum_Bass_Micro"),
            ("8_Gratitude_Ambience.wav", 2, "Ambience"),
        ]
    },
    {
        "slot": 9,
        "name": "09_Inner_Child",
        "stems": [
            ("09_Inner_Child_Backing.wav", 1, "Backing"),
        ]
    },
]

def find_rc600_volume():
    """Detects mounted Boss RC-600 USB mass storage volume."""
    candidates = [
        "/Volumes/BOSS_RC-600",
        "/Volumes/RC-600",
        "/Volumes/BOSS_RC",
        "/Volumes/BOSS",
        "/Volumes/ROLAND"
    ]
    for c in candidates:
        if os.path.isdir(c):
            return c
    vol_dir = "/Volumes"
    if os.path.isdir(vol_dir):
        for entry in os.listdir(vol_dir):
            if entry in ["Macintosh HD", "cache", "johnwalls", "sean"] or entry.startswith("."):
                continue
            full = os.path.join(vol_dir, entry)
            if os.path.isdir(full):
                up = entry.upper()
                if "RC-600" in up or "RC600" in up or "BOSS" in up:
                    return full
                if os.path.isdir(os.path.join(full, "ROLAND", "WAVE")):
                    return full
    return None

def read_wav_to_float32(file_path):
    """
    Reads WAV file supporting 16-bit, 24-bit, or 32-bit float PCM.
    Returns: (numpy.ndarray [samples, channels], sample_rate)
    """
    with open(file_path, "rb") as f:
        header = f.read(12)
        if len(header) < 12 or header[:4] != b"RIFF" or header[8:12] != b"WAVE":
            raise ValueError(f"Not a valid WAV file: {file_path}")

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
                f.seek(clen + (1 if clen % 2 != 0 else 0), os.SEEK_CUR)

    if not fmt_data or not data_bytes:
        raise ValueError(f"Incomplete WAV file: {file_path}")

    a_fmt, ch, sr, _, _, bits = struct.unpack("<HHIIHH", fmt_data[:16])

    if a_fmt == 1:  # PCM Integer
        if bits == 16:
            arr = np.frombuffer(data_bytes, dtype="<i2").astype(np.float32) / 32768.0
        elif bits == 24:
            b = np.frombuffer(data_bytes, dtype=np.uint8).reshape(-1, 3)
            pad = np.zeros((b.shape[0], 4), dtype=np.uint8)
            pad[:, 1:] = b
            arr = pad.view("<i4")[:, 0].astype(np.float32) / (2**31)
        elif bits == 32:
            arr = np.frombuffer(data_bytes, dtype="<i4").astype(np.float32) / (2**31)
        else:
            raise ValueError(f"Unsupported bit depth: {bits}")
    elif a_fmt == 3:  # IEEE Float
        arr = np.frombuffer(data_bytes, dtype=np.float32)
    else:
        raise ValueError(f"Unsupported WAV format: {a_fmt}")

    arr = arr.reshape(-1, ch)
    return arr, sr

def write_rc600_float32(dest_path, audio_data, sample_rate=TARGET_SAMPLE_RATE):
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
    struct.pack_into('<H', hdr, 20, 3)          # IEEE Float = 3
    struct.pack_into('<H', hdr, 22, ch)
    struct.pack_into('<I', hdr, 24, sample_rate)
    struct.pack_into('<I', hdr, 28, byte_rate)
    struct.pack_into('<H', hdr, 32, block_align)
    struct.pack_into('<H', hdr, 34, 32)         # 32-bit
    hdr[36:40] = b'data'
    struct.pack_into('<I', hdr, 40, len(raw_bytes))

    with open(dest_path, "wb") as f:
        f.write(hdr)
        f.write(raw_bytes)

    return os.path.getsize(dest_path)

def resample_to_44100(audio, orig_sr):
    """Polyphase FIR anti-aliased resampling."""
    if orig_sr == TARGET_SAMPLE_RATE:
        return audio
    gcd = math.gcd(TARGET_SAMPLE_RATE, orig_sr)
    up = TARGET_SAMPLE_RATE // gcd
    down = orig_sr // gcd
    return scipy.signal.resample_poly(audio, up, down, axis=0).astype(np.float32)

def process_and_stage_all(source_dir, song_filter=None):
    """
    Processes all 9 songs, resamples to 44.1kHz 32-bit float, locks loop lengths,
    and stages files into LOCAL_TRANSFER_DIR.
    """
    print("═══════════════════════════════════════════════════════════════════════")
    print(" BOSS RC-600 MASTER SHOW MIGRATION ENGINE")
    print(f" Source:  {source_dir}")
    print(f" Staging: {LOCAL_TRANSFER_DIR}")
    print("═══════════════════════════════════════════════════════════════════════")

    if not os.path.isdir(source_dir):
        raise FileNotFoundError(f"Source show directory not found: {source_dir}")

    os.makedirs(LOCAL_WAVE_DIR, exist_ok=True)
    os.makedirs(LOCAL_STEMS_DIR, exist_ok=True)

    summary = []

    for song in SHOW_TRACKS:
        slot = song["slot"]
        name = song["name"]
        if song_filter is not None and slot != song_filter:
            continue

        print(f"\n▶ [{slot:02d}/09] Processing Song: {name} (Memory Slot {slot:03d})...")

        # Step 1: Load all stems for this song and resample
        loaded_stems = []
        for wav_name, trk_num, label in song["stems"]:
            wav_path = os.path.join(source_dir, wav_name)
            if not os.path.exists(wav_path):
                print(f"  ❌ File not found: {wav_path}", file=sys.stderr)
                continue
            audio, sr = read_wav_to_float32(wav_path)
            resampled = resample_to_44100(audio, sr)
            loaded_stems.append({
                "wav_name": wav_name,
                "track": trk_num,
                "label": label,
                "audio": resampled
            })

        if not loaded_stems:
            print(f"  ⚠️ No stems found for {name}, skipping.")
            continue

        # Step 2: Determine target loop duration
        # In multi-track looping, the rhythm track (Track 1) defines the loop duration.
        # If any stem is slightly longer due to a tail, we use the maximum length so
        # nothing is truncated, and zero-pad shorter stems to achieve identical sample lengths.
        max_samples = max(s["audio"].shape[0] for s in loaded_stems)
        duration_sec = max_samples / TARGET_SAMPLE_RATE

        song_stems_dir = os.path.join(LOCAL_STEMS_DIR, f"{slot:02d}_{name}")
        os.makedirs(song_stems_dir, exist_ok=True)

        for s in loaded_stems:
            trk_num = s["track"]
            label = s["label"]
            audio = s["audio"]

            # Pad with silence if shorter than max_samples
            if audio.shape[0] < max_samples:
                pad_len = max_samples - audio.shape[0]
                pad_zeros = np.zeros((pad_len, audio.shape[1]), dtype=np.float32)
                audio = np.vstack([audio, pad_zeros])
            elif audio.shape[0] > max_samples:
                audio = audio[:max_samples]

            # Headroom check (prevent hard clipping on looper D/A converter)
            peak = float(np.max(np.abs(audio)))
            if peak > 1.0:
                scale = 0.98 / peak
                audio *= scale
                peak = 0.98

            # File 1: Folder structure ROLAND/WAVE/001_1/001_1.WAV
            mem_folder_name = f"{slot:03d}_{trk_num}"
            folder_wav = os.path.join(LOCAL_WAVE_DIR, mem_folder_name, f"{mem_folder_name}.WAV")
            write_rc600_float32(folder_wav, audio)

            # File 2: Flat file ROLAND/WAVE/01_1.WAV
            flat_wav = os.path.join(LOCAL_WAVE_DIR, f"{slot:02d}_{trk_num}.WAV")
            write_rc600_float32(flat_wav, audio)

            # File 3: Named Stems
            named_wav = os.path.join(song_stems_dir, f"{slot:02d}_{name}_Trk{trk_num}_{label}.wav")
            write_rc600_float32(named_wav, audio)

            print(f"  ✓ Trk {trk_num} ({label:<18}): {max_samples} samples ({duration_sec:.2f}s) | Peak: {peak:.3f}")

        summary.append({
            "slot": slot,
            "name": name,
            "stems_count": len(loaded_stems),
            "duration": duration_sec,
            "samples": max_samples
        })

    # Metadata clean local transfer directory
    subprocess.run(["dot_clean", "-m", LOCAL_TRANSFER_DIR], check=False)

    print("\n═══════════════════════════════════════════════════════════════════════")
    print(" LOCAL STAGING COMPLETED SUCCESSFULLY")
    print("═══════════════════════════════════════════════════════════════════════")
    print(f"{'Slot':<6} {'Song Name':<20} {'Tracks':<8} {'Duration':<12} {'Sample Rate / Format'}")
    print("-" * 75)
    for s in summary:
        print(f"M{s['slot']:02d}    {s['name']:<20} {s['stems_count']:<8} {s['duration']:<12.2f}s 44.1 kHz 32-bit float")
    print("-" * 75)
    print(f"Staged in: {LOCAL_TRANSFER_DIR}")
    return summary

def sync_to_hardware(target_vol=None):
    """Copies staged files directly to mounted Boss RC-600 volume."""
    if not target_vol:
        target_vol = find_rc600_volume()

    if not target_vol or not os.path.isdir(target_vol):
        return {
            "ok": False,
            "error": "RC-600 volume not mounted. Put pedal in [MENU] -> [STORAGE] -> CONNECT."
        }

    dest_wave_dir = os.path.join(target_vol, "ROLAND", "WAVE")
    os.makedirs(dest_wave_dir, exist_ok=True)

    print(f"\n⚡ Synchronizing to mounted Boss RC-600 at: {target_vol}")
    print(f"Target directory: {dest_wave_dir}")

    total_copied = 0
    total_bytes = 0

    # Copy all items in LOCAL_WAVE_DIR to hardware
    for root, dirs, files in os.walk(LOCAL_WAVE_DIR):
        rel_path = os.path.relpath(root, LOCAL_WAVE_DIR)
        dest_root = os.path.join(dest_wave_dir, rel_path) if rel_path != "." else dest_wave_dir
        os.makedirs(dest_root, exist_ok=True)

        for f in files:
            if f.upper().endswith(".WAV"):
                src_file = os.path.join(root, f)
                dst_file = os.path.join(dest_root, f)
                src_size = os.path.getsize(src_file)

                # Copy if missing or size differs
                if not os.path.exists(dst_file) or os.path.getsize(dst_file) != src_size:
                    print(f"  → Writing: {os.path.relpath(dst_file, target_vol)}")
                    shutil.copy2(src_file, dst_file)
                    total_bytes += src_size
                total_copied += 1

    # Strip macOS resource forks & .DS_Store
    print("Sanitizing macOS metadata on RC-600 volume (dot_clean)...")
    subprocess.run(["dot_clean", "-m", os.path.join(target_vol, "ROLAND")], check=False)
    subprocess.run(["sync"], check=False)
    subprocess.run(["sync"], check=False)

    print("✅ RC-600 Hardware Sync Complete!")
    return {
        "ok": True,
        "mountPath": target_vol,
        "tracksCount": total_copied,
        "bytesWritten": total_bytes
    }

def main():
    parser = argparse.ArgumentParser(description="Boss RC-600 Walls Devine Live Show Migration")
    parser.add_argument("--source", default=SOURCE_DIR, help="Source directory containing 27th show stems")
    parser.add_argument("--song", type=int, choices=range(1, 10), default=None, help="Process single song (1-9)")
    parser.add_argument("--stage-only", action="store_true", help="Stage files locally without attempting hardware sync")
    parser.add_argument("--sync-only", action="store_true", help="Sync existing staged files to hardware")
    parser.add_argument("--check-hardware", action="store_true", help="Check if RC-600 USB volume is mounted")
    args = parser.parse_args()

    if args.check_hardware:
        vol = find_rc600_volume()
        if vol:
            print(f"Boss RC-600 Mounted: {vol}")
            sys.exit(0)
        else:
            print("Boss RC-600 Not Mounted (Ensure [STORAGE] is set to CONNECT).")
            sys.exit(1)

    if not args.sync_only:
        process_and_stage_all(args.source, song_filter=args.song)

    if not args.stage_only:
        vol = find_rc600_volume()
        if vol:
            sync_res = sync_to_hardware(vol)
            if not sync_res["ok"]:
                print(f"Sync warning: {sync_res['error']}")
        else:
            print("\n-----------------------------------------------------------------------")
            print("ℹ️  Boss RC-600 USB Volume is not mounted yet.")
            print("All 9 songs have been processed & staged to:")
            print(f"  {LOCAL_TRANSFER_DIR}")
            print("\nTo transfer directly onto the RC-600:")
            print("  1. On RC-600 pedal, press [MENU] -> page to [STORAGE]")
            print("  2. Turn the knob to switch STORAGE from OFF to CONNECT")
            print("     (Unit will show PREPARING... then DISCONNECT)")
            print("  3. Run:")
            print("     python3 johnwalls_studio/scripts/migrate_nov27_to_rc600.py --sync-only")
            print("-----------------------------------------------------------------------")

if __name__ == "__main__":
    main()
