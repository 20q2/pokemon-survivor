// Screenshots: treasure opening (wobble, burst, landed), level-up with a HUD move tooltip,
// and the "wants to learn" prompt after evolving with four moves.
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
await page.evaluate(() => { const s = window.app.session.sim; s.openChest(s.players[0], 2); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/t1-wobble.png` });
await page.waitForTimeout(1250);
await page.screenshot({ path: `${out}/t2-popping.png` });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${out}/t3-landed.png` });
await page.mouse.click(640, 360);
await page.waitForTimeout(700);
const after = await page.evaluate(() => ({ cine: window.app.session.sim.cine?.kind ?? null, popup: !!document.querySelector('.chest-pop') }));
console.log('after dismiss', JSON.stringify(after));
// level-up with build panel + hover
await page.evaluate(() => {
  const s = window.app.session.sim; const p = s.players[0];
  p.moves = [{ id: 'ember', level: 5, cd: 0, dmgDealt: 900, kills: 12 }, { id: 'dragon-rage', level: 2, cd: 0, dmgDealt: 0, kills: 0 }, { id: 'fire-spin', level: 3, cd: 0, dmgDealt: 0, kills: 0 }, { id: 'metal-claw', level: 1, cd: 0, dmgDealt: 0, kills: 0 }];
  p.items = [{ id: 'charcoal', level: 2 }, { id: 'scope-lens', level: 1 }];
  s.refreshStats(); s.xp = s.xpNext;
});
await page.waitForTimeout(700);
await page.locator('.hud-left .slot.move').first().hover();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/t4-levelup-build.png` });
await page.keyboard.press('Digit1');
await page.waitForTimeout(400);
// evolve with 4 moves -> learn prompt
await page.evaluate(() => { const s = window.app.session.sim; s.level = 11; s.xpNext = 10; s.xp = 10; });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(500);
  const k = await page.evaluate(() => window.app.session.sim.offers.get(0)?.[0]?.kind ?? '');
  if (k === 'forget') break;
  if (k) await page.keyboard.press('Digit1');
}
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/t5-learn.png` });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
