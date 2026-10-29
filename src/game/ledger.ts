import type { Player } from './types.ts';

/**
 * Per-player damage/healing ledger for the damage tracker: amounts keyed by source (a move id,
 * or a special source like 'burn', 'thorns', 'regen', 'oran').
 */
export interface Ledger {
  dmg: Record<string, number>;
  boss: Record<string, number>;
  heal: Record<string, number>;
}

export const newLedger = (): Ledger => ({ dmg: {}, boss: {}, heal: {} });

export function creditDamage(p: Player, src: string, amount: number, boss: boolean) {
  if (!(amount > 0)) return;
  p.dmgDealt += amount;
  p.ledger.dmg[src] = (p.ledger.dmg[src] ?? 0) + amount;
  if (boss) p.ledger.boss[src] = (p.ledger.boss[src] ?? 0) + amount;
}

/** Restore HP to `target` (capped at max) and credit the HP actually restored to `by` under `src`. */
export function heal(target: Player, amount: number, src: string, by: Player = target): number {
  if (target.fainted || !(amount > 0)) return 0;
  const before = target.hp;
  target.hp = Math.min(target.stats.maxHp, target.hp + amount);
  const done = target.hp - before;
  if (done > 0) by.ledger.heal[src] = (by.ledger.heal[src] ?? 0) + done;
  return done;
}
