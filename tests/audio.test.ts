import { describe, expect, it } from 'vitest';
import { compileSong, KILL_LADDER, Ladder, SONGS } from '../src/audio/audio.ts';
import { parseMml, TICKS_PER_WHOLE } from '../src/audio/mml.ts';
import type { Mode } from '../src/audio/songs.ts';
import { STAGES } from '../src/data/stages.ts';

const SCALE: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 10, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

const channels = (name: string) => {
  const s = SONGS[name];
  return ([['p1', s.p1], ['p2', s.p2], ['tri', s.tri], ['noise', s.noise]] as const)
    .filter(([, src]) => src.trim())
    .map(([ch, src]) => ({ ch, track: parseMml(src, s.macros, ch === 'noise') }));
};

describe('songbook', () => {
  it('every stage, the menus and bosses have music', () => {
    for (const st of STAGES) expect(SONGS[st.music], st.music).toBeTruthy();
    for (const n of ['title', 'menu', 'boss', 'shop']) expect(SONGS[n], n).toBeTruthy();
  });

  it('parses the MML dialect', () => {
    const t = parseMml('o4 l8 c d e4 f2 | [c16]4 r4 (c e g)2 |', {});
    expect(t.bars).toEqual([TICKS_PER_WHOLE, TICKS_PER_WHOLE]);
    expect(t.notes[0].midi[0]).toBe(60);
    expect(t.notes.at(-1)!.midi).toEqual([60, 64, 67]);
  });

  for (const name of Object.keys(SONGS)) {
    describe(name, () => {
      it('every bar of every channel is exactly one 4/4 measure, and channels line up', () => {
        const chs = channels(name);
        const lens = new Set(chs.map((c) => c.track.length));
        const loops = new Set(chs.map((c) => c.track.loopTick));
        expect(lens.size, `${name}: channel lengths ${[...chs.map((c) => `${c.ch}=${c.track.length / TICKS_PER_WHOLE}`)]}`).toBe(1);
        expect(loops.size, `${name}: loop points differ`).toBe(1);
        for (const { ch, track } of chs) {
          track.bars.forEach((b, i) => expect(b, `${name}.${ch} bar ${i + 1} is ${b / 48} beats`).toBe(TICKS_PER_WHOLE));
        }
        expect(chs[0].track.length / TICKS_PER_WHOLE, `${name} is long enough to not grate`).toBeGreaterThanOrEqual(16);
      });

      it('lead melody stays in key, in a singable range, without wild leaps', () => {
        const s = SONGS[name];
        const lead = parseMml(s.p1, s.macros).notes.filter((n) => n.midi.length === 1).map((n) => n.midi[0]);
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
        const lead = parseMml(s.p1, s.macros).notes;
        const bass = parseMml(s.tri, s.macros).notes;
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
        const c = compileSong(SONGS[name]);
        expect(c.events.length).toBeGreaterThan(100);
        expect(c.loopTick).toBeLessThan(c.length);
        for (const e of c.events) {
          expect(e.tick).toBeGreaterThanOrEqual(0);
          expect(e.tick).toBeLessThan(c.length);
          if (e.ch !== 3) for (const m of e.midi) expect(m >= 30 && m <= 96, `${name} midi ${m}`).toBe(true);
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
