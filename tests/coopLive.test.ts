import { describe, expect, it } from 'vitest';
import { Sim, DT, LIVE_GRACE } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { spawnEnemy } from '../src/game/spawner.ts';
import { killEnemy } from '../src/game/enemyAI.ts';
import { damagePlayer } from '../src/game/combat.ts';

/** A co-op run as the host runs it: `live` on, so nothing stops the run for one player's choice. */
function coop(n = 2, lineId = 'charmander', elite = false) {
  const sim = new Sim({
    stageId: 'viridian', seed: 11, elite, live: true,
    players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, lineId, shiny: false, meta: metaBonuses({}), tms: [] })),
  });
  sim.update(DT);
  return sim;
}
const tick = (sim: Sim, seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) sim.update(DT); };

describe('co-op runs never pause', () => {
  it('a level-up deals cards to everyone while the clock keeps running', () => {
    const sim = coop();
    sim.xp = sim.xpNext + 1;
    sim.update(DT);
    sim.update(DT);
    expect(sim.phase).toBe('play');
    expect(sim.offers.has(0) && sim.offers.has(1)).toBe(true);
    const t0 = sim.time;
    tick(sim, 1);
    expect(sim.time).toBeCloseTo(t0 + 1, 5);
    // One player picks and is free; the other is still choosing in the bubble.
    sim.choose(0, 0);
    sim.update(DT);
    expect(sim.players[0].busy).toBe(false);
    expect(sim.players[1].busy).toBe(true);
  });

  it('a choosing player is rooted, holds fire and cannot be hurt; protection lingers briefly afterwards', () => {
    const sim = coop();
    sim.xp = sim.xpNext + 1;
    sim.update(DT); sim.update(DT);
    const p = sim.players[1];
    expect(p.busy).toBe(true);
    const x0 = p.x;
    p.mx = 1; p.my = 0;
    tick(sim, 0.5);
    expect(p.x).toBe(x0);
    const hp = p.hp;
    damagePlayer(sim, p, 50, 'normal', false);
    expect(p.hp).toBe(hp);
    sim.choose(1, 0);
    sim.update(DT);
    expect(p.busy).toBe(false);
    expect(p.graceT).toBeGreaterThan(LIVE_GRACE - 0.1);
    damagePlayer(sim, p, 50, 'normal', false);
    expect(p.hp).toBe(hp);
    tick(sim, LIVE_GRACE + 0.1);
    p.mx = 1;
    const x1 = p.x;
    sim.update(DT);
    expect(p.x).toBeGreaterThan(x1);
    damagePlayer(sim, p, 5, 'normal', false);
    expect(p.hp).toBeLessThan(hp);
  });

  it('a boss falling hands each player a Gym Badge pick without a cinematic stop', () => {
    const sim = coop();
    const boss = spawnEnemy(sim, 'beedrill', 200, 0, { boss: { species: 'beedrill', at: 180, patterns: ['charge'] } })!;
    killEnemy(sim, boss, 0);
    expect(sim.phase).toBe('play');
    sim.update(DT);
    expect(sim.phase).toBe('play');
    for (const p of sim.players) expect(sim.offers.get(p.id)?.[0]?.kind, p.name).toBe('badge');
    const t0 = sim.time;
    tick(sim, 0.5);
    expect(sim.time).toBeGreaterThan(t0);
  });

  it('Elite Mode: the mart stop follows the badge per player and counts as one visit', () => {
    const sim = coop(2, 'charmander', true);
    const boss = spawnEnemy(sim, 'beedrill', 200, 0, { boss: { species: 'beedrill', at: 180, patterns: ['charge'] } })!;
    killEnemy(sim, boss, 0);
    sim.update(DT);
    expect(sim.martVisits).toBe(1);
    sim.choose(0, 0); // badge
    sim.update(DT);
    expect(sim.offers.get(0)?.[0]?.cost).toBeDefined();
    expect(sim.offers.get(1)?.[0]?.kind).toBe('badge');
  });

  it('a treasure is the opener\'s own show: the run goes on and the opener is busy until it ends', () => {
    const sim = coop();
    const p = sim.players[0];
    sim.openChest(p);
    expect(sim.phase).toBe('play');
    expect(sim.shows.get(0)?.kind).toBe('chest');
    sim.update(DT);
    expect(p.busy).toBe(true);
    expect(sim.players[1].busy).toBe(false);
    const t0 = sim.time;
    tick(sim, sim.shows.get(0)!.dur + 0.1);
    expect(sim.time).toBeGreaterThan(t0 + 1);
    expect(sim.shows.has(0)).toBe(false);
  });

  it('a treasure opened while cards are up waits until the pick, then shows before more cards', () => {
    const sim = coop();
    sim.xp = sim.xpNext + 1;
    sim.update(DT); sim.update(DT);
    sim.players[1].pendingLevels++; // a second level waiting behind the first
    sim.openChest(sim.players[1]);
    sim.update(DT);
    expect(sim.shows.has(1)).toBe(false);
    expect(sim.events.some((e) => e.e === 'chest')).toBe(false);
    sim.choose(1, 0);
    sim.update(DT);
    expect(sim.shows.get(1)?.kind).toBe('chest');
    expect(sim.offers.has(1)).toBe(false);
    expect(sim.events.some((e) => e.e === 'chest' && e.player === 1)).toBe(true);
    tick(sim, sim.shows.get(1)!.dur + 0.1);
    expect(sim.offers.has(1)).toBe(true);
  });

  it('evolution plays as the player\'s own show and swaps the species at its end', () => {
    const sim = coop(2, 'squirtle');
    sim.level = 11;
    sim.xp = sim.xpNext + 1;
    sim.update(DT);
    expect(sim.phase).toBe('play');
    expect(sim.shows.get(0)?.kind).toBe('evolve');
    const t0 = sim.time;
    for (let i = 0; i < 60 * 10 && sim.players[0].speciesId === 'squirtle'; i++) {
      for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, 0);
      sim.update(DT);
    }
    expect(sim.players[0].speciesId).toBe('wartortle');
    expect(sim.players[1].speciesId).toBe('wartortle');
    expect(sim.time).toBeGreaterThan(t0 + 3);
  });

  it('Mega Evolution plays once as the player\'s own show while the run goes on', () => {
    const sim = coop();
    const p = sim.players[0];
    sim.invulnerable = true;
    p.speciesId = 'charizard'; p.stage = 2; p.types = ['fire', 'flying'];
    sim.megaStone = true;
    p.mega = 0.999;
    const t0 = sim.time;
    const shows = new Set<object>();
    for (let i = 0; i < 60 * 6 && p.megaT === 0; i++) {
      for (const q of sim.players) if (sim.offers.has(q.id)) sim.choose(q.id, 0);
      sim.update(DT);
      const c = sim.shows.get(0);
      if (c?.kind === 'mega') shows.add(c);
    }
    expect(p.megaT).toBeGreaterThan(0);
    expect(p.megas).toBe(1);
    expect(shows.size).toBe(1);
    expect(sim.phase).toBe('play');
    expect(sim.time).toBeGreaterThan(t0 + 2);
  });

  it('no hit-stop freezes the whole team', () => {
    const sim = coop();
    const e = spawnEnemy(sim, 'rattata', 100, 0, { elite: true })!;
    killEnemy(sim, e, 0);
    expect(sim.hitStop).toBe(0);
  });

  it('the final boss still ends the run in victory', () => {
    const sim = coop();
    const boss = spawnEnemy(sim, 'scyther', 100, 0, { boss: { species: 'scyther', at: 720, patterns: ['charge'], final: true } })!;
    killEnemy(sim, boss, 0);
    for (let i = 0; i < 60 * 20 && sim.phase !== 'victory'; i++) {
      for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, 0);
      sim.update(DT);
    }
    expect(sim.phase).toBe('victory');
  });

  it('solo still pauses for its cards', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 11, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    sim.update(DT);
    sim.xp = sim.xpNext + 1;
    sim.update(DT);
    expect(sim.phase).toBe('levelup');
  });
});
