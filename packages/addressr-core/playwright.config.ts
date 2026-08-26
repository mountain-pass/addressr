import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.browser.integration.test.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
