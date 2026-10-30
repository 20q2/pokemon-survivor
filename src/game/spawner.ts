import { SPECIES } from '../data/pokedex.ts';
import { ENEMY_ROLE, RUN_LENGTH, type BossDef, type EnemyRole, type SpawnEntry, type WaveDef, type WaveEvent, eventTimes, waveAt, waveHeadline } from '../data/stages.ts';
import { TAU, dist2 } from '../engine/math.ts';
import { freshStatus } from './combat.ts';
import { Director } from './director.ts';
import type { Sim } from './sim.ts';
import { MAX_ENEMIES } from './sim.ts';
import { AI, type Enemy, type Player } from './types.ts';

const ROLE_HP: Record<EnemyRole, number> = { chaser: 1, fast: 0.7, tank: 2.4, ranged: 1, bomber: 0.8, treasure: 6 };
const ROLE_SPEED: Record<EnemyRole, number> = { chaser: 1, fast: 1.4, tank: 0.7, ranged: 0.95, bomber: 1.15, treasure: 1.25 };

export { AI };
/** Ring walls start at this fraction of the view and slowly close in. */
const RING_RADIUS = 0.6;
/** Past the run's end a bare minute gets a set piece this often (s), with rings lasting RING_OVERTIME_S. */
const OVERTIME_PERIOD = 35;
const RING_OVERTIME_S = 40;
/** The Reaper arrives this long after the final boss spawned, then another every SWEEPER_PERIOD. */
const SWEEPER_FROM = RUN_LENGTH + 60;
const SWEEPER_PERIOD = 60;
/** Room left under MAX_ENEMIES for bosses, elites, set pieces and carriers on top of the quota. */
const QUOTA_HEADROOM = 60;
const SWEEPER_SPECIES = 'haunter'; // ghost, and in no stage's waves, elites or bosses, so it can't hide in a crowd
/** About 1.15x the fastest starter. */
export const SWEEPER_SPEED = 165;
/** Contact damage as a fraction of the party's biggest maxHp: three hits fell a full-hp player. */
const SWEEPER_CONTACT_FRAC = 0.4;
/** Placeholder hp (damage never lands), final-boss scale and its hitbox. */
const SWEEPER_HP = 1e9;
const SWEEPER_SCALE = 2.4;
const SWEEPER_RADIUS = 26;

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
  /** Overtime Reaper: immune to damage and status, walks at the nearest player, heavy contact damage, outside the quota. */
  sweeper?: boolean;
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
  private nextSweeper = SWEEPER_FROM;
  private director: Director;
  /** The Director's reprieve: no quota backfill until this time (elites, bosses and set pieces carry on). */
  private backfillResumeAt = 0;
  private bossIdx = 0;
  /** Far-off treasure on the map (shown on the minimap); guardians appear as you get close. */
  private pois: { kind: 'cache' | 'mega-stone'; id: number; x: number; y: number; guarded: boolean }[] = [];
  private nextCache = 100;
  private nextAlpha = 140;
  private megaStoneAt = 330;

  private sim: Sim;
  constructor(sim: Sim) {
    this.sim = sim;
    this.director = new Director((lo, hi) => sim.rng.range(lo, hi));
  }

  /**
   * Test/diagnostic seam (SimConfig.startTime; the game never calls it): fast-forwards every schedule to
   * "the run reached t with nothing pending". Bosses before t are skipped, the wave at t becomes current
   * without its minute banner (set pieces later in the minute still fire), and the timed spawners restart
   * a mid-range spacing after t. Draws no rng, so it is deterministic.
   */
  skipTo(t: number) {
    const bosses = this.sim.stage.bosses;
    this.bossIdx = bosses.findIndex((b) => b.at >= t);
    if (this.bossIdx < 0) this.bossIdx = bosses.length;
    const { idx, wave } = waveAt(this.sim.stage, t);
    this.waveIdx = idx;
    this.nextQuota = t; // the quota fills on the first tick
    this.pendingElites = [];
    this.pendingEvents = eventTimes(idx, wave.events).filter((p) => p.at >= t);
    this.backfillResumeAt = 0;
    this.nextTreasure = Math.max(this.nextTreasure, t + 105);
    this.nextItemBall = Math.max(this.nextItemBall, t + 40);
    this.nextCache = Math.max(this.nextCache, t + 120);
    this.nextAlpha = Math.max(this.nextAlpha, t + 150);
    this.megaStoneAt = Math.max(this.megaStoneAt, t);
    while (this.nextSweeper < t) this.nextSweeper += SWEEPER_PERIOD;
    this.nextOvertime = 0;
    this.director = new Director((lo, hi) => this.sim.rng.range(lo, hi));
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

  update(dt: number) {
    // updateEvents must stay after updateWave: pendingEvents is rebuilt there on a minute change.
    const sim = this.sim;
    const t = sim.time;
    this.updateWave(t);
    this.updateDirector(dt, t);
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
    this.updateSweeper(t);
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
      this.waveIdx = idx;
      this.nextQuota = t; // the new minute's quota lands with its banner
      // A reprieve never leaks into the next minute. It costs 4 s plus at most one interval (nextQuota advances
      // before the early return below); that is deliberate, the breather should be real.
      this.backfillResumeAt = 0;
      this.pendingEvents = eventTimes(idx, w.events);
      if (idx > 0) {
        const species = waveHeadline(sim.stage, idx);
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
    if (t < this.backfillResumeAt) return;
    // Only filler counts toward the quota; set pieces and carriers have their own pacing.
    let alive = 0;
    for (const e of sim.enemies) if (isRegular(e)) alive++;
    // Capped so a 4-player quota doesn't sit on MAX_ENEMIES and hammer the cap every interval.
    const min = Math.min(MAX_ENEMIES - QUOTA_HEADROOM, Math.round(w.min * (1 + 0.35 * (n - 1)) * (sim.elite ? 1.25 : 1)));
    if (alive < min) {
      // Instant backfill; spawnEnemy stops at MAX_ENEMIES.
      for (; alive < min; alive++) {
        if (!this.spawnOffscreen(sim.rng.weighted(w.species, (e: SpawnEntry) => e.w)!.species)) break;
      }
    } else {
      for (const e of w.species) this.spawnOffscreen(e.species);
    }
  }

  /** Left 4 Dead-style pacing: a dominant party gets its next set piece early, a struggling one a breather. */
  private updateDirector(dt: number, t: number) {
    const sim = this.sim;
    const up = sim.players.filter((p) => !p.fainted);
    const hpFrac = up.length ? up.reduce((s, p) => s + p.hp / p.stats.maxHp, 0) / up.length : 0;
    const act = this.director.update(dt, { minute: Math.floor(t / 60), hpFrac, standing: up.length > 0, kills: sim.kills, eventPending: this.pendingEvents.length > 0 });
    if (act.pullForward) this.pendingEvents[0].at = Math.max(t, this.pendingEvents[0].at - act.pullForward);
    if (act.pauseBackfill) this.backfillResumeAt = t + act.pauseBackfill;
  }

  /** Overtime: the final boss still stands a minute after arriving, so the Reaper starts walking. */
  private updateSweeper(t: number) {
    const sim = this.sim;
    if (t < this.nextSweeper || sim.finalDefeated) return;
    this.nextSweeper = t + SWEEPER_PERIOD;
    if (this.spawnOffscreen(SWEEPER_SPECIES, { sweeper: true })) sim.emit({ e: 'warn', text: 'Something terrible approaches…' });
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
  if (sim.enemies.length >= MAX_ENEMIES && !isSpecial(opts)) return;
  const sp = SPECIES[speciesId];
  const role: EnemyRole = opts.boss ? 'chaser' : ENEMY_ROLE[speciesId] ?? 'chaser';
  const m = sim.time / 60;
  const shinyOdds = Math.max(...sim.players.map((p) => p.meta.shinyOdds));
  const shiny = opts.shiny ?? (!opts.boss && !opts.alpha && !opts.sweeper && sim.rng.chance((1 / 3000) * shinyOdds));
  const [bhp, batk, , bspa, , bspe] = sp.base;
  let hp = (4 + bhp * 0.12) * ROLE_HP[role] * sim.spawner.hpMult();
  // Regulars never outrun the slowest starter (~130 px/s) by much, so kiting stays honest all run.
  let speed = Math.min(110, (48 + bspe * 0.42) * ROLE_SPEED[role]);
  let dmg = (3 + Math.max(batk, bspa) * 0.055) * sim.spawner.dmgMult();
  // Per-minute xp from the wave table (see waveXp).
  const baseXp = waveAt(sim.stage, sim.time).wave.xp;
  let xp = role === 'tank' ? baseXp * 2 : baseXp;
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
    // Pushing through is worth it: three times a tank's hp for three times a tank's xp; walls ignore separation shoves.
    hp = (4 + bhp * 0.12) * ROLE_HP.tank * 3 * sim.spawner.hpMult(); xp = baseXp * 6; knockResist = 0.6; speed = opts.wall.speed;
  }
  if (opts.sweeper) {
    hp = SWEEPER_HP; dmg = SWEEPER_CONTACT_FRAC * Math.max(...sim.players.map((p) => p.stats.maxHp)); xp = 0; scale = SWEEPER_SCALE; radius = SWEEPER_RADIUS; knockResist = 1; speed = SWEEPER_SPEED;
  }
  if (role === 'treasure') { speed = Math.max(speed, 80); xp = 5; }
  if (shiny) { hp *= 3; xp *= 5; }
  const e: Enemy = {
    id: sim.id(), speciesId, types: sp.types, role, x, y, radius, vx: 0, vy: 0, dirX: 0, dirY: 1,
    hp, maxHp: hp, speed, dmg, special: bspa > batk, xp, elite: !!opts.elite, boss: !!opts.boss,
    final: !!opts.boss?.final, shiny, alpha: !!opts.alpha, guardian: !!opts.guardian, sweeper: opts.sweeper, homeX: x, homeY: y, alive: true, flash: 0,
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

/** Bosses, elites, alphas and the sweeper: sized and paced on their own, never part of the crowd. */
export function isSpecial(e: { boss?: unknown; elite?: boolean; alpha?: boolean; sweeper?: boolean }) {
  return !!(e.boss || e.elite || e.alpha || e.sweeper);
}

/** Filler that counts toward the wave quota: alive, and not special, a treasure carrier or a set piece. */
export function isRegular(e: Enemy) {
  return e.alive && !isSpecial(e) && e.role !== 'treasure' && !isSetPiece(e);
}

/** Swarm crossers (9) and ring walls (10): scripted movers outside the quota, recycling and crowd shoving. */
export function isSetPiece(e: Enemy) {
  return e.aiState === AI.CROSSER || e.aiState === AI.WALL;
}
