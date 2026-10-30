// Replays the playtest report ("12-minute first run, no meta, Raichu → 12,000 ₽, out of
// upgrades at 5-6 min") across seeds and reports banked ₽ and when the build ran dry.
//   node scripts/economy.ts [line] [seconds] [seeds]
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { botChoose, botSteer } from '../src/game/bot.ts';
import { generateOffers } from '../src/game/levelup.ts';
import { applyRun } from '../src/meta/progression.ts';
import { freshSave } from '../src/meta/save.ts';
import { MAX_MOVE_LEVEL, MOVES } from '../src/data/moves.ts';
import { ITEMS, itemMaxLevel } from '../src/data/items.ts';
import { Rng } from '../src/engine/math.ts';
import type { RunSummary } from '../src/meta/achievements.ts';

const line = process.argv[2] ?? 'pichu';
const secs = +(process.argv[3] ?? 720);
const seeds = +(process.argv[4] ?? 5);
const react = +(process.env.REACT ?? 0.15);

for (let seed = 1; seed <= seeds; seed++) {
  const sim = new Sim({ stageId: 'viridian', seed: seed * 101, players: [{ name: 'bot', lineId: line, shiny: false, meta: metaBonuses({}), tms: [] }] });
  const p = sim.players[0];
  let steer = { x: 0, y: 0 }, steerT = 0, dryAt = -1, realPicks = 0, fillerPicks = 0;
  while (sim.time < secs && sim.phase !== 'over' && sim.phase !== 'victory') {
    if (sim.phase === 'levelup') {
      const o = sim.offers.get(0)!;
      const i = botChoose(sim, p);
      if (o[i].kind === 'vitamin' || (o[i].kind === 'moveUp' && o[i].level > MAX_MOVE_LEVEL)) fillerPicks++;
      else realPicks++;
      sim.choose(0, i);
      continue;
    }
    steerT -= DT;
    if (steerT <= 0) {
      steerT = react * (0.6 + Math.random() * 0.8);
      const m = botSteer(sim, p);
      const a = Math.atan2(m.y, m.x) + (Math.random() - 0.5) * 0.9;
      steer = m.x || m.y ? { x: Math.cos(a), y: Math.sin(a) } : m;
    }
    p.mx = steer.x; p.my = steer.y;
    sim.update(DT);
    sim.events.length = 0;
    if (dryAt < 0 && Math.floor(sim.time) % 10 === 0) {
      const offers = generateOffers(p, new Rng(1), 6, []);
      if (offers.every((o) => o.kind === 'vitamin' || o.kind === 'heal' || (o.kind === 'moveUp' && o.level > MAX_MOVE_LEVEL))) dryAt = sim.time;
    }
  }
  const save = freshSave();
  const summary: RunSummary = {
    stageId: 'viridian', lineId: line, finalSpecies: p.speciesId, shiny: false, time: sim.time, level: sim.level, kills: sim.kills,
    bosses: sim.bossesDefeated, cleared: sim.phase === 'victory', moneyEarned: Math.round(sim.money * p.stats.money), superEff: p.superEff,
    evolutions: p.evolutions, masteries: p.masteries, shinyKills: p.shinyKills, coop: false, firstHit: 0,
    maxedMoves: p.moves.filter((m) => m.level >= MAX_MOVE_LEVEL || MOVES[m.id].mastery).length,
    maxedItems: p.items.filter((i) => i.level >= itemMaxLevel(ITEMS[i.id])).length, stabOnly: false, defeatedChansey: false,
    died: sim.phase === 'over', elite: false, megas: p.megas, alphas: 0,
  };
  const r = applyRun(save, summary, sim.seenSpecies, sim.defeatedSpecies);
  const achMoney = save.money - r.money;
  console.log(
    `seed ${seed}: ${sim.phase.padEnd(7)} ${(sim.time / 60).toFixed(1)}m L${sim.level} ${p.speciesId}  ` +
    `banked ₽${r.money} (+₽${achMoney} achievements)  build dry @ ${dryAt < 0 ? 'never' : (dryAt / 60).toFixed(1) + 'm'}  ` +
    `picks: ${realPicks} build / ${fillerPicks} limit-break+vitamin  megas ${p.megas}
    achievements: ${r.newAchievements.map((a) => a.id).join(', ')}`,
  );
}
