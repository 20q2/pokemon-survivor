import { fbm, hash2 } from '../engine/noise.ts';

/**
 * Solid scenery (trees, boulders, machines, graves…) that blocks walking and flying shots.
 *
 * The field is generated, not stored: a pure function of the stage and a 32 px cell, so the host,
 * every client and the renderer agree on it without sending anything. The renderer only chooses
 * the sprite (tile-sheet or painted art) for each obstacle; position and size live here.
 *
 * Each obstacle is a circle around the base of the sprite (the trunk, not the canopy), so bodies
 * slide past rounded edges and can walk "behind" a tree's crown.
 */

export const OB_CELL = 32;
/** Collision circle sits this far above the sprite's foot point. */
const FOOT = 5;

export interface Obstacle {
  /** Sprite foot point (draw anchor, y-sort key). */
  x: number;
  y: number;
  /** Collision circle centre is (x, cy). */
  cy: number;
  r: number;
  /** 0..1, picks the sprite variant. */
  v: number;
}

interface Spec {
  r: number;
  density: number;
  /** Dense clumps (forests, rock fields) where the noise is high. */
  grove?: { scale: number; thr: number; density: number };
  /** Keep off this terrain field (the route's paths): same noise as the ground renderer's layer. */
  avoid?: { scale: number; thr: number; seed: number };
  /** World px kept free around the spawn point. */
  clear: number;
  seed: number;
}

const SPEC: Record<string, Spec> = {
  viridian: { r: 11, density: 0.02, grove: { scale: 7, thr: 0.6, density: 0.8 }, avoid: { scale: 22, thr: 0.035, seed: 111 }, clear: 80, seed: 11 },
  mtmoon: { r: 8, density: 0.035, grove: { scale: 6, thr: 0.68, density: 0.5 }, clear: 72, seed: 21 },
  seafoam: { r: 9, density: 0.03, grove: { scale: 6, thr: 0.68, density: 0.45 }, clear: 72, seed: 31 },
  powerplant: { r: 12, density: 0.02, grove: { scale: 7, thr: 0.7, density: 0.35 }, avoid: { scale: 20, thr: 0.035, seed: 141 }, clear: 80, seed: 41 },
  tower: { r: 7, density: 0.014, grove: { scale: 6, thr: 0.64, density: 0.3 }, avoid: { scale: 20, thr: 0.035, seed: 151 }, clear: 72, seed: 51 },
  cinnabar: { r: 10, density: 0.025, grove: { scale: 6, thr: 0.7, density: 0.4 }, clear: 72, seed: 61 },
  cerulean: { r: 9, density: 0.035, grove: { scale: 6, thr: 0.66, density: 0.5 }, clear: 72, seed: 71 },
};

/** Direct-mapped cell cache: 256×256 slots (an 8192 px window), tagged with the cell they hold. */
const CACHE_BITS = 8;
const CACHE_MASK = (1 << CACHE_BITS) - 1;
const EMPTY_TAG = 0x7fffffff;

export class Obstacles {
  private spec: Spec | undefined;
  private slot: (Obstacle | null)[] = new Array(1 << (CACHE_BITS * 2)).fill(null);
  private tagX = new Int32Array(1 << (CACHE_BITS * 2)).fill(EMPTY_TAG);
  private tagY = new Int32Array(1 << (CACHE_BITS * 2));
  /** Largest reach of an obstacle circle from its cell centre, for broad-phase cell ranges. */
  private reach: number;
  /** Outward normal of the last obstacle pushOut() resolved against. */
  nx = 0;
  ny = 0;

  constructor(stageId: string) {
    this.spec = SPEC[stageId];
    this.reach = (this.spec?.r ?? 0) + 8;
  }

  /** The obstacle in a 32 px cell, if any. */
  at(cx: number, cy: number): Obstacle | null {
    const i = ((cy & CACHE_MASK) << CACHE_BITS) | (cx & CACHE_MASK);
    if (this.tagX[i] === cx && this.tagY[i] === cy) return this.slot[i];
    const o = this.make(cx, cy);
    this.tagX[i] = cx;
    this.tagY[i] = cy;
    this.slot[i] = o;
    return o;
  }

  private make(cx: number, cy: number): Obstacle | null {
    const s = this.spec;
    if (!s) return null;
    let p = s.density;
    const grove = !!s.grove && fbm(cx * 2 / s.grove.scale, cy * 2 / s.grove.scale, s.seed + 50) > s.grove.thr;
    if (grove) p = s.grove!.density;
    if (hash2(cx, cy, s.seed + 999) >= p) return null;
    // loose scatter is jittered; groves sit on the grid so canopies interlock into walls
    const jx = grove ? 0 : Math.round((hash2(cx, cy, s.seed + 5) - 0.5) * 8);
    const jy = grove ? 0 : Math.round((hash2(cx, cy, s.seed + 6) - 0.5) * 8);
    const x = cx * OB_CELL + OB_CELL / 2 + jx;
    const y = cy * OB_CELL + 28 + jy;
    if (x * x + y * y < s.clear * s.clear) return null;
    if (s.avoid) {
      const a = s.avoid;
      // the cell's tile vertices plus one around, so trees also keep off the path's rim
      for (let ty = cy * 2 - 1; ty <= cy * 2 + 3; ty++) for (let tx = cx * 2 - 1; tx <= cx * 2 + 3; tx++) {
        if (Math.abs(fbm(tx / a.scale, ty / a.scale, a.seed) - 0.5) < a.thr) return null;
      }
    }
    return { x, y, cy: y - FOOT, r: s.r, v: hash2(cx, cy, s.seed + 77) };
  }

  /** Visit obstacles whose cells overlap a world rectangle. */
  each(x0: number, y0: number, x1: number, y1: number, f: (o: Obstacle) => void) {
    if (!this.spec) return;
    const pad = this.reach;
    for (let cy = Math.floor((y0 - pad) / OB_CELL); cy <= Math.floor((y1 + pad) / OB_CELL); cy++) {
      for (let cx = Math.floor((x0 - pad) / OB_CELL); cx <= Math.floor((x1 + pad) / OB_CELL); cx++) {
        const o = this.at(cx, cy);
        if (o) f(o);
      }
    }
  }

  /**
   * Move a body of radius `br` out of any obstacle it overlaps. Returns true on contact (with the
   * outward normal of the last one in nx/ny).
   */
  pushOut(b: { x: number; y: number }, br: number): boolean {
    const s = this.spec;
    if (!s) return false;
    let hit = false;
    const rr = s.r + br;
    // two passes settle the crease between two trunks
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      // collision centres lie within ±4 px of (cell·32 + 16, cell·32 + 23)
      const cx0 = Math.floor((b.x - rr - 20) / OB_CELL), cx1 = Math.floor((b.x + rr - 12) / OB_CELL);
      const cy0 = Math.floor((b.y - rr - 27) / OB_CELL), cy1 = Math.floor((b.y + rr - 19) / OB_CELL);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const o = this.at(cx, cy);
        if (!o) continue;
        const dx = b.x - o.x, dy = b.y - o.cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        // dead centre: push down (toward the camera) so it's deterministic
        const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
        b.x = o.x + nx * rr;
        b.y = o.cy + ny * rr;
        this.nx = nx;
        this.ny = ny;
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** No obstacle within `rad` of the point (room to stand and walk around). */
  clearAt(x: number, y: number, rad: number): boolean {
    let clear = true;
    this.each(x - rad, y - rad, x + rad, y + rad, (o) => {
      if (clear && (x - o.x) ** 2 + (y - o.cy) ** 2 < (o.r + rad) ** 2) clear = false;
    });
    return clear;
  }

  /** Is the point (a flying shot's centre) inside an obstacle? */
  blocks(x: number, y: number): boolean {
    const s = this.spec;
    if (!s) return false;
    const r = s.r;
    for (let cy = Math.floor((y - r - 27) / OB_CELL); cy <= Math.floor((y + r - 19) / OB_CELL); cy++) {
      for (let cx = Math.floor((x - r - 20) / OB_CELL); cx <= Math.floor((x + r - 12) / OB_CELL); cx++) {
        const o = this.at(cx, cy);
        if (o && (x - o.x) ** 2 + (y - o.cy) ** 2 < r * r) return true;
      }
    }
    return false;
  }
}
