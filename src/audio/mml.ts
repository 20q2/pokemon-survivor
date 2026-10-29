/**
 * A small MML (Music Macro Language) dialect for hand-written chiptune scores.
 *
 *   o4 l8 v12 @2      octave, default length, volume 0-15, duty (0=12.5% 1=25% 2=50% 3=75%)
 *   c d+ e- f#4. g16  notes (+/# sharp, - flat), optional length and dots
 *   r4  ^8            rest; tie (extend the previous note)
 *   < >               octave down / up
 *   q6                gate: sounding part of each note in eighths (8 = legato)
 *   V3                vibrato depth (0 = off), delayed so short notes stay clean
 *   E0 E1 E2          envelope: 0 organ, 1 plucked decay, 2 soft decay to a sustain
 *   (c e g)4          fast arpeggio chord (cycles the notes like old sound chips)
 *   [ ... ]3          repeat
 *   $name             macro from the song's macro table (expanded before parsing)
 *   |                 bar line (checked by tests, ignored when playing)
 *   L                 loop point: everything before it plays once
 * Drum channel letters: k kick, s snare, h hat, p open hat, x crash, t tom (with lengths).
 */

export const TICKS_PER_WHOLE = 192;

export type Drum = 'k' | 's' | 'h' | 'p' | 'x' | 't';

export interface MmlNote {
  tick: number;
  dur: number;          // ticks, gate applied
  len: number;          // ticks, full step length
  midi: number[];       // one pitch, or several for an arpeggio chord
  vol: number;          // 0..1
  duty: number;
  vib: number;
  env: number;
  drum?: Drum;
}

export interface MmlTrack {
  notes: MmlNote[];
  length: number;       // total ticks
  loopTick: number;     // where the loop restarts
  bars: number[];       // tick length of each |-delimited bar (for validation)
}

const NOTE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function expandMacros(src: string, macros: Record<string, string> = {}, depth = 0): string {
  if (depth > 8) throw new Error('macro recursion too deep');
  return src.replace(/\$([A-Za-z0-9_]+)/g, (_, name: string) => {
    const m = macros[name];
    if (m === undefined) throw new Error(`unknown macro $${name}`);
    return expandMacros(m, macros, depth + 1);
  });
}

function expandRepeats(src: string): string {
  // innermost first
  const re = /\[([^[\]]*)\](\d*)/;
  let s = src;
  for (let guard = 0; re.test(s) && guard < 1000; guard++) {
    s = s.replace(re, (_, body: string, n: string) => Array(Math.max(1, +(n || 2))).fill(body).join(' '));
  }
  return s;
}

export function parseMml(src: string, macros: Record<string, string> = {}, drums = false): MmlTrack {
  const s = expandRepeats(expandMacros(src, macros));
  let i = 0;
  let octave = 4, deflen = TICKS_PER_WHOLE / 8, vol = 12 / 15, duty = 2, gate = 7, vib = 0, env = 0;
  let tick = 0, loopTick = 0, barStart = 0;
  const notes: MmlNote[] = [];
  const bars: number[] = [];

  const num = () => {
    const m = /^\d+/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return +m[0];
  };
  const length = () => {
    const n = num();
    let len = n ? TICKS_PER_WHOLE / n : deflen;
    let add = len / 2;
    while (s[i] === '.') { len += add; add /= 2; i++; }
    return Math.round(len);
  };
  const pitch = (letter: string) => {
    let p = NOTE[letter] + (octave + 1) * 12;
    while (s[i] === '+' || s[i] === '#' || s[i] === '-') { p += s[i] === '-' ? -1 : 1; i++; }
    return p;
  };
  const push = (midi: number[], len: number, drum?: Drum) => {
    notes.push({ tick, len, dur: drum ? len : Math.max(1, Math.round((len * gate) / 8)), midi, vol, duty, vib, env, drum });
    tick += len;
  };

  while (i < s.length) {
    const c = s[i++];
    if (/\s/.test(c)) continue;
    switch (c) {
      case '|': bars.push(tick - barStart); barStart = tick; break;
      case 'L': loopTick = tick; barStart = tick; break;
      case 'o': octave = num() ?? 4; break;
      case '<': octave--; break;
      case '>': octave++; break;
      case 'l': { deflen = length(); break; }
      case 'v': vol = Math.min(15, num() ?? 12) / 15; break;
      case '@': duty = num() ?? 2; break;
      case 'q': gate = Math.max(1, Math.min(8, num() ?? 7)); break;
      case 'V': vib = num() ?? 0; break;
      case 'E': env = num() ?? 0; break;
      case 'r': tick += length(); break;
      case '^': {
        const len = length();
        const last = notes[notes.length - 1];
        if (last) { last.len += len; last.dur = Math.max(1, Math.round((last.len * gate) / 8)); }
        tick += len;
        break;
      }
      case '(': {
        const chord: number[] = [];
        while (i < s.length && s[i] !== ')') {
          const ch = s[i++];
          if (ch in NOTE) chord.push(pitch(ch));
          else if (ch === '<') octave--;
          else if (ch === '>') octave++;
        }
        i++; // ')'
        push(chord, length());
        break;
      }
      default:
        if (drums && 'kshpxt'.includes(c)) push([0], length(), c as Drum);
        else if (!drums && c in NOTE) push([pitch(c)], length());
        else throw new Error(`MML: unexpected '${c}' at ${i - 1}: …${s.slice(Math.max(0, i - 12), i + 8)}…`);
    }
  }
  if (tick > barStart) bars.push(tick - barStart);
  return { notes, length: tick, loopTick, bars };
}
