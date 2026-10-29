import { MOVES, moveStatsAt } from '../data/moves.ts';
import { SPECIES } from '../data/pokedex.ts';
import { TYPE_COLORS } from '../data/types.ts';
import { assets } from '../render/assets.ts';
import type { RunSession } from '../game/session.ts';
import type { Player } from '../game/types.ts';
import { RUN_LENGTH } from '../data/stages.ts';
import { fmtTime, h, img } from './dom.ts';

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
    this.el.append(h('div', { class: 'xpbar' }, this.xpFill, this.lv), this.timer, pause, this.stats, this.left, this.boss, this.fps);
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
      return h('div', { class: `hud-mon${mate ? ' mate' : ''}` },
        img(assets.portraitUrl(p.speciesId, p.shiny)),
        h('div', null, h('div', { class: 'nm' }, mate ? p.name : SPECIES[p.speciesId].name), h('div', { class: 'hp' }, hp)),
      );
    };
    this.left.append(card(me, false));
    const moves = h('div', { class: 'slots' });
    for (let i = 0; i < me.moveSlots; i++) {
      const m = me.moves[i];
      if (!m) { moves.append(h('div', { class: 'slot empty' })); continue; }
      const def = MOVES[m.id];
      const cd = h('div', { class: 'cd' });
      this.cdEls.push(cd);
      moves.append(h('div', { class: `slot${def.mastery ? ' mastered' : ''}`, style: `background:${TYPE_COLORS[def.type]}`, title: def.name },
        h('div', { class: 'ab' }, ABBR(def.name)), cd, h('div', { class: 'lv' }, def.mastery ? '★' : m.level)));
    }
    const items = h('div', { class: 'slots' });
    for (let i = 0; i < me.itemSlots; i++) {
      const it = me.items[i];
      items.append(it ? h('div', { class: 'slot item' }, img(assets.itemUrl(it.id)), h('div', { class: 'lv' }, it.level)) : h('div', { class: 'slot empty' }));
    }
    this.left.append(moves, items);
    for (const p of s.world.players) if (p.id !== me.id && p.connected) this.left.append(card(p, true));
  }

  update(s: RunSession, dt: number) {
    const w = s.world;
    const me = w.players[s.localId];
    if (!me) return;
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
    const sig = `${me.speciesId}|${me.moves.map((m) => m.id + m.level).join()}|${me.items.map((i) => i.id + i.level).join()}|${w.players.map((p) => p.connected ? p.speciesId : '').join()}`;
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
