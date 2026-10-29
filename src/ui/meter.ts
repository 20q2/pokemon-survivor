import { MOVES } from '../data/moves.ts';
import { TYPE_COLORS, type PType } from '../data/types.ts';
import { assets } from '../render/assets.ts';
import type { Ledger } from '../game/ledger.ts';
import type { Player } from '../game/types.ts';
import { h, img, uiIcon } from './dom.ts';

export type MeterTab = keyof Ledger;

const TABS: { id: MeterTab; label: string }[] = [
  { id: 'dmg', label: 'Damage' },
  { id: 'boss', label: 'Boss' },
  { id: 'heal', label: 'Healing' },
];

/** Names and icons for sources that aren't moves. */
const SPECIAL: Record<string, { name: string; item?: string; type?: PType; ui?: string }> = {
  burn: { name: 'Burn', type: 'fire' },
  poison: { name: 'Poison', type: 'poison' },
  thorns: { name: 'Rocky Helmet', item: 'rocky-helmet' },
  static: { name: 'Static', type: 'electric' },
  synchronize: { name: 'Synchronize', type: 'psychic' },
  explosion: { name: 'Chain explosions', type: 'normal' },
  'mega-burst': { name: 'Mega burst', ui: 'mega' },
  'sand-stream': { name: 'Sand Stream', type: 'rock' },
  regen: { name: 'Regeneration', item: 'leftovers' },
  lifesteal: { name: 'Shell Bell', item: 'shell-bell' },
  drain: { name: 'Draining', type: 'grass' },
  buff: { name: 'Healing buff', type: 'water' },
  oran: { name: 'Oran Berry', item: 'oran-berry' },
  sitrus: { name: 'Sitrus Berry', item: 'sitrus-berry' },
  revive: { name: 'Revive', item: 'revive' },
  evolve: { name: 'Evolution', item: 'moon-stone' },
  mega: { name: 'Mega Evolution', ui: 'mega' },
  skip: { name: 'Escape Rope', item: 'escape-rope' },
  'hp-up': { name: 'HP Up', item: 'hp-up' },
};

function source(src: string): { name: string; icon: HTMLElement } {
  const mv = MOVES[src];
  if (mv) return { name: mv.name, icon: typeIcon(mv.type) };
  const s = SPECIAL[src];
  if (!s) return { name: src, icon: typeIcon('normal') };
  if (s.item) return { name: s.name, icon: img(assets.itemUrl(s.item), 'm-ic item') };
  if (s.ui) return { name: s.name, icon: img(uiIcon(s.ui), 'm-ic item') };
  return { name: s.name, icon: typeIcon(s.type ?? 'normal') };
}

function typeIcon(t: PType) {
  return h('span', { class: 'm-ic type', style: `--tc:${TYPE_COLORS[t]}` }, img(uiIcon(`logo/${t}`)));
}

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

/**
 * The damage tracker: who (which move, status or item) did how much — total damage, damage to
 * bosses, or healing — with a share bar per source, like a raid meter. Toggled with T.
 */
export class DamageMeter {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private foot: HTMLElement;
  private tabEls = new Map<MeterTab, HTMLElement>();
  tab: MeterTab = 'dmg';
  onTab: ((t: MeterTab) => void) | null = null;

  constructor() {
    const tabs = h('div', { class: 'm-tabs' }, TABS.map((t) => {
      const b = h('button', { class: 'm-tab', onclick: () => this.setTab(t.id) }, t.label);
      this.tabEls.set(t.id, b);
      return b;
    }));
    this.body = h('div', { class: 'm-rows' });
    this.foot = h('div', { class: 'm-foot' });
    this.el = h('div', { class: 'panel meter hidden' }, tabs, this.body, this.foot);
    this.setTab('dmg');
  }

  setTab(t: MeterTab) {
    this.tab = t;
    for (const [id, el] of this.tabEls) el.classList.toggle('on', id === t);
    this.onTab?.(t);
  }

  show(on: boolean) {
    this.el.classList.toggle('hidden', !on);
  }

  get visible() {
    return !this.el.classList.contains('hidden');
  }

  update(me: Player, time: number, maxRows = 8) {
    const data = me.ledger?.[this.tab] ?? {};
    const rows = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((a, [, v]) => a + v, 0);
    const top = rows[0]?.[1] ?? 1;
    this.body.replaceChildren(...(rows.length
      ? rows.slice(0, maxRows).map(([src, v]) => {
        const s = source(src);
        return h('div', { class: 'm-row' },
          h('div', { class: 'm-bar', style: `width:${((v / top) * 100).toFixed(1)}%` }),
          s.icon, h('span', { class: 'm-name' }, s.name),
          h('span', { class: 'm-val' }, fmt(v)), h('span', { class: 'm-pct' }, `${Math.round((v / total) * 100)}%`));
      })
      : [h('div', { class: 'm-empty' }, this.tab === 'boss' ? 'No boss damage yet.' : this.tab === 'heal' ? 'No healing yet.' : 'No damage yet.')]));
    const perSec = time > 1 ? total / time : 0;
    this.foot.textContent = `Total ${fmt(total)} · ${fmt(perSec)}/s${rows.length > maxRows ? ` · +${rows.length - maxRows} more` : ''}`;
  }
}
