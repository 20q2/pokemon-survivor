import { chip, compileSong, type CompiledSong } from './score.ts';
import { INSTRUMENTS, type Inst } from './instruments.ts';
import { midiHz, Synth } from './synth.ts';
import { SONGS } from './songs.ts';
import { SFX, type SfxDef } from './sfx.ts';

export { SONGS, compileSong };

/**
 * Music and sound effects. Songs are multi-track MML scores (songs/*.ts) played on the voices in
 * synth.ts: chip voices for the classic set and the sound effects, synth and FM voices and a
 * drum machine for the rest. Each song gets its own rack: per-track buses (level, drive,
 * sidechain pump, pan) sending to a reverb and a tempo-synced ping-pong delay.
 */

/** ±7% random pitch for sounds that fire constantly, so repetition doesn't fatigue. `rand01` is in [0, 1). */
export const JITTER = 0.07;
export const jitterHz = (hz: number, rand01: number) => hz * (1 + (rand01 * 2 - 1) * JITTER);

/** SFX mix: a little drier than the music so effects stay crisp, but sharing a room. */
const SFX_MIX: { gain: number; pan: number; send: number }[] = [
  { gain: 0.26, pan: -0.08, send: 0.14 },
  { gain: 0.2, pan: 0.12, send: 0.2 },
  { gain: 0.42, pan: 0, send: 0.04 },
  { gain: 0.4, pan: 0, send: 0.06 },
];

const sfxAsSong = (d: SfxDef) => chip({ title: '', bpm: d.bpm, key: [0, 'major'], p1: d.p1, p2: d.p2, tri: d.tri, noise: d.noise });

/** Pentatonic semitone offsets for the kill streak; the top (a 12th up) stays near 1.2 kHz. */
export const KILL_LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19];
/**
 * A combo that each use raises by 1 and that drains `drainPerSec` steps a second, so only a burst
 * climbs the rungs. `step(now)` drains, stamps the time, returns the current rung (clamped to the
 * top) and then advances the combo. Draining is linear in time, so calling it only for sounds that
 * pass the gate is the same as calling it for every event.
 */
export class Ladder {
  combo = 0;
  private last = 0;
  readonly steps: number;
  readonly drainPerSec: number;
  constructor(steps: number, drainPerSec: number) { this.steps = steps; this.drainPerSec = drainPerSec; }
  step(now: number): number {
    this.combo = Math.max(0, this.combo - Math.max(0, now - this.last) * this.drainPerSec);
    this.last = now;
    const rung = Math.min(this.steps - 1, Math.floor(this.combo));
    this.combo = Math.min(this.steps + 1, this.combo + 1);
    return rung;
  }
}

/** Candy drains ~5 steps/s: a steady trickle stays near the bottom and only a real burst climbs. */
const CANDY_LADDER = [0, 2, 4, 7, 9, 12, 14, 16];
/**
 * Kills drain 2.5 steps/s. Kills closer than 1/2.5 = 0.4 s apart climb (slowly near 0.4 s, fast
 * near the 0.06 s gate), slower ones hold at the bottom, and a 1 s lull drops 2.5 steps.
 */
const KILL_DRAIN = 2.5;

interface TrackBus { input: GainNode; mute: GainNode; pump: GainNode | null; depth: number; inst: Inst }
/** One song's buses and effects; the previous rack is torn down once its last notes have rung out. */
interface Rack { buses: TrackBus[]; nodes: AudioNode[]; beat: number }

export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  /** Offline renders switch this on so level checks are repeatable. */
  deterministic = false;
  private syn!: Synth;
  private master!: GainNode;
  private musicIn!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private sfxBuses: GainNode[] = [];
  /** Dry-ish input for the hand-built effects (hits, per-type attacks): same room as the phrases. */
  private sfxIn!: GainNode;
  /** The music after its volume, for the sound test's visualiser. */
  analyser: AnalyserNode | null = null;
  private song: CompiledSong | null = null;
  private songName = '';
  private startTick = 0;
  private songStart = 0;
  private nextIdx = 0;
  private pass = 0;
  private timer: number | null = null;
  private rack: Rack | null = null;
  private lastPlay = new Map<string, number>();
  private candyLadder = new Ladder(CANDY_LADDER.length, 5);
  private killLadder = new Ladder(KILL_LADDER.length, KILL_DRAIN);
  /** Added to currentTime for the ladders; offline renders advance it since the context clock is frozen. */
  private clockSkew = 0;
  private sfxCache = new Map<string, CompiledSong>();
  private cache = new Map<string, CompiledSong>();
  musicVol = 0.5;
  sfxVol = 0.6;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.ctx instanceof AudioContext) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.init(new AC());
  }

  /** Render a song with the real synth into a buffer (level checks, previews); optionally from a tick, with tracks muted. */
  static async renderOffline(name: string, seconds: number, sampleRate = 44100, at = 0, mute: number[] = []): Promise<AudioBuffer> {
    const e = new AudioEngine();
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    e.init(ctx);
    e.setVolumes(1, e.sfxVol);
    e.playMusic(name, at);
    for (const tr of mute) e.setMute(tr, true);
    // Schedule a quarter second ahead at a time, as live playback does, so the graph only ever
    // holds the notes that are about to sound (render speed then reflects the live CPU cost).
    const step = 0.25;
    e.scheduleUntil(step + 0.1);
    for (let t = step; t < seconds; t += step) {
      void ctx.suspend(t).then(() => { e.scheduleUntil(t + step + 0.1); void ctx.resume(); });
    }
    return ctx.startRendering();
  }

  /** Render one sound effect (or a candy run with `arg` pickups) offline, for level checks. */
  static async renderSfxOffline(name: string, arg = 0, seconds = 3, sampleRate = 44100): Promise<AudioBuffer> {
    const e = new AudioEngine();
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    e.deterministic = true;
    e.init(ctx);
    e.setVolumes(0, 1);
    if (name === 'candy' || name === 'kill') {
      // currentTime is frozen before rendering, so step the ladder clock to space the run out
      const gap = name === 'candy' ? 0.08 : 1 / 60; // a candy burst, or a 60 kills/s mow
      // arg 0 (the level-check script's default) still means "one sound", not silence.
      for (let i = 0; i < Math.max(1, arg); i++) { e.lastPlay.clear(); e.clockSkew += gap; e.sfx(name); }
    } else e.sfx(name, arg);
    return ctx.startRendering();
  }

  private init(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.syn = new Synth(ctx);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    // Music: every track sums into musicIn, then volume, a gentle top-end roll-off and the analyser.
    this.musicIn = ctx.createGain();
    this.musicGain = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 12000;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.7;
    this.musicIn.connect(this.musicGain).connect(tone).connect(this.analyser).connect(this.master);

    this.sfxGain = ctx.createGain();
    const sfxTone = ctx.createBiquadFilter();
    sfxTone.type = 'lowpass';
    sfxTone.frequency.value = 9000;
    this.sfxGain.connect(sfxTone).connect(this.master);
    const sfxVerb = ctx.createConvolver();
    sfxVerb.buffer = this.syn.impulse(1.1);
    const sfxVerbOut = ctx.createGain();
    sfxVerbOut.gain.value = 0.6;
    sfxVerb.connect(sfxVerbOut).connect(this.sfxGain);
    this.sfxBuses = SFX_MIX.map((m) => {
      const g = ctx.createGain();
      g.gain.value = m.gain;
      const pan = ctx.createStereoPanner();
      pan.pan.value = m.pan;
      const send = ctx.createGain();
      send.gain.value = m.send;
      g.connect(pan).connect(this.sfxGain);
      g.connect(send).connect(sfxVerb);
      return g;
    });
    this.sfxIn = ctx.createGain();
    const inSend = ctx.createGain();
    inSend.gain.value = 0.12;
    this.sfxIn.connect(this.sfxGain);
    this.sfxIn.connect(inSend).connect(sfxVerb);
    this.setVolumes(this.musicVol, this.sfxVol);
    if (this.songName) {
      const n = this.songName;
      this.songName = '';
      this.playMusic(n, this.startTick);
    }
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.05);
    this.sfxGain.gain.setTargetAtTime(sfx * 0.7, this.ctx.currentTime, 0.05);
  }

  // ─────────────────────────── music ───────────────────────────

  /** The compiled score for a song name (cached), or null if there is no such song. */
  compiled(name: string): CompiledSong | null {
    let song = this.cache.get(name);
    if (!song) {
      const def = SONGS[name];
      if (!def) return null;
      song = compileSong(def);
      this.cache.set(name, song);
    }
    return song;
  }

  /** Builds the song's buses: level → drive → pump → mute → pan → mix, with reverb and delay sends after the mute. */
  private buildRack(song: CompiledSong): Rack {
    const ctx = this.ctx!;
    const def = song.def;
    const beat = 60 / def.bpm;
    const nodes: AudioNode[] = [];
    const node = <T extends AudioNode>(n: T) => { nodes.push(n); return n; };
    const out = node(ctx.createGain());
    out.gain.value = def.level ?? 1;
    out.connect(this.musicIn);

    const verb = node(ctx.createConvolver());
    verb.buffer = this.syn.impulse(def.room ?? 1.7);
    const verbOut = node(ctx.createGain());
    verbOut.gain.value = 0.5;
    verb.connect(verbOut).connect(out);

    // ping-pong delay: a left repeat, then a right one, fed back through a darkening filter
    const dIn = node(ctx.createGain());
    const time = beat * (def.delayBeats ?? 0.75);
    const dl = node(ctx.createDelay(4)), dr = node(ctx.createDelay(4));
    dl.delayTime.value = time;
    dr.delayTime.value = time;
    const fb = node(ctx.createGain());
    fb.gain.value = 0.38;
    const damp = node(ctx.createBiquadFilter());
    damp.type = 'lowpass';
    damp.frequency.value = 4200;
    const pl = node(ctx.createStereoPanner()), pr = node(ctx.createStereoPanner());
    pl.pan.value = -0.75;
    pr.pan.value = 0.75;
    const dOut = node(ctx.createGain());
    dOut.gain.value = 0.6;
    dIn.connect(dl);
    dl.connect(dr);
    dr.connect(damp).connect(fb).connect(dl);
    dl.connect(pl).connect(dOut);
    dr.connect(pr).connect(dOut);
    dOut.connect(out);

    const buses = def.tracks.map((t): TrackBus => {
      const inst = INSTRUMENTS[t.inst];
      const input = node(ctx.createGain());
      input.gain.value = t.gain ?? 1;
      let head: AudioNode = input;
      if (t.drive) {
        const pre = node(ctx.createGain());
        pre.gain.value = 1 + t.drive * 1.5;
        const shaper = node(ctx.createWaveShaper());
        shaper.curve = Synth.driveCurve();
        shaper.oversample = '2x';
        const post = node(ctx.createGain());
        post.gain.value = 1.3 / (1 + t.drive * 1.5);
        head = head.connect(pre).connect(shaper).connect(post);
      }
      let pump: GainNode | null = null;
      if (t.pump) { pump = node(ctx.createGain()); head = head.connect(pump); }
      const mute = node(ctx.createGain());
      head.connect(mute);
      const pan = node(ctx.createStereoPanner());
      pan.pan.value = t.pan ?? 0;
      mute.connect(pan).connect(out);
      const vs = node(ctx.createGain());
      vs.gain.value = t.verb ?? 0.12;
      mute.connect(vs).connect(verb);
      if (t.delay) {
        const ds = node(ctx.createGain());
        ds.gain.value = t.delay;
        mute.connect(ds).connect(dIn);
      }
      return { input, mute, pump, depth: t.pump ?? 0, inst };
    });
    return { buses, nodes, beat };
  }

  /** Start a song (from `at` ticks in, for the sound test). The same song keeps playing unless `at` is given. */
  playMusic(name: string, at?: number) {
    if (name === this.songName && at === undefined) return;
    this.songName = name;
    this.startTick = at ?? 0;
    if (!this.ctx) return;
    const song = this.compiled(name);
    if (!song) return;
    // quick fade between songs
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0, now);
    this.musicGain.gain.linearRampToValueAtTime(this.musicVol * 0.55, now + 0.4);
    this.retireRack();
    this.rack = this.buildRack(song);
    this.song = song;
    this.songStart = now + 0.1 - this.startTick * song.spt;
    const idx = song.events.findIndex((e) => e.tick >= this.startTick);
    this.nextIdx = idx < 0 ? song.events.length : idx;
    this.pass = 0;
    if (this.timer === null && this.ctx instanceof AudioContext) this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.songName = '';
    this.song = null;
    this.retireRack();
  }

  /** Disconnect the old rack once anything already scheduled on it has rung out. */
  private retireRack() {
    const old = this.rack;
    this.rack = null;
    if (old && this.ctx instanceof AudioContext) setTimeout(() => old.nodes.forEach((n) => n.disconnect()), 4000);
  }

  /** The playing song and its position in ticks (following the loop), or null. */
  nowPlaying(): { name: string; song: CompiledSong; tick: number } | null {
    if (!this.ctx || !this.song) return null;
    const s = this.song;
    const el = Math.max(0, (this.ctx.currentTime - this.songStart) / s.spt);
    const tick = el < s.length ? el : s.loopTick + ((el - s.length) % Math.max(1, s.length - s.loopTick));
    return { name: this.songName, song: s, tick };
  }

  /** Silence one track of the playing song (sound test). */
  setMute(track: number, on: boolean) {
    const b = this.rack?.buses[track];
    if (b && this.ctx) b.mute.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.01);
  }

  private schedule() {
    if (this.ctx) this.scheduleUntil(this.ctx.currentTime + 0.25);
  }

  private scheduleUntil(ahead: number) {
    if (!this.ctx || !this.song || !this.rack || !this.song.events.length) return;
    const song = this.song;
    const rack = this.rack;
    for (let guard = 0; guard < 400000; guard++) {
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
      const bus = rack.buses[ev.tr];
      this.syn.play(ev, bus.inst, t, song.spt, bus.input);
      if ((ev.drum === 'k' || ev.drum === 'i') && bus.inst.kind === 'kit') this.duck(rack, t);
    }
  }

  /** Sidechain: every kick pulls the pumped tracks down and lets them swell back over about half a beat. */
  private duck(rack: Rack, t: number) {
    for (const b of rack.buses) {
      if (!b.pump) continue;
      b.pump.gain.setTargetAtTime(1 - b.depth, t, 0.004);
      b.pump.gain.setTargetAtTime(1, t + 0.03, rack.beat * 0.16);
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

  jitter(hz: number) { return this.deterministic ? hz : jitterHz(hz, Math.random()); }

  /** The same jitter as a transpose in (fractional) semitones, for MML phrases. */
  private jitterSemis() { return 12 * Math.log2(this.jitter(1)); }

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
    for (const ev of song.events) {
      this.syn.play(ev, INSTRUMENTS[song.def.tracks[ev.tr].inst], t0 + ev.tick * song.spt, song.spt, this.sfxBuses[ev.tr], transpose, v);
    }
  }

  sfx(name: string, arg = 0) {
    if (!this.ctx || this.sfxVol <= 0) return;
    const t = this.ctx.currentTime + 0.005;
    const d = this.sfxIn;
    const syn = this.syn;
    switch (name) {
      case 'hit':
        if (!this.gate('hit', 0.05)) return;
        syn.noiseHit(d, t, 0.045, 0.14, 1400, 5500);
        syn.tone(d, t, this.jitter(260 + Math.random() * 60), 0.05, 0.05, 'pulse', 0.5, 110);
        break;
      case 'super':
        if (!this.gate('super', 0.12)) return;
        syn.noiseHit(d, t, 0.07, 0.16, 900, 5000);
        { const j = this.jitter(1); syn.tone(d, t, midiHz(76) * j, 0.07, 0.07, 'pulse', 0.25, midiHz(83) * j); }
        break;
      case 'crit': {
        // sparkle layered over the normal hit: two quick high pings a fifth apart
        if (!this.gate('crit', 0.08)) return;
        syn.tone(d, t, midiHz(93), 0.05, 0.045, 'pulse', 0.125);
        syn.tone(d, t + 0.035, midiHz(100), 0.07, 0.04, 'pulse', 0.125, midiHz(103));
        break;
      }
      case 'kill': {
        // The ladder advances once per kill sound that actually plays: ~16 steps/s at the 0.06 s
        // gate, which still climbs audibly in a 60 kills/s mow.
        if (!this.gate('kill', 0.06)) return;
        const step = this.killLadder.step(this.ctx.currentTime + this.clockSkew);
        const midi = 67 + KILL_LADDER[step];
        const vol = 0.08 * (1 - step * 0.06);
        syn.tone(d, t, midiHz(midi), 0.08, vol, 'pulse', 0.125, midiHz(midi - 12));
        syn.noiseHit(d, t, 0.03, 0.06 * (1 - step * 0.06), 2500, 8000, true);
        break;
      }
      case 'candy': {
        // A soft pluck on a pentatonic ladder that tops out a little over an octave up instead of shrieking.
        if (!this.gate('candy', 0.055)) return;
        const step = this.candyLadder.step(this.ctx.currentTime + this.clockSkew);
        const vol = 0.085 * (1 - step * 0.05);
        // Jitter the final Hz only; the ladder rung stays exact. One factor keeps the two voices in tune.
        const j = this.jitter(1);
        syn.tone(d, t, midiHz(67 + CANDY_LADDER[step]) * j, 0.07, vol, 'pulse', 0.125);
        syn.tone(d, t, midiHz(55 + CANDY_LADDER[step]) * j, 0.05, vol * 0.6, 'triangle');
        break;
      }
      case 'coin':
        if (!this.gate('coin', 0.07)) return;
        this.phrase('coin', this.jitterSemis());
        break;
      case 'hurt':
        if (!this.gate('hurt', 0.12)) return;
        this.phrase('hurt');
        break;
      case 'boom':
        if (!this.gate('boom', 0.08)) return;
        syn.noiseHit(d, t, 0.35, 0.3, 60, 1600);
        { const j = this.jitter(1); syn.tone(d, t, 140 * j, 0.3, 0.22, 'triangle', 0.5, 40 * j); }
        break;
      case 'raid':
        // A rising siren as a big attack winds up (arg 1 = boss-sized: lower, louder).
        if (!this.gate('raid', 0.3)) return;
        this.phrase('raid', arg ? -7 : 0, arg ? 1.2 : 0.8);
        break;
      case 'wobble': this.phrase('wobble', arg * 2); break;
      case 'pop': this.phrase('pop', arg * 2 + this.jitterSemis()); break;
      case 'tick':
        if (!this.gate('tick', 0.03)) return;
        this.phrase('tick', Math.round(arg) + this.jitterSemis());
        break;
      case 'ding': this.phrase('ding', arg * 2); break;
      // arg = steps already taken in a level-up cascade (capped by CascadeTracker): one semitone each.
      case 'levelup': this.phrase('levelup', Math.max(0, Math.round(arg))); break;
      // arg = number of rewards in the chest.
      case 'reveal': this.phrase(arg >= 5 ? 'reveal5' : arg >= 3 ? 'reveal3' : 'reveal1'); break;
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
    const syn = this.syn;
    const v = 0.045;
    const j = this.jitter(1);
    switch (typeIdx) {
      case 1: syn.noiseHit(d, t, 0.16, v * 2.2, 400, 3200); break; // fire: roar
      case 2: syn.tone(d, t, midiHz(72) * j, 0.1, v, 'triangle', 0.5, midiHz(84) * j); break; // water: bloop up
      case 3: syn.noiseHit(d, t, 0.07, v * 1.8, 3000, 10000, true); syn.tone(d, t, 1800 * j, 0.05, v * 0.6, 'pulse', 0.125, 900 * j); break; // electric: zap
      case 4: syn.noiseHit(d, t, 0.07, v * 1.4, 2500, 7000); break; // grass: rustle
      case 5: syn.tone(d, t, midiHz(91) * j, 0.08, v * 0.8, 'pulse', 0.125, midiHz(96) * j); break; // ice: glint
      case 6: syn.noiseHit(d, t, 0.06, v * 2.4, 200, 2000); break; // fighting: thump
      case 7: syn.tone(d, t, midiHz(55) * j, 0.12, v, 'pulse', 0.25, midiHz(50) * j); break; // poison: blub
      case 8: syn.noiseHit(d, t, 0.12, v * 2.4, 60, 900); break; // ground: rumble
      case 9: syn.noiseHit(d, t, 0.14, v * 1.3, 1500, 6000); break; // flying: whoosh
      case 10: syn.tone(d, t, midiHz(71) * j, 0.15, v, 'triangle', 0.5, midiHz(83) * j); break; // psychic: swell
      case 13: syn.tone(d, t, midiHz(67) * j, 0.18, v, 'triangle', 0.5, midiHz(59) * j); break; // ghost: droop
      case 14: syn.tone(d, t, midiHz(43) * j, 0.15, v * 1.3, 'pulse', 0.125, midiHz(36) * j); break; // dragon: growl
      case 17: syn.tone(d, t, midiHz(88) * j, 0.1, v * 0.8, 'triangle', 0.5, midiHz(93) * j); break; // fairy: twinkle
      default: syn.tone(d, t, midiHz(74) * j, 0.05, v, 'pulse', 0.5, midiHz(62) * j);
    }
  }
}

export const audio = new AudioEngine();
