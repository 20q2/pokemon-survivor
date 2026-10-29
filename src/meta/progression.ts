import { LINE } from '../data/pokedex.ts';
import { STAGES } from '../data/stages.ts';
import { TM_MOVES } from '../data/moves.ts';
import { ACHIEVEMENTS, type Achievement, type RunSummary } from './achievements.ts';
import { FRIENDSHIP_MAX } from './shop.ts';
import type { SaveData } from './save.ts';

export interface RunRewards {
  money: number;
  friendship: number;
  newAchievements: Achievement[];
  shinyUnlocked: boolean;
  newBest: boolean;
}

export function friendshipGain(r: RunSummary): number {
  return Math.round((r.time / 60 * 8 + r.kills / 120 + r.bosses * 15 + (r.cleared ? 120 : 0) + r.evolutions * 10) * (r.elite ? 1.5 : 1));
}

/** End-of-run bonus on top of collected Poké Dollars. */
export function runBonus(r: RunSummary): number {
  const tier = 1 + 0.25 * Math.max(0, STAGES.findIndex((s) => s.id === r.stageId));
  return Math.round((r.time / 60 * 6 + r.bosses * 24 + (r.cleared ? 250 : 0)) * tier);
}

export function applyRun(save: SaveData, r: RunSummary, seen: Iterable<string>, defeated: Map<string, number>): RunRewards {
  const st = save.stats;
  st.runs++;
  st.kills += r.kills;
  st.bosses += r.bosses;
  st.evolutions += r.evolutions;
  st.masteries += r.masteries;
  st.timePlayed += r.time;
  st.shiniesDefeated += r.shinyKills;
  st.superEffective += r.superEff;
  st.maxLevel = Math.max(st.maxLevel, r.level);
  if (r.coop) st.coopRuns++;
  const money = Math.round((r.moneyEarned + runBonus(r)) * (r.elite ? 1.75 : 1));
  save.money += money;
  st.moneyEarned += money;
  for (const s of seen) save.seen[s] = 1;
  for (const [s, n] of defeated) save.defeated[s] = (save.defeated[s] ?? 0) + n;

  const before = save.friendship[r.lineId] ?? 0;
  const gain = friendshipGain(r);
  save.friendship[r.lineId] = Math.min(FRIENDSHIP_MAX, before + gain);

  let newBest = false;
  if (r.cleared) {
    st.clears++;
    save.cleared[r.stageId] = (save.cleared[r.stageId] ?? 0) + 1;
    const cl = new Set(save.flags.clearedLines ?? []);
    cl.add(r.lineId);
    save.flags.clearedLines = [...cl];
  }
  if (r.time > (save.bestTimes[r.stageId] ?? 0)) {
    save.bestTimes[r.stageId] = r.time;
    newBest = true;
  }
  const line = LINE[r.lineId];
  if (line?.branch && r.finalSpecies !== line.stages[0]) {
    const ev = new Set(save.flags.eeveelutions ?? []);
    ev.add(r.finalSpecies);
    save.flags.eeveelutions = [...ev];
  }
  // Shiny: clear any stage at max friendship, or clear Cerulean Cave.
  let shinyUnlocked = false;
  if (r.cleared && !save.shinyUnlocked.includes(r.lineId) && (before >= FRIENDSHIP_MAX || r.stageId === 'cerulean')) {
    save.shinyUnlocked.push(r.lineId);
    shinyUnlocked = true;
  }
  const newAchievements = checkAchievements(save, r);
  return { money, friendship: save.friendship[r.lineId] - before, newAchievements, shinyUnlocked, newBest };
}

export function checkAchievements(save: SaveData, r?: RunSummary): Achievement[] {
  const out: Achievement[] = [];
  // Loop until stable: one unlock can satisfy another (e.g. shiny -> achievement).
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (save.achievements[a.id]) continue;
      if (!a.check(save, r)) continue;
      save.achievements[a.id] = Date.now();
      grant(save, a);
      out.push(a);
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

function grant(save: SaveData, a: Achievement) {
  const rw = a.reward;
  if ('line' in rw) { if (!save.lines.includes(rw.line)) save.lines.push(rw.line); }
  else if ('tm' in rw) { if (!save.tms.includes(rw.tm) && (TM_MOVES as readonly string[]).includes(rw.tm)) save.tms.push(rw.tm); }
  else save.money += rw.money;
}


