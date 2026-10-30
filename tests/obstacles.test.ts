import { describe, expect, it } from 'vitest';
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { Obstacles, type Obstacle } from '../src/game/obstacles.ts';
import { makeProjectile } from '../src/game/combat.ts';
import { spawnEnemy } from '../src/game/spawner.ts';
import { STAGES } from '../src/data/stages.ts';

function sim(stageId = 'viridian') {
  const s = new Sim({ stageId, seed: 7, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
  s.phase = 'play';
  s.offers.clear();
  s.spawner.update = () => {};
  s.invulnerable = true;
  return s;
}

/** A free-standing obstacle near the origin (no neighbours within a cell). */
function loneObstacle(obs: Obstacles, small = false): Obstacle {
  for (let cy = -40; cy < 40; cy++) for (let cx = -40; cx < 40; cx++) {
    const o = obs.at(cx, cy);
    if (!o || !!o.small !== small) continue;
    let alone = true;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && obs.at(cx + i, cy + j)) alone = false;
    if (alone) return o;
  }
  throw new Error('no lone obstacle');
}

describe('scenery obstacles', () => {
  it('are the same for every peer and keep the spawn point clear', () => {
    for (const st of STAGES) {
      const a = new Obstacles(st.id), b = new Obstacles(st.id);
      let n = 0;
      for (let cy = -40; cy < 40; cy++) for (let cx = -40; cx < 40; cx++) {
        const o = a.at(cx, cy);
        expect(o).toEqual(b.at(cx, cy));
        if (o) {
          n++;
          expect(Math.hypot(o.x, o.y), st.id).toBeGreaterThan(64);
        }
      }
      expect(n, `${st.id} has scenery`).toBeGreaterThan(50);
    }
  });

  it('stop partners walking through them', () => {
    const s = sim();
    const p = s.players[0];
    const o = loneObstacle(s.obstacles);
    p.x = o.x - 60; p.y = o.cy;
    p.mx = 1; p.my = 0;
    for (let i = 0; i < 90; i++) {
      s.update(DT);
      expect(Math.hypot(p.x - o.x, p.y - o.cy)).toBeGreaterThanOrEqual(o.r + p.radius - 0.01);
    }
  });

  it('break flying shots from either side, but not ground hazards', () => {
    const s = sim();
    const o = loneObstacle(s.obstacles);
    const shot = makeProjectile(s, { owner: -1, hostile: true, behavior: 'enemy', moveId: 'enemy', fx: 'orb', type: 'normal', shape: 'circle', x: o.x - 50, y: o.cy, vx: 200, vy: 0, r: 4, life: 3, dmg: 1, pierce: 1 });
    const mine = makeProjectile(s, { owner: 0, behavior: 'projectile', moveId: 'ember', fx: 'orb', type: 'fire', shape: 'circle', x: o.x + 50, y: o.cy, vx: -200, vy: 0, r: 4, life: 3, dmg: 1, pierce: 1 });
    const hazard = makeProjectile(s, { owner: -1, hostile: true, behavior: 'enemy', moveId: 'hazard', fx: 'orb', type: 'ground', shape: 'circle', x: o.x, y: o.cy, r: 30, delay: 2, life: 2.3, dmg: 0, pierce: -1 });
    for (let i = 0; i < 30; i++) s.update(DT);
    expect(shot.dead).toBe(true);
    expect(mine.dead).toBe(true);
    expect(hazard.dead).toBe(false);
  });

  it('small rocks block bodies but shots fly over them', () => {
    const s = sim();
    const p = s.players[0];
    const o = loneObstacle(s.obstacles, true);
    expect(o.r).toBeLessThan(11);
    const mine = makeProjectile(s, { owner: 0, behavior: 'projectile', moveId: 'ember', fx: 'orb', type: 'fire', shape: 'circle', x: o.x + 50, y: o.cy, vx: -200, vy: 0, r: 4, life: 3, dmg: 1, pierce: 1 });
    p.x = o.x - 60; p.y = o.cy;
    p.mx = 1; p.my = 0;
    for (let i = 0; i < 60; i++) {
      s.update(DT);
      expect(Math.hypot(p.x - o.x, p.y - o.cy)).toBeGreaterThanOrEqual(o.r + p.radius - 0.01);
    }
    expect(mine.dead).toBe(false);
  });

  it("never overlap each other's art (Viridian trees are 48 px wide and 47 px tall)", () => {
    const obs = new Obstacles('viridian');
    const trees: Obstacle[] = [];
    for (let cy = -60; cy < 60; cy++) for (let cx = -60; cx < 60; cx++) {
      const o = obs.at(cx, cy);
      if (o && !o.small) trees.push(o);
    }
    expect(trees.length).toBeGreaterThan(300);
    for (const a of trees) for (const b of trees) {
      if (a === b || Math.abs(a.x - b.x) >= 48) continue;
      expect(Math.abs(a.y - b.y), `trees at ${a.x},${a.y} and ${b.x},${b.y}`).toBeGreaterThanOrEqual(47);
    }
  });

  it("a row of trees is a wall a partner can't slip between", () => {
    const s = sim();
    const p = s.players[0];
    const obs = s.obstacles;
    // two side-by-side trees with nothing below them
    let pair: [Obstacle, Obstacle] | null = null;
    for (let cy = -40; cy < 40 && !pair; cy++) for (let cx = -40; cx < 40 && !pair; cx++) {
      const a = obs.at(cx, cy), b = obs.at(cx + 1, cy);
      if (a && b && !a.small && !b.small && !obs.at(cx, cy + 1) && !obs.at(cx + 1, cy + 1) && !obs.at(cx, cy + 2) && !obs.at(cx + 1, cy + 2)) pair = [a, b];
    }
    expect(pair).not.toBeNull();
    const [a, b] = pair!;
    const gap = (a.x + b.x) / 2;
    p.x = gap; p.y = a.cy + 60;
    p.mx = 0; p.my = -1;
    for (let i = 0; i < 90; i++) {
      s.update(DT);
      p.x = gap;
      expect(p.y).toBeGreaterThanOrEqual(a.cy + a.r + p.radius - 0.01);
    }
  });

  it('foes come round a forest wall instead of piling up behind it', () => {
    const s = sim();
    const p = s.players[0];
    // a wall of trees between a foe and the partner
    const wall = new Set<string>();
    for (let j = -4; j <= 4; j++) wall.add(`3,${j}`);
    const at = s.obstacles.at.bind(s.obstacles);
    const c = s.obstacles.cell;
    const tree = (cx: number, cy: number) => {
      const x = cx * c + c / 2, y = cy * c + c - 4;
      return { x, y, cy: y - 5, x0: x, x1: x, y0: y - 5 - c / 2, y1: y - 5 + c / 2, r: 11, v: 0 };
    };
    s.obstacles.at = (cx, cy) => (wall.has(`${cx},${cy}`) ? tree(cx, cy) : at(cx, cy) && null);
    p.x = 0; p.y = 16;
    const e = spawnEnemy(s, 'rattata', 6 * c, 16)!;
    e.maxHp = e.hp = 1e6;
    let reached = false;
    for (let i = 0; i < 60 * 12 && !reached; i++) {
      s.update(DT);
      p.x = 0; p.y = 16;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 40) reached = true;
    }
    expect(reached, `phase ${s.phase} t ${s.time.toFixed(1)} foe ${e.x.toFixed(0)},${e.y.toFixed(0)} alive ${e.alive}`).toBe(true);
  });
});
