/** What the Director sees each tick; kept plain so it can be tested without a Sim. */
export interface DirectorSnapshot {
  /** Whole minute of the run (flags reset when it changes). */
  minute: number;
  /** Mean hp fraction of the party's standing members. */
  hpFrac: number;
  /** Anyone still on their feet; with nobody up, hpFrac says nothing and no reprieve is due. */
  standing: boolean;
  /** Total kills so far; the Director derives kills/s itself. */
  kills: number;
  /** Whether the current minute still has a set piece waiting to fire. */
  eventPending: boolean;
}

export interface DirectorAction {
  /** Fire the next set piece this many seconds early. */
  pullForward?: number;
  /** Hold the quota backfill for this many seconds. */
  pauseTrickle?: number;
}

/** A dominant party is above this hp fraction and killing faster than this (per second) for SURGE_AFTER seconds. */
export const SURGE_HP = 0.9;
export const SURGE_KPS = 8;
export const SURGE_AFTER = 20;
/** A surge pulls the next set piece forward by a random amount in this range (s). */
export const SURGE_PULL_MIN = 10;
export const SURGE_PULL_MAX = 15;
/** One tick's kills/s is clamped to this multiple of SURGE_KPS so a Repel burst can't fake dominance. */
const KPS_SAMPLE_CAP = 4;
/** A struggling party is below this hp fraction; the backfill rests for REPRIEVE_FOR seconds. */
export const REPRIEVE_HP = 0.35;
export const REPRIEVE_FOR = 4;
/** Kills/s is smoothed over roughly this many seconds. */
const KPS_WINDOW = 5;

/**
 * Left 4 Dead-style tension on top of the wave script: it never edits the wave table, only nudges set-piece
 * timing and briefly eases the trickle. Silent on purpose; it should feel like luck.
 */
export class Director {
  private minute = -1;
  private lastKills = 0;
  private kps = 0;
  private dominantFor = 0;
  private surged = false;
  private reprieved = false;
  /** `range` must be the Sim's seeded rng so peers stay in step. */
  private range: (lo: number, hi: number) => number;
  constructor(range: (lo: number, hi: number) => number) {
    this.range = range;
  }

  update(dt: number, s: DirectorSnapshot): DirectorAction {
    if (s.minute !== this.minute) {
      this.minute = s.minute;
      this.surged = this.reprieved = false;
      this.dominantFor = 0;
    }
    const inst = dt > 0 ? Math.min(SURGE_KPS * KPS_SAMPLE_CAP, (s.kills - this.lastKills) / dt) : this.kps;
    this.lastKills = s.kills;
    this.kps += (inst - this.kps) * Math.min(1, dt / KPS_WINDOW);

    const act: DirectorAction = {};
    this.dominantFor = s.hpFrac > SURGE_HP && this.kps >= SURGE_KPS ? this.dominantFor + dt : 0;
    if (!this.surged && s.eventPending && this.dominantFor >= SURGE_AFTER) {
      this.surged = true;
      this.dominantFor = 0;
      act.pullForward = this.range(SURGE_PULL_MIN, SURGE_PULL_MAX);
    }
    if (!this.reprieved && s.standing && s.hpFrac < REPRIEVE_HP) {
      this.reprieved = true;
      act.pauseTrickle = REPRIEVE_FOR;
    }
    return act;
  }
}
