import { describe, expect, it } from 'vitest';
import { DeathPops, POP_TIME, popSquash } from '../src/render/pops.ts';

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
