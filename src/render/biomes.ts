import { Ink, mix, PRng, T, Tex, type Ramp } from './pixelart.ts';

/**
 * Per-route look: a base ground material, up to two autotiled terrain layers on top (patches or
 * winding paths, with a rim where they meet the layer below), and props scattered on a tile grid
 * (some in dense groves). All tiles and props are original art painted by pixelart.ts.
 */

export interface Material { variants: Tex[]; weights: number[] }

export interface Field {
  /** Tiles per noise unit (bigger = larger features). */
  scale: number;
  /** blob: noise > thr. ridge: |noise - 0.5| < thr (winding paths). */
  kind: 'blob' | 'ridge';
  thr: number;
}

export interface Layer { mat: Material; field: Field; rim?: string; shade?: boolean }

export interface PropSprite { frames: HTMLCanvasElement[]; ax: number; ay: number; tall: boolean; fps: number }

export interface PropSpec {
  sprites: PropSprite[];
  /** Grid step in tiles (2 for trees, so canopies tile into forest walls). */
  cell: 1 | 2;
  density: number;
  /** Terrain layers the prop may stand on (0 = base, 1, 2 = overlays). */
  on: number[];
  grove?: { scale: number; thr: number; density: number };
  /** Keep this many world px around spawn clear. */
  clear?: number;
}

export interface Biome { base: Material; layers: Layer[]; props: PropSpec[]; seed: number }

// ─────────────────────────── ground materials ───────────────────────────

interface Pal { o: string; d: string; m: string; l: string; h: string }
const P = (o: string, d: string, m: string, l: string, h: string): Pal => ({ o, d, m, l, h });

function material(n: number, seed: number, weights: number[], paint: (t: Tex, r: PRng, v: number) => Tex): Material {
  const variants: Tex[] = [];
  for (let v = 0; v < n; v++) variants.push(paint(new Tex('#000000'), new PRng(seed * 97 + v * 31 + 1), v));
  return { variants, weights };
}

function fill(t: Tex, hex: string) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t.set(x, y, hex); }

/** Short grass: flat colour with small "v" blade marks. */
const grass = (p: Pal, seed: number) => material(4, seed, [5, 3, 3, 1], (t, r, v) => {
  fill(t, p.m);
  const marks = [1, 2, 3, 0][v];
  for (let i = 0; i < marks; i++) {
    const x = r.int(0, 15), y = r.int(1, 14);
    t.set(x, y, p.d); t.set(x + 1, y + 1, p.d); t.set(x + 2, y, p.d);
    t.set(x, y - 1, p.l); t.set(x + 2, y - 1, p.l);
  }
  for (let i = 0; i < (v === 3 ? 6 : 2); i++) t.set(r.int(0, 15), r.int(0, 15), v === 3 ? p.d : p.l);
  if (v === 2) t.set(r.int(0, 15), r.int(0, 15), p.h);
  return t;
});

/** Tall grass: dense brick-offset tufts of pointed blades. */
const tallGrass = (p: Pal, seed: number) => material(3, seed, [4, 3, 2], (t, r) => {
  fill(t, p.d);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const ox = col * 8 + (row ? 4 : 0), oy = row * 8;
    for (const [bx, hgt] of [[0, 5 + r.int(0, 1)], [3, 7], [6, 5 + r.int(0, 1)]] as const) {
      for (let k = 0; k < hgt; k++) {
        const y = oy + 7 - k;
        const upper = k > hgt / 2;
        t.set(ox + bx, y, upper ? p.l : p.m);
        t.set(ox + bx + 1, y, upper ? p.m : p.d);
      }
      t.set(ox + bx, oy + 7 - hgt, p.o);
      t.set(ox + bx + 1, oy + 8 - hgt, p.h);
      t.set(ox + bx + 2, oy + 7, p.o);
    }
  }
  return t;
});

/** Dirt / ash / sand: pebbles and specks. */
const dirt = (p: Pal, seed: number, pebbles = 3) => material(4, seed, [4, 3, 3, 2], (t, r, v) => {
  fill(t, p.m);
  for (let i = 0; i < pebbles + (v === 3 ? 2 : 0); i++) {
    const x = r.int(0, 15), y = r.int(0, 14);
    t.set(x, y, p.l); t.set(x + 1, y, p.h); t.set(x + 1, y + 1, p.d); t.set(x, y + 1, p.d);
  }
  for (let i = 0; i < 5; i++) t.set(r.int(0, 15), r.int(0, 15), r.chance(0.5) ? p.d : p.l);
  if (v === 1) for (let i = 0; i < 4; i++) t.set(r.int(0, 15), r.int(0, 15), p.o);
  return t;
});

/** Sand / snow: soft wind ripples. */
const ripples = (p: Pal, seed: number) => material(3, seed, [4, 3, 2], (t, r, v) => {
  fill(t, p.m);
  for (let i = 0; i < 2 + v; i++) {
    const x = r.int(0, 15), y = r.int(0, 14), len = r.int(3, 6);
    for (let k = 0; k < len; k++) { t.set(x + k, y, p.l); t.set(x + k + 1, y + 1, p.d); }
  }
  for (let i = 0; i < 3; i++) t.set(r.int(0, 15), r.int(0, 15), p.h);
  return t;
});

/** Ice: glossy diagonal glints. */
const ice = (p: Pal, seed: number) => material(4, seed, [4, 3, 2, 2], (t, r, v) => {
  fill(t, p.m);
  for (let i = 0; i < (v === 0 ? 1 : 2); i++) {
    const x = r.int(0, 15), y = r.int(4, 15), len = r.int(3, 6);
    for (let k = 0; k < len; k++) t.set(x + k, y - k, k === len - 1 ? p.h : p.l);
  }
  if (v === 3) for (let k = 0; k < 6; k++) t.set(r.int(0, 15), r.int(0, 15), p.d);
  return t;
});

/** Cave / volcanic rock floor: lit cracks and pebbles. `glow` turns cracks into magma seams. */
const rockFloor = (p: Pal, seed: number, glow?: [string, string]) => material(4, seed, [4, 3, 3, 2], (t, r, v) => {
  fill(t, p.m);
  if (v > 0) {
    let x = r.int(0, 15), y = r.int(0, 15);
    for (let k = 0; k < 6 + v * 2; k++) {
      t.set(x, y, glow ? glow[0] : p.d);
      t.set(x, y + 1, glow ? p.d : p.l);
      if (glow && k % 3 === 1) t.set(x, y, glow[1]);
      x += r.pick([-1, 1, 1]); y += r.pick([-1, 0, 1]);
    }
  }
  for (let i = 0; i < 2; i++) {
    const x = r.int(0, 15), y = r.int(0, 14);
    t.set(x, y, p.l); t.set(x + 1, y + 1, p.d);
  }
  for (let i = 0; i < 4; i++) t.set(r.int(0, 15), r.int(0, 15), r.chance(0.5) ? p.d : p.l);
  return t;
});

/** Rubble: lumpy bumps (lit top-left, dark bottom-right). */
const rubble = (p: Pal, seed: number) => material(3, seed, [3, 3, 2], (t, r) => {
  fill(t, p.m);
  for (let i = 0; i < 5; i++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    t.set(x, y, p.l); t.set(x + 1, y, p.h); t.set(x, y + 1, p.m); t.set(x + 1, y + 1, p.d); t.set(x + 2, y + 1, p.o); t.set(x + 1, y + 2, p.o);
  }
  return t;
});

/** Riveted metal floor plates; variants with vents and scuffs. */
const metal = (p: Pal, seed: number) => material(3, seed, [5, 2, 3], (t, r, v) => {
  fill(t, p.m);
  for (let i = 0; i < T; i++) { t.set(i, 0, p.l); t.set(0, i, p.l); t.set(i, 15, p.d); t.set(15, i, p.d); }
  t.set(15, 0, p.m); t.set(0, 15, p.m);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { t.set(x, y, p.h); t.set(x + 1, y + 1, p.o); }
  if (v === 1) for (let y = 5; y <= 11; y += 2) for (let x = 4; x <= 11; x++) { t.set(x, y, p.o); t.set(x, y + 1, p.l); }
  if (v === 2) for (let i = 0; i < 4; i++) { const x = r.int(3, 12), y = r.int(3, 12); t.set(x, y, p.d); t.set(x + 1, y, p.d); }
  return t;
});

/** Steel floor grating (a walkway layer): lit bars over a dark pit. */
const grate = (p: Pal) => material(1, 1, [1], (t) => {
  fill(t, p.o);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const bx = x % 4 === 0, by = y % 4 === 0;
    if (bx && by) t.set(x, y, p.h);
    else if (by) t.set(x, y, p.l);
    else if (bx) t.set(x, y, p.m);
    else if (x % 4 === 1 && y % 4 === 1) t.set(x, y, p.d);
  }
  return t;
});

/** Bevelled stone floor tiles in a 2×2 grid. */
const stoneTiles = (p: Pal, seed: number) => material(3, seed, [5, 2, 2], (t, r, v) => {
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const dark = v === 1 && tx === ty;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const X = tx * 8 + x, Y = ty * 8 + y;
      t.set(X, Y, x === 0 || y === 0 ? p.l : x === 7 || y === 7 ? p.o : dark ? p.d : p.m);
    }
    t.set(tx * 8 + 1, ty * 8 + 1, p.h);
  }
  if (v === 2) { let x = r.int(2, 13), y = r.int(2, 13); for (let k = 0; k < 5; k++) { t.set(x, y, p.o); x += r.pick([-1, 1]); y++; } }
  return t;
});

/** Woven carpet with a small diamond motif. */
const carpet = (p: Pal) => material(1, 1, [1], (t) => {
  fill(t, p.m);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x + y) % 4 === 0 && (x - y + 16) % 4 === 0) t.set(x, y, p.d);
  const dia = [[8, 5], [7, 6], [9, 6], [6, 7], [10, 7], [7, 8], [9, 8], [8, 9]];
  for (const [x, y] of dia) t.set(x, y + 1, p.l);
  t.set(8, 8, p.h);
  return t;
});

/** Glossy wet rock with streak highlights. */
const wetRock = (p: Pal, seed: number) => material(3, seed, [3, 3, 2], (t, r, v) => {
  fill(t, p.m);
  for (let i = 0; i < 2 + v; i++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    t.set(x, y, p.l); t.set(x + 1, y, p.l); t.set(x + 2, y, p.h); t.set(x, y + 1, p.d);
  }
  return t;
});

// ─────────────────────────── props ───────────────────────────

const one = (c: HTMLCanvasElement, ax: number, ay: number, tall: boolean): PropSprite => ({ frames: [c], ax, ay, tall, fps: 0 });

const BARK: Ramp = ['#3a2416', '#5c3a22', '#7a5030', '#946a40', '#b08450'];

/** Broadleaf tree: lobed canopy with leaf-cluster marks. 32×44, anchored at the trunk base. */
function tree(r: PRng, leaf: Ramp, fruit?: string): PropSprite {
  const k = new Ink(34, 46);
  k.shadow(17, 42, 13, 3);
  k.column(14, 30, 6, 12, BARK);
  k.set(13, 41, BARK[1], BARK); k.set(20, 41, BARK[1], BARK); k.set(12, 41, BARK[2], BARK);
  const lobes: [number, number, number, number][] = [
    [9, 24, 8, 6], [25, 24, 8, 6], [17, 26, 9, 5],
    [17, 17, 15, 11],
    [10, 13, 7, 6], [24, 12, 7, 6], [17, 8, 9, 7],
  ];
  for (const [x, y, rx, ry] of lobes) k.blob(x + r.int(-1, 1) * 0, y, rx, ry, leaf, true, y < 12 ? 0.12 : y > 22 ? -0.15 : 0);
  // leaf clusters: little dark "c" marks on the lit body
  for (let i = 0; i < 22; i++) {
    const x = r.int(5, 29), y = r.int(4, 28);
    if (!k.filled(x, y) || !k.filled(x + 2, y + 1)) continue;
    k.mark(x, y + 1, leaf[1]); k.mark(x + 1, y + 1, leaf[1]); k.mark(x + 1, y, leaf[3]);
  }
  if (fruit) for (let i = 0; i < 3; i++) { const x = r.int(8, 25), y = r.int(10, 26); if (k.filled(x, y) && k.filled(x + 1, y + 1)) { k.mark(x, y, fruit); k.mark(x + 1, y, fruit); k.mark(x, y + 1, mix(fruit, '#000000', 0.35)); k.mark(x + 1, y + 1, mix(fruit, '#000000', 0.35)); } }
  return one(k.finish(), 17, 42, true);
}

/** Conifer: three stacked tiers. */
function pine(leaf: Ramp): PropSprite {
  const k = new Ink(26, 46);
  k.shadow(13, 42, 10, 3);
  k.column(11, 34, 4, 8, BARK);
  for (const [by, h, hw] of [[36, 14, 12], [27, 13, 10], [18, 13, 7]] as const) k.spike(13, by, h, hw, leaf);
  return one(k.finish(), 13, 42, true);
}

function bush(leaf: Ramp, berry?: string): PropSprite {
  const k = new Ink(22, 16);
  k.shadow(11, 14, 9, 2);
  k.blob(6, 9, 6, 5, leaf, true); k.blob(15, 9, 6, 5, leaf, true); k.blob(10, 6, 6, 5, leaf, false, 0.1);
  if (berry) for (const [x, y] of [[5, 8], [13, 6], [16, 10]]) { k.mark(x, y, berry); k.mark(x + 1, y + 1, mix(berry, '#000000', 0.4)); }
  return one(k.finish(), 11, 14, false);
}

/** Small flower patch with a two-frame sway. */
function flowers(r: PRng, petal: Ramp, stem: string): PropSprite {
  const spots = [[r.int(2, 5), r.int(3, 6)], [r.int(9, 13), r.int(2, 5)], [r.int(5, 10), r.int(9, 12)]];
  const frames = [0, 1].map((f) => {
    const k = new Ink(16, 16);
    for (const [x, y] of spots) {
      k.set(x, y + 2, stem, petal); k.set(x, y + 3, stem, petal);
      const sway = f === 1 ? 1 : 0;
      const cx = x + sway * 0;
      if (f === 0) { k.set(cx - 1, y, petal[3], petal); k.set(cx + 1, y, petal[3], petal); k.set(cx, y - 1, petal[4], petal); k.set(cx, y + 1, petal[2], petal); }
      else { k.set(cx - 1, y - 1, petal[3], petal); k.set(cx + 1, y - 1, petal[4], petal); k.set(cx - 1, y + 1, petal[2], petal); k.set(cx + 1, y + 1, petal[2], petal); }
      k.set(cx, y, '#f8e070', petal);
    }
    return k.finish();
  });
  return { frames, ax: 8, ay: 14, tall: false, fps: 1.6 };
}

function mushroom(cap: Ramp): PropSprite {
  const k = new Ink(14, 14);
  k.shadow(7, 12, 5, 1);
  k.column(5, 6, 4, 6, ['#6a5a48', '#bfae94', '#e0d2b8', '#f2e8d4', '#ffffff']);
  k.blob(7, 5, 6, 4, cap, false, 0.05);
  k.mark(4, 4, '#ffffff'); k.mark(8, 3, '#ffffff'); k.mark(10, 5, '#ffffff');
  return one(k.finish(), 7, 12, false);
}

function stump(): PropSprite {
  const k = new Ink(18, 14);
  k.shadow(9, 12, 8, 2);
  k.column(2, 5, 14, 7, BARK);
  k.blob(9, 5, 7, 3, ['#3a2416', '#a07848', '#c8a070', '#dcc090', '#ecd8a8']);
  k.mark(9, 5, '#a07848'); k.mark(8, 5, '#a07848');
  return one(k.finish(), 9, 12, false);
}

function boulder(r: PRng, stone: Ramp, w = 26): PropSprite {
  const h = Math.round(w * 0.8);
  const k = new Ink(w + 2, h + 2);
  const cx = (w + 2) / 2;
  k.shadow(cx, h - 1, w / 2 - 1, 2);
  k.blob(cx, h * 0.58, w / 2 - 1, h * 0.38, stone, true);
  k.blob(cx - w * 0.16, h * 0.42, w * 0.26, h * 0.26, stone, true, 0.1);
  if (r.chance(0.6)) k.blob(cx + w * 0.2, h * 0.45, w * 0.2, h * 0.22, stone, true, 0.05);
  // a crack
  let x = Math.round(cx + r.int(-3, 3)), y = Math.round(h * 0.4);
  for (let i = 0; i < 4; i++) { k.mark(x, y, stone[1]); x += r.pick([-1, 1]); y++; }
  return one(k.finish(), Math.round(cx), h - 1, w >= 20);
}

function pebbles(r: PRng, stone: Ramp): PropSprite {
  const k = new Ink(16, 10);
  for (let i = 0; i < 3; i++) k.blob(r.int(3, 12), r.int(4, 6), r.int(2, 3), 2, stone);
  return one(k.finish(), 8, 7, false);
}

function stalagmite(r: PRng, stone: Ramp): PropSprite {
  const k = new Ink(20, 36);
  k.shadow(10, 33, 8, 2);
  k.spike(10, 33, 30, 6, stone, r.int(-2, 2));
  k.spike(5, 33, 10, 3, stone);
  k.spike(15, 33, 13, 3, stone);
  return one(k.finish(), 10, 33, true);
}

/** Crystal cluster with a travelling sparkle. */
function crystal(r: PRng, gem: Ramp): PropSprite {
  const shards: [number, number, number, number][] = [[12, 24, 4, 0], [6, 14, 3, -2], [18, 16, 3, 2], [9, 10, 2, -1]];
  const frames = [0, 1, 2, 3].map((f) => {
    const k = new Ink(24, 32);
    k.shadow(12, 29, 9, 2);
    k.glow(12, 18, gem[3], 0.18);
    for (const [x, h, w, lean] of shards) {
      for (let i = 0; i < h; i++) {
        const y = 29 - i;
        const ww = i > h - w ? Math.max(1, h - i) : w;
        const c = x + Math.round((lean * i) / h);
        for (let dx = -ww; dx < ww; dx++) k.set(c + dx, y, dx < -ww / 2 ? gem[4] : dx < 0 ? gem[3] : dx < ww / 2 ? gem[2] : gem[1], gem);
      }
    }
    const [sx, sh] = shards[f % shards.length];
    const sy = 29 - Math.floor(sh * 0.7);
    k.mark(sx - 1, sy, '#ffffff'); k.mark(sx - 1, sy - 1, '#ffffff'); k.mark(sx - 2, sy, '#ffffff');
    return k.finish();
  });
  void r;
  return { frames, ax: 12, ay: 29, tall: true, fps: 2.5 };
}

function bones(): PropSprite {
  const B: Ramp = ['#6a6458', '#b8b0a0', '#d8d0c0', '#ece6d8', '#ffffff'];
  const k = new Ink(18, 12);
  k.rect(4, 5, 10, 2, B[3], B);
  k.blob(4, 5, 2, 2, B); k.blob(14, 6, 2, 2, B);
  k.blob(8, 9, 2.5, 2, B);
  return one(k.finish(), 9, 9, false);
}

function shell(r: PRng): PropSprite {
  const pal: Ramp = r.chance(0.5) ? ['#6a6a7a', '#a8a8b8', '#c8c8d4', '#e4e4ec', '#ffffff'] : ['#7a6a5a', '#b8a490', '#d4c4b0', '#ece0d0', '#ffffff'];
  const k = new Ink(12, 9);
  k.blob(6, 5, 5, 3, pal, false, 0.1);
  k.rect(5, 7, 2, 1, pal[2], pal);
  for (const x of [3, 5, 7, 9]) { k.mark(x, 4, pal[1]); k.mark(x, 5, pal[1]); }
  return one(k.finish(), 6, 8, false);
}

function iceSpike(r: PRng): PropSprite {
  const ICE: Ramp = ['#3a6a90', '#78b0d8', '#a8d8f0', '#d8f0ff', '#ffffff'];
  const k = new Ink(24, 34);
  k.shadow(12, 31, 9, 2);
  k.spike(12, 31, 26, 6, ICE, r.int(-2, 2));
  k.spike(6, 31, 14, 4, ICE, -1);
  k.spike(18, 31, 16, 4, ICE, 2);
  return one(k.finish(), 12, 31, true);
}

function snowPile(): PropSprite {
  const S: Ramp = ['#6a90b0', '#b0d0e8', '#e0f0fa', '#f4fbff', '#ffffff'];
  const k = new Ink(22, 12);
  k.blob(11, 8, 10, 4, S, false, 0.15); k.blob(8, 6, 5, 3, S, false, 0.2);
  return one(k.finish(), 11, 10, false);
}

function puddle(water: Ramp): PropSprite {
  const frames = [0, 1, 2].map((f) => {
    const k = new Ink(30, 14);
    k.blob(15, 7, 14, 6, [water[0], water[1], water[1], water[2], water[2]]);
    k.blob(14, 6, 10, 4, [water[0], water[2], water[2], water[2], water[3]]);
    for (let i = 0; i < 3; i++) k.mark(9 + f * 2 + i, 5, water[4]);
    k.mark(18 + ((f + 1) % 3), 8, water[3]); k.mark(19 + ((f + 1) % 3), 8, water[3]);
    return k.finish();
  });
  return { frames, ax: 15, ay: 7, tall: false, fps: 2 };
}

function lavaPool(): PropSprite {
  const LAVA: Ramp = ['#401808', '#b02c10', '#e8641c', '#ffa830', '#fff0a0'];
  const frames = [0, 1, 2].map((f) => {
    const k = new Ink(40, 20);
    k.blob(20, 10, 19, 9, ['#2a1410', '#4a2a20', '#5c3428', '#704030', '#704030']);
    k.blob(20, 10, 15, 6, [LAVA[0], LAVA[1], LAVA[2], LAVA[2], LAVA[3]]);
    k.blob(18, 9, 9, 3, [LAVA[0], LAVA[2], LAVA[3], LAVA[3], LAVA[4]]);
    const bx = [12, 25, 18][f], by = [10, 8, 12][f];
    k.mark(bx, by, LAVA[4]); k.mark(bx + 1, by, LAVA[3]); k.mark(bx, by + 1, LAVA[1]);
    k.glow(20, 10, '#ff8030', 0.25);
    return k.finish();
  });
  return { frames, ax: 20, ay: 10, tall: false, fps: 3 };
}

function grave(r: PRng): PropSprite {
  const S: Ramp = ['#2e2a3a', '#5e5870', '#827c96', '#a49eb6', '#c8c2d8'];
  const k = new Ink(18, 26);
  k.shadow(9, 23, 8, 2);
  k.column(3, 9, 12, 14, S);
  k.blob(9, 9, 6, 5, S, false, 0.05);
  k.mark(8, 9, S[0]); k.mark(9, 9, S[0]); k.mark(10, 9, S[0]); k.mark(9, 8, S[0]); k.mark(9, 10, S[0]); k.mark(9, 11, S[0]);
  k.mark(6, 16, S[1]); k.mark(7, 16, S[1]); k.mark(8, 16, S[1]); k.mark(10, 18, S[1]); k.mark(11, 18, S[1]);
  if (r.chance(0.5)) { const G: Ramp = ['#1e3424', '#3a5a3a', '#4a7048', '#5c8a58', '#78a070']; k.blob(4, 22, 3, 2, G); k.blob(14, 22, 2, 2, G); }
  return one(k.finish(), 9, 23, true);
}

/** Candle with a three-frame flicker. */
function candle(): PropSprite {
  const WAX: Ramp = ['#5a5040', '#c8bca0', '#e8dcc0', '#f8f0dc', '#ffffff'];
  const FL: Ramp = ['#5a2a8a', '#8a5ae0', '#b896ff', '#e8dcff', '#ffffff'];
  const frames = [0, 1, 2].map((f) => {
    const k = new Ink(12, 22);
    k.shadow(6, 20, 4, 1);
    k.column(4, 10, 4, 10, WAX);
    k.glow(6, 6, '#a080ff', 0.3);
    const h = [4, 5, 3][f];
    k.spike(6 + (f === 2 ? 0.5 : 0), 9, h, 1.6, FL);
    k.mark(6, 8, '#ffffff');
    return k.finish();
  });
  return { frames, ax: 6, ay: 20, tall: false, fps: 6 };
}

function deadTree(): PropSprite {
  const W: Ramp = ['#1e1a22', '#3a3240', '#544a5a', '#6a6070', '#82788a'];
  const k = new Ink(28, 40);
  k.shadow(14, 37, 9, 2);
  k.column(12, 14, 5, 23, W);
  const branch = (x: number, y: number, dx: number, n: number) => { for (let i = 0; i < n; i++) { k.set(x + dx * i, y - i, W[2], W); k.set(x + dx * i, y - i + 1, W[1], W); } };
  branch(12, 20, -1, 8); branch(16, 17, 1, 9); branch(14, 14, 0, 6); branch(7, 14, -1, 3); branch(22, 10, 1, 3);
  return one(k.finish(), 14, 37, true);
}

/** Generator cabinet with blinking status lights. */
function machine(): PropSprite {
  const M: Ramp = ['#262a2a', '#4a5250', '#68706c', '#8a928c', '#b0b8b0'];
  const frames = [0, 1].map((f) => {
    const k = new Ink(30, 34);
    k.shadow(15, 31, 14, 3);
    k.column(2, 10, 26, 21, M);
    k.rect(3, 4, 24, 6, M[3], M);
    k.rect(3, 4, 24, 1, M[4], M);
    for (let y = 14; y <= 26; y += 3) for (let x = 6; x <= 16; x++) k.mark(x, y, M[0]);
    const lights = f ? ['#40ff70', '#203820', '#ffd040'] : ['#205030', '#ff4040', '#ffd040'];
    lights.forEach((c, i) => { k.mark(21, 14 + i * 4, c); k.mark(22, 14 + i * 4, c); });
    k.rect(20, 25, 5, 3, '#e6c84a', M);
    return k.finish();
  });
  return { frames, ax: 15, ay: 31, tall: true, fps: 1.5 };
}

function pylon(): PropSprite {
  const M: Ramp = ['#202024', '#3a3a42', '#55555f', '#70707c', '#8c8c98'];
  const frames = [0, 1].map((f) => {
    const k = new Ink(22, 50);
    k.shadow(11, 47, 8, 2);
    k.column(9, 8, 4, 39, M);
    k.rect(2, 9, 18, 3, M[3], M);
    for (const x of [3, 18]) k.rect(x, 12, 1, 3, '#d8d0b8', M);
    for (let y = 18; y < 46; y += 7) k.rect(9, y, 4, 2, '#e6c84a', M);
    k.blob(11, 5, 3, 3, f ? ['#603010', '#ff4020', '#ff7040', '#ffb080', '#ffffff'] : ['#401c10', '#6a2418', '#8a3020', '#a04030', '#c06048']);
    if (f) k.glow(11, 5, '#ff5030', 0.3);
    return k.finish();
  });
  return { frames, ax: 11, ay: 47, tall: true, fps: 1.2 };
}

function barrel(): PropSprite {
  const Y: Ramp = ['#3a2c08', '#a07a18', '#d8a828', '#f0c848', '#fff0a0'];
  const k = new Ink(16, 20);
  k.shadow(8, 18, 7, 2);
  k.column(2, 5, 12, 13, Y);
  k.blob(8, 5, 6, 2, Y, false, 0.3);
  k.rect(2, 9, 12, 1, Y[0], Y); k.rect(2, 14, 12, 1, Y[0], Y);
  k.mark(7, 11, '#202020'); k.mark(8, 11, '#202020'); k.mark(7, 12, '#202020'); k.mark(8, 12, '#202020');
  return one(k.finish(), 8, 18, false);
}

function steamVent(): PropSprite {
  const R: Ramp = ['#1e1010', '#3a2420', '#4a3028', '#5c4034', '#704e40'];
  const frames = [0, 1, 2, 3].map((f) => {
    const k = new Ink(22, 26);
    k.blob(11, 22, 8, 3, R);
    k.blob(11, 22, 4, 1.5, ['#1e1010', '#ff7020', '#ffa040', '#ffd080', '#ffffff']);
    for (let i = 0; i < 3; i++) {
      const y = 18 - ((f * 4 + i * 6) % 16), x = 11 + Math.round(Math.sin((f + i) * 1.7) * 2);
      const a: Ramp = ['#8a8a96', '#b0b0ba', '#c8c8d0', '#e0e0e6', '#f4f4f8'];
      k.blob(x, y, 2 + (18 - y) / 8, 1.6 + (18 - y) / 10, a, false, 0.2);
    }
    return k.finish();
  });
  return { frames, ax: 11, ay: 22, tall: false, fps: 5 };
}

const sprites = (n: number, seed: number, f: (r: PRng, i: number) => PropSprite) => Array.from({ length: n }, (_, i) => f(new PRng(seed * 131 + i * 17), i));

// ─────────────────────────── biomes ───────────────────────────

const LEAF: Ramp = ['#173a1e', '#2a5e2c', '#3e8040', '#5aa252', '#86c46c'];
const LEAF_DARK: Ramp = ['#10301a', '#1f4c28', '#2e6a36', '#428a46', '#62a85c'];
const CAVE_STONE: Ramp = ['#2a2028', '#5a4a54', '#786670', '#968490', '#b4a4ae'];

const builders: Record<string, () => Biome> = {
  viridian: () => {
    const g = P('#285a2c', '#3c8038', '#58a24c', '#74bc60', '#9cd47c');
    return {
      seed: 11,
      base: grass(g, 11),
      layers: [
        { mat: dirt(P('#6a4a2a', '#a07a4c', '#c8a46c', '#dcbe88', '#ecd6a8'), 12), field: { scale: 22, kind: 'ridge', thr: 0.035 }, rim: '#8a6a40' },
        { mat: tallGrass(P('#173a1e', '#2a6a2e', '#3c8a3a', '#5cae4c', '#8cd070'), 13), field: { scale: 9, kind: 'blob', thr: 0.6 }, rim: '#1f4c24', shade: true },
      ],
      props: [
        { sprites: [...sprites(3, 1, (r) => tree(r, LEAF)), tree(new PRng(9), LEAF, '#e04040'), pine(LEAF_DARK)], cell: 2, density: 0.02, on: [0, 2], grove: { scale: 7, thr: 0.6, density: 0.85 }, clear: 72 },
        { sprites: [bush(LEAF), bush(LEAF, '#4060e0')], cell: 1, density: 0.012, on: [0] },
        { sprites: sprites(3, 2, (r, i) => flowers(r, ([['#7a1a1a', '#c03030', '#e85050', '#ff8080', '#ffd0d0'], ['#7a6a10', '#d0b020', '#f0d840', '#fff080', '#ffffff'], ['#6a6a7a', '#c8c8d8', '#e8e8f0', '#ffffff', '#ffffff']] as Ramp[])[i], '#2a6a2a')), cell: 1, density: 0.03, on: [0] },
        { sprites: [mushroom(['#5a1010', '#a02020', '#d03a30', '#e86a50', '#ffb0a0']), stump()], cell: 1, density: 0.004, on: [0] },
      ],
    };
  },
  mtmoon: () => ({
    seed: 21,
    base: rockFloor(P('#3a2c30', '#6a5658', '#86706e', '#a08a84', '#bca69c'), 21),
    layers: [
      { mat: rubble(P('#2a1e22', '#4e3e42', '#64524f', '#7e6a66', '#988480'), 22), field: { scale: 8, kind: 'blob', thr: 0.6 }, rim: '#3a2c30', shade: true },
      { mat: ripples(P('#5a4a38', '#9a8466', '#b49c7a', '#c8b290', '#dccaa8'), 23), field: { scale: 18, kind: 'ridge', thr: 0.03 }, rim: '#7a6650' },
    ],
    props: [
      { sprites: sprites(3, 3, (r, i) => boulder(r, CAVE_STONE, [26, 22, 30][i])), cell: 2, density: 0.035, on: [0, 1], grove: { scale: 6, thr: 0.68, density: 0.45 }, clear: 64 },
      { sprites: sprites(2, 4, (r) => stalagmite(r, CAVE_STONE)), cell: 1, density: 0.006, on: [0, 1], clear: 64 },
      { sprites: sprites(2, 5, (r) => crystal(r, ['#2a2a6a', '#5a5ab8', '#8a8ae8', '#bcbcff', '#ffffff'])), cell: 2, density: 0.01, on: [0, 1], clear: 64 },
      { sprites: [...sprites(2, 6, (r) => pebbles(r, CAVE_STONE)), bones()], cell: 1, density: 0.02, on: [0, 2] },
    ],
  }),
  seafoam: () => ({
    seed: 31,
    base: ice(P('#3a6a90', '#7ab0d4', '#9ccbe8', '#c4e4f6', '#ffffff'), 31),
    layers: [
      { mat: ripples(P('#6a90b0', '#c0d8ec', '#e2f0fa', '#f4faff', '#ffffff'), 32), field: { scale: 10, kind: 'blob', thr: 0.55 }, rim: '#9ab8d0', shade: true },
      { mat: wetRock(P('#1e3a5a', '#2e5680', '#3e6c9a', '#6a98c0', '#a8d0ec'), 33), field: { scale: 7, kind: 'blob', thr: 0.7 }, rim: '#1e3a5a' },
    ],
    props: [
      { sprites: sprites(2, 7, (r) => iceSpike(r)), cell: 2, density: 0.025, on: [0, 1], grove: { scale: 6, thr: 0.68, density: 0.4 }, clear: 64 },
      { sprites: sprites(2, 8, (r) => boulder(r, ['#2a4a68', '#6a8aa8', '#8eaac4', '#b4cce0', '#e0f0ff'], 24)), cell: 2, density: 0.015, on: [0, 1], clear: 64 },
      { sprites: [snowPile(), snowPile(), shell(new PRng(9))], cell: 1, density: 0.01, on: [0, 1] },
      { sprites: [puddle(['#1e3a5a', '#3a6a9a', '#5a8cc0', '#9ac4e8', '#ffffff'])], cell: 2, density: 0.01, on: [0] },
    ],
  }),
  powerplant: () => {
    const m = P('#2e302a', '#5e6056', '#787a6e', '#94968a', '#b8baac');
    return {
      seed: 41,
      base: metal(m, 41),
      layers: [
        { mat: grate(P('#1e201c', '#2e302a', '#5a5c52', '#7a7c70', '#9a9c8e')), field: { scale: 20, kind: 'ridge', thr: 0.035 }, rim: '#e6c84a' },
        { mat: rockFloor(P('#1e1e1a', '#34342e', '#44443c', '#56564c', '#6a6a5e'), 42), field: { scale: 8, kind: 'blob', thr: 0.66 }, rim: '#24241e', shade: true },
      ],
      props: [
        { sprites: [machine()], cell: 2, density: 0.02, on: [0, 2], grove: { scale: 7, thr: 0.7, density: 0.35 }, clear: 72 },
        { sprites: [pylon()], cell: 2, density: 0.012, on: [0, 2], clear: 72 },
        { sprites: [barrel(), puddle(['#101010', '#2a2a30', '#3a3a44', '#5a5a70', '#a0a0c0'])], cell: 1, density: 0.012, on: [0, 2] },
      ],
    };
  },
  tower: () => ({
    seed: 51,
    base: stoneTiles(P('#241e30', '#4a4058', '#5c5270', '#766c8a', '#968ca8'), 51),
    layers: [
      { mat: carpet(P('#2a0a18', '#5a1a34', '#7a2648', '#a03a60', '#d06a8a')), field: { scale: 20, kind: 'ridge', thr: 0.035 }, rim: '#c8a048' },
      { mat: grass(P('#1e2a24', '#34443a', '#46584c', '#5a6e60', '#748a7a'), 52), field: { scale: 9, kind: 'blob', thr: 0.6 }, rim: '#26342c', shade: true },
    ],
    props: [
      { sprites: sprites(4, 10, (r) => grave(r)), cell: 1, density: 0.01, on: [0, 2], grove: { scale: 6, thr: 0.64, density: 0.14 }, clear: 64 },
      { sprites: [deadTree()], cell: 2, density: 0.008, on: [2], clear: 72 },
      { sprites: [candle()], cell: 1, density: 0.012, on: [0, 1] },
      { sprites: [bones()], cell: 1, density: 0.006, on: [0, 2] },
    ],
  }),
  cinnabar: () => ({
    seed: 61,
    base: rockFloor(P('#1e1010', '#3e2420', '#56322a', '#6c4234', '#845444'), 61, ['#e8641c', '#ffc040']),
    layers: [
      { mat: dirt(P('#1e1a1a', '#3e3836', '#4e4744', '#625a56', '#7a706a'), 62, 2), field: { scale: 9, kind: 'blob', thr: 0.66 }, rim: '#2a2422', shade: true },
      { mat: rubble(P('#1a0c0a', '#32201a', '#422a22', '#58382c', '#704838'), 63), field: { scale: 7, kind: 'blob', thr: 0.68 }, rim: '#1a0c0a' },
    ],
    props: [
      { sprites: [lavaPool()], cell: 2, density: 0.035, on: [0], clear: 72 },
      { sprites: sprites(2, 11, (r, i) => boulder(r, ['#1a0c0a', '#4a2a22', '#64382c', '#7e4a3a', '#9a6250'], [26, 20][i])), cell: 2, density: 0.025, on: [0, 1, 2], grove: { scale: 6, thr: 0.7, density: 0.4 }, clear: 64 },
      { sprites: sprites(2, 12, (r) => stalagmite(r, ['#1a0c0a', '#4a2a22', '#64382c', '#7e4a3a', '#9a6250'])), cell: 1, density: 0.006, on: [0, 2], clear: 64 },
      { sprites: [steamVent(), bones()], cell: 1, density: 0.008, on: [0, 1] },
    ],
  }),
  cerulean: () => ({
    seed: 71,
    base: rockFloor(P('#141c2c', '#2a3a56', '#3a4c6c', '#4e6284', '#68809e'), 71),
    layers: [
      { mat: wetRock(P('#0e1422', '#1e2a42', '#283856', '#3c5072', '#6a88b0'), 72), field: { scale: 8, kind: 'blob', thr: 0.6 }, rim: '#0e1422', shade: true },
      { mat: grass(P('#0e2a2a', '#1e4a46', '#2a625a', '#3a7c70', '#58a090'), 73), field: { scale: 7, kind: 'blob', thr: 0.7 }, rim: '#123430' },
    ],
    props: [
      { sprites: sprites(3, 13, (r, i) => crystal(r, ([['#1a2a6a', '#3a5ac0', '#6a8ae8', '#a8c4ff', '#ffffff'], ['#3a1a6a', '#7a4ac0', '#a87ae8', '#d4b4ff', '#ffffff'], ['#0a4a4a', '#20a0a0', '#40d0c8', '#90f0e8', '#ffffff']] as Ramp[])[i])), cell: 2, density: 0.025, on: [0, 1, 2], grove: { scale: 6, thr: 0.68, density: 0.35 }, clear: 64 },
      { sprites: sprites(2, 14, (r, i) => boulder(r, ['#0e1422', '#34405a', '#465674', '#5a6c8c', '#7a8ca8'], [26, 20][i])), cell: 2, density: 0.025, on: [0, 1], clear: 64 },
      { sprites: sprites(2, 15, (r) => stalagmite(r, ['#0e1422', '#34405a', '#465674', '#5a6c8c', '#7a8ca8'])), cell: 1, density: 0.006, on: [0, 1], clear: 64 },
      { sprites: [puddle(['#0a1420', '#1e3a60', '#2e5488', '#5a88c0', '#c0e0ff']), pebbles(new PRng(3), ['#0e1422', '#34405a', '#465674', '#5a6c8c', '#7a8ca8'])], cell: 1, density: 0.014, on: [0, 1] },
    ],
  }),
};

const cache = new Map<string, Biome>();

export function biomeFor(stageId: string): Biome {
  let b = cache.get(stageId);
  if (!b) {
    b = (builders[stageId] ?? builders.viridian)();
    cache.set(stageId, b);
  }
  return b;
}
