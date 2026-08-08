import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative base so the production build works from any static host subpath
  // (GitHub Pages project sites, Netlify previews, plain file servers).
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1600, // Phaser is ~1.2 MB minified; that is expected.
    rollupOptions: {
      output: {
        // Split the engine into its own chunk so game-code edits do not invalidate
        // the ~1.2 MB Phaser bundle in the browser cache.
        manualChunks(id: string) {
          return id.includes('node_modules/phaser') ? 'phaser' : undefined;
        },
      },
    },
  },
});
