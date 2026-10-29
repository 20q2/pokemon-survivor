import type { PType } from '../data/types.ts';
import { audio } from '../audio/audio.ts';
import { ASSET_BASE } from '../render/assets.ts';
import type { Category } from '../data/moves.ts';
import { MOVES } from '../data/moves.ts';
import { moveLook } from './movelook.ts';

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string; style?: string; onclick?: (e: MouseEvent) => void };

/** Tiny hyperscript helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  const add = (c: Child) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export function btn(label: Child, onClick: () => void, cls = '', attrs: Attrs = {}) {
  return h('button', {
    class: `btn ${cls}`,
    ...attrs,
    onclick: () => { audio.sfx('select'); onClick(); },
  }, label);
}

/** Pixel type plate (Gen 6 style) used everywhere a type is named. */
export function typeBadge(t: PType) {
  return h('img', { class: 'type-plate', src: `${ASSET_BASE}ui/plate/${t}.png`, alt: t, title: cap(t), draggable: 'false' });
}

/** Physical / Special / Status move-category icon. */
export function catBadge(c: Category) {
  return h('img', { class: 'cat-icon', src: `${ASSET_BASE}ui/cat/${c}.png`, alt: c, title: cap(c), draggable: 'false' });
}

/** A move's icon: its type symbol on a tile in the move's own look (see movelook.ts). */
export function moveIcon(id: string, label: string, cls = 'move-ic') {
  const type = MOVES[id].type;
  const look = moveLook(id);
  return h('div', { class: `${cls} ${look.cls}`, style: look.style },
    h('img', { src: `${ASSET_BASE}ui/logo/${type}.png`, alt: type, draggable: 'false' }),
    label ? h('span', { class: 'ab' }, label) : null);
}

/** A move as a TM disc (sized by category) on its own patterned tile, with its type symbol in the corner. */
export function moveDisc(id: string, cls: string, eager = false) {
  const type = MOVES[id].type;
  const look = moveLook(id);
  const pic = (src: string, c: string) => h('img', { src, class: c, draggable: 'false', ...(eager ? {} : { loading: 'lazy' }) });
  return h('div', { class: `${cls} ${look.cls}`, style: look.style },
    pic(`${ASSET_BASE}items/tm-${type}.png`, 'px disc'), pic(`${ASSET_BASE}ui/logo/${type}.png`, 'corner'));
}

/** A small round-cornered move badge (damage meter). */
export function moveBadge(id: string) {
  const type = MOVES[id].type;
  const look = moveLook(id);
  return h('span', { class: `m-ic type ${look.cls}`, style: look.style }, h('img', { src: `${ASSET_BASE}ui/logo/${type}.png`, draggable: 'false' }));
}

export const moveAbbr = (name: string) => name.split(/[\s-]/).map((w) => w.slice(0, 4)).join(' ').toUpperCase();

export const uiIcon = (name: string) => `${ASSET_BASE}ui/${name}.png`;

export function img(src: string, cls = 'px', alt = '') {
  return h('img', { src, class: cls, alt, draggable: 'false', loading: 'lazy' });
}

export function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** True when the whole-minute count differs; prev < 0 means no sample yet. */
export function minuteFlipped(prev: number, cur: number) {
  return prev >= 0 && Math.floor(cur / 60) !== Math.floor(prev / 60);
}

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─────────────────────────── focus navigation ───────────────────────────

const FOCUSABLE = 'button:not(:disabled), [data-nav], input, textarea';

/**
 * Arrow keys / d-pad move focus spatially between visible buttons in the top-most layer,
 * Enter/Space/A activate, Escape/B triggers [data-back]. Mouse and touch still work normally.
 */
export class MenuNav {
  private padHeld = new Map<string, number>();
  enabled = true;

  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || !this.layer()) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !['Escape', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] }[e.code];
      if (dir) { e.preventDefault(); this.move(dir[0], dir[1]); }
      else if (e.key === 'Escape') this.back();
    });
  }

  /** The active layer = last child of #ui that contains focusables. */
  layer(): HTMLElement | null {
    const kids = Array.from(this.root.children) as HTMLElement[];
    for (let i = kids.length - 1; i >= 0; i--) {
      if (kids[i].classList.contains('hidden')) continue;
      if (kids[i].querySelector(FOCUSABLE)) return kids[i];
    }
    return null;
  }

  private items(): HTMLElement[] {
    const layer = this.layer();
    if (!layer) return [];
    return (Array.from(layer.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter((el) => el.offsetParent !== null);
  }

  focusFirst() {
    const layer = this.layer();
    const pref = layer?.querySelector('[data-autofocus]') as HTMLElement | null;
    (pref ?? this.items()[0])?.focus({ preventScroll: false });
  }

  move(dx: number, dy: number) {
    const items = this.items();
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement;
    if (!items.includes(cur)) { this.focusFirst(); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bs = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const ddx = bx - ax, ddy = by - ay;
      const along = ddx * dx + ddy * dy;
      if (along <= 4) continue;
      const across = Math.abs(ddx * dy) + Math.abs(ddy * dx);
      const score = along + across * 2.2;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      audio.sfx('click');
    }
  }

  back() {
    const layer = this.layer();
    const b = layer?.querySelector('[data-back]') as HTMLElement | null;
    b?.click();
  }

  /** Called every frame: gamepad d-pad / stick / A / B with key-repeat. */
  pollPads(dt: number) {
    if (!this.enabled || !this.layer()) return;
    const pads = navigator.getGamepads?.() ?? [];
    const state: Record<string, boolean> = {};
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      state.up ||= !!p.buttons[12]?.pressed || ay < -0.6;
      state.down ||= !!p.buttons[13]?.pressed || ay > 0.6;
      state.left ||= !!p.buttons[14]?.pressed || ax < -0.6;
      state.right ||= !!p.buttons[15]?.pressed || ax > 0.6;
      state.a ||= !!p.buttons[0]?.pressed;
      state.b ||= !!p.buttons[1]?.pressed;
    }
    for (const [k, down] of Object.entries(state)) {
      const held = this.padHeld.get(k) ?? -1;
      if (!down) { this.padHeld.delete(k); continue; }
      const fire = held < 0 || held > 0.35;
      this.padHeld.set(k, held < 0 ? 0 : held > 0.35 ? 0.25 : held + dt);
      if (!fire) continue;
      if (k === 'up') this.move(0, -1);
      if (k === 'down') this.move(0, 1);
      if (k === 'left') this.move(-1, 0);
      if (k === 'right') this.move(1, 0);
      if (k === 'a' && held < 0) (document.activeElement as HTMLElement | null)?.click();
      if (k === 'b' && held < 0) this.back();
    }
  }
}

export function toast(title: string, text: string, icon?: string) {
  const el = h('div', { class: 'toast' }, icon ? img(icon) : null, h('div', null, h('b', null, title), text));
  const box = document.getElementById('toasts')!;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

let bannerTimer = 0;
function showBanner(dialog: HTMLElement, ms: number) {
  const box = document.getElementById('banner')!;
  box.replaceChildren(dialog);
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => box.replaceChildren(), ms);
}

export function banner(text: string, boss = false, ms = 2600) {
  showBanner(h('div', { class: `dialog${boss ? ' boss' : ''}` }, text), ms);
}

/** Minute-change banner: species sprite plus a line, styled apart from the red alert banner.
 *  Lowest priority: it never replaces a banner already showing (boss, warn, mega stone...);
 *  the wave sting still plays, so the minute is still marked. */
export function waveBanner(text: string, sprite: string, ms = 2200) {
  const cur = document.querySelector('#banner .dialog');
  if (cur && !cur.classList.contains('wave')) return;
  showBanner(h('div', { class: 'dialog wave' }, img(sprite, 'px'), text), ms);
}

/** Quiet one-line notice under the banner; never replaces or blocks it. */
let noticeTimer = 0;
export function notice(text: string, ms = 2800) {
  const box = document.getElementById('notice')!;
  box.replaceChildren(h('div', { class: 'notice' }, text));
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => box.replaceChildren(), ms);
}
