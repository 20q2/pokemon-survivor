import { LINE } from '../data/pokedex.ts';
import { MOVES, MASTERY_OF, MAX_MOVE_LEVEL } from '../data/moves.ts';
import { ITEMS, ITEM_LIST, MAX_ITEM_LEVEL } from '../data/items.ts';
import type { Rng } from '../engine/math.ts';
import { effectiveness, type PType } from '../data/types.ts';
import type { Player, UpgradeOffer } from './types.ts';

/** Move ids already represented (mastered moves also block their base move). */
function ownedMoveIds(p: Player): Set<string> {
  const s = new Set<string>();
  for (const m of p.moves) {
    s.add(m.id);
    const def = MOVES[m.id];
    if (def.mastery) s.add(def.mastery.from);
  }
  return s;
}

export function learnableMoves(p: Player, tms: readonly string[]): string[] {
  const line = LINE[p.lineId];
  const out = new Set<string>();
  for (const e of line.learnset) if (e.stage <= p.stage) out.add(e.move);
  const branch = line.branchMoves?.[p.speciesId];
  if (branch) for (const m of branch) out.add(m);
  for (const tm of tms) out.add(tm);
  return [...out].filter((id) => MOVES[id] && !MOVES[id].mastery);
}

/** How well a move type fares against a route's wild Pokémon (average multiplier). */
export function routeEffectiveness(type: PType, routeTypes: readonly PType[]): number {
  if (!routeTypes.length) return 1;
  let sum = 0;
  for (const t of routeTypes) sum += effectiveness(type, [t]);
  return sum / routeTypes.length;
}

export function generateOffers(
  p: Player,
  rng: Rng,
  count: number,
  tms: readonly string[],
  routeTypes: readonly PType[] = [],
): UpgradeOffer[] {
  const owned = ownedMoveIds(p);
  const cands: { o: UpgradeOffer; w: number }[] = [];
  const moveTypes = new Set(p.moves.map((m) => MOVES[m.id].type));

  for (const m of p.moves) {
    if (m.level < MAX_MOVE_LEVEL && !MOVES[m.id].mastery && !p.banished.has(m.id))
      cands.push({ o: { kind: 'moveUp', id: m.id, level: m.level + 1 }, w: 10 });
  }
  if (p.moves.length < p.moveSlots) {
    for (const id of learnableMoves(p, tms)) {
      if (owned.has(id) || p.banished.has(id)) continue;
      const def = MOVES[id];
      let w = 7;
      if (p.types.includes(def.type)) w += 3;
      if (p.moves.length <= 1) w += 6;
      if (def.cat === 'status' && p.moves.length < 2) w *= 0.3;
      if (def.cat !== 'status') {
        // Lean toward coverage that works on this route.
        const eff = routeEffectiveness(def.type, routeTypes);
        w *= eff > 1.15 ? 1.7 : eff < 0.8 ? 0.55 : 1;
      }
      cands.push({ o: { kind: 'newMove', id, level: 1 }, w });
    }
  }
  for (const it of p.items) {
    if (it.level < MAX_ITEM_LEVEL && !p.banished.has(it.id))
      cands.push({ o: { kind: 'itemUp', id: it.id, level: it.level + 1 }, w: 7 });
  }
  if (p.items.length < p.itemSlots) {
    const have = new Set(p.items.map((i) => i.id));
    for (const def of ITEM_LIST) {
      if (have.has(def.id) || p.banished.has(def.id)) continue;
      let w = 3.5;
      if (def.stat === 'typeDmg') {
        if (moveTypes.has(def.type!)) {
          w = 6;
          // Strongly hint the mastery path when its base move is owned.
          if (p.moves.some((m) => MASTERY_OF[m.id]?.mastery?.item === def.id)) w = 9;
        } else w = 0.6;
      }
      cands.push({ o: { kind: 'newItem', id: def.id, level: 1 }, w });
    }
  }

  const out: UpgradeOffer[] = [];
  while (out.length < count && cands.length) {
    const pick = rng.weighted(cands, (c) => c.w);
    if (!pick) break;
    out.push(pick.o);
    cands.splice(cands.indexOf(pick), 1);
  }
  if (out.length === 0) out.push({ kind: 'heal', id: 'oran-berry', level: 0 });
  if (out.length < count && !out.some((o) => o.kind === 'heal')) out.push({ kind: 'heal', id: 'oran-berry', level: 0 });
  if (out.length < count) out.push({ kind: 'money', id: 'nugget', level: 0 });
  return out;
}

export function applyOffer(p: Player, o: UpgradeOffer) {
  switch (o.kind) {
    case 'newMove':
      if (p.moves.length < p.moveSlots && !p.moves.some((m) => m.id === o.id))
        p.moves.push({ id: o.id, level: 1, cd: 0.3, dmgDealt: 0, kills: 0 });
      break;
    case 'moveUp': {
      const m = p.moves.find((x) => x.id === o.id);
      if (m) m.level = Math.min(MAX_MOVE_LEVEL, m.level + 1);
      break;
    }
    case 'newItem':
      if (p.items.length < p.itemSlots && !p.items.some((i) => i.id === o.id)) p.items.push({ id: o.id, level: 1 });
      break;
    case 'itemUp': {
      const it = p.items.find((x) => x.id === o.id);
      if (it) it.level = Math.min(MAX_ITEM_LEVEL, it.level + 1);
      break;
    }
    case 'heal':
      p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.3);
      break;
    case 'money':
      p.money += 25;
      break;
  }
}

/** Level-ups for things the player already owns (used by treasure chests). */
export function ownedUpgrades(p: Player): UpgradeOffer[] {
  const out: UpgradeOffer[] = [];
  for (const m of p.moves) if (m.level < MAX_MOVE_LEVEL && !MOVES[m.id].mastery) out.push({ kind: 'moveUp', id: m.id, level: m.level + 1 });
  for (const it of p.items) if (it.level < MAX_ITEM_LEVEL) out.push({ kind: 'itemUp', id: it.id, level: it.level + 1 });
  return out;
}

/** Moves that are ready to master: max level + matching held item. */
export function masteryCandidates(p: Player): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const m of p.moves) {
    const target = MASTERY_OF[m.id];
    if (!target || m.level < MAX_MOVE_LEVEL) continue;
    if (p.items.some((i) => i.id === target.mastery!.item)) out.push({ from: m.id, to: target.id });
  }
  return out;
}

export function offerLabel(o: UpgradeOffer): string {
  switch (o.kind) {
    case 'newMove': case 'moveUp': return MOVES[o.id].name;
    case 'newItem': case 'itemUp': return ITEMS[o.id].name;
    case 'heal': return 'Oran Berry';
    case 'money': return 'Nugget';
  }
}

