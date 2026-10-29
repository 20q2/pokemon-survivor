import type { StageDef } from '../data/stages.ts';
import type { RunSummary } from '../meta/achievements.ts';
import { MOVES, MAX_MOVE_LEVEL } from '../data/moves.ts';
import { MAX_ITEM_LEVEL } from '../data/items.ts';
import type { WorldView } from '../render/renderer.ts';
import { Sim, DT, type Phase, type SimConfig } from './sim.ts';
import type { GameEvent, Player, UpgradeOffer } from './types.ts';

export interface HudInfo {
  time: number;
  level: number;
  xp: number;
  xpNext: number;
  money: number;
  kills: number;
}

/** Common surface for solo, host and client runs. */
export interface RunSession {
  readonly world: WorldView & HudInfo;
  readonly localId: number;
  readonly coop: boolean;
  readonly stage: StageDef;
  /** Advance by real dt; input is the local movement vector. */
  step(dt: number, mx: number, my: number, viewW: number, viewH: number): void;
  drainEvents(): GameEvent[];
  phase(): Phase;
  offers(): UpgradeOffer[] | null;
  waitingOn(): string[];
  choose(i: number): void;
  reroll(): void;
  skip(): void;
  banish(i: number): void;
  paused: boolean;
  dispose(): void;
  /** Present on client sessions: true once the host has gone away. */
  lost?: boolean;
  /** Extra data for the summary (seen species etc). */
  seen(): Iterable<string>;
  defeated(): Map<string, number>;
  firstHit: number;
}

/** Runs the authoritative simulation locally (solo, or as co-op host). */
export class LocalSession implements RunSession {
  readonly sim: Sim;
  readonly localId = 0;
  readonly coop: boolean;
  paused = false;
  private acc = 0;
  firstHit = Infinity;
  /** Called after each fixed tick (used by the network host). */
  onTick: (() => void) | null = null;

  constructor(cfg: SimConfig, coop = false) {
    this.sim = new Sim(cfg);
    this.coop = coop;
    this.sim.replicate = coop;
  }

  get world() {
    return this.sim;
  }

  get stage() {
    return this.sim.stage;
  }

  step(dt: number, mx: number, my: number, viewW: number, viewH: number) {
    const me = this.sim.players[this.localId];
    me.mx = mx;
    me.my = my;
    me.viewW = viewW;
    me.viewH = viewH;
    if (this.paused && !this.coop) return;
    this.acc = Math.min(this.acc + dt, DT * 5);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.sim.update(DT);
      if (this.firstHit === Infinity && me.dmgTaken > 0) this.firstHit = this.sim.time;
      this.onTick?.();
    }
    this.sim.alpha = this.acc / DT;
  }

  drainEvents() {
    const ev = this.sim.events;
    this.sim.events = [];
    return ev;
  }

  phase() {
    return this.sim.phase;
  }

  offers() {
    return this.sim.offers.get(this.localId) ?? null;
  }

  waitingOn() {
    return [...this.sim.offers.keys()].filter((id) => id !== this.localId).map((id) => this.sim.players[id]?.name ?? '?');
  }

  choose(i: number) { this.sim.choose(this.localId, i); }
  reroll() { this.sim.reroll(this.localId); }
  skip() { this.sim.skip(this.localId); }
  banish(i: number) { this.sim.banish(this.localId, i); }
  seen() { return this.sim.seenSpecies; }
  defeated() { return this.sim.defeatedSpecies; }
  dispose() { /* nothing */ }
}

/** Build the per-player summary used for saves/achievements. */
export function summarize(session: RunSession, p: Player, cleared: boolean, extra: { bosses: number; died: boolean; defeatedChansey: boolean; alphas: number }): RunSummary {
  const w = session.world;
  const moveTypesOk = p.moves.every((m) => p.types.includes(MOVES[m.id].type) || MOVES[m.id].cat === 'status');
  return {
    stageId: session.stage.id,
    lineId: p.lineId,
    finalSpecies: p.speciesId,
    shiny: p.shiny,
    time: w.time,
    level: w.level,
    kills: w.kills,
    bosses: extra.bosses,
    cleared,
    moneyEarned: Math.round(w.money * (p.stats?.money ?? 1)),
    superEff: p.superEff,
    evolutions: p.evolutions,
    masteries: p.masteries,
    shinyKills: p.shinyKills,
    coop: session.coop,
    firstHit: session.firstHit,
    maxedMoves: p.moves.filter((m) => m.level >= MAX_MOVE_LEVEL || MOVES[m.id].mastery).length,
    maxedItems: p.items.filter((i) => i.level >= MAX_ITEM_LEVEL).length,
    stabOnly: moveTypesOk,
    defeatedChansey: extra.defeatedChansey,
    died: extra.died,
    elite: !!(session.world as { elite?: boolean }).elite,
    megas: p.megas,
    alphas: extra.alphas,
  };
}
