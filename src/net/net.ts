import Peer, { type DataConnection } from 'peerjs';
import { LINE, SPECIES } from '../data/pokedex.ts';
import { stepProjectileMotion } from '../game/combat.ts';
import { LocalSession, type RunSession } from '../game/session.ts';
import { Sim, type Phase, type PlayerInit, type SimConfig, type Cinematic } from '../game/sim.ts';
import type { Enemy, GameEvent, Player, UpgradeOffer } from '../game/types.ts';
import type { Ledger } from '../game/ledger.ts';
import { decodeSnapshot, encodeSnapshot, PICKUP_KINDS, projFromWire, projToWire, PROTOCOL, ROOM_PREFIX, SNAP_HZ } from './protocol.ts';

export interface LobbyPlayer { slot: number; name: string; lineId: string; shiny: boolean; ready: boolean }

type ClientMsg =
  | { t: 'hello'; v: number; init: PlayerInit }
  | { t: 'pick'; init: PlayerInit }
  | { t: 'in'; x: number; y: number; fx: number; fy: number; mv: boolean; vw: number; vh: number }
  | { t: 'choose'; i: number } | { t: 'reroll' } | { t: 'skip' } | { t: 'banish'; i: number };

interface PlayerState {
  id: number; sp: string; st: number; ty: Player['types']; mv: [string, number, number, number, number][]; it: [string, number][];
  bf: Player['buffs']; rr: number; sk: number; bn: number; nm: string; con: boolean; k: number; dd: number; se: number;
  ev: number; ma: number; sh: number; pk: number; vt: Record<string, number>; mg: number; mt: number; lg: Ledger;
}

type HostMsg =
  | { t: 'lobby'; players: LobbyPlayer[]; stage: string; you: number; elite: boolean }
  | { t: 'start'; cfg: SimConfig; you: number }
  | { t: 'tick'; ph: Phase; cine: Cinematic | null; lv: number; xp: number; xn: number; m: number; k: number; b: number; tm: number;
      of: UpgradeOffer[] | null; wait: string[]; ev: GameEvent[]; np: unknown[][]; dp: number[]; nk: unknown[][]; dk: [number, number][]; ps?: PlayerState[] }
  | { t: 'full'; reason: string }
  | { t: 'bye' };

const LEVELUP_TIMEOUT_MS = 30000;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function peerError(e: unknown): string {
  const t = (e as { type?: string })?.type;
  if (t === 'peer-unavailable') return 'No game found with that code.';
  if (t === 'unavailable-id') return 'That room code is already in use — try again.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Could not reach the matchmaking server. Check your connection.';
  if (t === 'browser-incompatible') return 'Your browser does not support WebRTC.';
  return String((e as Error)?.message ?? e);
}

// ─────────────────────────── host ───────────────────────────

interface Remote { ctl: DataConnection; snap: DataConnection | null; slot: number; init: PlayerInit }

export class NetHost {
  readonly role = 'host' as const;
  code = '';
  private peer: Peer | null = null;
  private remotes = new Map<string, Remote>();
  lobbyInit: PlayerInit;
  stage = 'viridian';
  elite = false;
  session: LocalSession | null = null;
  onLobby: (() => void) | null = null;
  onError: ((msg: string) => void) | null = null;
  private evBuf: GameEvent[] = [];
  private sendT = 0;
  private psT = 0;

  constructor(init: PlayerInit) {
    this.lobbyInit = init;
  }

  open(): Promise<string> {
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt: number) => {
        const code = makeCode();
        const peer = new Peer(ROOM_PREFIX + code, { debug: 0 });
        peer.on('open', () => { this.peer = peer; this.code = code; resolve(code); });
        peer.on('error', (e) => {
          if ((e as { type?: string }).type === 'unavailable-id' && attempt < 3) { peer.destroy(); tryOpen(attempt + 1); return; }
          if (!this.peer) reject(new Error(peerError(e)));
          else this.onError?.(peerError(e));
        });
        peer.on('connection', (c) => this.accept(c));
      };
      tryOpen(0);
    });
  }

  private nextSlot(): number {
    const used = new Set([0, ...[...this.remotes.values()].map((r) => r.slot)]);
    for (let i = 1; i < 4; i++) if (!used.has(i)) return i;
    return -1;
  }

  private accept(c: DataConnection) {
    const peerId = c.peer;
    if (c.label === 'snap') {
      const r = this.remotes.get(peerId);
      if (r) r.snap = c;
      c.on('data', (d) => this.onData(peerId, d));
      return;
    }
    c.on('open', () => {
      if (this.session) { c.send(JSON.stringify({ t: 'full', reason: 'Game already in progress.' })); setTimeout(() => c.close(), 300); return; }
      const slot = this.nextSlot();
      if (slot < 0) { c.send(JSON.stringify({ t: 'full', reason: 'Room is full (4 players).' })); setTimeout(() => c.close(), 300); return; }
      this.remotes.set(peerId, { ctl: c, snap: null, slot, init: { ...this.lobbyInit, name: '...' } });
    });
    c.on('data', (d) => this.onData(peerId, d));
    c.on('close', () => this.drop(peerId));
    c.on('error', () => this.drop(peerId));
  }

  private drop(peerId: string) {
    const r = this.remotes.get(peerId);
    if (!r) return;
    this.remotes.delete(peerId);
    const p = this.session?.sim.players[r.slot];
    if (p) {
      p.connected = false;
      this.session!.sim.offers.delete(p.id);
      if (this.session!.sim.phase === 'levelup' && this.session!.sim.offers.size === 0) this.session!.sim.phase = 'play';
      this.session!.sim.emit({ e: 'warn', text: `${p.name} left the game.` });
    }
    this.broadcastLobby();
  }

  private onData(peerId: string, raw: unknown) {
    if (typeof raw !== 'string') return;
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { return; }
    const r = this.remotes.get(peerId);
    if (!r) return;
    const sim = this.session?.sim;
    switch (msg.t) {
      case 'hello':
        if (msg.v !== PROTOCOL) { r.ctl.send(JSON.stringify({ t: 'full', reason: 'Version mismatch — refresh both browsers.' })); return; }
        r.init = sanitizeInit(msg.init);
        this.broadcastLobby();
        break;
      case 'pick':
        r.init = sanitizeInit(msg.init);
        this.broadcastLobby();
        break;
      case 'in': {
        const p = sim?.players[r.slot];
        if (!p || p.fainted) break;
        if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
          // Trust but clamp: no teleporting more than a generous distance per update.
          const max = 120;
          p.x += Math.max(-max, Math.min(max, msg.x - p.x));
          p.y += Math.max(-max, Math.min(max, msg.y - p.y));
        }
        const l = Math.hypot(msg.fx, msg.fy);
        if (l > 0.1) { p.fx = msg.fx / l; p.fy = msg.fy / l; }
        p.moving = !!msg.mv;
        p.viewW = Math.min(2400, Math.max(320, msg.vw || 960));
        p.viewH = Math.min(1400, Math.max(240, msg.vh || 540));
        break;
      }
      case 'choose': sim?.choose(r.slot, msg.i | 0); break;
      case 'reroll': sim?.reroll(r.slot); break;
      case 'skip': sim?.skip(r.slot); break;
      case 'banish': sim?.banish(r.slot, msg.i | 0); break;
    }
  }

  lobbyPlayers(): LobbyPlayer[] {
    const out: LobbyPlayer[] = [{ slot: 0, name: this.lobbyInit.name, lineId: this.lobbyInit.lineId, shiny: this.lobbyInit.shiny, ready: true }];
    for (const r of this.remotes.values()) out.push({ slot: r.slot, name: r.init.name, lineId: r.init.lineId, shiny: r.init.shiny, ready: r.init.name !== '...' });
    return out.sort((a, b) => a.slot - b.slot);
  }

  broadcastLobby() {
    const players = this.lobbyPlayers();
    for (const r of this.remotes.values()) this.send(r, { t: 'lobby', players, stage: this.stage, you: r.slot, elite: this.elite });
    this.onLobby?.();
  }

  private send(r: Remote, msg: HostMsg) {
    try { if (r.ctl.open) r.ctl.send(JSON.stringify(msg)); } catch { /* dropped */ }
  }

  /** Start the run: builds the authoritative session and tells clients. */
  start(): LocalSession {
    const slots = this.lobbyPlayers();
    const inits: PlayerInit[] = [];
    const bySlot = new Map<number, PlayerInit>([[0, this.lobbyInit]]);
    for (const r of this.remotes.values()) bySlot.set(r.slot, r.init);
    // compact slots 0..n-1
    const remap = new Map<number, number>();
    slots.forEach((s, i) => { remap.set(s.slot, i); inits.push(bySlot.get(s.slot)!); });
    for (const r of this.remotes.values()) r.slot = remap.get(r.slot)!;
    const cfg: SimConfig = { stageId: this.stage, elite: this.elite, players: inits, seed: (Math.random() * 2 ** 31) | 0 };
    const session = new LocalSession(cfg, true);
    this.session = session;
    session.sim.eventTap = (e) => this.evBuf.push(e);
    for (const r of this.remotes.values()) session.sim.remoteControlled.add(r.slot);
    session.onTick = () => this.tick();
    for (const r of this.remotes.values()) this.send(r, { t: 'start', cfg, you: r.slot });
    return session;
  }

  /** Nobody can stall the team: unanswered level-ups auto-pick after a while. */
  private offerSince = new Map<number, number>();

  private enforceTimeouts() {
    const sim = this.session!.sim;
    const now = performance.now();
    for (const id of [...this.offerSince.keys()]) if (!sim.offers.has(id)) this.offerSince.delete(id);
    for (const id of sim.offers.keys()) {
      const since = this.offerSince.get(id);
      if (since === undefined) this.offerSince.set(id, now);
      else if (now - since > LEVELUP_TIMEOUT_MS) {
        this.offerSince.delete(id);
        sim.choose(id, 0);
      }
    }
  }

  private tick() {
    const sim = this.session!.sim;
    this.enforceTimeouts();
    this.sendT += 1 / 60;
    if (this.sendT < 1 / SNAP_HZ) return;
    this.sendT = 0;
    this.psT -= 1 / SNAP_HZ;
    const sendPs = this.psT <= 0;
    if (sendPs) this.psT = 0.25;
    const ps = sendPs ? sim.players.map(playerState) : undefined;
    const np = sim.newProj.map(projToWire);
    const dp = sim.deadProj;
    const nk = sim.newPickups.filter((p) => !p.dead).map((p) => [p.id, PICKUP_KINDS.indexOf(p.kind), Math.round(p.x), Math.round(p.y), Math.round(p.value * 10) / 10]);
    const dk = sim.deadPickups.map((d) => [d.id, d.by] as [number, number]);
    sim.newProj = []; sim.deadProj = []; sim.newPickups = []; sim.deadPickups = [];
    const events = this.evBuf;
    this.evBuf = [];
    for (const r of this.remotes.values()) {
      const p = sim.players[r.slot];
      if (!p) continue;
      const R = Math.max(p.viewW, p.viewH) * 0.75 + 120;
      const ev = events.filter((e) => e.e !== 'hit' || ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < R * R));
      this.send(r, {
        t: 'tick', ph: sim.phase, cine: sim.cine, lv: sim.level, xp: sim.xp, xn: sim.xpNext, m: sim.money, k: sim.kills,
        b: sim.bossesDefeated, tm: sim.time, of: sim.offers.get(r.slot) ?? null,
        wait: [...sim.offers.keys()].filter((id) => id !== r.slot).map((id) => sim.players[id]?.name ?? '?'),
        ev: ev.map(roundEvent), np, dp, nk, dk, ps,
      });
      const snap = encodeSnapshot(sim.time, sim.players, sim.enemies, p.x, p.y, R);
      try {
        if (r.snap?.open) r.snap.send(snap);
        else if (r.ctl.open) r.ctl.send(snap);
      } catch { /* dropped */ }
    }
  }

  close() {
    for (const r of this.remotes.values()) { this.send(r, { t: 'bye' }); }
    setTimeout(() => this.peer?.destroy(), 200);
    this.remotes.clear();
  }
}

function sanitizeInit(i: PlayerInit): PlayerInit {
  const lineId = LINE[i?.lineId] ? i.lineId : 'charmander';
  return {
    name: String(i?.name ?? 'Trainer').slice(0, 12) || 'Trainer',
    lineId,
    shiny: !!i?.shiny,
    meta: i?.meta,
    tms: Array.isArray(i?.tms) ? i.tms.filter((t) => typeof t === 'string').slice(0, 20) : [],
  };
}

function roundEvent(e: GameEvent): GameEvent {
  if (e.e === 'hit') return { ...e, x: Math.round(e.x), y: Math.round(e.y) };
  if (e.e === 'chain') return { ...e, pts: e.pts.map((v) => Math.round(v)) };
  return e;
}

function roundLedger(l: Ledger): Ledger {
  const r = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  return { dmg: r(l.dmg), boss: r(l.boss), heal: r(l.heal) };
}

function playerState(p: Player): PlayerState {
  return {
    id: p.id, sp: p.speciesId, st: p.stage, ty: p.types, mv: p.moves.map((m) => [m.id, m.level, Math.round(m.cd * 100) / 100, Math.round(m.dmgDealt), m.kills]),
    it: p.items.map((i) => [i.id, i.level]), bf: p.buffs, rr: p.rerolls, sk: p.skips, bn: p.banishes, nm: p.name, con: p.connected,
    k: p.kills, dd: Math.round(p.dmgDealt), se: p.superEff, ev: p.evolutions, ma: p.masteries, sh: p.shinyKills, pk: p.pendingLevels,
    vt: p.vitamins, mg: Math.round(p.mega * 100) / 100, mt: Math.round(p.megaT * 10) / 10, lg: roundLedger(p.ledger),
  };
}

// ─────────────────────────── client ───────────────────────────

export class NetClient {
  readonly role = 'client' as const;
  private peer: Peer | null = null;
  private ctl: DataConnection | null = null;
  private snap: DataConnection | null = null;
  slot = -1;
  elite = false;
  lobby: LobbyPlayer[] = [];
  stage = 'viridian';
  onLobby: (() => void) | null = null;
  onStart: ((cfg: SimConfig, you: number) => void) | null = null;
  onError: ((msg: string) => void) | null = null;
  onTick: ((m: Extract<HostMsg, { t: 'tick' }>) => void) | null = null;
  onSnap: ((b: ArrayBuffer) => void) | null = null;
  closed = false;

  join(code: string, init: PlayerInit): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      this.peer = peer;
      let opened = false;
      const timeout = setTimeout(() => { if (!opened) reject(new Error('Timed out connecting to the host.')); }, 15000);
      peer.on('error', (e) => { if (!opened) { clearTimeout(timeout); reject(new Error(peerError(e))); } else this.onError?.(peerError(e)); });
      peer.on('open', () => {
        const target = ROOM_PREFIX + code.trim().toUpperCase();
        const ctl = peer.connect(target, { reliable: true, serialization: 'raw', label: 'ctl' });
        this.ctl = ctl;
        ctl.on('open', () => {
          opened = true;
          clearTimeout(timeout);
          ctl.send(JSON.stringify({ t: 'hello', v: PROTOCOL, init }));
          const snap = peer.connect(target, { reliable: false, serialization: 'raw', label: 'snap' });
          snap.on('data', (d) => this.onData(d));
          this.snap = snap;
          resolve();
        });
        ctl.on('data', (d) => this.onData(d));
        ctl.on('close', () => { if (!this.closed) { this.closed = true; this.onError?.('The host closed the game.'); } });
        ctl.on('error', () => { if (!this.closed) { this.closed = true; this.onError?.('Connection error.'); } });
      });
    });
  }

  private onData(d: unknown) {
    if (d instanceof ArrayBuffer) { this.onSnap?.(d); return; }
    if (ArrayBuffer.isView(d)) { this.onSnap?.((d as Uint8Array).slice().buffer); return; }
    if (typeof d !== 'string') return;
    let msg: HostMsg;
    try { msg = JSON.parse(d); } catch { return; }
    switch (msg.t) {
      case 'lobby': this.lobby = msg.players; this.stage = msg.stage; this.elite = msg.elite; this.slot = msg.you; this.onLobby?.(); break;
      case 'start': this.slot = msg.you; this.onStart?.(msg.cfg, msg.you); break;
      case 'tick': this.onTick?.(msg); break;
      case 'full': this.closed = true; this.onError?.(msg.reason); break;
      case 'bye': this.closed = true; this.onError?.('The host left the game.'); break;
    }
  }

  send(msg: ClientMsg) {
    try { if (this.ctl?.open) this.ctl.send(JSON.stringify(msg)); } catch { /* dropped */ }
  }

  sendInput(msg: ClientMsg) {
    try {
      if (this.snap?.open) this.snap.send(JSON.stringify(msg));
      else this.send(msg);
    } catch { /* dropped */ }
  }

  close() {
    this.closed = true;
    setTimeout(() => this.peer?.destroy(), 100);
  }
}

// ─────────────────────────── client session (replica) ───────────────────────────

/**
 * Mirrors the host's world for rendering. Owns only the local player's movement;
 * everything else comes from host snapshots and events.
 */
export class ClientSession implements RunSession {
  readonly sim: Sim;
  readonly localId: number;
  readonly coop = true;
  paused = false;
  lost = false;
  firstHit = Infinity;
  private events: GameEvent[] = [];
  private enemyMap = new Map<number, Enemy & { tx: number; ty: number }>();
  private hostPhase: Phase = 'play';
  private hostOffers: UpgradeOffer[] | null = null;
  private answered = '';
  private wait: string[] = [];
  private inT = 0;
  private seenSet = new Set<string>();
  private defeatedMap = new Map<string, number>();
  bossesDefeated = 0;
  private net: NetClient;

  constructor(cfg: SimConfig, you: number, net: NetClient) {
    this.net = net;
    this.sim = new Sim(cfg);
    this.sim.phase = 'play';
    this.sim.offers.clear();
    this.localId = you;
    net.onTick = (m) => this.onTick(m);
    net.onSnap = (b) => this.onSnap(b);
    net.onError = () => { if (this.hostPhase !== 'over' && this.hostPhase !== 'victory') this.lost = true; };
  }

  get world() {
    return this.sim as Sim & { bossesDefeated: number };
  }

  get stage() {
    return this.sim.stage;
  }

  private onTick(m: Extract<HostMsg, { t: 'tick' }>) {
    const sim = this.sim;
    this.hostPhase = m.ph;
    sim.phase = m.ph;
    sim.cine = m.cine;
    sim.level = m.lv;
    sim.xp = m.xp;
    sim.xpNext = m.xn;
    sim.money = m.m;
    sim.kills = m.k;
    sim.bossesDefeated = m.b;
    if (Math.abs(sim.time - m.tm) > 0.5) sim.time = m.tm;
    // Ignore stale copies of offers we've already answered.
    const sig = m.of ? JSON.stringify(m.of) : '';
    this.hostOffers = sig && sig === this.answered ? null : m.of;
    if (!m.of) this.answered = '';
    this.wait = m.wait;
    for (const e of m.ev) {
      this.events.push(e);
      if (e.e === 'megaStone') sim.megaStone = true;
      if (e.e === 'kill') this.defeatedMap.set(e.species, (this.defeatedMap.get(e.species) ?? 0) + 1);
      if (e.e === 'hurt' && e.player === this.localId && this.firstHit === Infinity) this.firstHit = sim.time;
    }
    for (const a of m.np) sim.projectiles.push(projFromWire(a));
    if (m.dp.length) {
      const dead = new Set(m.dp);
      sim.projectiles = sim.projectiles.filter((p) => !dead.has(p.id));
    }
    for (const [id, k, x, y, v] of m.nk as [number, number, number, number, number][]) {
      sim.pickups.push({ id, kind: PICKUP_KINDS[k], x, y, value: v, vacuum: 0, vx: 0, vy: 0, t: 0, dead: false });
    }
    if (m.dk.length) {
      const by = new Map(m.dk);
      for (const p of sim.pickups) if (by.has(p.id)) { p.vacuum = by.get(p.id)! + 1; p.t = 0; p.dead = true; }
    }
    if (m.ps) {
      for (const s of m.ps) {
        const p = sim.players[s.id];
        if (!p) continue;
        p.speciesId = s.sp; p.stage = s.st; p.types = s.ty;
        p.moves = s.mv.map(([id, level, cd, dmg, kills]) => ({ id, level, cd, dmgDealt: dmg, kills }));
        p.items = s.it.map(([id, level]) => ({ id, level }));
        p.buffs = s.bf; p.rerolls = s.rr; p.skips = s.sk; p.banishes = s.bn; p.name = s.nm; p.connected = s.con;
        p.kills = s.k; p.dmgDealt = s.dd; p.superEff = s.se; p.evolutions = s.ev; p.masteries = s.ma; p.shinyKills = s.sh;
        p.pendingLevels = s.pk;
        p.vitamins = s.vt; p.mega = s.mg; p.ledger = s.lg;
        // Mega time is counted down locally between updates; resync on bigger drift.
        if (Math.abs(p.megaT - s.mt) > 0.5) p.megaT = s.mt;
      }
      sim.refreshStats();
    }
  }

  private onSnap(buf: ArrayBuffer) {
    const snap = decodeSnapshot(buf);
    if (!snap) return;
    const sim = this.sim;
    snap.players.forEach((sp, i) => {
      const p = sim.players[i];
      if (!p) return;
      p.hp = sp.hp;
      p.fainted = sp.fainted;
      p.connected = sp.connected;
      p.reviveProgress = sp.revive;
      if (sp.hurt) p.hurtT = Math.max(p.hurtT, 0.1);
      if (i === this.localId) {
        // The host may have moved us (e.g. revive). Snap only on big disagreement.
        if (p.fainted || Math.hypot(sp.x - p.x, sp.y - p.y) > 160) { p.x = sp.x; p.y = sp.y; }
        return;
      }
      (p as Player & { tx?: number; ty?: number }).tx = sp.x;
      (p as Player & { tx?: number; ty?: number }).ty = sp.y;
      p.fx = sp.fx || p.fx; p.fy = sp.fy || p.fy; p.moving = sp.moving;
    });
    const seen = new Set<number>();
    for (const se of snap.enemies) {
      seen.add(se.id);
      this.seenSet.add(se.species);
      let e = this.enemyMap.get(se.id);
      if (!e) {
        e = makeReplicaEnemy(se.id, se.species, se.x, se.y);
        this.enemyMap.set(se.id, e);
      }
      e.tx = se.x; e.ty = se.y; e.dirX = se.dirX; e.dirY = se.dirY;
      e.hp = se.hpFrac; e.maxHp = 1; e.elite = se.elite; e.boss = se.boss; e.shiny = se.shiny; e.final = se.final; e.alpha = se.alpha; e.scale = se.scale;
      e.radius = 9 * se.scale;
      e.st.freeze = se.freeze ? 1 : 0; e.st.burn = se.burn ? 1 : 0; e.st.poison = se.poison ? 1 : 0;
      e.st.paralyze = se.paralyze ? 1 : 0; e.st.confuse = se.confuse ? 1 : 0; e.st.slow = se.slow ? 1 : 0;
      if (se.flash) e.flash = 0.1;
    }
    for (const id of this.enemyMap.keys()) if (!seen.has(id)) this.enemyMap.delete(id);
    sim.enemies = [...this.enemyMap.values()];
  }

  step(dt: number, mx: number, my: number, viewW: number, viewH: number) {
    const sim = this.sim;
    const me = sim.players[this.localId];
    if (this.hostPhase === 'play') sim.time += dt;
    // local movement (client-authoritative for own position)
    if (me && !me.fainted && this.hostPhase === 'play') {
      const len = Math.hypot(mx, my);
      me.moving = len > 0.05;
      if (me.moving) {
        me.x += mx * me.stats.speed * dt;
        me.y += my * me.stats.speed * dt;
        me.fx = mx / len; me.fy = my / len;
      }
    } else if (me) me.moving = false;
    for (const p of sim.players) {
      p.hurtT = Math.max(0, p.hurtT - dt);
      if (this.hostPhase === 'play') p.megaT = Math.max(0, p.megaT - dt);
      const t = p as Player & { tx?: number; ty?: number };
      if (p.id !== this.localId && t.tx !== undefined) {
        const k = 1 - Math.pow(0.0005, dt);
        p.x += (t.tx - p.x) * k;
        p.y += (t.ty! - p.y) * k;
      }
    }
    for (const m of me?.moves ?? []) m.cd = Math.max(0, m.cd - dt);
    // enemies glide toward their latest snapshot position
    const k = 1 - Math.pow(0.0005, dt);
    for (const e of this.enemyMap.values()) {
      e.x += (e.tx - e.x) * k;
      e.y += (e.ty - e.y) * k;
      e.flash = Math.max(0, e.flash - dt);
    }
    // cosmetic projectile motion
    if (this.hostPhase === 'play') {
      const find = (x: number, y: number, r: number) => {
        let best: Enemy | undefined;
        let bd = r * r;
        for (const e of sim.enemies) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
        return best;
      };
      for (const pr of sim.projectiles) stepProjectileMotion(sim, pr, dt, find);
      sim.projectiles = sim.projectiles.filter((p) => !p.dead);
      // pickups: fly to the collecting player, or drift toward nearby players
      for (const pk of sim.pickups) {
        pk.t += dt;
        const target = pk.vacuum ? sim.players[pk.vacuum - 1] : undefined;
        if (target) {
          const dx = target.x - pk.x, dy = target.y - pk.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = 260 + pk.t * 600;
          pk.x += (dx / d) * Math.min(d, sp * dt);
          pk.y += (dy / d) * Math.min(d, sp * dt);
          if (d < 12) pk.vacuum = -1;
        }
      }
      sim.pickups = sim.pickups.filter((p) => p.vacuum !== -1 && !(p.dead && !p.vacuum));
    }
    this.inT -= dt;
    if (me && this.inT <= 0) {
      this.inT = 1 / 20;
      this.net.sendInput({ t: 'in', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, fx: me.fx, fy: me.fy, mv: me.moving, vw: viewW, vh: viewH });
    }
    if (this.net.closed && this.hostPhase !== 'over' && this.hostPhase !== 'victory') this.lost = true;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  phase() { return this.hostPhase; }
  offers() { return this.hostOffers; }
  waitingOn() { return this.wait; }
  private answer() {
    this.answered = this.hostOffers ? JSON.stringify(this.hostOffers) : '';
    this.hostOffers = null;
  }
  choose(i: number) { if (!this.hostOffers) return; this.net.send({ t: 'choose', i }); this.answer(); }
  reroll() { if (!this.hostOffers) return; this.net.send({ t: 'reroll' }); this.answer(); }
  skip() { if (!this.hostOffers) return; this.net.send({ t: 'skip' }); this.answer(); }
  banish(i: number) { if (!this.hostOffers) return; this.net.send({ t: 'banish', i }); this.answer(); }
  seen() { return this.seenSet; }
  defeated() { return this.defeatedMap; }
  dispose() { this.net.close(); }
}

function makeReplicaEnemy(id: number, species: string, x: number, y: number): Enemy & { tx: number; ty: number } {
  return {
    id, speciesId: species, types: SPECIES[species]?.types ?? ['normal'], role: 'chaser', x, y, tx: x, ty: y, radius: 9, vx: 0, vy: 0, dirX: 0, dirY: 1, hp: 1, maxHp: 1,
    speed: 0, dmg: 0, special: false, xp: 0, elite: false, boss: false, final: false, shiny: false, alpha: false, homeX: x, homeY: y, alive: true, flash: 0,
    st: { burn: 0, poison: 0, poisonStacks: 0, paralyze: 0, freeze: 0, slow: 0, confuse: 0, flinch: 0, dotTick: 0, burnDmg: 0, poisonDmg: 0, dotOwner: 0, coin: 0 },
    contactCd: 0, ai: 0, aiState: 0, aiX: 0, aiY: 0, patterns: [], patternIdx: 0, minions: [], knockResist: 0, scale: 1, lastHitBy: 0,
    animOffset: (id % 97) / 10,
  };
}
