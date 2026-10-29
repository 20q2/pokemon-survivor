import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: process.argv[2] !== 'headed', args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5391}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(async () => { await window.app.startSolo('charmander', 'viridian'); });
await page.waitForTimeout(500);
// Jump to late game with a strong build.
await page.evaluate(() => {
  const s = window.app.session.sim;
  s.invulnerable = true;
  s.time = 720;
  s.level = 50; s.xp = 0; s.xpNext = 1e9; s.offers.clear(); s.phase = 'play';
  const p = s.players[0];
  p.moves = [
    { id: 'fire-blast', level: 5, cd: 0, dmgDealt: 0, kills: 0 },
    { id: 'flamethrower', level: 5, cd: 0, dmgDealt: 0, kills: 0 },
    { id: 'fire-spin', level: 5, cd: 0, dmgDealt: 0, kills: 0 },
    { id: 'heat-wave', level: 5, cd: 0, dmgDealt: 0, kills: 0 },
  ];
  p.items = [{ id: 'charcoal', level: 5 }, { id: 'wide-lens', level: 5 }, { id: 'loaded-dice', level: 5 }, { id: 'quick-claw', level: 5 }];
});
await page.keyboard.down('KeyD');
for (let i = 0; i < 16; i++) { await page.waitForTimeout(500); if (await page.locator('.levelup .card').count()) await page.keyboard.press('Digit1'); }
await page.evaluate(() => { const s = window.app.session.sim; s.xpNext = 1e9; });
const stats = await page.evaluate(() => new Promise((resolve) => {
  const times = []; let last = performance.now(); let n = 0;
  const f = (t) => { times.push(t - last); last = t; if (++n < 240) requestAnimationFrame(f); else resolve(times); };
  requestAnimationFrame(f);
}));
const s = await page.evaluate(() => { const s = window.app.session.sim; return { en: s.enemies.length, pr: s.projectiles.length, pk: s.pickups.length, parts: window.app.renderer.particles.n }; });
stats.sort((a, b) => a - b);
const avg = stats.reduce((a, b) => a + b, 0) / stats.length;
console.log(`avg frame ${avg.toFixed(1)}ms (${(1000 / avg).toFixed(0)} fps), p95 ${stats[Math.floor(stats.length * 0.95)].toFixed(1)}ms`, JSON.stringify(s));
// Profile JS time per frame portions
const prof = await page.evaluate(() => new Promise((resolve) => {
  const app = window.app; const r = app.renderer; const s = app.session;
  const t0 = performance.now(); for (let i = 0; i < 30; i++) r.render(s.world, 1 / 60); const t1 = performance.now();
  const sim = s.sim; const t2 = performance.now(); for (let i = 0; i < 30; i++) sim.update(1 / 60); const t3 = performance.now();
  resolve({ render: ((t1 - t0) / 30).toFixed(2), sim: ((t3 - t2) / 30).toFixed(2) });
}));
console.log('per-frame ms', JSON.stringify(prof));
await page.screenshot({ path: process.argv[3] ?? 'perf.png' });
await browser.close();
