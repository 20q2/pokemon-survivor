import { TYPES, TYPE_COLORS, type PType } from '../data/types.ts';

export interface AnimInfo { file: string; fw: number; fh: number; durations: number[] }
export interface SpriteSetInfo { Walk: AnimInfo; Idle?: AnimInfo; Hurt?: AnimInfo }
export interface SpeciesAssets { normal: SpriteSetInfo | null; shiny: SpriteSetInfo | null; portrait: boolean; shinyPortrait: boolean }
export interface Manifest { species: Record<string, SpeciesAssets>; items: string[] }

export const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;

/** A loaded animation strip: rows = directions, cols = frames. */
export class Anim {
  readonly img: HTMLImageElement;
  readonly fw: number;
  readonly fh: number;
  readonly durations: number[];
  readonly total: number;
  readonly rows: number;
  private white: HTMLCanvasElement | null = null;
  constructor(img: HTMLImageElement, info: AnimInfo) {
    this.img = img;
    this.fw = info.fw;
    this.fh = info.fh;
    this.durations = info.durations;
    this.total = info.durations.reduce((a, b) => a + b, 0);
    this.rows = Math.max(1, Math.round(img.height / info.fh));
  }
  /** Frame index for time t (seconds). */
  frameAt(t: number): number {
    let f = Math.floor(t * 60) % this.total;
    for (let i = 0; i < this.durations.length; i++) {
      f -= this.durations[i];
      if (f < 0) return i;
    }
    return 0;
  }
  /** White silhouette for hit flashes, built lazily. */
  whiteSheet(): HTMLCanvasElement {
    if (this.white) return this.white;
    const c = document.createElement('canvas');
    c.width = this.img.width;
    c.height = this.img.height;
    const g = c.getContext('2d')!;
    g.drawImage(this.img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    this.white = c;
    return c;
  }
}

export interface SpriteSet { walk: Anim; idle: Anim; hurt: Anim | null }

class AssetStore {
  manifest!: Manifest;
  private sets = new Map<string, SpriteSet>();
  private loading = new Map<string, Promise<SpriteSet | null>>();
  private images = new Map<string, HTMLImageElement>();
  glow = new Map<PType, HTMLCanvasElement>();
  credits: unknown[] = [];

  async init() {
    const res = await fetch(`${ASSET_BASE}manifest.json`);
    this.manifest = await res.json();
    for (const t of TYPES) this.glow.set(t, makeGlow(TYPE_COLORS[t]));
  }

  image(url: string): Promise<HTMLImageElement> {
    const cached = this.images.get(url);
    if (cached?.complete) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      const img = cached ?? new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${url}`));
      if (!cached) {
        img.src = url;
        this.images.set(url, img);
      }
    });
  }

  key(species: string, shiny: boolean) {
    return `${species}/${shiny ? 'shiny' : 'normal'}`;
  }

  /** Sprite set if already loaded (render path must never await). */
  get(species: string, shiny = false): SpriteSet | undefined {
    return this.sets.get(this.key(species, shiny)) ?? (shiny ? this.sets.get(this.key(species, false)) : undefined);
  }

  load(species: string, shiny = false): Promise<SpriteSet | null> {
    const k = this.key(species, shiny);
    const existing = this.loading.get(k);
    if (existing) return existing;
    const p = (async () => {
      const info = this.manifest.species[species]?.[shiny ? 'shiny' : 'normal'];
      if (!info) return null;
      const dir = `${ASSET_BASE}sprites/${species}/${shiny ? 'shiny' : 'normal'}/`;
      const load = async (a?: AnimInfo) => (a ? new Anim(await this.image(dir + a.file), a) : null);
      const [walk, idle, hurt] = await Promise.all([load(info.Walk), load(info.Idle), load(info.Hurt)]);
      const set: SpriteSet = { walk: walk!, idle: idle ?? walk!, hurt };
      this.sets.set(k, set);
      return set;
    })();
    this.loading.set(k, p);
    return p;
  }

  portraitUrl(species: string, shiny = false) {
    const a = this.manifest.species[species];
    const useShiny = shiny && a?.shinyPortrait;
    return `${ASSET_BASE}sprites/${species}/portrait${useShiny ? '-shiny' : ''}.png`;
  }

  itemUrl(id: string) {
    return `${ASSET_BASE}items/${id}.png`;
  }

  itemImage(id: string): HTMLImageElement | undefined {
    const url = this.itemUrl(id);
    const img = this.images.get(url);
    if (!img) void this.image(url).catch(() => undefined);
    return img?.complete ? img : undefined;
  }
}

function makeGlow(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export const assets = new AssetStore();
