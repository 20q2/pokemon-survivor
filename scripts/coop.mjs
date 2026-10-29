// Two browser contexts: one hosts, one joins via the PeerJS cloud broker.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`[${name} pageerror] ${e.message}\n${e.stack}`));
  await page.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate((n) => { window.app.save.options.name = n; }, name);
  return page;
};
const host = await mk('Ash');
const guest = await mk('Misty');
await host.getByRole('button', { name: 'Online Co-op' }).click();
await host.getByRole('button', { name: 'Host a game' }).click();
await host.getByRole('button', { name: 'Choose!' }).click();
await host.waitForSelector('.code', { timeout: 20000 });
const code = (await host.locator('.code').textContent()).trim();
console.log('room code', code);
await guest.getByRole('button', { name: 'Online Co-op' }).click();
await guest.locator('input[placeholder=CODE]').fill(code);
await guest.getByRole('button', { name: 'Join' }).click();
await guest.locator('.mon').nth(2).click();
await guest.getByRole('button', { name: 'Choose!' }).click();
await guest.waitForSelector('.lobby-player', { timeout: 20000 });
await host.waitForTimeout(1500);
await host.screenshot({ path: `${out}/c1-host-lobby.png` });
await guest.screenshot({ path: `${out}/c2-guest-lobby.png` });
await host.getByRole('button', { name: /Start/ }).click();
await guest.waitForSelector('#hud:not(.hidden)', { timeout: 20000 });
await host.evaluate(() => { window.app.session.sim.invulnerable = true; });
const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
for (let i = 0; i < 10; i++) {
  await Promise.all([host.keyboard.down(keys[i % 4]), guest.keyboard.down(keys[(i + 2) % 4])]);
  await host.waitForTimeout(800);
  await Promise.all([host.keyboard.up(keys[i % 4]), guest.keyboard.up(keys[(i + 2) % 4])]);
  for (const p of [host, guest]) if (await p.locator('.levelup .card').count()) await p.keyboard.press('Digit1');
}
await host.screenshot({ path: `${out}/c3-host-game.png` });
await guest.screenshot({ path: `${out}/c4-guest-game.png` });
const st = await guest.evaluate(() => { const s = window.app.session; return { en: s.world.enemies.length, pr: s.world.projectiles.length, pk: s.world.pickups.length, lv: s.world.level, t: s.world.time.toFixed(1), ph: s.phase() }; });
console.log('guest view', JSON.stringify(st));
const hs = await host.evaluate(() => { const s = window.app.session.sim; return { en: s.enemies.length, pr: s.projectiles.length, pk: s.pickups.length, lv: s.level, t: s.time.toFixed(1), p1: [Math.round(s.players[1].x), Math.round(s.players[1].y)], ph: s.phase }; });
console.log('host sim', JSON.stringify(hs));
await browser.close();
