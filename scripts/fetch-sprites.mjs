// Downloads only the sprite sheets / portraits / item icons the game needs from
// PMD SpriteCollab (CC BY-NC 4.0) and PokeAPI, converts AnimData.xml to JSON,
// and writes public/assets/manifest.json + credits.json.
//   node scripts/fetch-sprites.mjs [--force]
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPECIES_LIST, LINES } from '../src/data/pokedex.ts';
import { ITEM_LIST } from '../src/data/items.ts';
import { TYPES } from '../src/data/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'assets');
const CACHE = join(ROOT, 'scripts', '.cache');
const SC = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
const ITEM_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
const FORCE = process.argv.includes('--force');

const PLAYER_SPECIES = new Set(LINES.flatMap((l) => [...l.stages, ...Object.values(l.branch ?? {})]));
const PLAYER_ANIMS = ['Walk', 'Idle', 'Hurt'];
const ENEMY_ANIMS = ['Walk', 'Hurt'];
const EXTRA_ITEMS = [
  'exp-candy-s', 'exp-candy-m', 'exp-candy-l', 'exp-candy-xl', 'rare-candy', 'oran-berry', 'sitrus-berry',
  'poke-ball', 'great-ball', 'ultra-ball', 'master-ball', 'protein', 'calcium', 'hp-up', 'iron', 'zinc',
  'carbos', 'pp-up', 'pp-max', 'exp-share', 'max-repel', 'revive', 'max-revive', 'lucky-punch', 'nugget',
  'big-nugget', 'shiny-charm', 'soothe-bell', 'moon-stone', 'escape-rope', 'x-attack', 'x-sp-atk', 'x-speed',
  'choice-band', 'choice-specs', 'zoom-lens', 'magnet',
  ...TYPES.map((t) => `tm-${t}`),
];

const exists = (p) => access(p).then(() => true, () => false);
const pad = (n) => String(n).padStart(4, '0');

async function get(url, asText = false) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return asText ? await r.text() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    }
  }
}

async function download(url, dest) {
  if (!FORCE && (await exists(dest))) return true;
  const buf = await get(url);
  if (!buf) return false;
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return true;
}

/** Parse AnimData.xml into { name: {fw, fh, durations, copyOf?} } */
function parseAnimData(xml) {
  const anims = {};
  for (const m of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const body = m[1];
    const name = body.match(/<Name>(.*?)<\/Name>/)?.[1];
    if (!name) continue;
    const copyOf = body.match(/<CopyOf>(.*?)<\/CopyOf>/)?.[1];
    if (copyOf) { anims[name] = { copyOf }; continue; }
    anims[name] = {
      fw: +body.match(/<FrameWidth>(\d+)/)[1],
      fh: +body.match(/<FrameHeight>(\d+)/)[1],
      durations: [...body.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((d) => +d[1]),
    };
  }
  return anims;
}

async function fetchSpriteSet(dex, subpath, destDir, wanted) {
  const base = `${SC}/sprite/${pad(dex)}${subpath}`;
  const xml = await get(`${base}/AnimData.xml`, true);
  if (!xml) return null;
  const all = parseAnimData(xml);
  const out = {};
  for (const name of wanted) {
    let src = name;
    let guard = 0;
    while (all[src]?.copyOf && guard++ < 5) src = all[src].copyOf;
    const a = all[src];
    if (!a || a.copyOf) continue;
    const ok = await download(`${base}/${src}-Anim.png`, join(destDir, `${src}.png`));
    if (ok) out[name] = { file: `${src}.png`, fw: a.fw, fh: a.fh, durations: a.durations };
  }
  return out.Walk ? out : null;
}

async function pool(items, n, fn) {
  const q = [...items];
  const workers = Array.from({ length: n }, async () => {
    while (q.length) await fn(q.shift());
  });
  await Promise.all(workers);
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const trackerPath = join(CACHE, 'tracker.json');
  const namesPath = join(CACHE, 'credit_names.txt');
  if (FORCE || !(await exists(trackerPath))) await writeFile(trackerPath, await get(`${SC}/tracker.json`));
  if (FORCE || !(await exists(namesPath))) await writeFile(namesPath, await get(`${SC}/credit_names.txt`));
  const tracker = JSON.parse(await readFile(trackerPath, 'utf8'));
  const names = new Map();
  for (const line of (await readFile(namesPath, 'utf8')).split(/\r?\n/).slice(1)) {
    const [name, discord, contact] = line.split('\t');
    if (discord) names.set(discord.trim(), { name: name.trim(), contact: (contact ?? '').trim() });
  }
  const who = (id) => names.get(id)?.name ?? id;
  const creditOf = (c) => (c && c.primary ? [c.primary, ...c.secondary].map(who) : []);

  const manifest = { species: {}, items: [] };
  const credits = [];
  let done = 0;
  await pool(SPECIES_LIST, 10, async (sp) => {
    const isPlayer = PLAYER_SPECIES.has(sp.id);
    const anims = isPlayer ? PLAYER_ANIMS : ENEMY_ANIMS;
    const dir = join(OUT, 'sprites', sp.id);
    const normal = await fetchSpriteSet(sp.dex, '', join(dir, 'normal'), anims);
    const shiny = await fetchSpriteSet(sp.dex, '/0000/0001', join(dir, 'shiny'), anims);
    const portrait = await download(`${SC}/portrait/${pad(sp.dex)}/Normal.png`, join(dir, 'portrait.png'));
    const shinyPortrait = isPlayer
      ? await download(`${SC}/portrait/${pad(sp.dex)}/0000/0001/Normal.png`, join(dir, 'portrait-shiny.png'))
      : false;
    if (!normal) console.warn(`!! no sprite for ${sp.id} (#${sp.dex})`);
    manifest.species[sp.id] = { normal, shiny, portrait, shinyPortrait };
    const t = tracker[pad(sp.dex)];
    const shinyNode = t?.subgroups?.['0000']?.subgroups?.['0001'];
    credits.push({
      species: sp.name, dex: sp.dex,
      sprite: creditOf(t?.sprite_credit), portrait: creditOf(t?.portrait_credit),
      shinySprite: shiny ? creditOf(shinyNode?.sprite_credit) : [],
    });
    done++;
    if (done % 20 === 0) console.log(`  species ${done}/${SPECIES_LIST.length}`);
  });

  const itemNames = [...new Set([...ITEM_LIST.map((i) => i.id), ...EXTRA_ITEMS])];
  await pool(itemNames, 10, async (id) => {
    if (await download(`${ITEM_URL}/${id}.png`, join(OUT, 'items', `${id}.png`))) manifest.items.push(id);
    else console.warn(`!! missing item icon ${id}`);
  });
  manifest.items.sort();
  credits.sort((a, b) => a.dex - b.dex);
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(OUT, 'credits.json'), JSON.stringify(credits, null, 1));
  const missingShiny = Object.entries(manifest.species).filter(([, v]) => !v.shiny).map(([k]) => k);
  console.log(`Done. ${Object.keys(manifest.species).length} species, ${manifest.items.length} items.`);
  if (missingShiny.length) console.log(`No shiny sheet (will hue-shift): ${missingShiny.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
