import { describe, expect, it } from 'vitest';
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { killEnemy } from '../src/game/enemyAI.ts';
import { martOffers, martPrice, offerSig } from '../src/game/levelup.ts';
import { Rng } from '../src/engine/math.ts';
import type { UpgradeOffer } from '../src/game/types.ts';

const make = (elite: boolean, seed = 7) => new Sim({
  stageId: 'viridian', seed, elite, startTime: 170,
  players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }],
});

/** Runs until the 3:00 boss exists, kills it and plays its cinematic out. */
function killFirstBoss(sim: Sim) {
  sim.invulnerable = true;
  for (let i = 0; i < 60 * 40 && !sim.enemies.some((e) => e.boss); i++) {
    if (sim.phase === 'levelup') sim.choose(0, sim.fallbackIndex(0)); else sim.update(DT);
  }
  const boss = sim.enemies.find((e) => e.boss)!;
  expect(boss, 'the 3:00 boss spawned').toBeTruthy();
  killEnemy(sim, boss, 0);
  for (let i = 0; i < 60 * 5 && sim.phase === 'cine'; i++) sim.update(DT);
  // Walk out any level-up that was already pending (not the mart).
  for (let i = 0; i < 20 && sim.phase === 'levelup' && !sim.inMart(); i++) sim.choose(0, 0);
}

describe('Elite Mode mart stop', () => {
  it('opens after a non-final boss with four priced cards and a free exit', () => {
    const sim = make(true);
    killFirstBoss(sim);
    expect(sim.phase).toBe('levelup');
    expect(sim.inMart()).toBe(true);
    const offers = sim.offers.get(0)!;
    expect(offers).toHaveLength(4);
    expect(offers.map((o) => o.cost)).toEqual([40, 80, 120, 0]);
    expect(offers[0].kind).toBe('heal');
    expect(offers[3].kind).toBe('keep');
  });

  it('does not open outside Elite Mode', () => {
    const sim = make(false);
    killFirstBoss(sim);
    expect(sim.inMart()).toBe(false);
  });

  it('an unaffordable pick is a no-op; a purchase pays and play resumes', () => {
    const sim = make(true);
    killFirstBoss(sim);
    sim.money = 30;
    sim.choose(0, 0); // heal costs 40
    expect(sim.phase).toBe('levelup');
    expect(sim.money).toBe(30);
    expect(sim.offers.has(0)).toBe(true);
    sim.money = 100;
    sim.choose(0, 0);
    expect(sim.money).toBe(60);
    expect(sim.phase).toBe('play');
    expect(sim.offers.size).toBe(0);
  });

  it('leaving is free even with no money', () => {
    const sim = make(true);
    killFirstBoss(sim);
    sim.money = 0;
    sim.choose(0, 3);
    expect(sim.phase).toBe('play');
    expect(sim.fallbackIndex(0)).toBe(0);
  });

  it('skip, reroll and banish are refused at the stop', () => {
    const sim = make(true);
    killFirstBoss(sim);
    const before = JSON.stringify(sim.offers.get(0));
    sim.players[0].skips = sim.players[0].rerolls = sim.players[0].banishes = 1;
    sim.skip(0); sim.reroll(0); sim.banish(0, 1);
    expect(JSON.stringify(sim.offers.get(0))).toBe(before);
  });

  it('two same-seed runs get identical offers', () => {
    const a = make(true), b = make(true);
    killFirstBoss(a); killFirstBoss(b);
    expect(a.offers.get(0)).toEqual(b.offers.get(0));
  });

  it('prices rise x1.5 per earlier visit', () => {
    const sim = make(true);
    const p = sim.players[0];
    const cost = (visit: number) => martOffers(p, new Rng(3), visit).map((o: UpgradeOffer) => o.cost);
    expect(cost(0)).toEqual([40, 80, 120, 0]);
    expect(cost(1)).toEqual([60, 120, 180, 0]);
    expect(cost(2)).toEqual([90, 180, 270, 0]);
    expect(martPrice(40, 1)).toBe(60);
  });
});

describe('offer signature', () => {
  const plain: UpgradeOffer[] = [{ kind: 'heal', id: 'oran-berry', level: 0 }];
  const priced: UpgradeOffer[] = [{ kind: 'heal', id: 'oran-berry', level: 0, cost: 40 }];
  it('ignores money for ordinary cards but not at a mart stop, so a money change un-hides stale cards', () => {
    expect(offerSig(plain, 10)).toBe(offerSig(plain, 99));
    expect(offerSig(priced, 10)).not.toBe(offerSig(priced, 99));
    expect(offerSig(priced, 10.4)).toBe(offerSig(priced, 10));
  });
});
