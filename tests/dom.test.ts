import { describe, expect, it } from 'vitest';
import { minuteFlipped } from '../src/ui/dom.ts';

describe('minuteFlipped', () => {
  it('fires only when the displayed minute changes', () => {
    expect(minuteFlipped(59.9, 60.1)).toBe(true);
    expect(minuteFlipped(60.1, 61)).toBe(false);
    expect(minuteFlipped(0, 0.1)).toBe(false);
  });
  it('does not fire on the first sample', () => {
    expect(minuteFlipped(-1, 0)).toBe(false);
  });
});
