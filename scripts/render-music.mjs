// Renders every song with the in-game synth (via the dev server) and reports levels.
//   node scripts/render-music.mjs [outDir] [seconds]   -> WAV previews + peak/RMS per song
import { chromium } from 'playwright-core';
import { writeFile, mkdir } from 'node:fs/promises';
const out = process.argv[2];
const secs = +(process.argv[3] ?? 40);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.renderSong);
const names = await page.evaluate(async () => Object.keys((await import('/src/audio/songs.ts')).SONGS));
if (out) await mkdir(out, { recursive: true });
for (const name of names) {
  const res = await page.evaluate(async ([n, s, wantWav]) => {
    const buf = await window.renderSong(n, s);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, sum = 0, clip = 0, silentBlocks = 0, block = 0, blockSum = 0;
    const bs = Math.floor(buf.sampleRate * 0.25);
    for (let i = 0; i < L.length; i++) {
      const v = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      peak = Math.max(peak, v);
      if (v > 0.99) clip++;
      sum += L[i] * L[i] + R[i] * R[i];
      blockSum += L[i] * L[i];
      if (++block === bs) { if (Math.sqrt(blockSum / bs) < 0.003) silentBlocks++; block = 0; blockSum = 0; }
    }
    let wav = null;
    if (wantWav) {
      const n16 = new Int16Array(L.length * 2);
      for (let i = 0; i < L.length; i++) { n16[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; n16[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
      wav = Array.from(new Uint8Array(n16.buffer));
    }
    return { peak, rms: Math.sqrt(sum / (L.length * 2)), clip, silentBlocks, sr: buf.sampleRate, wav };
  }, [name, secs, !!out]);
  const db = (v) => (20 * Math.log10(v)).toFixed(1);
  console.log(`${name.padEnd(8)} peak ${db(res.peak)} dBFS  rms ${db(res.rms)} dBFS  clipped ${res.clip}  silent ${res.silentBlocks * 0.25}s`);
  if (out && res.wav) {
    const data = Buffer.from(res.wav);
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
    hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(res.sr, 24);
    hdr.writeUInt32LE(res.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
    await writeFile(`${out}/${name}.wav`, Buffer.concat([hdr, data]));
  }
}
await browser.close();
