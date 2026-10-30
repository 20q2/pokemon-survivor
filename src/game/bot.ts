import { Rng } from '../engine/math.ts';
import type { Sim } from './sim.ts';
import type { Player, UpgradeOffer } from './types.ts';
import { MOVES, MASTERY_OF } from '../data/moves.ts';
import { HAZARD, hazardEscape } from './hazards.ts';

/** Picks break ties with noise; a fixed own stream keeps bot runs repeatable and the game's RNG untouched. */
const botRng = new Rng(0xb07);

/** Per bot: where it last was, how long it has barely moved, and an escape heading. */
const unstick = new WeakMap<Player, { x: number; y: number; still: number; t: number; ex: number; ey: number }>();

/** Simple kiting AI used for headless balance runs and attract-mode demos. */
export function botSteer(sim: Sim, p: Player): { x: number; y: number } {
  // Wedged in a pocket of scenery: commit to a fresh heading for a second.
  let u = unstick.get(p);
  if (!u) unstick.set(p, (u = { x: p.x, y: p.y, still: 0, t: 0, ex: 0, ey: 0 }));
  u.still = Math.hypot(p.x - u.x, p.y - u.y) < 0.4 ? u.still + 1 / 60 : 0;
  u.x = p.x;
  u.y = p.y;
  if (u.still > 0.5 && u.t <= 0) {
    const a = sim.time * 2.3 + p.id;
    u.ex = Math.cos(a);
    u.ey = Math.sin(a);
    u.t = 1;
    u.still = 0;
  }
  if (u.t > 0) {
    u.t -= 1 / 60;
    return around(sim, p, u.ex, u.ey);
  }
  let ax = 0, ay = 0, threat = 0;
  let cx = 0, cy = 0, cn = 0;
  sim.grid.query(p.x, p.y, 240, (e) => {
    const dx = p.x - e.x, dy = p.y - e.y;
    const d2 = dx * dx + dy * dy + 1;
    if (d2 < 80 * 80 || e.boss) {
      const w = (e.boss ? 8 : e.elite ? 2 : 1) / d2;
      ax += dx * w;
      ay += dy * w;
      threat += w;
    } else {
      cx += e.x; cy += e.y; cn++;
    }
  });
  let flee: { x: number; y: number } | null = null;
  for (const pr of sim.projectiles) {
    if (!pr.hostile) continue;
    if (pr.moveId === HAZARD) {
      // Standing in a marked area: getting out beats everything else.
      const out = hazardEscape(pr, p.x, p.y, p.radius);
      if (out) flee = flee ? { x: flee.x + out.x, y: flee.y + out.y } : out;
      continue;
    }
    const dx = p.x - pr.x, dy = p.y - pr.y;
    const d2 = dx * dx + dy * dy + 1;
    if (d2 < 100 * 100) { ax += (dx / d2) * 4; ay += (dy / d2) * 4; threat += 4 / d2; }
  }
  if (flee) {
    const l = Math.hypot(flee.x, flee.y);
    if (l > 1e-6) return { x: flee.x / l, y: flee.y / l };
  }
  const hpFrac = p.hp / p.stats.maxHp;
  let gx = 0, gy = 0;
  // Go for valuable pickups / healing when they're near.
  let best = (hpFrac < 0.5 ? 400 : 200) ** 2;
  for (const pk of sim.pickups) {
    if (pk.kind === 'candy' && pk.value < 3) continue;
    if (pk.kind === 'oran' && hpFrac > 0.8) continue;
    const dx = pk.x - p.x, dy = pk.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; gx = dx; gy = dy; }
  }
  if (!gx && !gy && hpFrac > 0.4) {
    // Head for map treasure and (above all) the Mega Stone when healthy.
    let bd = Infinity;
    for (const pk of sim.pickups) {
      if (pk.kind !== 'chest' && pk.kind !== 'dig' && pk.kind !== 'mega-stone') continue;
      const dx = pk.x - p.x, dy = pk.y - p.y;
      const d2 = (dx * dx + dy * dy) * (pk.kind === 'mega-stone' ? 0.1 : 1);
      if (d2 < bd && d2 < 1400 ** 2) { bd = d2; gx = dx; gy = dy; }
    }
  }
  if (!gx && !gy) {
    if (cn && hpFrac > 0.45) {
      // circle-strafe around the crowd so moves keep connecting
      const dx = cx / cn - p.x, dy = cy / cn - p.y;
      gx = dx * 0.4 - dy; gy = dy * 0.4 + dx;
    } else {
      gx = Math.cos(sim.time * 0.4); gy = Math.sin(sim.time * 0.4);
    }
  }
  const gl = Math.hypot(gx, gy) || 1;
  const tl = Math.hypot(ax, ay) || 1;
  const tw = Math.min(1, threat * 2500);
  const mx = (ax / tl) * tw + (gx / gl) * (1 - tw * 0.8);
  const my = (ay / tl) * tw + (gy / gl) * (1 - tw * 0.8);
  const l = Math.hypot(mx, my);
  return l > 1e-6 ? around(sim, p, mx / l, my / l) : { x: 0, y: 0 };
}

/** Feel ahead for scenery and turn toward the nearest clear heading (alternating sides). */
function around(sim: Sim, p: Player, x: number, y: number): { x: number; y: number } {
  const look = 26;
  for (let i = 0; i <= 12; i++) {
    const a = Math.ceil(i / 2) * (i & 1 ? 1 : -1) * (Math.PI / 12);
    const c = Math.cos(a), s = Math.sin(a);
    const rx = x * c - y * s, ry = x * s + y * c;
    if (sim.obstacles.clearAt(p.x + rx * look, p.y + ry * look, p.radius)) return { x: rx, y: ry };
  }
  return { x, y };
}

/**
 * "X wants to learn Y": swap out the weakest non-mastered move (status moves first) for a
 * damaging new move if it is low level; otherwise keep the current moves.
 */
function learnChoice(me: Player, offers: UpgradeOffer[]): number {
  const keep = offers.findIndex((o) => o.kind === 'keep');
  if (MOVES[offers[0].id].cat === 'status') return keep;
  let bi = -1, best = Infinity;
  offers.forEach((o, i) => {
    const m = o.kind === 'forget' ? me.moves[o.level] : undefined;
    if (!m || MOVES[m.id].mastery) return;
    const score = m.level - (MOVES[m.id].cat === 'status' ? 4 : 0);
    if (score < best) { best = score; bi = i; }
  });
  return bi >= 0 && best <= 4 ? bi : keep;
}

/** Pick upgrades: new moves > move levels > items. */
export function botChoose(sim: Sim, p: Player): number {
  const offers = sim.offers.get(p.id);
  if (!offers) return 0;
  if (offers[0].kind === 'forget' || offers[0].kind === 'keep') return learnChoice(p, offers);
  const score = (k: string) => ({ newMove: 4, moveUp: 3, newItem: 2.5, itemUp: 2, heal: 1, vitamin: 1.5 } as Record<string, number>)[k] ?? 0;
  // At a Poké Mart stop only affordable cards count; "Leave the mart" (free, last) is the floor.
  const value = (o: UpgradeOffer) => ((o.cost ?? 0) > sim.money ? -1 : score(o.kind));
  let bi = 0;
  offers.forEach((o, i) => { if (value(o) > value(offers[bi])) bi = i; });
  return value(offers[bi]) < 0 ? offers.length - 1 : bi;
}

/** Upgrade choice for the "auto-pick" option: works from any session's offers. */
export function autoChoice(s: { offers(): UpgradeOffer[] | null; world: { players: Player[]; money: number }; localId: number }): number {
  const offers = s.offers() ?? [];
  const me = s.world.players[s.localId];
  if (offers[0]?.kind === 'forget' || offers[0]?.kind === 'keep') return learnChoice(me, offers);
  const score = (o: UpgradeOffer) => {
    let v = ({ newMove: 40, moveUp: 30, newItem: 22, itemUp: 18, heal: 5, vitamin: 10 } as Record<string, number>)[o.kind] ?? 0;
    if (o.kind === 'heal') v = me.hp < me.stats.maxHp * 0.35 ? 60 : 5;
    if (o.kind === 'newMove' && me.types.includes(MOVES[o.id].type)) v += 8;
    if ((o.kind === 'newItem' || o.kind === 'itemUp') && me.moves.some((m) => MASTERY_OF[m.id]?.mastery?.item === o.id)) v += 25;
    if ((o.cost ?? 0) > s.world.money) v = -1000;
    return v + botRng.next() * 6;
  };
  let bi = 0;
  offers.forEach((o, i) => { if (score(o) > score(offers[bi])) bi = i; });
  return bi;
}
