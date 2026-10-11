/**
 * Converts an AudioBuffer to a valid RIFF/WAVE standard 16-bit PCM WAV ArrayBuffer/Blob.
 * Produces uncompressed 16-bit PCM WAV. The target rate is explicit because
 * the legacy SP-404/SP-404A expects imported files to be treated as 44.1 kHz,
 * while the MKII workflow uses different card/project rules.
 */
export function audioBufferToWav(buffer: AudioBuffer, targetSampleRate: number = 48000): Blob {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = targetSampleRate;
  const numSamples = Math.round(buffer.duration * sampleRate);
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // Helper to write ASCII string to DataView
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // 1. RIFF Chunk Descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // ChunkSize
  writeString(8, 'WAVE');

  // 2. "fmt " Sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample (16-bit)

  // 3. "data" Sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Resample and interleave channels
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  const srcSampleRate = buffer.sampleRate;
  const ratio = srcSampleRate / sampleRate;

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const srcIndex = i * ratio;
    const idx0 = Math.floor(srcIndex);
    const idx1 = Math.min(idx0 + 1, buffer.length - 1);
    const frac = srcIndex - idx0;

    for (let c = 0; c < numChannels; c++) {
      const src = channels[c];
      // Linear interpolation
      const s0 = src[idx0] || 0;
      const s1 = src[idx1] || 0;
      const val = s0 + frac * (s1 - s0);

      // Clamp to -1.0 to 1.0 and scale to 16-bit signed integer
      const clamped = Math.max(-1, Math.min(1, val));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Extracts 32 points normalized waveform profile from AudioBuffer for instant rendering.
 */
export function extractWaveformProfile(buffer: AudioBuffer, points: number = 32): number[] {
  const channelData = buffer.getChannelData(0);
  const step = Math.floor(channelData.length / points);
  const result: number[] = [];

  for (let i = 0; i < points; i++) {
    let peak = 0;
    const start = i * step;
    const end = Math.min(start + step, channelData.length);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > peak) peak = abs;
    }
    result.push(Math.min(1.0, peak));
  }

  return result;
}
