import type { App } from '../app.ts';
import { audio, SONGS } from '../audio/audio.ts';
import { isKitInst } from '../audio/instruments.ts';
import { TICKS_PER_WHOLE, type Drum } from '../audio/mml.ts';
import type { CompiledSong, Mode } from '../audio/score.ts';
import { STAGES, type StageDef } from '../data/stages.ts';
import { assets } from '../render/assets.ts';
import { stageThumbnail } from '../render/background.ts';
import { btn, h, img } from './dom.ts';

/**
 * Sound Test: every song in the game, grouped by where it plays, with a live view of the score
 * (spectrum, a scrolling piano roll per track, the arrangement timeline), jumps to each section
 * and per-track mutes, so a piece can be reviewed bit by bit.
 */

interface Entry { id: string; where: string; stage?: StageDef; icon?: string }

const KEY_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MODE_NAMES: Record<Mode, string> = { major: 'major', minor: 'minor', harmonic: 'minor', dorian: 'dorian', mixolydian: 'mixolydian', phrygian: 'phrygian' };
const LANE_COLORS = ['#ffd94a', '#ff8a5c', '#8fc1ff', '#7cf0c8', '#d59bff', '#ff6fa8', '#b8f060', '#5fd3ff', '#ffb35c', '#f4f7ff', '#ff5d4f', '#9ea8ff', '#ffe08a', '#6be08f'];
const DRUM_ROW: Record<Drum, number> = { k: 0, t: 1, i: 0, s: 2, c: 2, h: 3, p: 3, y: 3, x: 4, w: 4, z: 4 };
const BAR = TICKS_PER_WHOLE;

function groups(): { name: string; list: Entry[] }[] {
  const main = [
    { name: 'Routes', list: STAGES.map((st): Entry => ({ id: st.music, where: st.name, stage: st })) },
    {
      name: 'Battles', list: [
        { id: 'boss', where: 'Boss battles', icon: 'ultra-ball' },
        { id: 'final', where: 'Final boss', icon: 'master-ball' },
      ],
    },
    {
      name: 'Menus', list: [
        { id: 'title', where: 'Title screen', icon: 'poke-ball' },
        { id: 'menu', where: 'Run results', icon: 'rare-candy' },
        { id: 'shop', where: 'Poké Mart', icon: 'amulet-coin' },
      ],
    },
  ];
  const where = new Map(main.flatMap((g) => g.list.map((e) => [e.id, e] as const)));
  const classic = Object.keys(SONGS).filter((k) => k.startsWith('classic-')).map((k): Entry => {
    const twin = where.get(k.slice('classic-'.length));
    return { id: k, where: twin ? `was: ${twin.where}` : 'Classic', stage: twin?.stage, icon: twin?.icon };
  });
  return [...main.map((g) => ({ ...g, list: g.list.filter((e) => SONGS[e.id]) })), { name: 'Classic chip set (v1)', list: classic }];
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function soundTestScreen(app: App) {
  const all = groups();
  const flat = all.flatMap((g) => g.list);
  let cur = 0;
  let playing = false;
  let pausedAt = 0;
  const muted = new Set<number>();

  const listEl = h('div', { class: 'panel snd-list' });
  const head = h('div', { class: 'snd-head' });
  const canvas = h('canvas', { class: 'snd-viz', width: 760, height: 340 }) as HTMLCanvasElement;
  const g = canvas.getContext('2d')!;
  const sections = h('div', { class: 'snd-row snd-sections' });
  const trackRow = h('div', { class: 'snd-row snd-tracks' });
  const timeEl = h('span', { class: 'snd-time' });
  const playBtn = btn('', () => togglePlay(), 'small primary snd-play');
  const songBtns: HTMLButtonElement[] = [];

  const entry = () => flat[cur];
  const song = (): CompiledSong => audio.compiled(entry().id)!;
  const position = () => {
    const np = audio.nowPlaying();
    return playing && np?.name === entry().id ? np.tick : pausedAt;
  };

  /** Play from a tick (snapped to the bar), keeping the track mutes. */
  const playFrom = (tick: number) => {
    playing = true;
    audio.playMusic(entry().id, Math.max(0, Math.floor(tick / BAR) * BAR));
    for (const tr of muted) audio.setMute(tr, true);
    playBtn.textContent = '❚❚ Pause';
  };
  const togglePlay = () => {
    if (playing) {
      pausedAt = position();
      audio.stopMusic();
      playing = false;
      playBtn.textContent = '▶ Play';
    } else playFrom(pausedAt);
  };

  const select = (i: number) => {
    cur = (i + flat.length) % flat.length;
    muted.clear();
    pausedAt = 0;
    songBtns.forEach((b, k) => b.classList.toggle('sel', k === cur));
    renderInfo();
    playFrom(0);
  };

  const renderInfo = () => {
    const e = entry();
    const s = song();
    const def = s.def;
    const loopSecs = (s.length - s.loopTick) * s.spt;
    const art = e.stage ? (() => {
      const t = stageThumbnail(e.stage, 132, 46);
      const c = h('canvas', { class: 'snd-art', width: t.width, height: t.height }) as HTMLCanvasElement;
      c.getContext('2d')!.drawImage(t, 0, 0);
      return c;
    })() : img(assets.itemUrl(e.icon ?? 'poke-ball'), 'px snd-icon');
    head.replaceChildren(
      art,
      h('div', { class: 'col', style: 'gap:2px;min-width:0' },
        h('div', { class: 'snd-title' }, def.title),
        h('div', { class: 'snd-where' }, e.where),
        h('div', { class: 'hint' }, `${def.bpm} BPM · ${KEY_NAMES[def.key[0]]} ${MODE_NAMES[def.key[1]]} · loop ${fmt(loopSecs)} · ${def.tracks.filter((t) => t.mml.trim()).length} tracks`),
        def.about ? h('div', { class: 'hint snd-about' }, def.about) : null,
      ),
    );
    const marks = def.sections ?? [];
    sections.replaceChildren(
      h('span', { class: 'snd-label' }, 'Jump to'),
      ...(marks.length ? marks : [{ name: 'Start', tick: 0 }]).map((m) => btn(m.name, () => playFrom(m.tick), 'small')),
    );
    trackRow.replaceChildren(
      h('span', { class: 'snd-label' }, 'Mute'),
      ...def.tracks.flatMap((t, tr) => {
        if (!t.mml.trim()) return [];
        const b = btn([h('i', { style: `background:${LANE_COLORS[tr % LANE_COLORS.length]}` }), t.name], () => {
          const on = !muted.has(tr);
          if (on) muted.add(tr); else muted.delete(tr);
          audio.setMute(tr, on);
          b.classList.toggle('off', on);
        }, 'small snd-track');
        return b;
      }),
    );
  };

  for (const grp of all) {
    listEl.append(h('div', { class: 'snd-group' }, grp.name));
    for (const e of grp.list) {
      const i = flat.indexOf(e);
      const b = btn([h('span', { class: 'nm' }, SONGS[e.id].title), h('span', { class: 'wh' }, e.where)], () => select(i), 'snd-song') as HTMLButtonElement;
      if (i === 0) b.setAttribute('data-autofocus', '');
      songBtns.push(b);
      listEl.append(b);
    }
  }

  // ── visualiser ──
  const freq = new Uint8Array(1024);
  const ranges = new Map<CompiledSong, [number, number][]>();
  const pitchRanges = (s: CompiledSong) => {
    let r = ranges.get(s);
    if (!r) {
      r = s.byTrack.map((evs) => {
        let lo = 127, hi = 0;
        for (const e of evs) for (const m of e.midi) { lo = Math.min(lo, m); hi = Math.max(hi, m); }
        return [lo, Math.max(lo + 11, hi)];
      });
      ranges.set(s, r);
    }
    return r;
  };
  const W = canvas.width, H = canvas.height;
  const SPEC_H = 64, TL_H = 34, ROLL_TOP = SPEC_H + 10, ROLL_H = H - ROLL_TOP - TL_H - 8;

  const draw = () => {
    const s = song();
    const tick = position();
    g.fillStyle = '#0a0f2b';
    g.fillRect(0, 0, W, H);

    // spectrum, in chunky pixel columns
    const an = audio.analyser;
    if (an && playing) an.getByteFrequencyData(freq);
    else freq.fill(0);
    const nyq = (audio.ctx?.sampleRate ?? 48000) / 2;
    const cols = 48, cw = W / cols;
    for (let i = 0; i < cols; i++) {
      const f0 = 40 * Math.pow(12000 / 40, i / cols), f1 = 40 * Math.pow(12000 / 40, (i + 1) / cols);
      const b0 = Math.floor((f0 / nyq) * freq.length), b1 = Math.max(b0 + 1, Math.floor((f1 / nyq) * freq.length));
      let v = 0;
      for (let b = b0; b < b1; b++) v = Math.max(v, freq[b]);
      const blocks = Math.round((v / 255) * (SPEC_H / 6));
      for (let k = 0; k < blocks; k++) {
        g.fillStyle = k > 8 ? '#ff5d4f' : k > 5 ? '#ffd94a' : '#7cf0c8';
        g.fillRect(i * cw + 1, SPEC_H - (k + 1) * 6 + 1, cw - 2, 4);
      }
    }

    // piano roll: 3 bars, the playhead a quarter of the way in
    const span = BAR * 3, t0 = tick - span * 0.25;
    const x = (t: number) => ((t - t0) / span) * W;
    const lanes = s.def.tracks.map((t, tr) => ({ t, tr })).filter(({ t }) => t.mml.trim());
    const laneH = ROLL_H / Math.max(1, lanes.length);
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let b = Math.floor(t0 / 48) * 48; b < t0 + span; b += 48) {
      g.fillStyle = b % BAR === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.035)';
      g.fillRect(Math.round(x(b)), ROLL_TOP, 1, ROLL_H);
    }
    const pr = pitchRanges(s);
    g.font = '11px "Pixelify Sans", sans-serif';
    g.textBaseline = 'top';
    lanes.forEach(({ t, tr }, li) => {
      const y0 = ROLL_TOP + li * laneH;
      const off = muted.has(tr);
      const col = LANE_COLORS[tr % LANE_COLORS.length];
      if (li % 2) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, y0, W, laneH); }
      const evs = s.byTrack[tr];
      const kit = isKitInst(t.inst);
      const [lo, hi] = pr[tr];
      // first event that could still be visible (notes are at most a few bars long)
      let a = 0, z = evs.length;
      while (a < z) { const m = (a + z) >> 1; if (evs[m].tick < t0 - BAR * 2) a = m + 1; else z = m; }
      g.globalAlpha = off ? 0.18 : 1;
      for (let k = a; k < evs.length && evs[k].tick < t0 + span; k++) {
        const e = evs[k];
        const xs = x(e.tick), xe = x(e.tick + (kit ? 6 : e.dur));
        if (xe < 0) continue;
        const on = tick >= e.tick && tick < e.tick + Math.max(e.dur, 6);
        g.fillStyle = on ? '#fff' : col;
        if (kit) {
          const row = DRUM_ROW[e.drum!] ?? 2;
          const rh = (laneH - 4) / 5;
          g.fillRect(xs, y0 + laneH - 2 - (row + 1) * rh, Math.max(3, xe - xs), Math.max(2, rh - 1));
        } else {
          const nh = Math.max(2, Math.min(5, (laneH - 4) / (hi - lo + 1)));
          for (const m of e.midi) {
            const y = y0 + 2 + (1 - (m - lo) / (hi - lo + 1)) * (laneH - 4 - nh);
            g.fillRect(xs, y, Math.max(2, xe - xs - 1), nh);
          }
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(10,15,43,0.75)';
      g.fillRect(0, y0 + 1, g.measureText(t.name).width + 8, 13);
      g.fillStyle = off ? 'rgba(244,247,255,0.35)' : 'rgba(244,247,255,0.8)';
      g.fillText(t.name, 4, y0 + 2);
    });
    g.fillStyle = '#ff5d4f';
    g.fillRect(Math.round(x(tick)), ROLL_TOP - 2, 2, ROLL_H + 4);

    // arrangement timeline: sections, the loop point, the playhead
    const ty = H - TL_H;
    const tx = (t: number) => (t / s.length) * (W - 2) + 1;
    const marks = s.def.sections ?? [{ name: '', tick: 0 }];
    marks.forEach((m, i) => {
      const end = marks[i + 1]?.tick ?? s.length;
      const inside = tick >= m.tick && tick < end;
      g.fillStyle = inside ? '#3557c8' : i % 2 ? '#1e3184' : '#2a42a6';
      g.fillRect(tx(m.tick), ty, tx(end) - tx(m.tick) - 1, TL_H - 14);
      g.fillStyle = inside ? '#fff' : '#a9b8e6';
      g.save();
      g.beginPath();
      g.rect(tx(m.tick), ty, tx(end) - tx(m.tick) - 2, TL_H - 14);
      g.clip();
      g.fillText(m.name, tx(m.tick) + 3, ty + 4);
      g.restore();
    });
    g.fillStyle = '#ffd94a';
    g.fillRect(tx(s.loopTick), ty - 3, 2, TL_H - 8);
    g.fillText('↻ loop', tx(s.loopTick) + 4, ty + TL_H - 12);
    g.fillStyle = '#ff5d4f';
    g.fillRect(tx(tick) - 1, ty - 3, 3, TL_H - 8);

    timeEl.textContent = `${fmt(tick * s.spt)} / ${fmt(s.length * s.spt)}`;
  };

  canvas.addEventListener('pointerdown', (ev) => {
    const r = canvas.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W, py = ((ev.clientY - r.top) / r.height) * H;
    if (py < H - TL_H - 6) return;
    playFrom((px / W) * song().length);
  });

  app.onFrame = () => { if (canvas.isConnected) draw(); };

  const root = h('div', { class: 'screen dim' },
    h('div', { class: 'topbar' }, btn('◀ Back', () => app.goTitle(), 'small', { 'data-back': true }), h('h2', null, 'Sound Test'), timeEl),
    h('div', { class: 'snd-wrap' },
      listEl,
      h('div', { class: 'panel snd-player col' },
        head,
        canvas,
        h('div', { class: 'snd-row' },
          btn('⏮ Prev', () => select(cur - 1), 'small'),
          playBtn,
          btn('Next ⏭', () => select(cur + 1), 'small'),
          h('span', { class: 'hint', style: 'margin-left:auto' }, 'Click the timeline to seek'),
        ),
        sections,
        trackRow,
      ),
    ),
  );
  select(0);
  return root;
}
