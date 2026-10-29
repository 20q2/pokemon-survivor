import { describe, expect, it } from 'vitest';
import { MOVES, MOVE_LIST, MASTERY_OF, TM_MOVES, BASIC_MOVES, NON_ATTACKS, moveStatsAt } from '../src/data/moves.ts';
import { STATUS_INFO } from '../src/data/status.ts';
import { lookKey } from '../src/ui/movelook.ts';
import { VERB_TEXT } from '../src/ui/verbs.ts';
import { ITEMS, TYPE_BOOSTER } from '../src/data/items.ts';
import { LINES, SPECIES, finalForms, lineSpecies } from '../src/data/pokedex.ts';
import { STAGES, ENEMY_ROLE, eventTimes } from '../src/data/stages.ts';
import { TYPES, effectiveness, typeMult } from '../src/data/types.ts';
import manifest from '../public/assets/manifest.json';

describe('data integrity', () => {
  it('every learnset / starter / form move exists and is not a mastery move', () => {
    for (const l of LINES) {
      expect(MOVES[l.starter], l.starter).toBeTruthy();
      for (const e of l.learnset) {
        expect(MOVES[e.move], `${l.id}:${e.move}`).toBeTruthy();
        expect(MOVES[e.move].mastery, `${l.id}:${e.move} is mastery`).toBeFalsy();
        expect(e.stage).toBeLessThan(l.evoLevels.length + 1);
      }
      for (const [s, ms] of Object.entries(l.formMoves ?? {})) {
        expect(finalForms(l), `${l.id}: formMoves for ${s}`).toContain(s);
        for (const m of ms) expect(MOVES[m], m).toBeTruthy();
      }
      for (const s of lineSpecies(l)) expect(SPECIES[s], s).toBeTruthy();
      // Eevee has no normal final stage, so every stage must name its form.
      expect(l.evoLevels.length).toBe(l.stages.length - (l.stages.length > l.evoLevels.length ? 1 : 0));
      if (l.stages.length === l.evoLevels.length) for (const st of STAGES) expect(l.envForms?.[st.id]?.length, `${l.id} on ${st.id}`).toBeTruthy();
      for (const st of Object.keys(l.envForms ?? {})) expect(STAGES.some((x) => x.id === st), `${l.id}: unknown stage ${st}`).toBe(true);
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
      const pool = new Set([l.starter, ...l.learnset.map((e) => e.move), ...Object.values(l.formMoves ?? {}).flat()]);
      expect([...pool].some((m) => MASTERY_OF[m]), l.id).toBe(true);
    }
  });

  it('TMs, buffs and moves are well formed', () => {
    for (const id of TM_MOVES) expect(MOVES[id], id).toBeTruthy();
    for (const m of MOVE_LIST) {
      if (m.behavior === 'buff') expect(m.buff, m.id).toBeTruthy();
      const s5 = moveStatsAt(m, 5);
      expect(s5.cd).toBeGreaterThan(0.1);
      if (!NON_ATTACKS.has(m.id)) expect(s5.power, m.id).toBeGreaterThan(0);
    }
  });

  it('every move has its own verb (only basic starter moves may share one)', () => {
    const seen = new Map<string, string>();
    for (const m of MOVE_LIST) {
      if (BASIC_MOVES.has(m.id)) continue;
      expect(seen.get(m.verb), `${m.id} shares verb "${m.verb}"`).toBeUndefined();
      seen.set(m.verb, m.id);
    }
    // Icons: type colour x shape pattern x category size x tint x mastery frame — every move differs.
    const icons = new Set(MOVE_LIST.map((m) => lookKey(m.id)));
    expect(icons.size).toBe(MOVE_LIST.length);
  });

  it('every verb has a short label for cards and tooltips', () => {
    for (const m of MOVE_LIST) expect(VERB_TEXT[m.verb], `${m.id}: ${m.verb}`).toBeTruthy();
  });

  it('every status a move applies is explained in the glossary', () => {
    for (const m of MOVE_LIST) {
      for (const k of [m.effect, m.effect2?.kind]) {
        if (!k || k === 'drain' || k === 'coin') continue;
        expect(STATUS_INFO[k], `${m.id}: ${k}`).toBeTruthy();
      }
    }
  });

  it('stages reference real species with sprites', () => {
    const sp = (manifest as { species: Record<string, { normal: unknown }> }).species;
    for (const st of STAGES) {
      const all = st.waves.flatMap((w) => w.species.map((e) => e.species));
      all.push(...st.elites, st.swarm, ...st.bosses.map((b) => b.species), ...st.bosses.flatMap((b) => b.minions ?? []));
      for (const s of all) {
        expect(SPECIES[s], `${st.id}:${s}`).toBeTruthy();
        expect(sp[s]?.normal, `sprite ${s}`).toBeTruthy();
      }
    }
    for (const s of Object.keys(ENEMY_ROLE)) expect(SPECIES[s], s).toBeTruthy();
  });

  it('every stage has 16 minute waves that each change the species line-up', () => {
    for (const st of STAGES) {
      expect(st.waves.length, st.id).toBe(16);
      const set = (i: number) => st.waves[i].species.map((e) => e.species).sort().join();
      for (let i = 1; i < 16; i++) expect(set(i), `${st.id} minute ${i}`).not.toBe(set(i - 1));
    }
  });

  it('the first four minutes are pure chasers (no ranged or bomber species)', () => {
    for (const st of STAGES) {
      for (let i = 0; i < 4; i++) {
        for (const e of st.waves[i].species) expect(['ranged', 'bomber'], `${st.id} m${i} ${e.species}`).not.toContain(ENEMY_ROLE[e.species]);
      }
    }
  });

  it('wave quotas follow the shared non-monotonic table', () => {
    const table = [15, 35, 60, 50, 45, 10, 110, 150, 60, 10, 260, 70, 220, 190, 280, 300];
    for (const st of STAGES) {
      expect(st.waves.map((w) => w.min), st.id).toEqual(table);
      for (const w of st.waves) if (w.elite) expect(st.elites, st.id).toContain(w.elite);
    }
  });
});

describe('wave set pieces', () => {
  const RING_MINUTES = [5, 9, 13];
  const SWARM_MINUTES = [2, 4, 7, 11, 14];
  it('events live only in the authored minutes, on every stage', () => {
    for (const st of STAGES) {
      const withEvents = st.waves.flatMap((w, m) => (w.events?.length ? [m] : []));
      expect(withEvents, st.id).toEqual([...RING_MINUTES, ...SWARM_MINUTES].sort((a, b) => a - b));
      for (const m of RING_MINUTES) expect(st.waves[m].events!.map((e) => e.kind), `${st.id} m${m}`).toEqual(['ring']);
      for (const m of SWARM_MINUTES) expect(st.waves[m].events!.map((e) => e.kind), `${st.id} m${m}`).toEqual(['swarm']);
    }
  });
  it('no two events in a minute fire at the same time', () => {
    for (const st of STAGES) {
      for (const [m, w] of st.waves.entries()) {
        const times = eventTimes(m, w.events).map((x) => x.at);
        expect(new Set(times).size, `${st.id} m${m}`).toBe(times.length);
      }
    }
  });
  it('ring minutes are the breathing minutes and every event ends inside its minute', () => {
    for (const st of STAGES) {
      for (const m of RING_MINUTES.slice(0, 2)) expect(st.waves[m].min, `${st.id} m${m}`).toBe(10);
      for (const [m, w] of st.waves.entries()) {
        for (const ev of w.events ?? []) {
          const end = ev.kind === 'swarm' ? ev.at + (ev.repeat?.count ?? 0) * (ev.repeat?.every ?? 0) : ev.at + ev.duration;
          expect(end, `${st.id} m${m}`).toBeLessThan(60);
        }
      }
    }
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

describe('wave newcomers', () => {
  it('every wave from minute 1 introduces a species or sets a headline', () => {
    for (const st of STAGES) {
      for (let i = 1; i < st.waves.length; i++) {
        const prev = new Set(st.waves[i - 1].species.map((e) => e.species));
        const fresh = st.waves[i].species.some((e) => !prev.has(e.species));
        expect(fresh || !!st.waves[i].headline, `${st.id} minute ${i}`).toBe(true);
      }
    }
  });
});
