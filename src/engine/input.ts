/** Movement input from keyboard, gamepad and a touch virtual stick. */
export class Input {
  private keys = new Set<string>();
  private touchId: number | null = null;
  private touchOrigin = { x: 0, y: 0 };
  private touchVec = { x: 0, y: 0 };
  private stickEl: HTMLDivElement;
  private knobEl: HTMLDivElement;
  /** Edge-triggered actions consumed by the game (pause etc.). */
  private pressed = new Set<string>();
  private padPrev = new Map<number, boolean>();
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';

  constructor(touchSurface: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.stickEl = document.createElement('div');
    this.stickEl.className = 'touch-stick hidden';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'touch-knob';
    this.stickEl.appendChild(this.knobEl);
    document.body.appendChild(this.stickEl);

    touchSurface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.touchId !== null) return;
      this.touchId = e.pointerId;
      this.touchOrigin = { x: e.clientX, y: e.clientY };
      this.touchVec = { x: 0, y: 0 };
      this.lastDevice = 'touch';
      this.stickEl.classList.remove('hidden');
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.touchId) return;
      const dx = e.clientX - this.touchOrigin.x, dy = e.clientY - this.touchOrigin.y;
      const max = 48;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      this.touchVec = { x: (dx * k) / max, y: (dy * k) / max };
      this.knobEl.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.touchId) return;
      this.touchId = null;
      this.touchVec = { x: 0, y: 0 };
      this.stickEl.classList.add('hidden');
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  clearPressed() {
    this.pressed.clear();
  }

  /** Polls gamepads; emits virtual 'PadStart' presses. */
  pollPads() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const start = !!(p.buttons[9]?.pressed);
      if (start && !this.padPrev.get(p.index)) this.pressed.add('PadStart');
      this.padPrev.set(p.index, start);
    }
  }

  /** Normalised move vector (length <= 1). */
  move(): { x: number; y: number } {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (x || y) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    if (this.touchId !== null) return this.touchVec;
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      let gx = p.axes[0] ?? 0, gy = p.axes[1] ?? 0;
      if (p.buttons[14]?.pressed) gx = -1;
      if (p.buttons[15]?.pressed) gx = 1;
      if (p.buttons[12]?.pressed) gy = -1;
      if (p.buttons[13]?.pressed) gy = 1;
      const l = Math.hypot(gx, gy);
      if (l > 0.2) {
        this.lastDevice = 'gamepad';
        const m = Math.min(1, (l - 0.2) / 0.7);
        return { x: (gx / l) * m, y: (gy / l) * m };
      }
    }
    return { x: 0, y: 0 };
  }
}
