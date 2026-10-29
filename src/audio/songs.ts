/**
 * Hand-composed original chiptune scores (MML, see mml.ts). Each song was planned first
 * (key, form, bar-by-bar harmony), then written channel by channel in the style of the
 * Game Boy era: pulse lead with delayed vibrato, a second pulse for arpeggiated chords,
 * stabs or an echo of the lead, a triangle bass, and noise-channel drums.
 */

export type Mode = 'major' | 'minor' | 'harmonic' | 'dorian' | 'mixolydian';

export interface SongDef {
  title: string;
  bpm: number;
  /** Tonic pitch class (0 = C) and mode, used by the tests to keep melodies in key. */
  key: [number, Mode];
  macros?: Record<string, string>;
  p1: string;
  p2: string;
  tri: string;
  noise: string;
  /** Second pulse plays a quieter, delayed copy of the lead (the classic chip "echo" trick). */
  echo?: { delay: number; vol: number };
}

// ───────────────────────────── Title: "Survivors' March" (D major) ─────────────────────────────
// Form: fanfare intro (2) | A (8) A' (8, with a bVI-bVII lift) B (8, legato bridge)
const title: SongDef = {
  title: "Survivors' March", bpm: 138, key: [2, 'major'],
  macros: {
    sD: 'q5 (d f+ a)4 (d f+ a)8 (d f+ a)8 r8 (d f+ a)8 (d f+ a)4 q7',
    sG: 'q5 (d g b)4 (d g b)8 (d g b)8 r8 (d g b)8 (d g b)4 q7',
    sA: 'q5 (c+ e a)4 (c+ e a)8 (c+ e a)8 r8 (c+ e a)8 (c+ e a)4 q7',
    sBm: 'q5 (d f+ b)4 (d f+ b)8 (d f+ b)8 r8 (d f+ b)8 (d f+ b)4 q7',
    sFm: 'q5 (c+ f+ a)4 (c+ f+ a)8 (c+ f+ a)8 r8 (c+ f+ a)8 (c+ f+ a)4 q7',
    hEm: 'q5 (e g b)4 (e g b)8 (e g b)8 q7', hA: 'q5 (c+ e a)4 (c+ e a)8 (c+ e a)8 q7',
    hBb: 'q5 (d f b-)4 (d f b-)8 (d f b-)8 q7', hC: 'q5 (e g >c<)4 (e g >c<)8 (e g >c<)8 q7',
    bD: '[o2 d8 o3 d8]4', bG: '[o2 g8 o3 g8]4', bA: '[o2 a8 o3 a8]4', bBm: '[o2 b8 o3 b8]4', bFm: '[o2 f+8 o3 f+8]4',
    bEm: '[o2 e8 o3 e8]4', hbEm: '[o2 e8 o3 e8]2', hbA: '[o2 a8 o3 a8]2', hbBb: '[o2 b-8 o3 b-8]2', hbC: '[o3 c8 o4 c8]2',
    m: 'v12 k8 v6 h8 v11 s8 v6 h8 v12 k8 k8 v11 s8 v6 h8',
    fill: 'v12 k8 v6 h8 v11 s8 v6 h8 v10 s16 s16 s16 s16 v12 s8 s8',
    soft: 'v11 k4 v5 h8 h8 v9 s4 v5 h8 h8',
  },
  p1: `v12 @2 E2 V3 o4 a16 a16 a8 o5 d4 f+4 a4 | o5 g8 f+8 e8 d8 c+4 o4 a4 |
    L @1 o4 a4 o5 d4 e8 f+8 a4 | o5 f+4. e8 d4 r4 | o5 g4 b4 a8 g8 f+8 e8 | o5 e4. f+8 e4 c+4 |
    o5 d4 f+4 b4 a8 f+8 | o5 g4. f+8 g8 a8 b4 | o5 a8 g8 f+8 e8 g8 f+8 e8 c+8 | o5 d2. r4 |
    o4 a4 o5 d4 e8 f+8 a4 | o5 a4. g8 f+4 c+4 | o5 b4 a8 g8 d4 g4 | o5 f+2 a4 f+4 |
    o5 g4 f+8 e8 b4 g4 | o5 a4 g8 f+8 e4 c+4 | @2 o5 d4 f4 e4 g4 | o5 f+4 a4 o6 d2 |
    @0 E1 q8 o5 d4. e8 d4 b4 | o5 c+4. d8 e2 | o5 c+4. d8 c+4 a4 | o5 b2 f+2 |
    o5 g4. a8 g4 e4 | o5 a4. b8 a4 e4 | o5 b4 a4 g4 d4 | E2 q7 o5 e4 f+8 g8 a4 c+4 |`,
  p2: `v9 @1 E2 o4 d16 d16 d8 f+4 a4 o5 d4 | o4 e8 d8 c+8 o3 b8 a4 o4 c+4 |
    L v7 @0 o4 $sD | $sD | $sG | $sA | $sBm | $sG | $hEm $hA | $sD |
    $sD | $sFm | $sG | $sD | o4 q5 (e g b)4 (e g b)8 (e g b)8 r8 (e g b)8 (e g b)4 q7 | $sA | $hBb $hC | $sD |
    v6 @2 q8 (d g b)1 | (c+ e a)1 | (c+ f+ a)1 | (d f+ b)1 | (e g b)1 | (c+ e a)1 | (d g b)1 | (c+ e a)1 |`,
  tri: `q6 o2 d4 r4 d4 r4 | o2 a4 r4 a8 a8 a8 a8 |
    L $bD | $bD | $bG | $bA | $bBm | $bG | $hbEm $hbA | $bD |
    $bD | $bFm | $bG | $bD | $bEm | $bA | $hbBb $hbC | $bD |
    q8 o2 g2 a2 | o2 a2 o3 c+2 | o2 f+2 a2 | o2 b2 o3 d2 | o2 e2 g2 | o2 a2 o3 c+2 | o2 g2 b2 | o2 a1 |`,
  noise: `v11 s16 s16 s8 k4 k4 x4 | v10 s8 s8 s8 s8 s16 s16 s16 s16 s8 s8 |
    L $m | $m | $m | $m | $m | $m | $m | $fill | $m | $m | $m | $m | $m | $m | $m | $fill |
    $soft | $soft | $soft | $soft | $soft | $soft | $soft | $fill |`,
};

// ───────────────────────────── Viridian Forest: "Sunlit Thicket" (G major) ─────────────────────────────
// Form: A (8) A' (8) B (8). Bouncy root-fifth bass, sparkling broken-chord second pulse.
const forest: SongDef = {
  title: 'Sunlit Thicket', bpm: 128, key: [7, 'major'],
  macros: {
    aG: 'o4 l16 [g b o5 d o4 b]4 l8', aEm: 'o4 l16 [e g b g]4 l8', aC: 'o4 l16 [e g o5 c o4 g]4 l8',
    aD: 'o4 l16 [f+ a o5 d o4 a]4 l8', aAm: 'o4 l16 [e a o5 c o4 a]4 l8', aBm: 'o4 l16 [f+ b o5 d o4 b]4 l8',
    hAm: 'o4 l16 [e a o5 c o4 a]2 l8', hD: 'o4 l16 [f+ a o5 d o4 a]2 l8', hC: 'o4 l16 [e g o5 c o4 g]2 l8',
    bG: 'o2 g4 o3 d8 o2 g8 r8 g8 o3 d4', bEm: 'o2 e4 b8 e8 r8 e8 b4', bC: 'o3 c4 g8 c8 r8 c8 g4',
    bD: 'o3 d4 a8 d8 r8 d8 a4', bAm: 'o2 a4 o3 e8 o2 a8 r8 a8 o3 e4', bBm: 'o2 b4 o3 f+8 o2 b8 r8 b8 o3 f+4',
    hbAm: 'o2 a4 o3 e4', hbD: 'o3 d4 a4', hbC: 'o3 c4 g4',
    d: 'v12 k8 v5 h8 v10 s8 v5 h8 v12 k8 v5 h8 v10 s8 v5 h16 h16',
    dB: 'v11 k4 v5 h8 h8 v9 s4 v5 h8 v7 p8',
    fill: 'v12 k8 v5 h8 v10 s8 v5 h8 v9 s16 s16 v10 s16 s16 v11 s8 s8',
  },
  p1: `L v12 @1 E2 V3 q7
    o4 b8 o5 d8 g4 f+8 g8 a8 b8 | o5 g4 e4 r8 e8 f+8 g8 | o5 e8 g8 o6 c4 o5 b8 a8 g8 e8 | o5 f+4. d8 a4 r4 |
    o4 b8 o5 d8 g4 f+8 g8 a8 b8 | o5 b4 g4 r8 e8 g8 b8 | o5 a8 b8 o6 c8 o5 b8 a8 g8 f+8 a8 | o5 g2 r2 |
    o5 d8 g8 b4 a8 g8 f+8 g8 | o5 f+4 d4 r8 b8 a8 f+8 | o5 e4 g4 o6 c4 o5 g4 | o5 b4. a8 g4 d4 |
    o5 c8 e8 a4 g8 a8 b8 o6 c8 | o6 d4 o5 a4 f+4 d4 | o5 e8 f+8 g8 a8 b8 a8 g8 f+8 | o5 g2. r4 |
    @2 q8 o5 e4. g8 e4 c4 | o5 d4. f+8 a2 | o5 b4. a8 f+4 d4 | o5 e2 g2 |
    o5 a4. g8 a4 o6 c4 | o5 b4 a4 f+4 d4 | o5 g4. f+8 e4 c4 | q7 o5 d8 e8 f+8 g8 a8 b8 o6 c8 o5 a8 |`,
  p2: `L v6 @0 E1 q6
    $aG | $aEm | $aC | $aD | $aG | $aEm | $hAm $hD | $aG |
    $aG | $aBm | $aC | $aG | $aAm | $aD | $hC $hD | $aG |
    v5 @2 E2 q8 (c e g)1 | (d f+ a)1 | (d f+ b)1 | (e g b)1 | (e a >c<)1 | (d f+ a)1 | (c e g)1 | (d f+ a >c<)1 |`,
  tri: `L q7 $bG | $bEm | $bC | $bD | $bG | $bEm | $hbAm $hbD | $bG |
    $bG | $bBm | $bC | $bG | $bAm | $bD | $hbC $hbD | $bG |
    $bC | $bD | $bBm | $bEm | $bAm | $bD | $bC | $bD |`,
  noise: `L $d | $d | $d | $d | $d | $d | $d | $fill | $d | $d | $d | $d | $d | $d | $d | $fill |
    $dB | $dB | $dB | $dB | $dB | $dB | $dB | $fill |`,
};

// ───────────────────────────── Mt. Moon: "Moonstone Hollow" (A minor) ─────────────────────────────
// Sparse, echoing lead over a pulsing bass; half-time drums.
const cave: SongDef = {
  title: 'Moonstone Hollow', bpm: 100, key: [9, 'harmonic'],
  echo: { delay: 36, vol: 0.4 },
  macros: {
    bAm: 'o2 a4. a8 o3 e4 o2 a4', bG: 'o2 g4. g8 o3 d4 o2 g4', bF: 'o2 f4. f8 o3 c4 o2 f4', bE: 'o2 e4. e8 b4 e4',
    d: 'v12 k4 r8 v4 h8 v9 s4 r8 v4 h8', d2: 'v12 k4 r8 v11 k8 v9 s4 v4 h8 h8',
  },
  p1: `L v12 @2 E2 V4 q7
    o4 a4. o5 c8 e2 | o5 d8 e8 d8 c8 o4 b4 a4 | o4 g2. b4 | o5 d2 c4 o4 b4 |
    o4 a4. o5 c8 f2 | o5 e8 f8 e8 d8 c4 o4 a4 | o4 g+2. b4 | o4 b2. r4 |
    o5 e4. d8 c4 e4 | o5 a2 g4 e4 | o5 f4. e8 d4 c4 | o5 d4. c8 o4 b4 g4 |
    o5 c4. d8 e4 a4 | o5 a8 g8 f8 e8 d4 c4 | o4 b4 o5 c4 d4 o4 g+4 | o4 b2. r4 |`,
  p2: '',
  tri: `L q7 $bAm | $bAm | $bG | $bG | $bF | $bF | $bE | $bE | $bAm | $bAm | $bF | $bG | $bAm | $bF | $bE | $bE |`,
  noise: `L [$d | $d | $d | $d2 |]4`,
};

// ───────────────────────────── Seafoam Islands: "Glacier Lullaby" (E minor) ─────────────────────────────
const ice: SongDef = {
  title: 'Glacier Lullaby', bpm: 116, key: [4, 'harmonic'],
  macros: {
    aEm: 'o5 l16 [e g b g]4 l8', aC: 'o5 l16 [e g b g]4 l8', aCmaj: 'o5 l16 [c e g b]4 l8', aAm: 'o5 l16 [c e a e]4 l8',
    aB7: 'l16 [o4 b o5 d+ f+ a]4 l8', aD: 'o5 l16 [d f+ a f+]4 l8', aG: 'o5 l16 [d g b g]4 l8', aCC: 'o5 l16 [c e g e]4 l8',
    hAm: 'o5 l16 [c e a e]2 l8', hB7: 'l16 [o4 b o5 d+ f+ a]2 l8',
    bEm: 'o2 e4 r8 e8 b4 o3 e4', bC: 'o3 c4 r8 c8 g4 o4 c4', bAm: 'o2 a4 r8 a8 o3 e4 a4', bB: 'o2 b4 r8 b8 o3 f+4 b4',
    bD: 'o3 d4 r8 d8 a4 o4 d4', bG: 'o2 g4 r8 g8 o3 d4 g4', hbAm: 'o2 a4 o3 e4', hbB: 'o2 b4 o3 f+4',
    d: 'v10 k4 v4 h8 h8 v8 s8 v4 h8 v5 p4', dk: 'v10 k4 v4 h8 h8 v8 s8 v10 k8 v5 p4',
  },
  p1: `L v12 @1 E2 V4 q7
    o5 b4 g8 e8 f+4 g4 | o5 e2 g4 e4 | o5 a4. g8 e4 c4 | o5 d+4 f+4 a4 b4 |
    o5 g4. f+8 e4 b4 | o5 g4 e4 c4 e4 | o5 f+4. e8 d4 a4 | o5 b2 f+4 d+4 |
    o5 d4 g4 b4 a8 g8 | o5 a4. f+8 d2 | o5 e4 g4 o6 c4 o5 b8 a8 | o5 b4. a8 f+4 d+4 |
    o5 e4 g8 b8 o6 e4 d4 | o6 c4 o5 b8 a8 g4 e4 | o5 c4 e4 d+4 f+4 | o5 e2. r4 |`,
  p2: `L v5 @0 E1 q6 $aEm | $aCmaj | $aAm | $aB7 | $aEm | $aCC | $aD | $aB7 | $aG | $aD | $aCC | $aB7 | $aEm | $aCC | $hAm $hB7 | $aEm |`,
  tri: `L q7 $bEm | $bC | $bAm | $bB | $bEm | $bC | $bD | $bB | $bG | $bD | $bC | $bB | $bEm | $bC | $hbAm $hbB | $bEm |`,
  noise: `L [$d | $d | $d | $dk |]4`,
};

// ───────────────────────────── Power Plant: "Live Wire" (E mixolydian) ─────────────────────────────
const factory: SongDef = {
  title: 'Live Wire', bpm: 140, key: [4, 'mixolydian'],
  macros: {
    sE: 'o4 q4 [(e g+ b)8]8 q7', sD: 'o4 q4 [(d f+ a)8]8 q7', sB: 'o4 q4 [(d+ f+ b)8]8 q7',
    sC: 'o4 q4 [(c e g)8]8 q7', hG: 'o4 q4 [(d g b)8]4 q7', hA: 'o4 q4 [(c+ e a)8]4 q7',
    bE: 'o2 l16 [e e o3 e o2 e]4 l8', bD: 'o2 l16 [d d o3 d o2 d]4 l8', bB: 'o2 l16 [b b o3 b o2 b]4 l8',
    bC: 'o3 l16 [c c o4 c o3 c]4 l8', hbG: 'o2 l16 [g g o3 g o2 g]2 l8', hbA: 'o2 l16 [a a o3 a o2 a]2 l8',
    d: 'v12 k16 v4 h16 h16 h16 v10 s16 v4 h16 h16 h16 v12 k16 v4 h16 v12 k16 v4 h16 v10 s16 v4 h16 h16 v6 p16',
    fill: 'v12 k16 v4 h16 h16 h16 v10 s16 v4 h16 h16 h16 v10 s16 s16 s16 s16 v11 t16 t16 t16 t16',
  },
  p1: `L v11 @3 E2 V2 q6
    o4 e8 e8 b8 g+8 o5 d8 o4 b8 a8 g+8 | o4 g+8 b8 o5 e4 d8 o4 b8 a8 b8 | o4 d8 d8 a8 f+8 o5 c8 o4 a8 g8 f+8 | o4 b2 a4 g+4 |
    o4 e8 e8 b8 g+8 o5 d8 o4 b8 a8 g+8 | o4 g+8 b8 o5 e4 g+4 e4 | o5 d8 e8 d8 o4 b8 o5 c+8 e8 c+8 o4 a8 | o4 b2. r4 |
    @1 q7 V3 o5 e4. g8 e4 c4 | o5 f+4. a8 f+4 d4 | o5 g+4. b8 g+4 e4 | o5 b8 a8 g+8 f+8 e8 d8 o4 b8 g+8 |
    o5 c4 e4 g4 e4 | o5 d4 f+4 a4 f+4 | o5 d+4. f+8 b4 a4 | o4 b4 f+4 d+4 o3 b4 |`,
  p2: `L v6 @2 E1 $sE | $sE | $sD | $sE | $sE | $sE | $hG $hA | $sB | $sC | $sD | $sE | $sE | $sC | $sD | $sB | $sB |`,
  tri: `L q5 $bE | $bE | $bD | $bE | $bE | $bE | $hbG $hbA | $bB | $bC | $bD | $bE | $bE | $bC | $bD | $bB | $bB |`,
  noise: `L $d | $d | $d | $d | $d | $d | $d | $fill | $d | $d | $d | $d | $d | $d | $d | $fill |`,
};

// ───────────────────────────── Pokémon Tower: "Lantern Vigil" (B minor) ─────────────────────────────
// No drums to speak of; a descending chromatic bass under a high, echoing lament.
const tower: SongDef = {
  title: 'Lantern Vigil', bpm: 88, key: [11, 'harmonic'],
  echo: { delay: 48, vol: 0.45 },
  macros: { t: 'r4 v3 h8 r8 r4 v2 h8 r8', t2: 'r4 v3 h8 r8 v2 h8 h8 v3 p4' },
  p1: `L v11 @0 E2 V5 q7
    o5 f+4 b4 a+4 f+4 | o5 g4 f+4 d4 o4 b4 | o5 e4. f+8 g4 a4 | o5 f+2 f4 d4 |
    o5 d4 g4 f+4 d4 | o5 c+4 e4 a+4 o6 c+4 | o6 d4. c+8 o5 b4 f+4 | o5 a+2 r2 |
    o5 b4 o6 d4 c+4 o5 b4 | o5 a+4 g4 f+4 e4 | o5 d4 e4 f+4 a4 | o5 g+2. f4 |
    o5 g4 b4 o6 d4 o5 b4 | o5 g4. f+8 e4 b4 | o5 a+4 o6 c+4 e4 o5 a+4 | o5 b2. r4 |`,
  p2: '',
  tri: `L q8 o2 b1 | o2 a+1 | o2 a1 | o2 g+1 | o2 g1 | o2 f+1 | o2 b1 | o2 f+1 |
    o2 b1 | o2 a+1 | o2 a1 | o2 g+1 | o2 g1 | o2 e1 | o2 f+1 | o2 b1 |`,
  noise: `L [$t | $t | $t | $t2 |]4`,
};

// ───────────────────────────── Cinnabar Volcano: "Magma Run" (A harmonic minor) ─────────────────────────────
const volcano: SongDef = {
  title: 'Magma Run', bpm: 152, key: [9, 'harmonic'],
  macros: {
    sAm: 'o4 q5 (a >c e<)8 (a >c e<)8 r8 (a >c e<)8 (a >c e<)8 r8 (a >c e<)4 q7',
    sF: 'o4 q5 (a >c f<)8 (a >c f<)8 r8 (a >c f<)8 (a >c f<)8 r8 (a >c f<)4 q7',
    sE: 'o4 q5 (g+ b >e<)8 (g+ b >e<)8 r8 (g+ b >e<)8 (g+ b >e<)8 r8 (g+ b >e<)4 q7',
    sG: 'o4 q5 (g b >d<)8 (g b >d<)8 r8 (g b >d<)8 (g b >d<)8 r8 (g b >d<)4 q7',
    hDm: 'o4 q5 (a >d f<)8 (a >d f<)8 r8 (a >d f<)8 q7', hE: 'o4 q5 (g+ b >e<)8 (g+ b >e<)8 r8 (g+ b >e<)8 q7',
    bAm: '[o2 a8 o3 a8]4', bF: '[o2 f8 o3 f8]4', bE: '[o2 e8 o3 e8]4', bG: '[o2 g8 o3 g8]4', hbDm: '[o2 d8 o3 d8]2', hbE: '[o2 e8 o3 e8]2',
    d: 'v12 k8 v5 h8 v11 s8 v5 h8 v12 k8 k8 v11 s8 v5 h8',
    fill: 'v12 k8 v5 h8 v11 s8 v5 h8 v11 t16 t16 t16 t16 v12 s16 s16 s8',
  },
  p1: `L v12 @2 E2 V3 q7
    o5 a8 e8 a8 b8 o6 c4 o5 b8 a8 | o5 g+8 a8 b8 a8 e4 c4 | o5 f8 a8 o6 c8 o5 a8 f4 e8 f8 | o5 g+4 e4 b4 g+4 |
    o5 a8 e8 a8 b8 o6 c4 d4 | o6 e4 d8 c8 o5 b8 a8 g+8 a8 | o5 f4 a4 g+4 b4 | o5 a2. r4 |
    @1 o6 c4. o5 a8 f4 a4 | o5 b4. g8 d4 g4 | o5 g+8 a8 b8 o6 c8 d8 c8 o5 b8 g+8 | o5 a4 e4 c4 e4 |
    o5 f8 g8 a8 b8 o6 c4 o5 a4 | o5 b8 o6 c8 d8 e8 f4 d4 | o6 e4 d4 c4 o5 b4 | o5 g+8 a8 b8 g+8 e4 r4 |`,
  p2: `L v7 @1 E1 $sAm | $sAm | $sF | $sE | $sAm | $sAm | $hDm $hE | $sAm | $sF | $sG | $sE | $sAm | $sF | $sG | $sE | $sE |`,
  tri: `L q6 $bAm | $bAm | $bF | $bE | $bAm | $bAm | $hbDm $hbE | $bAm | $bF | $bG | $bE | $bAm | $bF | $bG | $bE | $bE |`,
  noise: `L $d | $d | $d | $d | $d | $d | $d | $fill | $d | $d | $d | $d | $d | $d | $d | $fill |`,
};

// ───────────────────────────── Cerulean Cave: "The Deepest Dark" (D minor) ─────────────────────────────
const finale: SongDef = {
  title: 'The Deepest Dark', bpm: 140, key: [2, 'harmonic'],
  macros: {
    bDm: '[o2 d8 o3 d8]4', bBb: '[o2 b-8 o3 b-8]4', bC: '[o3 c8 o4 c8]4', bA: '[o2 a8 o3 a8]4', bGm: '[o2 g8 o3 g8]4',
    bAm: '[o2 a8 o3 a8]4', hbGm: '[o2 g8 o3 g8]2', hbA: '[o2 a8 o3 a8]2',
    d: 'v12 k8 v5 h8 v11 s8 v5 h8 v12 k8 v5 h8 v11 s8 v12 k8',
    fill: 'v12 k8 v5 h8 v11 s8 v5 h8 v12 t8 t16 t16 v11 t8 v12 x8',
  },
  p1: `L v12 @2 E2 V3 q7
    o4 a8 o5 d8 f8 a8 g4 f4 | o5 f4. d8 o4 b-4 o5 d4 | o5 e4. g8 o6 c4 o5 g4 | o5 a2 c+4 e4 |
    o5 d8 e8 f8 g8 a4 d4 | o5 b-4. a8 g4 f4 | o5 g4 b-4 a4 c+4 | o5 d2. r4 |
    @1 o5 f4 b-4 o6 d4 c4 | o5 b-4 a4 g4 e4 | o5 a4. g8 e4 c4 | o5 d4 f4 a4 o6 d4 |
    o6 d4. c8 o5 b-4 g4 | o5 c4 e4 g4 b-4 | o5 a4 g4 f4 e4 | o5 c+4 e4 a4 r4 |`,
  p2: `L v6 @0 E2 q8 (d f a)1 | (d f b-)1 | (c e g)1 | (c+ e a)1 | (d f a)1 | (d f b-)1 | (d g b-)2 (c+ e a)2 | (d f a)1 |
    v7 q5 [(d f b-)8]8 | [(c e g)8]8 | [(c e a)8]8 | [(d f a)8]8 | [(d g b-)8]8 | [(c e g b-)8]8 | [(c+ e a)8]8 | [(c+ e g a)8]8 |`,
  tri: `L q6 $bDm | $bBb | $bC | $bA | $bDm | $bBb | $hbGm $hbA | $bDm | $bBb | $bC | $bAm | $bDm | $bGm | $bC | $bA | $bA |`,
  noise: `L $d | $d | $d | $d | $d | $d | $d | $fill | $d | $d | $d | $d | $d | $d | $d | $fill |`,
};

// ───────────────────────────── Boss: "Wild Fury" (E harmonic minor) ─────────────────────────────
const boss: SongDef = {
  title: 'Wild Fury', bpm: 168, key: [4, 'harmonic'],
  macros: {
    sEm: 'o4 q4 [(e g b)8]8 q7', sC: 'o4 q4 [(e g >c<)8]8 q7', sD: 'o4 q4 [(f+ a >d<)8]8 q7', sAm: 'o4 q4 [(e a >c<)8]8 q7',
    sB: 'o4 q4 [(d+ f+ b)8]8 q7', hC: 'o4 q4 [(e g >c<)8]4 q7', hB: 'o4 q4 [(d+ f+ b)8]4 q7',
    bEm: '[o2 e8 o3 e8]4', bC: '[o2 c8 o3 c8]4', bD: '[o2 d8 o3 d8]4', bAm: '[o2 a8 o3 a8]4', bB: '[o2 b8 o3 b8]4',
    hbC: '[o2 c8 o3 c8]2', hbB: '[o2 b8 o3 b8]2',
    d: 'v12 k8 v5 h8 v11 s8 v5 h8 v12 k8 k8 v11 s8 v5 h8',
    fill: 'v12 k8 v5 h8 v11 s8 v5 h8 v11 s16 s16 s16 s16 v12 t16 t16 t16 t16',
  },
  p1: `v12 @2 E0 q7 o6 e16 d+16 d16 c+16 c16 o5 b16 a+16 a16 g+16 g16 f+16 f16 e4 | o5 e8 e8 e8 e8 e8 e8 f8 f+8 |
    L E2 V3 o5 e8 e8 b8 e8 a8 e8 g8 f+8 | o5 e8 e8 b8 e8 o6 c8 o5 b8 a8 g8 | o5 g4 e8 g8 o6 c4 o5 b8 a8 | o5 a4 f+8 a8 o6 d4 c8 o5 a8 |
    o5 e8 e8 b8 e8 a8 e8 g8 f+8 | o5 e8 e8 b8 e8 o6 d8 c8 o5 b8 a8 | o5 g8 a8 g8 e8 f+8 g8 a8 b8 | o5 e2 r4 o4 b8 o5 d8 |
    @1 o5 c4. e8 a4 g8 e8 | o5 c8 d8 e8 g8 a4 o6 c4 | o5 b4. g8 e4 g8 b8 | o6 e2 d4 o5 b4 |
    o5 g8 e8 g8 o6 c8 e4 d8 c8 | o5 a8 f+8 a8 o6 d8 f+4 e8 d8 | o5 d+8 f+8 b8 o6 d+8 f+4 e8 d+8 | o6 d+4 o5 b4 a4 f+4 |`,
  p2: `v9 @1 E0 q7 o5 e16 d+16 d16 c+16 c16 o4 b16 a+16 a16 g+16 g16 f+16 f16 e4 | o4 b8 b8 b8 b8 b8 b8 o5 c8 c+8 |
    L v6 E1 $sEm | $sEm | $sC | $sD | $sEm | $sEm | $hC $hB | $sEm | $sAm | $sAm | $sEm | $sEm | $sC | $sD | $sB | $sB |`,
  tri: `q6 o2 e2 r2 | o2 [e8]6 f8 f+8 |
    L $bEm | $bEm | $bC | $bD | $bEm | $bEm | $hbC $hbB | $bEm | $bAm | $bAm | $bEm | $bEm | $bC | $bD | $bB | $bB |`,
  noise: `v11 x4 r4 r2 | v10 s8 s8 s8 s8 s16 s16 s16 s16 s8 s8 |
    L $d | $d | $d | $d | $d | $d | $d | $fill | $d | $d | $d | $d | $d | $d | $d | $fill |`,
};

// ───────────────────────────── Menus: "Rest Stop" (F major) ─────────────────────────────
const menu: SongDef = {
  title: 'Rest Stop', bpm: 100, key: [5, 'major'],
  macros: { d: 'v8 k4 v3 h8 h8 v6 s4 v3 h8 h8' },
  p1: `L v11 @1 E2 V3 q7
    o5 c4 f4 a4 g8 f8 | o5 a4. f8 d2 | o5 d8 e8 f8 g8 e4 c4 | o5 f2 r4 c4 |
    o5 d4 f4 b-4 a8 g8 | o5 g4. e8 c2 | o5 e4 c4 f4 a4 | o5 g4 d4 e4 g4 |
    o5 a4 o6 c4 o5 a4 f4 | o5 a4. g8 f4 d4 | o5 f4. g8 f4 d4 | o5 e4 g4 o6 c4 o5 g4 |
    o5 f4 g8 a8 b-4 a8 g8 | o5 a4 g4 e4 c4 | o5 f2. r4 | o5 e4 g4 o6 c4 o5 b-4 |`,
  p2: `L v5 @2 E2 q8 (f a >c<)1 | (d f a)1 | (d g b-)2 (c e g)2 | (f a >c<)1 | (d f b-)1 | (c e g)1 | (c e a)2 (d f a)2 | (d g b-)2 (c e g)2 |
    (f a >c<)1 | (d f a)1 | (d f b-)1 | (c e g)1 | (d f b-)1 | (c e g)1 | (f a >c<)1 | (c e g b-)1 |`,
  tri: `L q7 o2 f4 a4 o3 c4 o2 a4 | o2 d4 f4 a4 f4 | o2 g4 b-4 o3 c4 o2 e4 | o2 f4 a4 o3 c4 o2 a4 |
    o2 b-4 o3 d4 f4 d4 | o3 c4 e4 g4 e4 | o2 a4 o3 c4 o2 d4 f4 | o2 g4 b-4 o3 c4 o2 e4 |
    o2 f4 a4 o3 c4 o2 a4 | o2 d4 f4 a4 f4 | o2 b-4 o3 d4 f4 d4 | o3 c4 e4 g4 e4 |
    o2 b-4 o3 d4 f4 d4 | o3 c4 e4 g4 e4 | o2 f4 a4 o3 c4 o2 a4 | o3 c4 e4 g4 b-4 |`,
  noise: `L [$d |]16`,
};

// ───────────────────────────── Poké Mart: "Bargain Bounce" (G major) ─────────────────────────────
const shop: SongDef = {
  title: 'Bargain Bounce', bpm: 116, key: [7, 'major'],
  macros: {
    oG: 'o4 q4 [r8 (g b >d<)8]4 q7', oC: 'o4 q4 [r8 (g >c e<)8]4 q7', oD: 'o4 q4 [r8 (f+ a >d<)8]4 q7',
    oAm: 'o4 q4 [r8 (a >c e<)8]4 q7', hA: 'o4 q4 [r8 (a >c+ e<)8]2 q7', hD: 'o4 q4 [r8 (f+ a >c<)8]2 q7',
    bG: 'o2 g4 o3 d4 o2 g4 o3 d4', bC: 'o3 c4 g4 c4 g4', bD: 'o3 d4 a4 d4 a4', bAm: 'o2 a4 o3 e4 o2 a4 o3 e4',
    hbA: 'o2 a4 o3 e4', hbD: 'o3 d4 a4',
    d: 'v10 k8 v4 h8 v8 s8 v4 h8 v10 k8 v4 h8 v8 s8 v4 h8',
  },
  p1: `L v12 @2 E1 q5
    o5 d8 o4 b8 g8 b8 o5 d8 g8 d4 | o5 e8 c8 e8 g8 o6 c4 o5 g4 | o5 f+8 e8 d8 e8 f+8 a8 d4 | o5 g4 d4 o4 b4 r4 |
    o5 d8 o4 b8 g8 b8 o5 d8 g8 d4 | o5 e8 c8 e8 g8 o6 c8 d8 e4 | o6 c+8 o5 a8 e8 a8 f+8 a8 o6 d8 c8 | o5 b4 g4 g4 r4 |
    @1 E2 q7 V2 o5 e4 g4 e8 d8 c4 | o5 d4 b4 g8 a8 b4 | o5 c4 e4 a4 g8 e8 | o5 f+4 a4 d4 r4 |
    o5 g4 e4 c8 d8 e8 f+8 | o5 g4 d4 b4 g4 | o5 a8 b8 a8 g8 f+8 e8 f+8 a8 | o5 g4 r4 d8 e8 f+8 a8 |`,
  p2: `L v6 @1 E1 $oG | $oC | $oD | $oG | $oG | $oC | $hA $hD | $oG | $oC | $oG | $oAm | $oD | $oC | $oG | $oD | $oG |`,
  tri: `L q5 $bG | $bC | $bD | $bG | $bG | $bC | $hbA $hbD | $bG | $bC | $bG | $bAm | $bD | $bC | $bG | $bD | $bG |`,
  noise: `L [$d |]16`,
};

export const SONGS: Record<string, SongDef> = { title, menu, forest, cave, ice, factory, tower, volcano, finale, boss, shop };
