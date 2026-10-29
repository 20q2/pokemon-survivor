import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  server: { host: true, port: 5391, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
