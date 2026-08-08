import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Core simulation logic is deliberately Phaser-free so it can be unit tested
    // in plain Node without a DOM or a WebGL context.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
