import { arrange, loopSec, sec } from '../score.ts';
import { ARPS, KIT } from './common.ts';

// ───────────── Cerulean Cave: "The Deepest Dark" (D minor, 140 bpm) ─────────────
// The last route: the title's leitmotif in D minor, framed by choir, a reese bass and a heavily
// pumped supersaw drop. Form: abyss intro, a half-time descent, the motif, an eight-bar build,
// a sixteen-bar drop, then a choir requiem that falls back into the descent.
// Roots for K: D 2, B♭ -2, G -5, A -3, F 5, C 0.

/** The leitmotif in D minor (transpose with K for other keys). */
export const MOTIF: Record<string, string> = {
  m1: 'o5 l16 a8 o6 d4 ^8 e f e8 d8 o5 a8 |',
  m2: 'o5 l16 b-8 o6 d8 f4 ^8 e d c8 o5 b-8 |',
  m3: 'o5 l16 b-8 o6 d8 g4 ^8 f e d8 o5 b-8 |',
  m4: 'o6 l16 c+8 e8 a4 ^8 g f e8 c+8 |',
  m6: 'o6 l16 c8 f8 a4 ^8 f e c8 o5 a8 |',
  m7: 'o5 l8 b- o6 d g f e g a c+ |',
  m8: 'o6 l16 d4 o5 a8 f8 d4 r4 |',
  m8b: 'o6 l16 d4 o5 a8 f8 d8 e8 f8 g8 |',
  motif: '$m1 $m2 $m3 $m4 $m1 $m6 $m7 $m8',
  motifB: '$m1 $m2 $m3 $m4 $m1 $m6 $m7 $m8b',
};

export const finale = arrange(
  {
    title: 'The Deepest Dark', bpm: 140, key: [2, 'harmonic'], room: 3.2,
    about: 'Cerulean Cave: the main theme returns in D minor as an epic darksynth drop.',
    macros: {
      ...KIT, ...ARPS, ...MOTIF,
      descent: 'o5 l8 d4. e f4 a4 | f4. e d4 c4 | e4. f g4 o6 c4 | o5 c+2. r4 | d4. e f4 a4 | b-4. a g4 f4 | g4. a b-4 o6 d4 | c+2 o5 a2 |',
      climb: 'r1 | r1 | r1 | r1 | o5 l8 f g a b- o6 c d e f | g4 e4 c4 e4 | e4 c+4 o5 a4 o6 c+4 | e2 r2 |',

      chM: 'o4 (d f a)1 | (d f b-)1 | (d g b-)1 | (c+ e a)1 | (d f a)1 | (c f a)1 | (d g b-)2 (c+ e a)2 | (d f a)1 |',
      chD: 'o4 (d f a)1 | (d f b-)1 | (c e g)1 | (c+ e a)1 | (d f a)1 | (d f b-)1 | (d g b-)1 | (c+ e a)1 |',
      chB: 'o4 (d f b-)1 | (c e g)1 | (d f a)1 | (d f a)1 | (d f b-)1 | (c e g)1 | (c+ e a)1 | (c+ e a)1 |',
      brassM: 'o4 (d f a)4. (d f a)8 r2 | (d f b-)4. (d f b-)8 r2 | (d g b-)4. (d g b-)8 r2 | (c+ e a)4. (c+ e a)8 r4 (c+ e a)8 (c+ e a)8 | (d f a)4. (d f a)8 r2 | (c f a)4. (c f a)8 r2 | (d g b-)4 r4 (c+ e a)4 r4 | (d f a)4. (d f a)8 r2 |',
      arpM: 'K2 $am16 K-2 $aM16 K-5 $am16 K-3 $aM16 K2 $am16 K5 $aM16 K-5 $am16h K-3 $aM16h | K2 $am16',
      arpD: 'K2 $am16 K-2 $aM16 K0 $aM16 K-3 $aM16 K2 $am16 K-2 $aM16 K-5 $am16 K-3 $aM16',
      rollM: 'K2 $roll K-2 $roll K-5 $roll K-3 $roll K2 $roll K5 $roll K-5 $rollh K-3 $rollh | K2 $roll',
      reeseD: 'o2 d2. ^8 d8 | o1 b-2. ^8 b-8 | o2 c2. ^8 c8 | o1 a2. ^8 a8 | o2 d2. ^8 d8 | o1 b-2. ^8 b-8 | g2. ^8 g8 | a2. ^8 a8 |',
    },
  },
  {
    lead: { name: 'Saw lead', inst: 'lead', role: 'lead', init: 'v13 V3', verb: 0.25, delay: 0.18 },
    lead2: { name: 'Square double', inst: 'square', init: 'v10 @2 V2', gain: 0.75, verb: 0.2 },
    bell: { name: 'Bell', inst: 'bell', init: 'v11', pan: 0.2, verb: 0.5, delay: 0.35 },
    brass: { name: 'Brass', inst: 'brass', init: 'v12', verb: 0.3, pump: 0.3 },
    saws: { name: 'Supersaw', inst: 'supersaw', init: 'v12', verb: 0.3, pump: 0.7 },
    choir: { name: 'Choir', inst: 'choir', init: 'v11 V3', verb: 0.6, pump: 0.3 },
    arp: { name: 'Pluck arp', inst: 'pluck', init: 'v10', pan: -0.2, verb: 0.25, delay: 0.3, pump: 0.45 },
    bass: { name: 'Reese', inst: 'reese', role: 'bass', init: 'v12', verb: 0.02, drive: 1, pump: 0.35 },
    kick: { name: 'Kick', inst: 'kit', init: 'v15', verb: 0.03 },
    snare: { name: 'Snare', inst: 'kit', init: 'v13', verb: 0.35 },
    clap: { name: 'Clap', inst: 'kit', init: 'v11', verb: 0.3 },
    hats: { name: 'Hats', inst: 'kit', init: 'v11', pan: 0.2, verb: 0.06 },
    fx: { name: 'Cymbals & FX', inst: 'kit', init: 'v12', verb: 0.45 },
  },
  [
    sec('Abyss', 8, {
      bell: '$m1 $m2 $m3 $m4 r1 | r1 | r1 | r1 |',
      choir: 'o4 (d f a)1 | (d f b-)1 | (d g b-)1 | (c+ e a)1 | (d f a)1 | (d f b-)1 | (c+ e a)1 | (c+ e a)1 |',
      bass: 'o2 d1 | o1 b-1 | g1 | a1 | o2 d1 | o1 b-1 | a1 | a1 |',
      arp: 'r1 | r1 | r1 | r1 | F3 K2 $am16 F5 K-2 $aM16 F7 K-3 $aM16 F9 K-3 $aM16',
      kick: 'r1 | r1 | r1 | r1 | r1 | r1 | [k4]4 | k4 k4 k8 k8 l16 k k k k |',
      snare: 'r1 | r1 | r1 | r1 | r1 | r1 | $roll2',
      fx: 'v15 i1 | r1 | r1 | r1 | v13 i1 | r1 | $rise2',
    }),
    loopSec('Descent', 8, {
      lead: '$descent',
      arp: 'F8 $arpD',
      choir: '$chD',
      bass: '$reeseD',
      kick: '[$half]8',
      snare: '[$halfS]7 $fill',
      hats: '[$h16]8',
      fx: 'x1 | [r1 |]7',
    }),
    sec('Motif', 8, {
      lead: '$motif',
      brass: '$brassM',
      arp: 'F10 $arpM',
      bass: '$rollM',
      kick: '[$four]8',
      snare: '[$back]7 $fill16',
      clap: '[$clap]8',
      hats: '[$off]8',
      fx: 'x1 | [r1 |]3 x1 | [r1 |]3',
    }),
    sec('Rise', 8, {
      lead: '$climb',
      arp: 'F4 K-2 $aM16 F5 K0 $aM16 F6 K2 $am16 F7 K2 $am16 F9 K-2 $aM16 F11 K0 $aM16 F13 K-3 $aM16 F15 K-3 $aM16',
      choir: '$chB',
      bass: 'K-2 $pump K0 $pump K2 $pump K2 $pump K-2 $roll K0 $roll K-3 $roll K-3 l16 [o2 c]8 r2 |',
      kick: '[$four]4 [$four]3 k4 k4 k8 k8 r4 |',
      snare: 'r1 | r1 | r1 | r1 | $roll4',
      hats: '[$h8]4 [$h16]4',
      fx: 'r1 | r1 | r1 | r1 | $rise4',
    }),
    sec('Drop', 16, {
      lead: '$motif $motifB',
      lead2: 'K-12 $motif K-12 $motifB',
      saws: '$chM $chM',
      choir: '$chM $chM',
      arp: 'F12 $arpM $arpM',
      bass: '$rollM $rollM',
      kick: '[$four]16',
      snare: '[$back]15 $fill16',
      clap: '[$clap]16',
      hats: '[$off]8 [$h16]8',
      fx: 'i4 x2. | [r1 |]3 x1 | [r1 |]3 x1 | [r1 |]3 x1 | [r1 |]3',
    }),
    sec('Requiem', 8, {
      bell: '$motif',
      choir: '$chM',
      bass: 'o2 d1 | o1 b-1 | g1 | a1 | o2 d1 | f1 | o1 g2 a2 | o2 d1 |',
      snare: 'r1 | r1 | r1 | r1 | r1 | r1 | $roll2',
      fx: 'x1 | r1 | r1 | r1 | r1 | r1 | $rise2',
    }),
  ],
);
