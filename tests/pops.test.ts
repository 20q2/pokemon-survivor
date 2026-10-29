import { describe, expect, it } from 'vitest';
import { drainKillCombo, KILL_LADDER, killStep } from '../src/audio/audio.ts';
import { DeathPops, POP_TIME, popSquash } from '../src/render/pops.ts';

describe('kill streak ladder', () => {
  it('a lone kill is plain, a 60/s mow climbs and tops out', () => {
    expect(killStep(0)).toBe(0);
    let combo = 0, last = 0;
    for (let i = 0; i < 40; i++) { // gated plays ~16/s
      combo = drainKillCombo(combo, 0.06);
      last = killStep(combo);
      combo = Math.min(KILL_LADDER.length + 1, combo + 1);
    }
    expect(last).toBe(KILL_LADDER.length - 1);
    expect(KILL_LADDER[last]).toBeLessThanOrEqual(19);
  });
  it('drains back to the bottom when kills stop', () => {
    expect(killStep(drainKillCombo(KILL_LADDER.length + 1, 2))).toBe(0);
  });
  it('a steady trickle (2/s) never climbs', () => {
    let combo = 0;
    for (let i = 0; i < 20; i++) { combo = drainKillCombo(combo, 0.5); expect(killStep(combo)).toBe(0); combo += 1; }
  });
});

describe('death pops', () => {
  it('squashes tall to wide and flat', () => {
    expect(popSquash(0)).toEqual({ sx: 1, sy: 1 });
    const end = popSquash(1);
    expect(end.sx).toBeCloseTo(1.3);
    expect(end.sy).toBeCloseTo(0.4);
  });
  it('expires after POP_TIME and caps at 64, dropping the oldest', () => {
    const p = new DeathPops();
    for (let i = 0; i < 100; i++) p.add(i, 0, 'x', false, 1, 0, 0);
    expect(p.n).toBe(64);
    expect(p.x[p.slot(0)]).toBe(36);
    expect(p.x[p.slot(63)]).toBe(99);
    p.update(POP_TIME * 0.5);
    expect(p.n).toBe(64);
    p.update(POP_TIME);
    expect(p.n).toBe(0);
  });
});
