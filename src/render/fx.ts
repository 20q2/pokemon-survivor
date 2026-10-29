/** Pooled particle system and bitmap-font damage numbers. */

const MAX_PARTICLES = 2400;

export class Particles {
  n = 0;
  x = new Float32Array(MAX_PARTICLES);
  y = new Float32Array(MAX_PARTICLES);
  vx = new Float32Array(MAX_PARTICLES);
  vy = new Float32Array(MAX_PARTICLES);
  life = new Float32Array(MAX_PARTICLES);
  max = new Float32Array(MAX_PARTICLES);
  size = new Float32Array(MAX_PARTICLES);
  grav = new Float32Array(MAX_PARTICLES);
  color: string[] = new Array(MAX_PARTICLES).fill('#fff');
  additive = new Uint8Array(MAX_PARTICLES);

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, grav = 0, additive = false) {
    let i = this.n;
    if (i >= MAX_PARTICLES) {
      // overwrite a random old one rather than dropping new feedback
      i = (Math.random() * MAX_PARTICLES) | 0;
    } else this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.color[i] = color;
    this.grav[i] = grav; this.additive[i] = additive ? 1 : 0;
  }

  burst(x: number, y: number, count: number, speed: number, color: string, life = 0.5, size = 2, additive = false, grav = 0) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size, color, grav, additive);
    }
  }

  update(dt: number) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i] - dt;
      if (l <= 0) continue;
      this.life[w] = l;
      this.vx[w] = this.vx[i] * (1 - dt * 2.5);
      this.vy[w] = this.vy[i] * (1 - dt * 2.5) + this.grav[i] * dt;
      this.x[w] = this.x[i] + this.vx[w] * dt;
      this.y[w] = this.y[i] + this.vy[w] * dt;
      this.max[w] = this.max[i]; this.size[w] = this.size[i]; this.color[w] = this.color[i];
      this.grav[w] = this.grav[i]; this.additive[w] = this.additive[i];
      w++;
    }
    this.n = w;
  }

  draw(g: CanvasRenderingContext2D, additivePass: boolean) {
    for (let i = 0; i < this.n; i++) {
      if ((this.additive[i] === 1) !== additivePass) continue;
      const k = this.life[i] / this.max[i];
      const s = Math.max(1, this.size[i] * (0.4 + k * 0.6));
      g.globalAlpha = Math.min(1, k * 1.6);
      g.fillStyle = this.color[i];
      g.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
    }
    g.globalAlpha = 1;
  }
}

// ─────────────────────────── damage numbers ───────────────────────────

const DIGITS = '0123456789';
type FontColor = 'white' | 'super' | 'weak' | 'crit' | 'heal' | 'hurt';
const FONT_COLORS: Record<FontColor, [string, string]> = {
  white: ['#ffffff', '#2a2a2a'],
  super: ['#ffb347', '#5a2400'],
  weak: ['#a8b0bd', '#26292e'],
  crit: ['#ffe14d', '#6b3000'],
  heal: ['#7dff8a', '#0d4016'],
  hurt: ['#ff5a5a', '#3a0000'],
};

class BitmapFont {
  readonly gw = 7;
  readonly gh = 9;
  sheets = new Map<FontColor, HTMLCanvasElement>();
  constructor() {
    for (const [k, [fill, outline]] of Object.entries(FONT_COLORS) as [FontColor, [string, string]][]) {
      const c = document.createElement('canvas');
      c.width = this.gw * DIGITS.length;
      c.height = this.gh;
      const g = c.getContext('2d')!;
      g.font = 'bold 9px monospace';
      g.textBaseline = 'top';
      g.textAlign = 'center';
      for (let i = 0; i < DIGITS.length; i++) {
        const x = i * this.gw + this.gw / 2;
        g.fillStyle = outline;
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText(DIGITS[i], x + ox, 0 + oy);
        g.fillStyle = fill;
        g.fillText(DIGITS[i], x, 0);
      }
      // binarize alpha so it stays crisp when scaled
      const img = g.getImageData(0, 0, c.width, c.height);
      for (let p = 3; p < img.data.length; p += 4) img.data[p] = img.data[p] > 90 ? 255 : 0;
      g.putImageData(img, 0, 0);
      this.sheets.set(k, c);
    }
  }
  draw(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: FontColor, scale: number) {
    const sheet = this.sheets.get(color)!;
    const w = (this.gw - 1) * scale;
    let cx = x - (text.length * w) / 2;
    for (const ch of text) {
      const i = ch.charCodeAt(0) - 48;
      if (i >= 0 && i < 10) g.drawImage(sheet, i * this.gw, 0, this.gw, this.gh, cx, y, this.gw * scale, this.gh * scale);
      cx += w;
    }
  }
}

interface Num { x: number; y: number; text: string; color: FontColor; t: number; life: number; scale: number }
interface Label { x: number; y: number; text: string; color: string; t: number; life: number }

export class DamageNumbers {
  private font = new BitmapFont();
  private nums: Num[] = [];
  private labels: Label[] = [];

  add(x: number, y: number, value: number, eff: number, crit: boolean) {
    if (this.nums.length > 160) {
      // under heavy load keep only meaningful numbers
      if (eff <= 1 && !crit && value < 50) return;
      this.nums.shift();
    }
    const color: FontColor = crit ? 'crit' : eff > 1 ? 'super' : eff < 1 ? 'weak' : 'white';
    this.nums.push({ x: x + (Math.random() - 0.5) * 8, y, text: String(value), color, t: 0, life: 0.65, scale: crit || eff > 1 ? 1.25 : 1 });
  }

  addPlayer(x: number, y: number, value: number, heal: boolean) {
    this.nums.push({ x, y, text: String(Math.round(value)), color: heal ? 'heal' : 'hurt', t: 0, life: 0.8, scale: 1.2 });
  }

  label(x: number, y: number, text: string, color: string) {
    if (this.labels.length > 6) return;
    this.labels.push({ x, y, text, color, t: 0, life: 0.9 });
  }

  update(dt: number) {
    for (const n of this.nums) n.t += dt;
    for (const l of this.labels) l.t += dt;
    if (this.nums.length && this.nums[0].t > this.nums[0].life) this.nums = this.nums.filter((n) => n.t < n.life);
    if (this.labels.length) this.labels = this.labels.filter((l) => l.t < l.life);
  }

  draw(g: CanvasRenderingContext2D) {
    for (const n of this.nums) {
      const k = n.t / n.life;
      const pop = k < 0.15 ? 1 + (0.15 - k) * 4 : 1;
      g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      this.font.draw(g, n.text, n.x, n.y - k * 14, n.color, n.scale * pop);
    }
    g.globalAlpha = 1;
    g.font = '8px "Press Start 2P", monospace';
    g.textAlign = 'center';
    for (const l of this.labels) {
      const k = l.t / l.life;
      g.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      g.fillStyle = '#000';
      g.fillText(l.text, l.x + 1, l.y - k * 10 + 1);
      g.fillStyle = l.color;
      g.fillText(l.text, l.x, l.y - k * 10);
    }
    g.globalAlpha = 1;
  }
}
