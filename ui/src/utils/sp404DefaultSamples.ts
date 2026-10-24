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

/**
 * Authentic procedural models for the 48 pads of Walls:Devine Vol. 1
 * (Banks A: Decay, B: Conviction, C: Poetry, D: Gratitude, E: Joint Queen, F: Stash Daddy).
 */
export function generateWallsDevineSample(
  ctx: AudioContext,
  bank: string,
  padId: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 48000;
  const twoPi = 2 * Math.PI;

  const createBuf = (duration: number) => {
    const buf = ctx.createBuffer(2, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
    return { buf, left: buf.getChannelData(0), right: buf.getChannelData(1) };
  };

  switch (bank) {
    case 'A': {
      // === DECAY (Slow brooding indie/post-rock) ===
      switch (padId) {
        case 1: { // KICK SUB
          const { buf, left, right } = createBuf(0.85);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const freq = 48.0 * Math.exp(-t * 14.0) + 32.0;
            const phase = twoPi * freq * t;
            const s = Math.tanh(Math.sin(phase) * 1.5) * Math.exp(-t * 3.5);
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 2: { // SNARE 0004
          const { buf, left, right } = createBuf(0.55);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const tone = Math.sin(twoPi * 175 * t) * Math.exp(-t * 18);
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 10);
            const s = Math.tanh(tone * 0.7 + noise * 0.8) * 0.9;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 3: { // OFF-HAT
          const { buf, left, right } = createBuf(0.09);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const n = (Math.random() * 2 - 1) * Math.exp(-t * 45);
            left[i] = n * 0.7; right[i] = n * 0.7;
          }
          return buf;
        }
        case 4: { // FUZZ REVERSE
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const env = Math.exp((t - 1.8) * 3.5);
            const fuzz = Math.sin(twoPi * 110 * t) * 0.5 + Math.sin(twoPi * 220 * t) * 0.3;
            const s = Math.tanh(fuzz * 4.0) * env * 0.8;
            left[i] = s; right[i] = s * 0.9;
          }
          return buf;
        }
        case 5: { // BASSLINE
          const { buf, left, right } = createBuf(1.6);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const tone = Math.sin(twoPi * 55 * t) + 0.4 * Math.sin(twoPi * 110 * t);
            const s = Math.tanh(tone * 1.8) * Math.exp(-t * 1.8) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 6: { // FROZEN ACOUSTIC
          const { buf, left, right } = createBuf(2.2);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const chord = Math.sin(twoPi * 146.83 * t) + Math.sin(twoPi * 220.0 * t) + Math.sin(twoPi * 293.66 * t);
            const s = (chord / 3.0) * Math.exp(-t * 1.2) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 7: { // TERRY EPIC GTR
          const { buf, left, right } = createBuf(1.4);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const gtr = Math.sin(twoPi * 440 * t) + 0.6 * Math.sin(twoPi * 660 * t);
            const s = Math.tanh(gtr * 3.5) * Math.exp(-t * 2.0) * 0.8;
            left[i] = s; right[i] = s * 0.85;
          }
          return buf;
        }
        case 8: { // TERRY MELO
          const { buf, left, right } = createBuf(1.2);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 587.33 * t) * Math.exp(-t * 2.5) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 9: { // SEAN INTRO
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const formant = Math.sin(twoPi * 160 * t) * (1 + 0.5 * Math.sin(twoPi * 700 * t));
            const s = Math.tanh(formant * 1.2) * Math.exp(-t * 1.5) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 10: { // SEAN VERSE
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const formant = Math.sin(twoPi * 196 * t) * (1 + 0.4 * Math.sin(twoPi * 850 * t));
            const s = Math.tanh(formant * 1.3) * Math.exp(-t * 1.6) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 11: { // TERRY ROBOT
          const { buf, left, right } = createBuf(1.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const carrier = Math.sign(Math.sin(twoPi * 220 * t));
            const mod = Math.sin(twoPi * 14 * t);
            const s = carrier * mod * Math.exp(-t * 1.8) * 0.7;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        default: { // FULL MASTER
          const { buf, left, right } = createBuf(3.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const sub = Math.sin(twoPi * 45 * t) * 0.5;
            const body = Math.sin(twoPi * 146.83 * t) * 0.3;
            const noise = (Math.random() * 2 - 1) * 0.05;
            const s = Math.tanh(sub + body + noise) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
      }
    }

    case 'D': {
      // === GRATITUDE (Bank D: Neo-soul / funk groove) ===
      switch (padId) {
        case 1: { // KICK PRINT
          const { buf, left, right } = createBuf(0.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const freq = 65.0 * Math.exp(-t * 22.0) + 40.0;
            const s = Math.tanh(Math.sin(twoPi * freq * t) * 1.6) * Math.exp(-t * 5.0) * 0.95;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 2: { // SNAREISH
          const { buf, left, right } = createBuf(0.35);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const snap = Math.sin(twoPi * 210 * t) * Math.exp(-t * 22);
            const clap = (Math.random() * 2 - 1) * Math.exp(-t * 14);
            const s = Math.tanh(snap * 0.8 + clap * 0.7) * 0.9;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 3: { // HAT PRINT
          const { buf, left, right } = createBuf(0.08);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const n = (Math.random() * 2 - 1) * Math.exp(-t * 50);
            left[i] = n * 0.65; right[i] = n * 0.65;
          }
          return buf;
        }
        case 4: { // VINYL DIRT
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const crackle = Math.random() < 0.005 ? (Math.random() * 2 - 1) * 0.6 : 0;
            const hiss = (Math.random() * 2 - 1) * 0.03;
            left[i] = (crackle + hiss) * 0.8;
            right[i] = (crackle * 0.9 + hiss) * 0.8;
          }
          return buf;
        }
        case 5: { // BASS 2 GROOVE
          const { buf, left, right } = createBuf(1.4);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const b = Math.sin(twoPi * 49 * t) + 0.5 * Math.sin(twoPi * 98 * t);
            const s = Math.tanh(b * 1.5) * Math.exp(-t * 2.0) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 6: { // ORANGE CHORDS
          const { buf, left, right } = createBuf(1.6);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const chord = Math.sin(twoPi * 196 * t) + Math.sin(twoPi * 246.94 * t) + Math.sin(twoPi * 293.66 * t);
            const s = (chord / 3.0) * Math.exp(-t * 1.5) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 7: { // LEAD GUITAR
          const { buf, left, right } = createBuf(1.2);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const lead = Math.sin(twoPi * 392 * t) + 0.3 * Math.sin(twoPi * 784 * t);
            const s = Math.tanh(lead * 1.8) * Math.exp(-t * 2.2) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 8: { // MINIBRUTE SYNTH
          const { buf, left, right } = createBuf(1.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const saw = (t * 146.83) % 1.0 - 0.5;
            const s = Math.tanh(saw * 3.0) * Math.exp(-t * 2.0) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 9: { // SEAN VOX
          const { buf, left, right } = createBuf(1.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 261.63 * t) * Math.exp(-t * 1.8) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 10: { // SEAN HARMONY
          const { buf, left, right } = createBuf(1.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 329.63 * t) * Math.exp(-t * 1.8) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 11: { // TERRY DEVINE
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 220 * t) * (1 + 0.3 * Math.sin(twoPi * 5 * t)) * Math.exp(-t * 1.4) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        default: { // FULL MASTER
          const { buf, left, right } = createBuf(3.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 49 * t) * 0.4 + Math.sin(twoPi * 196 * t) * 0.3) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
      }
    }

    case 'C': {
      // === POETRY (Bank C: Intimate acoustic / harmonium) ===
      switch (padId) {
        case 1: { // DEEP KICK
          const { buf, left, right } = createBuf(0.65);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const freq = 52.0 * Math.exp(-t * 16.0) + 36.0;
            const s = Math.tanh(Math.sin(twoPi * freq * t) * 1.5) * Math.exp(-t * 4.0) * 0.9;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 2: { // SNARE 0001
          const { buf, left, right } = createBuf(0.45);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const tone = Math.sin(twoPi * 180 * t) * Math.exp(-t * 20);
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 12);
            const s = Math.tanh(tone * 0.7 + noise * 0.8) * 0.9;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 3: { // SHAKER SWAG
          const { buf, left, right } = createBuf(0.14);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.random() * 2 - 1) * Math.exp(-t * 25) * 0.65;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 4: { // SEAN BEATBOX
          const { buf, left, right } = createBuf(0.6);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 90 * t) * Math.exp(-t * 8) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 5: { // SUB BASS
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 44 * t) * Math.exp(-t * 1.8) * 0.9;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 6: { // HARMONIUM CHORDS
          const { buf, left, right } = createBuf(2.4);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const chord = Math.sin(twoPi * 130.81 * t) + Math.sin(twoPi * 164.81 * t) + Math.sin(twoPi * 196.0 * t);
            const s = (chord / 3.0) * Math.exp(-t * 1.1) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 7: { // MARTIN ACOUSTIC
          const { buf, left, right } = createBuf(1.6);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const ac = Math.sin(twoPi * 261.63 * t) + 0.5 * Math.sin(twoPi * 392.0 * t);
            const s = ac * Math.exp(-t * 2.2) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 8: { // TERRY RODE GTR
          const { buf, left, right } = createBuf(1.4);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const g = Math.sin(twoPi * 329.63 * t) + 0.4 * Math.sin(twoPi * 659.25 * t);
            const s = Math.tanh(g * 2.0) * Math.exp(-t * 2.0) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 9: { // CHORUS VOX
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 261.63 * t) * Math.exp(-t * 1.5) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 10: { // NEUMAN HARMONY
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 392.0 * t) * Math.exp(-t * 1.5) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 11: { // POETRY ENDING
          const { buf, left, right } = createBuf(2.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 196.0 * t) * Math.exp(-t * 1.0) * 0.7;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        default: { // FULL MASTER
          const { buf, left, right } = createBuf(3.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 44 * t) * 0.4 + Math.sin(twoPi * 130.81 * t) * 0.4) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
      }
    }
    case 'B': { // === CONVICTION (Bank B) ===
      switch (padId) {
        case 1: { // DRUMS & BASS (Full groove pocket)
          const { buf, left, right } = createBuf(3.2);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            // Kick pattern at 0s, 0.6s, 1.2s, 1.8s, 2.4s
            let kick = 0.0;
            for (let kt = 0.0; kt <= 2.8; kt += 0.6) {
              if (t >= kt && t < kt + 0.4) {
                const dt = t - kt;
                const kfreq = 60.0 * Math.exp(-dt * 20.0) + 38.0;
                kick += Math.sin(twoPi * kfreq * dt) * Math.exp(-dt * 5.5);
              }
            }
            // Driving P-bass fundamental at 55Hz (A) and 49Hz (G)
            const bassTone = Math.sin(twoPi * (t < 1.6 ? 55.0 : 49.0) * t) * 0.5;
            // Snare snap at 0.6s, 1.8s
            let snare = 0.0;
            for (const st of [0.6, 1.8]) {
              if (t >= st && t < st + 0.3) {
                const sdt = t - st;
                snare += (Math.sin(twoPi * 185.0 * sdt) * 0.4 + (Math.random() * 2 - 1) * 0.6) * Math.exp(-sdt * 16.0);
              }
            }
            const s = Math.tanh(kick * 1.4 + bassTone * 1.2 + snare * 0.9) * 0.92;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 2: { // BEAT DROP (Punchy live kick & room snare drop)
          const { buf, left, right } = createBuf(1.4);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const kfreq = 75.0 * Math.exp(-t * 24.0) + 42.0;
            const click = t < 0.006 ? (1.0 - t / 0.006) * 0.6 : 0.0;
            const kickBody = Math.sin(twoPi * kfreq * t) * Math.exp(-t * 4.8);
            const roomAir = (Math.random() * 2 - 1) * 0.15 * Math.exp(-t * 8.0);
            const s = Math.tanh(kickBody * 1.5 + click + roomAir) * 0.95;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 3: { // VERSE GROOVE
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const b = Math.sin(twoPi * 55.0 * t) * Math.exp(-t * 2.0);
            left[i] = b * 0.85; right[i] = b * 0.85;
          }
          return buf;
        }
        case 4: { // CONVICTION HOOK
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 246.94 * t) * Math.exp(-t * 1.5) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 5: { // TERRY GUITAR
          const { buf, left, right } = createBuf(1.6);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const g = Math.tanh((Math.sin(twoPi * 329.63 * t) + 0.4 * Math.sin(twoPi * 659.25 * t)) * 2.0) * Math.exp(-t * 1.8);
            left[i] = g * 0.75; right[i] = g * 0.75;
          }
          return buf;
        }
        case 6: { // CHORUS STRINGS
          const { buf, left, right } = createBuf(2.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 164.81 * t) + Math.sin(twoPi * 246.94 * t) + Math.sin(twoPi * 329.63 * t)) / 3.0 * Math.exp(-t * 0.7);
            left[i] = s * 0.8; right[i] = s * 0.8;
          }
          return buf;
        }
        case 7: { // CHORUS HARMONY
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 392.0 * t) * Math.exp(-t * 1.4) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 8: { // UPLIFT STRINGS
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const f = 220.0 + t * 150.0;
            const s = Math.sin(twoPi * f * t) * Math.exp(-t * 1.0) * 0.7;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 9: { // CHORUS IMPACT
          const { buf, left, right } = createBuf(2.2);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const k = Math.sin(twoPi * 50.0 * Math.exp(-t * 10.0) * t) * Math.exp(-t * 3.0);
            const s = (k + Math.sin(twoPi * 330.0 * t) * 0.5) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 10: { // PIANO BRIDGE
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const p = Math.sin(twoPi * 220.0 * t) * Math.exp(-t * 1.8) + Math.sin(twoPi * 277.18 * t) * Math.exp(-t * 1.8);
            left[i] = p * 0.75; right[i] = p * 0.75;
          }
          return buf;
        }
        case 11: { // OUTRO DECAY
          const { buf, left, right } = createBuf(2.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 110.0 * t) * Math.exp(-t * 0.8) * 0.65;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        default: { // FULL MASTER
          const { buf, left, right } = createBuf(3.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 55.0 * t) * 0.4 + Math.sin(twoPi * 164.81 * t) * 0.4) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
      }
    }
    case 'E': { // === JOINT QUEEN (Bank E) ===
      switch (padId) {
        case 1: { // INTRO HOOK
          const { buf, left, right } = createBuf(2.2);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 185.0 * t) + 0.4 * Math.sin(twoPi * 370.0 * t)) * Math.exp(-t * 1.5) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 2: { // BEAT DROP
          const { buf, left, right } = createBuf(1.4);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const k = Math.sin(twoPi * 52.0 * Math.exp(-t * 12.0) * t) * Math.exp(-t * 4.0);
            left[i] = k * 0.9; right[i] = k * 0.9;
          }
          return buf;
        }
        case 3: { // VERSE GROOVE
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const b = Math.sin(twoPi * 65.41 * t) * Math.exp(-t * 1.8);
            left[i] = b * 0.85; right[i] = b * 0.85;
          }
          return buf;
        }
        case 4: { // PUFF PUFF VOX
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 246.94 * t) * Math.exp(-t * 1.6) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 5: { // BOGART QUOTE
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 220.0 * t) * Math.exp(-t * 1.4) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 6: { // CHORUS DROP
          const { buf, left, right } = createBuf(2.4);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 130.81 * t) + Math.sin(twoPi * 196.0 * t)) * 0.5 * Math.exp(-t * 0.8) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 7: { // TERRY HARMONY
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 329.63 * t) * Math.exp(-t * 1.5) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 8: { // ACOUSTIC SOLO
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const ac = (Math.sin(twoPi * 392.0 * t) + 0.3 * Math.sin(twoPi * 784.0 * t)) * Math.exp(-t * 2.0);
            left[i] = ac * 0.8; right[i] = ac * 0.8;
          }
          return buf;
        }
        case 9: { // TERRY DELAY GTR
          const { buf, left, right } = createBuf(2.2);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const g = Math.tanh(Math.sin(twoPi * 440.0 * t) * 2.2) * Math.exp(-t * 1.5);
            left[i] = g * 0.75; right[i] = g * 0.75;
          }
          return buf;
        }
        case 10: { // SUGAR SPICE
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 349.23 * t) * Math.exp(-t * 1.6) * 0.75;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 11: { // OUTRO DECAY
          const { buf, left, right } = createBuf(2.6);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 110.0 * t) * Math.exp(-t * 0.8) * 0.7;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        default: { // FULL MASTER
          const { buf, left, right } = createBuf(3.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 65.41 * t) * 0.4 + Math.sin(twoPi * 196.0 * t) * 0.4) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
      }
    }
    case 'F': { // === STASH DADDY (Bank F) ===
      switch (padId) {
        case 1: { // BEATBOX INTRO
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const noise = (Math.random() * 2.0 - 1.0) * Math.exp(-t * 15.0);
            const kick = Math.sin(twoPi * 55.0 * Math.exp(-t * 15.0) * t) * Math.exp(-t * 5.0);
            const s = Math.tanh(kick * 1.2 + noise * 0.7) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 2: { // CONGA POCKET
          const { buf, left, right } = createBuf(1.6);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const conga = Math.sin(twoPi * 200.0 * Math.exp(-t * 8.0) * t) * Math.exp(-t * 4.0);
            left[i] = conga * 0.85; right[i] = conga * 0.85;
          }
          return buf;
        }
        case 3: { // SEAN RAP HOOK
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 196.0 * t) * Math.exp(-t * 1.5) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 4: { // ISHIKA VOCAL
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 293.66 * t) * Math.exp(-t * 1.4) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 5: { // TERRY LEAD GTR
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const g = Math.tanh(Math.sin(twoPi * 329.63 * t) * 2.0) * Math.exp(-t * 1.5);
            left[i] = g * 0.75; right[i] = g * 0.75;
          }
          return buf;
        }
        case 6: { // CHORUS HOOK
          const { buf, left, right } = createBuf(2.4);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 110.0 * t) + Math.sin(twoPi * 164.81 * t)) * 0.5 * Math.exp(-t * 0.8) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 7: { // BREAK SPOT
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.sin(twoPi * 73.42 * t) * Math.exp(-t * 2.0) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 8: { // ROGUE BASS
          const { buf, left, right } = createBuf(2.0);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const b = Math.tanh(Math.sin(twoPi * 49.0 * t) * 2.5) * Math.exp(-t * 1.5);
            left[i] = b * 0.85; right[i] = b * 0.85;
          }
          return buf;
        }
        case 9: { // TERRY WHISTLES
          const { buf, left, right } = createBuf(2.2);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const w = Math.sin(twoPi * 880.0 * t) * Math.exp(-t * 1.2) * 0.7;
            left[i] = w; right[i] = w;
          }
          return buf;
        }
        case 10: { // SATURATED CLX
          const { buf, left, right } = createBuf(1.8);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = Math.tanh(Math.sin(twoPi * 246.94 * t) * 3.0) * Math.exp(-t * 1.8) * 0.8;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
        case 11: { // APHEX BRIDGE
          const { buf, left, right } = createBuf(2.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 130.81 * t) + Math.sin(twoPi * 261.63 * t * Math.sin(twoPi * 8.0 * t))) * 0.5 * Math.exp(-t * 1.0);
            left[i] = s * 0.8; right[i] = s * 0.8;
          }
          return buf;
        }
        default: { // FULL MASTER
          const { buf, left, right } = createBuf(3.5);
          for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            const s = (Math.sin(twoPi * 49.0 * t) * 0.4 + Math.sin(twoPi * 146.83 * t) * 0.4) * 0.85;
            left[i] = s; right[i] = s;
          }
          return buf;
        }
      }
    }
    default: {
      const { buf, left, right } = createBuf(1.0);
      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const s = Math.sin(twoPi * 220.0 * t) * Math.exp(-t * 2.0) * 0.6;
        left[i] = s; right[i] = s;
      }
      return buf;
    }
  }
}

