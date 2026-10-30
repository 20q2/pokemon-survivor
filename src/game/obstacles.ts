import { fbm, hash2 } from '../engine/noise.ts';

/**
 * Solid scenery (trees, boulders, machines, graves…) that blocks walking and flying shots.
 *
 * The field is generated, not stored: a pure function of the stage and a grid cell, so the host,
 * every client and the renderer agree on it without sending anything. The renderer only chooses
 * the sprite (tile-sheet or painted art) for each obstacle; position and size live here.
 *
 * Each stage's cell is as wide as its biggest scenery art, and an obstacle whose art box would
 * cover a neighbour's is dropped, so no two sprites overlap (the ground shadow below the foot
 * aside). Groves sit on the grid, so their trees stand edge to edge in rows.
 *
 * Each obstacle collides as a rounded box around the base of the sprite (the trunk, not the
 * canopy), so bodies slide past rounded edges and can walk "behind" a tree's crown. A lone one is
 * a circle; next to another the box reaches halfway to it, so rows and blocks of trees are solid
 * walls, with no slot between two trunks to slip through.
 *
 * Loose scatter also has small obstacles (rocks, stumps…): solid to bodies, but low enough that
 * shots fly over them. Walk-through decor (flowers, pebbles…) is render-only.
 */

/** Collision circle sits this far above the sprite's foot point. */
const FOOT = 5;
/** Loose scatter's jitter (± px), off when an orthogonal neighbour would make a row uneven. */
const JIT = 4;

export interface Obstacle {
  /** Sprite foot point (draw anchor, y-sort key). */
  x: number;
  y: number;
  /** Collision row: the box x0..x1 × y0..y1 (just the point (x, cy) when alone), rounded by r. */
  cy: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  r: number;
  /** 0..1, picks the sprite variant. */
  v: number;
  /** A small one: drawn from the biome's small art, and shots pass over it. */
  small?: boolean;
}

/** An art box: half-width, and height above the foot point (of the widest/tallest variant). */
interface Art { hw: number; up: number }

interface Spec {
  /** Grid cell (px): at least the art's width and height, so grove neighbours don't overlap. */
  cell: number;
  r: number;
  art: Art;
  density: number;
  /** Dense clumps (forests, rock fields) where the noise is high. Scale is in 16 px tiles. */
  grove?: { scale: number; thr: number; density: number };
  /** Small obstacles in the loose scatter (outside groves), with their own radius and art. */
  small?: { r: number; density: number; art: Art };
  /** Keep off this terrain field (the route's paths): same noise as the ground renderer's layer. */
  avoid?: { scale: number; thr: number; seed: number };
  /** World px kept free around the spawn point. */
  clear: number;
  seed: number;
}

// Art boxes are measured from the sprites in biomes.ts (tile-sheet and painted alike).
const SPEC: Record<string, Spec> = {
  viridian: { cell: 48, r: 11, art: { hw: 24, up: 47 }, density: 0.045, grove: { scale: 7, thr: 0.6, density: 0.8 }, small: { r: 7, density: 0.065, art: { hw: 8, up: 15 } }, avoid: { scale: 22, thr: 0.035, seed: 111 }, clear: 80, seed: 11 },
  mtmoon: { cell: 32, r: 8, art: { hw: 8, up: 15 }, density: 0.035, grove: { scale: 6, thr: 0.68, density: 0.5 }, clear: 72, seed: 21 },
  seafoam: { cell: 32, r: 9, art: { hw: 8, up: 15 }, density: 0.03, grove: { scale: 6, thr: 0.68, density: 0.45 }, small: { r: 10, density: 0.012, art: { hw: 16, up: 46 } }, clear: 72, seed: 31 },
  powerplant: { cell: 32, r: 12, art: { hw: 15, up: 46 }, density: 0.02, grove: { scale: 7, thr: 0.7, density: 0.35 }, small: { r: 7, density: 0.03, art: { hw: 7, up: 16 } }, avoid: { scale: 20, thr: 0.035, seed: 141 }, clear: 80, seed: 41 },
  tower: { cell: 32, r: 7, art: { hw: 11, up: 30 }, density: 0.014, grove: { scale: 6, thr: 0.64, density: 0.3 }, avoid: { scale: 20, thr: 0.035, seed: 151 }, clear: 72, seed: 51 },
  cinnabar: { cell: 32, r: 10, art: { hw: 13, up: 30 }, density: 0.025, grove: { scale: 6, thr: 0.7, density: 0.4 }, clear: 72, seed: 61 },
  cerulean: { cell: 32, r: 9, art: { hw: 8, up: 15 }, density: 0.035, grove: { scale: 6, thr: 0.66, density: 0.5 }, small: { r: 9, density: 0.015, art: { hw: 16, up: 30 } }, clear: 72, seed: 71 },
};

/** Before neighbours are weighed: whether the noise puts something in a cell, and what. */
interface Seed { grove: boolean; small: boolean }

/** After jitter, before overlap thinning. */
interface Candidate { x: number; y: number; small: boolean; art: Art; rank: number }

const CACHE_BITS = 8;
const CACHE_MASK = (1 << CACHE_BITS) - 1;

/** Direct-mapped cell cache: 256×256 slots, tagged with the cell they hold. */
class CellCache<T> {
  private slot: (T | null)[] = new Array(1 << (CACHE_BITS * 2)).fill(null);
  private tagX = new Int32Array(1 << (CACHE_BITS * 2)).fill(0x7fffffff);
  private tagY = new Int32Array(1 << (CACHE_BITS * 2));

  private make: (cx: number, cy: number) => T | null;

  constructor(make: (cx: number, cy: number) => T | null) {
    this.make = make;
  }

  get(cx: number, cy: number): T | null {
    const i = ((cy & CACHE_MASK) << CACHE_BITS) | (cx & CACHE_MASK);
    if (this.tagX[i] === cx && this.tagY[i] === cy) return this.slot[i];
    const v = this.make(cx, cy);
    this.tagX[i] = cx;
    this.tagY[i] = cy;
    this.slot[i] = v;
    return v;
  }
}

export class Obstacles {
  private spec: Spec | undefined;
  /** Grid cell size in world px. */
  readonly cell: number;
  private seeds = new CellCache<Seed>((cx, cy) => this.seedAt(cx, cy));
  private cands = new CellCache<Candidate>((cx, cy) => this.candidateAt(cx, cy));
  private obs = new CellCache<Obstacle>((cx, cy) => this.make(cx, cy));
  /** How far past its own cell an obstacle's collision can reach (jitter, both sides', plus radius). */
  private reach: number;
  /** Outward normal of the last obstacle pushOut() resolved against. */
  nx = 0;
  ny = 0;

  constructor(stageId: string) {
    this.spec = SPEC[stageId];
    this.cell = this.spec?.cell ?? 32;
    this.reach = Math.max(this.spec?.r ?? 0, this.spec?.small?.r ?? 0) + JIT * 2;
  }

  /** The obstacle whose foot lies in a grid cell, if any. */
  at(cx: number, cy: number): Obstacle | null {
    return this.obs.get(cx, cy);
  }

  private seedAt(cx: number, cy: number): Seed | null {
    const s = this.spec!;
    const k = s.cell / 16;
    let p = s.density;
    const grove = !!s.grove && fbm(cx * k / s.grove.scale, cy * k / s.grove.scale, s.seed + 50) > s.grove.thr;
    if (grove) p = s.grove!.density;
    const u = hash2(cx, cy, s.seed + 999);
    const small = !grove && !!s.small && u >= p && u < p + s.small.density;
    if (u >= p && !small) return null;
    const x = cx * s.cell + s.cell / 2, y = cy * s.cell + s.cell - 4;
    if (x * x + y * y < s.clear * s.clear) return null;
    if (s.avoid) {
      const a = s.avoid;
      // the cell's tile vertices plus one around, so scenery also keeps off the path's rim
      for (let ty = cy * k - 1; ty <= cy * k + k + 1; ty++) for (let tx = cx * k - 1; tx <= cx * k + k + 1; tx++) {
        if (Math.abs(fbm(tx / a.scale, ty / a.scale, a.seed) - 0.5) < a.thr) return null;
      }
    }
    return { grove, small };
  }

  private candidateAt(cx: number, cy: number): Candidate | null {
    const s = this.spec!;
    const seed = this.seeds.get(cx, cy);
    if (!seed) return null;
    // loose scatter is jittered unless it has an orthogonal neighbour to line up with; groves sit
    // on the grid so their trees stand in even rows
    const lined = seed.grove || !!(this.seeds.get(cx - 1, cy) || this.seeds.get(cx + 1, cy) || this.seeds.get(cx, cy - 1) || this.seeds.get(cx, cy + 1));
    const jx = lined ? 0 : Math.round((hash2(cx, cy, s.seed + 5) - 0.5) * JIT * 2);
    const jy = lined ? 0 : Math.round((hash2(cx, cy, s.seed + 6) - 0.5) * JIT * 2);
    return {
      x: cx * s.cell + s.cell / 2 + jx,
      y: cy * s.cell + s.cell - 4 + jy,
      small: seed.small,
      art: seed.small ? s.small!.art : s.art,
      // tall scenery wins an overlap with small; otherwise it's a coin toss
      rank: (seed.small ? 0 : 1) + hash2(cx, cy, s.seed + 31),
    };
  }

  /** A candidate survives unless its art would overlap the art of a neighbour that outranks it. */
  private kept(cx: number, cy: number): Candidate | null {
    const c = this.cands.get(cx, cy);
    if (!c) return null;
    // art up to ~1.5 cells tall reaches two rows up; jitter keeps it within one column
    for (let j = -2; j <= 2; j++) for (let i = -1; i <= 1; i++) {
      if (!i && !j) continue;
      const n = this.cands.get(cx + i, cy + j);
      if (!n || n.rank < c.rank) continue;
      if (Math.abs(n.x - c.x) < n.art.hw + c.art.hw && n.y - n.art.up < c.y && c.y - c.art.up < n.y) return null;
    }
    return c;
  }

  private make(cx: number, cy: number): Obstacle | null {
    const s = this.spec;
    if (!s) return null;
    const c = this.kept(cx, cy);
    if (!c) return null;
    const ccy = c.y - FOOT;
    const o: Obstacle = { x: c.x, y: c.y, cy: ccy, x0: c.x, x1: c.x, y0: ccy, y1: ccy, r: c.small ? s.small!.r : s.r, v: hash2(cx, cy, s.seed + 77) };
    if (c.small) o.small = true;
    // seal the gap to each orthogonal neighbour: both boxes reach the midpoint between them
    const l = this.kept(cx - 1, cy), rt = this.kept(cx + 1, cy), up = this.kept(cx, cy - 1), dn = this.kept(cx, cy + 1);
    if (l) o.x0 = (c.x + l.x) / 2;
    if (rt) o.x1 = (c.x + rt.x) / 2;
    if (up) o.y0 = (c.y + up.y) / 2 - FOOT;
    if (dn) o.y1 = (c.y + dn.y) / 2 - FOOT;
    return o;
  }

  /** Visit obstacles whose collision may reach into a world rectangle. */
  each(x0: number, y0: number, x1: number, y1: number, f: (o: Obstacle) => void) {
    if (!this.spec) return;
    const { cell, reach } = this;
    for (let cy = Math.floor((y0 - reach) / cell) - 1; cy <= Math.floor((y1 + reach) / cell) + 1; cy++) {
      for (let cx = Math.floor((x0 - reach) / cell) - 1; cx <= Math.floor((x1 + reach) / cell); cx++) {
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
    if (!this.spec) return false;
    let hit = false;
    // two passes settle the crease between two trunks
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      this.each(b.x - br, b.y - br, b.x + br, b.y + br, (o) => {
        const px = Math.max(o.x0, Math.min(o.x1, b.x)), py = Math.max(o.y0, Math.min(o.y1, b.y));
        const rr = o.r + br;
        const dx = b.x - px, dy = b.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) return;
        const d = Math.sqrt(d2);
        // dead centre: push down (toward the camera) so it's deterministic
        const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
        b.x = px + nx * rr;
        b.y = py + ny * rr;
        this.nx = nx;
        this.ny = ny;
        hit = moved = true;
      });
      if (!moved) break;
    }
    return hit;
  }

  /** No obstacle within `rad` of the point (room to stand and walk around). */
  clearAt(x: number, y: number, rad: number): boolean {
    let clear = true;
    this.each(x - rad, y - rad, x + rad, y + rad, (o) => {
      if (clear && boxDist2(o, x, y) < (o.r + rad) ** 2) clear = false;
    });
    return clear;
  }

  /** Is the point (a flying shot's centre) inside a tall obstacle? Shots fly over small ones. */
  blocks(x: number, y: number): boolean {
    let hit = false;
    this.each(x, y, x, y, (o) => {
      if (!hit && !o.small && boxDist2(o, x, y) < o.r * o.r) hit = true;
    });
    return hit;
  }
}

/** Squared distance from a point to an obstacle's collision box (0 inside it). */
function boxDist2(o: Obstacle, x: number, y: number): number {
  const dx = x - Math.max(o.x0, Math.min(o.x1, x)), dy = y - Math.max(o.y0, Math.min(o.y1, y));
  return dx * dx + dy * dy;
}
