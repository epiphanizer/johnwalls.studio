import { describe, expect, it } from 'vitest';
import { RC600AudioEngine, mixLoopSamples } from './RC600AudioEngine';
import { sp404AudioEngine } from './SP404AudioEngine';

function makeBuffer(duration: number, value: number): AudioBuffer {
  const sampleRate = 1000;
  const data = new Float32Array(Math.max(1, Math.round(duration * sampleRate))).fill(value);
  return {
    duration,
    length: data.length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data
  } as unknown as AudioBuffer;
}

describe('RC600AudioEngine transport state', () => {
  it('mixes overdub input at the playhead and wraps around the loop', () => {
    const base = new Float32Array([0.1, 0.1, 0.1, 0.1]);
    const mixed = mixLoopSamples(base, [new Float32Array([0.2, 0.3])], 2, 4, 3, 1);
    expect([...mixed].map((sample) => Number(sample.toFixed(2)))).toEqual([0.1, 0.4, 0.1, 0.3]);
    expect([...base].map((sample) => Number(sample.toFixed(2)))).toEqual([0.1, 0.1, 0.1, 0.1]);
  });

  it('keeps undo and redo as separate one-step actions', () => {
    const engine = new RC600AudioEngine();
    const track = engine.getTrack(1)!;
    const oldBuffer = makeBuffer(2, 0.25);
    const newBuffer = makeBuffer(4, 0.75);
    track.audioBuffer = newBuffer;
    track.undoBuffer = oldBuffer;
    track.durationSec = newBuffer.duration;

    engine.undoTrack(track.id);
    expect(track.audioBuffer).toBe(oldBuffer);
    expect(track.undoBuffer).toBeNull();
    expect(track.redoBuffer).toBe(newBuffer);
    expect(track.durationSec).toBe(2);

    engine.redoTrack(track.id);
    expect(track.audioBuffer).toBe(newBuffer);
    expect(track.undoBuffer).toBe(oldBuffer);
    expect(track.redoBuffer).toBeNull();
    expect(track.durationSec).toBe(4);
  });

  it('reports loop position while a track is overdubbing', () => {
    const engine = new RC600AudioEngine();
    const track = engine.getTrack(1)!;
    track.audioBuffer = makeBuffer(4, 0.2);
    track.durationSec = 4;
    track.status = 'overdubbing';
    (engine as any).ctx = { currentTime: 4.5 };
    (engine as any).trackNodes.set(track.id, {
      startTime: 2.5,
      sourceNode: { playbackRate: { value: 1 } }
    });

    expect(engine.getTrackProgress(track.id)).toBeCloseTo(0.5);
  });

  it('retimes existing loops to Track 1 and recalculates when DAW tempo changes', () => {
    const engine = new RC600AudioEngine();
    const master = engine.getTrack(1)!;
    const linked = engine.getTrack(2)!;
    master.audioBuffer = makeBuffer(8, 0.2);
    master.durationSec = 8;
    linked.audioBuffer = makeBuffer(16, 0.3);
    linked.durationSec = 16;
    linked.status = 'playing';
    const rates: number[] = [];
    (engine as any).ctx = { currentTime: 1 };
    (engine as any).trackNodes.set(linked.id, {
      sourceNode: { playbackRate: { setTargetAtTime: (rate: number) => rates.push(rate) } },
      startTime: 0
    });

    engine.setTrackLinkEnabled(true);
    expect(engine.isTrackLinkEnabled()).toBe(true);
    expect(rates.at(-1)).toBeCloseTo(2);

    engine.setBpm(60);
    expect(rates.at(-1)).toBeCloseTo(1);
  });

  it('preserves pad sample metadata through the SP-404 to RC-600 round trip', () => {
    const engine = new RC600AudioEngine();
    const sample = makeBuffer(1.5, 0.4);
    sp404AudioEngine.assignBufferToPad('J', 12, sample, 'Bridge Test', 'oneshot', 2);
    const assignedPad = sp404AudioEngine.getPad('J', 12)!;
    expect(assignedPad.audioBuffer).toBe(sample);
    expect(assignedPad.duration).toBe(1.5);
    expect(assignedPad.sampleRate).toBe(1000);

    engine.loadSp404PadToTrack(2, 'J', 12);
    expect(engine.getTrack(2)?.audioBuffer).toBe(sample);
    expect(engine.getTrack(2)?.durationSec).toBe(1.5);

    engine.bounceTrackToSp404(2, 'J', 11);
    expect(sp404AudioEngine.getPad('J', 11)?.audioBuffer).toBe(sample);
  });
});
