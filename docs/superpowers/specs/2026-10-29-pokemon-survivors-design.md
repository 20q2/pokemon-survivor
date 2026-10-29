# Pokémon Survivors — Design Spec (2026-10-29)

A browser survivors-like ("bullet heaven") set in the Pokémon world. The player only
moves; moves fire automatically. Non-commercial fan project.

## Research takeaways (what makes a modern survivors-like work)

- **Back-loaded complexity**: one input (move), instant start, depth comes from the build.
- **Constant, legible power growth**: level-ups every few seconds early, choice of 3–4
  upgrades, upgrades must *feel* different (new behaviours, not +5% stat soup).
- **Build-crafting synergies**: VS-style weapon evolutions (weapon + passive → evolved
  weapon), Brotato-style stat identities. Synergy discovery is the long-term hook.
- **Escalation & set-pieces**: hordes ramp to screen-filling density, swarms/rings,
  bosses on a clock, a final boss.
- **Meta progression that unlocks *variety*, not just numbers**: new characters,
  weapons, stages via achievements; a shop for permanent stats; rerolls/skips/banishes.
- **"One more run"**: 15-min runs, satisfying results screen with gains, near-misses.
- **Lessons from Temtem: Swarm reviews**: mid-run evolution is the standout idea; the
  complaints were slow early pacing, weak/generic skills, low enemy variety, unlock slog.
  → Fast first minute, moves with distinct behaviours, type-themed stages, quick unlocks.

## Pillars

1. **Feels like Pokémon**: real sprites (PMD SpriteCollab, 8-direction walk anims),
   real moves, real types/effectiveness, STAB, base stats, evolution, shinies, items.
2. **Types matter**: every damage instance uses the real 18-type chart; stages are
   type-themed so roster/move choice matters; Eevee evolves based on your move types.
3. **Juicy & performant**: 60 fps with 400+ enemies, hit flash, knockback, damage
   numbers coloured by effectiveness, particles, screen shake, evolution cut-in.
4. **Online co-op**: up to 4 players via WebRTC (PeerJS) room codes.

## Core run loop

- Pick Pokémon → pick stage → 15-minute run. Bosses at 5:00 and 10:00, final boss at
  15:00; defeating the final boss = stage clear. Endless overtime afterwards (optional).
- Enemies drop **Exp. Candy** (S/M/L/XL by value; merged when too many) and sometimes
  **Poké Dollars**. Bosses/elites drop **treasure** (Poké Ball chest).
- Level-up pauses the game: choose 1 of 3 (4 with meta) cards:
  new move (from the Pokémon's learnset), move upgrade (Lv1→5), new held item,
  held item upgrade (Lv1→5). Fallbacks: Oran Berry (heal), Poké Dollars.
  Reroll / Skip / Banish charges come from the meta shop.
- **4 move slots** (iconic), **4 held-item slots** (+1 each via shop).
- Pickups: Oran Berry (heal), Magnet (vacuum all candy), Max Repel (screen nuke),
  Poké Dollar coins.

## Damage model

`dmg = power × moveLevelMult × (Atk or SpA stat factor) × STAB(1.5) × typeEff ×
crit(1.5) × itemMult × metaMult`

- Physical moves scale with Attack, special with Sp. Atk (from real base stats,
  normalised so 100 base ≈ 1.0×, then +per-level growth during the run).
- Type effectiveness: real chart; **immunity is softened to 0.25×** (survivors-friendly),
  dual types multiply. Floating text: "Super effective!" / "Not very effective…".
- Incoming damage: enemy contact damage typed by the enemy's primary type vs player
  types; reduced by Def (physical) / Sp. Def (special enemies).
- Speed base stat → movement speed and projectile speed; HP → max HP.

## Pokémon evolution (mid-run)

- Each line evolves at run level thresholds (e.g. Lv 10 → stage 2, Lv 22 → stage 3;
  2-stage lines evolve once at ~Lv 14).
- Evolution: short pause, white silhouette flash/morph, "What? X is evolving!",
  new base stats, full heal, unlocks stage-gated learnset moves.
- **Eevee** evolves at Lv 14 into the Eeveelution matching your dominant move type
  (Water→Vaporeon, Electric→Jolteon, Fire→Flareon, Psychic→Espeon, Dark→Umbreon,
  Grass→Leafeon, Ice→Glaceon, Fairy→Sylveon; Normal-only → random).

## Moves (weapons)

~70 real moves across all 18 types, each mapped to one of ~15 data-driven behaviours:
`projectile` (aimed at nearest), `spread` (fan), `orbit`, `aura` (damage zone around
self), `nova` (expanding ring), `beam` (piercing line), `strike` (random targets fall
from sky, e.g. Thunder), `zone` (ground hazard left behind, e.g. Toxic Spikes),
`boomerang`, `bounce` (chains between enemies, e.g. Spark), `dash`/`melee` (arc slash
in facing direction), `trail` (left as you walk, e.g. Flame Wheel), `homing`,
`wave` (wide slow wall), `buff` (self, e.g. Swords Dance → periodic power boost).
Each move has type, category (physical/special/status), base power, cooldown, area,
count, pierce, duration, knockback, per-level upgrade table.

**Learnsets**: each line has a curated move pool modelled on its real learnset +
TMs. Some moves are gated behind evolution stage. Shop-bought **TMs** add universal
moves to every pool.

**Move mastery (weapon evolutions)**: a move at Lv 5 + its matching held item at any
level → next treasure upgrades it to its powerful form (Ember+Charcoal→Fire Blast,
Thunder Shock+Magnet→Thunder, Water Gun+Mystic Water→Hydro Pump, Vine Whip+Miracle
Seed→Power Whip, Gust+Sharp Beak→Hurricane, Confusion+Twisted Spoon→Psychic, …).

## Held items (passives)

Type boosters (Charcoal, Mystic Water, Miracle Seed, Magnet, Never-Melt Ice, Black
Belt, Poison Barb, Soft Sand, Sharp Beak, Twisted Spoon, Silver Powder, Hard Stone,
Spell Tag, Dragon Fang, Black Glasses, Metal Coat, Silk Scarf, Fairy Feather) and
stat items (Muscle Band, Wise Glasses, Quick Claw (cooldown), Scope Lens (crit),
Wide Lens (area), Leftovers (regen), Shell Bell (lifesteal), Lucky Egg (exp),
Amulet Coin (money), Rocky Helmet (thorns), Expert Belt (super-effective bonus),
Life Orb (+dmg, costs HP), King's Rock (flinch/stun chance), Choice Scarf (speed),
Assault Vest (Sp.Def / max HP), Big Root (pickup range)).

## Stages (type-themed routes)

1. Viridian Forest — Bug/Grass/Normal/Flying. Bosses: Beedrill, Butterfree → final Scyther.
2. Mt. Moon — Rock/Ground/Poison/Fairy. Onix, Clefable → final Golem.
3. Seafoam Islands — Water/Ice. Cloyster, Lapras → final Articuno.
4. Power Plant — Electric/Steel. Electabuzz, Magneton → final Zapdos.
5. Pokémon Tower — Ghost/Poison/Psychic/Dark. Hypno, Marowak → final Gengar.
6. Cinnabar Volcano — Fire/Dragon/Fighting. Arcanine, Machamp → final Moltres.
7. Cerulean Cave — mixed elites from every stage. Kangaskhan, Dragonite → final Mewtwo.

Stages unlock sequentially by clearing the previous one. Each stage has a procedural
tiled ground in its palette, scattered decor, a per-minute wave table, swarm/ring
events, and its own music track.

## Meta progression

- **Poké Dollars (₽)** persist: collected in-run + end-of-run bonus (time survived,
  bosses beaten, stage clear multiplier).
- **Poké Mart** (shop): ranked permanent upgrades — Protein (+Atk), Calcium (+SpA),
  HP Up, Iron (Def), Zinc (SpD), Carbos (Speed), PP Up (cooldown), Exp. Share (exp),
  Amulet Coin (money), Big Root (pickup radius), Revive (extra life), Reroll, Skip,
  Banish, Rare Candy (start at Lv 2/3), Lucky Punch (crit), Bag slot (+1 item slot),
  Choice Card (+1 level-up choice). Cost rises per rank; full refund option.
- **TM Case**: buy TMs that add moves to all learnsets.
- **Achievements** (~40): each grants an unlock (Pokémon, stage, TM) or ₽.
- **Friendship** per Pokémon line: earned each run (time, kills, bosses). Milestones
  give small per-line perks (+dmg, +HP, start with a signature move). **Shiny unlock**:
  clear any stage at max friendship *or* clear Cerulean Cave with that line → shiny
  toggle (cosmetic sparkle, alt palette sprite, +10% Poké Dollars).
- **Elite mode** (cleared routes): +60% enemy HP, +30% damage, denser waves; ×1.75 ₽, ×1.5 friendship.
- Wild shiny enemies appear rarely (1/3000 spawns), flee, and drop a treasure.
- **Pokédex**: tracks species seen/defeated; filling it is itself an achievement set.

## Roster (14 lines)

Bulbasaur, Charmander, Squirtle, Pichu (start unlocked); Gastly, Machop, Abra,
Dratini, Eevee, Treecko, Torchic, Mudkip, Larvitar, Ralts (unlock via achievements/₽).

## Co-op (online)

- PeerJS (WebRTC data channels) with a room code (host's peer id suffix).
- **Host-authoritative simulation**; each client is authoritative only for its own
  position (sends position + facing at 30 Hz) — friendly co-op, zero-latency movement.
- Host broadcasts compact **binary snapshots** at 20 Hz (players, enemies quantised
  int16 positions, hp bytes) on an unreliable channel; **reliable event channel** for
  projectile spawns/despawns, damage numbers, pickups, level-up, evolution, run end.
- Clients interpolate enemies (100 ms buffer) and simulate projectiles cosmetically
  from spawn events; all hit detection on host.
- Shared team XP; on level-up every player picks simultaneously (pause until all pick,
  20 s auto-pick). Fainted players can be revived by a teammate standing nearby 3 s.
  Enemy HP/spawn rate scale with player count. Every player earns ₽ to their own save.

## Tech

- Vite + TypeScript, no game engine. Canvas2D renderer with sprite atlases,
  pre-baked white-flash silhouettes, additive blending for effects, object pools,
  spatial hash grid, fixed 60 Hz simulation, render interpolation, DPR-aware scaling.
- DOM/CSS overlay for menus/HUD text (crisp, accessible), canvas for the world.
- Audio: Web Audio procedural chiptune sequencer (pulse/triangle/noise), original
  compositions per stage + boss + menu; synthesized SFX; volume sliders.
- Input: keyboard (WASD/arrows), gamepad (left stick/d-pad), touch virtual stick.
- Save: localStorage, versioned JSON, export/import string.
- Assets: `scripts/fetch-sprites.mjs` downloads only the needed SpriteCollab
  Walk/Idle/Hurt sheets (+ shiny for playable lines) and portraits into
  `public/assets`, converts AnimData.xml → JSON, and generates `credits.json`.
- Tests: Vitest for data integrity (every learnset move exists, every behaviour
  implemented), damage/type calc, level-up offer rules, save migration, snapshot
  encode/decode; a headless balance sim (bot that kites) for tuning; Playwright
  smoke screenshot.

## Credits / licensing

Sprites & portraits: PMD SpriteCollab contributors, CC BY-NC 4.0 — in-game Credits
screen lists authors per sprite. Pokémon is © Nintendo/Creatures/GAME FREAK; this is
a non-commercial fan project. Music and SFX are original.

## Revision 2 (playtest feedback, 2026-10-29)

Feedback: camera jitter; a 12-minute first run earned ~12,000 ₽ and "broke the game";
upgrades ran out by 5–6 minutes; wanted a VS-style minimap, better music, everything
matching the PMD art, Mega Evolution as a late-game burst, Alpha Pokémon to hunt,
bigger candy from big foes, bigger damage numbers, hover tooltips, no hard upgrade cap.

- **Camera**: render interpolation between 60 Hz sim steps, camera locked to the
  interpolated partner with an eased look-ahead snapped to screen pixels, 1:1 device
  pixels at fractional DPR.
- **Progression**: moves Lv1–8 (Lv6–8 from per-behaviour late tables), mastery at Lv8;
  past the cap, limit breaks (+35%·ln(1+n) power) and vitamins (scale·ln(1+n)) fill
  offers. XP need 5+4k+0.9k² (+cubic after 25). Chests: 1/3/5 upgrades at 82/15/3%.
- **Difficulty**: enemy HP ×(1+0.15m+0.025m²+0.0025m³)·(1+0.006·(level−1)); foes speed
  up after 5:00; set-pieces recur from 10:00. Tuned with a headless bot so good play
  survives 15:00 under real pressure and sloppy play falls at 8–12 minutes.
- **Economy**: shinies were 1/450 *spawns* (~30/run, each with coins + a chest) — now
  1/3000. Kill coins 1%. Run bonus scales with route tier. A full Viridian clear ≈ 800 ₽.
- **Map content**: treasure caches every ~2 min (guardians appear on approach), Alphas
  every ~2.5 min (territorial, leashed, 44× HP, radial stomps; chest + Rare Candy), the
  Mega Stone at 5:30. Minimap pins all of them.
- **Mega Evolution**: meter = 1/200 per s + 1/4000 per kill (+elite/boss bonuses) +
  0.6 per max-HP of damage taken; 20 s of ×1.5 damage, +35% haste, −50% damage taken,
  a type-coloured shockwave and a short rainbow-sphere cinematic.
- **Music**: research pointed to plan-then-write in a symbolic notation plus mechanical
  validation. Songs are hand-written MML (Game Boy-style 4 channels), tested for bar
  lengths, key, range, leaps and lead/bass consonance, and level-checked offline.
- **Look**: one PMD window skin for all UI; effects rendered on a world-resolution layer
  upscaled with nearest-neighbour so they share the sprites' pixel grid; real route
  thumbnails; hand-drawn pixel digits for damage numbers.
