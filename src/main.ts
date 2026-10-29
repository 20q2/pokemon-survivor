import './style.css';
import { App } from './app.ts';
import { assets } from './render/assets.ts';

async function boot() {
  await assets.init();
  // Make sure the pixel fonts are ready before canvas text is drawn.
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  const app = new App();
  document.getElementById('boot')?.remove();
  app.start();
  (window as unknown as { app: App }).app = app;
}

boot().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.innerHTML = `<p>Failed to load: ${String(e?.message ?? e)}</p>`;
});
