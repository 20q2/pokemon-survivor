import type { PType } from './types.ts';

/** [hp, atk, def, spa, spd, spe] — real base stats. */
export type BaseStats = [number, number, number, number, number, number];

export interface Species {
  id: string;
  dex: number;
  name: string;
  types: PType[];
  base: BaseStats;
  /** PMD SpriteCollab form folder for regional forms (e.g. '0001' = Alolan Raichu). */
  form?: string;
}

const S = (id: string, dex: number, name: string, types: PType[], base: BaseStats, form?: string): Species => ({ id, dex, name, types, base, form });

export const SPECIES_LIST: Species[] = [
  // ── Playable lines ──
  S('bulbasaur', 1, 'Bulbasaur', ['grass', 'poison'], [45, 49, 49, 65, 65, 45]),
  S('ivysaur', 2, 'Ivysaur', ['grass', 'poison'], [60, 62, 63, 80, 80, 60]),
  S('venusaur', 3, 'Venusaur', ['grass', 'poison'], [80, 82, 83, 100, 100, 80]),
  S('charmander', 4, 'Charmander', ['fire'], [39, 52, 43, 60, 50, 65]),
  S('charmeleon', 5, 'Charmeleon', ['fire'], [58, 64, 58, 80, 65, 80]),
  S('charizard', 6, 'Charizard', ['fire', 'flying'], [78, 84, 78, 109, 85, 100]),
  S('squirtle', 7, 'Squirtle', ['water'], [44, 48, 65, 50, 64, 43]),
  S('wartortle', 8, 'Wartortle', ['water'], [59, 63, 80, 65, 80, 58]),
  S('blastoise', 9, 'Blastoise', ['water'], [79, 83, 100, 85, 105, 78]),
  S('pichu', 172, 'Pichu', ['electric'], [20, 40, 15, 35, 35, 60]),
  S('pikachu', 25, 'Pikachu', ['electric'], [35, 55, 40, 50, 50, 90]),
  S('raichu', 26, 'Raichu', ['electric'], [60, 90, 55, 90, 80, 110]),
  S('raichu-alola', 26, 'Alolan Raichu', ['electric', 'psychic'], [60, 85, 50, 95, 85, 110], '0001'),
  S('gastly', 92, 'Gastly', ['ghost', 'poison'], [30, 35, 30, 100, 35, 80]),
  S('haunter', 93, 'Haunter', ['ghost', 'poison'], [45, 50, 45, 115, 55, 95]),
  S('gengar', 94, 'Gengar', ['ghost', 'poison'], [60, 65, 60, 130, 75, 110]),
  S('machop', 66, 'Machop', ['fighting'], [70, 80, 50, 35, 35, 35]),
  S('machoke', 67, 'Machoke', ['fighting'], [80, 100, 70, 50, 60, 45]),
  S('machamp', 68, 'Machamp', ['fighting'], [90, 130, 80, 65, 85, 55]),
  S('abra', 63, 'Abra', ['psychic'], [25, 20, 15, 105, 55, 90]),
  S('kadabra', 64, 'Kadabra', ['psychic'], [40, 35, 30, 120, 70, 105]),
  S('alakazam', 65, 'Alakazam', ['psychic'], [55, 50, 45, 135, 95, 120]),
  S('dratini', 147, 'Dratini', ['dragon'], [41, 64, 45, 50, 50, 50]),
  S('dragonair', 148, 'Dragonair', ['dragon'], [61, 84, 65, 70, 70, 70]),
  S('dragonite', 149, 'Dragonite', ['dragon', 'flying'], [91, 134, 95, 100, 100, 80]),
  S('eevee', 133, 'Eevee', ['normal'], [55, 55, 50, 45, 65, 55]),
  S('vaporeon', 134, 'Vaporeon', ['water'], [130, 65, 60, 110, 95, 65]),
  S('jolteon', 135, 'Jolteon', ['electric'], [65, 65, 60, 110, 95, 130]),
  S('flareon', 136, 'Flareon', ['fire'], [65, 130, 60, 95, 110, 65]),
  S('espeon', 196, 'Espeon', ['psychic'], [65, 65, 60, 130, 95, 110]),
  S('umbreon', 197, 'Umbreon', ['dark'], [95, 65, 110, 60, 130, 65]),
  S('leafeon', 470, 'Leafeon', ['grass'], [65, 110, 130, 60, 65, 95]),
  S('glaceon', 471, 'Glaceon', ['ice'], [65, 60, 110, 130, 95, 65]),
  S('sylveon', 700, 'Sylveon', ['fairy'], [95, 65, 65, 110, 130, 60]),
  S('treecko', 252, 'Treecko', ['grass'], [40, 45, 35, 65, 55, 70]),
  S('grovyle', 253, 'Grovyle', ['grass'], [50, 65, 45, 85, 65, 95]),
  S('sceptile', 254, 'Sceptile', ['grass'], [70, 85, 65, 105, 85, 120]),
  S('torchic', 255, 'Torchic', ['fire'], [45, 60, 40, 70, 50, 45]),
  S('combusken', 256, 'Combusken', ['fire', 'fighting'], [60, 85, 60, 85, 60, 55]),
  S('blaziken', 257, 'Blaziken', ['fire', 'fighting'], [80, 120, 70, 110, 70, 80]),
  S('mudkip', 258, 'Mudkip', ['water'], [50, 70, 50, 50, 50, 40]),
  S('marshtomp', 259, 'Marshtomp', ['water', 'ground'], [70, 85, 70, 60, 70, 50]),
  S('swampert', 260, 'Swampert', ['water', 'ground'], [100, 110, 90, 85, 90, 60]),
  S('larvitar', 246, 'Larvitar', ['rock', 'ground'], [50, 64, 50, 45, 50, 41]),
  S('pupitar', 247, 'Pupitar', ['rock', 'ground'], [70, 84, 70, 65, 70, 51]),
  S('tyranitar', 248, 'Tyranitar', ['rock', 'dark'], [100, 134, 110, 95, 100, 61]),
  S('ralts', 280, 'Ralts', ['psychic', 'fairy'], [28, 25, 25, 45, 35, 40]),
  S('kirlia', 281, 'Kirlia', ['psychic', 'fairy'], [38, 35, 35, 65, 55, 50]),
  S('gardevoir', 282, 'Gardevoir', ['psychic', 'fairy'], [68, 65, 65, 125, 115, 80]),
  S('gallade', 475, 'Gallade', ['psychic', 'fighting'], [68, 125, 65, 65, 115, 80]),

  // ── Wild Pokémon ──
  S('caterpie', 10, 'Caterpie', ['bug'], [45, 30, 35, 20, 20, 45]),
  S('metapod', 11, 'Metapod', ['bug'], [50, 20, 55, 25, 25, 30]),
  S('butterfree', 12, 'Butterfree', ['bug', 'flying'], [60, 45, 50, 90, 80, 70]),
  S('weedle', 13, 'Weedle', ['bug', 'poison'], [40, 35, 30, 20, 20, 50]),
  S('kakuna', 14, 'Kakuna', ['bug', 'poison'], [45, 25, 50, 25, 25, 35]),
  S('beedrill', 15, 'Beedrill', ['bug', 'poison'], [65, 90, 40, 45, 80, 75]),
  S('pidgey', 16, 'Pidgey', ['normal', 'flying'], [40, 45, 40, 35, 35, 56]),
  S('pidgeotto', 17, 'Pidgeotto', ['normal', 'flying'], [63, 60, 55, 50, 50, 71]),
  S('rattata', 19, 'Rattata', ['normal'], [30, 56, 35, 25, 35, 72]),
  S('raticate', 20, 'Raticate', ['normal'], [55, 81, 60, 50, 70, 97]),
  S('spearow', 21, 'Spearow', ['normal', 'flying'], [40, 60, 30, 31, 31, 70]),
  S('ekans', 23, 'Ekans', ['poison'], [35, 60, 44, 40, 54, 55]),
  S('sandshrew', 27, 'Sandshrew', ['ground'], [50, 75, 85, 20, 30, 40]),
  S('sandslash', 28, 'Sandslash', ['ground'], [75, 100, 110, 45, 55, 65]),
  S('clefairy', 35, 'Clefairy', ['fairy'], [70, 45, 48, 60, 65, 35]),
  S('clefable', 36, 'Clefable', ['fairy'], [95, 70, 73, 95, 90, 60]),
  S('vulpix', 37, 'Vulpix', ['fire'], [38, 41, 40, 50, 65, 65]),
  S('zubat', 41, 'Zubat', ['poison', 'flying'], [40, 45, 35, 30, 40, 55]),
  S('golbat', 42, 'Golbat', ['poison', 'flying'], [75, 80, 70, 65, 75, 90]),
  S('oddish', 43, 'Oddish', ['grass', 'poison'], [45, 50, 55, 75, 65, 30]),
  S('paras', 46, 'Paras', ['bug', 'grass'], [35, 70, 55, 45, 55, 25]),
  S('parasect', 47, 'Parasect', ['bug', 'grass'], [60, 95, 80, 60, 80, 30]),
  S('diglett', 50, 'Diglett', ['ground'], [10, 55, 25, 35, 45, 95]),
  S('meowth', 52, 'Meowth', ['normal'], [40, 45, 35, 40, 40, 90]),
  S('psyduck', 54, 'Psyduck', ['water'], [50, 52, 48, 65, 50, 55]),
  S('mankey', 56, 'Mankey', ['fighting'], [40, 80, 35, 35, 45, 70]),
  S('primeape', 57, 'Primeape', ['fighting'], [65, 105, 60, 60, 70, 95]),
  S('growlithe', 58, 'Growlithe', ['fire'], [55, 70, 45, 70, 50, 60]),
  S('arcanine', 59, 'Arcanine', ['fire'], [90, 110, 80, 100, 80, 95]),
  S('bellsprout', 69, 'Bellsprout', ['grass', 'poison'], [50, 75, 35, 70, 30, 40]),
  S('tentacool', 72, 'Tentacool', ['water', 'poison'], [40, 40, 35, 50, 100, 70]),
  S('geodude', 74, 'Geodude', ['rock', 'ground'], [40, 80, 100, 30, 30, 20]),
  S('graveler', 75, 'Graveler', ['rock', 'ground'], [55, 95, 115, 45, 45, 35]),
  S('golem', 76, 'Golem', ['rock', 'ground'], [80, 120, 130, 55, 65, 45]),
  S('ponyta', 77, 'Ponyta', ['fire'], [50, 85, 55, 65, 65, 90]),
  S('slowpoke', 79, 'Slowpoke', ['water', 'psychic'], [90, 65, 65, 40, 40, 15]),
  S('magnemite', 81, 'Magnemite', ['electric', 'steel'], [25, 35, 70, 95, 55, 45]),
  S('magneton', 82, 'Magneton', ['electric', 'steel'], [50, 60, 95, 120, 70, 70]),
  S('seel', 86, 'Seel', ['water'], [65, 45, 55, 45, 70, 45]),
  S('dewgong', 87, 'Dewgong', ['water', 'ice'], [90, 70, 80, 70, 95, 70]),
  S('grimer', 88, 'Grimer', ['poison'], [80, 80, 50, 40, 50, 25]),
  S('shellder', 90, 'Shellder', ['water'], [30, 65, 100, 45, 25, 40]),
  S('cloyster', 91, 'Cloyster', ['water', 'ice'], [50, 95, 180, 85, 45, 70]),
  S('onix', 95, 'Onix', ['rock', 'ground'], [35, 45, 160, 30, 45, 70]),
  S('drowzee', 96, 'Drowzee', ['psychic'], [60, 48, 45, 43, 90, 42]),
  S('hypno', 97, 'Hypno', ['psychic'], [85, 73, 70, 73, 115, 67]),
  S('krabby', 98, 'Krabby', ['water'], [30, 105, 90, 25, 25, 50]),
  S('voltorb', 100, 'Voltorb', ['electric'], [40, 30, 50, 55, 55, 100]),
  S('electrode', 101, 'Electrode', ['electric'], [60, 50, 70, 80, 80, 150]),
  S('cubone', 104, 'Cubone', ['ground'], [50, 50, 95, 40, 50, 35]),
  S('marowak', 105, 'Marowak', ['ground'], [60, 80, 110, 50, 80, 45]),
  S('hitmonlee', 106, 'Hitmonlee', ['fighting'], [50, 120, 53, 35, 110, 87]),
  S('koffing', 109, 'Koffing', ['poison'], [40, 65, 95, 60, 45, 35]),
  S('rhyhorn', 111, 'Rhyhorn', ['ground', 'rock'], [80, 85, 95, 30, 30, 25]),
  S('chansey', 113, 'Chansey', ['normal'], [250, 5, 5, 35, 105, 50]),
  S('kangaskhan', 115, 'Kangaskhan', ['normal'], [105, 95, 80, 40, 80, 90]),
  S('horsea', 116, 'Horsea', ['water'], [30, 40, 70, 70, 25, 60]),
  S('scyther', 123, 'Scyther', ['bug', 'flying'], [70, 110, 80, 55, 80, 105]),
  S('jynx', 124, 'Jynx', ['ice', 'psychic'], [65, 50, 35, 115, 95, 95]),
  S('electabuzz', 125, 'Electabuzz', ['electric'], [65, 83, 57, 95, 85, 105]),
  S('magmar', 126, 'Magmar', ['fire'], [65, 95, 57, 100, 85, 93]),
  S('lapras', 131, 'Lapras', ['water', 'ice'], [130, 85, 80, 85, 95, 60]),
  S('ditto', 132, 'Ditto', ['normal'], [48, 48, 48, 48, 48, 48]),
  S('articuno', 144, 'Articuno', ['ice', 'flying'], [90, 85, 100, 95, 125, 85]),
  S('zapdos', 145, 'Zapdos', ['electric', 'flying'], [90, 90, 85, 125, 90, 100]),
  S('moltres', 146, 'Moltres', ['fire', 'flying'], [90, 100, 90, 125, 85, 90]),
  S('mewtwo', 150, 'Mewtwo', ['psychic'], [106, 110, 90, 154, 90, 130]),
  S('mareep', 179, 'Mareep', ['electric'], [55, 40, 40, 65, 45, 35]),
  S('murkrow', 198, 'Murkrow', ['dark', 'flying'], [60, 85, 42, 85, 42, 91]),
  S('misdreavus', 200, 'Misdreavus', ['ghost'], [60, 60, 60, 85, 85, 85]),
  S('wobbuffet', 202, 'Wobbuffet', ['psychic'], [190, 33, 58, 33, 58, 33]),
  S('slugma', 218, 'Slugma', ['fire'], [40, 40, 40, 70, 40, 20]),
  S('houndour', 228, 'Houndour', ['dark', 'fire'], [45, 60, 30, 80, 50, 65]),
  S('elekid', 239, 'Elekid', ['electric'], [45, 63, 37, 65, 55, 95]),
  S('sableye', 302, 'Sableye', ['dark', 'ghost'], [50, 75, 75, 65, 65, 50]),
  S('electrike', 309, 'Electrike', ['electric'], [40, 45, 40, 65, 40, 65]),
  S('numel', 322, 'Numel', ['fire', 'ground'], [60, 60, 40, 65, 45, 35]),
  S('shuppet', 353, 'Shuppet', ['ghost'], [44, 75, 35, 63, 33, 45]),
  S('banette', 354, 'Banette', ['ghost'], [64, 115, 65, 83, 63, 65]),
  S('duskull', 355, 'Duskull', ['ghost'], [20, 40, 90, 30, 90, 25]),
  S('dusclops', 356, 'Dusclops', ['ghost'], [40, 70, 130, 60, 130, 25]),
  S('bagon', 371, 'Bagon', ['dragon'], [45, 75, 60, 40, 30, 50]),
  S('shelgon', 372, 'Shelgon', ['dragon'], [65, 95, 100, 60, 50, 50]),
  S('snorunt', 361, 'Snorunt', ['ice'], [50, 50, 50, 50, 50, 50]),
  S('spheal', 363, 'Spheal', ['ice', 'water'], [70, 40, 50, 55, 50, 25]),
];

export const SPECIES: Record<string, Species> = Object.fromEntries(SPECIES_LIST.map((s) => [s.id, s]));

export type AbilityId =
  | 'overgrow' | 'blaze' | 'torrent' | 'rain-dish' | 'static' | 'levitate' | 'guts' | 'magic-guard'
  | 'multiscale' | 'adaptability' | 'unburden' | 'speed-boost' | 'sand-stream' | 'synchronize';

export const ABILITIES: Record<AbilityId, { name: string; desc: string }> = {
  overgrow: { name: 'Overgrow', desc: 'Grass moves deal +15% damage, rising to +50% below half HP.' },
  blaze: { name: 'Blaze', desc: 'Fire moves deal +15% damage, rising to +50% below half HP.' },
  torrent: { name: 'Torrent', desc: 'Water moves deal +15% damage, rising to +50% below half HP.' },
  'rain-dish': { name: 'Rain Dish', desc: 'Constantly restores 0.6% max HP per second.' },
  static: { name: 'Static', desc: 'Foes that touch you are often paralyzed and take Electric damage.' },
  levitate: { name: 'Levitate', desc: 'Floats: takes 40% less contact damage and +10% move speed.' },
  guts: { name: 'Guts', desc: 'Up to +60% damage as your HP drops.' },
  'magic-guard': { name: 'Magic Guard', desc: 'Takes 20% less damage, and Life Orb costs no HP.' },
  multiscale: { name: 'Multiscale', desc: 'Takes half damage while at full HP. Heals 2x from berries.' },
  adaptability: { name: 'Adaptability', desc: 'Same-type attack bonus is 2.0x instead of 1.5x.' },
  unburden: { name: 'Unburden', desc: '+25% move speed and +15% attack rate when not hit for 4s.' },
  'speed-boost': { name: 'Speed Boost', desc: 'Move speed and attack rate rise +3% every minute (max +45%).' },
  'sand-stream': { name: 'Sand Stream', desc: 'A sandstorm constantly chips foes around you (Rock). Takes 15% less damage.' },
  synchronize: { name: 'Synchronize', desc: 'Foes that hit you are confused and take Psychic damage.' },
};

export interface LearnEntry { move: string; stage: number }

export interface Line {
  id: string;
  name: string;
  stages: string[];        // species ids
  evoLevels: number[];     // run level for stage index 1, 2...
  ability: AbilityId;
  starter: string;         // starting move id
  learnset: LearnEntry[];
  /**
   * Final forms that depend on where the partner evolves: stage id -> species. With several
   * candidates the dominant move type picks between them. Unlisted stages evolve into the
   * line's normal last stage (a line with no normal last stage, like Eevee, lists them all).
   */
  envForms?: Record<string, string[]>;
  /** Moves an alternate final form can learn (and picks from when it evolves). */
  formMoves?: Record<string, string[]>;
  blurb: string;
}

const L = (m: string, stage = 0): LearnEntry => ({ move: m, stage });

export const LINES: Line[] = [
  {
    id: 'bulbasaur', name: 'Bulbasaur', stages: ['bulbasaur', 'ivysaur', 'venusaur'], evoLevels: [12, 26],
    ability: 'overgrow', starter: 'vine-whip', blurb: 'Sturdy all-rounder that drains and poisons.',
    learnset: [L('vine-whip'), L('tackle'), L('leech-seed'), L('razor-leaf'), L('poison-sting'), L('sleep-powder'), L('bullet-seed'), L('toxic'), L('sludge-bomb', 1), L('petal-dance', 1), L('venoshock', 1), L('solar-beam', 2), L('sunny-day', 1)],
  },
  {
    id: 'charmander', name: 'Charmander', stages: ['charmander', 'charmeleon', 'charizard'], evoLevels: [12, 26],
    ability: 'blaze', starter: 'ember', blurb: 'Glass-cannon fire breather. Takes flight at full power.',
    learnset: [L('ember'), L('metal-claw'), L('dragon-rage'), L('fire-spin'), L('flame-wheel'), L('will-o-wisp'), L('flamethrower', 1), L('dragon-breath', 1), L('blaze-kick', 1), L('heat-wave', 2), L('sunny-day', 1), L('air-slash', 2), L('dragon-pulse', 2)],
  },
  {
    id: 'squirtle', name: 'Squirtle', stages: ['squirtle', 'wartortle', 'blastoise'], evoLevels: [12, 26],
    ability: 'rain-dish', starter: 'water-gun', blurb: 'Tanky shell with crowd-pushing water and slow.',
    learnset: [L('water-gun'), L('tackle'), L('bubble'), L('rapid-spin'), L('water-pulse'), L('bite'), L('aqua-ring'), L('whirlpool', 1), L('surf', 1), L('ice-beam', 1), L('iron-defense', 1), L('rain-dance', 1), L('flash-cannon', 2)],
  },
  {
    id: 'pichu', name: 'Pichu', stages: ['pichu', 'pikachu', 'raichu'], evoLevels: [8, 22],
    ability: 'static', starter: 'thunder-shock', blurb: 'Fragile at first, evolves early into a lightning storm.',
    learnset: [L('thunder-shock'), L('quick-attack'), L('spark'), L('thunder-wave'), L('electro-ball'), L('swift'), L('fairy-wind'), L('discharge', 1), L('thunderbolt', 1), L('agility', 1), L('electric-terrain', 1), L('rain-dance', 1), L('magnet-bomb', 2)],
    envForms: { cerulean: ['raichu-alola'] },
    formMoves: { 'raichu-alola': ['psybeam', 'future-sight', 'calm-mind'] },
  },
  {
    id: 'gastly', name: 'Gastly', stages: ['gastly', 'haunter', 'gengar'], evoLevels: [12, 26],
    ability: 'levitate', starter: 'lick', blurb: 'Spooky special attacker with curses and toxic clouds.',
    learnset: [L('lick'), L('night-shade'), L('smog'), L('hex'), L('shadow-sneak'), L('toxic'), L('will-o-wisp'), L('toxic-spikes'), L('shadow-ball', 1), L('sludge-bomb', 1), L('curse', 1), L('dark-pulse', 2)],
  },
  {
    id: 'machop', name: 'Machop', stages: ['machop', 'machoke', 'machamp'], evoLevels: [12, 26],
    ability: 'guts', starter: 'karate-chop', blurb: 'Brawler who hits harder the more he is hurt.',
    learnset: [L('karate-chop'), L('rock-smash'), L('mach-punch'), L('bulldoze'), L('rock-throw'), L('magnitude'), L('counter'), L('cross-chop', 1), L('rock-slide', 1), L('sky-uppercut', 1), L('bite', 1), L('aura-sphere', 2)],
  },
  {
    id: 'abra', name: 'Abra', stages: ['abra', 'kadabra', 'alakazam'], evoLevels: [10, 24],
    ability: 'magic-guard', starter: 'confusion', blurb: 'Brilliant but frail psychic. Bends the battlefield.',
    learnset: [L('confusion'), L('psybeam'), L('stored-power'), L('reflect'), L('calm-mind'), L('thunder-wave'), L('agility'), L('future-sight', 1), L('shadow-ball', 1), L('mirror-coat', 1), L('fire-spin', 1), L('dazzling-gleam', 2)],
  },
  {
    id: 'dratini', name: 'Dratini', stages: ['dratini', 'dragonair', 'dragonite'], evoLevels: [14, 30],
    ability: 'multiscale', starter: 'twister', blurb: 'Slow to mature, but a dragon of legend once grown.',
    learnset: [L('twister'), L('dragon-rage'), L('thunder-wave'), L('dragon-breath'), L('whirlwind'), L('ice-beam', 1), L('dragon-pulse', 1), L('outrage', 1), L('dragon-dance', 1), L('snowscape', 1), L('wing-attack', 2), L('tailwind', 2), L('thunderbolt', 2)],
  },
  {
    id: 'eevee', name: 'Eevee', stages: ['eevee'], evoLevels: [14],
    ability: 'adaptability', starter: 'swift',
    blurb: 'Evolves into the Eeveelution that suits the place it evolves in.',
    learnset: [L('swift'), L('tackle'), L('quick-attack'), L('bite'), L('water-pulse'), L('ember'), L('thunder-shock'), L('confusion'), L('leech-seed'), L('powder-snow'), L('fairy-wind'), L('hyper-voice'), L('double-team')],
    envForms: {
      viridian: ['leafeon'], mtmoon: ['sylveon'], seafoam: ['glaceon', 'vaporeon'], powerplant: ['jolteon'],
      tower: ['umbreon'], cinnabar: ['flareon'], cerulean: ['espeon'],
    },
    formMoves: {
      vaporeon: ['surf', 'aqua-ring', 'whirlpool', 'rain-dance'],
      jolteon: ['thunderbolt', 'discharge', 'electro-ball', 'electric-terrain'],
      flareon: ['flamethrower', 'flame-wheel', 'heat-wave', 'sunny-day'],
      espeon: ['psybeam', 'future-sight', 'stored-power', 'calm-mind'],
      umbreon: ['dark-pulse', 'pursuit', 'thief', 'iron-defense'],
      leafeon: ['leaf-blade', 'razor-leaf', 'swords-dance', 'leech-seed'],
      glaceon: ['ice-beam', 'sheer-cold', 'ice-shard', 'snowscape'],
      sylveon: ['dazzling-gleam', 'draining-kiss', 'misty-terrain', 'disarming-voice'],
    },
  },
  {
    id: 'treecko', name: 'Treecko', stages: ['treecko', 'grovyle', 'sceptile'], evoLevels: [12, 26],
    ability: 'unburden', starter: 'bullet-seed', blurb: 'Lightning-quick blade master. Rewards clean dodging.',
    learnset: [L('bullet-seed'), L('quick-attack'), L('pursuit'), L('vine-whip'), L('razor-leaf'), L('leech-seed'), L('fury-cutter', 1), L('leaf-blade', 1), L('night-slash', 1), L('agility', 1), L('infestation', 1), L('dragon-pulse', 2), L('solar-beam', 2), L('sunny-day', 2)],
  },
  {
    id: 'torchic', name: 'Torchic', stages: ['torchic', 'combusken', 'blaziken'], evoLevels: [12, 26],
    ability: 'speed-boost', starter: 'ember', blurb: 'Gets faster every minute. Fire and fists.',
    learnset: [L('ember'), L('quick-attack'), L('fire-spin'), L('flame-wheel'), L('aerial-ace'), L('will-o-wisp'), L('karate-chop', 1), L('flamethrower', 1), L('sky-uppercut', 1), L('mach-punch', 1), L('focus-punch', 1), L('blaze-kick', 2), L('heat-wave', 2), L('aura-sphere', 2)],
  },
  {
    id: 'mudkip', name: 'Mudkip', stages: ['mudkip', 'marshtomp', 'swampert'], evoLevels: [12, 26],
    ability: 'torrent', starter: 'water-gun', blurb: 'Hardy mud-slinger with earthshaking power.',
    learnset: [L('water-gun'), L('tackle'), L('mud-slap'), L('rock-smash'), L('whirlpool'), L('aqua-ring'), L('bonemerang', 1), L('bulldoze', 1), L('surf', 1), L('magnitude', 1), L('dig', 1), L('earth-power', 2), L('rain-dance', 1), L('rock-slide', 2)],
  },
  {
    id: 'larvitar', name: 'Larvitar', stages: ['larvitar', 'pupitar', 'tyranitar'], evoLevels: [14, 30],
    ability: 'sand-stream', starter: 'rock-throw', blurb: 'An armored menace that summons sandstorms.',
    learnset: [L('rock-throw'), L('bite'), L('sandstorm'), L('rollout'), L('mud-slap'), L('ancient-power'), L('rock-tomb'), L('rock-slide', 1), L('stealth-rock', 1), L('iron-defense', 1), L('earth-power', 1), L('dark-pulse', 2), L('sandstorm', 2), L('outrage', 2)],
  },
  {
    id: 'ralts', name: 'Ralts', stages: ['ralts', 'kirlia', 'gardevoir'], evoLevels: [10, 24],
    ability: 'synchronize', starter: 'fairy-wind', blurb: 'Empathic psychic-fairy. Punishes anyone who strikes it.',
    learnset: [L('fairy-wind'), L('confusion'), L('disarming-voice'), L('double-team'), L('draining-kiss'), L('calm-mind'), L('psybeam', 1), L('future-sight', 1), L('dazzling-gleam', 1), L('misty-terrain', 1), L('mirror-coat', 2), L('shadow-ball', 2)],
    envForms: { cinnabar: ['gallade'] },
    formMoves: { gallade: ['leaf-blade', 'night-slash', 'sky-uppercut', 'swords-dance'] },
  },
];

export const LINE: Record<string, Line> = Object.fromEntries(LINES.map((l) => [l.id, l]));

/** Lines available from the very first run. */
export const STARTER_LINES = ['bulbasaur', 'charmander', 'squirtle', 'pichu'];

/** Mega Evolutions of fully evolved partners. `form` is the PMD SpriteCollab form folder;
 *  `sprite` is false where only a portrait exists (the normal sprite is drawn with a Mega aura). */
export interface MegaDef { id: string; name: string; dex: number; form: string; sprite: boolean; types?: PType[] }
export const MEGA: Record<string, MegaDef> = {
  venusaur: { id: 'venusaur-mega', name: 'Mega Venusaur', dex: 3, form: '0001', sprite: false },
  charizard: { id: 'charizard-mega-x', name: 'Mega Charizard X', dex: 6, form: '0001', sprite: true, types: ['fire', 'dragon'] },
  blastoise: { id: 'blastoise-mega', name: 'Mega Blastoise', dex: 9, form: '0001', sprite: false },
  raichu: { id: 'raichu-mega-x', name: 'Mega Raichu X', dex: 26, form: '0002', sprite: false },
  gengar: { id: 'gengar-mega', name: 'Mega Gengar', dex: 94, form: '0001', sprite: true },
  alakazam: { id: 'alakazam-mega', name: 'Mega Alakazam', dex: 65, form: '0001', sprite: true },
  dragonite: { id: 'dragonite-mega', name: 'Mega Dragonite', dex: 149, form: '0001', sprite: false },
  sceptile: { id: 'sceptile-mega', name: 'Mega Sceptile', dex: 254, form: '0001', sprite: true, types: ['grass', 'dragon'] },
  blaziken: { id: 'blaziken-mega', name: 'Mega Blaziken', dex: 257, form: '0001', sprite: false },
  swampert: { id: 'swampert-mega', name: 'Mega Swampert', dex: 260, form: '0001', sprite: false },
  tyranitar: { id: 'tyranitar-mega', name: 'Mega Tyranitar', dex: 248, form: '0001', sprite: true },
  gardevoir: { id: 'gardevoir-mega', name: 'Mega Gardevoir', dex: 282, form: '0001', sprite: true },
  gallade: { id: 'gallade-mega', name: 'Mega Gallade', dex: 475, form: '0001', sprite: true },
};

/** The line's normal last stage, if it has one past the base (Eevee doesn't). */
function normalFinal(line: Line): string | undefined {
  return line.stages[line.evoLevels.length];
}

/** Every species the line can end up as. */
export function finalForms(line: Line): string[] {
  const f = normalFinal(line);
  return [...new Set([...(f ? [f] : []), ...Object.values(line.envForms ?? {}).flat()])];
}

/** Every species the line passes through or ends as. */
export function lineSpecies(line: Line): string[] {
  return [...new Set([...line.stages, ...finalForms(line)])];
}

/** Candidates for the line's final evolution on this stage (first one is the default). */
export function finalFormsOn(line: Line, stageId: string): string[] {
  const env = line.envForms?.[stageId];
  if (env) return env;
  const f = normalFinal(line);
  return f ? [f] : finalForms(line);
}

/** True once a partner has reached the end of its line (Mega Evolution becomes possible). */
export function fullyEvolved(lineId: string, speciesId: string): boolean {
  return finalForms(LINE[lineId]).includes(speciesId);
}

export function lineOfSpecies(speciesId: string): Line | undefined {
  return LINES.find((l) => lineSpecies(l).includes(speciesId));
}
