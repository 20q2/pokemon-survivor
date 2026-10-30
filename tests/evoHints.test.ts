import { describe, expect, it } from 'vitest';
import { LINE } from '../src/data/pokedex.ts';
import { STAGES } from '../src/data/stages.ts';
import { evoHint } from '../src/ui/evoHints.ts';

const none = new Set<string>();

describe('evoHint', () => {
  const pichu = LINE.pichu;
  it('is null once the form has been seen', () => {
    expect(evoHint(pichu, 'raichu-alola', new Set(['raichu-alola']))).toBeNull();
    expect(evoHint(pichu, 'raichu', new Set(['raichu']))).toBeNull();
  });
  it('names the place for an environment form', () => {
    expect(evoHint(pichu, 'raichu-alola', none)).toBe('Evolves where the strongest gather');
    expect(evoHint(LINE.ralts, 'gallade', none)).toBe('Evolves somewhere volcanic');
  });
  it('gives the level for the default final and middle stages', () => {
    expect(evoHint(pichu, 'raichu', none)).toBe('Evolves at level 22');
    expect(evoHint(pichu, 'pikachu', none)).toBe('Evolves at level 8');
  });
  it('has nothing to say about the base form', () => {
    expect(evoHint(pichu, 'pichu', none)).toBeNull();
  });
  it('every stage has a hint', () => {
    for (const st of STAGES) expect(st.hint, st.id).toBeTruthy();
  });
});
