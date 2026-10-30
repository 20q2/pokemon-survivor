import type { WorldView } from '../render/renderer.ts';
import { SLOT_COLORS, chestTier } from '../render/renderer.ts';
import { CHEST_COLOR } from '../game/types.ts';
import { h } from './dom.ts';
import { assets } from '../render/assets.ts';

/** World radius (px) the minimap covers around the local partner. */
const RANGE = 1300;
/** Logical size of the minimap in canvas pixels (drawn crisp and scaled up by CSS). */
const SIZE = 96;

/**
 * PMD-style dungeon map: a translucent window showing the area around you. Treasure, the Mega
 * Stone, Alphas and bosses stay pinned to the rim when they are out of range, so you always know
 * which way to go.
 */
export class Minimap {
  readonly el: HTMLElement;
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private t = 0;

  constructor() {
    this.c = h('canvas', { width: SIZE, height: SIZE, class: 'mm-canvas' }) as HTMLCanvasElement;
    this.g = this.c.getContext('2d')!;
    this.el = h('div', { class: 'minimap' }, this.c);
  }

  update(world: WorldView, localId: number, dt: number) {
    this.t += dt;
    const g = this.g;
    const me = world.players[localId] ?? world.players[0];
    if (!me) return;
    const half = SIZE / 2;
    const k = half / RANGE;
    g.clearRect(0, 0, SIZE, SIZE);
    // faint grid that scrolls with you, so movement reads on the map
    g.fillStyle = 'rgba(120,170,255,0.10)';
    const step = 200 * k;
    const ox = ((-me.x * k) % step + step) % step, oy = ((-me.y * k) % step + step) % step;
    for (let x = ox; x < SIZE; x += step) g.fillRect(Math.round(x), 0, 1, SIZE);
    for (let y = oy; y < SIZE; y += step) g.fillRect(0, Math.round(y), SIZE, 1);

    const blink = Math.floor(this.t * 4) % 2 === 0;
    const pos = (x: number, y: number) => [half + (x - me.x) * k, half + (y - me.y) * k] as const;
    /** Plot a dot; if pinned, clamp to the rim when out of range. */
    const dot = (x: number, y: number, size: number, color: string, pinned: boolean) => {
      let [px, py] = pos(x, y);
      const out = px < 2 || py < 2 || px > SIZE - 2 || py > SIZE - 2;
      if (out) {
        if (!pinned) return;
        const dx = px - half, dy = py - half;
        const s = (half - 3) / Math.max(Math.abs(dx), Math.abs(dy));
        px = half + dx * s; py = half + dy * s;
      }
      g.fillStyle = color;
      g.fillRect(Math.round(px - size / 2), Math.round(py - size / 2), size, size);
    };

    /** Pinned icon (falls back to a dot until the image has loaded). */
    const icon = (x: number, y: number, name: string, size: number, fallback: string) => {
      const im = assets.uiImage(name);
      if (!im) { dot(x, y, 4, fallback, true); return; }
      let [px, py] = pos(x, y);
      if (px < 4 || py < 4 || px > SIZE - 4 || py > SIZE - 4) {
        const dx = px - half, dy = py - half;
        const s = (half - 5) / Math.max(Math.abs(dx), Math.abs(dy));
        px = half + dx * s; py = half + dy * s;
      }
      g.drawImage(im, Math.round(px - size / 2), Math.round(py - size / 2), size, size);
    };

    // wild Pokémon: a dim speckle
    g.fillStyle = 'rgba(255,90,90,0.55)';
    for (const e of world.enemies) {
      if (!e.alive || e.boss || e.alpha || e.elite) continue;
      const [px, py] = pos(e.x, e.y);
      if (px >= 0 && py >= 0 && px < SIZE && py < SIZE) g.fillRect(px | 0, py | 0, 1, 1);
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (e.boss) dot(e.x, e.y, 5, blink ? '#ff2d2d' : '#ffffff', true);
      else if (e.alpha) icon(e.x, e.y, 'alpha', 9, '#ff3b3b');
      else if (e.role === 'treasure') dot(e.x, e.y, 3, '#ffe066', true);
      else if (e.elite) dot(e.x, e.y, 2, '#ffa94d', false);
    }
    for (const pk of world.pickups) {
      if (pk.dead) continue;
      if (pk.kind === 'chest' || pk.kind === 'dig') {
        const t = chestTier(pk.value);
        dot(pk.x, pk.y, t >= 3 ? 6 : 5, '#000', true);
        dot(pk.x, pk.y, t >= 3 ? 4 : 3, CHEST_COLOR[t], true);
      } else if (pk.kind === 'mega-stone') icon(pk.x, pk.y, 'mega', 9, `hsl(${Math.floor((this.t * 160) % 360)},100%,65%)`);
      else if (pk.kind !== 'candy' && pk.kind !== 'coin') dot(pk.x, pk.y, 2, '#74e0ff', false);
    }
    for (const p of world.players) {
      if (!p.connected) continue;
      if (p.id === me.id) continue;
      dot(p.x, p.y, 4, SLOT_COLORS[p.slot], true);
    }
    // you: a little arrow
    g.save();
    g.translate(half, half);
    g.rotate(Math.atan2(me.fy, me.fx));
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(4, 0); g.lineTo(-3, 3); g.lineTo(-1, 0); g.lineTo(-3, -3); g.closePath();
    g.fill();
    g.restore();
  }
}
