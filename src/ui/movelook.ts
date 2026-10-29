import { MOVES, MOVE_LIST } from '../data/moves.ts';
import { TYPE_COLORS } from '../data/types.ts';

/**
 * Every move gets its own icon look, built from what it is:
 *  - background pattern = its shape (`pat-<behavior>`: stripes for projectiles, rings for novas…)
 *  - type-logo size     = its category (`cat-physical` big, `cat-special` medium, `cat-status` small)
 *  - tint of the type colour, so same-type moves of the same shape and category still differ
 *  - a gold frame for mastered moves
 */
const TINTS = [
  (c: string) => c,
  (c: string) => `color-mix(in srgb, ${c} 74%, #fff)`,
  (c: string) => `color-mix(in srgb, ${c} 74%, #000)`,
  (c: string) => `color-mix(in srgb, ${c} 55%, #fff)`,
];

/** Tint index per move: its position among moves sharing type, shape and category. */
export const TINT_OF: Record<string, number> = {};
{
  const seen = new Map<string, number>();
  for (const m of MOVE_LIST) {
    const k = `${m.type}|${m.behavior}|${m.cat}`;
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    TINT_OF[m.id] = i;
  }
}

/** The key that makes a move's icon unique. */
export const lookKey = (id: string) => {
  const m = MOVES[id];
  return `${m.type}|${m.behavior}|${m.cat}|${TINT_OF[id]}|${m.mastery ? 'M' : ''}`;
};

export function moveLook(id: string): { cls: string; style: string } {
  const m = MOVES[id];
  const tint = TINTS[Math.min(TINTS.length - 1, TINT_OF[id] ?? 0)];
  return {
    cls: `mvl pat-${m.behavior} cat-${m.cat}${m.mastery ? ' mastered' : ''}`,
    style: `--tc:${tint(TYPE_COLORS[m.type])}`,
  };
}
