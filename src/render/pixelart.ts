/**
 * Tiny procedural pixel-art toolkit for the world's tiles and props. Everything is painted at
 * 1 world pixel = 1 art pixel (the same density as the Pokémon sprites), lit from the top-left,
 * shaded with short 4-5 colour ramps and a 2×2 ordered dither, and outlined in each material's
 * darkest colour, so the whole world reads as one handheld-era art style.
 */

/** [outline, dark, mid, light, highlight] */
export type Ramp = readonly [string, string, string, string, string];

export const T = 16; // tile size in world pixels

const rgbCache = new Map<string, number>();
/** '#rrggbb' → packed ABGR (ImageData byte order on little-endian machines). */
export function abgr(hex: string, a = 255): number {
  const key = a === 255 ? hex : `${hex}/${a}`;
  let v = rgbCache.get(key);
  if (v === undefined) {
    const n = parseInt(hex.slice(1), 16);
    v = ((a << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    rgbCache.set(key, v);
  }
  return v;
}

/** Mix two hex colours (k = 0 → a, 1 → b). */
export function mix(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// ─────────────────────────── seeded hashing / noise ───────────────────────────

export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Three-octave value noise in 0..1. */
export function fbm(x: number, y: number, seed: number): number {
  return vnoise(x, y, seed) * 0.6 + vnoise(x * 2.07, y * 2.07, seed + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, seed + 13) * 0.12;
}

/** Small deterministic RNG for painting variants. */
export class PRng {
  private s: number;
  constructor(seed: number) { this.s = seed; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
}

// ─────────────────────────── 16×16 ground textures ───────────────────────────

/** A seamless 16×16 ground texel block (packed ABGR), painted with wrap-around. */
export class Tex {
  readonly px = new Uint32Array(T * T);
  constructor(fill: string) { this.px.fill(abgr(fill)); }
  set(x: number, y: number, hex: string) { this.px[(y & 15) * T + (x & 15)] = abgr(hex); }
  get(x: number, y: number) { return this.px[(y & 15) * T + (x & 15)]; }
}

// ─────────────────────────── props ───────────────────────────

const EMPTY = -1;

/**
 * An indexed canvas for one prop. Shapes are filled with shaded ramp colours; finish() adds the
 * outline around everything (in the outline colour of the neighbouring material).
 */
export class Ink {
  private col: Int32Array;
  private ramp: Int16Array;
  private ramps: Ramp[] = [];
  private shadows: { cx: number; cy: number; rx: number; ry: number; a: number }[] = [];
  private glows: { x: number; y: number; hex: string; a: number }[] = [];
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.col = new Int32Array(w * h).fill(EMPTY);
    this.ramp = new Int16Array(w * h).fill(-1);
  }

  private rid(r: Ramp) {
    let i = this.ramps.indexOf(r);
    if (i < 0) { this.ramps.push(r); i = this.ramps.length - 1; }
    return i;
  }

  filled(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.col[y * this.w + x] !== EMPTY; }

  set(x: number, y: number, hex: string, r: Ramp) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const n = parseInt(hex.slice(1), 16);
    this.col[y * this.w + x] = n;
    this.ramp[y * this.w + x] = this.rid(r);
  }

  /** Only recolour an already-filled pixel (texture marks). */
  mark(x: number, y: number, hex: string) {
    x = Math.round(x); y = Math.round(y);
    if (!this.filled(x, y)) return;
    this.col[y * this.w + x] = parseInt(hex.slice(1), 16);
  }

  /** Light from the top-left with a 2×2 ordered dither between ramp steps. */
  static level(nx: number, ny: number, x: number, y: number, bias = 0): 1 | 2 | 3 | 4 {
    const d = ((x & 1) ^ (y & 1)) ? 0.07 : -0.07;
    const lv = -(nx * 0.6 + ny * 0.8) + d + bias;
    return lv > 0.6 ? 4 : lv > 0.12 ? 3 : lv > -0.42 ? 2 : 1;
  }

  /** Shaded ellipse; `edge` darkens its lower-right rim so overlapping lobes read separately. */
  blob(cx: number, cy: number, rx: number, ry: number, r: Ramp, edge = false, bias = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        let lv: number = Ink.level(nx, ny, x, y, bias);
        if (edge && d > 0.62 && nx + ny > 0.35) lv = 1;
        this.set(x, y, r[lv], r);
      }
    }
  }

  /** Vertical cylinder-shaded rectangle (trunks, posts, stones). */
  column(x0: number, y0: number, w: number, h: number, r: Ramp, bias = 0) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const nx = ((x + 0.5 - x0) / w) * 2 - 1;
      this.set(x, y, r[Ink.level(nx * 1.1, -0.15, x, y, bias)], r);
    }
  }

  /** Flat-coloured rectangle. */
  rect(x0: number, y0: number, w: number, h: number, hex: string, r: Ramp) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, hex, r);
  }

  /** Cone / spike: base at (cx, by), tip `h` above, half-width `hw` at the base. */
  spike(cx: number, by: number, h: number, hw: number, r: Ramp, lean = 0) {
    for (let i = 0; i < h; i++) {
      const y = by - i;
      const k = 1 - i / h;
      const w = Math.max(0.5, hw * Math.pow(k, 0.85));
      const c = cx + lean * (i / h);
      for (let x = Math.floor(c - w); x <= Math.ceil(c + w) - 1; x++) {
        const nx = (x + 0.5 - c) / w;
        if (Math.abs(nx) > 1) continue;
        this.set(x, y, r[Ink.level(nx * 1.2, -0.3 + (1 - k) * -0.4, x, y)], r);
      }
    }
  }

  shadow(cx: number, cy: number, rx: number, ry: number, a = 0.28) { this.shadows.push({ cx, cy, rx, ry, a }); }
  /** A soft additive-looking halo pixel ring around a point (drawn under the art). */
  glow(x: number, y: number, hex: string, a = 0.35) { this.glows.push({ x, y, hex, a }); }

  /** Outline + rasterise to a canvas. */
  finish(): HTMLCanvasElement {
    const { w, h } = this;
    const out = new Int32Array(this.col);
    const outR = new Int16Array(this.ramp);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (this.col[i] !== EMPTY) continue;
      let r = -1;
      if (x > 0 && this.col[i - 1] !== EMPTY) r = this.ramp[i - 1];
      else if (x < w - 1 && this.col[i + 1] !== EMPTY) r = this.ramp[i + 1];
      else if (y > 0 && this.col[i - w] !== EMPTY) r = this.ramp[i - w];
      else if (y < h - 1 && this.col[i + w] !== EMPTY) r = this.ramp[i + w];
      if (r >= 0) { out[i] = parseInt(this.ramps[r][0].slice(1), 16); outR[i] = r; }
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    // ground shadows: pixel ellipses at fixed alpha
    for (const s of this.shadows) {
      g.fillStyle = `rgba(0,0,0,${s.a})`;
      for (let y = -s.ry; y <= s.ry; y++) {
        const ww = Math.floor(s.rx * Math.sqrt(Math.max(0, 1 - (y * y) / (s.ry * s.ry))));
        g.fillRect(Math.round(s.cx - ww), Math.round(s.cy + y), ww * 2 + 1, 1);
      }
    }
    for (const gl of this.glows) {
      g.fillStyle = gl.hex;
      for (const [r, a] of [[6, gl.a * 0.35], [4, gl.a * 0.6], [2, gl.a]] as const) {
        g.globalAlpha = a;
        for (let y = -r; y <= r; y++) {
          const ww = Math.floor(Math.sqrt(r * r - y * y));
          g.fillRect(gl.x - ww, gl.y + y, ww * 2 + 1, 1);
        }
      }
      g.globalAlpha = 1;
    }
    const img = g.getImageData(0, 0, w, h);
    const u32 = new Uint32Array(img.data.buffer);
    for (let i = 0; i < w * h; i++) {
      const v = out[i];
      if (v === EMPTY) continue;
      u32[i] = ((255 << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}
