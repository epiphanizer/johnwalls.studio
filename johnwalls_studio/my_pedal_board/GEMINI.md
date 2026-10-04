# johnwalls.studio: Continuous VST Build & Direct Ableton Testing Rules

## MANDATORY RULE: ALWAYS REBUILD AND INSTALL VST ON CODE CHANGES
Whenever you make ANY changes to:
1. Audio DSP algorithms or headers (`engine/src/`, `engine/include/`)
2. VST plugin processor, editor, or telemetry server (`vst/Source/`, `vst/CMakeLists.txt`)
3. Web interface or audio bridge components (`ui/src/`, `ui/index.html`)
4. Any configuration affecting plugin behavior or appearance

You MUST automatically execute the VST build and installation immediately before completing your response, without asking the user for permission:

```bash
# Step 1: If any UI files were touched, rebuild the production web bundle:
cd /Users/seanhalls/Desktop/sh/johnwalls_studio/my_pedal_board/ui && npm run build

# Step 2: Compile and install the VST3 and AU plugins:
cmake --build /Users/seanhalls/Desktop/sh/johnwalls_studio/my_pedal_board/vst/build --config Release -j8
```

## RATIONALE & GUARANTEE
- The user actively tests `johnwalls.studio` directly inside Ableton Live.
- The build automatically overwrites:
  - `/Users/seanhalls/Library/Audio/Plug-Ins/VST3/johnwalls.studio.vst3`
  - `/Users/seanhalls/Library/Audio/Plug-Ins/Components/johnwalls.studio.component`
- Never prompt or ask the user whether to build; always build so Ableton Live has the latest binary ready to play immediately.
