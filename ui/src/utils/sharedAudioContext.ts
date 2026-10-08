/**
 * sharedAudioContext.ts
 *
 * Provides a single unified AudioContext instance shared across all studio modules
 * (Pedal Lab, SP-404 MKII, State Cockpit, and Waveform Visualizer).
 *
 * This prevents cross-AudioContext connection DOMExceptions, browser audio thread
 * memory leaks, and webview crashes during module transitions.
 */

let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioCtxClass();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

export function tryGetSharedAudioContext(): AudioContext | null {
  return sharedAudioContext;
}
