import { audio } from '../audio/audio.ts';

/** Ease-out integer count from 0 to `to`; monotone, exactly `to` at t01 >= 1. */
export function countUpValue(t01: number, to: number): number {
  if (t01 >= 1) return to;
  if (t01 <= 0) return 0;
  return Math.round(to * (1 - Math.pow(1 - t01, 3)));
}

// Shared so overlapping counters tick as one voice, not three.
let lastTick = -Infinity;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animate `el`'s text up to `to` over `ms`, ticking at most every 80 ms. Snaps when motion is reduced or ms is 0. */
export function countUp(el: HTMLElement, to: number, ms: number, format: (n: number) => string = (n) => n.toLocaleString()) {
  if (ms <= 0 || to <= 0 || reducedMotion()) { el.textContent = format(to); return; }
  el.textContent = format(0);
  const t0 = performance.now();
  let frames = 0;
  const frame = (now: number) => {
    // The element is built before it is attached; only give up once it has had a few frames to appear.
    if (++frames > 3 && !el.isConnected) return;
    const t = (now - t0) / ms;
    el.textContent = format(countUpValue(t, to));
    if (t >= 1) return;
    if (now - lastTick >= 80) { lastTick = now; audio.sfx('tick', 4); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
