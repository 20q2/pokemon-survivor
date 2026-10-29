import { Rng } from '../engine/math.ts';

/**
 * Original procedural chiptune: a tiny NES-style synth (2 pulse + triangle + noise) and a
 * composer that builds songs from a chord progression, a seeded motif and AABA form.
 */

type Mode = 'major' | 'minor' | 'dorian' | 'mixolydian' | 'harmonic';
const SCALES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

interface SongSpec {
  seed: number;
  bpm: number;
  root: number;        // midi note of tonic (octave 4-ish)
  mode: Mode;
  prog: number[];      // scale degrees (0-based) per bar, 8 bars = one section
  progB?: number[];    // bridge progression
  drums: 'march' | 'drive' | 'soft' | 'none' | 'half';
  lead: number;        // duty 0.125/0.25/0.5
  swing?: number;
  arp?: boolean;
  bassStyle?: 'bounce' | 'walk' | 'pedal' | 'octave';
  density?: number;    // melody note density 0..1
}

export const SONGS: Record<string, SongSpec> = {
  title: { seed: 11, bpm: 132, root: 62, mode: 'major', prog: [0, 4, 5, 3, 0, 4, 3, 4], progB: [5, 3, 0, 4, 5, 3, 1, 4], drums: 'march', lead: 0.25, arp: true, bassStyle: 'bounce', density: 0.7 },
  menu: { seed: 5, bpm: 104, root: 65, mode: 'major', prog: [0, 5, 1, 4, 0, 5, 1, 4], progB: [3, 4, 2, 5, 3, 4, 1, 4], drums: 'soft', lead: 0.125, arp: true, bassStyle: 'walk', density: 0.55, swing: 0.12 },
  forest: { seed: 23, bpm: 128, root: 60, mode: 'major', prog: [0, 3, 4, 0, 5, 3, 1, 4], progB: [3, 4, 0, 5, 3, 4, 1, 4], drums: 'march', lead: 0.25, arp: true, bassStyle: 'bounce', density: 0.75 },
  cave: { seed: 41, bpm: 112, root: 57, mode: 'dorian', prog: [0, 0, 6, 6, 5, 5, 4, 4], progB: [3, 3, 0, 0, 5, 6, 4, 4], drums: 'half', lead: 0.5, arp: true, bassStyle: 'pedal', density: 0.5 },
  ice: { seed: 77, bpm: 118, root: 64, mode: 'minor', prog: [0, 5, 2, 6, 0, 5, 3, 4], progB: [5, 6, 2, 0, 3, 4, 5, 4], drums: 'soft', lead: 0.125, arp: true, bassStyle: 'octave', density: 0.6 },
  factory: { seed: 91, bpm: 140, root: 58, mode: 'mixolydian', prog: [0, 0, 6, 3, 0, 0, 6, 4], progB: [3, 3, 0, 0, 6, 6, 4, 4], drums: 'drive', lead: 0.25, arp: true, bassStyle: 'octave', density: 0.7 },
  tower: { seed: 13, bpm: 96, root: 59, mode: 'harmonic', prog: [0, 0, 5, 5, 3, 3, 4, 4], progB: [5, 3, 0, 4, 5, 3, 1, 4], drums: 'none', lead: 0.125, arp: true, bassStyle: 'pedal', density: 0.45 },
  volcano: { seed: 66, bpm: 150, root: 57, mode: 'harmonic', prog: [0, 5, 3, 4, 0, 5, 6, 4], progB: [3, 4, 5, 4, 3, 4, 6, 4], drums: 'drive', lead: 0.25, arp: true, bassStyle: 'octave', density: 0.8 },
  finale: { seed: 150, bpm: 144, root: 62, mode: 'minor', prog: [0, 5, 2, 6, 0, 5, 3, 4], progB: [5, 6, 0, 4, 5, 6, 4, 4], drums: 'drive', lead: 0.25, arp: true, bassStyle: 'bounce', density: 0.8 },
  boss: { seed: 200, bpm: 168, root: 57, mode: 'harmonic', prog: [0, 0, 5, 4, 0, 0, 5, 6], progB: [3, 4, 3, 4, 5, 6, 4, 4], drums: 'drive', lead: 0.25, arp: true, bassStyle: 'octave', density: 0.85 },
  shop: { seed: 333, bpm: 112, root: 67, mode: 'major', prog: [0, 3, 0, 4, 0, 3, 4, 0], progB: [3, 3, 0, 0, 1, 4, 0, 4], drums: 'soft', lead: 0.125, arp: false, bassStyle: 'walk', density: 0.65, swing: 0.15 },
};

interface Note { t: number; ch: 0 | 1 | 2 | 3; midi: number; dur: number; vol: number; duty?: number; drum?: 'kick' | 'snare' | 'hat' }

export function compose(spec: SongSpec): { notes: Note[]; length: number; step: number } {
  const rng = new Rng(spec.seed * 7919);
  const step = 60 / spec.bpm / 4; // 16th note
  const scale = SCALES[spec.mode];
  const deg = (d: number) => {
    const o = Math.floor(d / 7);
    const i = ((d % 7) + 7) % 7;
    return spec.root + o * 12 + scale[i];
  };
  const notes: Note[] = [];
  const sections = [spec.prog, spec.prog, spec.progB ?? spec.prog, spec.prog];
  // A motif: rhythm (16 steps / 2 bars x 8) and contour offsets reused per phrase
  const makeRhythm = (density: number) => {
    const r: number[] = [];
    for (let i = 0; i < 32; i++) {
      const strong = i % 4 === 0;
      const p = strong ? 0.85 : i % 2 === 0 ? density * 0.7 : density * 0.35;
      r.push(rng.chance(p) ? 1 : 0);
    }
    r[0] = 1;
    return r;
  };
  const motifA = makeRhythm(spec.density ?? 0.6);
  const motifB = makeRhythm((spec.density ?? 0.6) * 0.8);
  let bar = 0;
  let prevDeg = 7 + 2;
  sections.forEach((prog, si) => {
    const isB = si === 2;
    const isLast = si === 3;
    for (let b = 0; b < prog.length; b++, bar++) {
      const chord = prog[b];
      const t0 = bar * 16 * step;
      const chordTones = [chord, chord + 2, chord + 4];
      // ── bass (triangle)
      for (let s = 0; s < 16; s += 2) {
        let d = chord - 7;
        switch (spec.bassStyle) {
          case 'bounce': d = s % 4 === 0 ? chord - 7 : chord - 7 + 4; break;
          case 'octave': d = s % 4 === 0 ? chord - 7 : chord; break;
          case 'walk': d = chord - 7 + [0, 2, 4, 2, 0, 2, 4, 5][s / 2]; break;
          case 'pedal': d = (s % 8 === 0 ? 0 : chord) - 7; break;
        }
        notes.push({ t: t0 + s * step, ch: 2, midi: deg(d) - 12, dur: step * 1.8, vol: 0.5 });
      }
      // ── arpeggio (pulse 2, quiet)
      if (spec.arp) {
        for (let s = 0; s < 16; s++) {
          if (s % 2 && spec.bpm > 130) continue;
          const tone = chordTones[s % 3] + (s % 6 >= 3 ? 7 : 0);
          notes.push({ t: t0 + s * step, ch: 1, midi: deg(tone), dur: step * 0.8, vol: 0.12, duty: 0.125 });
        }
      } else {
        for (let s = 0; s < 16; s += 4) {
          for (const ct of chordTones) notes.push({ t: t0 + s * step, ch: 1, midi: deg(ct + 7), dur: step * 1.5, vol: 0.07, duty: 0.5 });
        }
      }
      // ── melody (pulse 1)
      const motif = isB ? motifB : motifA;
      const half = (b % 2) * 16;
      const variation = isLast && b >= prog.length - 2;
      for (let s = 0; s < 16; s++) {
        if (!motif[half + s] && !(variation && s === 0)) continue;
        let len = 1;
        while (s + len < 16 && !motif[half + s + len] && len < 4) len++;
        // choose a pitch: chord tones on strong beats, stepwise otherwise
        let d: number;
        if (s % 4 === 0) {
          const options = chordTones.map((c) => c + 7).concat(chordTones.map((c) => c + 14));
          d = options.reduce((best, o) => (Math.abs(o - prevDeg) < Math.abs(best - prevDeg) ? o : best), options[0]);
          if (rng.chance(0.25)) d += rng.chance(0.5) ? 2 : -2;
        } else {
          d = prevDeg + rng.pick([-2, -1, -1, 1, 1, 2, 0]);
        }
        d = Math.max(5, Math.min(18, d));
        // final cadence resolves to tonic
        if (variation && b === prog.length - 1 && s === 0) d = 7;
        prevDeg = d;
        const swing = spec.swing && s % 2 ? spec.swing * step : 0;
        notes.push({ t: t0 + s * step + swing, ch: 0, midi: deg(d), dur: step * len * 0.9, vol: 0.22, duty: spec.lead });
        if (variation && b === prog.length - 1) break;
      }
      // ── drums
      for (let s = 0; s < 16; s++) {
        const tt = t0 + s * step;
        switch (spec.drums) {
          case 'march':
            if (s % 8 === 0) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.12, vol: 0.5, drum: 'kick' });
            if (s % 8 === 4) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.1, vol: 0.35, drum: 'snare' });
            if (s % 2 === 0) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.03, vol: 0.12, drum: 'hat' });
            if (s === 14 && b % 4 === 3) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.08, vol: 0.3, drum: 'snare' });
            break;
          case 'drive':
            if (s % 4 === 0) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.12, vol: 0.5, drum: 'kick' });
            if (s % 8 === 4) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.1, vol: 0.38, drum: 'snare' });
            notes.push({ t: tt, ch: 3, midi: 0, dur: 0.025, vol: s % 2 ? 0.07 : 0.13, drum: 'hat' });
            break;
          case 'half':
            if (s === 0) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.14, vol: 0.45, drum: 'kick' });
            if (s === 8) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.1, vol: 0.3, drum: 'snare' });
            if (s % 4 === 2) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.03, vol: 0.08, drum: 'hat' });
            break;
          case 'soft':
            if (s === 0 || s === 10) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.1, vol: 0.3, drum: 'kick' });
            if (s % 4 === 2) notes.push({ t: tt, ch: 3, midi: 0, dur: 0.03, vol: 0.07, drum: 'hat' });
            break;
          default:
            break;
        }
      }
    }
  });
  return { notes, length: bar * 16 * step, step };
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private waves = new Map<number, PeriodicWave>();
  private noise!: AudioBuffer;
  private song: { notes: Note[]; length: number } | null = null;
  private songName = '';
  private songStart = 0;
  private nextIdx = 0;
  private loopCount = 0;
  private timer: number | null = null;
  private lastPlay = new Map<string, number>();
  private pickupCombo = 0;
  private pickupT = 0;
  musicVol = 0.5;
  sfxVol = 0.6;
  private cache = new Map<string, { notes: Note[]; length: number }>();

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.songName) {
      const n = this.songName;
      this.songName = '';
      this.playMusic(n);
    }
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.05);
    this.sfxGain.gain.setTargetAtTime(sfx * 0.7, this.ctx.currentTime, 0.05);
  }

  private pulseWave(duty: number): PeriodicWave {
    const key = Math.round(duty * 1000);
    let w = this.waves.get(key);
    if (w) return w;
    const n = 32;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    w = this.ctx!.createPeriodicWave(real, imag);
    this.waves.set(key, w);
    return w;
  }

  private tone(dest: AudioNode, t: number, freq: number, dur: number, vol: number, type: 'pulse' | 'triangle' | 'sine' | 'sawtooth', duty = 0.5, slideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    if (type === 'pulse') o.setPeriodicWave(this.pulseWave(duty));
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + Math.max(0.006, dur * 0.7));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(dest: AudioNode, t: number, dur: number, vol: number, hp: number, lp = 12000) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 1;
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

  // ─────────────────────────── music ───────────────────────────

  playMusic(name: string) {
    if (name === this.songName) return;
    this.songName = name;
    if (!this.ctx) return;
    const spec = SONGS[name];
    if (!spec) return;
    let song = this.cache.get(name);
    if (!song) {
      song = compose(spec);
      this.cache.set(name, song);
    }
    // quick fade between songs
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0, now);
    this.musicGain.gain.linearRampToValueAtTime(this.musicVol * 0.55, now + 0.4);
    this.song = song;
    this.songStart = now + 0.08;
    this.nextIdx = 0;
    this.loopCount = 0;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 30);
  }

  stopMusic() {
    this.songName = '';
    this.song = null;
  }

  private schedule() {
    if (!this.ctx || !this.song) return;
    const ahead = this.ctx.currentTime + 0.2;
    const song = this.song;
    for (;;) {
      if (this.nextIdx >= song.notes.length) {
        this.nextIdx = 0;
        this.loopCount++;
      }
      const n = song.notes[this.nextIdx];
      const t = this.songStart + this.loopCount * song.length + n.t;
      if (t > ahead) break;
      this.nextIdx++;
      if (t < this.ctx.currentTime - 0.05) continue;
      const dest = this.musicGain;
      if (n.ch === 3) {
        if (n.drum === 'kick') this.tone(dest, t, 140, 0.12, n.vol, 'sine', 0.5, 45);
        else if (n.drum === 'snare') this.noiseHit(dest, t, n.dur, n.vol * 0.7, 1200, 9000);
        else this.noiseHit(dest, t, n.dur, n.vol * 0.6, 7000);
      } else if (n.ch === 2) this.tone(dest, t, midiHz(n.midi), n.dur, n.vol, 'triangle');
      else this.tone(dest, t, midiHz(n.midi), n.dur, n.vol, 'pulse', n.duty ?? 0.5);
    }
  }

  // ─────────────────────────── sfx ───────────────────────────

  private gate(key: string, minGap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(key) ?? -1) < minGap) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  sfx(name: string, arg = 0) {
    if (!this.ctx || this.sfxVol <= 0) return;
    const t = this.ctx.currentTime + 0.005;
    const d = this.sfxGain;
    switch (name) {
      case 'hit':
        if (!this.gate('hit', 0.045)) return;
        this.noiseHit(d, t, 0.05, 0.18, 1500, 6000);
        this.tone(d, t, 300 + Math.random() * 80, 0.05, 0.06, 'pulse', 0.5, 120);
        break;
      case 'super':
        if (!this.gate('super', 0.12)) return;
        this.tone(d, t, 880, 0.06, 0.1, 'pulse', 0.25, 1320);
        this.noiseHit(d, t, 0.08, 0.2, 800, 5000);
        break;
      case 'kill':
        if (!this.gate('kill', 0.05)) return;
        this.tone(d, t, 520, 0.07, 0.07, 'pulse', 0.125, 180);
        break;
      case 'candy': {
        const now = this.ctx.currentTime;
        if (now - this.pickupT > 0.6) this.pickupCombo = 0;
        this.pickupT = now;
        if (!this.gate('candy', 0.035)) return;
        const step = Math.min(this.pickupCombo++, 14);
        this.tone(d, t, midiHz(76 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33][step]), 0.06, 0.07, 'pulse', 0.25);
        break;
      }
      case 'coin':
        if (!this.gate('coin', 0.06)) return;
        this.tone(d, t, 1319, 0.05, 0.08, 'pulse', 0.5);
        this.tone(d, t + 0.05, 1976, 0.12, 0.08, 'pulse', 0.5);
        break;
      case 'heal':
        [72, 76, 79, 84].forEach((m, i) => this.tone(d, t + i * 0.06, midiHz(m), 0.1, 0.09, 'triangle'));
        break;
      case 'hurt':
        if (!this.gate('hurt', 0.12)) return;
        this.tone(d, t, 220, 0.14, 0.16, 'pulse', 0.5, 90);
        this.noiseHit(d, t, 0.1, 0.15, 300, 3000);
        break;
      case 'levelup':
        [67, 71, 74, 79, 83, 86].forEach((m, i) => this.tone(d, t + i * 0.055, midiHz(m), 0.12, 0.12, 'pulse', 0.25));
        this.tone(d, t + 0.33, midiHz(91), 0.35, 0.1, 'pulse', 0.125);
        break;
      case 'evolve':
        for (let i = 0; i < 24; i++) this.tone(d, t + i * 0.11, midiHz(60 + i), 0.1, 0.07, 'pulse', 0.25);
        break;
      case 'evolved':
        [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => this.tone(d, t + i * 0.1, midiHz(m), i === 6 ? 0.6 : 0.12, 0.13, 'pulse', 0.25));
        [48, 55, 60].forEach((m, i) => this.tone(d, t + i * 0.2, midiHz(m), 0.3, 0.2, 'triangle'));
        break;
      case 'chest':
        [60, 64, 67, 72, 67, 72, 76, 79].forEach((m, i) => this.tone(d, t + i * 0.08, midiHz(m + 7), 0.12, 0.12, 'pulse', 0.5));
        break;
      case 'mastery':
        [72, 79, 84, 88, 91, 96].forEach((m, i) => this.tone(d, t + i * 0.09, midiHz(m), 0.25, 0.12, 'pulse', 0.125));
        this.noiseHit(d, t + 0.5, 0.6, 0.15, 4000);
        break;
      case 'boss':
        for (let i = 0; i < 4; i++) this.tone(d, t + i * 0.35, i % 2 ? 330 : 440, 0.3, 0.14, 'sawtooth', 0.5);
        break;
      case 'warn':
        this.tone(d, t, 660, 0.12, 0.1, 'pulse', 0.25);
        this.tone(d, t + 0.15, 660, 0.12, 0.1, 'pulse', 0.25);
        break;
      case 'faint':
        for (let i = 0; i < 8; i++) this.tone(d, t + i * 0.09, midiHz(72 - i * 3), 0.1, 0.12, 'pulse', 0.5);
        break;
      case 'revive':
        [60, 67, 72, 76, 79, 84].forEach((m, i) => this.tone(d, t + i * 0.07, midiHz(m), 0.18, 0.11, 'triangle'));
        break;
      case 'boom':
        if (!this.gate('boom', 0.08)) return;
        this.noiseHit(d, t, 0.35, 0.35, 60, 1800);
        this.tone(d, t, 120, 0.3, 0.2, 'sine', 0.5, 35);
        break;
      case 'shiny':
        [88, 91, 96, 100].forEach((m, i) => this.tone(d, t + i * 0.05, midiHz(m), 0.08, 0.07, 'pulse', 0.125));
        break;
      case 'repel':
        this.noiseHit(d, t, 0.8, 0.3, 200, 8000);
        this.tone(d, t, 880, 0.6, 0.12, 'pulse', 0.5, 110);
        break;
      case 'click':
        this.tone(d, t, 1200, 0.025, 0.06, 'pulse', 0.5);
        break;
      case 'select':
        this.tone(d, t, 988, 0.04, 0.08, 'pulse', 0.25);
        this.tone(d, t + 0.045, 1319, 0.07, 0.08, 'pulse', 0.25);
        break;
      case 'buy':
        [76, 79, 84].forEach((m, i) => this.tone(d, t + i * 0.06, midiHz(m), 0.08, 0.09, 'pulse', 0.5));
        break;
      case 'error':
        this.tone(d, t, 180, 0.15, 0.12, 'pulse', 0.5);
        break;
      case 'victory':
        [67, 67, 67, 72, 76, 74, 76, 79].forEach((m, i) => this.tone(d, t + [0, 0.15, 0.3, 0.45, 0.75, 1.05, 1.2, 1.4][i], midiHz(m), i === 7 ? 0.9 : 0.14, 0.14, 'pulse', 0.25));
        [48, 52, 55, 60].forEach((m, i) => this.tone(d, t + i * 0.45, midiHz(m), 0.45, 0.25, 'triangle'));
        break;
      case 'gameover':
        [67, 66, 65, 64, 60].forEach((m, i) => this.tone(d, t + i * 0.28, midiHz(m - 5), i === 4 ? 0.9 : 0.25, 0.13, 'pulse', 0.5));
        break;
      case 'fire':
        this.fireSfx(arg);
        break;
    }
  }

  /** Per-type attack sounds (arg = type index), throttled per type. */
  private fireSfx(typeIdx: number) {
    if (!this.gate(`fire${typeIdx}`, 0.09)) return;
    const t = this.ctx!.currentTime + 0.005;
    const d = this.sfxGain;
    const v = 0.05;
    switch (typeIdx) {
      case 1: this.noiseHit(d, t, 0.16, v * 2.2, 400, 3500); break; // fire
      case 2: this.tone(d, t, 700, 0.1, v, 'sine', 0.5, 1400); break; // water
      case 3: this.noiseHit(d, t, 0.08, v * 2, 3000); this.tone(d, t, 1800, 0.06, v * 0.7, 'pulse', 0.125, 900); break; // electric
      case 4: this.noiseHit(d, t, 0.07, v * 1.5, 2500, 7000); break; // grass
      case 5: this.tone(d, t, 2200, 0.08, v, 'triangle', 0.5, 2800); break; // ice
      case 6: this.noiseHit(d, t, 0.06, v * 2.5, 200, 2000); break; // fighting
      case 7: this.tone(d, t, 300, 0.12, v, 'pulse', 0.25, 200); break; // poison
      case 8: this.noiseHit(d, t, 0.12, v * 2.5, 60, 900); break; // ground
      case 9: this.noiseHit(d, t, 0.14, v * 1.4, 1500, 6000); break; // flying
      case 10: this.tone(d, t, 500, 0.15, v, 'sine', 0.5, 1000); break; // psychic
      case 13: this.tone(d, t, 400, 0.18, v, 'triangle', 0.5, 250); break; // ghost
      case 14: this.tone(d, t, 160, 0.15, v * 1.4, 'sawtooth', 0.5, 90); break; // dragon
      case 17: this.tone(d, t, 1500, 0.1, v, 'triangle', 0.5, 2000); break; // fairy
      default: this.tone(d, t, 600, 0.05, v, 'pulse', 0.5, 300);
    }
  }
}

export const audio = new AudioEngine();
