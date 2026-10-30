import { describe, expect, it } from 'vitest';
import { applyRun } from '../src/meta/progression.ts';
import { freshSave } from '../src/meta/save.ts';
import type { RunSummary } from '../src/meta/achievements.ts';

const summary = (lineId: string, finalSpecies: string): RunSummary => ({
  stageId: 'viridian', lineId, finalSpecies, shiny: false, time: 100, level: 5, kills: 0, bosses: 0,
  cleared: false, moneyEarned: 0, superEff: 0, evolutions: 0, masteries: 0, shinyKills: 0, coop: false,
  firstHit: 0, maxedMoves: 0, maxedItems: 0, stabOnly: false, defeatedChansey: false, died: true,
  elite: false, megas: 0, alphas: 0, eliteChests: 0,
  xp: 0, xpNext: 100, nextBossAt: null, nextBoss: null, nextWaveAt: 120, chestsOpened: 0,
});

describe('applyRun marks your own evolutions as seen', () => {
  it('a Charizard run marks the whole chain', () => {
    const save = freshSave();
    applyRun(save, summary('charmander', 'charizard'), [], new Map());
    expect(Object.keys(save.seen).sort()).toEqual(['charizard', 'charmander', 'charmeleon']);
  });

  it('an Eevee run ending as Umbreon marks eevee and umbreon only', () => {
    const save = freshSave();
    applyRun(save, summary('eevee', 'umbreon'), [], new Map());
    expect(Object.keys(save.seen).sort()).toEqual(['eevee', 'umbreon']);
  });

  it('stops at the stage reached', () => {
    const save = freshSave();
    applyRun(save, summary('charmander', 'charmeleon'), [], new Map());
    expect(save.seen.charizard).toBeUndefined();
  });
});
