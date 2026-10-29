// Screenshots the late-game systems: minimap + POIs, an Alpha, Mega Evolution, tooltips.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const line = process.argv[3] ?? 'charmander';
await page.evaluate(async (l) => { window.app.save.options.autoPick = true; window.app.save.lines.push(l); await window.app.startSolo(l, 'viridian'); }, line);
await page.waitForTimeout(800);
const sim = (fn, arg) => page.evaluate(fn, arg);
// jump ahead to the late game with a fully evolved partner
await sim(() => {
  const s = window.app.session.sim; const p = s.players[0];
  s.invulnerable = true; s.time = 320; s.level = 30;
  p.speciesId = 'charizard'; p.stage = 2; p.types = ['fire', 'flying'];
  p.moves = [{ id: 'fire-blast', level: 9, cd: 0, dmgDealt: 5000, kills: 40 }, { id: 'flamethrower', level: 8, cd: 0, dmgDealt: 0, kills: 0 }, { id: 'air-slash', level: 4, cd: 0, dmgDealt: 0, kills: 0 }, { id: 'dragon-rage', level: 2, cd: 0, dmgDealt: 0, kills: 0 }];
  p.items = [{ id: 'charcoal', level: 5 }, { id: 'scope-lens', level: 3 }];
  p.vitamins = { protein: 2, 'hp-up': 1 };
  s.refreshStats();
});
for (let i = 0; i < 16; i++) { await page.keyboard.down('KeyD'); await page.waitForTimeout(300); await page.keyboard.up('KeyD'); }
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/m1-minimap.png` });
// walk to the nearest alpha (teleport close)
await sim(() => {
  const s = window.app.session.sim; const p = s.players[0];
  const a = s.enemies.find((e) => e.alpha && e.alive);
  if (a) { p.x = a.x - 140; p.y = a.y; }
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/m2-alpha.png` });
// grab the mega stone and fill the meter
await sim(() => { const s = window.app.session.sim; s.megaStone = true; s.players[0].mega = 0.995; });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/m3-mega-cine.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/m4-mega-cine2.png` });
await page.waitForTimeout(5000);
for (let i = 0; i < 6; i++) { await page.keyboard.down('KeyA'); await page.waitForTimeout(250); await page.keyboard.up('KeyA'); }
await page.screenshot({ path: `${out}/m5-mega.png` });
// tooltip
const slot = page.locator('.hud-left .slot').first();
await slot.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/m6-tooltip.png` });
// crits/numbers close-up
await page.screenshot({ path: `${out}/m7-numbers.png`, clip: { x: 340, y: 160, width: 600, height: 400 } });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
