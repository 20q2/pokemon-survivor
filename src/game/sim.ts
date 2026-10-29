import { LINE, SPECIES } from '../data/pokedex.ts';
import { MOVES, MAX_MOVE_LEVEL } from '../data/moves.ts';
import { ITEM_LIST } from '../data/items.ts';
import type { PType } from '../data/types.ts';
import { STAGE, type StageDef } from '../data/stages.ts';
import { Rng, dist2 } from '../engine/math.ts';
import { SpatialGrid } from '../engine/spatial.ts';
import type { MetaBonuses } from '../meta/shop.ts';
import { derivePlayerStats } from './stats.ts';
import { applyOffer, generateOffers, masteryCandidates, randomFiller, evolutionMove, learnOffers, ownedUpgrades } from './levelup.ts';
import { fireMoves, updateProjectiles, damagePlayer } from './combat.ts';
import { activateMega, updateMega } from './mega.ts';
import { Spawner, updateEnemies, killEnemy } from './enemies.ts';
import { heal, newLedger } from './ledger.ts';
import type {
  ChestReward, ChestTier, Enemy, GameEvent, Pickup, PickupKind, Player, Projectile, UpgradeOffer,
} from './types.ts';

export interface PlayerInit {
  name: string;
  lineId: string;
  shiny: boolean;
  meta: MetaBonuses;
  tms: string[];
}

export interface SimConfig {
  stageId: string;
  /** Elite mode: tougher, denser waves for more Poké Dollars. */
  elite?: boolean;
  players: PlayerInit[];
  seed?: number;
}

export type Phase = 'play' | 'levelup' | 'cine' | 'over' | 'victory';

export interface Cinematic {
  kind: 'evolve' | 'chest' | 'bossDown' | 'mega';
  t: number;
  dur: number;
  player: number;
  from?: string;
  to?: string;
  rewards?: ChestReward[];
  tier?: ChestTier;
  species?: string;
}

export const DT = 1 / 60;

/** A player has a level-up or a move to learn waiting. */
const needsChoice = (p: Player) => p.pendingLevels > 0 || !!p.pendingLearn;

/**
 * Treasure show timing (seconds from the start): the ball wobbles and opens at `open`, rewards
 * pop out one by one and have all landed by `reveal`. Players must look for at least a second,
 * may then dismiss it, and are moved on automatically 5 seconds after that (`autoClose`).
 */
export function chestTiming(n: number) {
  const open = 1.5;
  const reveal = open + 0.45 + 0.55 * n + 0.15;
  return { open, reveal, autoClose: reveal + 6 };
}

export const MAX_ENEMIES = 520;

export function xpForLevel(level: number): number {
  // Snappy first levels, then a quadratic curve so the build fills out over the whole run.
  const k = level - 1;
  return Math.round(6 + 5 * k + 1.2 * k * k + (k > 24 ? 0.08 * (k - 24) ** 3 : 0));
}

export class Sim {
  readonly stage: StageDef;
  readonly elite: boolean;
  readonly rng: Rng;
  readonly grid = new SpatialGrid<Enemy>(48);
  time = 0;
  phase: Phase = 'play';
  cine: Cinematic | null = null;
  cineQueue: Cinematic[] = [];
  players: Player[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  events: GameEvent[] = [];
  level = 1;
  xp = 0;
  xpNext = xpForLevel(1);
  money = 0;
  kills = 0;
  bossesDefeated = 0;
  finalDefeated = false;
  /** The team found the Mega Stone: fully evolved partners charge Mega Evolution. */
  megaStone = false;
  offers = new Map<number, UpgradeOffer[]>();
  tms = new Map<number, string[]>();
  spawner: Spawner;
  /** Replication outboxes (filled only when `replicate` is on, drained by the host). */
  replicate = false;
  /** Fraction of a fixed step elapsed since the last update (render interpolation). */
  alpha = 1;
  newProj: Projectile[] = [];
  deadProj: number[] = [];
  newPickups: Pickup[] = [];
  deadPickups: { id: number; by: number }[] = [];
  private nextId = 1;
  /** Remote players' positions are authoritative from their clients. */
  remoteControlled = new Set<number>();
  seenSpecies = new Set<string>();
  /** Dev/testing: players take no damage. */
  invulnerable = false;
  /** Mirrors every emitted event (network host). */
  eventTap: ((e: GameEvent) => void) | null = null;
  defeatedSpecies = new Map<string, number>();

  constructor(cfg: SimConfig) {
    this.stage = STAGE[cfg.stageId];
    this.elite = !!cfg.elite;
    this.rng = new Rng(cfg.seed);
    this.spawner = new Spawner(this);
    cfg.players.forEach((pi, slot) => this.addPlayer(pi, slot));
    for (const p of this.players) {
      if (p.meta.friendStartItem) {
        const it = this.rng.pick(ITEM_LIST.filter((i) => i.stat !== 'typeDmg'));
        p.items.push({ id: it.id, level: 1 });
      }
      p.pendingLevels = p.meta.startLevels;
    }
    const startLevels = Math.max(...this.players.map((p) => p.meta.startLevels));
    this.level += startLevels;
    this.xpNext = xpForLevel(this.level);
    this.refreshStats();
    for (const p of this.players) p.hp = p.stats.maxHp;
    if (this.players.some(needsChoice)) this.beginLevelUp();
  }

  id() {
    return this.nextId++;
  }

  get aliveCount() {
    return this.players.filter((p) => !p.fainted && p.connected).length;
  }

  private addPlayer(pi: PlayerInit, slot: number) {
    const line = LINE[pi.lineId];
    const sp = SPECIES[line.stages[0]];
    const angle = (slot / 4) * Math.PI * 2;
    const p: Player = {
      id: slot, slot, name: pi.name, lineId: line.id, speciesId: sp.id, stage: 0, shiny: pi.shiny,
      types: [...sp.types], ability: line.ability,
      x: slot ? Math.cos(angle) * 40 : 0, y: slot ? Math.sin(angle) * 40 : 0, radius: 10,
      mx: 0, my: 0, fx: 1, fy: 0, moving: false, hp: 1,
      moves: [{ id: line.starter, level: 1, cd: 0.5, dmgDealt: 0, kills: 0 }],
      items: [], buffs: [], stats: undefined as never, meta: pi.meta,
      moveSlots: 4, itemSlots: 4 + pi.meta.itemSlots,
      rerolls: pi.meta.rerolls, skips: pi.meta.skips, banishes: pi.meta.banishes, banished: new Set(),
      revives: pi.meta.revives, fainted: false, reviveProgress: 0, hurtT: 0, lastHit: -99,
      pendingLevels: 0, kills: 0, dmgDealt: 0, dmgTaken: 0, bossKills: 0, superEff: 0, shinyKills: 0,
      vitamins: {}, ledger: newLedger(), evolutions: 0, masteries: 0, connected: true, viewW: 960, viewH: 540, mega: 0, megaT: 0, megas: 0,
    };
    this.tms.set(p.id, pi.tms);
    this.players.push(p);
  }

  refreshStats() {
    for (const p of this.players) {
      const prevMax = p.stats?.maxHp;
      p.stats = derivePlayerStats(p, this.level, this.time);
      if (prevMax && p.stats.maxHp > prevMax) p.hp += p.stats.maxHp - prevMax;
      p.hp = Math.min(p.hp, p.stats.maxHp);
    }
  }

  emit(e: GameEvent) {
    this.events.push(e);
    this.eventTap?.(e);
  }

  // ───────────────────────────── main loop ─────────────────────────────

  update(dt: number) {
    if (this.phase === 'cine') return this.updateCine(dt);
    if (this.phase !== 'play') return;
    this.time += dt;
    for (const p of this.players) { p.px = p.x; p.py = p.y; }
    for (const e of this.enemies) { e.px = e.x; e.py = e.y; }
    for (const pr of this.projectiles) { pr.px = pr.x; pr.py = pr.y; }
    this.refreshStats();
    this.updatePlayers(dt);
    this.spawner.update(dt);
    updateEnemies(this, dt);
    this.rebuildGrid();
    fireMoves(this, dt);
    updateProjectiles(this, dt);
    this.updatePickups(dt);
    this.cleanup();
    this.checkProgress();
  }

  rebuildGrid() {
    this.grid.clear();
    for (const e of this.enemies) if (e.alive) this.grid.insert(e);
  }

  private updatePlayers(dt: number) {
    for (const p of this.players) {
      p.hurtT = Math.max(0, p.hurtT - dt);
      if (p.fainted) {
        // Teammates standing close revive a fainted player.
        const helper = this.players.find((o) => o !== p && !o.fainted && dist2(o.x, o.y, p.x, p.y) < 50 * 50);
        p.reviveProgress = helper ? p.reviveProgress + dt : Math.max(0, p.reviveProgress - dt * 0.5);
        if (p.reviveProgress >= 3) {
          p.fainted = false;
          p.reviveProgress = 0;
          p.hp = 0;
          heal(p, p.stats.maxHp * 0.5, 'revive', helper ?? p);
          this.emit({ e: 'revive', player: p.id });
        }
        continue;
      }
      if (!this.remoteControlled.has(p.id)) {
        const len = Math.hypot(p.mx, p.my);
        p.moving = len > 0.05;
        if (p.moving) {
          p.x += p.mx * p.stats.speed * dt;
          p.y += p.my * p.stats.speed * dt;
          p.fx = p.mx / len;
          p.fy = p.my / len;
        }
      }
      // buffs
      for (let i = p.buffs.length - 1; i >= 0; i--) {
        const b = p.buffs[i];
        if (b.kind === 'heal') heal(p, p.stats.maxHp * b.amount * dt, b.src ?? 'buff');
        b.t -= dt;
        if (b.t <= 0) p.buffs.splice(i, 1);
      }
      updateMega(this, p, dt);
      if (p.stats.regen) heal(p, p.stats.maxHp * p.stats.regen * dt, 'regen');
      if (p.stats.lifeOrb && p.ability !== 'magic-guard')
        p.hp = Math.max(1, p.hp - p.stats.maxHp * 0.004 * dt * (p.stats.lifeOrb / 0.08));
    }
  }

  // ───────────────────────────── pickups ─────────────────────────────

  spawnPickup(kind: PickupKind, x: number, y: number, value = 1) {
    if (kind === 'candy' && this.pickups.length > 380) {
      // Merge into an existing nearby candy to keep things cheap.
      let best: Pickup | undefined;
      let bd = 260 * 260;
      for (const pk of this.pickups) {
        if (pk.kind !== 'candy' || pk.vacuum || pk.dead) continue;
        const d = dist2(pk.x, pk.y, x, y);
        if (d < bd) { bd = d; best = pk; }
      }
      if (best) { best.value += value; return best; }
    }
    const pk: Pickup = { id: this.id(), kind, x, y, value, vacuum: 0, vx: 0, vy: 0, t: 0, dead: false };
    if (kind !== 'candy') {
      const a = this.rng.range(0, Math.PI * 2);
      pk.vx = Math.cos(a) * 60;
      pk.vy = Math.sin(a) * 60;
    }
    this.pickups.push(pk);
    if (this.replicate) this.newPickups.push(pk);
    return pk;
  }

  private updatePickups(dt: number) {
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.t += dt;
      if (pk.vx || pk.vy) {
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
        pk.vx *= 0.9;
        pk.vy *= 0.9;
        if (Math.abs(pk.vx) < 1) pk.vx = pk.vy = 0;
      }
      if (pk.vacuum) {
        const p = this.players[pk.vacuum - 1];
        if (!p || p.fainted) { pk.vacuum = 0; continue; }
        const dx = p.x - pk.x, dy = p.y - pk.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 220 + pk.t * 500;
        pk.x += (dx / d) * Math.min(d, sp * dt);
        pk.y += (dy / d) * Math.min(d, sp * dt);
        if (d < 12) this.collect(pk, p);
        continue;
      }
      for (const p of this.players) {
        if (p.fainted) continue;
        const r = pk.kind === 'candy' || pk.kind === 'coin' ? p.stats.pickup : 22;
        if (dist2(p.x, p.y, pk.x, pk.y) < r * r) {
          pk.vacuum = p.id + 1;
          pk.t = 0;
          break;
        }
      }
    }
  }

  private collect(pk: Pickup, p: Player) {
    pk.dead = true;
    if (this.replicate) this.deadPickups.push({ id: pk.id, by: p.id });
    switch (pk.kind) {
      case 'candy':
        this.xp += pk.value * p.stats.exp;
        break;
      case 'coin':
        this.money += pk.value;
        break;
      case 'oran':
      case 'sitrus':
        this.eatBerry(p, pk.kind);
        break;
      case 'magnet':
        for (const c of this.pickups) if (!c.dead && (c.kind === 'candy' || c.kind === 'coin')) { c.vacuum = p.id + 1; c.t = 0; }
        break;
      case 'repel':
        this.emit({ e: 'repel' });
        for (const e of this.enemies) {
          if (!e.alive || e.boss || e.elite) continue;
          if (Math.abs(e.x - p.x) < p.viewW / 2 + 40 && Math.abs(e.y - p.y) < p.viewH / 2 + 40) killEnemy(this, e, p.id);
        }
        break;
      case 'rare-candy':
        this.xp += this.xpNext - this.xp + 0.01;
        break;
      case 'chest':
        this.openChest(p, Math.max(1, Math.min(4, Math.round(pk.value))) as ChestTier);
        break;
      case 'mega-stone':
        this.megaStone = true;
        this.emit({ e: 'megaStone', player: p.id });
        break;
    }
    this.emit({ e: 'pickup', kind: pk.kind, player: p.id, value: pk.value });
  }

  // ───────────────────────────── progression ─────────────────────────────

  private checkProgress() {
    // A cinematic started this tick (boss down, chest…): resolve level-ups after it ends.
    if (this.phase === 'cine') return;
    if (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level);
      for (const p of this.players) p.pendingLevels++;
      this.emit({ e: 'levelup', level: this.level });
      this.queueEvolutions();
      this.refreshStats();
      if (this.cineQueue.length) this.startNextCine();
      else this.beginLevelUp();
      return;
    }
    if (this.players.every((p) => p.fainted || !p.connected)) {
      this.phase = 'over';
    }
  }

  private queueEvolutions() {
    for (const p of this.players) {
      const line = LINE[p.lineId];
      const need = line.evoLevels[p.stage];
      if (need === undefined || this.level < need) continue;
      let to = line.stages[p.stage + 1];
      if (line.branch) to = this.pickBranch(p);
      if (!to) continue;
      this.cineQueue.push({ kind: 'evolve', t: 0, dur: 3.2, player: p.id, from: p.speciesId, to });
    }
  }

  /** Eevee: evolve into the Eeveelution of the dominant move type (weighted by move level). */
  private pickBranch(p: Player): string {
    const line = LINE[p.lineId];
    const score = new Map<PType, number>();
    for (const m of p.moves) {
      const t = MOVES[m.id].type;
      if (line.branch![t]) score.set(t, (score.get(t) ?? 0) + m.level);
    }
    let best: PType | undefined;
    let bs = 0;
    for (const [t, s] of score) if (s > bs) { bs = s; best = t; }
    const opts = Object.values(line.branch!) as string[];
    return best ? line.branch![best]! : this.rng.pick(opts);
  }

  private applyEvolution(p: Player, to: string) {
    const sp = SPECIES[to];
    p.speciesId = to;
    p.stage++;
    p.types = [...sp.types];
    p.evolutions++;
    this.refreshStats();
    heal(p, p.stats.maxHp, 'evolve');
    // Evolving teaches a new move; with four moves already, the player picks one to forget.
    const learn = evolutionMove(p);
    if (!learn) return;
    if (p.moves.length < p.moveSlots) {
      p.moves.push({ id: learn, level: 1, cd: 0.3, dmgDealt: 0, kills: 0 });
      this.emit({ e: 'learn', player: p.id, move: learn });
    } else p.pendingLearn = learn;
  }

  private startNextCine() {
    const c = this.cineQueue.shift();
    if (!c) return;
    this.cine = c;
    this.phase = 'cine';
    if (c.kind === 'evolve') this.emit({ e: 'evolve', player: c.player, from: c.from!, to: c.to! });
  }

  /** Solo only: end the current treasure/boss cinematic (the treasure UI enforces its viewing minimum). */
  skipCine() {
    const c = this.cine;
    if (!c || c.kind === 'evolve' || c.kind === 'mega' || c.t < 1) return;
    c.t = Math.max(c.t, c.dur - 0.05);
  }

  private updateCine(dt: number) {
    const c = this.cine!;
    c.t += dt;
    if (c.t < c.dur) return;
    if (c.kind === 'evolve') this.applyEvolution(this.players[c.player], c.to!);
    if (c.kind === 'mega') activateMega(this, this.players[c.player]);
    this.cine = null;
    if (this.cineQueue.length) return this.startNextCine();
    if (this.finalDefeated) {
      this.phase = 'victory';
      return;
    }
    if (this.players.some(needsChoice)) this.beginLevelUp();
    else this.phase = 'play';
  }

  queueCine(c: Cinematic) {
    this.cineQueue.push(c);
    if (this.phase === 'play') this.startNextCine();
  }

  beginLevelUp() {
    this.phase = 'levelup';
    for (const p of this.players) {
      if (needsChoice(p) && !this.offers.has(p.id)) this.offers.set(p.id, this.makeOffers(p));
    }
    if (this.offers.size === 0) this.phase = 'play';
  }

  private makeOffers(p: Player) {
    if (p.pendingLearn) return learnOffers(p, p.pendingLearn);
    return generateOffers(p, this.rng, 3, this.tms.get(p.id) ?? [], this.stage.types);
  }

  choose(playerId: number, index: number) {
    const offers = this.offers.get(playerId);
    const p = this.players[playerId];
    if (!offers || !p || !offers[index]) return;
    const o = offers[index];
    applyOffer(p, o);
    if (o.kind === 'forget') this.emit({ e: 'learn', player: p.id, move: o.id });
    if (o.kind === 'forget' || o.kind === 'keep') return this.afterChoice(p, false);
    if (o.kind === 'newMove') this.emit({ e: 'learn', player: p.id, move: o.id });
    this.afterChoice(p);
  }

  skip(playerId: number) {
    const p = this.players[playerId];
    if (!p || p.skips <= 0 || !this.offers.has(playerId) || p.pendingLearn) return;
    p.skips--;
    heal(p, p.stats.maxHp * 0.1, 'skip');
    this.afterChoice(p);
  }

  reroll(playerId: number) {
    const p = this.players[playerId];
    if (!p || p.rerolls <= 0 || !this.offers.has(playerId) || p.pendingLearn) return;
    p.rerolls--;
    this.offers.set(playerId, this.makeOffers(p));
  }

  banish(playerId: number, index: number) {
    const p = this.players[playerId];
    const offers = this.offers.get(playerId);
    if (!p || !offers || p.banishes <= 0 || !offers[index]) return;
    const o = offers[index];
    if (o.kind === 'heal' || o.kind === 'vitamin') return;
    p.banishes--;
    p.banished.add(o.id);
    this.offers.set(playerId, this.makeOffers(p));
  }

  private afterChoice(p: Player, levelUsed = true) {
    if (levelUsed) p.pendingLevels--;
    this.offers.delete(p.id);
    this.refreshStats();
    if (needsChoice(p)) this.offers.set(p.id, this.makeOffers(p));
    if (this.offers.size === 0) this.phase = 'play';
  }

  /**
   * Open a treasure. The ball's tier sets how many rewards it holds (Poké 1, sometimes 2;
   * Great 2, sometimes 3; Ultra 3, sometimes 5; Master 5). A move that is ready to master is always mastered
   * first; small balls give only the mastery, Ultra and Master balls give it on top.
   */
  openChest(p: Player, tier: ChestTier = 1) {
    const rewards: ChestReward[] = [];
    const master = () => {
      const ready = masteryCandidates(p);
      if (!ready.length) return false;
      const m = ready[0];
      const owned = p.moves.find((x) => x.id === m.from)!;
      owned.id = m.to;
      owned.level = Math.max(owned.level, MAX_MOVE_LEVEL);
      p.masteries++;
      rewards.push({ kind: 'mastery', id: m.to, from: m.from });
      return true;
    };
    const mastered = master();
    const roll = this.rng.next();
    let n = tier === 1 ? (roll < 0.1 ? 2 : 1) : tier === 2 ? (roll < 0.15 ? 3 : 2) : tier === 3 ? (roll < 0.2 ? 5 : 3) : 5;
    if (mastered && tier <= 2) n = 0;
    let healed = false;
    for (let i = 0; i < n; i++) {
      let ups = ownedUpgrades(p);
      // Nothing to level? Grant something new instead.
      if (!ups.length) ups = generateOffers(p, this.rng, 3, this.tms.get(p.id) ?? []).filter((o) => o.kind === 'newMove' || o.kind === 'newItem');
      // A complete build still gets something: a berry when hurt, a little gold, or a limit break / vitamin.
      if (!ups.length) {
        if (!healed && p.hp < p.stats.maxHp * 0.7) {
          healed = true;
          const berry = tier >= 3 ? 'sitrus' : 'oran';
          this.eatBerry(p, berry);
          rewards.push({ kind: 'heal', id: `${berry}-berry` });
          continue;
        }
        if (this.rng.chance(0.35)) {
          const amount = 5 + tier * 5;
          this.money += amount;
          rewards.push({ kind: 'gold', id: 'nugget', level: amount });
          continue;
        }
        ups = [randomFiller(p, this.rng)];
      }
      const o = this.rng.pick(ups);
      applyOffer(p, o);
      const lvl = o.kind === 'newMove' || o.kind === 'newItem' ? 1 : o.level;
      rewards.push({ kind: o.kind === 'moveUp' || o.kind === 'newMove' ? 'move' : o.kind === 'vitamin' ? 'vitamin' : 'item', id: o.id, level: lvl });
      master(); // a reward can complete a mastery chain mid-way
    }
    // A mastery always shows as a Master Ball.
    const shown: ChestTier = rewards.some((r) => r.kind === 'mastery') ? 4 : tier;
    this.refreshStats();
    this.emit({ e: 'chest', player: p.id, rewards, tier: shown });
    // A little gold rides along with every treasure.
    this.money += 2 + tier * 2;
    // Solo: wait for the player to dismiss it (auto after 5 s). Co-op pauses everyone, so it moves on sooner.
    const timing = chestTiming(rewards.length);
    const dur = this.players.length > 1 ? timing.reveal + 2 : timing.autoClose;
    this.queueCine({ kind: 'chest', t: 0, dur, player: p.id, rewards, tier: shown });
  }

  /** Oran heals the eater; Sitrus heals the whole party. */
  private eatBerry(p: Player, kind: 'oran' | 'sitrus') {
    if (kind === 'oran') heal(p, p.stats.maxHp * (p.ability === 'multiscale' ? 0.5 : 0.25), 'oran');
    else for (const o of this.players) heal(o, o.stats.maxHp * 0.5, 'sitrus', p);
  }


  // ───────────────────────────── cleanup ─────────────────────────────

  private cleanup() {
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.projectiles.some((p) => p.dead)) {
      const keep: Projectile[] = [];
      for (const p of this.projectiles) {
        if (!p.dead) keep.push(p);
        else if (this.replicate) this.deadProj.push(p.id);
      }
      this.projectiles = keep;
    }
    if (this.pickups.some((p) => p.dead)) this.pickups = this.pickups.filter((p) => !p.dead);
  }

  /** Exposed so combat/enemy modules can hurt players. */
  hurtPlayer(p: Player, raw: number, type: PType, special: boolean) {
    damagePlayer(this, p, raw, type, special);
  }

  nearestPlayer(x: number, y: number): Player | undefined {
    let best: Player | undefined;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.fainted || !p.connected) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
