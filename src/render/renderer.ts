import { TYPE_COLORS } from '../data/types.ts';
import { MEGA, SPECIES } from '../data/pokedex.ts';
import type { StageDef } from '../data/stages.ts';
import { dirRow, TAU } from '../engine/math.ts';
import type { Cinematic, Phase } from '../game/sim.ts';
import { CHEST_BALL, CHEST_COLOR, type ChestTier, type Enemy, type GameEvent, type Pickup, type Player, type Projectile } from '../game/types.ts';
import { assets, type Anim } from './assets.ts';
import { Background, type DecorSprite } from './background.ts';
import { DamageNumbers, Particles, Shape } from './fx.ts';
import { DeathPops, POP_TIME, popSquash } from './pops.ts';
import { HAZARD, HAZARD_IMPACT } from '../game/hazards.ts';
import { dangerStrength } from '../game/danger.ts';
import { PF_FOCUS, PF_RETARGET, PF_STICKY } from '../game/combat.ts';
import { STATUS_INFO, STATUS_ORDER } from '../data/status.ts';
import type { WeatherKind } from '../data/moves.ts';

/** What the renderer needs from a world — satisfied by Sim (host/solo) and the network replica (client). */
export interface WorldView {
  time: number;
  stage: StageDef;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  phase: Phase;
  cine: Cinematic | null;
  /** Render interpolation fraction between the previous and current sim step (1 = no interpolation). */
  alpha?: number;
  weather?: WeatherKind | null;
}

type Pos = { x: number; y: number; px?: number; py?: number };

const PICKUP_ICON: Record<string, string> = {
  oran: 'oran-berry', sitrus: 'sitrus-berry', magnet: 'magnet', repel: 'max-repel', chest: 'poke-ball', 'rare-candy': 'rare-candy', 'mega-stone': 'key-stone',
};

type Drawable = { y: number; k: 0; e: Enemy } | { y: number; k: 1; p: Player } | { y: number; k: 2; d: DecorSprite; x: number };

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  /** World-resolution effects layer, upscaled with nearest-neighbour so effects share the sprites' pixel grid. */
  private fx = document.createElement('canvas');
  private fxg = this.fx.getContext('2d')!;
  zoom = 2;
  /** Zoom from screen size alone; `zoom` adds the evolution pull-back on top. */
  private baseZoom = 2;
  private evoZoom = 1;
  viewW = 960;
  viewH = 540;
  camX = 0;
  camY = 0;
  private shake = 0;
  /** Brief zoom-in on elite kills: 1 -> 0 over PUNCH_LIFE seconds. */
  private punch = 0;
  /** Multiplier on particle / ground-hazard / trail alpha (the fxOpacity setting). */
  fxOpacity = 1;
  private flash = 0;
  private flashColor = '#fff';
  private hurtFlash = 0;
  readonly particles = new Particles();
  readonly numbers = new DamageNumbers();
  private bg: Background | null = null;
  private bgStage = '';
  private drawables: Drawable[] = [];
  private chains: { pts: number[]; color: string; t: number }[] = [];
  private pops = new DeathPops();
  private booms: { x: number; y: number; r: number; color: string; t: number }[] = [];
  private labelCd = 0;
  private vignette: HTMLCanvasElement | null = null;
  private dangerVignette: HTMLCanvasElement | null = null;
  private lookX = 0;
  private lookY = 0;
  private saved: number[] = [];
  private savedObjs: Pos[] = [];
  localId = 0;
  shakeEnabled = true;
  showNumbers = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false })!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    this.canvas.width = w;
    this.canvas.height = h;
    // Size the element from the backing store so each canvas pixel maps to exactly one device
    // pixel, even at fractional DPRs (1.25, 1.5); otherwise the browser resamples every frame and
    // a scrolling world shimmers.
    this.canvas.style.width = `${w / dpr}px`;
    this.canvas.style.height = `${h / dpr}px`;
    // Half-step integer zoom keeps pixel art crisp while showing ~450-540 world px vertically.
    this.baseZoom = Math.max(1, Math.floor((h / 450) * 2) / 2);
    this.applyZoom();
    this.vignette = null;
    this.dangerVignette = null;
  }

  /** The view (and so the sim's spawn ring, which reads viewW/viewH) widens as the partner evolves. */
  private applyZoom() {
    const view = Math.max(1, this.baseZoom * this.evoZoom);
    // The punch scales only what is drawn; the sim-facing view size stays put.
    this.zoom = view * (1 + PUNCH_ZOOM * this.punch);
    this.viewW = this.canvas.width / view;
    this.viewH = this.canvas.height / view;
  }

  reset() {
    this.evoZoom = 1;
    this.applyZoom();
    this.particles.n = 0;
    this.chains = [];
    this.booms = [];
    this.shake = 0;
    this.punch = 0;
    this.flash = 0;
  }

  addShake(a: number) {
    if (this.shakeEnabled) this.shake = Math.min(10, this.shake + a);
  }

  screenFlash(color: string, a: number) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, a);
  }

  // ─────────────────────────── events ───────────────────────────

  onEvent(ev: GameEvent, world: WorldView) {
    const P = this.particles;
    switch (ev.e) {
      case 'hit':
        if (this.showNumbers) this.numbers.add(ev.x, ev.y, ev.dmg, ev.eff, ev.crit);
        // impact star + debris streaks in the move's type colour
        P.spawn(ev.x + (Math.random() - 0.5) * 6, ev.y - 4 + (Math.random() - 0.5) * 6, 0, 0, ev.crit ? 0.2 : 0.14, ev.crit ? 6 : 4, TYPE_COLORS[ev.type], 0, true, Shape.SPARK);
        P.burst(ev.x, ev.y - 2, ev.crit ? 5 : 2, ev.crit ? 160 : 110, TYPE_COLORS[ev.type], 0.18, 1, true, 0, Shape.STREAK);
        if (ev.eff > 1 && this.labelCd <= 0) {
          this.numbers.label(ev.x, ev.y - 10, 'Super effective!', '#ffb347');
          this.labelCd = 1.4;
        } else if (ev.eff < 1 && this.labelCd <= 0 && Math.random() < 0.1) {
          this.numbers.label(ev.x, ev.y - 10, 'Not very effective…', '#a8b0bd');
          this.labelCd = 2;
        }
        break;
      case 'kill': {
        // bosses have their own cinematic; everyone else flashes white and squashes before the puff
        if (!ev.boss) this.pops.add(ev.x, ev.y, ev.species, ev.shiny, ev.scale, DOWN_ROW, world.time + ev.anim);
        // faint "poof": a smoke puff cluster, a pop ring and a few type-coloured sparks
        P.burst(ev.x, ev.y - 8, ev.boss ? 26 : 3, ev.boss ? 120 : 36, '#e8e8f0', ev.boss ? 0.7 : 0.3, ev.boss ? 6 : 3, false, -20, Shape.PUFF);
        P.ring(ev.x, ev.y - 6, ev.boss ? 48 : 14, '#ffffff', ev.boss ? 0.45 : 0.22);
        P.burst(ev.x, ev.y - 6, ev.boss ? 30 : 4, ev.boss ? 200 : 90, TYPE_COLORS[ev.type], 0.4, ev.boss ? 4 : 3, true, 0, Shape.SPARK);
        if (ev.boss) { this.addShake(8); this.screenFlash('#fff', 0.6); }
        else if (ev.elite) this.punch = 1;
        if (ev.shiny) P.burst(ev.x, ev.y - 8, 18, 120, '#fff6a8', 0.8, 4, true, 0, Shape.SPARK);
        break;
      }
      case 'boom':
        this.booms.push({ x: ev.x, y: ev.y, r: ev.r, color: TYPE_COLORS[ev.type], t: 0 });
        P.burst(ev.x, ev.y, 18, ev.r * 3, TYPE_COLORS[ev.type], 0.45, 3, true, 0, Shape.SPARK);
        P.burst(ev.x, ev.y, 8, ev.r * 1.5, '#d8d0c8', 0.6, 5, false, -15, Shape.PUFF);
        P.ring(ev.x, ev.y, ev.r, TYPE_COLORS[ev.type], 0.3);
        this.addShake(3);
        break;
      case 'chain':
        this.chains.push({ pts: ev.pts, color: TYPE_COLORS[ev.type], t: 0 });
        break;
      case 'callout':
        this.numbers.label(ev.x, ev.y, ev.text, ev.color, 1.1, 6);
        break;
      case 'raid':
        this.numbers.label(ev.x, ev.y - (ev.big ? 58 : 34), `${ev.name}!`, ev.big ? '#ffb0a0' : '#ffd0c0', 1.5, ev.big ? 8 : 6);
        break;
      case 'hurt':
        if (ev.player === this.localId) {
          this.hurtFlash = 0.35;
          this.addShake(2.5);
        }
        {
          const p = world.players[ev.player];
          if (p && this.showNumbers) this.numbers.addPlayer(p.x, p.y - 30, ev.dmg, false);
        }
        break;
      case 'levelup':
        for (const p of world.players) {
          P.ring(p.x, p.y - 10, 26, '#ffe680', 0.4);
          for (let i = 0; i < 14; i++) P.spawn(p.x + (Math.random() - 0.5) * 30, p.y - Math.random() * 20, 0, -40 - Math.random() * 60, 0.7, 3 + Math.random() * 2, '#ffe680', 0, true, Shape.SPARK);
        }
        break;
      case 'repel':
        this.screenFlash('#ffffff', 0.8);
        this.addShake(6);
        break;
      case 'revive': {
        const p = world.players[ev.player];
        if (p) { P.burst(p.x, p.y - 10, 30, 180, '#ff9de2', 0.8, 4, true, 0, Shape.SPARK); P.ring(p.x, p.y - 10, 40, '#ffd1f0', 0.5); }
        this.screenFlash('#ffd1f0', 0.4);
        break;
      }
      case 'faint':
        if (ev.player === this.localId) this.screenFlash('#000', 0.5);
        break;
      case 'shiny':
        P.burst(ev.x, ev.y - 8, 14, 90, '#fff6a8', 0.9, 4, true, 0, Shape.SPARK);
        break;
      case 'pickup': {
        const p = world.players[ev.player];
        if (p && ev.kind === 'chest') { P.burst(p.x, p.y - 10, 28, 160, '#fff1a8', 0.8, 4, true, 0, Shape.SPARK); P.ring(p.x, p.y - 10, 34, '#fff1a8', 0.4); this.screenFlash('#fff', 0.3); }
        if (p && (ev.kind === 'oran' || ev.kind === 'sitrus')) for (let i = 0; i < 10; i++) P.spawn(p.x + (Math.random() - 0.5) * 22, p.y - Math.random() * 16, 0, -30 - Math.random() * 30, 0.7, 2, '#7dff8a', 0, true, Shape.DOT);
        break;
      }
      case 'bossDown':
        if (ev.final) this.screenFlash('#fff', 1);
        break;
      default:
        break;
    }
  }

  // ─────────────────────────── frame ───────────────────────────

  render(world: WorldView, dt: number) {
    const g = this.g;
    if (this.bgStage !== world.stage.id) {
      this.bg = new Background(world.stage);
      this.bgStage = world.stage.id;
    }
    this.interpolate(world);
    const me = world.players[this.localId] ?? world.players[0];
    if (me) {
      // Pull back as the partner evolves (eased over ~2s), so it feels bigger relative to the world.
      const target = EVO_ZOOM[Math.min(me.stage, EVO_ZOOM.length - 1)];
      if (this.evoZoom !== target) {
        this.evoZoom += (target - this.evoZoom) * (1 - Math.pow(0.1, dt));
        if (Math.abs(target - this.evoZoom) < 0.002) this.evoZoom = target;
        this.applyZoom();
      }
    }
    if (this.punch > 0) {
      this.punch = Math.max(0, this.punch - dt / PUNCH_LIFE);
      this.applyZoom();
    }
    const z = this.zoom;
    if (me) {
      // The camera is locked to the (interpolated) partner; only the look-ahead eases. Snapping the
      // look-ahead to whole screen pixels keeps the partner perfectly still on screen while walking.
      const k = 1 - Math.pow(0.02, dt);
      this.lookX += ((me.moving ? me.fx * 14 : 0) - this.lookX) * k;
      this.lookY += ((me.moving ? me.fy * 10 : 0) - this.lookY) * k;
      this.camX = me.x + Math.round(this.lookX * z) / z;
      this.camY = me.y - 8 + Math.round(this.lookY * z) / z;
    }
    this.particles.update(dt);
    this.pops.update(dt);
    this.numbers.update(dt);
    this.labelCd -= dt;
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    const sx = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const sy = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    // Camera origin in whole screen pixels. Sprites snap to the same grid (see snap()), so a sprite
    // moving with the camera keeps a constant on-screen position instead of wobbling by a pixel.
    const ox = -(Math.round(this.camX * z) - Math.round(this.canvas.width / 2)) + sx * z;
    const oy = -(Math.round(this.camY * z) - Math.round(this.canvas.height / 2)) + sy * z;
    const left = -ox / z, top = -oy / z;
    g.setTransform(z, 0, 0, z, ox, oy);
    g.imageSmoothingEnabled = false;
    const L = left, T = top, W = this.canvas.width / z, H = this.canvas.height / z;

    this.bg!.drawGround(g, L - 2, T - 2, W + 4, H + 4);
    this.bg!.prefetch(L, T, W, H);
    this.bg!.drawAnimated(g, L, T, W, H, world.time);

    // ground-level effects
    const fxL = Math.floor(L), fxT = Math.floor(T);
    if (this.fxOpacity >= 1) {
      this.beginFx(W, H, fxL, fxT);
      for (const pr of world.projectiles) if (isGroundFx(pr)) this.drawGroundFx(pr, world);
      this.endFx(fxL, fxT);
    } else {
      // Telegraphs, zones, trails and auras fade with the setting; terrain, mines and cages stay solid.
      this.beginFx(W, H, fxL, fxT);
      for (const pr of world.projectiles) if (isGroundFx(pr) && !isDimmable(pr)) this.drawGroundFx(pr, world);
      this.endFx(fxL, fxT);
      this.beginFx(W, H, fxL, fxT);
      for (const pr of world.projectiles) if (isGroundFx(pr) && isDimmable(pr)) this.drawGroundFx(pr, world);
      this.endFx(fxL, fxT, 'source-over', this.fxOpacity);
    }
    for (const pk of world.pickups) if (inView(pk.x, pk.y, L, T, W, H, 20)) this.drawPickup(pk, world.time);

    // shadows + y-sorted sprites
    const list = this.drawables;
    list.length = 0;
    for (const e of world.enemies) if (e.alive && inView(e.x, e.y, L, T, W, H, 60 * e.scale)) list.push({ y: e.y, k: 0, e });
    for (const p of world.players) if (p.connected) list.push({ y: p.y, k: 1, p });
    this.bg!.tallIn(L, T, W, H, world.time, (d, x, y) => list.push({ y, k: 2, d, x }));
    list.sort((a, b) => a.y - b.y);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (const d of list) {
      if (d.k === 0) shadow(g, d.e.x, d.e.y, 8 * d.e.scale);
      else if (d.k === 1) shadow(g, d.p.x, d.p.y, 9 * growth(d.p));
    }
    for (const d of list) {
      if (d.k === 0) this.drawEnemy(d.e, world.time);
      else if (d.k === 1) this.drawPlayer(d.p, world.time);
      else this.drawTallDecor(d.d, d.x, d.y, me);
    }

    this.drawPops(L, T, W, H);

    // projectiles & effects above sprites
    this.beginFx(W, H, fxL, fxT);
    for (const pr of world.projectiles) if (!isGroundFx(pr) && inView(pr.x, pr.y, L, T, W, H, pr.len + pr.r + 60)) this.drawProjectile(pr, world);
    this.drawChains(dt);
    this.drawBooms(dt);
    this.particles.draw(this.g, false, this.fxOpacity);
    this.endFx(fxL, fxT);
    this.beginFx(W, H, fxL, fxT);
    this.g.globalCompositeOperation = 'lighter';
    this.particles.draw(this.g, true, this.fxOpacity);
    this.g.globalCompositeOperation = 'source-over';
    this.endFx(fxL, fxT, 'lighter');
    this.drawStatusOverlays(world, L, T, W, H);
    this.numbers.draw(g);
    for (const p of world.players) this.drawPlayerBars(p, world.players.length > 1);

    // screen space
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (world.stage.darkness && me) this.drawDarkness(world.stage.darkness, (me.x - left) * z, (me.y - 8 - top) * z);
    if (me && !me.fainted) this.drawDanger(dangerStrength(me.hp / me.stats.maxHp));
    if (world.weather) this.drawWeather(world.weather, world.time);
    this.drawIndicators(world, left, top);
    if (this.hurtFlash > 0) {
      g.fillStyle = `rgba(255,0,0,${this.hurtFlash * 0.35})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.flash > 0) {
      g.globalAlpha = Math.min(1, this.flash);
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      g.globalAlpha = 1;
    }
    if (world.cine?.kind === 'evolve') this.drawEvolution(world.cine, world);
    if (world.cine?.kind === 'mega') this.drawMegaEvolution(world.cine, world);
    this.restore();
  }

  private mainG: CanvasRenderingContext2D | null = null;

  /** Redirect drawing into the low-res effects layer (world pixels, origin at fxL/fxT). */
  private beginFx(W: number, H: number, fxL: number, fxT: number) {
    const w = Math.ceil(W) + 2, h = Math.ceil(H) + 2;
    if (this.fx.width !== w || this.fx.height !== h) {
      this.fx.width = w;
      this.fx.height = h;
    }
    const g = this.fxg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(1, 0, 0, 1, -fxL, -fxT);
    g.imageSmoothingEnabled = false;
    this.mainG = this.g;
    this.g = g;
  }

  private endFx(fxL: number, fxT: number, op: GlobalCompositeOperation = 'source-over', alpha = 1) {
    if (!this.mainG) return;
    this.g = this.mainG;
    this.mainG = null;
    this.g.globalCompositeOperation = op;
    this.g.globalAlpha = alpha;
    this.g.drawImage(this.fx, fxL, fxT);
    this.g.globalAlpha = 1;
    this.g.globalCompositeOperation = 'source-over';
  }

  /** Temporarily move entities to their interpolated positions; restore() puts them back. */
  private interpolate(world: WorldView) {
    const a = world.alpha ?? 1;
    this.savedObjs.length = 0;
    this.saved.length = 0;
    if (a >= 1) return;
    const lerpIn = (o: Pos) => {
      if (o.px === undefined || o.py === undefined) return;
      const dx = o.x - o.px, dy = o.y - o.py;
      if (dx * dx + dy * dy > 48 * 48) return; // teleported: don't smear across the map
      this.savedObjs.push(o);
      this.saved.push(o.x, o.y);
      o.x = o.px + dx * a;
      o.y = o.py + dy * a;
    };
    for (const p of world.players) lerpIn(p);
    for (const e of world.enemies) if (e.alive) lerpIn(e);
    for (const pr of world.projectiles) lerpIn(pr);
  }

  private restore() {
    const o = this.savedObjs, s = this.saved;
    for (let i = 0; i < o.length; i++) { o[i].x = s[i * 2]; o[i].y = s[i * 2 + 1]; }
    o.length = 0;
  }

  // ─────────────────────────── decor ───────────────────────────

  /** Tall props go see-through while the local partner is behind them, so trees never hide you. */
  private drawTallDecor(d: DecorSprite, x: number, y: number, me: Player | undefined) {
    const g = this.g;
    const dx = Math.round(x - d.ax), dy = Math.round(y - d.ay);
    const behind = me && me.y < y && me.y > dy && Math.abs(me.x - x) < d.c.width / 2 + 4;
    if (behind) g.globalAlpha = 0.45;
    g.drawImage(d.c, dx, dy);
    if (behind) g.globalAlpha = 1;
  }

  // ─────────────────────────── sprites ───────────────────────────

  private drawAnim(anim: Anim, x: number, y: number, t: number, row: number, scale: number, flash: number, alpha = 1, sx = 1, sy = 1) {
    const g = this.g;
    const f = anim.frameAt(t);
    const r = row % anim.rows;
    const w = anim.fw * scale * sx, h = anim.fh * scale * sy;
    const z = this.zoom;
    // squash keeps the feet where the unsquashed sprite's feet would be
    const fullH = anim.fh * scale;
    const dx = (Math.round(x * z) - Math.round((w / 2) * z)) / z, dy = (Math.round(y * z) - Math.round((fullH / 2 + 6 * scale) * z)) / z + (fullH - h);
    if (alpha < 1) g.globalAlpha = alpha;
    // a fully white sheet covers the sprite, so skip the base draw
    if (flash < 1 || alpha < 1) g.drawImage(anim.img, f * anim.fw, r * anim.fh, anim.fw, anim.fh, dx, dy, w, h);
    if (flash > 0) {
      g.globalAlpha = Math.min(1, flash) * alpha;
      g.drawImage(anim.whiteSheet(), f * anim.fw, r * anim.fh, anim.fw, anim.fh, dx, dy, w, h);
    }
    g.globalAlpha = 1;
  }

  // Known limitation: a pop ignores slow/freeze (frame) and Sky Uppercut lift (height) of the live enemy.
  private drawPops(L: number, T: number, W: number, H: number) {
    const P = this.pops;
    for (let k = 0; k < P.n; k++) {
      const i = P.slot(k);
      const set = assets.get(P.species[i], P.shiny[i] === 1);
      if (!set || !inView(P.x[i], P.y[i], L, T, W, H, 60 * P.scale[i])) continue;
      const { sx, sy } = popSquash(P.t[i] / POP_TIME);
      this.drawAnim(set.walk, P.x[i], P.y[i], P.animT[i], P.row[i], P.scale[i], 1, 1, sx, sy);
    }
  }

  private drawEnemy(e: Enemy, time: number) {
    const set = assets.get(e.speciesId, e.shiny);
    if (!set) {
      void assets.load(e.speciesId, e.shiny);
      this.g.fillStyle = TYPE_COLORS[e.types[0]];
      this.g.fillRect(e.x - 6, e.y - 14, 12, 12);
      return;
    }
    const g = this.g;
    if (e.alpha) {
      // Alphas: a smouldering red aura and glowing ground ring.
      const pulse = 0.5 + 0.5 * Math.sin(time * 4 + e.id);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + pulse * 0.25;
      g.drawImage(assets.glow.get('fire')!, e.x - 40 * e.scale / 2, e.y - 34 * e.scale, 40 * e.scale, 40 * e.scale);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = `rgba(255,40,40,${0.55 + pulse * 0.4})`;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(e.x, e.y, e.radius + 6, (e.radius + 6) * 0.45, 0, 0, TAU);
      g.stroke();
      if (Math.random() < 0.25) this.particles.spawn(e.x + (Math.random() - 0.5) * 30, e.y - Math.random() * 40, 0, -30, 0.7, 2, '#ff5040', 0, true);
    }
    if (e.elite || e.boss) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      g.strokeStyle = e.boss ? `rgba(255,60,60,${0.5 + pulse * 0.4})` : `rgba(255,200,60,${0.4 + pulse * 0.4})`;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(e.x, e.y, e.radius + 4, (e.radius + 4) * 0.45, 0, 0, TAU);
      g.stroke();
    }
    const st = e.st;
    const frozen = st.freeze > 0 || st.sleep > 0 || st.root > 0;
    const t = frozen ? e.animOffset : time * (st.slow > 0 || st.paralyze > 0 || st.chill > 0 ? 0.5 : 1) + e.animOffset;
    // Sky Uppercut: launched foes hang in the air.
    const lift = st.air > 0 ? 22 * Math.sin(Math.min(1, st.air / 0.8) * Math.PI) + 6 : 0;
    this.drawAnim(set.walk, e.x, e.y - lift, t, dirRow(e.dirX, e.dirY), e.scale, Math.min(0.65, e.flash * 8));
    if (st.freeze > 0) {
      g.fillStyle = 'rgba(170,225,255,0.45)';
      g.fillRect(e.x - 10 * e.scale, e.y - 24 * e.scale, 20 * e.scale, 24 * e.scale);
    } else if (st.chill > 0) {
      g.fillStyle = `rgba(200,240,255,${0.12 * st.chill})`;
      g.fillRect(e.x - 10 * e.scale, e.y - 24 * e.scale, 20 * e.scale, 24 * e.scale);
    }
    if (st.root > 0) {
      g.strokeStyle = '#5fae3c'; g.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(e.x + i * 5, e.y + 2); g.quadraticCurveTo(e.x + i * 9, e.y - 6, e.x + i * 3, e.y - 10); g.stroke(); }
    }
    if (st.curse > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + 0.2 * Math.sin(time * 5 + e.id);
      g.drawImage(assets.glow.get('ghost')!, e.x - 16 * e.scale, e.y - 30 * e.scale, 32 * e.scale, 32 * e.scale);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    this.drawStatusBadges(e);
    if (e.shiny && Math.random() < 0.08) this.particles.spawn(e.x + (Math.random() - 0.5) * 20, e.y - 10 - Math.random() * 16, 0, -20, 0.5, 3, '#fff6a8', 0, true, Shape.SPARK);
    if (e.elite || e.alpha || (e.boss && e.hp < e.maxHp)) {
      const w = 22 * e.scale;
      g.fillStyle = '#000';
      g.fillRect(e.x - w / 2 - 1, e.y - 34 * e.scale - 1, w + 2, 4);
      g.fillStyle = e.boss || e.alpha ? '#ff4b4b' : '#ffc53d';
      if (e.alpha) {
        const icon = assets.uiImage('alpha');
        if (icon) g.drawImage(icon, Math.round(e.x - w / 2 - 14), Math.round(e.y - 34 * e.scale - 6), 12, 12);
      }
      g.fillRect(e.x - w / 2, e.y - 34 * e.scale, w * Math.max(0, e.hp / e.maxHp), 2);
    }
  }

  private drawPlayer(p: Player, time: number) {
    const mega = p.megaT > 0 ? MEGA[p.speciesId] : undefined;
    let set = assets.get(p.speciesId, p.shiny);
    if (mega?.sprite) {
      const ms = assets.get(mega.id, p.shiny);
      if (ms) set = ms;
      else void assets.load(mega.id, p.shiny);
    }
    const g = this.g;
    if (!set) {
      void assets.load(p.speciesId, p.shiny);
      return;
    }
    if (p.megaT > 0) this.drawMegaAura(p, time, !mega?.sprite);
    else if (p.mega >= 0.999) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5 + 0.3 * Math.sin(time * 12);
      g.drawImage(assets.glow.get(p.types[0])!, p.x - 24, p.y - 36, 48, 48);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    const grow = growth(p);
    if (p.fainted) {
      this.drawAnim(set.idle, p.x, p.y, 0, 0, grow, 0, 0.45);
      g.strokeStyle = '#ff9de2';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y - 12, 16, -Math.PI / 2, -Math.PI / 2 + (p.reviveProgress / 3) * TAU);
      g.stroke();
      return;
    }
    if (p.burrowT > 0) return this.drawBurrow(p, time);
    this.drawMoveStatesBehind(p, time);
    const anim = p.moving ? set.walk : set.idle;
    const blink = p.hurtT > 0 ? (Math.floor(p.hurtT * 30) % 2) * 0.8 : 0;
    // Forms without a Mega sprite grow and glow instead.
    const scale = grow * (mega && !mega.sprite ? 1.25 : 1);
    const jitter = p.digWind > 0 ? (Math.random() - 0.5) * 3 : 0;
    this.drawAnim(p.sleepT > 0 ? set.idle : anim, p.x + jitter, p.y, p.sleepT > 0 ? 0 : time * (p.moving ? 1.2 : 1), dirRow(p.fx, p.fy), scale, blink, p.vanishT > 0 ? 0.25 : 1);
    this.drawMoveStatesFront(p, time);
    if (p.shiny && Math.random() < 0.12) this.particles.spawn(p.x + (Math.random() - 0.5) * 22, p.y - 6 - Math.random() * 22, 0, -24, 0.6, 3, '#fff6a8', 0, true, Shape.SPARK);
    for (const b of p.buffs) {
      if (b.kind === 'shield') { g.strokeStyle = 'rgba(160,220,255,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y - 12 * grow, 18 * grow, 0, TAU); g.stroke(); }
      if (b.kind === 'dodge' && Math.floor(time * 10) % 2 === 0) this.drawAnim(anim, p.x + 8 * grow, p.y, time, dirRow(p.fx, p.fy), scale, 0, 0.3);
    }
  }

  /** Rainbow Mega Evolution energy: a pulsing ring, rising sparks and a shimmer. */
  private drawMegaAura(p: Player, time: number, strong: boolean) {
    const g = this.g;
    const hue = (o: number) => `hsl(${Math.floor((time * 140 + o) % 360)},100%,65%)`;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = strong ? 0.75 : 0.5;
    g.drawImage(assets.glow.get(p.types[0])!, p.x - 30, p.y - 44, 60, 60);
    g.globalAlpha = 1;
    // Pixel ring of six orbiting gems (the Mega Evolution symbol's colours).
    for (let i = 0; i < 6; i++) {
      const a = time * 2.4 + (i / 6) * TAU;
      g.fillStyle = hue(i * 60);
      g.fillRect(Math.round(p.x + Math.cos(a) * 18) - 1, Math.round(p.y - 12 + Math.sin(a) * 8) - 1, 3, 3);
    }
    g.globalCompositeOperation = 'source-over';
    if (Math.random() < 0.5) this.particles.spawn(p.x + (Math.random() - 0.5) * 26, p.y - Math.random() * 30, 0, -40, 0.6, 2, hue(Math.random() * 360), 0, true);
    if (p.megaT < 3 && Math.floor(time * 8) % 2 === 0) {
      g.globalAlpha = 0.4;
      g.fillStyle = '#fff';
      g.fillRect(Math.round(p.x) - 12, Math.round(p.y) - 34, 24, 2);
      g.globalAlpha = 1;
    }
  }

  // ─────────────────────────── move states & statuses ───────────────────────────

  /** Up to two status badges (PKMN-style 3-letter tags) over a foe's head. */
  private drawStatusBadges(e: Enemy) {
    const st = e.st as unknown as Record<string, number>;
    const g = this.g;
    let n = 0;
    const y = Math.round(e.y - 30 * e.scale - (e.elite || e.alpha || e.boss ? 8 : 2));
    const shown: string[] = [];
    for (const k of STATUS_ORDER) {
      if (n >= 2) break;
      if ((st[k] ?? 0) > 0 && STATUS_INFO[k]) { shown.push(k); n++; }
    }
    if (!shown.length) return;
    g.font = '5px "Press Start 2P", monospace';
    g.textAlign = 'center';
    const w = 17, gap = 1;
    let x = Math.round(e.x - (shown.length * w + (shown.length - 1) * gap) / 2);
    for (const k of shown) {
      const info = STATUS_INFO[k as keyof typeof STATUS_INFO]!;
      g.fillStyle = '#000';
      g.fillRect(x - 1, y - 1, w + 2, 9);
      g.fillStyle = info.color;
      g.fillRect(x, y, w, 7);
      g.fillStyle = lightColor(info.color) ? '#1a1a2a' : '#fff';
      g.fillText(info.abbr, x + w / 2, y + 6);
      x += w + gap;
    }
  }

  private drawBurrow(p: Player, time: number) {
    const g = this.g;
    g.fillStyle = '#7a5a3a';
    g.beginPath(); g.ellipse(p.x, p.y, 12, 5, 0, 0, TAU); g.fill();
    g.fillStyle = '#a07a50';
    g.beginPath(); g.ellipse(p.x, p.y - 2, 9, 3.5, 0, 0, TAU); g.fill();
    if (Math.random() < 0.7) this.particles.spawn(p.x + (Math.random() - 0.5) * 18, p.y, (Math.random() - 0.5) * 40, -40, 0.4, 3, Math.random() < 0.5 ? '#8b6b45' : '#c4a27a', 160, false, Shape.PUFF);
    void time;
  }

  /** Effects drawn under the partner sprite: Outrage fury, Iron Defense shell. */
  private drawMoveStatesBehind(p: Player, time: number) {
    const g = this.g;
    if (p.rageT > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5 + 0.3 * Math.sin(time * 18);
      g.drawImage(assets.glow.get('fire')!, p.x - 28, p.y - 42, 56, 56);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (p.digWind > 0 && Math.random() < 0.9) {
      this.particles.spawn(p.x + (Math.random() - 0.5) * 26, p.y + 2, (Math.random() - 0.5) * 60, -50 - Math.random() * 40, 0.5, 4, Math.random() < 0.5 ? '#8b6b45' : '#c4a27a', 140, false, Shape.PUFF);
    }
  }

  /** Effects drawn over the partner sprite: Protect, Rest, Spark, Focus Punch, Iron Defense. */
  private drawMoveStatesFront(p: Player, time: number) {
    const g = this.g;
    const grow = growth(p);
    const has = (id: string) => p.moves.some((m) => m.id === id);
    if (has('protect') && p.protectCd <= 0) {
      g.strokeStyle = `rgba(110,255,150,${0.45 + 0.2 * Math.sin(time * 5)})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(p.x, p.y - 12 * grow, 17 * grow, 0, TAU); g.stroke();
    }
    if (has('iron-defense') && !p.moving) {
      g.strokeStyle = 'rgba(200,210,225,0.85)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y - 10 * grow, 14 * grow, Math.PI * 0.95, Math.PI * 2.05); g.stroke();
      g.fillStyle = '#e8eef8';
      for (let i = 0; i < 3; i++) { const a = Math.PI * (1.2 + i * 0.3); g.fillRect(p.x + Math.cos(a) * 14 * grow - 1, p.y - 10 * grow + Math.sin(a) * 14 * grow - 1, 2, 2); }
    }
    if (p.sleepT > 0) {
      g.font = '6px "Press Start 2P", monospace';
      g.textAlign = 'left';
      for (let i = 0; i < 3; i++) {
        const k = ((time * 0.8 + i / 3) % 1);
        g.globalAlpha = 1 - k;
        g.fillStyle = '#cfd8ff';
        g.fillText('z', p.x + 6 + k * 10 + i * 2, p.y - 24 * grow - k * 14);
      }
      g.globalAlpha = 1;
    }
    if (has('spark') && p.staticCharge >= 300 && Math.random() < 0.5) {
      this.particles.spawn(p.x + (Math.random() - 0.5) * 22, p.y - 6 - Math.random() * 18, 0, 0, 0.12, 3, '#fff36b', 0, true, Shape.SPARK);
    }
    if (p.focusAt >= 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.6 + 0.4 * Math.sin(time * 20);
      g.drawImage(assets.glow.get('fighting')!, p.x + p.fx * 12 - 10, p.y - 16 - 10, 20, 20);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  private drawWeather(w: WeatherKind, time: number) {
    const g = this.g;
    const W = this.canvas.width, H = this.canvas.height;
    const tint: Record<WeatherKind, string> = { sun: 'rgba(255,200,90,0.12)', rain: 'rgba(40,70,140,0.16)', sand: 'rgba(200,155,80,0.26)', snow: 'rgba(220,235,255,0.14)' };
    g.fillStyle = tint[w];
    g.fillRect(0, 0, W, H);
    const s = Math.max(1, Math.round(W / 480));
    if (w === 'sun') {
      const gr = g.createRadialGradient(W * 0.85, -H * 0.1, 0, W * 0.85, -H * 0.1, H * 0.9);
      gr.addColorStop(0, 'rgba(255,240,180,0.35)');
      gr.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      return;
    }
    const n = w === 'rain' ? 90 : w === 'snow' ? 70 : 130;
    for (let i = 0; i < n; i++) {
      const seed = i * 97.13;
      const speed = w === 'rain' ? 900 : w === 'snow' ? 60 : 500;
      const x0 = (seed * 13.7) % W;
      const y0 = (seed * 7.3) % H;
      if (w === 'rain') {
        const y = (y0 + time * speed) % H, x = (x0 - time * 200) % W;
        g.strokeStyle = 'rgba(180,210,255,0.55)'; g.lineWidth = s;
        g.beginPath(); g.moveTo((x + W) % W, y); g.lineTo((x + W) % W - 4 * s, y + 12 * s); g.stroke();
      } else if (w === 'snow') {
        const y = (y0 + time * speed) % H, x = (x0 + Math.sin(time + i) * 20 + W) % W;
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillRect(x, y, 2 * s, 2 * s);
      } else {
        const x = (x0 + time * speed) % W, y = (y0 + Math.sin(time * 2 + i) * 6 + H) % H;
        g.fillStyle = i % 3 ? 'rgba(226,190,128,0.75)' : 'rgba(150,110,60,0.6)';
        g.fillRect(x, y, (10 + (i % 4) * 4) * s, Math.max(1, s * 1.2));
      }
    }
  }

  private drawTerrain(pr: Projectile, time: number) {
    const g = this.g;
    const k = pr.t / pr.life;
    const fade = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
    const col = pr.moveId === 'aqua-ring' ? '#5fb4ff' : pr.moveId === 'electric-terrain' ? '#ffe14d' : '#ffb3e0';
    g.globalAlpha = 0.18 * fade;
    g.fillStyle = col;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r, pr.r * 0.65, 0, 0, TAU); g.fill();
    g.globalAlpha = 0.7 * fade;
    g.strokeStyle = col; g.lineWidth = 1.5;
    g.setLineDash(pr.moveId === 'electric-terrain' ? [4, 3] : []);
    g.lineDashOffset = -time * 20;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r, pr.r * 0.65, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    if (Math.random() < 0.4 * fade) {
      const a = Math.random() * TAU, rr = Math.random() * pr.r;
      const x = pr.x + Math.cos(a) * rr, y = pr.y + Math.sin(a) * rr * 0.65;
      if (pr.moveId === 'electric-terrain') this.particles.spawn(x, y, 0, 0, 0.12, 3, '#fff36b', 0, true, Shape.SPARK);
      else if (pr.moveId === 'aqua-ring') this.particles.spawn(x, y, 0, -30, 0.6, 2, '#bfe4ff', 0, true, Shape.RING);
      else this.particles.spawn(x, y, 0, -10, 0.9, 5, '#ffd6ef', 0, false, Shape.PUFF);
    }
  }

  private drawMine(pr: Projectile, time: number) {
    const g = this.g;
    const k = pr.t / pr.life;
    g.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    if (pr.fx === 'spike') {
      g.fillStyle = '#b06bd9';
      for (let i = 0; i < 3; i++) { const a = i * 2.1; g.beginPath(); g.moveTo(pr.x + Math.cos(a) * 4 - 2, pr.y + Math.sin(a) * 3); g.lineTo(pr.x + Math.cos(a) * 4, pr.y + Math.sin(a) * 3 - 6); g.lineTo(pr.x + Math.cos(a) * 4 + 2, pr.y + Math.sin(a) * 3); g.fill(); }
    } else {
      // Stealth Rock: a bobbing, pointed floating stone.
      const bob = Math.sin(time * 3 + pr.id) * 2;
      const r = pr.r;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(pr.x, pr.y, r * 0.6, r * 0.25, 0, 0, TAU); g.fill();
      const cy = pr.y - r - 4 + bob;
      g.fillStyle = '#6f6455';
      g.beginPath(); g.moveTo(pr.x, cy - r); g.lineTo(pr.x + r * 0.75, cy - r * 0.1); g.lineTo(pr.x + r * 0.2, cy + r * 0.7); g.lineTo(pr.x - r * 0.7, cy + r * 0.2); g.closePath(); g.fill();
      g.fillStyle = '#a99a80';
      g.beginPath(); g.moveTo(pr.x, cy - r); g.lineTo(pr.x + r * 0.75, cy - r * 0.1); g.lineTo(pr.x + r * 0.05, cy); g.closePath(); g.fill();
      g.fillStyle = '#e6dcc8';
      g.fillRect(pr.x - 1, cy - r * 0.6, 2, 2);
    }
    g.globalAlpha = 1;
  }

  /** Fire Spin: a ring of flame foes can't walk out of. */
  private drawCage(pr: Projectile, time: number) {
    const g = this.g;
    const k = pr.t / pr.life;
    const fade = k > 0.85 ? (1 - k) / 0.15 : Math.min(1, k * 8);
    g.globalAlpha = 0.5 * fade;
    g.strokeStyle = '#ff7b2b'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r, pr.r * 0.65, 0, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * TAU;
      this.particles.spawn(pr.x + Math.cos(a) * pr.r, pr.y + Math.sin(a) * pr.r * 0.65, 0, -50, 0.4, 3, Math.random() < 0.5 ? '#ffb347' : '#ff5e2b', 0, true, Shape.PUFF);
    }
    void time;
  }

  /** Solar Beam / Focus Punch gathering power: a swelling glow on the partner. */
  private drawCharge(pr: Projectile, time: number) {
    const g = this.g;
    const k = Math.min(1, pr.t / Math.max(0.01, pr.delay));
    const r = 6 + k * 14;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5 + 0.5 * k * (0.7 + 0.3 * Math.sin(time * 30));
    g.drawImage(assets.glow.get(pr.type)!, pr.x - r, pr.y - 10 - r, r * 2, r * 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (Math.random() < 0.6) {
      const a = Math.random() * TAU;
      this.particles.spawn(pr.x + Math.cos(a) * 24, pr.y - 10 + Math.sin(a) * 24, -Math.cos(a) * 60, -Math.sin(a) * 60, 0.35, 2, TYPE_COLORS[pr.type], 0, true);
    }
  }

  /** Future Sight's mark: a slowly closing psychic sigil over the targeted crowd. */
  private drawForesight(pr: Projectile, time: number) {
    const g = this.g;
    const k = pr.t / pr.delay;
    g.globalAlpha = 0.35 + 0.4 * k;
    g.strokeStyle = TYPE_COLORS[pr.type]; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r, pr.r * 0.6, 0, 0, TAU); g.stroke();
    g.setLineDash([3, 3]); g.lineDashOffset = time * 20;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r * (1 - k * 0.7), pr.r * 0.6 * (1 - k * 0.7), 0, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  /** Rock Tomb pillar. */
  private drawPillar(pr: Projectile) {
    const g = this.g;
    const k = pr.t / pr.life;
    const rise = Math.min(1, pr.t / 0.15);
    const h = 26 * rise;
    g.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r, pr.r * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = '#7d6f5c';
    g.fillRect(pr.x - pr.r * 0.8, pr.y - h, pr.r * 1.6, h);
    g.fillStyle = '#a8977d';
    g.fillRect(pr.x - pr.r * 0.8, pr.y - h, pr.r * 0.6, h);
    g.fillStyle = '#c9b89b';
    g.beginPath(); g.ellipse(pr.x, pr.y - h, pr.r * 0.8, pr.r * 0.35, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;
    if (pr.t < 0.05) this.particles.burst(pr.x, pr.y, 6, 60, '#b8a68a', 0.4, 4, false, -10, Shape.PUFF);
  }

  /** Substitute doll. */
  private drawDecoy(pr: Projectile, time: number) {
    const g = this.g;
    const k = pr.t / pr.life;
    const bob = Math.abs(Math.sin(time * 4)) * 2;
    g.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(pr.x, pr.y, 7, 3, 0, 0, TAU); g.fill();
    g.fillStyle = '#f2e3b3';
    g.beginPath(); g.ellipse(pr.x, pr.y - 7 - bob, 7, 7, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(pr.x, pr.y - 15 - bob, 5, 5, 0, 0, TAU); g.fill();
    g.fillStyle = '#5a4a2a';
    g.fillRect(pr.x - 3, pr.y - 16 - bob, 1, 1); g.fillRect(pr.x + 2, pr.y - 16 - bob, 1, 1);
    g.strokeStyle = 'rgba(255,240,180,0.4)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.growth * (0.3 + 0.1 * Math.sin(time * 3)), pr.growth * 0.2, 0, 0, TAU); g.stroke();
    g.globalAlpha = 1;
  }

  /** Infestation: a buzzing cloud of bugs. */
  private drawSwarm(pr: Projectile, time: number) {
    const g = this.g;
    g.fillStyle = '#3d2f12';
    for (let i = 0; i < 12; i++) {
      const a = time * (5 + i) + i * 1.7;
      const r = pr.r * (0.4 + 0.6 * ((i * 37) % 10) / 10);
      g.fillRect(Math.round(pr.x + Math.cos(a) * r) - 1, Math.round(pr.y - 8 + Math.sin(a * 1.3) * r * 0.6) - 1, 3, 3);
    }
    g.fillStyle = '#a8b820';
    for (let i = 0; i < 4; i++) {
      const a = -time * 6 + i * 1.6;
      g.fillRect(Math.round(pr.x + Math.cos(a) * pr.r * 0.5), Math.round(pr.y - 8 + Math.sin(a) * pr.r * 0.3), 1, 1);
    }
  }

  /** Magnet Bomb stuck to a foe, blinking faster as the fuse runs out. */
  private drawSticky(pr: Projectile, time: number) {
    const g = this.g;
    const fast = pr.t > pr.life - 2.2;
    g.fillStyle = Math.floor(time * (fast ? 16 : 6)) % 2 ? '#ff4040' : '#cfd6e0';
    g.beginPath(); g.arc(pr.x + 4, pr.y - 10, 4, 0, TAU); g.fill();
    g.strokeStyle = '#555'; g.lineWidth = 1; g.stroke();
  }

  private drawPlayerBars(p: Player, coop: boolean) {
    if (!p.connected) return;
    const g = this.g;
    const w = 24;
    const y = p.y + 6;
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 4);
    const k = Math.max(0, p.hp / p.stats.maxHp);
    g.fillStyle = k > 0.5 ? '#48d26a' : k > 0.2 ? '#f5c542' : '#f05454';
    g.fillRect(p.x - w / 2, y, w * k, 2);
    if (coop) {
      g.font = '6px "Press Start 2P", monospace';
      g.textAlign = 'center';
      g.fillStyle = '#000';
      const ny = p.y - 34 * growth(p);
      g.fillText(p.name, p.x + 0.5, ny + 0.5);
      g.fillStyle = SLOT_COLORS[p.slot];
      g.fillText(p.name, p.x, ny);
    }
  }

  private drawStatusOverlays(world: WorldView, L: number, T: number, W: number, H: number) {
    const P = this.particles;
    if (Math.random() > 0.5) return;
    for (const e of world.enemies) {
      if (!e.alive || !inView(e.x, e.y, L, T, W, H, 20)) continue;
      const st = e.st;
      if (st.burn > 0 && Math.random() < 0.15) P.spawn(e.x + (Math.random() - 0.5) * 12, e.y - 8, 0, -30, 0.4, 3, Math.random() < 0.5 ? '#ff8a3d' : '#ffd060', 0, true, Shape.PUFF);
      if (st.poison > 0 && Math.random() < 0.12) P.spawn(e.x + (Math.random() - 0.5) * 12, e.y - 10, 0, -18, 0.6, 3, '#c069ff', 0, false, Shape.RING);
      if (st.paralyze > 0 && Math.random() < 0.12) P.spawn(e.x + (Math.random() - 0.5) * 16, e.y - 14 + (Math.random() - 0.5) * 10, 0, 0, 0.12, 3, '#fff36b', 0, true, Shape.SPARK);
      if (st.confuse > 0 && Math.random() < 0.15) P.spawn(e.x + Math.cos(world.time * 8) * 8, e.y - 26, 0, 0, 0.2, 2, '#ffe14d', 0, true);
      if (st.wet > 0 && Math.random() < 0.1) P.spawn(e.x + (Math.random() - 0.5) * 12, e.y - 12, 0, 40, 0.35, 2, '#7fc0ff', 0, false);
      if (st.sleep > 0 && Math.random() < 0.06) P.spawn(e.x + 6, e.y - 22, 8, -18, 0.8, 3, '#cfd8ff', 0, false, Shape.RING);
      if (st.charm > 0 && Math.random() < 0.1) P.spawn(e.x + (Math.random() - 0.5) * 10, e.y - 22, 0, -20, 0.6, 3, '#ff8ccf', 0, true);
      if (st.seed > 0 && Math.random() < 0.08) P.spawn(e.x + (Math.random() - 0.5) * 10, e.y - 10, 0, -14, 0.5, 2, '#6fdc5a', 0, true);
      if (st.vuln > 0 && Math.random() < 0.06) P.spawn(e.x + (Math.random() - 0.5) * 12, e.y - 14, 0, 0, 0.2, 2, '#ff5050', 0, true, Shape.SPARK);
      if (st.weaken > 0 && Math.random() < 0.06) P.spawn(e.x, e.y - 24, 0, 6, 0.5, 4, '#6b5a40', 0, false, Shape.PUFF);
    }
  }

  // ─────────────────────────── pickups ───────────────────────────

  private drawPickup(pk: Pickup, time: number) {
    const g = this.g;
    if (pk.kind === 'candy') {
      const icon = pk.value >= 40 ? 'exp-candy-xl' : pk.value >= 12 ? 'exp-candy-l' : pk.value >= 4 ? 'exp-candy-m' : 'exp-candy-s';
      const img = assets.itemImage(icon);
      const s = pk.value >= 40 ? 0.75 : pk.value >= 12 ? 0.65 : 0.5;
      if (img) g.drawImage(img, Math.round(pk.x - 15 * s), Math.round(pk.y - 15 * s - 2), 30 * s, 30 * s);
      else { g.fillStyle = '#7fd6ff'; g.fillRect(pk.x - 2, pk.y - 2, 4, 4); }
      return;
    }
    if (pk.kind === 'coin') {
      const bob = Math.sin(time * 6 + pk.id) * 1.5;
      const w = Math.abs(Math.cos(time * 4 + pk.id)) * 4 + 1;
      g.fillStyle = '#b8860b';
      g.fillRect(Math.round(pk.x - w / 2 - 1), Math.round(pk.y - 5 + bob), Math.round(w + 2), 8);
      g.fillStyle = '#ffd94a';
      g.fillRect(Math.round(pk.x - w / 2), Math.round(pk.y - 4 + bob), Math.round(w), 6);
      return;
    }
    const tier = pk.kind === 'chest' ? chestTier(pk.value) : 1;
    const icon = pk.kind === 'chest' ? CHEST_BALL[tier] : PICKUP_ICON[pk.kind];
    const img = icon ? assets.itemImage(icon) : undefined;
    const bob = Math.sin(time * 4 + pk.id) * 2;
    if (pk.kind === 'mega-stone') {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = 0.35;
        g.fillStyle = `hsl(${Math.floor((time * 120 + i * 120) % 360)},100%,60%)`;
        g.fillRect(pk.x - 6 + i * 4 - 2, pk.y - 120, 4, 114);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (pk.kind === 'chest') {
      // A beam of light in the ball's colour; rarer balls shine taller, wider and sparkle.
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + 0.15 * Math.sin(time * 5);
      g.fillStyle = CHEST_COLOR[tier];
      const bw = 6 + tier * 2, bh = 60 + tier * 22;
      g.fillRect(Math.round(pk.x - bw / 2), Math.round(pk.y - bh - 6), bw, bh);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      if (tier >= 2 && Math.random() < 0.1 * tier) {
        this.particles.spawn(pk.x + (Math.random() - 0.5) * 22, pk.y - 8 - Math.random() * 20, 0, -30, 0.6, 3, CHEST_COLOR[tier], 0, true, Shape.SPARK);
      }
    }
    if (img) g.drawImage(img, Math.round(pk.x - 15), Math.round(pk.y - 22 + bob), 30, 30);
  }

  // ─────────────────────────── projectiles ───────────────────────────

  private drawGroundFx(pr: Projectile, world: WorldView) {
    if (pr.moveId === HAZARD) return this.drawHazard(pr, world.time);
    if (pr.behavior === 'terrain') return this.drawTerrain(pr, world.time);
    if (pr.behavior === 'mine') return this.drawMine(pr, world.time);
    if (pr.behavior === 'zone' && pr.shape === 'ring') return this.drawCage(pr, world.time);
    const g = this.g;
    const col = TYPE_COLORS[pr.type];
    const k = pr.t / pr.life;
    const fade = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
    if (pr.behavior === 'aura') {
      const pulse = pr.t < 0.15 ? 1 - pr.t / 0.15 : 0;
      g.fillStyle = col;
      g.globalAlpha = 0.1 + pulse * 0.15;
      g.beginPath(); g.ellipse(pr.x, pr.y, pr.r, pr.r * 0.8, 0, 0, TAU); g.fill();
      g.globalAlpha = 0.35 + pulse * 0.4;
      g.strokeStyle = col; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(pr.x, pr.y, pr.r * (0.9 + pulse * 0.1), pr.r * 0.8 * (0.9 + pulse * 0.1), 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      if (Math.random() < 0.5) {
        const a = Math.random() * TAU, rr = Math.random() * pr.r;
        this.particles.spawn(pr.x + Math.cos(a) * rr, pr.y + Math.sin(a) * rr * 0.8, 0, -15, 0.5, 2, col, 0, true);
      }
      return;
    }
    // zone / trail
    g.globalAlpha = 0.35 * fade;
    g.fillStyle = col;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r, pr.r * 0.65, 0, 0, TAU); g.fill();
    g.globalAlpha = 0.6 * fade;
    g.strokeStyle = col; g.lineWidth = 1;
    const spin = world.time * 2;
    if (pr.fx === 'web') {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(pr.x + Math.cos(a) * pr.r, pr.y + Math.sin(a) * pr.r * 0.65); g.stroke(); }
      g.beginPath(); g.ellipse(pr.x, pr.y, pr.r * 0.6, pr.r * 0.4, 0, 0, TAU); g.stroke();
    } else if (pr.fx === 'spike') {
      g.fillStyle = '#d6b4ff';
      for (let i = 0; i < 5; i++) { const a = i * 2.4; g.fillRect(pr.x + Math.cos(a) * pr.r * 0.6 - 1, pr.y + Math.sin(a) * pr.r * 0.4 - 3, 2, 4); }
    } else {
      g.beginPath(); g.ellipse(pr.x, pr.y, pr.r * 0.7, pr.r * 0.45, spin, 0, TAU * 0.7); g.stroke();
    }
    g.globalAlpha = 1;
    if (Math.random() < 0.35 * fade) {
      const a = Math.random() * TAU, rr = Math.random() * pr.r;
      const c = pr.fx === 'flame' ? (Math.random() < 0.5 ? '#ffb347' : '#ff5e2b') : col;
      this.particles.spawn(pr.x + Math.cos(a) * rr, pr.y + Math.sin(a) * rr * 0.6, 0, -25, 0.5, 2, c, 0, pr.fx === 'flame');
    }
  }

  /**
   * Raid-style ground marker: the whole area is tinted, a brighter fill grows to its edge as the
   * attack winds up, the rim blinks white just before it lands, then the area flashes in the
   * attack's type colour. Shapes are drawn exactly as they hit (no ground squash).
   */
  private drawHazard(pr: Projectile, time: number) {
    const g = this.g;
    const warnOnly = pr.dmg <= 0;
    if (pr.t >= pr.delay) {
      if (warnOnly) return;
      const a = 1 - (pr.t - pr.delay) / HAZARD_IMPACT;
      g.globalAlpha = Math.max(0, a) * 0.75;
      g.fillStyle = TYPE_COLORS[pr.type];
      this.hazardPath(pr, 1);
      g.fill('evenodd');
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = '#ffffff';
      this.hazardPath(pr, 1);
      g.lineWidth = 2;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.globalAlpha = 1;
      return;
    }
    const k = pr.t / pr.delay;
    const left = pr.delay - pr.t;
    const blink = left < 0.3 && Math.floor(time * 16) % 2 === 0;
    const pulse = 0.5 + 0.5 * Math.sin(time * 12);
    g.fillStyle = warnOnly ? 'rgba(255,214,110,0.12)' : `rgba(255,60,30,${0.14 + pulse * 0.05})`;
    this.hazardPath(pr, 1);
    g.fill('evenodd');
    g.fillStyle = warnOnly ? 'rgba(255,214,110,0.16)' : 'rgba(255,110,50,0.34)';
    this.hazardPath(pr, k);
    g.fill('evenodd');
    g.strokeStyle = blink ? '#ffffff' : warnOnly ? '#ffd36b' : '#ff3d24';
    g.lineWidth = blink ? 2 : 1;
    this.hazardPath(pr, 1);
    g.stroke();
  }

  /** Path of a hazard's area; `k` < 1 gives the part filled so far (from the caster/centre outward). */
  private hazardPath(pr: Projectile, k: number) {
    const g = this.g;
    g.beginPath();
    switch (pr.shape) {
      case 'circle':
        g.arc(pr.x, pr.y, Math.max(0.5, pr.r * k), 0, TAU);
        break;
      case 'ring': {
        // Fills from the safe middle outward; evenodd keeps the middle clear.
        const outer = pr.len + (pr.r - pr.len) * k;
        g.arc(pr.x, pr.y, Math.max(pr.len + 0.5, outer), 0, TAU);
        g.moveTo(pr.x + pr.len, pr.y);
        g.arc(pr.x, pr.y, pr.len, 0, TAU);
        break;
      }
      case 'line': {
        const c = Math.cos(pr.angle), s = Math.sin(pr.angle);
        const L = pr.len * k;
        g.moveTo(pr.x - s * pr.r, pr.y + c * pr.r);
        g.lineTo(pr.x - s * pr.r + c * L, pr.y + c * pr.r + s * L);
        g.lineTo(pr.x + s * pr.r + c * L, pr.y - c * pr.r + s * L);
        g.lineTo(pr.x + s * pr.r, pr.y - c * pr.r);
        g.closePath();
        break;
      }
      case 'cone': {
        const half = Math.atan2(pr.r, pr.len);
        g.moveTo(pr.x, pr.y);
        g.arc(pr.x, pr.y, Math.max(0.5, pr.len * k), pr.angle - half, pr.angle + half);
        g.closePath();
        break;
      }
    }
  }

  private drawProjectile(pr: Projectile, world: WorldView) {
    const g = this.g;
    const col = TYPE_COLORS[pr.type];
    if (pr.hostile) {
      const r = pr.r + 1;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(assets.glow.get(pr.type)!, pr.x - r * 2.2, pr.y - r * 2.2, r * 4.4, r * 4.4);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = Math.floor(world.time * 8) % 2 ? '#ffffff' : '#2b0a0a';
      g.beginPath(); g.arc(pr.x, pr.y, r + 0.8, 0, TAU); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.arc(pr.x, pr.y, r - 1.5, 0, TAU); g.fill();
      g.fillStyle = '#ff5050';
      g.fillRect(pr.x - 1, pr.y - 1, 2, 2);
      return;
    }
    if (pr.t < pr.delay && (pr.flags & (PF_RETARGET | PF_FOCUS))) return this.drawCharge(pr, world.time);
    if (pr.behavior === 'wall') return this.drawPillar(pr);
    if (pr.behavior === 'decoy') return this.drawDecoy(pr, world.time);
    if (pr.behavior === 'minion') return this.drawSwarm(pr, world.time);
    if ((pr.flags & PF_STICKY) && pr.follow) return this.drawSticky(pr, world.time);
    if (pr.behavior === 'strike' && pr.follow && pr.t < pr.delay) return this.drawForesight(pr, world.time);
    if (pr.t < pr.delay && pr.behavior !== 'strike') return;
    const k = pr.t / pr.life;
    switch (pr.shape) {
      case 'ring': {
        const a = 1 - Math.max(0, (pr.t - pr.delay) / (pr.life - pr.delay));
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a * 0.9;
        g.strokeStyle = col; g.lineWidth = 3 + a * 5;
        g.beginPath(); g.ellipse(pr.x, pr.y - 4, pr.r, pr.r * 0.8, 0, 0, TAU); g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(pr.x, pr.y - 4, pr.r, pr.r * 0.8, 0, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        return;
      }
      case 'line': {
        const a = 1 - k;
        const ex = pr.x + Math.cos(pr.angle) * pr.len, ey = pr.y + Math.sin(pr.angle) * pr.len;
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        g.globalAlpha = a * 0.6;
        g.strokeStyle = col; g.lineWidth = pr.r * 2 * (0.6 + a * 0.6);
        g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(ex, ey); g.stroke();
        g.globalAlpha = a;
        g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, pr.r * 0.6 * a);
        g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(ex, ey); g.stroke();
        g.globalAlpha = 1;
        g.lineCap = 'butt';
        g.globalCompositeOperation = 'source-over';
        if (pr.t < 0.05) for (let i = 0; i < 6; i++) { const d = Math.random() * pr.len; this.particles.spawn(pr.x + Math.cos(pr.angle) * d, pr.y + Math.sin(pr.angle) * d, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.4, 2, col, 0, true); }
        return;
      }
      case 'box': {
        if (pr.behavior === 'wave') return this.drawWave(pr, col, world.time);
        const a = 1 - k;
        g.save();
        g.translate(pr.x, pr.y - 6);
        g.rotate(pr.angle);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a;
        g.strokeStyle = col; g.lineWidth = Math.max(2, pr.r * 0.5);
        const sweep = Math.PI * 0.9;
        const start = -sweep / 2 + (pr.fx === 'slash' ? k * 0.6 : 0);
        g.beginPath(); g.ellipse(-pr.len * 0.35, 0, pr.len, pr.r, 0, start, start + sweep); g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, pr.r * 0.18);
        g.beginPath(); g.ellipse(-pr.len * 0.35, 0, pr.len, pr.r, 0, start + 0.2, start + sweep - 0.2); g.stroke();
        if (pr.fx === 'punch' || pr.fx === 'fang') {
          g.fillStyle = '#fff';
          for (let i = 0; i < 6; i++) { const aa = (i / 6) * TAU; g.fillRect(pr.len * 0.5 + Math.cos(aa) * 6 * (1 + k * 2), Math.sin(aa) * 6 * (1 + k * 2), 2, 2); }
        }
        g.restore();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        return;
      }
      case 'cone': {
        const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
        const half = Math.atan2(pr.r, pr.len);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.25 * a;
        g.fillStyle = col;
        g.beginPath(); g.moveTo(pr.x, pr.y); g.arc(pr.x, pr.y, pr.len, pr.angle - half, pr.angle + half); g.closePath(); g.fill();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 4; i++) {
          const aa = pr.angle + (Math.random() - 0.5) * half * 2;
          const sp = pr.len * (1.6 + Math.random());
          const c = pr.fx === 'flame' ? (Math.random() < 0.5 ? '#ffd166' : '#ff6b2b') : pr.fx === 'shard' ? (Math.random() < 0.5 ? '#ffffff' : '#bdefff') : col;
          this.particles.spawn(pr.x, pr.y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.35, 3, c, 0, true);
        }
        return;
      }
      default:
        break;
    }
    // circle-shaped things
    switch (pr.behavior) {
      case 'strike': return this.drawStrike(pr, col);
      case 'lob': return this.drawLob(pr, col);
      case 'buff': {
        g.strokeStyle = col; g.globalAlpha = 1 - k; g.lineWidth = 2;
        g.beginPath(); g.ellipse(pr.x, pr.y - 10, 10 + k * 22, (10 + k * 22) * 0.8, 0, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        if (Math.random() < 0.6) this.particles.spawn(pr.x + (Math.random() - 0.5) * 24, pr.y, 0, -60, 0.5, 2, col, 0, true);
        return;
      }
      case 'orbit':
        this.particles.spawn(pr.x, pr.y, 0, 0, 0.22, Math.max(2, pr.r * 0.45), col, 0, true, Shape.PUFF);
        this.drawBullet(pr, col, world.time);
        return;
      default:
        if (pr.fx === 'flame' && Math.random() < 0.6) this.particles.spawn(pr.x, pr.y, -pr.vx * 0.1, -pr.vy * 0.1 - 10, 0.3, 3, Math.random() < 0.5 ? '#ffb347' : '#ff5e2b', 0, true, Shape.PUFF);
        this.drawBullet(pr, col, world.time);
    }
  }

  private drawBullet(pr: Projectile, col: string, time: number) {
    const g = this.g;
    const r = pr.r;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.8;
    g.drawImage(assets.glow.get(pr.type)!, pr.x - r * 2, pr.y - r * 2, r * 4, r * 4);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const a = pr.vx || pr.vy ? Math.atan2(pr.vy, pr.vx) : pr.angle;
    g.save();
    g.translate(pr.x, pr.y);
    switch (pr.fx) {
      case 'star': g.rotate(time * 8); star(g, 5, r, r * 0.45, '#fff6a8'); break;
      case 'leaf': g.rotate(a + time * 10); g.fillStyle = '#3f9c35'; g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, TAU); g.fill(); g.fillStyle = '#9be36b'; g.fillRect(-r, -0.5, r * 2, 1); break;
      case 'needle': g.rotate(a); g.fillStyle = '#eee'; g.fillRect(-r * 1.6, -1, r * 3.2, 2); g.fillStyle = col; g.fillRect(r * 0.8, -1.5, r * 0.8, 3); break;
      case 'seed': g.rotate(a); g.fillStyle = '#d9b44a'; g.beginPath(); g.ellipse(0, 0, r * 1.2, r * 0.8, 0, 0, TAU); g.fill(); break;
      case 'rock': g.rotate(time * 4 + pr.id); g.fillStyle = '#8b7d6b'; g.fillRect(-r, -r * 0.8, r * 2, r * 1.6); g.fillStyle = '#b3a58f'; g.fillRect(-r * 0.6, -r * 0.6, r, r * 0.6); break;
      case 'bone': g.rotate(time * 14); g.fillStyle = '#f2ead3'; g.fillRect(-r, -1.5, r * 2, 3); g.fillRect(-r - 2, -3, 3, 6); g.fillRect(r - 1, -3, 3, 6); break;
      case 'shard': g.rotate(a); g.fillStyle = '#e8fbff'; g.beginPath(); g.moveTo(r * 1.4, 0); g.lineTo(0, r * 0.6); g.lineTo(-r, 0); g.lineTo(0, -r * 0.6); g.fill(); break;
      case 'bubble': g.strokeStyle = '#d8f1ff'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, r * 0.9, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(-r * 0.4, -r * 0.5, 2, 2); break;
      case 'heart': g.rotate(Math.sin(time * 6) * 0.3); heart(g, r, '#ffc4e4'); break;
      case 'tornado': g.rotate(time * 12); g.strokeStyle = '#f2f2ff'; g.lineWidth = 1.5; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, r * (0.4 + i * 0.25), i, i + 4); g.stroke(); } break;
      case 'slash': case 'wind': g.rotate(a); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(-r * 0.5, 0, r * 1.2, -1.1, 1.1); g.stroke(); break;
      case 'punch': g.fillStyle = '#ffe0c2'; g.beginPath(); g.arc(0, 0, r * 0.8, 0, TAU); g.fill(); g.strokeStyle = '#7a3e1d'; g.lineWidth = 1; g.stroke(); break;
      case 'shadow': g.fillStyle = '#2a1640'; g.beginPath(); g.arc(0, 0, r * 0.85, 0, TAU); g.fill(); g.fillStyle = '#b07cff'; g.beginPath(); g.arc(-r * 0.25, -r * 0.25, r * 0.35, 0, TAU); g.fill(); break;
      case 'bolt': g.rotate(a); g.strokeStyle = '#fff9a8'; g.lineWidth = 2; g.beginPath(); g.moveTo(-r, -2); g.lineTo(0, 2); g.lineTo(r, -2); g.stroke(); break;
      case 'ring': g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 0.8, time * 10, time * 10 + 4); g.stroke(); break;
      case 'flame': g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(0, 0, r * 0.55, 0, TAU); g.fill(); break;
      case 'note': g.fillStyle = '#fff'; g.fillRect(-1, -r, 2, r); g.beginPath(); g.arc(-2, 0, 2.5, 0, TAU); g.fill(); break;
      default: g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill();
    }
    g.restore();
  }

  private drawWave(pr: Projectile, col: string, time: number) {
    const g = this.g;
    const k = pr.t / pr.life;
    const a = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, pr.t * 6);
    g.save();
    g.translate(pr.x, pr.y - 6);
    g.rotate(pr.angle);
    g.globalAlpha = a * 0.75;
    if (pr.fx === 'tornado') {
      g.rotate(-pr.angle);
      g.strokeStyle = '#eef'; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(0, -i * 6, pr.r * (0.35 + i * 0.12), pr.r * 0.15, 0, time * 8 + i, time * 8 + i + 4.5); g.stroke(); }
    } else {
      g.fillStyle = col;
      g.beginPath(); g.ellipse(0, 0, pr.len + 4, pr.r, 0, -Math.PI / 2, Math.PI / 2); g.fill();
      g.fillStyle = '#ffffff';
      g.globalAlpha = a * 0.6;
      g.beginPath(); g.ellipse(2, 0, pr.len * 0.6, pr.r * 0.9, 0, -Math.PI / 2, Math.PI / 2); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    if (Math.random() < 0.7) {
      const off = (Math.random() - 0.5) * pr.r * 2;
      this.particles.spawn(pr.x - Math.sin(pr.angle) * off, pr.y + Math.cos(pr.angle) * off - 6, -pr.vx * 0.2, -pr.vy * 0.2, 0.4, 3, pr.fx === 'wave' ? '#d8f1ff' : col, 0, true);
    }
  }

  private drawStrike(pr: Projectile, col: string) {
    const g = this.g;
    if (pr.t < pr.delay) {
      const k = pr.t / pr.delay;
      g.strokeStyle = col; g.globalAlpha = 0.4 + k * 0.5; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(pr.x, pr.y, pr.r * (1.6 - k * 0.6), pr.r * 0.6 * (1.6 - k * 0.6), 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      if (pr.fx === 'meteor' || pr.fx === 'rock' || pr.fx === 'fang' || pr.fx === 'punch') {
        const h = (1 - k) * 160;
        g.fillStyle = pr.fx === 'meteor' ? '#ffcf6b' : pr.fx === 'rock' ? '#9a8b75' : '#fff';
        g.beginPath(); g.arc(pr.x, pr.y - h, pr.r * 0.35, 0, TAU); g.fill();
        if (pr.fx === 'meteor') this.particles.spawn(pr.x, pr.y - h, 0, -20, 0.3, 3, '#ff7b2b', 0, true);
      }
      return;
    }
    const k = Math.min(1, (pr.t - pr.delay) / (pr.life - pr.delay));
    if (pr.t - pr.delay < 0.03) {
      this.particles.burst(pr.x, pr.y, 10, pr.r * 4, col, 0.4, 3, true, 0, Shape.SPARK);
      this.particles.ring(pr.x, pr.y, pr.r, col, 0.25);
      this.addShake(0.6);
    }
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 1 - k;
    if (pr.fx === 'bolt') {
      g.strokeStyle = '#fffbd0'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(pr.x + 10, pr.y - 220);
      for (let y = -200; y < 0; y += 20) g.lineTo(pr.x + (Math.random() - 0.5) * 18, pr.y + y);
      g.lineTo(pr.x, pr.y); g.stroke();
      g.strokeStyle = col; g.lineWidth = 6; g.globalAlpha = (1 - k) * 0.4; g.stroke();
    }
    g.globalAlpha = (1 - k) * 0.8;
    g.drawImage(assets.glow.get(pr.type)!, pr.x - pr.r * 1.6, pr.y - pr.r * 1.6, pr.r * 3.2, pr.r * 3.2);
    g.strokeStyle = col; g.lineWidth = 3 * (1 - k) + 1;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r * (0.6 + k * 0.6), pr.r * 0.6 * (0.6 + k * 0.6), 0, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawLob(pr: Projectile, col: string) {
    const g = this.g;
    const flight = pr.len;
    const t = pr.t - pr.delay;
    if (t < flight) {
      const k = Math.max(0, t / flight);
      const h = Math.sin(k * Math.PI) * Math.min(70, flight * 140);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(pr.x, pr.y, 5, 2.5, 0, 0, TAU); g.fill();
      const fake = { ...pr, y: pr.y - h, vx: pr.tx - pr.sx, vy: pr.ty - pr.sy, r: Math.max(5, pr.r * 0.22) };
      this.drawBullet(fake, col, t);
      return;
    }
    const k = Math.min(1, (t - flight) / Math.max(0.05, pr.life - pr.delay - flight));
    if (t - flight < 0.03) { this.particles.burst(pr.x, pr.y, 12, pr.r * 4, col, 0.45, 3, true, 0, Shape.SPARK); this.particles.burst(pr.x, pr.y, 5, pr.r * 1.5, '#d8d0c8', 0.5, 4, false, -15, Shape.PUFF); this.addShake(1); }
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = (1 - k) * 0.9;
    g.drawImage(assets.glow.get(pr.type)!, pr.x - pr.r * 1.4, pr.y - pr.r * 1.4, pr.r * 2.8, pr.r * 2.8);
    g.strokeStyle = col; g.lineWidth = 3;
    g.beginPath(); g.ellipse(pr.x, pr.y, pr.r * (0.5 + k * 0.6), pr.r * 0.6 * (0.5 + k * 0.6), 0, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawChains(dt: number) {
    const g = this.g;
    g.globalCompositeOperation = 'lighter';
    for (const c of this.chains) {
      c.t += dt;
      const a = 1 - c.t / 0.25;
      if (a <= 0) continue;
      for (const [w, col] of [[4, c.color], [1.5, '#ffffff']] as [number, string][]) {
        g.strokeStyle = col; g.lineWidth = w; g.globalAlpha = a;
        g.beginPath();
        g.moveTo(c.pts[0], c.pts[1]);
        for (let i = 2; i < c.pts.length; i += 2) {
          const px = c.pts[i - 2], py = c.pts[i - 1], x = c.pts[i], y = c.pts[i + 1];
          for (let s = 1; s <= 3; s++) {
            const k = s / 3;
            g.lineTo(px + (x - px) * k + (s < 3 ? (Math.random() - 0.5) * 10 : 0), py + (y - py) * k + (s < 3 ? (Math.random() - 0.5) * 10 : 0));
          }
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (this.chains.length && this.chains[0].t > 0.25) this.chains = this.chains.filter((c) => c.t < 0.25);
  }

  private drawBooms(dt: number) {
    const g = this.g;
    for (const b of this.booms) {
      b.t += dt;
      const k = b.t / 0.35;
      if (k >= 1) continue;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 1 - k;
      g.drawImage(assets.glow.get('fire')!, b.x - b.r * 1.5, b.y - b.r * 1.5, b.r * 3, b.r * 3);
      g.strokeStyle = b.color; g.lineWidth = 4 * (1 - k) + 1;
      g.beginPath(); g.ellipse(b.x, b.y, b.r * k, b.r * 0.7 * k, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (this.booms.length && this.booms[0].t > 0.35) this.booms = this.booms.filter((b) => b.t < 0.35);
  }

  // ─────────────────────────── screen-space ───────────────────────────

  private drawDarkness(strength: number, cx: number, cy: number) {
    const g = this.g;
    const w = this.canvas.width, h = this.canvas.height;
    if (!this.vignette) {
      const c = document.createElement('canvas');
      c.width = w * 2; c.height = h * 2;
      const vg = c.getContext('2d')!;
      const grad = vg.createRadialGradient(w, h, Math.min(w, h) * 0.18, w, h, Math.max(w, h) * 0.75);
      grad.addColorStop(0, 'rgba(5,0,15,0)');
      grad.addColorStop(1, 'rgba(5,0,15,1)');
      vg.fillStyle = grad;
      vg.fillRect(0, 0, c.width, c.height);
      this.vignette = c;
    }
    g.globalAlpha = strength;
    g.drawImage(this.vignette, cx - w, cy - h);
    g.globalAlpha = 1;
  }

  /** Soft red vignette for low HP; same radial technique as the stage darkness, centred on the screen. */
  private drawDanger(strength: number) {
    if (strength <= 0) return;
    const g = this.g;
    const w = this.canvas.width, h = this.canvas.height;
    if (!this.dangerVignette) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const vg = c.getContext('2d')!;
      const grad = vg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.65);
      grad.addColorStop(0, 'rgba(200,0,0,0)');
      grad.addColorStop(1, 'rgba(200,0,0,1)');
      vg.fillStyle = grad;
      vg.fillRect(0, 0, w, h);
      this.dangerVignette = c;
    }
    g.globalAlpha = strength;
    g.drawImage(this.dangerVignette, 0, 0);
    g.globalAlpha = 1;
  }

  private drawIndicators(world: WorldView, left: number, top: number) {
    const g = this.g;
    const z = this.zoom;
    // Marker sizes follow the screen, not the evolution pull-back.
    const u = Math.min(2, this.baseZoom / 2);
    const W = this.canvas.width, H = this.canvas.height;
    const mark = (x: number, y: number, color: string, size: number) => {
      const sx = (x - left) * z, sy = (y - top) * z;
      if (sx > 0 && sx < W && sy > 0 && sy < H) return;
      const cx = W / 2, cy = H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const m = 28 * Math.min(2, this.baseZoom / 2 + 0.5);
      const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
      const px = cx + Math.cos(a) * k, py = cy + Math.sin(a) * k;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.fillStyle = color;
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(size, 0); g.lineTo(-size * 0.6, size * 0.7); g.lineTo(-size * 0.6, -size * 0.7); g.closePath();
      g.fill(); g.stroke();
      g.restore();
    };
    for (const e of world.enemies) if (e.boss && e.alive) mark(e.x, e.y, '#ff4b4b', 14 * u);
    for (const pk of world.pickups) if (pk.kind === 'chest') mark(pk.x, pk.y, CHEST_COLOR[chestTier(pk.value)], (9 + chestTier(pk.value)) * u);
    for (const pk of world.pickups) if (pk.kind === 'mega-stone') mark(pk.x, pk.y, `hsl(${Math.floor((world.time * 120) % 360)},100%,65%)`, 12 * u);
    for (const p of world.players) if (p.id !== this.localId && p.connected) mark(p.x, p.y, SLOT_COLORS[p.slot], 10 * u);
  }

  /** Mega Evolution: the partner is wrapped in a rainbow sphere that shatters into the Mega form. */
  private drawMegaEvolution(c: Cinematic, world: WorldView) {
    const g = this.g;
    const W = this.canvas.width, H = this.canvas.height;
    const p = world.players[c.player];
    if (!p) return;
    const k = c.t / c.dur;
    const mega = MEGA[c.from!];
    g.fillStyle = `rgba(8,6,24,${Math.min(0.8, c.t * 3)})`;
    g.fillRect(0, 0, W, H);
    const scale = Math.max(3, Math.round(Math.min(W, H) / 110));
    const cx = W / 2, cy = H / 2 - 20;
    const reveal = k > 0.72;
    let set = assets.get(c.from!, p.shiny);
    if (reveal && mega?.sprite) set = assets.get(mega.id, p.shiny) ?? set;
    if (mega?.sprite && !assets.get(mega.id, p.shiny)) void assets.load(mega.id, p.shiny);
    // rainbow ribbons converging on the partner
    g.globalCompositeOperation = 'lighter';
    const rings = 6;
    for (let i = 0; i < rings; i++) {
      const a0 = c.t * 5 + (i / rings) * TAU;
      const r = (1 - Math.min(1, k / 0.6)) * Math.min(W, H) * 0.45 + 30 * scale * 0.4;
      g.strokeStyle = `hsl(${(i * 60 + c.t * 200) % 360},100%,60%)`;
      g.lineWidth = scale * 2;
      g.beginPath();
      g.arc(cx, cy, r, a0, a0 + 1.4);
      g.stroke();
    }
    if (k > 0.45 && k < 0.75) {
      // the sphere
      const s = (k - 0.45) / 0.3;
      g.globalAlpha = 0.5 + s * 0.5;
      g.fillStyle = `hsl(${(c.t * 300) % 360},100%,75%)`;
      g.beginPath();
      g.arc(cx, cy, 22 * scale * (0.6 + s * 0.4), 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';
    if (set && (k < 0.5 || reveal)) {
      const anim = set.idle;
      const f = anim.frameAt(c.t);
      const sc = scale * (reveal && !mega?.sprite ? 1.25 : 1);
      g.imageSmoothingEnabled = false;
      g.drawImage(k > 0.3 && k < 0.5 ? anim.whiteSheet() : anim.img, f * anim.fw, 0, anim.fw, anim.fh, cx - (anim.fw * sc) / 2, cy - (anim.fh * sc) / 2, anim.fw * sc, anim.fh * sc);
    }
    if (k > 0.72 && k < 0.76) {
      this.flash = 0.9;
      this.flashColor = '#fff';
      this.particles.burst(p.x, p.y - 10, 50, 260, '#ffffff', 1, 5, true, 0, Shape.SPARK);
    }
    g.textAlign = 'center';
    const fs = Math.max(12, Math.round(H / 40));
    g.font = `${fs}px "Press Start 2P", monospace`;
    const name = SPECIES[c.from!]?.name.toUpperCase() ?? '';
    const text = !reveal ? `${name}'s Mega Stone is reacting!` : mega ? `${name} Mega Evolved into ${mega.name.toUpperCase()}!` : `${name} is overflowing with power!`;
    g.fillStyle = '#000';
    g.fillText(text, W / 2 + 2, H * 0.78 + 2);
    g.fillStyle = '#fff';
    g.fillText(text, W / 2, H * 0.78);
  }

  private drawEvolution(c: Cinematic, world: WorldView) {
    const g = this.g;
    const W = this.canvas.width, H = this.canvas.height;
    const k = c.t / c.dur;
    g.fillStyle = `rgba(8,10,30,${Math.min(0.85, c.t * 2)})`;
    g.fillRect(0, 0, W, H);
    const from = assets.get(c.from!, world.players[c.player]?.shiny);
    const to = assets.get(c.to!, world.players[c.player]?.shiny);
    if (!to) void assets.load(c.to!, world.players[c.player]?.shiny);
    const scale = Math.max(3, Math.round(Math.min(W, H) / 110));
    // Classic flicker between silhouettes that speeds up, then reveal.
    const freq = 2 + k * k * 22;
    const showTo = k > 0.82 || (k > 0.2 && Math.sin(c.t * freq * Math.PI) > 0);
    const set = showTo ? to ?? from : from;
    if (set) {
      const anim = set.idle;
      const white = k > 0.12 && k < 0.85;
      const f = anim.frameAt(c.t);
      const img = white ? anim.whiteSheet() : anim.img;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, f * anim.fw, 0, anim.fw, anim.fh, W / 2 - (anim.fw * scale) / 2, H / 2 - (anim.fh * scale) / 2 - 20, anim.fw * scale, anim.fh * scale);
    }
    if (k > 0.82 && k < 0.86) this.particles.burst(world.players[c.player]?.x ?? 0, (world.players[c.player]?.y ?? 0) - 10, 40, 200, '#fff6a8', 1, 5, true, 0, Shape.SPARK);
    g.textAlign = 'center';
    const fs = Math.max(12, Math.round(H / 40));
    g.font = `${fs}px "Press Start 2P", monospace`;
    const name = (id: string) => SPECIES[id]?.name.toUpperCase() ?? id;
    const text = k < 0.85 ? `What? ${name(c.from!)} is evolving!` : `${name(c.from!)} evolved into ${name(c.to!)}!`;
    g.fillStyle = '#000';
    g.fillText(text, W / 2 + 2, H * 0.78 + 2);
    g.fillStyle = '#fff';
    g.fillText(text, W / 2, H * 0.78);
  }
}

export const SLOT_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b'];

export const chestTier = (v: number) => Math.max(1, Math.min(4, Math.round(v))) as ChestTier;

/** Ground effects the fx-opacity setting may fade: everything except terrain, mines and cages. */
function isDimmable(pr: Projectile) {
  return pr.moveId === HAZARD || !(pr.behavior === 'terrain' || pr.behavior === 'mine' || (pr.behavior === 'zone' && pr.shape === 'ring'));
}

function isGroundFx(pr: Projectile) {
  return pr.moveId === HAZARD || (!pr.hostile && (pr.behavior === 'zone' || pr.behavior === 'trail' || pr.behavior === 'aura'
    || pr.behavior === 'terrain' || (pr.behavior === 'mine' && pr.fx !== 'bubble')));
}

/** True for pale badge colours that need dark text. */
function lightColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
}

function inView(x: number, y: number, L: number, T: number, W: number, H: number, m: number) {
  return x > L - m && x < L + W + m && y > T - m && y < T + H + m;
}

/** Sprite sheet row facing the camera (kill events carry no heading). */
const DOWN_ROW = dirRow(0, 1);
/** Camera zoom multiplier per evolution stage of the local partner. */
const EVO_ZOOM = [1, 0.9, 0.8];
const PUNCH_ZOOM = 0.04;
const PUNCH_LIFE = 0.25;
/** Partners draw larger as they evolve (cosmetic; hitboxes are unchanged). With EVO_ZOOM the
 * partner keeps roughly its on-screen size while the world around it shrinks. */
const growth = (p: Player) => [1, 1.15, 1.3][Math.min(p.stage, 2)];

function shadow(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.ellipse(x, y, r, r * 0.4, 0, 0, TAU);
  g.fill();
}

function star(g: CanvasRenderingContext2D, n: number, r1: number, r2: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (i / (n * 2)) * TAU - Math.PI / 2;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

function heart(g: CanvasRenderingContext2D, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, r * 0.8);
  g.bezierCurveTo(-r * 1.4, -r * 0.2, -r * 0.6, -r * 1.2, 0, -r * 0.4);
  g.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.2, 0, r * 0.8);
  g.fill();
}

