import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../src/meta/achievements.ts';
import { nearMissLines } from '../src/ui/nearMiss.ts';

const summary = (o: Partial<RunSummary> = {}): RunSummary => ({
  stageId: 'viridian', lineId: 'charmander', finalSpecies: 'charmander', shiny: false,
  time: 100, level: 5, kills: 0, bosses: 0, cleared: false, moneyEarned: 0, superEff: 0,
  evolutions: 0, masteries: 0, shinyKills: 0, coop: false, firstHit: 0, maxedMoves: 0,
  maxedItems: 0, stabOnly: false, defeatedChansey: false, died: true, elite: false,
  megas: 0, alphas: 0, eliteChests: 0,
  xp: 0, xpNext: 100, nextBossAt: null, nextBoss: null, nextWaveAt: 120, chestsOpened: 0,
  ...o,
});

describe('nearMissLines', () => {
  it('reports level, boss and minute when all are close', () => {
    const r = summary({ time: 462, xp: 80, xpNext: 100, nextBossAt: 480, nextBoss: 'beedrill', nextWaveAt: 480 });
    expect(nearMissLines(r)).toEqual([
      'Next level was 20 XP away',
      'Beedrill was 00:18 away',
      'Minute 8 was 18 s away',
    ]);
  });

  it('reports nothing when everything was far', () => {
    expect(nearMissLines(summary({ time: 70, xp: 10, nextBossAt: 180, nextBoss: 'beedrill', nextWaveAt: 120 }))).toEqual([]);
  });

  it('reports only the level when only it was close', () => {
    expect(nearMissLines(summary({ time: 90, xp: 60 }))).toEqual(['Next level was 40 XP away']);
  });

  it('stays silent on a clear', () => {
    expect(nearMissLines(summary({ cleared: true, xp: 99 }))).toEqual([]);
  });
});
