// Usage: node scripts/shot.mjs <outdir> [scenario]
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const scenario = process.argv[3] ?? 'basic';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/01-title.png` });
if (scenario === 'basic' || scenario === 'run') {
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/02-select.png` });
  await page.getByRole('button', { name: 'Choose!' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/03-stage.png` });
  await page.locator('.stage').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/04-run-start.png` });
  const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
  for (let i = 0; i < 16; i++) {
    await page.keyboard.down(keys[i % 4]);
    await page.waitForTimeout(900);
    await page.keyboard.up(keys[i % 4]);
    // auto pick first upgrade if a level-up is showing
    if (await page.locator('.levelup .card').count()) {
      if (i === 2) await page.screenshot({ path: `${out}/05-levelup.png` });
      await page.keyboard.press('Digit1');
    }
  }
  await page.screenshot({ path: `${out}/06-run-later.png` });
  // fast-forward the sim to see later-game density
  await page.evaluate(() => {
    const s = window.app.session; const sim = s.sim;
    sim.players[0].hp = 1e9;
  });
}
console.log(logs.join('\n') || 'no console errors');
await browser.close();
