# Survivor-like design principles

A standing reference for Pokémon Survivors. Read it before changing spawning, rewards, feedback,
balance, moves or meta progression, and check new work against the checklist at the end.

It distils the October 2026 research into why Vampire Survivors (VS) holds players for 30 minutes
while our game made time feel slow, plus what other survivor-likes added to the formula. The
evidence, measurements and sources are in
[the pacing research](superpowers/specs/2026-10-29-vs-pacing-and-feedback-plan.md). The
[retention plan](superpowers/plans/2026-10-29-retention-followups.md) covers the second round.
This page keeps the rules and drops the history.

Each principle says what to do, why it works, and where it lives in our code today.

---

## 1. The north star

**The player should lose track of time.** Every principle below serves one of three things:

- **Flow.** The hands stay busy on simple spatial play, so the conscious mind can drift.
- **Landmarks.** The run is chopped into short chapters, so time passes in steps the player
  can feel without looking at a clock.
- **A steady drip of reward.** Something good is always seconds away, including the moment
  the player dies.

When a change trades one of these for something else, it needs a strong reason.

---

## 2. Time and structure

### 2.1 Every minute is a chapter
Each minute has its own crowd, its own density and often its own set piece. A smooth ramp has no
landmarks, so the player only has the clock to measure time by, and the clock feels slow.

- Introduce or retire at least one species every minute.
- Mark the minute flip with a banner, a sting and a timer pulse.
- *Ours:* the per-minute `WaveDef` table in `src/data/stages.ts`, plus the wave banner in `src/ui/dom.ts`.

### 2.2 Tension and release, not a ramp
Enemy minimums spike and then drop. A busy minute followed by a quiet one is what produces flow.
A ramp that only climbs produces fatigue.

- Keep breathing minutes. Minutes 5 and 9 are ring minutes where the trickle drops to 10.
- Put difficulty spikes right after a release, not right after another spike.
- *Ours:* `WAVE_MIN` in `src/data/stages.ts`.

### 2.3 Set pieces own their minute
A swarm crossing the screen or a slow ring wall closing in should be the identity of its minute.
They should not be noise laid over a full crowd. Pull the regular quota back when a ring runs.
Make events predictable, at fixed seconds and with repeats, so veterans can anticipate them.

- *Ours:* `WAVE_EVENTS` in `src/data/stages.ts`, plus swarm and ring handling in `src/game/spawner.ts`.

### 2.4 A known, famous ending
A public, fixed run length turns every moment into "a known distance from the next thing".
That distance is what makes players say "one more minute". The ending should be a memorable
moment, not a fade.

- Show the route's timeline before the run starts.
- After the final boss, an unkillable sweeper arrives, the way VS uses the Reaper.
- *Ours:* the 12-minute run (a boss at 3, 6 and 9 minutes, the final boss at 12:00), the route-card wave strip in `src/ui/menus.ts`, and the Haunter
  sweeper in `src/game/spawner.ts`.

### 2.5 Explicit pauses are allowed
Level-up screens, chest reels and the Elite Mode mart are rests the player is glad of, not
interruptions. Brotato builds its whole rhythm on short waves with a shop between them. Use
pauses on purpose, but never two back to back. In co-op one player's pause must not stop the
others: their cards and shows play inside a shield bubble while the run goes on (Sim.live in src/game/sim.ts).

---

## 3. The crowd

### 3.1 The base loop is straight-line chasers
VS enemies walk straight at you, and its challenges barely change across a run. Escalation comes
from *your* output growing. That keeps the mental load purely spatial, so "combat autopilot"
can set in. Every telegraph the player must read is a conscious decision that breaks autopilot.

- Regular enemies chase. Shooters and bombers appear only from minute 6, and fire sparingly.
- Telegraphed hazards belong to bosses, guardians and Alphas, never to fodder or ordinary elites.
- *Ours:* `updateEnemies` and `guardianRaid` in `src/game/enemyAI.ts`.

### 3.2 Everything regular is slower than the player
Kiting is the core skill. If ordinary enemies can outrun the player, the tension turns into stress.

- Regular enemies are capped at 110 px/s. The slowest starter is about 129 px/s.
- Only swarm crossers may be faster, because they leave the screen.
- Raise pressure through numbers and HP, never speed.

### 3.3 The screen should fill
The fantasy is mowing down thousands. Density is set by a quota that backfills instantly, not by
a spawn rate the build can outpace. In-view counts should pass 50 by minute 2 and 150 by minute 10.

- Bosses, elites and events are exempt from the regular quota. `MAX_ENEMIES` is the hard cap.
- *Ours:* `Spawner.updateWave` in `src/game/spawner.ts`.

### 3.4 HP steps, not curves
HP goes up in steps per minute, not along a smooth curve. Then a level-up visibly turns a sticky
wave into a melting one, until the next minute arrives. Never scale enemy HP by the player's
level, because that punishes the level-ups we want to feel good.

- *Ours:* `WAVE_HP` in `src/data/stages.ts`.

---

## 4. Rewards

### 4.1 A level-up every 20 to 25 seconds, all run long
VS averages one level-up every 23 seconds for 30 minutes. A trickle of small upgrades paces better
than a few big ones. A long stretch with no pause is exhausting.

- XP per enemy grows with the wave and is normalised by the wave's quota, so thin minutes still pay.
- Keep the level curve gentle after the opening levels.
- Target a gap of about 20 s at the median and 40 s at the 90th percentile.
- *Ours:* `waveXp` in `src/data/stages.ts` and `xpForLevel` in `src/game/sim.ts`.

### 4.2 Every card is worth taking
A level-up that offers nothing useful costs a reward beat. There must always be something to level.

- No dead cards before 12:00. Check with `scripts/cards.ts`.
- When the moveset is full, limit breaks and vitamins keep the pool alive.
- An upgrade level that does nothing should not exist. Loaded Dice caps at 3 for this reason.

### 4.3 XP stays on the floor
Gems you must walk to are the movement dance: back through cleared ground, then out to the edge
again. When too much candy piles up, it merges into a big pile worth several levels. A magnet or a
pile then gives the level-up cascade, one of the best moments in the genre.

- *Ours:* candy merging above 120 pickups in `src/game/sim.ts`.

### 4.4 Chests are the slot machine
Elite chests are the run's jackpot. They should feel like gambling, with none of the money.

- Show reels, a jingle that grows with the reward count, stars behind big reveals, and a count-up.
- Use ball tiers as rarity. The user wants real Poké Ball art over custom badges.
- Script a save's first six elite chests to set expectations before the real odds take over.
  VS uses 1, 1, 3, 1, 1 and 5 rewards. Ours go Poké, Poké, Great, Poké, Poké and Ultra Ball.
- *Ours:* `src/ui/chest.ts`, `ELITE_CHEST_SCRIPT` in `src/data/items.ts`, and the reveal jingles
  in `src/audio/sfx.ts`.

### 4.5 Every death is a near miss
A run that ends short should still feel close, because the next level, boss or minute was seconds
away. Say so on the results screen, and make retrying instant.

- *Ours:* `nearMissLines` in `src/ui/nearMiss.ts`. R or Enter replays the run.

### 4.6 No run gives nothing
Money, unlocks, Pokédex entries and achievements come from every run. Meta upgrades must be big
enough to feel. VS reaches about 2.5x damage and 2x health over many runs.

- A maxed Mart gives about +50% attack and +80% HP.
- *Ours:* `SHOP` in `src/meta/shop.ts`.

---

## 5. Power curve

### 5.1 The late game is allowed to break
Players in VS end up dealing so much damage they can look away, and that *is* the fantasy.
Megabonk launched on players sharing absurd builds. Do not tune the last minutes back down to
"fair".

- Limit breaks scale linearly to +6, then taper. Items go to level 7.
- Pressure in the late game comes from numbers and set pieces, not from erasing the player's power.
- *Ours:* `overLevelMult` in `src/data/moves.ts`, and `MAX_ITEM_LEVEL` in `src/data/items.ts`.

### 5.2 Early power is earned in small, frequent steps
Opening levels come fast and each one changes something visible. The first two minutes teach the
loop. Do not front-load the strongest effects.

---

## 6. Builds, moves and statuses

These rules come from the user, and apply alongside the research.

- **Unique purpose.** Every move, ability and item does one thing nothing else does. Only basic
  starter moves may overlap.
- **Never take control away.** Moves must not move or slow the player. The exception is a big,
  obvious wind-up with a strong payoff, like Dig or Rest.
- **Readable statuses.** Many statuses are fine if each has its own badge, tint and glossary entry.
  The player must always be able to tell what is happening.
- **Hover info** goes through `tipped()` in `src/ui/tips.ts`, never the browser's title tooltip.
- Detail is in [the move quality pass](superpowers/specs/2026-10-29-move-quality-pass.md).

---

## 7. Feedback and game feel

### 7.1 Rhythm the player feels without reading
Beats should arrive on a regular pulse: the minute banner, the timer pulse, the kill-streak pitch
ladder, the candy ladder. Rising pitch on a streak is one of the genre's cheapest, strongest hooks.

- *Ours:* the `Ladder` helper and `KILL_LADDER` in `src/audio/audio.ts`.

### 7.2 Impact is short and tiered
- **Hit-stop.** 2 frames on a crit, at most every half second. About 7 frames on an elite or Alpha
  kill. A full cinematic is for bosses only. It is a slowdown of sim time, so it is off in co-op, where it
  would freeze every teammate.
- **Death pop.** A white flash before the puff, so kills read at a glance in a dense crowd.
- **Shake and zoom.** Both are tiered and fade fast. Never shake on ordinary hits.

### 7.3 Vary what repeats
Any sound that plays more than a couple of times a minute gets about ±7% random pitch, or it
becomes grating. The streak ladders stay exact, because their pitch carries meaning.

### 7.4 Alerts have a hierarchy
If every event uses the red warning banner, the banner becomes noise.

- **Red warning:** swarms, rings, bosses. Things that can kill you.
- **Wave banner:** the minute flip. It yields to warnings.
- **Quiet notice and minimap mark:** treasure carriers, Alphas, other opportunities.

### 7.5 Danger is felt before it is read
Below 30% HP, a red vignette and a heartbeat grow stronger. Players should feel they are low
without looking at the HP bar.

- *Ours:* `src/render/danger.ts`.

### 7.6 Readability is a feature
Late VS becomes a screen of rainbows and numbers. Halls of Torment answered with an effects-opacity
slider.

- Offer effect opacity and a damage-number cap in options.
- Hostile telegraphs never dim, whatever the setting.

---

## 8. The invisible hand

A small director sits on top of the scripted waves. It only nudges their timing. If the player is
dominating, it pulls the next set piece forward. If the player is nearly dead, it pauses the
backfill for a few seconds. Each happens at most once a minute and is never announced. The wave
script stays the source of truth.

The Left 4 Dead director's rule of thumb sums it up: no one gets bored, and no one rage-quits.

- *Ours:* `src/game/director.ts`.

---

## 9. Discovery and the long game

- **Anticipation.** Players should be able to learn what is coming, like VS veterans do. The route
  card shows each minute's wave.
- **Discovery.** Unseen Pokédex entries show as silhouettes with a hint, like "Evolves somewhere
  cold". Hints point the way without spelling it out.
- **Optional goals on the map** give the player somewhere to go: caches, Alphas, treasure carriers,
  the Mega Stone. Deep Rock Galactic: Survivor shows that objectives add pacing. Keep them optional
  and quietly announced.

---

## 10. Anti-patterns

Things the research and our own history warn against:

- A difficulty curve that only climbs, with no breathing minutes.
- Fodder that telegraphs attacks, or that outruns the player.
- Set pieces stacked on a full crowd so they don't stand out.
- Scaling enemy HP with player level.
- Long gaps between level-ups, or level-ups with nothing worth taking.
- Nerfing the late game back to "fair".
- Fixing one complaint, such as the economy, by quietly removing a reward beat the user liked.
- Using the warning banner for everything.
- The same sound at the same pitch dozens of times a second.
- Effects that hide hostile telegraphs.
- Moves that move the player or take control.
- `Math.random` in `src/game`. The sim must be deterministic for co-op, so use `sim.rng`.

---

## 11. Measuring

Feel is the final judge, but measure first. The bot is an imperfect player, so read trends rather
than exact numbers.

| Tool | What it tells you |
|---|---|
| `node scripts/pacing.ts <stage> <line> 960 <seed>` | Level-up gaps (actual, and potential if piles were fetched), enemies in view, kills, hit events per second, ms per tick, every 30 s |
| `node scripts/cards.ts <stage> <line> [seed]` | How often level-up offers contain dead cards |
| `node scripts/sfx-levels.mjs` | Loudness and clipping of every sound effect, with a dev server running |
| `node scripts/stageshots.mjs` | Screenshots of each stage, with a dev server running |

Current targets for `viridian charmander`:

| Measure | Target |
|---|---|
| Level-up gap, median | about 20 s |
| Level-up gap, 90th percentile | 40 s or less |
| Enemies in view, minute 2 | 50 or more |
| Enemies in view, minute 10 | 150 or more |
| Dead cards before 12:00 | none |
| Regular enemy speed | below the slowest starter |

Always check more than one seed. One seed can die where six others win, because a small change
reshuffles the random stream.

---

## 12. Checklist for a new feature

1. Which of flow, landmarks or reward drip does it serve? If none, why add it?
2. Does it add something the player must consciously read during the base loop? If so, does it
   belong on a boss or Alpha instead?
3. Does it have a feedback beat that fits the alert hierarchy?
4. Does it repeat often? Then vary its pitch and look.
5. Does it lengthen a gap between rewards, or remove a reward the player liked?
6. Does a new move, item or status have a unique purpose and a readable icon?
7. Does it stay deterministic and work for co-op guests?
8. Did you measure with the scripts on several seeds, and look at it in a browser?

---

## Sources

- VS wiki: [Enemies](https://vampire.survivors.wiki/w/Enemies),
  [Mad Forest](https://vampire.survivors.wiki/w/Mad_Forest),
  [Treasure Chest](https://vampire.survivors.wiki/w/Treasure_Chest)
- [The Secret Sauce of Vampire Survivors](https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors)
- [Pause Menu essay on combat autopilot](https://pausemenu.substack.com/p/how-vampire-survivors-taught-me-the)
- [The Conversation: gambling psychology in Vampire Survivors](https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613)
- [Platinum Paragon: psychology of Vampire Survivors](https://platinumparagon.info/psychology-of-vampire-survivors/)
- Brotato, Halls of Torment, Deep Rock Galactic: Survivor and Megabonk coverage, plus the Left 4 Dead
  and Risk of Rain 2 director wikis, as linked in section 1.3 of the pacing research.
