export const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type PType = (typeof TYPES)[number];

export const TYPE_COLORS: Record<PType, string> = {
  normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C',
  grass: '#7AC74C', ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1',
  ground: '#E2BF65', flying: '#A98FF3', psychic: '#F95587', bug: '#A6B91A',
  rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC', dark: '#705746',
  steel: '#B7B7CE', fairy: '#D685AD',
};

/** Real chart: attacking type -> defending types it is 2x / 0.5x / 0x against. */
const SUPER: Record<PType, PType[]> = {
  normal: [], fire: ['grass', 'ice', 'bug', 'steel'], water: ['fire', 'ground', 'rock'],
  electric: ['water', 'flying'], grass: ['water', 'ground', 'rock'],
  ice: ['grass', 'ground', 'flying', 'dragon'],
  fighting: ['normal', 'ice', 'rock', 'dark', 'steel'], poison: ['grass', 'fairy'],
  ground: ['fire', 'electric', 'poison', 'rock', 'steel'], flying: ['grass', 'fighting', 'bug'],
  psychic: ['fighting', 'poison'], bug: ['grass', 'psychic', 'dark'],
  rock: ['fire', 'ice', 'flying', 'bug'], ghost: ['psychic', 'ghost'], dragon: ['dragon'],
  dark: ['psychic', 'ghost'], steel: ['ice', 'rock', 'fairy'], fairy: ['fighting', 'dragon', 'dark'],
};
const RESIST: Record<PType, PType[]> = {
  normal: ['rock', 'steel'], fire: ['fire', 'water', 'rock', 'dragon'],
  water: ['water', 'grass', 'dragon'], electric: ['electric', 'grass', 'dragon'],
  grass: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
  ice: ['fire', 'water', 'ice', 'steel'], fighting: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
  poison: ['poison', 'ground', 'rock', 'ghost'], ground: ['grass', 'bug'],
  flying: ['electric', 'rock', 'steel'], psychic: ['psychic', 'steel'],
  bug: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
  rock: ['fighting', 'ground', 'steel'], ghost: ['dark'], dragon: ['steel'],
  dark: ['fighting', 'dark', 'fairy'], steel: ['fire', 'water', 'electric', 'steel'],
  fairy: ['fire', 'poison', 'steel'],
};
const IMMUNE: Record<PType, PType[]> = {
  normal: ['ghost'], fire: [], water: [], electric: ['ground'], grass: [], ice: [],
  fighting: ['ghost'], poison: ['steel'], ground: ['flying'], flying: [], psychic: ['dark'],
  bug: [], rock: [], ghost: ['normal'], dragon: ['fairy'], dark: [], steel: [], fairy: [],
};

/** Immunities are softened so no build is ever fully useless against a stage. */
export const IMMUNE_MULT = 0.25;

export function typeMult(atk: PType, def: PType): number {
  if (IMMUNE[atk].includes(def)) return IMMUNE_MULT;
  if (SUPER[atk].includes(def)) return 2;
  if (RESIST[atk].includes(def)) return 0.5;
  return 1;
}

export function effectiveness(atk: PType, defs: readonly PType[]): number {
  let m = 1;
  for (const d of defs) m *= typeMult(atk, d);
  return m;
}

export function typeIndex(t: PType): number {
  return TYPES.indexOf(t);
}
