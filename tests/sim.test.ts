import { describe, expect, it } from 'vitest';
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { botChoose, botSteer } from '../src/game/bot.ts';
import { LINES } from '../src/data/pokedex.ts';
import { STAGES } from '../src/data/stages.ts';

function run(lineId: string, stageId: string, seconds: number, players = 1) {
  const sim = new Sim({
    stageId, seed: 1234,
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, lineId, shiny: false, meta: metaBonuses({}), tms: [] })),
  });
  let steps = 0;
  while (sim.time < seconds && steps < seconds * 60 * 3) {
    steps++;
    if (sim.phase === 'levelup') {
      for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, botChoose(sim, p));
      continue;
    }
    if (sim.phase === 'over' || sim.phase === 'victory') break;
    for (const p of sim.players) { const m = botSteer(sim, p); p.mx = m.x; p.my = m.y; }
    sim.update(DT);
    sim.events.length = 0;
  }
  return sim;
}

describe('simulation smoke', () => {
  it('runs every line for 2 minutes without errors and progresses', () => {
    for (const l of LINES) {
      const sim = run(l.id, 'viridian', 120);
      expect(sim.kills, l.id).toBeGreaterThan(30);
      expect(sim.level, l.id).toBeGreaterThan(4);
      for (const p of sim.players) for (const m of p.moves) expect(Number.isFinite(m.cd)).toBe(true);
    }
  });

  it('runs every stage briefly with co-op players', () => {
    for (const st of STAGES) {
      const sim = run('charmander', st.id, 40, 3);
      expect(sim.enemies.length + sim.kills).toBeGreaterThan(10);
    }
  });
});
