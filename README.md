# johnwalls.studio

johnwalls.studio combines a C++ audio engine and JUCE VST3/AU plug-in with a React, TypeScript, and Vite workstation UI. The UI includes the Pedal Lab, SP-404 sampler, RC-600 looper, Performance Deck, and State Cockpit. The native plug-in and browser UI communicate through the audio and telemetry bridges in `vst/Source/` and `ui/src/`.

## Repository layout

- `engine/` — standalone C++ DSP, musical state, and command parser.
- `vst/` — JUCE plug-in, editor, telemetry server, and plug-in tests.
- `ui/` — React application, WebAudio engines, sampler/looper workstations, and Electron shell.
- `scripts/` — audio export, hardware sync, and web-app deployment utilities.
- `.github/workflows/` — automated build and release workflows.

The public marketing site is hosted separately from this repository. This repository builds the standalone app deployed under `/studio-app/` and the embedded UI used by the desktop plug-in.

## Develop and verify

Install the UI dependencies and start the Vite development server:

```bash
cd ui
npm ci
npm run dev
```

The UI check runs TypeScript and the Vitest behavior tests. The production build also runs TypeScript before Vite:

```bash
cd ui
npm test
npm run build
```

Run the standalone C++ engine suite from the repository root:

```bash
make test
```

Configure the JUCE project and optional plug-in tests with:

```bash
cmake -S vst -B vst/build -DJWS_BUILD_VST_TESTS=ON
cmake --build vst/build --config Release -j8
```

Some plug-in integration tests require installed external tools such as SuperCollider. The nightly workflow builds the macOS VST3 and AU artifacts; it does not currently run every optional integration test.

## Desktop app and deployment

`cd ui && npm run desktop` opens the Electron shell. `npm run push` builds and uploads the standalone UI bundle to the configured johnwalls.studio deployment endpoint. Set `STUDIO_DEPLOY_TOKEN` for authenticated deployment, or `STUDIO_DEPLOY_URL` to override the endpoint. Review the deployment response and live verification output before treating a release as available.

## Audio and SuperCollider

The UI uses WebAudio for browser-side audio and shares an `AudioContext` across its workstation modules. The JUCE editor injects the native invocation and telemetry endpoints. The State Cockpit can control an installed SuperCollider server (`scsynth` and `sclang`); those processes and their output device are separate from the DAW audio path.

The tests cover selected engine, transport, and bridge behavior. A passing test run is not a claim of complete coverage or a substitute for testing with the target DAW and hardware.
