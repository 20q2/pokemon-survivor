import { arrange, loopSec, sec } from '../score.ts';
import { KIT } from './common.ts';

// ───────────── Results: "Afterglow" (F major, 96 bpm) ─────────────
// After the run: lo-fi electric piano on sevenths, a soft head-nod beat, a warm bass and a flute
// tune, with a bell countermelody on the way round.
// Roots for K (from C2): F 5, A -3, B♭ -2, D 2, G -5.

export const menu = arrange(
  {
    title: 'Afterglow', bpm: 96, key: [5, 'major'], room: 2.4, level: 0.7,
    about: 'Run results: lo-fi electric piano, a soft head-nod beat and a flute tune to catch your breath.',
    macros: {
      ...KIT,
      cF: '(f a >c e<)', cAm: '(e g a >c<)', cBb: '(f a b- >d<)', cC: '(e g b- >d<)', cDm: '(f a >c d<)', cGm: '(f g b- >d<)',
      kA: 'o4 ${cF}2 r8 ${cF}8 r4 | ${cAm}2 r8 ${cAm}8 r4 | ${cBb}2 r8 ${cBb}8 r4 | ${cC}2 r8 ${cC}8 r4 |',
      kB: 'o4 ${cDm}2 r8 ${cDm}8 r4 | ${cGm}2 r8 ${cGm}8 r4 | ${cBb}2 r8 ${cBb}8 r4 | ${cC}2 r8 ${cC}8 r4 | ${cDm}2 r8 ${cDm}8 r4 | ${cGm}2 r8 ${cGm}8 r4 | ${cBb}4 r4 ${cC}4 r4 | ${cF}2 r8 ${cF}8 r4 |',
      tuneA: 'o5 l8 c4 a4 g f e f | e2 c4 e4 | d4. c d4 f4 | e2. r4 | c4 a4 o6 c o5 b- a g | a4. g e4 c4 | d4 f4 b-4 a4 | g2 e4 c4 |',
      tuneB: 'o5 l8 f4. e d4 a4 | b-2 a4 g4 | f4. g f4 d4 | e2 g4 o6 c4 | d4. c o5 a4 f4 | g4. a b-4 o6 d4 | d4 c4 o5 b-4 g4 | a2. r4 |',
      lo: 'o2 c4. c8 r8 g8 o3 c4 |',
      bassA: 'K5 $lo K-3 $lo K-2 $lo K0 $lo',
      bassB: 'K2 $lo K-5 $lo K-2 $lo K0 $lo K2 $lo K-5 $lo K-2 o2 c4 r4 K0 o2 c4 r4 | K5 $lo',
      nod: 'k4 r8 k8 r4 r8 k8 |',
      bellA: 'o6 l8 r2 c4 o5 a4 | r2 g4 e4 | r2 f4 d4 | r2 g4 e4 |',
    },
  },
  {
    flute: { name: 'Flute', inst: 'flute', role: 'lead', init: 'v12 V3', verb: 0.35, delay: 0.25 },
    bell: { name: 'Bell', inst: 'bell', init: 'v8', pan: 0.3, verb: 0.45, delay: 0.3 },
    keys: { name: 'E-piano', inst: 'keys', init: 'v12', pan: -0.15, verb: 0.3, delay: 0.1 },
    pad: { name: 'Pad', inst: 'pad', init: 'v8 F6', verb: 0.5 },
    bass: { name: 'Bass', inst: 'bass', role: 'bass', init: 'v12 F5', verb: 0.03 },
    kick: { name: 'Kick', inst: 'kit', init: 'v11', verb: 0.03 },
    snare: { name: 'Snare', inst: 'kit', init: 'v9', verb: 0.3 },
    hats: { name: 'Hats', inst: 'kit', init: 'v9', pan: 0.2, verb: 0.1 },
  },
  [
    sec('Intro', 2, {
      keys: 'o4 ${cBb}2 r8 ${cBb}8 r4 | ${cC}2 r8 ${cC}8 r4 |',
      bass: 'r1 | r2 o2 c4 r4 |',
    }),
    loopSec('Tune', 8, {
      flute: '$tuneA',
      keys: '$kA $kA',
      bass: '$bassA $bassA',
      kick: '[$nod]8',
      snare: '[$back]8',
      hats: '[$h8]8',
    }),
    sec('Bridge', 8, {
      flute: '$tuneB',
      keys: '$kB',
      pad: 'o4 ${cDm}1 | ${cGm}1 | ${cBb}1 | ${cC}1 | ${cDm}1 | ${cGm}1 | ${cBb}2 ${cC}2 | ${cF}1 |',
      bass: '$bassB',
      kick: '[$nod]8',
      snare: '[$back]7 $fill',
      hats: '[$h16]8',
    }),
    sec('Tune II', 8, {
      flute: '$tuneA',
      bell: '$bellA $bellA',
      keys: '$kA $kA',
      pad: 'o4 [${cF}1 | ${cAm}1 | ${cBb}1 | ${cC}1 |]2',
      bass: '$bassA $bassA',
      kick: '[$nod]8',
      snare: '[$back]8',
      hats: '[$h16]8',
    }),
  ],
);
