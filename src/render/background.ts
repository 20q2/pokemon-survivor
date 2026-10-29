import type { Decor, StageDef } from '../data/stages.ts';
import { Rng } from '../engine/math.ts';

const TILE = 512;
export const DECOR_CELL = 104;

export interface DecorSprite { c: HTMLCanvasElement; ax: number; ay: number; tall: boolean }

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return { c, g };
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Pixel-perfect filled circle. */
function disc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

function ellipse(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string) {
  g.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

export function buildGroundTile(stage: StageDef): HTMLCanvasElement {
  const { c, g } = canvas(TILE, TILE);
  const [base, mottle, accent] = stage.ground;
  const rng = new Rng(stage.id.length * 9973 + stage.id.charCodeAt(0));
  g.fillStyle = base;
  g.fillRect(0, 0, TILE, TILE);
  // large soft mottling (wrapped so the tile is seamless)
  for (let i = 0; i < 60; i++) {
    const x = rng.range(0, TILE), y = rng.range(0, TILE), r = rng.int(10, 34);
    for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) {
      ellipse(g, x + ox, y + oy, r, Math.round(r * 0.7), mottle);
    }
  }
  // fine speckle texture
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = rng.chance(0.5) ? shade(base, 0.05) : shade(base, -0.05);
    g.fillRect(rng.int(0, TILE - 1), rng.int(0, TILE - 1), rng.int(1, 2), 1);
  }
  for (let i = 0; i < 140; i++) {
    g.fillStyle = accent;
    g.globalAlpha = rng.range(0.25, 0.6);
    g.fillRect(rng.int(0, TILE - 1), rng.int(0, TILE - 1), 1, rng.int(1, 3));
  }
  g.globalAlpha = 1;
  if (stage.id === 'powerplant') {
    // floor plating grid
    g.strokeStyle = shade(base, -0.12);
    g.lineWidth = 1;
    for (let x = 0; x < TILE; x += 64) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, TILE); g.stroke(); }
    for (let y = 0; y < TILE; y += 64) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(TILE, y + 0.5); g.stroke(); }
  }
  return c;
}

const DECOR_DRAW: Record<Decor, (rng: Rng, stage: StageDef) => DecorSprite> = {
  tree: (rng) => {
    const { c, g } = canvas(56, 72);
    ellipse(g, 28, 66, 18, 5, 'rgba(0,0,0,0.25)');
    g.fillStyle = '#5b3a1e'; g.fillRect(24, 44, 8, 22);
    g.fillStyle = '#7a5130'; g.fillRect(25, 44, 3, 22);
    const greens = ['#1f4d22', '#2b6b2c', '#3d8a3a', '#56a64c'];
    disc(g, 28, 32, 22, greens[0]);
    disc(g, 20, 28, 15, greens[1]); disc(g, 36, 26, 15, greens[1]);
    disc(g, 28, 18, 14, greens[2]); disc(g, 22, 22, 7, greens[3]); disc(g, 34, 14, 5, greens[3]);
    if (rng.chance(0.3)) { disc(g, 18, 34, 2, '#d33'); disc(g, 37, 30, 2, '#d33'); }
    return { c, ax: 28, ay: 66, tall: true };
  },
  bush: () => {
    const { c, g } = canvas(34, 24);
    ellipse(g, 17, 21, 14, 3, 'rgba(0,0,0,0.2)');
    disc(g, 10, 14, 8, '#2b6b2c'); disc(g, 22, 13, 9, '#2b6b2c'); disc(g, 16, 10, 8, '#3d8a3a'); disc(g, 13, 8, 3, '#56a64c');
    return { c, ax: 17, ay: 21, tall: false };
  },
  flower: (rng) => {
    const { c, g } = canvas(20, 16);
    const col = rng.pick(['#f6e05e', '#fc8181', '#f6f6f6', '#b794f4']);
    for (let i = 0; i < 3; i++) {
      const x = rng.int(3, 16), y = rng.int(4, 12);
      g.fillStyle = '#2f6b2f'; g.fillRect(x, y + 1, 1, 3);
      g.fillStyle = col; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = '#fff3a0'; g.fillRect(x, y, 1, 1);
    }
    return { c, ax: 10, ay: 14, tall: false };
  },
  tuft: (_r, st) => {
    const { c, g } = canvas(16, 12);
    g.fillStyle = shade(st.ground[0], 0.12);
    for (let i = 0; i < 6; i++) g.fillRect(2 + i * 2, 4 + (i % 3), 1, 8 - (i % 3));
    return { c, ax: 8, ay: 11, tall: false };
  },
  mushroom: () => {
    const { c, g } = canvas(14, 14);
    g.fillStyle = '#eee'; g.fillRect(6, 7, 3, 6);
    ellipse(g, 7, 6, 6, 3, '#c53030');
    g.fillStyle = '#fff'; g.fillRect(4, 5, 2, 1); g.fillRect(9, 4, 1, 1);
    return { c, ax: 7, ay: 13, tall: false };
  },
  rock: (rng, st) => {
    const { c, g } = canvas(30, 22);
    const b = st.id === 'cinnabar' ? '#4a3a33' : st.id === 'seafoam' ? '#7d8a96' : '#7c7470';
    ellipse(g, 15, 19, 13, 3, 'rgba(0,0,0,0.25)');
    ellipse(g, 15, 12, 12, 8, shade(b, -0.1));
    ellipse(g, 13, 10, 9, 6, b);
    ellipse(g, 11, 8, 4, 2, shade(b, 0.12));
    if (rng.chance(0.4)) ellipse(g, 24, 15, 5, 4, shade(b, -0.05));
    return { c, ax: 15, ay: 19, tall: false };
  },
  crystal: (rng, st) => {
    const { c, g } = canvas(24, 34);
    const col = st.id === 'cerulean' ? '#7fb3ff' : rng.pick(['#c3a6ff', '#8fd3ff', '#ffb3e6']);
    ellipse(g, 12, 31, 9, 2, 'rgba(0,0,0,0.25)');
    const shard = (x: number, h: number, w: number) => {
      for (let y = 0; y < h; y++) {
        const ww = Math.max(1, Math.round(w * Math.min(1, (h - y) / (h * 0.4))));
        g.fillStyle = y < h * 0.3 ? shade(col, 0.15) : col; g.fillRect(x - ww, 31 - h + y, ww, 1);
        g.fillStyle = shade(col, -0.15); g.fillRect(x, 31 - h + y, ww, 1);
      }
    };
    shard(12, 26, 4); shard(6, 14, 3); shard(18, 17, 3);
    return { c, ax: 12, ay: 31, tall: true };
  },
  stalagmite: (_r, st) => {
    const { c, g } = canvas(20, 40);
    const b = st.id === 'cinnabar' ? '#5a3b2c' : '#6a6178';
    ellipse(g, 10, 37, 8, 2, 'rgba(0,0,0,0.25)');
    for (let y = 0; y < 34; y++) {
      const w = Math.max(1, Math.round(7 * (y / 34)));
      g.fillStyle = b; g.fillRect(10 - w, 3 + y, w * 2, 1);
      g.fillStyle = shade(b, 0.12); g.fillRect(10 - w, 3 + y, Math.max(1, w - 2), 1);
    }
    return { c, ax: 10, ay: 37, tall: true };
  },
  bones: () => {
    const { c, g } = canvas(22, 12);
    g.fillStyle = '#e8e2d0';
    g.fillRect(4, 5, 14, 2); disc(g, 4, 5, 2, '#e8e2d0'); disc(g, 18, 6, 2, '#e8e2d0');
    disc(g, 10, 9, 2, '#d8d0bc');
    return { c, ax: 11, ay: 10, tall: false };
  },
  puddle: (_r, st) => {
    const { c, g } = canvas(40, 18);
    const col = st.id === 'powerplant' ? '#3b3f2e' : '#4f86b8';
    ellipse(g, 20, 9, 18, 7, shade(col, -0.05));
    ellipse(g, 18, 8, 14, 5, col);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(12, 6, 6, 1); g.fillRect(24, 10, 4, 1);
    return { c, ax: 20, ay: 9, tall: false };
  },
  ice: (rng) => {
    const { c, g } = canvas(30, 30);
    ellipse(g, 15, 27, 12, 3, 'rgba(0,0,0,0.2)');
    const h = rng.int(16, 24);
    for (let y = 0; y < h; y++) {
      const w = Math.round(10 * Math.sin((y / h) * Math.PI * 0.9 + 0.2));
      g.fillStyle = y < 4 ? '#ffffff' : '#bfe6f7'; g.fillRect(15 - w, 27 - h + y, w * 2, 1);
      g.fillStyle = '#93cde6'; g.fillRect(15, 27 - h + y, w, 1);
    }
    return { c, ax: 15, ay: 27, tall: true };
  },
  shell: (rng) => {
    const { c, g } = canvas(14, 12);
    const col = rng.pick(['#f6c1d0', '#f7e3b5', '#cfe0f5']);
    ellipse(g, 7, 7, 6, 4, col);
    g.fillStyle = shade(col, -0.2); g.fillRect(4, 5, 1, 4); g.fillRect(7, 4, 1, 5); g.fillRect(10, 5, 1, 4);
    return { c, ax: 7, ay: 10, tall: false };
  },
  pylon: () => {
    const { c, g } = canvas(26, 56);
    ellipse(g, 13, 53, 10, 3, 'rgba(0,0,0,0.3)');
    g.fillStyle = '#4a4a52'; g.fillRect(9, 10, 8, 44);
    g.fillStyle = '#6b6b75'; g.fillRect(10, 10, 3, 44);
    g.fillStyle = '#e6c84a'; for (let y = 16; y < 50; y += 8) g.fillRect(9, y, 8, 3);
    g.fillStyle = '#2d2d33'; g.fillRect(4, 6, 18, 5);
    disc(g, 13, 4, 3, '#ffe066');
    return { c, ax: 13, ay: 53, tall: true };
  },
  grave: (rng) => {
    const { c, g } = canvas(22, 30);
    ellipse(g, 11, 27, 9, 2, 'rgba(0,0,0,0.3)');
    const b = '#8a8597';
    g.fillStyle = b; g.fillRect(4, 8, 14, 19);
    disc(g, 11, 8, 7, b);
    g.fillStyle = shade(b, 0.12); g.fillRect(5, 6, 3, 20);
    g.fillStyle = shade(b, -0.25); g.fillRect(8, 12, 6, 1); g.fillRect(8, 15, 6, 1); g.fillRect(8, 18, 4, 1);
    if (rng.chance(0.4)) { g.fillStyle = '#4a7a3a'; g.fillRect(3, 24, 4, 3); }
    return { c, ax: 11, ay: 27, tall: true };
  },
  candle: () => {
    const { c, g } = canvas(10, 22);
    g.fillStyle = '#efe6d2'; g.fillRect(3, 9, 4, 11);
    g.fillStyle = '#7d5fff'; disc(g, 5, 5, 3, '#9b7dff'); g.fillStyle = '#e8ddff'; g.fillRect(5, 4, 1, 3);
    return { c, ax: 5, ay: 20, tall: false };
  },
  lava: () => {
    const { c, g } = canvas(46, 22);
    ellipse(g, 23, 11, 21, 9, '#8c2d10');
    ellipse(g, 22, 10, 17, 7, '#e0632a');
    ellipse(g, 20, 9, 10, 4, '#ffae42');
    g.fillStyle = '#fff1a8'; g.fillRect(16, 8, 4, 1);
    return { c, ax: 23, ay: 11, tall: false };
  },
};

export class Background {
  readonly tile: HTMLCanvasElement;
  private sprites: DecorSprite[] = [];
  private pattern: CanvasPattern | null = null;
  readonly density: number;

  constructor(stage: StageDef) {
    this.tile = buildGroundTile(stage);
    const rng = new Rng(1337);
    for (const d of stage.decor) for (let v = 0; v < 3; v++) this.sprites.push(DECOR_DRAW[d](rng, stage));
    this.density = stage.id === 'viridian' ? 0.55 : 0.4;
  }

  /** Deterministic decor for a world cell. */
  decorAt(cx: number, cy: number): { s: DecorSprite; x: number; y: number } | null {
    let h = (cx * 374761393 + cy * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    const u = (h >>> 0) / 4294967296;
    if (u > this.density) return null;
    const v = ((h >>> 8) & 0xffff) / 65536;
    const w = ((h >>> 3) & 0x3ff) / 1024;
    // keep the spawn point clear
    if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) return null;
    return {
      s: this.sprites[Math.floor(w * this.sprites.length)],
      x: cx * DECOR_CELL + 12 + v * (DECOR_CELL - 24),
      y: cy * DECOR_CELL + 12 + ((u * 7.13) % 1) * (DECOR_CELL - 24),
    };
  }

  drawGround(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
    if (!this.pattern) this.pattern = g.createPattern(this.tile, 'repeat');
    g.fillStyle = this.pattern!;
    g.fillRect(x0, y0, w, h);
  }
}
