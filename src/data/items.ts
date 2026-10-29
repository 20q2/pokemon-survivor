import type { PType } from './types.ts';

export const MAX_ITEM_LEVEL = 5;

export type ItemStat =
  | 'typeDmg' | 'physDmg' | 'specDmg' | 'allDmg' | 'cooldown' | 'crit' | 'critDmg' | 'area'
  | 'regen' | 'lifesteal' | 'exp' | 'money' | 'thorns' | 'superEff' | 'flinch' | 'speed'
  | 'maxHp' | 'pickup' | 'duration' | 'count' | 'focus' | 'lifeOrb';

export interface ItemDef {
  id: string;        // also the PokeAPI item sprite name
  name: string;
  stat: ItemStat;
  perLevel: number;
  type?: PType;      // for type boosters
  desc: (lvl: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const typeBooster = (id: string, name: string, type: PType): ItemDef => ({
  id, name, stat: 'typeDmg', type, perLevel: 0.12,
  desc: (l) => `${cap(type)}-type moves deal +${pct(0.12 * l)} damage. Enables ${cap(type)} move mastery.`,
});
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const TYPE_BOOSTER: Record<PType, string> = {
  normal: 'silk-scarf', fire: 'charcoal', water: 'mystic-water', electric: 'magnet',
  grass: 'miracle-seed', ice: 'never-melt-ice', fighting: 'black-belt', poison: 'poison-barb',
  ground: 'soft-sand', flying: 'sharp-beak', psychic: 'twisted-spoon', bug: 'silver-powder',
  rock: 'hard-stone', ghost: 'spell-tag', dragon: 'dragon-fang', dark: 'black-glasses',
  steel: 'metal-coat', fairy: 'fairy-feather',
};

const BOOSTER_NAMES: Record<string, string> = {
  'silk-scarf': 'Silk Scarf', charcoal: 'Charcoal', 'mystic-water': 'Mystic Water', magnet: 'Magnet',
  'miracle-seed': 'Miracle Seed', 'never-melt-ice': 'Never-Melt Ice', 'black-belt': 'Black Belt',
  'poison-barb': 'Poison Barb', 'soft-sand': 'Soft Sand', 'sharp-beak': 'Sharp Beak',
  'twisted-spoon': 'Twisted Spoon', 'silver-powder': 'Silver Powder', 'hard-stone': 'Hard Stone',
  'spell-tag': 'Spell Tag', 'dragon-fang': 'Dragon Fang', 'black-glasses': 'Black Glasses',
  'metal-coat': 'Metal Coat', 'fairy-feather': 'Fairy Feather',
};

export const ITEM_LIST: ItemDef[] = [
  ...(Object.entries(TYPE_BOOSTER) as [PType, string][]).map(([t, id]) => typeBooster(id, BOOSTER_NAMES[id], t)),
  { id: 'muscle-band', name: 'Muscle Band', stat: 'physDmg', perLevel: 0.1, desc: (l) => `Physical moves deal +${pct(0.1 * l)} damage.` },
  { id: 'wise-glasses', name: 'Wise Glasses', stat: 'specDmg', perLevel: 0.1, desc: (l) => `Special moves deal +${pct(0.1 * l)} damage.` },
  { id: 'quick-claw', name: 'Quick Claw', stat: 'cooldown', perLevel: 0.07, desc: (l) => `Moves recharge ${pct(0.07 * l)} faster.` },
  { id: 'scope-lens', name: 'Scope Lens', stat: 'crit', perLevel: 0.05, desc: (l) => `+${pct(0.05 * l)} critical-hit chance.` },
  { id: 'razor-claw', name: 'Razor Claw', stat: 'critDmg', perLevel: 0.2, desc: (l) => `Critical hits deal +${pct(0.2 * l)} more damage.` },
  { id: 'wide-lens', name: 'Wide Lens', stat: 'area', perLevel: 0.09, desc: (l) => `Move area +${pct(0.09 * l)}.` },
  { id: 'loaded-dice', name: 'Loaded Dice', stat: 'count', perLevel: 0.4, desc: (l) => `Multi-target moves fire +${Math.floor(0.4 * l)} extra (bonus at Lv3 and Lv5).` },
  { id: 'metronome', name: 'Metronome', stat: 'duration', perLevel: 0.1, desc: (l) => `Move duration +${pct(0.1 * l)}.` },
  { id: 'leftovers', name: 'Leftovers', stat: 'regen', perLevel: 0.003, desc: (l) => `Restore ${(0.3 * l).toFixed(1)}% max HP per second.` },
  { id: 'shell-bell', name: 'Shell Bell', stat: 'lifesteal', perLevel: 0.008, desc: (l) => `Heal ${(0.8 * l).toFixed(1)}% of damage dealt.` },
  { id: 'lucky-egg', name: 'Lucky Egg', stat: 'exp', perLevel: 0.1, desc: (l) => `+${pct(0.1 * l)} Exp. gained.` },
  { id: 'amulet-coin', name: 'Amulet Coin', stat: 'money', perLevel: 0.15, desc: (l) => `+${pct(0.15 * l)} Poké Dollars gained.` },
  { id: 'rocky-helmet', name: 'Rocky Helmet', stat: 'thorns', perLevel: 18, desc: (l) => `Foes that touch you take ${18 * l} damage.` },
  { id: 'expert-belt', name: 'Expert Belt', stat: 'superEff', perLevel: 0.12, desc: (l) => `Super-effective hits deal +${pct(0.12 * l)} damage.` },
  { id: 'life-orb', name: 'Life Orb', stat: 'lifeOrb', perLevel: 0.08, desc: (l) => `+${pct(0.08 * l)} damage, but slowly drains HP (never fatal).` },
  { id: 'kings-rock', name: "King's Rock", stat: 'flinch', perLevel: 0.03, desc: (l) => `${pct(0.03 * l)} chance for hits to make foes flinch.` },
  { id: 'choice-scarf', name: 'Choice Scarf', stat: 'speed', perLevel: 0.07, desc: (l) => `Movement speed +${pct(0.07 * l)}.` },
  { id: 'assault-vest', name: 'Assault Vest', stat: 'maxHp', perLevel: 0.12, desc: (l) => `Max HP +${pct(0.12 * l)}.` },
  { id: 'big-root', name: 'Big Root', stat: 'pickup', perLevel: 0.25, desc: (l) => `Pickup range +${pct(0.25 * l)}.` },
  { id: 'focus-band', name: 'Focus Band', stat: 'focus', perLevel: 0.08, desc: (l) => `${pct(0.08 * l)} chance to survive a fatal hit with 1 HP.` },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]));
