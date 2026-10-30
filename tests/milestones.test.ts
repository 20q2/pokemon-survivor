import { describe, expect, it } from 'vitest';
import { DT, KILL_MILESTONES, Sim } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { spawnEnemy } from '../src/game/spawner.ts';
import { killEnemy } from '../src/game/enemyAI.ts';
import type { GameEvent } from '../src/game/types.ts';

const make = () => new Sim({
  stageId: 'viridian', seed: 11,
  players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }],
});

const milestones = (evs: GameEvent[]) => evs.filter((e) => e.e === 'milestone');
const wipeouts = (evs: GameEvent[]) => evs.flatMap((e) => (e.e === 'wipeout' ? [e] : []));

/** Kills `n` regular foes, one at a time, spread over sim ticks (never 10 in one tick). */
function killSpread(sim: Sim, n: number) {
  for (let i = 0; i < n; i++) {
    killEnemy(sim, spawnEnemy(sim, 'rattata', 400, 0)!, 0);
    if (i % 5 === 4) sim.update(DT);
  }
}

describe('team kill milestones', () => {
  it('thresholds are ascending and start at 100', () => {
    expect(KILL_MILESTONES[0]).toBe(100);
    for (let i = 1; i < KILL_MILESTONES.length; i++) expect(KILL_MILESTONES[i]).toBeGreaterThan(KILL_MILESTONES[i - 1]);
  });

  it('announces 100 exactly once, then 250', () => {
    const sim = make();
    killSpread(sim, 99);
    expect(milestones(sim.events)).toEqual([]);
    killSpread(sim, 1);
    expect(milestones(sim.events)).toEqual([{ e: 'milestone', kills: 100 }]);
    killSpread(sim, 149);
    expect(milestones(sim.events)).toHaveLength(1);
    killSpread(sim, 1);
    expect(milestones(sim.events)).toEqual([{ e: 'milestone', kills: 100 }, { e: 'milestone', kills: 250 }]);
  });
});

describe('multi-kill pop', () => {
  function killInOneTick(sim: Sim, n: number) {
    for (let i = 0; i < n; i++) killEnemy(sim, spawnEnemy(sim, 'rattata', 300 + i * 10, 50)!, 0);
    sim.update(DT);
  }

  it('12 kills in one tick pop once, at their average position', () => {
    const sim = make();
    killInOneTick(sim, 12);
    const w = wipeouts(sim.events);
    expect(w).toHaveLength(1);
    expect(w[0].n).toBe(12);
    expect(w[0].x).toBeCloseTo(355, 0);
  });

  it('5 kills in one tick do not pop', () => {
    const sim = make();
    killInOneTick(sim, 5);
    expect(wipeouts(sim.events)).toEqual([]);
  });

  it('pops at most once per 1.5 s of sim time', () => {
    const sim = make();
    killInOneTick(sim, 12);
    killInOneTick(sim, 12);
    expect(wipeouts(sim.events)).toHaveLength(1);
    for (let i = 0; i < 200 && sim.time < 1.6; i++) sim.update(DT);
    expect(sim.time).toBeGreaterThanOrEqual(1.6);
    killInOneTick(sim, 12);
    expect(wipeouts(sim.events)).toHaveLength(2);
  });
});
