import type { BuffKind } from '../data/moves.ts';
import { MOVES } from '../data/moves.ts';
import { ABILITIES, SPECIES } from '../data/pokedex.ts';
import type { PType } from '../data/types.ts';
import { assets } from '../render/assets.ts';
import { BASE_PICKUP, derivePlayerStats } from '../game/stats.ts';
import { MEGA_DURATION } from '../game/mega.ts';
import type { DerivedStats, Player } from '../game/types.ts';
import { h, img, typeBadge, uiIcon } from './dom.ts';
import { hideTip, tipped } from './tips.ts';

/**
 * The partner's character sheet in the HUD: active buffs/debuffs as chips beside the name, and
 * a drop-down of current stats (opened by clicking the HUD card) so you can judge level-up picks.
 */

const pct = (v: number) => `${Math.round(v * 100)}%`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ─────────────────────────── buffs & debuffs ───────────────────────────

interface Effect {
  key: string;
  icon: string;
  name: string;
  desc: string;
  bad?: boolean;
  /** Seconds left, for timed effects. */
  t?: number;
  /** Ability states have no timer and get a different frame. */
  ability?: boolean;
}

const BUFF_INFO: Record<BuffKind, { item: string; name: string; desc: (a: number) => string }> = {
  atk: { item: 'x-attack', name: 'Attack up', desc: (a) => `+${pct(a)} Attack and +10% move speed.` },
  spa: { item: 'x-sp-atk', name: 'Sp. Atk up', desc: (a) => `+${pct(a)} Sp. Atk.` },
  speed: { item: 'x-speed', name: 'Speed up', desc: (a) => `+${pct(a)} move speed.` },
  haste: { item: 'x-speed', name: 'Haste', desc: (a) => `+${pct(a)} move speed and attack rate.` },
  crit: { item: 'dire-hit', name: 'Focused', desc: (a) => `+${pct(a)} critical-hit chance.` },
  shield: { item: 'x-defense', name: 'Barrier', desc: (a) => `Takes ${pct(a)} less damage.` },
  dodge: { item: 'bright-powder', name: 'Evasion up', desc: (a) => `${pct(a)} chance to dodge hits.` },
  heal: { item: 'leftovers', name: 'Recovering', desc: (a) => `Restores ${pct(a)} of max HP per second.` },
};

const PINCH: Partial<Record<string, PType>> = { overgrow: 'grass', blaze: 'fire', torrent: 'water' };

/** Everything currently boosting or hurting the player, mirroring the rules in stats.ts / damage.ts. */
export function activeEffects(p: Player, time: number): Effect[] {
  const out: Effect[] = [];
  if (p.megaT > 0) {
    out.push({
      key: 'mega', icon: uiIcon('mega'), name: 'Mega Evolution', t: p.megaT,
      desc: '+50% Attack and Sp. Atk, half damage taken, +35% attack rate, +20% area and +10% crit.',
    });
  }
  for (const b of p.buffs) {
    const info = BUFF_INFO[b.kind];
    out.push({
      key: `buff:${b.kind}`, icon: assets.itemUrl(info.item), t: b.t,
      name: b.src && MOVES[b.src] ? MOVES[b.src].name : info.name, desc: info.desc(b.amount),
    });
  }
  const hpFrac = p.hp / Math.max(1, p.stats?.maxHp ?? 1);
  const ab = ABILITIES[p.ability];
  const pinch = PINCH[p.ability];
  if (pinch && hpFrac < 0.5) out.push({ key: 'ab', ability: true, icon: uiIcon(`logo/${pinch}`), name: ab.name, desc: `Below half HP: ${cap(pinch)} moves deal +50% damage.` });
  if (p.ability === 'guts' && hpFrac < 0.99) out.push({ key: 'ab', ability: true, icon: uiIcon('logo/fighting'), name: ab.name, desc: `Hurt: +${pct(0.6 * (1 - hpFrac))} damage.` });
  if (p.ability === 'multiscale' && p.hp >= (p.stats?.maxHp ?? 0) - 0.5) out.push({ key: 'ab', ability: true, icon: uiIcon('logo/dragon'), name: ab.name, desc: 'Full HP: takes half damage.' });
  if (p.ability === 'unburden' && time - p.lastHit > 4) out.push({ key: 'ab', ability: true, icon: assets.itemUrl('quick-claw'), name: ab.name, desc: 'Untouched for 4s: +25% move speed and +15% attack rate.' });
  if (p.ability === 'speed-boost') {
    const boost = Math.min(0.45, Math.floor(time / 60) * 0.03);
    if (boost > 0) out.push({ key: 'ab', ability: true, icon: assets.itemUrl('quick-claw'), name: ab.name, desc: `+${pct(boost)} move speed and attack rate.` });
  }
  if (p.stats?.lifeOrb && p.ability !== 'magic-guard') {
    out.push({ key: 'life-orb', bad: true, icon: assets.itemUrl('life-orb'), name: 'Life Orb recoil', desc: `Loses ${(0.4 * p.stats.lifeOrb / 0.08).toFixed(1)}% of max HP per second (never below 1 HP).` });
  }
  return out;
}

function effectTip(e: Effect): HTMLElement {
  return h('div', null,
    h('b', null, e.name, ' ', h('span', { class: 'lvl' }, e.bad ? 'DEBUFF' : e.ability ? 'ABILITY' : 'BUFF')),
    h('p', null, e.desc),
    e.t !== undefined ? h('p', { class: 'facts' }, `${e.t.toFixed(1)}s left`) : null);
}

/** Row of effect chips; lives beside the name and HP bar in the HUD card. */
export class EffectRow {
  readonly el = h('div', { class: 'fx-row' });
  private sig = '';
  private effects: Effect[] = [];
  private chips = new Map<string, { time: HTMLElement; drain: HTMLElement; max: number }>();

  update(p: Player, time: number) {
    this.effects = activeEffects(p, time);
    const sig = this.effects.map((e) => `${e.key}|${e.icon}`).join();
    if (sig !== this.sig) {
      this.sig = sig;
      hideTip(this.el);
      this.el.replaceChildren();
      const old = this.chips;
      this.chips = new Map();
      for (const e of this.effects) {
        const time = h('div', { class: 'fx-t' });
        const drain = h('div', { class: 'fx-drain' });
        const key = e.key;
        this.el.append(tipped(h('div', { class: `fx-chip${e.bad ? ' bad' : ''}${e.ability ? ' ability' : ''}` }, img(e.icon), drain, time),
          () => effectTip(this.effects.find((x) => x.key === key) ?? e)));
        this.chips.set(key, { time, drain, max: old.get(key)?.max ?? 0 });
      }
    }
    for (const e of this.effects) {
      const c = this.chips.get(e.key);
      if (!c || e.t === undefined) continue;
      // Buffs don't carry their full duration; remember the longest we've seen (refreshes reset it).
      if (e.t > c.max) c.max = e.key === 'mega' ? MEGA_DURATION : e.t;
      c.time.textContent = String(Math.ceil(e.t));
      c.drain.style.transform = `scaleY(${1 - Math.min(1, e.t / Math.max(0.01, c.max))})`;
    }
  }
}

// ─────────────────────────── stat sheet ───────────────────────────

interface StatRow {
  label: string;
  tip: (s: DerivedStats, p: Player) => string;
  /** Number shown (and compared against the unbuffed value for the ▲/▼ colour). */
  val: (s: DerivedStats, p: Player) => number;
  fmt: (v: number, p: Player) => string;
  lowerIsBetter?: boolean;
  /** Species base stat, drawn as a bar like the summary screen. */
  base?: number;
  show?: (s: DerivedStats) => boolean;
}

const MAIN: StatRow[] = [
  { label: 'HP', val: (s) => s.maxHp, fmt: (v, p) => `${Math.ceil(Math.max(0, p.hp))}/${Math.round(v)}`, tip: (s) => `Max HP ${Math.round(s.maxHp)}.` },
  { label: 'Attack', val: (s) => s.atk * (1 + s.physDmg) * 100, fmt: (v) => String(Math.round(v)), tip: (s) => `Physical moves deal ×${(s.atk * (1 + s.physDmg)).toFixed(2)} damage.` },
  { label: 'Defense', val: (s) => 100 / s.contactTaken, fmt: (v) => String(Math.round(v)), tip: (s) => `Takes ${pct(s.contactTaken)} damage from foes touching you.` },
  { label: 'Sp. Atk', val: (s) => s.spa * (1 + s.specDmg) * 100, fmt: (v) => String(Math.round(v)), tip: (s) => `Special moves deal ×${(s.spa * (1 + s.specDmg)).toFixed(2)} damage.` },
  { label: 'Sp. Def', val: (s) => 100 / s.projTaken, fmt: (v) => String(Math.round(v)), tip: (s) => `Takes ${pct(s.projTaken)} damage from projectiles and special attacks.` },
  { label: 'Speed', val: (s) => s.speed, fmt: (v) => String(Math.round(v)), tip: () => 'How fast you move.' },
];

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;

const EXTRA: StatRow[] = [
  { label: 'Cooldown', val: (s) => s.cooldown, lowerIsBetter: true, fmt: (v) => signed(v - 1), tip: (s) => `Moves recharge in ${pct(s.cooldown)} of their normal time.` },
  { label: 'Area', val: (s) => s.area, fmt: (v) => signed(v - 1), tip: () => 'Size of attacks and auras.' },
  { label: 'Duration', val: (s) => s.duration, fmt: (v) => signed(v - 1), tip: () => 'How long lingering moves and buffs last.', show: (s) => s.duration !== 1 },
  { label: 'Amount', val: (s) => s.countBonus, fmt: (v) => `+${v}`, tip: () => 'Extra projectiles per multi-shot move.', show: (s) => s.countBonus > 0 },
  { label: 'Crit', val: (s) => s.crit, fmt: (v) => pct(v), tip: () => 'Chance for a hit to be critical.' },
  { label: 'Crit dmg', val: (s) => s.critDmg, fmt: (v) => `×${v.toFixed(2)}`, tip: () => 'Damage multiplier on critical hits.' },
  { label: 'Regen', val: (s) => s.regen, fmt: (v) => `${(v * 100).toFixed(1)}%/s`, tip: () => 'Max HP restored every second.', show: (s) => s.regen > 0 },
  { label: 'Lifesteal', val: (s) => s.lifesteal, fmt: (v) => pct(v), tip: () => 'Share of damage dealt returned as HP.', show: (s) => s.lifesteal > 0 },
  { label: 'S.Effect', val: (s) => s.superEff, fmt: (v) => signed(v), tip: () => 'Bonus damage on super-effective hits.', show: (s) => s.superEff > 0 },
  { label: 'Flinch', val: (s) => s.flinch, fmt: (v) => pct(v), tip: () => 'Chance for hits to make foes flinch.', show: (s) => s.flinch > 0 },
  { label: 'Thorns', val: (s) => s.thorns, fmt: (v) => pct(v), tip: () => 'Damage reflected at foes that touch you.', show: (s) => s.thorns > 0 },
  { label: 'Focus', val: (s) => s.focus, fmt: (v) => pct(v), tip: () => 'Chance to survive a fatal hit with 1 HP.', show: (s) => s.focus > 0 },
  { label: 'Pickup', val: (s) => s.pickup / BASE_PICKUP, fmt: (v) => signed(v - 1), tip: () => 'Radius for collecting candy and coins.' },
  { label: 'EXP', val: (s) => s.exp, fmt: (v) => signed(v - 1), tip: () => 'Bonus experience from candy.', show: (s) => s.exp !== 1 },
  { label: 'Money', val: (s) => s.money, fmt: (v) => signed(v - 1), tip: () => 'Bonus Poké Dollars from coins.', show: (s) => s.money !== 1 },
];

const barColor = (b: number) => (b < 50 ? '#f05454' : b < 80 ? '#f5a442' : b < 100 ? '#f5d442' : b < 120 ? '#48d26a' : '#3ab8ff');

/** Drop-down stat sheet. Rows are built once per build change; numbers refresh in place. */
export class StatSheet {
  readonly el = h('div', { class: 'panel stat-sheet hidden' });
  private live: { row: StatRow; out: HTMLElement }[] = [];
  private player: Player | null = null;

  get open() { return !this.el.classList.contains('hidden'); }
  set open(v: boolean) { this.el.classList.toggle('hidden', !v); if (!v) hideTip(this.el); }

  build(p: Player) {
    hideTip(this.el);
    this.player = p;
    this.live = [];
    const s = p.stats;
    const sp = SPECIES[p.speciesId];
    const ab = ABILITIES[p.ability];
    const line = (row: StatRow, cls: string, base?: number) => {
      const out = h('span', { class: 'ss-v' });
      this.live.push({ row, out });
      return tipped(h('div', { class: cls },
        h('span', { class: 'ss-l' }, row.label),
        base !== undefined ? h('span', { class: 'ss-bar' }, h('i', { style: `width:${Math.min(100, base / 1.6)}%;background:${barColor(base)}` }), h('em', null, base)) : null,
        out), () => h('div', null, h('b', null, row.label), h('p', null, row.tip(this.player!.stats, this.player!))));
    };
    const types = h('div', { class: 'ss-types' }, ...p.types.map(typeBadge));
    const ability = tipped(h('div', { class: 'ss-ability' }, 'Ability ', h('b', null, ab.name)), () => h('div', null, h('b', null, ab.name), h('p', null, ab.desc)));
    const boosts = (Object.entries(s.typeDmg) as [PType, number][]).filter(([, v]) => v > 0);
    this.el.replaceChildren(
      types, ability,
      h('div', { class: 'ss-main' }, ...MAIN.map((r, i) => line(r, 'ss-row', sp.base[i]))),
      h('div', { class: 'ss-extra' }, ...EXTRA.filter((r) => !r.show || r.show(s)).map((r) => line(r, 'ss-row small'))),
    );
    if (boosts.length) {
      this.el.append(h('div', { class: 'ss-boosts' }, ...boosts.map(([t, v]) => tipped(
        h('span', { class: 'ss-boost' }, img(uiIcon(`logo/${t}`), 'logo'), `+${pct(v)}`),
        () => h('div', null, h('b', null, `${cap(t)} boost`), h('p', null, `${cap(t)} moves deal +${pct(v)} damage.`))))));
    }
  }

  update(p: Player, level: number, time: number) {
    if (!this.open) return;
    this.player = p;
    // The same stats without move buffs or Mega Evolution, to colour what's temporarily boosted.
    const plain = derivePlayerStats({ ...p, buffs: [], megaT: 0 }, level, time);
    for (const { row, out } of this.live) {
      const v = row.val(p.stats, p), base = row.val(plain, p);
      const d = (v - base) * (row.lowerIsBetter ? -1 : 1);
      out.textContent = row.fmt(v, p);
      out.className = `ss-v${d > 1e-6 ? ' up' : d < -1e-6 ? ' down' : ''}`;
    }
  }
}
