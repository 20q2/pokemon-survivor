import { SPECIES } from '../data/pokedex.ts';
import type { RunSummary } from '../meta/achievements.ts';
import { fmtTime } from './dom.ts';

/** "So close" lines for the results screen; only for runs that ended short of a clear. */
export function nearMissLines(r: RunSummary): string[] {
  if (r.cleared) return [];
  const lines: string[] = [];
  if (r.xpNext - r.xp <= r.xpNext * 0.5) lines.push(`Next level was ${Math.ceil(r.xpNext - r.xp)} XP away`);
  if (r.nextBossAt !== null && r.nextBoss && r.nextBossAt - r.time <= 45) {
    lines.push(`${SPECIES[r.nextBoss].name} was ${fmtTime(r.nextBossAt - r.time)} away`);
  }
  if (r.nextWaveAt - r.time <= 20) lines.push(`Minute ${Math.floor(r.time / 60) + 1} was ${Math.ceil(r.nextWaveAt - r.time)} s away`);
  return lines;
}
