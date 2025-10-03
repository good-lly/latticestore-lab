import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['draft_v0/**/*.test.js'],
    watch: false, // Run once and exit
    reporter: 'verbose', // Detailed output including failures
    coverage: {
      provider: 'v8', // or 'istanbul'
      include: ['draft_v0/**/*.ts'],
      exclude: ['draft_v0/**/*.test.js'],
      reporter: ['text', 'html', 'json'],
    },
  },
});
