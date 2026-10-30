/** Level-up cascade: a candy pile can leave several level-ups pending, and the card screen then repeats. */

export const CASCADE_MAX_STEP = 4;

/** The second heading line for a cascade of `size` level-ups; null for an ordinary single level-up. */
export function cascadeLabel(size: number): string | null {
  return size > 1 ? `×${size} LEVEL UP!` : null;
}

/**
 * Which step of the cascade a card screen is, for the rising jingle. Remembers the biggest pending
 * count seen, so redrawing the same screen (reroll, banish) keeps its step and the last card of a
 * cascade (pending 1) still counts as part of it. Call `reset` when the level-up phase ends.
 */
export class CascadeTracker {
  private start = 0;

  /** Size of the current cascade: the biggest pending count seen since the last reset. */
  get size() { return this.start; }

  step(pending: number): number {
    this.start = Math.max(this.start, pending);
    return Math.min(CASCADE_MAX_STEP, this.start - pending);
  }

  reset() { this.start = 0; }
}
