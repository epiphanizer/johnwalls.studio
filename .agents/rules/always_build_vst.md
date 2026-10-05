---
description: Always rebuild and install johnwalls.studio VST3 and AU plugins on any code modification
always_on: true
---

# Always Rebuild VST on Code Changes

Whenever ANY modifications are made to:
- DSP algorithms or audio code (`engine/`)
- VST processor or editor code (`vst/`)
- User Interface components (`ui/`)
- Plugin configuration

The agent MUST automatically execute:
```bash
# 1. If UI touched:
cd /Users/seanhalls/Desktop/sh/johnwalls_studio/ui && npm run build

# 2. Recompile and install VST3 and AU:
cmake --build /Users/seanhalls/Desktop/sh/johnwalls_studio/vst/build --config Release -j8
```
This ensures `/Users/seanhalls/Library/Audio/Plug-Ins/VST3/johnwalls.studio.vst3` and `~/Library/Audio/Plug-Ins/Components/johnwalls.studio.component` are always up to date for direct testing in Ableton Live.
