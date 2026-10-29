import type { StatusKind } from './moves.ts';

/** What every status does, in one line, plus the badge drawn over afflicted foes. */
export interface StatusInfo { name: string; abbr: string; color: string; desc: string }

export const STATUS_INFO: Partial<Record<StatusKind, StatusInfo>> = {
  burn: { name: 'Burn', abbr: 'BRN', color: '#f0803c', desc: 'Takes fire damage over time. When a burning foe faints, the fire spreads to foes nearby.' },
  poison: { name: 'Poison', abbr: 'PSN', color: '#a040a0', desc: 'Takes poison damage over time. Stacks up to 5 times.' },
  toxic: { name: 'Badly Poisoned', abbr: 'TOX', color: '#6a1f8a', desc: 'Poison whose damage grows with every tick.' },
  paralyze: { name: 'Paralysis', abbr: 'PAR', color: '#f8d030', desc: 'Locks up in random stutters. Lightning chains jump 50% farther through paralyzed foes.' },
  freeze: { name: 'Freeze', abbr: 'FRZ', color: '#98d8d8', desc: 'Frozen solid. The next hit shatters the ice for +50% damage.' },
  chill: { name: 'Chill', abbr: 'CHL', color: '#bfe9ff', desc: 'Each Chill slows by 15%. Three Chills freeze the foe.' },
  slow: { name: 'Slow', abbr: 'SLW', color: '#6890f0', desc: 'Moves at half speed.' },
  sleep: { name: 'Sleep', abbr: 'SLP', color: '#8c88a8', desc: 'Stands still until hit. The waking hit deals double damage.' },
  confuse: { name: 'Confusion', abbr: 'CNF', color: '#f8a0c8', desc: 'Stumbles around and hurts other foes it bumps into.' },
  flinch: { name: 'Flinch', abbr: 'FLN', color: '#e8e8e8', desc: 'Interrupted: attacks being wound up are cancelled or delayed.' },
  charm: { name: 'Infatuation', abbr: 'CHM', color: '#ff7fbf', desc: 'Stops attacking you, walks away and picks fights with other foes.' },
  vuln: { name: 'Vulnerable', abbr: 'VUL', color: '#ff5050', desc: 'Guard broken: takes 25% more damage from everything.' },
  weaken: { name: 'Weakened', abbr: 'WKN', color: '#a08060', desc: 'Blinded: deals 30% less damage.' },
  root: { name: 'Rooted', abbr: 'RT', color: '#78c850', desc: 'Pinned in place. Can still shoot.' },
  wet: { name: 'Wet', abbr: 'WET', color: '#4fa3ff', desc: 'Soaked: Electric hits deal +50%, Ice hits freeze it instantly, Fire hits burst into steam.' },
  seed: { name: 'Leech Seed', abbr: 'SED', color: '#4caf50', desc: 'Drained every second to heal whoever planted it. Jumps to a neighbour when the host faints.' },
  curse: { name: 'Curse', abbr: 'CRS', color: '#5a3a7a', desc: 'Loses a slice of its max HP every second until it faints.' },
};

/** Badge order over a foe (most important first; only the first two are drawn). */
export const STATUS_ORDER: StatusKind[] = [
  'freeze', 'sleep', 'charm', 'root', 'paralyze', 'confuse', 'curse', 'toxic', 'burn', 'poison', 'seed', 'vuln', 'weaken', 'chill', 'wet', 'slow', 'flinch',
];
