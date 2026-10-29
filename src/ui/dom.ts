import { TYPE_COLORS, type PType } from '../data/types.ts';
import { audio } from '../audio/audio.ts';

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

export function typeBadge(t: PType) {
  return h('span', { class: 'type', style: `background:${TYPE_COLORS[t]}` }, t);
}

export function img(src: string, cls = 'px', alt = '') {
  return h('img', { src, class: cls, alt, draggable: 'false', loading: 'lazy' });
}

export function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
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
export function banner(text: string, boss = false, ms = 2600) {
  const box = document.getElementById('banner')!;
  box.innerHTML = '';
  box.appendChild(h('div', { class: `dialog${boss ? ' boss' : ''}` }, text));
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => { box.innerHTML = ''; }, ms);
}
