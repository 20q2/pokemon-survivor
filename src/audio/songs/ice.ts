import { arrange, loopSec, sec } from '../score.ts';
import { ARPS, KIT } from './common.ts';

// ───────────── Seafoam Islands: "Frostline" (F♯ minor, 172 bpm) ─────────────
// Liquid drum & bass: a two-step break with ghost snares, a beating reese bass, syncopated
// electric-piano chords, an icy FM-bell hook, then a saw riff for the drop.
// Chords: F♯m7 Dmaj7 A E7 (i VI III VII). Roots for K: F♯ 6, D 2, A -3, E 4, C♯ 1.

export const ice = arrange(
  {
    title: 'Frostline', bpm: 172, key: [6, 'minor'], room: 2.8, delayBeats: 0.75,
    about: 'Seafoam Islands: liquid drum & bass with a reese bass, an icy bell hook and a saw riff drop.',
    macros: {
      ...KIT, ...ARPS,
      hook: 'o5 l8 c+4. o4 a o5 c+4 e4 | f+4. e d4 c+ o4 a | o5 e4. c+ o4 a4 o5 c+4 | o4 b2. r4 | o5 c+4. o4 a o5 c+4 f+4 | a4. g+ f+4 e d | e4. f+ e4 c+4 | e2 c+4 o4 b4 |',
      r1: 'o5 l16 f+8 c+ e f+8 a8 g+ f+ e8 c+8 e8 |',
      r2: 'o5 l16 f+8 d e f+8 a8 o6 d o5 a f+8 d8 e8 |',
      r3: 'o5 l16 e8 c+ d e8 a8 o6 c+ o5 b a8 g+8 e8 |',
      r4: 'o5 l16 g+8 e f+ g+8 b8 a g+ e8 f+8 g+8 |',
      r8: 'o5 l16 e8 g+8 b8 o6 c+ o5 b g+8 e8 f+8 g+8 |',
      riff: '$r1 $r2 $r3 $r4 $r1 $r2 $r3 $r8',
      soar: 'o5 l8 a2 f+4 a4 | b2 g+4 b4 | o6 c+2. o5 b4 | a2 f+2 | a2 o6 d4 c+4 | o5 b2 o6 e4 d4 | c+2 o5 g+2 | g+1 |',

      cF: '(f+ a >c+ e<)', cD: '(f+ a >c+ d<)', cA: '(e a >c+ e<)', cE: '(e g+ b >d<)', cC: '(f g+ >c+ f<)',
      kF: 'o4 ${cF}4. ${cF}8 r8 ${cF}8 r4 |', kD: 'o4 ${cD}8 r8 ${cD}8 r8 r8 ${cD}4. |',
      kA: 'o4 ${cA}4. ${cA}8 r8 ${cA}8 r4 |', kE: 'o4 ${cE}8 r8 ${cE}8 r8 r8 ${cE}4. |',
      keysM: '$kF $kD $kA $kE',
      padM: 'o4 ${cF}1 | ${cD}1 | ${cA}1 | ${cE}1 |',
      padL: 'o4 ${cD}1 | ${cE}1 | ${cF}1 | ${cF}1 | ${cD}1 | ${cE}1 | ${cC}1 | ${cC}1 |',

      rb: 'o2 c4. c8 r8 c8 o3 c8 o2 c8 |',
      bassM: 'K6 $rb K2 $rb K-3 $rb K4 $rb',
      bassL: 'K2 $rb K4 $rb K6 $rb K6 $rb K2 $rb K4 $rb K1 $rb K1 $rb',
      subM: 'o2 f+1 | d1 | o1 a1 | o2 e1 |',
      break: '$dnbK $dnbK2',
      snr: '$dnbS $dnbS2',
    },
  },
  {
    lead: { name: 'Saw lead', inst: 'lead', role: 'lead', init: 'v13 V3', verb: 0.22, delay: 0.2 },
    bell: { name: 'Ice bell', inst: 'bell', init: 'v12', pan: 0.15, verb: 0.4, delay: 0.32 },
    keys: { name: 'E-piano', inst: 'keys', init: 'v11', pan: -0.2, verb: 0.3, delay: 0.12, pump: 0.25 },
    pad: { name: 'Pad', inst: 'pad', init: 'v10', verb: 0.5, pump: 0.3 },
    saws: { name: 'Supersaw', inst: 'supersaw', init: 'v10', verb: 0.35, pump: 0.45 },
    bass: { name: 'Reese', inst: 'reese', role: 'bass', init: 'v12', verb: 0.02, drive: 0.8, pump: 0.2 },
    kick: { name: 'Kick', inst: 'kit', init: 'v14', verb: 0.03 },
    snare: { name: 'Snare', inst: 'kit', init: 'v13', verb: 0.25 },
    hats: { name: 'Shaker & hats', inst: 'kit', init: 'v11', pan: 0.2, verb: 0.08 },
    fx: { name: 'Ride & FX', inst: 'kit', init: 'v11', pan: -0.15, verb: 0.3 },
  },
  [
    sec('Intro', 8, {
      bell: '$hook',
      pad: '$padM $padM',
      bass: 'r1 | r1 | r1 | r1 | $subM',
      hats: 'r1 | r1 | r1 | r1 | [$shk]4',
      snare: 'r1 | r1 | r1 | r1 | r1 | r1 | $roll2',
      fx: 'r1 | r1 | r1 | r1 | r1 | r1 | $rise2',
    }),
    loopSec('Roller', 16, {
      bell: '$hook $hook',
      keys: '[$keysM]4',
      pad: '[$padM]4',
      bass: '[$bassM]4',
      kick: '[$break]8',
      snare: '[$snr]7 $dnbS $fill16',
      hats: '[$shk]16',
      fx: 'x1 | [r1 |]7 x1 | [$ride]7',
    }),
    sec('Lift', 8, {
      lead: 'V4 $soar',
      saws: '$padL',
      keys: 'o4 ${cD}4. ${cD}8 r8 ${cD}8 r4 | ${cE}8 r8 ${cE}8 r8 r8 ${cE}4. | ${cF}4. ${cF}8 r8 ${cF}8 r4 | ${cF}8 r8 ${cF}8 r8 r8 ${cF}4. | ${cD}4. ${cD}8 r8 ${cD}8 r4 | ${cE}8 r8 ${cE}8 r8 r8 ${cE}4. | ${cC}4. ${cC}8 r8 ${cC}8 r4 | ${cC}8 r8 ${cC}8 r8 r8 ${cC}4. |',
      bass: '$bassL',
      kick: '[$break]4',
      snare: '[$snr]3 $dnbS $fill16',
      hats: '[$h16]8',
      fx: 'x1 | [$ride]7',
    }),
    sec('Thaw', 8, {
      bell: '$hook',
      keys: 'o4 [${cF}1 | ${cD}1 | ${cA}1 | ${cE}1 |]2',
      pad: '$padM $padM',
      bass: '$subM $subM',
      snare: 'r1 | r1 | r1 | r1 | r1 | r1 | $roll2',
      fx: 'r1 | r1 | r1 | r1 | $rise4',
    }),
    sec('Drop', 16, {
      lead: '$riff $riff',
      bell: 'r1 | r1 | r1 | r1 | r1 | r1 | r1 | r1 | $hook',
      keys: '[$keysM]4',
      saws: '[$padM]4',
      bass: '[$bassM]4',
      kick: '[$break]8',
      snare: '[$snr]7 $dnbS $fill16',
      hats: '[$shk]16',
      fx: 'i4 x2. | [$ride]7 x1 | [$ride]7',
    }),
  ],
);
