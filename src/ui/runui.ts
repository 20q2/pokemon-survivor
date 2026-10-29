import { MOVES, MASTERY_OF, MAX_MOVE_LEVEL, moveStatsAt, overLevelMult, type MoveStats } from '../data/moves.ts';
import { ITEMS, VITAMIN, vitaminDesc } from '../data/items.ts';
import { TYPE_COLORS } from '../data/types.ts';
import { assets } from '../render/assets.ts';
import type { ChestReward, Player, UpgradeOffer } from '../game/types.ts';
import type { RunSession } from '../game/session.ts';
import { audio } from '../audio/audio.ts';
import { btn, cap, h, img, typeBadge } from './dom.ts';

const BEHAVIOR_TEXT: Record<string, string> = {
  projectile: 'Projectile', melee: 'Melee swipe', orbit: 'Orbits you', aura: 'Aura', nova: 'Shockwave', beam: 'Beam',
  strike: 'Strikes from above', zone: 'Hazard', boomerang: 'Boomerang', chain: 'Chains', trail: 'Trail', cone: 'Spray',
  wave: 'Sweeping wave', buff: 'Self buff', lob: 'Explosive lob',
};

const STAT_LABEL: Partial<Record<keyof MoveStats, string>> = {
  power: 'power', count: 'amount', area: 'area', cd: 'cooldown', pierce: 'pierce', duration: 'duration', speed: 'speed', range: 'range',
};

function upgradeDiff(id: string, level: number): string {
  const def = MOVES[id];
  const a = moveStatsAt(def, level - 1), b = moveStatsAt(def, level);
  const parts: string[] = [];
  for (const k of Object.keys(STAT_LABEL) as (keyof MoveStats)[]) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-6) continue;
    if (k === 'cd') parts.push(`${Math.round((1 - b.cd / a.cd) * 100)}% faster`);
    else if (k === 'area' || k === 'duration' || k === 'range' || k === 'speed') parts.push(`+${Math.round((b[k] / a[k] - 1) * 100)}% ${STAT_LABEL[k]}`);
    else parts.push(`+${Math.round(d)} ${STAT_LABEL[k]}`);
  }
  return parts.join(', ') || 'Stronger';
}

function moveIcon(id: string) {
  const def = MOVES[id];
  return h('div', { class: 'ic', style: `background:${TYPE_COLORS[def.type]}` }, h('div', { class: 'ab' }, def.name.split(/[\s-]/).map((w) => w.slice(0, 4)).join('\n').toUpperCase()));
}

export function offerCard(o: UpgradeOffer, p: Player, index: number, onPick: () => void) {
  let icon: HTMLElement, name: string, tag: string, desc: string;
  let meta: HTMLElement | null = null;
  let note = '';
  switch (o.kind) {
    case 'newMove':
    case 'moveUp': {
      const def = MOVES[o.id];
      icon = moveIcon(o.id);
      name = def.name;
      const limit = o.kind === 'moveUp' && o.level > MAX_MOVE_LEVEL;
      tag = o.kind === 'newMove' ? 'NEW MOVE' : limit ? `LIMIT ★${o.level - MAX_MOVE_LEVEL}` : `Lv ${o.level}`;
      desc = o.kind === 'newMove' ? def.desc : limit
        ? `Limit break: +${Math.round((overLevelMult(o.level) / overLevelMult(o.level - 1) - 1) * 100)}% power.`
        : upgradeDiff(o.id, o.level);
      meta = h('div', { class: 'meta' }, typeBadge(def.type), h('span', { class: `cat ${def.cat}` }, cap(def.cat)), h('span', { class: 'hint' }, BEHAVIOR_TEXT[def.behavior]));
      if (p.types.includes(def.type) && def.cat !== 'status') note = 'STAB ×1.5';
      const mast = MASTERY_OF[o.id];
      if (mast && o.kind === 'moveUp' && o.level === MAX_MOVE_LEVEL) note = `Max! Hold ${ITEMS[mast.mastery!.item].name} to master`;
      break;
    }
    case 'newItem':
    case 'itemUp': {
      const def = ITEMS[o.id];
      icon = h('div', { class: 'ic', style: 'background:#fff' }, img(assets.itemUrl(o.id)));
      name = def.name;
      tag = o.kind === 'newItem' ? 'NEW ITEM' : `Lv ${o.level}`;
      desc = def.desc(o.level);
      const masters = p.moves.map((m) => MASTERY_OF[m.id]).find((m) => m?.mastery?.item === o.id);
      if (masters) note = `Mastery: ${MOVES[masters.mastery!.from].name} → ${masters.name}`;
      break;
    }
    case 'heal':
      icon = h('div', { class: 'ic', style: 'background:#fff' }, img(assets.itemUrl('oran-berry')));
      name = 'Oran Berry'; tag = 'HEAL'; desc = 'Restore 30% of your max HP.';
      break;
    default:
      icon = h('div', { class: 'ic', style: 'background:#fff' }, img(assets.itemUrl(o.id)));
      name = VITAMIN[o.id].name; tag = o.level > 1 ? `×${o.level}` : 'VITAMIN'; desc = vitaminDesc(o.id, o.level);
  }
  return h('button', { class: 'panel card', 'data-nav': true, onclick: () => { audio.sfx('select'); onPick(); } },
    h('span', { class: 'key' }, String(index + 1)),
    icon,
    h('div', { class: `tag${o.kind.startsWith('new') ? ' new' : ''}` }, tag),
    h('div', { class: 'nm' }, name),
    meta,
    h('div', { class: 'ds' }, desc),
    note ? h('div', { class: 'stab' }, note) : null,
  );
}

/** Level-up overlay; rebuilt whenever the offers change. */
export class LevelUpUI {
  el: HTMLElement | null = null;
  private shownFor: UpgradeOffer[] | null = null;
  private shownSig = '';
  private banishMode = false;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private session: RunSession | null = null;

  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener('keydown', this.keyHandler);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.el || !this.session || !this.shownFor) return;
    const n = Number(e.key);
    if (n >= 1 && n <= this.shownFor.length) this.pick(n - 1);
    if (e.code === 'KeyR') this.session.reroll();
  }

  private pick(i: number) {
    if (!this.session) return;
    if (this.banishMode) { this.session.banish(i); this.banishMode = false; }
    else this.session.choose(i);
  }

  sync(session: RunSession) {
    this.session = session;
    const phase = session.phase();
    const offers = session.offers();
    if (phase !== 'levelup') return this.close();
    // Offers arrive as fresh arrays every network tick: compare by content.
    if (offers && this.el && this.shownSig === JSON.stringify(offers) && this.shownFor) return;
    if (!offers) {
      // waiting for teammates
      const waiting = session.waitingOn();
      const text = waiting.length ? `Waiting for ${waiting.join(', ')}…` : '';
      if (this.el && !this.shownFor && this.el.dataset.w === text) return;
      this.close();
      this.el = h('div', { class: 'levelup' }, h('div', { class: 'waiting' }, text));
      this.el.dataset.w = text;
      this.root.appendChild(this.el);
      return;
    }
    this.close();
    this.shownFor = offers;
    this.shownSig = JSON.stringify(offers);
    const me = session.world.players[session.localId];
    audio.sfx('levelup');
    const cards = h('div', { class: 'cards' }, offers.map((o, i) => offerCard(o, me, i, () => this.pick(i))));
    if (this.banishMode) cards.querySelectorAll('.card').forEach((c) => c.classList.add('banish-mode'));
    const actions = h('div', { class: 'lu-actions' },
      me.rerolls > 0 ? btn(`Reroll (${me.rerolls})`, () => session.reroll(), 'small') : null,
      me.skips > 0 ? btn(`Skip (${me.skips})`, () => session.skip(), 'small') : null,
      me.banishes > 0 ? btn(this.banishMode ? 'Cancel banish' : `Banish (${me.banishes})`, () => {
        this.banishMode = !this.banishMode;
        this.shownSig = '';
        this.sync(session);
      }, 'small') : null,
    );
    const build = h('div', { class: 'lu-build' },
      ...me.moves.map((m) => h('span', { class: 'type', style: `background:${TYPE_COLORS[MOVES[m.id].type]}` }, `${MOVES[m.id].name} ${MOVES[m.id].mastery ? '★' : m.level}`)),
      ...me.items.map((it) => h('span', { class: 'lu-item' }, img(assets.itemUrl(it.id)), String(it.level))),
    );
    this.el = h('div', { class: 'levelup' },
      h('h2', null, this.banishMode ? 'Banish which?' : `Level ${session.world.level}!`),
      cards,
      actions,
      build,
    );
    this.root.appendChild(this.el);
    (cards.firstElementChild as HTMLElement | null)?.focus();
  }

  close() {
    this.el?.remove();
    this.el = null;
    this.shownFor = null;
    this.shownSig = '';
  }
}

export function chestPopup(rewards: ChestReward[]): HTMLElement {
  const rows = rewards.map((r, i) => {
    const delay = `animation-delay:${0.5 + i * 0.25}s`;
    if (r.kind === 'mastery') {
      const to = MOVES[r.id];
      return h('div', { class: 'rw mastery', style: delay }, `${MOVES[r.from!].name} → ${to.name}!`);
    }
    if (r.kind === 'move') return h('div', { class: 'rw', style: delay }, h('span', { class: 'type', style: `background:${TYPE_COLORS[MOVES[r.id].type]}` }, 'move'), `${MOVES[r.id].name} Lv ${r.level}`);
    if (r.kind === 'item') return h('div', { class: 'rw', style: delay }, img(assets.itemUrl(r.id)), `${ITEMS[r.id].name} Lv ${r.level}`);
    return h('div', { class: 'rw', style: delay }, img(assets.itemUrl(r.id)), `${VITAMIN[r.id].name} ×${r.level}`);
  });
  const mastery = rewards.some((r) => r.kind === 'mastery');
  return h('div', { class: 'chest-pop' }, h('div', { class: 'panel' },
    img(assets.itemUrl(mastery ? 'master-ball' : 'poke-ball'), 'chest-ball'),
    h('h3', null, mastery ? 'MOVE MASTERED!' : 'Treasure!'),
    rows,
  ));
}
