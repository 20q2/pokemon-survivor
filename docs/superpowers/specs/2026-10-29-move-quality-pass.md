# Moves, Abilities & Items: Quality Pass (2026-10-29)

Goal: every move, ability and held item has a **purpose nobody else has**. A small amount
of overlap is allowed among the basic starter moves (the bread-and-butter bolt, chop or lash a line
starts with). Everything else must earn its slot. We also need more reasons for runs and
characters to feel different.

> **Status (2026-10-29):** Section C (all moves, statuses, verbs/uniqueness test) and per-move
> icons are implemented. Abilities (D5), items (D6), tags (D1), unions/Pledges (D2), Gym Badges
> (D4) and Move Tutor branching (D7) are not yet.

This doc has four parts: **(A)** an audit of what overlaps today, **(B)** what the genre does,
**(C)** a uniqueness contract plus a move-by-move redesign, and **(D)** systems for variety
between runs and between characters, with a phased roadmap.

---

## A. Audit: where the current kit overlaps

### A1. Moves (≈100, 15 behaviours)

Today a move is defined by its **behaviour** (shape) plus numbers. Most behaviours hold many
moves that differ only by type, power and cooldown:

| Behaviour | # | Moves | Verdict |
|---|---|---|---|
| melee arc | 12 | Tackle, Vine Whip, Karate Chop, Cross Chop, Blaze Kick, Leaf Blade, Wing Attack, Fury Cutter, Lick, Bite, Night Slash, Metal Claw | Same verb 12 times. Fine for 3–4 starter moves; too many beyond that |
| nova ring | 11 | Hyper Voice, Water Pulse, Discharge, Thunder Wave, Rock Smash, Magnitude, Bulldoze, Bug Buzz, Dark Pulse, Disarming Voice, Dazzling Gleam | Worst cluster |
| homing bolt | 8 | Swift, Magical Leaf, Aerial Ace, Aura Sphere, Shadow Sneak, Pursuit, Magnet Bomb, Draining Kiss | 7 of these say "never misses", which means nothing here because there is no accuracy stat |
| fan / multi-shot | 9 | Bullet Seed, Pin Missile, Poison Sting, Acid, Air Slash, Fairy Wind, Bubble, Pay Day, Ancient Power | |
| plain/fast bolt | 13 | Ember, Water Gun, Quick Attack, Aqua Jet, Mach Punch, Ice Shard, Mud-Slap, Mud Shot, Gust, Electro Ball, Shadow Ball, Psyshock, Dragon Rage, Dragon Pulse | Quick Attack, Aqua Jet, Mach Punch and Ice Shard are the same move |
| orbit | 6 | Rapid Spin, Flame Wheel, Petal Dance, Rollout, Twister, Gyro Ball | |
| beam | 6 | Solar Beam, Ice Beam, Aurora Beam, Psybeam, Night Shade, Flash Cannon | |
| aura | 5 | Spark, Confusion, Outrage, Sandstorm, Misty Terrain | |
| strike (random) | 5 | Thunderbolt, Sky Uppercut, Earth Power, Future Sight, Rock Slide | Future Sight uses the same 0.32 s delay as every other strike |
| zone | 5 | Fire Spin, Whirlpool, Leech Seed, Toxic Spikes, String Shot | |
| wave / cone / chain / lob / boomerang / trail | 4/3/3/2/2/1 | | Mostly fine |
| buff | 11 | Reflect = Iron Defense (both `shield`); Rest = Aqua Ring (both `heal`); Calm Mind ≈ Swords Dance ≈ Dragon Dance | Pairs that are literal duplicates |

**Masteries all work the same way.** Every mastery is "base move + this type's booster → a
bigger version of a move". Nothing transforms. Some pairings make no sense: Swift becomes
Hyper Beam (homing stars turn into a beam), and Mud-Slap becomes Earthquake.

**Descriptions that promise things the code doesn't do:**
- *Rollout* "gathering force" and *Fury Cutter*: no ramp exists. Both are plain orbit and melee.
- *Pursuit* "chases down fleeing foes": no fleeing check. It is a plain homing bolt.
- "Never misses" on 7 moves: there is no miss mechanic.
- *Future Sight* "moments later": same timing as Thunderbolt.
- *Dragon Dance* says "+25% Attack and move speed". The engine gives **every** `atk` buff +10%
  speed, so Swords Dance gets that speed as well without saying so ([stats.ts:96](../../../src/game/stats.ts#L96)).

### A2. Statuses: four of them are two effects

From [enemies.ts:312-314](../../../src/game/enemies.ts#L312-L314):
- **slow** sets speed ×0.55 and **paralyze** sets speed ×0.5. To a player these are the same status.
- **freeze** and **flinch** both set speed to 0 and both block elite telegraphs. The only
  difference is duration.
- **burn** and **poison** are both DoTs. Poison stacks, but that difference is invisible.

### A3. Items (38 in-run, 19 shop)

- **22 items are "+% damage"**: 18 type boosters, Muscle Band, Wise Glasses, Life Orb and Expert Belt.
- **The shop duplicates in-run items** under the same names: Wide Lens, Amulet Coin and Big Root.
  Lucky Punch ≈ Scope Lens, PP Up ≈ Quick Claw, Exp. Share ≈ Lucky Egg.
- **Leftovers ≈ Rain Dish** (both are flat regen).
- **King's Rock** (flinch) ≈ a weaker freeze.
- **Names that misrepresent the item:** Big Root is a drain booster in the games but here it is
  pickup range. Assault Vest is special-defence in the games but here it is max HP. Metronome is
  a consecutive-use booster but here it is duration. Quick Claw is "sometimes act first" but here
  it is flat cooldown.

### A4. Abilities (14)

- **Overgrow / Blaze / Torrent** are one template. This is acceptable as the starter trio, but they could carry a twist.
- **Guts** ≈ the same low-HP damage curve as the pinch abilities.
- **Magic Guard ≈ Sand Stream**: both are mostly flat damage reduction.
- **Static ≈ Synchronize**: both are "foes that touch you get a status and damage".
- **Unburden ≈ Speed Boost**: both are haste.
- **Rain Dish** duplicates Leftovers.
- Mega Evolution is the same stat bundle for all 12 Megas.

---

## B. Research: what the genre does with weapons

I reviewed the item/weapon design of Vampire Survivors, Brotato, Halls of Torment, HoloCure,
20 Minutes Till Dawn, Deep Rock Galactic: Survivor, Ball x Pit, Megabonk and Soulstone
Survivors (sources at the bottom). Each lesson below is followed by what we take from it.

**Vampire Survivors.** Every weapon has a distinct **targeting rule**, not just a distinct
shape. Whip hits facing, Knife fires in the move direction, Axe arcs upward, Cross boomerangs
to the nearest foe, Fire Wand hits a random foe, Runetracer bounces off screen edges, Clock
Lancet is a beam sweeping clockwise that freezes, Song of Mana is a vertical column, Laurel is
periodic invulnerability, and Peachone/Ebony Wings circle and bombard. Evolutions often
*change what a weapon does*: Garlic → Soul Eater heals, Whip → Bloody Tear lifesteals.
Some evolutions need two passives, and *unions* fuse two weapons. **Arcanas** are run-rule cards.
→ *Take: targeting rule as a first-class axis; transformational masteries; unions; run-rule cards.*

**Brotato.** Weapon **classes** grant set bonuses, characters are **constraints** (one weapon,
no healing, turrets only), there are structures and turrets, and many items carry a stated downside.
→ *Take: characters defined by rules, not just stats; items with trade-offs; constructs.*

**Halls of Torment.** Each ability has **branching traits**, and elites drop scrolls that unlock
ability-specific upgrades. Orbits and auras rank high because they need no aiming.
→ *Take: branching upgrades per move; the elite-drop beat.*

**HoloCure.** **Collabs** fuse two maxed weapons. **Stamps** attach modifiers to a weapon.
Each character has a signature special.
→ *Take: per-line signature moves; tag-based modifiers.*

**Deep Rock Galactic: Survivor.** Weapons carry **damage tags** (kinetic, fire, cold, acid,
electric), and stat upgrades target tags. **Overclocks** offer a choice of modifier at weapon
levels 6/12/18, and the "Unstable" overclocks come with explicit drawbacks.
→ *Take: tags; overclock-style variant picks at fixed move levels.*

**Ball x Pit.** Statuses (burn, freeze, bleed, dark…) **fuse** into emergent effects:
Burn + Light = Sun, Dark + Sun = Black Hole. Bleed is a stacking status that payoff balls
*consume*.
→ *Take: status combos and stack-consumers.*

**Megabonk.** Weapons scale on **unusual hooks**. Dice: rolling a 6 permanently raises crit.
Dexecutioner: executes low-HP foes. Black Hole: pulls. Flamewalker: a trail that scales with
attack speed. Aura: farms XP.
→ *Take: give each move its own scaling hook, not just a shape.*

**Soulstone Survivors.** **Tags** combined with an affinity mechanic that biases offers.
**Skill chains**: one skill auto-casts another.
→ *Take: tags; trigger moves ("when X happens, do Y").*

**General design writing** (Dead Cells and others): a weapon matters when it changes *how
you engage* (where you stand, what you prioritise), not when it does more damage.

### B1. Distilled: the axes a "weapon" can differ on

1. **Delivery / shape:** bolt, fan, ricochet, wall-bounce, boomerang, orbit, aura, nova,
   beam, sweeping beam, cone, stream, wave, sky strike, lob, ground zone, trail, chain, mine,
   wall/construct, decoy/summon, vortex, tether, dash, counter, on-kill trigger, delayed mark,
   charge-up, field (weather/terrain), self-stance.
2. **Targeting rule:** nearest, random, densest cluster, highest HP, lowest HP, farthest,
   facing, movement direction, fixed directions, whoever touches you.
3. **Scaling hook:** count/area (default), consecutive-hit ramp, run-long permanent growth,
   missing HP, damage taken recently, own speed, own slowness, money collected, % enemy HP,
   player level (flat), number of statused foes, number of buffs, standing still, moving,
   charge time, enemy density, empty item slots.
4. **Role:** damage, crowd control (stop, slow, pull, push, trap, charm), defence (shield,
   block, dodge, i-frames, projectile deletion), sustain, economy, mobility, co-op support.

Our 15 behaviours cover only axis 1, and only partly. Axes 2–4 are where nearly all the
untapped variety is, and **Pokémon's real move mechanics already map onto them.** Rollout
ramps. Fury Cutter ramps. Night Shade deals level-based damage. Counter retaliates.
Future Sight is delayed. Pursuit hunts. Gyro Ball rewards being slow. Pay Day makes money.
Leech Seed spreads. Substitute is a decoy. The Spikes moves are mines. Weather and terrain are fields.

---

## C. The uniqueness contract and the move redesign

### C1. Rules

1. **Each move has a `verb` (delivery + targeting) and a `hook` (what makes it scale or matter).**
   No two non-mastery moves may share both. A data test enforces this. Only moves in a short
   `BASIC` whitelist (the starter bolt, chop, lash and similar) may share the verb.
2. **A mastery transforms its move.** It changes the verb or adds a rule. A bigger number alone does not count.
3. **Each status has exactly one job** (C2).
4. **Each type has a personality** (C3). A type's moves explore it, so a type booster is a real build direction.
5. **Descriptions describe code.** Remove "never misses" and add no flavour text the engine doesn't do.
6. **Moves don't move or impair the player** *(user decision, 2026-10-29)*. No auto-dashes, leaps
   or steering wobble. The only exceptions are moves that are **unmistakable and worth it**: a loud,
   long wind-up with a clear on-screen cue, and a powerful payoff. Today that means Dig (burrow)
   and Rest (sleep). Each needs a big tell (dust cloud, "Zzz" bubble) and a payoff that justifies it.
7. **Status clarity** *(user decision)*: all 14 statuses ship. Each needs a distinct icon above the
   foe, a distinct tint or particle, and a one-line glossary in the pause menu and character
   sheet, so a new player can work out what happened.

### C2. Status identities

| Status | Job | Rule |
|---|---|---|
| **Burn** | spreading DoT | When a burning foe dies, it ignites nearby foes (wildfire) |
| **Poison** | stacking DoT (anti-tank) | Stacks up to 5 (exists). *Badly poisoned* (Toxic) ramps each tick. Venoshock detonates stacks |
| **Paralyze** | stutter + conduct | Full stop for 25% of the time in random blips, not a slow. Chain/electric moves jump 50% farther through paralysed foes |
| **Freeze** | hard stop + shatter | Full stop. The next hit **shatters** it for +50% damage and ends the freeze |
| **Chill** *(new, Ice)* | stacking slow → freeze | Each stack slows 15%. 3 stacks = Freeze |
| **Slow** | plain movement slow | Water / Ground / Bug. No damage rider |
| **Sleep** *(new)* | mass stop that damage breaks | Asleep until hit. The waking hit deals +100% (Dream Eater feel) |
| **Confuse** | friendly fire | Wanders randomly, and **collisions with other foes damage both** |
| **Flinch** | interrupt | Cancels or delays enemy *wind-ups* (ranged shots, elite telegraphs, boss raid attacks, chargers). It is not a movement stop |
| **Infatuate** *(new, Fairy)* | charm | Stops attacking players and walks away. 30% chance it attacks the nearest foe |
| **Vulnerable** *(new)* | armour break | Takes +25% damage |
| **Weaken** *(new)* | blind | Deals −30% damage |
| **Root** *(new)* | trap | Can't move but still attacks (ranged foes keep shooting, so Root is not Freeze) |
| **Wet** *(new)* | combo enabler | Electric +50% vs Wet. Ice on a Wet foe = instant Freeze. Fire on a Wet foe = steam burst (small AoE), which removes Wet |

Wet → Electric/Ice/Fire, Burn spread, Paralyze conduction and Freeze shatter create
**cross-type combos**, which is the Ball x Pit lesson in Pokémon terms. They also make
co-op teams with different types better than the sum of their parts.

### C3. Type personalities

| Type | Personality |
|---|---|
| Normal | utility, economy, mobility, the generalist |
| Fire | area denial and burn spread |
| Water | herding: push, pull, Wet |
| Grass | sustain and growth: drain, seeds, sleep, charge |
| Electric | chains, speed, paralysis conduction |
| Ice | control: chill → freeze → shatter |
| Fighting | close range, combos, counters, armour break |
| Poison | stacks, hazards, detonation |
| Ground | the floor: fissures, burrowing, quakes, gamble |
| Flying | wind: pierce, push, sniping, team speed |
| Psychic | manipulation: delay, reflect, buffs-as-damage |
| Bug | swarm: ramping multi-hit, minions, density |
| Rock | constructs and heavy hitters: walls, hazards, avalanches |
| Ghost | curses and rule-breakers: fixed damage, % HP, payoffs |
| Dragon | raw power with drawbacks: rage, rampage |
| Dark | opportunism: hunting the weak, crits on the disabled, stealing, interrupting |
| Steel | defence and weight: stances, heavy orbits, sticky bombs, run-long growth |
| Fairy | support: charm, ally healing, screen-wide light, terrain |

### C4. Move-by-move

Legend: **KEEP** = unchanged identity (may get number tweaks). **CHANGE** = new verb/hook,
same id. **NEW** = new move. **CUT** = removed (lines that learn it get a replacement).
**[B]** = basic whitelist (overlap allowed).

#### Normal: utility / economy / mobility
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Tackle [B] | facing melee shove | big knockback | KEEP |
| Quick Attack | **opener** bolt | ×2 damage to foes nobody has hit yet (rewards fresh waves) | CHANGE |
| Swift | **homing** stars | count. The game's *only* seeker | KEEP |
| Hyper Voice | nova | **Echo**: +15% power per consecutive cast, resets when you're hit | CHANGE |
| Rapid Spin | shield orbit | **destroys enemy projectiles** it touches; brief speed burst after each spin | CHANGE |
| Pay Day | coin fan | damage grows with Poké Dollars collected this run (log curve). Keeps coin drops | CHANGE |
| Substitute | **decoy** doll | costs 10% HP; taunts foes for 4 s | NEW (TM) |
| Metronome | random | casts a random move from the whole movedex each time | NEW (TM) |
| Hidden Power | orb volley | **type and status are rolled at run start** | NEW (TM) |
| Explosion | screen-scale nova | costs 33% current HP; huge damage | NEW (TM) |
| ★ Hyper Beam ← **Hyper Voice** | charge-free screen beam | then "must recharge" (long cooldown). Re-keyed from Swift | CHANGE |

#### Fire: area denial / burn spread
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Ember [B] | bolt | burn chance | KEEP |
| Flame Wheel | **body-as-weapon**: you are wreathed in fire while moving | contact damage scales with move speed (Torchic) | CHANGE (was orbit) |
| Fire Spin | **cage**: ring of fire around a cluster | foes inside are Rooted and burn | CHANGE |
| Flamethrower | **stream**: long, narrow, sustained jet that tracks its target | duration | CHANGE (vs Dragon Breath's short wide puff) |
| Heat Wave | screen-wide | low damage, **burns everything visible**: the spreader | CHANGE (was wave) |
| Blaze Kick | crit kick | **crits detonate the target's burn** for its remaining DoT at once | CHANGE |
| Will-O-Wisp | slow **wandering** wisps | guaranteed burn, no impact damage; burns last 2× | CHANGE |
| Sunny Day | **weather** | Fire +50%, Water −50%, Solar Beam needs no charge | NEW |
| ★ Fire Blast ← Ember | five-point star explosions | leave burning ground | KEEP |

#### Water: herding / Wet
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Water Gun [B] | bolt | knockback | KEEP |
| Bubble | **floating mines**: bubbles drift and linger | pop on contact, apply Slow + Wet | CHANGE |
| Surf | sweeping wave | push everything one way (herding) | KEEP |
| Whirlpool | **vortex** | **pulls** foes together for your AoE | CHANGE |
| Water Pulse | nova | applies **Wet** (the combo enabler) | CHANGE |
| Aqua Ring | ring at your feet | heals you **and allies standing in it**: a positional heal | CHANGE |
| Rain Dance | **weather** | Water +50%, Fire −50%, Thunder always strikes twice | NEW |
| Aqua Jet | — | duplicate of Quick Attack / Mach Punch | **CUT** (Dratini → Dragon Tail? See open questions) |
| ★ Hydro Pump ← Water Gun | sustained jet | shoves everything to the screen edge | CHANGE |

#### Grass: sustain / growth
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Vine Whip [B] | wide lash | — | KEEP |
| Razor Leaf | **ricochet**: leaves bounce foe to foe | high crit | CHANGE (Bonemerang keeps boomerang) |
| Leech Seed | mark | drains; **jumps to a neighbour when the host dies** | CHANGE |
| Bullet Seed | **stream** at one target | random 2–5 hits per burst (Skill Link item makes it always 5) | CHANGE |
| Leaf Blade | crit slash | **each crit refunds the cooldown** (crit chains) | CHANGE |
| Solar Beam | **charge-up**: 1.5 s visible charge, then a screen-long beam | instant in Sun | CHANGE |
| Petal Dance | **breathing orbit**: ring expands to screen edge and contracts | radius sweep | CHANGE |
| Sleep Powder | powder cloud | **Sleep** | NEW |
| Magical Leaf | — | 8th homing bolt | **CUT** (Sleep Powder replaces it for Bulbasaur; Synthesis-style choice for others) |
| ★ Power Whip ← Vine Whip | 4-way lash | — | KEEP |

#### Electric: chains / speed / conduction
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Thunder Shock [B] | chain | — | KEEP |
| Spark | **static charge**: builds while you move | next contact releases a big shock; scales with distance travelled | CHANGE |
| Thunderbolt | sky strike | **random foe on screen** (the game's only random targeting) | KEEP |
| Discharge | nova | **every paralysed foe in range relays an arc** to its neighbours | CHANGE |
| Thunder Wave | screen-wide | paralysis only, zero damage, long cooldown | CHANGE |
| Electro Ball | **wall-bouncer**: bounces off screen edges | faster you = harder hit (exists) | CHANGE |
| Electric Terrain | **terrain** zone | allies standing in it recharge 30% faster | NEW |
| ★ Thunder ← Thunder Shock | chain | every chained foe also gets a lightning strike | CHANGE |

#### Ice: chill → freeze → shatter
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Powder Snow [B] | flurry around you | Chill stacks | CHANGE (frees up the cone) |
| Ice Shard | fast shard | **×3 vs Frozen and shatters it**, flinging shards outward | CHANGE |
| Icy Wind | wave | Chill on everything it crosses | KEEP |
| Ice Beam | **sweeping beam** that rotates around you | Freeze | CHANGE |
| Sheer Cold | execute | **instantly KOs Frozen non-elite foes** in range (OHKO-move fantasy) | NEW |
| Snowscape | **weather** | Chill on all foes over time; Ice +30% | NEW |
| Aurora Beam | — | duplicate of Ice Beam | **CUT** |
| ★ Blizzard ← Powder Snow | huge aura | — | KEEP |

#### Fighting: close range / combos / counters
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Karate Chop [B] | chop | high crit | KEEP |
| Mach Punch | **jab flurry** at very short range | highest single-target DPS if you stay close | CHANGE |
| Rock Smash | short nova | **Vulnerable** | CHANGE |
| Cross Chop | **trigger**: every 5th hit from *any* of your moves calls a Cross Chop on that foe | your hit rate | CHANGE (skill-chain idea) |
| Sky Uppercut | launcher | launches the nearest foes into the air (stunned); they crash down as AoE | CHANGE |
| Aura Sphere | seeker | **targets the highest-HP foe** in view (elite/boss hunter) | CHANGE |
| Counter | **counter** | when hit by contact, deal 2× the damage to adjacent foes | NEW |
| Focus Punch | **charge** 2 s | fires only if you weren't hit during the charge | NEW (TM) |
| ★ Dynamic Punch ← Karate Chop | exploding punches | guaranteed Confuse | KEEP |

#### Poison: stacks / hazards / detonation
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Poison Sting [B] | needles | poison stacks | KEEP |
| Smog | **trail** behind you | the only trail | KEEP |
| Sludge Bomb | lob | leaves a poison puddle | CHANGE |
| Toxic | chain | **Badly Poisoned** (ramps each tick) | CHANGE |
| Toxic Spikes | **mines** in a ring around you | poison on step | CHANGE |
| Venoshock | bolt | **detonates poison stacks** for burst (payoff) | NEW |
| Acid | — | fan duplicate | **CUT** |
| ★ Gunk Shot ← Poison Sting | garbage bombs | — | KEEP |

#### Ground: the floor
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Mud-Slap [B] | bolt | **Weaken** (foes hit deal −30%) | CHANGE |
| Magnitude | nova | **gamble**: rolls 4–10, and a 10 is huge (shown on screen) | KEEP (show the roll) |
| Bulldoze | **fissure**: an eruption line travels along the ground toward a foe | Slow | CHANGE |
| Earth Power | eruption | **targets the densest cluster** | CHANGE |
| Bonemerang | boomerang | hits twice (true today) | KEEP |
| Dig | **burrow**: a 0.6 s dig wind-up with a dust cloud, then 1.5 s underground (invulnerable; you still steer; no other moves fire) | a huge eruption where you surface. Allowed under rule C1.6: loud wind-up, big payoff | NEW |
| Mud Shot | — | duplicate of Mud-Slap | **CUT** |
| ★ Earthquake ← **Magnitude** | screen quake | — | re-keyed from Mud-Slap |

#### Flying: wind
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Gust [B] | wandering whirlwind | plows through | KEEP |
| Wing Attack [B] | two-sided melee | — | KEEP |
| Air Slash | fan | **infinite pierce** (flinch moves to Dark) | CHANGE |
| Aerial Ace | **sniper** | targets the **farthest** foe in view; always crits | CHANGE |
| Whirlwind | nova | **the repel**: hurls everything away, ejects elites | NEW |
| Tailwind | team field | allies' move speed and projectile speed/range | NEW |
| ★ Hurricane ← Gust | homing tornadoes | — | KEEP |

#### Psychic: manipulation
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Confusion [B] | aura | Confuse | KEEP |
| Psybeam | beam | Confuse. The reference beam | KEEP |
| Stored Power | piercing orbs | **+1 orb and +20% per active buff** on you | NEW (replaces Psyshock) |
| Future Sight | **delayed mark** on the densest cluster | detonates 2.5 s later for huge damage | CHANGE |
| Calm Mind | stance | Sp. Atk window | KEEP |
| Reflect | **team** barrier | allies within range take −50% *projectile* damage | CHANGE |
| Mirror Coat | **counter** | reflects enemy projectiles back at 2× | NEW |
| Psyshock | — | redundant pierce bolt | **CUT** |
| ★ Psychic ← Confusion | vast field | — | KEEP |

#### Bug: swarm
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| String Shot | silk cone | **Root** | CHANGE |
| Pin Missile | volley | **pins stick**; each embedded pin +10% to later pins on that foe | CHANGE |
| Fury Cutter | slash | **ramp**: +50% per consecutive hit, resets after 1 s without one | CHANGE (make the desc true) |
| Bug Buzz | nova | **density**: +6% damage per foe caught in the ring | CHANGE |
| Infestation | **minion swarm** | hovers on a foe, hops to the next when it dies | NEW |
| ★ Megahorn ← Pin Missile | horn barrage | — | KEEP |

#### Rock: constructs / heavy
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Rock Throw [B] | lob | splits into shards | KEEP |
| Rock Slide | **avalanche lane**: a band of boulders sweeps across the screen | Flinch | CHANGE |
| Rollout | orbit | **ramp**: +power per hit, resets after a miss | CHANGE (make the desc true) |
| Ancient Power | 360° burst | each hit has a small chance to grant +5% all stats for the run (capped) | CHANGE |
| Sandstorm | **weather** | chips non-Rock/Ground/Steel foes on screen; Rock users take −15% | CHANGE (was aura) |
| Stealth Rock | **hazards** floating around you | deal **% max HP** on contact (anti-elite) | NEW |
| Rock Tomb | **wall** construct | rock pillars that block enemies | NEW |
| ★ Stone Edge ← Rock Throw | stone rings | — | KEEP |

#### Ghost: curses / rule-breakers
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Lick [B] | melee | Paralyze | KEEP |
| Night Shade | beam | **fixed damage = your level × k**; ignores type and resistances | CHANGE |
| Shadow Ball | slow, huge orb | infinite pierce | KEEP |
| Hex | chain | ×2 vs **any** status (the universal payoff) | KEEP |
| Shadow Sneak | **interceptor** | instantly hits the foe about to touch you | CHANGE |
| Curse | mark | pay 8% HP: strongest foe loses 2% max HP/s until it dies (boss tool) | NEW (replaces Ominous Wind) |
| Ominous Wind | — | wave duplicate | **CUT** |
| ★ Shadow Force ← Night Shade | vanish (i-frames) → strikes everywhere | — | KEEP |

#### Dragon: power with drawbacks
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Twister [B] | orbit that **flings outward** | Flinch | CHANGE |
| Dragon Rage | bolt | **rage**: damage = 2× the damage you took in the last 5 s | CHANGE |
| Dragon Breath | short wide **puff** cone | Paralyze | KEEP |
| Dragon Pulse | traveling pulse | **explodes periodically along its path** | CHANGE |
| Outrage | **rampage**: 5 s huge aura + speed | then **exhaustion**: your other moves pause for 2 s (no steering penalty) | CHANGE |
| Dragon Dance | stance | **stacking** Atk + speed (max 3); lose a stack when hit | CHANGE |
| ★ Draco Meteor ← Twister | comets | each cast: −10% Sp. Atk for 5 s, stacking (drawback) | CHANGE |

#### Dark: opportunism
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Bite [B] | melee | Flinch | KEEP |
| Pursuit | **hunter** | targets the **lowest-HP%** foe; ×2 vs foes moving away | CHANGE (make the desc true) |
| Dark Pulse | nova | **Flinch everything**: interrupts all wind-ups nearby | CHANGE |
| Night Slash | slash | **always crits Statused foes** | CHANGE |
| Thief | bolt | hits may steal candy or berries; elites drop an extra item | NEW |
| ★ Crunch ← Bite | phantom jaws | — | KEEP |

#### Steel: defence / weight
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Metal Claw [B] | melee | **run-long growth**: 10% chance per hit of +1% Atk (cap +30%) | CHANGE |
| Flash Cannon | beam | **refracts into 3** on its first hit | CHANGE |
| Gyro Ball | heavy orbit | slower you = harder hit | KEEP |
| Magnet Bomb | **sticky bombs** latch on | detonate 1.5 s later | CHANGE |
| Iron Defense | **stance** | −60% contact damage while standing still or moving slowly | CHANGE |
| ★ Meteor Mash ← Metal Claw | comet punches | — | KEEP |

#### Fairy: support
| Move | Verb | Hook / rule | Status |
|---|---|---|---|
| Fairy Wind [B] | fan | — | KEEP |
| Disarming Voice | nova | **Infatuate** | CHANGE |
| Draining Kiss | homing kiss | heals the **most-hurt ally** (you, solo) | CHANGE |
| Dazzling Gleam | **screen flash** | hits everything visible; long cooldown | CHANGE |
| Misty Terrain | **terrain** zone | allies inside immune to status and take −20%; foes inside Slowed | CHANGE |
| ★ Moonblast ← Fairy Wind | moon bombs | — | KEEP |

#### Universal TMs (status)
Swords Dance (big Atk window), Agility (self haste), Double Team (dodge), **Rest** (heals 40%,
but you *fall asleep* 1.5 s and can't move. It gets a big "Zzz" tell, which makes it distinct from Aqua Ring; see rule C1.6), Focus Energy
(crit), **Protect** *(new: every 10 s, fully block the next hit, like VS's Laurel)*, plus the
NEW TMs above (Substitute, Metronome, Hidden Power, Explosion, Focus Punch). Iron Defense
(stance) and Reflect (team projectile barrier) are no longer duplicates.

**Net:** about 8 cuts and about 25 new moves, ending around 120 moves. Each has a unique
verb + hook pair, except the ~18 basics.

### C5. Engine primitives the redesign needs

Most of the redesign is data. These are the new capabilities, roughly in order of how many moves they unlock:

1. **Targeting rules** as a field (`nearest | random | densest | highestHp | lowestHp | farthest | facing | contact`).
2. **Per-move state**: a ramp counter (Rollout, Fury Cutter, Hyper Voice, Dragon Dance), a charge timer (Solar Beam, Focus Punch, Spark) and a run-long accumulator (Metal Claw, Ancient Power, Pay Day).
3. **New shapes**: ricochet, wall-bounce, vortex (pull), sweeping beam, stream, cage, fissure line, lane sweep, sticky bomb, delayed mark.
4. **Triggers**: on-hurt (Counter, Mirror Coat), on-kill (Burn spread, Leech Seed hop, Ice Shard shatter), on-Nth-hit (Cross Chop), on-crit (Leaf Blade, Blaze Kick).
5. **Player-side verbs**: i-frames (Dig, Shadow Force), body contact damage (Flame Wheel), stances (Iron Defense), plus the wind-up tell system rule C1.6 requires.
6. **Field entities**: weather (global, one at a time, shared in co-op), terrain zones, hazards/mines, walls, decoys, minions.
7. **New statuses** per C2, with icons above enemies (pokesprite has status-condition badges).
8. **Move tags** (D1).

---

## D. Variety between runs and between characters

### D1. Move tags (Pokémon's real move flags)

The real games already tag moves: **punch, bite, slicing, sound, pulse, ball/bomb, wind,
powder, dance, contact**. Abilities and items key off these tags: Iron Fist, Strong Jaw,
Sharpness, Punk Rock, Mega Launcher, Dancer, Wind Rider. This gives **cross-type build
directions**, so a "punch build" with Mach Punch, Dynamic Punch, Meteor Mash and Sky Uppercut
spans Fighting and Steel. That is our version of DRG/Soulstone tags.

New tag items: **Punching Glove** (punch), **Throat Spray** (sound), **Mega Launcher Scope**
(pulse/ball; working name), plus one per remaining tag. A tag *affinity* mechanic can make
offers lean toward your tags once you own 2+ moves with the same tag.

### D2. Masteries become transformations; add Unions

- Every mastery changes the move's verb or adds a rule (see ★ rows above). Re-key nonsense
  pairs: Hyper Beam ← Hyper Voice, Earthquake ← Magnitude.
- **Second catalyst types.** Some masteries should take a non-booster item, as in VS where
  evolutions need varied passives (Thunder ← Thunder Shock + **Magnet**; Solar Beam's evolution
  ← **Heat Rock**/Sunny Day…). Then non-booster items matter for evolution too.
- **Unions** (VS unions / HoloCure collabs / Ball x Pit fusions), using two maxed moves:
  - **Pledges (co-op):** the six starter lines each get a Pledge move. When two players'
    Pledges overlap you get **Sea of Fire** (Fire+Grass: burning field), **Rainbow**
    (Fire+Water: crit field) or **Swamp** (Grass+Water: slowing field). This is a co-op-only
    dopamine beat that is faithful to the games.
  - **Solo unions** from status combos: e.g. Whirlpool + Discharge → *Thunder Cage*
    (vortex that electrifies Wet foes it pulls in). Keep the list small and hand-made.

### D3. Weather & terrain as run-shaping fields

Weather is global and only one can be active at a time, so in co-op players can **fight over
it or coordinate it**. Each stage can also have a **default weather** (desert = Sandstorm,
ice cave = Snowscape) that changes which types and lines are good there, adding route-specific
variety on top of the existing effectiveness weighting.

### D4. Gym Badges (run-rule cards, our version of VS Arcanas)

The game already has a boss every 3 minutes. After each boss, **choose 1 of 3 Badges**, each
a rule change for the rest of the run. This is a big VS-style dopamine beat. Examples:

| Badge | Rule |
|---|---|
| Boulder | Knockback deals damage when foes collide |
| Cascade | All your water-type hits apply Wet |
| Thunder | Critical hits chain to one extra foe |
| Rainbow | Drain/lifesteal overflow becomes a shield |
| Soul | Poison never expires |
| Marsh | Every 4th cast of any move is a delayed double (Future Sight) |
| Volcano | Burns spread on *every* tick, not only on death |
| Earth | Hazards and walls last 2× |
| Zephyr | Projectiles bounce off the screen edges once |
| Hive | Each move's *first* hit on a foe counts double |

Collect badges for achievements (all 8 Kanto badges, etc.) and unlock new badge pools per region.

### D5. Characters: rules, not stats

**Abilities: each one is a rule.**

| Line | Today | Proposed |
|---|---|---|
| Bulbasaur | Overgrow | Overgrow: pinch boost **and drain heals 2× in pinch** |
| Charmander | Blaze | Blaze: pinch boost **and your burns spread on hit in pinch** |
| Mudkip | Torrent | Torrent: pinch boost **and knockback doubles in pinch** |
| Squirtle | Rain Dish (= Leftovers) | **Shell Armor**: blocks one hit every 8 s, shown as a shell icon |
| Pichu | Static | Static (keep: the contact-retaliation ability) |
| Gastly | Levitate | Levitate: **immune to ground telegraphs, boss quakes and ground hazards**; −contact damage |
| Machop | Guts (≈ pinch) | Guts: **+8% damage per hit taken in the last 5 s** (stacks to 10) |
| Abra | Magic Guard (flat DR) | Magic Guard: **immune to all indirect damage** (DoT, hazards, recoil, Life Orb, Explosion cost) |
| Dratini | Multiscale | keep |
| Eevee | Adaptability | keep |
| Treecko | Unburden (≈ haste) | Unburden: **+12% speed and attack rate per *empty* held-item slot**. A constraint build, like Brotato characters |
| Torchic | Speed Boost | keep |
| Larvitar | Sand Stream (+DR) | Sand Stream: **permanent Sandstorm**. Drop the flat DR |
| Ralts | Synchronize (≈ Static) | **Trace**: after each boss, copies another line's ability at random (co-op: copies a teammate's) |

**Signature moves.** Each line gets one move no other line can learn, available from its final
form, like HoloCure's character specials. For example: Volt Tackle (Pikachu line: a crackling bolt line from you to the target that costs recoil HP; you stay put),
Blast Burn / Frenzy Plant / Hydro Cannon (Kanto starters, the "must recharge" ultimates), Last
Resort (Eevee: only fires after your other three moves fire), Leaf Storm (Sceptile), Muddy Water
(Swampert), Extreme Speed (Dragonite), Mega-flavoured moves for Gengar, Alakazam, Tyranitar and
Gardevoir.

**Mega Evolution gets an identity.** Today all 12 Megas are one stat bundle. Give each a rule
for its duration. Mega Charizard X: all fire moves become Dragon-type and burns spread. Mega
Gengar: Shadow Tag, so foes near you can't move away. Mega Alakazam: all cooldowns halved.
Mega Blastoise: all bolts gain Mega Launcher pulses. Mega Gardevoir: Infatuate on every hit.
And so on.

**Constraint challenges** (Brotato characters, achievements). Monotype run, "no held items",
"one move only" (all level-ups go into a single move), "Nuzlocke" (no revives, permadeath in co-op).

### D6. Items: one job each

**Categories:** *Stat* (exactly one item per stat), *Rule* (changes behaviour, often with a
trade-off), *Trigger* (on-hit, on-kill, on-hurt), *Economy*, *Catalyst* (type boosters).

| Fix | Change |
|---|---|
| Shop ≠ items | Rename shop entries so none shares a held item's name or job. Example: shop "Wide Lens" → **Expansion Pak**-style meta names or the real "Power" items (Power Lens = area, Power Band…). Shop Lucky Punch, PP Up and Exp. Share keep their names, but held items stop duplicating them (see below) |
| Big Root | → **drain/healing-from-moves +30%** (true to the games). Pickup range moves to a new key item (e.g. **Magnet Pull**/**Dowsing Machine**) |
| Quick Claw | → **chance to instantly recast** (double cast). Flat cooldown stays on the meta shop (PP Up) and the vitamin |
| Metronome (item) | → **consecutive-use ramp**: +damage for the move that has fired most recently in a row. Duration → **Light Clay**: buffs, terrains, hazards and walls last longer (the status-move build item) |
| Assault Vest | → **−30% projectile damage, but you can't learn status moves** (true to the games, a rule with a trade-off). Max HP → plain **HP Up** vitamin and Sitrus Berry |
| King's Rock | keep: flinch is an interrupt now, so it has a job |
| Leftovers vs Rain Dish | resolved by Shell Armor |
| Choice Scarf | → **Choice items**: Band/Specs/Scarf give +50% to your *highest-level* move and −20% to the others |
| **New Rule items** | Focus Sash (survive once at full HP), Eject Button (when hit, blast nearby foes away; 10 s cd), Air Balloon (immune until first hit each wave), Flame Orb/Toxic Orb (self-status, pairs with Guts), Iron Ball (−speed, +Gyro/heavy), Zoom Lens (+dmg vs far foes, pairs with snipers), Binding Band (Root/cage/vortex last longer), Grip Claw, Weather rocks (Heat/Damp/Smooth/Icy Rock: weather lasts 2×), Terrain Extender, Skill Link (multi-hit always max), Loaded Dice (keep: +count), Big Root (drain), Shell Bell (keep), Weakness Policy (super-effective hits *taken* → Atk/SpA spike) |
| **Tag items** | Punching Glove, Throat Spray, etc. (D1) |
| Type boosters | keep as catalysts. Offers already suppress off-type ones; keep that |

### D7. Branching upgrades ("Move Tutor", later phase)

At move Lv 4 and Lv 7, instead of a flat stat, choose 1 of 2 variants, like DRG overclocks and
Halls of Torment traits. For example, Ember Lv 4: *Split* (each ember splits in 3 on hit) or
*Seeker* (homing). This doubles the build space without new moves. It is a later phase: it
multiplies balance work, so land the uniqueness pass first.

---

## E. Roadmap

| Phase | Work | Risk |
|---|---|---|
| **0. Honesty pass** | Fix descriptions that lie (A1). Re-key Hyper Beam/Earthquake masteries. Separate Swords Dance from the +speed rider. Cut the 6 pure duplicates. Rename Big Root / Metronome / Assault Vest / Quick Claw to true-to-game jobs. Make shop names distinct from held items | low, data-only |
| **1. Status identities** | Paralyze stutter, freeze shatter, flinch = interrupt (requires wind-up states, which elites/ranged/bosses already have), burn spread, confuse friendly fire; then the new statuses (Wet, Chill, Sleep, Vulnerable, Weaken, Root, Infatuate) with icons | medium |
| **2. Primitives + `verb`/`hook` fields** | C5 items 1–5. Add `verb` and `hook` to `MoveDef`, plus a **data test that fails if two non-basic moves share both** | medium |
| **3. Move pass by type** | Implement C4 one type per commit, with a Playwright screenshot per new verb | medium, parallelisable per type |
| **4. Fields & entities** | weather, terrain, hazards, walls, decoys, minions | medium-high |
| **5. Characters** | abilities rework, signature moves, Mega identities | medium |
| **6. Items** | D6, tags (D1) | medium |
| **7. Run variety** | Gym Badges, unions/Pledges, constraint challenges | medium |
| **8. Move Tutor branching** | D7 | high (balance) |

`scripts/balance.ts` should be extended to report per-move DPS **and** a utility score
(CC-seconds, healing, projectiles deleted), so CC and support moves aren't judged on damage alone.

---

## F. Decisions (user, 2026-10-29)

1. **Self-movement / self-impairing moves: no**, unless the move is unmistakable (big wind-up, big
   payoff). Recorded as rule C1.6. Quick Attack became an "opener" bolt, Outrage's drawback
   became exhaustion, Volt Tackle and Eject Button no longer move you, and Dig and Rest stay with loud tells.
2. **All 14 statuses ship**, gated on clarity (rule C1.7).
3. **Gym Badges after each boss: yes.**

Still open: replacements for cut moves in learnsets (e.g. Dratini loses Aqua Jet). Default:
pick the closest on-theme move from C4 when implementing, and note it in the commit.

---

## Sources

- Vampire Survivors weapons and evolutions: [Pocket Tactics](https://www.pockettactics.com/vampire-survivors/weapons), [GGRecon](https://ggrecon.com/guides/vampire-survivors-weapon-evolution), [Prima Games](https://primagames.com/gaming/vampire-survivors-weapon-evolution-guide)
- Brotato weapons and classes: [earlyguides](https://earlyguides.pages.dev/brotato/weapons), [Gamepressure](https://www.gamepressure.com/newsroom/brotato-weapon-list/zb4b14)
- Halls of Torment abilities: [Pro Game Guides](https://progameguides.com/halls-of-torment/halls-of-torment-ability-tier-list-best-abilities-for-each-character/), [Prima Games](https://primagames.com/tips/halls-of-torment-ability-tier-list-best-abilities-listed)
- HoloCure stamps and collabs: [Prima Games](https://primagames.com/gaming/holocure-stamps-tier-list), [Samurai Gamers](https://samurai-gamers.com/holocure/marking-stamp-guide/)
- 20 Minutes Till Dawn synergies: [wiki](https://20-minutes-till-dawn.fandom.com/wiki/Synergies), [ScreenRant](https://screenrant.com/20-minutes-till-dawn-synergies-upgrade-combos-guide/)
- Deep Rock Galactic: Survivor overclocks: [DRG wiki](https://deeprockgalactic.wiki.gg/wiki/Survivor:Overclocks), [Prima Games](https://primagames.com/gaming/how-to-get-and-use-overclock-weapons-in-deep-rock-galactic-survivor)
- Ball x Pit evolutions: [Dexerto](https://www.dexerto.com/wikis/ball-x-pit/all-evolution-recipes-combinations), [PCGamesN](https://www.pcgamesn.com/ball-x-pit/evolutions-tier-list), [Common Sense Gamer](https://commonsensegamer.com/ball-x-pit-best-evolutions-tier-list/)
- Megabonk weapons: [Prima Games](https://primagames.com/tips/megabonk-weapons-tier-list), [Deltia's Gaming](https://deltiasgaming.com/?p=355248)
- Soulstone Survivors tags and skill chains: [wiki](https://soulstone-survivors.fandom.com/wiki/Skill_Chain), [gameplay.tips](https://gameplay.tips/guides/soulstone-survivors-how-to-get-the-desired-active-skills-with-skill-affinity-skill-mastery.html)
- Weapon-variety design: [Game Developer: Dead Cells' 50 weapons](https://www.gamedeveloper.com/design/designing-each-of-the-50-weapons-in-i-dead-cells-i-to-feel-distinctive), [bugnet.io](https://bugnet.io/blog/how-to-design-weapon-variety-that-matters)
