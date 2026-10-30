import type { FmInst, Inst, SynthInst, Wave } from './instruments.ts';
import type { Drum } from './mml.ts';
import type { SongEvent } from './score.ts';

export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const DUTY = [0.125, 0.25, 0.5, 0.75];
const clampHz = (f: number) => Math.max(30, Math.min(18000, f));

/**
 * All voice synthesis, for one audio context: the Game Boy-style chip voices, subtractive and FM
 * synth voices, and two drum kits. Every voice is built from fresh nodes at its start time and
 * stops itself, so callers only pick the bus.
 */
export class Synth {
  readonly ctx: BaseAudioContext;
  private waves = new Map<string, PeriodicWave>();
  private lfsr: AudioBuffer;
  private metal: AudioBuffer;
  private white: AudioBuffer;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.lfsr = this.lfsrNoise(false);
    this.metal = this.lfsrNoise(true);
    this.white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
  }

  // ─────────────────────────── waveforms ───────────────────────────

  private periodic(key: string, make: () => [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>]): PeriodicWave {
    let w = this.waves.get(key);
    if (!w) {
      const [real, imag] = make();
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(key, w);
    }
    return w;
  }

  pulseWave(duty: number): PeriodicWave {
    return this.periodic(`p${duty}`, () => {
      const n = 64;
      const real = new Float32Array(n), imag = new Float32Array(n);
      for (let i = 1; i < n; i++) imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
      return [real, imag];
    });
  }

  /** NES-like 4-bit stepped triangle: a little grit that reads well on small speakers. */
  triangleWave(): PeriodicWave {
    return this.periodic('tri4', () => {
      const N = 32, H = 24;
      const samples: number[] = [];
      for (let i = 0; i < N; i++) samples.push(((i < 16 ? i : 31 - i) / 15) * 2 - 1);
      const real = new Float32Array(H), imag = new Float32Array(H);
      for (let k = 1; k < H; k++) {
        let re = 0, im = 0;
        for (let i = 0; i < N; i++) {
          const a = (2 * Math.PI * k * (i + 0.5)) / N;
          re += samples[i] * Math.cos(a);
          im += samples[i] * Math.sin(a);
        }
        real[k] = (re / N) * 2;
        imag[k] = (im / N) * 2;
      }
      return [real, imag];
    });
  }

  /** Drawbars 8' 4' 2 2/3' 2' plus a touch of 1 3/5' and 1'. */
  private organWave(): PeriodicWave {
    return this.periodic('organ', () => {
      const real = new Float32Array(9), imag = new Float32Array(9);
      imag[1] = 1; imag[2] = 0.7; imag[3] = 0.45; imag[4] = 0.4; imag[5] = 0.12; imag[8] = 0.18;
      return [real, imag];
    });
  }

  private setWave(o: OscillatorNode, wave: Wave, duty: number) {
    switch (wave) {
      case 'saw': o.type = 'sawtooth'; break;
      case 'square': o.type = 'square'; break;
      case 'tri': o.type = 'triangle'; break;
      case 'sine': o.type = 'sine'; break;
      case 'pulse': o.setPeriodicWave(this.pulseWave(DUTY[duty] ?? 0.5)); break;
      case 'organ': o.setPeriodicWave(this.organWave()); break;
    }
  }

  /** Game Boy-style noise: a 15-bit LFSR (or the short 7-bit "metallic" mode), held a few samples per step. */
  private lfsrNoise(short: boolean): AudioBuffer {
    const ctx = this.ctx;
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let r = 0x7fff;
    const hold = short ? 3 : 2;
    let v = 1;
    for (let i = 0; i < len; i++) {
      if (i % hold === 0) {
        const bit = (r ^ (r >> 1)) & 1;
        r = (r >> 1) | (bit << 14);
        if (short) r = (r & ~0x40) | (bit << 6);
        v = r & 1 ? 1 : -1;
      }
      d[i] = v * 0.8;
    }
    return buf;
  }

  /** Stereo room: exponentially decaying noise with a short pre-delay. */
  impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const pre = Math.floor(ctx.sampleRate * 0.018);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - pre) / (len - pre), 3.2);
    }
    return buf;
  }

  /** Soft-clipping curve for track drive. */
  static driveCurve(): Float32Array<ArrayBuffer> {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(2.5 * x) / Math.tanh(2.5); }
    return c;
  }

  // ─────────────────────────── one-shots (sfx building blocks) ───────────────────────────

  /** A one-off chip tone with an optional pitch sweep (pulse, or the stepped triangle). */
  tone(dest: AudioNode, t: number, freq: number, dur: number, vol: number, type: 'pulse' | 'triangle', duty = 0.5, slideTo?: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.setPeriodicWave(type === 'pulse' ? this.pulseWave(duty) : this.triangleWave());
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    // plucked: fast attack, exponential decay like the music's E1 envelope
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0005, vol * 0.3), t + Math.max(0.006, dur));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.015);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  noiseHit(dest: AudioNode, t: number, dur: number, vol: number, hp: number, lp = 12000, metal = false) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = metal ? this.metal : this.lfsr;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'highpass';
    f1.frequency.value = hp;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f1).connect(f2).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  /** White noise through one filter, decaying from `vol` (or swelling up to it, for risers). */
  private whiteHit(dest: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 0.7, freqTo?: number, swell = false) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.automationRate = 'k-rate';
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = ctx.createGain();
    if (swell) {
      g.gain.setValueAtTime(0.0005, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    } else {
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    }
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  /** A sine with a fast pitch drop: kicks, toms, impacts. */
  private thump(dest: AudioNode, t: number, f0: number, f1: number, drop: number, decay: number, vol: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + drop);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.setTargetAtTime(0, t + drop * 0.6, decay / 3);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + drop * 0.6 + decay * 1.6);
  }

  // ─────────────────────────── score events ───────────────────────────

  /** Play one score event with an instrument. `transpose` (semitones) and `volMul` are for sfx phrases. */
  play(ev: SongEvent, inst: Inst, t: number, spt: number, bus: AudioNode, transpose = 0, volMul = 1) {
    switch (inst.kind) {
      case 'chip': case 'chiptri': return this.chipVoice(ev, inst.kind === 'chiptri', t, spt, bus, transpose, volMul);
      case 'chipkit': return this.chipDrum(bus, ev.drum!, t, ev.vol * volMul);
      case 'kit': return this.kitDrum(bus, ev.drum!, t, ev.vol * volMul, ev.midi[0], ev.dur * spt);
      case 'synth': return this.synthVoice(ev, inst, t, spt, bus, transpose, volMul);
      case 'fm': return this.fmVoice(ev, inst, t, spt, bus, transpose, volMul);
    }
  }

  private chipVoice(ev: SongEvent, tri: boolean, t: number, spt: number, bus: AudioNode, transpose: number, volMul: number) {
    const ctx = this.ctx;
    const dur = ev.dur * spt;
    const o = ctx.createOscillator();
    const midi = transpose ? ev.midi.map((m) => m + transpose) : ev.midi;
    const hz = midiHz(midi[0]);
    o.setPeriodicWave(tri ? this.triangleWave() : this.pulseWave(DUTY[ev.duty] ?? 0.5));
    if (midi.length > 1) {
      // fast arpeggio: cycle the chord tones like a sound chip would
      const step = 1 / 36;
      for (let k = 0, tt = t; tt < t + dur; k++, tt += step) o.frequency.setValueAtTime(midiHz(midi[k % midi.length]), tt);
    } else o.frequency.setValueAtTime(hz, t);
    if (ev.vib && dur > 0.24 && midi.length === 1) {
      // delayed vibrato, so short notes stay clean and held notes sing
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + 0.16);
      depth.gain.linearRampToValueAtTime(hz * (Math.pow(2, (ev.vib * 6) / 1200) - 1), t + 0.42);
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.06);
    }
    const g = ctx.createGain();
    const peak = ev.vol * volMul;
    const rel = tri ? 0.012 : 0.03;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    // envelopes: E1 plucked decay, E2 soft decay to a sustain, E0 organ
    const end = !tri && ev.env === 1 ? peak * Math.exp(-Math.max(0, dur - 0.01) / 0.13) * 0.92 + peak * 0.08
      : !tri && ev.env === 2 ? peak * 0.62 + peak * 0.38 * Math.exp(-Math.max(0, dur - 0.02) / 0.16)
      : peak;
    if (end !== peak) g.gain.exponentialRampToValueAtTime(Math.max(0.0005, end), t + Math.max(0.005, dur));
    else g.gain.setValueAtTime(peak, t + Math.max(0.005, dur));
    g.gain.linearRampToValueAtTime(0, t + dur + rel);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + rel + 0.02);
  }

  /** ADSR on a gain: attack, decay to sustain, hold to the note's end, release. Returns when it is silent. */
  private adsr(g: GainNode, t: number, dur: number, peak: number, p: { a: number; d: number; s: number; r: number }) {
    const a = Math.min(p.a, dur * 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (p.s < 1) g.gain.setTargetAtTime(peak * p.s, t + a, p.d / 3);
    g.gain.setTargetAtTime(0, t + dur, p.r / 4);
    return t + dur + p.r * 1.3 + 0.02;
  }

  /** Vibrato in cents, fading in after the attack so short notes stay clean. */
  private vibrato(t: number, dur: number, depthCents: number, end: number): GainNode | null {
    if (!depthCents || dur < 0.2) return null;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = this.ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + 0.14);
    depth.gain.linearRampToValueAtTime(depthCents, t + 0.4);
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(end);
    return depth;
  }

  private synthVoice(ev: SongEvent, p: SynthInst, t: number, spt: number, bus: AudioNode, transpose: number, volMul: number) {
    const ctx = this.ctx;
    const dur = Math.max(0.01, ev.dur * spt);
    const notes = (p.poly ? ev.midi : ev.midi.slice(0, 1)).map((m) => m + transpose);
    const peak = (ev.vol * volMul * p.gain) / Math.sqrt(notes.length);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = p.q ?? 0.7;
    f.frequency.automationRate = 'k-rate';
    const base = clampHz(p.cutoff * Math.pow(2, (ev.cut - 8) / 3));
    if (p.env) {
      // louder notes open the filter further, so accents bite
      f.frequency.setValueAtTime(clampHz(base * Math.pow(2, p.env * (0.35 + 0.65 * ev.vol))), t);
      f.frequency.setTargetAtTime(base, t + 0.002, (p.fdecay ?? 0.2) / 3);
    } else f.frequency.setValueAtTime(base, t);
    const g = ctx.createGain();
    const end = this.adsr(g, t, dur, peak, p);
    f.connect(g).connect(bus);

    const voices = p.voices ?? 1;
    // Wide unison: alternate voices go to the left and right inputs of one merger, so each ear
    // hears its own beating (cheaper than a panner per side).
    let merge: ChannelMergerNode | null = null;
    if (p.wide && voices > 1) {
      merge = ctx.createChannelMerger(2);
      merge.connect(f);
    }
    const vib = this.vibrato(t, dur, ev.vib * 7, end);
    const glideEnd = ev.glide && ev.from !== undefined ? t + ev.glide * spt : 0;
    notes.forEach((m, ni) => {
      const hz = midiHz(m);
      const from = glideEnd && ni === 0 ? midiHz(ev.from! + transpose) : 0;
      const osc = (ratio: number, cents: number, wave: Wave, dest: AudioNode, input = 0) => {
        const o = ctx.createOscillator();
        this.setWave(o, wave, ev.duty);
        o.detune.value = cents;
        if (from) {
          o.frequency.setValueAtTime(from * ratio, t);
          o.frequency.exponentialRampToValueAtTime(hz * ratio, glideEnd);
        } else o.frequency.setValueAtTime(hz * ratio, t);
        vib?.connect(o.detune);
        o.connect(dest, 0, input);
        o.start(t);
        o.stop(end);
      };
      for (let v = 0; v < voices; v++) {
        const cents = voices > 1 ? (v / (voices - 1) - 0.5) * (p.detune ?? 0) : 0;
        if (merge) osc(1, cents, p.wave, merge, v % 2);
        else osc(1, cents, p.wave, f);
      }
      if (p.sub) {
        // an octave down from E2 up; lower notes get a unison sine instead of inaudible rumble
        const sg = ctx.createGain();
        sg.gain.value = p.sub;
        sg.connect(f);
        osc(m >= 40 ? 0.5 : 1, 0, 'sine', sg);
      }
    });
  }

  private fmVoice(ev: SongEvent, p: FmInst, t: number, spt: number, bus: AudioNode, transpose: number, volMul: number) {
    const ctx = this.ctx;
    const dur = Math.max(0.01, ev.dur * spt);
    const peak = (ev.vol * volMul * p.gain) / Math.sqrt(ev.midi.length);
    const g = ctx.createGain();
    const end = this.adsr(g, t, dur, peak, p);
    g.connect(bus);
    const vib = this.vibrato(t, dur, ev.vib * 7, end);
    for (const m of ev.midi) {
      const hz = midiHz(m + transpose);
      const car = ctx.createOscillator();
      car.frequency.setValueAtTime(hz, t);
      const mod = ctx.createOscillator();
      mod.frequency.setValueAtTime(hz * p.ratio, t);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(hz * p.index * (0.4 + 0.6 * ev.vol), t);
      mg.gain.setTargetAtTime(hz * p.index * 0.06, t, p.idecay / 3);
      mod.connect(mg).connect(car.frequency);
      vib?.connect(car.detune);
      car.connect(g);
      car.start(t); mod.start(t);
      car.stop(end); mod.stop(end);
    }
  }

  /** The original chip kit: triangle-tone kicks and toms, LFSR noise snares and hats. */
  private chipDrum(bus: AudioNode, d: Drum, t: number, vol: number) {
    switch (d) {
      case 'k':
        this.tone(bus, t, 160, 0.13, vol * 0.9, 'triangle', 0.5, 42);
        this.noiseHit(bus, t, 0.012, vol * 0.25, 1500, 8000);
        break;
      case 's': case 'c':
        this.noiseHit(bus, t, 0.14, vol * 0.65, 1300, 9500);
        this.tone(bus, t, 200, 0.06, vol * 0.35, 'triangle', 0.5, 150);
        break;
      case 'h': this.noiseHit(bus, t, 0.035, vol * 0.45, 7500, 16000, true); break;
      case 'p': case 'y': this.noiseHit(bus, t, 0.16, vol * 0.4, 6500, 16000, true); break;
      case 'x': case 'i': this.noiseHit(bus, t, 0.8, vol * 0.45, 3500, 15000); break;
      case 't': this.tone(bus, t, 230, 0.16, vol * 0.75, 'triangle', 0.5, 105); break;
    }
  }

  /** A modern drum machine. Toms are pitched by the note's octave; risers sweep over the note length. */
  private kitDrum(bus: AudioNode, d: Drum, t: number, vol: number, midi: number, dur: number) {
    switch (d) {
      case 'k':
        this.thump(bus, t, 170, 48, 0.07, 0.22, vol * 0.62);
        this.whiteHit(bus, t, 0.008, vol * 0.2, 'highpass', 1600);
        break;
      case 's':
        this.whiteHit(bus, t, 0.19, vol * 0.75, 'bandpass', 1900, 0.7);
        this.whiteHit(bus, t, 0.07, vol * 0.35, 'highpass', 6000);
        this.thump(bus, t, 230, 165, 0.05, 0.09, vol * 0.6);
        break;
      case 'c':
        // three quick bursts and a tail, like hands that aren't quite together
        for (const [dt, v, len] of [[0, 4.8, 0.012], [0.011, 4.4, 0.012], [0.022, 5.6, 0.16]] as const) this.whiteHit(bus, t + dt, len, vol * v, 'bandpass', 1150, 0.9);
        break;
      case 'h': this.whiteHit(bus, t, 0.035, vol * 1.0, 'highpass', 8500); break;
      case 'p': this.whiteHit(bus, t, 0.24, vol * 0.7, 'highpass', 7500); break;
      case 'y':
        this.noiseHit(bus, t, 0.45, vol * 0.3, 5500, 12000, true);
        this.whiteHit(bus, t, 0.06, vol * 0.2, 'highpass', 9000);
        break;
      case 'x':
        this.whiteHit(bus, t, 1.6, vol * 0.22, 'highpass', 3800);
        this.noiseHit(bus, t, 0.9, vol * 0.12, 6000, 14000, true);
        break;
      case 't': {
        const hz = midiHz(midi - 5);
        this.thump(bus, t, hz, hz * 0.6, 0.18, 0.2, vol * 0.75);
        this.whiteHit(bus, t, 0.03, vol * 0.12, 'bandpass', 2500, 0.8);
        break;
      }
      case 'w': this.whiteHit(bus, t, Math.max(0.1, dur), vol * 0.4, 'bandpass', 300, 1.8, 9000, true); break;
      case 'z': this.whiteHit(bus, t, Math.max(0.1, dur), vol * 0.35, 'bandpass', 7000, 1.5, 250); break;
      case 'i':
        this.thump(bus, t, 110, 30, 0.6, 0.9, vol * 0.9);
        this.whiteHit(bus, t, 0.6, vol * 0.4, 'lowpass', 900);
        break;
    }
  }
}
