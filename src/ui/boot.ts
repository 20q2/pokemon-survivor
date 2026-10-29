/**
 * Drives the #boot overlay declared in index.html. Loading is split into phases, each owning a
 * slice of the bar; the bar eases toward the real progress and never moves backwards.
 */
export class BootScreen {
  private readonly el = document.getElementById('boot');
  private readonly bar = this.el?.querySelector<HTMLElement>('.boot-bar');
  private readonly fill = this.el?.querySelector<HTMLElement>('.boot-fill');
  private readonly status = this.el?.querySelector<HTMLElement>('.boot-status');
  private range: [number, number] = [0, 0];
  private source: (() => number) | null = null;
  private target = 0;
  private shown = 0;
  private raf = 0;

  constructor() {
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Start a phase covering [from, to] of the bar; `source` reports its own 0..1 progress, polled each frame. */
  phase(label: string, from: number, to: number, source: (() => number) | null = null) {
    if (this.status) this.status.textContent = label;
    this.range = [from, to];
    this.source = source;
    this.report(0);
  }

  report(frac: number) {
    const [a, b] = this.range;
    this.target = Math.max(this.target, a + (b - a) * Math.min(1, Math.max(0, frac)));
  }

  /** Reveal the text once the pixel fonts are in, so it never flashes in a fallback face. */
  fontsReady() {
    this.el?.classList.add('fonts');
  }

  /** Fill the bar, fade the overlay out and remove it. */
  async finish() {
    this.source = null;
    this.target = 1;
    if (this.status) this.status.textContent = 'Ready!';
    await waitFor(() => this.shown >= 0.999, 600);
    this.el?.classList.add('out');
    await new Promise((r) => setTimeout(r, 420));
    cancelAnimationFrame(this.raf);
    this.el?.remove();
  }

  fail(err: unknown) {
    cancelAnimationFrame(this.raf);
    if (!this.el) return;
    this.el.classList.add('fonts', 'failed');
    const msg = err instanceof Error ? err.message : String(err);
    if (this.status) this.status.textContent = `Couldn't load the game: ${msg}`;
    const retry = this.el.querySelector<HTMLButtonElement>('.boot-retry');
    if (retry) {
      retry.onclick = () => location.reload();
      retry.focus();
    }
  }

  private readonly tick = () => {
    if (this.source) this.report(this.source());
    this.shown += (this.target - this.shown) * 0.18;
    if (this.target - this.shown < 0.002) this.shown = this.target;
    if (this.fill) this.fill.style.transform = `scaleX(${this.shown})`;
    this.bar?.setAttribute('aria-valuenow', String(Math.round(this.shown * 100)));
    this.raf = requestAnimationFrame(this.tick);
  };
}

/** Resolve once `p` settles or `ms` passes, whichever is first; never rejects. */
export function within(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    p.then(() => resolve(), () => resolve()).finally(() => clearTimeout(t));
  });
}

function waitFor(cond: () => boolean, ms: number): Promise<void> {
  const end = performance.now() + ms;
  return new Promise((resolve) => {
    const check = () => (cond() || performance.now() >= end ? resolve() : requestAnimationFrame(check));
    check();
  });
}
