import { MOVES, moveStatsAt } from '../data/moves.ts';
import { MEGA, SPECIES } from '../data/pokedex.ts';
import { assets } from '../render/assets.ts';
import type { RunSession } from '../game/session.ts';
import type { Player } from '../game/types.ts';
import { RUN_LENGTH, type BossDef } from '../data/stages.ts';
import { fmtTime, h, img, uiIcon } from './dom.ts';
import { hideTip, itemSlot, moveSlot, tipped, vitaminTip } from './tips.ts';
import { Minimap } from './minimap.ts';
import { DamageMeter } from './meter.ts';
import { EffectRow, StatSheet } from './charsheet.ts';
import { MEGA_DURATION } from '../game/mega.ts';

export class Hud {
  private el: HTMLElement;
  private xpFill!: HTMLDivElement;
  private lv!: HTMLDivElement;
  private timer!: HTMLDivElement;
  private stats!: HTMLDivElement;
  private left!: HTMLDivElement;
  private boss!: HTMLDivElement;
  private next!: HTMLDivElement;
  private nextImg!: HTMLImageElement;
  private nextName!: HTMLSpanElement;
  private nextTime!: HTMLSpanElement;
  private nextFill!: HTMLDivElement;
  private nextKey = '';
  private fps!: HTMLDivElement;
  private mega!: HTMLDivElement;
  private megaFill!: HTMLDivElement;
  private megaLabel!: HTMLDivElement;
  private minimap = new Minimap();
  private effects = new EffectRow();
  private sheet = new StatSheet();
  readonly meter = new DamageMeter();
  private meterT = 0;
  onMeterToggle: (() => void) | null = null;
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
    this.nextImg = img('', 'px');
    this.nextName = h('span', { class: 'nm' });
    this.nextTime = h('span', { class: 't' });
    this.nextFill = h('div');
    this.next = h('div', { class: 'next-boss hidden' }, this.nextImg,
      h('div', null, h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'BOSS'), this.nextName, this.nextTime), h('div', { class: 'bar' }, this.nextFill)));
    this.nextKey = '';
    this.fps = h('div', { class: 'fps' });
    const pause = h('button', { class: 'btn small pause-btn', onclick: () => this.onPause?.(), 'aria-label': 'Pause' }, 'II');
    const meterBtn = h('button', { class: 'btn small meter-btn', onclick: () => this.onMeterToggle?.(), title: 'Damage tracker (T)', 'aria-label': 'Damage tracker' }, 'DMG');
    this.el.append(h('div', { class: 'xpbar' }, this.xpFill, this.lv), this.timer, pause, meterBtn, h('div', { class: 'hud-right' }, this.stats, this.minimap.el, this.meter.el), this.left, h('div', { class: 'top-center' }, this.next, this.boss), this.fps);
    this.el.classList.remove('hidden');
    this.sig = '';
  }

  hide() {
    this.el.classList.add('hidden');
  }

  private rebuildLeft(s: RunSession, me: Player) {
    hideTip(this.left);
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
    this.mega = h('div', { class: 'mega-row hidden' }, img(uiIcon('mega'), 'mega-sigil'), h('div', { class: 'mega-meter' }, this.megaFill, this.megaLabel));
    const mine = card(me, false);
    mine.querySelector('.hp')!.after(this.mega);
    // Click your card to drop down the stat sheet; buffs sit to the right of the name and HP.
    mine.classList.add('me');
    mine.classList.toggle('open', this.sheet.open);
    mine.append(this.effects.el, h('div', { class: 'caret' }));
    mine.addEventListener('click', () => {
      this.sheet.open = !this.sheet.open;
      mine.classList.toggle('open', this.sheet.open);
      this.sheet.update(me, s.world.level, s.world.time);
    });
    this.left.append(mine);
    const moves = h('div', { class: 'slots' });
    for (let i = 0; i < me.moveSlots; i++) {
      const m = me.moves[i];
      if (!m) { moves.append(h('div', { class: 'slot empty' })); continue; }
      const cd = h('div', { class: 'cd' });
      this.cdEls.push(cd);
      const slot = moveSlot(me, m.id, m.level);
      slot.querySelector('.lv')!.before(cd);
      moves.append(slot);
    }
    const items = h('div', { class: 'slots' });
    for (let i = 0; i < me.itemSlots; i++) {
      const it = me.items[i];
      items.append(it ? itemSlot(me, it.id, it.level) : h('div', { class: 'slot empty' }));
    }
    this.left.append(moves, items);
    const vits = Object.entries(me.vitamins).filter(([, n]) => n > 0);
    if (vits.length) {
      this.left.append(h('div', { class: 'vits' }, ...vits.map(([id, n]) => tipped(
        h('div', { class: 'vit' }, img(assets.itemUrl(id)), h('span', null, `×${n}`)), () => vitaminTip(id, n)))));
    }
    this.sheet.build(me);
    this.sheet.update(me, s.world.level, s.world.time);
    this.left.append(this.sheet.el);
    for (const p of s.world.players) if (p.id !== me.id && p.connected) this.left.append(card(p, true));
  }

  update(s: RunSession, dt: number) {
    const w = s.world;
    const me = w.players[s.localId];
    if (!me) return;
    this.minimap.update(w, s.localId, dt);
    this.meterT -= dt;
    if (this.meter.visible && this.meterT <= 0) {
      this.meterT = 0.25;
      this.meter.update(me, w.time);
    }
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
    this.effects.update(me, w.time);
    // On the level-up screen your card, build and stats stay sharp above the overlay so they can
    // be hovered while choosing; the overlay pads itself clear of them via --hud-rx / --hud-ry.
    const lifted = s.phase() === 'levelup';
    this.el.classList.toggle('lifted', lifted);
    if (lifted) {
      const r = this.left.getBoundingClientRect();
      const root = document.documentElement.style;
      root.setProperty('--hud-rx', `${Math.ceil(r.right)}px`);
      root.setProperty('--hud-ry', `${Math.ceil(r.bottom)}px`);
    }
    this.frames++;
    this.fpsT += dt;
    this.textT -= dt;
    if (this.textT > 0) return;
    this.textT = 0.1;
    this.sheet.update(me, w.level, w.time);
    this.lv.textContent = `Lv ${w.level}`;
    const remaining = RUN_LENGTH - w.time;
    this.timer.textContent = remaining > 0 ? fmtTime(w.time) : `${fmtTime(w.time)}`;
    this.timer.style.color = remaining <= 30 && remaining > 0 ? '#ff7b7b' : '#fff';
    this.stats.innerHTML = '';
    this.stats.append(
      h('div', null, `${w.kills.toLocaleString()} `, img(assets.itemUrl('poke-ball'))),
      h('div', null, `₽${Math.round(w.money).toLocaleString()} `, img(assets.itemUrl('nugget'))),
    );
    this.updateNextBoss(w.stage.bosses, w.time);
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

  /** Countdown to the next scheduled boss, with who it is and a bar filling up since the last one. */
  private updateNextBoss(bosses: readonly BossDef[], time: number) {
    const i = bosses.findIndex((b) => b.at > time);
    this.next.classList.toggle('hidden', i < 0);
    if (i < 0) return;
    const b = bosses[i];
    const key = `${i}:${b.species}`;
    if (key !== this.nextKey) {
      this.nextKey = key;
      this.nextImg.src = assets.portraitUrl(b.species);
      this.nextName.textContent = `${b.final ? '★ ' : ''}${SPECIES[b.species].name.toUpperCase()}`;
    }
    const prev = i ? bosses[i - 1].at : 0;
    const left = b.at - time;
    this.nextTime.textContent = fmtTime(Math.ceil(left));
    this.nextFill.style.transform = `scaleX(${Math.min(1, Math.max(0, (time - prev) / (b.at - prev)))})`;
    this.next.classList.toggle('soon', left <= 15);
  }
}
