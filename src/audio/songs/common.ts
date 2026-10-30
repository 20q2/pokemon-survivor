/**
 * Macros shared by the soundtrack (spread into a song's own macros). Every pattern is exactly one
 * bar unless its name says otherwise, so arrangements can be counted at a glance.
 */
export const KIT: Record<string, string> = {
  // kicks
  four: '[k4]4 |',
  rock: 'k8 r8 r8 k8 k8 r8 r8 r8 |',
  rock2: 'k8 r8 r8 k8 k8 r8 r16 k16 r8 |',
  half: 'k4 r2 r8 k8 |',
  dnbK: 'k4 r4 r8 k8 r4 |',
  dnbK2: 'k4 r4 r8 k8 r8 k8 |',
  dbl: 'l16 [k]16 |',
  // snares and claps
  back: 'r4 s4 r4 s4 |',
  clap: 'r4 c4 r4 c4 |',
  halfS: 'r2 s4 r4 |',
  halfC: 'r2 c4 r4 |',
  fill: 'r4 s4 r8 s16 s16 s8 s8 |',
  fill16: 'r4 s4 l16 v8 s s v10 s s v12 s s s s |',
  dnbS: 'r4 s4 r8. v5 s16 v12 s4 |',
  dnbS2: 'r4 s4 r16 v5 s16 r8 v12 s8 v5 s16 s16 |',
  // hats and cymbals
  h16: 'l16 [v9 h v5 h v7 h v5 h]4 |',
  h8: '[v9 h8 v6 h8]4 |',
  off: '[r8 v9 p8]4 |',
  ride: '[v9 y8 v6 y8]4 |',
  shk: 'l16 [v8 h8 v5 h v6 h]4 |',
  // builds: a four-bar snare roll that doubles every bar, and risers
  roll4: '[s4]4 | [s8]8 | [s16]16 | l16 v6 s s v7 s s v8 s s v9 s s v10 s s v11 s s v12 s s v14 s s |',
  roll2: '[s8]8 | l16 v6 s s v7 s s v8 s s v9 s s v10 s s v11 s s v12 s s v14 s s |',
  rise2: 'v11 w1 | ^1 |',
  rise4: 'v10 w1 | ^1 | ^1 | ^1 |',
  tomfill: 'l16 o5 t t o4 t t o4 t t o3 t t o3 t t o2 t t v14 o2 t8 r8 |',
};

/** Broken-chord arps on C (transpose with K): 16th up-runs, 8th up-runs, and half-bar versions. */
export const ARPS: Record<string, string> = {
  am16: '[o4 c16 e-16 g16 o5 c16]4 |', aM16: '[o4 c16 e16 g16 o5 c16]4 |',
  am16h: '[o4 c16 e-16 g16 o5 c16]2', aM16h: '[o4 c16 e16 g16 o5 c16]2',
  am8: '[o4 c8 e-8 g8 o5 c8]2 |', aM8: '[o4 c8 e8 g8 o5 c8]2 |',
  // octave-bouncing synthwave bass, gallop, and rolling 16ths (on C2)
  oct: '[o2 c8 o3 c8]4 |', octh: '[o2 c8 o3 c8]2',
  gal: '[o2 c8 o3 c16 o2 c16]4 |', galh: '[o2 c8 o3 c16 o2 c16]2',
  roll: 'l16 [o2 c c o3 c o2 c]4 |', rollh: 'l16 [o2 c c o3 c o2 c]2',
  pump: '[o2 c8]8 |', pumph: '[o2 c8]4',
};
