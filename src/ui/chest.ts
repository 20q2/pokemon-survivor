import { MAX_MOVE_LEVEL, MOVES, MOVE_LIST } from '../data/moves.ts';
import { ITEMS, ITEM_LIST, VITAMIN, VITAMINS } from '../data/items.ts';
import { assets } from '../render/assets.ts';
import { audio } from '../audio/audio.ts';
import { chestTiming } from '../game/sim.ts';
import { CHEST_BALL, CHEST_COLOR, CHEST_NAME, type ChestReward, type ChestTier } from '../game/types.ts';
import { h, img, moveDisc, uiIcon } from './dom.ts';

type Face = { kind: ChestReward['kind']; id: string };

/** Eager image (faces swap many times a second, so they must never wait on lazy loading). */
const pic = (src: string) => h('img', { src, draggable: 'false' });

function face(f: Face): HTMLElement {
  if (f.kind === 'move' || f.kind === 'mastery') {
    return moveDisc(f.id, 'reel-face tm', true);
  }
  return h('div', { class: 'reel-face item' }, pic(assets.itemUrl(f.id)));
}

let preloaded = false;
/** Warm the browser cache with every icon a reel can show. */
export function preloadChestFaces() {
  if (preloaded) return;
  preloaded = true;
  for (const f of decoys()) {
    const src = f.kind === 'move' ? assets.itemUrl(`tm-${MOVES[f.id].type}`) : assets.itemUrl(f.id);
    void assets.image(src).catch(() => undefined);
  }
}

function label(r: ChestReward): HTMLElement {
  if (r.kind === 'mastery') return h('div', { class: 'reel-label mastery' }, img(uiIcon('mastery'), 'mastery-mark'), `${MOVES[r.from!].name} → ${MOVES[r.id].name}!`);
  if (r.kind === 'move') {
    const lv = r.level!;
    return h('div', { class: 'reel-label' }, MOVES[r.id].name, h('span', null, lv === 1 ? 'NEW' : lv > MAX_MOVE_LEVEL ? `LIMIT ★${lv - MAX_MOVE_LEVEL}` : `Lv ${lv}`));
  }
  if (r.kind === 'item') return h('div', { class: 'reel-label' }, ITEMS[r.id].name, h('span', null, r.level === 1 ? 'NEW' : `Lv ${r.level}`));
  if (r.kind === 'gold') return h('div', { class: 'reel-label' }, 'Nugget', h('span', null, `₽${r.level}`));
  if (r.kind === 'heal') return h('div', { class: 'reel-label' }, r.id === 'sitrus-berry' ? 'Sitrus Berry' : 'Oran Berry', h('span', null, 'HEAL'));
  return h('div', { class: 'reel-label' }, VITAMIN[r.id].name, h('span', null, `×${r.level}`));
}

/** Random faces to shuffle through while a reward is in the air: things you could have won. */
function decoys(): Face[] {
  const out: Face[] = [];
  for (const m of MOVE_LIST) if (!m.mastery) out.push({ kind: 'move', id: m.id });
  for (const it of ITEM_LIST) out.push({ kind: 'item', id: it.id });
  for (const v of VITAMINS) out.push({ kind: 'vitamin', id: v.id });
  return out;
}

export interface ChestShow { el: HTMLElement; dispose(): void }

/**
 * Opening a treasure: the ball wobbles three times like a capture, pops open in its colour, and
 * each reward bursts out of it, shuffling through possible prizes in mid-air (tick, tick…) before
 * landing in its slot (ding). Players get at least a second to look once everything has landed;
 * after that a click or key moves on (`onDismiss`, solo), otherwise it moves on by itself.
 */
export function chestShow(rewards: ChestReward[], tier: ChestTier, onDismiss: (() => void) | null): ChestShow {
  const color = CHEST_COLOR[tier];
  const timing = chestTiming(rewards.length);
  const ballSrc = assets.itemUrl(CHEST_BALL[tier]);
  const ball = h('div', { class: 'ball' }, img(ballSrc, 'half bottom'), img(ballSrc, 'half top'), h('div', { class: 'ball-glow' }));
  const title = h('h3', null, tier === 4 ? 'MASTER BALL!' : `${CHEST_NAME[tier]}!`);
  const slots = rewards.map(() => {
    const win = h('div', { class: 'reel-window' });
    const lab = h('div', { class: 'reel-label-slot' });
    return { root: h('div', { class: 'reel' }, win, lab), win, lab, landed: false, flyer: null as HTMLElement | null };
  });
  const hint = h('div', { class: 'skip-hint' }, '');
  const coins = h('div', { class: 'coin-layer' });
  const panel = h('div', { class: `panel chest-panel tier-${tier}`, style: `--chest:${color}` },
    ball, title, h('div', { class: 'reels' }, slots.map((s) => s.root)), hint);
  const stars = h('div', { class: 'coin-layer' });
  const el = h('div', { class: 'chest-pop' }, stars, coins, panel);
  const pool = decoys();
  preloadChestFaces();
  const t0 = performance.now();
  let done = false, raf = 0, opened = false, wobbles = 0, revealAt = Infinity, lastT = t0;
  const coinBits: { el: HTMLElement; x: number; y: number; vx: number; vy: number }[] = [];
  const now = () => (performance.now() - t0) / 1000;

  const spawnCoins = (n: number) => {
    for (let i = 0; i < n; i++) {
      const c = h('i', { class: 'coin' });
      coins.append(c);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 380 + Math.random() * 420;
      coinBits.push({ el: c, x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
    }
  };

  /** Stars fly out of the ball for big hauls (3-4 rewards: 6, 5: 12); CSS does the motion. */
  const burstStars = () => {
    const n = rewards.length >= 5 ? 12 : rewards.length >= 3 ? 6 : 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const d = 110 + Math.random() * 70;
      const s = h('i', { class: 'star' }, '★');
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      stars.append(s);
    }
  };

  const open = () => {
    if (opened) return;
    opened = true;
    el.classList.add('opened');
    audio.sfx('reveal', rewards.length);
    burstStars();
    spawnCoins(10 + tier * 8);
  };

  const land = (i: number) => {
    const s = slots[i];
    if (s.landed) return;
    s.landed = true;
    s.flyer?.remove();
    s.flyer = null;
    s.win.replaceChildren(face(rewards[i]));
    s.root.classList.add('landed');
    if (rewards[i].kind === 'mastery') s.root.classList.add('mastery');
    s.lab.replaceChildren(label(rewards[i]));
    audio.sfx('ding', i);
    if (slots.every((x) => x.landed)) {
      revealAt = Math.min(revealAt, now());
      audio.sfx(rewards.some((x) => x.kind === 'mastery') ? 'mastery' : 'chest');
    }
  };

  /** Launch reward i out of the open ball along an arc into its slot. */
  const launch = (i: number, flight: number) => {
    const s = slots[i];
    const from = ball.getBoundingClientRect(), to = s.win.getBoundingClientRect(), base = panel.getBoundingClientRect();
    const fx = from.left + from.width / 2 - base.left, fy = from.top + from.height / 2 - base.top;
    const tx = to.left + to.width / 2 - base.left, ty = to.top + to.height / 2 - base.top;
    const fl = h('div', { class: 'flyer' }, face(pool[Math.floor(Math.random() * pool.length)]));
    fl.style.left = `${fx}px`;
    fl.style.top = `${fy}px`;
    panel.append(fl);
    s.flyer = fl;
    const peak = Math.min(fy, ty) - 70;
    fl.animate([
      { transform: 'translate(-50%,-50%) scale(0.2)' },
      { transform: `translate(calc(-50% + ${(tx - fx) * 0.5}px), calc(-50% + ${peak - fy}px)) scale(1.15)`, offset: 0.55 },
      { transform: `translate(calc(-50% + ${tx - fx}px), calc(-50% + ${ty - fy}px)) scale(1)` },
    ], { duration: flight * 1000, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
    audio.sfx('pop', i);
  };

  const frame = (ts: number) => {
    const t = (ts - t0) / 1000;
    const dt = Math.min(0.05, (ts - lastT) / 1000);
    lastT = ts;
    // three capture wobbles, each with a click
    while (!opened && wobbles < 3 && t >= 0.2 + wobbles * 0.45) { wobbles++; audio.sfx('wobble', wobbles); }
    if (!opened && t >= timing.open) open();
    if (opened) {
      slots.forEach((s, i) => {
        if (s.landed) return;
        const start = timing.open + 0.35 + 0.55 * i, end = start + 0.55;
        if (t >= end) return land(i);
        if (t >= start && !s.flyer) launch(i, end - start);
        // shuffle the in-flight face, slowing as it comes in to land
        const k = (t - start) / (end - start);
        if (s.flyer && Math.random() < 0.55 - 0.45 * k) {
          s.flyer.replaceChildren(face(pool[Math.floor(Math.random() * pool.length)]));
          audio.sfx('tick', i * 2 + k * 6);
        }
      });
    }
    // after everything lands: a second to look, then offer to continue (auto after 5 more)
    if (revealAt < Infinity) {
      const since = t - revealAt;
      const left = Math.max(1, Math.ceil(6 - since));
      hint.textContent = since < 1 ? '' : onDismiss ? `Click or press any key to continue (${left})` : `Continuing in ${left}…`;
      hint.classList.toggle('ready', since >= 1);
    }
    for (let i = coinBits.length - 1; i >= 0; i--) {
      const c = coinBits[i];
      c.vy += 1400 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
      if (c.y > 900) { c.el.remove(); coinBits.splice(i, 1); }
    }
    if (!done) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  /** Pressing early jumps straight to the result; a second after everything has landed, it moves on. */
  const press = () => {
    if (revealAt === Infinity) {
      open();
      slots.forEach((_, i) => land(i));
      return;
    }
    if (now() - revealAt >= 1) onDismiss?.();
  };
  const onKey = (e: KeyboardEvent) => { if (!e.repeat) press(); };
  el.addEventListener('pointerdown', press);
  window.addEventListener('keydown', onKey);
  return {
    el,
    dispose() {
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
