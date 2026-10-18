/**
 * Transient Detection and Audio Slicing Engine for johnwalls.studio
 *
 * Implements onset peak detection using short-time energy flux, dynamic
 * adaptive thresholding, zero-crossing alignment, and BPM grid quantizing.
 */

export interface SliceMarker {
  id: string;
  timeSec: number;
  label: string;
  isTransient?: boolean;
}

/**
 * Snaps a given sample index to the nearest zero-crossing in the channel data.
 */
export function findNearestZeroCrossing(
  channelData: Float32Array,
  sampleIndex: number,
  searchRadius: number = 64
): number {
  const start = Math.max(0, sampleIndex - searchRadius);
  const end = Math.min(channelData.length - 1, sampleIndex + searchRadius);

  let bestIndex = sampleIndex;
  let minAbs = Math.abs(channelData[sampleIndex] || 0);

  for (let i = start; i < end; i++) {
    const current = channelData[i];
    const next = channelData[i + 1];

    // True sign-flip zero crossing
    if ((current <= 0 && next >= 0) || (current >= 0 && next <= 0)) {
      return i;
    }

    // Fallback: lowest absolute amplitude near index
    const absVal = Math.abs(current);
    if (absVal < minAbs) {
      minAbs = absVal;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Detects transient onset points across an AudioBuffer using energy flux and adaptive thresholding.
 *
 * @param buffer - The source AudioBuffer
 * @param sensitivity - Sensitivity factor from 0.0 (fewest onsets) to 1.0 (most aggressive)
 * @param minDistanceSec - Minimum distance between onsets in seconds (default 80ms)
 * @returns Array of slice points in seconds, always beginning with 0.0
 */
export function detectTransients(
  buffer: AudioBuffer,
  sensitivity: number = 0.65,
  minDistanceSec: number = 0.08
): number[] {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const totalSamples = buffer.length;

  if (totalSamples === 0 || buffer.duration <= 0.05) {
    return [0];
  }

  // 1. Create a downmixed mono representation for analysis
  const mono = new Float32Array(totalSamples);
  const ch0 = buffer.getChannelData(0);
  if (numChannels === 1) {
    mono.set(ch0);
  } else {
    const ch1 = buffer.getChannelData(1);
    for (let i = 0; i < totalSamples; i++) {
      mono[i] = (ch0[i] + ch1[i]) * 0.5;
    }
  }

  // 2. Short-time energy analysis with 512-sample frame and 256-sample hop
  const frameSize = 512;
  const hopSize = 256;
  const numFrames = Math.floor((totalSamples - frameSize) / hopSize);

  if (numFrames < 4) {
    return [0];
  }

  const energy = new Float32Array(numFrames);
  let totalEnergy = 0;

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = mono[offset + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / frameSize);
    energy[f] = rms;
    totalEnergy += rms;
  }

  const meanEnergy = totalEnergy / numFrames;

  // Compute energy standard deviation
  let sumDevSq = 0;
  for (let f = 0; f < numFrames; f++) {
    const diff = energy[f] - meanEnergy;
    sumDevSq += diff * diff;
  }
  const stdEnergy = Math.sqrt(sumDevSq / numFrames);

  // 3. First-order forward energy flux (half-wave rectified difference)
  const flux = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    const diff = energy[f] - energy[f - 1];
    flux[f] = diff > 0 ? diff : 0;
  }

  // 4. Adaptive threshold based on sensitivity
  // Sensitivity: 0.0 -> high threshold (only massive transients)
  // Sensitivity: 1.0 -> low threshold (catches subtle hats, ghost notes)
  const thresholdFactor = Math.max(0.05, (1.15 - sensitivity * 1.05) * 1.5);
  const baseThreshold = meanEnergy * 0.2 + stdEnergy * thresholdFactor;

  const minDistanceFrames = Math.max(1, Math.round((minDistanceSec * sampleRate) / hopSize));

  const onsetTimes: number[] = [0.0];
  let lastOnsetFrame = -minDistanceFrames;

  for (let f = 2; f < numFrames - 2; f++) {
    const currentFlux = flux[f];

    // Local peak condition
    if (
      currentFlux > baseThreshold &&
      currentFlux >= flux[f - 1] &&
      currentFlux >= flux[f - 2] &&
      currentFlux > flux[f + 1] &&
      f - lastOnsetFrame >= minDistanceFrames
    ) {
      const rawSample = f * hopSize;
      const zeroCrossSample = findNearestZeroCrossing(mono, rawSample, 64);
      const timeSec = Math.max(0.0, zeroCrossSample / sampleRate);

      if (timeSec > 0.02 && timeSec < buffer.duration - 0.02) {
        onsetTimes.push(parseFloat(timeSec.toFixed(4)));
        lastOnsetFrame = f;
      }
    }
  }

  // Sort and remove duplicates
  return Array.from(new Set(onsetTimes)).sort((a, b) => a - b);
}

/**
 * Computes BPM-quantized grid slices for a sample.
 */
export function getGridSlicePoints(
  durationSec: number,
  bpm: number = 120,
  divisions: 4 | 8 | 12 | 16 = 16
): number[] {
  if (durationSec <= 0.05) return [0];

  const points: number[] = [];
  const step = durationSec / divisions;

  for (let i = 0; i < divisions; i++) {
    points.push(parseFloat((i * step).toFixed(4)));
  }

  return points;
}

/**
 * Creates sub-buffers for each slice point.
 * Slices are non-destructive independent AudioBuffers.
 */
export function createSliceBuffers(
  ctx: AudioContext,
  sourceBuffer: AudioBuffer,
  slicePoints: number[]
): AudioBuffer[] {
  if (slicePoints.length === 0) return [];

  const sampleRate = sourceBuffer.sampleRate;
  const numChannels = sourceBuffer.numberOfChannels;
  const sortedPoints = [...slicePoints].sort((a, b) => a - b);
  const results: AudioBuffer[] = [];

  for (let i = 0; i < sortedPoints.length; i++) {
    const startSec = Math.max(0, sortedPoints[i]);
    const endSec = i < sortedPoints.length - 1 ? Math.min(sourceBuffer.duration, sortedPoints[i + 1]) : sourceBuffer.duration;

    const startSample = Math.floor(startSec * sampleRate);
    const endSample = Math.min(sourceBuffer.length, Math.ceil(endSec * sampleRate));
    const sliceLength = Math.max(1, endSample - startSample);

    const sliceBuf = ctx.createBuffer(numChannels, sliceLength, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const srcChannel = sourceBuffer.getChannelData(ch);
      const destChannel = sliceBuf.getChannelData(ch);
      destChannel.set(srcChannel.subarray(startSample, endSample));
    }

    results.push(sliceBuf);
  }

  return results;
}

/**
 * Generates normalized peak waveform profile for fast UI rendering.
 */
export function extractWaveformProfile(buffer: AudioBuffer, points: number = 64): number[] {
  if (!buffer || buffer.length === 0) return new Array(points).fill(0);

  const channelData = buffer.getChannelData(0);
  const step = Math.floor(channelData.length / points);
  const result: number[] = [];

  for (let i = 0; i < points; i++) {
    const start = i * step;
    const end = Math.min(channelData.length, start + step);
    let max = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(channelData[j]);
      if (val > max) max = val;
    }
    result.push(parseFloat(Math.min(1.0, max).toFixed(3)));
  }

  return result;
}
