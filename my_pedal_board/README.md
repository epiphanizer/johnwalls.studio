# My Pedal Board · johnwalls.studio

**"My Pedal Board"** is a reactive audio meta-plugin and dynamic VST host engineered for **johnwalls.studio**. It operates as a desktop-native musical composition environment, tailored to integrate with **Ableton Live** and modern DAWs.

Driven by a hybrid **Virtual Command Line (Unix/Flag REPL)** and **Visual Pedalboard Rack**, it enables producers and live performers to instantiate DSP stompboxes on the fly, route them modularly, and dynamically manipulate sound parameters as a direct function of live musical state (e.g., recognizing kick/snare patterns, rhythmic density, breakdowns, and drops).

---

## 1. Key Architectural Features

1. **Native VST3 / Multi-Bus Architecture (Bypassing Max for Live)**:
   - Built in pure, deterministic C++20.
   - Rejects Max for Live (M4L) to eliminate JavaScript UI thread jitter, garbage collection latency, visual spaghetti code, and Ableton Suite lock-in.
   - Takes full advantage of Ableton Live's native VST3 auxiliary sidechain bus: route your Drum Rack or Kick track directly into the plugin header for sample-accurate, zero-latency transient extraction.
2. **Real-Time Musical State Machine & Feature Extractor**:
   - **Dual-Envelope Transient Isolation**: Low-pass and band-pass biquad filters isolate sub-bass punch (40Hz–110Hz) and snare crack (250Hz–2.5kHz).
   - **Rhythmic State Classifiers**:
     - `STEADY_GROOVE`: Regular 4/4 or syncopated drum cadence.
     - `BREAKDOWN`: Immediate detection when kick transients vanish while background music continues.
     - `BUILD_FILL`: High-density snare/percussion acceleration.
     - `DROP`: Explosive kick transient re-engagement following a breakdown.
3. **Dynamic In-Rack DSP Stompboxes**:
   - `TapeDelayNode`: Analog tape delay line with wow/flutter sinusoidal modulation, tape saturation soft-clipping, and tempo sync.
   - `LadderFilterNode`: 24dB 4-pole resonant Moog-style ladder filter with non-linear saturation.
   - `OverdriveNode`: Harmonic asymmetric waveshaper with tone tilt filter.
   - `ReactiveDuckerNode`: Sample-accurate dynamic attenuator triggered by state events or live kick hits.
4. **Virtual Command Line (Unix/Flag REPL)**:
   - Rapid keyboard workflows for sound design without mouse-hunting.
   - Interactive syntax coloring, tab autocomplete, and command history.

---

## 2. Virtual CLI Command Reference

| Command | Example | Description |
| :--- | :--- | :--- |
| `add pedal` | `add pedal delay --name dub_echo --time 350ms --fb 45%` | Instantiate a new DSP stompbox in the rack |
| `add pedal` | `add pedal filter --name sweep --cutoff 1400Hz --res 0.70` | Add resonant ladder filter |
| `add pedal` | `add pedal drive --name warm_drive --drive 4.0` | Add harmonic overdrive pedal |
| `add pedal` | `add pedal ducker --name sidechain_pumper --depth 18dB` | Add reactive sidechain ducker |
| `react to` | `react to breakdown do dub_echo.feedback -> 0.75 ramp 2s` | Smoothly ramp parameters on musical state entry |
| `react to` | `react to drop do sweep.cutoff -> 20000 snap` | Snap parameters instantly on drop |
| `duck` | `duck dub_echo.mix by kick amt 14dB release 80ms` | Duck parameter upon kick transient detection |
| `bypass` | `bypass dub_echo --toggle` | Toggle pedal bypass without removing from chain |
| `set` | `set sweep.cutoff 650` | Adjust a parameter value |
| `get` | `get dub_echo.feedback` | Inspect a parameter value |
| `list` | `list pedals` / `list rules` | List rack contents or active reactive rules |
| `status` | `status` | Print real-time telemetry (state, RMS, kick density) |
| `remove` | `remove dub_echo` | Remove pedal from rack |
| `clear` | `clear [rack|rules|all]` | Reset rack or rules |

---

## 3. Directory Layout

```
johnwalls_studio/my_pedal_board/
├── Makefile                        # Top-level build and test runner
├── README.md                       # Architectural guide & CLI reference
├── engine/                         # Native C++20 Audio & DSP Engine
│   ├── CMakeLists.txt              # CMake configuration
│   ├── include/pedalboard/
│   │   ├── audio_buffer.hpp        # Multi-bus audio buffer abstraction
│   │   ├── cli_grammar.hpp         # Unix-flag virtual REPL parser
│   │   ├── dsp_nodes.hpp           # TapeDelay, LadderFilter, Overdrive, Ducker
│   │   ├── feature_extractor.hpp   # Rhythm analyzer & dual-envelope transient detector
│   │   ├── pedal_rack.hpp          # Modular signal chain manager
│   │   └── state_governor.hpp      # Reactive rule modulation governor
│   ├── src/
│   │   ├── cli_grammar.cpp
│   │   ├── dsp_nodes.cpp
│   │   ├── feature_extractor.cpp
│   │   ├── pedal_rack.cpp
│   │   └── state_governor.cpp
│   └── tests/
│       └── test_main.cpp           # 100% passing unit test suite
└── ui/                             # Decoupled React / TypeScript / Canvas UI
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx                 # Main workstation shell
        ├── types.ts                # Data types & interfaces
        └── components/
            ├── AudioEngineBridge.ts # WebAudio synth, drums & DSP simulation
            ├── PedalBoardCanvas.tsx # Visual stompbox rack with signal cabling
            ├── StateTelemetryHUD.tsx# Recognized state badges & live meters
            ├── Stompbox.tsx         # Tactile pedal with animated modulation rings
            └── VirtualTerminal.tsx  # Hacker-grade embedded command REPL
```

---

## 4. Building and Running

### Run the C++20 Engine Tests
```bash
make test
```
*Compiles with AppleClang `-O3`, runs the full engine verification, and confirms 100% passing tests for CLI grammar, DSP processing, and rhythmic state classification.*

### Run the Interactive Web / JUCE WebView UI
```bash
make dev-ui
```
*Launches the Vite development server on port 3010. You can interact with the tactile pedals, adjust dials, execute virtual command line commands, and start the demo audio engine to hear the reactive tape delay, ladder filter, and kick ducking in real time.*

### Build the UI Production Bundle
```bash
make build-ui
```
*Generates optimized production assets in `ui/dist/` ready to embed into a JUCE 8 WebView.*
