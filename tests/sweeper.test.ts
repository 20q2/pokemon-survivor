import { describe, expect, it } from 'vitest';
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { spawnEnemy } from '../src/game/enemies.ts';
import { rawDamageEnemy } from '../src/game/combat.ts';

function sim() {
  const s = new Sim({ stageId: 'viridian', seed: 7, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
  s.phase = 'play';
  s.offers.clear();
  return s;
}
const sweepers = (s: Sim) => s.enemies.filter((e) => e.sweeper && e.alive);
/** Steps only the spawner (a full minute-16 sim is slow) from the current time to `t`. */
const runTo = (s: Sim, t: number) => {
  while (s.time < t) { s.time += 0.25; s.spawner.update(0.25); }
};

describe('overtime sweeper', () => {
  it('appears at 960 s while the final boss stands, and again a minute later', () => {
    const s = sim();
    s.time = 955;
    s.spawner.update(0);
    runTo(s, 959);
    expect(sweepers(s)).toHaveLength(0);
    runTo(s, 961);
    expect(sweepers(s)).toHaveLength(1);
    runTo(s, 1021);
    expect(sweepers(s)).toHaveLength(2);
  });

  it('never appears once the final boss is down', () => {
    const s = sim();
    s.time = 955;
    s.finalDefeated = true;
    runTo(s, 1030);
    expect(sweepers(s)).toHaveLength(0);
  });

  it('takes no damage, no knockback, and walks at the player fast', () => {
    const s = sim();
    const e = spawnEnemy(s, 'banette', 400, 0, { sweeper: true })!;
    rawDamageEnemy(s, e, 1e12, 'fire', 0, 'test');
    expect(e.alive).toBe(true);
    expect(e.hp).toBe(e.maxHp);
    const p = s.players[0];
    p.x = 0; p.y = 0;
    e.x = 400; e.y = 0;
    for (let i = 0; i < 60; i++) { p.hp = p.stats.maxHp; s.update(DT); }
    expect(e.x).toBeLessThan(400 - 120);
    expect(e.speed).toBeCloseTo(165);
    expect(e.dmg * 3).toBeGreaterThan(p.stats.maxHp);
  });

  it('is left out of the quota count', () => {
    const s = sim();
    const quiet = () => { s.update(DT); return s.enemies.filter((e) => e.alive && !e.sweeper).length; };
    s.time = 100;
    const base = quiet();
    for (let i = 0; i < 80; i++) spawnEnemy(s, 'banette', 500 + i, 500, { sweeper: true });
    const after = quiet();
    // 80 sweepers would exceed any minute-1 quota if counted, so no filler may vanish or be withheld.
    expect(after).toBeGreaterThanOrEqual(base);
    expect(s.enemies.filter((e) => e.sweeper)).toHaveLength(80);
  });
});

describe('director reprieve in the spawner', () => {
  it('holds the quota backfill for a few seconds at low hp, then resumes', () => {
    const s = sim();
    s.time = 100;
    s.spawner.update(0.1);
    for (const e of s.enemies) e.alive = false;
    s.players[0].hp = s.players[0].stats.maxHp * 0.2;
    s.time += 0.1;
    s.spawner.update(0.1); // the reprieve starts
    s.time += 2;
    s.spawner.update(0.1);
    const filler = () => s.enemies.filter((e) => e.alive && !e.elite && e.role !== 'treasure');
    expect(filler()).toHaveLength(0);
    s.time += 3;
    s.spawner.update(0.1);
    expect(filler().length).toBeGreaterThan(0);
  });
});
