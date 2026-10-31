import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  // package.json's version, shown on the title screen
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  server: { host: true, port: Number(process.env.PORT) || 5391, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
