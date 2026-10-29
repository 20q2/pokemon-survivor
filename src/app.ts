import { audio } from './audio/audio.ts';
import { LINE, LINES, SPECIES, STARTER_LINES } from './data/pokedex.ts';
import { STAGE } from './data/stages.ts';
import { TYPES } from './data/types.ts';
import { MOVES } from './data/moves.ts';
import { Input } from './engine/input.ts';
import { botChoose, botSteer } from './game/bot.ts';
import { LocalSession, summarize, type RunSession } from './game/session.ts';
import type { PlayerInit } from './game/sim.ts';
import type { GameEvent } from './game/types.ts';
import { applyRun, checkAchievements, type RunRewards } from './meta/progression.ts';
import type { RunSummary } from './meta/achievements.ts';
import { loadSave, storeSave, type SaveData } from './meta/save.ts';
import { metaBonuses } from './meta/shop.ts';
import { assets } from './render/assets.ts';
import { Renderer } from './render/renderer.ts';
import { banner, MenuNav, toast } from './ui/dom.ts';
import { Hud } from './ui/hud.ts';
import { chestPopup, LevelUpUI } from './ui/runui.ts';
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
  private levelUp: LevelUpUI;
  private last = performance.now();
  private pauseEl: HTMLElement | null = null;
  private chestEl: HTMLElement | null = null;
  private ended = false;
  private endTimer = 0;
  private bossMusic = false;
  net: NetHost | NetClient | null = null;
  /** Called every frame (screens use it for sprite previews). */
  onFrame: ((dt: number) => void) | null = null;

  constructor() {
    this.save = loadSave();
    this.ui = document.getElementById('ui')!;
    this.renderer = new Renderer(document.getElementById('game') as HTMLCanvasElement);
    this.input = new Input(document.getElementById('game')!);
    this.nav = new MenuNav(this.ui);
    this.levelUp = new LevelUpUI(this.ui, () => undefined);
    this.applyOptions();
    this.hud.onPause = () => this.togglePause();
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
    this.hud.showFps = o.showFps;
  }

  /** Replace all menu screens with one element. */
  show(el: HTMLElement | null) {
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
    void this.preload(this.attract);
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
      tms: [...this.save.tms],
    };
  }

  async preload(session: RunSession) {
    const w = session.world;
    const ids = new Set<string>();
    for (const p of w.players) {
      const line = LINE[p.lineId];
      for (const s of [...line.stages, ...Object.values(line.branch ?? {})]) ids.add(s);
    }
    const st = session.stage;
    for (const pool of [st.pools.early, st.pools.mid, st.pools.late]) for (const e of pool) ids.add(e.species);
    for (const s of [...st.elites, st.swarm, ...st.bosses.map((b) => b.species), ...st.bosses.flatMap((b) => b.minions ?? []), 'chansey', 'meowth']) ids.add(s);
    const shiny = new Set(w.players.filter((p) => p.shiny).flatMap((p) => [...LINE[p.lineId].stages, ...Object.values(LINE[p.lineId].branch ?? {})]));
    await Promise.all([...ids].map((id) => assets.load(id, false).then(() => (shiny.has(id) ? assets.load(id, true) : null))));
    for (const icon of ['exp-candy-s', 'exp-candy-m', 'exp-candy-l', 'exp-candy-xl', 'oran-berry', 'sitrus-berry', 'magnet', 'max-repel', 'poke-ball', 'rare-candy', 'nugget']) assets.itemImage(icon);
  }

  async startSolo(lineId: string, stageId: string) {
    this.save.lastLine = lineId;
    this.save.lastStage = stageId;
    this.persist();
    const s = new LocalSession({ stageId, players: [this.playerInit(lineId)] });
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
  }

  endRun() {
    this.session?.dispose();
    this.session = null;
    this.hud.hide();
    this.levelUp.close();
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.chestEl?.remove();
    this.chestEl = null;
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
    });
    const rewards: RunRewards = applyRun(this.save, summary, s.seen(), defeated);
    this.persist();
    audio.stopMusic();
    audio.sfx(cleared ? 'victory' : 'gameover');
    const snapshot = { session: s, summary, rewards, me };
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
        audio.playMusic('boss');
        this.bossMusic = true;
        break;
      case 'bossDown':
        banner(ev.final ? `${SPECIES[ev.species].name.toUpperCase()} fainted! STAGE CLEAR!` : `The wild ${SPECIES[ev.species].name.toUpperCase()} fainted!`, false, 2600);
        break;
      case 'chest':
        audio.sfx(ev.rewards.some((r) => r.kind === 'mastery') ? 'mastery' : 'chest');
        if (ev.player === me) {
          this.chestEl?.remove();
          this.chestEl = chestPopup(ev.rewards);
          this.ui.appendChild(this.chestEl);
          const el = this.chestEl;
          setTimeout(() => { el.remove(); if (this.chestEl === el) this.chestEl = null; }, 2600);
        } else {
          const p = s.world.players[ev.player];
          const m = ev.rewards.find((r) => r.kind === 'mastery');
          toast('Treasure', m ? `${p?.name} mastered ${MOVES[m.id].name}!` : `${p?.name} opened a treasure.`, assets.itemUrl('poke-ball'));
        }
        break;
      case 'warn':
        banner(ev.text, false, 2200);
        audio.sfx('warn');
        break;
      case 'faint':
        audio.sfx('faint');
        if (ev.player === me && s.coop) banner('You fainted! Stand by a teammate to be revived.', false, 3500);
        else if (ev.player !== me) banner(`${s.world.players[ev.player]?.name} fainted! Go revive them!`, false, 3000);
        break;
      case 'revive':
        audio.sfx('revive');
        break;
      case 'boom':
        audio.sfx('boom');
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
    this.nav.enabled = !this.session || !!this.pauseEl || this.session.phase() === 'levelup' || this.ended;
    this.nav.pollPads(dt);
    const s = this.session;
    if (s) {
      if ((this.input.consume('Escape') || this.input.consume('PadStart') || this.input.consume('KeyP')) && s.phase() !== 'levelup') this.togglePause();
      const m = s.paused || this.ended ? { x: 0, y: 0 } : this.input.move();
      s.step(dt, m.x, m.y, this.renderer.viewW, this.renderer.viewH);
      for (const ev of s.drainEvents()) this.handleEvent(ev, s);
      if (this.bossMusic && !s.world.enemies.some((e) => e.boss && e.alive)) {
        this.bossMusic = false;
        audio.playMusic(STAGE[s.stage.id].music);
      }
      this.renderer.render(s.world, s.paused ? 0 : dt);
      if (!this.ended) {
        this.hud.update(s, dt);
        this.levelUp.sync(s);
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
          this.ended = true;
          toast('Disconnected', 'Lost connection to the host.', assets.itemUrl('escape-rope'));
          this.goTitle();
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

