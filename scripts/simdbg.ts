import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { botChoose, botSteer } from '../src/game/bot.ts';
const sim = new Sim({ stageId: 'viridian', seed: 1, players: [{ name: 'a', lineId: process.argv[2] ?? 'bulbasaur', shiny: false, meta: metaBonuses({}), tms: [] }] });
console.log('constructed', sim.phase);
for (let i = 0; i < 60 * 30; i++) {
  if (sim.phase === 'levelup') { for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, botChoose(sim, p)); continue; }
  for (const p of sim.players) { const m = botSteer(sim, p); p.mx = m.x; p.my = m.y; }
  sim.update(DT);
  if (i % 120 === 0) console.log(sim.phase, sim.time.toFixed(1), 'lvl', sim.level, 'en', sim.enemies.length, 'kills', sim.kills, 'proj', sim.projectiles.length, 'hp', sim.players[0].hp.toFixed(0), sim.players[0].moves.map(m=>m.id+':'+m.cd.toFixed(2)).join(','));
  sim.events.length = 0;
}
