import { OB_CELL, type Obstacles } from './obstacles.ts';

/**
 * Walking route to one partner around the scenery: a breadth-first fill over the 32 px obstacle
 * cells in a window around them. Foes that bump into a tree follow it downhill instead of
 * grinding against the trunk, so they come round forest walls rather than piling up behind them.
 */

const N = 56; // cells per side (~1800 px), a little more than a screen in every direction
const FAR = 0xffff;
/** 8 neighbours: dx, dy (orthogonals first). */
const NB = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, 1, 1, -1, -1, -1];

export class FlowField {
  private dist = new Uint16Array(N * N);
  private queue = new Int32Array(N * N);
  private ox = 0;
  private oy = 0;
  private tx = NaN;
  private ty = NaN;
  private age = Infinity;

  /** Refresh when the partner changes cell, and every so often regardless. */
  update(obs: Obstacles, x: number, y: number, dt: number) {
    const tx = Math.floor(x / OB_CELL), ty = Math.floor(y / OB_CELL);
    this.age += dt;
    if (tx === this.tx && ty === this.ty && this.age < 0.5) return;
    this.tx = tx;
    this.ty = ty;
    this.age = 0;
    this.ox = tx - (N >> 1);
    this.oy = ty - (N >> 1);
    const { dist, queue } = this;
    dist.fill(FAR);
    const blocked = (i: number, j: number) => !!obs.at(this.ox + i, this.oy + j);
    const start = (N >> 1) * N + (N >> 1);
    dist[start] = 0;
    let head = 0, tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const k = queue[head++];
      const i = k % N, j = (k / N) | 0;
      const d = dist[k] + 1;
      for (let n = 0; n < 8; n += 2) {
        const ni = i + NB[n], nj = j + NB[n + 1];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (dist[nk] !== FAR || blocked(ni, nj)) continue;
        dist[nk] = d;
        queue[tail++] = nk;
      }
    }
  }

  /**
   * Unit direction from (x, y) toward the centre of the next cell downhill, or null outside the
   * window / off the route. Diagonal steps are only taken when both orthogonal cells beside them
   * are open (no corner cutting). A body standing in an obstacle's cell (beside the trunk) routes
   * from the open cell nearest to it, i.e. the side of the trunk it is actually on.
   */
  dir(x: number, y: number): { x: number; y: number } | null {
    let i = Math.floor(x / OB_CELL) - this.ox, j = Math.floor(y / OB_CELL) - this.oy;
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    const { dist } = this;
    if (dist[j * N + i] === FAR) {
      let bd = Infinity, bi = -1, bj = -1;
      for (let n = 0; n < 8; n += 2) {
        const ni = i + NB[n], nj = j + NB[n + 1];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N || dist[nj * N + ni] === FAR) continue;
        const d = ((this.ox + ni + 0.5) * OB_CELL - x) ** 2 + ((this.oy + nj + 0.5) * OB_CELL - y) ** 2;
        if (d < bd) { bd = d; bi = ni; bj = nj; }
      }
      if (bi < 0) return null;
      i = bi;
      j = bj;
    }
    let best = dist[j * N + i], bx = 0, by = 0;
    for (let n = 0; n < 16; n += 2) {
      const dx = NB[n], dy = NB[n + 1];
      const ni = i + dx, nj = j + dy;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      if (dx && dy && (dist[j * N + ni] === FAR || dist[nj * N + i] === FAR)) continue;
      const d = dist[nj * N + ni];
      if (d < best) { best = d; bx = dx; by = dy; }
    }
    if (!bx && !by) return null;
    const dx = (this.ox + i + bx + 0.5) * OB_CELL - x, dy = (this.oy + j + by + 0.5) * OB_CELL - y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }
}
