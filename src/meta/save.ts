import { STARTER_LINES } from '../data/pokedex.ts';

export interface Options {
  music: number;
  sfx: number;
  shake: boolean;
  damageNumbers: boolean;
  showFps: boolean;
  autoPick: boolean;
  damageMeter: boolean;
  meterTab: 'dmg' | 'boss' | 'heal';
  name: string;
}

export interface LifetimeStats {
  runs: number;
  kills: number;
  bosses: number;
  clears: number;
  evolutions: number;
  masteries: number;
  timePlayed: number;
  moneyEarned: number;
  shiniesDefeated: number;
  superEffective: number;
  coopRuns: number;
  maxLevel: number;
  revives: number;
}

export interface SaveData {
  v: 1;
  money: number;
  shop: Record<string, number>;
  tms: string[];
  /** Owned TMs switched off in the Poké Mart: kept, but not offered in runs. */
  tmsOff: string[];
  lines: string[];
  cleared: Record<string, number>; // stageId -> best clear count
  achievements: Record<string, number>; // id -> unlocked timestamp
  friendship: Record<string, number>;
  shinyUnlocked: string[];
  shinyOn: string[];
  seen: Record<string, number>;
  defeated: Record<string, number>;
  stats: LifetimeStats;
  options: Options;
  lastLine: string;
  lastStage: string;
  flags: { eeveelutions?: string[]; clearedLines?: string[] };
  bestTimes: Record<string, number>;
  /** Moves each line has been offered or learned in a run (revealed in its move pool). */
  movesSeen: Record<string, string[]>;
}

const KEY = 'pokesurvivors.save.v1';

export function freshSave(): SaveData {
  return {
    v: 1, money: 0, shop: {}, tms: [], tmsOff: [], lines: [...STARTER_LINES], cleared: {}, achievements: {},
    friendship: {}, shinyUnlocked: [], shinyOn: [], seen: {}, defeated: {},
    stats: {
      runs: 0, kills: 0, bosses: 0, clears: 0, evolutions: 0, masteries: 0, timePlayed: 0,
      moneyEarned: 0, shiniesDefeated: 0, superEffective: 0, coopRuns: 0, maxLevel: 0, revives: 0,
    },
    options: { music: 0.5, sfx: 0.6, shake: true, damageNumbers: true, showFps: false, autoPick: false, damageMeter: false, meterTab: 'dmg', name: 'Trainer' },
    lastLine: 'charmander', lastStage: 'viridian', flags: {}, bestTimes: {}, movesSeen: {},
  };
}

/** Merge a possibly-old/partial save onto a fresh one so new fields always exist. */
export function migrate(raw: unknown): SaveData {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  return {
    ...base,
    ...r,
    v: 1,
    stats: { ...base.stats, ...(r.stats ?? {}) },
    options: { ...base.options, ...(r.options ?? {}) },
    flags: { ...base.flags, ...(r.flags ?? {}) },
    lines: Array.from(new Set([...(r.lines ?? []), ...STARTER_LINES])),
  };
}

export function loadSave(): SaveData {
  try {
    const s = localStorage.getItem(KEY);
    return s ? migrate(JSON.parse(s)) : freshSave();
  } catch {
    return freshSave();
  }
}

export function storeSave(save: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable (private mode) — progress lives for this session only */
  }
}

export function exportSave(save: SaveData): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(save))));
}

export function importSave(code: string): SaveData | null {
  try {
    return migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
  } catch {
    return null;
  }
}
