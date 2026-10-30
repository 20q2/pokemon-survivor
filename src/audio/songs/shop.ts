import { arrange, loopSec, sec } from '../score.ts';
import { KIT } from './common.ts';

// ───────────── Poké Mart: "Bargain Groove" (B♭ major, 112 bpm) ─────────────
// Shop funk: an octave-popping bass, clav chops on the offbeats, an electric piano, a perky
// square tune and brass answers. I–vi–ii–V, then a IV–iii–ii–V bridge.
// Seventh chords are built on C and moved with K: B♭ -2, G -5, C 0, F 5, E♭ 3, D 2.

export const shop = arrange(
  {
    title: 'Bargain Groove', bpm: 112, key: [10, 'major'], room: 1.4, level: 0.75,
    about: 'Poké Mart: funk with an octave-popping bass, clav chops, brass answers and a perky square tune.',
    macros: {
      ...KIT,
      M7: '(c e g b)', m7: '(c e- g b-)', d7: '(c e g b-)',
      clM: 'o4 l16 [r ${M7} r ${M7} r8 ${M7} r]2 |', clm: 'o4 l16 [r ${m7} r ${m7} r8 ${m7} r]2 |', cld: 'o4 l16 [r ${d7} r ${d7} r8 ${d7} r]2 |',
      cldh: 'o4 l16 r ${d7} r ${d7} r8 ${d7} r', clmh: 'o4 l16 r ${m7} r ${m7} r8 ${m7} r',
      clavA: 'K-2 $clM K-5 $clm K0 $clm K5 $cld K-2 $clM K-5 $clm K0 $clmh K5 $cldh | K-2 $clM',
      clavB: 'K3 $clM K2 $clm K0 $clm K5 $cld K3 $clM K2 $clm K-5 $clmh K0 $cldh | K5 $cld',
      epA: 'K-2 o4 ${M7}1 | K-5 ${m7}1 | K0 ${m7}1 | K5 ${d7}1 | K-2 ${M7}1 | K-5 ${m7}1 | K0 ${m7}2 K5 ${d7}2 | K-2 ${M7}1 |',
      epB: 'K3 o4 ${M7}1 | K2 ${m7}1 | K0 ${m7}1 | K5 ${d7}1 | K3 ${M7}1 | K2 ${m7}1 | K-5 ${m7}2 K0 ${d7}2 | K5 ${d7}1 |',
      fk: 'o2 l16 c r r c o3 c r o2 c r c r o3 c c r o2 g b- o3 c |',
      fkh: 'o2 l16 c r r c o3 c r o2 c r',
      bassA: 'K-2 $fk K-5 $fk K0 $fk K5 $fk K-2 $fk K-5 $fk K0 $fkh K5 $fkh | K-2 $fk',
      bassB: 'K3 $fk K2 $fk K0 $fk K5 $fk K3 $fk K2 $fk K-5 $fkh K0 $fkh | K5 $fk',
      s1: 'o5 l16 d8 f8 r8 a8 b-8 o6 c d o5 b-8 g8 |',
      s2: 'o5 l16 g8 b-8 r8 a8 g8 f d f8 g8 |',
      s3: 'o5 l16 e-8 g8 r8 f8 e-8 d c d8 e-8 |',
      s4: 'o5 l16 f8 a8 o6 c8 e-8 d4 c4 |',
      s7: 'o5 l16 e-8 g8 b-8 a8 o6 c8 o5 a8 f8 e-8 |',
      s8: 'o5 l16 d4 b-8 f8 d4 r4 |',
      tune: '$s1 $s2 $s3 $s4 $s1 $s2 $s7 $s8',
      answer: 'o5 l8 g4. b- o6 e-4 d4 | d4. c o5 a4 f4 | g4. f e-4 c4 | f4 a4 o6 c4 e-4 | o5 g4. a b-4 o6 e-4 | f4. e d4 o5 a4 | b-4 g4 e4 g4 | a4 c4 f4 r4 |',
      brassB: 'K3 o4 ${M7}8 r8 r4 ${M7}8 r8 r4 | K2 ${m7}8 r8 r4 ${m7}8 r8 r4 | K0 ${m7}8 r8 r4 ${m7}8 r8 r4 | K5 ${d7}8 r8 ${d7}8 r8 ${d7}4 r4 | K3 ${M7}8 r8 r4 ${M7}8 r8 r4 | K2 ${m7}8 r8 r4 ${m7}8 r8 r4 | K-5 ${m7}8 r8 r4 K0 ${d7}8 r8 r4 | K5 ${d7}8 r8 ${d7}8 r8 ${d7}4 r4 |',
      funk: 'k8. k16 r4 r8 k8 r4 |',
    },
  },
  {
    lead: { name: 'Square tune', inst: 'square', role: 'lead', init: 'v12 @1 V2', verb: 0.2, delay: 0.12 },
    clav: { name: 'Clav', inst: 'harp', init: 'v11 @1 q4', gain: 1.8, pan: 0.25, verb: 0.15 },
    keys: { name: 'E-piano', inst: 'keys', init: 'v10', pan: -0.2, verb: 0.3 },
    brass: { name: 'Brass', inst: 'brass', init: 'v11', gain: 1.6, verb: 0.25 },
    bass: { name: 'Funk bass', inst: 'bass', role: 'bass', init: 'v12 F9 q5', verb: 0.03 },
    kick: { name: 'Kick', inst: 'kit', init: 'v13', verb: 0.03 },
    snare: { name: 'Snare', inst: 'kit', init: 'v11', verb: 0.2 },
    hats: { name: 'Hats', inst: 'kit', init: 'v11', pan: 0.2, verb: 0.05 },
  },
  [
    sec('Doors', 2, {
      bass: 'K-2 $fk K5 $fk',
      kick: '[$funk]2',
      snare: 'r1 | r4 s4 l16 v8 s s v10 s s v12 s s s s |',
      hats: '[$h16]2',
    }),
    loopSec('Browse', 8, {
      lead: '$tune',
      keys: '$epA',
      bass: '$bassA',
      kick: '[$funk]8',
      snare: '[$dnbS]7 $fill',
      hats: '[$h16]8',
    }),
    sec('Browse II', 8, {
      lead: '$tune',
      clav: '$clavA',
      keys: '$epA',
      bass: '$bassA',
      kick: '[$funk]8',
      snare: '[$dnbS]7 $fill16',
      hats: '[$h16]8',
    }),
    sec('Haggle', 8, {
      lead: '$answer',
      brass: '$brassB',
      clav: '$clavB',
      keys: '$epB',
      bass: '$bassB',
      kick: '[$funk]8',
      snare: '[$dnbS]7 $fill',
      hats: '[$off]8',
    }),
    sec('Checkout', 8, {
      lead: '$tune',
      clav: '$clavA',
      brass: 'K-2 o4 ${M7}8 r8 r4 r2 | r1 | r1 | K5 ${d7}8 r8 ${d7}8 r8 ${d7}4 r4 | K-2 ${M7}8 r8 r4 r2 | r1 | r1 | K-2 ${M7}4 r4 ${M7}4 r4 |',
      keys: '$epA',
      bass: '$bassA',
      kick: '[$funk]8',
      snare: '[$dnbS]7 $fill16',
      hats: '[$h16]8',
    }),
  ],
);
