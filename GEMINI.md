# johnwalls.studio: Continuous VST Build & Direct Ableton Testing Rules

## MANDATORY RULE: ALWAYS REBUILD AND INSTALL VST ON CODE CHANGES
Whenever you make ANY changes to:
1. Audio DSP algorithms or headers (`johnwalls_studio/engine/`)
2. VST plugin processor, editor, or telemetry server (`johnwalls_studio/vst/`)
3. Web interface or audio bridge components (`johnwalls_studio/ui/`)
4. Any configuration affecting plugin behavior or appearance

You MUST automatically execute the VST build and installation immediately before completing your response, without asking the user for permission:

```bash
# Step 1: If any UI files were touched, rebuild the production web bundle:
cd /Users/seanhalls/Desktop/sh/johnwalls_studio/ui && npm run build

# Step 2: Compile and install the VST3 and AU plugins:
cmake --build /Users/seanhalls/Desktop/sh/johnwalls_studio/vst/build --config Release -j8
```

## RATIONALE & GUARANTEE
- The user actively tests `johnwalls.studio` directly inside Ableton Live.
- The build automatically overwrites:
  - `/Users/seanhalls/Library/Audio/Plug-Ins/VST3/johnwalls.studio.vst3`
  - `/Users/seanhalls/Library/Audio/Plug-Ins/Components/johnwalls.studio.component`
- Never prompt or ask the user whether to build; always build so Ableton Live has the latest binary ready to play immediately.

## MANDATORY RULE: HARNESS THE DATABASE AS SINGLE SOURCE OF TRUTH
- For `bindu` (`bindu.local` / `sh_hub`) and all network operations, never fabricate state or read from unindexed individual files.
- All network devices, reserved IPs, deferred tasks for ASUS GB10, Artha/Maya 24/7 quant telemetry/signals, and client scoping estimates must be stored and computed directly from the PostgreSQL / SQLite dual-mode database (`src/config/database.ts`).

## MANDATORY RULE: OBJECTIVE TELEMETRY & PROFESSIONAL SYSTEM TONE
- Eliminate anthropomorphic, theatrical, or overly casual language from all system messages, alerts, logs, and interfaces.
- Banned Phrasing:
  - Anthropomorphism (e.g., "watching like a hawk", "eager to help", "worried about").
  - Melodrama & Hype (e.g., "screaming AI", "uh-oh", "critical meltdown imminent").
  - Colloquial nicknames ("Hawk Watch" -> use "Storage & Compute Capacity Monitor").
- Direct & Neutral: State metrics, thresholds, and statuses objectively.
  - *Incorrect:* "Hawk watch critical! Host NVMe is at 95.7%. Watching storage like a hawk."
  - *Correct:* "Storage Threshold Exceeded: Host NVMe utilization at 95.7% (40.3 GB available)."
- No AI Emojis: Maintain clean typography and technical precision across all outputs.
