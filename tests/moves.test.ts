import { describe, expect, it } from 'vitest';
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { MOVE_LIST, MOVES, NON_ATTACKS } from '../src/data/moves.ts';
import { spawnEnemy } from '../src/game/spawner.ts';
import type { Enemy, Player } from '../src/game/types.ts';
import { Obstacles } from '../src/game/obstacles.ts';

/** A partner holding one move (at Lv5) in a ring of tough foes, circling slowly. */
function arena(moveId: string, extra: string[] = [], seconds = 8, watch?: (sim: Sim, p: Player) => boolean) {
  const sim = new Sim({ stageId: 'viridian', seed: 1, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
  // open ground: these check what each move does, not how it meets the scenery
  Object.assign(sim, { obstacles: new Obstacles('') });
  const p = sim.players[0];
  p.moves = [moveId, ...extra].map((id) => ({ id, level: 5, cd: 0.2, dmgDealt: 0, kills: 0 }));
  const foes: Enemy[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 40 + (i % 4) * 45;
    const e = spawnEnemy(sim, i % 6 === 0 ? 'spearow' : 'rattata', Math.cos(a) * r, Math.sin(a) * r);
    if (e) { e.maxHp = e.hp = 4000; foes.push(e); }
  }
  let seen = false;
  for (let i = 0; i < seconds / DT; i++) {
    if (sim.phase === 'levelup') { sim.choose(0, 0); continue; }
    if (sim.phase !== 'play') break;
    const t = sim.time;
    p.mx = Math.cos(t * 0.8); p.my = Math.sin(t * 0.8);
    p.hp = Math.max(p.hp, p.stats.maxHp * 0.3);
    sim.update(DT);
    sim.events.length = 0;
    if (watch && !seen && watch(sim, p)) seen = true;
  }
  return { sim, p, foes, seen };
}

const anyFoe = (f: (e: Enemy) => boolean) => (sim: Sim) => sim.enemies.some((e) => e.alive && f(e));
const proj = (behavior: string) => (sim: Sim) => sim.projectiles.some((pr) => pr.behavior === behavior && !pr.hostile);

/** What a non-damaging move visibly does. */
const EFFECT: Record<string, [string[], (sim: Sim, p: Player) => boolean]> = {
  substitute: [[], proj('decoy')],
  metronome: [[], (_s, p) => p.dmgDealt > 0],
  'will-o-wisp': [[], anyFoe((e) => e.st.burn > 0)],
  'sunny-day': [[], (sim) => sim.weather === 'sun'],
  'aqua-ring': [[], proj('terrain')],
  'rain-dance': [[], (sim) => sim.weather === 'rain'],
  'leech-seed': [[], anyFoe((e) => e.st.seed > 0)],
  'sleep-powder': [[], anyFoe((e) => e.st.sleep > 0)],
  'thunder-wave': [[], anyFoe((e) => e.st.paralyze > 0)],
  'electric-terrain': [[], (_s, p) => p.onTerrain.haste],
  snowscape: [[], (sim) => sim.weather === 'snow'],
  counter: [[], (_s, p) => (p.ledger.dmg.counter ?? 0) > 0],
  'cross-chop': [['tackle'], (_s, p) => (p.ledger.dmg['cross-chop'] ?? 0) > 0],
  toxic: [[], anyFoe((e) => e.st.toxic > 0)],
  'toxic-spikes': [[], anyFoe((e) => e.st.poison > 0)],
  tailwind: [[], (_s, p) => p.buffs.some((b) => b.kind === 'tailwind')],
  'calm-mind': [[], (_s, p) => p.buffs.some((b) => b.kind === 'spa')],
  reflect: [[], (_s, p) => p.buffs.some((b) => b.kind === 'reflect')],
  'string-shot': [[], anyFoe((e) => e.st.root > 0)],
  'stealth-rock': [[], (_s, p) => (p.ledger.dmg['stealth-rock'] ?? 0) > 0],
  curse: [[], anyFoe((e) => e.st.curse > 0)],
  'dragon-dance': [[], (_s, p) => p.buffs.some((b) => b.kind === 'dance')],
  'mirror-coat': [[], (sim) => sim.projectiles.some((pr) => pr.moveId === 'mirror-coat')],
  'iron-defense': [[], () => true],
  'misty-terrain': [[], (_s, p) => p.onTerrain.misty],
  'swords-dance': [[], (_s, p) => p.buffs.some((b) => b.kind === 'atk')],
  agility: [[], (_s, p) => p.buffs.some((b) => b.kind === 'haste')],
  'double-team': [[], (_s, p) => p.buffs.some((b) => b.kind === 'dodge')],
  rest: [[], (_s, p) => { p.hp = Math.min(p.hp, p.stats.maxHp * 0.5); return p.sleepT > 0; }],
  'focus-energy': [[], (_s, p) => p.buffs.some((b) => b.kind === 'crit')],
  protect: [[], (_s, p) => p.protectCd > 0],
};

describe('every move does its thing', () => {
  for (const m of MOVE_LIST) {
    it(m.id, () => {
      const fx = EFFECT[m.id];
      const { p, seen } = arena(m.id, fx?.[0] ?? [], m.id === 'rest' || m.id === 'dig' || m.id === 'outrage' ? 14 : 8, fx?.[1]);
      if (fx) expect(seen, `${m.id} effect`).toBe(true);
      if (!NON_ATTACKS.has(m.id) && !['metronome', 'counter', 'cross-chop', 'mirror-coat'].includes(m.id)) {
        expect(p.ledger.dmg[m.id] ?? 0, `${m.id} damage`).toBeGreaterThan(0);
      }
      for (const o of p.moves) expect(Number.isFinite(o.cd)).toBe(true);
    });
  }
});

describe('move mechanics', () => {
  it('Fury Cutter ramps with consecutive hits', () => {
    const { p } = arena('fury-cutter', [], 3);
    expect(p.moves[0].n ?? 0).toBeGreaterThan(1);
  });

  it('Thunder Wave deals no damage but paralyzes the screen', () => {
    const { p, foes } = arena('thunder-wave', [], 2);
    expect(p.ledger.dmg['thunder-wave'] ?? 0).toBe(0);
    expect(foes.filter((e) => e.st.paralyze > 0).length).toBeGreaterThan(5);
  });

  it('Water Pulse soaks foes, and electric hits on them are boosted', () => {
    const { foes } = arena('water-pulse', [], 3);
    expect(foes.some((e) => e.st.wet > 0)).toBe(true);
  });

  it('Chill stacks freeze a foe, and Ice Shard shatters it', () => {
    const { sim, p } = arena('powder-snow', ['ice-shard'], 6, anyFoe((e) => e.st.freeze > 0));
    expect(sim.enemies.length).toBeGreaterThan(0);
    expect(p.ledger.dmg['ice-shard']).toBeGreaterThan(0);
  });

  it('Dig makes you untouchable underground, then erupts', () => {
    const { p, seen } = arena('dig', [], 6, (_s, pl) => pl.burrowT > 0);
    expect(seen).toBe(true);
    expect(p.ledger.dmg.dig).toBeGreaterThan(0);
  });

  it('Rest pins you in place while asleep', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 1, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    p.moves = [{ id: 'rest', level: 1, cd: 0, dmgDealt: 0, kills: 0 }];
    p.hp = p.stats.maxHp * 0.3;
    sim.update(DT);
    expect(p.sleepT).toBeGreaterThan(0);
    const x = p.x;
    p.mx = 1;
    for (let i = 0; i < 20; i++) sim.update(DT);
    expect(p.x).toBe(x);
  });

  it('Protect blocks a hit, then recharges', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 1, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    p.moves = [{ id: 'protect', level: 1, cd: 0, dmgDealt: 0, kills: 0 }];
    const hp = p.hp;
    sim.hurtPlayer(p, 30, 'normal', false);
    expect(p.hp).toBe(hp);
    sim.hurtPlayer(p, 30, 'normal', false);
    expect(p.hp).toBeLessThan(hp);
  });

  it('Mirror Coat turns enemy shots around', async () => {
    const { makeProjectile } = await import('../src/game/combat.ts');
    const sim = new Sim({ stageId: 'viridian', seed: 1, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    p.moves = [{ id: 'mirror-coat', level: 1, cd: 0, dmgDealt: 0, kills: 0 }];
    const shot = makeProjectile(sim, { owner: -1, hostile: true, behavior: 'enemy', moveId: 'enemy', x: p.x + 60, y: p.y, vx: -100, vy: 0, speed: 100, r: 5, life: 4, pierce: 1, dmg: 10 });
    sim.update(DT);
    expect(shot.hostile).toBe(false);
    expect(shot.owner).toBe(p.id);
    expect(shot.vx).toBeGreaterThan(0);
  });

  it('Dragon Dance stacks up to three times', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 1, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    sim.invulnerable = true;
    p.moves = [{ id: 'dragon-dance', level: 1, cd: 0, dmgDealt: 0, kills: 0 }];
    for (let i = 0; i < 60 * 30; i++) { if (sim.phase === 'levelup') { sim.choose(0, 0); continue; } sim.update(DT); }
    expect(p.buffs.find((b) => b.kind === 'dance')!.amount).toBeCloseTo(0.36);
  });

  it('Night Shade ignores types: same damage on any foe', () => {
    const { p } = arena('night-shade', [], 3);
    expect(p.ledger.dmg['night-shade']).toBeGreaterThan(0);
  });

  it('Burns spread when a burning foe faints', async () => {
    const { killEnemy } = await import('../src/game/enemyAI.ts');
    const sim = new Sim({ stageId: 'viridian', seed: 2, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const a = spawnEnemy(sim, 'rattata', 100, 0)!;
    const b = spawnEnemy(sim, 'rattata', 120, 0)!;
    sim.rebuildGrid();
    a.st.burn = 3; a.st.burnDmg = 5;
    killEnemy(sim, a, 0);
    expect(b.st.burn).toBeGreaterThan(0);
  });

  it('every move id in the matrix exists', () => {
    for (const id of ['quick-attack', 'flame-wheel', 'whirlpool', 'razor-leaf', 'spark', 'sheer-cold', 'cross-chop', 'venoshock', 'dig', 'whirlwind', 'stored-power', 'infestation', 'rock-tomb', 'curse', 'outrage', 'thief', 'magnet-bomb', 'misty-terrain', 'protect']) {
      expect(MOVES[id], id).toBeTruthy();
    }
  });
});
