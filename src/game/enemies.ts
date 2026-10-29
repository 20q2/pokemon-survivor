import { SPECIES } from '../data/pokedex.ts';
import { ENEMY_ROLE, RUN_LENGTH, type BossDef, type EnemyRole, type SpawnEntry } from '../data/stages.ts';
import { TAU, dist2 } from '../engine/math.ts';
import { makeProjectile, rawDamageEnemy } from './combat.ts';
import { megaOnKill } from './mega.ts';
import type { Sim } from './sim.ts';
import { MAX_ENEMIES } from './sim.ts';
import type { Enemy, Player } from './types.ts';

const ROLE_HP: Record<EnemyRole, number> = { chaser: 1, fast: 0.7, tank: 2.4, ranged: 1, bomber: 0.8, treasure: 6 };
const ROLE_SPEED: Record<EnemyRole, number> = { chaser: 1, fast: 1.4, tank: 0.7, ranged: 0.95, bomber: 1.15, treasure: 1.25 };

export interface SpawnOpts {
  elite?: boolean;
  boss?: BossDef;
  swarmDir?: { x: number; y: number };
  shiny?: boolean;
  alpha?: boolean;
  /** Guards map treasure: drops no treasure of its own. */
  guardian?: boolean;
}

export class Spawner {
  private acc = 0;
  private nextElite = 75;
  private nextTreasure = 100;
  private nextItemBall = 40;
  private events: { at: number; kind: 'swarm' | 'ring' }[] = [
    { at: 150, kind: 'swarm' }, { at: 240, kind: 'ring' }, { at: 450, kind: 'swarm' }, { at: 540, kind: 'ring' },
    { at: 690, kind: 'swarm' }, { at: 780, kind: 'ring' }, { at: 840, kind: 'swarm' },
  ];
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

  /** Enemy hp multiplier at the current time. */
  /** Stage difficulty eases in over the first minutes so every route starts fair. */
  stageFactor() {
    const ramp = Math.min(1, 0.25 + this.minute / 6);
    return 1 + (this.sim.stage.difficulty - 1) * ramp;
  }

  hpMult() {
    const m = this.minute;
    const n = this.sim.players.length;
    // Gentle early, brutal late; strong teams (high level) also face sturdier foes.
    const lvl = 1 + 0.006 * (this.sim.level - 1);
    return (1 + 0.15 * m + 0.025 * m * m + 0.0025 * m * m * m) * lvl * this.stageFactor() * (1 + 0.65 * (n - 1)) * (this.sim.elite ? 1.6 : 1);
  }

  dmgMult() {
    const grace = Math.min(1, 0.55 + this.minute * 0.15);
    const m = this.minute;
    return grace * (1 + 0.06 * m + 0.004 * m * m) * (0.75 + 0.25 * this.stageFactor()) * (this.sim.elite ? 1.3 : 1);
  }

  update(dt: number) {
    const sim = this.sim;
    const t = sim.time;
    const m = this.minute;
    const n = sim.players.length;
    const finalUp = t >= RUN_LENGTH;
    const target = Math.min(MAX_ENEMIES - 40, (24 + m * 26) * (1 + 0.35 * (n - 1)) * (sim.elite ? 1.25 : 1)) * (finalUp ? 0.5 : 1);
    const rate = (3 + m * 1.4) * (1 + 0.3 * (n - 1)) * (sim.elite ? 1.25 : 1);
    const alive = sim.enemies.length;
    if (alive < target) {
      this.acc += rate * dt * (alive < target * 0.5 ? 1.4 : 1);
      while (this.acc >= 1) {
        this.acc -= 1;
        const pool = m < 4.5 ? sim.stage.pools.early : m < 9.5 ? sim.stage.pools.mid : sim.stage.pools.late;
        const entry = sim.rng.weighted(pool, (e: SpawnEntry) => e.w)!;
        // Late game: sprinkle in earlier species too for variety.
        const sp = m > 10 && sim.rng.chance(0.15) ? sim.rng.pick(sim.stage.pools.mid).species : entry.species;
        this.spawnOffscreen(sp);
      }
    }
    if (t >= this.nextElite) {
      this.nextElite += Math.max(48, 80 - m * 2.5);
      const count = 1 + Math.floor(m / 7);
      for (let i = 0; i < count; i++) this.spawnOffscreen(sim.rng.pick(sim.stage.elites), { elite: true });
    }
    if (t >= this.nextTreasure) {
      this.nextTreasure += sim.rng.range(80, 130);
      if (sim.rng.chance(0.65)) {
        this.spawnOffscreen(sim.rng.chance(0.35) ? 'chansey' : 'meowth');
        sim.emit({ e: 'warn', text: 'A wild Pokémon is carrying treasure!' });
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
    while (this.events.length && t >= this.events[0].at) {
      const ev = this.events.shift()!;
      if (ev.kind === 'swarm') this.swarm();
      else this.ring();
    }
    // From the midgame on, keep the set-pieces coming (faster still in overtime).
    if (t >= 600 && this.events.length === 0) {
      this.events.push({ at: t + (t >= RUN_LENGTH ? 35 : 55), kind: sim.rng.chance(0.5) ? 'swarm' : 'ring' });
    }
    const bosses = sim.stage.bosses;
    if (this.bossIdx < bosses.length && t >= bosses[this.bossIdx].at) {
      const b = bosses[this.bossIdx++];
      this.spawnOffscreen(b.species, { boss: b });
      sim.emit({ e: 'boss', species: b.species, final: !!b.final });
    }
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
    const a = sim.rng.range(0, TAU);
    const x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
    const pk = sim.spawnPickup(kind === 'cache' ? 'chest' : 'mega-stone', x, y, kind === 'cache' ? (sim.rng.chance(0.3) ? 3 : 2) : 1);
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
    const pool = this.minute < 6 ? [...sim.stage.pools.early, ...sim.stage.pools.mid] : [...sim.stage.pools.mid, ...sim.stage.pools.late];
    const choices = [...new Set([...pool.map((e) => e.species), ...sim.stage.elites])].filter((s) => ENEMY_ROLE[s] !== 'treasure' && ENEMY_ROLE[s] !== 'bomber');
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

  private ring() {
    const sim = this.sim;
    const p = this.anchor();
    const count = 26 + Math.floor(this.minute * 2);
    const pool = sim.stage.pools.mid;
    const species = sim.rng.pick(pool).species;
    sim.emit({ e: 'warn', text: 'You’re surrounded!' });
    const r = Math.max(p.viewW, p.viewH) * 0.42;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      spawnEnemy(sim, species, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.75);
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
  // Wild Pokémon get a little quicker as the run goes on, so kiting stays honest.
  let speed = Math.min(132, (48 + bspe * 0.42) * ROLE_SPEED[role]) * (1 + Math.min(0.3, Math.max(0, m - 5) * 0.03));
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
    dmg *= 1.8; xp = 150; scale = opts.boss.final ? 2.4 : 2; radius = opts.boss.final ? 26 : 22; knockResist = 1;
    speed = Math.min(112, 82 + bspe * 0.24);
  }
  if (opts.alpha) {
    hp *= 44; dmg *= 1.8; xp = 80; scale = 2.1; radius = 19; knockResist = 0.95; speed = Math.min(118, speed * 1.1);
  }
  if (role === 'treasure') { speed = Math.max(speed, 80); xp = 5; }
  if (shiny) { hp *= 3; xp *= 5; }
  const e: Enemy = {
    id: sim.id(), speciesId, types: sp.types, role, x, y, radius, vx: 0, vy: 0, dirX: 0, dirY: 1,
    hp, maxHp: hp, speed, dmg, special: bspa > batk, xp, elite: !!opts.elite, boss: !!opts.boss,
    final: !!opts.boss?.final, shiny, alpha: !!opts.alpha, guardian: !!opts.guardian, homeX: x, homeY: y, alive: true, flash: 0,
    st: { burn: 0, poison: 0, poisonStacks: 0, paralyze: 0, freeze: 0, slow: 0, confuse: 0, flinch: 0, dotTick: 0, burnDmg: 0, poisonDmg: 0, dotOwner: 0, coin: 0 },
    contactCd: 0, ai: sim.rng.range(0, 2), aiState: opts.swarmDir ? 9 : 0, aiX: opts.swarmDir?.x ?? 0, aiY: opts.swarmDir?.y ?? 0,
    patterns: opts.boss?.patterns ?? [], patternIdx: 0, minions: opts.boss?.minions ?? [], knockResist, scale,
    lastHitBy: 0, animOffset: sim.rng.range(0, 10),
  };
  if (opts.swarmDir) { e.speed = Math.max(e.speed, 85); e.ai = 14; }
  sim.enemies.push(e);
  sim.seenSpecies.add(speciesId);
  if (shiny) sim.emit({ e: 'shiny', x, y });
  return e;
}

// ─────────────────────────── per-tick AI ───────────────────────────

export function updateEnemies(sim: Sim, dt: number) {
  const players = sim.players;
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
    if (st.burn > 0 || st.poison > 0) {
      st.burn = Math.max(0, st.burn - dt);
      st.poison = Math.max(0, st.poison - dt);
      if (st.poison === 0) st.poisonStacks = 0;
      st.dotTick -= dt;
      if (st.dotTick <= 0) {
        st.dotTick = 0.5;
        if (st.burn > 0) rawDamageEnemy(sim, e, st.burnDmg, 'fire', st.dotOwner);
        if (st.poison > 0 && e.alive) rawDamageEnemy(sim, e, st.poisonDmg * st.poisonStacks, 'poison', st.dotOwner);
        if (!e.alive) continue;
      }
    }

    const target = sim.nearestPlayer(e.x, e.y);
    let mult = 1;
    if (st.slow > 0) mult *= 0.55;
    if (st.paralyze > 0) mult *= 0.5;
    if (st.freeze > 0 || st.flinch > 0) mult = 0;
    let mx = 0, my = 0;
    if (target) {
      const dx = target.x - e.x, dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      mx = dx / d; my = dy / d;
      if (e.boss) {
        const r = bossAI(sim, e, target, d, dt);
        mx = r.x; my = r.y; mult *= r.speed;
      } else if (e.alpha) {
        const r = alphaAI(sim, e, d, dx, dy, dt);
        if (!e.alive) continue;
        mx = r.x; my = r.y; mult *= r.speed;
      } else if (e.aiState === 9) {
        // swarm: fly straight across the screen then disappear
        mx = e.aiX; my = e.aiY;
        e.ai -= dt;
        if (e.ai <= 0) { e.alive = false; continue; }
      } else {
        switch (e.role) {
          case 'ranged': {
            if (d < 140) { mx = -mx; my = -my; } else if (d < 200) { mx = -my * 0.6; my = mx * 0.6; }
            e.ai -= dt;
            if (e.ai <= 0 && d < 320 && mult > 0) {
              e.ai = sim.rng.range(2.4, 3.6);
              enemyShot(sim, e, Math.atan2(dy, dx), 120, e.dmg * 0.9);
            }
            break;
          }
          case 'bomber': {
            if (e.aiState === 1) {
              mult = 0;
              e.ai -= dt;
              e.flash = (Math.floor(e.ai * 10) % 2) * 0.1;
              if (e.ai <= 0) explode(sim, e);
              break;
            }
            if (d < 34) { e.aiState = 1; e.ai = 0.7; }
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
      if (st.confuse > 0) {
        const a = Math.sin(sim.time * 3 + e.id) * Math.PI;
        mx = Math.cos(a); my = Math.sin(a);
      }
      // ─ contact damage
      if (e.contactCd <= 0 && mult > 0) {
        for (const p of players) {
          if (p.fainted) continue;
          const rr = e.radius + p.radius;
          if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
            e.contactCd = 0.8;
            sim.hurtPlayer(p, e.dmg, e.types[0], false);
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
    if (mx || my) { e.dirX = mx; e.dirY = my; }
    // ─ recycle enemies left far behind
    if (!e.boss && !e.alpha && e.aiState !== 9 && target) {
      const lim = Math.max(target.viewW, target.viewH) * 0.9 + 150;
      if (Math.abs(e.x - target.x) > lim || Math.abs(e.y - target.y) > lim) {
        if (e.role === 'treasure') { e.alive = false; continue; }
        e.x = target.x + (target.x - e.x) * 0.8;
        e.y = target.y + (target.y - e.y) * 0.8;
      }
    }
  }
  separate(sim);
}

/** Soft separation so crowds form readable blobs instead of a single stack. */
function separate(sim: Sim) {
  sim.rebuildGrid();
  for (const e of sim.enemies) {
    if (!e.alive) continue;
    sim.grid.query(e.x, e.y, e.radius * 2, (o) => {
      if (o === e || !o.alive) return;
      const dx = e.x - o.x, dy = e.y - o.y;
      const rr = e.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) return;
      const d = Math.sqrt(d2);
      const push = (rr - d) * 0.25;
      const wE = e.boss ? 0.05 : o.boss ? 1.6 : 1;
      e.x += (dx / d) * push * wE;
      e.y += (dy / d) * push * wE;
    });
  }
}

function onPlayerContact(sim: Sim, p: Player, e: Enemy) {
  if (p.stats.thorns) rawDamageEnemy(sim, e, p.stats.thorns, 'rock', p.id);
  if (p.ability === 'static' && sim.rng.chance(0.4)) {
    e.st.paralyze = e.boss ? 0.6 : 2.5;
    rawDamageEnemy(sim, e, 10 * p.stats.spa * (1 + sim.level * 0.04), 'electric', p.id);
  }
  if (p.ability === 'synchronize') {
    e.st.confuse = e.boss ? 0.4 : 2;
    rawDamageEnemy(sim, e, 14 * p.stats.spa * (1 + sim.level * 0.04), 'psychic', p.id);
  }
}

function enemyShot(sim: Sim, e: Enemy, a: number, speed: number, dmg: number) {
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
    if (o !== e && o.alive && !o.boss && dist2(o.x, o.y, e.x, e.y) < 56 * 56) rawDamageEnemy(sim, o, e.maxHp * 3, 'normal', e.lastHitBy);
  });
  e.alive = false;
}

// ─────────────────────────── bosses ───────────────────────────

function bossAI(sim: Sim, e: Enemy, target: Player, d: number, dt: number): { x: number; y: number; speed: number } {
  const dx = (target.x - e.x) / d, dy = (target.y - e.y) / d;
  e.ai -= dt;
  const pattern = e.patterns[e.patternIdx % e.patterns.length];
  // aiState: 0 = walking, 1 = telegraph, 2 = executing
  if (e.aiState === 0) {
    if (e.ai <= 0) {
      e.aiState = 1;
      e.ai = pattern === 'charge' || pattern === 'slam' ? 0.8 : 0.5;
      e.aiX = target.x; e.aiY = target.y;
      if (pattern === 'slam') makeProjectile(sim, { owner: -1, hostile: false, behavior: 'enemy', moveId: 'telegraph', fx: 'ring', type: e.types[0], shape: 'circle', x: target.x, y: target.y, r: 70, life: 0.8, dmg: 0 });
    }
    return { x: dx, y: dy, speed: 1 };
  }
  if (e.aiState === 1) {
    e.flash = e.ai % 0.2 < 0.1 ? 0.06 : 0;
    if (e.ai <= 0) {
      e.aiState = 2;
      e.ai = pattern === 'charge' ? 0.9 : pattern === 'spiral' ? 2.2 : pattern === 'aimed' ? 1.2 : 0.1;
      e.aiY = 0;
      if (pattern === 'radial') ringShots(sim, e, 14 + Math.floor(sim.time / 120), 0, 110);
      if (pattern === 'summon') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          spawnEnemy(sim, sim.rng.pick(e.minions.length ? e.minions : [e.speciesId]), e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50);
        }
      }
      if (pattern === 'slam') {
        sim.emit({ e: 'boom', x: e.aiX, y: e.aiY, r: 70, type: e.types[0] });
        for (const p of sim.players) if (!p.fainted && dist2(p.x, p.y, e.aiX, e.aiY) < 70 * 70) sim.hurtPlayer(p, e.dmg * 1.5, e.types[0], false);
        e.x = e.aiX; e.y = e.aiY;
      }
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

function ringShots(sim: Sim, e: Enemy, n: number, offset: number, speed: number) {
  for (let i = 0; i < n; i++) enemyShot(sim, e, offset + (i / n) * TAU, speed, e.dmg * 0.8);
}

// ─────────────────────────── death & loot ───────────────────────────

/** Alphas idle around their territory until provoked, then hunt with shockwave stomps; leashed to home. */
function alphaAI(sim: Sim, e: Enemy, d: number, dx: number, dy: number, dt: number): { x: number; y: number; speed: number } {
  const hx = e.homeX - e.x, hy = e.homeY - e.y;
  const hd = Math.hypot(hx, hy) || 1;
  e.ai -= dt;
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
    // Lured too far: give up, go home and recover.
    e.aiState = 0;
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3);
    return { x: hx / hd, y: hy / hd, speed: 1 };
  }
  if (e.ai <= 0 && d < 320) {
    e.ai = sim.rng.range(2.6, 3.6);
    const n = 10;
    const off = sim.rng.range(0, TAU);
    for (let i = 0; i < n; i++) enemyShot(sim, e, off + (i / n) * TAU, 110, e.dmg * 0.7);
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
  sim.emit({ e: 'kill', x: e.x, y: e.y, species: e.speciesId, boss: e.boss, shiny: e.shiny, type: e.types[0] });
  const r = sim.rng;
  dropCandy(sim, e);
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
    sim.spawnPickup('chest', e.x, e.y, e.final ? 4 : 3);
    for (let i = 0; i < 10; i++) sim.spawnPickup('coin', e.x, e.y, 5);
    sim.spawnPickup('sitrus', e.x, e.y);
    if (e.final) sim.finalDefeated = true;
    sim.emit({ e: 'bossDown', species: e.speciesId, final: e.final });
    sim.queueCine({ kind: 'bossDown', t: 0, dur: e.final ? 3 : 1.2, player: killerId, species: e.speciesId });
  }
}
