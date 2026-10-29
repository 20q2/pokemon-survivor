export interface Spatial {
  x: number;
  y: number;
  radius: number;
}

/** Uniform hash grid rebuilt every tick. Cells are reused to avoid GC churn. */
export class SpatialGrid<T extends Spatial> {
  private cells = new Map<number, T[]>();
  private used: T[][] = [];
  readonly cell: number;
  constructor(cell = 64) {
    this.cell = cell;
  }

  private key(cx: number, cy: number) {
    return ((cx + 32768) & 0xffff) * 65536 + ((cy + 32768) & 0xffff);
  }

  clear() {
    for (const arr of this.used) arr.length = 0;
    this.used.length = 0;
  }

  insert(e: T) {
    const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    if (arr.length === 0) this.used.push(arr);
    arr.push(e);
  }

  /** Calls fn for every entity whose cell overlaps the circle (coarse; caller does exact test). */
  query(x: number, y: number, r: number, fn: (e: T) => void) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (let i = 0; i < arr.length; i++) fn(arr[i]);
      }
    }
  }

  /** Nearest entity within maxR satisfying pred. */
  nearest(x: number, y: number, maxR: number, pred?: (e: T) => boolean): T | undefined {
    let best: T | undefined;
    let bestD = maxR * maxR;
    // Expand search rings so that the common (close) case is cheap.
    for (let r = Math.min(this.cell * 2, maxR); ; r = Math.min(r * 2, maxR)) {
      this.query(x, y, r, (e) => {
        const dx = e.x - x, dy = e.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD && (!pred || pred(e))) {
          bestD = d;
          best = e;
        }
      });
      // Only trust a hit inside the fully-covered circle; otherwise widen.
      if ((best && bestD <= r * r) || r >= maxR) return best;
    }
  }
}
