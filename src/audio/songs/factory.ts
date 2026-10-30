import { arrange, loopSec, sec } from '../score.ts';
import { ARPS, KIT } from './common.ts';

// ───────────── Power Plant: "Overcharge" (E minor, 132 bpm) ─────────────
// Acid electro: a 303-style line (accents with v, slides with G) whose filter opens over the
// groove, a robotic square riff, offbeat stabs, then a chorus where the acid follows the chords.
// Chorus chords: Em C G D | Em C Am B. Roots for K (from E2): C -4, G 3, D -2, A -7, B -5.

export const factory = arrange(
  {
    title: 'Overcharge', bpm: 132, key: [4, 'harmonic'], room: 1.5, delayBeats: 0.75,
    about: 'Power Plant: acid electro with a sliding 303 line, a robotic square riff and an anthem chorus.',
    macros: {
      ...KIT, ...ARPS,
      acid1: 'o2 l16 v14 e v9 e G4 o3 e G0 o2 e v14 g r v9 e G4 o3 d G0 o2 v14 e v9 e a G4 g G0 o3 v14 e r o2 v10 b o3 d |',
      acid2: 'o2 l16 v14 e v9 e r e v14 o3 e v9 o2 e g a v14 b v9 a G4 g G0 e v14 o3 d v9 o2 b G4 a G0 g |',
      acidE: '$acid1 $acid2',
      acidC: 'K0 $acid1 K-4 $acid2 K3 $acid1 K-2 $acid2 K0 $acid1 K-4 $acid2 K-7 $acid1 K-5 $acid2',
      riff1: 'o5 l16 e e o6 e o5 e d e g e f+ e d e o4 b o5 d e8 |',
      riff2: 'o5 l16 e e o6 e o5 e d e g e a g f+ e d o4 b o5 e8 |',
      riff: '$riff1 $riff2',
      chorus: 'o5 l8 b4. a g4 e4 | g4. f+ e4 c4 | d4. e g4 b4 | a2 f+4 d4 | b4. a g4 b4 | o6 c4. o5 b g4 e4 | a4. b o6 c4 e4 | o5 d+2 f+4 b4 |',

      stE: 'o4 [r8 (e g b)8]4 |', stEF: 'o4 [r8 (e g b)8]3 r8 (f a >c<)8 |',
      stC: 'o4 [r8 (e g b)8]4 | [r8 (e g >c<)8]4 | [r8 (d g b)8]4 | [r8 (d f+ a)8]4 | [r8 (e g b)8]4 | [r8 (e g >c<)8]4 | [r8 (e a >c<)8]4 | [r8 (d+ f+ b)8]4 |',
      padC: 'o4 (e g b)1 | (e g >c<)1 | (d g b)1 | (d f+ a)1 | (e g b)1 | (e g >c<)1 | (e a >c<)1 | (d+ f+ b)1 |',
      grooveK: '[$four]',
    },
  },
  {
    lead: { name: 'Anthem lead', inst: 'lead', role: 'lead', init: 'v13 V3', verb: 0.2, delay: 0.18 },
    riff: { name: 'Robot riff', inst: 'square', init: 'v11 @0', pan: 0.15, verb: 0.15, delay: 0.3 },
    acid: { name: 'Acid 303', inst: 'acid', role: 'bass', init: 'F6', verb: 0.05, delay: 0.1, drive: 1.6, pump: 0.25 },
    stab: { name: 'Stabs', inst: 'stab', init: 'v11', pan: -0.15, verb: 0.25, delay: 0.15, pump: 0.4 },
    saws: { name: 'Supersaw', inst: 'supersaw', init: 'v10', verb: 0.3, pump: 0.6 },
    pad: { name: 'Pad', inst: 'pad', init: 'v9', verb: 0.45, pump: 0.5 },
    kick: { name: 'Kick', inst: 'kit', init: 'v15', verb: 0.02 },
    clap: { name: 'Clap', inst: 'kit', init: 'v12', verb: 0.25 },
    hats: { name: 'Hats', inst: 'kit', init: 'v12', pan: 0.2, verb: 0.05 },
    ride: { name: 'Ride & toms', inst: 'kit', init: 'v11', pan: -0.2, verb: 0.15 },
    fx: { name: 'Cymbals & FX', inst: 'kit', init: 'v12', verb: 0.35 },
  },
  [
    sec('Power-up', 8, {
      acid: 'F2 $acid1 F3 $acid2 F4 $acid1 F5 $acid2 F5 $acid1 F6 $acid2 F7 $acid1 F8 $acid2',
      hats: 'r1 | r1 | r1 | r1 | [$off]4',
      kick: 'r1 | r1 | r1 | r1 | r1 | r1 | $four [k4]2 k8 k8 l16 k k k k |',
      ride: 'r1 | r1 | r1 | r1 | r1 | r1 | r1 | $tomfill',
      fx: 'r1 | r1 | r1 | r1 | r1 | r1 | $rise2',
    }),
    loopSec('Groove', 16, {
      acid: 'F6 $acidE F7 $acidE F8 $acidE F9 $acidE F10 $acidE F10 $acidE F11 $acidE F12 $acidE',
      riff: 'r1 | r1 | r1 | r1 | r1 | r1 | r1 | r1 | [$riff]4',
      stab: '[$stE $stE $stE $stEF]4',
      kick: '[$four]16',
      clap: '[$clap]16',
      hats: '[$off]8 [$h16]8',
      ride: 'r1 | r1 | r1 | r1 | [$ride]12',
      fx: 'x1 | [r1 |]7 x1 | [r1 |]7',
    }),
    sec('Chorus', 8, {
      lead: '$chorus',
      acid: 'F10 $acidC',
      saws: '$padC',
      stab: '$stC',
      kick: '[$four]8',
      clap: '[$clap]8',
      hats: '[$h16]8',
      ride: '[$ride]8',
      fx: 'x1 | [r1 |]3 x1 | [r1 |]3',
    }),
    sec('Meltdown', 8, {
      acid: 'F2 $acid1 F4 $acid2 F6 $acid1 F8 $acid2 F10 $acid1 F12 $acid2 F14 $acid1 F15 $acid2',
      pad: 'o4 (e g b)1 | (e g b)1 | (e g >c<)1 | (e g >c<)1 | (e g b)1 | (e g b)1 | (d+ f+ b)1 | (d+ f+ b)1 |',
      kick: 'r1 | r1 | r1 | r1 | [$four]3 k4 k4 k8 k8 r4 |',
      clap: 'r1 | r1 | r1 | r1 | r1 | r1 | $roll2',
      hats: '[[r8 v7 h8]4 |]8',
      ride: 'r1 | r1 | r1 | r1 | r1 | r1 | $tomfill $tomfill',
      fx: 'r1 | r1 | r1 | r1 | $rise4',
    }),
    sec('Overload', 16, {
      lead: 'r1 | r1 | r1 | r1 | r1 | r1 | r1 | r1 | $chorus',
      riff: '[$riff]4 r1 | r1 | r1 | r1 | r1 | r1 | r1 | r1 |',
      acid: 'F13 $acidE $acidE $acidE $acidE F12 $acidC',
      stab: '[$stE $stE $stE $stEF]2 $stC',
      saws: 'r1 | r1 | r1 | r1 | r1 | r1 | r1 | r1 | $padC',
      kick: '[$four]16',
      clap: '[$clap]16',
      hats: '[$off]8 [$h16]8',
      ride: '[$ride]16',
      fx: 'i4 x2. | [r1 |]7 x1 | [r1 |]7',
    }),
  ],
);
