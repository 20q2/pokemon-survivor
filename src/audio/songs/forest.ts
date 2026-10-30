import { arrange, loopSec, sec } from '../score.ts';

// ───────────── Viridian Forest: "Canopy Rush" (E minor, 152 bpm) ─────────────
// The first route has to grab you: an Andalusian i–VII–VI–V hook over galloping octave bass,
// a soaring relative-major chorus, a flute glade, then a build into a supersaw drop.
// Chord roots for K: E 4, D 2, C 0, B -1, A -3.

export const forest = arrange(
  {
    title: 'Canopy Rush', bpm: 152, key: [4, 'harmonic'], room: 1.6,
    about: 'Viridian Forest: a galloping E-minor chase with a square-wave hook, a flute glade and a supersaw drop.',
    macros: {
      // hook (A): Em D C B | Em D C-B Em
      h1: 'o5 l16 e8 e f+ g8 e8 b8 a g f+8 e8 |',
      h2: 'o5 l16 f+8 f+ g a8 f+8 o6 d8 c o5 b a8 f+8 |',
      h3: 'o5 l16 g8 g a b8 g8 o6 e8 d c o5 b8 g8 |',
      h4: 'o5 l16 a8 g f+ d+8 f+8 b4 ^8 r8 |',
      h7: 'o5 l16 g8 o6 c8 e8 d c o5 b8 d+8 f+8 a8 |',
      h8: 'o5 l16 g f+ e8 r8 e8 e8 r8 o4 b8 o5 e8 |',
      h5b: 'o6 l16 e8 e d e8 o5 b8 g8 a g f+8 e8 |',
      h6b: 'o5 l16 f+8 a8 o6 d8 c o5 b a8 f+8 a8 o6 d8 |',
      h7b: 'o6 l16 e8 d c o5 b8 o6 c8 o5 b8 a g f+8 d+8 |',
      h8b: 'o5 l16 e4 r8 o4 b8 o5 e8 f+8 g8 a8 |',
      hookA: '$h1 $h2 $h3 $h4 $h1 $h2 $h7 $h8',
      hookB: '$h1 $h2 $h3 $h4 $h5b $h6b $h7b $h8b',
      // chorus: C D Bm Em | C D B B
      chorus: 'o5 l8 g4. a8 o6 c4 e4 | d4. c8 o5 b4 a4 | b4. a8 f+4 d4 | e2 g4 b4 | o6 c4. o5 b8 o6 c4 e4 | d4. c8 d4 f+4 | f+4. e8 d+4 o5 b4 | b2 ^8 a8 f+8 d+8 |',
      // glade (flute): Am Em Am Em | C D B B
      glade: 'o5 l8 a4. b8 o6 c4 o5 b8 a8 | g4. f+8 e2 | a4. b8 o6 c4 d4 | e2 o5 b2 | o6 c4. d8 e4 g4 | f+4. e8 d2 | d+4. e8 f+4 d+4 | o5 b1 |',

      // pads
      padA: 'o4 (e g b)1 | (d f+ a)1 | (c e g)1 | (d+ f+ b)1 | (e g b)1 | (d f+ a)1 | (c e g)2 (d+ f+ b)2 | (e g b)1 |',
      padB: 'o4 (c e g)1 | (d f+ a)1 | (d f+ b)1 | (e g b)1 | (c e g)1 | (d f+ a)1 | (d+ f+ b)1 | (d+ f+ b)1 |',
      padC: 'o4 (c e a)1 | (e g b)1 | (c e a)1 | (e g b)1 | (c e g)1 | (d f+ a)1 | (d+ f+ b)1 | (d+ f+ b)1 |',
      // offbeat supersaw stabs
      stA: 'o4 [r8 (e g b)8]4 | [r8 (d f+ a)8]4 | [r8 (c e g)8]4 | [r8 (d+ f+ b)8]4 | [r8 (e g b)8]4 | [r8 (d f+ a)8]4 | [r8 (c e g)8]2 [r8 (d+ f+ b)8]2 | [r8 (e g b)8]4 |',

      // arps: 16th broken triads on any root (K)
      am: '[o4 c16 e-16 g16 o5 c16]4 |', aM: '[o4 c16 e16 g16 o5 c16]4 |', aMh: '[o4 c16 e16 g16 o5 c16]2',
      arpA: 'K4 $am K2 $aM K0 $aM K-1 $aM K4 $am K2 $aM K0 $aMh K-1 $aMh | K4 $am',
      arpB: 'K0 $aM K2 $aM K-1 $am K4 $am K0 $aM K2 $aM K-1 $aM K-1 $aM',
      bm: '[o4 c8 e-8 g8 o5 c8]2 |', bM: '[o4 c8 e8 g8 o5 c8]2 |',

      // bass: octave eighths, and a gallop (8th + two 16ths) for the big sections
      oc: '[o2 c8 o3 c8]4 |', oh: '[o2 c8 o3 c8]2',
      gal: '[o2 c8 o3 c16 o2 c16]4 |', galh: '[o2 c8 o3 c16 o2 c16]2',
      bassA: 'K4 $oc K2 $oc K0 $oc K-1 $oc K4 $oc K2 $oc K0 $oh K-1 $oh | K4 $oc',
      bassB: 'K0 $gal K2 $gal K-1 $gal K4 $gal K0 $gal K2 $gal K-1 $gal K-1 $gal',
      bassD: 'K4 $gal K2 $gal K0 $gal K-1 $gal K4 $gal K2 $gal K0 $galh K-1 $galh | K4 $gal',

      // drums
      rock: 'k8 r8 r8 k8 k8 r8 r8 r8 |', rock2: 'k8 r8 r8 k8 k8 r8 r16 k16 r8 |',
      four: '[k4]4 |', half: 'k4 r2 r8 k8 |',
      back: 'r4 s4 r4 s4 |', fill: 'r4 s4 r8 s16 s16 s8 s8 |', halfS: 'r2 s4 r4 |',
      clap: 'r4 c4 r4 c4 |',
      h16: 'l16 [v9 h v5 h v7 h v5 h]4 |', off: '[r8 v9 p8]4 |', ride: '[v9 y8 v6 y8]4 |',
    },
  },
  {
    lead: { name: 'Square lead', inst: 'square', role: 'lead', init: 'v13 @1 V3', verb: 0.16, delay: 0.16 },
    lead2: { name: 'Saw double', inst: 'lead', init: 'v10 V2', gain: 0.8, verb: 0.18 },
    flute: { name: 'Flute', inst: 'flute', init: 'v12 V4', verb: 0.35, delay: 0.25 },
    arp: { name: 'Pluck arp', inst: 'pluck', init: 'v10', pan: -0.2, verb: 0.22, delay: 0.22, pump: 0.45 },
    bell: { name: 'Bell', inst: 'bell', init: 'v9', pan: 0.25, verb: 0.35, delay: 0.3 },
    pad: { name: 'Pad', inst: 'pad', init: 'v10', verb: 0.35, pump: 0.6 },
    saws: { name: 'Supersaw', inst: 'supersaw', init: 'v11', verb: 0.25, pump: 0.55 },
    bass: { name: 'Bass', inst: 'bass', role: 'bass', init: 'v12', verb: 0.02, pump: 0.3 },
    kick: { name: 'Kick', inst: 'kit', init: 'v14', verb: 0.02 },
    snare: { name: 'Snare', inst: 'kit', init: 'v12', verb: 0.16 },
    clap: { name: 'Clap', inst: 'kit', init: 'v11', verb: 0.2 },
    hats: { name: 'Hats', inst: 'kit', init: 'v12', pan: 0.2, verb: 0.05 },
    fx: { name: 'Cymbals & FX', inst: 'kit', init: 'v12', verb: 0.3 },
  },
  [
    sec('Intro', 4, {
      arp: 'F2 K4 $am F4 K2 $aM F6 K0 $aM F9 K-1 $aM',
      pad: 'o4 (e g b)1 | (d f+ a)1 | (c e g)1 | (d+ f+ b)1 |',
      bass: 'r1 | r1 | o2 c1 | o1 b1 |',
      kick: 'r1 | r1 | $four [k4]2 k8 k8 k16 k16 k16 k16 |',
      snare: 'r1 | r1 | r1 | r2 l16 v8 s s v9 s s v10 s s v12 s s |',
      hats: 'r1 | r1 | $h16 $h16',
      fx: 'r1 | r1 | v10 w1 | ^1 |',
    }),
    loopSec('Hook', 8, {
      lead: '$hookA',
      pad: '$padA',
      bass: '$bassA',
      kick: '[$rock $rock2]3 $rock $four',
      snare: '[$back]7 $fill',
      hats: '[$h16]8',
      fx: 'x1 | [r1 |]7',
    }),
    sec('Hook II', 8, {
      lead: '$hookB',
      arp: 'F7 $arpA',
      pad: '$padA',
      bass: '$bassA',
      kick: '[$rock $rock2]4',
      snare: '[$back]7 $fill',
      hats: '[$ride]8',
      fx: 'x1 | [r1 |]7',
    }),
    sec('Chorus', 8, {
      lead: 'V4 $chorus',
      arp: 'F8 $arpB',
      saws: '$padB',
      bass: '$bassB',
      kick: '[$four]8',
      clap: '[$clap]7 r4 c4 c8 c8 c16 c16 c8 |',
      hats: '[$off]8',
      fx: 'x1 | [r1 |]3 x1 | [r1 |]3',
    }),
    sec('Glade', 8, {
      flute: '$glade',
      bell: 'K-3 $bm K4 $bm K-3 $bm K4 $bm K0 $bM K2 $bM K-1 $bM K-1 $bM',
      pad: '$padC',
      bass: 'o2 a1 | e1 | a1 | e1 | c1 | d1 | o1 b1 | b1 |',
      kick: '[$half]8',
      snare: '[$halfS]8',
      hats: '[[r8 v6 h8]4 |]8',
    }),
    sec('Build', 4, {
      lead: 'r1 | r1 | r1 | o5 r2 b8 a8 g8 f+8 |',
      arp: 'K0 F3 $aM K2 F5 $aM K-1 F8 $aM K-1 F11 $aM',
      pad: 'o4 (c e g)1 | (d f+ a)1 | (d+ f+ b)1 | (d+ f+ b)2 r2 |',
      bass: 'K0 $oc K2 $oc K-1 $oc K-1 [o2 c16]8 r2 |',
      kick: '[$four]3 k4 k4 k8 k8 r4 |',
      snare: '[s4]4 | [s8]8 | [s16]16 | l16 v6 s s v7 s s v8 s s v9 s s v10 s s v11 s s v12 s s v14 s s |',
      hats: '$h16 $h16 $h16 r1 |',
      fx: 'r1 | r1 | v11 w1 | ^1 |',
    }),
    sec('Drop', 8, {
      lead: '$hookA',
      lead2: 'K-12 $hookA',
      arp: 'F10 $arpA',
      saws: '$stA',
      bass: '$bassD',
      kick: '[$four]8',
      snare: '[$back]8',
      clap: '[$clap]8',
      hats: '[$off]8',
      fx: 'i4 x2. | [r1 |]3 x1 | [r1 |]3',
    }),
    sec('Chorus II', 8, {
      lead: 'V4 $chorus',
      lead2: 'V3 K-12 $chorus',
      arp: 'F11 $arpB',
      saws: '$padB',
      pad: '$padB',
      bass: '$bassB',
      kick: '[$four]8',
      snare: '[$back]7 $fill',
      clap: '[$clap]8',
      hats: '[$h16]8',
      fx: 'x1 | [r1 |]3 x1 | [r1 |]3',
    }),
  ],
);
