import { MAX_MOVE_LEVEL, MOVES, moveStatsAt } from '../data/moves.ts';
import { ITEMS, VITAMIN, vitaminBonus } from '../data/items.ts';
import { TYPE_COLORS } from '../data/types.ts';
import { assets } from '../render/assets.ts';
import type { Player } from '../game/types.ts';
import { catBadge, h, img, typeBadge, uiIcon } from './dom.ts';

/**
 * Hover tooltips for moves, items and vitamins, shared by the HUD and the level-up screen's
 * build panel. One floating PMD-style window, positioned beside whatever is hovered.
 */

export const BEHAVIOR_TEXT: Record<string, string> = {
  projectile: 'Projectile', melee: 'Melee swipe', orbit: 'Orbits you', aura: 'Aura', nova: 'Shockwave', beam: 'Beam',
  strike: 'Strikes from above', zone: 'Hazard', boomerang: 'Boomerang', chain: 'Chains', trail: 'Trail', cone: 'Spray',
  wave: 'Sweeping wave', buff: 'Self buff', lob: 'Explosive lob',
};

let tipEl: HTMLDivElement | null = null;
let current: { anchor: HTMLElement; content: () => HTMLElement } | null = null;

function tip(): HTMLDivElement {
  if (!tipEl) {
    tipEl = h('div', { class: 'hud-tip hidden' });
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function show() {
  if (!current) return;
  const t = tip();
  t.replaceChildren(current.content());
  t.classList.remove('hidden');
  const r = current.anchor.getBoundingClientRect();
  const w = t.offsetWidth, hgt = t.offsetHeight;
  let x = r.right + 10, y = r.top;
  if (x + w > window.innerWidth - 8) x = r.left - w - 10;
  if (x < 8) { x = Math.max(8, r.left); y = r.bottom + 8; }
  if (y + hgt > window.innerHeight - 8) y = Math.max(8, r.top - hgt - 8);
  t.style.left = `${Math.round(x)}px`;
  t.style.top = `${Math.round(y)}px`;
}

export function hideTip() {
  current = null;
  tipEl?.classList.add('hidden');
}

/** Make `el` show `content()` in the shared tooltip while hovered (or long-pressed on touch). */
export function tipped<T extends HTMLElement>(el: T, content: () => HTMLElement): T {
  el.classList.add('tippable');
  el.addEventListener('pointerenter', () => { current = { anchor: el, content }; show(); });
  el.addEventListener('pointerleave', () => { if (current?.anchor === el) hideTip(); });
  el.addEventListener('pointerdown', () => { current = { anchor: el, content }; show(); });
  return el;
}

export function moveTip(me: Player, id: string): HTMLElement {
  const def = MOVES[id];
  const m = me.moves.find((x) => x.id === id);
  const lvl = m?.level ?? 1;
  const st = moveStatsAt(def, lvl);
  const stab = me.types.includes(def.type) && def.cat !== 'status';
  const facts: string[] = [];
  if (st.power) facts.push(`Power ${Math.round(st.power)}`);
  facts.push(`Every ${(st.cd * (me.stats?.cooldown ?? 1)).toFixed(2)}s`);
  if (st.count > 1) facts.push(`×${Math.round(st.count + (me.stats?.countBonus ?? 0))}`);
  return h('div', null,
    h('b', null, def.mastery ? img(uiIcon('mastery'), 'mastery-mark') : null, def.name, ' ',
      h('span', { class: 'lvl' }, def.mastery ? 'MASTERED' : lvl > MAX_MOVE_LEVEL ? `Lv ${MAX_MOVE_LEVEL} ★${lvl - MAX_MOVE_LEVEL}` : `Lv ${lvl}`)),
    h('div', { class: 'meta' }, typeBadge(def.type), catBadge(def.cat), h('span', null, BEHAVIOR_TEXT[def.behavior])),
    h('p', null, def.desc),
    h('p', { class: 'facts' }, facts.join(' · ') + (stab ? ' · STAB ×1.5' : '')),
    m ? h('p', { class: 'facts' }, `Dealt ${Math.round(m.dmgDealt).toLocaleString()} · ${m.kills.toLocaleString()} KOs`) : null,
  );
}

export function itemTip(me: Player, id: string): HTMLElement {
  const def = ITEMS[id];
  const lvl = me.items.find((x) => x.id === id)?.level ?? 1;
  return h('div', null, h('b', null, def.name, ' ', h('span', { class: 'lvl' }, `Lv ${lvl}`)), h('p', null, def.desc(lvl)));
}

export function vitaminTip(id: string, n: number): HTMLElement {
  return h('div', null, h('b', null, VITAMIN[id].name), h('p', null, `+${Math.round(vitaminBonus(id, n) * 100)}% ${VITAMIN[id].what} from ${n} dose${n === 1 ? '' : 's'}.`));
}

/** A move slot: type symbol on a tinted tile, abbreviated name and level. */
export function moveSlot(me: Player, id: string, level: number, cls = 'slot move'): HTMLElement {
  const def = MOVES[id];
  const lvText = def.mastery ? '★' : level > MAX_MOVE_LEVEL ? `★${level - MAX_MOVE_LEVEL}` : String(level);
  return tipped(h('div', { class: `${cls}${def.mastery ? ' mastered' : ''}`, style: `--tc:${TYPE_COLORS[def.type]}` },
    img(uiIcon(`logo/${def.type}`), 'logo'), h('div', { class: 'ab' }, moveAbbr(def.name)), h('div', { class: 'lv' }, lvText)), () => moveTip(me, id));
}

export function itemSlot(me: Player, id: string, level: number, cls = 'slot item'): HTMLElement {
  return tipped(h('div', { class: cls }, img(assets.itemUrl(id)), h('div', { class: 'lv' }, level)), () => itemTip(me, id));
}

export const moveAbbr = (name: string) => name.split(/[\s-]/).map((w) => w.slice(0, 3)).join(' ').slice(0, 7).toUpperCase();

/** The current build: moves, held items and vitamins, each hoverable. Used on the level-up screen. */
export function buildPanel(me: Player): HTMLElement {
  const moves = h('div', { class: 'bp-row' }, ...Array.from({ length: me.moveSlots }, (_, i) => {
    const m = me.moves[i];
    return m ? moveSlot(me, m.id, m.level, 'slot move big') : h('div', { class: 'slot empty big' });
  }));
  const items = h('div', { class: 'bp-row' }, ...Array.from({ length: me.itemSlots }, (_, i) => {
    const it = me.items[i];
    return it ? itemSlot(me, it.id, it.level, 'slot item big') : h('div', { class: 'slot empty big' });
  }));
  const vits = Object.entries(me.vitamins).filter(([, n]) => n > 0);
  return h('div', { class: 'panel build-panel' },
    h('div', { class: 'bp-title' }, 'Moves'), moves,
    h('div', { class: 'bp-title' }, 'Held items'), items,
    vits.length ? h('div', { class: 'bp-row vits' }, ...vits.map(([id, n]) => tipped(h('div', { class: 'vit' }, img(assets.itemUrl(id)), h('span', null, `×${n}`)), () => vitaminTip(id, n)))) : null,
  );
}
