/**
 * High-quality procedural drum & instrument synthesis for Roland SP-404 default pads.
 * Produces authentic 48kHz AudioBuffers matching the C++ native sampler engine
 * so the sampler is 100% playable out-of-the-box in standalone browsers and plugins alike.
 */

export function generateDefaultSample(
  ctx: AudioContext,
  type: string
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 48000;
  const twoPi = 2 * Math.PI;

  switch (type) {
    case 'kick':
    case 'kick_01': {
      // Pad 1: KICK 01 (Deep Booming 808 with Punch Click)
      const duration = 0.65;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const phase = twoPi * (45.0 * t - (120.0 / 28.0) * Math.exp(-t * 28.0));
        const body = Math.sin(phase) * Math.exp(-t * 4.5);
        const click = t < 0.005 ? (1.0 - t / 0.005) * 0.4 : 0.0;
        const s = Math.tanh(body * 1.4 + click) * 0.95;
        left[i] = s;
        right[i] = s;
      }
      return buffer;
    }

    case 'kick_808': {
      // Pad 2: KICK 808 (Punchy 909-Style Dance Kick)
      const duration = 0.45;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const phase = twoPi * (55.0 * t - (140.0 / 38.0) * Math.exp(-t * 38.0));
        const body = Math.sin(phase) * Math.exp(-t * 6.5);
        const s = Math.tanh(body * 1.3) * 0.95;
        left[i] = s;
        right[i] = s;
      }
      return buffer;
    }

    case 'clap': {
      // Pad 3: CLAP CRISP (Multi-pulse handclap with stereo spread)
      const duration = 0.38;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let burst = 0.0;
        if (t < 0.012) burst = Math.sin(t * 1200.0) * 0.7;
        else if (t < 0.024) burst = Math.sin((t - 0.012) * 1400.0) * 0.85;
        else if (t < 0.038) burst = Math.sin((t - 0.024) * 1500.0) * 1.0;
        const env = t > 0.038 ? Math.exp(-(t - 0.038) * 18.0) : 1.0;
        const noiseL = Math.random() * 2.0 - 1.0;
        const noiseR = Math.random() * 2.0 - 1.0;
        left[i] = Math.tanh((burst + noiseL * 0.6) * env * 0.8);
        right[i] = Math.tanh((burst + noiseR * 0.6) * env * 0.8);
      }
      return buffer;
    }

    case 'snare': {
      // Pad 4: SNARE 90s (Tonal body with bright snappy wire)
      const duration = 0.42;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const tone = Math.sin(twoPi * 185.0 * t) * Math.exp(-t * 16.0);
        const noise = (Math.random() * 2.0 - 1.0) * Math.exp(-t * 12.0);
        const s = Math.tanh(tone * 0.6 + noise * 0.7) * 0.9;
        left[i] = s;
        right[i] = s;
      }
      return buffer;
    }

    case 'hat_closed': {
      // Pad 5: CH CLOSED (Tight metallic high-hat)
      const duration = 0.065;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const n = Math.random() * 2.0 - 1.0;
        const s = n * Math.exp(-t * 65.0) * 0.75;
        left[i] = s;
        right[i] = s;
      }
      return buffer;
    }

    case 'hat_open': {
      // Pad 6: OH SIZZLE (Open shimmering hi-hat)
      const duration = 0.55;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const nL = Math.random() * 2.0 - 1.0;
        const nR = Math.random() * 2.0 - 1.0;
        const env = Math.exp(-t * 7.5);
        left[i] = nL * env * 0.7;
        right[i] = nR * env * 0.7;
      }
      return buffer;
    }

    case 'tamb':
    case 'perc': {
      // Pad 7: TAMB SHAKE (Shaker / Tambourine)
      const duration = 0.28;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const n = Math.random() * 2.0 - 1.0;
        const env = Math.sin((t * Math.PI) / 0.28) * Math.exp(-t * 6.0);
        const s = n * env * 0.65;
        left[i] = s;
        right[i] = s;
      }
      return buffer;
    }

    case 'rim': {
      // Pad 8: RIM CLICK (Warm resonant acoustic wood click)
      const duration = 0.12;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const tone = Math.sin(twoPi * 1750.0 * t) * Math.exp(-t * 55.0);
        const s = tone * 0.85;
        left[i] = s;
        right[i] = s;
      }
      return buffer;
    }

    case 'vox':
    case 'vox_a': {
      // Pad 9: VOX CHOP A (Warm soul vocal "Hey")
      const duration = 0.45;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const f0 = 220.0;
        const s = Math.sin(twoPi * f0 * t) + 0.6 * Math.sin(twoPi * 550.0 * t) + 0.4 * Math.sin(twoPi * 1100.0 * t);
        const env = Math.sin(Math.min(1.0, t / 0.04) * 1.5708) * Math.exp(-t * 5.0);
        const out = Math.tanh(s * env * 0.75);
        left[i] = out;
        right[i] = out;
      }
      return buffer;
    }

    case 'vox_b': {
      // Pad 10: VOX CHOP B (Bright vocal "Yeah")
      const duration = 0.50;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const f0 = 293.66; // D4
        const s = Math.sin(twoPi * f0 * t) + 0.7 * Math.sin(twoPi * 720.0 * t) + 0.5 * Math.sin(twoPi * 1800.0 * t);
        const env = Math.sin(Math.min(1.0, t / 0.05) * 1.5708) * Math.exp(-t * 4.5);
        const out = Math.tanh(s * env * 0.75);
        left[i] = out;
        right[i] = out;
      }
      return buffer;
    }

    case 'rhodes':
    case 'rhodes_jazz': {
      // Pad 11: JAZZ RHODES (Rich FM electric piano Cmaj7: C4, E4, G4, B4)
      const duration = 1.8;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      const notes = [261.63, 329.63, 392.00, 493.88];

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let sum = 0.0;
        for (const f of notes) {
          const mod = Math.sin(twoPi * f * 2.0 * t) * 0.4 * Math.exp(-t * 2.5);
          sum += Math.sin(twoPi * f * t + mod) * Math.exp(-t * 1.8);
        }
        const s = Math.tanh(sum * 0.35);
        left[i] = s;
        right[i] = s;
      }
      return buffer;
    }

    case 'rhodes_lofi': {
      // Pad 12: LOFI CHORD (Moody Fm9 Rhodes: F3, Ab3, C4, Eb4, G4)
      const duration = 2.2;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      const notes = [174.61, 207.65, 261.63, 311.13, 392.00];

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let sum = 0.0;
        for (const f of notes) {
          const mod = Math.sin(twoPi * f * 1.5 * t) * 0.3 * Math.exp(-t * 1.8);
          sum += Math.sin(twoPi * f * t + mod) * Math.exp(-t * 1.4);
        }
        const s = Math.tanh(sum * 0.30);
        left[i] = s;
        right[i] = s;
      }
      return buffer;
    }

    case 'bass':
    case 'bass_808': {
      // Pad 13: 808 SUB SLIDE (Deep 42Hz saturated sub bass)
      const duration = 1.2;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let freq = 42.0;
        if (t > 0.3) freq = 42.0 + (t - 0.3) * 20.0; // pitch slide
        const s = Math.sin(twoPi * freq * t) * Math.exp(-t * 2.2);
        const out = Math.tanh(s * 1.6) * 0.9;
        left[i] = out;
        right[i] = out;
      }
      return buffer;
    }

    case 'bass_upright': {
      // Pad 14: UPRIGHT BASS (Warm plucked acoustic bass at 55Hz)
      const duration = 1.4;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const fundamental = Math.sin(twoPi * 55.0 * t) * Math.exp(-t * 2.5);
        const secondHarm = Math.sin(twoPi * 110.0 * t) * 0.35 * Math.exp(-t * 4.0);
        const bodyThump = (Math.random() * 2.0 - 1.0) * Math.exp(-t * 35.0) * 0.2;
        const out = Math.tanh(fundamental + secondHarm + bodyThump) * 0.85;
        left[i] = out;
        right[i] = out;
      }
      return buffer;
    }

    case 'vinyl': {
      // Pad 15: VINYL CRACKLE (Authentic vinyl dust rumble & crackle)
      const duration = 2.5;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const rumble = Math.sin(twoPi * 0.555 * t) * 0.08;
        let crackle = 0;
        if (Math.random() < 0.003) {
          crackle = (Math.random() * 2.0 - 1.0) * 0.5;
        }
        const hiss = (Math.random() * 2.0 - 1.0) * 0.04;
        left[i] = (rumble + crackle + hiss) * 0.7;
        right[i] = (rumble + crackle * 0.8 + hiss) * 0.7;
      }
      return buffer;
    }

    case 'reverse': {
      // Pad 16: REVERSE TAPE (Reverse tape swell)
      const duration = 1.5;
      const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const revEnv = Math.exp((t - 1.5) * 4.0);
        const chord = Math.sin(twoPi * 220.0 * t) + 0.5 * Math.sin(twoPi * 277.18 * t) + 0.5 * Math.sin(twoPi * 329.63 * t);
        const noise = (Math.random() * 2.0 - 1.0) * 0.15;
        const out = Math.tanh((chord * 0.35 + noise) * revEnv) * 0.85;
        left[i] = out;
        right[i] = out;
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
        const s = Math.sin(twoPi * 440 * t) * Math.exp(-t * 20);
        left[i] = s * 0.7;
        right[i] = s * 0.7;
      }
      return buffer;
    }
  }
}
