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

describe('late-game systems', () => {
  const solo = (lineId: string, seed = 9) =>
    new Sim({ stageId: 'viridian', seed, players: [{ name: 'a', lineId, shiny: false, meta: metaBonuses({}), tms: [] }] });

  it('never runs out of meaningful level-ups: limit breaks and vitamins fill in, with diminishing returns', async () => {
    const { generateOffers, applyOffer } = await import('../src/game/levelup.ts');
    const { MAX_MOVE_LEVEL, moveStatsAt, MOVES } = await import('../src/data/moves.ts');
    const { vitaminBonus } = await import('../src/data/items.ts');
    const { Rng } = await import('../src/engine/math.ts');
    const sim = solo('charmander');
    const p = sim.players[0];
    p.moves = ['ember', 'flamethrower', 'fire-spin', 'flame-wheel'].map((id) => ({ id, level: MAX_MOVE_LEVEL, cd: 1, dmgDealt: 0, kills: 0 }));
    p.items = ['charcoal', 'scope-lens', 'wide-lens', 'leftovers'].map((id) => ({ id, level: 5 }));
    const rng = new Rng(1);
    for (let i = 0; i < 40; i++) {
      const offers = generateOffers(p, rng, 3, []);
      expect(offers.length).toBe(3);
      for (const o of offers) expect(o.kind === 'vitamin' || (o.kind === 'moveUp' && o.level > MAX_MOVE_LEVEL) || o.kind === 'heal').toBe(true);
      applyOffer(p, offers[0]);
    }
    const ember = p.moves.find((m) => m.id === 'ember')!;
    if (ember.level > MAX_MOVE_LEVEL + 1) {
      const a = moveStatsAt(MOVES.ember, ember.level - 1).power, b = moveStatsAt(MOVES.ember, ember.level).power;
      const c = moveStatsAt(MOVES.ember, MAX_MOVE_LEVEL).power, d = moveStatsAt(MOVES.ember, MAX_MOVE_LEVEL + 1).power;
      expect(b - a).toBeLessThan(d - c);
    }
    expect(vitaminBonus('protein', 2) - vitaminBonus('protein', 1)).toBeLessThan(vitaminBonus('protein', 1));
  });

  it('Mega Evolves once the stone is found and the meter fills, then reverts', () => {
    const sim = solo('charmander');
    const p = sim.players[0];
    sim.invulnerable = true;
    p.speciesId = 'charizard'; p.stage = 2; p.types = ['fire', 'flying'];
    sim.megaStone = true;
    p.mega = 0.999;
    let megaSeen = false;
    for (let i = 0; i < 60 * 30; i++) {
      if (sim.phase === 'levelup') { sim.choose(0, 0); continue; }
      sim.update(DT);
      if (p.megaT > 0) megaSeen = true;
      if (megaSeen && p.megaT === 0) break;
    }
    expect(megaSeen).toBe(true);
    expect(p.megas).toBe(1);
    expect(p.megaT).toBe(0);
    expect(p.types).toEqual(['fire', 'flying']);
  });

  it('places Alphas, treasure and the Mega Stone on the map over time', () => {
    const sim = solo('squirtle');
    sim.invulnerable = true;
    let alpha = false, stone = false, cache = false;
    for (let i = 0; i < 60 * 400; i++) {
      if (sim.phase === 'levelup') { sim.choose(0, 0); continue; }
      sim.update(DT);
      for (const e of sim.events) if (e.e === 'poi') { if (e.kind === 'alpha') alpha = true; if (e.kind === 'mega-stone') stone = true; if (e.kind === 'cache') cache = true; }
      sim.events.length = 0;
    }
    expect(alpha && stone && cache).toBe(true);
    expect(sim.enemies.some((e) => e.alpha && e.alive)).toBe(true);
  });
});

describe('playtest regressions', () => {
  it('a 12-minute no-meta Raichu run (even untouchable) neither floods gold nor runs out of upgrades by 6:00', async () => {
    const { generateOffers } = await import('../src/game/levelup.ts');
    const { runBonus } = await import('../src/meta/progression.ts');
    const { MAX_MOVE_LEVEL } = await import('../src/data/moves.ts');
    const { Rng } = await import('../src/engine/math.ts');
    const sim = new Sim({ stageId: 'viridian', seed: 42, players: [{ name: 'a', lineId: 'pichu', shiny: false, meta: metaBonuses({}), tms: [] }] });
    sim.invulnerable = true;
    const p = sim.players[0];
    let realAt6 = -1;
    while (sim.time < 720) {
      if (sim.phase === 'levelup') { sim.choose(0, botChoose(sim, p)); continue; }
      const m = botSteer(sim, p); p.mx = m.x; p.my = m.y;
      sim.update(DT);
      sim.events.length = 0;
      if (realAt6 < 0 && sim.time >= 360) {
        realAt6 = generateOffers(p, new Rng(1), 6, []).filter((o) => o.kind !== 'vitamin' && o.kind !== 'heal' && !(o.kind === 'moveUp' && o.level > MAX_MOVE_LEVEL)).length;
      }
    }
    const banked = sim.money * p.stats.money + runBonus({ stageId: 'viridian', time: sim.time, bosses: sim.bossesDefeated, cleared: false } as never);
    expect(banked, `banked ₽${Math.round(banked)}`).toBeLessThan(1000);
    expect(realAt6, 'real build upgrades still on offer at 6:00').toBeGreaterThan(0);
  }, 60_000);
});
