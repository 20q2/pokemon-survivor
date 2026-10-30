import { arrange, loopSec, sec } from '../score.ts';
import { ARPS, KIT } from './common.ts';

// ───────────── Boss: "Apex Predator" (G harmonic minor, 172 bpm) ─────────────
// A raid boss every three minutes: a relentless sixteenth-note bass ostinato, an alarm-like
// square lead, brass hits, then a heroic answer on the relative major and a half-time rage
// section that builds straight back in.
// Roots for K (from G2): E♭ -4, D -5, C -7, F -2, B♭ 3.

export const boss = arrange(
  {
    title: 'Apex Predator', bpm: 172, key: [7, 'harmonic'], room: 1.6,
    about: 'Boss battles: a relentless sixteenth-note ostinato under an alarm-like square lead.',
    macros: {
      ...KIT, ...ARPS,
      os: 'o2 l16 g g o3 g o2 g f+ g o3 d o2 g g g o3 b- o2 g a g o3 d c |',
      osh: 'o2 l16 g g o3 g o2 g f+ g o3 d o2 g',
      ostA: 'K0 $os K0 $os K-4 $os K-5 $os K0 $os K0 $os K-4 $osh K-2 $osh | K-5 $os',
      ostB: 'K-7 $os K-5 $os K0 $os K-4 $os K-7 $os K-5 $os K-4 $os K-5 $os',
      a1: 'o5 l16 g8 g8 b-8 g8 o6 d8 c8 o5 b-8 a8 |',
      a2: 'o5 l16 b-8 a g f+8 g8 d4 r4 |',
      a3: 'o5 l16 g8 g8 b-8 g8 o6 e-8 d8 c8 o5 b-8 |',
      a4: 'o5 l16 a8 f+ g a8 d8 f+4 a4 |',
      a7: 'o5 l16 g8 b-8 o6 e-8 d8 c8 o5 a8 o6 c8 f8 |',
      a8: 'o6 l16 f+4 e- d c o5 b- a8 f+8 d8 r8 |',
      alarm: '$a1 $a2 $a3 $a4 $a1 $a2 $a7 $a8',
      hero: 'o5 l8 g4. f g4 e-4 | f+4. g a4 d4 | b-4. a g4 d4 | e-2 g4 b-4 | o6 c4. o5 b- a4 g4 | a4. b- o6 c4 d4 | e-4. d c4 o5 b-4 | a2 f+4 d4 |',

      hitA: 'o4 (g b- >d<)8 r8 r4 r8 (g b- >d<)8 r4 | (g b- >d<)8 r8 r4 r8 (g b- >d<)8 (g b- >d<)8 r8 | (g b- >e-<)8 r8 r4 r8 (g b- >e-<)8 r4 | (f+ a >d<)8 r8 r4 (f+ a >d<)8 (f+ a >d<)8 (f+ a >d<)8 r8 |',
      chA: 'o4 (g b- >d<)1 | (g b- >d<)1 | (g b- >e-<)1 | (f+ a >d<)1 | (g b- >d<)1 | (g b- >d<)1 | (g b- >e-<)2 (a >c f<)2 | (f+ a >d<)1 |',
      chB: 'o4 (g >c e-<)1 | (f+ a >d<)1 | (g b- >d<)1 | (g b- >e-<)1 | (g >c e-<)1 | (f+ a >d<)1 | (g b- >e-<)1 | (f+ a >d<)1 |',
      arpA: 'K7 $am16 K7 $am16 K3 $aM16 K2 $aM16 K7 $am16 K7 $am16 K3 $aM16h K5 $aM16h | K2 $aM16',
    },
  },
  {
    lead: { name: 'Alarm lead', inst: 'square', role: 'lead', init: 'v13 @2 V3', verb: 0.18, delay: 0.12 },
    lead2: { name: 'Saw double', inst: 'lead', init: 'v10 V2', gain: 0.7, verb: 0.2 },
    brass: { name: 'Brass hits', inst: 'brass', init: 'v13', verb: 0.3 },
    saws: { name: 'Supersaw', inst: 'supersaw', init: 'v10', verb: 0.3, pump: 0.55 },
    arp: { name: 'Pluck arp', inst: 'pluck', init: 'v10 F10', pan: -0.2, verb: 0.2, delay: 0.2, pump: 0.4 },
    bass: { name: 'Ostinato', inst: 'bass', role: 'bass', init: 'v12 F9', gain: 0.6, verb: 0.02, drive: 0.8, pump: 0.2 },
    kick: { name: 'Kick', inst: 'kit', init: 'v15', verb: 0.02 },
    snare: { name: 'Snare', inst: 'kit', init: 'v13', verb: 0.25 },
    clap: { name: 'Clap', inst: 'kit', init: 'v11', verb: 0.25 },
    hats: { name: 'Hats', inst: 'kit', init: 'v11', pan: 0.2, verb: 0.05 },
    fx: { name: 'Toms & FX', inst: 'kit', init: 'v12', verb: 0.4 },
  },
  [
    sec('Alarm', 2, {
      brass: 'o4 (g b- >d<)8 r8 (g b- >d<)8 r8 (g b- >d<)4 r4 | (f+ a >d<)8 r8 (f+ a >d<)8 r8 (f+ a >d<)2 |',
      bass: '$os K-5 $os',
      kick: 'k8 r8 k8 r8 k4 r4 | k8 r8 k8 r8 l16 k k k k k k k k |',
      snare: 'r1 | r2 l16 v9 s s v10 s s v12 s s v14 s s |',
      fx: 'v14 i1 | r1 |',
    }),
    loopSec('Hunt', 8, {
      lead: '$alarm',
      brass: '$hitA $hitA',
      arp: '$arpA',
      bass: '$ostA',
      kick: '[$rock $rock2]4',
      snare: '[$back]7 $fill16',
      hats: '[$h16]8',
      fx: 'x1 | [r1 |]7',
    }),
    sec('Hunt II', 8, {
      lead: '$alarm',
      lead2: 'K-12 $alarm',
      saws: '$chA',
      arp: 'F12 $arpA',
      bass: '$ostA',
      kick: '[$four]8',
      snare: '[$back]8',
      clap: '[$clap]7 $fill16',
      hats: '[$off]8',
      fx: 'x1 | [r1 |]3 x1 | [r1 |]3',
    }),
    sec('Stand', 8, {
      lead: 'V4 $hero',
      saws: '$chB',
      brass: 'o4 (g >c e-<)4. (g >c e-<)8 r2 | (f+ a >d<)4. (f+ a >d<)8 r2 | (g b- >d<)4. (g b- >d<)8 r2 | (g b- >e-<)4. (g b- >e-<)8 r2 | (g >c e-<)4. (g >c e-<)8 r2 | (f+ a >d<)4. (f+ a >d<)8 r2 | (g b- >e-<)4. (g b- >e-<)8 r2 | (f+ a >d<)4 r4 (f+ a >d<)4 r4 |',
      bass: '$ostB',
      kick: '[$four]8',
      snare: '[$back]7 $fill16',
      clap: '[$clap]8',
      hats: '[$h16]8',
      fx: 'x1 | [r1 |]3 x1 | [r1 |]3',
    }),
    sec('Rage', 8, {
      brass: '$hitA $hitA',
      arp: 'F5 K7 $am16 F6 K7 $am16 F7 K3 $aM16 F8 K2 $aM16 F9 K7 $am16 F11 K7 $am16 F13 K3 $aM16 F15 K2 $aM16',
      bass: 'K0 $os K0 $os K-4 $os K-5 $os K0 $os K0 $os K-4 $os K-5 $os',
      kick: '[$half]4 [$four]2 $dbl $dbl',
      snare: '[$halfS]4 $roll4',
      hats: '[$h8]8',
      fx: 'v14 i1 | r1 | r1 | $tomfill r1 | r1 | $rise2',
    }),
  ],
);
