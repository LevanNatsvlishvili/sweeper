import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2018',
    // Everything is inlined into one file, so the preload polyfill has nothing
    // to preload — it only leaves a stray fetch() for network scanners to flag.
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    reportCompressedSize: false,
  },
});
