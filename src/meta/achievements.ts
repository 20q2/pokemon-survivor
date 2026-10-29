import { STAGES } from '../data/stages.ts';
import type { SaveData } from './save.ts';

export interface RunSummary {
  stageId: string;
  lineId: string;
  finalSpecies: string;
  shiny: boolean;
  time: number;
  level: number;
  kills: number;
  bosses: number;
  cleared: boolean;
  moneyEarned: number;
  superEff: number;
  evolutions: number;
  masteries: number;
  shinyKills: number;
  coop: boolean;
  firstHit: number;       // seconds into the run of first damage (Infinity if never)
  maxedMoves: number;
  maxedItems: number;
  stabOnly: boolean;
  defeatedChansey: boolean;
  died: boolean;
  elite: boolean;
  megas: number;          // Mega Evolutions this run
  alphas: number;         // Alpha Pokémon defeated by the team this run
}

export type Reward = { line: string } | { money: number } | { tm: string };

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string; // item sprite name or 'species:<id>'
  reward: Reward;
  check: (s: SaveData, r?: RunSummary) => boolean;
}

const A = (a: Achievement) => a;
const cleared = (s: SaveData, id: string) => (s.cleared[id] ?? 0) > 0;

export const ACHIEVEMENTS: Achievement[] = [
  A({ id: 'first-run', name: 'First Steps', desc: 'Finish your first run.', icon: 'poke-ball', reward: { money: 100 }, check: (s) => s.stats.runs >= 1 }),
  A({ id: 'survive-5', name: 'Holding On', desc: 'Survive 5 minutes in a run.', icon: 'oran-berry', reward: { money: 150 }, check: (_s, r) => !!r && r.time >= 300 }),
  A({ id: 'survive-10', name: 'Mind over Matter', desc: 'Survive 10 minutes in a run.', icon: 'species:abra', reward: { line: 'abra' }, check: (_s, r) => !!r && r.time >= 600 }),
  A({ id: 'survive-15', name: 'Endurance', desc: 'Survive 15 minutes in a run.', icon: 'sitrus-berry', reward: { money: 500 }, check: (_s, r) => !!r && r.time >= 900 }),
  A({ id: 'level-20', name: 'Bruiser', desc: 'Reach level 20 in a single run.', icon: 'species:machop', reward: { line: 'machop' }, check: (_s, r) => !!r && r.level >= 20 }),
  A({ id: 'level-40', name: 'Veteran Trainer', desc: 'Reach level 40 in a single run.', icon: 'rare-candy', reward: { money: 400 }, check: (_s, r) => !!r && r.level >= 40 }),
  A({ id: 'level-60', name: 'Elite Trainer', desc: 'Reach level 60 in a single run.', icon: 'rare-candy', reward: { money: 1000 }, check: (_s, r) => !!r && r.level >= 60 }),
  A({ id: 'kills-1k-life', name: 'Spooky Encounter', desc: 'Defeat 1,000 wild Pokémon in total.', icon: 'species:gastly', reward: { line: 'gastly' }, check: (s) => s.stats.kills >= 1000 }),
  A({ id: 'kills-1k-run', name: 'Horde Breaker', desc: 'Defeat 1,000 wild Pokémon in one run.', icon: 'tm-normal', reward: { tm: 'swift' }, check: (_s, r) => !!r && r.kills >= 1000 }),
  A({ id: 'kills-5k-run', name: 'Unstoppable', desc: 'Defeat 5,000 wild Pokémon in one run.', icon: 'tm-dragon', reward: { money: 1200 }, check: (_s, r) => !!r && r.kills >= 5000 }),
  A({ id: 'kills-25k-life', name: 'Legendary Trainer', desc: 'Defeat 25,000 wild Pokémon in total.', icon: 'master-ball', reward: { money: 2500 }, check: (s) => s.stats.kills >= 25000 }),
  A({ id: 'evolve-5', name: 'Evolution Enthusiast', desc: 'Evolve 5 times in total.', icon: 'species:eevee', reward: { line: 'eevee' }, check: (s) => s.stats.evolutions >= 5 }),
  A({ id: 'eevee-3', name: 'Eeveelution Expert', desc: 'Evolve Eevee into 3 different forms.', icon: 'species:sylveon', reward: { money: 1000 }, check: (s) => (s.flags?.eeveelutions?.length ?? 0) >= 3 }),
  A({ id: 'mastery-1', name: 'Move Tutor', desc: 'Master a move (max level + matching held item, then open a treasure).', icon: 'tm-fire', reward: { money: 300 }, check: (s) => s.stats.masteries >= 1 }),
  A({ id: 'mastery-3', name: 'Empath', desc: 'Master 3 moves in total.', icon: 'species:ralts', reward: { line: 'ralts' }, check: (s) => s.stats.masteries >= 3 }),
  A({ id: 'mastery-2run', name: 'Double Mastery', desc: 'Master 2 moves in a single run.', icon: 'tm-psychic', reward: { tm: 'calm-mind' }, check: (_s, r) => !!r && r.masteries >= 2 }),
  A({ id: 'mega-1', name: 'Bond Beyond Evolution', desc: 'Mega Evolve during a run.', icon: 'key-stone', reward: { money: 400 }, check: (_s, r) => !!r && r.megas >= 1 }),
  A({ id: 'mega-4', name: 'Mega Marathon', desc: 'Mega Evolve 4 times in a single run.', icon: 'mega-ring', reward: { money: 900 }, check: (_s, r) => !!r && r.megas >= 4 }),
  A({ id: 'alpha-1', name: 'Alpha Challenger', desc: 'Defeat an Alpha Pokémon.', icon: 'big-nugget', reward: { money: 300 }, check: (_s, r) => !!r && r.alphas >= 1 }),
  A({ id: 'alpha-3', name: 'Alpha Hunter', desc: 'Defeat 3 Alpha Pokémon in a single run.', icon: 'comet-shard', reward: { tm: 'hyper-voice' }, check: (_s, r) => !!r && r.alphas >= 3 }),
  A({ id: 'bosses-5', name: 'Boss Rush', desc: 'Defeat 5 bosses in total.', icon: 'species:torchic', reward: { line: 'torchic' }, check: (s) => s.stats.bosses >= 5 }),
  A({ id: 'super-500', name: 'It’s Super Effective!', desc: 'Land 500 super-effective hits in one run.', icon: 'expert-belt', reward: { tm: 'focus-energy' }, check: (_s, r) => !!r && r.superEff >= 500 }),
  A({ id: 'full-moves', name: 'Full Moveset', desc: 'Have 4 moves at max level (or mastered) in one run.', icon: 'pp-max', reward: { tm: 'swords-dance' }, check: (_s, r) => !!r && r.maxedMoves >= 4 }),
  A({ id: 'full-bag', name: 'Packed Bag', desc: 'Have 4 held items at max level in one run.', icon: 'big-nugget', reward: { tm: 'agility' }, check: (_s, r) => !!r && r.maxedItems >= 4 }),
  A({ id: 'untouchable', name: 'Untouchable', desc: 'Go 3 minutes without taking damage.', icon: 'x-speed', reward: { tm: 'double-team' }, check: (_s, r) => !!r && r.firstHit >= 180 }),
  A({ id: 'shiny-defeat', name: 'Shiny Hunter', desc: 'Defeat a wild shiny Pokémon.', icon: 'shiny-charm', reward: { money: 500 }, check: (s) => s.stats.shiniesDefeated >= 1 }),
  A({ id: 'chansey', name: 'Lucky Find', desc: 'Defeat a treasure-carrying Chansey.', icon: 'species:chansey', reward: { tm: 'pay-day' }, check: (_s, r) => !!r && r.defeatedChansey }),
  A({ id: 'stab-clear', name: 'Purist', desc: 'Clear a stage using only moves that match your types.', icon: 'tm-ghost', reward: { money: 1500 }, check: (_s, r) => !!r && r.cleared && r.stabOnly }),
  A({ id: 'coop-run', name: 'Better Together', desc: 'Survive 5 minutes in an online co-op run.', icon: 'soothe-bell', reward: { tm: 'rest' }, check: (_s, r) => !!r && r.coop && r.time >= 300 }),
  A({ id: 'coop-clear', name: 'Dream Team', desc: 'Clear a stage in online co-op.', icon: 'ultra-ball', reward: { money: 2000 }, check: (_s, r) => !!r && r.coop && r.cleared }),
  A({ id: 'shop-10', name: 'Regular Customer', desc: 'Buy 10 upgrades at the Poké Mart.', icon: 'amulet-coin', reward: { tm: 'reflect' }, check: (s) => Object.values(s.shop).reduce((a, b) => a + b, 0) >= 10 }),
  A({ id: 'shop-40', name: 'Big Spender', desc: 'Buy 40 upgrades at the Poké Mart.', icon: 'nugget', reward: { tm: 'iron-defense' }, check: (s) => Object.values(s.shop).reduce((a, b) => a + b, 0) >= 40 }),
  A({ id: 'dex-50', name: 'Pokédex Rookie', desc: 'Encounter 50 different species.', icon: 'great-ball', reward: { tm: 'aerial-ace' }, check: (s) => Object.keys(s.seen).length >= 50 }),
  A({ id: 'dex-100', name: 'Pokédex Pro', desc: 'Encounter 100 different species.', icon: 'ultra-ball', reward: { tm: 'shadow-ball' }, check: (s) => Object.keys(s.seen).length >= 100 }),
  A({ id: 'shiny-unlock', name: 'Best Friends', desc: 'Unlock a Shiny form.', icon: 'shiny-charm', reward: { tm: 'rock-slide' }, check: (s) => s.shinyUnlocked.length >= 1 }),
  A({ id: 'friend-max', name: 'Inseparable', desc: 'Max out friendship with any Pokémon.', icon: 'soothe-bell', reward: { tm: 'thunder-wave' }, check: (s) => Object.values(s.friendship).some((v) => v >= 1000) }),
  A({ id: 'money-10k', name: 'Pay Day', desc: 'Earn ₽10,000 in total.', icon: 'big-nugget', reward: { money: 1000 }, check: (s) => s.stats.moneyEarned >= 10000 }),
  // stage clears
  A({ id: 'clear-viridian', name: 'Forest Ranger', desc: 'Clear Viridian Forest.', icon: 'species:treecko', reward: { line: 'treecko' }, check: (s) => cleared(s, 'viridian') }),
  A({ id: 'clear-mtmoon', name: 'Moon Walker', desc: 'Clear Mt. Moon.', icon: 'species:mudkip', reward: { line: 'mudkip' }, check: (s) => cleared(s, 'mtmoon') }),
  A({ id: 'clear-seafoam', name: 'Dragon’s Den', desc: 'Clear Seafoam Islands.', icon: 'species:dratini', reward: { line: 'dratini' }, check: (s) => cleared(s, 'seafoam') }),
  A({ id: 'clear-powerplant', name: 'Rock Solid', desc: 'Clear the Power Plant.', icon: 'species:larvitar', reward: { line: 'larvitar' }, check: (s) => cleared(s, 'powerplant') }),
  A({ id: 'clear-tower', name: 'Ghostbuster', desc: 'Clear Pokémon Tower.', icon: 'spell-tag', reward: { money: 2500 }, check: (s) => cleared(s, 'tower') }),
  A({ id: 'clear-cinnabar', name: 'Fire Walker', desc: 'Clear Cinnabar Volcano.', icon: 'charcoal', reward: { money: 3000 }, check: (s) => cleared(s, 'cinnabar') }),
  A({ id: 'clear-cerulean', name: 'Champion', desc: 'Clear Cerulean Cave and defeat Mewtwo.', icon: 'master-ball', reward: { money: 5000 }, check: (s) => cleared(s, 'cerulean') }),
  A({ id: 'elite-clear', name: 'Elite Four Material', desc: 'Clear any route in Elite mode.', icon: 'ultra-ball', reward: { money: 3000 }, check: (_s, r) => !!r && r.cleared && r.elite }),
  A({ id: 'clear-all-lines', name: 'Gotta Clear ’Em All', desc: 'Clear a stage with every Pokémon line.', icon: 'species:mewtwo', reward: { money: 10000 }, check: (s) => (s.flags?.clearedLines?.length ?? 0) >= 14 }),
];

export const ACH_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Stages unlock in order by clearing the previous one. */
export function stageUnlocked(s: SaveData, stageId: string): boolean {
  const i = STAGES.findIndex((st) => st.id === stageId);
  return i <= 0 || cleared(s, STAGES[i - 1].id);
}

export function rewardText(r: Reward): string {
  if ('line' in r) return `Unlocks ${r.line[0].toUpperCase() + r.line.slice(1)}`;
  if ('tm' in r) return `Free TM: ${r.tm.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')}`;
  return `₽${r.money.toLocaleString()}`;
}
