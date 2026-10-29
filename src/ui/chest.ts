import { MOVES, MOVE_LIST } from '../data/moves.ts';
import { ITEMS, ITEM_LIST, VITAMIN, VITAMINS } from '../data/items.ts';
import { assets } from '../render/assets.ts';
import { audio } from '../audio/audio.ts';
import { CHEST_BALL, CHEST_COLOR, CHEST_NAME, type ChestReward, type ChestTier } from '../game/types.ts';
import { TYPE_COLORS } from '../data/types.ts';
import { h, img, uiIcon } from './dom.ts';

/** Seconds into the show at which the ball bursts open and the reels start spinning. */
const POP_AT = 0.9;
const reelStop = (i: number) => POP_AT + 0.65 + 0.55 * i;

type Face = { kind: ChestReward['kind']; id: string };

function face(f: Face): HTMLElement {
  if (f.kind === 'move' || f.kind === 'mastery') {
    const t = MOVES[f.id].type;
    return h('div', { class: 'reel-face tm', style: `--tc:${TYPE_COLORS[t]}` }, img(assets.itemUrl(`tm-${t}`)));
  }
  return h('div', { class: 'reel-face item' }, img(assets.itemUrl(f.id)));
}

function label(r: ChestReward): HTMLElement {
  if (r.kind === 'mastery') return h('div', { class: 'reel-label mastery' }, img(uiIcon('mastery'), 'mastery-mark'), `${MOVES[r.from!].name} → ${MOVES[r.id].name}!`);
  if (r.kind === 'move') return h('div', { class: 'reel-label' }, MOVES[r.id].name, h('span', null, r.level === 1 ? 'NEW' : `Lv ${r.level}`));
  if (r.kind === 'item') return h('div', { class: 'reel-label' }, ITEMS[r.id].name, h('span', null, r.level === 1 ? 'NEW' : `Lv ${r.level}`));
  return h('div', { class: 'reel-label' }, VITAMIN[r.id].name, h('span', null, `×${r.level}`));
}

/** Random faces for the spinning reels: things you could plausibly have won. */
function decoys(): Face[] {
  const out: Face[] = [];
  for (const m of MOVE_LIST) if (!m.mastery) out.push({ kind: 'move', id: m.id });
  for (const it of ITEM_LIST) out.push({ kind: 'item', id: it.id });
  for (const v of VITAMINS) out.push({ kind: 'vitamin', id: v.id });
  return out;
}

export interface ChestShow { el: HTMLElement; finish(): void; dispose(): void }

/**
 * The treasure "slot machine": the ball wobbles like a capture, bursts in its colour, then one
 * reel per reward spins through possible prizes, slows down and lands — tick, tick, ding —
 * while coins fountain up. Click or press a key to skip (solo).
 */
export function chestShow(rewards: ChestReward[], tier: ChestTier, onSkip: (() => void) | null): ChestShow {
  const color = CHEST_COLOR[tier];
  const ball = img(assets.itemUrl(CHEST_BALL[tier]), 'chest-ball');
  const title = h('h3', null, tier === 4 ? 'MASTER BALL!' : `${CHEST_NAME[tier]}!`);
  const reels = rewards.map(() => {
    const win = h('div', { class: 'reel-window' });
    const lab = h('div', { class: 'reel-label-slot' });
    return { root: h('div', { class: 'reel' }, win, lab), win, lab, last: 0, landed: false };
  });
  const coins = h('div', { class: 'coin-layer' });
  const panel = h('div', { class: `panel chest-panel tier-${tier}`, style: `--chest:${color}` },
    ball, title, h('div', { class: 'reels' }, reels.map((r) => r.root)),
    onSkip ? h('div', { class: 'skip-hint' }, 'Click or press any key to skip') : null);
  const el = h('div', { class: 'chest-pop' }, coins, panel);
  const pool = decoys();
  const t0 = performance.now();
  let popped = false, done = false, raf = 0;
  const coinBits: { el: HTMLElement; x: number; y: number; vx: number; vy: number }[] = [];

  const spawnCoins = (n: number) => {
    for (let i = 0; i < n; i++) {
      const c = h('i', { class: 'coin' });
      coins.append(c);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 380 + Math.random() * 420;
      coinBits.push({ el: c, x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
    }
  };

  const land = (i: number) => {
    const r = reels[i];
    if (r.landed) return;
    r.landed = true;
    r.win.replaceChildren(face(rewards[i]));
    r.root.classList.add('landed');
    if (rewards[i].kind === 'mastery') r.root.classList.add('mastery');
    r.lab.replaceChildren(label(rewards[i]));
    audio.sfx('ding', i);
    if (i === reels.length - 1) audio.sfx(rewards.some((x) => x.kind === 'mastery') ? 'mastery' : 'chest');
  };

  let lastT = t0;
  const frame = (now: number) => {
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (!popped && t >= POP_AT) {
      popped = true;
      el.classList.add('popped');
      audio.sfx('reveal', tier);
      spawnCoins(10 + tier * 8);
    }
    if (popped) {
      reels.forEach((r, i) => {
        if (r.landed) return;
        const stop = reelStop(i);
        if (t >= stop) return land(i);
        // spin fast, then decelerate into the stop
        const k = Math.max(0, Math.min(1, (t - POP_AT) / (stop - POP_AT)));
        const interval = 0.045 + 0.2 * k * k * k;
        if (t - r.last >= interval) {
          r.last = t;
          r.win.replaceChildren(face(pool[Math.floor(Math.random() * pool.length)]));
          audio.sfx('tick', i * 2 + k * 6);
        }
      });
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

  const finish = () => {
    if (!popped) { popped = true; el.classList.add('popped'); spawnCoins(10 + tier * 8); }
    reels.forEach((_, i) => land(i));
  };
  const skip = () => { if (!onSkip) return; finish(); onSkip(); };
  const onKey = () => skip();
  if (onSkip) {
    el.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', onKey);
  }
  return {
    el,
    finish,
    dispose() {
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
