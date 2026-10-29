import './style.css';
import { App } from './app.ts';
import { loadTileSheet } from './render/tilesheet.ts';
import { assets } from './render/assets.ts';
import { AudioEngine } from './audio/audio.ts';
import { BootScreen, within } from './ui/boot.ts';

/** Every face the UI and canvas use. document.fonts.ready alone only covers faces already requested. */
const FONTS = ['12px "Press Start 2P"', '18px "Pixelify Sans"', '600 18px "Pixelify Sans"'];

async function boot(screen: BootScreen) {
  screen.phase('Reading the Pokédex…', 0, 0.15);
  await assets.init();

  screen.phase('Loading fonts…', 0.15, 0.25);
  // the optional player-supplied tile sheet (absent = painted art); fonts load alongside it
  await within(Promise.all([...FONTS.map((f) => document.fonts?.load(f)), loadTileSheet()]), 3000);
  screen.fontsReady();

  // Starting the app builds the title screen and kicks off its attract-demo sprites; keep the
  // overlay up until those (and the title's own icons) are in, so nothing pops in behind it.
  const base = { ...assets.stats };
  let titleImgs: HTMLImageElement[] = [];
  screen.phase('Gathering wild Pokémon…', 0.25, 1, () => {
    const total = assets.stats.requested - base.requested + titleImgs.length;
    const done = assets.stats.settled - base.settled + titleImgs.filter((i) => i.complete).length;
    return total ? done / total : 1;
  });
  const app = new App();
  app.start();
  titleImgs = [...app.ui.querySelectorAll('img')];
  for (const i of titleImgs) i.loading = 'eager';
  const titleIcons = Promise.all(titleImgs.map((i) => i.decode().catch(() => undefined)));
  // A slow connection shouldn't hold the title hostage; sprites keep streaming in afterwards.
  await within(Promise.all([app.attractReady, titleIcons]), 12000);

  await screen.finish();
  (window as unknown as { app: App }).app = app;
  // Dev hook: render a song offline with the real synth (scripts/render-music.mjs).
  if (import.meta.env.DEV) {
    const w = window as unknown as { renderSong: unknown; renderSfx: unknown };
    w.renderSong = (n: string, s: number) => AudioEngine.renderOffline(n, s);
    w.renderSfx = (n: string, arg?: number) => AudioEngine.renderSfxOffline(n, arg);
  }
}

const screen = new BootScreen();
boot(screen).catch((e) => {
  console.error(e);
  screen.fail(e);
});
