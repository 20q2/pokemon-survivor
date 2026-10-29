import type { PType } from './types.ts';

export type EnemyRole = 'chaser' | 'fast' | 'tank' | 'ranged' | 'bomber' | 'treasure';
/**
 * Boss attacks. The first six are the classic bullet/charge patterns; the rest are raid-style
 * telegraphed ground attacks (see game/hazards.ts): quake = get away from the boss, donut = get
 * close to it, meteor = circles rain on everyone, beam/cone = aimed at a partner, cross = a plus/X.
 */
export type BossPattern = 'charge' | 'radial' | 'aimed' | 'summon' | 'slam' | 'spiral' | 'quake' | 'donut' | 'meteor' | 'beam' | 'cone' | 'cross';

export interface SpawnEntry { species: string; w: number }
/**
 * A set piece inside a wave; `at` is seconds into the minute. A swarm (a line of crossers of the
 * stage's `swarm` species) fires once, then `repeat.count` more times, `repeat.every` seconds apart; a ring is a wall of the
 * wave's dominant species that closes in slowly and gives up after `duration` seconds.
 */
export type WaveEvent =
  | { kind: 'swarm'; at: number; repeat?: { count: number; every: number } }
  | { kind: 'ring'; at: number; duration: number };
/** One minute of a stage: what spawns, how many regulars to keep alive, and how sturdy they are. */
export interface WaveDef {
  species: SpawnEntry[];
  /** Quota of live regular enemies; the spawner backfills to this instantly. */
  min: number;
  /** Seconds between quota checks. */
  interval: number;
  /** Enemy HP multiplier for this minute (stepwise, replaces a smooth curve). */
  hpTier: number;
  /** Wave boss: spawns 2s into the minute. */
  elite?: string;
  /** Species shown on the minute banner (defaults to the first newcomer). */
  headline?: string;
  text?: string;
  events?: WaveEvent[];
}
export interface BossDef { species: string; at: number; patterns: BossPattern[]; final?: boolean; minions?: string[] }

export interface StageDef {
  id: string;
  name: string;
  subtitle: string;
  types: PType[];
  music: string;
  difficulty: number;
  /** Minutes 0..15; after minute 15 the last entry keeps applying. */
  waves: WaveDef[];
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

/** Quota shape shared by every stage (after Vampire Survivors' Mad Forest); minutes 5 and 9 breathe. */
export const WAVE_MIN = [15, 35, 60, 50, 45, 10, 110, 150, 60, 10, 260, 70, 220, 190, 280, 300];
/** Absolute run times (seconds) at which a minute's events fire, soonest first; a swarm repeat is one entry each. */
export function eventTimes(minute: number, events: WaveEvent[] = []): { at: number; ev: WaveEvent }[] {
  const out: { at: number; ev: WaveEvent }[] = [];
  for (const ev of events) {
    const repeat = ev.kind === 'swarm' ? ev.repeat : undefined;
    for (let k = 0; k <= (repeat?.count ?? 0); k++) out.push({ at: minute * 60 + ev.at + k * (repeat?.every ?? 0), ev });
  }
  return out.sort((a, b) => a.at - b.at);
}
/** Set pieces shared by every stage: rings own the breathing minutes (5, 9) and 13, swarms ramp up late. */
export const WAVE_EVENTS: Record<number, WaveEvent[]> = {
  2: [{ kind: 'swarm', at: 30, repeat: { count: 1, every: 10 } }],
  4: [{ kind: 'swarm', at: 20, repeat: { count: 3, every: 5 } }],
  5: [{ kind: 'ring', at: 0, duration: 45 }],
  7: [{ kind: 'swarm', at: 10, repeat: { count: 3, every: 5 } }],
  9: [{ kind: 'ring', at: 0, duration: 45 }],
  11: [{ kind: 'swarm', at: 15, repeat: { count: 5, every: 4 } }],
  13: [{ kind: 'ring', at: 0, duration: 40 }],
  14: [{ kind: 'swarm', at: 5, repeat: { count: 6, every: 3 } }],
};
export const WAVE_INTERVAL = [1, 1, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 0.25, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
/** Roughly 1 + 0.15m + 0.025m^2 + 0.0025m^3 at whole minutes. */
export const WAVE_HP = [1, 1.18, 1.42, 1.74, 2.16, 2.69, 3.34, 4.13, 5.08, 6.2, 7.5, 9, 10.7, 12.6, 14.7, 17.1];
/** The wave in force at run time `t` (seconds). Overtime (past minute 15) keeps the last wave as-is; a later task adds an overtime sweeper. */
export function waveAt(stage: StageDef, t: number): { idx: number; wave: WaveDef } {
  const idx = Math.min(stage.waves.length - 1, Math.floor(t / 60));
  return { idx, wave: stage.waves[idx] };
}

/** Minutes that end with a wave boss (about one chest per minute); a second comes from minute 10. */
const ELITE_MINUTES = new Set([1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);

/**
 * Builds the 16 waves from one line of species per minute plus optional flavour text per minute.
 * Spawn weights default to 3 for the first species, 2 for the second and 1 for the rest; write
 * `name:n` to override. Elites rotate through `elites`.
 */
function waves(elites: string[], minutes: string[], text: Record<number, string> = {}): WaveDef[] {
  let ei = 0;
  return minutes.map((line, m) => ({
    species: line.split(' ').map((tok, i) => {
      const [species, w] = tok.split(':');
      return { species, w: w ? Number(w) : i === 0 ? 3 : i === 1 ? 2 : 1 };
    }),
    min: WAVE_MIN[m], interval: WAVE_INTERVAL[m], hpTier: WAVE_HP[m],
    ...(ELITE_MINUTES.has(m) ? { elite: elites[ei++ % elites.length] } : {}),
    ...(text[m] ? { text: text[m] } : {}),
    ...(WAVE_EVENTS[m] ? { events: WAVE_EVENTS[m] } : {}),
  }));
}

export const STAGES: StageDef[] = [
  {
    id: 'viridian', name: 'Viridian Forest', subtitle: 'A sun-dappled maze of trees and Bug Pokémon.',
    types: ['bug', 'grass', 'normal', 'flying'], music: 'forest', difficulty: 0.9,
    waves: waves(['pidgeotto', 'metapod', 'parasect'], [
      'caterpie weedle',
      'caterpie weedle pidgey',
      'weedle pidgey rattata',
      'pidgey rattata metapod',
      'rattata metapod kakuna oddish',
      'metapod kakuna spearow',
      'spearow paras bellsprout kakuna',
      'paras bellsprout spearow oddish',
      'bellsprout spearow pidgeotto kakuna',
      'spearow kakuna metapod',
      'paras bellsprout pidgeotto rattata',
      'bellsprout pidgeotto parasect kakuna',
      'pidgeotto parasect spearow paras',
      'parasect spearow kakuna bellsprout oddish',
      'pidgeotto parasect bellsprout paras metapod',
      'pidgeotto parasect spearow kakuna bellsprout paras'
    ], {3: 'Metapod wall closing in!', 6: 'Spearow flock in!', 10: 'The forest wakes up!', 15: 'Everything in the forest is coming!'}),
    elites: ['pidgeotto', 'metapod', 'parasect'], swarm: 'spearow',
    bosses: [
      { species: 'beedrill', at: 180, patterns: ['charge', 'cone', 'aimed'], minions: ['weedle'] },
      { species: 'butterfree', at: 360, patterns: ['radial', 'donut', 'spiral'], minions: ['caterpie'] },
      { species: 'parasect', at: 540, patterns: ['meteor', 'summon', 'quake'], minions: ['paras'] },
      { species: 'pidgeotto', at: 720, patterns: ['charge', 'cone', 'beam', 'radial'], minions: ['pidgey'] },
      { species: 'scyther', at: 900, patterns: ['charge', 'cross', 'aimed', 'meteor', 'radial'], final: true },
    ],
  },
  {
    id: 'mtmoon', name: 'Mt. Moon', subtitle: 'Moonlit caverns echoing with Zubat wings.',
    types: ['rock', 'ground', 'poison', 'fairy'], music: 'cave', difficulty: 1.25, darkness: 0.35,
    waves: waves(['golbat', 'graveler', 'sandslash'], [
      'zubat diglett',
      'zubat diglett sandshrew',
      'diglett sandshrew paras',
      'sandshrew paras geodude zubat',
      'paras geodude ekans clefairy',
      'geodude ekans zubat',
      'ekans clefairy sandshrew golbat',
      'golbat geodude clefairy paras',
      'golbat graveler ekans sandshrew',
      'graveler zubat paras',
      'golbat graveler clefairy ekans',
      'graveler clefairy sandslash geodude',
      'golbat sandslash ekans paras',
      'sandslash clefairy zubat graveler',
      'golbat graveler sandslash ekans sandshrew',
      'golbat graveler sandslash clefairy ekans zubat'
    ], {1: 'Diglett pop up everywhere!', 6: 'Golbat swoop in!', 10: 'The cavern shakes!', 15: 'The whole mountain is awake!'}),
    elites: ['golbat', 'graveler', 'sandslash'], swarm: 'zubat',
    bosses: [
      { species: 'onix', at: 180, patterns: ['charge', 'slam', 'quake'], minions: ['geodude'] },
      { species: 'sandslash', at: 360, patterns: ['charge', 'cross', 'meteor'], minions: ['sandshrew'] },
      { species: 'clefable', at: 540, patterns: ['radial', 'donut', 'summon', 'meteor'], minions: ['clefairy'] },
      { species: 'golbat', at: 720, patterns: ['spiral', 'cone', 'beam', 'summon'], minions: ['zubat'] },
      { species: 'golem', at: 900, patterns: ['slam', 'quake', 'meteor', 'charge', 'donut'], final: true },
    ],
  },
  {
    id: 'seafoam', name: 'Seafoam Islands', subtitle: 'Frozen tide caves where the ice never melts.',
    types: ['water', 'ice'], music: 'ice', difficulty: 1.5,
    waves: waves(['dewgong', 'jynx', 'slowpoke'], [
      'seel shellder',
      'seel shellder krabby',
      'shellder krabby tentacool',
      'krabby tentacool spheal',
      'tentacool spheal horsea psyduck',
      'spheal slowpoke seel',
      'slowpoke krabby psyduck snorunt',
      'krabby snorunt horsea tentacool',
      'snorunt spheal dewgong shellder',
      'dewgong seel slowpoke',
      'krabby tentacool dewgong jynx',
      'tentacool jynx spheal snorunt',
      'jynx dewgong krabby psyduck',
      'spheal snorunt tentacool horsea jynx',
      'dewgong jynx krabby slowpoke snorunt',
      'dewgong jynx krabby spheal snorunt tentacool'
    ], {2: 'Krabby claw their way in!', 6: 'Slowpoke drift into the cave!', 10: 'The tide rolls in!', 15: 'A frozen wave crashes down!'}),
    elites: ['dewgong', 'jynx', 'slowpoke'], swarm: 'tentacool',
    bosses: [
      { species: 'cloyster', at: 180, patterns: ['radial', 'beam', 'spiral'], minions: ['shellder'] },
      { species: 'dewgong', at: 360, patterns: ['charge', 'cone', 'donut'], minions: ['seel'] },
      { species: 'jynx', at: 540, patterns: ['aimed', 'meteor', 'cone', 'spiral'], minions: ['snorunt'] },
      { species: 'lapras', at: 720, patterns: ['beam', 'slam', 'donut', 'aimed'], minions: ['seel'] },
      { species: 'articuno', at: 900, patterns: ['spiral', 'meteor', 'beam', 'donut', 'radial'], final: true },
    ],
  },
  {
    id: 'powerplant', name: 'Power Plant', subtitle: 'Humming generators crackle with stray voltage.',
    types: ['electric', 'steel', 'poison'], music: 'factory', difficulty: 1.8,
    waves: waves(['magneton', 'electrode', 'grimer'], [
      'electrike grimer',
      'electrike grimer mareep',
      'grimer mareep elekid',
      'mareep elekid electrike',
      'elekid electrike magnemite koffing',
      'magnemite mareep grimer',
      'mareep voltorb koffing electrike',
      'koffing voltorb elekid grimer',
      'electrike magnemite electrode mareep',
      'electrode grimer elekid',
      'magneton elekid koffing mareep',
      'electrode magneton electrike grimer',
      'elekid koffing mareep voltorb',
      'magneton electrode grimer electrike magnemite',
      'elekid koffing mareep magneton voltorb',
      'electrode magneton elekid koffing mareep electrike'
    ], {4: 'Magnemite hum into range!', 8: 'Electrode charge up!', 10: 'The generators overload!', 15: 'Total blackout incoming!'}),
    elites: ['magneton', 'electrode', 'grimer'], swarm: 'voltorb',
    bosses: [
      { species: 'electabuzz', at: 180, patterns: ['charge', 'quake', 'radial'], minions: ['elekid'] },
      { species: 'electrode', at: 360, patterns: ['charge', 'quake', 'summon'], minions: ['voltorb'] },
      { species: 'magneton', at: 540, patterns: ['spiral', 'beam', 'cross', 'summon'], minions: ['magnemite'] },
      { species: 'raichu', at: 720, patterns: ['charge', 'meteor', 'donut', 'aimed'], minions: ['electrike'] },
      { species: 'zapdos', at: 900, patterns: ['radial', 'meteor', 'cross', 'charge', 'beam'], final: true },
    ],
  },
  {
    id: 'tower', name: 'Pokémon Tower', subtitle: 'Restless spirits drift between the graves.',
    types: ['ghost', 'poison', 'psychic', 'dark'], music: 'tower', difficulty: 2.2, darkness: 0.5,
    waves: waves(['banette', 'dusclops', 'hypno'], [
      'shuppet zubat',
      'shuppet zubat duskull',
      'zubat duskull cubone',
      'duskull cubone murkrow',
      'cubone murkrow drowzee misdreavus',
      'murkrow sableye shuppet',
      'sableye shuppet drowzee houndour',
      'houndour misdreavus cubone zubat',
      'misdreavus murkrow banette duskull',
      'banette sableye zubat',
      'houndour dusclops murkrow shuppet',
      'dusclops misdreavus sableye cubone',
      'banette houndour drowzee murkrow',
      'dusclops banette misdreavus sableye zubat',
      'houndour murkrow hypno drowzee shuppet',
      'banette dusclops houndour sableye murkrow misdreavus'
    ], {1: 'Duskull drift through the walls!', 6: 'Houndour howl in the dark!', 10: 'The graves open!', 15: 'Every spirit is rising!'}),
    elites: ['banette', 'dusclops', 'hypno'], swarm: 'murkrow',
    bosses: [
      { species: 'hypno', at: 180, patterns: ['spiral', 'donut', 'summon'], minions: ['drowzee'] },
      { species: 'banette', at: 360, patterns: ['aimed', 'cone', 'summon'], minions: ['shuppet'] },
      { species: 'marowak', at: 540, patterns: ['charge', 'slam', 'cross', 'aimed'], minions: ['cubone'] },
      { species: 'dusclops', at: 720, patterns: ['quake', 'meteor', 'summon', 'radial'], minions: ['duskull'] },
      { species: 'gengar', at: 900, patterns: ['spiral', 'donut', 'meteor', 'cross', 'summon'], final: true, minions: ['shuppet'] },
    ],
  },
  {
    id: 'cinnabar', name: 'Cinnabar Volcano', subtitle: 'Magma flows and fierce fighters.',
    types: ['fire', 'fighting', 'dragon', 'rock'], music: 'volcano', difficulty: 2.7,
    waves: waves(['magmar', 'hitmonlee', 'shelgon'], [
      'growlithe mankey',
      'growlithe mankey ponyta',
      'mankey ponyta numel',
      'ponyta numel bagon',
      'numel bagon vulpix slugma',
      'bagon rhyhorn growlithe',
      'rhyhorn mankey slugma primeape',
      'primeape ponyta vulpix numel',
      'ponyta bagon hitmonlee growlithe',
      'hitmonlee rhyhorn mankey',
      'primeape magmar rhyhorn ponyta',
      'magmar shelgon slugma growlithe',
      'shelgon hitmonlee primeape numel',
      'magmar ponyta vulpix bagon rhyhorn',
      'hitmonlee shelgon primeape mankey slugma',
      'magmar shelgon hitmonlee primeape ponyta rhyhorn'
    ], {2: 'Ponyta stampede!', 6: 'Rhyhorn charge in!', 10: 'The volcano erupts!', 15: 'The mountain is on fire!'}),
    elites: ['magmar', 'hitmonlee', 'shelgon'], swarm: 'ponyta',
    bosses: [
      { species: 'hitmonlee', at: 180, patterns: ['charge', 'cross', 'aimed'], minions: ['mankey'] },
      { species: 'arcanine', at: 360, patterns: ['charge', 'cone', 'aimed'], minions: ['growlithe'] },
      { species: 'magmar', at: 540, patterns: ['cone', 'meteor', 'radial'], minions: ['slugma'] },
      { species: 'machamp', at: 720, patterns: ['slam', 'cross', 'quake', 'charge'], minions: ['mankey'] },
      { species: 'moltres', at: 900, patterns: ['spiral', 'meteor', 'cone', 'donut', 'radial'], final: true },
    ],
  },
  {
    id: 'cerulean', name: 'Cerulean Cave', subtitle: 'Where the strongest wild Pokémon gather.',
    types: ['psychic', 'normal', 'dragon'], music: 'finale', difficulty: 3.3, darkness: 0.4,
    waves: waves(['kangaskhan', 'wobbuffet', 'arcanine'], [
      'golbat raticate',
      'golbat raticate graveler',
      'raticate graveler parasect',
      'graveler parasect ditto',
      'parasect ditto sandslash electrode',
      'sandslash primeape golbat',
      'primeape dewgong wobbuffet raticate',
      'dewgong ditto jynx graveler',
      'wobbuffet electrode magmar parasect',
      'magmar sandslash ditto',
      'electabuzz hypno primeape dewgong',
      'hypno shelgon wobbuffet golbat',
      'banette electabuzz jynx sandslash',
      'shelgon banette magmar electrode ditto',
      'jynx hypno electabuzz primeape graveler',
      'magmar electabuzz jynx hypno shelgon banette'
    ], {3: 'Ditto are everywhere!', 7: 'The cave grows restless!', 10: 'The strongest have arrived!', 15: 'Nothing holds back now!'}),
    elites: ['kangaskhan', 'wobbuffet', 'arcanine'], swarm: 'golbat',
    bosses: [
      { species: 'kangaskhan', at: 180, patterns: ['charge', 'slam', 'quake'], minions: ['raticate'] },
      { species: 'alakazam', at: 360, patterns: ['spiral', 'donut', 'beam', 'summon'], minions: ['ditto'] },
      { species: 'dragonite', at: 540, patterns: ['spiral', 'charge', 'beam', 'meteor'], minions: ['bagon'] },
      { species: 'tyranitar', at: 720, patterns: ['slam', 'quake', 'meteor', 'cone'], minions: ['graveler'] },
      { species: 'mewtwo', at: 900, patterns: ['spiral', 'cross', 'meteor', 'donut', 'beam', 'radial', 'summon'], final: true, minions: ['ditto'] },
    ],
  },
];

export const STAGE: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));

export const RUN_LENGTH = 900; // seconds until the final boss (a boss every 3 minutes before it)
