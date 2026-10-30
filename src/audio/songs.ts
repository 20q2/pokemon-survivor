import type { SongDef } from './score.ts';
import { CLASSIC } from './songs/classic.ts';
import { title } from './songs/title.ts';
import { menu } from './songs/menu.ts';
import { shop } from './songs/shop.ts';
import { forest } from './songs/forest.ts';
import { cave } from './songs/cave.ts';
import { ice } from './songs/ice.ts';
import { factory } from './songs/factory.ts';
import { tower } from './songs/tower.ts';
import { volcano } from './songs/volcano.ts';
import { finale } from './songs/finale.ts';
import { boss } from './songs/boss.ts';
import { final } from './songs/final.ts';

export type { Mode, SongDef } from './score.ts';

/** The soundtrack, by the ids the game plays; the original chip set stays available as `classic-*`. */
export const SONGS: Record<string, SongDef> = {
  title, menu, shop, forest, cave, ice, factory, tower, volcano, finale, boss, final,
  ...Object.fromEntries(Object.entries(CLASSIC).map(([k, v]) => [`classic-${k}`, v])),
};
