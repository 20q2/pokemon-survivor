import type { Player } from '../game/types.ts';

/** A Gym Badge: one is chosen after each non-final boss and changes a rule for the rest of the run. */
export interface BadgeDef { id: string; name: string; desc: string; color: string }

export const BADGES: readonly BadgeDef[] = [
  { id: 'boulder', name: 'Boulder Badge', desc: '+30% max HP, -8% speed.', color: '#9a9aa2' },
  { id: 'cascade', name: 'Cascade Badge', desc: 'Pickup radius +50%.', color: '#4a9be8' },
  { id: 'thunder', name: 'Thunder Badge', desc: '+15% critical-hit chance.', color: '#f2c430' },
  { id: 'rainbow', name: 'Rainbow Badge', desc: 'Level-ups offer 4 cards.', color: '#7fcf6a' },
  { id: 'soul', name: 'Soul Badge', desc: 'Poison you inflict never wears off.', color: '#d85ab0' },
  { id: 'marsh', name: 'Marsh Badge', desc: 'Chests you open are one Ball tier higher.', color: '#e0b030' },
  { id: 'volcano', name: 'Volcano Badge', desc: 'Burns you inflict last twice as long.', color: '#e8503a' },
  { id: 'earth', name: 'Earth Badge', desc: 'Hazards and walls you place last twice as long.', color: '#4fb070' },
];

export const BADGE: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

export const hasBadge = (p: Pick<Player, 'badges'>, id: string) => p.badges.includes(id);
