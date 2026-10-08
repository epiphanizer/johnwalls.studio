#!/usr/bin/env python3
"""
johnwalls.studio - Terminal Studio Cockpit & Live Telemetry Monitor
Node: Bindu (bindu.local)

Connects to the local VST3/AU telemetry server (default port 3012)
and renders a real-time, ANSI-color-coded dashboard for Ableton Live 12.
"""

import sys
import time
import os
import json
import urllib.request
import urllib.error
import shutil

# ANSI styling
CLEAR_SCREEN = "\033[2J\033[H"
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
MAGENTA = "\033[35m"
WHITE = "\033[37m"
BG_DARK = "\033[40m"

PORTS_TO_CHECK = [3012, 3013, 3014]

def draw_bar(val_db, min_db=-60.0, max_db=6.0, width=28):
    """Render an audio meter bar with green/yellow/red gradient."""
    clamped = max(min_db, min(max_db, val_db))
    ratio = (clamped - min_db) / (max_db - min_db)
    filled = int(ratio * width)
    
    bar_chars = []
    for i in range(width):
        frac = i / float(width)
        if i < filled:
            if frac < 0.70:
                bar_chars.append(f"{GREEN}█{RESET}")
            elif frac < 0.88:
                bar_chars.append(f"{YELLOW}█{RESET}")
            else:
                bar_chars.append(f"{RED}█{RESET}")
        else:
            bar_chars.append(f"{DIM}░{RESET}")
            
    return "".join(bar_chars)

def fetch_json(port, endpoint, timeout=0.4):
    url = f"http://127.0.0.1:{port}{endpoint}"
    req = urllib.request.Request(url, headers={"User-Agent": "jw-studio-monitor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

def main():
    active_port = 3012
    consecutive_failures = 0
    
    # Hide cursor
    sys.stdout.write("\033[?25l")
    sys.stdout.flush()

    try:
        while True:
            # Find an active port
            telemetry = None
            for p in PORTS_TO_CHECK:
                t = fetch_json(p, "/telemetry")
                if t:
                    telemetry = t
                    active_port = p
                    consecutive_failures = 0
                    break

            term_cols, term_rows = shutil.get_terminal_size((80, 24))
            header_line = "═" * min(term_cols - 2, 78)

            output = [CLEAR_SCREEN]
            output.append(f"{CYAN}{BOLD}┌{header_line}┐{RESET}")
            title_text = f" johnwalls.studio • Live Session Monitor  [Node: Bindu] "
            output.append(f"{CYAN}{BOLD}│{WHITE}{title_text.center(len(header_line))}{CYAN}│{RESET}")
            output.append(f"{CYAN}{BOLD}└{header_line}┘{RESET}\n")

            if not telemetry:
                consecutive_failures += 1
                dots = "." * ((consecutive_failures % 4) + 1)
                output.append(f"  {YELLOW}⚡ Waiting for Ableton Live 12 / johnwalls.studio VST3 plugin{dots}{RESET}")
                output.append(f"  {DIM}Scanning local loopback ports {PORTS_TO_CHECK} on bindu.local...{RESET}\n")
                output.append(f"  {DIM}To connect:{RESET}")
                output.append(f"    1. Open Ableton Live 12")
                output.append(f"    2. Insert {BOLD}johnwalls.studio{RESET} on any audio or MIDI track")
                output.append(f"    3. Telemetry server will bind automatically to port 3012\n")
                output.append(f"  {DIM}[Press Ctrl+C to exit]{RESET}")
                sys.stdout.write("\n".join(output))
                sys.stdout.flush()
                time.sleep(0.5)
                continue

            # Parse telemetry data
            bpm = telemetry.get("bpm", 120.0)
            is_playing = telemetry.get("isPlaying", False)
            bar = telemetry.get("barNumber", 1)
            ppq = telemetry.get("ppqPosition", 0.0)
            peak_db = telemetry.get("peakDb", -60.0)
            rms_db = telemetry.get("rmsDb", -60.0)
            amp_type = telemetry.get("ampModel", "Mesa Mark III")
            pedals = telemetry.get("activePedals", [])
            take_state = telemetry.get("takeRecording", "Idle")

            status_badge = f"{GREEN}● PLAYING{RESET}" if is_playing else f"{YELLOW}■ STOPPED{RESET}"

            # Transport Section
            output.append(f"  {BOLD}HOST TRANSPORT & CLOCK{RESET}")
            output.append(f"  Status:  {status_badge}   {BOLD}BPM:{RESET} {CYAN}{bpm:.1f}{RESET}   {BOLD}Bar:{RESET} {bar}   {BOLD}Beat:{RESET} {(ppq % 4) + 1:.2f}")
            output.append("")

            # Audio Metering Section
            output.append(f"  {BOLD}AUDIO ENGINE METERS (Ableton Live Track){RESET}")
            peak_bar = draw_bar(peak_db)
            rms_bar = draw_bar(rms_db)
            output.append(f"  Peak: [{peak_bar}] {WHITE}{peak_db:+6.1f} dB{RESET}")
            output.append(f"  RMS:  [{rms_bar}] {WHITE}{rms_db:+6.1f} dB{RESET}")
            output.append("")

            # DSP & Pedalboard Section
            output.append(f"  {BOLD}ACTIVE DSP TONE CHAIN{RESET}")
            output.append(f"  Amp Model: {MAGENTA}{amp_type}{RESET}")
            if pedals:
                pedal_strs = [f"{GREEN}✓ {p}{RESET}" for p in pedals]
                output.append(f"  Stompboxes: {' | '.join(pedal_strs)}")
            else:
                output.append(f"  Stompboxes: {DIM}(Bypassed / None){RESET}")
            output.append("")

            # Take Recording & SuperCollider Section
            output.append(f"  {BOLD}STUDIO CAPTURE & BRIDGES{RESET}")
            take_badge = f"{RED}{BOLD}● REC [24-bit WAV]{RESET}" if "rec" in str(take_state).lower() else f"{DIM}Idle{RESET}"
            output.append(f"  Take Recorder:  {take_badge}")
            output.append(f"  Port:           {CYAN}http://127.0.0.1:{active_port}{RESET} (Local Loopback)")
            output.append("")

            # Footer
            output.append(f"{DIM}──────────────────────────────────────────────────────────────────────────────{RESET}")
            output.append(f"{DIM}Bindu Studio LAN • Ableton Live 12 Telemetry Stream • [Ctrl+C to quit]{RESET}")

            sys.stdout.write("\n".join(output))
            sys.stdout.flush()
            time.sleep(0.1)

    except KeyboardInterrupt:
        pass
    finally:
        # Show cursor again
        sys.stdout.write("\033[?25h\033[0m\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
