import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts: the ad build's singlefile plugin has no
// business running during unit tests, and the engine under test imports no Pixi.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
