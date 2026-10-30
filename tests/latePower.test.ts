import { describe, expect, it } from 'vitest';
import { MAX_MOVE_LEVEL, MOVE_LIST, MOVES, moveStatsAt } from '../src/data/moves.ts';
import { ITEMS, ITEM_LIST, MAX_ITEM_LEVEL, VITAMINS, itemMaxLevel, vitaminBonus } from '../src/data/items.ts';
import { generateOffers, ownedUpgrades } from '../src/game/levelup.ts';
import { Rng } from '../src/engine/math.ts';
import { Sim } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { derivePlayerStats } from '../src/game/stats.ts';

const sim = () => new Sim({
  stageId: 'viridian', seed: 7,
  players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }],
});

/** Damage per volley: power times projectiles. */
const volley = (id: string, level: number) => {
  const s = moveStatsAt(MOVE_LIST.find((m) => m.id === id)!, level);
  return s.power * s.count;
};

describe('late-game power keeps growing', () => {
  it('a build with every move at +6 limit break deals 1.5x the damage of the same build at the max level', () => {
    const attacks = MOVE_LIST.filter((m) => m.cat !== 'status' && !m.mastery).map((m) => m.id);
    const at = (lv: number) => attacks.reduce((sum, id) => sum + volley(id, lv), 0);
    expect(at(MAX_MOVE_LEVEL + 6)).toBeGreaterThanOrEqual(1.5 * at(MAX_MOVE_LEVEL));
  });

  it('limit breaks are linear to +6 on power and keep adding after', () => {
    const pw = (n: number) => moveStatsAt(MOVE_LIST.find((m) => m.id === 'ember')!, MAX_MOVE_LEVEL + n).power;
    for (let n = 1; n <= 6; n++) expect(pw(n) / pw(0)).toBeCloseTo(1 + 0.08 * n, 5);
    expect(pw(7)).toBeGreaterThan(pw(6));
  });

  it('vitamin rank 8 is worth at least +40% of Attack, Sp. Atk and max HP', () => {
    const p = sim().players[0];
    for (const [id, stat] of [['protein', 'atk'], ['calcium', 'spa'], ['hp-up', 'maxHp']] as const) {
      const base = derivePlayerStats(p, 1, 0)[stat];
      p.vitamins[id] = 8;
      expect(derivePlayerStats(p, 1, 0)[stat] / base).toBeGreaterThanOrEqual(1.4);
      p.vitamins[id] = 0;
    }
  });

  it('every vitamin is linear to rank 8, then diminishing', () => {
    for (const v of VITAMINS) {
      expect(vitaminBonus(v.id, 8)).toBeCloseTo(8 * v.perRank, 5);
      expect(vitaminBonus(v.id, 10) - vitaminBonus(v.id, 9)).toBeLessThan(vitaminBonus(v.id, 9) - vitaminBonus(v.id, 8));
    }
  });

  it('a finished build never gets the same card twice in one level-up', () => {
    const p = sim().players[0];
    const mv = (id: string) => ({ id, level: MAX_MOVE_LEVEL, cd: 1, dmgDealt: 0, kills: 0 });
    p.moves = ['ember', 'flamethrower', 'substitute', 'metronome'].map(mv);
    p.items = ['scope-lens', 'wide-lens', 'leftovers', 'quick-claw'].map((id) => ({ id, level: itemMaxLevel(ITEMS[id]) }));
    for (let seed = 1; seed <= 60; seed++) {
      const offers = generateOffers(p, new Rng(seed), 3, []);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => `${o.kind}:${o.id}`)).size, JSON.stringify(offers)).toBe(3);
    }
  });

  it('items stop at their own useful level: Loaded Dice is capped at 3', () => {
    expect(itemMaxLevel(ITEMS['loaded-dice'])).toBe(3);
    expect(ITEM_LIST.filter((i) => i.id !== 'loaded-dice').every((i) => itemMaxLevel(i) === MAX_ITEM_LEVEL)).toBe(true);
    const p = sim().players[0];
    p.items = [{ id: 'loaded-dice', level: 3 }];
    p.itemSlots = 1;
    expect(ownedUpgrades(p).some((o) => o.kind === 'itemUp')).toBe(false);
    for (let seed = 1; seed <= 40; seed++) expect(generateOffers(p, new Rng(seed), 3, []).some((o) => o.kind === 'itemUp')).toBe(false);
  });

  it('a mastered projectile move gains projectiles from limit breaks, not area', () => {
    const base = moveStatsAt(MOVES.megahorn, MAX_MOVE_LEVEL), broken = moveStatsAt(MOVES.megahorn, MAX_MOVE_LEVEL + 3);
    expect(broken.count).toBe(base.count + 1);
    expect(broken.area).toBe(base.area);
  });
});
