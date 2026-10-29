// Exercises level-up, evolution, chest, boss, pause and results via dev hooks.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5391}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const line = process.argv[3] ?? 'charmander';
const stage = process.argv[4] ?? 'viridian';
await page.evaluate(async ([l, s]) => { window.app.save.lines.push(l); await window.app.startSolo(l, s); }, [line, stage]);
await page.waitForTimeout(1000);
const sim = (fn) => page.evaluate(fn);
// level up
await sim(() => { const s = window.app.session.sim; s.xp = s.xpNext; });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/f1-levelup.png` });
await page.keyboard.press('Digit1');
// evolution
await sim(() => { const s = window.app.session.sim; s.level = 11; s.xpNext = 10; s.xp = 10; });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/f2-evolving.png` });
await page.waitForTimeout(2300);
await page.screenshot({ path: `${out}/f3-evolved.png` });
for (let i = 0; i < 3; i++) { if (await page.locator('.levelup .card').count()) await page.keyboard.press('Digit1'); await page.waitForTimeout(200); }
// chest
await sim(() => { const s = window.app.session.sim; const p = s.players[0]; s.spawnPickup('chest', p.x + 5, p.y); });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${out}/f4-chest.png` });
await page.waitForTimeout(2000);
// boss + crowd
await sim(() => { const s = window.app.session.sim; s.time = 298; s.invulnerable = true; });
for (let i = 0; i < 12; i++) {
  await page.keyboard.down(['KeyD', 'KeyS', 'KeyA', 'KeyW'][i % 4]);
  await page.waitForTimeout(700);
  await page.keyboard.up(['KeyD', 'KeyS', 'KeyA', 'KeyW'][i % 4]);
  if (await page.locator('.levelup .card').count()) await page.keyboard.press('Digit1');
}
await page.screenshot({ path: `${out}/f5-boss.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/f6-pause.png` });
await page.keyboard.press('Escape');
await sim(() => { const s = window.app.session.sim; s.invulnerable = false; s.players[0].revives = 0; s.players[0].hp = 0.5; s.hurtPlayer(s.players[0], 10, 'normal', false); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/f6b-faint.png` });
await page.waitForTimeout(3200);
await page.screenshot({ path: `${out}/f7-results.png` });
const perf = await page.evaluate(() => ({ en: 0 }));
console.log(JSON.stringify(perf));
console.log(logs.join('\n') || 'no console errors');
await browser.close();
