import { T } from './pixelart.ts';

/**
 * FRLG tile sheet shipped in public/assets/tileset.png. Cells are 16×16 on a 17 px pitch (1 px
 * transparent gutters). Routes that have a sheet layout in biomes.ts draw their ground and props
 * from it; the rest (or all, if the sheet fails to load) keep the procedurally painted art.
 */

export const SHEET_URL = 'assets/tileset.png';
const PITCH = 17;

export type Cell = readonly [col: number, row: number];

export interface Sheet {
  w: number;
  h: number;
  px: Uint32Array; // packed ABGR
}

let sheet: Sheet | null = null;
let loading: Promise<Sheet | null> | null = null;

export function tileSheet(): Sheet | null { return sheet; }

export function loadTileSheet(): Promise<Sheet | null> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height);
      sheet = { w: c.width, h: c.height, px: new Uint32Array(data.data.buffer.slice(0)) };
      resolve(sheet);
    };
    img.onerror = () => resolve(null);
    img.src = SHEET_URL;
  });
  return loading;
}

/** One 16×16 cell's pixels. */
export function cellPx(s: Sheet, [c, r]: Cell): Uint32Array {
  const out = new Uint32Array(T * T);
  const x0 = 1 + c * PITCH, y0 = 1 + r * PITCH;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) out[y * T + x] = s.px[(y0 + y) * s.w + x0 + x];
  return out;
}

/** Colours used by the cells; with `minShare`, only those covering at least that fraction of them. */
export function palette(s: Sheet, cells: readonly Cell[], minShare = 0): Set<number> {
  const n = new Map<number, number>();
  for (const cell of cells) for (const v of cellPx(s, cell)) if (v >>> 24) n.set(v, (n.get(v) ?? 0) + 1);
  const min = minShare * cells.length * T * T;
  return new Set([...n].filter(([, k]) => k >= min).map(([v]) => v));
}

const rgbDist = (a: number, b: number) => {
  const dr = (a & 255) - (b & 255), dg = ((a >> 8) & 255) - ((b >> 8) & 255), db = ((a >> 16) & 255) - ((b >> 16) & 255);
  return dr * dr + dg * dg + db * db;
};

/** Smoothstepped sub-tile positions (same curve as the procedural autotiler). */
const S = Array.from({ length: T }, (_, i) => { const t = (i + 0.5) / T; return t * t * (3 - 2 * t); });

/**
 * Build the 16 corner configurations of a terrain patch from a sheet's transition tiles.
 * Each tile pixel is classified as patch or base by palette (in-between rim/outline colours go to
 * the nearer palette); then every 8×8 quadrant of every configuration takes the best-matching
 * quadrant from the same position in any source tile. Pixels in the base palette come out
 * transparent, so the patch (with its rim and outline) can be laid over whatever is below.
 * Index = TL | TR<<1 | BL<<2 | BR<<3.
 */
export function autotile(s: Sheet, full: Cell, block: readonly Cell[], basePal: Set<number>): Uint32Array[] {
  const patchPal = palette(s, [full]);
  const patchList = [...patchPal], baseList = [...basePal];
  const sources = [full, ...block].map((cell) => {
    const px = cellPx(s, cell);
    const cls = new Uint8Array(T * T);
    for (let i = 0; i < T * T; i++) {
      const v = px[i];
      if (!(v >>> 24) || basePal.has(v)) cls[i] = 0;
      else if (patchPal.has(v)) cls[i] = 1;
      else {
        let dp = Infinity, db = Infinity;
        for (const p of patchList) dp = Math.min(dp, rgbDist(v, p));
        for (const b of baseList) db = Math.min(db, rgbDist(v, b));
        cls[i] = dp <= db ? 1 : 0;
      }
    }
    // which corners of this tile are patch (majority of a 4×4 block, so dither doesn't flip it)
    const corners = [0, 1, 2, 3].map((q) => {
      let n = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) n += cls[((q >> 1) * 12 + y) * T + (q & 1) * 12 + x];
      return n >= 8 ? 1 : 0;
    });
    return { px, cls, corners };
  });
  const out: Uint32Array[] = [];
  for (let cfg = 0; cfg < 16; cfg++) {
    const c00 = cfg & 1, c10 = (cfg >> 1) & 1, c01 = (cfg >> 2) & 1, c11 = (cfg >> 3) & 1;
    const want = [c00, c10, c01, c11];
    const tile = new Uint32Array(T * T);
    for (let q = 0; q < 4; q++) {
      const qx = (q & 1) * 8, qy = (q >> 1) * 8;
      // A quadrant's outer edges are set by its own corner and its two neighbouring corners; only
      // sources that agree on those join seamlessly with the next tile, wherever their edge sits.
      const agrees = (k: number) => [q, q ^ 1, q ^ 2].every((c) => (k < 0 ? 0 : sources[k].corners[c]) === want[c]);
      const strict = agrees(-1) || sources.some((_, k) => agrees(k));
      let best = -1, bestScore = Infinity;
      // candidate -1 = empty (all base)
      for (let k = -1; k < sources.length; k++) {
        if (strict && !agrees(k)) continue;
        let score = 0;
        for (let y = qy; y < qy + 8; y++) for (let x = qx; x < qx + 8; x++) {
          const fx = S[x], fy = S[y];
          const t = (c00 + (c10 - c00) * fx) * (1 - fy) + (c01 + (c11 - c01) * fx) * fy >= 0.5 ? 1 : 0;
          const m = k < 0 ? 0 : sources[k].cls[y * T + x];
          score += t === m ? 0 : 1;
        }
        // then prefer a source that also agrees on the opposite corner (same tile shape)
        if (strict && (k < 0 ? 0 : sources[k].corners[q ^ 3]) !== want[q ^ 3]) score += 1000;
        // prefer real art over the empty quadrant on ties
        if (score < bestScore || (score === bestScore && best < 0)) { bestScore = score; best = k; }
      }
      if (best < 0) continue;
      const src = sources[best].px;
      for (let y = qy; y < qy + 8; y++) for (let x = qx; x < qx + 8; x++) {
        const v = src[y * T + x];
        tile[y * T + x] = basePal.has(v) ? 0 : v;
      }
    }
    out.push(tile);
  }
  return out;
}

/**
 * Crop a block of cells (gutters removed) to a canvas and cut the ground out from around the art:
 * a flood fill from the border through ground-like colours (the base palette, colours common on
 * the crop's border, and anything close to those), stopping at the art's dark outlines.
 */
export function cropProp(s: Sheet, [c, r]: Cell, w: number, h: number, ground: Set<number>): HTMLCanvasElement {
  const W = w * T, H = h * T;
  const px = new Uint32Array(W * H);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const cell = cellPx(s, [c + i, r + j]);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px[(j * T + y) * W + i * T + x] = cell[y * T + x];
  }
  const border = new Map<number, number>();
  const edge: number[] = [];
  for (let x = 0; x < W; x++) edge.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) edge.push(y * W, y * W + W - 1);
  for (const i of edge) border.set(px[i], (border.get(px[i]) ?? 0) + 1);
  const near = (v: number, list: number[], d: number) => list.some((k) => rgbDist(v, k) <= d);
  const groundList = [...ground];
  const key = new Set(ground);
  // common border colours are ground shades the palette missed — unless they look nothing like
  // the ground (then they're the art itself touching the crop edge, e.g. a 1×1 rock)
  for (const [v, n] of border) if (n >= 4 && near(v, groundList, 1200)) key.add(v);
  const keyList = [...key];
  const isGround = (v: number) => !(v >>> 24) || key.has(v) || near(v, keyList, 700);
  const cut = new Uint8Array(W * H);
  const stack = edge.filter((i) => isGround(px[i]));
  for (const i of stack) cut[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W, y = (i / W) | 0;
    for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (n < 0 || cut[n] || !isGround(px[n])) continue;
      cut[n] = 1;
      stack.push(n);
    }
  }
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(W, H);
  const o = new Uint32Array(img.data.buffer);
  for (let i = 0; i < W * H; i++) o[i] = cut[i] ? 0 : px[i];
  g.putImageData(img, 0, 0);
  return cv;
}
