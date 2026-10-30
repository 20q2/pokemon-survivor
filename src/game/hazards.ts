import type { PType } from '../data/types.ts';
import { SPECIES } from '../data/pokedex.ts';
import { TAU, dist2, wrapAngle } from '../engine/math.ts';
import { makeProjectile } from './combat.ts';
import type { Sim } from './sim.ts';
import type { Enemy, Player, Projectile } from './types.ts';

/**
 * Raid-style ground attacks. A hazard marks an area of the ground, fills it up over `delay`
 * seconds, then detonates once and hits every player still standing in it. Hazards are hostile
 * projectiles (moveId HAZARD), so co-op clients get them through normal projectile replication.
 *
 * Shapes (all true world-space areas, drawn exactly as they hit):
 *   circle  centre x,y, radius r
 *   ring    centre x,y, outer radius r, safe inner radius `len`
 *   line    from x,y along `angle` for `len`, half-width r
 *   cone    apex x,y facing `angle`, reach `len`, half-angle atan2(r, len)
 * A hazard with dmg 0 is only a warning (e.g. the path of a charge) and never detonates.
 */
export const HAZARD = 'hazard';
/** How long the detonation flash lingers after the hit. */
export const HAZARD_IMPACT = 0.3;

export type RaidMove = 'quake' | 'donut' | 'meteor' | 'beam' | 'cone' | 'cross';
export const RAID_MOVES: ReadonlySet<string> = new Set<RaidMove>(['quake', 'donut', 'meteor', 'beam', 'cone', 'cross']);

/** Who is casting: bosses get the full-size version, alphas a little less, guardians a small one. */
export type RaidTier = 'boss' | 'final' | 'alpha' | 'guardian';

interface HazardSpec {
  shape: 'circle' | 'ring' | 'line' | 'cone';
  x: number; y: number; r: number;
  angle?: number; len?: number;
  delay: number;
  dmg: number;
  type: PType;
}

export function spawnHazard(sim: Sim, h: HazardSpec): Projectile {
  return makeProjectile(sim, {
    owner: -1, hostile: true, behavior: 'enemy', moveId: HAZARD, fx: 'orb', type: h.type, shape: h.shape,
    x: h.x, y: h.y, r: h.r, angle: h.angle ?? 0, len: h.len ?? 0, delay: h.delay, life: h.delay + HAZARD_IMPACT,
    dmg: h.dmg, pierce: -1,
  });
}

/** Is a body of radius `br` at (x,y) inside the hazard's area? */
export function inHazard(pr: Projectile, x: number, y: number, br: number): boolean {
  const dx = x - pr.x, dy = y - pr.y;
  switch (pr.shape) {
    case 'circle':
      return dx * dx + dy * dy < (pr.r + br) ** 2;
    case 'ring': {
      const d2 = dx * dx + dy * dy;
      // The safe middle only counts when the whole body fits inside it.
      return d2 < (pr.r + br) ** 2 && d2 > Math.max(0, pr.len - br) ** 2;
    }
    case 'line': {
      const c = Math.cos(pr.angle), s = Math.sin(pr.angle);
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      return u > -br && u < pr.len + br && Math.abs(v) < pr.r + br;
    }
    case 'cone': {
      const d = Math.hypot(dx, dy);
      if (d > pr.len + br) return false;
      if (d < br) return true;
      const half = Math.atan2(pr.r, pr.len) + Math.asin(Math.min(1, br / d));
      return Math.abs(wrapAngle(Math.atan2(dy, dx) - pr.angle)) < half;
    }
    default:
      return false;
  }
}

/** Called once per tick for each hazard after its clock has advanced by dt. */
export function updateHazard(sim: Sim, pr: Projectile, dt: number) {
  if (pr.dmg <= 0 || pr.t < pr.delay || pr.t - dt >= pr.delay) return;
  for (const p of sim.players) {
    if (!p.fainted && inHazard(pr, p.x, p.y, p.radius)) sim.hurtPlayer(p, pr.dmg, pr.type, true);
  }
  for (const b of impactPoints(pr)) sim.emit({ e: 'boom', x: b.x, y: b.y, r: b.r, type: pr.type });
}

/** Where the detonation's explosions go, so the blast reads across the whole marked area. */
function impactPoints(pr: Projectile): { x: number; y: number; r: number }[] {
  switch (pr.shape) {
    case 'line': {
      const n = Math.max(1, Math.round(pr.len / 160));
      return Array.from({ length: n }, (_, i) => {
        const u = ((i + 0.5) / n) * pr.len;
        return { x: pr.x + Math.cos(pr.angle) * u, y: pr.y + Math.sin(pr.angle) * u, r: pr.r * 1.6 };
      });
    }
    case 'cone':
      return [{ x: pr.x + Math.cos(pr.angle) * pr.len * 0.6, y: pr.y + Math.sin(pr.angle) * pr.len * 0.6, r: pr.len * 0.45 }];
    case 'ring':
      return [{ x: pr.x, y: pr.y, r: pr.r }];
    default:
      return [{ x: pr.x, y: pr.y, r: pr.r }];
  }
}

/** Steering away from the nearest edge of an armed hazard the body is standing in (bots). */
export function hazardEscape(pr: Projectile, x: number, y: number, br: number): { x: number; y: number } | null {
  if (pr.dmg <= 0 || pr.t >= pr.delay || !inHazard(pr, x, y, br)) return null;
  const dx = x - pr.x, dy = y - pr.y;
  const d = Math.hypot(dx, dy) || 1;
  switch (pr.shape) {
    case 'ring':
      // Closer to the safe middle than to the outside? Step in, otherwise step out.
      return d - pr.len < pr.r - d ? { x: -dx / d, y: -dy / d } : { x: dx / d, y: dy / d };
    case 'line': {
      const v = -dx * Math.sin(pr.angle) + dy * Math.cos(pr.angle);
      const side = v >= 0 ? 1 : -1;
      return { x: -Math.sin(pr.angle) * side, y: Math.cos(pr.angle) * side };
    }
    case 'cone': {
      const off = wrapAngle(Math.atan2(dy, dx) - pr.angle);
      const a = pr.angle + (off >= 0 ? Math.PI / 2 : -Math.PI / 2);
      return { x: Math.cos(a), y: Math.sin(a) };
    }
    default:
      return { x: dx / d, y: dy / d };
  }
}

// ─────────────────────────── raid moves ───────────────────────────

/** Move names called out when an attack starts, by the caster's main type. */
const NAMES: Record<RaidMove, { def: string } & Partial<Record<PType, string>>> = {
  quake: {
    def: 'Earthquake', electric: 'Discharge', fire: 'Lava Plume', water: 'Surf', ice: 'Blizzard', psychic: 'Psychic',
    ghost: 'Hex', poison: 'Sludge Wave', bug: 'Bug Buzz', grass: 'Petal Blizzard', flying: 'Hurricane', dragon: 'Outrage',
    fairy: 'Moonblast', dark: 'Night Daze', normal: 'Hyper Voice',
  },
  donut: {
    def: 'Twister', fire: 'Fire Spin', water: 'Whirlpool', ice: 'Sheer Cold', grass: 'Leaf Storm', ground: 'Sand Tomb',
    rock: 'Sand Tomb', psychic: 'Psywave', ghost: 'Ominous Wind', electric: 'Thunder Cage', poison: 'Toxic Spikes',
    normal: 'Uproar', fairy: 'Dazzling Gleam', fighting: 'Vacuum Wave', dark: 'Snarl', steel: 'Mirror Shot', bug: 'Silver Wind',
  },
  meteor: {
    def: 'Rock Slide', ice: 'Hail', electric: 'Thunder', fire: 'Eruption', water: 'Water Spout', psychic: 'Future Sight',
    ghost: 'Shadow Ball', grass: 'Bullet Seed', bug: 'Pin Missile', poison: 'Sludge Bomb', flying: 'Sky Attack',
    dragon: 'Draco Meteor', fairy: 'Moonblast', normal: 'Pay Day', fighting: 'Focus Blast', dark: 'Night Shade', steel: 'Meteor Mash',
  },
  beam: {
    def: 'Hyper Beam', grass: 'Solar Beam', water: 'Hydro Pump', electric: 'Zap Cannon', psychic: 'Psybeam', ice: 'Ice Beam',
    fire: 'Overheat', bug: 'Signal Beam', ghost: 'Night Shade', dragon: 'Dragon Pulse', poison: 'Gunk Shot', rock: 'Stone Edge',
    ground: 'Mud Shot', flying: 'Air Cutter', fighting: 'Focus Blast', fairy: 'Dazzling Gleam', dark: 'Dark Pulse', steel: 'Flash Cannon',
  },
  cone: {
    def: 'Hyper Voice', fire: 'Flamethrower', ice: 'Icy Wind', water: 'Surf', electric: 'Discharge', flying: 'Gust',
    bug: 'Silver Wind', poison: 'Poison Gas', grass: 'Petal Dance', psychic: 'Confusion', ghost: 'Ominous Wind',
    dragon: 'Dragon Breath', rock: 'Ancient Power', ground: 'Bulldoze', fighting: 'Close Combat', dark: 'Snarl',
    fairy: 'Fairy Wind', steel: 'Metal Sound',
  },
  cross: {
    def: 'Cross Chop', bug: 'X-Scissor', poison: 'Cross Poison', psychic: 'Psycho Cut', dark: 'Night Slash',
    grass: 'Leaf Blade', flying: 'Air Cutter', ghost: 'Shadow Claw', dragon: 'Dragon Claw', steel: 'Metal Claw',
    electric: 'Thunder', ice: 'Frost Breath', fire: 'Fire Blast', water: 'Razor Shell',
  },
};

export function raidMoveName(move: RaidMove, type: PType): string {
  return NAMES[move][type] ?? NAMES[move].def;
}

const SIZE: Record<RaidTier, number> = { final: 1.2, boss: 1, alpha: 0.8, guardian: 0.55 };
const POWER: Record<RaidTier, number> = { final: 2.6, boss: 2.4, alpha: 2.1, guardian: 1.8 };
/** Telegraph length multiplier: small foes' attacks come out a bit faster. */
const WIND_UP: Record<RaidTier, number> = { final: 1, boss: 1, alpha: 0.95, guardian: 0.85 };

/**
 * Mark the ground for `move` and return how long the caster should stand still winding it up.
 * Aimed at `target`; meteor showers rain on every partner.
 */
export function castRaid(sim: Sim, e: Enemy, move: RaidMove, target: Player, tier: RaidTier): number {
  const k = SIZE[tier];
  const w = WIND_UP[tier];
  const dmg = e.dmg * POWER[tier];
  const type = e.types[0];
  const aim = Math.atan2(target.y - e.y, target.x - e.x);
  let wind = 0;
  switch (move) {
    case 'quake': {
      wind = 1.45 * w;
      spawnHazard(sim, { shape: 'circle', x: e.x, y: e.y, r: 145 * k, delay: wind, dmg, type });
      break;
    }
    case 'donut': {
      wind = 1.6 * w;
      spawnHazard(sim, { shape: 'ring', x: e.x, y: e.y, r: 250 * k, len: Math.max(64, 85 * k), delay: wind, dmg, type });
      break;
    }
    case 'beam': {
      wind = 1.15 * w;
      const beams = tier === 'final' ? [-0.45, 0, 0.45] : [0];
      for (const off of beams) spawnHazard(sim, { shape: 'line', x: e.x, y: e.y, r: 26 * k, len: 620 * k, angle: aim + off, delay: wind, dmg, type });
      break;
    }
    case 'cone': {
      wind = 1.05 * w;
      const len = 240 * k;
      spawnHazard(sim, { shape: 'cone', x: e.x, y: e.y, r: len * Math.tan(0.7), len, angle: aim, delay: wind, dmg, type });
      break;
    }
    case 'cross': {
      wind = 1.3 * w;
      const base = sim.rng.chance(0.5) ? 0 : Math.PI / 4;
      for (let i = 0; i < 4; i++) {
        spawnHazard(sim, { shape: 'line', x: e.x, y: e.y, r: 24 * k, len: 560 * k, angle: base + (i * Math.PI) / 2, delay: wind, dmg, type });
      }
      // Big bosses follow up with the diagonal half while you're still repositioning.
      if (tier === 'final') {
        for (let i = 0; i < 4; i++) {
          spawnHazard(sim, { shape: 'line', x: e.x, y: e.y, r: 24 * k, len: 560 * k, angle: base + Math.PI / 4 + (i * Math.PI) / 2, delay: wind + 0.9, dmg, type });
        }
        wind += 0.9;
      }
      break;
    }
    case 'meteor': {
      const waves = tier === 'guardian' ? 1 : tier === 'alpha' ? 2 : 3;
      const r = 46 * Math.max(0.75, k);
      const t0 = 1.1 * w;
      for (const p of sim.players) {
        if (p.fainted || !p.connected || dist2(p.x, p.y, e.x, e.y) > 700 * 700) continue;
        for (let wv = 0; wv < waves; wv++) {
          const at = t0 + wv * 0.45;
          // One lands right where the partner is standing (so they must move), the rest scatter around.
          spawnHazard(sim, { shape: 'circle', x: p.x, y: p.y, r, delay: at, dmg, type });
          const scatter = tier === 'guardian' ? 1 : 3;
          for (let i = 0; i < scatter; i++) {
            const a = sim.rng.range(0, TAU), d = sim.rng.range(r * 1.6, 220 * k);
            spawnHazard(sim, { shape: 'circle', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r, delay: at, dmg, type });
          }
        }
      }
      wind = t0 + (waves - 1) * 0.45;
      break;
    }
  }
  sim.emit({ e: 'raid', x: e.x, y: e.y, name: raidMoveName(move, type), big: tier === 'boss' || tier === 'final' });
  return wind;
}

/** A warning strip for a charge: where the caster is about to run. Deals no damage itself. */
export function markCharge(sim: Sim, e: Enemy, tx: number, ty: number, delay: number) {
  const a = Math.atan2(ty - e.y, tx - e.x);
  spawnHazard(sim, { shape: 'line', x: e.x, y: e.y, r: e.radius, len: Math.hypot(tx - e.x, ty - e.y) + e.radius, angle: a, delay, dmg: 0, type: e.types[0] });
}

// ─────────────────────────── alphas & guardians ───────────────────────────

/** Alphas rotate through their signature attacks; their old shockwave ring stays in the mix. */
const ALPHA_ROTATION: (RaidMove | 'shots')[] = ['quake', 'cone', 'shots', 'meteor', 'beam', 'shots'];

export function alphaNextMove(e: Enemy): RaidMove | 'shots' {
  return ALPHA_ROTATION[e.patternIdx++ % ALPHA_ROTATION.length];
}

/** Guardians get one move suited to how they fight: bruisers stomp, shooters fire a beam, the rest lunge with a cone. */
export function guardianMove(e: Enemy): RaidMove {
  if (e.role === 'ranged') return 'beam';
  if (e.role === 'tank') return 'quake';
  return SPECIES[e.speciesId].base[0] >= 80 ? 'quake' : 'cone';
}
