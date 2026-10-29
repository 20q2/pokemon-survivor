import { LINE, SPECIES } from '../data/pokedex.ts';
import { MOVES, MAX_MOVE_LEVEL } from '../data/moves.ts';
import { ITEM_LIST } from '../data/items.ts';
import type { PType } from '../data/types.ts';
import { STAGE, type StageDef } from '../data/stages.ts';
import { Rng, dist2 } from '../engine/math.ts';
import { SpatialGrid } from '../engine/spatial.ts';
import type { MetaBonuses } from '../meta/shop.ts';
import { derivePlayerStats } from './stats.ts';
import { applyOffer, generateOffers, masteryCandidates, ownedUpgrades } from './levelup.ts';
import { fireMoves, updateProjectiles, damagePlayer } from './combat.ts';
import { Spawner, updateEnemies, killEnemy } from './enemies.ts';
import type {
  ChestReward, Enemy, GameEvent, Pickup, PickupKind, Player, Projectile, UpgradeOffer,
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
  players: PlayerInit[];
  seed?: number;
}

export type Phase = 'play' | 'levelup' | 'cine' | 'over' | 'victory';

export interface Cinematic {
  kind: 'evolve' | 'chest' | 'bossDown';
  t: number;
  dur: number;
  player: number;
  from?: string;
  to?: string;
  rewards?: ChestReward[];
  species?: string;
}

export const DT = 1 / 60;
export const MAX_ENEMIES = 520;

export function xpForLevel(level: number): number {
  let need = 5 + (level - 1) * 7;
  if (level > 20) need += (level - 20) * 6;
  if (level > 40) need += (level - 40) * 10;
  return need;
}

export class Sim {
  readonly stage: StageDef;
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
  offers = new Map<number, UpgradeOffer[]>();
  tms = new Map<number, string[]>();
  spawner: Spawner;
  /** Replication outboxes (filled only when `replicate` is on, drained by the host). */
  replicate = false;
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
    if (this.players.some((p) => p.pendingLevels > 0)) this.beginLevelUp();
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
      money: 0, evolutions: 0, masteries: 0, connected: true, viewW: 960, viewH: 540,
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
          p.hp = p.stats.maxHp * 0.5;
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
        if (b.kind === 'heal') p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * b.amount * dt);
        b.t -= dt;
        if (b.t <= 0) p.buffs.splice(i, 1);
      }
      if (p.stats.regen) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * p.stats.regen * dt);
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
      if (best) { best.value += value; return; }
    }
    const pk: Pickup = { id: this.id(), kind, x, y, value, vacuum: 0, vx: 0, vy: 0, t: 0, dead: false };
    if (kind !== 'candy') {
      const a = this.rng.range(0, Math.PI * 2);
      pk.vx = Math.cos(a) * 60;
      pk.vy = Math.sin(a) * 60;
    }
    this.pickups.push(pk);
    if (this.replicate) this.newPickups.push(pk);
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
        p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * (p.ability === 'multiscale' ? 0.5 : 0.25));
        break;
      case 'sitrus':
        for (const o of this.players) if (!o.fainted) o.hp = Math.min(o.stats.maxHp, o.hp + o.stats.maxHp * 0.5);
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
        this.openChest(p);
        break;
    }
    this.emit({ e: 'pickup', kind: pk.kind, player: p.id, value: pk.value });
  }

  // ───────────────────────────── progression ─────────────────────────────

  private checkProgress() {
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
    p.hp = p.stats.maxHp;
  }

  private startNextCine() {
    const c = this.cineQueue.shift();
    if (!c) return;
    this.cine = c;
    this.phase = 'cine';
    if (c.kind === 'evolve') this.emit({ e: 'evolve', player: c.player, from: c.from!, to: c.to! });
  }

  private updateCine(dt: number) {
    const c = this.cine!;
    c.t += dt;
    if (c.t < c.dur) return;
    if (c.kind === 'evolve') this.applyEvolution(this.players[c.player], c.to!);
    this.cine = null;
    if (this.cineQueue.length) return this.startNextCine();
    if (c.kind === 'bossDown' && this.finalDefeated) {
      this.phase = 'victory';
      return;
    }
    if (this.players.some((p) => p.pendingLevels > 0)) this.beginLevelUp();
    else this.phase = 'play';
  }

  queueCine(c: Cinematic) {
    this.cineQueue.push(c);
    if (this.phase === 'play') this.startNextCine();
  }

  beginLevelUp() {
    this.phase = 'levelup';
    for (const p of this.players) {
      if (p.pendingLevels > 0 && !this.offers.has(p.id)) this.offers.set(p.id, this.makeOffers(p));
    }
    if (this.offers.size === 0) this.phase = 'play';
  }

  private makeOffers(p: Player) {
    return generateOffers(p, this.rng, 3 + p.meta.choices, this.tms.get(p.id) ?? [], this.stage.types);
  }

  choose(playerId: number, index: number) {
    const offers = this.offers.get(playerId);
    const p = this.players[playerId];
    if (!offers || !p || !offers[index]) return;
    applyOffer(p, offers[index]);
    if (offers[index].kind === 'money') this.money += 25;
    this.afterChoice(p);
  }

  skip(playerId: number) {
    const p = this.players[playerId];
    if (!p || p.skips <= 0 || !this.offers.has(playerId)) return;
    p.skips--;
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.1);
    this.afterChoice(p);
  }

  reroll(playerId: number) {
    const p = this.players[playerId];
    if (!p || p.rerolls <= 0 || !this.offers.has(playerId)) return;
    p.rerolls--;
    this.offers.set(playerId, this.makeOffers(p));
  }

  banish(playerId: number, index: number) {
    const p = this.players[playerId];
    const offers = this.offers.get(playerId);
    if (!p || !offers || p.banishes <= 0 || !offers[index]) return;
    const o = offers[index];
    if (o.kind === 'heal' || o.kind === 'money') return;
    p.banishes--;
    p.banished.add(o.id);
    this.offers.set(playerId, this.makeOffers(p));
  }

  private afterChoice(p: Player) {
    p.pendingLevels--;
    this.offers.delete(p.id);
    this.refreshStats();
    if (p.pendingLevels > 0) this.offers.set(p.id, this.makeOffers(p));
    if (this.offers.size === 0) this.phase = 'play';
  }

  /** Chests master a ready move, otherwise grant 1/3/5 upgrades. */
  openChest(p: Player) {
    const rewards: ChestReward[] = [];
    const ready = masteryCandidates(p);
    if (ready.length) {
      const m = ready[0];
      const owned = p.moves.find((x) => x.id === m.from)!;
      owned.id = m.to;
      owned.level = MAX_MOVE_LEVEL;
      p.masteries++;
      rewards.push({ kind: 'mastery', id: m.to, from: m.from });
    } else {
      const roll = this.rng.next();
      const n = roll < 0.05 ? 5 : roll < 0.3 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        let ups = ownedUpgrades(p);
        // Nothing to level? Grant something new instead.
        if (!ups.length) ups = generateOffers(p, this.rng, 3, this.tms.get(p.id) ?? []).filter((o) => o.kind === 'newMove' || o.kind === 'newItem');
        if (!ups.length) break;
        const o = this.rng.pick(ups);
        applyOffer(p, o);
        const lvl = o.kind === 'newMove' || o.kind === 'newItem' ? 1 : o.level;
        rewards.push({ kind: o.kind === 'moveUp' || o.kind === 'newMove' ? 'move' : 'item', id: o.id, level: lvl });
        // A chest can complete a mastery chain mid-way: master immediately.
        const ready = masteryCandidates(p);
        if (ready.length) {
          const m = ready[0];
          const owned = p.moves.find((x) => x.id === m.from)!;
          owned.id = m.to;
          p.masteries++;
          rewards.push({ kind: 'mastery', id: m.to, from: m.from });
        }
      }
      if (!rewards.length) {
        this.money += 60;
        rewards.push({ kind: 'money', id: 'nugget', level: 60 });
      }
    }
    this.refreshStats();
    this.emit({ e: 'chest', player: p.id, rewards });
    this.queueCine({ kind: 'chest', t: 0, dur: 2.6, player: p.id, rewards });
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
