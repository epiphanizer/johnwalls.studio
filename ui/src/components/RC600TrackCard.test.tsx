import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RC600TrackCard } from './RC600TrackCard';
import { rc600AudioEngine, RC600Track } from './RC600AudioEngine';

function renderCard() {
  const track: RC600Track = {
    id: 1,
    name: 'Track 1: Drums',
    status: 'playing',
    audioBuffer: {} as AudioBuffer,
    undoBuffer: {} as AudioBuffer,
    redoBuffer: {} as AudioBuffer,
    volume: 1,
    pan: 0,
    speed: 1,
    reverse: false,
    isOneShot: false,
    bars: 4,
    durationSec: 8,
    waveform: Array.from({ length: 8 }, () => 0.5),
    isMuted: false,
    isSoloed: false
  };
  render(
    <RC600TrackCard
      track={track}
      badge={{ label: 'PLAY', bg: '', dot: '', ring: '' }}
      onFootswitchTrigger={vi.fn()}
      onCommitBounceToSP404={vi.fn()}
      onLoadFromSP404Pad={vi.fn()}
      bouncePopoverTrackId={null}
      setBouncePopoverTrackId={vi.fn()}
      bounceTargetBank="A"
      setBounceTargetBank={vi.fn()}
      bounceTargetPadId={1}
      setBounceTargetPadId={vi.fn()}
      banks={['A']}
    />
  );
}

afterEach(() => vi.restoreAllMocks());

describe('RC600TrackCard transport controls', () => {
  it('routes the labeled undo, redo, play, overdub, and stop controls to distinct engine actions', () => {
    const undo = vi.spyOn(rc600AudioEngine, 'undoTrack').mockImplementation(() => {});
    const redo = vi.spyOn(rc600AudioEngine, 'redoTrack').mockImplementation(() => {});
    const play = vi.spyOn(rc600AudioEngine, 'playTrack').mockImplementation(() => {});
    const dub = vi.spyOn(rc600AudioEngine, 'startOverdub').mockImplementation(() => {});
    const stop = vi.spyOn(rc600AudioEngine, 'stopTrack').mockImplementation(() => {});
    renderCard();

    for (const label of ['UNDO', 'REDO', 'PLAY', 'DUB', 'STOP']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }

    expect(undo).toHaveBeenCalledWith(1);
    expect(redo).toHaveBeenCalledWith(1);
    expect(play).toHaveBeenCalledWith(1);
    expect(dub).toHaveBeenCalledWith(1);
    expect(stop).toHaveBeenCalledWith(1);
  });
});
