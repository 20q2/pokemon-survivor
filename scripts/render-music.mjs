// Renders songs with the in-game synth (via the dev server) and reports levels.
//   node scripts/render-music.mjs [--out dir] [--secs 40] [--from <section>[,<section>…]] [--stems] [song ...]
// --out writes WAV previews; --stems also prints each track's level soloed, for mixing.
// With no song names it renders the current soundtrack (not the classic-* set).
import { chromium } from 'playwright-core';
import { writeFile, mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const out = opt('--out');
const secs = +opt('--secs', 40);
const from = opt('--from');
const stems = flag('--stems');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5391}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.renderSong);
const all = await page.evaluate(async () => Object.keys((await import('/src/audio/songs.ts')).SONGS));
const names = args.length ? args : all.filter((n) => !n.startsWith('classic-'));
if (out) await mkdir(out, { recursive: true });

const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf').padStart(6);

for (const name of names) {
  const res = await page.evaluate(async ([n, s, wantWav, fromName, wantStems]) => {
    const { SONGS } = await import('/src/audio/songs.ts');
    const def = SONGS[n];
    // --from takes a comma list of section names; the first one the song has wins
    const want = fromName ? fromName.toLowerCase().split(',') : [];
    const at = want.map((w) => def.sections?.find((x) => x.name.toLowerCase() === w)?.tick).find((t) => t !== undefined) ?? 0;
    const measure = (buf) => {
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
      return { peak, rms: Math.sqrt(sum / (L.length * 2)), clip, silent: silentBlocks * 0.25 };
    };
    const t0 = performance.now();
    const buf = await window.renderSong(n, s, at);
    const main = { ...measure(buf), speed: s / ((performance.now() - t0) / 1000) };
    const stemLv = [];
    if (wantStems) {
      const count = def.tracks.length;
      for (let i = 0; i < count; i++) {
        if (!def.tracks[i].mml.trim()) continue;
        const others = [...Array(count).keys()].filter((k) => k !== i);
        const b = await window.renderSong(n, s, at, others);
        stemLv.push({ name: def.tracks[i].name, ...measure(b) });
      }
    }
    let wav = null;
    if (wantWav) {
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const n16 = new Int16Array(L.length * 2);
      for (let i = 0; i < L.length; i++) { n16[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; n16[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
      wav = Array.from(new Uint8Array(n16.buffer));
    }
    return { ...main, stems: stemLv, sr: buf.sampleRate, wav, at };
  }, [name, secs, !!out, from, stems]);
  console.log(`${name.padEnd(16)} peak ${db(res.peak)} dBFS  rms ${db(res.rms)} dBFS  clipped ${res.clip}  silent ${res.silent}s  render ${res.speed.toFixed(1)}x realtime${res.at ? `  (from tick ${res.at})` : ''}`);
  for (const st of res.stems) console.log(`   ${st.name.padEnd(16)} peak ${db(st.peak)}  rms ${db(st.rms)}`);
  if (out && res.wav) {
    const data = Buffer.from(res.wav);
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
    hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(res.sr, 24);
    hdr.writeUInt32LE(res.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
    await writeFile(`${out}/${name}${from ? `-${from}` : ''}.wav`, Buffer.concat([hdr, data]));
  }
}
await browser.close();
