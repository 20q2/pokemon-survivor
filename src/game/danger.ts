/** Low-HP warning: vignette strength and heartbeat cadence from the local partner's HP fraction. */
export const DANGER_HP = 0.3;
const CRITICAL_HP = 0.15;
const MAX_VIGNETTE = 0.45;

/** Red vignette alpha: 0 at 30% HP rising linearly to 0.45 at 10% HP and below. */
export function dangerStrength(hpFrac: number): number {
  if (hpFrac >= DANGER_HP) return 0;
  return Math.min(MAX_VIGNETTE, ((DANGER_HP - hpFrac) / 0.2) * MAX_VIGNETTE);
}

/** Seconds between heartbeats, or 0 for none: 0.9 s at <= 30% HP, 0.6 s under 15%. */
export function heartbeatInterval(hpFrac: number): number {
  if (hpFrac > DANGER_HP) return 0;
  return hpFrac < CRITICAL_HP ? 0.6 : 0.9;
}
