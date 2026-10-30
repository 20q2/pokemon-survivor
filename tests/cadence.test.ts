import { describe, expect, it } from 'vitest';
import { REF_QUOTA, STAGES, WAVE_MIN, XP_QUOTA_CEIL, XP_QUOTA_FLOOR } from '../src/data/stages.ts';
import { Sim, xpForLevel } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { freshSave, migrate } from '../src/meta/save.ts';
import { spawnEnemy } from '../src/game/spawner.ts';
import { killEnemy } from '../src/game/enemyAI.ts';

const make = (eliteChests?: number, seed = 7) => new Sim({
  stageId: 'viridian', seed, eliteChests,
  players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }],
});

/** Kills n elites in a row and returns the chest tiers they dropped. */
function eliteTiers(sim: Sim, n: number) {
  const tiers: number[] = [];
  for (let i = 0; i < n; i++) {
    const before = sim.pickups.length;
    killEnemy(sim, spawnEnemy(sim, 'rattata', 100, 0, { elite: true })!, 0);
    tiers.push(...sim.pickups.slice(before).filter((p) => p.kind === 'chest').map((p) => p.value));
  }
  return tiers;
}

describe('scripted first treasures', () => {
  it('a fresh save drops Poke, Poke, Great, Poke, Poke, Ultra', () => {
    const sim = make();
    expect(eliteTiers(sim, 6)).toEqual([1, 1, 2, 1, 1, 3]);
    expect(sim.eliteChestsDropped).toBe(6);
  });

  it('resumes the script from the save\'s lifetime count', () => {
    expect(eliteTiers(make(4), 2)).toEqual([1, 3]);
  });

  it('a save past the script uses the random odds', () => {
    const tiers = eliteTiers(make(6), 80);
    expect(tiers).toHaveLength(80);
    expect(tiers.every((t) => t >= 1 && t <= 3)).toBe(true);
    expect(tiers.slice(0, 6)).not.toEqual([1, 1, 2, 1, 1, 3]);
    expect(tiers.filter((t) => t === 1).length).toBeGreaterThan(50); // mostly Poke Balls
    expect(tiers.some((t) => t > 1)).toBe(true);
    expect(eliteTiers(make(6), 80)).toEqual(tiers); // same seed, same chests
  });

  it('eliteChests defaults to 0 on a fresh or older save', () => {
    expect(freshSave().stats.eliteChests).toBe(0);
    const { eliteChests, ...old } = freshSave().stats;
    expect(eliteChests).toBe(0);
    expect(migrate({ stats: { ...old, runs: 3 } }).stats).toMatchObject({ eliteChests: 0, runs: 3 });
  });
});

describe('xp cadence', () => {
  it('regular enemy xp comes from the current wave, tanks pay double', () => {
    const sim = make();
    const waves = sim.stage.waves;
    expect(spawnEnemy(sim, 'rattata', 100, 0)!.xp).toBe(waves[0].xp);
    sim.time = 4 * 60 + 30;
    expect(spawnEnemy(sim, 'rattata', 100, 0)!.xp).toBe(waves[4].xp);
    const tank = spawnEnemy(sim, 'geodude', 100, 0)!;
    expect(tank.role).toBe('tank');
    expect(tank.xp).toBe(waves[4].xp * 2);
  });

  it('wave xp is eased by the quota: thin minutes pay more per kill, thick ones sit on the floor', () => {
    for (const st of STAGES) {
      st.waves.forEach((w, m) => {
        expect(w.xp).toBeGreaterThan(0);
        const ease = w.xp / (1 + 0.25 * m);
        const want = Math.min(XP_QUOTA_CEIL, Math.max(XP_QUOTA_FLOOR, Math.sqrt(REF_QUOTA / w.min)));
        expect(ease, `${st.id} m${m}`).toBeCloseTo(want, 1);
        if (w.min >= 80) expect(ease).toBeCloseTo(XP_QUOTA_FLOOR, 1);
      });
      const ring = st.waves.find((w) => w.min === Math.min(...WAVE_MIN))!;
      expect(ring.xp).toBeGreaterThan(st.waves[2].xp);
    }
  });

  it('keeps the early levels snappy, then climbs without a wall', () => {
    expect([5, 10, 12].map(xpForLevel)).toEqual([45, 148, 206]);
    for (let l = 1; l < 60; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });
});

describe('candy piles', () => {
  it('past 120 pickups candy merges into a far pile; candy at the player\'s feet never does', () => {
    const sim = make();
    const p = sim.players[0];
    for (let i = 0; i < 130; i++) sim.spawnPickup('coin', p.x + 900, p.y);
    const pile = sim.spawnPickup('candy', p.x + 600, p.y, 10);
    const n = sim.pickups.length;
    expect(sim.spawnPickup('candy', p.x + 700, p.y, 35)).toBe(pile);
    expect(pile.value).toBe(45); // crossed 40: renders as an XL pile
    expect(sim.pickups.length).toBe(n);
    const near = sim.spawnPickup('candy', p.x + 20, p.y, 1);
    expect(near).not.toBe(pile);
    expect(sim.pickups.length).toBe(n + 1);
  });
});
