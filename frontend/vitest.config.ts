import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    setupFiles: ['./src/test/setup.ts'],
    // Node >=25 enables a native `globalThis.localStorage` by default — an
    // inert stub without `--localstorage-file` — which shadows jsdom's own
    // working `window.localStorage` and breaks any test calling it. This
    // flag applies to the actual worker processes vitest spawns, so (unlike
    // the `NODE_OPTIONS` prefix on the package.json test scripts, which only
    // helps when that exact wrapper is used) it holds regardless of how
    // vitest itself is launched — npm script, bare `npx vitest`, or an IDE
    // runner. (Vitest 4 moved this out of the old `poolOptions.forks.*`
    // nesting to a top-level option — see the deprecation notice if you
    // ever see one for `poolOptions` again.)
    // Node 20 (used by CI) does not recognize this flag; only pass it on
    // Node 25+, where native web storage would otherwise shadow jsdom.
    execArgv: Number(process.versions.node.split('.')[0]) >= 25
      ? ['--no-experimental-webstorage']
      : [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
