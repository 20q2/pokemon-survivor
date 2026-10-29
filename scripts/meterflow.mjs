// Checks the camera holds still while level-up cards are open (it used to shake), and
// screenshots the damage tracker's three tabs.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.app);
await page.evaluate(async () => { await window.app.startSolo('bulbasaur', 'viridian'); const s = window.app.session.sim; s.invulnerable = true; });
await page.keyboard.down('KeyD');
await page.waitForTimeout(1500);
// level up while moving: camera must not move between frames
await page.evaluate(() => { const s = window.app.session.sim; s.xp = s.xpNext; });
await page.waitForTimeout(400);
const shake = await page.evaluate(() => new Promise((res) => {
  const r = window.app.renderer, xs = [];
  const tick = () => { xs.push(Math.round(r.camX * r.zoom)); if (xs.length < 60) requestAnimationFrame(tick); else res({ phase: window.app.session.phase(), distinctCameraPositions: new Set(xs).size }); };
  requestAnimationFrame(tick);
}));
console.log('during level-up:', JSON.stringify(shake));
await page.keyboard.up('KeyD');
await page.keyboard.press('Digit1');
// play a bit with Leftovers so there is healing, then open the tracker
await page.evaluate(() => { const s = window.app.session.sim; const p = s.players[0]; p.items.push({ id: 'leftovers', level: 5 }); s.refreshStats(); });
for (let i = 0; i < 16; i++) {
  await page.keyboard.down(['KeyD', 'KeyS', 'KeyA', 'KeyW'][i % 4]); await page.waitForTimeout(500); await page.keyboard.up(['KeyD', 'KeyS', 'KeyA', 'KeyW'][i % 4]);
  if (await page.locator('.levelup .card').count()) await page.keyboard.press('Digit1');
  await page.evaluate(() => { const p = window.app.session.sim.players[0]; p.hp = Math.min(p.hp, p.stats.maxHp * 0.6); });
}
await page.keyboard.press('KeyT');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/d1-damage.png` });
await page.locator('.m-tab', { hasText: 'Healing' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/d2-healing.png`, clip: { x: 960, y: 0, width: 320, height: 520 } });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
