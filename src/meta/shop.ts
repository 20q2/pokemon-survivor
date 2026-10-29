import { MOVES, TM_MOVES } from '../data/moves.ts';

export interface ShopUpgrade {
  id: string;
  name: string;
  icon: string; // item sprite
  maxRank: number;
  baseCost: number;
  growth: number;
  desc: (rank: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const SHOP: ShopUpgrade[] = [
  { id: 'protein', name: 'Protein', icon: 'protein', maxRank: 5, baseCost: 120, growth: 1.6, desc: (r) => `+${pct(0.05 * r)} Attack` },
  { id: 'calcium', name: 'Calcium', icon: 'calcium', maxRank: 5, baseCost: 120, growth: 1.6, desc: (r) => `+${pct(0.05 * r)} Sp. Atk` },
  { id: 'hp-up', name: 'HP Up', icon: 'hp-up', maxRank: 5, baseCost: 100, growth: 1.6, desc: (r) => `+${pct(0.08 * r)} max HP` },
  { id: 'iron', name: 'Iron', icon: 'iron', maxRank: 5, baseCost: 110, growth: 1.6, desc: (r) => `-${pct(0.04 * r)} contact damage taken` },
  { id: 'zinc', name: 'Zinc', icon: 'zinc', maxRank: 5, baseCost: 110, growth: 1.6, desc: (r) => `-${pct(0.05 * r)} projectile damage taken` },
  { id: 'carbos', name: 'Carbos', icon: 'carbos', maxRank: 5, baseCost: 100, growth: 1.6, desc: (r) => `+${pct(0.03 * r)} move speed` },
  { id: 'pp-up', name: 'PP Up', icon: 'pp-up', maxRank: 5, baseCost: 180, growth: 1.7, desc: (r) => `Moves recharge ${pct(0.03 * r)} faster` },
  { id: 'exp-share', name: 'Exp. Share', icon: 'exp-share', maxRank: 5, baseCost: 150, growth: 1.6, desc: (r) => `+${pct(0.05 * r)} Exp.` },
  { id: 'amulet-coin', name: 'Amulet Coin', icon: 'amulet-coin', maxRank: 5, baseCost: 150, growth: 1.6, desc: (r) => `+${pct(0.1 * r)} Poké Dollars` },
  { id: 'big-root', name: 'Big Root', icon: 'big-root', maxRank: 3, baseCost: 90, growth: 1.7, desc: (r) => `+${pct(0.15 * r)} pickup range` },
  { id: 'wide-lens', name: 'Wide Lens', icon: 'wide-lens', maxRank: 3, baseCost: 200, growth: 1.8, desc: (r) => `+${pct(0.05 * r)} move area` },
  { id: 'lucky-punch', name: 'Lucky Punch', icon: 'lucky-punch', maxRank: 3, baseCost: 200, growth: 1.8, desc: (r) => `+${pct(0.03 * r)} critical-hit chance` },
  { id: 'rare-candy', name: 'Rare Candy', icon: 'rare-candy', maxRank: 3, baseCost: 250, growth: 2, desc: (r) => `Start runs ${r} level${r === 1 ? '' : 's'} higher` },
  { id: 'revive', name: 'Revive', icon: 'revive', maxRank: 2, baseCost: 800, growth: 2.5, desc: (r) => `Revive ${r} time${r === 1 ? '' : 's'} per run at 50% HP` },
  { id: 'reroll', name: 'Poké Ball Reroll', icon: 'great-ball', maxRank: 5, baseCost: 150, growth: 1.5, desc: (r) => `${r} reroll${r === 1 ? '' : 's'} of level-up choices per run` },
  { id: 'skip', name: 'Escape Rope', icon: 'escape-rope', maxRank: 3, baseCost: 120, growth: 1.5, desc: (r) => `${r} skip${r === 1 ? '' : 's'} per run (skipping heals a little)` },
  { id: 'banish', name: 'Max Repel', icon: 'max-repel', maxRank: 3, baseCost: 200, growth: 1.6, desc: (r) => `${r} banish${r === 1 ? '' : 'es'} per run (remove an option for the rest of the run)` },
  { id: 'bag', name: 'Bag Pocket', icon: 'big-nugget', maxRank: 2, baseCost: 1200, growth: 2.5, desc: (r) => `+${r} held-item slot${r === 1 ? '' : 's'}` },
  { id: 'shiny-charm', name: 'Shiny Charm', icon: 'shiny-charm', maxRank: 1, baseCost: 2000, growth: 1, desc: () => `Wild shinies appear 3x as often` },
];

export const SHOP_BY_ID: Record<string, ShopUpgrade> = Object.fromEntries(SHOP.map((u) => [u.id, u]));

export function upgradeCost(u: ShopUpgrade, rank: number): number {
  return Math.round((u.baseCost * Math.pow(u.growth, rank)) / 10) * 10;
}

export const TM_COST = 400;
export const TM_LIST = TM_MOVES.map((id) => MOVES[id]);

export interface MetaBonuses {
  atk: number; spa: number; hp: number; contactDef: number; projDef: number; speed: number;
  cooldown: number; exp: number; money: number; pickup: number; area: number; crit: number;
  startLevels: number; revives: number; rerolls: number; skips: number; banishes: number;
  itemSlots: number; shinyOdds: number;
  /** friendship perks for the chosen line */
  friendDmg: number; friendHp: number; friendStartItem: boolean;
}

export function metaBonuses(shop: Record<string, number>, friendship = 0): MetaBonuses {
  const r = (id: string) => shop[id] ?? 0;
  return {
    atk: 0.05 * r('protein'), spa: 0.05 * r('calcium'), hp: 0.08 * r('hp-up'),
    contactDef: 0.04 * r('iron'), projDef: 0.05 * r('zinc'), speed: 0.03 * r('carbos'),
    cooldown: 0.03 * r('pp-up'), exp: 0.05 * r('exp-share'), money: 0.1 * r('amulet-coin'),
    pickup: 0.15 * r('big-root'), area: 0.05 * r('wide-lens'), crit: 0.03 * r('lucky-punch'),
    startLevels: r('rare-candy'), revives: r('revive'), rerolls: r('reroll'), skips: r('skip'),
    banishes: r('banish'), itemSlots: r('bag'), shinyOdds: r('shiny-charm') ? 3 : 1,
    friendDmg: friendship >= 200 ? (friendship >= 800 ? 0.1 : 0.05) : 0,
    friendHp: friendship >= 400 ? 0.1 : 0,
    friendStartItem: friendship >= 600,
  };
}

/** Friendship thresholds and their perks (shown in the UI). */
export const FRIENDSHIP_MAX = 1000;
export const FRIENDSHIP_PERKS = [
  { at: 200, text: '+5% damage' },
  { at: 400, text: '+10% max HP' },
  { at: 600, text: 'Start with a random held item' },
  { at: 800, text: '+10% damage (total)' },
  { at: 1000, text: 'Max friendship! Clear any stage to unlock the Shiny form' },
];
