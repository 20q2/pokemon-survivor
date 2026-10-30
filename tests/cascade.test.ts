import { describe, expect, it } from 'vitest';
import { CASCADE_MAX_STEP, CascadeTracker, cascadeLabel } from '../src/ui/cascade.ts';

describe('level-up cascade', () => {
  it('labels only multi-level screens, counting the current one', () => {
    expect(cascadeLabel(3)).toBe('×3 LEVEL UP!');
    expect(cascadeLabel(2)).toBe('×2 LEVEL UP!');
    expect(cascadeLabel(1)).toBeNull();
    expect(cascadeLabel(0)).toBeNull();
  });

  it('steps up one semitone per card, including the last, and is stable across redraws', () => {
    const t = new CascadeTracker();
    expect(t.step(3)).toBe(0);
    expect(t.step(3)).toBe(0); // reroll redraws the same screen
    expect(t.step(2)).toBe(1);
    expect(t.step(1)).toBe(2);
    expect(t.step(1)).toBe(2);
    t.reset();
    expect(t.step(1)).toBe(0); // a lone level-up afterwards is normal pitch
  });

  it('caps the climb', () => {
    const t = new CascadeTracker();
    expect(t.step(9)).toBe(0);
    expect(t.step(1)).toBe(CASCADE_MAX_STEP);
  });
});

describe('cascade size', () => {
  it('remembers the cascade size through every card of it', () => {
    const t = new CascadeTracker();
    t.step(3);
    expect(t.size).toBe(3);
    t.step(2);
    t.step(1);
    expect(t.size).toBe(3);
    t.reset();
    expect(t.size).toBe(0);
  });
});
