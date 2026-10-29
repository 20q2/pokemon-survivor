import { MOVES, MOVE_LIST, NON_ATTACKS, moveStatsAt, type MoveDef, type MoveStats, type StatusKind, type TargetRule } from '../data/moves.ts';
import type { PType } from '../data/types.ts';
import { TAU, wrapAngle } from '../engine/math.ts';
import { baseDamage, incomingDamage, resolveHit, POWER_SCALE } from './damage.ts';
import { killEnemy } from './enemies.ts';
import type { Sim } from './sim.ts';
import { megaOnHurt } from './mega.ts';
import { creditDamage, heal } from './ledger.ts';
import { HAZARD, updateHazard } from './hazards.ts';
import type { Enemy, OwnedMove, Player, Projectile, Shape, StatusState } from './types.ts';

const HIGH_CRIT = new Set(['razor-leaf', 'karate-chop', 'leaf-blade', 'blaze-kick', 'stone-edge', 'crunch']);
const COUNT_BEHAVIORS = new Set(['projectile', 'strike', 'zone', 'chain', 'boomerang', 'orbit', 'lob', 'wave', 'mine', 'minion', 'wall']);
const TARGET_RANGE = 380;

// Per-projectile flags.
export const PF_RETARGET = 1;     // beams: re-aim at the nearest foe when the delay (charge) ends
export const PF_TRACK = 2;        // cones: keep turning toward the nearest foe
export const PF_MOVING = 4;       // body auras: only hurt while the owner is moving
export const PF_DELETE = 8;       // destroys hostile projectiles it touches
export const PF_PULL = 16;        // zones: pull foes toward the centre
export const PF_PUDDLE = 32;      // lobs: leave a poison puddle
export const PF_SHARDS = 64;      // lobs: burst into shards
export const PF_BURNGROUND = 128; // lobs: leave burning ground
export const PF_RICOCHET = 256;   // bounce to the next foe after a hit
export const PF_STICKY = 512;     // latch on and detonate later
export const PF_PULSE = 1024;     // explode periodically along the path
export const PF_REFRACT = 2048;   // beams: split into three at the first foe hit
export const PF_NOIMPACT = 4096;  // applies status without dealing damage
export const PF_DONE = 8192;      // one-shot latch (aftermath spawned, crit reset used, split done…)
export const PF_FOCUS = 16384;    // fizzles if the owner is hurt before it goes off
export const PF_PERCENT = 32768;  // damage is a slice of the foe's max HP
export const PF_LONGBURN = 65536; // burns it applies last twice as long

export function makeProjectile(sim: Sim, o: Partial<Projectile>): Projectile {
  const p: Projectile = {
    id: sim.id(), owner: -1, hostile: false, moveId: '', behavior: 'projectile', fx: 'orb', type: 'normal',
    cat: 'special', shape: 'circle', x: 0, y: 0, vx: 0, vy: 0, angle: 0, r: 6, len: 0, t: 0, life: 1,
    delay: 0, attach: false, ox: 0, oy: 0, orbitR: 0, orbitSpd: 0, orbitA: 0, homing: 0, speed: 0,
    boomerang: 0, returning: false, tx: 0, ty: 0, sx: 0, sy: 0, pierce: -1, tick: 0, dmg: 0, knock: 0,
    chance: 0, crit: 0, hit: new Map(), dead: false, growth: 0,
    chance2: 0, angSpd: 0, release: 0, base: 0, follow: 0, bounce: 0, ramp: 0, mult: 1, rampT: 0, fixed: 0, timer: 0, flags: 0,
    ...o,
  };
  sim.projectiles.push(p);
  if (sim.replicate) sim.newProj.push(p);
  return p;
}

/** Re-send a projectile whose motion changed on the host (ricochet, latch, split) so guests follow. */
function resync(sim: Sim, pr: Projectile) {
  if (sim.replicate && !sim.newProj.includes(pr)) sim.newProj.push(pr);
}

export function freshStatus(): StatusState {
  return {
    burn: 0, poison: 0, poisonStacks: 0, paralyze: 0, freeze: 0, slow: 0, confuse: 0, flinch: 0, dotTick: 0,
    burnDmg: 0, poisonDmg: 0, dotOwner: 0, coin: 0, wet: 0, chill: 0, chillT: 0, sleep: 0, charm: 0, vuln: 0,
    weaken: 0, root: 0, seed: 0, seedDmg: 0, seedOwner: 0, toxic: 0, curse: 0, curseOwner: 0, pins: 0, pinsT: 0,
    air: 0, airDmg: 0, airOwner: 0, ffCd: 0, robbed: 0,
  };
}

/** Any status condition that Hex / Night Slash care about. */
export const STATUSED = (e: Enemy) => {
  const s = e.st;
  return s.burn > 0 || s.poison > 0 || s.paralyze > 0 || s.freeze > 0 || s.confuse > 0 || s.sleep > 0 || s.wet > 0 ||
    s.chill > 0 || s.charm > 0 || s.vuln > 0 || s.weaken > 0 || s.root > 0 || s.seed > 0 || s.curse > 0 || s.slow > 0;
};

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

function enemiesInView(sim: Sim, p: Player): Enemy[] {
  const hw = p.viewW / 2, hh = p.viewH / 2;
  const pool: Enemy[] = [];
  sim.grid.query(p.x, p.y, Math.max(hw, hh), (e) => {
    if (Math.abs(e.x - p.x) < hw && Math.abs(e.y - p.y) < hh) pool.push(e);
  });
  return pool;
}

function randomEnemiesInView(sim: Sim, p: Player, n: number): Enemy[] {
  const pool = enemiesInView(sim, p);
  const out: Enemy[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = sim.rng.int(0, pool.length - 1);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

/** The foes in view a targeting rule prefers, best first. */
function ruleTargets(sim: Sim, p: Player, rule: TargetRule, n: number): Enemy[] {
  if (rule === 'nearest') return priorityTargets(sim, p, n);
  if (rule === 'random') return randomEnemiesInView(sim, p, n);
  const pool = enemiesInView(sim, p);
  if (!pool.length) return [];
  let score: (e: Enemy) => number;
  switch (rule) {
    case 'highestHp': score = (e) => e.hp + (e.boss ? 1e9 : e.elite || e.alpha ? 1e8 : 0); break;
    case 'lowestHp': score = (e) => -e.hp / e.maxHp - e.hp * 1e-6; break;
    case 'farthest': score = (e) => (e.x - p.x) ** 2 + (e.y - p.y) ** 2; break;
    case 'densest': {
      const dens = new Map<number, number>();
      for (const e of pool) {
        let c = 0;
        sim.grid.query(e.x, e.y, 56, (o) => { if (o.alive && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 56 * 56) c++; });
        dens.set(e.id, c);
      }
      score = (e) => dens.get(e.id)!;
      break;
    }
  }
  pool.sort((a, b) => score(b) - score(a));
  if (rule !== 'densest') return pool.slice(0, n);
  // Densest: spread multiple marks over different crowds.
  const out: Enemy[] = [];
  for (const e of pool) {
    if (out.length >= n) break;
    if (out.every((o) => (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > 90 * 90)) out.push(e);
  }
  return out;
}

// ─────────────────────────── weather ───────────────────────────

/** Damage multiplier the current weather gives a move type. */
export function weatherMult(sim: Sim, type: PType): number {
  switch (sim.weather) {
    case 'sun': return type === 'fire' ? 1.5 : type === 'water' ? 0.5 : 1;
    case 'rain': return type === 'water' ? 1.5 : type === 'fire' ? 0.5 : 1;
    case 'snow': return type === 'ice' ? 1.3 : 1;
    default: return 1;
  }
}

function updateWeather(sim: Sim, dt: number) {
  // Sand Stream keeps a sandstorm blowing whenever no other weather is up.
  for (const p of sim.players) {
    if (p.ability !== 'sand-stream' || p.fainted) continue;
    if (!sim.weather) { sim.weather = 'sand'; sim.weatherT = 1.2; sim.weatherOwner = p.id; sim.weatherPower = 8; sim.weatherTick = 0.5; }
    else if (sim.weather === 'sand') sim.weatherT = Math.max(sim.weatherT, 1.2);
  }
  if (!sim.weather) return;
  sim.weatherT -= dt;
  if (sim.weatherT <= 0) { sim.weather = null; return; }
  sim.weatherTick -= dt;
  if (sim.weatherTick > 0) return;
  sim.weatherTick = 1;
  const owner = sim.players[sim.weatherOwner];
  const seen = new Set<number>();
  for (const p of sim.players) {
    if (!p.connected) continue;
    for (const e of enemiesInView(sim, p)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (sim.weather === 'rain') e.st.wet = Math.max(e.st.wet, 2);
      else if (sim.weather === 'snow' && owner && sim.rng.chance(0.5)) applyStatus(sim, e, 'chill', 0, owner);
      else if (sim.weather === 'sand' && owner && !e.types.some((t) => t === 'rock' || t === 'ground' || t === 'steel')) {
        const d = sim.weatherPower * POWER_SCALE * Math.max(owner.stats.atk, owner.stats.spa) * (1 + sim.level * 0.04);
        rawDamageEnemy(sim, e, d, 'rock', owner.id, owner.ability === 'sand-stream' && !owner.moves.some((m) => m.id === 'sandstorm') ? 'sand-stream' : 'sandstorm');
      }
    }
  }
}

// ─────────────────────────── firing ───────────────────────────

export function fireMoves(sim: Sim, dt: number) {
  updateWeather(sim, dt);
  for (const p of sim.players) {
    if (p.fainted || !p.connected) continue;
    if (p.protectCd > 0) p.protectCd -= dt;
    const busy = p.burrowT > 0 || p.digWind > 0 || p.sleepT > 0;
    for (const m of p.moves) {
      const def = MOVES[m.id];
      if (def.behavior === 'passive') continue;
      if (busy) continue;
      // Outrage's exhaustion pauses everything else.
      if (p.exhaustT > 0 && def.id !== 'outrage') continue;
      if (def.id === 'spark') { updateSpark(sim, p, m, dt); continue; }
      m.cd -= dt;
      if (m.cd > 0) continue;
      const s = scaledStats(def, m.level, p);
      if (!fire(sim, p, def, s, m)) { m.cd = 0.05; continue; }
      m.cd += Math.max(0.12, s.cd);
      if (m.cd < 0) m.cd = s.cd;
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
  if (def.behavior === 'projectile' || def.behavior === 'boomerang' || def.behavior === 'wave' || def.behavior === 'lob') {
    s.speed *= p.stats.projSpeed;
    s.duration *= p.stats.projSpeed;
  }
  // speed-dependent moves
  if (def.id === 'electro-ball') s.power *= Math.min(1.8, Math.max(0.7, p.stats.speed / 150));
  if (def.id === 'gyro-ball') s.power *= Math.min(1.8, Math.max(0.7, 150 / p.stats.speed));
  return s;
}

function dmgFor(sim: Sim, p: Player, def: MoveDef, power: number, type: PType = def.type) {
  const d = type === def.type ? def : { ...def, type };
  return baseDamage(d, power, p.stats, p.types, p.ability, p.hp / p.stats.maxHp) * weatherMult(sim, type);
}

function critFor(p: Player, def: MoveDef) {
  if (def.id === 'aerial-ace') return 1;
  return p.stats.crit + (HIGH_CRIT.has(def.id) ? 0.15 : 0);
}

function common(sim: Sim, p: Player, def: MoveDef, s: MoveStats, power = s.power): Partial<Projectile> {
  const hidden = def.id === 'hidden-power';
  const type = hidden ? p.hiddenType : def.type;
  return {
    owner: p.id, moveId: def.id, behavior: def.behavior, fx: def.fx, type, cat: def.cat,
    dmg: dmgFor(sim, p, def, power, type), knock: s.knock, effect: hidden ? p.hiddenEffect : def.effect, chance: s.chance,
    effect2: def.effect2?.kind, chance2: def.effect2?.chance ?? 0, crit: critFor(p, def),
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
  return makeProjectile(sim, {
    ...common(sim, p, def, s), moveId, shape: 'circle', x: p.x, y: p.y, r: s.area, life: Math.max(0.3, s.cd * 1.02),
    attach: true, tick: 0, pierce: -1,
  });
}

/** A one-off explosion (area hit) at a point. */
function blast(sim: Sim, p: Player, def: MoveDef, x: number, y: number, r: number, dmg: number, extra: Partial<Projectile> = {}) {
  sim.emit({ e: 'boom', x, y, r, type: def.type });
  return makeProjectile(sim, {
    owner: p.id, moveId: def.id, behavior: 'strike', fx: def.fx, type: def.type, cat: def.cat, shape: 'circle',
    x, y, r, dmg, life: 0.3, pierce: -1, crit: p.stats.crit, knock: 60, ...extra,
  });
}

/** Weighted list of the moves Metronome may call. */
const METRONOME_POOL = MOVE_LIST.filter((m) => !m.mastery && !NON_ATTACKS.has(m.id) && m.behavior !== 'special' && m.behavior !== 'passive' && m.id !== 'explosion');

const SPEED_BUFF = 0.25;

/** Fires a move. Returns false if it had nothing to do (it will try again next frame). */
function fire(sim: Sim, p: Player, def: MoveDef, s: MoveStats, m?: OwnedMove): boolean {
  if (def.behavior === 'special') return fireSpecial(sim, p, def, s, m);
  // ── power hooks (computed once per cast) ──
  let power = s.power;
  if (def.id === 'hyper-voice' && m) {
    if (p.lastHit > (m.nt ?? -1)) m.n = 0;
    power *= 1 + Math.min(1.5, 0.15 * (m.n ?? 0));
    m.n = (m.n ?? 0) + 1;
    m.nt = sim.time;
  }
  if (def.id === 'pay-day') power *= 1 + 0.3 * Math.log(1 + sim.money / 50);
  if (def.id === 'bug-buzz') {
    let n = 0;
    sim.grid.query(p.x, p.y, s.area, (e) => { if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < s.area * s.area) n++; });
    power *= 1 + 0.06 * n;
  }
  if (def.id === 'magnitude') {
    const roll = sim.rng.int(4, 10);
    power *= [0.5, 0.7, 0.9, 1.1, 1.4, 1.8, 2.8][roll - 4];
    sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: `Magnitude ${roll}!`, color: roll >= 9 ? '#ffd84a' : '#e0c090' });
  }
  if (def.id === 'stored-power') {
    const n = new Set(p.buffs.map((b) => b.kind)).size;
    power *= 1 + 0.2 * n;
    s.count += n;
  }
  if (def.id === 'explosion') {
    p.hp = Math.max(1, p.hp - p.hp / 3);
    p.hurtT = 0.25;
  }
  if (def.id === 'draco-meteor') {
    const b = p.buffs.find((x) => x.kind === 'drained');
    if (b) { b.amount = Math.min(0.5, b.amount + 0.1); b.t = 5; } else p.buffs.push({ kind: 'drained', amount: 0.1, t: 5, src: def.id });
  }
  if (def.id === 'shadow-force') p.vanishT = 0.5;
  sim.emit({ e: 'fire', player: p.id, move: def.id, type: def.type, behavior: def.behavior === 'passive' ? 'buff' : def.behavior });
  const c = common(sim, p, def, s, power);
  const rule = def.target ?? 'nearest';
  switch (def.behavior) {
    case 'projectile': {
      let n = Math.max(1, Math.round(s.count));
      let flags = 0;
      if (def.id === 'razor-leaf') flags |= PF_RICOCHET;
      if (def.id === 'magnet-bomb') flags |= PF_STICKY;
      if (def.id === 'dragon-pulse') flags |= PF_PULSE;
      if (def.id === 'will-o-wisp') flags |= PF_NOIMPACT | PF_LONGBURN;
      if (def.id === 'dragon-rage') {
        let took = 0;
        for (const [t, d] of p.hurtLog) if (sim.time - t < 5) took += d;
        c.dmg = c.dmg! + took * 2;
      }
      // Bullet Seed: one target, a random 2–5 seeds (plus upgrades).
      const burst = def.id === 'bullet-seed';
      if (burst) n = sim.rng.int(2, 5) + Math.max(0, n - 2);
      const targets = s.spread ? [] : burst ? ruleTargets(sim, p, rule, 1) : ruleTargets(sim, p, rule, n);
      const base = s.spread && rule !== 'nearest' ? aimAt(p, targets[0]) : aimAngle(sim, p);
      const spreadRad = (s.spread * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        let a: number;
        if (s.spread >= 360) a = base + (i / n) * TAU + (def.id === 'powder-snow' ? sim.rng.range(-0.3, 0.3) : 0);
        else if (s.spread) a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadRad);
        else {
          const t = targets[i % Math.max(1, targets.length)];
          a = t ? Math.atan2(t.y - p.y, t.x - p.x) + (i >= targets.length ? sim.rng.range(-0.3, 0.3) : 0) : base + (i - (n - 1) / 2) * 0.25;
        }
        const sticky = flags & PF_STICKY;
        makeProjectile(sim, {
          ...c, shape: 'circle', x: p.x, y: p.y - 4, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
          angle: a, speed: s.speed, r: sticky ? 8 : s.area, growth: sticky ? s.area : 0, life: s.duration, homing: s.homing,
          pierce: sticky ? 1 : s.pierce, delay: i * (burst ? 0.07 : 0.04), flags,
          bounce: def.id === 'electro-ball' ? 99 : 0, timer: 0.3,
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
      const breathe = def.id === 'petal-dance';
      for (let i = 0; i < n; i++) {
        makeProjectile(sim, {
          ...c, shape: 'circle', r: s.area, life: s.duration, attach: true, orbitR: s.range,
          orbitSpd: s.speed, orbitA: (i / n) * TAU, x: p.x, y: p.y, pierce: -1, tick: s.tick,
          flags: def.id === 'rapid-spin' ? PF_DELETE : 0,
          base: breathe ? s.range : 0, growth: breathe ? Math.min(p.viewW, p.viewH) * 0.45 * p.stats.area : 0,
          release: def.id === 'twister' ? s.duration * 0.45 : 0, speed: def.id === 'twister' ? 240 : 0,
          ramp: def.id === 'rollout' ? 0.2 : 0,
        });
      }
      if (def.id === 'rapid-spin') addBuff(p, 'speed', SPEED_BUFF, 1.2, def.id);
      break;
    }
    case 'aura': {
      if (def.id === 'flame-wheel') {
        const pr = spawnAura(sim, p, def, s, def.id);
        pr.flags |= PF_MOVING;
        pr.dmg *= Math.min(2, Math.max(0.6, p.stats.speed / 150));
      } else spawnAura(sim, p, def, s);
      break;
    }
    case 'nova': {
      const n = Math.max(1, Math.round(s.count));
      // Screen-wide novas reach the edge of the view.
      const screen = def.id === 'heat-wave' || def.id === 'thunder-wave' || def.id === 'dazzling-gleam';
      const growth = screen ? Math.hypot(p.viewW, p.viewH) / 2 * Math.max(1, s.area / 420) : s.area;
      for (let i = 0; i < n; i++) {
        makeProjectile(sim, {
          ...c, shape: 'ring', x: p.x, y: p.y, r: 6, growth,
          life: Math.max(0.3, s.duration) + i * 0.3, delay: i * 0.3, attach: true, pierce: -1, tick: 0,
        });
      }
      break;
    }
    case 'beam': {
      const n = Math.max(1, Math.round(s.count));
      const sweep = def.id === 'ice-beam';
      const charge = def.id === 'solar-beam' && sim.weather !== 'sun' ? 1.5 : 0;
      const targets = priorityTargets(sim, p, n, s.range);
      const base = aimAngle(sim, p);
      for (let i = 0; i < n; i++) {
        const t = targets[i];
        const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : base + (i - (n - 1) / 2) * 0.5;
        makeProjectile(sim, {
          ...c, shape: 'line', x: p.x, y: p.y - 4, angle: sweep ? a + (i / n) * TAU : a, len: s.range, r: s.area,
          life: (sweep ? s.duration : Math.max(0.25, s.duration)) + charge, attach: true, ox: 0, oy: -4, pierce: -1,
          tick: sweep ? s.tick : 0, delay: i * 0.06 + charge,
          angSpd: sweep ? TAU / s.duration : 0,
          flags: (charge ? PF_RETARGET : 0) | (def.id === 'flash-cannon' ? PF_REFRACT : 0),
          fixed: def.id === 'night-shade' ? s.power * (2 + sim.level * 0.5) : 0,
        });
      }
      break;
    }
    case 'strike': {
      const n = Math.max(1, Math.round(s.count));
      const delayed = def.id === 'future-sight';
      const targets = def.target ? ruleTargets(sim, p, rule, n) : randomEnemiesInView(sim, p, n);
      if (!def.target) {
        const boss = bossInRange(sim, p, Math.max(p.viewW, p.viewH) / 2);
        if (boss && sim.rng.chance(0.5)) targets.unshift(boss);
      }
      for (let i = 0; i < n; i++) {
        const t = targets[i];
        const x = t ? t.x : p.x + sim.rng.range(-200, 200);
        const y = t ? t.y : p.y + sim.rng.range(-130, 130);
        const d = delayed ? 2.5 + i * 0.15 : 0.32 + i * 0.05;
        makeProjectile(sim, { ...c, shape: 'circle', x, y, r: s.area, delay: d, life: d + 0.4, pierce: -1, tick: 0, follow: delayed && t ? t.id : 0 });
      }
      break;
    }
    case 'zone': {
      const n = Math.max(1, Math.round(s.count));
      const targets = def.id === 'fire-spin' || def.id === 'whirlpool' || def.id === 'sleep-powder'
        ? ruleTargets(sim, p, 'densest', n) : nearestEnemies(sim, p.x, p.y, n * 3, 260);
      for (let i = 0; i < n; i++) {
        const t = targets.length ? targets[i % targets.length] : undefined;
        const x = t ? t.x : p.x + sim.rng.range(-120, 120);
        const y = t ? t.y : p.y + sim.rng.range(-120, 120);
        makeProjectile(sim, {
          ...c, shape: def.id === 'fire-spin' ? 'ring' : 'circle', x, y, r: s.area, growth: s.area, life: s.duration, pierce: -1, tick: s.tick,
          flags: def.id === 'whirlpool' ? PF_PULL : 0,
        });
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
      if (!first) return false;
      const pts = [p.x, p.y - 6];
      const hit = new Set<number>();
      let cur: Enemy | undefined = first;
      const n = Math.max(1, Math.round(s.count));
      const pr = makeProjectile(sim, { ...c, shape: 'circle', x: p.x, y: p.y, r: 0, life: 0.01, pierce: -1 });
      const strikes = def.id === 'thunder' ? (sim.weather === 'rain' ? 2 : 1) : 0;
      for (let i = 0; i < n && cur; i++) {
        hit.add(cur.id);
        pts.push(cur.x, cur.y - 6);
        hitEnemy(sim, pr, cur);
        for (let k = 0; k < strikes; k++) {
          makeProjectile(sim, { ...c, behavior: 'strike', shape: 'circle', x: cur.x, y: cur.y, r: s.area, delay: 0.25 + k * 0.25, life: 0.65 + k * 0.25, pierce: -1, tick: 0 });
        }
        const from: Enemy = cur;
        // Lightning jumps 50% farther out of paralyzed foes.
        const reach = s.range * (from.st.paralyze > 0 && def.type === 'electric' ? 1.5 : 1);
        cur = sim.grid.nearest(from.x, from.y, reach, (e) => e.alive && !hit.has(e.id));
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
        attach: true, ox: 0, oy: -4, pierce: -1, tick: s.tick, flags: def.id === 'flamethrower' ? PF_TRACK : 0,
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
      const flags = def.id === 'sludge-bomb' ? PF_PUDDLE : def.id === 'rock-throw' ? PF_SHARDS : def.id === 'fire-blast' ? PF_BURNGROUND : 0;
      for (let i = 0; i < n; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        const tx = t ? t.x + (i >= targets.length ? sim.rng.range(-40, 40) : 0) : p.x + p.fx * 120 + sim.rng.range(-30, 30);
        const ty = t ? t.y + (i >= targets.length ? sim.rng.range(-40, 40) : 0) : p.y + p.fy * 120 + sim.rng.range(-30, 30);
        const flight = Math.max(0.25, Math.hypot(tx - p.x, ty - p.y) / s.speed);
        makeProjectile(sim, {
          ...c, shape: 'circle', x: p.x, y: p.y, sx: p.x, sy: p.y, tx, ty, r: s.area, len: flight,
          life: flight + 0.35, delay: i * 0.08, pierce: -1, tick: 0, flags,
        });
      }
      break;
    }
    case 'buff': {
      const b = def.buff!;
      const dur = s.duration * p.stats.duration;
      if (b.kind === 'dance') {
        const cur = p.buffs.find((x) => x.kind === 'dance');
        if (cur) { cur.amount = Math.min(b.amount * 3, cur.amount + b.amount); cur.t = dur; } else p.buffs.push({ kind: 'dance', amount: b.amount, t: dur, src: def.id });
      } else if (b.kind === 'reflect' || b.kind === 'tailwind') {
        // Team moves: everyone close enough shares the effect.
        for (const o of sim.players) {
          if (o.fainted || !o.connected || (o.x - p.x) ** 2 + (o.y - p.y) ** 2 > s.area * s.area) continue;
          addBuff(o, b.kind, b.amount, dur, def.id);
          makeProjectile(sim, { ...c, owner: o.id, shape: 'circle', x: o.x, y: o.y, r: 26, life: 0.6, attach: true, dmg: 0, pierce: 0 });
        }
        break;
      } else addBuff(p, b.kind, b.amount, dur, def.id);
      makeProjectile(sim, { ...c, shape: 'circle', x: p.x, y: p.y, r: 26, life: 0.6, attach: true, dmg: 0, pierce: 0 });
      break;
    }
    case 'terrain':
      makeProjectile(sim, { ...c, dmg: 0, shape: 'circle', x: p.x, y: p.y + 2, r: s.area, life: s.duration, pierce: -1, tick: 0.5 });
      break;
    case 'weather':
      sim.weather = def.weather!;
      sim.weatherT = s.duration;
      sim.weatherTick = 0.2;
      sim.weatherOwner = p.id;
      sim.weatherPower = s.power;
      sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: WEATHER_NAME[def.weather!], color: '#fff' });
      break;
    case 'wall': {
      const n = Math.max(1, Math.round(s.count));
      const base = aimAngle(sim, p);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * (0.9 / Math.max(1, n - 1) + 0.25);
        makeProjectile(sim, {
          ...c, shape: 'circle', x: p.x + Math.cos(a) * s.range, y: p.y + Math.sin(a) * s.range, r: s.area,
          life: s.duration, pierce: -1, tick: 0,
        });
      }
      break;
    }
    case 'decoy': {
      if (p.hp <= p.stats.maxHp * 0.12) return false;
      p.hp -= p.stats.maxHp * 0.1;
      p.hurtT = 0.2;
      makeProjectile(sim, { ...c, dmg: 0, shape: 'circle', x: p.x - p.fx * 18, y: p.y - p.fy * 18, r: 10, growth: s.area, life: s.duration, pierce: -1 });
      break;
    }
    case 'mine': {
      const n = Math.max(1, Math.round(s.count));
      const drift = def.id === 'bubble';
      const off = sim.rng.range(0, TAU);
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        const r = drift ? 18 : s.range * sim.rng.range(0.8, 1.15);
        const da = sim.rng.range(0, TAU);
        makeProjectile(sim, {
          ...c, shape: 'circle', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, r: s.area,
          vx: drift ? Math.cos(da) * s.speed : 0, vy: drift ? Math.sin(da) * s.speed : 0, speed: drift ? s.speed : 0,
          life: s.duration, pierce: s.pierce, tick: 0.6, delay: drift ? 0 : 0.2,
          flags: def.id === 'stealth-rock' ? PF_PERCENT : 0,
        });
      }
      break;
    }
    case 'minion': {
      const n = Math.max(1, Math.round(s.count));
      const hosts = priorityTargets(sim, p, n);
      if (!hosts.length) return false;
      for (let i = 0; i < n; i++) {
        const h = hosts[i % hosts.length];
        makeProjectile(sim, { ...c, shape: 'circle', x: h.x, y: h.y, r: s.area, life: s.duration, pierce: -1, tick: s.tick, follow: h.id });
      }
      break;
    }
    case 'passive':
      break;
  }
  return true;
}

const WEATHER_NAME: Record<string, string> = { sun: 'Harsh sunlight!', rain: 'Heavy rain!', sand: 'Sandstorm!', snow: 'Snowscape!' };

function aimAt(p: Player, e: Enemy | undefined) {
  return e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.atan2(p.fy, p.fx);
}

function addBuff(p: Player, kind: Player['buffs'][number]['kind'], amount: number, t: number, src: string) {
  const existing = p.buffs.find((x) => x.kind === kind);
  if (existing) { existing.t = Math.max(existing.t, t); existing.amount = Math.max(existing.amount, amount); } else p.buffs.push({ kind, amount, t, src });
}

// ─────────────────────────── bespoke moves ───────────────────────────

function fireSpecial(sim: Sim, p: Player, def: MoveDef, s: MoveStats, m?: OwnedMove): boolean {
  const c = () => common(sim, p, def, s);
  const emitFire = () => sim.emit({ e: 'fire', player: p.id, move: def.id, type: def.type, behavior: 'nova' });
  switch (def.id) {
    case 'metronome': {
      const pick = METRONOME_POOL[sim.rng.int(0, METRONOME_POOL.length - 1)];
      sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: pick.name, color: '#ffe680' });
      fire(sim, p, pick, scaledStats(pick, m?.level ?? 1, p));
      return true;
    }
    case 'sky-uppercut': {
      const foes = nearestEnemies(sim, p.x, p.y, Math.round(s.count), s.range);
      if (!foes.length) return false;
      emitFire();
      const dmg = dmgFor(sim, p, def, s.power);
      for (const e of foes) {
        makeProjectile(sim, { ...c(), behavior: 'strike', shape: 'circle', x: e.x, y: e.y, r: 14, life: 0.25, pierce: 1, fx: 'punch' });
        if (!e.boss) { e.st.air = 0.8; e.st.airDmg = dmg; e.st.airOwner = p.id; }
        else rawDamageEnemy(sim, e, dmg, def.type, p.id, def.id);
      }
      return true;
    }
    case 'focus-punch': {
      emitFire();
      p.focusAt = sim.time;
      makeProjectile(sim, { ...c(), behavior: 'nova', shape: 'ring', x: p.x, y: p.y, r: 6, growth: s.area, delay: 2, life: 2.4, attach: true, pierce: -1, tick: 0, flags: PF_FOCUS });
      return true;
    }
    case 'bulldoze': {
      const t = nearestEnemies(sim, p.x, p.y, 1, s.range)[0];
      if (!t) return false;
      emitFire();
      const a = Math.atan2(t.y - p.y, t.x - p.x);
      const steps = Math.max(4, Math.round(s.range / 30));
      for (let i = 1; i <= steps; i++) {
        makeProjectile(sim, { ...c(), behavior: 'strike', shape: 'circle', x: p.x + Math.cos(a) * i * 30, y: p.y + Math.sin(a) * i * 30, r: s.area, delay: i * 0.05, life: i * 0.05 + 0.4, pierce: -1 });
      }
      return true;
    }
    case 'dig':
      if (!nearestEnemies(sim, p.x, p.y, 1, 300).length) return false;
      p.digWind = 0.6;
      sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: 'Dig!', color: '#e0c090' });
      return true;
    case 'sheer-cold': {
      emitFire();
      const r2 = s.area * s.area;
      makeProjectile(sim, { ...c(), behavior: 'nova', shape: 'ring', x: p.x, y: p.y, r: 6, growth: s.area, life: 0.5, attach: true, pierce: -1 });
      sim.grid.query(p.x, p.y, s.area, (e) => {
        if (!e.alive || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r2) return;
        if (e.st.freeze > 0 && !e.boss && !e.elite && !e.alpha) {
          sim.emit({ e: 'callout', x: e.x, y: e.y - 20, text: 'OHKO!', color: '#bfefff' });
          rawDamageEnemy(sim, e, e.hp + 1, 'ice', p.id, def.id);
        }
      });
      return true;
    }
    case 'mirror-coat': {
      let n = 0;
      const r2 = s.area * s.area;
      const dmg = dmgFor(sim, p, def, s.power);
      for (const pr of sim.projectiles) {
        if (!pr.hostile || pr.dead || pr.moveId === HAZARD || (pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 > r2) continue;
        pr.hostile = false;
        pr.owner = p.id;
        pr.moveId = def.id;
        pr.type = 'psychic';
        pr.dmg = dmg + pr.dmg * 2;
        pr.vx = -pr.vx * 2; pr.vy = -pr.vy * 2; pr.speed *= 2; pr.angle += Math.PI;
        pr.pierce = 2; pr.life = pr.t + 2; pr.homing = 4; pr.crit = p.stats.crit;
        resync(sim, pr);
        n++;
      }
      if (!n && !nearestEnemies(sim, p.x, p.y, 1, s.area).length) return false;
      makeProjectile(sim, { ...c(), behavior: 'nova', shape: 'ring', x: p.x, y: p.y, r: 6, growth: s.area, life: 0.35, attach: true, pierce: -1, dmg: 0 });
      return true;
    }
    case 'shadow-sneak': {
      const t = nearestEnemies(sim, p.x, p.y, 1, s.area + p.radius)[0];
      if (!t) return false;
      emitFire();
      makeProjectile(sim, { ...c(), behavior: 'melee', shape: 'circle', x: t.x, y: t.y, r: 16, life: 0.2, pierce: 1 });
      return true;
    }
    case 'curse': {
      const foes = ruleTargets(sim, p, 'highestHp', Math.round(s.count)).filter((e) => e.st.curse <= 0);
      if (!foes.length || p.hp <= p.stats.maxHp * 0.1) return false;
      emitFire();
      p.hp -= p.stats.maxHp * 0.08;
      p.hurtT = 0.2;
      for (const e of foes) {
        applyStatus(sim, e, 'curse', 0, p);
        makeProjectile(sim, { ...c(), behavior: 'strike', shape: 'circle', x: e.x, y: e.y, r: 18, life: 0.4, dmg: 0, pierce: 0 });
      }
      return true;
    }
    case 'outrage': {
      if (!nearestEnemies(sim, p.x, p.y, 1, 200).length) return false;
      emitFire();
      p.rageT = s.duration;
      makeProjectile(sim, { ...c(), behavior: 'aura', shape: 'circle', x: p.x, y: p.y, r: s.area, life: s.duration, attach: true, pierce: -1, tick: 0.3 });
      sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: 'Outrage!', color: '#ff7b5b' });
      return true;
    }
    case 'rock-slide': {
      const t = nearestEnemies(sim, p.x, p.y, 1)[0];
      if (!t) return false;
      emitFire();
      const n = Math.max(3, Math.round(s.count));
      const dir = sim.rng.chance(0.5) ? 1 : -1;
      const w = p.viewW * 0.9;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const x = p.x + dir * (k - 0.5) * w;
        makeProjectile(sim, { ...c(), behavior: 'strike', shape: 'circle', x, y: t.y + sim.rng.range(-10, 10), r: s.area, delay: 0.25 + k * 0.6, life: 0.65 + k * 0.6, pierce: -1 });
      }
      return true;
    }
    case 'rest':
      if (p.hp > p.stats.maxHp * 0.7) return false;
      p.sleepT = 1.5;
      heal(p, p.stats.maxHp * s.power, def.id);
      sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: 'Zzz…', color: '#cfd8ff' });
      return true;
  }
  return false;
}

/** Spark: gather static as you run; release on the first foe that comes close. */
function updateSpark(sim: Sim, p: Player, m: OwnedMove, dt: number) {
  const def = MOVES.spark;
  const s = scaledStats(def, m.level, p);
  if (p.staticCharge < s.range) {
    if (p.moving) p.staticCharge += p.stats.speed * dt;
    return;
  }
  const near = nearestEnemies(sim, p.x, p.y, 1, p.radius + 30)[0];
  if (!near) return;
  p.staticCharge = 0;
  sim.emit({ e: 'fire', player: p.id, move: def.id, type: def.type, behavior: 'nova' });
  makeProjectile(sim, { ...common(sim, p, def, s), behavior: 'nova', shape: 'ring', x: p.x, y: p.y, r: 6, growth: s.area, life: 0.4, attach: true, pierce: -1 });
}

/** Called each tick: Dig wind-up → underground → eruption; Rest; Outrage; exhaustion. */
export function updatePlayerMoves(sim: Sim, p: Player, dt: number) {
  if (p.vanishT > 0) p.vanishT -= dt;
  if (p.sleepT > 0) p.sleepT -= dt;
  if (p.exhaustT > 0) p.exhaustT -= dt;
  if (p.rageT > 0) {
    p.rageT -= dt;
    if (p.rageT <= 0) {
      p.exhaustT = 2;
      sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: 'Exhausted…', color: '#bbb' });
    }
  }
  if (p.digWind > 0) {
    p.digWind -= dt;
    if (p.digWind <= 0) p.burrowT = 1.5;
  } else if (p.burrowT > 0) {
    p.burrowT -= dt;
    if (p.burrowT <= 0) {
      const m = p.moves.find((x) => x.id === 'dig');
      const def = MOVES.dig;
      const s = scaledStats(def, m?.level ?? 1, p);
      sim.emit({ e: 'fire', player: p.id, move: def.id, type: def.type, behavior: 'nova' });
      sim.emit({ e: 'boom', x: p.x, y: p.y, r: s.area, type: 'ground' });
      makeProjectile(sim, { ...common(sim, p, def, s), behavior: 'nova', shape: 'ring', x: p.x, y: p.y, r: 6, growth: s.area, life: 0.5, attach: true, pierce: -1 });
    }
  }
  if (p.hurtLog.length && sim.time - p.hurtLog[0][0] > 5) p.hurtLog.shift();
}

// ─────────────────────────── projectile update ───────────────────────────

function isActive(pr: Projectile): boolean {
  if (pr.t < pr.delay) return false;
  switch (pr.behavior) {
    case 'strike': return pr.t < pr.delay + 0.12;
    case 'beam': return pr.angSpd ? true : pr.t < pr.delay + 0.12;
    case 'lob': return pr.t >= pr.delay + pr.len && pr.t < pr.delay + pr.len + 0.1;
    case 'wall': return pr.t < pr.delay + 0.15;
    case 'buff': case 'terrain': case 'decoy': return false;
    default: return true;
  }
}

export function stepProjectileMotion(sim: Sim, pr: Projectile, dt: number, findTarget: (x: number, y: number, r: number) => { x: number; y: number } | undefined) {
  pr.t += dt;
  if (pr.t >= pr.life) { pr.dead = true; return; }
  if (pr.t < pr.delay && !pr.attach) return;
  const owner = pr.owner >= 0 ? sim.players[pr.owner] : undefined;
  // Twister: after a while the orbit lets go and the twisters fly outward.
  if (pr.release && pr.orbitR && pr.t >= pr.release) {
    pr.vx = Math.cos(pr.orbitA) * pr.speed;
    pr.vy = Math.sin(pr.orbitA) * pr.speed;
    pr.orbitR = 0;
    pr.attach = false;
    pr.release = 0;
  }
  if (pr.orbitR && owner) {
    pr.orbitA += pr.orbitSpd * dt;
    if (pr.base) pr.orbitR = pr.base + (pr.growth - pr.base) * Math.sin(Math.PI * Math.min(1, pr.t / pr.life));
    pr.x = owner.x + Math.cos(pr.orbitA) * pr.orbitR;
    pr.y = owner.y - 4 + Math.sin(pr.orbitA) * pr.orbitR * 0.85;
    return;
  }
  if (pr.attach && owner) {
    pr.x = owner.x + pr.ox;
    pr.y = owner.y + pr.oy;
    if (pr.shape === 'ring') pr.r = 6 + (pr.growth - 6) * Math.min(1, Math.max(0, (pr.t - pr.delay) / Math.max(0.05, (pr.life - pr.delay) * 0.7)));
    if (pr.angSpd && pr.t >= pr.delay) pr.angle += pr.angSpd * dt;
    if (pr.flags & PF_TRACK) {
      const t = findTarget(owner.x, owner.y, pr.len + 30);
      if (t) pr.angle += Math.max(-4 * dt, Math.min(4 * dt, wrapAngle(Math.atan2(t.y - pr.y, t.x - pr.x) - pr.angle)));
    }
    if ((pr.flags & PF_RETARGET) && pr.t >= pr.delay && pr.t - dt < pr.delay) {
      const t = findTarget(owner.x, owner.y, pr.len);
      if (t) pr.angle = Math.atan2(t.y - pr.y, t.x - pr.x);
    }
    return;
  }
  if (pr.follow) {
    const e = sim.enemies.find((x) => x.id === pr.follow);
    if (e && e.alive) { pr.x = e.x; pr.y = e.y - 4; }
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
  // Electro Ball: bounce off the edges of the owner's screen.
  if (pr.bounce && owner) {
    const hw = owner.viewW / 2 - 8, hh = owner.viewH / 2 - 8;
    if ((pr.x < owner.x - hw && pr.vx < 0) || (pr.x > owner.x + hw && pr.vx > 0)) { pr.vx = -pr.vx; pr.bounce--; pr.hit.clear(); }
    if ((pr.y < owner.y - hh && pr.vy < 0) || (pr.y > owner.y + hh && pr.vy > 0)) { pr.vy = -pr.vy; pr.bounce--; pr.hit.clear(); }
    pr.angle = Math.atan2(pr.vy, pr.vx);
  }
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  // Bullet-like shots (either side's) break on scenery. Lobs arc over it; waves, auras and ground
  // attacks roll through.
  if ((pr.vx || pr.vy) && (pr.behavior === 'projectile' || pr.behavior === 'boomerang' || pr.behavior === 'enemy') && sim.obstacles.blocks(pr.x, pr.y)) pr.dead = true;
}

function boundRadius(pr: Projectile): number {
  switch (pr.shape) {
    case 'line': return pr.len + pr.r;
    case 'box': return Math.hypot(pr.len, pr.r);
    case 'cone': return pr.len;
    default: return pr.r;
  }
}

export function overlaps(pr: Projectile, ex: number, ey: number, er: number): boolean {
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
  for (const p of sim.players) { p.onTerrain.haste = false; p.onTerrain.misty = false; }
  // Snapshot: projectiles spawned during this loop are updated from the next tick.
  const list = sim.projectiles.slice();
  for (const pr of list) {
    if (pr.dead) continue;
    stepProjectileMotion(sim, pr, dt, find);
    if (pr.dead) continue;
    if (pr.hostile) {
      if (pr.moveId === HAZARD) { updateHazard(sim, pr, dt); continue; }
      for (const p of sim.players) {
        if (p.fainted) continue;
        if (overlaps(pr, p.x, p.y, p.radius)) {
          sim.hurtPlayer(p, pr.dmg, pr.type, true);
          if (pr.pierce > 0 && --pr.pierce === 0) { pr.dead = true; break; }
        }
      }
      continue;
    }
    if (pr.t >= pr.delay) updateFieldEffects(sim, pr, dt);
    if (pr.dead) continue;
    if ((pr.dmg <= 0 && !pr.effect && !pr.fixed && !(pr.flags & PF_PERCENT)) || !isActive(pr)) continue;
    if ((pr.flags & PF_MOVING) && !sim.players[pr.owner]?.moving) continue;
    if ((pr.flags & PF_STICKY) && pr.follow) continue;
    sim.grid.query(pr.x, pr.y, boundRadius(pr) + 24, (e) => {
      if (pr.dead || !e.alive) return;
      const next = pr.hit.get(e.id);
      if (next !== undefined && next > sim.time) return;
      if (!overlaps(pr, e.x, e.y, e.radius)) return;
      pr.hit.set(e.id, pr.tick > 0 ? sim.time + pr.tick : Infinity);
      hitEnemy(sim, pr, e);
      if (pr.pierce > 0 && --pr.pierce === 0 && !(pr.flags & PF_STICKY)) pr.dead = true;
    });
  }
}

/** Ongoing effects of fields, delayed bombs, pulses, aftermaths. */
function updateFieldEffects(sim: Sim, pr: Projectile, dt: number) {
  const owner = sim.players[pr.owner];
  if (!owner) return;
  const def = MOVES[pr.moveId];
  // Rapid Spin: shells eat enemy bullets.
  if (pr.flags & PF_DELETE) {
    for (const h of sim.projectiles) {
      if (h.hostile && !h.dead && h.moveId !== HAZARD && (h.x - pr.x) ** 2 + (h.y - pr.y) ** 2 < (pr.r + h.r + 4) ** 2) h.dead = true;
    }
  }
  // Whirlpool: drag foes toward the eye.
  if (pr.flags & PF_PULL) {
    sim.grid.query(pr.x, pr.y, pr.r * 1.6, (e) => {
      if (!e.alive || e.boss) return;
      const dx = pr.x - e.x, dy = pr.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > pr.r * 1.6 || d < 4) return;
      const k = 260 * (1 - e.knockResist) * dt;
      e.vx += (dx / d) * k * 4; e.vy += (dy / d) * k * 4;
    });
  }
  if (pr.behavior === 'terrain') {
    for (const p of sim.players) {
      if (p.fainted || (p.x - pr.x) ** 2 + (p.y - pr.y) ** 2 > pr.r * pr.r) continue;
      if (pr.moveId === 'aqua-ring') heal(p, p.stats.maxHp * 0.03 * dt, 'aqua-ring', owner);
      if (pr.moveId === 'electric-terrain') p.onTerrain.haste = true;
      if (pr.moveId === 'misty-terrain') p.onTerrain.misty = true;
    }
    if (pr.moveId === 'misty-terrain') {
      sim.grid.query(pr.x, pr.y, pr.r, (e) => {
        if (e.alive && (e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 < pr.r * pr.r) e.st.slow = Math.max(e.st.slow, 0.3);
      });
    }
    return;
  }
  // Infestation: hop to a new host when the old one faints.
  if (pr.behavior === 'minion' && pr.follow) {
    const host = sim.enemies.find((e) => e.id === pr.follow);
    if (!host || !host.alive) {
      const next = sim.grid.nearest(pr.x, pr.y, 220, (e) => e.alive);
      if (next) { pr.follow = next.id; pr.hit.clear(); resync(sim, pr); } else pr.follow = 0;
    }
    return;
  }
  // Magnet Bomb fuse.
  if ((pr.flags & PF_STICKY) && pr.follow) {
    pr.timer -= dt;
    if (pr.timer <= 0) {
      pr.dead = true;
      blast(sim, owner, def, pr.x, pr.y, pr.growth, pr.dmg, { knock: pr.knock });
    }
    return;
  }
  // Dragon Pulse: periodic explosions along the way.
  if (pr.flags & PF_PULSE) {
    pr.timer -= dt;
    if (pr.timer <= 0) {
      pr.timer = 0.3;
      blast(sim, owner, def, pr.x, pr.y, 30, pr.dmg * 0.6, { fx: 'orb' });
    }
  }
  // Lob aftermath, once it lands.
  if (pr.behavior === 'lob' && !(pr.flags & PF_DONE) && (pr.flags & (PF_PUDDLE | PF_SHARDS | PF_BURNGROUND)) && pr.t >= pr.delay + pr.len) {
    pr.flags |= PF_DONE;
    if (pr.flags & PF_SHARDS) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + sim.rng.range(-0.2, 0.2);
        makeProjectile(sim, { owner: owner.id, moveId: pr.moveId, behavior: 'projectile', fx: 'rock', type: pr.type, cat: pr.cat, shape: 'circle', x: pr.x, y: pr.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, speed: 260, angle: a, r: 5, life: 0.45, dmg: pr.dmg * 0.35, pierce: 1, crit: pr.crit });
      }
    } else {
      const burn = pr.flags & PF_BURNGROUND;
      makeProjectile(sim, {
        owner: owner.id, moveId: pr.moveId, behavior: 'zone', fx: burn ? 'flame' : 'puddle', type: pr.type, cat: pr.cat, shape: 'circle',
        x: pr.x, y: pr.y, r: pr.r * 0.8, life: 2.5, dmg: pr.dmg * 0.15, pierce: -1, tick: 0.5, effect: burn ? 'burn' : 'poison', chance: 0.5, crit: 0,
      });
    }
  }
}

// ─────────────────────────── damage ───────────────────────────

/** Teammate with the lowest HP fraction (for Draining Kiss). */
function mostHurt(sim: Sim, p: Player): Player {
  let best = p, bf = p.hp / p.stats.maxHp;
  for (const o of sim.players) {
    if (o.fainted || !o.connected) continue;
    const f = o.hp / o.stats.maxHp;
    if (f < bf) { bf = f; best = o; }
  }
  return best;
}

export function hitEnemy(sim: Sim, pr: Projectile, e: Enemy) {
  const owner = sim.players[pr.owner];
  if (!owner) return;
  const st = e.st;
  const id = pr.moveId;
  // Sticky bombs latch on instead of hitting.
  if (pr.flags & PF_STICKY) {
    if (!pr.follow) { pr.follow = e.id; pr.vx = pr.vy = 0; pr.homing = 0; pr.timer = 1.5; pr.life = pr.t + 3; resync(sim, pr); }
    return;
  }
  const noImpact = (pr.flags & PF_NOIMPACT) || (pr.dmg <= 0 && !pr.fixed && !(pr.flags & PF_PERCENT));
  let res = { dmg: 0, eff: 1, crit: false };
  if (!noImpact) {
    let bonus = 1;
    if (id === 'hex' && STATUSED(e)) bonus *= 2;
    if (id === 'quick-attack' && e.hp >= e.maxHp - 0.5) bonus *= 2;
    if (id === 'pursuit') {
      const ax = e.x - owner.x, ay = e.y - owner.y;
      if (ax * e.dirX + ay * e.dirY > 0.3 * Math.hypot(ax, ay)) bonus *= 2;
    }
    if (id === 'fury-cutter') {
      const m = owner.moves.find((x) => x.id === id);
      if (m) {
        if (sim.time - (m.nt ?? -9) > 1) m.n = 0;
        bonus *= Math.min(5, 1 + 0.5 * (m.n ?? 0));
        if ((pr.hit.size ?? 0) <= 1) m.n = (m.n ?? 0) + 1;
        m.nt = sim.time;
      }
    }
    if (pr.ramp) {
      if (sim.time - pr.rampT > 1) pr.mult = 1;
      bonus *= pr.mult;
      pr.mult = Math.min(4, pr.mult + pr.ramp);
      pr.rampT = sim.time;
    }
    if (id === 'pin-missile') {
      bonus *= 1 + 0.1 * st.pins;
      st.pins = Math.min(20, st.pins + 1);
      st.pinsT = 3;
    }
    if (st.sleep > 0) { bonus *= 2; st.sleep = 0; sim.emit({ e: 'callout', x: e.x, y: e.y - 20, text: 'Woke!', color: '#cfd8ff' }); }
    let shatter = false;
    if (st.freeze > 0) {
      bonus *= id === 'ice-shard' ? 3 : 1.5;
      st.freeze = 0;
      shatter = id === 'ice-shard';
    }
    if (st.vuln > 0) bonus *= 1.25;
    if (st.wet > 0) {
      if (pr.type === 'electric') bonus *= 1.5;
      else if (pr.type === 'fire') { st.wet = 0; steam(sim, owner, e, pr.dmg); }
    }
    let crit = pr.crit;
    if (id === 'night-slash' && STATUSED(e)) crit = 1;
    if (pr.fixed) res = { dmg: Math.max(1, Math.round(pr.fixed * bonus * (st.vuln > 0 ? 1 : 1))), eff: 1, crit: false };
    else if (pr.flags & PF_PERCENT) res = { dmg: Math.max(1, Math.round(e.maxHp * (e.boss ? 0.01 : 0.08))), eff: 1, crit: false };
    else res = resolveHit(pr.dmg, pr.type, e.types, crit, owner.stats, sim.rng.next(), bonus);
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
      const k = pr.knock * (1 - e.knockResist * (id === 'whirlwind' ? 0.6 : 1)) * 2.2;
      e.vx += (kx / l) * k;
      e.vy += (ky / l) * k;
    }
    creditDamage(owner, id || 'other', res.dmg, e.boss);
    const owned = owner.moves.find((m) => m.id === id);
    if (owned) owned.dmgDealt += res.dmg;
    if (res.eff > 1) owner.superEff++;
    if (owner.stats.lifesteal) heal(owner, res.dmg * owner.stats.lifesteal, 'lifesteal');
    if (owner.stats.flinch && sim.rng.next() < owner.stats.flinch) applyStatus(sim, e, 'flinch', 0, owner);
    if (res.crit) sim.critStop();
    sim.emit({ e: 'hit', x: e.x, y: e.y - e.radius, dmg: res.dmg, eff: res.eff, crit: res.crit, type: pr.type });
    afterHit(sim, pr, e, owner, res.crit, res.dmg, shatter);
  }
  if (pr.effect && sim.rng.next() < pr.chance) applyStatus(sim, e, pr.effect, res.dmg || pr.dmg * 0.3, owner, id, (pr.flags & PF_LONGBURN) ? 2 : 1);
  if (pr.effect2 && sim.rng.next() < pr.chance2) applyStatus(sim, e, pr.effect2, res.dmg || pr.dmg * 0.3, owner, id);
  if (e.alive && e.hp <= 0) {
    const owned = owner.moves.find((m) => m.id === id);
    if (owned) owned.kills++;
    killEnemy(sim, e, owner.id);
  }
}

/** Per-move follow-ups to a landed hit. */
function afterHit(sim: Sim, pr: Projectile, e: Enemy, owner: Player, crit: boolean, dmg: number, shatter: boolean) {
  const id = pr.moveId;
  const st = e.st;
  const def = MOVES[id];
  if (shatter) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      makeProjectile(sim, { owner: owner.id, moveId: id, behavior: 'projectile', fx: 'shard', type: 'ice', cat: pr.cat, shape: 'circle', x: e.x, y: e.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, speed: 300, angle: a, r: 5, life: 0.4, dmg: pr.dmg * 0.6, pierce: 2, crit: pr.crit });
    }
    sim.emit({ e: 'callout', x: e.x, y: e.y - 20, text: 'Shatter!', color: '#bfefff' });
  }
  if (id === 'leaf-blade' && crit && !(pr.flags & PF_DONE)) {
    pr.flags |= PF_DONE;
    const m = owner.moves.find((x) => x.id === id);
    if (m) m.cd = Math.min(m.cd, 0.1);
  }
  if (id === 'blaze-kick' && crit && st.burn > 0) {
    const rest = st.burnDmg * Math.ceil(st.burn / 0.5);
    st.burn = 0;
    sim.emit({ e: 'boom', x: e.x, y: e.y, r: 30, type: 'fire' });
    rawDamageEnemy(sim, e, rest, 'fire', owner.id, id);
  }
  if (id === 'venoshock' && st.poison > 0) {
    const burst = st.poisonDmg * st.poisonStacks * 6 * (1 + st.toxic * 0.2);
    st.poison = 0; st.poisonStacks = 0; st.toxic = 0;
    sim.emit({ e: 'boom', x: e.x, y: e.y, r: 26, type: 'poison' });
    rawDamageEnemy(sim, e, burst, 'poison', owner.id, id);
  }
  if (id === 'metal-claw' && owner.clawStacks < 30 && sim.rng.chance(0.1)) owner.clawStacks++;
  if (id === 'ancient-power' && owner.ancientStacks < 15 && sim.rng.chance(0.02)) {
    owner.ancientStacks++;
    sim.emit({ e: 'callout', x: owner.x, y: owner.y - 34, text: 'All stats up!', color: '#ffd84a' });
  }
  if (id === 'thief' && e.alive) {
    if ((e.elite || e.alpha) && !st.robbed) { st.robbed = 1; sim.spawnPickup(sim.rng.chance(0.5) ? 'sitrus' : 'oran', e.x, e.y); }
    else if (sim.rng.chance(0.06)) sim.spawnPickup('candy', e.x, e.y, Math.max(1, Math.round(e.xp)));
    else if (sim.rng.chance(0.008)) sim.spawnPickup('oran', e.x, e.y);
  }
  if (id === 'draining-kiss') heal(mostHurt(sim, owner), Math.max(1, dmg * 0.35), id, owner);
  // Cross Chop: every Nth hit from any other move calls a chop on the foe.
  const cc = owner.moves.find((m) => m.id === 'cross-chop');
  if (cc && id !== 'cross-chop') {
    const s = scaledStats(MOVES['cross-chop'], cc.level, owner);
    if (++owner.combo >= Math.max(2, Math.round(s.count))) {
      owner.combo = 0;
      const ccDef = MOVES['cross-chop'];
      makeProjectile(sim, { ...common(sim, owner, ccDef, s), behavior: 'melee', shape: 'circle', x: e.x, y: e.y, r: s.area, life: 0.22, delay: 0.05, pierce: -1, tick: 0 });
    }
  }
  if ((pr.flags & PF_RICOCHET) && pr.pierce !== 1) {
    const next = sim.grid.nearest(e.x, e.y, 170, (o) => o.alive && o !== e && !pr.hit.has(o.id));
    if (next) {
      const a = Math.atan2(next.y - pr.y, next.x - pr.x);
      const sp = Math.hypot(pr.vx, pr.vy) || pr.speed;
      pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp; pr.angle = a;
      pr.life = Math.max(pr.life, pr.t + 0.8);
      resync(sim, pr);
    }
  }
  if ((pr.flags & PF_REFRACT) && !(pr.flags & PF_DONE)) {
    pr.flags |= PF_DONE;
    for (const k of [-0.5, 0, 0.5]) {
      makeProjectile(sim, { owner: owner.id, moveId: id, behavior: 'beam', fx: 'beam', type: pr.type, cat: pr.cat, shape: 'line', x: e.x, y: e.y, angle: pr.angle + k, len: pr.len * 0.6, r: pr.r * 0.7, life: 0.3, delay: 0.05, pierce: -1, dmg: pr.dmg * 0.6, crit: pr.crit, knock: 30 });
    }
  }
  if (def && def.behavior === 'strike' && id === 'shadow-force') owner.vanishT = Math.max(owner.vanishT, 0.2);
}

/** Fire on a Wet foe: the water flashes into a burst of steam. */
function steam(sim: Sim, owner: Player, e: Enemy, dmg: number) {
  sim.emit({ e: 'boom', x: e.x, y: e.y, r: 40, type: 'water' });
  sim.emit({ e: 'callout', x: e.x, y: e.y - 20, text: 'Steam!', color: '#e8f4ff' });
  sim.grid.query(e.x, e.y, 40, (o) => {
    if (o !== e && o.alive && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 40 * 40) rawDamageEnemy(sim, o, dmg * 0.5, 'fire', owner.id, 'steam');
  });
}

/** Flinch: cancel or delay whatever attack the foe is winding up. */
function interrupt(e: Enemy) {
  if (e.casting && e.casting > 0) e.casting = 0;
  if (e.role === 'ranged') e.ai = Math.max(e.ai, 1.2);
  if (e.role === 'bomber' && e.aiState === 1) { e.aiState = 0; e.ai = 0; }
  if (e.raidCd !== undefined) e.raidCd = Math.max(e.raidCd, 1.5);
  if (e.boss && e.aiState === 0) e.ai += 0.6;
}

export function applyStatus(sim: Sim, e: Enemy, kind: StatusKind, dmg: number, owner: Player, src = 'drain', durMult = 1) {
  const k = e.boss ? 0.3 : e.elite ? 0.6 : 1;
  const st = e.st;
  switch (kind) {
    case 'burn': st.burn = 3 * durMult; st.burnDmg = Math.max(st.burnDmg, Math.max(1, dmg * 0.15)); st.dotOwner = owner.id; break;
    case 'toxic':
    case 'poison':
      if (kind === 'toxic') st.toxic = Math.max(1, st.toxic);
      st.poison = 4; st.poisonStacks = Math.min(5, st.poisonStacks + 1);
      st.poisonDmg = Math.max(st.poisonDmg, Math.max(1, dmg * 0.08)); st.dotOwner = owner.id; break;
    case 'paralyze': st.paralyze = 2.5 * k; break;
    case 'freeze': st.freeze = 1.2 * k; st.chill = 0; break;
    case 'slow': st.slow = 2 * k; break;
    case 'confuse': st.confuse = 1.6 * k; break;
    case 'flinch': st.flinch = 0.35; interrupt(e); break;
    case 'drain': heal(owner, Math.max(1, dmg * 0.25), src); break;
    case 'coin': st.coin = 1; break;
    case 'wet':
      st.wet = 5;
      break;
    case 'chill':
      if (st.freeze > 0) break;
      st.chill = Math.min(3, st.chill + 1);
      st.chillT = 3;
      if (st.chill >= 3) { st.chill = 0; st.freeze = 1.5 * k; }
      break;
    case 'sleep': st.sleep = (e.boss ? 0.8 : 3.5 * k); break;
    case 'charm': if (!e.boss) st.charm = 3 * k; break;
    case 'vuln': st.vuln = 4; break;
    case 'weaken': st.weaken = 4; break;
    case 'root': st.root = 2.2 * k; break;
    case 'seed': st.seed = 5; st.seedDmg = Math.max(st.seedDmg, Math.max(1, dmg * 0.35)); st.seedOwner = owner.id; break;
    case 'curse': st.curse = e.boss ? 0.003 : e.elite || e.alpha ? 0.01 : 0.02; st.curseOwner = owner.id; break;
  }
  // Ice on a soaked foe freezes it on the spot.
  if (st.wet > 0 && (kind === 'chill') && st.freeze <= 0) { st.freeze = 1.5 * k; st.chill = 0; st.wet = 0; }
  void sim;
}

/** Damage to an enemy that doesn't come from a projectile (DoTs, thorns, abilities). */
export function rawDamageEnemy(sim: Sim, e: Enemy, dmg: number, type: PType, ownerId: number, src: string) {
  if (!e.alive) return;
  if (e.st.vuln > 0) dmg *= 1.25;
  e.hp -= dmg;
  e.flash = Math.max(e.flash, 0.05);
  const owner = sim.players[ownerId];
  if (owner) {
    creditDamage(owner, src, dmg, e.boss);
    const owned = owner.moves.find((m) => m.id === src);
    if (owned) owned.dmgDealt += dmg;
  }
  sim.emit({ e: 'hit', x: e.x, y: e.y - e.radius, dmg: Math.round(dmg), eff: 1, crit: false, type });
  if (e.hp <= 0) killEnemy(sim, e, ownerId);
}

export function damagePlayer(sim: Sim, p: Player, raw: number, type: PType, special: boolean) {
  if (p.fainted || raw <= 0 || sim.invulnerable) return;
  if (p.burrowT > 0 || p.vanishT > 0) return;
  // Protect: the barrier eats the whole hit.
  const prot = p.moves.find((m) => m.id === 'protect');
  if (prot && p.protectCd <= 0) {
    p.protectCd = scaledStats(MOVES.protect, prot.level, p).cd;
    sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: 'Protected!', color: '#9dffb0' });
    return;
  }
  const dodge = p.buffs.find((b) => b.kind === 'dodge');
  if (dodge && sim.rng.next() < dodge.amount) return;
  let dmg = incomingDamage(raw, type, p.types, special ? p.stats.projTaken : p.stats.contactTaken);
  if (p.ability === 'multiscale' && p.hp >= p.stats.maxHp - 0.5) dmg *= 0.5;
  const iron = p.moves.find((m) => m.id === 'iron-defense');
  if (iron && !special && !p.moving) dmg *= 1 - Math.min(0.85, scaledStats(MOVES['iron-defense'], iron.level, p).power);
  p.hp -= dmg;
  p.hurtT = 0.25;
  p.lastHit = sim.time;
  p.dmgTaken += dmg;
  p.hurtLog.push([sim.time, dmg]);
  // Dragon Dance loses a stack; Focus Punch loses its focus.
  const dance = p.buffs.find((b) => b.kind === 'dance');
  if (dance) { dance.amount -= MOVES['dragon-dance'].buff!.amount; if (dance.amount <= 0.001) dance.t = 0; }
  if (p.focusAt >= 0) {
    p.focusAt = -1;
    for (const pr of sim.projectiles) if (pr.owner === p.id && (pr.flags & PF_FOCUS) && pr.t < pr.delay) pr.dead = true;
    sim.emit({ e: 'callout', x: p.x, y: p.y - 34, text: 'Lost focus!', color: '#bbb' });
  }
  // Counter: melee hits bounce back at everything around.
  const counter = p.moves.find((m) => m.id === 'counter');
  if (counter && !special) {
    const def = MOVES.counter;
    const s = scaledStats(def, counter.level, p);
    makeProjectile(sim, { ...common(sim, p, def, s), dmg: dmgFor(sim, p, def, s.power) + dmg * 2, behavior: 'nova', shape: 'ring', x: p.x, y: p.y, r: 6, growth: s.area, life: 0.3, attach: true, pierce: -1 });
  }
  megaOnHurt(sim, p, dmg);
  sim.emit({ e: 'hurt', player: p.id, dmg });
  if (p.hp > 0) return;
  if (sim.rng.next() < p.stats.focus) { p.hp = 1; return; }
  if (p.revives > 0) {
    p.revives--;
    p.hp = 0;
    heal(p, p.stats.maxHp * 0.5, 'revive');
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
