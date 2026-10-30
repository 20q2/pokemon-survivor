import { STAGE } from '../data/stages.ts';
import type { Line } from '../data/pokedex.ts';

/** Where an undiscovered evolution happens, or null once it has been seen (or if it isn't an evolution). */
export function evoHint(line: Line, form: string, seen: ReadonlySet<string>): string | null {
  if (seen.has(form)) return null;
  for (const [stageId, forms] of Object.entries(line.envForms ?? {})) {
    if (forms.includes(form)) return `Evolves ${STAGE[stageId].hint}`;
  }
  const i = line.stages.indexOf(form);
  if (i >= 1 && i - 1 < line.evoLevels.length) return `Evolves at level ${line.evoLevels[i - 1]}`;
  return null;
}
