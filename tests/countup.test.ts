import { describe, expect, it } from 'vitest';
import { countUpValue } from '../src/ui/countup.ts';

describe('countUpValue', () => {
  it('starts at 0, ends exactly on target', () => {
    for (const to of [1, 7, 1234, 98765]) {
      expect(countUpValue(0, to)).toBe(0);
      expect(countUpValue(1, to)).toBe(to);
      expect(countUpValue(1.5, to)).toBe(to);
    }
  });

  it('eases out: past halfway after half the time', () => {
    expect(countUpValue(0.5, 100)).toBeGreaterThan(50);
  });

  it('is an integer and never decreases', () => {
    for (const to of [3, 250, 99999]) {
      let prev = 0;
      for (let i = 0; i <= 200; i++) {
        const v = countUpValue(i / 200, to);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
});
