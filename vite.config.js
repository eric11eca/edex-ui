import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  base: './',
  plugins: [
    electron([
      {
        // Main process entry - path relative to project root
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
                '@electron/remote/main',
                '@electron/remote/main/index.js',
                '@electron/remote',
                'node-pty',
                'osx-temperature-sensor',
                'systeminformation',
                'signale',
                'shell-env',
                'which',
                'ws',
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
    // Enable Node.js APIs in the renderer process
    electronRenderer({
      nodeIntegration: true,
      resolve: {
        '@electron/remote': { type: 'cjs' },
        'systeminformation': { type: 'cjs' },
        'osx-temperature-sensor': { type: 'cjs' },
        'geolite2-redist': { type: 'cjs' },
        'maxmind': { type: 'cjs' },
      },
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/ui.html'),
      },
      external: [
        'electron',
        '@electron/remote',
      ],
    },
  },
  optimizeDeps: {
    exclude: [
      '@electron/remote',
      'electron',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@styles': path.resolve(__dirname, 'src/renderer/styles'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
});
