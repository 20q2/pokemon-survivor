// Screenshots the treasure slot machine at each ball tier, the tiered balls on the ground,
// and a level-up with TM discs and type plates.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
await page.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.app);
await page.evaluate(async () => { await window.app.startSolo('charmander', 'viridian'); const s = window.app.session.sim; s.invulnerable = true; });
await page.waitForTimeout(600);
// balls on the ground
await page.evaluate(() => {
  const s = window.app.session.sim; const p = s.players[0];
  [1, 2, 3, 4].forEach((t, i) => { const pk = s.spawnPickup('chest', p.x - 90 + i * 60, p.y - 70, t); pk.vx = pk.vy = 0; });
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/c1-balls.png` });
// open a Great Ball and an Ultra Ball mid-spin and landed
for (const tier of [2, 3]) {
  await page.evaluate((t) => { const s = window.app.session.sim; s.pickups = s.pickups.filter((x) => x.kind !== 'chest'); s.openChest(s.players[0], t); }, tier);
  await page.waitForTimeout(1250);
  await page.screenshot({ path: `${out}/c2-spin-${tier}.png` });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/c3-landed-${tier}.png` });
  await page.waitForTimeout(1500);
}
// level-up with TM discs
await page.evaluate(() => { const s = window.app.session.sim; s.xp = s.xpNext; });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/c4-levelup.png` });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
