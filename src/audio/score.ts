import { parseMml, TICKS_PER_WHOLE, type MmlNote } from './mml.ts';
import { isKitInst, type InstName } from './instruments.ts';

export type Mode = 'major' | 'minor' | 'harmonic' | 'dorian' | 'mixolydian' | 'phrygian';

export interface TrackDef {
  /** Shown in the sound test. */
  name: string;
  inst: InstName;
  mml: string;
  /** The tests check the lead for key and range, and lead against bass on strong beats. */
  role?: 'lead' | 'bass';
  /** Bus level (multiplies the instrument's own), stereo pan, reverb and delay sends. */
  gain?: number;
  pan?: number;
  verb?: number;
  delay?: number;
  /** Sidechain: duck this track by this much (0..1) on every kick. */
  pump?: number;
  /** Waveshaper drive on the track (1 = gentle, 4 = filthy). */
  drive?: number;
}

export interface SongDef {
  title: string;
  bpm: number;
  /** Tonic pitch class (0 = C) and mode, used by the tests to keep melodies in key. */
  key: [number, Mode];
  macros?: Record<string, string>;
  tracks: TrackDef[];
  /** A quieter, delayed copy of one track on another (the classic chip "echo" trick). */
  echo?: { delay: number; vol: number; from?: number; to?: number };
  /** Named markers for the sound test (tick = start of the section). */
  sections?: { name: string; tick: number }[];
  /** One line about the piece, for the sound test. */
  about?: string;
  /** Output level of the whole song (the synth soundtrack is trimmed to sit with the sound effects). */
  level?: number;
  /** Reverb length in seconds, and the delay time in beats. */
  room?: number;
  delayBeats?: number;
  /** Arrangement errors found while building (bad lengths, unknown tracks); the tests require none. */
  problems?: string[];
}

// ─────────────────────────── arrangement helper ───────────────────────────

export interface TrackSpec extends Omit<TrackDef, 'mml'> {
  /** Prepended to every section of this track (octave, volume, duty…). */
  init?: string;
}

export interface Section { name: string; bars: number; loop: boolean; parts: Record<string, string> }

/** One section of a song: `parts` maps track keys to exactly `bars` bars of MML; silent tracks may be left out. */
export const sec = (name: string, bars: number, parts: Record<string, string>): Section => ({ name, bars, loop: false, parts });
/** The section the song loops back to. */
export const loopSec = (name: string, bars: number, parts: Record<string, string>): Section => ({ name, bars, loop: true, parts });

/** Arranged (synth) songs are much denser than the chip set; this brings them to a similar loudness. */
const SYNTH_LEVEL = 0.55;

/** Each section starts from the same state, so the loop and any section can be jumped to cleanly. */
const RESET = 'o4 l8 v12 q7 K0 F8 G0 V0 E0 @2';

/**
 * Builds a multi-track song from sections, so every track stays in step: a track without a part
 * in a section rests for it, and every part is checked to be exactly the section's length.
 */
export function arrange(meta: Omit<SongDef, 'tracks' | 'sections' | 'problems'>, tracks: Record<string, TrackSpec>, sections: Section[]): SongDef {
  const problems: string[] = [];
  const keys = Object.keys(tracks);
  const src: Record<string, string[]> = Object.fromEntries(keys.map((k) => [k, []]));
  const marks: { name: string; tick: number }[] = [];
  let bar = 0;
  for (const s of sections) {
    for (const k of Object.keys(s.parts)) if (!tracks[k]) problems.push(`${s.name}: unknown track "${k}"`);
    marks.push({ name: s.name, tick: bar * TICKS_PER_WHOLE });
    for (const k of keys) {
      const part = `${RESET} ${tracks[k].init ?? ''} ${s.parts[k] ?? `[r1 |]${s.bars}`}`;
      try {
        const t = parseMml(part, meta.macros, isKitInst(tracks[k].inst));
        if (t.length !== s.bars * TICKS_PER_WHOLE) problems.push(`${s.name}/${k}: ${t.length / TICKS_PER_WHOLE} bars, want ${s.bars}`);
        t.bars.forEach((b, i) => { if (b !== TICKS_PER_WHOLE) problems.push(`${s.name}/${k}: bar ${i + 1} is ${b / 48} beats`); });
      } catch (e) {
        problems.push(`${s.name}/${k}: ${(e as Error).message}`);
      }
      src[k].push(`${s.loop ? 'L ' : ''}${part}`);
    }
    bar += s.bars;
  }
  return {
    level: SYNTH_LEVEL,
    ...meta,
    sections: marks,
    problems,
    tracks: keys.map((k) => {
      const { init: _, ...t } = tracks[k];
      return { ...t, mml: src[k].join('\n') };
    }),
  };
}

/** The original four-channel chip layout: two pulses, triangle, noise. */
export function chip(d: { title: string; bpm: number; key: [number, Mode]; macros?: Record<string, string>; p1?: string; p2?: string; tri?: string; noise?: string; echo?: SongDef['echo']; about?: string }): SongDef {
  return {
    title: d.title, bpm: d.bpm, key: d.key, macros: d.macros, echo: d.echo, about: d.about,
    tracks: [
      { name: 'Pulse 1', inst: 'chip', mml: d.p1 ?? '', role: 'lead', gain: 0.17, pan: -0.18, verb: 0.22 },
      { name: 'Pulse 2', inst: 'chip', mml: d.p2 ?? '', gain: 0.12, pan: 0.24, verb: 0.28 },
      { name: 'Triangle', inst: 'chiptri', mml: d.tri ?? '', role: 'bass', gain: 0.34, verb: 0.05 },
      { name: 'Noise', inst: 'chipkit', mml: d.noise ?? '', gain: 0.3, pan: 0.06, verb: 0.08 },
    ],
  };
}

// ─────────────────────────── compiling ───────────────────────────

export interface SongEvent extends MmlNote { tr: number }
export interface CompiledSong {
  def: SongDef;
  events: SongEvent[];
  /** Events per track, in time order (for the sound test's piano roll). */
  byTrack: SongEvent[][];
  length: number;
  loopTick: number;
  loopIdx: number;
  /** Seconds per tick. */
  spt: number;
}

export function compileSong(def: SongDef): CompiledSong {
  const parsed = def.tracks.map((t) => (t.mml.trim() ? parseMml(t.mml, def.macros, isKitInst(t.inst)) : null));
  const length = Math.max(...parsed.map((t) => t?.length ?? 0));
  const loopTick = parsed.find((t) => t)?.loopTick ?? 0;
  const byTrack: SongEvent[][] = parsed.map((t, tr) => (t?.notes ?? []).map((n) => ({ ...n, tr })));
  if (def.echo) {
    const from = def.echo.from ?? 0, to = def.echo.to ?? 1;
    for (const n of byTrack[from] ?? []) {
      let tick = n.tick + def.echo.delay;
      if (tick >= length) tick = loopTick + (tick - length);
      byTrack[to].push({ ...n, tick, vol: n.vol * def.echo.vol, vib: 0, tr: to });
    }
    byTrack[to].sort((a, b) => a.tick - b.tick);
  }
  const events = byTrack.flat().sort((a, b) => a.tick - b.tick || a.tr - b.tr);
  const loopIdx = Math.max(0, events.findIndex((e) => e.tick >= loopTick));
  return { def, events, byTrack, length, loopTick, loopIdx, spt: 60 / def.bpm / (TICKS_PER_WHOLE / 4) };
}
