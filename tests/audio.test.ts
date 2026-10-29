import { describe, expect, it } from 'vitest';
import { compose, SONGS } from '../src/audio/audio.ts';
import { STAGES } from '../src/data/stages.ts';

describe('procedural music', () => {
  it('every stage has a song', () => {
    for (const st of STAGES) expect(SONGS[st.music], st.music).toBeTruthy();
  });
  it('songs are well-formed and in playable ranges', () => {
    for (const [name, spec] of Object.entries(SONGS)) {
      const song = compose(spec);
      const melodic = song.notes.filter((n) => n.ch !== 3);
      expect(melodic.length, name).toBeGreaterThan(150);
      expect(song.length, name).toBeGreaterThan(20);
      for (const n of melodic) {
        expect(Number.isFinite(n.midi) && n.midi >= 24 && n.midi <= 100, `${name} midi ${n.midi}`).toBe(true);
        expect(n.dur, name).toBeGreaterThan(0);
        expect(n.t, name).toBeGreaterThanOrEqual(0);
        expect(n.t, name).toBeLessThan(song.length + 1);
      }
      const lead = melodic.filter((n) => n.ch === 0).map((n) => n.midi);
      expect(Math.max(...lead) - Math.min(...lead), `${name} lead range`).toBeLessThan(26);
    }
  });
});
