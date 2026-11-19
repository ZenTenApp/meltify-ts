import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'site/src/**/*.test.ts'],
    environment: 'node',
  },
});
