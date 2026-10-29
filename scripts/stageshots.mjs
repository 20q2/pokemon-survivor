// Usage: PORT=5397 node scripts/stageshots.mjs <outdir> [stageId...]
// Starts a solo run on each stage, walks a little, screenshots the world.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const only = process.argv.slice(3);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5391}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.app, null, { timeout: 20000 });
const stages = only.length ? only : await page.evaluate(() => ['viridian', 'mtmoon', 'seafoam', 'powerplant', 'tower', 'cinnabar', 'cerulean']);
for (const id of stages) {
  await page.evaluate((id) => window.app.startSolo('bulbasaur', id), id);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const p = window.app.session.sim?.players?.[0] ?? window.app.session.world.players[0]; p.hp = 1e9; p.maxHp = 1e9; });
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1500); await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS'); await page.waitForTimeout(900); await page.keyboard.up('KeyS');
  if (process.env.FIGHT) {
    await page.evaluate(() => {
      const s = window.app.session, r = window.app.renderer;
      window.app.save.options.autoPick = true;
      for (let i = 0; i < 60 * 45; i++) {
        if (s.phase() === 'levelup' && s.offers()) s.choose(0);
        s.step(1 / 60, Math.cos(i / 90), Math.sin(i / 90), r.viewW, r.viewH);
      }
    });
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${out}/${id}.png` });
  await page.evaluate(() => { window.app.session?.dispose?.(); });
}
console.log(logs.join('\n') || 'no errors');
await browser.close();
