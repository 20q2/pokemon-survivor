import { LINE } from '../data/pokedex.ts';
import { MOVES, MASTERY_OF, MAX_MOVE_LEVEL } from '../data/moves.ts';
import { ITEMS, ITEM_LIST, MAX_ITEM_LEVEL, VITAMIN, VITAMINS } from '../data/items.ts';
import type { Rng } from '../engine/math.ts';
import { effectiveness, type PType } from '../data/types.ts';
import { heal } from './ledger.ts';
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
  const form = line.formMoves?.[p.speciesId];
  if (form) for (const m of form) out.add(m);
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
        } else w = 0.12;
      }
      cands.push({ o: { kind: 'newItem', id: def.id, level: 1 }, w });
    }
  }

  // A finished moveset can limit-break while items still level: the endgame power should not wait on seven item tiers.
  if (p.moves.length >= p.moveSlots && !p.moves.some((m) => m.level < MAX_MOVE_LEVEL && !MOVES[m.id].mastery))
    for (const c of limitBreaks(p)) cands.push({ o: c, w: 4 });

  const out: UpgradeOffer[] = [];
  while (out.length < count && cands.length) {
    const pick = rng.weighted(cands, (c) => c.w);
    if (!pick) break;
    out.push(pick.o);
    cands.splice(cands.indexOf(pick), 1);
  }
  // Nothing left to upgrade: keep every level meaningful with limit breaks and vitamins
  // (both grow linearly for a while, then logarithmically, so they never run out).
  if (out.length < count && p.hp < p.stats.maxHp * 0.4) out.push({ kind: 'heal', id: 'oran-berry', level: 0 });
  if (out.length < count) out.push(...pickFillers(p, rng, count - out.length));
  return out;
}

function limitBreaks(p: Player): UpgradeOffer[] {
  return p.moves
    .filter((m) => m.level >= MAX_MOVE_LEVEL || MOVES[m.id].mastery)
    .filter((m) => MOVES[m.id].cat !== 'status' && !p.banished.has(m.id))
    .map((m): UpgradeOffer => ({ kind: 'moveUp', id: m.id, level: Math.max(m.level, MAX_MOVE_LEVEL) + 1 }));
}

function pickFillers(p: Player, rng: Rng, n: number): UpgradeOffer[] {
  const cands: { o: UpgradeOffer; w: number }[] = limitBreaks(p).map((o) => ({ o, w: 2.2 }));
  for (const o of pickVitamins(p, rng, VITAMINS.length)) cands.push({ o, w: 1 });
  const out: UpgradeOffer[] = [];
  while (out.length < n && cands.length) {
    const c = rng.weighted(cands, (x) => x.w)!;
    cands.splice(cands.indexOf(c), 1);
    out.push(c.o);
  }
  return out;
}

function pickVitamins(p: Player, rng: Rng, n: number): UpgradeOffer[] {
  let phys = 0, spec = 0;
  for (const m of p.moves) {
    const c = MOVES[m.id].cat;
    if (c === 'physical') phys++;
    else if (c === 'special') spec++;
  }
  const cands = VITAMINS.map((v) => ({
    v, w: v.id === 'protein' ? 1 + phys * 1.5 : v.id === 'calcium' ? 1 + spec * 1.5 : v.id === 'hp-up' ? 2 : 1.5,
  }));
  const out: UpgradeOffer[] = [];
  while (out.length < n && cands.length) {
    const c = rng.weighted(cands, (x) => x.w)!;
    cands.splice(cands.indexOf(c), 1);
    out.push({ kind: 'vitamin', id: c.v.id, level: (p.vitamins[c.v.id] ?? 0) + 1 });
  }
  return out;
}

/** A random limit break or vitamin (used by treasure once the build is complete). */
export function randomFiller(p: Player, rng: Rng): UpgradeOffer {
  return pickFillers(p, rng, 1)[0];
}

/**
 * The move a partner learns on evolving: one its new form unlocks (or, for alternate final
 * forms like the Eeveelutions, that form's signature set), preferring damaging same-type moves
 * it doesn't know yet.
 */
export function evolutionMove(p: Player): string | null {
  const line = LINE[p.lineId];
  const pool = line.formMoves?.[p.speciesId] ?? line.learnset.filter((e) => e.stage === p.stage).map((e) => e.move);
  const owned = ownedMoveIds(p);
  const cands = pool.filter((id) => MOVES[id] && !MOVES[id].mastery && !owned.has(id));
  if (!cands.length) return null;
  const score = (id: string) => (MOVES[id].cat === 'status' ? 0 : 2) + (p.types.includes(MOVES[id].type) ? 1 : 0);
  return cands.reduce((best, id) => (score(id) > score(best) ? id : best), cands[0]);
}

/** "X wants to learn Y": forget one of the four moves, or don't learn it. */
export function learnOffers(p: Player, move: string): UpgradeOffer[] {
  return [...p.moves.map((_, i): UpgradeOffer => ({ kind: 'forget', id: move, level: i })), { kind: 'keep', id: move, level: 0 }];
}

export function applyOffer(p: Player, o: UpgradeOffer) {
  switch (o.kind) {
    case 'newMove':
      if (p.moves.length < p.moveSlots && !p.moves.some((m) => m.id === o.id))
        p.moves.push({ id: o.id, level: 1, cd: 0.3, dmgDealt: 0, kills: 0 });
      break;
    case 'moveUp': {
      const m = p.moves.find((x) => x.id === o.id);
      if (m) m.level++;
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
      heal(p, p.stats.maxHp * 0.3, 'oran');
      break;
    case 'forget': {
      // The new move takes the old one's place and keeps its level, so nothing is lost.
      const old = p.moves[o.level];
      if (old) p.moves[o.level] = { id: o.id, level: Math.max(1, Math.min(MAX_MOVE_LEVEL, old.level)), cd: 0.3, dmgDealt: 0, kills: 0 };
      p.pendingLearn = undefined;
      break;
    }
    case 'keep':
      p.pendingLearn = undefined;
      break;
    case 'vitamin':
      p.vitamins[o.id] = (p.vitamins[o.id] ?? 0) + 1;
      if (o.id === 'hp-up') heal(p, p.stats.maxHp * 0.25, 'hp-up');
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
    case 'vitamin': return VITAMIN[o.id].name;
    case 'forget': return `Learn ${MOVES[o.id].name}`;
    case 'keep': return `Don't learn ${MOVES[o.id].name}`;
  }
}

