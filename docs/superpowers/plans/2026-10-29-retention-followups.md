# Retention Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the remaining research lessons from `docs/superpowers/specs/2026-10-29-vs-pacing-and-feedback-plan.md` §1 that the pacing work did not cover: the retry loop and near-miss readout, meta power that is actually felt, a late game that is allowed to break, a chest and results ceremony, a purer base crowd, pitch variance, Pokédex discovery hints, and an Elite Mode mart stop.

**Architecture:** Nine independent tasks in two streams. Stream A (UI, meta, audio) touches `src/ui`, `src/meta`, `src/audio`. Stream B (sim and balance) touches `src/game`, `src/data`, `scripts`. Each task is one commit with tests, reviewed for spec then quality before the next task in its stream starts. Both streams land on master by fast-forward.

**Tech Stack:** TypeScript, Vite, vitest, deterministic fixed-step `Sim` (`sim.rng` only in `src/game`), DOM menus (`h()` helpers in `src/ui/dom.ts`), MML chip synth (`src/audio`).

**Measurement:** `node scripts/pacing.ts <stage> <line> 960 <seed>`; `npm test`; `npm run typecheck`; `npm run build`.

---

## File map

| Area | Files | Responsibility |
|---|---|---|
| Results and retry | `src/ui/menus.ts` (`resultsScreen`), `src/meta/achievements.ts` (`RunSummary`), `src/game/session.ts` (`summarize`), new `src/ui/nearMiss.ts` | Near-miss lines and the quick-retry key |
| Meta magnitude | `src/meta/shop.ts` (`SHOP`, `metaBonuses`), `tests/data.test.ts` | Stat caps that reach a felt multiplier |
| Late power | `src/game/stats.ts`, `src/game/levelup.ts` (`pickFillers`), `src/data/items.ts` (`MAX_ITEM_LEVEL`), new `scripts/cards.ts` | Limit breaks that keep scaling, items with more tiers, an offer-quality audit |
| Ceremony | `src/ui/chest.ts`, `src/audio/sfx.ts`, `src/ui/menus.ts` (`resultsScreen`), new `src/ui/countup.ts` | Escalating reveal jingles, stars, results count-up |
| Base crowd | `src/data/stages.ts` (wave lines), `src/game/enemyAI.ts` (ranged cadence), `tests/data.test.ts` | Shooters and bombers out of minutes 0-5, calmer shooting after |
| Pitch variance | `src/audio/audio.ts` | ±7 % on frequent one-shots |
| Discovery | `src/ui/menus.ts` (`dexScreen`), new `src/ui/evoHints.ts`, `src/data/stages.ts` (`hint` per stage) | "Evolves somewhere cold" style hints for unseen forms |
| Mart stop | `src/game/sim.ts`, `src/game/levelup.ts`, `src/game/types.ts` (`UpgradeOffer.cost`), `src/ui/levelup` cards, `src/net/*` | Elite Mode shop pause after each boss |

---

## Stream A: UI, meta, audio

### Task A1: Near-miss readout and quick retry

**Why:** VS deaths feel close because the next reward was seconds away (plan §1.2). Our results screen shows totals only, and retry needs a click.

**Files:**
- Create: `src/ui/nearMiss.ts`
- Modify: `src/meta/achievements.ts` (`RunSummary`), `src/game/session.ts` (`summarize`), `src/ui/menus.ts` (`resultsScreen`), `src/app.ts` (key handling on the results screen)
- Test: `tests/nearMiss.test.ts`

- [ ] **Step 1: Extend `RunSummary`** with `xp: number`, `xpNext: number`, `nextBossAt: number | null` (seconds, the first `stage.bosses[i].at > time`, null after the final boss), `nextWaveAt: number` (`Math.ceil(time / 60) * 60`), `chestsOpened: number` (count of `chest` events this run; add a counter on `Sim` incremented in `openChest`). Fill them in `summarize`.
- [ ] **Step 2: Pure helper** `nearMissLines(r: RunSummary): string[]` in `src/ui/nearMiss.ts`, returning up to three lines, only for runs that were not cleared:
  - `"Next level was ${xpNext - xp} XP away"` when `xpNext - xp <= xpNext * 0.5`
  - `"${SPECIES[boss].name} was ${fmtTime(nextBossAt - time)} away"` when `nextBossAt - time <= 45`
  - `"Minute ${minute + 1} was ${Math.ceil(nextWaveAt - time)} s away"` when `nextWaveAt - time <= 20`
  Write the test first: three summaries (all three lines, none, one) with exact strings.
- [ ] **Step 3: Results screen** shows the lines under the title in a `.near-miss` block, and the time survived gets the minute-chapter form (`"7:42 (minute 8)"`).
- [ ] **Step 4: Quick retry:** on the results screen, `R` or `Enter` triggers the same action as "Play again" (solo only); the button label reads `Play again (R)`. The 900 ms delay before the results screen stays.
- [ ] **Step 5:** `npm test`, `npm run typecheck`, commit `feat: near-miss readout and quick retry on results`.

### Task A2: Meta power that is felt

**Why:** VS meta reaches about 2.5× damage and 2× health; ours caps at +25 % attack and +40 % HP (`src/meta/shop.ts`). The plan §1.2 ties the "retry immediately" loop to this.

**Files:**
- Modify: `src/meta/shop.ts` (`SHOP` ranks and `metaBonuses`), `tests/data.test.ts` (shop sanity test), `README.md` if it quotes the caps
- Test: `tests/data.test.ts`

- [ ] **Step 1: Raise caps.** `protein`, `calcium`: maxRank 5 → 10 (+50 % at cap). `hp-up`: 5 → 10 (+80 %). `iron`, `zinc`: 5 → 8. `carbos`: 5 → 6. `pp-up`, `exp-share`: 5 → 8. Keep `baseCost`; set `growth` so rank 10 of a stat costs about ₽4,000 (`growth = 1.45` for the 10-rank entries). Add a test asserting `upgradeCost(u, maxRank - 1)` is between ₽2,000 and ₽6,000 for every stat upgrade and that `metaBonuses` at max shop gives `atk >= 0.5`, `hp >= 0.8`.
- [ ] **Step 2: Mart UI** already renders ranks from `maxRank`; verify the pips/row layout handles 10 (read `shopScreen`), fix wrapping if needed.
- [ ] **Step 3:** commit `balance: meta stat caps reach +50% attack / +80% HP`.

### Task A3: Chest and results ceremony

**Why:** VS reel jingles A/B/C, stars behind reveals, gold count-ups (plan §1.2). Our 3- and 5-reward reveals sound like the 1-reward one.

**Files:**
- Modify: `src/audio/sfx.ts` (`reveal` variants), `src/audio/audio.ts` (`case 'reveal'` picks by arg), `src/ui/chest.ts` (`chestShow`), `src/ui/menus.ts` (`resultsScreen`), `src/style.css`
- Create: `src/ui/countup.ts`
- Test: `tests/audio.test.ts` (new phrases parse), `tests/countup.test.ts`

- [ ] **Step 1: Three reveal jingles** `reveal1`, `reveal3`, `reveal5` in `sfx.ts` (the existing `reveal` becomes `reveal1`; `reveal3` adds a third bar and a higher ending; `reveal5` is a four-bar fanfare with the noise channel). `audio.sfx('reveal', n)` picks by reward count: 1-2 → `reveal1`, 3-4 → `reveal3`, 5 → `reveal5`. The sfx-parses test covers the new phrases automatically.
- [ ] **Step 2: Stars** behind a 5-reward reveal: `chestShow` spawns a ring of 12 star sprites (`uiIcon('shiny')` or a CSS `★`) that burst outward over 0.6 s when the panel opens; 3-reward gets 6 stars. CSS keyframes, no per-frame JS.
- [ ] **Step 3: Results count-up:** `countUp(el, to, ms, format)` in `src/ui/countup.ts` animates a number from 0 to `to` over `ms` with `requestAnimationFrame`, ticking `audio.sfx('tick')` every ~80 ms while it runs. Test the pure easing (`countUpValue(t01, to)` → integer, monotone, ends at `to`). Results screen counts up Pokémon defeated, damage dealt and Poké Dollars, staggered 0 / 300 / 600 ms, 900 ms each. A `prefers-reduced-motion` check skips the animation.
- [ ] **Step 4:** commit `feel: escalating chest reveals, reveal stars, results count-up`.

### Task A4: Pitch variance on frequent one-shots

**Why:** Game-feel rule from §1.3: ±7 % random pitch on any sound that fires more than twice a minute.

**Files:**
- Modify: `src/audio/audio.ts`
- Test: `tests/audio.test.ts`

- [ ] **Step 1:** Add `private jitter(hz: number) { return hz * (1 + (Math.random() * 2 - 1) * 0.07); }` (client-side audio may use `Math.random`). Apply to `hit`, `super`, `coin`, `candy` (the ladder rung stays exact; jitter the final Hz only), `boom`, `fire`, `pop`, `tick`. Do NOT jitter `kill` (its ladder is the readable cue), `wave`, `warn`, `levelup`, `chest`, `heartbeat`.
- [ ] **Step 2:** `renderSfxOffline` sets a `deterministic` flag that makes `jitter` return `hz` unchanged so the level script stays comparable. Test: with the flag, two renders of `hit` schedule identical frequencies (expose the last scheduled Hz through the existing test seam, or test `jitter` directly with a seeded stub).
- [ ] **Step 3:** commit `feel: ±7% pitch variance on frequent one-shot sounds`.

### Task A5: Pokédex discovery hints

**Why:** Secrets drive VS's community (§1.3). We have environment-based final forms (`LINE.envForms`) but show nothing about undiscovered ones.

**Files:**
- Create: `src/ui/evoHints.ts`
- Modify: `src/data/stages.ts` (add `hint: string` per stage: viridian "somewhere leafy", mtmoon "deep in a cave", seafoam "somewhere cold", powerplant "somewhere charged", tower "somewhere haunted", cinnabar "somewhere volcanic", cerulean "where the strongest gather"), `src/ui/menus.ts` (`dexScreen` evolution row)
- Test: `tests/evoHints.test.ts`

- [ ] **Step 1: Pure helper** `evoHint(line: LineDef, form: string, seen: Set<string>): string | null`: null when `form` is in `seen`; otherwise, if the form is an `envForms` entry, `"Evolves ${STAGE[stageId].hint}"`; if it is the default final, `"Evolves at level ${line.evolveAt[1]}"` (read the actual field name in `pokedex.ts`). Test all three branches.
- [ ] **Step 2: Dex row:** unseen forms draw as a dark silhouette (`filter: brightness(0)` on the portrait) with the hint as the tooltip via `tipped()` (never a `title` attribute) and a one-line hint under the row for the first unseen form.
- [ ] **Step 3:** commit `dex: silhouettes and location hints for undiscovered evolutions`.

---

## Stream B: sim and balance

### Task B1: Late game allowed to break

**Why:** VS's "look away from the screen" endgame and Megabonk's broken builds (§1.2, §1.3). Our limit breaks and vitamins grow logarithmically (`levelup.ts` comment), so builds plateau.

**Files:**
- Modify: `src/game/stats.ts` (limit-break and vitamin scaling), `src/game/levelup.ts` (`pickFillers` weights), `src/data/items.ts` (`MAX_ITEM_LEVEL` 5 → 7 with each item's `perLevel` unchanged)
- Test: `tests/sim.test.ts` (existing Raichu guard must still pass), `tests/cadence.test.ts` or a new `tests/latePower.test.ts`

- [ ] **Step 1: Read** how a move level above `MAX_MOVE_LEVEL` and `p.vitamins[id]` feed `refreshStats` / damage (grep `MAX_MOVE_LEVEL` and `vitamins` in `src/game/stats.ts`, `src/game/damage.ts`, `src/game/combat.ts`) and write down the current multiplier at limit-break +1, +4, +8 in the commit body.
- [ ] **Step 2: Linear limit breaks** from +1 to +6 (each +8 % damage, +4 % area or projectile count where the move has one), then logarithmic after +6. Vitamins: +6 % per rank up to 8, then logarithmic. Items: `MAX_ITEM_LEVEL` 7.
- [ ] **Step 3: Test** that `xpForLevel`-independent build power keeps growing: a player with all moves at +6 limit break deals at least 1.5× the damage of the same player at `MAX_MOVE_LEVEL` (use `rawDamageEnemy` on a dummy, or the stats getters).
- [ ] **Step 4: Measure** `node scripts/pacing.ts viridian charmander 960 7`: kills in the last 3 minutes should rise versus HEAD; the bot must still win. Paste both in the commit body.
- [ ] **Step 5:** commit `balance: limit breaks and vitamins scale linearly to +6, items to level 7`.

### Task B2: Card-quality audit and fix

**Why:** VS always has something to level (8 weapon tiers, 5 passive tiers, §1.2). A dead card at level 30+ breaks the level-up as reward.

**Files:**
- Create: `scripts/cards.ts`
- Modify: `src/game/levelup.ts` only if the audit shows a dead-card rate above 10 %
- Test: `tests/sim.test.ts` (extend the Raichu guard's `realAt6` idea to 10:00 and 14:00)

- [ ] **Step 1: Audit script** `node scripts/cards.ts <stage> <line> [seed]`: runs the bot for 15 minutes and, at every level-up, classifies the three offers as `real` (new move, move up below max, new item, item up), `limit`, `vitamin`, `heal`. Prints a per-minute table and the share of level-ups with zero `real` cards.
- [ ] **Step 2: Run** for `charmander`, `bulbasaur`, `pichu` on viridian, paste the tables in the commit body.
- [ ] **Step 3: Fix** if any line has more than 10 % zero-real level-ups before 12:00: the plan's lever is the item ceiling (already 7 after B1) and TM moves (`learnableMoves`); add the cheapest fix the data points at and re-run. If nothing exceeds 10 %, change nothing and say so.
- [ ] **Step 4: Guard:** extend the Raichu regression to assert at least one real card at 10:00 and 14:00 as well.
- [ ] **Step 5:** commit `audit: level-up card quality script and guard`.

### Task B3: Purer base crowd

**Why:** VS enemies never learn new tricks; hazards belong on bosses (§1.1, §1.3). Shooters and bombers appear from minute 4 in every stage.

**Files:**
- Modify: `src/data/stages.ts` (wave species lines), `src/game/enemyAI.ts` (regular ranged cadence), `tests/data.test.ts`
- Test: `tests/data.test.ts`, `tests/sim.test.ts`

- [ ] **Step 1: Data:** no `ranged` or `bomber` role species in waves 0-5 (today the rule is 0-3). Re-arrange each stage's lines so Power Plant and Seafoam keep their identity from minute 6 on. Keep the newcomer-per-minute and event tests passing. Update the data test's bound from 3 to 5.
- [ ] **Step 2: Cadence:** regular `ranged` enemies shoot only within 200 px and no more than every 3.5 s (read `enemyShot` callers in `enemyAI.ts`; guardians, bosses and Alphas keep their own timings). Bombers keep contact fuses.
- [ ] **Step 3: Test:** a Sim on powerplant at `startTime: 420` with the player standing still for 30 s records at most 9 `enemyShot` events per live shooter; a Sim at `startTime: 200` on powerplant has no ranged/bomber regulars alive.
- [ ] **Step 4:** commit `waves: shooters and bombers only from minute 6, calmer cadence`.

### Task B4: Elite Mode mart stop

**Why:** Brotato's wave-boundary shop is a legitimate alternative rhythm (§1.3). Elite Mode already exists as the "harder, richer" variant; a mart stop after each boss makes it a different rhythm instead of only bigger numbers.

**Files:**
- Modify: `src/game/types.ts` (`UpgradeOffer.cost?: number`), `src/game/sim.ts` (`beginMart()` after `bossDown` cinematic in elite mode), `src/game/levelup.ts` (`martOffers(p, rng)`), `src/ui/levelup.ts` or wherever the level-up cards render (show cost, grey out unaffordable), `src/net/*` (offers already replicate through the level-up path; verify `cost` rides along), `src/data/stages.ts` or README blurb for Elite Mode
- Test: `tests/sim.test.ts`

- [ ] **Step 1: Offers:** `martOffers(p, rng)` returns four cards with `cost`: a `heal` (Sitrus, ₽40), one `real` upgrade from `ownedUpgrades(p)` (₽80), one `newMove`/`newItem` from `generateOffers` (₽120), and `keep` ("Leave the mart", ₽0). Costs scale ×1.5 per mart visited.
- [ ] **Step 2: Phase:** in elite mode only, when a `bossDown` cinematic ends, `beginMart()` reuses the level-up phase (`phase = 'levelup'`, `offers` map) with mart offers and a `martVisits` counter; `choose()` deducts `cost` from `sim.money` and refuses unaffordable picks (deterministic, host-authoritative, same as level-ups). Solo and co-op both pause like a level-up.
- [ ] **Step 3: UI:** the card renderer shows `₽cost` under affordable cards, dims unaffordable ones, and titles the screen "Poké Mart stop". Reuse the existing card component; no new screen.
- [ ] **Step 4: Tests:** an elite-mode Sim killing the 3:00 boss enters the mart with four offers; a non-elite Sim does not; choosing an unaffordable card is a no-op; money is deducted on a purchase; two same-seed runs match.
- [ ] **Step 5:** commit `elite: Poké Mart stop after every boss`.

---

## Self-review

- Spec coverage: each of the nine research items in the previous message maps to one task (retry/near-miss A1, meta A2, ceremony A3, pitch A4, discovery A5, late power B1, card audit B2, base loop B3, mart stop B4).
- Type consistency: `RunSummary.xp/xpNext/nextBossAt/nextWaveAt/chestsOpened` (A1) are only read by `nearMissLines`; `UpgradeOffer.cost` (B4) is optional so every existing offer stays valid; `MAX_ITEM_LEVEL` 7 (B1) is read by B2's audit through `ownedUpgrades`.
- Measurement for every balance task is the existing pacing script plus the new cards script; the Raichu regression stays the gold and dead-card guard.
