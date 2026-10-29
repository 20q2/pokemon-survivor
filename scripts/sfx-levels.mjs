// Renders every sound effect with the in-game synth (via the dev server) and prints peak/RMS/length.
//   PORT=5391 node scripts/sfx-levels.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${process.env.PORT}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.renderSfx);
const names = await page.evaluate(async () => Object.keys((await import('/src/audio/sfx.ts')).SFX));
const extra = ['hit', 'super', 'kill', 'candy', 'boom', 'fire'];
for (const n of [...names, ...extra]) {
  const r = await page.evaluate(async (n) => {
    const b = await window.renderSfx(n, n === 'candy' ? 1 : n === 'fire' ? 1 : 0);
    const L = b.getChannelData(0); let peak = 0, sum = 0, last = 0;
    for (let i = 0; i < L.length; i++) { const v = Math.abs(L[i]); peak = Math.max(peak, v); sum += v * v; if (v > 0.002) last = i; }
    return { peak: peak.toFixed(3), rms: Math.sqrt(sum / Math.max(1, last)).toFixed(4), len: (last / b.sampleRate).toFixed(2) };
  }, n);
  console.log(n.padEnd(10), JSON.stringify(r));
}
const m = await page.evaluate(async () => { const b = await window.renderSong('forest', 8); const L = b.getChannelData(0); let p = 0, s = 0; for (const v of L) { p = Math.max(p, Math.abs(v)); s += v * v; } return { peak: p.toFixed(3), rms: Math.sqrt(s / L.length).toFixed(4) }; });
console.log('MUSIC forest@vol1', JSON.stringify(m));
await browser.close();
