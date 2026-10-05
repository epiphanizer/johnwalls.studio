/**
 * High-quality procedural drum & instrument synthesis for Roland SP-404 default pads.
 * Produces authentic 48kHz AudioBuffers so the sampler is 100% playable out-of-the-box.
 */

export function generateDefaultSample(
  ctx: AudioContext,
  type: string
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 48000;

  switch (type) {
    case 'kick': {
      // Punchy 90s Boom-Bap Kick
      const duration = 0.45;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        // Pitch envelope 160Hz -> 48Hz
        const freq = 48 + 112 * Math.exp(-t * 28);
        const phase = 2 * Math.PI * freq * t;
        // Body sine + subtle 2nd harmonic
        let s = Math.sin(phase) + 0.25 * Math.sin(phase * 2);
        // Click transient
        if (t < 0.008) {
          s += (Math.random() * 2 - 1) * 0.8 * (1 - t / 0.008);
        }
        // Amplitude envelope
        const env = Math.exp(-t * 8.5);
        // Soft saturate
        const sample = Math.tanh(s * 1.5 * env) * 0.95;
        left[i] = sample;
        right[i] = sample;
      }
      return buffer;
    }

    case 'snare': {
      // Crisp 90s Hip-Hop Snare
      const duration = 0.35;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        // Tone envelope: 220Hz -> 140Hz
        const toneFreq = 140 + 80 * Math.exp(-t * 30);
        const tone = Math.sin(2 * Math.PI * toneFreq * t) * Math.exp(-t * 18);
        // Snare wire noise (filtered white noise)
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 12);
        const sample = Math.tanh((tone * 0.7 + noise * 0.7) * 1.4) * 0.9;
        left[i] = sample;
        right[i] = sample;
      }
      return buffer;
    }

    case 'clap': {
      // Layered SP-1200 / 404 Handclap with multi-bursts
      const duration = 0.4;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      const bursts = [0.0, 0.012, 0.025, 0.04];
      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let env = 0;
        for (const b of bursts) {
          if (t >= b) {
            env += Math.exp(-(t - b) * 55) * 0.4;
          }
        }
        // Final tail
        if (t >= 0.04) {
          env += Math.exp(-(t - 0.04) * 14) * 0.6;
        }
        const noiseL = (Math.random() * 2 - 1) * env;
        const noiseR = (Math.random() * 2 - 1) * env;
        left[i] = Math.tanh(noiseL * 1.6) * 0.85;
        right[i] = Math.tanh(noiseR * 1.6) * 0.85;
      }
      return buffer;
    }

    case 'hat_closed': {
      // Metallic Closed Hi-Hat
      const duration = 0.12;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      const freqs = [3200, 4800, 6400, 8100, 9600];
      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let s = 0;
        for (const f of freqs) {
          s += Math.sin(2 * Math.PI * f * t);
        }
        s += (Math.random() * 2 - 1) * 1.5;
        const env = Math.exp(-t * 45);
        const sample = Math.tanh(s * 0.3 * env) * 0.8;
        left[i] = sample;
        right[i] = sample;
      }
      return buffer;
    }

    case 'hat_open': {
      // Sizzling Open Hi-Hat
      const duration = 0.65;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const noise = (Math.random() * 2 - 1) + 0.4 * Math.sin(2 * Math.PI * 7200 * t);
        const env = Math.exp(-t * 6.5);
        left[i] = noise * env * 0.6;
        right[i] = noise * env * 0.6;
      }
      return buffer;
    }

    case 'rhodes': {
      // Lofi Jazz Rhodes Chord (F minor 9: F - Ab - C - Eb - G)
      const duration = 1.8;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      const chordFreqs = [174.61, 207.65, 261.63, 311.13, 392.0];

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let sum = 0;
        chordFreqs.forEach((f, idx) => {
          // Bell tine harmonic + fundamental
          const tine = Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 12) * 0.25;
          const fund = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.8);
          const second = Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 2.5) * 0.3;
          sum += (fund + second + tine) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 4 * t + idx));
        });
        const tremolo = 1.0 + 0.15 * Math.sin(2 * Math.PI * 5.2 * t);
        const sample = Math.tanh(sum * 0.22 * tremolo);
        left[i] = sample * (1.0 + 0.1 * Math.sin(2 * Math.PI * 2 * t));
        right[i] = sample * (1.0 - 0.1 * Math.sin(2 * Math.PI * 2 * t));
      }
      return buffer;
    }

    case 'bass': {
      // 808 Deep Sub Bass Slide
      const duration = 1.2;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        // Pitch slide 65Hz -> 44Hz
        const f = 44 + 21 * Math.exp(-t * 4);
        const phase = 2 * Math.PI * f * t;
        let s = Math.sin(phase);
        // Tube grit
        s = Math.tanh(s * 1.4);
        const env = Math.exp(-t * 2.2);
        const sample = s * env * 0.9;
        left[i] = sample;
        right[i] = sample;
      }
      return buffer;
    }

    case 'vinyl': {
      // Authentic Vinyl Dust & Surface Rumble
      const duration = 2.0;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        // Low rumble at 33 1/3 RPM (0.555 Hz)
        const rumble = Math.sin(2 * Math.PI * 0.555 * t) * 0.08;
        let crackle = 0;
        if (Math.random() < 0.003) {
          crackle = (Math.random() * 2 - 1) * 0.5;
        }
        const hiss = (Math.random() * 2 - 1) * 0.04;
        left[i] = (rumble + crackle + hiss) * 0.7;
        right[i] = (rumble + crackle * 0.8 + hiss) * 0.7;
      }
      return buffer;
    }

    default: {
      // Resonant Percussive Hit
      const duration = 0.3;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const s = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 20);
        left[i] = s * 0.7;
        right[i] = s * 0.7;
      }
      return buffer;
    }
  }
}
