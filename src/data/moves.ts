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
  | 'lob'        // arcs to target, explodes in an area
  | 'terrain'    // a ground zone that helps whoever stands in it
  | 'weather'    // a global field (one at a time, shared by the team)
  | 'wall'       // pillars that block enemies
  | 'decoy'      // a doll that draws enemies away
  | 'mine'       // hazards left in place that trigger on contact
  | 'minion'     // a creature that fights on its own
  | 'passive'    // always on / triggered by something else (never "fires")
  | 'special';   // bespoke firing logic (see combat SPECIAL)

export type Category = 'physical' | 'special' | 'status';
export type StatusKind =
  | 'burn' | 'poison' | 'paralyze' | 'freeze' | 'slow' | 'flinch' | 'confuse' | 'drain' | 'coin'
  | 'wet' | 'chill' | 'sleep' | 'charm' | 'vuln' | 'weaken' | 'root' | 'seed' | 'toxic' | 'curse';
export type BuffKind =
  | 'atk' | 'spa' | 'speed' | 'heal' | 'shield' | 'dodge' | 'haste' | 'crit'
  | 'reflect' | 'tailwind' | 'dance' | 'drained';
export type Fx =
  | 'orb' | 'star' | 'leaf' | 'bolt' | 'bubble' | 'rock' | 'flame' | 'shadow' | 'wind' | 'slash'
  | 'ring' | 'spike' | 'seed' | 'bone' | 'shard' | 'punch' | 'note' | 'heart' | 'fang' | 'needle'
  | 'tornado' | 'meteor' | 'puddle' | 'cloud' | 'wave' | 'web' | 'beam' | 'powder' | 'coin' | 'bug';

export type WeatherKind = 'sun' | 'rain' | 'sand' | 'snow';

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

/** Who a move aims at. Default: the nearest foe. */
export type TargetRule = 'nearest' | 'random' | 'densest' | 'highestHp' | 'lowestHp' | 'farthest';

export interface MoveDef {
  id: string;
  name: string;
  type: PType;
  cat: Category;
  behavior: Behavior;
  /** What the move *does*, as one verb. Unique across moves (only BASIC moves may share one). */
  verb: string;
  fx: Fx;
  stats: Partial<MoveStats> & { power: number; cd: number };
  /** Upgrades applied at Lv2..Lv5 (additive; cd/area/duration entries are fractional multipliers e.g. cd:-0.1 = 10% faster).
   *  Lv6..Lv8 come from LATE_UP for the move's behaviour. */
  up?: Partial<MoveStats>[];
  effect?: StatusKind;
  /** A second status applied by the same hit (rolled separately). */
  effect2?: { kind: StatusKind; chance: number };
  buff?: { kind: BuffKind; amount: number };
  target?: TargetRule;
  weather?: WeatherKind;
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
  terrain: [{ area: 0.15 }, { duration: 0.2 }, { area: 0.15 }, { cd: -0.12 }],
  weather: [{ duration: 0.2 }, { power: 4 }, { duration: 0.2 }, { power: 4, cd: -0.1 }],
  wall: [{ count: 1 }, { duration: 0.2 }, { count: 1 }, { power: 10, cd: -0.1 }],
  decoy: [{ duration: 0.2 }, { cd: -0.1 }, { duration: 0.2 }, { cd: -0.1 }],
  mine: [{ count: 1 }, { power: 6 }, { count: 1 }, { power: 8, duration: 0.2 }],
  minion: [{ power: 5 }, { count: 1 }, { power: 6, duration: 0.25 }, { count: 1 }],
  passive: [{ power: 8 }, { power: 8 }, { power: 10 }, { power: 12 }],
  special: [{ power: 8 }, { cd: -0.1 }, { power: 10 }, { power: 10, cd: -0.1 }],
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
  terrain: [{ area: 0.12 }, { duration: 0.2 }, { cd: -0.12 }],
  weather: [{ duration: 0.15 }, { power: 0.3 }, { cd: -0.12 }],
  wall: [{ count: 1 }, { duration: 0.2 }, { power: 0.3 }],
  decoy: [{ duration: 0.2 }, { cd: -0.12 }, { duration: 0.2 }],
  mine: [{ power: 0.2 }, { count: 1 }, { power: 0.3 }],
  minion: [{ power: 0.2 }, { count: 1 }, { power: 0.3 }],
  passive: [{ power: 0.2 }, { power: 0.2 }, { power: 0.3 }],
  special: [{ power: 0.2 }, { cd: -0.1 }, { power: 0.3 }],
};

/** Stats that combine multiplicatively in upgrade tables. */
const MULT_KEYS = new Set<keyof MoveStats>(['cd', 'area', 'range', 'duration', 'speed']);

/** Limit breaks grow linearly up to this many, then logarithmically. */
export const LIMIT_LINEAR = 6;
const LIMIT_POWER = 0.08, LIMIT_AREA = 0.04;

/** Power multiplier for levels past the max ("limit break"): +8% each up to +6, then ever more slowly
 *  (the first extra break is worth the same +8%, each later one less). */
export function overLevelMult(level: number) {
  const n = Math.max(0, level - MAX_MOVE_LEVEL);
  const lin = Math.min(n, LIMIT_LINEAR);
  const extra = n - lin;
  return 1 + LIMIT_POWER * lin + (extra > 0 ? (LIMIT_POWER * Math.log(1 + extra)) / Math.LN2 : 0);
}

export function moveStatsAt(def: MoveDef, level: number): MoveStats {
  const s: MoveStats = { ...DEFAULT_STATS, ...def.stats };
  const ups = def.up ?? DEFAULT_UP[def.behavior];
  // Mastered moves are a finished form: only limit-break levels change them.
  for (let i = 0; !def.mastery && i < Math.min(level, MAX_MOVE_LEVEL) - 1; i++) {
    const late = i >= ups.length;
    const up = late ? LATE_UP[def.behavior][i - ups.length] : ups[i];
    if (!up) break;
    for (const [k, v] of Object.entries(up) as [keyof MoveStats, number][]) {
      if (MULT_KEYS.has(k) || (late && k === 'power')) s[k] *= 1 + v;
      else s[k] += v;
    }
  }
  // Limit breaks come last so their power bonus multiplies the whole table, not just the base power.
  s.power *= overLevelMult(level);
  // The first six also widen the move, or add a projectile every third break if it has count upgrades.
  const breaks = Math.min(LIMIT_LINEAR, Math.max(0, level - MAX_MOVE_LEVEL));
  // Masteries have no `up` table, so look at the behaviour's tables too: Megahorn gains projectiles, not area.
  const hasCount = def.stats.count! > 1 || [...ups, ...LATE_UP[def.behavior]].some((u) => u.count);
  if (hasCount) s.count += Math.floor(breaks / 3);
  else s.area *= 1 + LIMIT_AREA * breaks;
  return s;
}

const M = (d: MoveDef) => d;

/** Moves allowed to share a verb with each other: the bread-and-butter starter attacks. */
export const BASIC_MOVES = new Set([
  'tackle', 'ember', 'water-gun', 'vine-whip', 'thunder-shock', 'karate-chop', 'poison-sting', 'mud-slap',
  'gust', 'wing-attack', 'confusion', 'psybeam', 'rock-throw', 'lick', 'twister', 'bite', 'metal-claw', 'fairy-wind',
]);

export const MOVE_LIST: MoveDef[] = [
  // ───────────── Normal: utility / economy ─────────────
  M({ id: 'tackle', name: 'Tackle', type: 'normal', cat: 'physical', behavior: 'melee', verb: 'swipe', fx: 'punch', stats: { power: 40, cd: 1.2, area: 34, range: 26, knock: 120, duration: 0.18 }, desc: 'A full-body slam in front of you. Strong knockback.' }),
  M({ id: 'quick-attack', name: 'Quick Attack', type: 'normal', cat: 'physical', behavior: 'projectile', verb: 'opener', fx: 'wind', stats: { power: 30, cd: 0.7, speed: 520, area: 9, duration: 0.45, pierce: 2 }, desc: 'Strikes first: deals double damage to foes nobody has hit yet.' }),
  M({ id: 'swift', name: 'Swift', type: 'normal', cat: 'special', behavior: 'projectile', verb: 'seeker', fx: 'star', stats: { power: 30, cd: 1.1, count: 2, speed: 260, area: 8, duration: 2.2, homing: 6 }, up: [{ count: 1 }, { power: 8 }, { count: 1 }, { power: 8, cd: -0.15 }], desc: 'Star rays that home in on foes. The only seeking shot.' }),
  M({ id: 'hyper-voice', name: 'Hyper Voice', type: 'normal', cat: 'special', behavior: 'nova', verb: 'echo', fx: 'note', stats: { power: 40, cd: 2.8, area: 105, duration: 0.45, knock: 60 }, desc: 'A shockwave that grows 15% louder with every cast (up to +150%). Getting hit resets the echo.' }),
  M({ id: 'rapid-spin', name: 'Rapid Spin', type: 'normal', cat: 'physical', behavior: 'orbit', verb: 'shield-orbit', fx: 'ring', stats: { power: 22, cd: 4, count: 2, speed: 5, area: 12, range: 40, duration: 3, tick: 0.4 }, desc: 'Spinning shells orbit you and destroy enemy projectiles they touch. Each spin gives a burst of speed.' }),
  M({ id: 'pay-day', name: 'Pay Day', type: 'normal', cat: 'physical', behavior: 'projectile', verb: 'greed', fx: 'coin', effect: 'coin', stats: { power: 26, cd: 1.3, count: 2, speed: 320, area: 7, duration: 1.2, spread: 25, chance: 0.12 }, desc: 'Flings coins that hit harder the more Poké Dollars you have picked up this run. KOs may drop extra coins.' }),
  M({ id: 'substitute', name: 'Substitute', type: 'normal', cat: 'status', behavior: 'decoy', verb: 'decoy', fx: 'star', stats: { power: 0, cd: 11, duration: 4, area: 260 }, desc: 'Pays 10% HP to leave a doll that draws in every foe nearby for a few seconds.' }),
  M({ id: 'metronome', name: 'Metronome', type: 'normal', cat: 'status', behavior: 'special', verb: 'random', fx: 'note', stats: { power: 1, cd: 1.6 }, up: [{ cd: -0.08 }, { cd: -0.08 }, { cd: -0.08 }, { cd: -0.08 }], desc: 'Waggles a finger to use a random attacking move from the whole Pokédex, at this move\'s level.' }),
  M({ id: 'hidden-power', name: 'Hidden Power', type: 'normal', cat: 'special', behavior: 'projectile', verb: 'hidden', fx: 'orb', stats: { power: 34, cd: 1.2, count: 3, speed: 280, area: 9, duration: 1.4, spread: 30, chance: 0.15 }, desc: 'Orbs whose type and status are rolled at the start of each run.' }),
  M({ id: 'explosion', name: 'Explosion', type: 'normal', cat: 'physical', behavior: 'nova', verb: 'self-destruct', fx: 'ring', stats: { power: 260, cd: 14, area: 170, duration: 0.5, knock: 220 }, up: [{ power: 40 }, { cd: -0.1 }, { power: 50 }, { area: 0.15 }], desc: 'A colossal blast around you that costs a third of your current HP.' }),
  M({ id: 'hyper-beam', name: 'Hyper Beam', type: 'normal', cat: 'special', behavior: 'beam', verb: 'recharge-beam', fx: 'beam', mastery: { from: 'hyper-voice', item: 'silk-scarf' }, stats: { power: 320, cd: 4.5, area: 26, range: 520, duration: 0.7, count: 1, knock: 200 }, up: [], desc: 'MASTERED Hyper Voice. A screen-long beam of staggering power, then a long recharge.' }),
  // ───────────── Fire: area denial / spreading burns ─────────────
  M({ id: 'ember', name: 'Ember', type: 'fire', cat: 'special', behavior: 'projectile', verb: 'bolt', fx: 'flame', effect: 'burn', stats: { power: 40, cd: 1.0, speed: 300, area: 8, duration: 1.4, chance: 0.1 }, desc: 'Small flames fired at the nearest foe. May burn.' }),
  M({ id: 'flame-wheel', name: 'Flame Wheel', type: 'fire', cat: 'physical', behavior: 'aura', verb: 'body', fx: 'flame', effect: 'burn', stats: { power: 26, cd: 0.4, area: 26, chance: 0.15, knock: 50 }, desc: 'Wreathes you in fire while you move: foes you run into burn. Faster movement hits harder.' }),
  M({ id: 'fire-spin', name: 'Fire Spin', type: 'fire', cat: 'special', behavior: 'zone', verb: 'cage', fx: 'flame', effect: 'root', effect2: { kind: 'burn', chance: 0.3 }, stats: { power: 12, cd: 4, count: 1, area: 46, duration: 3, tick: 0.5, chance: 1 }, desc: 'A ring of fire traps foes inside it: they can\'t walk out and may burn.' }),
  M({ id: 'flamethrower', name: 'Flamethrower', type: 'fire', cat: 'special', behavior: 'cone', verb: 'stream', fx: 'flame', effect: 'burn', stats: { power: 28, cd: 2.2, range: 170, area: 16, duration: 1.1, tick: 0.16, chance: 0.15 }, desc: 'A long, narrow jet of flame that follows its target. May burn.' }),
  M({ id: 'heat-wave', name: 'Heat Wave', type: 'fire', cat: 'special', behavior: 'nova', verb: 'screen-burn', fx: 'flame', effect: 'burn', stats: { power: 14, cd: 6, area: 420, duration: 0.8, chance: 1, knock: 0 }, up: [{ power: 4 }, { cd: -0.1 }, { power: 5 }, { cd: -0.12 }], desc: 'Scorching air washes over the whole screen, burning every foe a little.' }),
  M({ id: 'blaze-kick', name: 'Blaze Kick', type: 'fire', cat: 'physical', behavior: 'melee', verb: 'detonate-burn', fx: 'flame', effect: 'burn', stats: { power: 60, cd: 1.5, area: 40, range: 32, knock: 100, duration: 0.2, chance: 0.2 }, desc: 'A high-crit kick. A critical hit on a burning foe detonates all its remaining burn at once.' }),
  M({ id: 'will-o-wisp', name: 'Will-O-Wisp', type: 'fire', cat: 'status', behavior: 'projectile', verb: 'wisp', fx: 'flame', effect: 'burn', stats: { power: 30, cd: 1.6, count: 3, speed: 70, area: 9, duration: 4, homing: 1.5, chance: 1, pierce: 2 }, up: [{ count: 1 }, { duration: 0.2 }, { count: 1 }, { power: 10, count: 1 }], desc: 'Slow ghost flames drift into foes. No impact damage, but they always burn, and their burns last twice as long.' }),
  M({ id: 'sunny-day', name: 'Sunny Day', type: 'fire', cat: 'status', behavior: 'weather', verb: 'weather-sun', fx: 'flame', weather: 'sun', stats: { power: 30, cd: 16, duration: 9 }, up: [{ duration: 0.2 }, { power: 8 }, { duration: 0.2 }, { power: 8, cd: -0.1 }], desc: 'Weather: harsh sunlight. Foes on screen catch Burn, Fire moves +50%, Water moves −50%, Solar Beam needs no charge.' }),
  M({ id: 'fire-blast', name: 'Fire Blast', type: 'fire', cat: 'special', behavior: 'lob', verb: 'star-burst', fx: 'flame', effect: 'burn', mastery: { from: 'ember', item: 'charcoal' }, stats: { power: 110, cd: 1.1, count: 3, speed: 330, area: 54, duration: 0.9, chance: 0.35, knock: 90 }, up: [], desc: 'MASTERED Ember. Star-shaped infernos explode on impact and leave the ground burning.' }),
  // ───────────── Water: herding / Wet ─────────────
  M({ id: 'water-gun', name: 'Water Gun', type: 'water', cat: 'special', behavior: 'projectile', verb: 'bolt', fx: 'bubble', stats: { power: 40, cd: 0.95, speed: 340, area: 8, duration: 1.2, knock: 70 }, desc: 'Squirts water at the nearest foe with strong knockback.' }),
  M({ id: 'bubble', name: 'Bubble', type: 'water', cat: 'special', behavior: 'mine', verb: 'float-mine', fx: 'bubble', effect: 'slow', effect2: { kind: 'wet', chance: 1 }, stats: { power: 34, cd: 1.6, count: 3, speed: 22, area: 11, duration: 6, chance: 1, pierce: 1 }, desc: 'Bubbles drift around you and linger like mines. Popping one slows the foe and soaks it.' }),
  M({ id: 'surf', name: 'Surf', type: 'water', cat: 'special', behavior: 'wave', verb: 'herd', fx: 'wave', stats: { power: 55, cd: 4.2, speed: 170, area: 56, duration: 2.6, pierce: -1, knock: 140 }, desc: 'A giant wave that shoves the horde across the field.' }),
  M({ id: 'whirlpool', name: 'Whirlpool', type: 'water', cat: 'special', behavior: 'zone', verb: 'vortex', fx: 'puddle', effect: 'wet', stats: { power: 14, cd: 4, count: 1, area: 70, duration: 3, tick: 0.5, chance: 0.5 }, desc: 'A vortex that pulls foes into its center, bunching them up for your other attacks.' }),
  M({ id: 'water-pulse', name: 'Water Pulse', type: 'water', cat: 'special', behavior: 'nova', verb: 'soak', fx: 'ring', effect: 'wet', stats: { power: 36, cd: 2.6, area: 105, duration: 0.5, chance: 1 }, desc: 'A pulse of water that soaks every foe it hits (Wet).' }),
  M({ id: 'aqua-ring', name: 'Aqua Ring', type: 'water', cat: 'status', behavior: 'terrain', verb: 'heal-ring', fx: 'ring', stats: { power: 0, cd: 7, duration: 4, area: 46 }, desc: 'A ring of water at your feet. You and allies standing in it heal 3% max HP per second.' }),
  M({ id: 'rain-dance', name: 'Rain Dance', type: 'water', cat: 'status', behavior: 'weather', verb: 'weather-rain', fx: 'bubble', weather: 'rain', stats: { power: 8, cd: 16, duration: 9 }, desc: 'Weather: heavy rain. Your whole team heals 0.8% max HP per second, every foe is soaked, Water moves +50%, Fire moves −50%, Thunder strikes twice.' }),
  M({ id: 'hydro-pump', name: 'Hydro Pump', type: 'water', cat: 'special', behavior: 'beam', verb: 'jet', fx: 'wave', mastery: { from: 'water-gun', item: 'mystic-water' }, stats: { power: 90, cd: 0.9, area: 18, range: 340, duration: 0.35, count: 2, knock: 420 }, up: [], desc: 'MASTERED Water Gun. High-pressure jets that blast foes to the edge of the screen.' }),
  // ───────────── Grass: sustain / growth ─────────────
  M({ id: 'vine-whip', name: 'Vine Whip', type: 'grass', cat: 'physical', behavior: 'melee', verb: 'lash', fx: 'slash', stats: { power: 45, cd: 1.15, area: 70, range: 18, knock: 60, duration: 0.2 }, up: [{ count: 1 }, { power: 10 }, { area: 0.2 }, { power: 12, cd: -0.15 }], desc: 'Lashes horizontally with long vines. Upgrades whip both sides.' }),
  M({ id: 'razor-leaf', name: 'Razor Leaf', type: 'grass', cat: 'physical', behavior: 'projectile', verb: 'ricochet', fx: 'leaf', stats: { power: 32, cd: 1.4, count: 2, speed: 340, area: 9, duration: 1.6, pierce: 4 }, up: [{ pierce: 1 }, { count: 1 }, { power: 8, pierce: 1 }, { cd: -0.1, pierce: 1 }], desc: 'Spinning leaves ricochet from foe to foe. High critical-hit ratio.' }),
  M({ id: 'leech-seed', name: 'Leech Seed', type: 'grass', cat: 'status', behavior: 'projectile', verb: 'seed-mark', fx: 'seed', effect: 'seed', stats: { power: 22, cd: 2.4, count: 2, speed: 220, area: 8, duration: 1.4, chance: 1 }, desc: 'Plants seeds that drain a foe and heal you. When the host faints, the seed jumps to a neighbour.' }),
  M({ id: 'bullet-seed', name: 'Bullet Seed', type: 'grass', cat: 'physical', behavior: 'projectile', verb: 'burst', fx: 'seed', stats: { power: 18, cd: 1.0, count: 2, speed: 460, area: 5, duration: 0.9 }, up: [{ power: 4 }, { count: 1 }, { power: 5 }, { count: 1, cd: -0.15 }], desc: 'A machine-gun burst at one foe: 2–5 seeds at random each time.' }),
  M({ id: 'leaf-blade', name: 'Leaf Blade', type: 'grass', cat: 'physical', behavior: 'melee', verb: 'crit-reset', fx: 'slash', stats: { power: 66, cd: 1.5, area: 46, range: 34, knock: 80, duration: 0.18 }, desc: 'A high-crit slash. Every critical hit instantly recharges it.' }),
  M({ id: 'solar-beam', name: 'Solar Beam', type: 'grass', cat: 'special', behavior: 'beam', verb: 'charge-beam', fx: 'beam', stats: { power: 150, cd: 4.2, area: 20, range: 420, duration: 0.6, knock: 100 }, desc: 'Gathers light for 1.5 s (glowing), then fires a massive screen-long beam. No charge in sunlight.' }),
  M({ id: 'petal-dance', name: 'Petal Dance', type: 'grass', cat: 'special', behavior: 'orbit', verb: 'breathing-orbit', fx: 'leaf', stats: { power: 30, cd: 3.4, count: 4, speed: 4, area: 11, range: 34, duration: 3.2, tick: 0.35 }, desc: 'Petals swirl out to the edge of the screen and back, clearing ring after ring.' }),
  M({ id: 'sleep-powder', name: 'Sleep Powder', type: 'grass', cat: 'status', behavior: 'zone', verb: 'sleep-cloud', fx: 'powder', effect: 'sleep', stats: { power: 4, cd: 4.5, count: 1, area: 60, duration: 1.2, tick: 1, chance: 1 }, desc: 'A cloud of spores puts foes to sleep. Sleepers stand still until hit, and the waking hit deals double.' }),
  M({ id: 'power-whip', name: 'Power Whip', type: 'grass', cat: 'physical', behavior: 'melee', verb: 'lash-4', fx: 'slash', mastery: { from: 'vine-whip', item: 'miracle-seed' }, stats: { power: 120, cd: 0.9, count: 4, area: 120, range: 26, knock: 140, duration: 0.22 }, up: [], desc: 'MASTERED Vine Whip. Huge vines lash in every direction.' }),
  // ───────────── Electric: chains / speed / paralysis ─────────────
  M({ id: 'thunder-shock', name: 'Thunder Shock', type: 'electric', cat: 'special', behavior: 'chain', verb: 'chain', fx: 'bolt', effect: 'paralyze', stats: { power: 40, cd: 1.1, count: 2, range: 90, chance: 0.1 }, desc: 'A jolt that arcs from foe to foe. May paralyze.' }),
  M({ id: 'spark', name: 'Spark', type: 'electric', cat: 'physical', behavior: 'special', verb: 'static-charge', fx: 'bolt', effect: 'paralyze', stats: { power: 90, cd: 1, area: 70, range: 360, chance: 0.5, knock: 90 }, up: [{ power: 20 }, { range: -0.1 }, { area: 0.2 }, { power: 25, range: -0.1 }], desc: 'Builds static as you run (watch the sparks). Once charged, the next foe you get close to sets off a big shock.' }),
  M({ id: 'thunderbolt', name: 'Thunderbolt', type: 'electric', cat: 'special', behavior: 'strike', verb: 'random-strike', fx: 'bolt', effect: 'paralyze', target: 'random', stats: { power: 60, cd: 1.8, count: 2, area: 26, chance: 0.15 }, desc: 'Bolts strike random foes anywhere on screen. May paralyze.' }),
  M({ id: 'discharge', name: 'Discharge', type: 'electric', cat: 'special', behavior: 'nova', verb: 'relay', fx: 'bolt', effect: 'paralyze', stats: { power: 46, cd: 3, area: 115, duration: 0.4, chance: 0.25 }, desc: 'Electricity bursts around you. Every paralyzed foe it hits relays an arc to two neighbours.' }),
  M({ id: 'thunder-wave', name: 'Thunder Wave', type: 'electric', cat: 'status', behavior: 'nova', verb: 'screen-para', fx: 'ring', effect: 'paralyze', stats: { power: 0, cd: 8, area: 400, duration: 0.8, chance: 1, knock: 0 }, up: [{ cd: -0.1 }, { area: 0.1 }, { cd: -0.1 }, { cd: -0.1 }], desc: 'A weak jolt crosses the whole screen. No damage, but every foe it reaches is paralyzed.' }),
  M({ id: 'electro-ball', name: 'Electro Ball', type: 'electric', cat: 'special', behavior: 'projectile', verb: 'edge-bounce', fx: 'orb', effect: 'paralyze', stats: { power: 46, cd: 2.2, speed: 260, area: 13, duration: 5, pierce: -1, chance: 0.1 }, up: [{ power: 8 }, { count: 1 }, { duration: 0.3 }, { power: 10, count: 1 }], desc: 'A crackling orb that bounces off the edges of the screen. The faster you are, the harder it hits.' }),
  M({ id: 'electric-terrain', name: 'Electric Terrain', type: 'electric', cat: 'status', behavior: 'terrain', verb: 'haste-zone', fx: 'bolt', stats: { power: 0, cd: 9, duration: 6, area: 80 }, desc: 'Electrifies the ground. You and allies standing on it recharge moves 30% faster.' }),
  M({ id: 'thunder', name: 'Thunder', type: 'electric', cat: 'special', behavior: 'chain', verb: 'storm-chain', fx: 'bolt', effect: 'paralyze', mastery: { from: 'thunder-shock', item: 'magnet' }, stats: { power: 90, cd: 0.9, count: 6, range: 140, area: 34, chance: 0.3, knock: 60 }, up: [], desc: 'MASTERED Thunder Shock. Lightning chains through the horde and a bolt strikes every foe it touches.' }),
  // ───────────── Ice: chill → freeze → shatter ─────────────
  M({ id: 'powder-snow', name: 'Powder Snow', type: 'ice', cat: 'special', behavior: 'projectile', verb: 'flurry', fx: 'shard', effect: 'chill', stats: { power: 18, cd: 1.1, count: 6, speed: 120, area: 8, duration: 0.9, spread: 360, chance: 0.5, pierce: 2 }, up: [{ count: 2 }, { power: 5 }, { count: 2 }, { power: 6, cd: -0.15 }], desc: 'A flurry of snow in all directions. Chills foes; three Chills freeze them.' }),
  M({ id: 'ice-shard', name: 'Ice Shard', type: 'ice', cat: 'physical', behavior: 'projectile', verb: 'shatter', fx: 'shard', stats: { power: 30, cd: 0.7, speed: 520, area: 7, duration: 0.8 }, desc: 'Fast ice chunks. Triple damage to frozen foes, which shatter into shards that fly outward.' }),
  M({ id: 'icy-wind', name: 'Icy Wind', type: 'ice', cat: 'special', behavior: 'wave', verb: 'chill-wave', fx: 'wind', effect: 'chill', stats: { power: 40, cd: 3.8, speed: 190, area: 44, duration: 2.2, pierce: -1, chance: 1 }, desc: 'A chilling gust that crosses the field and Chills everything it touches.' }),
  M({ id: 'ice-beam', name: 'Ice Beam', type: 'ice', cat: 'special', behavior: 'beam', verb: 'sweep-beam', fx: 'shard', effect: 'chill', stats: { power: 34, cd: 3.4, area: 9, range: 200, duration: 1.6, tick: 0.25, chance: 0.6 }, desc: 'An icy ray that sweeps all the way around you, chilling everything it passes.' }),
  M({ id: 'sheer-cold', name: 'Sheer Cold', type: 'ice', cat: 'special', behavior: 'special', verb: 'execute-frozen', fx: 'shard', effect: 'chill', stats: { power: 20, cd: 3.5, area: 220, chance: 1 }, desc: 'A wave of absolute cold: Chills foes nearby and instantly KOs any frozen foe that isn\'t an elite or boss.' }),
  M({ id: 'snowscape', name: 'Snowscape', type: 'ice', cat: 'status', behavior: 'weather', verb: 'weather-snow', fx: 'shard', weather: 'snow', stats: { power: 5, cd: 16, duration: 9 }, desc: 'Weather: snow. Every foe on screen gains Chill over time (soaked foes freeze), and Ice moves deal +30%.' }),
  M({ id: 'blizzard', name: 'Blizzard', type: 'ice', cat: 'special', behavior: 'aura', verb: 'blizzard', fx: 'shard', effect: 'chill', mastery: { from: 'powder-snow', item: 'never-melt-ice' }, stats: { power: 40, cd: 0.4, area: 150, chance: 0.3, knock: 25 }, up: [], desc: 'MASTERED Powder Snow. A howling blizzard surrounds you, chilling and freezing foes.' }),
  // ───────────── Fighting: close range / combos / counters ─────────────
  M({ id: 'karate-chop', name: 'Karate Chop', type: 'fighting', cat: 'physical', behavior: 'melee', verb: 'swipe', fx: 'punch', stats: { power: 50, cd: 1.0, area: 36, range: 30, knock: 110, duration: 0.16 }, desc: 'A sharp chop. High critical-hit ratio.' }),
  M({ id: 'mach-punch', name: 'Mach Punch', type: 'fighting', cat: 'physical', behavior: 'melee', verb: 'jab', fx: 'punch', stats: { power: 22, cd: 0.28, area: 20, range: 14, knock: 20, duration: 0.1 }, up: [{ power: 5 }, { cd: -0.1 }, { power: 6 }, { cd: -0.12 }], desc: 'A flurry of jabs at point-blank range. Huge damage if you dare to stay close.' }),
  M({ id: 'rock-smash', name: 'Rock Smash', type: 'fighting', cat: 'physical', behavior: 'nova', verb: 'armor-break', fx: 'punch', effect: 'vuln', stats: { power: 36, cd: 2.4, area: 75, duration: 0.3, knock: 60, chance: 1 }, desc: 'Smashes the ground and cracks nearby foes\' guard: they take +25% damage from everything (Vulnerable).' }),
  M({ id: 'cross-chop', name: 'Cross Chop', type: 'fighting', cat: 'physical', behavior: 'passive', verb: 'follow-up', fx: 'slash', stats: { power: 90, cd: 1, area: 30, count: 5, knock: 90 }, up: [{ power: 15 }, { count: -1 }, { power: 15 }, { area: 0.25 }], desc: 'Never fires on its own: every 5th hit from any of your moves calls a crossed chop on that foe.' }),
  M({ id: 'sky-uppercut', name: 'Sky Uppercut', type: 'fighting', cat: 'physical', behavior: 'special', verb: 'launcher', fx: 'punch', stats: { power: 60, cd: 2.2, count: 3, area: 46, range: 120 }, up: [{ count: 1 }, { power: 10 }, { area: 0.2 }, { count: 1, cd: -0.1 }], desc: 'Launches the nearest foes into the air (helpless), and they crash down damaging everything around them.' }),
  M({ id: 'aura-sphere', name: 'Aura Sphere', type: 'fighting', cat: 'special', behavior: 'projectile', verb: 'boss-hunter', fx: 'orb', target: 'highestHp', stats: { power: 70, cd: 1.6, speed: 280, area: 12, duration: 3, homing: 6, pierce: 2 }, desc: 'Reads auras to seek out the toughest foe in view: elites and bosses first.' }),
  M({ id: 'counter', name: 'Counter', type: 'fighting', cat: 'physical', behavior: 'passive', verb: 'counter', fx: 'punch', stats: { power: 30, cd: 1, area: 64, knock: 140 }, desc: 'When a foe hits you in melee, you retaliate on every foe around you for double the damage you took (plus this move\'s power).' }),
  M({ id: 'focus-punch', name: 'Focus Punch', type: 'fighting', cat: 'physical', behavior: 'special', verb: 'focus', fx: 'punch', stats: { power: 280, cd: 4, area: 80, knock: 220 }, up: [{ power: 40 }, { area: 0.15 }, { power: 50 }, { cd: -0.12 }], desc: 'Tightens focus for 2 s (glowing fist). If you aren\'t hit meanwhile, a devastating punch blasts the area. If you are, it fizzles.' }),
  M({ id: 'dynamic-punch', name: 'Dynamic Punch', type: 'fighting', cat: 'physical', behavior: 'lob', verb: 'confuse-bomb', fx: 'punch', effect: 'confuse', mastery: { from: 'karate-chop', item: 'black-belt' }, stats: { power: 130, cd: 0.8, count: 2, speed: 380, area: 46, duration: 0.6, chance: 1, knock: 200 }, up: [], desc: 'MASTERED Karate Chop. Explosive punches that always confuse.' }),
  // ───────────── Poison: stacks / hazards / detonation ─────────────
  M({ id: 'poison-sting', name: 'Poison Sting', type: 'poison', cat: 'physical', behavior: 'projectile', verb: 'fan', fx: 'needle', effect: 'poison', stats: { power: 25, cd: 0.8, count: 2, speed: 400, area: 6, duration: 1, spread: 10, chance: 0.3 }, desc: 'Toxic barbs. May poison (stacks up to 5).' }),
  M({ id: 'smog', name: 'Smog', type: 'poison', cat: 'special', behavior: 'trail', verb: 'trail', fx: 'cloud', effect: 'poison', stats: { power: 12, cd: 0.45, area: 26, duration: 2.5, tick: 0.5, chance: 0.4 }, desc: 'Leaves a trail of toxic gas behind you. Lead foes through it.' }),
  M({ id: 'sludge-bomb', name: 'Sludge Bomb', type: 'poison', cat: 'special', behavior: 'lob', verb: 'puddle-bomb', fx: 'cloud', effect: 'poison', stats: { power: 50, cd: 2.0, speed: 280, area: 40, duration: 0.7, chance: 0.4 }, desc: 'Hurls sludge that splashes on impact and leaves a poison puddle behind.' }),
  M({ id: 'toxic', name: 'Toxic', type: 'poison', cat: 'status', behavior: 'chain', verb: 'bad-poison', fx: 'needle', effect: 'toxic', stats: { power: 8, cd: 1.8, count: 4, range: 120, chance: 1 }, desc: 'Badly poisons a chain of foes: their poison damage grows every tick.' }),
  M({ id: 'toxic-spikes', name: 'Toxic Spikes', type: 'poison', cat: 'status', behavior: 'mine', verb: 'spike-ring', fx: 'spike', effect: 'poison', stats: { power: 16, cd: 3.2, count: 5, area: 12, range: 70, duration: 8, chance: 1, pierce: 3 }, desc: 'Scatters a ring of spikes around you. Foes that step on them are poisoned.' }),
  M({ id: 'venoshock', name: 'Venoshock', type: 'poison', cat: 'special', behavior: 'projectile', verb: 'detonate-poison', fx: 'bubble', stats: { power: 36, cd: 1.4, speed: 300, area: 10, duration: 1.4, homing: 3 }, desc: 'Detonates a poisoned foe\'s poison stacks for a burst of damage (more stacks, bigger burst).' }),
  M({ id: 'gunk-shot', name: 'Gunk Shot', type: 'poison', cat: 'physical', behavior: 'lob', verb: 'garbage', fx: 'cloud', effect: 'poison', mastery: { from: 'poison-sting', item: 'poison-barb' }, stats: { power: 120, cd: 0.7, count: 3, speed: 360, area: 50, duration: 0.6, chance: 0.6 }, up: [], desc: 'MASTERED Poison Sting. Garbage bombs that blanket foes in poison.' }),
  // ───────────── Ground: the floor ─────────────
  M({ id: 'mud-slap', name: 'Mud-Slap', type: 'ground', cat: 'special', behavior: 'projectile', verb: 'blind', fx: 'rock', effect: 'weaken', stats: { power: 30, cd: 0.9, speed: 300, area: 8, duration: 1.1, chance: 0.4 }, desc: 'Hurls mud in foes\' faces. Blinded (Weakened) foes deal 30% less damage.' }),
  M({ id: 'magnitude', name: 'Magnitude', type: 'ground', cat: 'physical', behavior: 'nova', verb: 'gamble', fx: 'rock', stats: { power: 55, cd: 3.4, area: 120, duration: 0.5, knock: 60 }, desc: 'A quake of random intensity, rolled from 4 to 10 and called out on screen. A 10 is huge.' }),
  M({ id: 'bulldoze', name: 'Bulldoze', type: 'ground', cat: 'physical', behavior: 'special', verb: 'fissure', fx: 'rock', effect: 'slow', stats: { power: 40, cd: 2.2, area: 22, range: 260, chance: 0.7, knock: 40 }, up: [{ power: 8 }, { range: 0.2 }, { area: 0.2 }, { power: 10, cd: -0.1 }], desc: 'A crack runs along the ground toward a foe, erupting all along its path and slowing what it hits.' }),
  M({ id: 'earth-power', name: 'Earth Power', type: 'ground', cat: 'special', behavior: 'strike', verb: 'cluster-strike', fx: 'rock', target: 'densest', stats: { power: 70, cd: 2.2, count: 1, area: 44, knock: 40 }, up: [{ power: 10 }, { area: 0.15 }, { count: 1 }, { power: 12, cd: -0.1 }], desc: 'The ground erupts under the densest crowd of foes.' }),
  M({ id: 'bonemerang', name: 'Bonemerang', type: 'ground', cat: 'physical', behavior: 'boomerang', verb: 'boomerang', fx: 'bone', stats: { power: 45, cd: 1.6, count: 1, speed: 320, area: 12, range: 170, pierce: -1 }, desc: 'A bone that flies out and comes back, hitting twice.' }),
  M({ id: 'dig', name: 'Dig', type: 'ground', cat: 'physical', behavior: 'special', verb: 'burrow', fx: 'rock', stats: { power: 160, cd: 9, area: 110, knock: 160 }, up: [{ power: 30 }, { cd: -0.1 }, { area: 0.15 }, { power: 40, cd: -0.1 }], desc: 'Digs for 0.6 s (dust cloud), then travels underground for 1.5 s: untouchable, still steerable, no other moves fire. Erupts where you surface.' }),
  M({ id: 'earthquake', name: 'Earthquake', type: 'ground', cat: 'physical', behavior: 'nova', verb: 'quake', fx: 'rock', mastery: { from: 'magnitude', item: 'soft-sand' }, stats: { power: 140, cd: 1.6, count: 2, area: 220, duration: 0.6, knock: 120 }, up: [], desc: 'MASTERED Magnitude. Violent quakes shake the entire screen.' }),
  // ───────────── Flying: wind ─────────────
  M({ id: 'gust', name: 'Gust', type: 'flying', cat: 'special', behavior: 'projectile', verb: 'whirl', fx: 'tornado', stats: { power: 35, cd: 1.2, speed: 200, area: 14, duration: 1.6, pierce: 3, knock: 90 }, desc: 'Whips up a small whirlwind that plows through foes.' }),
  M({ id: 'wing-attack', name: 'Wing Attack', type: 'flying', cat: 'physical', behavior: 'melee', verb: 'swipe', fx: 'slash', stats: { power: 45, cd: 1.1, count: 2, area: 40, range: 26, duration: 0.18 }, desc: 'Strikes with wings spread wide, on both sides.' }),
  M({ id: 'air-slash', name: 'Air Slash', type: 'flying', cat: 'special', behavior: 'projectile', verb: 'pierce-fan', fx: 'slash', stats: { power: 38, cd: 1.3, count: 3, speed: 380, area: 10, duration: 1.1, spread: 30, pierce: -1 }, desc: 'A wide fan of air blades that cut through every foe in their path.' }),
  M({ id: 'aerial-ace', name: 'Aerial Ace', type: 'flying', cat: 'physical', behavior: 'projectile', verb: 'sniper', fx: 'slash', target: 'farthest', stats: { power: 50, cd: 1.3, speed: 640, area: 10, duration: 1.5, homing: 9 }, desc: 'Dives at the farthest foe in view, and always lands a critical hit.' }),
  M({ id: 'whirlwind', name: 'Whirlwind', type: 'flying', cat: 'special', behavior: 'nova', verb: 'repel', fx: 'wind', stats: { power: 20, cd: 6, area: 150, duration: 0.5, knock: 520 }, up: [{ area: 0.12 }, { cd: -0.1 }, { area: 0.12 }, { cd: -0.12 }], desc: 'A gale that hurls every foe around you away, elites included. Your emergency repel.' }),
  M({ id: 'tailwind', name: 'Tailwind', type: 'flying', cat: 'status', behavior: 'buff', verb: 'team-speed', fx: 'wind', buff: { kind: 'tailwind', amount: 0.25 }, stats: { power: 0, cd: 12, duration: 6, area: 220 }, desc: 'A tailwind for the whole team nearby: +25% move speed and faster, farther-flying projectiles.' }),
  M({ id: 'hurricane', name: 'Hurricane', type: 'flying', cat: 'special', behavior: 'wave', verb: 'tornadoes', fx: 'tornado', effect: 'confuse', mastery: { from: 'gust', item: 'sharp-beak' }, stats: { power: 110, cd: 1.6, count: 3, speed: 130, area: 40, duration: 3.5, pierce: -1, chance: 0.3, knock: 60 }, up: [], desc: 'MASTERED Gust. Homing tornadoes shred the battlefield.' }),
  // ───────────── Psychic: manipulation ─────────────
  M({ id: 'confusion', name: 'Confusion', type: 'psychic', cat: 'special', behavior: 'aura', verb: 'aura', fx: 'ring', effect: 'confuse', stats: { power: 22, cd: 0.8, area: 64, chance: 0.06, knock: 30 }, desc: 'Telekinetic pulses hurt foes close to you. May confuse.' }),
  M({ id: 'psybeam', name: 'Psybeam', type: 'psychic', cat: 'special', behavior: 'beam', verb: 'beam', fx: 'beam', effect: 'confuse', stats: { power: 55, cd: 1.9, area: 10, range: 240, duration: 0.35, chance: 0.15 }, desc: 'A peculiar ray that may confuse.' }),
  M({ id: 'stored-power', name: 'Stored Power', type: 'psychic', cat: 'special', behavior: 'projectile', verb: 'buff-power', fx: 'orb', stats: { power: 34, cd: 1.3, count: 1, speed: 300, area: 10, duration: 1.4, pierce: 3, spread: 30 }, desc: 'Piercing psychic orbs: +1 orb and +20% damage for every boost active on you.' }),
  M({ id: 'future-sight', name: 'Future Sight', type: 'psychic', cat: 'special', behavior: 'strike', verb: 'delayed', fx: 'orb', target: 'densest', stats: { power: 160, cd: 3.5, count: 1, area: 60, knock: 50 }, up: [{ power: 25 }, { area: 0.15 }, { count: 1 }, { power: 30, cd: -0.1 }], desc: 'Marks the densest crowd. 2.5 s later the foreseen attack lands there for huge damage.' }),
  M({ id: 'calm-mind', name: 'Calm Mind', type: 'psychic', cat: 'status', behavior: 'buff', verb: 'spa-window', fx: 'ring', buff: { kind: 'spa', amount: 0.3 }, stats: { power: 0, cd: 10, duration: 5 }, desc: 'Periodically focuses the mind: +30% Sp. Atk for a while.' }),
  M({ id: 'reflect', name: 'Reflect', type: 'psychic', cat: 'status', behavior: 'buff', verb: 'team-barrier', fx: 'ring', buff: { kind: 'reflect', amount: 0.5 }, stats: { power: 0, cd: 12, duration: 5, area: 220 }, desc: 'A wall of light for the whole team nearby: projectile damage taken is halved for a while.' }),
  M({ id: 'mirror-coat', name: 'Mirror Coat', type: 'psychic', cat: 'special', behavior: 'special', verb: 'reflect-shots', fx: 'ring', stats: { power: 40, cd: 2.5, area: 110 }, up: [{ power: 10 }, { area: 0.15 }, { cd: -0.12 }, { power: 15, area: 0.15 }], desc: 'A shimmering mirror flashes around you and sends every enemy projectile it touches back at double damage.' }),
  M({ id: 'psychic', name: 'Psychic', type: 'psychic', cat: 'special', behavior: 'aura', verb: 'psy-field', fx: 'ring', effect: 'confuse', mastery: { from: 'confusion', item: 'twisted-spoon' }, stats: { power: 60, cd: 0.6, area: 130, chance: 0.12, knock: 70 }, up: [], desc: 'MASTERED Confusion. A vast psychic field crushes nearby foes.' }),
  // ───────────── Bug: swarm ─────────────
  M({ id: 'string-shot', name: 'String Shot', type: 'bug', cat: 'status', behavior: 'cone', verb: 'root-cone', fx: 'web', effect: 'root', stats: { power: 6, cd: 3, range: 120, area: 46, duration: 0.5, tick: 0.25, chance: 1 }, desc: 'Sprays sticky silk that pins foes in place (Rooted). Rooted foes can still shoot.' }),
  M({ id: 'pin-missile', name: 'Pin Missile', type: 'bug', cat: 'physical', behavior: 'projectile', verb: 'pins', fx: 'needle', stats: { power: 20, cd: 0.9, count: 3, speed: 460, area: 5, duration: 0.9 }, up: [{ count: 1 }, { power: 5 }, { count: 1 }, { power: 5, cd: -0.15 }], desc: 'Pins stick in their target: each pin already stuck adds +10% to the next ones.' }),
  M({ id: 'fury-cutter', name: 'Fury Cutter', type: 'bug', cat: 'physical', behavior: 'melee', verb: 'ramp-slash', fx: 'slash', stats: { power: 30, cd: 0.6, area: 34, range: 26, duration: 0.15 }, desc: 'Rapid slashes that grow +50% stronger with each hit in a row (up to ×5). A second without hitting resets it.' }),
  M({ id: 'bug-buzz', name: 'Bug Buzz', type: 'bug', cat: 'special', behavior: 'nova', verb: 'density', fx: 'note', stats: { power: 40, cd: 2.8, area: 105, duration: 0.45 }, desc: 'A buzzing sound wave that gets 6% stronger for every foe caught in it.' }),
  M({ id: 'infestation', name: 'Infestation', type: 'bug', cat: 'special', behavior: 'minion', verb: 'swarm', fx: 'bug', stats: { power: 14, cd: 6, count: 1, area: 22, duration: 10, tick: 0.3 }, desc: 'Releases a bug swarm that latches onto a foe, gnawing it. When the host faints, the swarm hops to the next foe.' }),
  M({ id: 'megahorn', name: 'Megahorn', type: 'bug', cat: 'physical', behavior: 'projectile', verb: 'horns', fx: 'needle', mastery: { from: 'pin-missile', item: 'silver-powder' }, stats: { power: 90, cd: 0.6, count: 6, speed: 520, area: 12, duration: 1, pierce: 4, knock: 120 }, up: [], desc: 'MASTERED Pin Missile. A barrage of massive horns.' }),
  // ───────────── Rock: constructs / heavy hitters ─────────────
  M({ id: 'rock-throw', name: 'Rock Throw', type: 'rock', cat: 'physical', behavior: 'lob', verb: 'shard-lob', fx: 'rock', stats: { power: 50, cd: 1.4, speed: 260, area: 26, duration: 0.6 }, desc: 'Lobs a rock that shatters on impact into flying shards.' }),
  M({ id: 'rock-slide', name: 'Rock Slide', type: 'rock', cat: 'physical', behavior: 'special', verb: 'lane', fx: 'rock', effect: 'flinch', stats: { power: 55, cd: 2.6, count: 7, area: 26, chance: 0.4 }, up: [{ count: 2 }, { power: 8 }, { area: 0.2 }, { power: 10, cd: -0.1 }], desc: 'An avalanche: a lane of boulders tumbles across the screen through the nearest foe.' }),
  M({ id: 'rollout', name: 'Rollout', type: 'rock', cat: 'physical', behavior: 'orbit', verb: 'ramp-orbit', fx: 'rock', stats: { power: 32, cd: 4, count: 1, speed: 3.5, area: 14, range: 70, duration: 3.5, tick: 0.4, knock: 100 }, desc: 'A boulder rolls around you, growing 20% stronger with every hit (up to ×4). A second without hitting resets it.' }),
  M({ id: 'ancient-power', name: 'Ancient Power', type: 'rock', cat: 'special', behavior: 'projectile', verb: 'stat-proc', fx: 'rock', stats: { power: 40, cd: 1.6, count: 5, speed: 260, area: 9, duration: 1.2, spread: 360 }, up: [{ count: 1 }, { power: 6 }, { count: 2 }, { power: 8, cd: -0.15 }], desc: 'Ancient rocks fired in every direction. Each hit has a small chance to raise all your stats by 1% for the rest of the run (max +15%).' }),
  M({ id: 'sandstorm', name: 'Sandstorm', type: 'rock', cat: 'special', behavior: 'weather', verb: 'weather-sand', fx: 'cloud', weather: 'sand', stats: { power: 12, cd: 16, duration: 9 }, desc: 'Weather: a sandstorm chips every non-Rock/Ground/Steel foe on screen each second. Rock-type allies take 15% less damage.' }),
  M({ id: 'stealth-rock', name: 'Stealth Rock', type: 'rock', cat: 'status', behavior: 'mine', verb: 'percent-hazard', fx: 'rock', stats: { power: 10, cd: 5, count: 4, area: 13, range: 90, duration: 10, chance: 0, pierce: 4 }, desc: 'Floating stones hang around you. Foes that touch them lose 8% of their max HP (1% for bosses).' }),
  M({ id: 'rock-tomb', name: 'Rock Tomb', type: 'rock', cat: 'physical', behavior: 'wall', verb: 'wall', fx: 'rock', stats: { power: 40, cd: 6, count: 3, area: 16, range: 64, duration: 6, knock: 120 }, desc: 'Raises rock pillars between you and the nearest foes. Pillars block enemies from walking through.' }),
  M({ id: 'stone-edge', name: 'Stone Edge', type: 'rock', cat: 'physical', behavior: 'nova', verb: 'stone-rings', fx: 'spike', mastery: { from: 'rock-throw', item: 'hard-stone' }, stats: { power: 130, cd: 1.2, count: 2, area: 150, duration: 0.5, knock: 140 }, up: [], desc: 'MASTERED Rock Throw. Rings of jagged stone erupt around you.' }),
  // ───────────── Ghost: curses / rule-breakers ─────────────
  M({ id: 'lick', name: 'Lick', type: 'ghost', cat: 'physical', behavior: 'melee', verb: 'swipe', fx: 'shadow', effect: 'paralyze', stats: { power: 42, cd: 0.95, area: 36, range: 28, duration: 0.18, chance: 0.2 }, desc: 'Licks with a long tongue. May paralyze.' }),
  M({ id: 'night-shade', name: 'Night Shade', type: 'ghost', cat: 'special', behavior: 'beam', verb: 'fixed-beam', fx: 'shadow', stats: { power: 6, cd: 1.6, area: 9, range: 230, duration: 0.35 }, up: [{ power: 1 }, { count: 1 }, { power: 1 }, { cd: -0.1 }], desc: 'A sinister beam that deals fixed damage based on the team\'s level, ignoring types and resistances.' }),
  M({ id: 'shadow-ball', name: 'Shadow Ball', type: 'ghost', cat: 'special', behavior: 'projectile', verb: 'heavy-orb', fx: 'shadow', stats: { power: 70, cd: 1.7, speed: 150, area: 18, duration: 3, pierce: -1 }, desc: 'A slow, huge shadow blob that passes through every foe in its path.' }),
  M({ id: 'hex', name: 'Hex', type: 'ghost', cat: 'special', behavior: 'chain', verb: 'status-payoff', fx: 'shadow', stats: { power: 45, cd: 1.4, count: 3, range: 110 }, desc: 'A curse that leaps between foes. Double damage to foes with any status condition.' }),
  M({ id: 'shadow-sneak', name: 'Shadow Sneak', type: 'ghost', cat: 'physical', behavior: 'special', verb: 'interceptor', fx: 'shadow', effect: 'flinch', stats: { power: 60, cd: 0.8, area: 40, chance: 1, knock: 160 }, desc: 'Your shadow lashes out at the first foe that comes within reach, hitting it before it can touch you.' }),
  M({ id: 'curse', name: 'Curse', type: 'ghost', cat: 'status', behavior: 'special', verb: 'curse', fx: 'shadow', effect: 'curse', stats: { power: 2, cd: 8, count: 1, chance: 1 }, up: [{ cd: -0.1 }, { count: 1 }, { cd: -0.1 }, { count: 1 }], desc: 'Pays 8% HP to curse the toughest foe in view: it loses 2% of its max HP every second until it faints.' }),
  M({ id: 'shadow-force', name: 'Shadow Force', type: 'ghost', cat: 'physical', behavior: 'strike', verb: 'vanish', fx: 'shadow', mastery: { from: 'night-shade', item: 'spell-tag' }, stats: { power: 150, cd: 0.9, count: 5, area: 50, knock: 100 }, up: [], desc: 'MASTERED Night Shade. You flicker out of sight (briefly untouchable) and strike from the shadows everywhere.' }),
  // ───────────── Dragon: power with drawbacks ─────────────
  M({ id: 'twister', name: 'Twister', type: 'dragon', cat: 'special', behavior: 'orbit', verb: 'fling-orbit', fx: 'tornado', effect: 'flinch', stats: { power: 35, cd: 3.2, count: 2, speed: 4, area: 14, range: 50, duration: 3.2, tick: 0.4, chance: 0.15 }, desc: 'Twisters circle you, then fling outward. May interrupt foes (Flinch).' }),
  M({ id: 'dragon-rage', name: 'Dragon Rage', type: 'dragon', cat: 'special', behavior: 'projectile', verb: 'rage', fx: 'flame', stats: { power: 30, cd: 1.2, speed: 320, area: 12, duration: 1.4, pierce: 2 }, desc: 'A shock wave of fury: adds twice the damage you took in the last 5 seconds.' }),
  M({ id: 'dragon-breath', name: 'Dragon Breath', type: 'dragon', cat: 'special', behavior: 'cone', verb: 'puff', fx: 'flame', effect: 'paralyze', stats: { power: 36, cd: 1.8, range: 70, area: 60, duration: 0.35, tick: 0.2, chance: 0.3 }, desc: 'A short, wide puff of draconic breath. Often paralyzes.' }),
  M({ id: 'dragon-pulse', name: 'Dragon Pulse', type: 'dragon', cat: 'special', behavior: 'projectile', verb: 'pulse-trail', fx: 'orb', stats: { power: 50, cd: 1.8, speed: 220, area: 13, duration: 1.8, pierce: 4 }, desc: 'A shock wave that explodes every few steps along its path.' }),
  M({ id: 'outrage', name: 'Outrage', type: 'dragon', cat: 'physical', behavior: 'special', verb: 'rampage', fx: 'flame', stats: { power: 34, cd: 12, area: 80, duration: 5, knock: 80 }, up: [{ power: 6 }, { duration: 0.15 }, { area: 0.15 }, { power: 8, cd: -0.1 }], desc: 'Rampages for 5 s: a huge thrashing aura and +20% speed. Afterwards you\'re exhausted and your other moves pause for 2 s.' }),
  M({ id: 'dragon-dance', name: 'Dragon Dance', type: 'dragon', cat: 'status', behavior: 'buff', verb: 'stacking-dance', fx: 'ring', buff: { kind: 'dance', amount: 0.12 }, stats: { power: 0, cd: 6, duration: 30 }, desc: 'A mystic dance: +12% Attack and speed per dance, stacking 3 times. You lose a stack whenever you\'re hit.' }),
  M({ id: 'draco-meteor', name: 'Draco Meteor', type: 'dragon', cat: 'special', behavior: 'strike', verb: 'comets', fx: 'meteor', mastery: { from: 'twister', item: 'dragon-fang' }, stats: { power: 160, cd: 1.0, count: 6, area: 52, knock: 140 }, up: [], desc: 'MASTERED Twister. Comets rain down, but each cast drains 10% Sp. Atk for 5 s (stacking).' }),
  // ───────────── Dark: opportunism ─────────────
  M({ id: 'bite', name: 'Bite', type: 'dark', cat: 'physical', behavior: 'melee', verb: 'swipe', fx: 'fang', effect: 'flinch', stats: { power: 50, cd: 1.0, area: 34, range: 26, duration: 0.18, chance: 0.3 }, desc: 'Bites with sharp fangs. May interrupt (Flinch).' }),
  M({ id: 'pursuit', name: 'Pursuit', type: 'dark', cat: 'physical', behavior: 'projectile', verb: 'hunter', fx: 'shadow', target: 'lowestHp', stats: { power: 36, cd: 0.9, speed: 380, area: 9, duration: 1.6, homing: 7 }, desc: 'Hunts the most wounded foe in view. Double damage to foes running away from you.' }),
  M({ id: 'dark-pulse', name: 'Dark Pulse', type: 'dark', cat: 'special', behavior: 'nova', verb: 'interrupt', fx: 'shadow', effect: 'flinch', stats: { power: 50, cd: 3, area: 120, duration: 0.45, chance: 1 }, desc: 'A horrible aura that makes every foe around you flinch, interrupting attacks they are winding up.' }),
  M({ id: 'night-slash', name: 'Night Slash', type: 'dark', cat: 'physical', behavior: 'melee', verb: 'crit-statused', fx: 'slash', stats: { power: 62, cd: 1.3, count: 2, area: 40, range: 32, duration: 0.18 }, desc: 'Strikes at openings: always lands a critical hit on foes with any status condition.' }),
  M({ id: 'thief', name: 'Thief', type: 'dark', cat: 'physical', behavior: 'projectile', verb: 'steal', fx: 'fang', stats: { power: 34, cd: 1.1, speed: 360, area: 9, duration: 1.2, homing: 4 }, desc: 'Each hit may steal an Exp. Candy or a berry from the foe. Elites always drop loot the first time.' }),
  M({ id: 'crunch', name: 'Crunch', type: 'dark', cat: 'physical', behavior: 'strike', verb: 'jaws', fx: 'fang', effect: 'flinch', mastery: { from: 'bite', item: 'black-glasses' }, stats: { power: 140, cd: 0.8, count: 4, area: 40, chance: 0.3, knock: 80 }, up: [], desc: 'MASTERED Bite. Giant phantom jaws crunch foes all over the screen.' }),
  // ───────────── Steel: defence / weight ─────────────
  M({ id: 'metal-claw', name: 'Metal Claw', type: 'steel', cat: 'physical', behavior: 'melee', verb: 'swipe', fx: 'slash', stats: { power: 45, cd: 0.9, area: 36, range: 28, duration: 0.16 }, desc: 'Rakes with steel claws. Each hit has a 10% chance to raise your Attack by 1% for the rest of the run (max +30%).' }),
  M({ id: 'flash-cannon', name: 'Flash Cannon', type: 'steel', cat: 'special', behavior: 'beam', verb: 'refract', fx: 'beam', stats: { power: 60, cd: 2.2, area: 12, range: 260, duration: 0.4 }, desc: 'A beam of light that splits into three rays at the first foe it hits.' }),
  M({ id: 'gyro-ball', name: 'Gyro Ball', type: 'steel', cat: 'physical', behavior: 'orbit', verb: 'heavy-orbit', fx: 'ring', stats: { power: 45, cd: 3.6, count: 1, speed: 6, area: 14, range: 52, duration: 3, tick: 0.35 }, desc: 'A spinning steel ball. Slower users hit harder.' }),
  M({ id: 'magnet-bomb', name: 'Magnet Bomb', type: 'steel', cat: 'physical', behavior: 'projectile', verb: 'sticky', fx: 'orb', stats: { power: 70, cd: 1.6, count: 1, speed: 300, area: 46, duration: 2, homing: 7 }, desc: 'Steel bombs latch onto a foe, then blow up 1.5 s later, catching everything around it.' }),
  M({ id: 'iron-defense', name: 'Iron Defense', type: 'steel', cat: 'status', behavior: 'passive', verb: 'stance', fx: 'ring', stats: { power: 0.6, cd: 1 }, up: [{ power: 0.04 }, { power: 0.04 }, { power: 0.04 }, { power: 0.04 }], desc: 'Plants your feet: while you stand still, you take 60% less contact damage (shown as a steel shell).' }),
  M({ id: 'meteor-mash', name: 'Meteor Mash', type: 'steel', cat: 'physical', behavior: 'lob', verb: 'comet-punch', fx: 'meteor', mastery: { from: 'metal-claw', item: 'metal-coat' }, stats: { power: 120, cd: 0.7, count: 3, speed: 420, area: 46, duration: 0.5, knock: 160 }, up: [], desc: 'MASTERED Metal Claw. Comet punches pummel foes.' }),
  // ───────────── Fairy: support ─────────────
  M({ id: 'fairy-wind', name: 'Fairy Wind', type: 'fairy', cat: 'special', behavior: 'projectile', verb: 'fan', fx: 'heart', stats: { power: 36, cd: 1.0, count: 2, speed: 260, area: 10, duration: 1.4, spread: 20, pierce: 2 }, desc: 'Stirs up a fairy wind.' }),
  M({ id: 'disarming-voice', name: 'Disarming Voice', type: 'fairy', cat: 'special', behavior: 'nova', verb: 'charm', fx: 'heart', effect: 'charm', stats: { power: 30, cd: 3, area: 100, duration: 0.4, chance: 0.6 }, desc: 'A charming cry. Infatuated foes stop attacking, wander off and pick fights with other foes.' }),
  M({ id: 'draining-kiss', name: 'Draining Kiss', type: 'fairy', cat: 'special', behavior: 'projectile', verb: 'ally-heal', fx: 'heart', effect: 'drain', stats: { power: 45, cd: 1.5, speed: 260, area: 10, duration: 1.8, homing: 6, chance: 1 }, desc: 'Steals HP with a kiss and gives it to the most hurt teammate (you, when alone).' }),
  M({ id: 'dazzling-gleam', name: 'Dazzling Gleam', type: 'fairy', cat: 'special', behavior: 'nova', verb: 'screen-flash', fx: 'star', stats: { power: 70, cd: 6, area: 420, duration: 0.5, knock: 30 }, up: [{ power: 12 }, { cd: -0.1 }, { power: 14 }, { cd: -0.12 }], desc: 'A blinding flash that hits every foe on screen.' }),
  M({ id: 'misty-terrain', name: 'Misty Terrain', type: 'fairy', cat: 'status', behavior: 'terrain', verb: 'safe-zone', fx: 'cloud', effect: 'slow', stats: { power: 0, cd: 9, duration: 6, area: 90, chance: 1 }, desc: 'A mist covers the ground. Allies inside take 20% less damage; foes inside are slowed.' }),
  M({ id: 'moonblast', name: 'Moonblast', type: 'fairy', cat: 'special', behavior: 'lob', verb: 'moon', fx: 'heart', mastery: { from: 'fairy-wind', item: 'fairy-feather' }, stats: { power: 120, cd: 0.8, count: 3, speed: 300, area: 56, duration: 0.7, knock: 100 }, up: [], desc: 'MASTERED Fairy Wind. Borrowing the moon\'s power, blasts explode on foes.' }),
  // ───────────── Universal TMs (status) ─────────────
  M({ id: 'swords-dance', name: 'Swords Dance', type: 'normal', cat: 'status', behavior: 'buff', verb: 'atk-window', fx: 'slash', buff: { kind: 'atk', amount: 0.4 }, stats: { power: 0, cd: 10, duration: 5 }, desc: 'A frenetic dance: +40% Attack for a while.' }),
  M({ id: 'agility', name: 'Agility', type: 'psychic', cat: 'status', behavior: 'buff', verb: 'haste', fx: 'wind', buff: { kind: 'haste', amount: 0.3 }, stats: { power: 0, cd: 10, duration: 5 }, desc: 'Relaxes and lightens the body: +30% move speed and attack rate.' }),
  M({ id: 'double-team', name: 'Double Team', type: 'normal', cat: 'status', behavior: 'buff', verb: 'dodge', fx: 'ring', buff: { kind: 'dodge', amount: 0.5 }, stats: { power: 0, cd: 12, duration: 4 }, desc: 'Creates illusory copies: 50% chance to dodge hits for a while.' }),
  M({ id: 'rest', name: 'Rest', type: 'psychic', cat: 'status', behavior: 'special', verb: 'sleep-heal', fx: 'note', stats: { power: 0.4, cd: 18 }, up: [{ cd: -0.1 }, { power: 0.05 }, { cd: -0.1 }, { power: 0.05 }], desc: 'Falls asleep for 1.5 s (Zzz): you can\'t move, but you recover 40% of your max HP.' }),
  M({ id: 'focus-energy', name: 'Focus Energy', type: 'normal', cat: 'status', behavior: 'buff', verb: 'crit-window', fx: 'ring', buff: { kind: 'crit', amount: 0.25 }, stats: { power: 0, cd: 10, duration: 5 }, desc: 'Takes a deep breath: +25% critical-hit chance for a while.' }),
  M({ id: 'protect', name: 'Protect', type: 'normal', cat: 'status', behavior: 'passive', verb: 'block', fx: 'ring', stats: { power: 0, cd: 10 }, up: [{ cd: -0.08 }, { cd: -0.08 }, { cd: -0.08 }, { cd: -0.08 }], desc: 'A barrier that fully blocks the next hit, then recharges for 10 s (shown as a green bubble).' }),
];

export const MOVES: Record<string, MoveDef> = Object.fromEntries(MOVE_LIST.map((m) => [m.id, m]));

/** base move id -> mastery move */
export const MASTERY_OF: Record<string, MoveDef> = Object.fromEntries(
  MOVE_LIST.filter((m) => m.mastery).map((m) => [m.mastery!.from, m]),
);

/** Moves sold as TMs in the shop; once owned they join every Pokémon's learnset. */
export const TM_MOVES = [
  'swords-dance', 'agility', 'double-team', 'rest', 'focus-energy', 'calm-mind', 'reflect', 'protect', 'substitute',
  'aerial-ace', 'shadow-ball', 'rock-slide', 'swift', 'pay-day', 'thunder-wave', 'iron-defense', 'hyper-voice',
  'metronome', 'hidden-power', 'explosion', 'focus-punch',
] as const;

/** Moves that never deal damage by themselves (excluded from Metronome). */
export const NON_ATTACKS = new Set(MOVE_LIST.filter((m) => m.cat === 'status' || m.behavior === 'passive' || m.behavior === 'weather').map((m) => m.id));
