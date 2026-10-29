import { MEGA, SPECIES, fullyEvolved } from '../data/pokedex.ts';
import { makeProjectile } from './combat.ts';
import type { Sim } from './sim.ts';
import { heal } from './ledger.ts';
import type { Player } from './types.ts';

/** Seconds a Mega Evolution lasts. */
export const MEGA_DURATION = 20;
/** Meter gained per second just for being in the fight (so it always comes around eventually). */
const PASSIVE = 1 / 200;
const PER_KILL = 1 / 4000;
const PER_ELITE = 0.04;
const PER_BOSS = 0.2;
/** Meter gained per full max-HP of damage taken: pressure charges it faster. */
const PER_HURT = 0.6;

/** Meter fills only with the team's Mega Stone, once the partner is fully evolved and not already Mega. */
export function canCharge(sim: Sim, p: Player) {
  return sim.megaStone && p.megaT <= 0 && !p.fainted && fullyEvolved(p.lineId, p.speciesId);
}

export function megaOnKill(sim: Sim, p: Player | undefined, elite: boolean, boss: boolean) {
  if (!p || !canCharge(sim, p)) return;
  p.mega = Math.min(1, p.mega + (boss ? PER_BOSS : elite ? PER_ELITE : PER_KILL));
}

export function megaOnHurt(sim: Sim, p: Player, dmg: number) {
  if (!canCharge(sim, p)) return;
  p.mega = Math.min(1, p.mega + (dmg / p.stats.maxHp) * PER_HURT);
}

export function updateMega(sim: Sim, p: Player, dt: number) {
  if (p.megaT > 0) {
    p.megaT = Math.max(0, p.megaT - dt);
    if (p.megaT === 0) {
      p.mega = 0;
      p.types = [...SPECIES[p.speciesId].types];
      sim.emit({ e: 'megaEnd', player: p.id });
    }
    return;
  }
  if (!canCharge(sim, p)) return;
  p.mega = Math.min(1, p.mega + PASSIVE * dt);
  if (p.mega >= 1 && sim.phase === 'play') sim.queueCine({ kind: 'mega', t: 0, dur: 2.2, player: p.id, from: p.speciesId, to: megaOf(p.speciesId)?.id });
}

/** Called when the Mega cinematic finishes. */
export function activateMega(sim: Sim, p: Player) {
  p.megaT = MEGA_DURATION;
  p.mega = 1;
  p.megas++;
  if (megaOf(p.speciesId)?.types) p.types = [...megaOf(p.speciesId)!.types!];
  sim.refreshStats();
  heal(p, p.stats.maxHp, 'mega');
  // The transformation bursts outward: a huge shockwave of the partner's type.
  const atk = Math.max(p.stats.atk, p.stats.spa);
  makeProjectile(sim, {
    owner: p.id, moveId: 'mega-burst', behavior: 'nova', fx: 'ring', type: p.types[0], cat: 'special', shape: 'ring',
    x: p.x, y: p.y, attach: true, r: 10, growth: 260, life: 0.6, pierce: -1, dmg: 24 * sim.spawner.hpMult() * atk, knock: 420,
  });
  for (const e of sim.enemies) {
    if (!e.alive || e.boss) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy < 260 * 260) e.st.flinch = Math.max(e.st.flinch, 1.2);
  }
  sim.emit({ e: 'mega', player: p.id, species: p.speciesId });
}

export function megaOf(speciesId: string) {
  return MEGA[speciesId];
}

/** Rainbow hue for Mega effects at time t. */
export function megaHue(t: number, offset = 0) {
  return `hsl(${Math.floor(((t * 120 + offset) % 360 + 360) % 360)},100%,65%)`;
}
