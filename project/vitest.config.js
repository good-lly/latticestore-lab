import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['sdk_draft_v0/**/*.test.js'],
    watch: false, // Run once and exit
    reporter: 'verbose', // Detailed output including failures
    coverage: {
      provider: 'v8', // or 'istanbul'
      include: ['sdk_draft_v0/**/*.ts'],
      exclude: ['sdk_draft_v0/**/*.test.js'],
      reporter: ['text', 'html', 'json'],
    },
  },
});
