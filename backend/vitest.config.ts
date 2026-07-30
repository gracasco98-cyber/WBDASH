import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000, // testcontainers boot può prendere tempo
    hookTimeout: 120_000, // testcontainers + prisma db push can take 60-90s
    pool: 'forks', // process isolation evita race su container Postgres
    singleFork: true,
  },
});
