/**
 * Sound effects written as tiny MML scores (see mml.ts) and played on the same chip voices as the
 * music: pulse channels with duty cycles and envelopes, the stepped triangle, LFSR noise drums,
 * stereo buses and the room reverb. All phrases are original.
 *
 * `bpm` sets the speed of the phrase; most use l32/l64 runs so a whole effect lasts well under a
 * second. Callers can transpose a phrase (chest reels, wobbles) without a separate score.
 */
export interface SfxDef {
  bpm: number;
  p1?: string;
  p2?: string;
  tri?: string;
  noise?: string;
  /** Overall level multiplier (defaults to 1). */
  vol?: number;
}

export const SFX: Record<string, SfxDef> = {
  // ── menus ──
  click: { bpm: 240, p1: 'o6 l64 @2 E1 v7 g', vol: 2.6 },
  select: { bpm: 240, p1: 'o5 l32 @1 E1 v10 b > e16', p2: 'o4 l32 @2 E1 v5 r32 g+16', vol: 1.8 },
  buy: { bpm: 200, p1: 'o5 l32 @1 E1 v11 e g > c8', p2: 'o5 l32 @2 E1 v6 r32 c e g8', tri: 'o3 l32 r16 c8' },
  error: { bpm: 180, p1: 'o3 l32 @2 E0 v9 c+16 r32 c+16', tri: 'o2 l32 c+16 r32 c+16' },

  // ── pickups ──
  coin: { bpm: 220, p1: 'o6 l64 @2 E1 v9 b > e8', p2: 'o6 l64 @1 E1 v4 r32 b > e16', vol: 2.0 },
  heal: { bpm: 180, p1: 'o5 l32 @1 E2 v9 c e g > c e8', p2: 'o4 l32 @2 E1 v5 r32 g > c e g8', tri: 'o3 l8 c' },
  repel: { bpm: 160, p1: 'o6 l64 @3 E1 v10 c < b a g f e d c < b a g f e d c', noise: 'v11 x4', tri: 'o2 l8 c' },

  // ── combat ──
  hurt: { bpm: 200, p1: 'o4 l64 @2 E1 v11 a f d < a f', noise: 'v10 s16', tri: 'o2 l32 a', vol: 1.3 },
  // Lub-dub: two low kick thumps on the noise channel (the kick drum is a triangle tone), quiet; the cadence is set by the caller.
  heartbeat: { bpm: 200, noise: 'v7 k8 r16 v5 k8', vol: 0.9 },
  // Rising fourth, bright and short: a cheerful minute marker, not an alarm.
  wave: { bpm: 180, p1: 'o5 l16 @0 E1 v10 c f8', p2: 'o5 l16 @0 E1 v5 r16 > c8', vol: 1.5 },
  warn: { bpm: 160, p1: 'o5 l16 @1 E1 v10 e r16 e', p2: 'o4 l16 @2 E1 v6 a r16 a', vol: 1.7 },
  faint: { bpm: 140, p1: 'o5 l32 @2 E1 v10 c < a f d c < a f d4', tri: 'o3 l16 c < a f d4' },
  revive: { bpm: 170, p1: 'o4 l32 @1 E2 V2 v9 c g > c e g > c4', tri: 'o3 l16 c g > c4', noise: 'v5 r16 p8' },
  shiny: { bpm: 200, p1: 'o7 l64 @0 E1 v8 c e g > c', p2: 'o7 l64 @0 E1 v4 r32 c e g > c', vol: 2.2 },
  raid: { bpm: 210, p1: 'o3 l64 @3 E0 v9 c c+ d d+ e f f+ g g+ a a+ b > c c+ d d+ e f f+ g g+ a a+ b > c', tri: 'o2 l64 c c+ d d+ e f f+ g g+ a a+ b > c c+ d d+ e f f+ g g+ a a+ b > c' },
  boss: {
    bpm: 84,
    p1: 'o4 l8 @3 E0 v11 a e a e',
    p2: 'o4 l8 @1 E0 v6 c+ < b > c+ < b',
    tri: 'o2 l8 a e a e',
    noise: 'v11 k8 k8 k8 v12 x8',
  },

  // ── progression ──
  levelup: {
    bpm: 168,
    p1: 'o5 l32 @1 E2 V2 v12 d g b > d ^16 c+ d8.',
    p2: 'o4 l32 @2 E1 v7 b > d g b ^16 a b8.',
    tri: 'o3 l16 g d g8.',
    noise: 'v7 h32 h32 h16 s16 v8 x8',
  },
  evolve: {
    bpm: 136,
    p1: 'o4 l16 @1 E1 v8 c c+ d d+ e f f+ g g+ a a+ b > c c+ d d+ e f f+ g g+ a a+ b',
    p2: 'o4 l16 @0 E1 v4 g g+ a a+ b > c c+ d d+ e f f+ g g+ a a+ b > c c+ d d+ e f f+',
    tri: 'o2 l4 c ^ ^ g ^ > c',
  },
  evolved: {
    bpm: 150,
    p1: 'o5 l16 @1 E2 V3 v12 c e g > c < g > c e4. ^8',
    p2: 'o4 l16 @2 E2 v7 g > c e g e g > c4. ^8',
    tri: 'o3 l8 c g > c4. ^8',
    noise: 'v8 k8 h16 h16 s8 h16 h16 v10 x4.',
  },
  chest: {
    bpm: 160,
    p1: 'o5 l32 @1 E1 v11 g > c e g c e g > c8',
    p2: 'o5 l32 @2 E1 v6 r32 e g > c e < g > c e8',
    tri: 'o3 l16 c g > c8',
  },
  mastery: {
    bpm: 150,
    p1: 'o5 l16 @0 E2 V2 v11 (c e g) (d f+ a) (e g+ b) > (c e g)4.',
    p2: 'o6 l32 @1 E1 v6 c g e > c < d a f+ > d < e b g+ > e c4',
    tri: 'o3 l16 c d e > c4.',
    noise: 'v6 h16 h16 h16 v10 x4.',
  },
  mega: {
    bpm: 128,
    p1: 'o4 l32 @0 E1 v8 c e g b > c e g b > c e g b > c e g b r16 < < V3 E2 v12 (c e g)2',
    p2: 'o4 l32 @1 E1 v4 r64 c e g b > c e g b > c e g b > c e g b r16 < < E2 v7 c2',
    tri: 'o2 l4 c c c c8 r16 c2',
    noise: 'v4 h16 h16 h16 h16 h16 h16 h16 v12 x2',
  },

  // ── treasure ──
  wobble: { bpm: 220, p1: 'o4 l64 @3 E1 v8 c < g', noise: 'v6 h64', vol: 1.8 },
  pop: { bpm: 220, p1: 'o5 l64 @1 E1 v10 g b > d', vol: 1.6 },
  tick: { bpm: 240, p1: 'o6 l64 @1 E1 v6 c', vol: 2.6 },
  ding: { bpm: 200, p1: 'o5 l32 @0 E1 v10 g > d g8', p2: 'o5 l32 @0 E1 v4 r32 g > d g16', vol: 1.6 },
  reveal: { bpm: 170, p1: 'o5 l32 @2 E2 v10 c e g > c8', p2: 'o4 l32 @1 E2 v6 g > c e g8', noise: 'v10 x8', vol: 1.4 },

  // ── run end ──
  victory: {
    bpm: 150,
    p1: 'o5 l16 @1 E2 V3 v12 c e g8 f16 e d8 e16 f g > c2',
    p2: 'o4 l16 @2 E2 v7 g > c e8 d16 c < b8 > c16 d e g2',
    tri: 'o3 l8 c c c c < g g > c2',
    noise: 'v8 s16 s16 s8 k8 h8 k8 h8 v10 x2',
  },
  gameover: {
    bpm: 96,
    p1: 'o5 l8 @2 E2 V2 v10 d c+ c < b g2',
    p2: 'o4 l8 @1 E2 v5 f e d+ d < b2',
    tri: 'o2 l8 g g g g < g2',
  },
};
