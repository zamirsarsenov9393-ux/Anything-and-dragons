import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/core/**', 'src/content/**'], thresholds: { 'src/core/**': { lines: 95, functions: 95, branches: 85 } } },
  },
});
