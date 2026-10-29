// Headless balance runs: node scripts/balance.ts [stageId] [seconds] [lines,comma] [shopRanks]
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { botChoose, botSteer } from '../src/game/bot.ts';
import { LINES } from '../src/data/pokedex.ts';

const stage = process.argv[2] ?? 'viridian';
const secs = +(process.argv[3] ?? 900);
const lines = process.argv[4] ? process.argv[4].split(',') : LINES.map((l) => l.id);
const rank = +(process.argv[5] ?? 0);
const shop = rank ? Object.fromEntries(['protein', 'calcium', 'hp-up', 'iron', 'zinc', 'carbos', 'pp-up', 'exp-share'].map((k) => [k, rank])) : {};

for (const lineId of lines) {
  const t0 = performance.now();
  const sim = new Sim({ stageId: stage, seed: 7, players: [{ name: 'bot', lineId, shiny: false, meta: metaBonuses(shop), tms: [] }] });
  let maxEnemies = 0, worstStep = 0, steps = 0;
  while (sim.time < secs) {
    if (sim.phase === 'levelup') { for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, botChoose(sim, p)); continue; }
    if (sim.phase === 'over' || sim.phase === 'victory') break;
    for (const p of sim.players) { const m = botSteer(sim, p); p.mx = m.x; p.my = m.y; }
    const s0 = performance.now();
    sim.update(DT);
    worstStep = Math.max(worstStep, performance.now() - s0);
    steps++;
    sim.events.length = 0;
    maxEnemies = Math.max(maxEnemies, sim.enemies.length);
  }
  const p = sim.players[0];
  const ms = (performance.now() - t0) / Math.max(1, steps);
  console.log(
    `${lineId.padEnd(11)} ${sim.phase.padEnd(7)} t=${(sim.time / 60).toFixed(1)}m lvl=${sim.level} kills=${sim.kills} bosses=${sim.bossesDefeated} ` +
    `$=${sim.money} sp=${p.speciesId} maxEn=${maxEnemies} step=${ms.toFixed(2)}ms worst=${worstStep.toFixed(1)}ms\n   moves: ${p.moves.map((m) => `${m.id}${m.level}(${Math.round(m.dmgDealt / 1000)}k)`).join(' ')}\n   items: ${p.items.map((i) => i.id + i.level).join(' ')}`,
  );
}
