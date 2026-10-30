import { describe, expect, it } from 'vitest';
import { Director, REPRIEVE_FOR, SURGE_AFTER, SURGE_KPS, type DirectorAction, type DirectorSnapshot } from '../src/game/director.ts';

/** Drives a Director at 10 Hz with a steady kill rate; returns every non-empty action with its time. */
function run(d: Director, secs: number, kps: number, snap: Partial<DirectorSnapshot> = {}, t0 = 0, kills0 = 0) {
  const out: { t: number; act: DirectorAction }[] = [];
  let kills = kills0;
  for (let i = 1; i <= secs * 10; i++) {
    kills += kps / 10;
    const act = d.update(0.1, { minute: 3, hpFrac: 1, standing: true, kills, eventPending: true, ...snap });
    if (act.pullForward !== undefined || act.pauseTrickle !== undefined) out.push({ t: t0 + i / 10, act });
  }
  return out;
}

const make = () => new Director((lo, hi) => (lo + hi) / 2);

describe('Director surge', () => {
  it('pulls the next event forward only after 20 s of dominance, once per minute', () => {
    const hits = run(make(), 80, SURGE_KPS + 4);
    expect(hits).toHaveLength(1);
    expect(hits[0].act.pullForward).toBe(12.5);
    // The kill-rate EMA needs a few seconds to warm up, so it can't fire before SURGE_AFTER.
    expect(hits[0].t).toBeGreaterThanOrEqual(SURGE_AFTER);
    expect(hits[0].t).toBeLessThan(SURGE_AFTER + 8);
  });

  it('does not surge on a dip, with nothing pending, or at a slow kill rate', () => {
    const d = make();
    expect(run(d, 15, 12)).toHaveLength(0);
    run(d, 1, 12, { hpFrac: 0.8 }, 15); // resets the streak
    expect(run(d, 15, 12, {}, 16)).toHaveLength(0);
    expect(run(make(), 60, 12, { eventPending: false })).toHaveLength(0);
    expect(run(make(), 60, SURGE_KPS - 3)).toHaveLength(0);
  });

  it('can surge again in the next minute', () => {
    const d = make();
    expect(run(d, 40, 12)).toHaveLength(1);
    expect(run(d, 40, 12, { minute: 4 }, 40, 480)).toHaveLength(1);
  });
});

describe('Director reprieve', () => {
  it('pauses the trickle at low hp, once per minute', () => {
    const hits = run(make(), 30, 1, { hpFrac: 0.2 });
    expect(hits).toHaveLength(1);
    expect(hits[0].act.pauseTrickle).toBe(REPRIEVE_FOR);
  });

  it('re-arms on a new minute', () => {
    const d = make();
    expect(run(d, 5, 1, { hpFrac: 0.2 })).toHaveLength(1);
    expect(run(d, 5, 1, { hpFrac: 0.2, minute: 4 })).toHaveLength(1);
  });
});

describe('Director guards', () => {
  it('no reprieve when nobody is standing', () => {
    expect(run(make(), 10, 0, { hpFrac: 0, standing: false })).toHaveLength(0);
  });

  it('a one-tick kill burst cannot fake dominance', () => {
    const d = make();
    d.update(0.1, { minute: 3, hpFrac: 1, standing: true, kills: 0, eventPending: true });
    d.update(0.1, { minute: 3, hpFrac: 1, standing: true, kills: 5000, eventPending: true });
    expect(run(d, 15, 0, {}, 0, 5000)).toHaveLength(0);
  });
});

describe('Director normal band', () => {
  it('does nothing at mid hp and a moderate kill rate', () => {
    expect(run(make(), 120, 5, { hpFrac: 0.6 })).toHaveLength(0);
  });
});
