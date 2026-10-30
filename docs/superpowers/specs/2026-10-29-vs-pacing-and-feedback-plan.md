# Why Vampire Survivors eats 30 minutes, and how to get that here (2026-10-29)

Playtest note that started this: "I played Vampire Survivors and didn't realize 30 minutes had
gone by. In our game I feel the time a lot more." This doc collects what the research says about
VS's spawning and feedback, compares it against our spawner / reward / feedback code with
measurements from a headless run, and lays out a plan in four phases.

Measurement tool added with this doc: `node scripts/pacing.ts [stage] [line] [seconds]` prints a
30-second table (level-ups, longest gap between them, enemies alive / in view, kills, hit events
per second, warnings, treasures, pauses, HP) plus level-up gap percentiles. All numbers below are
from `viridian charmander 960` and `mtmoon squirtle 960` with seed 7.

---

## 1. What the research says

### 1.1 VS spawning is a scripted, non-monotonic minute-by-minute score

From the VS wiki ([Enemies](https://vampire.survivors.wiki/w/Enemies),
[Mad Forest](https://vampire.survivors.wiki/w/Mad_Forest)):

- **One wave per minute.** Each wave lists the enemy types, an **enemy minimum** and a **spawn
  interval**. On every interval tick, if the live count is under the minimum the game spawns
  until the quota is filled (instant backfill); if it is already over, it spawns one of each type.
- **Hard caps**: periodic spawning stops at 300 live enemies; bosses and map events may still
  spawn up to 500.
- **Spawns are just outside the screen, from all four sides** (the "Standard" spawn type);
  enemies that get too far away despawn; bosses are teleported back onto screen.
- **Map events** are extra groups outside the regular cycle, fired at fixed second marks inside
  a wave so they are *predictable*: a **swarm** that sweeps straight across the screen (bats, with
  repeats like "x3, every 5 s" or "x21, every 1.2 s") and a **ring** of high-HP enemies that slowly
  closes in (Flower Wall, 30-60 s long).
- **The quota is not a ramp.** Mad Forest's minimums per minute are
  `15, 30, 50, 40, 30, 10, 20, 80, 100, 30, 10, 300, 20, 150, 20, 100, 100, 20, 60, 100, 100, 300, 200, 300, 300, 100, 150, 300, 300, 300`.
  Intervals go `1.0, 1.0, 0.5, 0.25, 1.0, 1.0, 0.5, 0.5, 1.5, 0.5, 0.5, 0.1, ...` and sit at 0.1 s
  for most of the second half. The low-quota minutes (5, 10, 17) are the ring / set-piece minutes:
  the trickle is pulled back so the event *is* the minute. Minute 11 jumps from 10 straight to 300
  skeletons at 0.1 s. That spike-then-breathe shape is the tension/release rhythm the
  [Conversation article](https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613)
  describes: "periods where players comfortably dominate enemies are followed by periods of
  increased tension as bigger enemy groups appear", which it ties to flow.
- **A new enemy type almost every minute** (bat, zombie, skeleton, ghost, mudman, giant bat,
  werewolf, mummy, venus...). Each minute visibly changes the texture of the crowd. Together with
  the big on-screen timer this gives the run **chapters**: you always know which minute you are
  in, and each is different from the last.
- **A chest-dropping boss most minutes** (Mad Forest: minutes 1, 3, 5, 7, 8, 9, 10, 11, 12, 14, 15,
  16, 18, 20, ...). Bosses have a per-boss chest table (e.g. 3% five-item / 10% three-item / 50%
  one-item) and a guaranteed level-1 chest fallback.
- **Enemies move in a straight line towards you.** The
  [Secret Sauce essay](https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors) notes
  "the obstacles & the type of challenges don't change much throughout the experience", so
  escalation comes from *your* output growing, not from enemies doing new things. The player
  "shepherds enemies into groups" (Conversation). Cognitive load stays purely spatial, which is
  what lets the brain drop into the "combat autopilot" the
  [Pause Menu essay](https://pausemenu.substack.com/p/how-vampire-survivors-taught-me-the) describes.
- **30:00 is a hard, famous ending** (Reaper clears the screen; one more per minute after). The
  structure is public and anticipated, which is where "one more minute" comes from: you are
  always a known distance from the next boss / minute / level.

### 1.2 VS reward cadence

- **A level-up roughly every 23 seconds across the whole 30 minutes** (Secret Sauce: "rather than
  a reward every 2 min 30 (12 items in 30 minutes), you can have one every 23 seconds"). Weapons
  have 8 tiers, passives 5, so there is always something to level. "A trickling stat progression
  helps to maintain the pacing better than a step-like difficulty curve." The frequent pause of the
  level-up screen is called "essential to keep it from becoming exhausting."
- **Chests are the slot machine** ([Treasure Chest](https://vampire.survivors.wiki/w/Treasure_Chest),
  Secret Sauce, [Platinum Paragon](https://platinumparagon.info/psychology-of-vampire-survivors/)):
  1/3/5 item reels with jingles A/B/C, gold count-up, fireworks, "stars behind weapon reveal"; the
  first six chests in a save are hard-coded `1-1-3-1-1-5` to set expectations before the odds drop.
  The near-miss effect: every run that stops short of 30:00 feels close because the next level,
  chest or achievement was seconds away.
- **Gem economy**: XP gems stay on the floor; collecting them forces you back through cleared
  ground, which is the core movement dance. Late game, hoarded gems collapse into one big gem and a
  pile pays out several levels at once.
- **Zero-progress runs don't exist**: gold and achievements from every run; meta stats give
  ~2.5x damage / 2x health that the player barely perceives but that keeps them retrying
  immediately (Secret Sauce). Players eventually "deal so much damage that you can look away"
  (Platinum Paragon), and that *is* the fantasy, not a failure.

### 1.3 Modern takes on the formula

- **Brotato**: 20 to 90-second waves with a shop between them; "an entirely different pacing that
  doesn't feel quite as relentless", smaller arenas, fragile builds that reward dodging
  ([Digital Trends](https://uat4.www.digitaltrends.com/gaming/brotato-hands-on-impressions-pc)).
  Lesson: explicit wave boundaries are a legitimate way to make time legible.
- **Halls of Torment**: isometric, Diablo-like stats, **telegraphed boss attacks that "leave you a
  fighting chance"**, and an **effects-opacity slider** because late VS "turns into a black screen
  and/or screen of rainbows filled with damage numbers"
  ([Prima](https://primagames.com/gaming/halls-of-torment-vs-vampire-survivors-which-is-better-answered),
  [Steam](https://steamcommunity.com/app/2218750/discussions/0/3957035999325195508/)). Lesson:
  readability is a feature; hazards belong on bosses.
- **Deep Rock Galactic: Survivor**: slower, objectives (mining) and terrain funnelling as the
  pacing device ([TechRadar](https://www.techradar.com/gaming/consoles-pc/deep-rock-galactic-survivor-adds-a-layer-of-strategy-to-the-vampire-survivors-formula)).
  Lesson: optional goals on the map give the player somewhere to *go*; our caches / Alphas / Mega
  Stone already do this.
- **Megabonk** (2025, 1M+ sales): the VS loop in 3D with Risk of Rain 2-style mechanics, a
  deliberately silly tone, and a launch built on players sharing "broken builds"
  ([Dataconomy](https://dataconomy.com/2025/10/08/megabonk-sells-over-one-million-copies-on-steam)).
  Lesson: the power fantasy must be allowed to go absurd.
- **Director-style spawning** ([Left 4 Dead](https://left4dead.fandom.com/wiki/The_Director),
  [Risk of Rain 2 Directors](https://riskofrain2.wiki.gg/wiki/Directors)): a budget that
  accumulates and is spent in bursts, with explicit build-up / peak / relax phases driven by the
  players' state. The L4D rule of thumb: "no one gets bored, without making it so hard that any one
  survivor rage quits." Lesson: an adaptive layer on top of the script can keep the rhythm honest
  for strong and weak builds alike.
- **Game-feel basics** (general sources): hit-stop of 2 frames (light) to 8-10 frames (heavy);
  tiered, fast-decaying screen shake; +/-7% random pitch on any sound that fires more than twice a
  minute; show feedback on non-lethal hits.

---

## 2. What we have (as of the morning; superseded by section 6)

| System | Where | Behaviour today |
|---|---|---|
| Trickle spawner | `src/game/enemies.ts` `Spawner.update` | Continuous: target `(24 + 26*m)` alive, spawn **rate** `3 + 1.4*m` per second (x1.4 under half target). Three species pools (`early` < 4.5 min, `mid` < 9.5 min, `late`), one species swap at 10 min. |
| Spawn placement | `spawnOffscreen` | Rectangle 40 px outside the view; 55% chance to pick the side the player is heading for. Enemies left far behind are mirrored to the far side. |
| Set pieces | `events[]`, `swarm()`, `ring()` | Swarm at 150/450/690/840 s, ring at 240/540/780 s, then one every 55 s after 10:00. Swarm = one straight line of `18 + 2m`, ring = `26 + 2m` mid-pool enemies at 0.42 view radius, both one-shot. The trickle keeps running underneath. |
| Elites | `nextElite` | Every 48-80 s, `1 + m/7` elites (12x HP), each drops a chest (Poke 84% / Great 14% / Ultra 2%). Elites also stop to cast a telegraphed ground attack every 5-8 s when near. |
| Bosses | `stages.ts` `bosses[]` | Every 3 minutes (180...900), raid patterns, chest + coins + Sitrus. HUD shows a next-boss countdown. |
| Treasure / POIs | `updatePois`, treasure role | Chansey/Meowth carriers every 80-130 s, caches, Alphas, Mega Stone at 5:30. |
| Enemy HP | `hpMult` | Smooth cubic in minutes: `1 + 0.15m + 0.025m^2 + 0.0025m^3` (about 17x at 15:00) x stage x level x party. |
| Enemy speed | `spawnEnemy` | `min(132, (48 + Spe*0.42)*role)` then **+30% from minute 5 to 15**. Player speed is `105 + Spe*0.55` (Bulbasaur 130, Squirtle 129, Charmander 141). |
| XP | `xpForLevel`, `dropCandy` | Quadratic curve (`6 + 5k + 1.2k^2 ...`); regular enemies give 1 XP at minute 1 and at minute 15. |
| Feedback | `src/render/renderer.ts` `onEvent`, `fx.ts`, `audio.ts` | Hit flash, type-coloured spark + streaks, bitmap damage numbers (crit slam), kill puff/ring, shake on boss kill / boom / hurt, screen flash, candy "ladder" pitch, warn banner. No hit-stop, no per-minute beat. |
| Reward beats | `sim.openChest`, `ui/chest.ts` | Poke-ball wobble, reels, landing, tiers Poke/Great/Ultra/Master, mastery = Master Ball. Level-up pauses with 3 cards. |

### 2.1 Measured pacing (Charmander, Viridian, 15 min, bot)

| Minute | Level | Level-up gap (longest in 30 s) | Enemies alive / in view | Kills per 30 s | Hit events per s |
|---|---|---|---|---|---|
| 1 | 6 | 13 s | 26 / 22 | 152 | 5 |
| 3 | 13 | 27 s | 44 / 31 | 266 | 9 |
| 5 | 18 | 36 s | 68 / 39 | 385 | 15 |
| 7 | 22 | 29 s | 89 / 53 | 521 | 24 |
| 9 | 29 | 21 s | 101 / 51 | 606 | 30 |
| 10 | 32 | 37 s | 114 / 65 | 737 | 33 |
| 12 | 37 | 53 s | 120 / 69 | 864 | 39 |
| 14 | 40 | 46 s | 107 / 46 | 919 | 35 |
| 15 | 42 | 20 s | 132 / 81 | 1060 | 65 |

Level-up gaps over the run: p50 20 s, p90 46 s, max 62 s. Mt. Moon with Squirtle was similar
(p50 about 22 s) until the bot died at 8:50; Pokemon Tower with Bulbasaur died at 7:00 with a
107 s gap.

---

## 3. Gap analysis: what most plausibly makes our time "felt"

Ranked by how directly the research ties it to the 30-minute trance.

1. **No chapters.** VS changes the crowd's species and texture every minute and spikes/relaxes the
   quota; we change the species pool twice in 15 minutes and ramp everything smoothly. A smooth
   ramp has no landmarks, so the player's sense of time has nothing to attach to except the clock.
   Our set pieces (swarm, ring) are one-shots that fire *on top of* the trickle instead of being
   the minute's identity.
2. **Density is rate-limited, not quota-filled.** The target count `24 + 26*m` reads like a quota,
   but the actual spawn rate (`3 + 1.4*m` per second) is the binding limit once the build kills
   faster than that (by minute 7 the bot kills 17/s against a spawn rate of about 13/s). Measured
   in-view counts stay at 20-50 for the first eight minutes and never reach 100 before minute 14;
   VS's minimums hit 50 by minute 2 and 300 by minute 11 with instant backfill. The screen never
   *fills*, so the "crushing thousands of ants" fantasy and the hit-event density that drives
   dopamine arrive late.
3. **Level-up cadence decays.** 20 levels in the first 5.5 minutes, then one every 30-60 s. The
   XP curve is quadratic while per-enemy XP is flat (1), so the only thing keeping level-ups
   coming is kill count. VS keeps about 23 s average by growing enemy XP with waves and keeping the
   level curve near-linear. Long stretches without a pause are exactly what the Secret Sauce essay
   calls exhausting.
4. **Too many things demand attention in the base loop.** Ranged shooters from minute 0, bombers,
   elites planting ground hazards every 5-8 s, Alphas, treasure runners, bosses with 12 raid
   patterns. VS's base loop is "straight-line chasers only"; hazards are reserved for bosses in the
   survivors-likes that use them (Halls of Torment). Every telegraph is a conscious decision that
   interrupts autopilot. (Boss raids are a differentiator worth keeping; the question is elites.)
5. **Fast enemies outrun the player late.** With the +30% after minute 5, `fast`-role species reach
   130-157 px/s (Golbat/Murkrow/Ponyta 156) against player speeds of 129-141. Kiting stops
   working, which is stressful rather than tense. In VS almost everything is slower than you; only
   swarm crossers are fast, and they leave.
6. **Feedback has the pieces but not the beats.** Hit sparks, numbers, kill puffs and the chest
   reels are all there. Missing are the *rhythmic* cues: a per-minute wave banner, a stepped
   kill-streak ladder like the candy one, hit-stop on crits/boss kills, a low-HP heartbeat, and a
   timer that visibly flips minutes. The warn banner is used for everything from swarms to
   treasure carriers, so it reads as noise rather than as a drumbeat.
7. **Run length is 15 minutes with a boss every 3.** That is a fine choice (the design spec picked
   it), but it means fewer chapters than VS by construction; the per-minute structure above matters
   even more to make 15 minutes feel long in the good way.

Not a gap: set-piece variety (we have swarms and rings like VS), chest ceremony (ours is already
a slot machine with ball tiers), meta progression (shop, achievements), map objectives (we have
more than VS).

---

## 4. Plan

Each phase is independently shippable and measurable with `scripts/pacing.ts`. Targets are for
`viridian charmander 960`.

### Phase 1: Minute waves (spawner + stage data)

Goal: every minute is a chapter; the screen fills; set pieces own their minute.

- **Per-stage wave table** replacing `pools: {early, mid, late}`: for each minute 0-15,
  `{ species: SpawnEntry[], min: number, interval: number, events?: WaveEvent[], hpTier: number }`.
  Author the 7 stages so that **each minute introduces or retires at least one species** (the
  pools already hold 10-13 species per stage; it is a re-arrangement, not new content).
- **Quota backfill**: every `interval` seconds, spawn until `min` live regular enemies; if above
  quota, spawn one of each species in the wave. Keep `MAX_ENEMIES` (520) as the hard cap and keep
  elites/bosses/events exempt like VS.
- **Non-monotonic minimums** with breathing minutes. Draft for Viridian (scaled to 15 min from the
  Mad Forest shape): `12, 25, 45, 35, 25, 10*, 60, 90, 30, 10*, 200, 40, 150, 120, 220, 260`
  (`*` = ring minute, trickle at 10 while the ring closes). Intervals `1.0, 0.5, 0.25, 0.1`.
  Co-op multiplies `min` by `1 + 0.35(n-1)` as today.
- **Events as part of the wave**, with repeats: swarm `{ at: 5, chance: 1, repeats: 3, every: 5 }`,
  ring `{ at: 0, duration: 45 }` where the ring **is** a slow-closing wall (spawn at about 0.6 view
  radius, speed 25-35 px/s, high HP, despawn after `duration`) rather than a one-shot blob.
  Keep the mid-game "one every 55 s" fallback only past 15:00 (overtime).
- **Stepwise enemy HP per minute** (`hpTier` per wave) instead of the smooth cubic, so a level-up
  visibly flips a wave from sticky to melting until the next minute arrives. Keep stage
  difficulty and party scaling as multipliers.
- **Speed discipline**: cap regular enemies at 0.85x the slowest starter (about 110 px/s) and drop
  the +30% late bonus; move pressure to quota and HP. Swarm crossers keep their 85+ speed since
  they leave the screen.
- **Elite = wave boss**: fire the elite on the minute mark for minutes that list one (most
  minutes, like VS), so the chest cadence (about 1/min) is predictable and the HUD can show it.

Targets: in-view enemies >= 50 by minute 2 and >= 150 by minute 10 on a kiting bot; a visible
species change every minute; no regular enemy faster than the player before overtime.

### Phase 2: Reward cadence

Goal: a level-up every 20-25 s from minute 1 to minute 15, never a gap over 40 s.

- **Enemy XP grows with the wave**: `xp = 1 + 0.25*minute` for regulars (so minute-12 fodder gives
  4), tanks x2 as today, and candy tiers (S/M/L/XL) will show it.
- **Flatten the XP curve** after level about 12 to near-linear (VS: +10 per level to 20, +13 to 40,
  +16 after); keep the snappy first levels. Re-tune `MAX_MOVE_LEVEL` / filler so there is always a
  meaningful card (limit breaks and vitamins already cover this).
- **Candy piles**: when floor candy exceeds about 120 (not 380), merge into an XL pile at the
  crowd's centroid that pays several levels at once when collected; the Magnet item then produces
  the VS level-up cascade moment.
- **Scripted first treasures**: like VS's `1-1-3-1-1-5`, make the first elite chests of a *save*
  (not run) follow `Poke, Poke, Great, Poke, Poke, Ultra` to set expectations.

Targets: level-up gap p50 <= 25 s, p90 <= 40 s, max <= 45 s across 0-15 min on `viridian charmander`.

### Phase 3: Feedback beats

Goal: rhythm the player can feel without reading.

- **Minute banner** on every wave change: the new species' sprite + a short line
  ("Spearow flock in!", "Metapod wall closing in!") with its own two-note sting; the timer digits
  pulse on the minute flip. Reserve the red warn banner for swarms/rings/bosses; treasure
  carriers and Alphas get a quieter toast + minimap mark (they already have one).
- **Kill-streak ladder**: like the candy pentatonic ladder in `audio.ts`, a pitch step per kill
  inside a 0.4 s window, draining; crits add a sparkle layer. Keep the `gate` throttles.
- **Hit-stop**: 2 frames on crit, 6-8 frames (sim pause + zoom punch) on elite kill; boss kill
  already has a cinematic. Implement as `sim` time-scale, not a render freeze, so co-op stays in
  sync (host-authoritative).
- **Death pop** for regular enemies: 80 ms white flash + squash before the puff, so kills read at
  a glance in dense crowds (VS enemies flash and fall).
- **Danger cues**: <= 30% HP heartbeat (noise channel) + soft red vignette; incoming-damage
  direction already exists via shake, keep it.
- **Readability**: an effects-opacity slider (Halls of Torment) and auto-thin damage numbers above
  about 60 hits/s (we throttle at 160 numbers; make the cut-off a setting).
- **Elite telegraphs**: make elite ground casts rarer (every 12-16 s) and only after minute 6, so
  the first half of a run is pure crowd-shepherding. **Decision for the user**: keep elite raids at
  all? Research says the base loop should be straight-line chasers; our differentiator can stay on
  bosses and Alphas.

### Phase 4 (optional): Director layer and polish

- A small **tension meter** on top of the script (L4D style): if HP > 90% and kills/s are high for
  20 s, pull the next event forward 10-15 s; if HP < 35%, pause the trickle for 4 s (reprieve)
  once per minute. Never changes the wave table, only its timing.
- **Overtime identity**: a Reaper-like unkillable sweeper after 15:00 for players who stay, so the
  ending is a famous moment rather than a fade.
- Per-stage **wave text in the Pokedex / stage select** ("Minute 7: Spearow swarm") so players can
  anticipate like VS veterans do.

---

## 5. Noticed along the way (superseded by section 6)

- **Fixed in this change**: Alphas lured past their leash re-enraged every tick while walking
  home (`hp < maxHp` re-triggered the enrage branch), spamming the warn banner and SFX about 60
  times a second (205 warnings in 30 s in the telemetry). They now have a walking-home state and
  heal fully on arrival; a partner who follows them re-provokes them.
- `Spawner.update`'s `target` is not really a target (see gap 2): the rate dominates. Phase 1
  replaces both, so no separate fix.
- `hpMult` multiplies by the party level (`1 + 0.006*(level-1)`), which punishes the fast
  level-ups Phase 2 wants. Drop it when switching to per-wave HP tiers.
- Ranged enemies appear in `early` pools of five stages (Horsea, Magnemite, Drowzee, Vulpix,
  Oddish). If Phase 3's "no telegraphs before minute 6" is accepted, move shooters to minute >= 4
  in the wave tables.

---

## 6. Implementation status (2026-10-29, same day)

All four phases were built the same day by Sonnet subagents (one implementer, a spec reviewer and a
code-quality reviewer per task) in two worktrees: Phase 3 on `work/feedback-beats`, Phases 1, 2 and 4
on `work/minute-waves`, both fast-forwarded into master. What shipped, and where it differs from the
plan above:

**Phase 1 (minute waves)**: as planned. `WaveDef` per minute 0-15 for all 7 stages
(`src/data/stages.ts`, authored through the `waves()` builder), shared `WAVE_MIN`
`[15, 35, 60, 50, 45, 10, 110, 150, 60, 10, 260, 70, 220, 190, 280, 300]` (minutes 5 and 9 are the
breathing ring minutes; minute 13 has a ring too but keeps its quota), intervals 1 / 0.5 / 0.25 / 0.1 s, `WAVE_HP` tiers replacing the cubic (the level
factor is gone), regular speed capped at 110 px/s with the late +30% removed, an elite 2 s into most
minutes (two from minute 10), swarms with repeats and rings as slow-closing walls (`AI.WALL`,
25-35 px/s, 3x tank HP, despawn after 40-45 s) as `events` on the wave. Elite ground casts only
from 6:00 with a 12-16 s cooldown. Measured (viridian/charmander bot): peak in view 58-94 in
minute 2, 185 in minute 10; about 0.5-0.8 ms of sim per tick at the minute-10 backfill.

**Phase 2 (reward cadence)**: XP per regular is a per-wave value, `(1 + 0.25m)` scaled by
`sqrt(45 / quota)` clamped to 0.75-2.5, so income is flatter across thin and thick minutes; the
curve keeps levels 1-11 and continues `206 + 90m + 26m^2` from level 12 (a gentle quadratic; no
near-linear slope landed in the band). Candy merges into piles above 120 pickups unless it lands in
a pickup radius. The first six elite chests of a *save* are Poke, Poke, Great, Poke, Poke, Ultra.
Per-kill item drops were cut hard because kills per run went up 3-6x. Measured on seeds 7/8/9: a
pile-fetching player ("potential level" line in `scripts/pacing.ts`) gets gap p50 18-21 s, p90
33-51 s, max 59-77 s and level 37-44 at 15:00; the kiting bot itself leaves XP on the floor and
reads worse (p50 12-19 s, max up to 200 s). The p90 and max targets were **not** met by the
letter; the remaining stalls are the two ring minutes plus the bot's refusal to walk to piles.

**Phase 3 (feedback beats)**: minute banner (species portrait + line + sting) that yields to alert
banners, quiet notices for treasure carriers and Alphas, timer pulse on the minute, kill-streak
pitch ladder sharing a `Ladder` helper with the candy ladder, crit sparkle, white-flash death pop
(`src/render/pops.ts`), hit-stop as sim time-scale (2 frames on crit at most every 0.5 s, 7 on elite
or alpha kills; peers freeze on the same tick; interpolation pinned), zoom punch, low-HP red vignette
and heartbeat, options for effects opacity (hostile telegraphs never dim) and a damage-number cap of
40 / 80 / 160. Deviation: the number thinning is a manual cap, not an auto-thin by hit rate. Co-op
guests see the freeze through stalled snapshots rather than an explicit flag. The elite ground casts
are kept (rarer and later); the user decision on removing them is still open.

**Phase 4**: `Director` (surge pulls the next set piece 10-15 s earlier after 20 s of >90% HP and
>=8 kills/s; reprieve pauses backfill 4 s under 35% HP; each once a minute, silent); an unkillable
Banette sweeper 60 s after the final boss appears and every 60 s after until it dies; a minute 1-15
wave timeline on unlocked route cards.

Follow-ups noted by reviewers, not done: split `src/game/enemies.ts` into spawner and enemy AI;
a `SimConfig.startTime` seam so tests stop poking the spawner's private boss index; a guest's
death-pop walk frame can differ from the host's; the kill ladder and new SFX have not been heard
in a browser; the stage-card timeline has not been eyeballed at the 250 px card minimum.
