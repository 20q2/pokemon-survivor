import type { PType } from '../data/types.ts';
import type { Behavior, BuffKind, Category, Fx, StatusKind } from '../data/moves.ts';
import type { AbilityId } from '../data/pokedex.ts';
import type { EnemyRole, BossPattern } from '../data/stages.ts';
import type { MetaBonuses } from '../meta/shop.ts';
import type { Ledger } from './ledger.ts';

export interface OwnedMove {
  id: string;
  level: number;
  cd: number;      // time until next activation
  dmgDealt: number;
  kills: number;
  /** Ramp counter (Fury Cutter, Hyper Voice…) and when it last grew. */
  n?: number;
  nt?: number;
}

export interface OwnedItem { id: string; level: number }

export interface Buff { kind: BuffKind; amount: number; t: number; src?: string }

export interface DerivedStats {
  maxHp: number;
  atk: number;          // multiplier for physical moves
  spa: number;          // multiplier for special moves
  contactTaken: number; // multiplier on contact damage
  projTaken: number;    // multiplier on projectile damage
  speed: number;        // px/s
  cooldown: number;     // multiplier on cd (lower = faster)
  area: number;
  duration: number;
  countBonus: number;
  crit: number;
  critDmg: number;
  regen: number;        // fraction of max hp / s
  lifesteal: number;
  exp: number;
  money: number;
  thorns: number;
  superEff: number;
  flinch: number;
  pickup: number;       // px radius
  focus: number;
  lifeOrb: number;
  typeDmg: Partial<Record<PType, number>>;
  physDmg: number;
  specDmg: number;
  /** Projectile speed / reach multiplier (Tailwind). */
  projSpeed: number;
}

export interface Player {
  id: number;
  slot: number;
  name: string;
  lineId: string;
  speciesId: string;
  stage: number;
  shiny: boolean;
  types: PType[];
  ability: AbilityId;
  x: number;
  y: number;
  px?: number; py?: number;       // position at the start of the last sim step (render interpolation)
  radius: number;
  mx: number; my: number;         // input
  fx: number; fy: number;         // facing (unit)
  moving: boolean;
  hp: number;
  moves: OwnedMove[];
  items: OwnedItem[];
  buffs: Buff[];
  stats: DerivedStats;
  meta: MetaBonuses;
  moveSlots: number;
  itemSlots: number;
  rerolls: number;
  skips: number;
  banishes: number;
  banished: Set<string>;
  revives: number;
  fainted: boolean;
  reviveProgress: number;
  hurtT: number;          // flash timer
  lastHit: number;        // sim time of last damage taken
  pendingLevels: number;  // level-ups waiting for a choice
  /** A move the partner wants to learn after evolving, while all move slots are full. */
  pendingLearn?: string;
  kills: number;
  dmgDealt: number;
  dmgTaken: number;
  bossKills: number;
  superEff: number;
  shinyKills: number;
  vitamins: Record<string, number>; // vitamin id -> times taken this run
  evolutions: number;
  masteries: number;
  connected: boolean;
  viewW: number;
  viewH: number;
  sandT?: number;
  /** Damage/healing by source, for the damage tracker. */
  ledger: Ledger;
  /** Mega Evolution: meter 0..1 (fills once fully evolved and the team holds the Mega Stone). */
  mega: number;
  /** Seconds of Mega Evolution left (0 = not mega). */
  megaT: number;
  megas: number;
  /** Recent damage taken (for Dragon Rage): [time, amount] pairs. */
  hurtLog: [number, number][];
  /** Dig: wind-up seconds left, then seconds underground. */
  digWind: number;
  burrowT: number;
  /** Rest: seconds asleep. Outrage: seconds of rampage, then exhaustion. Shadow Force: i-frames. */
  sleepT: number;
  rageT: number;
  exhaustT: number;
  vanishT: number;
  /** Protect: seconds until the barrier is back (0 = barrier up). */
  protectCd: number;
  /** Spark: static gathered (px run). Cross Chop: hits counted. */
  staticCharge: number;
  combo: number;
  /** Run-long growth from Metal Claw / Ancient Power (as stacks of +1%). */
  clawStacks: number;
  ancientStacks: number;
  /** Hidden Power's type and status for this run. */
  hiddenType: PType;
  hiddenEffect: StatusKind;
  /** Focus Punch: sim time the current focus started (-1 = not focusing). */
  focusAt: number;
  /** Ally-terrain effects felt this tick. */
  onTerrain: { haste: boolean; misty: boolean };
}

export interface StatusState {
  burn: number; poison: number; poisonStacks: number; paralyze: number; freeze: number;
  slow: number; confuse: number; flinch: number; dotTick: number;
  burnDmg: number; poisonDmg: number; dotOwner: number; coin: number;
  wet: number; chill: number; chillT: number; sleep: number; charm: number; vuln: number;
  weaken: number; root: number;
  /** Leech Seed: seconds left, damage per tick, owner. */
  seed: number; seedDmg: number; seedOwner: number;
  /** Badly poisoned: ticks so far (0 = plain poison). */
  toxic: number;
  /** Curse: % max HP per second (0 = none) and owner. */
  curse: number; curseOwner: number;
  /** Pin Missile pins stuck in this foe, and when they fall out. */
  pins: number; pinsT: number;
  /** Sky Uppercut: seconds airborne, landing damage, owner. */
  air: number; airDmg: number; airOwner: number;
  /** Friendly-fire cooldown for confused/infatuated bumps. */
  ffCd: number;
  /** Thief already looted this elite. */
  robbed: number;
}

export interface Enemy {
  id: number;
  speciesId: string;
  types: PType[];
  role: EnemyRole;
  x: number;
  y: number;
  px?: number; py?: number;
  radius: number;
  vx: number; vy: number;   // knockback velocity
  dirX: number; dirY: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  special: boolean;         // deals special (projectile-like) contact damage
  xp: number;
  elite: boolean;
  boss: boolean;
  final: boolean;
  shiny: boolean;
  /** Alpha Pokémon: huge, territorial, marked on the minimap. */
  alpha: boolean;
  guardian?: boolean;
  homeX: number; homeY: number;
  alive: boolean;
  flash: number;
  st: StatusState;
  contactCd: number;
  ai: number;               // generic AI timer
  aiState: number;
  aiX: number; aiY: number;
  patterns: BossPattern[];
  patternIdx: number;
  minions: string[];
  knockResist: number;
  scale: number;
  lastHitBy: number;        // player id
  animOffset: number;
  /** Elites & alphas: seconds until their next telegraphed ground attack. */
  raidCd?: number;
  /** Seconds left standing still while winding up a ground attack. */
  casting?: number;
}

export type Shape = 'circle' | 'ring' | 'line' | 'box' | 'cone';

export type { WeatherKind } from '../data/moves.ts';

/** Everything that hits things: projectiles, auras, beams, zones, swipes, enemy bullets. */
export interface Projectile {
  id: number;
  owner: number;            // player id (or -1 for hostile)
  hostile: boolean;
  moveId: string;
  behavior: Behavior | 'enemy';
  fx: Fx;
  type: PType;
  cat: Category;
  shape: Shape;
  x: number; y: number;
  px?: number; py?: number;
  vx: number; vy: number;
  angle: number;
  r: number;                // radius / half-width
  len: number;              // length for line/box/cone
  t: number;                // age
  life: number;
  delay: number;            // time before it becomes active (strike telegraph)
  attach: boolean;          // follows owner
  ox: number; oy: number;   // offset from owner when attached
  orbitR: number; orbitSpd: number; orbitA: number;
  homing: number;
  speed: number;
  boomerang: number;        // range; >0 = returns
  returning: boolean;
  tx: number; ty: number;   // lob target
  sx: number; sy: number;   // lob start
  pierce: number;
  tick: number;
  dmg: number;              // pre-type base damage
  knock: number;
  effect?: StatusKind;
  chance: number;
  crit: number;
  hit: Map<number, number>; // enemy id -> time it may be hit again
  dead: boolean;
  growth: number;           // ring max radius for nova
  effect2?: StatusKind;
  chance2: number;
  angSpd: number;           // sweeping beams: rotation speed (rad/s)
  release: number;          // orbits that fling outward after this age (0 = never)
  base: number;             // breathing orbits: base radius (swings out to `growth`)
  follow: number;           // enemy id this is stuck to (0 = none)
  bounce: number;           // screen-edge bounces left
  ramp: number;             // per-hit damage growth (Rollout); current multiplier in `mult`
  mult: number;
  rampT: number;            // sim time of the last hit
  fixed: number;            // fixed damage per hit (ignores types and defences)
  timer: number;            // generic countdown (pulse trail, sticky fuse)
  flags: number;            // per-move bit flags (see combat PF_*)
}

export type PickupKind = 'candy' | 'coin' | 'oran' | 'sitrus' | 'magnet' | 'repel' | 'chest' | 'rare-candy' | 'mega-stone';

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number; y: number;
  value: number;
  vacuum: number;           // >0 once attracted (player id + 1)
  vx: number; vy: number;
  t: number;
  dead: boolean;
}

export type GameEvent =
  | { e: 'hit'; x: number; y: number; dmg: number; eff: number; crit: boolean; type: PType }
  | { e: 'kill'; x: number; y: number; species: string; boss: boolean; shiny: boolean; type: PType }
  | { e: 'pickup'; kind: PickupKind; player: number; value: number }
  | { e: 'hurt'; player: number; dmg: number }
  | { e: 'levelup'; level: number }
  | { e: 'evolve'; player: number; from: string; to: string }
  | { e: 'boss'; species: string; final: boolean }
  | { e: 'bossDown'; species: string; final: boolean }
  | { e: 'chest'; player: number; rewards: ChestReward[]; tier: ChestTier }
  | { e: 'mega'; player: number; species: string }
  | { e: 'megaEnd'; player: number }
  | { e: 'megaStone'; player: number }
  | { e: 'alphaDown'; species: string }
  | { e: 'poi'; kind: 'cache' | 'mega-stone' | 'alpha'; x: number; y: number; species?: string }
  | { e: 'fire'; player: number; move: string; type: PType; behavior: Behavior }
  | { e: 'chain'; pts: number[]; type: PType }
  | { e: 'boom'; x: number; y: number; r: number; type: PType }
  | { e: 'faint'; player: number }
  | { e: 'revive'; player: number }
  /** Red alert banner: swarms, rings and other set pieces that need the player's eyes now. */
  | { e: 'warn'; text: string }
  /** Quiet notice (treasure carrier, Alpha sighted…): a small toast, no alarm sound. */
  | { e: 'toast'; text: string }
  /** A new minute wave began: `species` is its headline newcomer (sprite for the banner), `text` the line to show. */
  | { e: 'wave'; minute: number; species: string; text: string }
  | { e: 'status'; x: number; y: number; kind: StatusKind }
  | { e: 'shiny'; x: number; y: number }
  | { e: 'repel' }
  | { e: 'learn'; player: number; move: string }
  | { e: 'enemyShot'; x: number; y: number }
  /** A boss, alpha or elite starts a telegraphed ground attack (named move callout). */
  | { e: 'raid'; x: number; y: number; name: string; big: boolean }
  /** A short floating callout (Magnitude roll, fizzles, steals…). */
  | { e: 'callout'; x: number; y: number; text: string; color: string };

/** Treasure rarity, shown by the Poké Ball it comes in. Stored as a chest pickup's `value`. */
export type ChestTier = 1 | 2 | 3 | 4;
export const CHEST_BALL: Record<ChestTier, string> = { 1: 'poke-ball', 2: 'great-ball', 3: 'ultra-ball', 4: 'master-ball' };
export const CHEST_COLOR: Record<ChestTier, string> = { 1: '#fff3b0', 2: '#7fb8ff', 3: '#ffd84a', 4: '#d38bff' };
export const CHEST_NAME: Record<ChestTier, string> = { 1: 'Poké Ball', 2: 'Great Ball', 3: 'Ultra Ball', 4: 'Master Ball' };

/** `gold`: id is the icon, level the ₽ amount. `heal`: id is the berry eaten. */
export interface ChestReward { kind: 'mastery' | 'move' | 'item' | 'vitamin' | 'gold' | 'heal'; id: string; level?: number; from?: string }

export interface UpgradeOffer {
  /** forget: learn `id` in place of move slot `level`; keep: don't learn `id`. */
  kind: 'newMove' | 'moveUp' | 'newItem' | 'itemUp' | 'heal' | 'vitamin' | 'forget' | 'keep';
  id: string;
  level: number; // resulting level
}

