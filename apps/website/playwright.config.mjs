import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:9000',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run serve -- --host 127.0.0.1 --port 9000',
    url: 'http://127.0.0.1:9000',
    reuseExistingServer: false,
  },
});
