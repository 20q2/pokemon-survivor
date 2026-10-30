import { describe, expect, it } from 'vitest';
import { STAGES, waveHeadline, waveTimeline } from '../src/data/stages.ts';
import { SPECIES } from '../src/data/pokedex.ts';

describe('waveTimeline', () => {
  it('lists minutes 1-15 of every stage with known species', () => {
    for (const st of STAGES) {
      const tl = waveTimeline(st);
      expect(tl.map((c) => c.minute)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
      for (const c of tl) {
        expect(SPECIES[c.species]).toBeDefined();
        expect(SPECIES[c.focus]).toBeDefined();
      }
    }
  });

  it('marks set pieces and elite minutes straight from the wave table', () => {
    const st = STAGES[0];
    const tl = waveTimeline(st);
    const by = (m: number) => tl[m - 1];
    expect(by(2).kind).toBe('swarm');
    expect(by(2).focus).toBe(st.swarm);
    expect(by(5).kind).toBe('ring');
    expect(by(1).kind).toBe('plain');
    for (const c of tl) {
      expect(c.elite).toBe(!!st.waves[c.minute].elite);
      expect(c.kind !== 'plain').toBe(!!st.waves[c.minute].events?.length);
      expect(c.species).toBe(waveHeadline(st, c.minute));
    }
  });
});
