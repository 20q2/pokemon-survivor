// Level-up card quality: node scripts/cards.ts [stageId] [lineId] [seed]
// Runs the seeded bot for 12 minutes and classifies every offered card:
//   real = new move/item or an upgrade below the max, limit = move limit break, vitamin, heal, other.
// Per minute: level-ups, cards by class and level-ups with no real card. Zero-real level-ups before 12:00 should stay under 10 %.
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { Rng } from '../src/engine/math.ts';
import { botChoose, botSteer } from '../src/game/bot.ts';
import { MAX_MOVE_LEVEL } from '../src/data/moves.ts';
import type { UpgradeOffer } from '../src/game/types.ts';

const stage = process.argv[2] ?? 'viridian';
const line = process.argv[3] ?? 'charmander';
const seed = +(process.argv[4] ?? 7);
const SECS = 720;
const CLASSES = ['real', 'limit', 'vitamin', 'heal', 'other'] as const;
type Cls = (typeof CLASSES)[number];

function classify(o: UpgradeOffer): Cls {
  switch (o.kind) {
    case 'newMove': case 'newItem': case 'itemUp': return 'real';
    case 'moveUp': return o.level > MAX_MOVE_LEVEL ? 'limit' : 'real';
    case 'vitamin': return 'vitamin';
    case 'heal': return 'heal';
    default: {
      const _exhaustive: 'forget' | 'keep' = o.kind;
      void _exhaustive;
      return 'other';
    }
  }
}

const rng = new Rng(seed);
const sim = new Sim({ stageId: stage, seed, players: [{ name: 'bot', lineId: line, shiny: false, meta: metaBonuses({}), tms: [] }] });
const mins = Array.from({ length: SECS / 60 }, () => ({ ups: 0, dead: 0, lvl: 0, cls: { real: 0, limit: 0, vitamin: 0, heal: 0, other: 0 } as Record<Cls, number> }));
let steer = { x: 0, y: 0 }, steerT = 0;
while (sim.time < SECS) {
  if (sim.phase === 'levelup') {
    for (const p of sim.players) {
      const offers = sim.offers.get(p.id);
      if (!offers) continue;
      // Forget/keep prompts are move-learning follow-ups, not level-up cards.
      if (offers[0].kind !== 'forget' && offers[0].kind !== 'keep') {
        const m = mins[Math.min(mins.length - 1, Math.floor(sim.time / 60))];
        const cls = offers.map(classify);
        m.ups++; m.lvl = sim.level;
        for (const c of cls) m.cls[c]++;
        if (!cls.includes('real')) m.dead++;
      }
      sim.choose(p.id, botChoose(sim, p));
    }
    continue;
  }
  if (sim.phase === 'cine') { sim.update(DT); continue; }
  if (sim.phase === 'over' || sim.phase === 'victory') { console.log('END', sim.phase, sim.time.toFixed(1)); break; }
  steerT -= DT;
  if (steerT <= 0) {
    steerT = 0.25 * (0.6 + rng.next() * 0.8);
    const m = botSteer(sim, sim.players[0]);
    const a = Math.atan2(m.y, m.x) + (rng.next() - 0.5) * 0.9;
    steer = m.x || m.y ? { x: Math.cos(a), y: Math.sin(a) } : m;
  }
  sim.players[0].mx = steer.x; sim.players[0].my = steer.y;
  sim.update(DT);
  sim.events.length = 0;
}

const col = (v: string | number, w: number) => String(v).padStart(w);
console.log('min  lvl  lvups  real  limit  vitamin  heal  other  zero-real');
mins.forEach((m, i) => console.log(`${col(i + 1, 3)} ${col(m.lvl, 4)} ${col(m.ups, 6)} ${col(m.cls.real, 5)} ${col(m.cls.limit, 6)} ${col(m.cls.vitamin, 8)} ${col(m.cls.heal, 5)} ${col(m.cls.other, 6)} ${col(m.dead, 10)}`));
const share = (a: typeof mins) => {
  const ups = a.reduce((s, m) => s + m.ups, 0), dead = a.reduce((s, m) => s + m.dead, 0);
  return `${dead}/${ups} (${ups ? ((100 * dead) / ups).toFixed(1) : '0.0'}%)`;
};
console.log(`${stage} ${line} seed ${seed}: zero-real level-ups before 12:00 ${share(mins.slice(0, 12))}, overall ${share(mins)}`);
