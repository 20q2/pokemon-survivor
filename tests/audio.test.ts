import { describe, expect, it } from 'vitest';
import { compileSong, KILL_LADDER, Ladder, SONGS } from '../src/audio/audio.ts';
import { isKitInst } from '../src/audio/instruments.ts';
import { parseMml, TICKS_PER_WHOLE } from '../src/audio/mml.ts';
import type { Mode, SongDef } from '../src/audio/songs.ts';
import { STAGES } from '../src/data/stages.ts';

const SCALE: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 10, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 4, 5, 7, 8, 10, 11],
};

const tracks = (s: SongDef) => s.tracks
  .filter((t) => t.mml.trim())
  .map((t) => ({ name: t.name, track: parseMml(t.mml, s.macros, isKitInst(t.inst)) }));
const role = (s: SongDef, r: 'lead' | 'bass') => {
  const t = s.tracks.find((x) => x.role === r)!;
  return parseMml(t.mml, s.macros).notes;
};

describe('songbook', () => {
  it('every stage, the menus and bosses have music', () => {
    for (const st of STAGES) expect(SONGS[st.music], st.music).toBeTruthy();
    for (const n of ['title', 'menu', 'boss', 'final', 'shop']) expect(SONGS[n], n).toBeTruthy();
  });

  it('parses the MML dialect', () => {
    const t = parseMml('o4 l8 c d e4 f2 | [c16]4 r4 (c e g)2 |', {});
    expect(t.bars).toEqual([TICKS_PER_WHOLE, TICKS_PER_WHOLE]);
    expect(t.notes[0].midi[0]).toBe(60);
    expect(t.notes.at(-1)!.midi).toEqual([60, 64, 67]);
  });

  it('transposes, glides and sets brightness', () => {
    const t = parseMml('o4 l4 K-3 c G6 F12 e K0 c r', {});
    expect(t.notes.map((n) => n.midi[0])).toEqual([57, 61, 60]);
    expect(t.notes[1]).toMatchObject({ glide: 6, from: 57, cut: 12 });
    expect(t.notes[0].glide).toBe(0);
  });

  for (const name of Object.keys(SONGS)) {
    describe(name, () => {
      it('arranges cleanly: every bar of every track is one 4/4 measure, and tracks line up', () => {
        const s = SONGS[name];
        expect(s.problems ?? [], `${name}: ${(s.problems ?? []).join('; ')}`).toEqual([]);
        const ts = tracks(s);
        const lens = new Set(ts.map((c) => c.track.length));
        const loops = new Set(ts.map((c) => c.track.loopTick));
        expect(lens.size, `${name}: track lengths ${[...ts.map((c) => `${c.name}=${c.track.length / TICKS_PER_WHOLE}`)]}`).toBe(1);
        expect(loops.size, `${name}: loop points differ`).toBe(1);
        for (const { name: tn, track } of ts) {
          track.bars.forEach((b, i) => expect(b, `${name}.${tn} bar ${i + 1} is ${b / 48} beats`).toBe(TICKS_PER_WHOLE));
        }
        expect(ts[0].track.length / TICKS_PER_WHOLE, `${name} is long enough to not grate`).toBeGreaterThanOrEqual(16);
      });

      it('lead melody stays in key, in a singable range, without wild leaps', () => {
        const s = SONGS[name];
        const lead = role(s, 'lead').filter((n) => n.midi.length === 1).map((n) => n.midi[0]);
        const scale = SCALE[s.key[1]].map((d) => (d + s.key[0]) % 12);
        const inKey = lead.filter((m) => scale.includes(m % 12)).length / lead.length;
        expect(inKey, `${name}: ${(inKey * 100).toFixed(0)}% of lead notes in key`).toBeGreaterThan(0.88);
        expect(Math.max(...lead) - Math.min(...lead), `${name} range`).toBeLessThanOrEqual(24);
        let big = 0;
        for (let i = 1; i < lead.length; i++) if (Math.abs(lead[i] - lead[i - 1]) > 9) big++;
        expect(big / lead.length, `${name} big leaps`).toBeLessThan(0.08);
      });

      it('lead and bass agree on strong beats (few harsh intervals)', () => {
        const s = SONGS[name];
        const lead = role(s, 'lead');
        const bass = role(s, 'bass');
        const at = (notes: typeof lead, tick: number) => notes.find((n) => n.tick <= tick && tick < n.tick + n.len);
        let checked = 0, harsh = 0;
        for (const n of lead) {
          if (n.tick % (TICKS_PER_WHOLE / 2) !== 0 || n.midi.length !== 1) continue; // beats 1 and 3
          const b = at(bass, n.tick);
          if (!b) continue;
          checked++;
          const ic = (((n.midi[0] - b.midi[0]) % 12) + 12) % 12;
          if (ic === 1 || ic === 6 || ic === 11) harsh++;
        }
        expect(checked, name).toBeGreaterThan(10);
        expect(harsh / checked, `${name}: ${harsh}/${checked} harsh downbeats`).toBeLessThan(0.15);
      });

      it('compiles to a playable, loopable event list', () => {
        const s = SONGS[name];
        const c = compileSong(s);
        expect(c.events.length).toBeGreaterThan(100);
        expect(c.loopTick).toBeLessThan(c.length);
        for (const e of c.events) {
          expect(e.tick).toBeGreaterThanOrEqual(0);
          expect(e.tick).toBeLessThan(c.length);
          if (!isKitInst(s.tracks[e.tr].inst)) for (const m of e.midi) expect(m >= 23 && m <= 100, `${name} midi ${m}`).toBe(true);
        }
      });
    });
  }
});

describe('sound effects', async () => {
  const { SFX } = await import('../src/audio/sfx.ts');
  for (const [name, def] of Object.entries(SFX)) {
    it(`${name} parses and stays short`, () => {
      let longest = 0;
      for (const [ch, src] of [['p1', def.p1], ['p2', def.p2], ['tri', def.tri], ['noise', def.noise]] as const) {
        if (!src) continue;
        const t = parseMml(src, {}, ch === 'noise');
        longest = Math.max(longest, t.length);
      }
      const seconds = longest * (60 / def.bpm / (TICKS_PER_WHOLE / 4));
      expect(longest).toBeGreaterThan(0);
      expect(seconds, name).toBeLessThan(3);
    });
  }
});

// The kill ladder is checked as pure math: vitest runs in node, which has no OfflineAudioContext, so
// there is no offline render here (AudioEngine.renderSfxOffline('kill', n) is for browser/script use).
describe('kill streak ladder', () => {
  const kills = () => new Ladder(KILL_LADDER.length, 2.5);
  const run = (gap: number, n: number) => {
    const l = kills();
    let step = 0;
    for (let i = 0; i < n; i++) step = l.step(i * gap);
    return step;
  };
  it('a lone kill is plain, a 16/s mow tops out', () => {
    expect(kills().step(10)).toBe(0);
    expect(run(0.06, 40)).toBe(KILL_LADDER.length - 1);
    expect(KILL_LADDER[KILL_LADDER.length - 1]).toBeLessThanOrEqual(19);
  });
  it('drains back to the bottom when kills stop', () => {
    const l = kills();
    for (let i = 0; i < 40; i++) l.step(i * 0.06);
    expect(l.step(2.4 + 5)).toBe(0);
  });
  it('a slow trickle (1.5/s) never climbs, but a 3/s run does', () => {
    expect(run(1 / 1.5, 20)).toBe(0);
    expect(run(1 / 3, 20)).toBeGreaterThan(0);
  });
});
