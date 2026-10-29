import type { Sim } from './sim.ts';
import type { Player } from './types.ts';

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

/** Pick upgrades: new moves > move levels > items. */
export function botChoose(sim: Sim, p: Player): number {
  const offers = sim.offers.get(p.id);
  if (!offers) return 0;
  const score = (k: string) => ({ newMove: 4, moveUp: 3, newItem: 2.5, itemUp: 2, heal: 1, money: 0 }[k] ?? 0);
  let bi = 0;
  offers.forEach((o, i) => { if (score(o.kind) > score(offers[bi].kind)) bi = i; });
  return bi;
}
