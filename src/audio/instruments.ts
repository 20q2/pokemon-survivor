/**
 * Instrument presets. The chip voices are the original Game Boy-style ones (pulse with duty and
 * the E envelopes, stepped triangle, LFSR noise kit) and are also what the sound effects use.
 * The synth voices are subtractive (detuned oscillators → resonant filter with an envelope →
 * ADSR amp) or 2-operator FM, and the kit is a modern drum machine.
 */

export type Wave = 'saw' | 'square' | 'tri' | 'sine' | 'pulse' | 'organ';

export interface SynthInst {
  kind: 'synth';
  wave: Wave;
  /** Unison oscillators, spread over `detune` cents in total. */
  voices?: number;
  detune?: number;
  /** Pan alternate unison voices left and right. */
  wide?: boolean;
  /** Sine one octave down, at this level. */
  sub?: number;
  /** Lowpass cutoff (Hz) at brightness F8, its resonance, and the envelope's sweep in octaves (scaled by velocity). */
  cutoff: number;
  q?: number;
  env?: number;
  fdecay?: number;
  a: number; d: number; s: number; r: number;
  gain: number;
  /** Chords sound as a block (otherwise the first note only). */
  poly?: boolean;
}

export interface FmInst {
  kind: 'fm';
  /** Modulator frequency ratio, peak index (in multiples of the carrier) and how fast it decays. */
  ratio: number;
  index: number;
  idecay: number;
  a: number; d: number; s: number; r: number;
  gain: number;
}

export type Inst = SynthInst | FmInst | { kind: 'chip' } | { kind: 'chiptri' } | { kind: 'chipkit' } | { kind: 'kit' };

export const INSTRUMENTS = {
  /** Game Boy pulse: duty from @, envelope from E, chords arpeggiate. */
  chip: { kind: 'chip' },
  chiptri: { kind: 'chiptri' },
  chipkit: { kind: 'chipkit' },
  kit: { kind: 'kit' },

  // ── leads ──
  /** Three detuned saws, bright and singing: the main hook voice. */
  lead: { kind: 'synth', wave: 'saw', voices: 3, detune: 16, wide: true, cutoff: 3800, q: 0.9, env: 1.1, fdecay: 0.3, a: 0.004, d: 0.3, s: 0.8, r: 0.14, gain: 0.24 },
  /** Fat pulse lead (duty from @): the chiptune lead grown up. */
  square: { kind: 'synth', wave: 'pulse', voices: 2, detune: 9, wide: true, cutoff: 5200, q: 0.6, env: 0.6, fdecay: 0.2, a: 0.003, d: 0.25, s: 0.8, r: 0.1, gain: 0.4 },
  /** Huge unison saw wall for anthems; plays chords. */
  supersaw: { kind: 'synth', wave: 'saw', voices: 4, detune: 36, wide: true, cutoff: 5000, q: 0.5, env: 0.7, fdecay: 0.45, a: 0.008, d: 0.4, s: 0.75, r: 0.25, gain: 0.14, poly: true },
  /** Breathy sine lead with vibrato: ocarina / flute. */
  flute: { kind: 'synth', wave: 'sine', cutoff: 9000, a: 0.03, d: 0.2, s: 0.85, r: 0.12, gain: 0.22 },

  // ── keys, plucks, bells ──
  /** Short filtered saw blip for arpeggios. */
  pluck: { kind: 'synth', wave: 'saw', voices: 2, detune: 10, wide: true, cutoff: 650, q: 2.5, env: 3.4, fdecay: 0.13, a: 0.002, d: 0.26, s: 0, r: 0.1, gain: 0.18, poly: true },
  /** Harpsichord-ish thin pulse pluck (duty from @). */
  harp: { kind: 'synth', wave: 'pulse', voices: 2, detune: 6, wide: true, cutoff: 7000, q: 0.5, env: 0.5, fdecay: 0.2, a: 0.001, d: 0.55, s: 0, r: 0.09, gain: 0.2, poly: true },
  /** Glassy FM bell. */
  bell: { kind: 'fm', ratio: 3.5, index: 2.4, idecay: 0.45, a: 0.002, d: 1.1, s: 0, r: 0.35, gain: 0.16 },
  /** Electric-piano FM tine. */
  keys: { kind: 'fm', ratio: 1, index: 2.4, idecay: 0.35, a: 0.002, d: 0.9, s: 0.25, r: 0.25, gain: 0.26 },
  /** Drawbar organ (8' 4' 2 2/3' 2'). */
  organ: { kind: 'synth', wave: 'organ', cutoff: 6000, a: 0.008, d: 0.1, s: 1, r: 0.07, gain: 0.16, poly: true },

  // ── pads, chords ──
  pad: { kind: 'synth', wave: 'saw', voices: 3, detune: 22, wide: true, cutoff: 1500, q: 0.7, env: 0.6, fdecay: 1.2, a: 0.35, d: 0.8, s: 0.85, r: 0.8, gain: 0.075, poly: true },
  /** Resonant "aah" pad. */
  choir: { kind: 'synth', wave: 'saw', voices: 3, detune: 14, wide: true, cutoff: 1100, q: 3.5, env: 0.3, fdecay: 0.6, a: 0.22, d: 0.5, s: 0.9, r: 0.6, gain: 0.085, poly: true },
  /** Punchy chord stab. */
  stab: { kind: 'synth', wave: 'saw', voices: 3, detune: 20, wide: true, cutoff: 1100, q: 1.6, env: 2.6, fdecay: 0.12, a: 0.002, d: 0.2, s: 0.15, r: 0.09, gain: 0.2, poly: true },
  /** Synth brass: slower filter swell. */
  brass: { kind: 'synth', wave: 'saw', voices: 2, detune: 12, wide: true, cutoff: 850, q: 1, env: 1.7, fdecay: 0.28, a: 0.025, d: 0.3, s: 0.7, r: 0.16, gain: 0.18, poly: true },
  /** Distorted power chords (put drive on the track). */
  guitar: { kind: 'synth', wave: 'saw', voices: 2, detune: 14, wide: true, cutoff: 2400, q: 1.2, env: 0.8, fdecay: 0.15, a: 0.002, d: 0.3, s: 0.75, r: 0.06, gain: 0.07, poly: true },

  // ── basses ──
  /** Saw bass with a sine sub and a plucky filter. */
  bass: { kind: 'synth', wave: 'saw', sub: 0.5, cutoff: 650, q: 1.6, env: 1.9, fdecay: 0.15, a: 0.003, d: 0.25, s: 0.6, r: 0.05, gain: 0.2 },
  /** Pure sub. */
  sub: { kind: 'synth', wave: 'sine', cutoff: 20000, a: 0.006, d: 0.1, s: 0.95, r: 0.06, gain: 0.34 },
  /** Two slowly beating saws plus sub: drum & bass reese. */
  reese: { kind: 'synth', wave: 'saw', voices: 2, detune: 28, sub: 0.8, cutoff: 800, q: 1.1, env: 0.8, fdecay: 0.35, a: 0.005, d: 0.3, s: 0.9, r: 0.06, gain: 0.07 },
  /** 303-style resonant acid line (accent with v, slide with G). */
  acid: { kind: 'synth', wave: 'saw', cutoff: 240, q: 13, env: 3.6, fdecay: 0.19, a: 0.002, d: 0.3, s: 0.55, r: 0.03, gain: 0.16 },
  /** Aggressive square + saw bass for riffs (drive it). */
  growl: { kind: 'synth', wave: 'square', voices: 2, detune: 16, sub: 0.5, cutoff: 1500, q: 1.4, env: 1.2, fdecay: 0.11, a: 0.002, d: 0.25, s: 0.75, r: 0.05, gain: 0.08 },
} satisfies Record<string, Inst>;

export type InstName = keyof typeof INSTRUMENTS;

export const isKitInst = (n: InstName) => INSTRUMENTS[n].kind === 'kit' || INSTRUMENTS[n].kind === 'chipkit';
