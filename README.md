# Pokémon Survivors

A browser survivors-like ("bullet heaven") in the Pokémon world. You only move;
your Pokémon's moves fire automatically. Level up to learn real moves from your
Pokémon's learnset, evolve mid-run, master moves with held items, and spend
Poké Dollars at the Poké Mart between runs. Play solo or online co-op (up to 4).

A free, non-commercial fan project. Pokémon is © Nintendo / Creatures / GAME FREAK.

## Running

```bash
npm install
npm run dev          # http://127.0.0.1:5391
npm run build        # static site in dist/ (deploy anywhere; base path is relative)
npm test             # data-integrity + headless simulation tests
```

Assets are already in `public/assets`. To re-download them (or after adding
species/items to the data files): `npm run fetch-assets`.

## How it plays

- **Move** with WASD / arrow keys / gamepad stick / touch (drag anywhere).
- **Level-ups** offer 3 cards: new moves (from your learnset + owned TMs), move
  levels (1–5), held items, item levels. Number keys 1–4 pick; R rerolls. Turn on
  *Options → Auto-pick upgrades* for a pure movement-only experience.
- **Types matter everywhere**: the real 18-type chart applies to every hit (immunity
  softened to ×0.25), STAB is ×1.5 (×2 with Adaptability), routes are type-themed,
  and level-up offers lean toward moves that are super effective on the current route.
- **Evolution** happens mid-run at level thresholds. Eevee becomes the Eeveelution
  matching your dominant move type.
- **Move mastery**: a move at Lv5 + its type's held item (e.g. Ember + Charcoal) →
  the next treasure turns it into its mastered form (Fire Blast). Every type has one.
  The Pokédex "Moves" tab lists all combinations.
- **Abilities**: each line has one (Blaze, Static, Levitate, Guts, Multiscale,
  Speed Boost, Sand Stream, …).
- **Routes**: 7 stages, 15 minutes each, bosses at 5:00 / 10:00, final boss at 15:00.
  Swarms, encirclements, elites, treasure-carrying Chansey/Meowth and rare wild shinies.

## Meta progression

- **Poké Dollars** from coins + an end-of-run bonus → **Poké Mart** permanent
  upgrades (vitamins, PP Up, Revive, rerolls/skips/banishes, extra item slot…) and
  **TMs** that add moves to every Pokémon's pool.
- **41 achievements** unlock new Pokémon (10 locked lines), TMs and money.
- **Friendship** per Pokémon line grows with every run and grants perks. Clear a
  route at max friendship (or clear Cerulean Cave) to unlock that line's **Shiny** form.
- Save lives in `localStorage`; export/import a save code in Options.

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
| `src/game/enemies.ts` | Wave director, enemy roles, boss patterns, loot |
| `src/game/session.ts` | `RunSession` interface shared by solo/host/client |
| `src/net/` | PeerJS host/client, binary snapshot protocol, client replica session |
| `src/render/` | Canvas2D renderer, procedural backgrounds, particles, bitmap damage numbers |
| `src/audio/audio.ts` | Procedural chiptune composer + synthesized SFX (Web Audio) |
| `src/ui/` | DOM menus, HUD, level-up cards, lobby; keyboard/gamepad menu navigation |
| `src/meta/` | Save data, shop, achievements, run → save progression |
| `scripts/balance.ts` | Headless balance runs with a kiting bot (`node scripts/balance.ts mtmoon 900`) |
| `scripts/*.mjs` | Playwright screenshot / flow / co-op / perf checks (uses installed Edge) |

## Credits

- Pokémon sprites & portraits: [PMD Sprite Collab](https://sprites.pmdcollab.org)
  contributors, CC BY-NC 4.0 (per-species credits in-game and in
  `public/assets/credits.json`); original Mystery Dungeon art © Spike Chunsoft.
- Item icons: [PokeAPI/sprites](https://github.com/PokeAPI/sprites).
- Fonts: Press Start 2P, Pixelify Sans (SIL OFL) via Fontsource.
- Music and sound effects: original, generated in the browser.
