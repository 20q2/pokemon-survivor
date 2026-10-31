import { audio } from './audio/audio.ts';
import { LINE, LINES, MEGA, SPECIES, STARTER_LINES, fullyEvolved, lineSpecies } from './data/pokedex.ts';
import { STAGE } from './data/stages.ts';
import { TYPES } from './data/types.ts';
import { MOVES } from './data/moves.ts';
import { Input } from './engine/input.ts';
import { botChoose, botSteer, autoChoice } from './game/bot.ts';
import { LocalSession, summarize, type RunSession } from './game/session.ts';
import { DIG_RADIUS, type PlayerInit } from './game/sim.ts';
import type { GameEvent } from './game/types.ts';
import { applyRun, checkAchievements, type RunRewards } from './meta/progression.ts';
import type { RunSummary } from './meta/achievements.ts';
import { loadSave, storeSave, type SaveData } from './meta/save.ts';
import { heartbeatInterval } from './render/danger.ts';
import { metaBonuses } from './meta/shop.ts';
import { assets } from './render/assets.ts';
import { Renderer } from './render/renderer.ts';
import { banner, MenuNav, notice, toast, uiIcon, waveBanner } from './ui/dom.ts';
import { chestShow, preloadChestFaces, type ChestShow } from './ui/chest.ts';
import { CHEST_BALL, CHEST_NAME } from './game/types.ts';
import { Hud } from './ui/hud.ts';
import { LevelUpUI } from './ui/runui.ts';
import { hideTip } from './ui/tips.ts';
import * as screens from './ui/menus.ts';
import type { NetHost, NetClient } from './net/net.ts';

export class App {
  save: SaveData;
  readonly renderer: Renderer;
  readonly input: Input;
  readonly nav: MenuNav;
  readonly hud = new Hud();
  readonly ui: HTMLElement;
  session: RunSession | null = null;
  private attract: LocalSession | null = null;
  /** Sprites for the current title-screen demo; the boot screen waits on the first one. */
  attractReady: Promise<void> = Promise.resolve();
  private levelUp: LevelUpUI;
  private last = performance.now();
  private pauseEl: HTMLElement | null = null;
  private chest: ChestShow | null = null;
  private chestAt = 0;
  private ended = false;
  private endTimer = 0;
  private bossMusic = false;
  private autoT = 0;
  private heartT = 0;
  private digT = 0;
  private tutorial: { at: number; text: string }[] = [];
  private alphasDown = 0;
  private offersSeen: unknown = null;

  /** Reveal moves in a line's move pool (shown on the partner select screen). */
  private discover(lineId: string, moves: string[]) {
    const seen = (this.save.movesSeen[lineId] ??= []);
    for (const m of moves) {
      if (seen.includes(m)) continue;
      seen.push(m);
      this.newMoves.push(m);
    }
  }
  /** Moves first revealed to the move pool during the current run (for the results screen). */
  private newMoves: string[] = [];
  /** Last chosen Elite-mode toggle. */
  eliteMode = false;
  net: NetHost | NetClient | null = null;
  /** Called every frame (screens use it for sprite previews). */
  onFrame: ((dt: number) => void) | null = null;

  constructor() {
    this.save = loadSave();
    this.ui = document.getElementById('ui')!;
    this.renderer = new Renderer(document.getElementById('game') as HTMLCanvasElement);
    this.input = new Input(document.getElementById('game')!);
    this.nav = new MenuNav(this.ui);
    this.levelUp = new LevelUpUI(this.ui);
    this.applyOptions();
    this.hud.onPause = () => this.togglePause();
    this.hud.onMeterToggle = () => this.toggleMeter();
    this.hud.meter.onTab = (t) => { if (this.save.options.meterTab !== t) { this.save.options.meterTab = t; this.persist(); } };
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.session && !this.session.coop && !this.session.paused && this.session.phase() === 'play') this.togglePause();
    });
  }

  persist() {
    storeSave(this.save);
  }

  applyOptions() {
    const o = this.save.options;
    audio.setVolumes(o.music, o.sfx);
    this.renderer.shakeEnabled = o.shake;
    this.renderer.showNumbers = o.damageNumbers;
    this.renderer.fxOpacity = o.fxOpacity;
    this.renderer.numbers.cap = o.numberCap;
    this.hud.showFps = o.showFps;
    this.hud.meter.show(o.damageMeter);
    if (this.hud.meter.tab !== o.meterTab) this.hud.meter.setTab(o.meterTab);
  }

  /** Show/hide the damage tracker (T key or the DMG button); remembered in the options. */
  toggleMeter() {
    this.save.options.damageMeter = !this.save.options.damageMeter;
    this.applyOptions();
    this.persist();
  }

  /** Replace all menu screens with one element. */
  show(el: HTMLElement | null) {
    hideTip();
    this.ui.querySelectorAll('.screen').forEach((s) => s.remove());
    if (el) {
      this.ui.appendChild(el);
      requestAnimationFrame(() => this.nav.focusFirst());
    }
  }

  start() {
    // Earlier sessions may have earned achievements from shop purchases etc.
    checkAchievements(this.save);
    this.persist();
    this.goTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  goTitle() {
    this.endRun();
    this.startAttract();
    audio.playMusic('title');
    this.show(screens.titleScreen(this));
  }

  // ─────────────────────────── attract mode ───────────────────────────

  private startAttract() {
    const lines = this.save.lines.length ? this.save.lines : STARTER_LINES;
    const lineId = lines[Math.floor(Math.random() * lines.length)];
    const stages = ['viridian', 'mtmoon', 'seafoam', 'powerplant'];
    this.attract = new LocalSession({
      stageId: stages[Math.floor(Math.random() * stages.length)],
      players: [{ name: 'demo', lineId, shiny: Math.random() < 0.1, meta: metaBonuses({ 'pp-up': 5, 'hp-up': 5, iron: 5 }), tms: [] }],
    });
    this.renderer.reset();
    this.renderer.localId = 0;
    this.attractReady = this.preload(this.attract).catch((e) => console.warn('attract preload', e));
  }

  private stepAttract(dt: number) {
    const s = this.attract!;
    const sim = s.sim;
    if (sim.phase === 'levelup') for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, botChoose(sim, p));
    if (sim.phase === 'over' || sim.phase === 'victory' || sim.time > 240) { this.startAttract(); return; }
    const p = sim.players[0];
    const m = botSteer(sim, p);
    s.step(dt, m.x, m.y, this.renderer.viewW, this.renderer.viewH);
    for (const ev of s.drainEvents()) this.renderer.onEvent(ev, sim);
  }

  // ─────────────────────────── runs ───────────────────────────

  playerInit(lineId: string): PlayerInit {
    return {
      name: this.save.options.name || 'Trainer',
      lineId,
      shiny: this.save.shinyOn.includes(lineId),
      meta: metaBonuses(this.save.shop, this.save.friendship[lineId] ?? 0),
      tms: this.save.tms.filter((t) => !this.save.tmsOff.includes(t)),
    };
  }

  async preload(session: RunSession) {
    const w = session.world;
    const ids = new Set<string>();
    for (const p of w.players) {
      const line = LINE[p.lineId];
      for (const s of lineSpecies(line)) ids.add(s);
    }
    const st = session.stage;
    for (const w of st.waves) for (const e of w.species) ids.add(e.species);
    for (const s of [...st.elites, st.swarm, ...st.bosses.map((b) => b.species), ...st.bosses.flatMap((b) => b.minions ?? []), 'chansey', 'meowth']) ids.add(s);
    const shiny = new Set(w.players.filter((p) => p.shiny).flatMap((p) => lineSpecies(LINE[p.lineId])));
    await Promise.all([...ids].map((id) => assets.load(id, false).then(() => (shiny.has(id) ? assets.load(id, true) : null))));
    for (const icon of ['exp-candy-s', 'exp-candy-m', 'exp-candy-l', 'exp-candy-xl', 'oran-berry', 'sitrus-berry', 'magnet', 'max-repel', 'poke-ball', 'rare-candy', 'nugget']) assets.itemImage(icon);
  }

  async startSolo(lineId: string, stageId: string, elite = this.eliteMode) {
    this.eliteMode = elite;
    this.save.lastLine = lineId;
    this.save.lastStage = stageId;
    this.persist();
    const s = new LocalSession({ stageId, elite, players: [this.playerInit(lineId)], eliteChests: this.save.stats.eliteChests });
    await this.preload(s);
    this.beginSession(s);
  }

  beginSession(s: RunSession) {
    this.attract = null;
    this.session = s;
    this.ended = false;
    this.endTimer = 0;
    this.bossMusic = false;
    this.renderer.reset();
    this.renderer.localId = s.localId;
    this.show(null);
    this.hud.mount();
    audio.playMusic(STAGE[s.stage.id].music);
    const me = s.world.players[s.localId];
    banner(`Go! ${SPECIES[me.speciesId].name.toUpperCase()}!`, false, 1800);
    this.alphasDown = 0;
    this.newMoves = [];
    this.heartT = 0;
    preloadChestFaces();
    this.tutorial = this.save.stats.runs === 0 ? [
      { at: 2.5, text: 'Moves fire automatically — just move to survive!' },
      { at: 9, text: 'Grab Exp. Candy to level up and learn new moves.' },
      { at: 20, text: 'Super-effective moves deal double damage. Mind the types!' },
      { at: 45, text: 'Max a move, hold its type item, then open a treasure to master it!' },
    ] : [];
  }

  /** Low-HP heartbeat; UI-side (not the sim) since it is local feedback only. */
  private updateHeartbeat(s: RunSession, dt: number) {
    const me = s.world.players[s.localId];
    const every = me && !me.fainted && s.phase() === 'play' && !s.paused ? heartbeatInterval(me.hp / me.stats.maxHp) : 0;
    if (!every) { this.heartT = 0; return; }
    this.heartT -= dt;
    if (this.heartT <= 0) { audio.sfx('heartbeat'); this.heartT = every; }
  }

  /** Scraping sounds while the local player stands on buried treasure. */
  private updateDigSound(s: RunSession, dt: number) {
    const me = s.world.players[s.localId];
    const digging = !!me && !me.fainted && s.phase() === 'play' && !s.paused &&
      s.world.pickups.some((pk) => pk.kind === 'dig' && !pk.dead && (pk.x - me.x) ** 2 + (pk.y - me.y) ** 2 < DIG_RADIUS * DIG_RADIUS);
    if (!digging) { this.digT = 0; return; }
    this.digT -= dt;
    if (this.digT <= 0) { audio.sfx('dig'); this.digT = 0.3; }
  }

  endRun() {
    this.session?.dispose();
    this.session = null;
    this.hud.hide();
    this.levelUp.close();
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.chest?.dispose();
    this.chest = null;
    if (this.net) {
      this.net.close();
      this.net = null;
    }
  }

  togglePause() {
    const s = this.session;
    if (!s || this.ended) return;
    if (this.pauseEl) {
      this.pauseEl.remove();
      this.pauseEl = null;
      s.paused = false;
      return;
    }
    s.paused = true;
    this.pauseEl = screens.pauseScreen(this, () => this.togglePause(), () => this.quitRun());
    this.ui.appendChild(this.pauseEl);
    requestAnimationFrame(() => this.nav.focusFirst());
  }

  quitRun() {
    // Quitting still banks progress, like fainting.
    this.finishRun(false, true);
  }

  private finishRun(cleared: boolean, quit = false) {
    const s = this.session;
    if (!s || this.ended) return;
    this.ended = true;
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.levelUp.close();
    const me = s.world.players[s.localId];
    const defeated = s.defeated();
    const summary: RunSummary = summarize(s, me, cleared, {
      bosses: (s.world as unknown as { bossesDefeated?: number }).bossesDefeated ?? 0,
      died: !cleared && !quit,
      defeatedChansey: (defeated.get('chansey') ?? 0) > 0,
      alphas: this.alphasDown,
    });
    const rewards: RunRewards = applyRun(this.save, summary, s.seen(), defeated);
    this.persist();
    audio.stopMusic();
    audio.sfx(cleared ? 'victory' : 'gameover');
    const snapshot = { session: s, summary, rewards, me, newMoves: this.newMoves };
    this.hud.hide();
    setTimeout(() => {
      this.endRun();
      this.startAttract();
      audio.playMusic('menu');
      this.show(screens.resultsScreen(this, snapshot));
    }, quit ? 50 : 900);
  }

  // ─────────────────────────── events ───────────────────────────

  private handleEvent(ev: GameEvent, s: RunSession) {
    const me = s.localId;
    switch (ev.e) {
      case 'hit':
        audio.sfx(ev.eff > 1 ? 'super' : 'hit');
        if (ev.crit) audio.sfx('crit');
        break;
      case 'kill':
        audio.sfx('kill');
        if (ev.shiny) audio.sfx('shiny');
        break;
      case 'fire':
        if (ev.player === me) audio.sfx('fire', TYPES.indexOf(ev.type));
        break;
      case 'pickup':
        if (ev.player !== me) break;
        if (ev.kind === 'candy') audio.sfx('candy');
        else if (ev.kind === 'coin') audio.sfx('coin');
        else if (ev.kind === 'oran' || ev.kind === 'sitrus') audio.sfx('heal');
        else if (ev.kind === 'repel') audio.sfx('repel');
        else if (ev.kind === 'magnet' || ev.kind === 'rare-candy') audio.sfx('levelup');
        break;
      case 'hurt':
        if (ev.player === me) audio.sfx('hurt');
        break;
      case 'evolve': {
        audio.sfx('evolve');
        setTimeout(() => audio.sfx('evolved'), 2700);
        break;
      }
      case 'boss':
        banner(`A wild ${SPECIES[ev.species].name.toUpperCase()} appeared!`, true, 3200);
        audio.sfx('boss');
        audio.playMusic(ev.final ? 'final' : 'boss');
        this.bossMusic = true;
        break;
      case 'bossDown':
        banner(ev.final ? `${SPECIES[ev.species].name.toUpperCase()} fainted! STAGE CLEAR!` : `The wild ${SPECIES[ev.species].name.toUpperCase()} fainted!`, false, 2600);
        break;
      case 'chest':
        if (ev.player === me) {
          this.discover(s.world.players[me].lineId, ev.rewards.filter((r) => r.kind === 'move' || r.kind === 'mastery').map((r) => r.id));
          this.chest?.dispose();
          // Closed by the frame loop once the treasure cinematic ends (dismissed or timed out).
          this.chest = chestShow(ev.rewards, ev.tier, s.coop ? null : () => s.skipCine?.());
          this.chestAt = performance.now();
          this.ui.appendChild(this.chest.el);
        } else {
          audio.sfx('chest');
          const p = s.world.players[ev.player];
          const m = ev.rewards.find((r) => r.kind === 'mastery');
          toast('Treasure', m ? `${p?.name} mastered ${MOVES[m.id].name}!` : `${p?.name} opened a ${CHEST_NAME[ev.tier]}.`, assets.itemUrl(CHEST_BALL[ev.tier]));
        }
        break;
      case 'warn':
        banner(ev.text, false, 2200);
        audio.sfx('warn');
        break;
      case 'wave':
        waveBanner(ev.text, assets.portraitUrl(ev.species));
        audio.sfx('wave');
        break;
      case 'toast': // game event; unrelated to the top-right toast() helper
        notice(ev.text);
        audio.sfx('tick');
        break;
      case 'milestone': // a reward beat, not a danger: the quiet notice, never the red banner
        notice(`${ev.kills.toLocaleString()} Pokémon defeated!`);
        audio.sfx('milestone');
        break;
      case 'wipeout':
        audio.sfx('crit');
        break;
      case 'faint':
        audio.sfx('faint');
        if (ev.player === me && s.coop) banner('You fainted! Stand by a teammate to be revived.', false, 3500);
        else if (ev.player !== me) banner(`${s.world.players[ev.player]?.name} fainted! Go revive them!`, false, 3000);
        break;
      case 'revive':
        audio.sfx('revive');
        break;
      case 'learn':
        if (ev.player === me) {
          this.discover(s.world.players[me].lineId, [ev.move]);
          const p = s.world.players[me];
          banner(`${SPECIES[p.speciesId].name.toUpperCase()} learned ${MOVES[ev.move].name.toUpperCase()}!`, false, 1800);
        }
        break;
      case 'boom':
        audio.sfx('boom');
        break;
      case 'raid':
        audio.sfx('raid', ev.big ? 1 : 0);
        break;
      case 'mega': {
        audio.sfx('mega');
        const p = s.world.players[ev.player];
        const mg = MEGA[ev.species];
        if (ev.player !== me) toast('Mega Evolution!', `${p?.name}'s ${mg?.name ?? SPECIES[ev.species].name} is unleashed!`, assets.portraitUrl(mg?.id ?? ev.species, p?.shiny));
        break;
      }
      case 'megaEnd':
        if (ev.player === me) banner('Mega Evolution wore off…', false, 1600);
        break;
      case 'megaStone': {
        audio.sfx('mastery');
        const p = s.world.players[ev.player];
        const evolved = s.world.players.some((x) => fullyEvolved(x.lineId, x.speciesId));
        banner(ev.player === me ? 'You found the MEGA STONE!' : `${p?.name} found the MEGA STONE!`, false, 2600);
        toast('Mega Stone', evolved ? 'Fight to charge the rainbow meter. When it fills, your partner Mega Evolves!' : 'Fully evolve your partner, then fight to charge Mega Evolution.', uiIcon('mega-hires'));
        break;
      }
      case 'poi':
        if (ev.kind === 'cache') toast('Itemfinder', 'Something is buried nearby! Find it on the map and stand on the spot to dig it up.', assets.itemUrl('dowsing-machine'));
        else if (ev.kind === 'mega-stone') { banner('A MEGA STONE is shining somewhere! Check the map!', false, 3200); audio.sfx('shiny'); }
        else notice(`Alpha ${SPECIES[ev.species!].name} spotted nearby!`);
        break;
      case 'alphaDown':
        this.alphasDown++;
        notice(`The Alpha ${SPECIES[ev.species].name} was defeated!`);
        audio.sfx('chest');
        break;
      case 'shiny':
        audio.sfx('shiny');
        banner('Something sparkly appeared… a shiny Pokémon!', false, 2500);
        break;
      default:
        break;
    }
    this.renderer.onEvent(ev, s.world);
  }

  // ─────────────────────────── loop ───────────────────────────

  private frame(t: number) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.input.pollPads();
    this.nav.enabled = !this.session || !!this.pauseEl || this.session.phase() === 'levelup' || !!this.session.offers() || this.ended;
    this.nav.pollPads(dt);
    const s = this.session;
    if (s) {
      if (this.input.consume('KeyT')) this.toggleMeter();
      if (this.input.consume('KeyC')) this.hud.toggleSheet();
      if ((this.input.consume('Escape') || this.input.consume('PadStart') || this.input.consume('KeyP')) && s.phase() !== 'levelup' && !s.offers()) this.togglePause();
      const m = s.paused || this.ended ? { x: 0, y: 0 } : this.input.move();
      s.step(dt, m.x, m.y, this.renderer.viewW, this.renderer.viewH);
      for (const ev of s.drainEvents()) this.handleEvent(ev, s);
      if (this.tutorial.length && s.world.time >= this.tutorial[0].at && s.phase() === 'play') banner(this.tutorial.shift()!.text, false, 3600);
      this.updateHeartbeat(s, dt);
      this.updateDigSound(s, dt);
      if (this.bossMusic && !s.world.enemies.some((e) => e.boss && e.alive)) {
        this.bossMusic = false;
        audio.playMusic(STAGE[s.stage.id].music);
      }
      this.renderer.render(s.world, s.paused ? 0 : dt);
      // The treasure show is global in solo and the opener's own show in co-op (the run goes on around it).
      const show = s.world.cine ?? s.world.shows?.get(s.localId);
      if (this.chest && show?.kind !== 'chest' && performance.now() - this.chestAt > 500) {
        this.chest.dispose();
        this.chest = null;
      }
      if (!this.ended) {
        this.hud.update(s, dt);
        if (this.save.options.autoPick && s.offers()) {
          this.autoT += dt;
          if (this.autoT > 0.35) { this.autoT = 0; s.choose(autoChoice(s)); }
        }
        this.levelUp.sync(s);
        const offers = s.offers();
        if (offers && offers !== this.offersSeen) {
          this.offersSeen = offers;
          const me = s.world.players[s.localId];
          this.discover(me.lineId, offers.filter((o) => o.kind === 'newMove').map((o) => o.id));
        }
        const ph = s.phase();
        if (ph === 'over' || ph === 'victory') {
          if (this.endTimer === 0) {
            const name = SPECIES[s.world.players[s.localId].speciesId].name.toUpperCase();
            if (ph === 'over') { banner(s.coop ? 'Your whole team fainted…' : `${name} fainted!`, false, 2400); audio.stopMusic(); }
          }
          this.endTimer += dt;
          if (this.endTimer > (ph === 'over' ? 2 : 0.6)) this.finishRun(ph === 'victory');
        }
        if (s.lost) {
          toast('Disconnected', 'Lost connection to the host. Your progress was saved.', assets.itemUrl('escape-rope'));
          this.finishRun(false, true);
        }
      }
    } else if (this.attract) {
      this.stepAttract(dt);
      this.renderer.render(this.attract.world, dt);
    }
    this.onFrame?.(dt);
    requestAnimationFrame((tt) => this.frame(tt));
  }

  // ─────────────────────────── helpers for screens ───────────────────────────

  lineUnlocked(id: string) {
    return this.save.lines.includes(id);
  }

  allLines() {
    return LINES;
  }

  announce(achievements: { name: string; icon: string }[]) {
    for (const a of achievements) {
      const icon = a.icon.startsWith('species:') ? assets.portraitUrl(a.icon.slice(8)) : assets.itemUrl(a.icon);
      toast('Achievement unlocked!', a.name, icon);
    }
  }
}

