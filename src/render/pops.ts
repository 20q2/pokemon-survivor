/** Death pops: a dead enemy's sprite flashes white and squashes flat for a moment before it is gone. */

export const POP_TIME = 0.08;
const MAX_POPS = 64;

/** Squash at progress k (0..1): wide and flat, easing out so the first frames carry the hit. */
export function popSquash(k: number): { sx: number; sy: number } {
  const e = 1 - (1 - Math.min(1, Math.max(0, k))) ** 2;
  return { sx: 1 + 0.3 * e, sy: 1 - 0.6 * e };
}

/** Fixed-size ring of live pops; a new pop overwrites the oldest once full. */
export class DeathPops {
  x = new Float32Array(MAX_POPS);
  y = new Float32Array(MAX_POPS);
  t = new Float32Array(MAX_POPS);
  scale = new Float32Array(MAX_POPS);
  animT = new Float32Array(MAX_POPS);
  row = new Uint8Array(MAX_POPS);
  species: string[] = new Array(MAX_POPS).fill('');
  shiny = new Uint8Array(MAX_POPS);
  private head = 0;
  n = 0;

  add(x: number, y: number, species: string, shiny: boolean, scale: number, row: number, animT: number) {
    const i = this.head;
    this.head = (i + 1) % MAX_POPS;
    if (this.n < MAX_POPS) this.n++;
    this.x[i] = x; this.y[i] = y; this.t[i] = 0; this.scale[i] = scale;
    this.animT[i] = animT; this.row[i] = row; this.species[i] = species; this.shiny[i] = shiny ? 1 : 0;
  }

  /** Age every live pop. Oldest sits at the tail, so expired ones are always a prefix to drop. */
  update(dt: number) {
    for (let k = 0; k < this.n; k++) this.t[this.slot(k)] += dt;
    while (this.n > 0 && this.t[this.slot(0)] >= POP_TIME) this.n--;
  }

  /** Slot index of the k-th live pop (0 = oldest). */
  slot(k: number) { return (this.head - this.n + k + MAX_POPS) % MAX_POPS; }
}
