import { SPECIES_LIST } from '../data/pokedex.ts';
import type { PickupKind, Player, Projectile, Enemy } from '../game/types.ts';

export const PROTOCOL = 3;
export const ROOM_PREFIX = 'pkmnsurv-v3-';
export const SNAP_HZ = 20;

const SPECIES_INDEX = new Map(SPECIES_LIST.map((s, i) => [s.id, i]));
export const PICKUP_KINDS: PickupKind[] = ['candy', 'coin', 'oran', 'sitrus', 'magnet', 'repel', 'chest', 'rare-candy'];

export interface SnapPlayer { x: number; y: number; hp: number; fx: number; fy: number; moving: boolean; fainted: boolean; connected: boolean; hurt: boolean; revive: number }
export interface SnapEnemy {
  id: number; species: string; x: number; y: number; dirX: number; dirY: number; hpFrac: number;
  elite: boolean; boss: boolean; shiny: boolean; final: boolean; freeze: boolean; burn: boolean; poison: boolean;
  paralyze: boolean; confuse: boolean; slow: boolean; flash: boolean; scale: number;
}
export interface Snapshot { time: number; players: SnapPlayer[]; enemies: SnapEnemy[] }

const q8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 100)));

/** Binary snapshot of players + the enemies near one client. */
export function encodeSnapshot(time: number, players: Player[], enemies: Enemy[], cx: number, cy: number, radius: number): ArrayBuffer {
  const visible: Enemy[] = [];
  const r2 = radius * radius;
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - cx, dy = e.y - cy;
    if (e.boss || dx * dx + dy * dy < r2) visible.push(e);
  }
  const buf = new ArrayBuffer(1 + 4 + 1 + players.length * 16 + 2 + 8 + visible.length * 16);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, 1); o += 1;
  v.setFloat32(o, time); o += 4;
  v.setUint8(o, players.length); o += 1;
  for (const p of players) {
    v.setFloat32(o, p.x); o += 4;
    v.setFloat32(o, p.y); o += 4;
    v.setFloat32(o, p.hp); o += 4;
    v.setInt8(o, q8(p.fx)); o += 1;
    v.setInt8(o, q8(p.fy)); o += 1;
    v.setUint8(o, (p.moving ? 1 : 0) | (p.fainted ? 2 : 0) | (p.connected ? 4 : 0) | (p.hurtT > 0 ? 8 : 0)); o += 1;
    v.setUint8(o, Math.round(Math.min(3, p.reviveProgress) * 80)); o += 1;
  }
  v.setUint16(o, visible.length); o += 2;
  v.setFloat32(o, cx); o += 4;
  v.setFloat32(o, cy); o += 4;
  for (const e of visible) {
    v.setUint32(o, e.id); o += 4;
    v.setUint8(o, SPECIES_INDEX.get(e.speciesId) ?? 0); o += 1;
    v.setInt16(o, Math.max(-32767, Math.min(32767, Math.round(e.x - cx)))); o += 2;
    v.setInt16(o, Math.max(-32767, Math.min(32767, Math.round(e.y - cy)))); o += 2;
    v.setInt8(o, q8(e.dirX)); o += 1;
    v.setInt8(o, q8(e.dirY)); o += 1;
    v.setUint8(o, Math.round(Math.max(0, Math.min(1, e.hp / e.maxHp)) * 255)); o += 1;
    const st = e.st;
    v.setUint8(o, (e.elite ? 1 : 0) | (e.boss ? 2 : 0) | (e.shiny ? 4 : 0) | (e.final ? 8 : 0) | (st.freeze > 0 || st.flinch > 0 ? 16 : 0) | (st.burn > 0 ? 32 : 0) | (st.poison > 0 ? 64 : 0) | (st.paralyze > 0 ? 128 : 0)); o += 1;
    v.setUint8(o, (st.confuse > 0 ? 1 : 0) | (st.slow > 0 ? 2 : 0) | (e.flash > 0 ? 4 : 0)); o += 1;
    v.setUint8(o, Math.round(e.scale * 40)); o += 1;
    o += 1; // pad
  }
  return buf;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot | null {
  const v = new DataView(buf);
  let o = 0;
  if (v.getUint8(o) !== 1) return null;
  o += 1;
  const time = v.getFloat32(o); o += 4;
  const np = v.getUint8(o); o += 1;
  const players: SnapPlayer[] = [];
  for (let i = 0; i < np; i++) {
    const x = v.getFloat32(o); o += 4;
    const y = v.getFloat32(o); o += 4;
    const hp = v.getFloat32(o); o += 4;
    const fx = v.getInt8(o) / 100; o += 1;
    const fy = v.getInt8(o) / 100; o += 1;
    const f = v.getUint8(o); o += 1;
    const revive = v.getUint8(o) / 80; o += 1;
    players.push({ x, y, hp, fx, fy, moving: !!(f & 1), fainted: !!(f & 2), connected: !!(f & 4), hurt: !!(f & 8), revive });
  }
  const ne = v.getUint16(o); o += 2;
  const cx = v.getFloat32(o); o += 4;
  const cy = v.getFloat32(o); o += 4;
  const enemies: SnapEnemy[] = [];
  for (let i = 0; i < ne; i++) {
    const id = v.getUint32(o); o += 4;
    const species = SPECIES_LIST[v.getUint8(o)]?.id ?? 'rattata'; o += 1;
    const x = cx + v.getInt16(o); o += 2;
    const y = cy + v.getInt16(o); o += 2;
    const dirX = v.getInt8(o) / 100; o += 1;
    const dirY = v.getInt8(o) / 100; o += 1;
    const hpFrac = v.getUint8(o) / 255; o += 1;
    const f = v.getUint8(o); o += 1;
    const f2 = v.getUint8(o); o += 1;
    const scale = v.getUint8(o) / 40; o += 1;
    o += 1;
    enemies.push({
      id, species, x, y, dirX, dirY, hpFrac, elite: !!(f & 1), boss: !!(f & 2), shiny: !!(f & 4), final: !!(f & 8),
      freeze: !!(f & 16), burn: !!(f & 32), poison: !!(f & 64), paralyze: !!(f & 128), confuse: !!(f2 & 1), slow: !!(f2 & 2), flash: !!(f2 & 4), scale,
    });
  }
  return { time, players, enemies };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const PROJ_KEYS = [
  'id', 'owner', 'hostile', 'moveId', 'behavior', 'fx', 'type', 'cat', 'shape', 'x', 'y', 'vx', 'vy', 'angle', 'r', 'len',
  't', 'life', 'delay', 'attach', 'ox', 'oy', 'orbitR', 'orbitSpd', 'orbitA', 'homing', 'speed', 'boomerang', 'tx', 'ty',
  'sx', 'sy', 'growth', 'dmg',
] as const;

export function projToWire(p: Projectile): unknown[] {
  return PROJ_KEYS.map((k) => {
    const v = p[k];
    return typeof v === 'number' ? (Number.isFinite(v) ? r2(v) : 1e9) : v;
  });
}

export function projFromWire(a: unknown[]): Projectile {
  const o: Record<string, unknown> = {};
  PROJ_KEYS.forEach((k, i) => { o[k] = a[i]; });
  return {
    ...(o as unknown as Projectile),
    returning: false, pierce: -1, tick: 0, knock: 0, chance: 0, crit: 0, hit: new Map(), dead: false,
  };
}
