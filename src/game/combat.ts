import { MOVES, moveStatsAt, type MoveDef, type MoveStats, type StatusKind } from '../data/moves.ts';
import type { PType } from '../data/types.ts';
import { TAU, wrapAngle } from '../engine/math.ts';
import { baseDamage, incomingDamage, resolveHit } from './damage.ts';
import { killEnemy } from './enemies.ts';
import type { Sim } from './sim.ts';
import type { Enemy, Player, Projectile, Shape } from './types.ts';

const HIGH_CRIT = new Set(['razor-leaf', 'karate-chop', 'leaf-blade', 'night-slash', 'blaze-kick', 'cross-chop', 'air-slash', 'stone-edge', 'crunch']);
const COUNT_BEHAVIORS = new Set(['projectile', 'strike', 'zone', 'chain', 'boomerang', 'orbit', 'lob', 'wave']);
const TARGET_RANGE = 380;

export function makeProjectile(sim: Sim, o: Partial<Projectile>): Projectile {
  const p: Projectile = {
    id: sim.id(), owner: -1, hostile: false, moveId: '', behavior: 'projectile', fx: 'orb', type: 'normal',
    cat: 'special', shape: 'circle', x: 0, y: 0, vx: 0, vy: 0, angle: 0, r: 6, len: 0, t: 0, life: 1,
    delay: 0, attach: false, ox: 0, oy: 0, orbitR: 0, orbitSpd: 0, orbitA: 0, homing: 0, speed: 0,
    boomerang: 0, returning: false, tx: 0, ty: 0, sx: 0, sy: 0, pierce: -1, tick: 0, dmg: 0, knock: 0,
    chance: 0, crit: 0, hit: new Map(), dead: false, growth: 0,
    ...o,
  };
  sim.projectiles.push(p);
  if (sim.replicate) sim.newProj.push(p);
  return p;
}

// ─────────────────────────── targeting ───────────────────────────

const tmp: { e: Enemy; d: number }[] = [];

/** Up to n nearest enemies to (x,y) within range, nearest first. */
export function nearestEnemies(sim: Sim, x: number, y: number, n: number, range = TARGET_RANGE): Enemy[] {
  tmp.length = 0;
  sim.grid.query(x, y, range, (e) => {
    const dx = e.x - x, dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < range * range) tmp.push({ e, d });
  });
  if (tmp.length > n * 4) {
    // partial selection is enough for small n
    const out: Enemy[] = [];
    for (let k = 0; k < n; k++) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < tmp.length; i++) if (tmp[i].d < bd) { bd = tmp[i].d; bi = i; }
      if (bi < 0) break;
      out.push(tmp[bi].e);
      tmp[bi].d = Infinity;
    }
    return out;
  }
  tmp.sort((a, b) => a.d - b.d);
  return tmp.slice(0, n).map((t) => t.e);
}

function randomEnemiesInView(sim: Sim, p: Player, n: number): Enemy[] {
  const hw = p.viewW / 2, hh = p.viewH / 2;
  const pool: Enemy[] = [];
  sim.grid.query(p.x, p.y, Math.max(hw, hh), (e) => {
    if (Math.abs(e.x - p.x) < hw && Math.abs(e.y - p.y) < hh) pool.push(e);
  });
  // Prefer bosses/elites a bit, otherwise random distinct picks.
  const out: Enemy[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = sim.rng.int(0, pool.length - 1);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

// ─────────────────────────── firing ───────────────────────────

export function fireMoves(sim: Sim, dt: number) {
  for (const p of sim.players) {
    if (p.fainted || !p.connected) continue;
    for (const m of p.moves) {
      m.cd -= dt;
      if (m.cd > 0) continue;
      const def = MOVES[m.id];
      const s = scaledStats(def, m.level, p);
      fire(sim, p, def, s);
      m.cd += Math.max(0.12, s.cd);
      if (m.cd < 0) m.cd = s.cd;
    }
    if (p.ability === 'sand-stream') {
      p.sandT = (p.sandT ?? 0) - dt;
      if (p.sandT <= 0) {
        p.sandT = 0.7;
        const def = MOVES.sandstorm;
        const s = { ...moveStatsAt(def, 1), power: 8, area: 80 * p.stats.area };
        spawnAura(sim, p, def, s, 'ability');
      }
    }
  }
}

function scaledStats(def: MoveDef, level: number, p: Player): MoveStats {
  const s = moveStatsAt(def, level);
  s.cd *= p.stats.cooldown;
  s.area *= p.stats.area;
  if (def.behavior !== 'aura') s.duration *= p.stats.duration;
  if (COUNT_BEHAVIORS.has(def.behavior)) s.count += p.stats.countBonus;
  if (def.behavior === 'aura' || def.behavior === 'nova' || def.behavior === 'cone') s.range *= p.stats.area;
  // speed-dependent moves
  if (def.id === 'electro-ball') s.power *= Math.min(1.8, Math.max(0.7, p.stats.speed / 150));
  if (def.id === 'gyro-ball') s.power *= Math.min(1.8, Math.max(0.7, 150 / p.stats.speed));
  return s;
}

function dmgFor(p: Player, def: MoveDef, power: number) {
  return baseDamage(def, power, p.stats, p.types, p.ability, p.hp / p.stats.maxHp);
}

function critFor(p: Player, def: MoveDef) {
  return p.stats.crit + (HIGH_CRIT.has(def.id) ? 0.15 : 0);
}

function common(p: Player, def: MoveDef, s: MoveStats, power = s.power): Partial<Projectile> {
  return {
    owner: p.id, moveId: def.id, behavior: def.behavior, fx: def.fx, type: def.type, cat: def.cat,
    dmg: dmgFor(p, def, power), knock: s.knock, effect: def.effect, chance: s.chance, crit: critFor(p, def),
    pierce: s.pierce, tick: s.tick,
  };
}

/** A boss within range, used to bias some shots so bosses don't hide behind crowds. */
function bossInRange(sim: Sim, p: Player, range: number): Enemy | undefined {
  for (const e of sim.enemies) {
    if (e.boss && e.alive && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < range * range) return e;
  }
  return undefined;
}

function priorityTargets(sim: Sim, p: Player, n: number, range = TARGET_RANGE): Enemy[] {
  const list = nearestEnemies(sim, p.x, p.y, n, range);
  const boss = sim.rng.chance(0.4) ? bossInRange(sim, p, range) : undefined;
  if (boss && !list.includes(boss)) list.unshift(boss);
  return list.slice(0, Math.max(1, n));
}

function aimAngle(sim: Sim, p: Player): number {
  const t = priorityTargets(sim, p, 1)[0];
  return t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
}

function spawnAura(sim: Sim, p: Player, def: MoveDef, s: MoveStats, moveId = def.id) {
  makeProjectile(sim, {
    ...common(p, def, s), moveId, shape: 'circle', x: p.x, y: p.y, r: s.area, life: Math.max(0.3, s.cd * 1.02),
    attach: true, tick: 0, pierce: -1,
  });
}

function fire(sim: Sim, p: Player, def: MoveDef, s: MoveStats) {
  sim.emit({ e: 'fire', player: p.id, move: def.id, type: def.type, behavior: def.behavior });
  const c = common(p, def, s);
  switch (def.behavior) {
    case 'projectile': {
      const n = Math.max(1, Math.round(s.count));
      const targets = s.spread ? [] : priorityTargets(sim, p, n);
      const base = aimAngle(sim, p);
      const spreadRad = (s.spread * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        let a: number;
        if (s.spread >= 360) a = base + (i / n) * TAU;
        else if (s.spread) a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadRad);
        else {
          const t = targets[i % Math.max(1, targets.length)];
          a = t ? Math.atan2(t.y - p.y, t.x - p.x) + (i >= targets.length ? sim.rng.range(-0.3, 0.3) : 0) : base + (i - (n - 1) / 2) * 0.25;
        }
        makeProjectile(sim, {
          ...c, shape: 'circle', x: p.x, y: p.y - 4, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
          angle: a, speed: s.speed, r: s.area, life: s.duration, homing: s.homing, pierce: s.pierce,
          delay: i * 0.04,
        });
      }
      break;
    }
    case 'melee': {
      const dirs = Math.max(1, Math.round(s.count));
      // Auto-aim at the nearest foe in reach; otherwise swing where we're facing.
      const near = nearestEnemies(sim, p.x, p.y, 1, (s.range + s.area * 1.6))[0];
      const fa = near ? Math.atan2(near.y - p.y, near.x - p.x) : Math.atan2(p.fy, p.fx);
      const angles = [fa, fa + Math.PI, fa + Math.PI / 2, fa - Math.PI / 2].slice(0, Math.min(4, dirs));
      angles.forEach((a, i) => {
        const off = s.range + s.area * 0.5;
        makeProjectile(sim, {
          ...c, shape: 'box', x: p.x + Math.cos(a) * off, y: p.y + Math.sin(a) * off, angle: a, len: s.area,
          r: Math.max(12, s.area * 0.45), life: Math.max(0.15, s.duration), attach: true,
          ox: Math.cos(a) * off, oy: Math.sin(a) * off, pierce: -1, tick: 0, delay: i * 0.08,
        });
      });
      break;
    }
    case 'orbit': {
      const n = Math.max(1, Math.round(s.count));
      for (let i = 0; i < n; i++) {
        makeProjectile(sim, {
          ...c, shape: 'circle', r: s.area, life: s.duration, attach: true, orbitR: s.range,
          orbitSpd: s.speed, orbitA: (i / n) * TAU, x: p.x, y: p.y, pierce: -1, tick: s.tick,
        });
      }
      break;
    }
    case 'aura':
      spawnAura(sim, p, def, s);
      break;
    case 'nova': {
      const n = Math.max(1, Math.round(s.count));
      const power = def.id === 'magnitude' ? s.power * sim.rng.range(0.5, 1.8) : s.power;
      for (let i = 0; i < n; i++) {
        makeProjectile(sim, {
          ...common(p, def, s, power), shape: 'ring', x: p.x, y: p.y, r: 6, growth: s.area,
          life: Math.max(0.3, s.duration) + i * 0.3, delay: i * 0.3, attach: true, pierce: -1, tick: 0,
        });
      }
      break;
    }
    case 'beam': {
      const n = Math.max(1, Math.round(s.count));
      const targets = priorityTargets(sim, p, n, s.range);
      const base = aimAngle(sim, p);
      for (let i = 0; i < n; i++) {
        const t = targets[i];
        const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : base + (i - (n - 1) / 2) * 0.5;
        makeProjectile(sim, {
          ...c, shape: 'line', x: p.x, y: p.y - 4, angle: a, len: s.range, r: s.area,
          life: Math.max(0.25, s.duration), attach: true, ox: 0, oy: -4, pierce: -1, tick: 0, delay: i * 0.06,
        });
      }
      break;
    }
    case 'strike': {
      const n = Math.max(1, Math.round(s.count));
      const targets = randomEnemiesInView(sim, p, n);
      const boss = bossInRange(sim, p, Math.max(p.viewW, p.viewH) / 2);
      if (boss && sim.rng.chance(0.5)) targets.unshift(boss);
      for (let i = 0; i < n; i++) {
        const t = targets[i];
        const x = t ? t.x : p.x + sim.rng.range(-200, 200);
        const y = t ? t.y : p.y + sim.rng.range(-130, 130);
        makeProjectile(sim, {
          ...c, shape: 'circle', x, y, r: s.area, delay: 0.32 + i * 0.05, life: 0.32 + i * 0.05 + 0.4,
          pierce: -1, tick: 0,
        });
      }
      break;
    }
    case 'zone': {
      const n = Math.max(1, Math.round(s.count));
      const targets = nearestEnemies(sim, p.x, p.y, n * 3, 260);
      for (let i = 0; i < n; i++) {
        const t = targets.length ? targets[sim.rng.int(0, targets.length - 1)] : undefined;
        const x = t ? t.x : p.x + sim.rng.range(-120, 120);
        const y = t ? t.y : p.y + sim.rng.range(-120, 120);
        makeProjectile(sim, { ...c, shape: 'circle', x, y, r: s.area, life: s.duration, pierce: -1, tick: s.tick });
      }
      break;
    }
    case 'boomerang': {
      const n = Math.max(1, Math.round(s.count));
      const targets = nearestEnemies(sim, p.x, p.y, n);
      const base = aimAngle(sim, p);
      for (let i = 0; i < n; i++) {
        const t = targets[i];
        const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : base + (i / n) * TAU;
        makeProjectile(sim, {
          ...c, shape: 'circle', x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, angle: a,
          speed: s.speed, r: s.area, life: 6, boomerang: s.range, pierce: -1, tick: 0, delay: i * 0.1,
        });
      }
      break;
    }
    case 'chain': {
      const first = nearestEnemies(sim, p.x, p.y, 1, 300)[0];
      if (!first) break;
      const pts = [p.x, p.y - 6];
      const hit = new Set<number>();
      let cur: Enemy | undefined = first;
      const n = Math.max(1, Math.round(s.count));
      const pr = makeProjectile(sim, { ...c, shape: 'circle', x: p.x, y: p.y, r: 0, life: 0.01, pierce: -1 });
      for (let i = 0; i < n && cur; i++) {
        hit.add(cur.id);
        pts.push(cur.x, cur.y - 6);
        hitEnemy(sim, pr, cur);
        const from: Enemy = cur;
        cur = sim.grid.nearest(from.x, from.y, s.range, (e) => e.alive && !hit.has(e.id));
      }
      sim.emit({ e: 'chain', pts, type: def.type });
      break;
    }
    case 'trail':
      makeProjectile(sim, { ...c, shape: 'circle', x: p.x, y: p.y + 4, r: s.area, life: s.duration, pierce: -1, tick: s.tick });
      break;
    case 'cone': {
      const a = aimAngle(sim, p);
      makeProjectile(sim, {
        ...c, shape: 'cone', x: p.x, y: p.y - 4, angle: a, len: s.range, r: s.area, life: s.duration,
        attach: true, ox: 0, oy: -4, pierce: -1, tick: s.tick,
      });
      break;
    }
    case 'wave': {
      const n = Math.max(1, Math.round(s.count));
      const base = aimAngle(sim, p);
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * TAU;
        makeProjectile(sim, {
          ...c, shape: 'box', x: p.x - Math.cos(a) * 20, y: p.y - Math.sin(a) * 20, angle: a, len: 12, r: s.area,
          vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, speed: s.speed, life: s.duration, pierce: -1,
          tick: 0, homing: def.id === 'hurricane' ? 1.2 : 0,
        });
      }
      break;
    }
    case 'lob': {
      const n = Math.max(1, Math.round(s.count));
      const targets = priorityTargets(sim, p, n, 340);
      for (let i = 0; i < n; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        const tx = t ? t.x + (i >= targets.length ? sim.rng.range(-40, 40) : 0) : p.x + p.fx * 120 + sim.rng.range(-30, 30);
        const ty = t ? t.y + (i >= targets.length ? sim.rng.range(-40, 40) : 0) : p.y + p.fy * 120 + sim.rng.range(-30, 30);
        const flight = Math.max(0.25, Math.hypot(tx - p.x, ty - p.y) / s.speed);
        makeProjectile(sim, {
          ...c, shape: 'circle', x: p.x, y: p.y, sx: p.x, sy: p.y, tx, ty, r: s.area, len: flight,
          life: flight + 0.35, delay: i * 0.08, pierce: -1, tick: 0,
        });
      }
      break;
    }
    case 'buff': {
      const b = def.buff!;
      const dur = s.duration * p.stats.duration;
      const existing = p.buffs.find((x) => x.kind === b.kind);
      if (existing) existing.t = Math.max(existing.t, dur);
      else p.buffs.push({ kind: b.kind, amount: b.amount, t: dur });
      makeProjectile(sim, { ...c, shape: 'circle', x: p.x, y: p.y, r: 26, life: 0.6, attach: true, dmg: 0, pierce: 0 });
      break;
    }
  }
}

// ─────────────────────────── projectile update ───────────────────────────

function isActive(pr: Projectile): boolean {
  if (pr.t < pr.delay) return false;
  switch (pr.behavior) {
    case 'strike': return pr.t < pr.delay + 0.12;
    case 'beam': return pr.t < pr.delay + 0.12;
    case 'lob': return pr.t >= pr.delay + pr.len && pr.t < pr.delay + pr.len + 0.1;
    case 'buff': return false;
    default: return true;
  }
}

export function stepProjectileMotion(sim: Sim, pr: Projectile, dt: number, findTarget: (x: number, y: number, r: number) => { x: number; y: number } | undefined) {
  pr.t += dt;
  if (pr.t >= pr.life) { pr.dead = true; return; }
  if (pr.t < pr.delay && !pr.attach) return;
  const owner = pr.owner >= 0 ? sim.players[pr.owner] : undefined;
  if (pr.orbitR && owner) {
    pr.orbitA += pr.orbitSpd * dt;
    pr.x = owner.x + Math.cos(pr.orbitA) * pr.orbitR;
    pr.y = owner.y - 4 + Math.sin(pr.orbitA) * pr.orbitR * 0.85;
    return;
  }
  if (pr.attach && owner) {
    pr.x = owner.x + pr.ox;
    pr.y = owner.y + pr.oy;
    if (pr.shape === 'ring') pr.r = 6 + (pr.growth - 6) * Math.min(1, Math.max(0, (pr.t - pr.delay) / Math.max(0.05, (pr.life - pr.delay) * 0.7)));
    return;
  }
  if (pr.behavior === 'lob') {
    const k = Math.min(1, Math.max(0, (pr.t - pr.delay) / pr.len));
    pr.x = pr.sx + (pr.tx - pr.sx) * k;
    pr.y = pr.sy + (pr.ty - pr.sy) * k;
    return;
  }
  if (pr.homing) {
    const t = findTarget(pr.x, pr.y, 260);
    if (t) {
      const want = Math.atan2(t.y - pr.y, t.x - pr.x);
      const cur = Math.atan2(pr.vy, pr.vx);
      const diff = wrapAngle(want - cur);
      const turn = Math.max(-pr.homing * dt, Math.min(pr.homing * dt, diff));
      const a = cur + turn;
      pr.vx = Math.cos(a) * pr.speed;
      pr.vy = Math.sin(a) * pr.speed;
      pr.angle = a;
    }
  }
  if (pr.boomerang && owner) {
    if (!pr.returning) {
      pr.sx += Math.hypot(pr.vx, pr.vy) * dt;
      if (pr.sx >= pr.boomerang) { pr.returning = true; pr.hit.clear(); }
    } else {
      const a = Math.atan2(owner.y - pr.y, owner.x - pr.x);
      pr.vx = Math.cos(a) * pr.speed * 1.15;
      pr.vy = Math.sin(a) * pr.speed * 1.15;
      if ((owner.x - pr.x) ** 2 + (owner.y - pr.y) ** 2 < 16 * 16) { pr.dead = true; return; }
    }
    pr.angle += dt * 14;
  }
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
}

function boundRadius(pr: Projectile): number {
  switch (pr.shape) {
    case 'line': return pr.len / 2 + pr.r;
    case 'box': return Math.hypot(pr.len, pr.r);
    case 'cone': return pr.len;
    default: return pr.r;
  }
}

function overlaps(pr: Projectile, ex: number, ey: number, er: number): boolean {
  const dx = ex - pr.x, dy = ey - pr.y;
  switch (pr.shape as Shape) {
    case 'circle':
    case 'ring':
      return dx * dx + dy * dy < (pr.r + er) ** 2;
    case 'line': {
      const c = Math.cos(pr.angle), s = Math.sin(pr.angle);
      const u = dx * c + dy * s;
      const v = -dx * s + dy * c;
      return u > -er && u < pr.len + er && Math.abs(v) < pr.r + er;
    }
    case 'box': {
      const c = Math.cos(pr.angle), s = Math.sin(pr.angle);
      const u = dx * c + dy * s;
      const v = -dx * s + dy * c;
      return Math.abs(u) < pr.len + er && Math.abs(v) < pr.r + er;
    }
    case 'cone': {
      const d = Math.hypot(dx, dy);
      if (d > pr.len + er) return false;
      if (d < er + 6) return true;
      const half = Math.atan2(pr.r, pr.len) + er / d;
      return Math.abs(wrapAngle(Math.atan2(dy, dx) - pr.angle)) < half;
    }
  }
}

export function updateProjectiles(sim: Sim, dt: number) {
  const find = (x: number, y: number, r: number) => sim.grid.nearest(x, y, r, (e) => e.alive);
  for (const pr of sim.projectiles) {
    if (pr.dead) continue;
    stepProjectileMotion(sim, pr, dt, find);
    if (pr.dead) continue;
    if (pr.hostile) {
      for (const p of sim.players) {
        if (p.fainted) continue;
        if (overlaps(pr, p.x, p.y, p.radius)) {
          sim.hurtPlayer(p, pr.dmg, pr.type, true);
          if (pr.pierce > 0 && --pr.pierce === 0) { pr.dead = true; break; }
        }
      }
      continue;
    }
    if (pr.dmg <= 0 || !isActive(pr)) continue;
    sim.grid.query(pr.x, pr.y, boundRadius(pr) + 24, (e) => {
      if (pr.dead || !e.alive) return;
      const next = pr.hit.get(e.id);
      if (next !== undefined && next > sim.time) return;
      if (!overlaps(pr, e.x, e.y, e.radius)) return;
      pr.hit.set(e.id, pr.tick > 0 ? sim.time + pr.tick : Infinity);
      hitEnemy(sim, pr, e);
      if (pr.pierce > 0 && --pr.pierce === 0) pr.dead = true;
    });
  }
}

// ─────────────────────────── damage ───────────────────────────

const STATUSED = (e: Enemy) => e.st.burn > 0 || e.st.poison > 0 || e.st.paralyze > 0 || e.st.freeze > 0 || e.st.confuse > 0;

export function hitEnemy(sim: Sim, pr: Projectile, e: Enemy) {
  const owner = sim.players[pr.owner];
  if (!owner) return;
  const bonus = pr.moveId === 'hex' && STATUSED(e) ? 2 : 1;
  const res = resolveHit(pr.dmg, pr.type, e.types, pr.crit, owner.stats, sim.rng.next(), bonus);
  e.hp -= res.dmg;
  e.flash = 0.1;
  e.lastHitBy = owner.id;
  if (pr.knock && !e.boss) {
    let kx = e.x - (pr.attach || pr.shape === 'ring' ? owner.x : pr.x);
    let ky = e.y - (pr.attach || pr.shape === 'ring' ? owner.y : pr.y);
    if (pr.shape === 'line' || pr.shape === 'cone' || (pr.vx === 0 && pr.vy === 0 && pr.shape === 'box' && !pr.attach)) {
      kx = Math.cos(pr.angle); ky = Math.sin(pr.angle);
    } else if (pr.vx || pr.vy) { kx = pr.vx; ky = pr.vy; }
    const l = Math.hypot(kx, ky) || 1;
    const k = pr.knock * (1 - e.knockResist) * 2.2;
    e.vx += (kx / l) * k;
    e.vy += (ky / l) * k;
  }
  owner.dmgDealt += res.dmg;
  const owned = owner.moves.find((m) => m.id === pr.moveId);
  if (owned) owned.dmgDealt += res.dmg;
  if (res.eff > 1) owner.superEff++;
  if (owner.stats.lifesteal) owner.hp = Math.min(owner.stats.maxHp, owner.hp + res.dmg * owner.stats.lifesteal);
  if (pr.effect && sim.rng.next() < pr.chance) applyStatus(sim, e, pr.effect, res.dmg, owner);
  if (owner.stats.flinch && sim.rng.next() < owner.stats.flinch) applyStatus(sim, e, 'flinch', 0, owner);
  sim.emit({ e: 'hit', x: e.x, y: e.y - e.radius, dmg: res.dmg, eff: res.eff, crit: res.crit, type: pr.type });
  if (e.hp <= 0) {
    if (owned) owned.kills++;
    killEnemy(sim, e, owner.id);
  }
}

export function applyStatus(sim: Sim, e: Enemy, kind: StatusKind, dmg: number, owner: Player) {
  const k = e.boss ? 0.3 : e.elite ? 0.6 : 1;
  const st = e.st;
  switch (kind) {
    case 'burn': st.burn = 3; st.burnDmg = Math.max(st.burnDmg, Math.max(1, dmg * 0.15)); st.dotOwner = owner.id; break;
    case 'poison':
      st.poison = 4; st.poisonStacks = Math.min(5, st.poisonStacks + 1);
      st.poisonDmg = Math.max(st.poisonDmg, Math.max(1, dmg * 0.08)); st.dotOwner = owner.id; break;
    case 'paralyze': st.paralyze = 2.5 * k; break;
    case 'freeze': st.freeze = 1.2 * k; break;
    case 'slow': st.slow = 2 * k; break;
    case 'confuse': st.confuse = 1.6 * k; break;
    case 'flinch': st.flinch = 0.35 * k; break;
    case 'drain': owner.hp = Math.min(owner.stats.maxHp, owner.hp + Math.max(1, dmg * 0.25)); break;
    case 'coin': st.coin = 1; break;
  }
  void sim;
}

/** Damage to an enemy that doesn't come from a projectile (DoTs, thorns, abilities). */
export function rawDamageEnemy(sim: Sim, e: Enemy, dmg: number, type: PType, ownerId: number) {
  if (!e.alive) return;
  e.hp -= dmg;
  e.flash = Math.max(e.flash, 0.05);
  const owner = sim.players[ownerId];
  if (owner) owner.dmgDealt += dmg;
  sim.emit({ e: 'hit', x: e.x, y: e.y - e.radius, dmg: Math.round(dmg), eff: 1, crit: false, type });
  if (e.hp <= 0) killEnemy(sim, e, ownerId);
}

export function damagePlayer(sim: Sim, p: Player, raw: number, type: PType, special: boolean) {
  if (p.fainted || raw <= 0 || sim.invulnerable) return;
  const dodge = p.buffs.find((b) => b.kind === 'dodge');
  if (dodge && sim.rng.next() < dodge.amount) return;
  let dmg = incomingDamage(raw, type, p.types, special ? p.stats.projTaken : p.stats.contactTaken);
  if (p.ability === 'multiscale' && p.hp >= p.stats.maxHp - 0.5) dmg *= 0.5;
  p.hp -= dmg;
  p.hurtT = 0.25;
  p.lastHit = sim.time;
  p.dmgTaken += dmg;
  sim.emit({ e: 'hurt', player: p.id, dmg });
  if (p.hp > 0) return;
  if (sim.rng.next() < p.stats.focus) { p.hp = 1; return; }
  if (p.revives > 0) {
    p.revives--;
    p.hp = p.stats.maxHp * 0.5;
    sim.emit({ e: 'revive', player: p.id });
    for (const e of sim.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 220 && !e.boss) {
        e.vx += (dx / (d || 1)) * 900;
        e.vy += (dy / (d || 1)) * 900;
        e.st.freeze = 1.5;
      }
    }
    return;
  }
  p.hp = 0;
  p.fainted = true;
  p.reviveProgress = 0;
  sim.emit({ e: 'faint', player: p.id });
}
