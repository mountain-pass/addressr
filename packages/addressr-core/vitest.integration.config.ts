import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.integration.test.ts'],
    // Exclude Playwright browser integration tests per ADR 007 — those are run by
    // `npm run test:integration:browser`, not by vitest.
    exclude: ['**/*.browser.integration.test.ts', 'node_modules/**', 'dist/**'],
    setupFiles: ['./test/integration-setup.ts'],
    passWithNoTests: false,
  },
});
