import { describe, expect, it } from 'vitest';
import { Sim, DT } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { spawnEnemy } from '../src/game/spawner.ts';
import { HAZARD, castRaid, hazardEscape, inHazard, spawnHazard } from '../src/game/hazards.ts';
import { STAGES } from '../src/data/stages.ts';

function sim() {
  const s = new Sim({ stageId: 'viridian', seed: 7, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
  s.phase = 'play';
  s.offers.clear();
  s.spawner.update = () => {}; // keep the field empty
  return s;
}

const tick = (s: Sim, sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) s.update(DT); };

describe('raid hazards', () => {
  it('hit only once, only when they land, and only partners inside', () => {
    const s = sim();
    const p = s.players[0];
    p.x = 0; p.y = 0;
    spawnHazard(s, { shape: 'circle', x: 0, y: 0, r: 50, delay: 1, dmg: 20, type: 'rock' });
    spawnHazard(s, { shape: 'circle', x: 300, y: 0, r: 50, delay: 1, dmg: 20, type: 'rock' });
    const hp = p.hp;
    tick(s, 0.9);
    expect(p.hp).toBe(hp);
    tick(s, 0.5);
    const after = p.hp;
    expect(after).toBeLessThan(hp);
    tick(s, 1);
    expect(p.hp).toBeGreaterThanOrEqual(after); // no second hit (regen may tick up)
    expect(s.projectiles.some((pr) => pr.moveId === HAZARD)).toBe(false);
  });

  it('donuts are safe in the middle, lines and cones only cover their area', () => {
    const s = sim();
    const ring = spawnHazard(s, { shape: 'ring', x: 0, y: 0, r: 200, len: 80, delay: 1, dmg: 1, type: 'water' });
    expect(inHazard(ring, 0, 0, 10)).toBe(false);
    expect(inHazard(ring, 150, 0, 10)).toBe(true);
    expect(inHazard(ring, 260, 0, 10)).toBe(false);
    const line = spawnHazard(s, { shape: 'line', x: 0, y: 0, r: 20, len: 300, angle: Math.PI / 2, delay: 1, dmg: 1, type: 'normal' });
    expect(inHazard(line, 0, 250, 10)).toBe(true);
    expect(inHazard(line, 60, 250, 10)).toBe(false);
    expect(inHazard(line, 0, -60, 10)).toBe(false);
    const cone = spawnHazard(s, { shape: 'cone', x: 0, y: 0, r: 100, len: 200, angle: 0, delay: 1, dmg: 1, type: 'fire' });
    expect(inHazard(cone, 150, 20, 10)).toBe(true);
    expect(inHazard(cone, -50, 0, 10)).toBe(false);
    expect(inHazard(cone, 150, 160, 10)).toBe(false);
  });

  it('escape vectors lead out of every shape', () => {
    const s = sim();
    const shapes = [
      spawnHazard(s, { shape: 'circle', x: 0, y: 0, r: 120, delay: 2, dmg: 1, type: 'rock' }),
      spawnHazard(s, { shape: 'ring', x: 0, y: 0, r: 220, len: 90, delay: 2, dmg: 1, type: 'rock' }),
      spawnHazard(s, { shape: 'line', x: -300, y: 5, r: 26, len: 600, angle: 0, delay: 2, dmg: 1, type: 'rock' }),
      spawnHazard(s, { shape: 'cone', x: -100, y: 0, r: 150, len: 250, angle: 0, delay: 2, dmg: 1, type: 'rock' }),
    ];
    for (const h of shapes) {
      let x = 40, y = 10;
      if (h.shape === 'ring') x = 120;
      for (let i = 0; i < 400 && inHazard(h, x, y, 10); i++) {
        const v = hazardEscape(h, x, y, 10)!;
        x += v.x * 2; y += v.y * 2;
      }
      expect(inHazard(h, x, y, 10), h.shape).toBe(false);
    }
  });

  it('every boss raid move marks the ground and returns a wind-up', () => {
    const s = sim();
    const moves = ['quake', 'donut', 'meteor', 'beam', 'cone', 'cross'] as const;
    for (const tier of ['boss', 'final', 'alpha', 'guardian'] as const) {
      for (const m of moves) {
        s.projectiles = [];
        const e = spawnEnemy(s, 'onix', 100, 0, { elite: true })!;
        const wind = castRaid(s, e, m, s.players[0], tier);
        expect(wind, `${tier} ${m}`).toBeGreaterThan(0.5);
        expect(s.projectiles.filter((pr) => pr.moveId === HAZARD).length, `${tier} ${m}`).toBeGreaterThan(0);
      }
    }
  });

  it('a boss every 3 minutes on every route, ending in the final boss', () => {
    for (const st of STAGES) {
      expect(st.bosses.map((b) => b.at), st.id).toEqual([180, 360, 540, 720, 900]);
      expect(st.bosses.at(-1)!.final, st.id).toBe(true);
      expect(st.bosses.every((b) => b.patterns.some((p) => ['quake', 'donut', 'meteor', 'beam', 'cone', 'cross'].includes(p))), st.id).toBe(true);
    }
  });
});

describe('elite ground casts', () => {
  const run = (guardian: boolean) => {
    const s = sim();
    s.time = 500;
    const p = s.players[0];
    p.x = 0; p.y = 0; p.hp = 1e9;
    const e = spawnEnemy(s, 'onix', 120, 0, { elite: true, guardian })!;
    let raids = 0;
    for (let i = 0; i < Math.round(30 / DT); i++) {
      s.update(DT);
      raids += s.events.filter((ev) => ev.e === 'raid').length;
      e.x = 120; e.y = 0; // stay within casting range
    }
    return raids;
  };
  it('ordinary elites never cast a raid', () => expect(run(false)).toBe(0));
  it('guardians still do', () => expect(run(true)).toBeGreaterThan(0));
});
