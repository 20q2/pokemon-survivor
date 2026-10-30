import type { StageDef } from '../data/stages.ts';
import { OB_CELL, Obstacles } from '../game/obstacles.ts';
import { biomeFor, type Biome, type Field, type Material, type PropSprite } from './biomes.ts';
import { fbm, hash2, T } from './pixelart.ts';

/**
 * The world floor: an endless 16 px tile map generated per stage from seeded noise, built lazily
 * in 512 px chunks. Each chunk is the base material, with up to two autotiled terrain layers
 * (rounded patch edges, a rim colour and a drop shade where a layer sits on the one below), and
 * the static flat props baked in. Tall and animated props are kept as lists so the renderer can
 * y-sort them with the Pokémon and animate them. Solid obstacles come from the same generated
 * field the simulation collides against; only their sprites are chosen here.
 */

const CT = 32; // tiles per chunk side
const CPX = CT * T;
const MARGIN = 3; // tiles of neighbouring terrain/props evaluated around each chunk
const MAX_CHUNKS = 36;

export interface DecorSprite { c: HTMLCanvasElement; ax: number; ay: number; tall: boolean }
interface Placed { s: PropSprite; x: number; y: number }
interface Chunk { c: HTMLCanvasElement; tall: Placed[]; anim: Placed[] }

/** Smoothstepped sub-tile positions: makes autotile edges round instead of diagonal. */
const S = Array.from({ length: T }, (_, i) => { const t = (i + 0.5) / T; return t * t * (3 - 2 * t); });

const mod = (a: number, n: number) => ((a % n) + n) % n;

function inField(f: Field, vx: number, vy: number, seed: number): boolean {
  const n = fbm(vx / f.scale, vy / f.scale, seed);
  return f.kind === 'blob' ? n > f.thr : Math.abs(n - 0.5) < f.thr;
}

/**
 * One majority pass over the vertex grid: drops lone vertices (which would render as single-tile
 * blobs) and fills lone gaps (round holes), like a hand-placed autotile map. The outer ring is
 * left as-is; chunks overlap by MARGIN so every rendered vertex sees its full neighbourhood.
 */
function smooth(a: Uint8Array, n: number): Uint8Array {
  const o = new Uint8Array(a);
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i;
    const nb = a[k - 1] + a[k + 1] + a[k - n] + a[k + n];
    if (a[k] && nb <= 1) o[k] = 0;
    else if (!a[k] && nb >= 3) o[k] = 1;
  }
  return o;
}

function pickVariant(m: Material, tx: number, ty: number, seed: number): Uint32Array {
  let total = 0;
  for (const w of m.weights) total += w;
  let u = hash2(tx, ty, seed) * total;
  for (let i = 0; i < m.variants.length; i++) {
    u -= m.weights[i];
    if (u < 0) return m.variants[i].px;
  }
  return m.variants[0].px;
}

const phase = (x: number) => mod(x * 0.013, 1);

const frameSprites = new WeakMap<PropSprite, DecorSprite[]>();
function decorFrame(s: PropSprite, time: number): DecorSprite {
  let fs = frameSprites.get(s);
  if (!fs) {
    fs = s.frames.map((c) => ({ c, ax: s.ax, ay: s.ay, tall: s.tall }));
    frameSprites.set(s, fs);
  }
  return fs.length === 1 ? fs[0] : fs[mod(Math.floor(time * s.fps), fs.length)];
}

export class Background {
  private biome: Biome;
  private chunks = new Map<string, Chunk>();
  private obstacles: Obstacles;

  constructor(stage: StageDef) {
    this.biome = biomeFor(stage.id);
    this.obstacles = new Obstacles(stage.id);
  }

  private chunk(cx: number, cy: number): Chunk {
    const key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    if (c) {
      this.chunks.delete(key);
      this.chunks.set(key, c);
      return c;
    }
    c = this.build(cx, cy);
    this.chunks.set(key, c);
    if (this.chunks.size > MAX_CHUNKS) this.chunks.delete(this.chunks.keys().next().value!);
    return c;
  }

  private build(cx: number, cy: number): Chunk {
    const { biome } = this;
    const layers = biome.layers;
    const NL = layers.length;
    const nV = CT + 1 + MARGIN * 2;
    const vx0 = cx * CT - MARGIN, vy0 = cy * CT - MARGIN;
    // terrain membership at tile vertices, per layer
    const inL = layers.map((ly, k) => {
      const a = new Uint8Array(nV * nV);
      for (let j = 0; j < nV; j++) for (let i = 0; i < nV; i++) a[j * nV + i] = inField(ly.field, vx0 + i, vy0 + j, biome.seed + 100 * (k + 1)) ? 1 : 0;
      return smooth(a, nV);
    });

    // per-pixel top layer, with a 2 px border so rims see across chunk edges
    const B = 2, LW = CPX + B * 2;
    const lmap = new Uint8Array(LW * LW);
    const ox = cx * CPX - B, oy = cy * CPX - B;
    for (let ty = Math.floor(oy / T); ty <= Math.floor((oy + LW - 1) / T); ty++) {
      for (let tx = Math.floor(ox / T); tx <= Math.floor((ox + LW - 1) / T); tx++) {
        const vi = (ty - vy0) * nV + (tx - vx0);
        // per layer: 0 none, 1 whole tile, 2 partial
        let uniform = -1;
        let partial = false;
        for (let k = NL - 1; k >= 0 && uniform < 0 && !partial; k--) {
          const a = inL[k];
          const sum = a[vi] + a[vi + 1] + a[vi + nV] + a[vi + nV + 1];
          if (sum === 4) uniform = k + 1;
          else if (sum > 0) partial = true;
        }
        const x0 = Math.max(0, tx * T - ox), x1 = Math.min(LW, tx * T + T - ox);
        const y0 = Math.max(0, ty * T - oy), y1 = Math.min(LW, ty * T + T - oy);
        if (!partial) {
          const v = uniform < 0 ? 0 : uniform;
          for (let py = y0; py < y1; py++) lmap.fill(v, py * LW + x0, py * LW + x1);
          continue;
        }
        for (let py = y0; py < y1; py++) {
          const sy = mod(oy + py, T), fy = S[sy];
          for (let px = x0; px < x1; px++) {
            const sx = mod(ox + px, T), fx = S[sx];
            let top = 0;
            for (let k = NL - 1; k >= 0; k--) {
              const a = inL[k];
              const c00 = a[vi], c10 = a[vi + 1], c01 = a[vi + nV], c11 = a[vi + nV + 1];
              const sum = c00 + c10 + c01 + c11;
              if (sum === 0) continue;
              const auto = layers[k].auto;
              if (sum === 4 || (auto ? auto[c00 | (c10 << 1) | (c01 << 2) | (c11 << 3)][sy * T + sx] >>> 24 !== 0
                : (c00 + (c10 - c00) * fx) * (1 - fy) + (c01 + (c11 - c01) * fx) * fy >= 0.5)) { top = k + 1; break; }
            }
            lmap[py * LW + px] = top;
          }
        }
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = CPX;
    canvas.height = CPX;
    const g = canvas.getContext('2d')!;
    const img = g.createImageData(CPX, CPX);
    const out = new Uint32Array(img.data.buffer);
    const rims = layers.map((l) => (l.rim ? hexAbgr(l.rim) : 0));
    for (let ty = 0; ty < CT; ty++) for (let tx = 0; tx < CT; tx++) {
      const TX = cx * CT + tx, TY = cy * CT + ty;
      const tex = [pickVariant(biome.base, TX, TY, biome.seed), ...layers.map((l, k) => {
        // a sheet layer on a partial tile uses its edge tile for that corner config
        if (l.auto) {
          const a = inL[k], vi = (ty + MARGIN) * nV + tx + MARGIN;
          const cfg = a[vi] | (a[vi + 1] << 1) | (a[vi + nV] << 2) | (a[vi + nV + 1] << 3);
          if (cfg !== 15) return l.auto[cfg];
        }
        return pickVariant(l.mat, TX, TY, biome.seed + 31 * (k + 1));
      })];
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const px = tx * T + x, py = ty * T + y;
        const li = (py + B) * LW + px + B;
        const k = lmap[li];
        let v = tex[k][y * T + x];
        if (k > 0 && rims[k - 1] && (lmap[li - 1] < k || lmap[li + 1] < k || lmap[li - LW] < k || lmap[li + LW] < k)) v = rims[k - 1];
        else {
          // drop shade on the lower layer just below an overlay that casts one
          const a1 = lmap[li - LW], a2 = lmap[li - LW * 2];
          if ((a1 > k && layers[a1 - 1].shade) || (a2 > k && layers[a2 - 1].shade)) v = darken(v);
        }
        out[py * CPX + px] = v;
      }
    }
    g.putImageData(img, 0, 0);

    // props
    const tall: Placed[] = [], anim: Placed[] = [], flat: Placed[] = [];
    const topAt = (i: number, j: number) => {
      const vi = j * nV + i;
      for (let k = NL - 1; k >= 0; k--) if (inL[k][vi]) return k + 1;
      return 0;
    };
    for (let j = 0; j < CT + MARGIN * 2 - 1; j++) for (let i = 0; i < CT + MARGIN * 2 - 1; i++) {
      const TX = vx0 + i, TY = vy0 + j;
      const inside = i >= MARGIN && j >= MARGIN && i < MARGIN + CT && j < MARGIN + CT;
      const p = this.propAt(TX, TY);
      if (!p) continue;
      const t0 = topAt(i, j);
      if (t0 !== topAt(i + 1, j) || t0 !== topAt(i, j + 1) || t0 !== topAt(i + 1, j + 1) || !p.spec.on.includes(t0)) continue;
      if (p.s.tall || p.s.fps > 0) { if (inside) (p.s.tall ? tall : anim).push(p); }
      else flat.push(p);
    }
    // solid obstacles whose foot lies in this chunk
    if (biome.solids.length) {
      const per = CPX / OB_CELL;
      for (let j = cy * per; j < (cy + 1) * per; j++) for (let i = cx * per; i < (cx + 1) * per; i++) {
        const o = this.obstacles.at(i, j);
        const art = o?.small && biome.smallSolids.length ? biome.smallSolids : biome.solids;
        if (o) tall.push({ s: art[Math.floor(o.v * art.length)], x: o.x, y: o.y });
      }
    }
    flat.sort((a, b) => a.y - b.y);
    for (const p of flat) g.drawImage(p.s.frames[0], Math.round(p.x - p.s.ax - cx * CPX), Math.round(p.y - p.s.ay - cy * CPX));
    return { c: canvas, tall, anim };
  }

  /** Deterministic prop choice for one tile (ignoring terrain, which build() checks). */
  private propAt(TX: number, TY: number): (Placed & { spec: Biome['props'][number] }) | null {
    const { biome } = this;
    // scenery owns its cell
    if (this.obstacles.at(Math.floor(TX / 2), Math.floor(TY / 2))) return null;
    const u = hash2(TX, TY, biome.seed + 999);
    let acc = 0;
    for (let i = 0; i < biome.props.length; i++) {
      const spec = biome.props[i];
      if (mod(TX, spec.cell) || mod(TY, spec.cell)) continue;
      let p = spec.density;
      let grove = false;
      if (spec.grove && fbm(TX / spec.grove.scale, TY / spec.grove.scale, biome.seed + 50 + i) > spec.grove.thr) { p = spec.grove.density; grove = true; }
      if (u >= acc + p) { acc += p; continue; }
      const s = spec.sprites[Math.floor(hash2(TX, TY, biome.seed + 77) * spec.sprites.length)];
      const jx = grove ? 0 : Math.round((hash2(TX, TY, biome.seed + 5) - 0.5) * (spec.cell === 2 ? 8 : 6));
      const jy = grove ? 0 : Math.round((hash2(TX, TY, biome.seed + 6) - 0.5) * (spec.cell === 2 ? 8 : 6));
      const x = TX * T + (spec.cell * T) / 2 + jx;
      const y = TY * T + (spec.cell === 2 ? 28 : 12) + jy;
      if (spec.clear && x * x + y * y < spec.clear * spec.clear) return null;
      return { s, x, y, spec };
    }
    return null;
  }

  private forChunks(x0: number, y0: number, w: number, h: number, f: (c: Chunk, cx: number, cy: number) => void) {
    for (let cy = Math.floor(y0 / CPX); cy <= Math.floor((y0 + h) / CPX); cy++) {
      for (let cx = Math.floor(x0 / CPX); cx <= Math.floor((x0 + w) / CPX); cx++) f(this.chunk(cx, cy), cx, cy);
    }
  }

  drawGround(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
    this.forChunks(x0, y0, w, h, (c, cx, cy) => g.drawImage(c.c, cx * CPX, cy * CPX));
  }

  /** Build at most one not-yet-cached chunk near the view, so walking rarely hitches. */
  prefetch(x0: number, y0: number, w: number, h: number) {
    const pad = CPX / 2;
    for (let cy = Math.floor((y0 - pad) / CPX); cy <= Math.floor((y0 + h + pad) / CPX); cy++) {
      for (let cx = Math.floor((x0 - pad) / CPX); cx <= Math.floor((x0 + w + pad) / CPX); cx++) {
        if (!this.chunks.has(`${cx},${cy}`)) { this.chunk(cx, cy); return; }
      }
    }
  }

  /** Animated ground props (flowers, puddles, candles, lava). */
  drawAnimated(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, time: number) {
    this.forChunks(x0 - 48, y0 - 48, w + 96, h + 96, (c) => {
      for (const p of c.anim) {
        if (p.x < x0 - 48 || p.x > x0 + w + 48 || p.y < y0 - 32 || p.y > y0 + h + 48) continue;
        const d = decorFrame(p.s, time + phase(p.x));
        g.drawImage(d.c, Math.round(p.x - d.ax), Math.round(p.y - d.ay));
      }
    });
  }

  /** Tall props overlapping the view, for y-sorting with the Pokémon. */
  tallIn(x0: number, y0: number, w: number, h: number, time: number, out: (d: DecorSprite, x: number, y: number) => void) {
    this.forChunks(x0 - 48, y0 - 16, w + 96, h + 80, (c) => {
      for (const p of c.tall) {
        if (p.x < x0 - 48 || p.x > x0 + w + 48 || p.y < y0 - 8 || p.y > y0 + h + 72) continue;
        out(decorFrame(p.s, time + phase(p.x)), p.x, p.y);
      }
    });
  }
}

function hexAbgr(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

function darken(v: number): number {
  const r = (v & 255) * 0.76, gg = ((v >> 8) & 255) * 0.76, b = ((v >> 16) & 255) * 0.8;
  return ((255 << 24) | (Math.round(b) << 16) | (Math.round(gg) << 8) | Math.round(r)) >>> 0;
}

const thumbs = new Map<string, HTMLCanvasElement>();

/** A small real render of a stage's ground and props, for menus (cached). */
export function stageThumbnail(stage: StageDef, w = 132, h = 46): HTMLCanvasElement {
  const key = `${stage.id}/${w}x${h}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const bg = new Background(stage);
  const ox = 9 * 32, oy = 6 * 32; // away from the cleared spawn area
  g.translate(-ox, -oy);
  bg.drawGround(g, ox, oy, w, h);
  bg.drawAnimated(g, ox, oy, w, h, 0);
  const items: { d: DecorSprite; x: number; y: number }[] = [];
  bg.tallIn(ox, oy, w, h, 0, (d, x, y) => items.push({ d, x, y }));
  items.sort((a, b) => a.y - b.y);
  for (const it of items) g.drawImage(it.d.c, Math.round(it.x - it.d.ax), Math.round(it.y - it.d.ay));
  thumbs.set(key, c);
  return c;
}
