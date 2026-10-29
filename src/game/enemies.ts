import { SPECIES } from '../data/pokedex.ts';
import { ENEMY_ROLE, RUN_LENGTH, type BossDef, type EnemyRole, type SpawnEntry, type WaveDef, type WaveEvent, eventTimes, waveAt } from '../data/stages.ts';
import { TAU, dist2 } from '../engine/math.ts';
import { freshStatus, makeProjectile, rawDamageEnemy } from './combat.ts';
import { megaOnKill } from './mega.ts';
import { RAID_MOVES, alphaNextMove, castRaid, eliteMove, markCharge, spawnHazard, type RaidMove } from './hazards.ts';
import type { Sim } from './sim.ts';
import { MAX_ENEMIES } from './sim.ts';
import type { Enemy, Player, Projectile } from './types.ts';
import { heal } from './ledger.ts';

const ROLE_HP: Record<EnemyRole, number> = { chaser: 1, fast: 0.7, tank: 2.4, ranged: 1, bomber: 0.8, treasure: 6 };
const ROLE_SPEED: Record<EnemyRole, number> = { chaser: 1, fast: 1.4, tank: 0.7, ranged: 0.95, bomber: 1.15, treasure: 1.25 };

/** aiState doubles as per-role state (bosses, bombers, alphas); these are the shared values. */
export const AI = { BOMBER_FUSE: 1, CROSSER: 9, WALL: 10 } as const;
/** Elites cast raid attacks only after this run time; the first half is pure crowd-shepherding. */
const ELITE_RAID_FROM = 360;
/** Raid cooldown (s) for wave elites vs guardians. */
const ELITE_RAID_CD: [number, number] = [12, 16];
const GUARDIAN_RAID_CD: [number, number] = [5, 8];
/** Ring walls start at this fraction of the view and slowly close in. */
const RING_RADIUS = 0.6;
/** Past the run's end a bare minute gets a set piece this often (s), with rings lasting RING_OVERTIME_S. */
const OVERTIME_PERIOD = 35;
const RING_OVERTIME_S = 40;

export interface SpawnOpts {
  elite?: boolean;
  boss?: BossDef;
  swarmDir?: { x: number; y: number };
  /** Slow-closing wall member: walks at `speed` px/s toward the nearest player, vanishes after `ttl` s. */
  wall?: { speed: number; ttl: number };
  shiny?: boolean;
  alpha?: boolean;
  /** Guards map treasure: drops no treasure of its own. */
  guardian?: boolean;
}

export class Spawner {
  private waveIdx = -1;
  private nextQuota = 0;
  /** Wave bosses waiting for their minute banner to show first. */
  private pendingElites: { at: number; species: string }[] = [];
  private nextTreasure = 100;
  private nextItemBall = 40;
  /** The current minute's set pieces as absolute firing times (rebuilt whenever the minute changes). */
  private pendingEvents: { at: number; ev: WaveEvent }[] = [];
  private nextOvertime = 0;
  private overtimeRing = false;
  private bossIdx = 0;
  /** Far-off treasure on the map (shown on the minimap); guardians appear as you get close. */
  private pois: { kind: 'cache' | 'mega-stone'; id: number; x: number; y: number; guarded: boolean }[] = [];
  private nextCache = 100;
  private nextAlpha = 140;
  private megaStoneAt = 330;

  private sim: Sim;
  constructor(sim: Sim) {
    this.sim = sim;
  }

  get minute() {
    return this.sim.time / 60;
  }

  /** The current minute's wave; after the last minute it keeps applying (overtime). */
  get wave(): WaveDef {
    return waveAt(this.sim.stage, this.sim.time).wave;
  }

  /** Stage difficulty eases in over the first minutes so every route starts fair. */
  stageFactor() {
    const ramp = Math.min(1, 0.25 + this.minute / 6);
    return 1 + (this.sim.stage.difficulty - 1) * ramp;
  }

  /** Enemy hp multiplier: a per-minute step, not a smooth curve, so each minute reads as a new tier. */
  hpMult() {
    const n = this.sim.players.length;
    return this.wave.hpTier * this.stageFactor() * (1 + 0.65 * (n - 1)) * (this.sim.elite ? 1.6 : 1);
  }

  dmgMult() {
    const grace = Math.min(1, 0.55 + this.minute * 0.15);
    const m = this.minute;
    return grace * (1 + 0.06 * m + 0.004 * m * m) * (0.75 + 0.25 * this.stageFactor()) * (this.sim.elite ? 1.3 : 1);
  }

  update() {
    // updateEvents must stay after updateWave: pendingEvents is rebuilt there on a minute change.
    const sim = this.sim;
    const t = sim.time;
    this.updateWave(t);
    if (t >= this.nextTreasure) {
      this.nextTreasure += sim.rng.range(80, 130);
      if (sim.rng.chance(0.65)) {
        this.spawnOffscreen(sim.rng.chance(0.35) ? 'chansey' : 'meowth');
        sim.emit({ e: 'toast', text: 'A wild Pokémon is carrying treasure!' });
      }
    }
    if (t >= this.nextItemBall) {
      this.nextItemBall += sim.rng.range(30, 50);
      const p = sim.rng.pick(sim.players.filter((x) => !x.fainted)) ?? sim.players[0];
      const a = sim.rng.range(0, TAU);
      const d = sim.rng.range(140, 260);
      const roll = sim.rng.next();
      const kind = roll < 0.45 ? 'oran' : roll < 0.65 ? 'magnet' : roll < 0.8 ? 'coin' : roll < 0.92 ? 'repel' : 'sitrus';
      sim.spawnPickup(kind, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, kind === 'coin' ? 10 : 1);
    }
    this.updatePois(t);
    this.updateEvents(t);
    const bosses = sim.stage.bosses;
    if (this.bossIdx < bosses.length && t >= bosses[this.bossIdx].at) {
      const b = bosses[this.bossIdx++];
      this.spawnOffscreen(b.species, { boss: b });
      sim.emit({ e: 'boss', species: b.species, final: !!b.final });
    }
  }

  /** Minute changes, wave bosses and the quota backfill. */
  private updateWave(t: number) {
    const sim = this.sim;
    const { idx, wave: w } = waveAt(sim.stage, t);
    const n = sim.players.length;
    if (idx !== this.waveIdx) {
      const prev = sim.stage.waves[Math.max(0, idx - 1)];
      this.waveIdx = idx;
      this.nextQuota = t; // the new minute's quota lands with its banner
      this.pendingEvents = eventTimes(idx, w.events);
      if (idx > 0) {
        const species = w.headline ?? (w.species.find((e) => !prev.species.some((p) => p.species === e.species)) ?? w.species[0]).species;
        sim.emit({ e: 'wave', minute: idx, species, text: w.text ?? `${SPECIES[species].name} appear!` });
      }
      if (w.elite) {
        const pool = sim.stage.elites;
        this.pendingElites.push({ at: t + 2, species: w.elite });
        if (idx >= 10) this.pendingElites.push({ at: t + 2, species: pool[(pool.indexOf(w.elite) + 1) % pool.length] });
      }
    }
    while (this.pendingElites.length && t >= this.pendingElites[0].at) {
      this.spawnOffscreen(this.pendingElites.shift()!.species, { elite: true });
    }
    if (t < this.nextQuota) return;
    this.nextQuota = t + w.interval;
    // Only filler counts toward the quota; set pieces and carriers have their own pacing.
    let alive = 0;
    for (const e of sim.enemies) if (e.alive && !e.boss && !e.elite && !e.alpha && e.role !== 'treasure' && !isSetPiece(e)) alive++;
    const min = Math.round(w.min * (1 + 0.35 * (n - 1)) * (sim.elite ? 1.25 : 1));
    if (alive < min) {
      // Instant backfill; spawnEnemy stops at MAX_ENEMIES.
      for (; alive < min; alive++) {
        if (!this.spawnOffscreen(sim.rng.weighted(w.species, (e: SpawnEntry) => e.w)!.species)) break;
      }
    } else {
      for (const e of w.species) this.spawnOffscreen(e.species);
    }
  }

  /** Fires the wave's set pieces once each; past the run's end a bare minute gets an alternating swarm/ring. */
  private updateEvents(t: number) {
    while (this.pendingEvents.length && t >= this.pendingEvents[0].at) {
      const { ev } = this.pendingEvents.shift()!;
      if (ev.kind === 'swarm') this.swarm();
      else this.ring(ev.duration);
    }
    if (t < RUN_LENGTH || this.wave.events?.length) return;
    if (this.nextOvertime === 0) this.nextOvertime = t;
    if (t < this.nextOvertime) return;
    this.nextOvertime = t + OVERTIME_PERIOD;
    this.overtimeRing = !this.overtimeRing;
    if (this.overtimeRing) this.ring(RING_OVERTIME_S);
    else this.swarm();
  }

  private updatePois(t: number) {
    const sim = this.sim;
    if (t >= this.megaStoneAt) {
      this.megaStoneAt = Infinity;
      this.placePoi('mega-stone', 850);
    }
    if (t >= this.nextCache) {
      this.nextCache += sim.rng.range(100, 140);
      if (this.pois.filter((p) => p.kind === 'cache').length < 2) this.placePoi('cache', sim.rng.range(700, 1000));
    }
    if (t >= this.nextAlpha) {
      this.nextAlpha += sim.rng.range(130, 170);
      if (sim.enemies.filter((e) => e.alpha && e.alive).length < 2) this.placeAlpha();
    }
    for (const poi of this.pois) {
      if (poi.guarded) continue;
      const near = sim.players.some((p) => !p.fainted && dist2(p.x, p.y, poi.x, poi.y) < 330 * 330);
      if (!near) continue;
      poi.guarded = true;
      const n = poi.kind === 'mega-stone' ? 2 + Math.floor(this.minute / 6) : 1;
      for (let i = 0; i < n; i++) {
        const a = sim.rng.range(0, TAU);
        spawnEnemy(sim, sim.rng.pick(sim.stage.elites), poi.x + Math.cos(a) * 60, poi.y + Math.sin(a) * 60, { elite: true, guardian: true });
      }
      sim.emit({ e: 'warn', text: poi.kind === 'mega-stone' ? 'Powerful Pokémon guard the Mega Stone!' : 'Something is guarding the treasure!' });
    }
    const alive = new Set(sim.pickups.filter((p) => !p.dead).map((p) => p.id));
    this.pois = this.pois.filter((p) => alive.has(p.id));
  }

  private placePoi(kind: 'cache' | 'mega-stone', dist: number) {
    const sim = this.sim;
    const p = this.anchor();
    // somewhere with room around it, not inside a grove
    let a = sim.rng.range(0, TAU);
    let x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
    for (let i = 0; i < 24 && !sim.obstacles.clearAt(x, y, 40); i++) {
      a += TAU / 24;
      x = p.x + Math.cos(a) * dist;
      y = p.y + Math.sin(a) * dist;
    }
    const pk = sim.spawnPickup(kind === 'cache' ? 'dig' : 'mega-stone', x, y, kind === 'cache' ? (sim.rng.chance(0.3) ? 3 : 2) : 1);
    pk.vx = pk.vy = 0;
    this.pois.push({ kind, id: pk.id, x, y, guarded: false });
    sim.emit({ e: 'poi', kind, x, y });
  }

  private placeAlpha() {
    const sim = this.sim;
    const p = this.anchor();
    const a = sim.rng.range(0, TAU);
    const dist = sim.rng.range(750, 1050);
    const x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
    const waves = this.minute < 6 ? sim.stage.waves.slice(0, 6) : sim.stage.waves.slice(6);
    const choices = [...new Set([...waves.flatMap((w) => w.species.map((e) => e.species)), ...sim.stage.elites])].filter((s) => ENEMY_ROLE[s] !== 'treasure' && ENEMY_ROLE[s] !== 'bomber');
    const species = sim.rng.pick(choices);
    const e = spawnEnemy(sim, species, x, y, { alpha: true });
    if (e) sim.emit({ e: 'poi', kind: 'alpha', x, y, species });
  }

  private anchor(): Player {
    const alive = this.sim.players.filter((p) => !p.fainted && p.connected);
    return this.sim.rng.pick(alive.length ? alive : this.sim.players);
  }

  spawnOffscreen(species: string, opts: SpawnOpts = {}) {
    const p = this.anchor();
    const hw = p.viewW / 2 + 40, hh = p.viewH / 2 + 40;
    let side = this.sim.rng.int(0, 3);
    // Bias spawns toward where the player is heading so running away isn't free.
    if (p.moving && this.sim.rng.chance(0.55)) {
      side = Math.abs(p.fx) > Math.abs(p.fy) ? (p.fx < 0 ? 2 : 3) : p.fy < 0 ? 0 : 1;
    }
    let x: number, y: number;
    if (side < 2) {
      x = p.x + this.sim.rng.range(-hw, hw);
      y = p.y + (side === 0 ? -hh : hh);
    } else {
      x = p.x + (side === 2 ? -hw : hw);
      y = p.y + this.sim.rng.range(-hh, hh);
    }
    return spawnEnemy(this.sim, species, x, y, opts);
  }

  private swarm() {
    const sim = this.sim;
    const p = this.anchor();
    const a = sim.rng.range(0, TAU);
    const dir = { x: -Math.cos(a), y: -Math.sin(a) };
    const cx = p.x + Math.cos(a) * (p.viewW * 0.6), cy = p.y + Math.sin(a) * (p.viewH * 0.75);
    const count = 18 + Math.floor(this.minute * 2);
    sim.emit({ e: 'warn', text: 'A swarm is approaching!' });
    for (let i = 0; i < count; i++) {
      const off = (i - count / 2) * 16;
      spawnEnemy(sim, sim.stage.swarm, cx - dir.y * off + sim.rng.range(-20, 20), cy + dir.x * off + sim.rng.range(-20, 20), { swarmDir: dir });
    }
  }

  /** A wall of the wave's main species on an ellipse around the anchor, all walking slowly inward. */
  private ring(duration: number) {
    const sim = this.sim;
    const p = this.anchor();
    const count = 26 + Math.floor(this.minute * 2);
    const species = this.wave.species.reduce((best, e) => (e.w > best.w ? e : best)).species;
    sim.emit({ e: 'warn', text: 'You’re surrounded!' });
    const r = Math.max(p.viewW, p.viewH) * RING_RADIUS;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      spawnEnemy(sim, species, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.75, { wall: { speed: sim.rng.range(25, 35), ttl: duration } });
    }
  }
}

export function spawnEnemy(sim: Sim, speciesId: string, x: number, y: number, opts: SpawnOpts = {}): Enemy | undefined {
  if (sim.enemies.length >= MAX_ENEMIES && !opts.boss && !opts.elite && !opts.alpha) return;
  const sp = SPECIES[speciesId];
  const role: EnemyRole = opts.boss ? 'chaser' : ENEMY_ROLE[speciesId] ?? 'chaser';
  const m = sim.time / 60;
  const shinyOdds = Math.max(...sim.players.map((p) => p.meta.shinyOdds));
  const shiny = opts.shiny ?? (!opts.boss && !opts.alpha && sim.rng.chance((1 / 3000) * shinyOdds));
  const [bhp, batk, , bspa, , bspe] = sp.base;
  let hp = (4 + bhp * 0.12) * ROLE_HP[role] * sim.spawner.hpMult();
  // Regulars never outrun the slowest starter (~130 px/s) by much, so kiting stays honest all run.
  let speed = Math.min(110, (48 + bspe * 0.42) * ROLE_SPEED[role]);
  let dmg = (3 + Math.max(batk, bspa) * 0.055) * sim.spawner.dmgMult();
  let xp = role === 'tank' ? 2 : 1;
  let scale = role === 'tank' ? 1.15 : 1;
  let radius = 9 * scale;
  let knockResist = role === 'tank' ? 0.6 : 0;
  if (opts.elite) {
    hp *= 12; dmg *= 1.4; xp = 25; scale = 1.5; radius = 14; knockResist = 0.85; speed *= 0.95;
  }
  if (opts.boss) {
    const n = sim.players.length;
    hp = (50 + bhp * 1.6) * (opts.boss.final ? 2.4 : 1.1) * (1 + m * 0.3) * sim.stage.difficulty * (1 + 0.8 * (n - 1));
    dmg *= 1.8; xp = opts.boss.final ? 150 : 75; scale = opts.boss.final ? 2.4 : 2; radius = opts.boss.final ? 26 : 22; knockResist = 1;
    speed = Math.min(112, 82 + bspe * 0.24);
  }
  if (opts.alpha) {
    hp *= 44; dmg *= 1.8; xp = 80; scale = 2.1; radius = 19; knockResist = 0.95; speed = Math.min(118, speed * 1.1);
  }
  if (opts.wall) {
    // Pushing through is worth it: three times a tank's hp for tank xp; walls ignore separation shoves.
    hp = (4 + bhp * 0.12) * ROLE_HP.tank * 3 * sim.spawner.hpMult(); xp = 2; knockResist = 0.6; speed = opts.wall.speed;
  }
  if (role === 'treasure') { speed = Math.max(speed, 80); xp = 5; }
  if (shiny) { hp *= 3; xp *= 5; }
  const e: Enemy = {
    id: sim.id(), speciesId, types: sp.types, role, x, y, radius, vx: 0, vy: 0, dirX: 0, dirY: 1,
    hp, maxHp: hp, speed, dmg, special: bspa > batk, xp, elite: !!opts.elite, boss: !!opts.boss,
    final: !!opts.boss?.final, shiny, alpha: !!opts.alpha, guardian: !!opts.guardian, homeX: x, homeY: y, alive: true, flash: 0,
    st: freshStatus(),
    contactCd: 0, ai: sim.rng.range(0, 2), aiState: opts.swarmDir ? AI.CROSSER : opts.wall ? AI.WALL : 0, aiX: opts.swarmDir?.x ?? 0, aiY: opts.swarmDir?.y ?? 0,
    patterns: opts.boss?.patterns ?? [], patternIdx: 0, minions: opts.boss?.minions ?? [], knockResist, scale,
    lastHitBy: 0, animOffset: sim.rng.range(0, 10),
  };
  if (opts.swarmDir) { e.speed = Math.max(e.speed, 85); e.ai = 14; }
  if (opts.wall) e.ai = opts.wall.ttl;
  sim.enemies.push(e);
  sim.seenSpecies.add(speciesId);
  if (shiny) sim.emit({ e: 'shiny', x, y });
  return e;
}

// ─────────────────────────── per-tick AI ───────────────────────────

export function updateEnemies(sim: Sim, dt: number) {
  const players = sim.players;
  // Substitute dolls on the field draw foes in.
  const decoys: Projectile[] = [];
  for (const pr of sim.projectiles) if (pr.behavior === 'decoy' && !pr.dead && !pr.hostile) decoys.push(pr);
  for (const e of sim.enemies) {
    if (!e.alive) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.contactCd -= dt;
    const st = e.st;
    // ─ status timers & DoTs
    st.paralyze = Math.max(0, st.paralyze - dt);
    st.freeze = Math.max(0, st.freeze - dt);
    st.slow = Math.max(0, st.slow - dt);
    st.confuse = Math.max(0, st.confuse - dt);
    st.flinch = Math.max(0, st.flinch - dt);
    st.wet = Math.max(0, st.wet - dt);
    st.sleep = Math.max(0, st.sleep - dt);
    st.charm = Math.max(0, st.charm - dt);
    st.vuln = Math.max(0, st.vuln - dt);
    st.weaken = Math.max(0, st.weaken - dt);
    st.root = Math.max(0, st.root - dt);
    st.ffCd -= dt;
    if (st.chill > 0 && (st.chillT -= dt) <= 0) st.chill = 0;
    if (st.pins > 0 && (st.pinsT -= dt) <= 0) st.pins = 0;
    if (st.air > 0) {
      st.air -= dt;
      if (st.air <= 0) land(sim, e);
      if (!e.alive) continue;
    }
    if (st.burn > 0 || st.poison > 0 || st.seed > 0 || st.curse > 0) {
      st.burn = Math.max(0, st.burn - dt);
      st.poison = Math.max(0, st.poison - dt);
      st.seed = Math.max(0, st.seed - dt);
      if (st.poison === 0) { st.poisonStacks = 0; st.toxic = 0; }
      st.dotTick -= dt;
      if (st.dotTick <= 0) {
        st.dotTick = 0.5;
        if (st.burn > 0) rawDamageEnemy(sim, e, st.burnDmg, 'fire', st.dotOwner, 'burn');
        if (st.poison > 0 && e.alive) {
          // Badly poisoned: each tick hits harder than the last.
          const ramp = st.toxic ? 1 + 0.35 * st.toxic++ : 1;
          rawDamageEnemy(sim, e, st.poisonDmg * st.poisonStacks * ramp, 'poison', st.dotOwner, st.toxic ? 'toxic' : 'poison');
        }
        if (st.seed > 0 && e.alive) {
          rawDamageEnemy(sim, e, st.seedDmg, 'grass', st.seedOwner, 'leech-seed');
          const o = sim.players[st.seedOwner];
          if (o) heal(o, st.seedDmg * 0.6, 'leech-seed');
        }
        if (st.curse > 0 && e.alive) rawDamageEnemy(sim, e, e.maxHp * st.curse * 0.5, 'ghost', st.curseOwner, 'curse');
        if (!e.alive) continue;
      }
    }

    const player = sim.nearestPlayer(e.x, e.y);
    let target: { x: number; y: number } | undefined = player;
    // Decoys: a doll within its lure radius wins the foe's attention.
    for (const d of decoys) {
      if (!e.boss && dist2(e.x, e.y, d.x, d.y) < d.growth * d.growth) { target = d; break; }
    }
    let mult = 1;
    // Paralysis locks a foe up in random stutters (~35% of the time).
    const stutter = st.paralyze > 0 && ((sim.time * 3.1 + e.id * 0.618) % 1) < 0.35;
    // Can it do anything at all? (frozen, asleep, airborne or stuttering)
    const helpless = st.freeze > 0 || st.sleep > 0 || st.air > 0 || stutter;
    if (st.slow > 0) mult *= 0.55;
    if (st.chill > 0) mult *= 1 - 0.15 * st.chill;
    if (helpless || st.root > 0) mult = 0;
    let mx = 0, my = 0;
    if (target && player) {
      const dx = target.x - e.x, dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      mx = dx / d; my = dy / d;
      if (e.detour && e.detour > 0) {
        e.detour -= dt;
        const way = sim.flow[player.id]?.dir(e.x, e.y);
        if (way) { mx = way.x; my = way.y; }
      }
      if (helpless) {
        // no AI, no attacks
      } else if (e.boss) {
        const r = bossAI(sim, e, player, Math.hypot(player.x - e.x, player.y - e.y) || 1, dt);
        mx = r.x; my = r.y; mult *= r.speed;
      } else if (e.alpha) {
        const r = alphaAI(sim, e, player, d, dx, dy, dt);
        if (!e.alive) continue;
        mx = r.x; my = r.y; mult *= r.speed;
      } else if (isSetPiece(e)) {
        // crossers fly their fixed line, walls keep marching at the player (mx/my already point there); both give up when ai runs out
        if (e.aiState === AI.CROSSER) { mx = e.aiX; my = e.aiY; }
        e.ai -= dt;
        if (e.ai <= 0) { e.alive = false; continue; }
      } else if (e.elite && st.charm <= 0 && eliteRaid(sim, e, player, d, dt)) {
        mult = 0;
      } else if (st.charm <= 0) {
        switch (e.role) {
          case 'ranged': {
            if (d < 140) { mx = -mx; my = -my; } else if (d < 200) { [mx, my] = [-my * 0.6, mx * 0.6]; }
            e.ai -= dt;
            if (e.ai <= 0 && d < 320) {
              e.ai = sim.rng.range(2.4, 3.6);
              enemyShot(sim, e, Math.atan2(dy, dx), 120, e.dmg * 0.9);
            }
            break;
          }
          case 'bomber': {
            if (e.aiState === AI.BOMBER_FUSE) {
              mult = 0;
              e.ai -= dt;
              e.flash = (Math.floor(e.ai * 10) % 2) * 0.1;
              if (e.ai <= 0) explode(sim, e);
              break;
            }
            if (d < 34) { e.aiState = AI.BOMBER_FUSE; e.ai = 0.7; }
            break;
          }
          case 'treasure':
            mx = -mx; my = -my;
            e.ai += dt;
            if (e.ai > 22) { e.alive = false; continue; }
            break;
          default:
            break;
        }
      }
      if (!e.alive) continue;
      if (st.charm > 0) {
        // Infatuated: wander away from the partners.
        mx = -mx; my = -my;
      } else if (st.confuse > 0) {
        const a = Math.sin(sim.time * 3 + e.id) * Math.PI;
        mx = Math.cos(a); my = Math.sin(a);
      }
      // ─ contact damage
      if (e.contactCd <= 0 && !helpless && st.charm <= 0) {
        for (const p of players) {
          if (p.fainted) continue;
          const rr = e.radius + p.radius;
          if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
            e.contactCd = 0.8;
            sim.hurtPlayer(p, e.dmg * (st.weaken > 0 ? 0.7 : 1), e.types[0], false);
            onPlayerContact(sim, p, e);
            break;
          }
        }
      }
    }
    // ─ movement + knockback
    const sp = e.speed * mult;
    e.x += (mx * sp + e.vx) * dt;
    e.y += (my * sp + e.vy) * dt;
    const damp = Math.pow(0.0008, dt);
    e.vx *= damp;
    e.vy *= damp;
    if ((mx || my) && mult > 0) { e.dirX = mx; e.dirY = my; }
    // ─ recycle enemies left far behind
    if (!e.boss && !e.alpha && !isSetPiece(e) && player) {
      const lim = Math.max(player.viewW, player.viewH) * 0.9 + 150;
      if (Math.abs(e.x - player.x) > lim || Math.abs(e.y - player.y) > lim) {
        if (e.role === 'treasure') { e.alive = false; continue; }
        e.x = player.x + (player.x - e.x) * 0.8;
        e.y = player.y + (player.y - e.y) * 0.8;
      }
    }
  }
  separate(sim, dt);
}

/** Sky Uppercut: a launched foe crashes down on everything around it. */
function land(sim: Sim, e: Enemy) {
  const st = e.st;
  sim.emit({ e: 'boom', x: e.x, y: e.y, r: 46, type: 'fighting' });
  const dmg = st.airDmg;
  st.airDmg = 0;
  sim.grid.query(e.x, e.y, 46, (o) => {
    if (o.alive && o !== e && dist2(o.x, o.y, e.x, e.y) < 46 * 46) rawDamageEnemy(sim, o, dmg * 0.6, 'fighting', st.airOwner, 'sky-uppercut');
  });
  rawDamageEnemy(sim, e, dmg, 'fighting', st.airOwner, 'sky-uppercut');
}

/** Soft separation so crowds form readable blobs instead of a single stack. */
function separate(sim: Sim, dt: number) {
  const obs = sim.obstacles;
  sim.rebuildGrid();
  const walls: Projectile[] = [];
  for (const pr of sim.projectiles) if (pr.behavior === 'wall' && !pr.dead && !pr.hostile && pr.t >= pr.delay) walls.push(pr);
  for (const e of sim.enemies) {
    if (!e.alive) continue;
    // Rock Tomb pillars: foes can't walk through.
    for (const w of walls) {
      const dx = e.x - w.x, dy = e.y - w.y;
      const rr = w.r + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && !e.boss) {
        const d = Math.sqrt(d2) || 1;
        e.x = w.x + (dx / d) * rr;
        e.y = w.y + (dy / d) * rr;
      }
    }
    // Scenery: bosses crash through and Flying/Ghost types pass over; everyone else is blocked,
    // slides round the side nearer their heading, and for a moment takes the way round to their
    // partner (flow field) instead of the straight line, so forest walls never pin them in place.
    if (!e.boss && !e.types.includes('flying') && !e.types.includes('ghost') && obs.pushOut(e, e.radius)) {
      e.detour = 0.8;
      let tx = -obs.ny, ty = obs.nx;
      const dot = tx * e.dirX + ty * e.dirY;
      if (dot < 0 || (dot === 0 && e.id & 1)) { tx = -tx; ty = -ty; }
      const k = e.speed * dt * 0.3;
      e.x += tx * k;
      e.y += ty * k;
    }
    // Confused or infatuated foes hurt the foes they bump into.
    const brawler = e.st.confuse > 0 || e.st.charm > 0;
    sim.grid.query(e.x, e.y, e.radius * 2, (o) => {
      if (o === e || !o.alive) return;
      const dx = e.x - o.x, dy = e.y - o.y;
      const rr = e.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) return;
      if (brawler && e.st.ffCd <= 0 && !o.boss) {
        e.st.ffCd = 0.6;
        rawDamageEnemy(sim, o, Math.max(4, o.maxHp * 0.08), e.types[0], e.lastHitBy, e.st.charm > 0 ? 'disarming-voice' : 'confusion');
      }
      if (isSetPiece(e)) return; // swarm crossers and walls hold their line
      const d = Math.sqrt(d2);
      const push = (rr - d) * 0.25;
      const wE = e.boss ? 0.05 : o.boss ? 1.6 : 1;
      e.x += (dx / d) * push * wE;
      e.y += (dy / d) * push * wE;
    });
  }
}

function onPlayerContact(sim: Sim, p: Player, e: Enemy) {
  if (p.stats.thorns) rawDamageEnemy(sim, e, p.stats.thorns, 'rock', p.id, 'thorns');
  if (p.ability === 'static' && sim.rng.chance(0.4)) {
    e.st.paralyze = e.boss ? 0.6 : 2.5;
    rawDamageEnemy(sim, e, 10 * p.stats.spa * (1 + sim.level * 0.04), 'electric', p.id, 'static');
  }
  if (p.ability === 'synchronize') {
    e.st.confuse = e.boss ? 0.4 : 2;
    rawDamageEnemy(sim, e, 14 * p.stats.spa * (1 + sim.level * 0.04), 'psychic', p.id, 'synchronize');
  }
}

function enemyShot(sim: Sim, e: Enemy, a: number, speed: number, dmg: number) {
  if (e.st.weaken > 0) dmg *= 0.7;
  makeProjectile(sim, {
    owner: -1, hostile: true, behavior: 'enemy', moveId: 'enemy', fx: 'orb', type: e.types[0], shape: 'circle',
    x: e.x, y: e.y - 6, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, angle: a, speed, r: 5, life: 4,
    pierce: 1, dmg,
  });
}

function explode(sim: Sim, e: Enemy) {
  sim.emit({ e: 'boom', x: e.x, y: e.y, r: 56, type: e.types[0] });
  for (const p of sim.players) {
    if (!p.fainted && dist2(p.x, p.y, e.x, e.y) < 56 * 56) sim.hurtPlayer(p, e.dmg * 2, e.types[0], true);
  }
  // Self-Destruct also hurts nearby wild Pokémon.
  sim.grid.query(e.x, e.y, 56, (o) => {
    if (o !== e && o.alive && !o.boss && dist2(o.x, o.y, e.x, e.y) < 56 * 56) rawDamageEnemy(sim, o, e.maxHp * 3, 'normal', e.lastHitBy, 'chain-explosion');
  });
  e.alive = false;
}

// ─────────────────────────── bosses ───────────────────────────

function bossAI(sim: Sim, e: Enemy, target: Player, d: number, dt: number): { x: number; y: number; speed: number } {
  const dx = (target.x - e.x) / d, dy = (target.y - e.y) / d;
  e.ai -= dt;
  const pattern = e.patterns[e.patternIdx % e.patterns.length];
  const raid = RAID_MOVES.has(pattern);
  // aiState: 0 = walking, 1 = telegraph, 2 = executing
  if (e.aiState === 0) {
    if (e.ai <= 0) {
      e.aiState = 1;
      e.aiX = target.x; e.aiY = target.y;
      if (raid) e.ai = castRaid(sim, e, pattern as RaidMove, target, e.final ? 'final' : 'boss');
      else e.ai = pattern === 'charge' || pattern === 'slam' ? 0.8 : 0.5;
      if (pattern === 'slam') spawnHazard(sim, { shape: 'circle', x: target.x, y: target.y, r: 70, delay: e.ai, dmg: e.dmg * 1.5, type: e.types[0] });
      if (pattern === 'charge') {
        // Aim a little past the partner so the dash carries through where they stood.
        const over = 60 / d;
        e.aiX = target.x + (target.x - e.x) * over; e.aiY = target.y + (target.y - e.y) * over;
        markCharge(sim, e, e.aiX, e.aiY, e.ai);
      }
    }
    return { x: dx, y: dy, speed: 1 };
  }
  if (e.aiState === 1) {
    e.flash = e.ai % 0.2 < 0.1 ? 0.06 : 0;
    if (e.ai <= 0) {
      e.aiState = 2;
      e.ai = raid ? 0.35 : pattern === 'charge' ? 0.9 : pattern === 'spiral' ? 2.2 : pattern === 'aimed' ? 1.2 : 0.1;
      e.aiY = pattern === 'charge' ? e.aiY : 0;
      if (pattern === 'radial') ringShots(sim, e, 14 + Math.floor(sim.time / 120), 0, 110);
      if (pattern === 'summon') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          spawnEnemy(sim, sim.rng.pick(e.minions.length ? e.minions : [e.speciesId]), e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50);
        }
      }
      // Slam: the boss lands where it marked (the hazard deals the damage).
      if (pattern === 'slam') { e.x = e.aiX; e.y = e.aiY; }
    }
    return { x: 0, y: 0, speed: 0 };
  }
  // executing
  let res = { x: 0, y: 0, speed: 0 };
  if (pattern === 'charge') {
    const cx = e.aiX - e.x, cy = e.aiY - e.y;
    const cd = Math.hypot(cx, cy) || 1;
    res = { x: cx / cd, y: cy / cd, speed: cd > 10 ? 3.4 : 0 };
  } else if (pattern === 'spiral') {
    e.aiY += dt;
    if (e.aiY > 0.09) {
      e.aiY = 0;
      const a = sim.time * 3.2;
      for (let k = 0; k < 3; k++) enemyShot(sim, e, a + (k * TAU) / 3, 105, e.dmg * 0.7);
    }
  } else if (pattern === 'aimed') {
    e.aiY += dt;
    if (e.aiY > 0.4) {
      e.aiY = 0;
      const a = Math.atan2(target.y - e.y, target.x - e.x);
      for (let k = -2; k <= 2; k++) enemyShot(sim, e, a + k * 0.18, 150, e.dmg * 0.8);
    }
  }
  if (e.ai <= 0) {
    e.aiState = 0;
    e.ai = sim.rng.range(2.2, 3.4);
    e.patternIdx++;
  }
  return res;
}

/**
 * Elites now and then plant themselves and wind up one small telegraphed ground attack when a
 * partner is close. Returns true while they are casting (standing still).
 */
function eliteRaid(sim: Sim, e: Enemy, target: Player, d: number, dt: number): boolean {
  if (e.casting! > 0) {
    e.casting! -= dt;
    e.flash = e.casting! % 0.2 < 0.1 ? 0.06 : 0;
    return true;
  }
  if (e.role === 'bomber') return false;
  // The first half of a run is pure crowd-shepherding; guardians keep their old tempo.
  if (!e.guardian && sim.time < ELITE_RAID_FROM) return false;
  e.raidCd = (e.raidCd ?? sim.rng.range(2, 5)) - dt;
  if (e.raidCd > 0 || d > (e.role === 'ranged' ? 260 : 170) || e.st.freeze > 0 || e.st.flinch > 0) return false;
  e.raidCd = sim.rng.range(...(e.guardian ? GUARDIAN_RAID_CD : ELITE_RAID_CD));
  e.casting = castRaid(sim, e, eliteMove(e), target, 'elite');
  return true;
}

function ringShots(sim: Sim, e: Enemy, n: number, offset: number, speed: number) {
  for (let i = 0; i < n; i++) enemyShot(sim, e, offset + (i / n) * TAU, speed, e.dmg * 0.8);
}

// ─────────────────────────── death & loot ───────────────────────────

/** Alphas idle around their territory until provoked, then hunt with shockwave stomps; leashed to home. */
function alphaAI(sim: Sim, e: Enemy, target: Player, d: number, dx: number, dy: number, dt: number): { x: number; y: number; speed: number } {
  const hx = e.homeX - e.x, hy = e.homeY - e.y;
  const hd = Math.hypot(hx, hy) || 1;
  e.ai -= dt;
  if (e.aiState === 2) {
    // Walking home after being lured too far: a partner that follows it re-provokes it;
    // otherwise it reaches its territory fully recovered and settles down again.
    if (d < 250) { e.aiState = 1; e.ai = 1.5; }
    else if (hd < 110) { e.aiState = 0; e.hp = e.maxHp; e.ai = 0; }
    else return { x: hx / hd, y: hy / hd, speed: 1 };
  }
  if (e.aiState === 0) {
    if (d < 250 || e.hp < e.maxHp) {
      e.aiState = 1;
      e.ai = 1.5;
      sim.emit({ e: 'warn', text: `The Alpha ${SPECIES[e.speciesId].name} is enraged!` });
    }
    if (e.ai <= 0) {
      e.ai = sim.rng.range(1.5, 3.5);
      const a = sim.rng.range(0, TAU);
      e.aiX = Math.cos(a); e.aiY = Math.sin(a);
    }
    if (hd > 110) return { x: hx / hd, y: hy / hd, speed: 0.4 };
    return { x: e.aiX, y: e.aiY, speed: 0.25 };
  }
  if (hd > 950) {
    // Lured too far: give up and walk home (it heals fully once it gets there).
    e.aiState = 2;
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3);
    return { x: hx / hd, y: hy / hd, speed: 1 };
  }
  if (e.casting! > 0) {
    // Planted while a ground attack winds up.
    e.casting! -= dt;
    e.flash = e.casting! % 0.2 < 0.1 ? 0.06 : 0;
    return { x: 0, y: 0, speed: 0 };
  }
  if (e.ai <= 0 && d < 320) {
    e.ai = sim.rng.range(2.6, 3.6);
    const move = alphaNextMove(e);
    if (move === 'shots') {
      const n = 10;
      const off = sim.rng.range(0, TAU);
      for (let i = 0; i < n; i++) enemyShot(sim, e, off + (i / n) * TAU, 110, e.dmg * 0.7);
    } else e.casting = castRaid(sim, e, move, target, 'alpha');
  }
  return { x: dx / d, y: dy / d, speed: 1 };
}

/** Exp. Candy values: S < 4 <= M < 12 <= L < 40 <= XL. Big foes burst into big candy. */
function dropCandy(sim: Sim, e: Enemy) {
  const r = sim.rng;
  const drops: number[] = [];
  if (e.boss) drops.push(e.xp * 0.3, e.xp * 0.3, ...Array(4).fill(e.xp * 0.1));
  else if (e.elite || e.alpha) drops.push(e.xp * 0.5, ...Array(5).fill(e.xp * 0.1));
  else if (e.role === 'tank' || r.chance(0.04)) drops.push(Math.max(4, e.xp * 4 * (e.role === 'tank' ? 0.5 : 1)));
  else drops.push(e.xp);
  for (let i = 0; i < drops.length; i++) {
    const pk = sim.spawnPickup('candy', e.x, e.y, drops[i]);
    if (pk && drops.length > 1) {
      const a = r.range(0, TAU), sp = r.range(70, 170);
      pk.vx = Math.cos(a) * sp;
      pk.vy = Math.sin(a) * sp;
    }
  }
}

export function killEnemy(sim: Sim, e: Enemy, killerId: number) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  sim.kills++;
  const killer = sim.players[killerId];
  if (killer) killer.kills++;
  megaOnKill(sim, killer, e.elite, e.boss);
  sim.defeatedSpecies.set(e.speciesId, (sim.defeatedSpecies.get(e.speciesId) ?? 0) + 1);
  sim.emit({ e: 'kill', x: e.x, y: e.y, species: e.speciesId, boss: e.boss, shiny: e.shiny, scale: e.scale, anim: e.animOffset, type: e.types[0], elite: e.elite || e.alpha });
  if ((e.elite || e.alpha) && !e.boss) sim.eliteStop();
  const r = sim.rng;
  dropCandy(sim, e);
  spreadOnDeath(sim, e);
  if (e.st.coin || r.chance(0.01)) sim.spawnPickup('coin', e.x, e.y, 1 + (e.st.coin ? r.int(1, 2) : 0));
  if (r.chance(0.006)) sim.spawnPickup('oran', e.x, e.y);
  if (r.chance(0.0015)) sim.spawnPickup('magnet', e.x, e.y);
  if (r.chance(0.0008)) sim.spawnPickup('repel', e.x, e.y);
  if (r.chance(0.0004)) sim.spawnPickup('rare-candy', e.x, e.y);
  if (e.role === 'treasure') {
    for (let i = 0; i < 6; i++) sim.spawnPickup('coin', e.x, e.y, e.speciesId === 'chansey' ? 4 : 3);
    if (e.speciesId === 'chansey') sim.spawnPickup('chest', e.x, e.y, 2);
  }
  if (e.shiny) {
    if (killer) killer.shinyKills++;
    sim.spawnPickup('chest', e.x, e.y, 2);
    for (let i = 0; i < 5; i++) sim.spawnPickup('coin', e.x, e.y, 4);
  }
  if (e.elite && !e.guardian) {
    const roll = r.next();
    sim.spawnPickup('chest', e.x, e.y, roll < 0.02 ? 3 : roll < 0.16 ? 2 : 1);
  }
  if (e.alpha) {
    sim.spawnPickup('chest', e.x, e.y, 3);
    sim.spawnPickup('rare-candy', e.x, e.y);
    for (let i = 0; i < 6; i++) sim.spawnPickup('coin', e.x, e.y, 3);
    sim.emit({ e: 'alphaDown', species: e.speciesId });
  }
  if (e.boss) {
    sim.bossesDefeated++;
    if (killer) killer.bossKills++;
    // A boss every 3 minutes: their treasure alternates Great / Ultra Ball, the final boss gives a Master Ball.
    sim.spawnPickup('chest', e.x, e.y, e.final ? 4 : sim.bossesDefeated % 2 ? 2 : 3);
    for (let i = 0; i < (e.final ? 10 : 6); i++) sim.spawnPickup('coin', e.x, e.y, 5);
    sim.spawnPickup('sitrus', e.x, e.y);
    if (e.final) sim.finalDefeated = true;
    sim.emit({ e: 'bossDown', species: e.speciesId, final: e.final });
    sim.queueCine({ kind: 'bossDown', t: 0, dur: e.final ? 3 : 1.2, player: killerId, species: e.speciesId });
  }
}

/** Burns spread to nearby foes when the host faints; Leech Seed hops to a neighbour. */
function spreadOnDeath(sim: Sim, e: Enemy) {
  const st = e.st;
  if (st.burn > 0) {
    let n = 0;
    sim.grid.query(e.x, e.y, 70, (o) => {
      if (n >= 2 || o === e || !o.alive || dist2(o.x, o.y, e.x, e.y) > 70 * 70 || o.st.burn > 0) return;
      n++;
      o.st.burn = 3; o.st.burnDmg = Math.max(o.st.burnDmg, st.burnDmg); o.st.dotOwner = st.dotOwner;
    });
  }
  if (st.seed > 0) {
    const next = sim.grid.nearest(e.x, e.y, 150, (o) => o !== e && o.alive && o.st.seed <= 0);
    if (next) { next.st.seed = 5; next.st.seedDmg = st.seedDmg; next.st.seedOwner = st.seedOwner; }
  }
}

/** Swarm crossers (9) and ring walls (10): scripted movers outside the quota, recycling and crowd shoving. */
export function isSetPiece(e: Enemy) {
  return e.aiState === AI.CROSSER || e.aiState === AI.WALL;
}
