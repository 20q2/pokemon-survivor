import { parseMml, TICKS_PER_WHOLE, type MmlNote } from './mml.ts';
import { SONGS, type SongDef } from './songs.ts';
import { SFX, type SfxDef } from './sfx.ts';

export { SONGS };

/**
 * Chiptune engine: hand-composed MML scores (songs.ts) played on a small Game Boy-flavoured
 * synth (two pulse channels with duty cycles, a stepped triangle bass and LFSR noise drums),
 * mixed through per-channel stereo buses and a light room reverb. Sound effects are MML phrases
 * too (sfx.ts) and run through the same voices, envelopes, buses and reverb as the music.
 */

type Ch = 0 | 1 | 2 | 3;
export interface SongEvent extends MmlNote { ch: Ch }
export interface CompiledSong { events: SongEvent[]; length: number; loopTick: number; loopIdx: number; spt: number }

const DUTY = [0.125, 0.25, 0.5, 0.75];
/** Per-channel mix: base gain, stereo pan, reverb send. */
const MIX: { gain: number; pan: number; send: number }[] = [
  { gain: 0.17, pan: -0.18, send: 0.22 },
  { gain: 0.12, pan: 0.24, send: 0.28 },
  { gain: 0.34, pan: 0, send: 0.05 },
  { gain: 0.3, pan: 0.06, send: 0.08 },
];
/** SFX mix: a little drier than the music so effects stay crisp, but sharing the same room. */
const SFX_MIX: { gain: number; pan: number; send: number }[] = [
  { gain: 0.26, pan: -0.08, send: 0.14 },
  { gain: 0.2, pan: 0.12, send: 0.2 },
  { gain: 0.42, pan: 0, send: 0.04 },
  { gain: 0.4, pan: 0, send: 0.06 },
];

const sfxAsSong = (d: SfxDef): SongDef => ({ title: '', bpm: d.bpm, key: [0, 'major'], p1: d.p1 ?? '', p2: d.p2 ?? '', tri: d.tri ?? '', noise: d.noise ?? '' });

export function compileSong(def: SongDef): CompiledSong {
  const tracks = [def.p1, def.p2, def.tri, def.noise].map((src, i) => (src.trim() ? parseMml(src, def.macros, i === 3) : null));
  const length = Math.max(...tracks.map((t) => t?.length ?? 0));
  const loopTick = tracks[0]?.loopTick ?? 0;
  const events: SongEvent[] = [];
  tracks.forEach((t, ch) => t?.notes.forEach((n) => events.push({ ...n, ch: ch as Ch })));
  if (def.echo && tracks[0]) {
    for (const n of tracks[0].notes) {
      let tick = n.tick + def.echo.delay;
      if (tick >= length) tick = loopTick + (tick - length);
      events.push({ ...n, tick, vol: n.vol * def.echo.vol, vib: 0, ch: 1 });
    }
  }
  events.sort((a, b) => a.tick - b.tick || a.ch - b.ch);
  const loopIdx = Math.max(0, events.findIndex((e) => e.tick >= loopTick));
  return { events, length, loopTick, loopIdx, spt: 60 / def.bpm / (TICKS_PER_WHOLE / 4) };
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private waves = new Map<number, PeriodicWave>();
  private noise!: AudioBuffer;
  private metal!: AudioBuffer;
  private buses: GainNode[] = [];
  private sfxBuses: GainNode[] = [];
  /** Dry-ish input for the hand-built effects (hits, per-type attacks): same room as the phrases. */
  private sfxIn!: GainNode;
  private triWave: PeriodicWave | null = null;
  private song: CompiledSong | null = null;
  private songName = '';
  private songStart = 0;
  private nextIdx = 0;
  private pass = 0;
  private timer: number | null = null;
  private lastPlay = new Map<string, number>();
  /** Rises with each candy, drains continuously, so only a burst of pickups climbs the scale. */
  private pickupCombo = 0;
  private pickupT = 0;
  private sfxCache = new Map<string, CompiledSong>();
  musicVol = 0.5;
  sfxVol = 0.6;
  private cache = new Map<string, CompiledSong>();

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.ctx instanceof AudioContext) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.init(new AC());
  }

  /** Render a song with the real synth into a buffer (used for level checks and previews). */
  static async renderOffline(name: string, seconds: number, sampleRate = 44100): Promise<AudioBuffer> {
    const e = new AudioEngine();
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    e.init(ctx);
    e.musicVol = 1;
    e.playMusic(name);
    if (e.timer !== null) { clearInterval(e.timer); e.timer = null; }
    e.scheduleUntil(seconds);
    return ctx.startRendering();
  }

  /** Render one sound effect (or a candy run with `arg` pickups) offline, for level checks. */
  static async renderSfxOffline(name: string, arg = 0, seconds = 3, sampleRate = 44100): Promise<AudioBuffer> {
    const e = new AudioEngine();
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    e.init(ctx);
    e.setVolumes(0, 1);
    if (name === 'candy') {
      // currentTime is frozen before rendering, so fake the pickup clock to space the run out
      for (let i = 0; i < arg; i++) { e.lastPlay.clear(); e.pickupT -= 0.08; e.sfx('candy'); }
    } else e.sfx(name, arg);
    return ctx.startRendering();
  }

  private init(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    // Music: gentle top-end roll-off, then per-channel pan + reverb send.
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 10500;
    this.musicGain.connect(tone).connect(this.master);
    const sfxTone = this.ctx.createBiquadFilter();
    sfxTone.type = 'lowpass';
    sfxTone.frequency.value = 9000;
    this.sfxGain.connect(sfxTone).connect(this.master);
    const verb = this.ctx.createConvolver();
    verb.buffer = this.makeImpulse(1.7);
    const verbOut = this.ctx.createGain();
    verbOut.gain.value = 0.55;
    verb.connect(verbOut).connect(this.musicGain);
    this.buses = MIX.map((m) => {
      const g = this.ctx!.createGain();
      g.gain.value = m.gain;
      const pan = this.ctx!.createStereoPanner();
      pan.pan.value = m.pan;
      const send = this.ctx!.createGain();
      send.gain.value = m.send;
      g.connect(pan).connect(this.musicGain);
      g.connect(send).connect(verb);
      return g;
    });
    const sfxVerb = this.ctx.createConvolver();
    sfxVerb.buffer = this.makeImpulse(1.1);
    const sfxVerbOut = this.ctx.createGain();
    sfxVerbOut.gain.value = 0.6;
    sfxVerb.connect(sfxVerbOut).connect(this.sfxGain);
    this.sfxBuses = SFX_MIX.map((m) => {
      const g = this.ctx!.createGain();
      g.gain.value = m.gain;
      const pan = this.ctx!.createStereoPanner();
      pan.pan.value = m.pan;
      const send = this.ctx!.createGain();
      send.gain.value = m.send;
      g.connect(pan).connect(this.sfxGain);
      g.connect(send).connect(sfxVerb);
      return g;
    });
    this.sfxIn = this.ctx.createGain();
    this.sfxIn.gain.value = 1;
    const inSend = this.ctx.createGain();
    inSend.gain.value = 0.12;
    this.sfxIn.connect(this.sfxGain);
    this.sfxIn.connect(inSend).connect(sfxVerb);
    this.setVolumes(this.musicVol, this.sfxVol);
    this.noise = this.lfsrNoise(false);
    this.metal = this.lfsrNoise(true);
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
    const n = 64;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    w = this.ctx!.createPeriodicWave(real, imag);
    this.waves.set(key, w);
    return w;
  }

  /** A one-off chip tone with an optional pitch sweep (pulse, or the stepped triangle). */
  private tone(dest: AudioNode, t: number, freq: number, dur: number, vol: number, type: 'pulse' | 'triangle', duty = 0.5, slideTo?: number) {
    const ctx = this.ctx!;
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

  private noiseHit(dest: AudioNode, t: number, dur: number, vol: number, hp: number, lp = 12000, metal = false) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = metal ? this.metal : this.noise;
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

  /** Game Boy-style noise: a 15-bit LFSR (or the short 7-bit "metallic" mode), held a few samples per step. */
  private lfsrNoise(short: boolean): AudioBuffer {
    const ctx = this.ctx!;
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

  /** Small stereo room: exponentially decaying noise with a short pre-delay. */
  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const pre = Math.floor(ctx.sampleRate * 0.018);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - pre) / (len - pre), 3.2);
    }
    return buf;
  }

  /** NES-like 4-bit stepped triangle: a little grit that reads well on small speakers. */
  private triangleWave(): PeriodicWave {
    if (this.triWave) return this.triWave;
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
    this.triWave = this.ctx!.createPeriodicWave(real, imag);
    return this.triWave;
  }

  playMusic(name: string) {
    if (name === this.songName) return;
    this.songName = name;
    if (!this.ctx) return;
    const def = SONGS[name];
    if (!def) return;
    let song = this.cache.get(name);
    if (!song) {
      song = compileSong(def);
      this.cache.set(name, song);
    }
    // quick fade between songs
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0, now);
    this.musicGain.gain.linearRampToValueAtTime(this.musicVol * 0.55, now + 0.4);
    this.song = song;
    this.songStart = now + 0.1;
    this.nextIdx = 0;
    this.pass = 0;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.songName = '';
    this.song = null;
  }

  private schedule() {
    if (this.ctx) this.scheduleUntil(this.ctx.currentTime + 0.25);
  }

  private scheduleUntil(ahead: number) {
    if (!this.ctx || !this.song) return;
    const song = this.song;
    for (let guard = 0; guard < 200000; guard++) {
      if (this.nextIdx >= song.events.length) {
        this.nextIdx = song.loopIdx;
        this.pass++;
      }
      const ev = song.events[this.nextIdx];
      const offset = this.pass === 0 ? 0 : song.length + (this.pass - 1) * (song.length - song.loopTick) - song.loopTick;
      const t = this.songStart + (offset + ev.tick) * song.spt;
      if (t > ahead) break;
      this.nextIdx++;
      if (t < this.ctx.currentTime - 0.03) continue;
      this.voice(ev, t, song.spt, this.buses[ev.ch]);
    }
  }

  /** Play one score event on a chip voice. Shared by the music and the sound-effect phrases. */
  private voice(ev: SongEvent, t: number, spt: number, bus: AudioNode, transpose = 0, volMul = 1) {
    const ctx = this.ctx!;
    const dur = ev.dur * spt;
    if (ev.ch === 3) return this.drum(bus, ev.drum!, t, ev.vol * volMul);
    const o = ctx.createOscillator();
    const midi = transpose ? ev.midi.map((m) => m + transpose) : ev.midi;
    const hz = midiHz(midi[0]);
    if (ev.ch === 2) o.setPeriodicWave(this.triangleWave());
    else o.setPeriodicWave(this.pulseWave(DUTY[ev.duty] ?? 0.5));
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
    const rel = ev.ch === 2 ? 0.012 : 0.03;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    // envelopes: E1 plucked decay, E2 soft decay to a sustain, E0 organ
    const end = ev.ch !== 2 && ev.env === 1 ? peak * Math.exp(-Math.max(0, dur - 0.01) / 0.13) * 0.92 + peak * 0.08
      : ev.ch !== 2 && ev.env === 2 ? peak * 0.62 + peak * 0.38 * Math.exp(-Math.max(0, dur - 0.02) / 0.16)
      : peak;
    if (end !== peak) g.gain.exponentialRampToValueAtTime(Math.max(0.0005, end), t + Math.max(0.005, dur));
    else g.gain.setValueAtTime(peak, t + Math.max(0.005, dur));
    g.gain.linearRampToValueAtTime(0, t + dur + rel);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + rel + 0.02);
  }

  private drum(bus: AudioNode, d: string, t: number, vol: number) {
    switch (d) {
      case 'k':
        this.tone(bus, t, 160, 0.13, vol * 0.9, 'triangle', 0.5, 42);
        this.noiseHit(bus, t, 0.012, vol * 0.25, 1500, 8000);
        break;
      case 's':
        this.noiseHit(bus, t, 0.14, vol * 0.65, 1300, 9500);
        this.tone(bus, t, 200, 0.06, vol * 0.35, 'triangle', 0.5, 150);
        break;
      case 'h': this.noiseHit(bus, t, 0.035, vol * 0.45, 7500, 16000, true); break;
      case 'p': this.noiseHit(bus, t, 0.16, vol * 0.4, 6500, 16000, true); break;
      case 'x': this.noiseHit(bus, t, 0.8, vol * 0.45, 3500, 15000); break;
      case 't': this.tone(bus, t, 230, 0.16, vol * 0.75, 'triangle', 0.5, 105); break;
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

  /** Play a scored effect from sfx.ts on the chip voices, optionally transposed (semitones). */
  private phrase(name: string, transpose = 0, volMul = 1) {
    const def = SFX[name];
    if (!def || !this.ctx) return;
    let song = this.sfxCache.get(name);
    if (!song) {
      song = compileSong(sfxAsSong(def));
      this.sfxCache.set(name, song);
    }
    const t0 = this.ctx.currentTime + 0.005;
    const v = (def.vol ?? 1) * volMul;
    for (const ev of song.events) this.voice(ev, t0 + ev.tick * song.spt, song.spt, this.sfxBuses[ev.ch], transpose, v);
  }

  sfx(name: string, arg = 0) {
    if (!this.ctx || this.sfxVol <= 0) return;
    const t = this.ctx.currentTime + 0.005;
    const d = this.sfxIn;
    switch (name) {
      case 'hit':
        if (!this.gate('hit', 0.05)) return;
        this.noiseHit(d, t, 0.045, 0.14, 1400, 5500);
        this.tone(d, t, 260 + Math.random() * 60, 0.05, 0.05, 'pulse', 0.5, 110);
        break;
      case 'super':
        if (!this.gate('super', 0.12)) return;
        this.noiseHit(d, t, 0.07, 0.16, 900, 5000);
        this.tone(d, t, midiHz(76), 0.07, 0.07, 'pulse', 0.25, midiHz(83));
        break;
      case 'kill':
        if (!this.gate('kill', 0.06)) return;
        this.tone(d, t, midiHz(69 + ((Math.random() * 3) | 0)), 0.08, 0.08, 'pulse', 0.125, midiHz(57));
        this.noiseHit(d, t, 0.03, 0.06, 2500, 8000, true);
        break;
      case 'candy': {
        // A soft pluck on a pentatonic ladder. The combo drains ~5 steps a second, so a steady
        // trickle of candies stays near the bottom and only a real burst climbs, and it tops out
        // a little over an octave up instead of shrieking.
        const now = this.ctx.currentTime;
        this.pickupCombo = Math.max(0, this.pickupCombo - (now - this.pickupT) * 5);
        this.pickupT = now;
        if (!this.gate('candy', 0.055)) return;
        const LADDER = [0, 2, 4, 7, 9, 12, 14, 16];
        const step = Math.min(LADDER.length - 1, Math.floor(this.pickupCombo));
        this.pickupCombo = Math.min(LADDER.length + 1, this.pickupCombo + 1);
        const vol = 0.085 * (1 - step * 0.05);
        this.tone(d, t, midiHz(67 + LADDER[step]), 0.07, vol, 'pulse', 0.125);
        this.tone(d, t, midiHz(55 + LADDER[step]), 0.05, vol * 0.6, 'triangle');
        break;
      }
      case 'coin':
        if (!this.gate('coin', 0.07)) return;
        this.phrase('coin');
        break;
      case 'hurt':
        if (!this.gate('hurt', 0.12)) return;
        this.phrase('hurt');
        break;
      case 'boom':
        if (!this.gate('boom', 0.08)) return;
        this.noiseHit(d, t, 0.35, 0.3, 60, 1600);
        this.tone(d, t, 140, 0.3, 0.22, 'triangle', 0.5, 40);
        break;
      case 'raid':
        // A rising siren as a big attack winds up (arg 1 = boss-sized: lower, louder).
        if (!this.gate('raid', 0.3)) return;
        this.phrase('raid', arg ? -7 : 0, arg ? 1.2 : 0.8);
        break;
      case 'wobble': this.phrase('wobble', arg * 2); break;
      case 'pop': this.phrase('pop', arg * 2); break;
      case 'tick':
        if (!this.gate('tick', 0.03)) return;
        this.phrase('tick', Math.round(arg));
        break;
      case 'ding': this.phrase('ding', arg * 2); break;
      case 'reveal': this.phrase('reveal', arg * 2, 0.8 + arg * 0.1); break;
      case 'fire':
        this.fireSfx(arg);
        break;
      default:
        this.phrase(name);
    }
  }

  /** Per-type attack sounds (arg = type index), throttled per type. Chip waveforms only. */
  private fireSfx(typeIdx: number) {
    if (!this.gate(`fire${typeIdx}`, 0.09)) return;
    const t = this.ctx!.currentTime + 0.005;
    const d = this.sfxIn;
    const v = 0.045;
    switch (typeIdx) {
      case 1: this.noiseHit(d, t, 0.16, v * 2.2, 400, 3200); break; // fire: roar
      case 2: this.tone(d, t, midiHz(72), 0.1, v, 'triangle', 0.5, midiHz(84)); break; // water: bloop up
      case 3: this.noiseHit(d, t, 0.07, v * 1.8, 3000, 10000, true); this.tone(d, t, 1800, 0.05, v * 0.6, 'pulse', 0.125, 900); break; // electric: zap
      case 4: this.noiseHit(d, t, 0.07, v * 1.4, 2500, 7000); break; // grass: rustle
      case 5: this.tone(d, t, midiHz(91), 0.08, v * 0.8, 'pulse', 0.125, midiHz(96)); break; // ice: glint
      case 6: this.noiseHit(d, t, 0.06, v * 2.4, 200, 2000); break; // fighting: thump
      case 7: this.tone(d, t, midiHz(55), 0.12, v, 'pulse', 0.25, midiHz(50)); break; // poison: blub
      case 8: this.noiseHit(d, t, 0.12, v * 2.4, 60, 900); break; // ground: rumble
      case 9: this.noiseHit(d, t, 0.14, v * 1.3, 1500, 6000); break; // flying: whoosh
      case 10: this.tone(d, t, midiHz(71), 0.15, v, 'triangle', 0.5, midiHz(83)); break; // psychic: swell
      case 13: this.tone(d, t, midiHz(67), 0.18, v, 'triangle', 0.5, midiHz(59)); break; // ghost: droop
      case 14: this.tone(d, t, midiHz(43), 0.15, v * 1.3, 'pulse', 0.125, midiHz(36)); break; // dragon: growl
      case 17: this.tone(d, t, midiHz(88), 0.1, v * 0.8, 'triangle', 0.5, midiHz(93)); break; // fairy: twinkle
      default: this.tone(d, t, midiHz(74), 0.05, v, 'pulse', 0.5, midiHz(62));
    }
  }
}

export const audio = new AudioEngine();
