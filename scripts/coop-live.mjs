// Co-op never pauses: host + guest in two browsers (PeerJS cloud broker). Deals a level-up, kills a boss and
// opens a treasure, printing the sim phase, clock, open cards and busy flags each time; screenshots go to argv[2].
//   PORT=5391 node scripts/coop-live.mjs <out-dir>
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`[${name} pageerror] ${e.message}\n${e.stack}`));
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5391}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.app, null, { timeout: 30000 });
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
// Clear any start-of-run cards first.
for (let i = 0; i < 6; i++) { for (const p of [host, guest]) if (await p.locator('.levelup .card').count()) await p.keyboard.press('Digit1'); await host.waitForTimeout(300); }
const state = async () => ({
  host: await host.evaluate(() => { const s = window.app.session.sim; return { ph: s.phase, t: +s.time.toFixed(2), off: [...s.offers.keys()], busy: s.players.map((p) => p.busy), shows: [...s.shows.keys()] }; }),
  guest: await guest.evaluate(() => { const s = window.app.session; return { ph: s.phase(), t: +s.world.time.toFixed(2), cards: document.querySelectorAll('.levelup .card').length, busy: s.world.players.map((p) => p.busy) }; }),
  hostCards: await host.locator('.levelup .card').count(),
});
await host.evaluate(() => { const s = window.app.session.sim; s.xp = s.xpNext + 0.5; });
await host.waitForTimeout(700);
const a = await state();
console.log('level-up dealt', JSON.stringify(a));
await host.waitForTimeout(1500);
const b = await state();
console.log('1.5 s later', JSON.stringify(b));
await host.screenshot({ path: `${out}/live-host-cards.png` });
await guest.screenshot({ path: `${out}/live-guest-cards.png` });
await host.keyboard.press('Digit1');
await host.waitForTimeout(600);
// host free and walking while the guest still chooses
await host.keyboard.down('KeyD'); await host.waitForTimeout(700); await host.keyboard.up('KeyD');
const c = await state();
console.log('host picked, guest still choosing', JSON.stringify(c));
await host.screenshot({ path: `${out}/live-host-bubble.png` });
await guest.keyboard.press('Digit2');
await host.waitForTimeout(700);
console.log('both picked', JSON.stringify(await state()));
// a boss falls: badges per player, no stop
await host.evaluate(async () => {
  const sim = window.app.session.sim;
  const { spawnEnemy } = await import('/src/game/spawner.ts');
  const { killEnemy } = await import('/src/game/enemyAI.ts');
  const b = spawnEnemy(sim, 'beedrill', sim.players[0].x + 80, sim.players[0].y, { boss: { species: 'beedrill', at: 180, patterns: ['charge'] } });
  killEnemy(sim, b, 0);
});
await host.waitForTimeout(800);
console.log('after boss', JSON.stringify(await state()));
await guest.screenshot({ path: `${out}/live-guest-badge.png` });
// the guest opens a treasure: its own show
await host.keyboard.press('Digit1'); await guest.keyboard.press('Digit1');
await host.waitForTimeout(500);
await host.evaluate(() => { const sim = window.app.session.sim; sim.openChest(sim.players[1], 3); });
await host.waitForTimeout(1200);
console.log('guest treasure', JSON.stringify(await state()));
await guest.screenshot({ path: `${out}/live-guest-chest.png` });
await host.waitForTimeout(6000);
console.log('treasure over', JSON.stringify(await state()));
await browser.close();
