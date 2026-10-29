import { describe, expect, it } from 'vitest';
import { MOVES, MOVE_LIST, MASTERY_OF, TM_MOVES, moveStatsAt } from '../src/data/moves.ts';
import { ITEMS, TYPE_BOOSTER } from '../src/data/items.ts';
import { LINES, SPECIES } from '../src/data/pokedex.ts';
import { STAGES, ENEMY_ROLE } from '../src/data/stages.ts';
import { TYPES, effectiveness, typeMult } from '../src/data/types.ts';
import manifest from '../public/assets/manifest.json';

describe('data integrity', () => {
  it('every learnset / starter / branch move exists and is not a mastery move', () => {
    for (const l of LINES) {
      expect(MOVES[l.starter], l.starter).toBeTruthy();
      for (const e of l.learnset) {
        expect(MOVES[e.move], `${l.id}:${e.move}`).toBeTruthy();
        expect(MOVES[e.move].mastery, `${l.id}:${e.move} is mastery`).toBeFalsy();
        expect(e.stage).toBeLessThan(l.stages.length + (l.branch ? 1 : 0));
      }
      for (const ms of Object.values(l.branchMoves ?? {})) for (const m of ms) expect(MOVES[m], m).toBeTruthy();
      for (const s of [...l.stages, ...Object.values(l.branch ?? {})]) expect(SPECIES[s], s).toBeTruthy();
      expect(l.evoLevels.length).toBe(l.branch ? 1 : l.stages.length - 1);
    }
  });

  it('mastery pairs reference real base moves and the matching type booster', () => {
    for (const m of MOVE_LIST.filter((x) => x.mastery)) {
      const base = MOVES[m.mastery!.from];
      expect(base, m.id).toBeTruthy();
      expect(ITEMS[m.mastery!.item], m.mastery!.item).toBeTruthy();
      expect(TYPE_BOOSTER[base.type]).toBe(m.mastery!.item);
      expect(MASTERY_OF[base.id]).toBe(m);
    }
  });

  it('every line can reach at least one mastery', () => {
    for (const l of LINES) {
      const pool = new Set([l.starter, ...l.learnset.map((e) => e.move), ...Object.values(l.branchMoves ?? {}).flat()]);
      expect([...pool].some((m) => MASTERY_OF[m]), l.id).toBe(true);
    }
  });

  it('TMs, buffs and moves are well formed', () => {
    for (const id of TM_MOVES) expect(MOVES[id], id).toBeTruthy();
    for (const m of MOVE_LIST) {
      if (m.behavior === 'buff') expect(m.buff, m.id).toBeTruthy();
      const s5 = moveStatsAt(m, 5);
      expect(s5.cd).toBeGreaterThan(0.1);
      if (m.cat !== 'status' || m.behavior !== 'buff') expect(s5.power).toBeGreaterThan(0);
    }
  });

  it('stages reference real species with sprites', () => {
    const sp = (manifest as { species: Record<string, { normal: unknown }> }).species;
    for (const st of STAGES) {
      const all = [...st.pools.early, ...st.pools.mid, ...st.pools.late].map((e) => e.species);
      all.push(...st.elites, st.swarm, ...st.bosses.map((b) => b.species), ...st.bosses.flatMap((b) => b.minions ?? []));
      for (const s of all) {
        expect(SPECIES[s], `${st.id}:${s}`).toBeTruthy();
        expect(sp[s]?.normal, `sprite ${s}`).toBeTruthy();
      }
    }
    for (const s of Object.keys(ENEMY_ROLE)) expect(SPECIES[s], s).toBeTruthy();
  });
});

describe('type chart', () => {
  it('matches canonical matchups', () => {
    expect(typeMult('fire', 'grass')).toBe(2);
    expect(typeMult('water', 'fire')).toBe(2);
    expect(typeMult('electric', 'ground')).toBe(0.25);
    expect(typeMult('ghost', 'normal')).toBe(0.25);
    expect(typeMult('fairy', 'dragon')).toBe(2);
    expect(effectiveness('ice', ['dragon', 'flying'])).toBe(4);
    expect(effectiveness('fire', ['water', 'rock'])).toBe(0.25);
    expect(TYPES.length).toBe(18);
  });
});
