# Pokémon Survivors

A browser survivors-like ("bullet heaven") in the Pokémon world. You only move;
your Pokémon's moves fire automatically. Level up to learn real moves from your
Pokémon's learnset, evolve mid-run, master moves with held items, and spend
Poké Dollars at the Poké Mart between runs. Play solo or online co-op (up to 4).

A free, non-commercial fan project. Pokémon is © Nintendo / Creatures / GAME FREAK.

## Running

```bash
npm install
npm run dev          # http://127.0.0.1:5391 (PORT=5392 npm run dev for a second worktree;
                     #  the scripts/*.mjs drivers read the same PORT)
npm run build        # static site in dist/ (deploy anywhere; base path is relative)
npm test             # data-integrity + headless simulation tests
```

Assets are already in `public/assets`. To re-download them (or after adding
species/items to the data files): `npm run fetch-assets`.

## How it plays

- **Move** with WASD / arrow keys / gamepad stick / touch (drag anywhere).
- **Level-ups** offer 3 cards: new moves (from your learnset + owned TMs), move
  levels (1–8), held items, item levels (1–5). Once your build is complete, cards
  become **limit breaks** (moves past Lv8) and **vitamins** (Protein, HP Up, …), both
  with logarithmic returns, so levelling never runs dry. Hover any HUD slot to see what
  it does. Number keys 1–4 pick; R rerolls. Turn on *Options → Auto-pick upgrades* for
  a pure movement-only experience.
- **Types matter everywhere**: the real 18-type chart applies to every hit (immunity
  softened to ×0.25), STAB is ×1.5 (×2 with Adaptability), routes are type-themed,
  and level-up offers lean toward moves that are super effective on the current route.
- **Evolution** happens mid-run at level thresholds. Eevee becomes the Eeveelution
  matching your dominant move type.
- **Move mastery**: a move at Lv8 + its type's held item (e.g. Ember + Charcoal) →
  the next treasure turns it into its mastered form (Fire Blast). Every type has one.
  The Pokédex "Moves" tab lists all combinations.
- **Abilities**: each line has one (Blaze, Static, Levitate, Guts, Multiscale,
  Speed Boost, Sand Stream, …).
- **Routes**: 7 stages, 15 minutes each, a boss every 3 minutes, final boss at 15:00.
  Every minute is a scripted wave (Vampire Survivors style): new species, an enemy quota that
  spikes and breathes, an elite with a Poké Ball most minutes, swarms that sweep across and
  rings that close in as slow walls. The route card shows the minute-by-minute timeline. Stay
  past the final boss and an unkillable sweeper comes for you.
- **The map**: a PMD-style minimap pins treasure caches (guarded), roaming **Alpha
  Pokémon** you can choose to hunt for big loot, bosses, teammates and the **Mega Stone**.
- **Mega Evolution**: find the Mega Stone (appears around 5:30), then a fully evolved
  partner charges a rainbow meter by fighting (faster when under pressure). When it fills
  you Mega Evolve for 20 seconds: real Mega sprites where PMD Sprite Collab has them
  (Charizard X, Gengar, Alakazam, Tyranitar, Gardevoir, Sceptile), a Mega aura otherwise.

## Meta progression

- **Poké Dollars** from coins + an end-of-run bonus → **Poké Mart** permanent
  upgrades (vitamins, PP Up, Revive, rerolls/skips/banishes, extra item slot…) and
  **TMs** that add moves to every Pokémon's pool.
- **46 achievements** unlock new Pokémon (10 locked lines), TMs and money.
- **Friendship** per Pokémon line grows with every run and grants perks. Clear a
  route at max friendship (or clear Cerulean Cave) to unlock that line's **Shiny** form.
- Save lives in `localStorage`; export/import a save code in Options. Options also has an
  effects-opacity slider and a damage-number cap for busy late waves (hostile telegraphs never dim).

## Online co-op

Host → share the 5-letter room code → friends join. Peer-to-peer WebRTC via the
free PeerJS broker. The host runs the authoritative simulation; each client owns
its own movement (no input lag), receives 20 Hz binary snapshots of nearby enemies
and a reliable stream of events/projectile spawns. Exp is shared, everyone picks
their own upgrades, fainted teammates are revived by standing next to them.

## Code map

| Path | What |
| --- | --- |
| `src/data/` | Types chart, species & learnsets, moves (data-driven behaviours), items, stages |
| `src/game/sim.ts` | Authoritative fixed-step simulation (players, pickups, level-ups, cinematics) |
| `src/game/combat.ts` | Move firing for 15 behaviours, projectile motion/collision, damage |
| `src/game/spawner.ts` | Minute-wave spawner (quota backfill, set pieces, sweeper), `spawnEnemy`, enemy-kind predicates |
| `src/game/enemyAI.ts` | Per-tick enemy AI and roles, boss patterns, death and loot |
| `src/game/director.ts` | Tension meter on top of the wave script: surge (set piece sooner) and reprieve (backfill pause) |
| `src/game/session.ts` | `RunSession` interface shared by solo/host/client |
| `src/net/` | PeerJS host/client, binary snapshot protocol, client replica session |
| `src/render/` | Canvas2D renderer, tile-map world (`background.ts`, `biomes.ts`, `pixelart.ts`), pixel particles, bitmap damage numbers |
| `src/audio/` | MML parser (`mml.ts`), section-based multi-track scores (`score.ts`), synth voices and drum kits (`synth.ts`, `instruments.ts`), the soundtrack (`songs/*.ts`: 12 songs plus the original chip set as `classic-*`), SFX phrases (`sfx.ts`) on the chip voices |
| `src/ui/soundtest.ts` | Sound Test (title menu): every song by level, live piano roll, section jumps, track mutes |
| `src/game/mega.ts` | Mega Evolution meter and transformation |
| `src/ui/minimap.ts` | PMD-style minimap |
| `src/ui/` | DOM menus, HUD, level-up cards, lobby; keyboard/gamepad menu navigation |
| `src/meta/` | Save data, shop, achievements, run → save progression |
| `scripts/balance.ts` | Headless balance runs with a kiting bot (`node scripts/balance.ts mtmoon 900`) |
| `scripts/pacing.ts` | Pacing telemetry for a headless run: level-up gaps (actual and "potential" with floor candy counted), enemies alive / in view / peak, hits per second, ms per tick (`node scripts/pacing.ts viridian charmander 960 7`, last arg = seed) |
| `scripts/*.mjs` | Playwright screenshot / flow / co-op / perf checks (uses installed Edge) |
| `scripts/render-music.mjs` | Renders songs with the real synth: levels, render speed, optional WAVs, per-track stems (`--stems`), from a section (`--from drop`) |
| `scripts/sfx-levels.mjs` | Renders every sound effect with the real synth and prints peak/RMS |
| `scripts/stageshots.mjs` | Screenshots a run on each route (`FIGHT=1` fast-forwards into combat) |
| `scripts/props-sheet.mjs` | Contact sheet of every route's props, for checking the pixel art |

## Credits

- Pokémon sprites & portraits: [PMD Sprite Collab](https://sprites.pmdcollab.org)
  contributors, CC BY-NC 4.0 (per-species credits in-game and in
  `public/assets/credits.json`); original Mystery Dungeon art © Spike Chunsoft.
- Item icons: [PokeAPI/sprites](https://github.com/PokeAPI/sprites).
- Fonts: Press Start 2P, Pixelify Sans (SIL OFL) via Fontsource.
- Music and sound effects: original compositions, synthesized in the browser.
- World tiles and props: original pixel art, painted procedurally at load time.
