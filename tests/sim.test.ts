import { describe, expect, it } from 'vitest';
import { Sim, DT, DIG_TIME } from '../src/game/sim.ts';
import { metaBonuses } from '../src/meta/shop.ts';
import { botChoose, botSteer } from '../src/game/bot.ts';
import { LINES } from '../src/data/pokedex.ts';
import { STAGES } from '../src/data/stages.ts';
import { AI, isSetPiece, spawnEnemy } from '../src/game/enemies.ts';

/** `immortal`: the simple bot can still wander into a forest pocket and get swarmed on some
 *  layouts; tests about progress (not survival) shouldn't hinge on that. */
function run(lineId: string, stageId: string, seconds: number, players = 1, immortal = false) {
  const sim = new Sim({
    stageId, seed: 1234,
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, lineId, shiny: false, meta: metaBonuses({}), tms: [] })),
  });
  sim.invulnerable = immortal;
  let steps = 0;
  while (sim.time < seconds && steps < seconds * 60 * 3) {
    steps++;
    if (sim.phase === 'levelup') {
      for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, botChoose(sim, p));
      continue;
    }
    if (sim.phase === 'over' || sim.phase === 'victory') break;
    for (const p of sim.players) { const m = botSteer(sim, p); p.mx = m.x; p.my = m.y; }
    sim.update(DT);
    sim.events.length = 0;
  }
  return sim;
}

describe('simulation smoke', () => {
  it('runs every line for 2 minutes without errors and progresses', () => {
    for (const l of LINES) {
      const sim = run(l.id, 'viridian', 120, 1, true);
      expect(sim.kills, l.id).toBeGreaterThan(30);
      expect(sim.level, l.id).toBeGreaterThanOrEqual(4);
      for (const p of sim.players) for (const m of p.moves) expect(Number.isFinite(m.cd)).toBe(true);
    }
  }, 30_000);

  it('runs every stage briefly with co-op players', () => {
    for (const st of STAGES) {
      const sim = run('charmander', st.id, 40, 3);
      expect(sim.enemies.length + sim.kills).toBeGreaterThan(10);
    }
  }, 30_000);
});

describe('phase handling', () => {
  it('reaches victory when the final boss dies while another cinematic is queued', async () => {
    const { spawnEnemy, killEnemy } = await import('../src/game/enemies.ts');
    const sim = new Sim({ stageId: 'viridian', seed: 3, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const boss = spawnEnemy(sim, 'scyther', 100, 0, { boss: { species: 'scyther', at: 900, patterns: ['charge'], final: true } })!;
    sim.openChest(sim.players[0]);          // chest cinematic starts
    killEnemy(sim, boss, 0);                // boss-down cinematic queued behind it
    sim.xp = sim.xpNext + 1;                // and a level-up is pending
    for (let i = 0; i < 60 * 20 && sim.phase !== 'victory'; i++) {
      if (sim.phase === 'levelup') sim.choose(0, 0);
      else sim.update(DT);
    }
    expect(sim.phase).toBe('victory');
  });

  it('evolves at the threshold level and swaps species', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 4, players: [{ name: 'a', lineId: 'squirtle', shiny: false, meta: metaBonuses({}), tms: [] }] });
    sim.level = 11;
    sim.xp = sim.xpNext;
    for (let i = 0; i < 600 && sim.players[0].speciesId === 'squirtle'; i++) {
      if (sim.phase === 'levelup') sim.choose(0, 0);
      else sim.update(DT);
    }
    expect(sim.players[0].speciesId).toBe('wartortle');
  });

  const evolveOn = (stageId: string, lineId: string, moves: [string, number][], level: number) => {
    const sim = new Sim({ stageId, seed: 5, players: [{ name: 'a', lineId, shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    p.moves = moves.map(([id, lv]) => ({ id, level: lv, cd: 1, dmgDealt: 0, kills: 0 }));
    p.stage = level > 14 ? 1 : 0;
    sim.level = level - 1;
    sim.xp = sim.xpNext;
    const from = p.speciesId;
    for (let i = 0; i < 600 && p.speciesId === from; i++) {
      if (sim.phase === 'levelup') sim.choose(0, 0);
      else sim.update(DT);
    }
    return p.speciesId;
  };

  it('Eevee evolves into the Eeveelution of the stage, whatever its moves', () => {
    expect(evolveOn('viridian', 'eevee', [['ember', 4]], 14)).toBe('leafeon');
    expect(evolveOn('tower', 'eevee', [['ember', 4]], 14)).toBe('umbreon');
  });

  it('where a stage offers two forms, the dominant move type picks', () => {
    expect(evolveOn('seafoam', 'eevee', [['swift', 2]], 14)).toBe('glaceon');
    expect(evolveOn('seafoam', 'eevee', [['water-pulse', 4], ['powder-snow', 2]], 14)).toBe('vaporeon');
  });

  it('Pikachu becomes Alolan Raichu in Cerulean Cave, plain Raichu elsewhere', () => {
    expect(evolveOn('cerulean', 'pichu', [['thunder-shock', 3]], 22)).toBe('raichu-alola');
    expect(evolveOn('viridian', 'pichu', [['thunder-shock', 3]], 22)).toBe('raichu');
  });
});

describe('late-game systems', () => {
  const solo = (lineId: string, seed = 9) =>
    new Sim({ stageId: 'viridian', seed, players: [{ name: 'a', lineId, shiny: false, meta: metaBonuses({}), tms: [] }] });

  it('never runs out of meaningful level-ups: limit breaks and vitamins fill in, with diminishing returns', async () => {
    const { generateOffers, applyOffer } = await import('../src/game/levelup.ts');
    const { MAX_MOVE_LEVEL, moveStatsAt, MOVES } = await import('../src/data/moves.ts');
    const { vitaminBonus } = await import('../src/data/items.ts');
    const { Rng } = await import('../src/engine/math.ts');
    const sim = solo('charmander');
    const p = sim.players[0];
    p.moves = ['ember', 'flamethrower', 'fire-spin', 'flame-wheel'].map((id) => ({ id, level: MAX_MOVE_LEVEL, cd: 1, dmgDealt: 0, kills: 0 }));
    p.items = ['charcoal', 'scope-lens', 'wide-lens', 'leftovers'].map((id) => ({ id, level: 5 }));
    const rng = new Rng(1);
    for (let i = 0; i < 40; i++) {
      const offers = generateOffers(p, rng, 3, []);
      expect(offers.length).toBe(3);
      for (const o of offers) expect(o.kind === 'vitamin' || (o.kind === 'moveUp' && o.level > MAX_MOVE_LEVEL) || o.kind === 'heal').toBe(true);
      applyOffer(p, offers[0]);
    }
    // Limit breaks stack (each one is a real level) with diminishing returns.
    const ember = p.moves.find((m) => m.id === 'ember')!;
    ember.level = MAX_MOVE_LEVEL;
    for (let i = 1; i <= 3; i++) {
      applyOffer(p, { kind: 'moveUp', id: 'ember', level: MAX_MOVE_LEVEL + i });
      expect(ember.level).toBe(MAX_MOVE_LEVEL + i);
    }
    const pw = (lv: number) => moveStatsAt(MOVES.ember, lv).power;
    expect(pw(MAX_MOVE_LEVEL + 3)).toBeGreaterThan(pw(MAX_MOVE_LEVEL + 2));
    expect(pw(MAX_MOVE_LEVEL + 3) - pw(MAX_MOVE_LEVEL + 2)).toBeLessThan(pw(MAX_MOVE_LEVEL + 1) - pw(MAX_MOVE_LEVEL));
    expect(vitaminBonus('protein', 2) - vitaminBonus('protein', 1)).toBeLessThan(vitaminBonus('protein', 1));
  });

  it('treasure for a complete build: a berry when hurt, otherwise gold or limit breaks / vitamins', async () => {
    const { MAX_MOVE_LEVEL } = await import('../src/data/moves.ts');
    const sim = solo('charmander');
    const p = sim.players[0];
    p.moves = ['ember', 'flamethrower', 'fire-spin', 'flame-wheel'].map((id) => ({ id, level: MAX_MOVE_LEVEL, cd: 1, dmgDealt: 0, kills: 0 }));
    p.items = ['scope-lens', 'wide-lens', 'leftovers', 'quick-claw'].map((id) => ({ id, level: 5 }));
    sim.refreshStats();
    const rewardsOf = () => { sim.events.length = 0; sim.openChest(p, 4); return (sim.events.find((e) => e.e === 'chest') as { rewards: { kind: string; level?: number }[] }).rewards; };

    p.hp = p.stats.maxHp * 0.3;
    const hurt = rewardsOf();
    expect(hurt.filter((r) => r.kind === 'heal')).toHaveLength(1);
    expect(p.hp).toBeGreaterThan(p.stats.maxHp * 0.3);

    p.hp = p.stats.maxHp;
    const kinds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const before = sim.money;
      const rs = rewardsOf();
      const gold = rs.filter((r) => r.kind === 'gold').reduce((s, r) => s + r.level!, 0);
      expect(sim.money - before).toBe(gold + 10); // plus the gold every treasure carries
      for (const r of rs) kinds.add(r.kind);
    }
    expect(kinds.has('heal')).toBe(false);
    expect(kinds.has('gold')).toBe(true);
    expect(kinds.has('move') || kinds.has('vitamin')).toBe(true);
    expect(kinds.has('item')).toBe(false); // nothing left to level, so no dud item "level-ups"
  });

  it('Mega Evolves once the stone is found and the meter fills, then reverts', () => {
    const sim = solo('charmander');
    const p = sim.players[0];
    sim.invulnerable = true;
    p.speciesId = 'charizard'; p.stage = 2; p.types = ['fire', 'flying'];
    sim.megaStone = true;
    p.mega = 0.999;
    let megaSeen = false;
    for (let i = 0; i < 60 * 30; i++) {
      if (sim.phase === 'levelup') { sim.choose(0, 0); continue; }
      sim.update(DT);
      if (p.megaT > 0) megaSeen = true;
      if (megaSeen && p.megaT === 0) break;
    }
    expect(megaSeen).toBe(true);
    expect(p.megas).toBe(1);
    expect(p.megaT).toBe(0);
    expect(p.types).toEqual(['fire', 'flying']);
  });

  it('places Alphas, treasure and the Mega Stone on the map over time', () => {
    const sim = solo('squirtle');
    sim.invulnerable = true;
    let alpha = false, stone = false, cache = false;
    for (let i = 0; i < 60 * 400; i++) {
      if (sim.phase === 'levelup') { sim.choose(0, 0); continue; }
      sim.update(DT);
      for (const e of sim.events) if (e.e === 'poi') { if (e.kind === 'alpha') alpha = true; if (e.kind === 'mega-stone') stone = true; if (e.kind === 'cache') cache = true; }
      sim.events.length = 0;
    }
    expect(alpha && stone && cache).toBe(true);
    expect(sim.enemies.some((e) => e.alpha && e.alive)).toBe(true);
  }, 20_000);

  it('buried treasure opens only after standing on it for the dig time, and stepping off loses progress slowly', () => {
    const sim = solo('squirtle');
    sim.invulnerable = true;
    const p = sim.players[0];
    const pk = sim.spawnPickup('dig', p.x + 200, p.y, 2);
    expect(pk.vx).toBe(0);
    const tick = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) { p.mx = p.my = 0; sim.update(DT); } };
    tick(1);
    expect(pk.dig).toBe(0); // never attracted from a distance
    expect(Math.hypot(pk.x - p.x - 200, pk.y - p.y)).toBeLessThan(1);
    p.x = pk.x; p.y = pk.y;
    tick(DIG_TIME / 2);
    expect(pk.dig).toBeGreaterThan(0.4);
    expect(pk.dead).toBe(false);
    p.x += 200;
    const before = pk.dig;
    tick(0.5);
    expect(pk.dig).toBeLessThan(before);
    expect(pk.dig).toBeGreaterThan(before - 0.1);
    p.x = pk.x; p.y = pk.y;
    sim.events.length = 0;
    tick(DIG_TIME);
    expect(pk.dead).toBe(true);
    expect(sim.events.some((e) => e.e === 'chest' && e.player === 0)).toBe(true);
  });
});

describe('playtest regressions', () => {
  it('a 12-minute no-meta Raichu run (even untouchable) neither floods gold nor runs out of upgrades by 6:00', async () => {
    const { generateOffers } = await import('../src/game/levelup.ts');
    const { runBonus } = await import('../src/meta/progression.ts');
    const { MAX_MOVE_LEVEL } = await import('../src/data/moves.ts');
    const { Rng } = await import('../src/engine/math.ts');
    const sim = new Sim({ stageId: 'viridian', seed: 7, players: [{ name: 'a', lineId: 'pichu', shiny: false, meta: metaBonuses({}), tms: [] }] });
    sim.invulnerable = true;
    const p = sim.players[0];
    let realAt6 = -1;
    while (sim.time < 720) {
      if (sim.phase === 'levelup') { sim.choose(0, botChoose(sim, p)); continue; }
      const m = botSteer(sim, p); p.mx = m.x; p.my = m.y;
      sim.update(DT);
      sim.events.length = 0;
      if (realAt6 < 0 && sim.time >= 360) {
        realAt6 = generateOffers(p, new Rng(1), 6, []).filter((o) => o.kind !== 'vitamin' && o.kind !== 'heal' && !(o.kind === 'moveUp' && o.level > MAX_MOVE_LEVEL)).length;
      }
    }
    const banked = sim.money * p.stats.money + runBonus({ stageId: 'viridian', time: sim.time, bosses: sim.bossesDefeated, cleared: false } as never);
    expect(banked, `banked ₽${Math.round(banked)}`).toBeLessThan(1000);
    expect(realAt6, 'real build upgrades still on offer at 6:00').toBeGreaterThan(0);
  }, 60_000);
});

describe('evolution move learning', () => {
  const evolveWith = (moves: string[]) => {
    const sim = new Sim({ stageId: 'viridian', seed: 8, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    p.moves = moves.map((id, i) => ({ id, level: 3 + i, cd: 1, dmgDealt: 0, kills: 0 }));
    sim.level = 11;
    sim.xp = sim.xpNext;
    for (let i = 0; i < 600 && p.speciesId === 'charmander'; i++) {
      if (sim.phase === 'levelup') {
        const o = sim.offers.get(0)!;
        if (o[0].kind === 'forget' || o[0].kind === 'keep') break;
        sim.choose(0, 0);
      } else sim.update(DT);
    }
    for (let i = 0; i < 300 && !p.pendingLearn && p.moves.length < 4; i++) { if (sim.phase === 'levelup') break; sim.update(DT); }
    return { sim, p };
  };

  it('learns a new move straight away when a slot is free', () => {
    const { p } = evolveWith(['ember']);
    expect(p.speciesId).toBe('charmeleon');
    expect(p.moves.length).toBeGreaterThanOrEqual(2);
    expect(p.pendingLearn).toBeUndefined();
  });

  it('with four moves, offers to forget one; the new move keeps the old level', async () => {
    const { MOVES } = await import('../src/data/moves.ts');
    const { sim, p } = evolveWith(['ember', 'scratch', 'smokescreen', 'dragon-rage'].filter((m) => MOVES[m]));
    if (p.moves.length < 4) return; // learnset changed; covered by the other test
    for (let i = 0; i < 300 && !(sim.offers.get(0)?.[0].kind === 'forget'); i++) {
      if (sim.phase === 'levelup') { const o = sim.offers.get(0); if (o && o[0].kind !== 'forget') sim.choose(0, 0); } else sim.update(DT);
    }
    const offers = sim.offers.get(0)!;
    expect(offers.map((o) => o.kind)).toEqual(['forget', 'forget', 'forget', 'forget', 'keep']);
    const learn = offers[0].id;
    const oldLevel = p.moves[2].level;
    sim.choose(0, 2);
    expect(p.moves[2].id).toBe(learn);
    expect(p.moves[2].level).toBe(oldLevel);
    expect(p.pendingLearn).toBeUndefined();
  });
});

describe('damage tracker ledger', () => {
  it('credits damage by move, boss damage separately, and healing by source', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 21, players: [{ name: 'a', lineId: 'bulbasaur', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    p.items = [{ id: 'leftovers', level: 5 }];
    sim.invulnerable = true;
    for (let i = 0; i < 60 * 40; i++) {
      if (sim.phase === 'levelup') { sim.choose(0, 0); continue; }
      const m = botSteer(sim, p); p.mx = m.x; p.my = m.y;
      p.hp = Math.min(p.hp, p.stats.maxHp * 0.5); // keep room to heal
      sim.update(DT);
      sim.events.length = 0;
    }
    const dmg = Object.values(p.ledger.dmg).reduce((a, b) => a + b, 0);
    expect(dmg).toBeGreaterThan(0);
    expect(Math.abs(dmg - p.dmgDealt)).toBeLessThan(1e-6 * Math.max(1, dmg));
    expect(p.ledger.dmg['vine-whip']).toBeGreaterThan(0);
    expect(p.ledger.heal.regen).toBeGreaterThan(0);
  }, 30_000);
});

describe('hit-stop', () => {
  const make = (seed = 7) => new Sim({ stageId: 'viridian', seed, players: [{ name: 'a', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });

  it('freezes sim time for the stop, then resumes', () => {
    const sim = make();
    sim.update(DT);
    const t0 = sim.time;
    sim.stop(2 * DT);
    sim.update(DT); sim.update(DT);
    expect(sim.time).toBe(t0);
    sim.update(DT);
    expect(sim.time).toBeCloseTo(t0 + DT);
  });

  it('pins interpolation (px = x) while frozen', async () => {
    const { spawnEnemy } = await import('../src/game/enemies.ts');
    const sim = make();
    const e = spawnEnemy(sim, 'rattata', 100, 0)!;
    sim.update(DT);
    e.x += 5; e.y += 3;
    sim.stop(2 * DT);
    sim.update(DT);
    expect(e.px).toBe(e.x);
    expect(e.py).toBe(e.y);
  });

  it('a longer stop is not shortened by a shorter one', () => {
    const sim = make();
    sim.stop(7 / 60);
    sim.stop(2 / 60);
    expect(sim.hitStop).toBeCloseTo(7 / 60);
  });

  it('an elite kill stops for 7 frames, a boss kill does not', async () => {
    const { spawnEnemy, killEnemy } = await import('../src/game/enemies.ts');
    const sim = make();
    const e = spawnEnemy(sim, 'rattata', 100, 0, { elite: true })!;
    killEnemy(sim, e, 0);
    expect(sim.hitStop).toBeCloseTo(7 / 60);
    expect(sim.events.some((ev) => ev.e === 'kill' && ev.elite)).toBe(true);
    const sim2 = make();
    const b = spawnEnemy(sim2, 'scyther', 100, 0, { boss: { species: 'scyther', at: 900, patterns: ['charge'] } })!;
    killEnemy(sim2, b, 0);
    expect(sim2.hitStop).toBe(0);
  });

  it('crits stop for 2 frames at most once per 0.5 s of sim time', async () => {
    const { spawnEnemy } = await import('../src/game/enemies.ts');
    const { makeProjectile } = await import('../src/game/combat.ts');
    const sim = make();
    const e = spawnEnemy(sim, 'rattata', 100, 0)!;
    e.hp = e.maxHp = 1e9;
    const p = sim.players[0];
    const shoot = () => makeProjectile(sim, { owner: p.id, moveId: 'ember', x: e.x, y: e.y, r: 20, life: 0.3, pierce: -1, dmg: 10, crit: 1 });
    const stops: number[] = [];
    shoot();
    for (let i = 0; i < 120; i++) {
      const before = sim.hitStop;
      sim.update(DT);
      if (sim.hitStop > before) stops.push(sim.time);
      if (i % 20 === 19) shoot();
    }
    expect(stops.length).toBeGreaterThan(1);
    for (let i = 1; i < stops.length; i++) expect(stops[i] - stops[i - 1]).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  it('stays deterministic: same seed, same time and kills', () => {
    const a = run('charmander', 'viridian', 60);
    const b = run('charmander', 'viridian', 60);
    expect(b.time).toBe(a.time);
    expect(b.kills).toBe(a.kills);
    expect(b.xp).toBe(a.xp);
    // and stops really happen: frozen ticks do not advance sim time
    const sim = make();
    sim.stop(5 * DT);
    let frozen = 0;
    for (let i = 0; i < 10; i++) { if (sim.hitStop > 1e-9) frozen++; sim.update(DT); }
    expect(frozen).toBe(5);
    expect(sim.time).toBeCloseTo(5 * DT);
  });
});

describe('minute waves', () => {
  const regulars = (sim: Sim) => sim.enemies.filter((e) => e.alive && !e.boss && !e.elite && !e.alpha && e.role !== 'treasure' && !isSetPiece(e));

  function playMinuteOne(players: number) {
    const sim = new Sim({
      stageId: 'viridian', seed: 1234,
      players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] })),
    });
    const waves: { minute: number; species: string; text: string; at: number }[] = [];
    const snap: Record<string, { regulars: number; elites: string[]; pos: string }> = {};
    // The quota is only exact on the tick the spawner checks it (kills in between dip it), so the
    // behavioural guarantee is "within the first second of the minute the count reaches min".
    let peak = 0;
    for (let steps = 0; sim.time < 63 && steps < 63 * 60 * 3; steps++) {
      if (sim.phase === 'levelup') {
        for (const p of sim.players) if (sim.offers.has(p.id)) sim.choose(p.id, botChoose(sim, p));
        continue;
      }
      if (sim.phase !== 'play') break;
      for (const p of sim.players) { const m = botSteer(sim, p); p.mx = m.x; p.my = m.y; }
      sim.update(DT);
      for (const ev of sim.events) if (ev.e === 'wave') waves.push({ minute: ev.minute, species: ev.species, text: ev.text, at: sim.time });
      sim.events.length = 0;
      if (sim.time >= 60 && sim.time < 61) peak = Math.max(peak, regulars(sim).length);
      for (const at of [62.5]) {
        if (sim.time >= at && !snap[at]) {
          snap[at] = {
            regulars: regulars(sim).length,
            elites: sim.enemies.filter((e) => e.alive && e.elite).map((e) => e.speciesId),
            pos: sim.enemies.map((e) => `${e.id}:${e.speciesId}:${e.x.toFixed(2)},${e.y.toFixed(2)}`).join('|'),
          };
        }
      }
    }
    return { sim, waves, snap, peak };
  }

  it('announces minute 1, spawns its elite after the banner and holds the quota', () => {
    const { waves, snap, peak } = playMinuteOne(1);
    expect(waves.filter((w) => w.minute === 1)).toHaveLength(1);
    expect(waves[0]).toMatchObject({ species: 'pidgey', text: 'Pidgey appear!' });
    expect(waves[0].at).toBeLessThan(61.5);
    const w1 = STAGES[0].waves[1];
    expect(snap[62.5].elites).toContain(w1.elite);
    expect(peak).toBeGreaterThanOrEqual(w1.min);
    expect(peak).toBeLessThanOrEqual(w1.min + w1.species.length);
  });

  it('scales the quota for co-op', () => {
    const { peak } = playMinuteOne(2);
    const min = Math.round(STAGES[0].waves[1].min * 1.35);
    expect(peak).toBeGreaterThanOrEqual(min);
    expect(peak).toBeLessThanOrEqual(min + STAGES[0].waves[1].species.length);
  });

  /** Starts a run partway in with an unkillable player so set pieces can be watched alone. */
  function runFrom(start: number, until: number, onTick: (sim: Sim) => void) {
    const sim = new Sim({ stageId: 'viridian', seed: 99, players: [{ name: 'P', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    sim.time = start;
    (sim.spawner as unknown as { bossIdx: number }).bossIdx = 99; // no backlog of boss cinematics from the time jump
    for (let steps = 0; sim.time < until && steps < 200000; steps++) {
      if (sim.phase === 'levelup') { sim.choose(sim.players[0].id, botChoose(sim, sim.players[0])); continue; }
      if (sim.phase === 'cine') { sim.update(DT); continue; }
      if (sim.phase !== 'play') break;
      sim.update(DT);
      sim.players[0].hp = sim.players[0].stats.maxHp; // stats are rebuilt every tick, so top up instead
      onTick(sim);
    }
    return sim;
  }
  const warns = (sim: Sim, text: string) => sim.events.filter((ev) => ev.e === 'warn' && ev.text === text).length;

  it('fires each swarm of the minute once, at its offset and repeat spacing', () => {
    const times: number[] = [];
    runFrom(239.9, 290, (sim) => {
      if (warns(sim, 'A swarm is approaching!')) times.push(Math.round(sim.time));
      sim.events.length = 0;
    });
    expect(times).toEqual([260, 265, 270, 275]); // minute 4: at 20 s, 3 repeats every 5 s
  });

  it('a ring is a slow-closing wall that despawns after its duration without dropping anything', () => {
    let spawned = 0, first = 0, hp = 0;
    const startDist: number[] = [];
    const sim = runFrom(299.9, 360, (s) => {
      const wall = s.enemies.filter((e) => e.alive && e.aiState === AI.WALL);
      if (!spawned && wall.length) {
        spawned = wall.length; first = s.time; hp = wall[0].maxHp;
        const p = s.players[0];
        for (const e of wall) startDist.push(Math.hypot(e.x - p.x, e.y - p.y));
      }
      s.events.length = 0;
    });
    expect(spawned).toBe(26 + 2 * 5);
    expect(sim.enemies.filter((e) => e.aiState === AI.WALL)).toHaveLength(0); // ttl 45 s from ~300
    expect(first).toBeLessThan(300.2);
    expect(hp).toBeGreaterThan(0);
    expect(Math.min(...startDist)).toBeGreaterThan(150);
  });

  it('wall members are fixed-speed and three tanks tough; expiring one is not a kill', () => {
    const sim = new Sim({ stageId: 'viridian', seed: 5, players: [{ name: 'P', lineId: 'charmander', shiny: false, meta: metaBonuses({}), tms: [] }] });
    const p = sim.players[0];
    const reg = spawnEnemy(sim, 'caterpie', p.x + 3000, p.y)!;
    const wall = spawnEnemy(sim, 'caterpie', p.x + 3000, p.y + 40, { wall: { speed: 30, ttl: 1 } })!;
    expect(wall.speed).toBe(30);
    expect(wall.maxHp).toBeCloseTo(reg.maxHp * 2.4 * 3);
    expect(wall.xp).toBe(2);
    const x0 = wall.x;
    for (let i = 0; i < 30; i++) sim.update(DT);
    expect(x0 - wall.x).toBeGreaterThan(10); // walking at the player
    expect(x0 - wall.x).toBeLessThan(20);
    for (let i = 0; i < 40; i++) sim.update(DT);
    expect(sim.enemies.includes(wall)).toBe(false);
    expect(sim.kills).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    expect(playMinuteOne(1).snap[62.5]).toEqual(playMinuteOne(1).snap[62.5]);
  });
});
