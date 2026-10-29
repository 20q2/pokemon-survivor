import type { PType } from './types.ts';

export type EnemyRole = 'chaser' | 'fast' | 'tank' | 'ranged' | 'bomber' | 'treasure';
export type BossPattern = 'charge' | 'radial' | 'aimed' | 'summon' | 'slam' | 'spiral';

export interface SpawnEntry { species: string; w: number }
export interface BossDef { species: string; at: number; patterns: BossPattern[]; final?: boolean; minions?: string[] }
export type Decor = 'tree' | 'bush' | 'flower' | 'tuft' | 'rock' | 'crystal' | 'puddle' | 'ice' | 'pylon' | 'grave' | 'candle' | 'lava' | 'bones' | 'stalagmite' | 'mushroom' | 'shell';

export interface StageDef {
  id: string;
  name: string;
  subtitle: string;
  types: PType[];
  music: string;
  ground: [string, string, string]; // base, mottling, accent
  decor: Decor[];
  difficulty: number;
  pools: { early: SpawnEntry[]; mid: SpawnEntry[]; late: SpawnEntry[] };
  elites: string[];
  swarm: string;
  bosses: BossDef[];
  darkness?: number; // 0..1 vignette strength
}

/** Species roles (default 'chaser'). */
export const ENEMY_ROLE: Record<string, EnemyRole> = {
  rattata: 'fast', spearow: 'fast', diglett: 'fast', ponyta: 'fast', electrike: 'fast', zubat: 'fast',
  murkrow: 'fast', raticate: 'fast', primeape: 'fast', elekid: 'fast', houndour: 'fast', mankey: 'fast',
  metapod: 'tank', kakuna: 'tank', geodude: 'tank', graveler: 'tank', shellder: 'tank', slowpoke: 'tank',
  rhyhorn: 'tank', duskull: 'tank', dusclops: 'tank', wobbuffet: 'tank', grimer: 'tank', shelgon: 'tank', spheal: 'tank',
  magnemite: 'ranged', magneton: 'ranged', horsea: 'ranged', oddish: 'ranged', drowzee: 'ranged', misdreavus: 'ranged',
  jynx: 'ranged', slugma: 'ranged', vulpix: 'ranged', clefairy: 'ranged', psyduck: 'ranged', snorunt: 'ranged',
  voltorb: 'bomber', electrode: 'bomber', koffing: 'bomber',
  chansey: 'treasure', meowth: 'treasure',
};

const E = (species: string, w = 1): SpawnEntry => ({ species, w });

export const STAGES: StageDef[] = [
  {
    id: 'viridian', name: 'Viridian Forest', subtitle: 'A sun-dappled maze of trees and Bug Pokémon.',
    types: ['bug', 'grass', 'normal', 'flying'], music: 'forest', difficulty: 0.9,
    ground: ['#3f7a3a', '#357032', '#5c9a48'], decor: ['tree', 'bush', 'flower', 'tuft', 'mushroom'],
    pools: {
      early: [E('caterpie', 4), E('weedle', 4), E('pidgey', 2), E('rattata', 2)],
      mid: [E('metapod', 2), E('kakuna', 2), E('spearow', 3), E('oddish', 2), E('paras', 2), E('rattata', 2), E('bellsprout', 2)],
      late: [E('pidgeotto', 2), E('paras', 2), E('bellsprout', 3), E('spearow', 2), E('kakuna', 2), E('parasect', 1)],
    },
    elites: ['pidgeotto', 'metapod', 'parasect'], swarm: 'spearow',
    bosses: [
      { species: 'beedrill', at: 300, patterns: ['charge', 'aimed'], minions: ['weedle'] },
      { species: 'butterfree', at: 600, patterns: ['radial', 'spiral'], minions: ['caterpie'] },
      { species: 'scyther', at: 900, patterns: ['charge', 'aimed', 'radial'], final: true },
    ],
  },
  {
    id: 'mtmoon', name: 'Mt. Moon', subtitle: 'Moonlit caverns echoing with Zubat wings.',
    types: ['rock', 'ground', 'poison', 'fairy'], music: 'cave', difficulty: 1.25, darkness: 0.35,
    ground: ['#5a5068', '#4d445a', '#7a6e8a'], decor: ['rock', 'crystal', 'stalagmite', 'bones'],
    pools: {
      early: [E('zubat', 4), E('geodude', 1), E('diglett', 2), E('sandshrew', 2), E('paras', 2)],
      mid: [E('zubat', 3), E('geodude', 2), E('ekans', 3), E('clefairy', 2), E('paras', 2), E('sandshrew', 2)],
      late: [E('golbat', 3), E('graveler', 2), E('clefairy', 2), E('ekans', 2), E('sandslash', 1)],
    },
    elites: ['golbat', 'graveler', 'sandslash'], swarm: 'zubat',
    bosses: [
      { species: 'onix', at: 300, patterns: ['charge', 'slam'], minions: ['geodude'] },
      { species: 'clefable', at: 600, patterns: ['radial', 'summon'], minions: ['clefairy'] },
      { species: 'golem', at: 900, patterns: ['slam', 'charge', 'radial'], final: true },
    ],
  },
  {
    id: 'seafoam', name: 'Seafoam Islands', subtitle: 'Frozen tide caves where the ice never melts.',
    types: ['water', 'ice'], music: 'ice', difficulty: 1.5,
    ground: ['#6d9fc0', '#5f92b5', '#cfe8f5'], decor: ['ice', 'puddle', 'rock', 'shell'],
    pools: {
      early: [E('seel', 3), E('shellder', 3), E('horsea', 2), E('psyduck', 3)],
      mid: [E('krabby', 3), E('tentacool', 3), E('slowpoke', 2), E('spheal', 2), E('snorunt', 2), E('horsea', 2)],
      late: [E('dewgong', 2), E('jynx', 2), E('krabby', 2), E('spheal', 2), E('snorunt', 2), E('tentacool', 2)],
    },
    elites: ['dewgong', 'jynx', 'slowpoke'], swarm: 'tentacool',
    bosses: [
      { species: 'cloyster', at: 300, patterns: ['radial', 'spiral'], minions: ['shellder'] },
      { species: 'lapras', at: 600, patterns: ['aimed', 'slam'], minions: ['seel'] },
      { species: 'articuno', at: 900, patterns: ['spiral', 'aimed', 'radial'], final: true },
    ],
  },
  {
    id: 'powerplant', name: 'Power Plant', subtitle: 'Humming generators crackle with stray voltage.',
    types: ['electric', 'steel', 'poison'], music: 'factory', difficulty: 1.8,
    ground: ['#6b6b5a', '#5e5e4f', '#e6c84a'], decor: ['pylon', 'rock', 'puddle'],
    pools: {
      early: [E('magnemite', 3), E('voltorb', 2), E('electrike', 3), E('grimer', 2)],
      mid: [E('magnemite', 2), E('koffing', 2), E('mareep', 3), E('electrike', 2), E('elekid', 2), E('grimer', 2), E('voltorb', 1)],
      late: [E('electrode', 2), E('magneton', 2), E('elekid', 3), E('koffing', 2), E('mareep', 2)],
    },
    elites: ['magneton', 'electrode', 'grimer'], swarm: 'voltorb',
    bosses: [
      { species: 'electabuzz', at: 300, patterns: ['charge', 'radial'], minions: ['elekid'] },
      { species: 'magneton', at: 600, patterns: ['spiral', 'aimed', 'summon'], minions: ['magnemite'] },
      { species: 'zapdos', at: 900, patterns: ['radial', 'charge', 'spiral'], final: true },
    ],
  },
  {
    id: 'tower', name: 'Pokémon Tower', subtitle: 'Restless spirits drift between the graves.',
    types: ['ghost', 'poison', 'psychic', 'dark'], music: 'tower', difficulty: 2.2, darkness: 0.5,
    ground: ['#4a3d5c', '#3f3350', '#7b5f9e'], decor: ['grave', 'candle', 'bones'],
    pools: {
      early: [E('shuppet', 3), E('duskull', 2), E('zubat', 3), E('drowzee', 2)],
      mid: [E('misdreavus', 3), E('cubone', 2), E('murkrow', 3), E('sableye', 2), E('shuppet', 2), E('drowzee', 2)],
      late: [E('banette', 2), E('dusclops', 2), E('houndour', 3), E('sableye', 2), E('murkrow', 2), E('misdreavus', 2)],
    },
    elites: ['banette', 'dusclops', 'hypno'], swarm: 'murkrow',
    bosses: [
      { species: 'hypno', at: 300, patterns: ['spiral', 'summon'], minions: ['drowzee'] },
      { species: 'marowak', at: 600, patterns: ['charge', 'aimed'], minions: ['cubone'] },
      { species: 'gengar', at: 900, patterns: ['spiral', 'radial', 'summon'], final: true, minions: ['shuppet'] },
    ],
  },
  {
    id: 'cinnabar', name: 'Cinnabar Volcano', subtitle: 'Magma flows and fierce fighters.',
    types: ['fire', 'fighting', 'dragon', 'rock'], music: 'volcano', difficulty: 2.7,
    ground: ['#6e3b2a', '#5c3022', '#e0632a'], decor: ['lava', 'rock', 'bones', 'stalagmite'],
    pools: {
      early: [E('vulpix', 3), E('growlithe', 3), E('slugma', 2), E('mankey', 3)],
      mid: [E('ponyta', 3), E('numel', 2), E('bagon', 3), E('growlithe', 2), E('mankey', 2), E('rhyhorn', 2)],
      late: [E('magmar', 2), E('shelgon', 2), E('hitmonlee', 2), E('primeape', 3), E('ponyta', 2), E('rhyhorn', 2)],
    },
    elites: ['magmar', 'hitmonlee', 'shelgon'], swarm: 'ponyta',
    bosses: [
      { species: 'arcanine', at: 300, patterns: ['charge', 'aimed'], minions: ['growlithe'] },
      { species: 'machamp', at: 600, patterns: ['slam', 'charge'], minions: ['mankey'] },
      { species: 'moltres', at: 900, patterns: ['spiral', 'radial', 'aimed'], final: true },
    ],
  },
  {
    id: 'cerulean', name: 'Cerulean Cave', subtitle: 'Where the strongest wild Pokémon gather.',
    types: ['psychic', 'normal', 'dragon'], music: 'finale', difficulty: 3.3, darkness: 0.4,
    ground: ['#3b4f6e', '#33455f', '#8fb1d9'], decor: ['crystal', 'rock', 'puddle', 'stalagmite'],
    pools: {
      early: [E('golbat', 3), E('graveler', 2), E('raticate', 2), E('parasect', 2), E('ditto', 1)],
      mid: [E('sandslash', 2), E('primeape', 2), E('electrode', 2), E('dewgong', 2), E('wobbuffet', 1), E('ditto', 2)],
      late: [E('magmar', 2), E('electabuzz', 2), E('jynx', 2), E('hypno', 2), E('shelgon', 2), E('banette', 2)],
    },
    elites: ['kangaskhan', 'wobbuffet', 'arcanine'], swarm: 'golbat',
    bosses: [
      { species: 'kangaskhan', at: 300, patterns: ['charge', 'slam'], minions: ['raticate'] },
      { species: 'dragonite', at: 600, patterns: ['spiral', 'charge', 'aimed'], minions: ['bagon'] },
      { species: 'mewtwo', at: 900, patterns: ['spiral', 'radial', 'aimed', 'summon'], final: true, minions: ['ditto'] },
    ],
  },
];

export const STAGE: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));

export const RUN_LENGTH = 900; // seconds until the final boss
