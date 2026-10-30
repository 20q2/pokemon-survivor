import { describe, expect, it } from 'vitest';
import simSrc from '../src/game/sim.ts?raw';
import statsSrc from '../src/game/stats.ts?raw';
import combatSrc from '../src/game/combat.ts?raw';
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { killEnemy } from '../src/game/enemyAI.ts';
import { BADGES } from '../src/data/badges.ts';

const make = (elite = false, seed = 7) => new Sim({
  stageId: 'viridian', seed, elite, startTime: 170,
  players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }],
});

/** Runs until the 3:00 boss exists, kills it and plays its cinematic out (level-ups before it are auto-picked). */
function killFirstBoss(sim: Sim) {
  sim.invulnerable = true;
  for (let i = 0; i < 60 * 40 && !sim.enemies.some((e) => e.boss); i++) {
    if (sim.phase === 'levelup') sim.choose(0, sim.fallbackIndex(0)); else sim.update(DT);
  }
  const boss = sim.enemies.find((e) => e.boss)!;
  expect(boss, 'the 3:00 boss spawned').toBeTruthy();
  killEnemy(sim, boss, 0);
  for (let i = 0; i < 60 * 5 && sim.phase === 'cine'; i++) sim.update(DT);
}

describe('Gym Badges', () => {
  it('a non-final boss offers 3 distinct badges; the pick is held and never offered again', () => {
    const sim = make();
    killFirstBoss(sim);
    expect(sim.phase).toBe('levelup');
    const offers = sim.offers.get(0)!;
    expect(offers).toHaveLength(3);
    expect(offers.every((o) => o.kind === 'badge')).toBe(true);
    expect(new Set(offers.map((o) => o.id)).size).toBe(3);
    const p = sim.players[0];
    const pendingBefore = p.pendingLevels;
    const picked = offers[0].id;
    sim.choose(0, 0);
    expect(p.badges).toEqual([picked]);
    expect(p.pendingLevels).toBe(pendingBefore);
    // Every later badge round leaves it out.
    for (let round = 0; round < 6; round++) {
      (sim as unknown as { badgeDue: boolean }).badgeDue = true;
      (sim as unknown as { resume(): void }).resume();
      const next = sim.offers.get(0);
      if (!next || next[0].kind !== 'badge') break;
      expect(next.some((o) => o.id === picked)).toBe(false);
      sim.choose(0, 0);
    }
  });

  it('Elite Mode: the mart still follows the badge pick', () => {
    const sim = make(true);
    killFirstBoss(sim);
    for (let i = 0; i < 20 && sim.phase === 'levelup' && sim.offers.get(0)?.[0].kind !== 'badge'; i++) sim.choose(0, 0);
    expect(sim.inBadges()).toBe(true);
    sim.choose(0, 0);
    for (let i = 0; i < 20 && sim.phase === 'levelup' && !sim.inMart(); i++) sim.choose(0, 0);
    expect(sim.inMart()).toBe(true);
  });

  it('Rainbow Badge: level-ups offer 4 cards', () => {
    const sim = make();
    const p = sim.players[0];
    p.badges.push('rainbow');
    p.pendingLevels = 1;
    sim.beginLevelUp();
    expect(sim.offers.get(0)).toHaveLength(4);
  });

  it('Thunder and Boulder badges change stats', () => {
    const sim = make();
    const p = sim.players[0];
    const { crit, maxHp, speed } = p.stats;
    p.badges.push('thunder', 'boulder');
    sim.refreshStats();
    expect(p.stats.crit).toBeCloseTo(crit + 0.15);
    expect(p.stats.maxHp).toBeCloseTo(maxHp * 1.3);
    expect(p.stats.speed).toBeCloseTo(speed * 0.92);
  });

  it('badge ids are unique and every id the code checks exists', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const src = [simSrc, statsSrc, combatSrc].join(' ');
    expect(src).toContain("hasBadge(p, 'rainbow')");
    for (const m of src.matchAll(/hasBadge\([^,]+,\s*'([a-z]+)'\)/g)) expect(ids).toContain(m[1]);
  });
});
