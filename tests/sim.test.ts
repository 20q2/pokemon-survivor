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

describe('phase handling', () => {
  it('reaches victory when the final boss dies while another cinematic is queued', async () => {
    const { spawnEnemy, killEnemy } = await import('../src/game/enemies.ts');
    const sim = new Sim({ stageId: 'viridian', seed: 3, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const boss = spawnEnemy(sim, 'scyther', 100, 0, { boss: { species: 'scyther', at: 900, patterns: ['charge'], final: true } })!;
    sim.openChest(sim.players[0]);          // chest cinematic starts
    killEnemy(sim, boss, 0);                // boss-down cinematic queued behind it
    sim.xp = sim.xpNext + 1;                // and a level-up is pending
    for (let i = 0; i < 60 * 10 && sim.phase !== 'victory'; i++) {
      if (sim.phase === 'levelup') sim.choose(0, 0);
      else sim.update(DT);
    }
    expect(sim.phase).toBe('victory');
  });

  it('evolves at the threshold level and swaps species', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 4, players: [{ name: 'a', lineId: 'squirtle', shiny: false, meta: metaBonuses({}), tms: [] }] });
    sim.level = 11;
    sim.xp = sim.xpNext;
    for (let i = 0; i < 600 && sim.players[0].speciesId === 'squirtle'; i++) {
      if (sim.phase === 'levelup') sim.choose(0, 0);
      else sim.update(DT);
    }
    expect(sim.players[0].speciesId).toBe('wartortle');
  });

  it('Eevee evolves by dominant move type', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 5, players: [{ name: 'a', lineId: 'eevee', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    p.moves = [{ id: 'ember', level: 4, cd: 1, dmgDealt: 0, kills: 0 }, { id: 'swift', level: 2, cd: 1, dmgDealt: 0, kills: 0 }];
    sim.level = 13;
    sim.xp = sim.xpNext;
    for (let i = 0; i < 600 && p.speciesId === 'eevee'; i++) {
      if (sim.phase === 'levelup') sim.choose(0, 0);
      else sim.update(DT);
    }
    expect(p.speciesId).toBe('flareon');
  });
});
