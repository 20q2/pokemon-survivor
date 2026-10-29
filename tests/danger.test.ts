import { describe, expect, it } from 'vitest';
import { dangerStrength, heartbeatInterval } from '../src/render/danger.ts';
import { freshSave, migrate } from '../src/meta/save.ts';

describe('danger cues', () => {
  it('vignette is off above 30% HP and ramps to 0.45 at 10%', () => {
    expect(dangerStrength(1)).toBe(0);
    expect(dangerStrength(0.3)).toBe(0);
    expect(dangerStrength(0.2)).toBeCloseTo(0.225);
    expect(dangerStrength(0.1)).toBeCloseTo(0.45);
    expect(dangerStrength(0.02)).toBeCloseTo(0.45);
  });
  it('heartbeat is 0.9 s at <=30%, 0.6 s under 15%, silent above', () => {
    expect(heartbeatInterval(0.5)).toBe(0);
    expect(heartbeatInterval(0.3)).toBe(0.9);
    expect(heartbeatInterval(0.15)).toBe(0.9);
    expect(heartbeatInterval(0.14)).toBe(0.6);
  });
});

describe('readability options', () => {
  it('fills fxOpacity and numberCap on saves that predate them', () => {
    const { fxOpacity, numberCap, ...old } = freshSave().options;
    expect(fxOpacity).toBe(1);
    const s = migrate({ options: { ...old, music: 0.2 } });
    expect(s.options.fxOpacity).toBe(1);
    expect(s.options.numberCap).toBe(160);
    const bad = migrate({ options: { fxOpacity: 9, numberCap: 7 } });
    expect(bad.options.fxOpacity).toBe(1);
    expect(bad.options.numberCap).toBe(160);
    expect(migrate({ options: { fxOpacity: 0 } }).options.fxOpacity).toBe(0.25);
    expect(s.options.music).toBe(0.2);
  });
});
