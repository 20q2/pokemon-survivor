import { SPECIES } from '../data/pokedex.ts';
import { ITEMS, vitaminBonus } from '../data/items.ts';
import type { DerivedStats, Player } from './types.ts';

/** Maps a base stat (~20..160) into a gentle multiplier so every Pokémon stays viable. */
export const statFactor = (base: number) => 0.75 + base / 200;

export const BASE_PICKUP = 56;

export function derivePlayerStats(p: Player, level: number, time: number): DerivedStats {
  const sp = SPECIES[p.speciesId];
  const [hp, atk, def, spa, spd, spe] = sp.base;
  const m = p.meta;
  const lvlGrowth = 1 + (level - 1) * 0.012;

  const s: DerivedStats = {
    maxHp: (60 + hp * 0.9 + level * 1.5) * (1 + m.hp + m.friendHp),
    atk: statFactor(atk) * lvlGrowth * (1 + m.atk + m.friendDmg),
    spa: statFactor(spa) * lvlGrowth * (1 + m.spa + m.friendDmg),
    contactTaken: (100 / (100 + def * 0.6)) * (1 - m.contactDef),
    projTaken: (100 / (100 + spd * 0.6)) * (1 - m.projDef),
    speed: (105 + spe * 0.55) * (1 + m.speed),
    cooldown: 1 - m.cooldown,
    area: 1 + m.area,
    duration: 1,
    countBonus: 0,
    crit: 0.05 + m.crit,
    critDmg: 1.5,
    regen: 0,
    lifesteal: 0,
    exp: 1 + m.exp,
    money: 1 + m.money,
    thorns: 0,
    superEff: 0,
    flinch: 0,
    pickup: BASE_PICKUP * (1 + m.pickup),
    focus: 0,
    lifeOrb: 0,
    typeDmg: {},
    physDmg: 0,
    specDmg: 0,
  };

  for (const it of p.items) {
    const def = ITEMS[it.id];
    const v = def.perLevel * it.level;
    switch (def.stat) {
      case 'typeDmg': s.typeDmg[def.type!] = (s.typeDmg[def.type!] ?? 0) + v; break;
      case 'physDmg': s.physDmg += v; break;
      case 'specDmg': s.specDmg += v; break;
      case 'cooldown': s.cooldown *= 1 - v; break;
      case 'crit': s.crit += v; break;
      case 'critDmg': s.critDmg += v; break;
      case 'area': s.area += v; break;
      case 'regen': s.regen += v; break;
      case 'lifesteal': s.lifesteal += v; break;
      case 'exp': s.exp += v; break;
      case 'money': s.money += v; break;
      case 'thorns': s.thorns += v; break;
      case 'superEff': s.superEff += v; break;
      case 'flinch': s.flinch += v; break;
      case 'speed': s.speed *= 1 + v; break;
      case 'maxHp': s.maxHp *= 1 + v; break;
      case 'pickup': s.pickup *= 1 + v; break;
      case 'duration': s.duration += v; break;
      case 'count': s.countBonus = Math.floor(v + 1e-6); break;
      case 'focus': s.focus += v; break;
      case 'lifeOrb': s.lifeOrb += v; s.physDmg += v; s.specDmg += v; break;
    }
  }

  // Vitamins (taken on level-ups once the build is complete)
  const vit = (id: string) => vitaminBonus(id, p.vitamins[id] ?? 0);
  s.atk *= 1 + vit('protein');
  s.spa *= 1 + vit('calcium');
  s.maxHp *= 1 + vit('hp-up');
  s.contactTaken /= 1 + vit('iron');
  s.projTaken /= 1 + vit('zinc');
  s.speed *= 1 + vit('carbos');
  s.cooldown /= 1 + vit('pp-up');

  // Abilities
  let haste = 0;
  switch (p.ability) {
    case 'rain-dish': s.regen += 0.006; break;
    case 'levitate': s.contactTaken *= 0.6; s.speed *= 1.1; break;
    case 'magic-guard': s.contactTaken *= 0.8; s.projTaken *= 0.8; break;
    case 'sand-stream': s.contactTaken *= 0.85; s.projTaken *= 0.85; break;
    case 'speed-boost': haste += Math.min(0.45, Math.floor(time / 60) * 0.03); break;
    case 'unburden': if (time - p.lastHit > 4) { s.speed *= 1.25; haste += 0.15; } break;
    default: break;
  }

  for (const b of p.buffs) {
    switch (b.kind) {
      case 'atk': s.atk *= 1 + b.amount; s.speed *= 1.1; break;
      case 'spa': s.spa *= 1 + b.amount; break;
      case 'haste': haste += b.amount; break;
      case 'crit': s.crit += b.amount; break;
      case 'shield': s.contactTaken *= 1 - b.amount; s.projTaken *= 1 - b.amount; break;
      default: break;
    }
  }
  // Mega Evolution: everything goes up for a short while.
  if (p.megaT > 0) {
    s.atk *= 1.5; s.spa *= 1.5; s.area *= 1.2; s.speed *= 1.15; s.regen += 0.01;
    s.contactTaken *= 0.5; s.projTaken *= 0.5; s.crit += 0.1;
    haste += 0.35;
  }
  if (haste) {
    s.speed *= 1 + haste;
    s.cooldown /= 1 + haste;
  }
  s.cooldown = Math.max(0.35, s.cooldown);
  return s;
}
