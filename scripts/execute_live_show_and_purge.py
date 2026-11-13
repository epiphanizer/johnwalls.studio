#!/usr/bin/env python3
"""
execute_live_show_and_purge.py
==============================
Migrates the 9 songs (21 stems) from:
  /Users/seanhalls/Desktop/Live WD 11-27
onto Boss RC-600 Loop Station Memories 1 to 9.

Purges memories 10 through 99:
  - Deletes all WAV audio files in ROLAND/WAVE/010_1..099_6
  - Resets MEMORY010A/B.RC0 .. MEMORY099A/B.RC0 to pristine factory empty state.

Audio specifications:
  - Converts 48.0 kHz 24-bit PCM to 44.1 kHz 32-bit float stereo.
  - Phase locks & zero-pads stems within each song to identical sample counts.
  - Formats native Roland 28-byte 'fmt ' subchunk (cbSize=10) with JUNK chunk 32KB cluster alignment.
  - Synchronizes XML database (MEMORY001A.RC0..MEMORY009B.RC0) with exact sample count (<X>),
    tempo (<U>), tempo-ticks (<V>), beats (<S>), and active track flags (<W>1</W>).
  - Cleans macOS metadata via dot_clean -m and flushes buffers with sync.
"""

import os
import sys
import math
import wave
import struct
import shutil
import subprocess
import numpy as np
import scipy.signal

SOURCE_DIR = "/Users/seanhalls/Desktop/Live WD 11-27"
TARGET_VOL = "/Volumes/RC-600"
ROLAND_DIR = os.path.join(TARGET_VOL, "ROLAND")
WAVE_DIR = os.path.join(ROLAND_DIR, "WAVE")
DATA_DIR = os.path.join(ROLAND_DIR, "DATA")

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
        "name": "05_StashDaddy",
        "stems": [
            ("05_Stash_Daddy_DrumBassIntro.wav", 1, "Drum_Bass_Intro"),
            ("05_Stash_Daddy_AccompanimentMidi.wav", 2, "Accompaniment_Midi"),
        ]
    },
    {
        "slot": 6,
        "name": "06_SpaceCruis",
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
        "name": "09_InnerChild",
        "stems": [
            ("09_Inner_Child_Backing.wav", 1, "Backing"),
        ]
    },
]

def read_wav_to_float32(file_path):
    with wave.open(file_path, "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)

    if sampwidth == 2:
        audio = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 3:
        raw_int = np.frombuffer(raw_bytes, dtype=np.uint8)
        reshaped = raw_int.reshape(-1, 3)
        padded = np.zeros((reshaped.shape[0], 4), dtype=np.uint8)
        padded[:, 1:] = reshaped
        audio = padded.view("<i4").astype(np.float32) / 2147483648.0
    elif sampwidth == 4:
        audio = np.frombuffer(raw_bytes, dtype=np.float32)
    else:
        raise ValueError(f"Unsupported sample width: {sampwidth}")

    if n_channels > 1:
        audio = audio.reshape(-1, n_channels)
    else:
        audio = np.column_stack((audio, audio))

    return audio, framerate

def resample_audio(audio, orig_sr, target_sr=44100):
    if orig_sr == target_sr:
        return audio
    gcd = math.gcd(orig_sr, target_sr)
    up = target_sr // gcd
    down = orig_sr // gcd
    resampled = scipy.signal.resample_poly(audio, up, down, axis=0)
    return resampled.astype(np.float32)

def write_rc600_wav(output_path, audio_data):
    """Writes 44.1kHz 32-bit float stereo WAV with Roland 28-byte fmt and 32KB padding."""
    audio_data = audio_data.astype(np.float32)
    num_samples = audio_data.shape[0]
    num_channels = audio_data.shape[1]
    data_bytes = audio_data.tobytes()
    data_size = len(data_bytes)

    fmt_chunk_size = 28
    fmt_data = struct.pack(
        '<HHIIHHH10s',
        3, # IEEE float
        num_channels,
        44100,
        44100 * num_channels * 4,
        num_channels * 4,
        32,
        10, # cbSize = 10
        b'\x00' * 10
    )

    base_file_size = 12 + 8 + fmt_chunk_size + 8 + data_size
    remainder = base_file_size % 32768
    if remainder != 0:
        padding_needed = 32768 - remainder
        if padding_needed < 8:
            padding_needed += 32768
        junk_data_len = padding_needed - 8
        junk_chunk = b'JUNK' + struct.pack('<I', junk_data_len) + (b'\x00' * junk_data_len)
    else:
        junk_chunk = b''

    total_file_size = base_file_size + len(junk_chunk)
    riff_size = total_file_size - 8

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'wb') as f:
        f.write(b'RIFF')
        f.write(struct.pack('<I', riff_size))
        f.write(b'WAVE')
        f.write(b'fmt ')
        f.write(struct.pack('<I', fmt_chunk_size))
        f.write(fmt_data)
        f.write(b'data')
        f.write(struct.pack('<I', data_size))
        f.write(data_bytes)
        if junk_chunk:
            f.write(junk_chunk)

def build_memory_rc0(template_xml, mem_id, name, tracks_info, count=1):
    import re
    slot_num = mem_id + 1
    xml = template_xml
    xml = re.sub(r'<mem id=\"\d+\">', f'<mem id=\"{mem_id}\">', xml)
    xml = re.sub(r'<count>\d+</count>', f'<count>{count:04d}</count>', xml)

    padded = (name[:12]).ljust(12)
    name_block = '<NAME>\n' + ''.join([f'\t<{chr(65+i)}>{ord(ch)}</{chr(65+i)}>\n' for i, ch in enumerate(padded)]) + '</NAME>'
    xml = re.sub(r'<NAME>[\s\S]*?</NAME>', name_block, xml)

    if tracks_info:
        ref_samples = tracks_info[0]['samples']
        if ref_samples > 15000000:
            beats = 256
        elif ref_samples < 7000000:
            beats = 64
        else:
            beats = 128

        v_val = int(round(ref_samples / beats))
        bpm = (44100.0 * 60.0) / v_val
        u_val = int(round(bpm * 10))

        master_block = f'<MASTER>\n\t<A>{u_val}</A>\n\t<B>{v_val}</B>\n\t<C>0</C>\n\t<D>{beats}</D>\n</MASTER>'
        xml = re.sub(r'<MASTER>[\s\S]*?</MASTER>', master_block, xml)

        for t_idx in range(1, 7):
            t_tag = f'TRACK{t_idx}'
            pattern = rf'(<{t_tag}>[\s\S]*?</{t_tag}>)'
            m = re.search(pattern, xml)
            if not m:
                continue
            block = m.group(1)
            matched = [tr for tr in tracks_info if tr['track_num'] == t_idx]
            if matched:
                s_count = matched[0]['samples']
                block = re.sub(r'<J>\d+</J>', f'<J>{beats + 7}</J>', block)
                block = re.sub(r'<S>\d+</S>', f'<S>{beats}</S>', block)
                block = re.sub(r'<U>\d+</U>', f'<U>{u_val}</U>', block)
                block = re.sub(r'<V>\d+</V>', f'<V>{v_val}</V>', block)
                block = re.sub(r'<W>\d+</W>', '<W>1</W>', block)
                block = re.sub(r'<X>\d+</X>', f'<X>{s_count}</X>', block)
            else:
                block = re.sub(r'<J>\d+</J>', '<J>1</J>', block)
                block = re.sub(r'<S>\d+</S>', '<S>0</S>', block)
                block = re.sub(r'<U>\d+</U>', '<U>1200</U>', block)
                block = re.sub(r'<V>\d+</V>', '<V>88200</V>', block)
                block = re.sub(r'<W>\d+</W>', '<W>0</W>', block)
                block = re.sub(r'<X>\d+</X>', '<X>0</X>', block)
            xml = xml[:m.start()] + block + xml[m.end():]
    else:
        master_block = '<MASTER>\n\t<A>1200</A>\n\t<B>88200</B>\n\t<C>0</C>\n\t<D>0</D>\n</MASTER>'
        xml = re.sub(r'<MASTER>[\s\S]*?</MASTER>', master_block, xml)
        for t_idx in range(1, 7):
            t_tag = f'TRACK{t_idx}'
            pattern = rf'(<{t_tag}>[\s\S]*?</{t_tag}>)'
            m = re.search(pattern, xml)
            if m:
                block = m.group(1)
                block = re.sub(r'<J>\d+</J>', '<J>1</J>', block)
                block = re.sub(r'<S>\d+</S>', '<S>0</S>', block)
                block = re.sub(r'<U>\d+</U>', '<U>1200</U>', block)
                block = re.sub(r'<V>\d+</V>', '<V>88200</V>', block)
                block = re.sub(r'<W>\d+</W>', '<W>0</W>', block)
                block = re.sub(r'<X>\d+</X>', '<X>0</X>', block)
                xml = xml[:m.start()] + block + xml[m.end():]
    return xml

def main():
    print("==================================================================")
    print(" BOSS RC-600 LIVE SHOW MIGRATION & EXTRA MEMORY PURGE PIPELINE")
    print("==================================================================")

    if not os.path.isdir(TARGET_VOL):
        print(f"❌ Target volume not found: {TARGET_VOL}")
        sys.exit(1)

    with open(os.path.join(DATA_DIR, "MEMORY008B.RC0"), "r") as fb:
        template_xml = fb.read()

    # Step 1: Purge slots 10 through 99
    print("\n[1/3] Purging memories 10 through 99 on Boss RC-600...")
    purged_wavs = 0
    for slot in range(10, 100):
        # Clean WAV folders
        for t in range(1, 7):
            folder = os.path.join(WAVE_DIR, f"{slot:03d}_{t}")
            if os.path.isdir(folder):
                for f in os.listdir(folder):
                    fp = os.path.join(folder, f)
                    if os.path.isfile(fp):
                        os.remove(fp)
                        purged_wavs += 1
        # Reset XML
        mem_id = slot - 1
        name = f"Memory{slot:02d}"
        xml_a = build_memory_rc0(template_xml, mem_id, name, [], count=1)
        xml_b = build_memory_rc0(template_xml, mem_id, name, [], count=2)
        with open(os.path.join(DATA_DIR, f"MEMORY{slot:03d}A.RC0"), "w") as fa:
            fa.write(xml_a)
        with open(os.path.join(DATA_DIR, f"MEMORY{slot:03d}B.RC0"), "w") as fb:
            fb.write(xml_b)

    print(f"  ✓ Purged {purged_wavs} orphaned WAV files from slots 10-99.")
    print("  ✓ Reset MEMORY010A/B through MEMORY099A/B to factory empty.")

    # Step 2: Process audio stems & write to hardware for slots 1-9
    print("\n[2/3] Processing audio stems & writing to Memories 1 through 9...")
    for song in SHOW_TRACKS:
        slot = song["slot"]
        name = song["name"]
        print(f"\nProcessing Slot {slot:02d} ({name})...")

        loaded_stems = []
        max_len = 0
        for filename, trk_idx, stem_name in song["stems"]:
            src_path = os.path.join(SOURCE_DIR, filename)
            if not os.path.isfile(src_path):
                raise FileNotFoundError(f"Missing stem: {src_path}")
            audio, sr = read_wav_to_float32(src_path)
            resampled = resample_audio(audio, sr, 44100)
            if resampled.shape[0] > max_len:
                max_len = resampled.shape[0]
            loaded_stems.append((trk_idx, stem_name, resampled))

        # Pad to max_len
        aligned_stems = []
        tracks_info = []
        for trk_idx, stem_name, audio in loaded_stems:
            if audio.shape[0] < max_len:
                pad_len = max_len - audio.shape[0]
                audio = np.pad(audio, ((0, pad_len), (0, 0)), mode="constant")
            aligned_stems.append((trk_idx, audio))
            tracks_info.append({
                "track_num": trk_idx,
                "samples": max_len
            })

        # Clear existing WAVs in slot
        for t in range(1, 7):
            fld = os.path.join(WAVE_DIR, f"{slot:03d}_{t}")
            if os.path.isdir(fld):
                for f in os.listdir(fld):
                    fp = os.path.join(fld, f)
                    if os.path.isfile(fp):
                        os.remove(fp)

        # Write WAV files
        for trk_idx, audio in aligned_stems:
            dst_wav = os.path.join(WAVE_DIR, f"{slot:03d}_{trk_idx}", f"{slot:03d}_{trk_idx}.WAV")
            write_rc600_wav(dst_wav, audio)
            print(f"  → Wrote Track {trk_idx}: {dst_wav} ({max_len} samples, {os.path.getsize(dst_wav)} bytes)")

        # Update XML for slot
        mem_id = slot - 1
        xml_a = build_memory_rc0(template_xml, mem_id, name, tracks_info, count=1)
        xml_b = build_memory_rc0(template_xml, mem_id, name, tracks_info, count=2)
        with open(os.path.join(DATA_DIR, f"MEMORY{slot:03d}A.RC0"), "w") as fa:
            fa.write(xml_a)
        with open(os.path.join(DATA_DIR, f"MEMORY{slot:03d}B.RC0"), "w") as fb:
            fb.write(xml_b)
        print(f"  ✓ Synchronized MEMORY{slot:03d}A/B.RC0 database.")

    # Step 3: Sanitize filesystem
    print("\n[3/3] Sanitizing filesystem metadata and flushing write buffers...")
    subprocess.run(["dot_clean", "-m", ROLAND_DIR], check=False)
    subprocess.run(["sync"], check=False)
    subprocess.run(["sync"], check=False)

    print("\n==================================================================")
    print(" ✅ ALL 9 LIVE SHOW SONGS MIGRATED & SLOTS 10-99 PURGED CLEANLY!")
    print("==================================================================")

if __name__ == "__main__":
    main()
