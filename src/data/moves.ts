import type { PType } from './types.ts';

export type Behavior =
  | 'projectile' // shots aimed at nearest enemies (homing optional)
  | 'melee'      // instant arc swipe in facing direction(s)
  | 'orbit'      // orbs circling the user
  | 'aura'       // persistent damage field around user
  | 'nova'       // expanding ring from user
  | 'beam'       // instant piercing line
  | 'strike'     // telegraphed hits falling on enemies
  | 'zone'       // lingering hazard placed on enemies
  | 'boomerang'  // out-and-back piercing projectile
  | 'chain'      // jumps between nearby enemies
  | 'trail'      // hazards dropped along the user's path
  | 'cone'       // short-range spray toward target
  | 'wave'       // wide slow wall that sweeps the field
  | 'buff'       // periodic self effect (status moves)
  | 'lob';       // arcs to target, explodes in an area

export type Category = 'physical' | 'special' | 'status';
export type StatusKind = 'burn' | 'poison' | 'paralyze' | 'freeze' | 'slow' | 'flinch' | 'confuse' | 'drain' | 'coin';
export type BuffKind = 'atk' | 'spa' | 'speed' | 'heal' | 'shield' | 'dodge' | 'haste' | 'crit';
export type Fx =
  | 'orb' | 'star' | 'leaf' | 'bolt' | 'bubble' | 'rock' | 'flame' | 'shadow' | 'wind' | 'slash'
  | 'ring' | 'spike' | 'seed' | 'bone' | 'shard' | 'punch' | 'note' | 'heart' | 'fang' | 'needle'
  | 'tornado' | 'meteor' | 'puddle' | 'cloud' | 'wave' | 'web' | 'beam';

export interface MoveStats {
  power: number;
  cd: number;        // seconds between activations
  count: number;     // projectiles / targets / directions
  speed: number;     // px/s (projectiles) or rad/s (orbit)
  area: number;      // radius / half-width in px
  range: number;     // reach / orbit radius / beam length in px
  duration: number;  // lifetime in s
  pierce: number;    // enemies hit before vanishing (-1 = infinite)
  knock: number;     // knockback impulse
  homing: number;    // turn rate rad/s
  spread: number;    // fan angle in degrees (0 = each shot picks its own target)
  tick: number;      // re-hit interval for persistent shapes (s)
  chance: number;    // status effect chance 0..1
}

export interface MoveDef {
  id: string;
  name: string;
  type: PType;
  cat: Category;
  behavior: Behavior;
  fx: Fx;
  stats: Partial<MoveStats> & { power: number; cd: number };
  /** Upgrades applied at Lv2..Lv5 (additive; cd/area/duration entries are fractional multipliers e.g. cd:-0.1 = 10% faster).
   *  Lv6..Lv8 come from LATE_UP for the move's behaviour. */
  up?: Partial<MoveStats>[];
  effect?: StatusKind;
  buff?: { kind: BuffKind; amount: number };
  /** If set, this move is the mastered form of `from`, unlocked by holding `item`. */
  mastery?: { from: string; item: string };
  desc: string;
}

export const MAX_MOVE_LEVEL = 8;

export const DEFAULT_STATS: MoveStats = {
  power: 10, cd: 1, count: 1, speed: 300, area: 8, range: 60, duration: 1, pierce: 1,
  knock: 40, homing: 0, spread: 0, tick: 0.5, chance: 0,
};

/** Default per-level upgrade tables by behaviour when a move doesn't specify its own. */
const DEFAULT_UP: Record<Behavior, Partial<MoveStats>[]> = {
  projectile: [{ power: 6 }, { count: 1 }, { power: 6, pierce: 1 }, { count: 1, cd: -0.1 }],
  melee: [{ power: 8 }, { area: 0.15 }, { count: 1 }, { power: 10, cd: -0.1 }],
  orbit: [{ count: 1 }, { power: 6, area: 0.15 }, { count: 1, duration: 0.25 }, { power: 8, speed: 0.6 }],
  aura: [{ area: 0.15 }, { power: 4 }, { area: 0.15, cd: -0.1 }, { power: 6 }],
  nova: [{ power: 8 }, { area: 0.15 }, { cd: -0.12 }, { power: 10, count: 1 }],
  beam: [{ power: 8 }, { area: 0.25 }, { count: 1 }, { power: 10, cd: -0.1 }],
  strike: [{ count: 1 }, { power: 8 }, { area: 0.2, count: 1 }, { power: 10, cd: -0.1 }],
  zone: [{ area: 0.15 }, { power: 4, duration: 0.25 }, { count: 1 }, { power: 5, area: 0.15 }],
  boomerang: [{ power: 6 }, { count: 1 }, { area: 0.2, power: 6 }, { count: 1 }],
  chain: [{ count: 1 }, { power: 6 }, { count: 2 }, { power: 8, cd: -0.1 }],
  trail: [{ power: 4 }, { duration: 0.3 }, { area: 0.2 }, { power: 6, cd: -0.15 }],
  cone: [{ power: 5 }, { range: 0.15 }, { power: 5, area: 0.2 }, { cd: -0.15, duration: 0.25 }],
  wave: [{ power: 8 }, { area: 0.2 }, { count: 1 }, { power: 10, cd: -0.1 }],
  buff: [{ cd: -0.1 }, { duration: 0.25 }, { cd: -0.1 }, { duration: 0.25 }],
  lob: [{ power: 8 }, { count: 1 }, { area: 0.2 }, { power: 10, count: 1 }],
};

/** Lv6..Lv8 upgrades by behaviour. Here `power` is a fractional multiplier too (0.2 = +20%). */
const LATE_UP: Record<Behavior, Partial<MoveStats>[]> = {
  projectile: [{ power: 0.2 }, { count: 1 }, { power: 0.3, speed: 0.15 }],
  melee: [{ power: 0.2 }, { area: 0.15 }, { power: 0.3, cd: -0.1 }],
  orbit: [{ power: 0.2 }, { count: 1 }, { power: 0.3, duration: 0.2 }],
  aura: [{ power: 0.2 }, { area: 0.12 }, { power: 0.3 }],
  nova: [{ power: 0.2 }, { area: 0.12 }, { power: 0.3, cd: -0.1 }],
  beam: [{ power: 0.2 }, { area: 0.2 }, { power: 0.3, cd: -0.1 }],
  strike: [{ power: 0.2 }, { count: 1 }, { power: 0.3 }],
  zone: [{ power: 0.2 }, { duration: 0.2 }, { power: 0.3, area: 0.12 }],
  boomerang: [{ power: 0.2 }, { count: 1 }, { power: 0.3 }],
  chain: [{ power: 0.2 }, { count: 2 }, { power: 0.3 }],
  trail: [{ power: 0.2 }, { area: 0.15 }, { power: 0.3 }],
  cone: [{ power: 0.2 }, { area: 0.15 }, { power: 0.3, cd: -0.1 }],
  wave: [{ power: 0.2 }, { area: 0.15 }, { power: 0.3, cd: -0.1 }],
  buff: [{ cd: -0.1 }, { duration: 0.2 }, { cd: -0.12 }],
  lob: [{ power: 0.2 }, { count: 1 }, { power: 0.3 }],
};

/** Stats that combine multiplicatively in upgrade tables. */
const MULT_KEYS = new Set<keyof MoveStats>(['cd', 'area', 'range', 'duration', 'speed']);

/** Power multiplier for levels past the max ("limit break"): keeps growing, ever more slowly. */
export function overLevelMult(level: number) {
  return level > MAX_MOVE_LEVEL ? 1 + 0.35 * Math.log(1 + level - MAX_MOVE_LEVEL) : 1;
}

export function moveStatsAt(def: MoveDef, level: number): MoveStats {
  const s: MoveStats = { ...DEFAULT_STATS, ...def.stats };
  s.power *= overLevelMult(level);
  // Mastered moves are a finished form: only limit-break levels change them.
  if (def.mastery) return s;
  const ups = def.up ?? DEFAULT_UP[def.behavior];
  for (let i = 0; i < Math.min(level, MAX_MOVE_LEVEL) - 1; i++) {
    const late = i >= ups.length;
    const up = late ? LATE_UP[def.behavior][i - ups.length] : ups[i];
    if (!up) break;
    for (const [k, v] of Object.entries(up) as [keyof MoveStats, number][]) {
      if (MULT_KEYS.has(k) || (late && k === 'power')) s[k] *= 1 + v;
      else s[k] += v;
    }
  }
  return s;
}

const M = (d: MoveDef) => d;

export const MOVE_LIST: MoveDef[] = [
  // ───────────── Normal ─────────────
  M({ id: 'tackle', name: 'Tackle', type: 'normal', cat: 'physical', behavior: 'melee', fx: 'punch', stats: { power: 40, cd: 1.2, area: 34, range: 26, knock: 120, duration: 0.18 }, desc: 'A full-body slam in front of you. Strong knockback.' }),
  M({ id: 'quick-attack', name: 'Quick Attack', type: 'normal', cat: 'physical', behavior: 'projectile', fx: 'wind', stats: { power: 30, cd: 0.7, speed: 520, area: 9, duration: 0.45, pierce: 2 }, desc: 'A lightning-fast short-range dash strike. Very low cooldown.' }),
  M({ id: 'swift', name: 'Swift', type: 'normal', cat: 'special', behavior: 'projectile', fx: 'star', stats: { power: 30, cd: 1.1, count: 2, speed: 260, area: 8, duration: 2.2, homing: 6 }, up: [{ count: 1 }, { power: 8 }, { count: 1 }, { power: 8, cd: -0.15 }], desc: 'Star rays that home in on foes. Never misses.' }),
  M({ id: 'hyper-voice', name: 'Hyper Voice', type: 'normal', cat: 'special', behavior: 'nova', fx: 'note', stats: { power: 45, cd: 3.2, area: 110, duration: 0.45, knock: 90 }, desc: 'A deafening shockwave that blasts everything around you.' }),
  M({ id: 'rapid-spin', name: 'Rapid Spin', type: 'normal', cat: 'physical', behavior: 'orbit', fx: 'ring', stats: { power: 25, cd: 4, count: 1, speed: 5, area: 12, range: 48, duration: 3, tick: 0.4 }, desc: 'Spinning shells orbit you, battering anything they touch.' }),
  M({ id: 'pay-day', name: 'Pay Day', type: 'normal', cat: 'physical', behavior: 'projectile', fx: 'orb', effect: 'coin', stats: { power: 28, cd: 1.3, count: 2, speed: 320, area: 7, duration: 1.2, spread: 25, chance: 0.12 }, desc: 'Flings coins at foes. Defeated enemies may drop extra Poké Dollars.' }),
  M({ id: 'hyper-beam', name: 'Hyper Beam', type: 'normal', cat: 'special', behavior: 'beam', fx: 'beam', mastery: { from: 'swift', item: 'silk-scarf' }, stats: { power: 160, cd: 2.4, area: 18, range: 420, duration: 0.5, count: 2, knock: 160 }, up: [], desc: 'MASTERED Swift. Twin devastating beams that pierce the whole screen.' }),
  // ───────────── Fire ─────────────
  M({ id: 'ember', name: 'Ember', type: 'fire', cat: 'special', behavior: 'projectile', fx: 'flame', effect: 'burn', stats: { power: 40, cd: 1.0, speed: 300, area: 8, duration: 1.4, chance: 0.1 }, desc: 'Small flames fired at the nearest foe. May burn.' }),
  M({ id: 'flame-wheel', name: 'Flame Wheel', type: 'fire', cat: 'physical', behavior: 'orbit', fx: 'flame', effect: 'burn', stats: { power: 35, cd: 3.5, count: 2, speed: 4, area: 11, range: 56, duration: 3, tick: 0.4, chance: 0.15 }, desc: 'Fireballs whirl around you. May burn.' }),
  M({ id: 'fire-spin', name: 'Fire Spin', type: 'fire', cat: 'special', behavior: 'zone', fx: 'flame', effect: 'burn', stats: { power: 15, cd: 3.5, count: 2, area: 34, duration: 3, tick: 0.5, chance: 0.15 }, desc: 'Traps foes in vortexes of fire that burn over time.' }),
  M({ id: 'flamethrower', name: 'Flamethrower', type: 'fire', cat: 'special', behavior: 'cone', fx: 'flame', effect: 'burn', stats: { power: 30, cd: 2.2, range: 120, area: 34, duration: 0.9, tick: 0.18, chance: 0.15 }, desc: 'A torrent of flame sprayed at nearby foes. May burn.' }),
  M({ id: 'heat-wave', name: 'Heat Wave', type: 'fire', cat: 'special', behavior: 'wave', fx: 'flame', effect: 'burn', stats: { power: 50, cd: 4.5, speed: 150, area: 48, duration: 2.4, pierce: -1, chance: 0.2 }, desc: 'A sweeping wall of scorching air.' }),
  M({ id: 'blaze-kick', name: 'Blaze Kick', type: 'fire', cat: 'physical', behavior: 'melee', fx: 'flame', effect: 'burn', stats: { power: 60, cd: 1.5, area: 40, range: 32, knock: 100, duration: 0.2, chance: 0.2 }, desc: 'A blazing kick. High critical-hit ratio and may burn.' }),
  M({ id: 'will-o-wisp', name: 'Will-O-Wisp', type: 'fire', cat: 'status', behavior: 'projectile', fx: 'flame', effect: 'burn', stats: { power: 12, cd: 1.6, count: 3, speed: 110, area: 9, duration: 3.5, homing: 2.5, chance: 1, pierce: 2 }, up: [{ count: 1 }, { duration: 0.2 }, { count: 1 }, { power: 6, count: 1 }], desc: 'Sinister ghost flames drift into foes and always burn.' }),
  M({ id: 'fire-blast', name: 'Fire Blast', type: 'fire', cat: 'special', behavior: 'lob', fx: 'flame', effect: 'burn', mastery: { from: 'ember', item: 'charcoal' }, stats: { power: 110, cd: 1.1, count: 3, speed: 330, area: 54, duration: 0.9, chance: 0.35, knock: 90 }, up: [], desc: 'MASTERED Ember. Star-shaped infernos explode on impact.' }),
  // ───────────── Water ─────────────
  M({ id: 'water-gun', name: 'Water Gun', type: 'water', cat: 'special', behavior: 'projectile', fx: 'bubble', stats: { power: 40, cd: 0.95, speed: 340, area: 8, duration: 1.2, knock: 70 }, desc: 'Squirts water at the nearest foe with strong knockback.' }),
  M({ id: 'bubble', name: 'Bubble', type: 'water', cat: 'special', behavior: 'projectile', fx: 'bubble', effect: 'slow', stats: { power: 22, cd: 1.4, count: 4, speed: 140, area: 9, duration: 2.4, spread: 70, chance: 0.4 }, up: [{ count: 1 }, { power: 6 }, { count: 2 }, { power: 6, cd: -0.15 }], desc: 'A spray of slow bubbles that can slow foes down.' }),
  M({ id: 'surf', name: 'Surf', type: 'water', cat: 'special', behavior: 'wave', fx: 'wave', stats: { power: 55, cd: 4.2, speed: 170, area: 56, duration: 2.6, pierce: -1, knock: 140 }, desc: 'A giant wave that sweeps across the field.' }),
  M({ id: 'whirlpool', name: 'Whirlpool', type: 'water', cat: 'special', behavior: 'zone', fx: 'puddle', effect: 'slow', stats: { power: 15, cd: 3.8, count: 2, area: 38, duration: 3, tick: 0.5, chance: 0.6 }, desc: 'Swirling water traps foes, slowing and damaging them.' }),
  M({ id: 'aqua-ring', name: 'Aqua Ring', type: 'water', cat: 'status', behavior: 'buff', fx: 'ring', buff: { kind: 'heal', amount: 0.04 }, stats: { power: 0, cd: 6, duration: 4 }, desc: 'A veil of water restores HP over time.' }),
  M({ id: 'water-pulse', name: 'Water Pulse', type: 'water', cat: 'special', behavior: 'nova', fx: 'ring', effect: 'confuse', stats: { power: 40, cd: 2.6, area: 95, duration: 0.5, chance: 0.2 }, desc: 'Ultrasonic waves of water. May confuse.' }),
  M({ id: 'aqua-jet', name: 'Aqua Jet', type: 'water', cat: 'physical', behavior: 'projectile', fx: 'bubble', stats: { power: 34, cd: 0.6, speed: 560, area: 9, duration: 0.35, pierce: 3 }, desc: 'A lightning-fast lunge of water.' }),
  M({ id: 'hydro-pump', name: 'Hydro Pump', type: 'water', cat: 'special', behavior: 'beam', fx: 'wave', mastery: { from: 'water-gun', item: 'mystic-water' }, stats: { power: 90, cd: 0.9, area: 16, range: 320, duration: 0.35, count: 2, knock: 220 }, up: [], desc: 'MASTERED Water Gun. High-pressure jets that blast foes away.' }),
  // ───────────── Grass ─────────────
  M({ id: 'vine-whip', name: 'Vine Whip', type: 'grass', cat: 'physical', behavior: 'melee', fx: 'slash', stats: { power: 45, cd: 1.15, area: 70, range: 18, knock: 60, duration: 0.2 }, up: [{ count: 1 }, { power: 10 }, { area: 0.2 }, { power: 12, cd: -0.15 }], desc: 'Lashes horizontally with long vines. Upgrades whip both sides.' }),
  M({ id: 'razor-leaf', name: 'Razor Leaf', type: 'grass', cat: 'physical', behavior: 'boomerang', fx: 'leaf', stats: { power: 35, cd: 1.6, count: 2, speed: 300, area: 9, range: 150, pierce: -1 }, desc: 'Sharp leaves fly out and return. High critical-hit ratio.' }),
  M({ id: 'leech-seed', name: 'Leech Seed', type: 'grass', cat: 'status', behavior: 'zone', fx: 'seed', effect: 'drain', stats: { power: 10, cd: 3, count: 3, area: 22, duration: 4, tick: 0.5, chance: 1 }, desc: 'Plants seeds on foes that sap HP and heal you.' }),
  M({ id: 'magical-leaf', name: 'Magical Leaf', type: 'grass', cat: 'special', behavior: 'projectile', fx: 'leaf', stats: { power: 34, cd: 1.0, count: 2, speed: 280, area: 8, duration: 2, homing: 7 }, desc: 'Strange leaves that chase foes down. Never misses.' }),
  M({ id: 'petal-dance', name: 'Petal Dance', type: 'grass', cat: 'special', behavior: 'orbit', fx: 'leaf', stats: { power: 30, cd: 3, count: 3, speed: 5.5, area: 10, range: 64, duration: 3.5, tick: 0.35 }, desc: 'A storm of petals dances around you.' }),
  M({ id: 'solar-beam', name: 'Solar Beam', type: 'grass', cat: 'special', behavior: 'beam', fx: 'beam', stats: { power: 120, cd: 4.2, area: 16, range: 360, duration: 0.6, knock: 100 }, desc: 'Absorbs light, then fires a massive beam.' }),
  M({ id: 'bullet-seed', name: 'Bullet Seed', type: 'grass', cat: 'physical', behavior: 'projectile', fx: 'seed', stats: { power: 18, cd: 0.9, count: 3, speed: 420, area: 5, duration: 0.9, spread: 14 }, up: [{ count: 1 }, { power: 5 }, { count: 1 }, { power: 5, cd: -0.15 }], desc: 'Fires a burst of seeds in rapid succession.' }),
  M({ id: 'leaf-blade', name: 'Leaf Blade', type: 'grass', cat: 'physical', behavior: 'melee', fx: 'slash', stats: { power: 70, cd: 1.4, area: 46, range: 34, knock: 80, duration: 0.18 }, desc: 'Slashes with a sharp leaf. High critical-hit ratio.' }),
  M({ id: 'power-whip', name: 'Power Whip', type: 'grass', cat: 'physical', behavior: 'melee', fx: 'slash', mastery: { from: 'vine-whip', item: 'miracle-seed' }, stats: { power: 120, cd: 0.9, count: 4, area: 120, range: 26, knock: 140, duration: 0.22 }, up: [], desc: 'MASTERED Vine Whip. Huge vines lash in every direction.' }),
  // ───────────── Electric ─────────────
  M({ id: 'thunder-shock', name: 'Thunder Shock', type: 'electric', cat: 'special', behavior: 'chain', fx: 'bolt', effect: 'paralyze', stats: { power: 40, cd: 1.1, count: 2, range: 90, chance: 0.1 }, desc: 'A jolt that arcs from foe to foe. May paralyze.' }),
  M({ id: 'spark', name: 'Spark', type: 'electric', cat: 'physical', behavior: 'aura', fx: 'bolt', effect: 'paralyze', stats: { power: 14, cd: 0.6, area: 42, chance: 0.08, knock: 20 }, desc: 'Crackling electricity zaps anything that gets close.' }),
  M({ id: 'thunderbolt', name: 'Thunderbolt', type: 'electric', cat: 'special', behavior: 'strike', fx: 'bolt', effect: 'paralyze', stats: { power: 60, cd: 1.8, count: 2, area: 26, chance: 0.15 }, desc: 'Bolts strike random foes. May paralyze.' }),
  M({ id: 'discharge', name: 'Discharge', type: 'electric', cat: 'special', behavior: 'nova', fx: 'bolt', effect: 'paralyze', stats: { power: 50, cd: 3, area: 120, duration: 0.4, chance: 0.3 }, desc: 'A flare of electricity hits everything around you.' }),
  M({ id: 'thunder-wave', name: 'Thunder Wave', type: 'electric', cat: 'status', behavior: 'nova', fx: 'ring', effect: 'paralyze', stats: { power: 5, cd: 5, area: 150, duration: 0.6, chance: 0.9, knock: 0 }, desc: 'A weak jolt that paralyzes foes around you.' }),
  M({ id: 'electro-ball', name: 'Electro Ball', type: 'electric', cat: 'special', behavior: 'projectile', fx: 'orb', effect: 'paralyze', stats: { power: 55, cd: 1.5, speed: 240, area: 13, duration: 1.8, pierce: 3, chance: 0.1 }, desc: 'A crackling orb. Faster users fire it harder.' }),
  M({ id: 'thunder', name: 'Thunder', type: 'electric', cat: 'special', behavior: 'strike', fx: 'bolt', effect: 'paralyze', mastery: { from: 'thunder-shock', item: 'magnet' }, stats: { power: 110, cd: 0.9, count: 5, area: 40, chance: 0.3, knock: 80 }, up: [], desc: 'MASTERED Thunder Shock. A relentless storm of lightning.' }),
  // ───────────── Ice ─────────────
  M({ id: 'powder-snow', name: 'Powder Snow', type: 'ice', cat: 'special', behavior: 'cone', fx: 'shard', effect: 'freeze', stats: { power: 22, cd: 1.6, range: 90, area: 30, duration: 0.6, tick: 0.2, chance: 0.08 }, desc: 'Blows freezing snow at foes. May freeze.' }),
  M({ id: 'ice-shard', name: 'Ice Shard', type: 'ice', cat: 'physical', behavior: 'projectile', fx: 'shard', stats: { power: 30, cd: 0.65, speed: 520, area: 7, duration: 0.8 }, desc: 'Flash-frozen chunks hurled at high speed.' }),
  M({ id: 'icy-wind', name: 'Icy Wind', type: 'ice', cat: 'special', behavior: 'wave', fx: 'wind', effect: 'slow', stats: { power: 40, cd: 3.8, speed: 190, area: 44, duration: 2.2, pierce: -1, chance: 0.8 }, desc: 'A chilling gust that slows everything it hits.' }),
  M({ id: 'ice-beam', name: 'Ice Beam', type: 'ice', cat: 'special', behavior: 'beam', fx: 'shard', effect: 'freeze', stats: { power: 70, cd: 2.6, area: 10, range: 260, duration: 0.4, chance: 0.2 }, desc: 'An icy ray. May freeze foes solid.' }),
  M({ id: 'aurora-beam', name: 'Aurora Beam', type: 'ice', cat: 'special', behavior: 'beam', fx: 'beam', effect: 'slow', stats: { power: 50, cd: 2.0, area: 9, range: 220, duration: 0.35, chance: 0.3, count: 2 }, desc: 'Rainbow-colored beams that may slow foes.' }),
  M({ id: 'blizzard', name: 'Blizzard', type: 'ice', cat: 'special', behavior: 'aura', fx: 'shard', effect: 'freeze', mastery: { from: 'powder-snow', item: 'never-melt-ice' }, stats: { power: 40, cd: 0.4, area: 150, chance: 0.08, knock: 25 }, up: [], desc: 'MASTERED Powder Snow. A howling blizzard surrounds you, freezing foes.' }),
  // ───────────── Fighting ─────────────
  M({ id: 'karate-chop', name: 'Karate Chop', type: 'fighting', cat: 'physical', behavior: 'melee', fx: 'punch', stats: { power: 50, cd: 1.0, area: 36, range: 30, knock: 110, duration: 0.16 }, desc: 'A sharp chop. High critical-hit ratio.' }),
  M({ id: 'mach-punch', name: 'Mach Punch', type: 'fighting', cat: 'physical', behavior: 'projectile', fx: 'punch', stats: { power: 32, cd: 0.55, speed: 600, area: 10, duration: 0.3, pierce: 2, knock: 80 }, desc: 'Punches at blinding speed.' }),
  M({ id: 'rock-smash', name: 'Rock Smash', type: 'fighting', cat: 'physical', behavior: 'nova', fx: 'punch', stats: { power: 40, cd: 2.4, area: 70, duration: 0.3, knock: 160 }, desc: 'Smashes the ground, flinging nearby foes away.' }),
  M({ id: 'cross-chop', name: 'Cross Chop', type: 'fighting', cat: 'physical', behavior: 'melee', fx: 'slash', stats: { power: 80, cd: 1.6, count: 2, area: 44, range: 34, knock: 130, duration: 0.2 }, desc: 'A double chop with crossed arms, front and back.' }),
  M({ id: 'aura-sphere', name: 'Aura Sphere', type: 'fighting', cat: 'special', behavior: 'projectile', fx: 'orb', stats: { power: 60, cd: 1.4, speed: 260, area: 11, duration: 2.5, homing: 5, pierce: 2 }, desc: 'Unleashes aura power that seeks foes. Never misses.' }),
  M({ id: 'sky-uppercut', name: 'Sky Uppercut', type: 'fighting', cat: 'physical', behavior: 'strike', fx: 'punch', stats: { power: 70, cd: 2.0, count: 2, area: 22, knock: 60 }, desc: 'Leaps to deliver uppercuts to random foes.' }),
  M({ id: 'dynamic-punch', name: 'Dynamic Punch', type: 'fighting', cat: 'physical', behavior: 'lob', fx: 'punch', effect: 'confuse', mastery: { from: 'karate-chop', item: 'black-belt' }, stats: { power: 130, cd: 0.8, count: 2, speed: 380, area: 46, duration: 0.6, chance: 0.5, knock: 200 }, up: [], desc: 'MASTERED Karate Chop. Explosive punches that confuse.' }),
  // ───────────── Poison ─────────────
  M({ id: 'poison-sting', name: 'Poison Sting', type: 'poison', cat: 'physical', behavior: 'projectile', fx: 'needle', effect: 'poison', stats: { power: 25, cd: 0.8, count: 2, speed: 400, area: 6, duration: 1, spread: 10, chance: 0.3 }, desc: 'Toxic barbs. May poison.' }),
  M({ id: 'smog', name: 'Smog', type: 'poison', cat: 'special', behavior: 'trail', fx: 'cloud', effect: 'poison', stats: { power: 12, cd: 0.45, area: 26, duration: 2.5, tick: 0.5, chance: 0.4 }, desc: 'Leaves a trail of toxic gas behind you.' }),
  M({ id: 'acid', name: 'Acid', type: 'poison', cat: 'special', behavior: 'projectile', fx: 'bubble', effect: 'poison', stats: { power: 30, cd: 1.3, count: 3, speed: 240, area: 8, duration: 1.2, spread: 40, chance: 0.25 }, desc: 'Sprays acid in a fan. May poison.' }),
  M({ id: 'sludge-bomb', name: 'Sludge Bomb', type: 'poison', cat: 'special', behavior: 'lob', fx: 'cloud', effect: 'poison', stats: { power: 55, cd: 2.0, speed: 280, area: 40, duration: 0.7, chance: 0.4 }, desc: 'Hurls sludge that splashes on impact. May poison.' }),
  M({ id: 'toxic', name: 'Toxic', type: 'poison', cat: 'status', behavior: 'chain', fx: 'needle', effect: 'poison', stats: { power: 8, cd: 1.8, count: 4, range: 120, chance: 1 }, desc: 'Badly poisons a chain of foes. Poison damage stacks.' }),
  M({ id: 'toxic-spikes', name: 'Toxic Spikes', type: 'poison', cat: 'status', behavior: 'zone', fx: 'spike', effect: 'poison', stats: { power: 6, cd: 2.8, count: 3, area: 20, duration: 5, tick: 0.5, chance: 1 }, desc: 'Scatters poison spikes at the feet of foes.' }),
  M({ id: 'gunk-shot', name: 'Gunk Shot', type: 'poison', cat: 'physical', behavior: 'lob', fx: 'cloud', effect: 'poison', mastery: { from: 'poison-sting', item: 'poison-barb' }, stats: { power: 120, cd: 0.7, count: 3, speed: 360, area: 50, duration: 0.6, chance: 0.6 }, up: [], desc: 'MASTERED Poison Sting. Garbage bombs that blanket foes in poison.' }),
  // ───────────── Ground ─────────────
  M({ id: 'mud-slap', name: 'Mud-Slap', type: 'ground', cat: 'special', behavior: 'projectile', fx: 'rock', effect: 'slow', stats: { power: 30, cd: 0.9, speed: 300, area: 8, duration: 1.1, chance: 0.3 }, desc: 'Hurls mud in foes’ faces. May slow.' }),
  M({ id: 'magnitude', name: 'Magnitude', type: 'ground', cat: 'physical', behavior: 'nova', fx: 'rock', stats: { power: 55, cd: 3.4, area: 120, duration: 0.5, knock: 60 }, desc: 'A quake of random intensity hits everything near you.' }),
  M({ id: 'bulldoze', name: 'Bulldoze', type: 'ground', cat: 'physical', behavior: 'nova', fx: 'rock', effect: 'slow', stats: { power: 40, cd: 2.4, area: 85, duration: 0.35, chance: 0.6 }, desc: 'Stomps the ground, damaging and slowing foes nearby.' }),
  M({ id: 'mud-shot', name: 'Mud Shot', type: 'ground', cat: 'special', behavior: 'projectile', fx: 'rock', effect: 'slow', stats: { power: 40, cd: 1.3, count: 2, speed: 260, area: 10, duration: 1.4, pierce: 2, chance: 0.5 }, desc: 'Mud blobs that slow foes on hit.' }),
  M({ id: 'earth-power', name: 'Earth Power', type: 'ground', cat: 'special', behavior: 'strike', fx: 'rock', stats: { power: 70, cd: 2.2, count: 3, area: 30, knock: 40 }, desc: 'The ground erupts beneath random foes.' }),
  M({ id: 'bonemerang', name: 'Bonemerang', type: 'ground', cat: 'physical', behavior: 'boomerang', fx: 'bone', stats: { power: 45, cd: 1.6, count: 1, speed: 320, area: 12, range: 170, pierce: -1 }, desc: 'A bone that flies out and comes back, hitting twice.' }),
  M({ id: 'earthquake', name: 'Earthquake', type: 'ground', cat: 'physical', behavior: 'nova', fx: 'rock', mastery: { from: 'mud-slap', item: 'soft-sand' }, stats: { power: 140, cd: 1.6, count: 2, area: 220, duration: 0.6, knock: 120 }, up: [], desc: 'MASTERED Mud-Slap. Violent quakes shake the entire screen.' }),
  // ───────────── Flying ─────────────
  M({ id: 'gust', name: 'Gust', type: 'flying', cat: 'special', behavior: 'projectile', fx: 'tornado', stats: { power: 35, cd: 1.2, speed: 200, area: 14, duration: 1.6, pierce: 3, knock: 90 }, desc: 'Whips up a small whirlwind that plows through foes.' }),
  M({ id: 'wing-attack', name: 'Wing Attack', type: 'flying', cat: 'physical', behavior: 'melee', fx: 'slash', stats: { power: 45, cd: 1.1, count: 2, area: 40, range: 26, duration: 0.18 }, desc: 'Strikes with wings spread wide, on both sides.' }),
  M({ id: 'air-slash', name: 'Air Slash', type: 'flying', cat: 'special', behavior: 'projectile', fx: 'slash', effect: 'flinch', stats: { power: 40, cd: 1.3, count: 3, speed: 360, area: 10, duration: 1, spread: 30, pierce: 2, chance: 0.2 }, desc: 'Blades of air in a wide fan. May make foes flinch.' }),
  M({ id: 'aerial-ace', name: 'Aerial Ace', type: 'flying', cat: 'physical', behavior: 'projectile', fx: 'slash', stats: { power: 45, cd: 1.0, speed: 420, area: 10, duration: 1.5, homing: 9 }, desc: 'A swift strike that always finds its mark.' }),
  M({ id: 'hurricane', name: 'Hurricane', type: 'flying', cat: 'special', behavior: 'wave', fx: 'tornado', effect: 'confuse', mastery: { from: 'gust', item: 'sharp-beak' }, stats: { power: 110, cd: 1.6, count: 3, speed: 130, area: 40, duration: 3.5, pierce: -1, chance: 0.3, knock: 60 }, up: [], desc: 'MASTERED Gust. Wandering tornadoes shred the battlefield.' }),
  // ───────────── Psychic ─────────────
  M({ id: 'confusion', name: 'Confusion', type: 'psychic', cat: 'special', behavior: 'aura', fx: 'ring', effect: 'confuse', stats: { power: 22, cd: 0.8, area: 64, chance: 0.05, knock: 30 }, desc: 'Telekinetic pulses hurt foes close to you. May confuse.' }),
  M({ id: 'psybeam', name: 'Psybeam', type: 'psychic', cat: 'special', behavior: 'beam', fx: 'beam', effect: 'confuse', stats: { power: 55, cd: 1.9, area: 10, range: 240, duration: 0.35, chance: 0.15 }, desc: 'A peculiar ray that may confuse.' }),
  M({ id: 'psyshock', name: 'Psyshock', type: 'psychic', cat: 'special', behavior: 'projectile', fx: 'orb', stats: { power: 50, cd: 1.2, count: 2, speed: 300, area: 10, duration: 1.4, pierce: 3 }, desc: 'Materializes odd psychic waves that pierce through foes.' }),
  M({ id: 'future-sight', name: 'Future Sight', type: 'psychic', cat: 'special', behavior: 'strike', fx: 'orb', stats: { power: 100, cd: 3.5, count: 3, area: 46, knock: 50 }, desc: 'Foresees attacks that land on foes moments later.' }),
  M({ id: 'calm-mind', name: 'Calm Mind', type: 'psychic', cat: 'status', behavior: 'buff', fx: 'ring', buff: { kind: 'spa', amount: 0.3 }, stats: { power: 0, cd: 10, duration: 5 }, desc: 'Periodically focuses the mind: +30% Sp. Atk for a while.' }),
  M({ id: 'reflect', name: 'Reflect', type: 'psychic', cat: 'status', behavior: 'buff', fx: 'ring', buff: { kind: 'shield', amount: 0.5 }, stats: { power: 0, cd: 12, duration: 5 }, desc: 'A wall of light halves damage taken for a while.' }),
  M({ id: 'psychic', name: 'Psychic', type: 'psychic', cat: 'special', behavior: 'aura', fx: 'ring', effect: 'confuse', mastery: { from: 'confusion', item: 'twisted-spoon' }, stats: { power: 60, cd: 0.6, area: 130, chance: 0.12, knock: 70 }, up: [], desc: 'MASTERED Confusion. A vast psychic field crushes nearby foes.' }),
  // ───────────── Bug ─────────────
  M({ id: 'string-shot', name: 'String Shot', type: 'bug', cat: 'status', behavior: 'zone', fx: 'web', effect: 'slow', stats: { power: 4, cd: 3, count: 2, area: 40, duration: 4, tick: 0.5, chance: 1 }, desc: 'Sticky silk webs heavily slow foes.' }),
  M({ id: 'pin-missile', name: 'Pin Missile', type: 'bug', cat: 'physical', behavior: 'projectile', fx: 'needle', stats: { power: 20, cd: 0.9, count: 3, speed: 460, area: 5, duration: 0.9 }, up: [{ count: 1 }, { power: 5 }, { count: 1 }, { power: 5, cd: -0.15 }], desc: 'Sharp spikes fired at several foes.' }),
  M({ id: 'fury-cutter', name: 'Fury Cutter', type: 'bug', cat: 'physical', behavior: 'melee', fx: 'slash', stats: { power: 40, cd: 0.6, area: 34, range: 26, duration: 0.15 }, desc: 'Rapid scythe slashes in front of you.' }),
  M({ id: 'bug-buzz', name: 'Bug Buzz', type: 'bug', cat: 'special', behavior: 'nova', fx: 'note', stats: { power: 60, cd: 2.8, area: 105, duration: 0.45 }, desc: 'A damaging sound wave from vibrating wings.' }),
  M({ id: 'megahorn', name: 'Megahorn', type: 'bug', cat: 'physical', behavior: 'projectile', fx: 'needle', mastery: { from: 'pin-missile', item: 'silver-powder' }, stats: { power: 90, cd: 0.6, count: 6, speed: 520, area: 12, duration: 1, pierce: 4, knock: 120 }, up: [], desc: 'MASTERED Pin Missile. A barrage of massive horns.' }),
  // ───────────── Rock ─────────────
  M({ id: 'rock-throw', name: 'Rock Throw', type: 'rock', cat: 'physical', behavior: 'lob', fx: 'rock', stats: { power: 50, cd: 1.4, speed: 260, area: 26, duration: 0.6 }, desc: 'Lobs a rock that shatters on impact.' }),
  M({ id: 'rock-slide', name: 'Rock Slide', type: 'rock', cat: 'physical', behavior: 'strike', fx: 'rock', effect: 'flinch', stats: { power: 55, cd: 2.0, count: 3, area: 24, chance: 0.3 }, desc: 'Boulders rain down on foes. May flinch.' }),
  M({ id: 'rollout', name: 'Rollout', type: 'rock', cat: 'physical', behavior: 'orbit', fx: 'rock', stats: { power: 40, cd: 4, count: 1, speed: 3.5, area: 14, range: 70, duration: 3.5, tick: 0.4, knock: 100 }, desc: 'A boulder rolls around you, gathering force.' }),
  M({ id: 'ancient-power', name: 'Ancient Power', type: 'rock', cat: 'special', behavior: 'projectile', fx: 'rock', stats: { power: 40, cd: 1.6, count: 5, speed: 260, area: 9, duration: 1.2, spread: 360 }, up: [{ count: 1 }, { power: 6 }, { count: 2 }, { power: 8, cd: -0.15 }], desc: 'Ancient rocks fired in every direction.' }),
  M({ id: 'sandstorm', name: 'Sandstorm', type: 'rock', cat: 'special', behavior: 'aura', fx: 'cloud', stats: { power: 10, cd: 0.5, area: 90 }, desc: 'A raging sandstorm buffets all foes nearby.' }),
  M({ id: 'stone-edge', name: 'Stone Edge', type: 'rock', cat: 'physical', behavior: 'nova', fx: 'spike', mastery: { from: 'rock-throw', item: 'hard-stone' }, stats: { power: 130, cd: 1.2, count: 2, area: 150, duration: 0.5, knock: 140 }, up: [], desc: 'MASTERED Rock Throw. Rings of jagged stone erupt around you.' }),
  // ───────────── Ghost ─────────────
  M({ id: 'lick', name: 'Lick', type: 'ghost', cat: 'physical', behavior: 'melee', fx: 'shadow', effect: 'paralyze', stats: { power: 42, cd: 0.95, area: 36, range: 28, duration: 0.18, chance: 0.2 }, desc: 'Licks with a long tongue. May paralyze.' }),
  M({ id: 'night-shade', name: 'Night Shade', type: 'ghost', cat: 'special', behavior: 'beam', fx: 'shadow', stats: { power: 50, cd: 1.6, area: 9, range: 230, duration: 0.35 }, desc: 'A sinister beam of shadow.' }),
  M({ id: 'shadow-ball', name: 'Shadow Ball', type: 'ghost', cat: 'special', behavior: 'projectile', fx: 'shadow', stats: { power: 65, cd: 1.5, speed: 230, area: 14, duration: 2, pierce: 3, homing: 2 }, desc: 'Hurls a shadowy blob that pierces foes.' }),
  M({ id: 'hex', name: 'Hex', type: 'ghost', cat: 'special', behavior: 'chain', fx: 'shadow', stats: { power: 45, cd: 1.4, count: 3, range: 110 }, desc: 'A curse that leaps between foes. Double damage on statused foes.' }),
  M({ id: 'shadow-sneak', name: 'Shadow Sneak', type: 'ghost', cat: 'physical', behavior: 'projectile', fx: 'shadow', stats: { power: 32, cd: 0.8, speed: 380, area: 9, duration: 1.4, homing: 8 }, desc: 'A shadow that sneaks up on foes. Never misses.' }),
  M({ id: 'ominous-wind', name: 'Ominous Wind', type: 'ghost', cat: 'special', behavior: 'wave', fx: 'wind', stats: { power: 45, cd: 4, speed: 160, area: 46, duration: 2.4, pierce: -1 }, desc: 'A repulsive wind that sweeps the field.' }),
  M({ id: 'shadow-force', name: 'Shadow Force', type: 'ghost', cat: 'physical', behavior: 'strike', fx: 'shadow', mastery: { from: 'night-shade', item: 'spell-tag' }, stats: { power: 150, cd: 0.9, count: 5, area: 50, knock: 100 }, up: [], desc: 'MASTERED Night Shade. You vanish and strike from the shadows everywhere.' }),
  // ───────────── Dragon ─────────────
  M({ id: 'twister', name: 'Twister', type: 'dragon', cat: 'special', behavior: 'orbit', fx: 'tornado', effect: 'flinch', stats: { power: 35, cd: 3.5, count: 2, speed: 3.5, area: 14, range: 60, duration: 3.2, tick: 0.4, chance: 0.1 }, desc: 'Twisters orbit you. May make foes flinch.' }),
  M({ id: 'dragon-rage', name: 'Dragon Rage', type: 'dragon', cat: 'special', behavior: 'projectile', fx: 'flame', stats: { power: 45, cd: 1.1, speed: 300, area: 11, duration: 1.4, pierce: 2 }, desc: 'A shock wave of draconic fury.' }),
  M({ id: 'dragon-breath', name: 'Dragon Breath', type: 'dragon', cat: 'special', behavior: 'cone', fx: 'flame', effect: 'paralyze', stats: { power: 30, cd: 2.0, range: 110, area: 36, duration: 0.7, tick: 0.2, chance: 0.15 }, desc: 'Exhales a mighty gust. May paralyze.' }),
  M({ id: 'dragon-pulse', name: 'Dragon Pulse', type: 'dragon', cat: 'special', behavior: 'projectile', fx: 'orb', stats: { power: 70, cd: 1.6, count: 2, speed: 300, area: 13, duration: 1.6, pierce: 4 }, desc: 'Shock waves from a wide-open mouth.' }),
  M({ id: 'outrage', name: 'Outrage', type: 'dragon', cat: 'physical', behavior: 'aura', fx: 'flame', stats: { power: 22, cd: 0.45, area: 56, knock: 50 }, desc: 'A rampage that thrashes everything close by.' }),
  M({ id: 'dragon-dance', name: 'Dragon Dance', type: 'dragon', cat: 'status', behavior: 'buff', fx: 'ring', buff: { kind: 'atk', amount: 0.25 }, stats: { power: 0, cd: 9, duration: 5 }, desc: 'A mystic dance: +25% Attack and move speed for a while.' }),
  M({ id: 'draco-meteor', name: 'Draco Meteor', type: 'dragon', cat: 'special', behavior: 'strike', fx: 'meteor', mastery: { from: 'twister', item: 'dragon-fang' }, stats: { power: 140, cd: 1.0, count: 6, area: 52, knock: 140 }, up: [], desc: 'MASTERED Twister. Comets rain down across the battlefield.' }),
  // ───────────── Dark ─────────────
  M({ id: 'bite', name: 'Bite', type: 'dark', cat: 'physical', behavior: 'melee', fx: 'fang', effect: 'flinch', stats: { power: 50, cd: 1.0, area: 34, range: 26, duration: 0.18, chance: 0.25 }, desc: 'Bites with sharp fangs. May flinch.' }),
  M({ id: 'pursuit', name: 'Pursuit', type: 'dark', cat: 'physical', behavior: 'projectile', fx: 'shadow', stats: { power: 34, cd: 0.9, speed: 360, area: 9, duration: 1.6, homing: 7 }, desc: 'Chases down fleeing foes.' }),
  M({ id: 'dark-pulse', name: 'Dark Pulse', type: 'dark', cat: 'special', behavior: 'nova', fx: 'shadow', effect: 'flinch', stats: { power: 60, cd: 2.8, area: 115, duration: 0.45, chance: 0.2 }, desc: 'A horrible aura of evil radiates outward.' }),
  M({ id: 'night-slash', name: 'Night Slash', type: 'dark', cat: 'physical', behavior: 'melee', fx: 'slash', stats: { power: 65, cd: 1.3, count: 2, area: 40, range: 32, duration: 0.18 }, desc: 'Slashes at the instant an opening appears. High crit ratio.' }),
  M({ id: 'crunch', name: 'Crunch', type: 'dark', cat: 'physical', behavior: 'strike', fx: 'fang', effect: 'flinch', mastery: { from: 'bite', item: 'black-glasses' }, stats: { power: 140, cd: 0.8, count: 4, area: 40, chance: 0.3, knock: 80 }, up: [], desc: 'MASTERED Bite. Giant phantom jaws crunch foes all over the screen.' }),
  // ───────────── Steel ─────────────
  M({ id: 'metal-claw', name: 'Metal Claw', type: 'steel', cat: 'physical', behavior: 'melee', fx: 'slash', stats: { power: 45, cd: 0.9, area: 36, range: 28, duration: 0.16 }, desc: 'Rakes with steel claws.' }),
  M({ id: 'flash-cannon', name: 'Flash Cannon', type: 'steel', cat: 'special', behavior: 'beam', fx: 'beam', stats: { power: 70, cd: 2.2, area: 13, range: 280, duration: 0.4 }, desc: 'Gathers light energy and releases it at once.' }),
  M({ id: 'gyro-ball', name: 'Gyro Ball', type: 'steel', cat: 'physical', behavior: 'orbit', fx: 'ring', stats: { power: 45, cd: 3.6, count: 1, speed: 6, area: 14, range: 52, duration: 3, tick: 0.35 }, desc: 'A spinning steel ball. Slower users hit harder.' }),
  M({ id: 'magnet-bomb', name: 'Magnet Bomb', type: 'steel', cat: 'physical', behavior: 'projectile', fx: 'orb', stats: { power: 40, cd: 1.2, count: 2, speed: 300, area: 9, duration: 2, homing: 7 }, desc: 'Steel bombs that latch onto foes. Never misses.' }),
  M({ id: 'iron-defense', name: 'Iron Defense', type: 'steel', cat: 'status', behavior: 'buff', fx: 'ring', buff: { kind: 'shield', amount: 0.6 }, stats: { power: 0, cd: 14, duration: 4 }, desc: 'Hardens the body: greatly reduces damage taken for a while.' }),
  M({ id: 'meteor-mash', name: 'Meteor Mash', type: 'steel', cat: 'physical', behavior: 'lob', fx: 'meteor', mastery: { from: 'metal-claw', item: 'metal-coat' }, stats: { power: 120, cd: 0.7, count: 3, speed: 420, area: 46, duration: 0.5, knock: 160 }, up: [], desc: 'MASTERED Metal Claw. Comet punches pummel foes.' }),
  // ───────────── Fairy ─────────────
  M({ id: 'fairy-wind', name: 'Fairy Wind', type: 'fairy', cat: 'special', behavior: 'projectile', fx: 'heart', stats: { power: 36, cd: 1.0, count: 2, speed: 260, area: 10, duration: 1.4, spread: 20, pierce: 2 }, desc: 'Stirs up a fairy wind.' }),
  M({ id: 'disarming-voice', name: 'Disarming Voice', type: 'fairy', cat: 'special', behavior: 'nova', fx: 'heart', stats: { power: 40, cd: 2.2, area: 95, duration: 0.4 }, desc: 'A charming cry that hits all nearby foes. Never misses.' }),
  M({ id: 'draining-kiss', name: 'Draining Kiss', type: 'fairy', cat: 'special', behavior: 'projectile', fx: 'heart', effect: 'drain', stats: { power: 45, cd: 1.5, speed: 260, area: 10, duration: 1.8, homing: 6, chance: 1 }, desc: 'Steals HP with a kiss. Heals you.' }),
  M({ id: 'dazzling-gleam', name: 'Dazzling Gleam', type: 'fairy', cat: 'special', behavior: 'nova', fx: 'star', stats: { power: 65, cd: 3, area: 130, duration: 0.4 }, desc: 'A blinding flash of light around you.' }),
  M({ id: 'misty-terrain', name: 'Misty Terrain', type: 'fairy', cat: 'status', behavior: 'aura', fx: 'cloud', effect: 'slow', stats: { power: 8, cd: 0.6, area: 75, chance: 0.3 }, desc: 'A mist surrounds you, sapping and slowing foes.' }),
  M({ id: 'moonblast', name: 'Moonblast', type: 'fairy', cat: 'special', behavior: 'lob', fx: 'heart', mastery: { from: 'fairy-wind', item: 'fairy-feather' }, stats: { power: 120, cd: 0.8, count: 3, speed: 300, area: 56, duration: 0.7, knock: 100 }, up: [], desc: 'MASTERED Fairy Wind. Borrowing the moon’s power, blasts explode on foes.' }),
  // ───────────── Universal TMs (status) ─────────────
  M({ id: 'swords-dance', name: 'Swords Dance', type: 'normal', cat: 'status', behavior: 'buff', fx: 'slash', buff: { kind: 'atk', amount: 0.4 }, stats: { power: 0, cd: 10, duration: 5 }, desc: 'A frenetic dance: +40% Attack for a while.' }),
  M({ id: 'agility', name: 'Agility', type: 'psychic', cat: 'status', behavior: 'buff', fx: 'wind', buff: { kind: 'haste', amount: 0.3 }, stats: { power: 0, cd: 10, duration: 5 }, desc: 'Relaxes and lightens the body: +30% move speed and attack rate.' }),
  M({ id: 'double-team', name: 'Double Team', type: 'normal', cat: 'status', behavior: 'buff', fx: 'ring', buff: { kind: 'dodge', amount: 0.5 }, stats: { power: 0, cd: 12, duration: 4 }, desc: 'Creates illusory copies: 50% chance to dodge hits for a while.' }),
  M({ id: 'rest', name: 'Rest', type: 'psychic', cat: 'status', behavior: 'buff', fx: 'note', buff: { kind: 'heal', amount: 0.08 }, stats: { power: 0, cd: 15, duration: 3 }, desc: 'Periodically naps to restore a big chunk of HP.' }),
  M({ id: 'focus-energy', name: 'Focus Energy', type: 'normal', cat: 'status', behavior: 'buff', fx: 'ring', buff: { kind: 'crit', amount: 0.25 }, stats: { power: 0, cd: 10, duration: 5 }, desc: 'Takes a deep breath: +25% critical-hit chance for a while.' }),
];

export const MOVES: Record<string, MoveDef> = Object.fromEntries(MOVE_LIST.map((m) => [m.id, m]));

/** base move id -> mastery move */
export const MASTERY_OF: Record<string, MoveDef> = Object.fromEntries(
  MOVE_LIST.filter((m) => m.mastery).map((m) => [m.mastery!.from, m]),
);

/** Moves sold as TMs in the shop; once owned they join every Pokémon's learnset. */
export const TM_MOVES = [
  'swords-dance', 'agility', 'double-team', 'rest', 'focus-energy', 'calm-mind', 'reflect',
  'aerial-ace', 'shadow-ball', 'rock-slide', 'swift', 'pay-day', 'thunder-wave', 'iron-defense', 'hyper-voice',
] as const;
