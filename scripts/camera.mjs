// Measures camera smoothness while walking in a straight line: per-frame camera speed
// should be steady (no 0-step/2-step stutter) and the partner should hold still on screen.
//   node scripts/camera.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--window-position=-2400,0'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.app);
await page.evaluate(async () => { await window.app.startSolo('charmander', 'viridian'); window.app.session.sim.invulnerable = true; });
await page.waitForTimeout(800);
const measure = (interp) => page.evaluate((interp) => new Promise((resolve) => {
  const app = window.app, r = app.renderer, sim = app.session.sim;
  const samples = [];
  let last = null, n = 0;
  const orig = Object.getOwnPropertyDescriptor(sim, 'alpha');
  if (!interp) Object.defineProperty(sim, 'alpha', { get: () => 1, set: () => {}, configurable: true });
  const tick = (t) => {
    const z = r.zoom;
    const cam = Math.round(r.camX * z);
    const me = sim.players[0];
    if (last) samples.push({ dt: (t - last.t) / 1000, dcam: cam - last.cam });
    last = { t, cam };
    if (++n < 150) requestAnimationFrame(tick);
    else {
      if (!interp) { delete sim.alpha; sim.alpha = 1; }
      const sp = samples.slice(20).map((s) => s.dcam / s.dt);
      const mean = sp.reduce((a, b) => a + b, 0) / sp.length;
      const sd = Math.sqrt(sp.reduce((a, b) => a + (b - mean) ** 2, 0) / sp.length);
      const steps = samples.slice(20).map((s) => s.dcam);
      const stalls = steps.filter((d) => d === 0).length;
      resolve({ meanPxPerSec: Math.round(mean), cv: +(sd / mean).toFixed(3), stalls, frames: steps.length, steps: steps.slice(0, 24).join(' ') });
    }
  };
  requestAnimationFrame(tick);
}), interp);
await page.keyboard.down('KeyD');
await page.waitForTimeout(600);
console.log('with interpolation   ', JSON.stringify(await measure(true)));
console.log('without (old camera) ', JSON.stringify(await measure(false)));
await page.keyboard.up('KeyD');
await browser.close();
