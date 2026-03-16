import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  base: './',
  plugins: [
    electron([
      {
        // Main process entry
        entry: path.resolve(__dirname, 'src/main/index.js'),
        onstart(args) {
          args.startup();
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: [
                'electron',
                'node-pty',
                'osx-temperature-sensor',
                'systeminformation',
                'signale',
                'shell-env',
                'which',
                'ws',
                'geolite2-redist',
                'maxmind',
                'nanoid',
                /^node:/,
              ],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              },
            },
            sourcemap: true,
            minify: false,
          },
        },
      },
      {
        // Preload script entry
        entry: path.resolve(__dirname, 'src/main/preload.js'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: [
                'electron',
                /^node:/,
              ],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              },
            },
            sourcemap: true,
            minify: false,
          },
        },
      },
    ]),
  ],
  define: {
    // xterm-addon-ligatures expects Node.js `global` variable
    global: 'globalThis',
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/ui.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@styles': path.resolve(__dirname, 'src/renderer/styles'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@assets': path.resolve(__dirname, 'src/assets'),
      // Shim Node.js path module for browser (used by mime-types)
      'path': path.resolve(__dirname, 'src/renderer/shims/path.js'),
    },
  },
});
