// Renders every biome's props into one contact sheet PNG (for eyeballing the pixel art).
//   PORT=5391 node scripts/props-sheet.mjs out.png
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5391}/`, { waitUntil: 'networkidle' });
const url = await page.evaluate(async () => {
  const { biomeFor } = await import('/src/render/biomes.ts');
  const ids = ['viridian', 'mtmoon', 'seafoam', 'powerplant', 'tower', 'cinnabar', 'cerulean'];
  const c = document.createElement('canvas'); c.width = 900; c.height = ids.length * 60; const g = c.getContext('2d');
  ids.forEach((id, row) => {
    const b = biomeFor(id); let x = 4;
    g.fillStyle = '#7a8a7a'; g.fillRect(0, row * 60, 900, 60);
    for (const p of b.props) for (const s of p.sprites) for (const f of s.frames) { g.drawImage(f, x, row * 60 + 58 - f.height); x += f.width + 4; }
  });
  return c.toDataURL();
});
const { writeFile } = await import('node:fs/promises');
await writeFile(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
