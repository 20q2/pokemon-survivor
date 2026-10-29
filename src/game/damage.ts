import type { PType } from '../data/types.ts';
import { effectiveness } from '../data/types.ts';
import type { MoveDef } from '../data/moves.ts';
import type { AbilityId } from '../data/pokedex.ts';
import type { DerivedStats } from './types.ts';

export const POWER_SCALE = 0.25;

export function stabMult(moveType: PType, userTypes: readonly PType[], ability: AbilityId): number {
  if (!userTypes.includes(moveType)) return 1;
  return ability === 'adaptability' ? 2 : 1.5;
}

const PINCH: Partial<Record<AbilityId, PType>> = { overgrow: 'grass', blaze: 'fire', torrent: 'water' };

/** Damage of one hit before the defender's types / crit are applied. */
export function baseDamage(
  move: MoveDef,
  power: number,
  stats: DerivedStats,
  userTypes: readonly PType[],
  ability: AbilityId,
  hpFrac: number,
): number {
  let d = power * POWER_SCALE;
  if (move.cat === 'physical') d *= stats.atk * (1 + stats.physDmg);
  else if (move.cat === 'special') d *= stats.spa * (1 + stats.specDmg);
  else d *= Math.max(stats.atk, stats.spa) * (1 + Math.max(stats.physDmg, stats.specDmg));
  d *= stabMult(move.type, userTypes, ability);
  d *= 1 + (stats.typeDmg[move.type] ?? 0);
  if (PINCH[ability] === move.type) d *= hpFrac < 0.5 ? 1.5 : 1.15;
  if (ability === 'guts') d *= 1 + 0.6 * (1 - hpFrac);
  return d;
}

export interface HitResult { dmg: number; eff: number; crit: boolean }

export function resolveHit(
  base: number,
  moveType: PType,
  defTypes: readonly PType[],
  critChance: number,
  stats: DerivedStats,
  roll: number,
  bonus = 1,
): HitResult {
  const eff = effectiveness(moveType, defTypes);
  const crit = roll < critChance;
  let dmg = base * eff * bonus;
  if (eff > 1) dmg *= 1 + stats.superEff;
  if (crit) dmg *= stats.critDmg;
  return { dmg: Math.max(1, Math.round(dmg)), eff, crit };
}

/** Damage an enemy deals to a player. */
export function incomingDamage(
  raw: number,
  attackerType: PType,
  defTypes: readonly PType[],
  taken: number,
): number {
  // Soften type effects on defence so a bad matchup is punishing but not hopeless.
  const eff = effectiveness(attackerType, defTypes);
  const soft = eff > 1 ? 1 + (eff - 1) * 0.5 : eff < 1 ? 1 - (1 - eff) * 0.5 : 1;
  return raw * soft * taken;
}
