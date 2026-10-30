// Buried treasure: shows a dig spot at rest, mid-dig, and the chest show when it pops.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5391}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(async () => { await window.app.startSolo('charmander', 'viridian'); });
await page.waitForTimeout(1000);
const sim = (fn, arg) => page.evaluate(fn, arg);
await sim(() => {
  const s = window.app.session.sim; s.invulnerable = true;
  const p = s.players[0];
  s.spawnPickup('dig', p.x + 70, p.y, 3);
  s.spawnPickup('dig', p.x - 90, p.y + 30, 2);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/d1-buried.png` });
await page.screenshot({ path: `${out}/d1-zoom.png`, clip: { x: 440, y: 260, width: 400, height: 200 } });
// walk onto the right-hand spot
await sim(() => { const s = window.app.session.sim; const p = s.players[0]; const pk = s.pickups.find((k) => k.kind === 'dig' && k.value === 3); p.x = pk.x; p.y = pk.y; });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/d2-digging.png` });
await page.screenshot({ path: `${out}/d2-zoom.png`, clip: { x: 540, y: 280, width: 200, height: 120 } });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${out}/d3-opened.png` });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
