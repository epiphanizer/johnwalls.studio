#!/usr/bin/env python3
"""
export_sp404_card.py
====================
Backward-compatible wrapper for hardware_sync.py.
Exports Walls / Devine chops directly into Roland SP-404SX native flash card format
with genuine Roland 'RLND' proprietary metadata chunks (device 'roifspsx', sampleIndex 0..119).
"""

import sys
import os

# Ensure local scripts directory is in path
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

from hardware_sync import sync_sp404, sync_all, detect_hardware

def export_all(target_card=None):
    if target_card:
        res = sync_sp404(target_card)
    else:
        res = sync_all()
    print(res.get("message", ""))
    return res.get("ok", False)

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    success = export_all(target)
    sys.exit(0 if success else 1)
