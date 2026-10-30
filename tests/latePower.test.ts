import { describe, expect, it } from 'vitest';
import { MAX_MOVE_LEVEL, MOVE_LIST, moveStatsAt } from '../src/data/moves.ts';
import { VITAMINS, vitaminBonus } from '../src/data/items.ts';
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
      expect(vitaminBonus(v.id, 8)).toBeCloseTo(8 * v.rank, 5);
      expect(vitaminBonus(v.id, 10) - vitaminBonus(v.id, 9)).toBeLessThan(vitaminBonus(v.id, 9) - vitaminBonus(v.id, 8));
    }
  });
});
