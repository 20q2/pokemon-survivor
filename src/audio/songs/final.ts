import { arrange, loopSec, sec } from '../score.ts';
import { ARPS, KIT } from './common.ts';
import { MOTIF } from './finale.ts';

// ───────────── Final boss: "Legend's End" (C minor, 156 bpm) ─────────────
// The twelve-minute showdown. A sixteenth-note bass ostinato and organ under a new battle
// theme with a Neapolitan D♭ climb, the title's leitmotif in C minor over choir, a frenzy of
// arpeggio runs on double kick, and a last-stand drop that loops back into the battle.
// Roots for K (from C2): A♭ -4, F 5, G -5, E♭ 3, D♭ 1.

export const final = arrange(
  {
    title: "Legend's End", bpm: 156, key: [0, 'harmonic'], room: 2.6,
    about: 'Final boss: the leitmotif in C minor between an organ-driven battle theme and a frenzy of runs.',
    macros: {
      ...KIT, ...ARPS, ...MOTIF,
      os: 'o2 l16 c c o3 c o2 c b c o3 g o2 c c c o3 e- o2 c d c o3 g f |',
      osh: 'o2 l16 c c o3 c o2 c b c o3 g o2 c',
      ostF: 'K0 $os K-4 $os K5 $os K-5 $os K0 $os K-4 $os K1 $os K-5 $os',
      ostM: 'K0 $os K-4 $os K5 $os K-5 $os K0 $os K3 $os K5 $osh K-5 $osh | K0 $os',
      f1: 'o5 l16 c8 e- g c8 e- g o6 c8 o5 b- a- g8 f8 |',
      f2: 'o5 l16 e-8 a- g e-8 c8 a-8 g8 f8 e-8 |',
      f3: 'o5 l16 f8 a- g f8 c8 o6 c8 o5 b- a- g8 f8 |',
      f4: 'o5 l16 g8 b a- g8 d8 b4 o6 d4 |',
      f7: 'o5 l16 f8 a- g f8 d-8 a-8 g8 f8 d-8 |',
      f8: 'o5 l16 b8 o6 c d e-8 d c o5 b8 g8 a-8 b8 |',
      fight: '$f1 $f2 $f3 $f4 $f1 $f2 $f7 $f8',
      fr1: 'o4 l16 a- o5 c f a- o6 c o5 a- f c o4 a- o5 c f a- g8 f8 |',
      fr2: 'o4 l16 g b o5 d f g f d o4 b g b o5 d f g8 f8 |',
      fr3: 'o4 l16 g o5 c e- g o6 c o5 g e- c o4 g o5 c e- g o6 c8 o5 b8 |',
      fr4: 'o6 l16 c o5 b- a- g f e- d c o4 b o5 c d e- f8 g8 |',
      fr7: 'o4 l16 a- o5 c e- a- o6 c o5 a- e- c o4 a- o5 c e- a- g8 f8 |',
      fr8: 'o5 l16 g f e- d c d e- f g a- b o6 c o5 b8 o6 d8 |',
      frenzy: '$fr1 $fr2 $fr3 $fr4 $fr1 $fr2 $fr7 $fr8',

      orgF: 'o3 [(c e- g)8 r8]4 | [(c e- a-)8 r8]4 | [(c f a-)8 r8]4 | [(d g b)8 r8]4 | [(c e- g)8 r8]4 | [(c e- a-)8 r8]4 | [(d- f a-)8 r8]4 | [(d g b)8 r8]4 |',
      chM: 'o4 (c e- g)1 | (c e- a-)1 | (c f a-)1 | (d g b)1 | (c e- g)1 | (e- g b-)1 | (c f a-)2 (d g b)2 | (c e- g)1 |',
      chR: 'o4 (c f a-)1 | (d g b)1 | (c e- g)1 | (c e- g)1 | (c f a-)1 | (d g b)1 | (c e- a-)1 | (d g b)1 |',
      arpR: 'K5 $am16 K7 $aM16 K0 $am16 K0 $am16 K5 $am16 K7 $aM16 K-4 $aM16 K7 $aM16',
      rollM: 'K0 $roll K-4 $roll K5 $roll K-5 $roll K0 $roll K3 $roll K5 $rollh K-5 $rollh | K0 $roll',
    },
  },
  {
    lead: { name: 'Saw lead', inst: 'lead', role: 'lead', init: 'v13 V3', verb: 0.22, delay: 0.15 },
    lead2: { name: 'Square double', inst: 'square', init: 'v10 @1 V2', gain: 0.75, verb: 0.2 },
    bell: { name: 'Bell', inst: 'bell', init: 'v11', pan: 0.2, verb: 0.5, delay: 0.3 },
    organ: { name: 'Organ', inst: 'organ', init: 'v12 V2', pan: -0.15, verb: 0.35 },
    brass: { name: 'Brass', inst: 'brass', init: 'v12', verb: 0.3, pump: 0.25 },
    saws: { name: 'Supersaw', inst: 'supersaw', init: 'v12', verb: 0.3, pump: 0.65 },
    choir: { name: 'Choir', inst: 'choir', init: 'v11 V3', verb: 0.6, pump: 0.25 },
    arp: { name: 'Pluck arp', inst: 'pluck', init: 'v10 F10', pan: 0.2, verb: 0.2, delay: 0.25, pump: 0.4 },
    bass: { name: 'Ostinato', inst: 'bass', role: 'bass', init: 'v12 F9', gain: 0.6, verb: 0.02, drive: 1, pump: 0.25 },
    kick: { name: 'Kick', inst: 'kit', init: 'v15', verb: 0.02 },
    snare: { name: 'Snare', inst: 'kit', init: 'v13', verb: 0.3 },
    clap: { name: 'Clap', inst: 'kit', init: 'v11', verb: 0.3 },
    hats: { name: 'Hats', inst: 'kit', init: 'v11', pan: 0.2, verb: 0.05 },
    fx: { name: 'Toms & FX', inst: 'kit', init: 'v12', verb: 0.45 },
  },
  [
    sec('Omen', 4, {
      bell: 'K-2 $m1 K-2 $m2 r1 | r1 |',
      choir: 'o4 (c e- g)1 | (c e- a-)1 | (c f a-)1 | (d g b)1 |',
      brass: 'o3 (c g >c<)1 | (c a- >c<)1 | (c f a-)1 | (d g b)2 r2 |',
      bass: 'o2 c1 | o1 a-1 | o2 f1 | o1 g1 |',
      kick: 'r1 | r1 | [k4]4 | $dbl',
      snare: 'r1 | r1 | $roll2',
      fx: 'v15 i1 | $tomfill $rise2',
    }),
    loopSec('Battle', 8, {
      lead: '$fight',
      organ: '$orgF',
      bass: '$ostF',
      kick: '[$rock $rock2]4',
      snare: '[$back]7 $fill16',
      hats: '[$h16]8',
      fx: 'x1 | [r1 |]7',
    }),
    sec('Legend', 8, {
      lead: 'K-2 $motif',
      bell: 'K-2 $motif',
      choir: '$chM',
      brass: 'o4 (c e- g)4. (c e- g)8 r2 | (c e- a-)4. (c e- a-)8 r2 | (c f a-)4. (c f a-)8 r2 | (d g b)4. (d g b)8 r4 (d g b)8 (d g b)8 | (c e- g)4. (c e- g)8 r2 | (e- g b-)4. (e- g b-)8 r2 | (c f a-)4 r4 (d g b)4 r4 | (c e- g)4. (c e- g)8 r2 |',
      bass: '$ostM',
      kick: '[$half]7 $four',
      snare: '[$halfS]7 $fill16',
      hats: '[$h8]8',
      fx: 'x1 | [r1 |]3 x1 | [r1 |]3',
    }),
    sec('Frenzy', 8, {
      lead: '$frenzy',
      arp: '$arpR',
      saws: '$chR',
      bass: 'K5 $os K-5 $os K0 $os K0 $os K5 $os K-5 $os K-4 $os K-5 $os',
      kick: '[$dbl]6 [$four]2',
      snare: '[$back]6 $roll2',
      hats: '[$ride]8',
      fx: 'x1 | [r1 |]3 x1 | r1 | $rise2',
    }),
    sec('Last Stand', 8, {
      lead: 'K-2 $motifB',
      lead2: 'K-14 $motifB',
      saws: '$chM',
      choir: '$chM',
      organ: '$orgF',
      arp: 'F13 K0 $am16 K-4 $aM16 K5 $am16 K7 $aM16 K0 $am16 K3 $aM16 K5 $am16h K7 $aM16h | K0 $am16',
      bass: '$rollM',
      kick: '[$four]8',
      snare: '[$back]7 $fill16',
      clap: '[$clap]8',
      hats: '[$off]8',
      fx: 'i4 x2. | [r1 |]3 x1 | [r1 |]2 $tomfill',
    }),
  ],
);
