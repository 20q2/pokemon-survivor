// Pacing telemetry for a headless run: node scripts/pacing.ts [stageId] [lineId] [seconds] [seed]
// Every 30 s: level, level-ups and the longest gap between them, enemies alive / in view,
// kills, hit events per second, warnings, treasures, pauses (level-up + cinematics) and HP.
import { Sim, DT, xpForLevel } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { Rng } from '../src/engine/math.ts';
import { botChoose, botSteer } from '../src/game/bot.ts';

const stage = process.argv[2] ?? 'viridian';
const line = process.argv[3] ?? 'charmander';
const secs = +(process.argv[4] ?? 720);
const seed = +(process.argv[5] ?? 7);
const rng = new Rng(seed);
const sim = new Sim({ stageId: stage, seed, players: [{ name: 'bot', lineId: line, shiny: false, meta: metaBonuses({}), tms: [] }] });
let steer = { x: 0, y: 0 }, steerT = 0;
// Level-up gaps: the open 30 s window, then every gap of the run for the percentiles.
let lastLevelAt = 0, maxGap = 0, levelups = 0;
const gaps: number[] = [];
// Per-window counters, reset after each printed row.
let lastKills = 0, hits = 0, warns = 0, chests = 0, pauses = 0;
let inView = 0, peakView = 0, tickMs = 0, ticks = 0, samples = 0, alive = 0, hpSum = 0, next = 30;
/**
 * "Potential" level: the level that all banked xp plus every candy on the floor would buy, i.e. a player who
 * fetches every pile (the bot does not). Candy is scaled by the player's exp multiplier, as collecting it would be.
 */
const potential = (() => {
  const cum = [0, 0]; // cum[l] = xp spent reaching level l
  const spent = (l: number) => { while (cum.length <= l) cum.push(cum[cum.length - 1] + xpForLevel(cum.length - 1)); return cum[l]; };
  let level = 1, lastAt = 0, tick = 0;
  const gaps: number[] = [];
  return {
    gaps,
    get level() { return level; },
    // The floor sum walks every pickup, so sample every 3rd tick (50 ms is plenty for gap percentiles).
    sample(s: Sim) {
      if (++tick % 3) return;
      let floor = 0;
      for (const k of s.pickups) if (k.kind === 'candy' && !k.dead) floor += k.value;
      const total = spent(s.level) + s.xp + floor * s.players[0].stats.exp;
      while (total >= spent(level + 1)) { level++; gaps.push(s.time - lastAt); lastAt = s.time; }
    },
  };
})();
const col = (v: string | number, w: number) => String(v).padStart(w);
console.log('time  lvl  lvups  gap(s)  alive  inView  peak  ms/tick  kills/30s  hits/s  warns  chests  pauses  hp%');
while (sim.time < secs) {
  if (sim.phase === 'levelup') { pauses++; for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, botChoose(sim, p)); continue; }
  if (sim.phase === 'cine') { sim.update(DT); continue; }
  if (sim.phase === 'over' || sim.phase === 'victory') { console.log('END', sim.phase, sim.time.toFixed(1)); break; }
  steerT -= DT;
  if (steerT <= 0) {
    // Human-ish: re-decide a few times a second, with some wobble.
    steerT = 0.25 * (0.6 + rng.next() * 0.8);
    const m = botSteer(sim, sim.players[0]);
    const a = Math.atan2(m.y, m.x) + (rng.next() - 0.5) * 0.9;
    steer = m.x || m.y ? { x: Math.cos(a), y: Math.sin(a) } : m;
  }
  sim.players[0].mx = steer.x; sim.players[0].my = steer.y;
  const t0 = performance.now();
  sim.update(DT);
  tickMs += performance.now() - t0; ticks++;
  const p = sim.players[0];
  for (const ev of sim.events) {
    if (ev.e === 'levelup') { const g = sim.time - lastLevelAt; gaps.push(g); maxGap = Math.max(maxGap, g); lastLevelAt = sim.time; levelups++; }
    if (ev.e === 'hit') hits++;
    if (ev.e === 'warn') warns++;
    if (ev.e === 'chest') chests++;
  }
  sim.events.length = 0;
  potential.sample(sim);
  if (Math.round(sim.time * 60) % 30 === 0) {
    samples++; alive += sim.enemies.length; hpSum += p.hp / p.stats.maxHp;
    let v = 0;
    for (const e of sim.enemies) if (Math.abs(e.x - p.x) < p.viewW / 2 && Math.abs(e.y - p.y) < p.viewH / 2) v++;
    inView += v; peakView = Math.max(peakView, v);
  }
  if (sim.time >= next) {
    console.log(`${col(next, 4)}  ${col(sim.level, 3)}  ${col(levelups, 5)}  ${col(maxGap.toFixed(0), 6)}  ${col((alive / samples).toFixed(0), 5)}  ${col((inView / samples).toFixed(0), 6)}  ${col(peakView, 4)}  ${col((tickMs / Math.max(1, ticks)).toFixed(2), 7)}  ${col(sim.kills - lastKills, 9)}  ${col((hits / 30).toFixed(0), 6)}  ${col(warns, 5)}  ${col(chests, 6)}  ${col(pauses, 6)}  ${col((100 * hpSum / samples).toFixed(0), 3)}`);
    next += 30; lastKills = sim.kills; levelups = 0; maxGap = 0; hits = 0; warns = 0; chests = 0; pauses = 0; inView = 0; peakView = 0; tickMs = 0; ticks = 0; samples = 0; alive = 0; hpSum = 0;
  }
}
gaps.sort((a, b) => a - b);
const pctOf = (a: number[]) => (q: number) => a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))].toFixed(0) : '-';
const pct = pctOf(gaps);
const potGaps = potential.gaps.sort((a, b) => a - b);
const pp = pctOf(potGaps);
console.log(`level ${sim.level}  kills ${sim.kills}  level-up gap p50 ${pct(0.5)}s  p90 ${pct(0.9)}s  max ${gaps.length ? gaps[gaps.length - 1].toFixed(0) : '-'}s  seed ${seed}`);
console.log(`potential level ${potential.level}  potential level-up gap p50 ${pp(0.5)}s  p90 ${pp(0.9)}s  max ${potGaps.length ? potGaps[potGaps.length - 1].toFixed(0) : '-'}s`);
console.log('moves', sim.players[0].moves.map((m) => m.id + m.level).join(','), 'items', sim.players[0].items.map((i) => i.id + i.level).join(','));
