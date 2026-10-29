import { MAX_MOVE_LEVEL, MOVES, moveStatsAt } from '../data/moves.ts';
import { ITEMS, VITAMIN, vitaminBonus } from '../data/items.ts';
import { MEGA, SPECIES } from '../data/pokedex.ts';
import { TYPE_COLORS } from '../data/types.ts';
import { assets } from '../render/assets.ts';
import type { RunSession } from '../game/session.ts';
import type { Player } from '../game/types.ts';
import { RUN_LENGTH } from '../data/stages.ts';
import { cap, fmtTime, h, img, typeBadge } from './dom.ts';
import { Minimap } from './minimap.ts';
import { MEGA_DURATION } from '../game/mega.ts';

const BEHAVIOR_TEXT: Record<string, string> = {
  projectile: 'Projectile', melee: 'Melee swipe', orbit: 'Orbits you', aura: 'Aura', nova: 'Shockwave', beam: 'Beam',
  strike: 'Strikes from above', zone: 'Hazard', boomerang: 'Boomerang', chain: 'Chains', trail: 'Trail', cone: 'Spray',
  wave: 'Sweeping wave', buff: 'Self buff', lob: 'Explosive lob',
};

const ABBR = (name: string) => name.split(/[\s-]/).map((w) => w.slice(0, 3)).join(' ').slice(0, 7).toUpperCase();

export class Hud {
  private el: HTMLElement;
  private xpFill!: HTMLDivElement;
  private lv!: HTMLDivElement;
  private timer!: HTMLDivElement;
  private stats!: HTMLDivElement;
  private left!: HTMLDivElement;
  private boss!: HTMLDivElement;
  private fps!: HTMLDivElement;
  private mega!: HTMLDivElement;
  private megaFill!: HTMLDivElement;
  private megaLabel!: HTMLDivElement;
  private tip!: HTMLDivElement;
  private minimap = new Minimap();
  private tipFor: (() => HTMLElement) | null = null;
  private textT = 0;
  private sig = '';
  private hpBars = new Map<number, HTMLDivElement>();
  private cdEls: HTMLDivElement[] = [];
  private frames = 0;
  private fpsT = 0;
  showFps = false;
  onPause: (() => void) | null = null;

  constructor() {
    this.el = document.getElementById('hud')!;
  }

  mount() {
    this.el.innerHTML = '';
    this.xpFill = h('div', { class: 'fill' });
    this.lv = h('div', { class: 'lv' }, 'Lv 1');
    this.timer = h('div', { class: 'timer' }, '00:00');
    this.stats = h('div', { class: 'hud-stats' });
    this.left = h('div', { class: 'hud-left' });
    this.boss = h('div', { class: 'bossbar hidden' });
    this.fps = h('div', { class: 'fps' });
    const pause = h('button', { class: 'btn small pause-btn', onclick: () => this.onPause?.(), 'aria-label': 'Pause' }, 'II');
    this.tip = h('div', { class: 'hud-tip hidden' });
    this.el.append(h('div', { class: 'xpbar' }, this.xpFill, this.lv), this.timer, pause, h('div', { class: 'hud-right' }, this.stats, this.minimap.el), this.left, this.boss, this.fps, this.tip);
    this.el.classList.remove('hidden');
    this.sig = '';
  }

  hide() {
    this.el.classList.add('hidden');
  }

  private rebuildLeft(s: RunSession, me: Player) {
    this.left.innerHTML = '';
    this.hpBars.clear();
    this.cdEls = [];
    const card = (p: Player, mate: boolean) => {
      const hp = h('div');
      this.hpBars.set(p.id, hp);
      const mg = p.megaT > 0 ? MEGA[p.speciesId] : undefined;
      return h('div', { class: `hud-mon${mate ? ' mate' : ''}${mg ? ' is-mega' : ''}` },
        img(assets.portraitUrl(mg?.id ?? p.speciesId, p.shiny)),
        h('div', null, h('div', { class: 'nm' }, mate ? p.name : mg?.name ?? SPECIES[p.speciesId].name), h('div', { class: 'hp' }, hp)),
      );
    };
    this.megaFill = h('div', { class: 'fill' });
    this.megaLabel = h('div', { class: 'lbl' }, 'MEGA');
    this.mega = h('div', { class: 'mega-meter hidden' }, this.megaFill, this.megaLabel);
    const mine = card(me, false);
    mine.querySelector('.hp')!.after(this.mega);
    this.left.append(mine);
    const moves = h('div', { class: 'slots' });
    for (let i = 0; i < me.moveSlots; i++) {
      const m = me.moves[i];
      if (!m) { moves.append(h('div', { class: 'slot empty' })); continue; }
      const def = MOVES[m.id];
      const cd = h('div', { class: 'cd' });
      this.cdEls.push(cd);
      const lvText = def.mastery ? '★' : m.level > MAX_MOVE_LEVEL ? `★${m.level - MAX_MOVE_LEVEL}` : String(m.level);
      moves.append(this.tipped(h('div', { class: `slot${def.mastery ? ' mastered' : ''}`, style: `background:${TYPE_COLORS[def.type]}` },
        h('div', { class: 'ab' }, ABBR(def.name)), cd, h('div', { class: 'lv' }, lvText)), () => this.moveTip(me, m.id)));
    }
    const items = h('div', { class: 'slots' });
    for (let i = 0; i < me.itemSlots; i++) {
      const it = me.items[i];
      items.append(it
        ? this.tipped(h('div', { class: 'slot item' }, img(assets.itemUrl(it.id)), h('div', { class: 'lv' }, it.level)), () => this.itemTip(me, it.id))
        : h('div', { class: 'slot empty' }));
    }
    this.left.append(moves, items);
    const vits = Object.entries(me.vitamins).filter(([, n]) => n > 0);
    if (vits.length) {
      this.left.append(h('div', { class: 'vits' }, ...vits.map(([id, n]) => this.tipped(
        h('div', { class: 'vit' }, img(assets.itemUrl(id)), h('span', null, `×${n}`)),
        () => h('div', null, h('b', null, VITAMIN[id].name), h('p', null, `+${Math.round(vitaminBonus(id, n) * 100)}% ${VITAMIN[id].what} from ${n} dose${n === 1 ? '' : 's'}.`)),
      ))));
    }
    for (const p of s.world.players) if (p.id !== me.id && p.connected) this.left.append(card(p, true));
  }

  /** Hovering a HUD slot shows what it does. */
  private tipped(el: HTMLElement, content: () => HTMLElement) {
    el.classList.add('tippable');
    el.addEventListener('pointerenter', () => { this.tipFor = content; this.showTip(el); });
    el.addEventListener('pointerleave', () => { this.tipFor = null; this.tip.classList.add('hidden'); });
    return el;
  }

  private showTip(anchor: HTMLElement) {
    if (!this.tipFor) return;
    this.tip.innerHTML = '';
    this.tip.append(this.tipFor());
    this.tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    this.tip.style.left = `${Math.round(r.right + 10)}px`;
    this.tip.style.top = `${Math.round(r.top)}px`;
  }

  private moveTip(me: Player, id: string): HTMLElement {
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
      h('b', null, def.name, ' ', h('span', { class: 'lvl' }, def.mastery ? 'MASTERED' : lvl > MAX_MOVE_LEVEL ? `Lv ${MAX_MOVE_LEVEL} ★${lvl - MAX_MOVE_LEVEL}` : `Lv ${lvl}`)),
      h('div', { class: 'meta' }, typeBadge(def.type), h('span', { class: `cat ${def.cat}` }, cap(def.cat)), h('span', null, BEHAVIOR_TEXT[def.behavior])),
      h('p', null, def.desc),
      h('p', { class: 'facts' }, facts.join(' · ') + (stab ? ' · STAB ×1.5' : '')),
      m ? h('p', { class: 'facts' }, `Dealt ${Math.round(m.dmgDealt).toLocaleString()} · ${m.kills.toLocaleString()} KOs`) : null,
    );
  }

  private itemTip(me: Player, id: string): HTMLElement {
    const def = ITEMS[id];
    const lvl = me.items.find((x) => x.id === id)?.level ?? 1;
    return h('div', null, h('b', null, def.name, ' ', h('span', { class: 'lvl' }, `Lv ${lvl}`)), h('p', null, def.desc(lvl)));
  }

  update(s: RunSession, dt: number) {
    const w = s.world;
    const me = w.players[s.localId];
    if (!me) return;
    this.minimap.update(w, s.localId, dt);
    if (this.mega) {
      const on = me.megaT > 0;
      this.mega.classList.toggle('hidden', !on && me.mega <= 0);
      this.mega.classList.toggle('active', on);
      this.mega.classList.toggle('ready', !on && me.mega >= 0.999);
      this.megaFill.style.transform = `scaleX(${on ? me.megaT / MEGA_DURATION : me.mega})`;
    }
    this.xpFill.style.transform = `scaleX(${Math.min(1, w.xp / w.xpNext)})`;
    for (const p of w.players) {
      const bar = this.hpBars.get(p.id);
      if (bar) {
        const k = Math.max(0, p.hp / (p.stats?.maxHp ?? 1));
        bar.style.transform = `scaleX(${k})`;
        bar.style.background = p.fainted ? '#555' : k > 0.5 ? '#48d26a' : k > 0.2 ? '#f5c542' : '#f05454';
      }
    }
    // cooldown wipes
    me.moves.forEach((m, i) => {
      const el = this.cdEls[i];
      if (!el) return;
      const cd = moveStatsAt(MOVES[m.id], m.level).cd * (me.stats?.cooldown ?? 1);
      el.style.transform = `scaleY(${Math.max(0, Math.min(1, m.cd / cd))})`;
    });
    const sig = `${me.speciesId}|${me.megaT > 0}|${JSON.stringify(me.vitamins)}|${me.moves.map((m) => m.id + m.level).join()}|${me.items.map((i) => i.id + i.level).join()}|${w.players.map((p) => p.connected ? p.speciesId : '').join()}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.rebuildLeft(s, me);
    }
    this.frames++;
    this.fpsT += dt;
    this.textT -= dt;
    if (this.textT > 0) return;
    this.textT = 0.1;
    this.lv.textContent = `Lv ${w.level}`;
    const remaining = RUN_LENGTH - w.time;
    this.timer.textContent = remaining > 0 ? fmtTime(w.time) : `${fmtTime(w.time)}`;
    this.timer.style.color = remaining <= 30 && remaining > 0 ? '#ff7b7b' : '#fff';
    this.stats.innerHTML = '';
    this.stats.append(
      h('div', null, `${w.kills.toLocaleString()} `, img(assets.itemUrl('poke-ball'))),
      h('div', null, `₽${Math.round(w.money).toLocaleString()} `, img(assets.itemUrl('nugget'))),
    );
    const boss = w.enemies.find((e) => e.boss && e.alive);
    if (boss) {
      this.boss.classList.remove('hidden');
      this.boss.innerHTML = '';
      this.boss.append(
        h('div', null, `${boss.final ? '★ ' : ''}${SPECIES[boss.speciesId].name.toUpperCase()}`),
        h('div', { class: 'bar' }, h('div', { style: `transform:scaleX(${Math.max(0, boss.hp / boss.maxHp)})` })),
      );
    } else this.boss.classList.add('hidden');
    if (this.showFps && this.fpsT > 0.5) {
      this.fps.textContent = `${Math.round(this.frames / this.fpsT)} fps · ${w.enemies.length} foes · ${w.projectiles.length} fx`;
      this.frames = 0;
      this.fpsT = 0;
    } else if (!this.showFps) this.fps.textContent = '';
  }
}
