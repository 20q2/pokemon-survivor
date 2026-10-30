import type { App } from '../app.ts';
import { audio } from '../audio/audio.ts';
import { ABILITIES, LINE, LINES, SPECIES, SPECIES_LIST, finalForms, type Line } from '../data/pokedex.ts';
import { MOVES, MOVE_LIST } from '../data/moves.ts';
import { ITEMS, ITEM_LIST } from '../data/items.ts';
import { STAGES, waveTimeline, type StageDef } from '../data/stages.ts';
import { TYPE_COLORS, TYPES, effectiveness, type PType } from '../data/types.ts';
import { ACHIEVEMENTS, rewardText, stageUnlocked } from '../meta/achievements.ts';
import { checkAchievements, type RunRewards } from '../meta/progression.ts';
import type { RunSummary } from '../meta/achievements.ts';
import { exportSave, freshSave, importSave, type Options } from '../meta/save.ts';
import { FRIENDSHIP_MAX, FRIENDSHIP_PERKS, SHOP, SHOP_CATS, TM_COST, TM_LIST, upgradeCost, type ShopCat } from '../meta/shop.ts';
import { assets, ASSET_BASE } from '../render/assets.ts';
import { stageThumbnail } from '../render/background.ts';
import { dirRow } from '../engine/math.ts';
import type { RunSession } from '../game/session.ts';
import type { Player } from '../game/types.ts';
import { btn, catBadge, fmtTime, h, img, moveDisc, moveIcon, toast, typeBadge, uiIcon } from './dom.ts';
import { hideTip, moveInfoTip, tipped } from './tips.ts';
import { lobbyMenu } from './lobby.ts';

const nn = (...a: (Node | string | null)[]) => a.filter((x): x is Node | string => x !== null);

const screen = (cls = '', ...children: (Node | null)[]) => h('div', { class: `screen dim ${cls}` }, ...children);

function moneyChip(app: App) {
  return h('div', { class: 'money-chip' }, img(assets.itemUrl('nugget')), `₽${app.save.money.toLocaleString()}`);
}

function topbar(title: string, onBack: () => void, extra?: Node) {
  return h('div', { class: 'topbar' }, btn('◀ Back', onBack, 'small', { 'data-back': true }), h('h2', null, title), extra ?? null);
}

// ─────────────────────────── title ───────────────────────────

export function titleScreen(app: App) {
  const s = app.save;
  const done = Object.keys(s.achievements).length;
  return screen('',
    moneyChip(app),
    h('div', { class: 'title-logo' }, h('div', { class: 'l1' }, 'POKÉMON'), h('div', { class: 'l2' }, 'SURVIVORS')),
    h('div', { class: 'title-menu' },
      btn('Play', () => app.show(selectScreen(app, (line) => app.show(stageScreen(app, line, (st) => void app.startSolo(line, st))))), 'primary', { 'data-autofocus': true }),
      btn('Online Co-op', () => app.show(lobbyMenu(app))),
      btn([img(assets.itemUrl('amulet-coin')), 'Poké Mart'], () => app.show(shopScreen(app))),
      btn([img(assets.itemUrl('shiny-charm')), `Achievements ${done}/${ACHIEVEMENTS.length}`], () => app.show(achievementsScreen(app))),
      btn([img(assets.itemUrl('great-ball')), 'Pokédex'], () => app.show(dexScreen(app))),
      btn('Options', () => app.show(optionsScreen(app, () => app.goTitle()))),
      btn('Credits', () => app.show(creditsScreen(app))),
    ),
    h('div', { class: 'title-foot' }, 'Move with WASD / arrows / gamepad / touch. Everything else is automatic. A non-commercial fan game.'),
  );
}

// ─────────────────────────── partner select ───────────────────────────

/** A small canvas that plays a Pokémon's walk cycle, rotating through directions. */
export function spritePreview(app: App, getSpecies: () => { id: string; shiny: boolean }) {
  const c = h('canvas', { class: 'preview' });
  c.width = 220;
  c.height = 118;
  const g = c.getContext('2d')!;
  let t = 0;
  app.onFrame = (dt) => {
    if (!c.isConnected) return;
    t += dt;
    const { id, shiny } = getSpecies();
    const set = assets.get(id, shiny);
    g.clearRect(0, 0, c.width, c.height);
    if (!set) { void assets.load(id, shiny); return; }
    const dirs = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
    const d = dirs[Math.floor(t / 1.2) % 8];
    const anim = set.walk;
    const f = anim.frameAt(t);
    const scale = Math.min(3, Math.floor(96 / anim.fh));
    g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(110, 100, 22, 7, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(anim.img, f * anim.fw, (dirRow(d[0], d[1]) % anim.rows) * anim.fh, anim.fw, anim.fh, 110 - (anim.fw * scale) / 2, 100 - (anim.fh * scale) / 2 - 6 * scale, anim.fw * scale, anim.fh * scale);
  };
  return c;
}

function statBars(id: string) {
  const b = SPECIES[id].base;
  const names = ['HP', 'Atk', 'Def', 'Sp.Atk', 'Sp.Def', 'Speed'];
  return h('div', { class: 'col', style: 'gap:3px' }, names.map((n, i) =>
    h('div', { class: 'statbar' }, h('span', null, n), h('b', null, b[i]),
      h('div', { class: 'bar' }, h('div', { style: `width:${Math.min(100, (b[i] / 150) * 100)}%;background:${b[i] >= 100 ? '#48d26a' : b[i] >= 70 ? '#f5c542' : '#f08a54'}` })))));
}

function unlockHint(lineId: string): string {
  const a = ACHIEVEMENTS.find((x) => 'line' in x.reward && x.reward.line === lineId);
  return a ? `${a.name}: ${a.desc}` : 'Locked';
}

/** The line's learnable moves; ones never offered or learned with this Pokémon stay hidden. */
function movePool(app: App, line: Line) {
  const seen = new Set([line.starter, ...(app.save.movesSeen[line.id] ?? [])]);
  const entries: { move: string; gate: string }[] = line.learnset.map((e) => ({
    move: e.move,
    gate: e.stage === 0 ? '' : `Lv${line.evoLevels[e.stage - 1]}+`,
  }));
  for (const [species, moves] of Object.entries(line.formMoves ?? {})) {
    for (const m of moves) if (!entries.some((e) => e.move === m)) entries.push({ move: m, gate: SPECIES[species].name });
  }
  const found = entries.filter((e) => seen.has(e.move)).length;
  return h('div', { class: 'pool' },
    h('div', null, h('b', null, 'Move pool '), h('span', { class: 'hint' }, `${found}/${entries.length} discovered`)),
    h('div', { class: 'pool-grid' }, entries.map((e) => {
      const known = seen.has(e.move);
      const def = MOVES[e.move];
      return tipped(h('div', {
        class: `pool-move${known ? '' : ' unknown'}`,
        style: known ? `--tc:${TYPE_COLORS[def.type]}` : '',
      }, known ? img(uiIcon(`logo/${def.type}`), 'pl') : null, h('span', { class: 'mn' }, known ? def.name : '???'), e.gate ? h('span', { class: 'gate' }, e.gate) : null),
      () => known ? moveInfoTip(e.move, e.gate) : h('div', null, h('b', null, '???'), h('p', null, 'Not discovered yet: learn or be offered it in a run.')));
    })),
  );
}

/** Base → middle stages → every possible final form; alternate forms say where they evolve. */
function evoRow(line: Line, shiny: boolean) {
  const portrait = (id: string) => img(assets.portraitUrl(id, shiny));
  const arrow = (i: number) => h('span', { class: 'arrow' }, `Lv${line.evoLevels[i]} →`);
  const finals = finalForms(line);
  const where = (id: string) => STAGES.filter((st) => line.envForms?.[st.id]?.includes(id)).map((st) =>
    line.envForms![st.id].length > 1 ? `${st.name} (if your moves lean ${SPECIES[id].types[0]})` : st.name);
  const final = (id: string) => {
    if (finals.length === 1) return portrait(id);
    const at = where(id);
    return tipped(portrait(id), () => h('div', null, h('b', null, SPECIES[id].name),
      h('p', null, at.length ? `Evolves in ${at.join(' or ')}.` : 'Evolves anywhere else.')));
  };
  const mids = line.stages.slice(1, line.evoLevels.length);
  return h('div', { class: 'evo' }, portrait(line.stages[0]),
    ...mids.flatMap((id, i) => [arrow(i), portrait(id)]),
    arrow(mids.length), ...finals.map(final));
}

export function selectScreen(app: App, onConfirm: (lineId: string) => void, title = 'Choose your partner', onBack = () => app.goTitle()) {
  let sel = app.lineUnlocked(app.save.lastLine) ? app.save.lastLine : 'charmander';
  const detail = h('div', { class: 'panel detail col' });
  const roster = h('div', { class: 'roster' });
  const shinyOn = (id: string) => app.save.shinyOn.includes(id);
  const preview = spritePreview(app, () => ({ id: LINE[sel].stages[0], shiny: shinyOn(sel) }));

  const renderDetail = () => {
    const line: Line = LINE[sel];
    const sp = SPECIES[line.stages[0]];
    const unlocked = app.lineUnlocked(sel);
    const fr = app.save.friendship[sel] ?? 0;
    const hearts = Math.floor((fr / FRIENDSHIP_MAX) * 5);
    hideTip(detail);
    detail.innerHTML = '';
    detail.append(...nn(
      h('h3', null, sp.name, ' ', ...sp.types.map(typeBadge)),
      preview,
      unlocked ? null : h('div', { class: 'hint' }, `🔒 ${unlockHint(sel)}`),
      h('div', { class: 'hint' }, line.blurb),
      h('div', null, h('b', null, `Ability: ${ABILITIES[line.ability].name}`), h('div', { class: 'hint' }, ABILITIES[line.ability].desc)),
      h('div', null, h('b', null, 'Starts with: '), MOVES[line.starter].name, ' ', typeBadge(MOVES[line.starter].type)),
      movePool(app, line),
      statBars(sp.id),
      evoRow(line, shinyOn(sel)),
      h('div', null, h('b', null, 'Friendship '), h('span', { class: 'hearts' }, '♥'.repeat(hearts) + '♡'.repeat(5 - hearts)), h('span', { class: 'hint' }, ` ${fr}/${FRIENDSHIP_MAX}`)),
      h('div', { class: 'hint' }, FRIENDSHIP_PERKS.map((p) => (fr >= p.at ? '✔ ' : '• ') + p.text).join(' · ')),
      app.save.shinyUnlocked.includes(sel)
        ? h('label', { class: 'row' }, h('input', {
          type: 'checkbox', class: 'toggle', checked: shinyOn(sel), onchange: (e: Event) => {
            const on = (e.target as HTMLInputElement).checked;
            app.save.shinyOn = app.save.shinyOn.filter((x) => x !== sel);
            if (on) app.save.shinyOn.push(sel);
            app.persist();
            renderRoster();
            renderDetail();
          },
        }), img(uiIcon('shiny'), 'shiny-mark'), 'Use Shiny form (+10% ₽)')
        : h('div', { class: 'hint row' }, img(uiIcon('shiny'), 'shiny-mark'), 'Shiny: clear a stage at max friendship, or clear Cerulean Cave.'),
      btn('Choose!', () => { if (unlocked) onConfirm(sel); else audio.sfx('error'); }, 'primary', { disabled: !unlocked }),
    ));
  };
  const renderRoster = () => {
    roster.innerHTML = '';
    for (const l of app.allLines()) {
      const unlocked = app.lineUnlocked(l.id);
      const el = h('button', {
        class: `mon${unlocked ? '' : ' locked'}${l.id === sel ? ' sel' : ''}`, 'data-nav': true,
        onfocus: () => { if (sel !== l.id) { sel = l.id; roster.querySelectorAll('.mon').forEach((m) => m.classList.toggle('sel', m === el)); renderDetail(); } },
        onclick: () => { sel = l.id; audio.sfx('click'); renderRoster(); renderDetail(); if (unlocked) (detail.querySelector('.btn.primary') as HTMLElement)?.focus(); },
      }, img(unlocked ? assets.portraitUrl(l.stages[0], shinyOn(l.id)) : assets.itemUrl('poke-ball')), h('div', { class: 'nm' }, unlocked ? l.name : '???'),
        app.save.shinyUnlocked.includes(l.id) ? h('span', { class: 'shiny-star' }, '★') : null);
      if (l.id === sel) el.setAttribute('data-autofocus', '');
      roster.append(el);
    }
  };
  renderRoster();
  renderDetail();
  return screen('', topbar(title, onBack, moneyChip(app)), h('div', { class: 'select-wrap' }, roster, detail));
}

// ─────────────────────────── stage select ───────────────────────────

/** How the partner's own types fare offensively and defensively on a route. */
function matchupHint(lineId: string, routeTypes: PType[]) {
  const types = SPECIES[LINE[lineId].stages[0]].types;
  const off = Math.max(...types.map((t) => routeTypes.reduce((a, rt) => a + effectiveness(t, [rt]), 0) / routeTypes.length));
  const def = routeTypes.reduce((a, rt) => a + effectiveness(rt, types), 0) / routeTypes.length;
  const score = off - def;
  const text = score > 0.25 ? 'Great matchup for your partner' : score < -0.25 ? 'Tough matchup — learn coverage moves!' : 'Even matchup';
  return h('div', { class: `matchup ${score > 0.25 ? 'good' : score < -0.25 ? 'bad' : ''}` }, text);
}

/** One row of minute 1-15 newcomers; swarm and ring minutes are ringed, boss minutes carry a dot. */
function waveStrip(stage: StageDef) {
  return h('div', { class: 'wave-strip' }, waveTimeline(stage).map((c) => {
    const name = SPECIES[c.focus].name;
    const what = c.kind === 'swarm' ? `${name} swarm` : c.kind === 'ring' ? `${name} ring` : name;
    return h('span', { class: `wc ${c.kind}${c.elite ? ' elite' : ''}`, title: `Minute ${c.minute}: ${what}${c.elite ? ' + boss' : ''}` }, img(assets.portraitUrl(c.species)));
  }));
}

function stageSwatch(stage: (typeof STAGES)[number]) {
  const thumb = stageThumbnail(stage);
  const c = h('canvas', { class: 'thumb', width: thumb.width, height: thumb.height }) as HTMLCanvasElement;
  c.getContext('2d')!.drawImage(thumb, 0, 0);
  return h('div', { class: 'swatch' }, c, h('div', { class: 'bosses' }, stage.bosses.map((bs) => img(assets.portraitUrl(bs.species)))));
}

export function stageScreen(app: App, lineId: string, onStart: (stageId: string) => void, onBack?: () => void) {
  const grid = h('div', { class: 'stages' });
  for (const st of STAGES) {
    const open = stageUnlocked(app.save, st.id) && (!app.eliteMode || (app.save.cleared[st.id] ?? 0) > 0);
    const clears = app.save.cleared[st.id] ?? 0;
    const best = app.save.bestTimes[st.id];
    const stars = Math.round(st.difficulty * 1.5);
    const el = h('button', {
      class: `panel stage${open ? '' : ' locked'}`, 'data-nav': true,
      onclick: () => { if (open) { audio.sfx('select'); onStart(st.id); } else { audio.sfx('error'); toast('Locked', 'Clear the previous stage to unlock.'); } },
    },
      stageSwatch(st),
      h('div', { class: 'body' },
        h('h3', null, open ? st.name : '???'),
        h('div', { class: 'hint' }, open ? st.subtitle : 'Clear the previous stage to unlock.'),
        h('div', { class: 'row mt', style: 'flex-wrap:wrap;gap:4px' }, st.types.map(typeBadge)),
        open ? matchupHint(lineId, st.types) : null,
        open ? waveStrip(st) : null,
        h('div', { class: 'row mt' }, h('span', { class: 'stars' }, '★'.repeat(stars) + '☆'.repeat(Math.max(0, 5 - stars))), h('span', { class: 'spacer' }),
          h('span', { class: 'hint' }, clears ? `✔ Cleared ×${clears}` : best ? `Best ${fmtTime(best)}` : '')),
      ));
    if (st.id === app.save.lastStage && open) el.setAttribute('data-autofocus', '');
    grid.append(el);
  }
  const line = LINE[lineId];
  const anyClear = Object.keys(app.save.cleared).length > 0;
  const eliteToggle = anyClear ? h('label', { class: 'row panel', style: 'padding:8px 12px;margin-bottom:12px;gap:8px' },
    h('input', { type: 'checkbox', class: 'toggle', checked: app.eliteMode, onchange: (e: Event) => { app.eliteMode = (e.target as HTMLInputElement).checked; app.show(stageScreen(app, lineId, onStart, onBack)); } }),
    h('b', null, 'Elite mode'), h('span', { class: 'hint' }, 'Cleared routes only — tougher waves, ×1.75 ₽, ×1.5 friendship')) : null;
  return screen('',
    topbar('Choose a route', onBack ?? (() => app.show(selectScreen(app, (l) => app.show(stageScreen(app, l, onStart)))))),
    h('div', { class: 'hint', style: 'color:#fff;margin-bottom:12px' }, `Partner: ${line.name}. Routes are themed around types — bring moves that hit them super effectively!`),
    eliteToggle,
    grid,
  );
}

// ─────────────────────────── shop ───────────────────────────

type MartTab = ShopCat | 'tms';
/** Remembered across visits so returning to the Mart lands on the aisle you were browsing. */
let martTab: MartTab = 'stats';

export function shopScreen(app: App) {
  const root = screen('');
  const render = (focusSel?: string) => {
    const s = app.save;
    root.innerHTML = '';

    const tabBtn = (id: MartTab, icon: string, name: string, have: number, total: number, buyable: boolean) =>
      btn([img(assets.itemUrl(icon)), name, h('span', { class: `tab-count${buyable ? ' buyable' : ''}` }, `${have}/${total}`)],
        () => { if (martTab !== id) { martTab = id; render(`[data-tab="${id}"]`); } },
        `small mart-tab${martTab === id ? ' primary' : ''}`, { 'data-tab': id });
    const tabs = h('div', { class: 'mart-tabs' },
      SHOP_CATS.map((c) => {
        const ups = SHOP.filter((u) => u.cat === c.id);
        const have = ups.reduce((n, u) => n + (s.shop[u.id] ?? 0), 0);
        const total = ups.reduce((n, u) => n + u.maxRank, 0);
        const buyable = ups.some((u) => (s.shop[u.id] ?? 0) < u.maxRank && s.money >= upgradeCost(u, s.shop[u.id] ?? 0));
        return tabBtn(c.id, c.icon, c.name, have, total, buyable);
      }),
      tabBtn('tms', 'tm-normal', 'TM Case', s.tms.length, TM_LIST.length, TM_LIST.some((m) => !s.tms.includes(m.id)) && s.money >= TM_COST),
    );

    const grid = h('div', { class: 'shop-grid' });
    let blurb: string;
    if (martTab === 'tms') {
      blurb = 'Owned TMs that are switched ON can appear as level-up moves for every Pokémon.';
      for (const m of TM_LIST) {
        const owned = s.tms.includes(m.id);
        const off = s.tmsOff.includes(m.id);
        grid.append(h('div', { class: `panel upg${owned && off ? ' off' : ''}` },
          moveDisc(m.id, 'ic tm shop-tm'),
          h('div', { class: 'nm' }, `TM ${m.name}`),
          h('div', null, typeBadge(m.type), ' ', catBadge(m.cat)),
          h('div', { class: 'ds' }, m.desc),
          owned
            ? btn(off ? 'OFF — click to enable' : 'ON — click to disable', () => {
              s.tmsOff = off ? s.tmsOff.filter((x) => x !== m.id) : [...s.tmsOff, m.id];
              audio.sfx('click');
              app.persist();
              render(`[data-id="${m.id}"]`);
            }, 'small', { 'data-id': m.id })
            : btn(`₽${TM_COST}`, () => {
              if (s.money < TM_COST) { audio.sfx('error'); return; }
              s.money -= TM_COST;
              s.tms.push(m.id);
              audio.sfx('buy');
              app.persist();
              render(`[data-id="${m.id}"]`);
            }, 'small', { disabled: s.money < TM_COST, 'data-id': m.id }),
        ));
      }
    } else {
      blurb = SHOP_CATS.find((c) => c.id === martTab)!.blurb;
      for (const u of SHOP.filter((x) => x.cat === martTab)) {
        const rank = s.shop[u.id] ?? 0;
        const max = rank >= u.maxRank;
        const cost = upgradeCost(u, rank);
        grid.append(h('div', { class: 'panel upg' },
          img(assets.itemUrl(u.icon)),
          h('div', { class: 'nm' }, u.name),
          h('div', { class: 'pips' }, Array.from({ length: u.maxRank }, (_, i) => h('i', { class: i < rank ? 'on' : '' }))),
          h('div', { class: 'ds' }, rank ? u.desc(rank) : `Next: ${u.desc(1)}`, !max && rank ? h('div', null, `Next: ${u.desc(rank + 1)}`) : null),
          btn(max ? 'MAXED' : `₽${cost.toLocaleString()}`, () => {
            if (max || s.money < cost) { audio.sfx('error'); return; }
            s.money -= cost;
            s.shop[u.id] = rank + 1;
            audio.sfx('buy');
            app.announce(checkAchievements(s));
            app.persist();
            render(`[data-id="${u.id}"]`);
          }, 'small', { disabled: max || s.money < cost, 'data-id': u.id }),
        ));
      }
    }

    const spent = SHOP.reduce((acc, u) => { let t = 0; for (let r = 0; r < (s.shop[u.id] ?? 0); r++) t += upgradeCost(u, r); return acc + t; }, 0);
    root.append(
      topbar('Poké Mart', () => app.goTitle(), moneyChip(app)),
      tabs,
      h('div', { class: 'hint mart-blurb' }, blurb),
      grid,
      h('div', { class: 'mt' }, btn(`Refund all upgrades (₽${spent.toLocaleString()})`, () => {
        if (!spent) return;
        s.money += spent;
        s.shop = {};
        app.persist();
        render();
      }, 'small')),
    );
    // Keep keyboard/gamepad focus in place across re-renders. A button that just became
    // disabled (maxed, or now unaffordable) can't take focus, so fall back to the active tab.
    if (focusSel) {
      const el = root.querySelector(focusSel) as HTMLButtonElement | null;
      (el && !el.disabled ? el : root.querySelector(`[data-tab="${martTab}"]`) as HTMLElement | null)?.focus();
    }
  };
  render();
  root.querySelector<HTMLElement>(`[data-tab="${martTab}"]`)?.setAttribute('data-autofocus', '');
  return root;
}

// ─────────────────────────── achievements & dex ───────────────────────────

function achIcon(icon: string) {
  return icon.startsWith('species:') ? assets.portraitUrl(icon.slice(8)) : assets.itemUrl(icon);
}

export function achievementsScreen(app: App) {
  const list = h('div', { class: 'ach-list' });
  const done = ACHIEVEMENTS.filter((a) => app.save.achievements[a.id]);
  for (const a of ACHIEVEMENTS) {
    const ok = !!app.save.achievements[a.id];
    list.append(h('div', { class: `panel ach${ok ? ' done' : ' locked'}`, 'data-nav': true, tabindex: 0 },
      img(achIcon(a.icon)), h('div', { class: 'nm' }, ok ? `✔ ${a.name}` : a.name), h('div', { class: 'ds' }, a.desc), h('div', { class: 'rw' }, rewardText(a.reward))));
  }
  return screen('', topbar(`Achievements ${done.length}/${ACHIEVEMENTS.length}`, () => app.goTitle()), list);
}

export function dexScreen(app: App, tab: 'mons' | 'moves' | 'items' = 'mons') {
  const seen = Object.keys(app.save.seen).length;
  const tabs = h('div', { class: 'row', style: 'margin-bottom:12px;flex-wrap:wrap;justify-content:center' },
    btn('Pokémon', () => app.show(dexScreen(app, 'mons')), tab === 'mons' ? 'small primary' : 'small'),
    btn('Moves', () => app.show(dexScreen(app, 'moves')), tab === 'moves' ? 'small primary' : 'small'),
    btn('Held items', () => app.show(dexScreen(app, 'items')), tab === 'items' ? 'small primary' : 'small'),
  );
  let body: HTMLElement;
  if (tab === 'mons') {
    body = h('div', { class: 'dex-grid' });
    for (const sp of [...SPECIES_LIST].sort((a, b) => a.dex - b.dex)) {
      const isSeen = !!app.save.seen[sp.id] || app.save.lines.some((l) => LINE[l].stages.includes(sp.id));
      const def = app.save.defeated[sp.id] ?? 0;
      body.append(h('div', { class: `panel dex${isSeen ? '' : ' unseen'}` },
        img(isSeen ? assets.portraitUrl(sp.id) : assets.itemUrl('poke-ball')),
        h('div', null, `#${String(sp.dex).padStart(3, '0')}`),
        h('div', null, isSeen ? sp.name : '???'),
        isSeen ? h('div', { class: 'row', style: 'justify-content:center;gap:2px;flex-wrap:wrap' }, sp.types.map((t) => h('span', { class: 'type', style: `background:${TYPE_COLORS[t]};font-size:6px;padding:2px 3px` }, t))) : null,
        def ? h('div', { class: 'hint' }, `⚔ ${def.toLocaleString()}`) : null,
      ));
    }
  } else if (tab === 'moves') {
    body = h('div', { class: 'ach-list' });
    const order = [...MOVE_LIST].sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || Number(!!a.mastery) - Number(!!b.mastery));
    for (const m of order) {
      const learners = LINES.filter((l) => l.starter === m.id || l.learnset.some((e) => e.move === m.id) || Object.values(l.formMoves ?? {}).some((ms) => ms.includes(m.id)));
      const tm = (TM_LIST as { id: string }[]).some((t) => t.id === m.id);
      body.append(h('div', { class: `panel ach${m.mastery ? ' done' : ''}` },
        moveIcon(m.id, '', 'move-ic dex-ic'),
        h('div', { class: 'nm' }, m.mastery ? img(uiIcon('mastery'), 'mastery-mark') : null, m.name, ' ', typeBadge(m.type), ' ', catBadge(m.cat)),
        h('div', { class: 'ds' }, m.desc),
        h('div', { class: 'rw' }, m.mastery
          ? `Master ${MOVES[m.mastery.from].name} (Lv8) + hold ${ITEMS[m.mastery.item].name}, then open a treasure.`
          : [learners.length ? `Learned by: ${learners.map((l) => l.name).join(', ')}` : '', tm ? (learners.length ? ' · TM' : 'TM') : ''].join('') || '—'),
      ));
    }
  } else {
    body = h('div', { class: 'ach-list' });
    for (const it of ITEM_LIST) {
      body.append(h('div', { class: 'panel ach' }, img(assets.itemUrl(it.id)), h('div', { class: 'nm' }, it.name), h('div', { class: 'ds' }, it.desc(1)), h('div', { class: 'rw' }, `At Lv5: ${it.desc(5)}`)));
    }
  }
  return screen('', topbar(tab === 'mons' ? `Pokédex — seen ${seen}/${SPECIES_LIST.length}` : tab === 'moves' ? `Moves (${MOVE_LIST.length})` : 'Held items', () => app.goTitle()), tabs, body);
}

// ─────────────────────────── options & credits ───────────────────────────

export function optionsScreen(app: App, onBack: () => void) {
  const o = app.save.options;
  const slider = (label: string, val: number, set: (v: number) => void, min = 0) =>
    h('div', { class: 'opt-row' }, h('span', null, label), h('input', { type: 'range', min, max: 1, step: 0.05, value: val, oninput: (e: Event) => { set(+(e.target as HTMLInputElement).value); app.applyOptions(); app.persist(); } }));
  const check = (label: string, val: boolean, set: (v: boolean) => void) =>
    h('div', { class: 'opt-row' }, h('span', null, label), h('input', { type: 'checkbox', class: 'toggle', checked: val, onchange: (e: Event) => { set((e.target as HTMLInputElement).checked); app.applyOptions(); app.persist(); } }));
  const io = h('textarea', { placeholder: 'Paste a save code here to import' });
  return screen('',
    topbar('Options', onBack),
    h('div', { class: 'panel', style: 'width:min(640px,100%)' },
      h('div', { class: 'opt-row' }, h('span', null, 'Trainer name'), h('input', { type: 'text', maxlength: 12, value: o.name, oninput: (e: Event) => { o.name = (e.target as HTMLInputElement).value.slice(0, 12); app.persist(); } })),
      slider('Music', o.music, (v) => (o.music = v)),
      slider('Sound effects', o.sfx, (v) => (o.sfx = v)),
      check('Screen shake', o.shake, (v) => (o.shake = v)),
      check('Damage numbers', o.damageNumbers, (v) => (o.damageNumbers = v)),
      slider('Effect opacity', o.fxOpacity, (v) => (o.fxOpacity = v), 0.25),
      h('div', { class: 'opt-row' }, h('span', null, 'Max damage numbers'),
        h('select', { onchange: (e: Event) => { o.numberCap = +(e.target as HTMLSelectElement).value as Options['numberCap']; app.applyOptions(); app.persist(); } },
          [40, 80, 160].map((n) => h('option', { value: n, selected: o.numberCap === n }, String(n))))),
      check('Auto-pick upgrades', o.autoPick, (v) => (o.autoPick = v)),
      check('Damage tracker (T)', o.damageMeter, (v) => (o.damageMeter = v)),
      check('Show FPS', o.showFps, (v) => (o.showFps = v)),
      h('div', { class: 'mt' }, h('b', null, 'Save data')),
      h('div', { class: 'row mt', style: 'flex-wrap:wrap' },
        btn('Export to clipboard', () => {
          const code = exportSave(app.save);
          void navigator.clipboard?.writeText(code).then(() => toast('Saved', 'Save code copied to clipboard.'), () => { io.value = code; });
          io.value = code;
        }, 'small'),
        btn('Import', () => {
          const s = importSave(io.value);
          if (!s) { audio.sfx('error'); toast('Import failed', 'That code doesn’t look like a save.'); return; }
          app.save = s; app.persist(); app.applyOptions(); toast('Imported', 'Save loaded.');
        }, 'small'),
        btn('Reset progress', () => {
          if (!confirm('Erase ALL progress? This cannot be undone.')) return;
          app.save = freshSave(); app.persist(); app.applyOptions(); toast('Reset', 'Progress erased.');
        }, 'small'),
      ),
      io,
    ),
  );
}

export function creditsScreen(app: App) {
  const list = h('div', { class: 'credits-list' });
  const root = screen('',
    topbar('Credits', () => app.goTitle()),
    h('div', { class: 'panel', style: 'width:min(900px,100%)' },
      h('p', null, h('b', null, 'Pokémon Survivors'), ' is a free, non-commercial fan game. Pokémon and all related names are © Nintendo, Creatures Inc. and GAME FREAK inc. This project is not affiliated with or endorsed by them.'),
      h('p', null, 'Pokémon sprites & portraits: ', h('b', null, 'PMD Sprite Collab'), ' (sprites.pmdcollab.org), licensed CC BY-NC 4.0, original Mystery Dungeon art © Spike Chunsoft. Contributors per species are listed below.'),
      h('p', null, 'Item icons: PokeAPI sprites repository. Music & sound effects: original, synthesized in your browser. World tiles: original pixel art, painted procedurally. Fonts: Press Start 2P (CodeMan38), Pixelify Sans (Stefie Justprince), SIL OFL.'),
      list,
    ),
  );
  void fetch(`${ASSET_BASE}credits.json`).then((r) => r.json()).then((credits: { species: string; sprite: string[]; portrait: string[]; shinySprite: string[] }[]) => {
    for (const c of credits) {
      list.append(h('div', null, h('b', null, c.species), `: sprite ${c.sprite.join(', ') || 'unknown'}; portrait ${c.portrait.join(', ') || 'unknown'}${c.shinySprite.length ? `; shiny ${c.shinySprite.join(', ')}` : ''}`));
    }
  });
  return root;
}

// ─────────────────────────── pause & results ───────────────────────────

export function pauseScreen(app: App, resume: () => void, quit: () => void) {
  const s = app.session!;
  const me = s.world.players[s.localId];
  const root = h('div', { class: 'screen dim' },
    h('h2', null, s.coop ? 'Menu (game continues)' : 'Paused'),
    h('div', { class: 'panel', style: 'width:min(560px,100%)' },
      h('div', { class: 'row' }, img(assets.portraitUrl(me.speciesId, me.shiny)), h('div', null, h('b', null, SPECIES[me.speciesId].name), h('div', { class: 'hint' }, `${ABILITIES[me.ability].name}: ${ABILITIES[me.ability].desc}`))),
      h('div', { class: 'mt' }, me.moves.map((m) => h('div', null, typeBadge(MOVES[m.id].type), ` ${MOVES[m.id].name} ${MOVES[m.id].mastery ? '★' : `Lv${m.level}`}`, h('span', { class: 'hint' }, ` — ${Math.round(m.dmgDealt).toLocaleString()} dmg`)))),
      h('div', { class: 'row mt', style: 'flex-wrap:wrap' }, btn('Resume', resume, 'primary', { 'data-autofocus': true, 'data-back': true }), btn('Options', () => {
        const opt = optionsScreen(app, () => opt.remove());
        opt.style.zIndex = '20';
        app.ui.appendChild(opt);
        requestAnimationFrame(() => app.nav.focusFirst());
      }), btn(s.coop ? 'Leave game' : 'Give up', quit)),
    ),
  );
  root.classList.remove('screen');
  root.classList.add('screen');
  return root;
}

export function resultsScreen(app: App, data: { session: RunSession; summary: RunSummary; rewards: RunRewards; me: Player }) {
  const { summary: r, rewards, me } = data;
  app.announce(rewards.newAchievements);
  if (rewards.shinyUnlocked) toast('Shiny unlocked!', `${LINE[r.lineId].name} can now appear as a Shiny!`, assets.portraitUrl(LINE[r.lineId].stages[0], true));
  const moves = [...me.moves].sort((a, b) => b.dmgDealt - a.dmgDealt);
  const totalDmg = Math.max(1, me.dmgDealt);
  const title = r.cleared ? 'STAGE CLEAR!' : 'You blacked out…';
  return screen('',
    h('div', { class: `big-title ${r.cleared ? 'win' : 'lose'}` }, title, r.elite ? h('div', { class: 'hint', style: 'color:#ffd94a;font-size:12px;margin-top:8px' }, 'ELITE MODE') : null),
    h('div', { class: 'results' },
      h('div', { class: 'panel col' },
        h('div', { class: 'row' }, img(assets.portraitUrl(me.speciesId, me.shiny)), h('div', null, h('b', null, SPECIES[me.speciesId].name), h('div', { class: 'hint' }, data.session.stage.name))),
        h('div', { class: 'kv' },
          'Time survived', h('b', null, fmtTime(r.time)),
          'Level', h('b', null, r.level),
          'Pokémon defeated', h('b', null, r.kills.toLocaleString()),
          'Bosses defeated', h('b', null, r.bosses),
          'Super-effective hits', h('b', null, r.superEff.toLocaleString()),
          'Damage dealt', h('b', null, Math.round(me.dmgDealt).toLocaleString()),
          'Poké Dollars earned', h('b', null, `₽${rewards.money.toLocaleString()}`),
          'Friendship', h('b', null, `+${rewards.friendship}`),
        ),
        rewards.newBest ? h('div', { class: 'hint' }, '⭐ New best time on this route!') : null,
      ),
      h('div', { class: 'panel col' },
        h('b', null, 'Moves'),
        h('table', { class: 'dmg' }, moves.map((m) => h('tr', null,
          h('td', null, typeBadge(MOVES[m.id].type), ' ', MOVES[m.id].name, MOVES[m.id].mastery ? ' ★' : ` Lv${m.level}`),
          h('td', { class: 'n' }, Math.round(m.dmgDealt).toLocaleString()),
          h('td', { class: 'n' }, `${Math.round((m.dmgDealt / totalDmg) * 100)}%`),
          h('td', { class: 'n' }, `${m.kills.toLocaleString()} KO`),
        ))),
        h('b', { class: 'mt' }, 'Held items'),
        h('div', { class: 'row', style: 'flex-wrap:wrap' }, me.items.map((it) => h('span', { class: 'row', style: 'gap:2px' }, img(assets.itemUrl(it.id)), `${ITEMS[it.id].name} Lv${it.level}`))),
        rewards.newAchievements.length ? h('b', { class: 'mt' }, 'New achievements') : null,
        ...rewards.newAchievements.map((a) => h('div', null, `✔ ${a.name} — `, h('span', { class: 'hint' }, rewardText(a.reward)))),
      ),
    ),
    h('div', { class: 'row mt', style: 'flex-wrap:wrap;justify-content:center' },
      data.session.coop ? null : btn('Play again', () => void app.startSolo(r.lineId, r.stageId, r.elite), 'primary', { 'data-autofocus': true }),
      btn('Poké Mart', () => app.show(shopScreen(app))),
      btn('Main menu', () => app.goTitle(), '', { 'data-back': true }),
    ),
  );
}
