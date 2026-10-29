import type { Sim } from './sim.ts';
import type { Player, UpgradeOffer } from './types.ts';
import { MOVES, MASTERY_OF } from '../data/moves.ts';

/** Simple kiting AI used for headless balance runs and attract-mode demos. */
export function botSteer(sim: Sim, p: Player): { x: number; y: number } {
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
  for (const pr of sim.projectiles) {
    if (!pr.hostile) continue;
    const dx = p.x - pr.x, dy = p.y - pr.y;
    const d2 = dx * dx + dy * dy + 1;
    if (d2 < 100 * 100) { ax += (dx / d2) * 4; ay += (dy / d2) * 4; threat += 4 / d2; }
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
      if (pk.kind !== 'chest' && pk.kind !== 'mega-stone') continue;
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
  return l > 1e-6 ? { x: mx / l, y: my / l } : { x: 0, y: 0 };
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
  let bi = 0;
  offers.forEach((o, i) => { if (score(o.kind) > score(offers[bi].kind)) bi = i; });
  return bi;
}

/** Upgrade choice for the "auto-pick" option: works from any session's offers. */
export function autoChoice(s: { offers(): UpgradeOffer[] | null; world: { players: Player[] }; localId: number }): number {
  const offers = s.offers() ?? [];
  const me = s.world.players[s.localId];
  if (offers[0]?.kind === 'forget' || offers[0]?.kind === 'keep') return learnChoice(me, offers);
  const score = (o: UpgradeOffer) => {
    let v = ({ newMove: 40, moveUp: 30, newItem: 22, itemUp: 18, heal: 5, vitamin: 10 } as Record<string, number>)[o.kind] ?? 0;
    if (o.kind === 'heal') v = me.hp < me.stats.maxHp * 0.35 ? 60 : 5;
    if (o.kind === 'newMove' && me.types.includes(MOVES[o.id].type)) v += 8;
    if ((o.kind === 'newItem' || o.kind === 'itemUp') && me.moves.some((m) => MASTERY_OF[m.id]?.mastery?.item === o.id)) v += 25;
    return v + Math.random() * 6;
  };
  let bi = 0;
  offers.forEach((o, i) => { if (score(o) > score(offers[bi])) bi = i; });
  return bi;
}
