import { SPECIES } from '../data/pokedex.ts';
import type { RunSummary } from '../meta/achievements.ts';
import { fmtTime } from './dom.ts';

/** "So close" lines for the results screen; only for runs that ended short of a clear. */
export function nearMissLines(r: RunSummary): string[] {
  // A quit from the pause menu isn't a near miss; only deaths are.
  if (r.cleared || !r.died) return [];
  const lines: string[] = [];
  if (r.xpNext - r.xp <= r.xpNext * 0.5) lines.push(`Next level was ${Math.ceil(r.xpNext - r.xp)} XP away`);
  if (r.nextBossAt !== null && r.nextBoss && r.nextBossAt - r.time <= 45) {
    lines.push(`${SPECIES[r.nextBoss].name} was ${fmtTime(r.nextBossAt - r.time)} away`);
  }
  const wave = Math.ceil(r.nextWaveAt - r.time);
  if (wave > 0 && wave <= 20) lines.push(`Minute ${Math.round(r.nextWaveAt / 60) + 1} was ${wave} s away`);
  return lines;
}
