import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:15073',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node ../scripts/test-identity-provider.mjs', url: 'http://127.0.0.1:19108/jwks', reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 } },
    {
      command: 'node ../scripts/run-api.mjs --packaged',
      url: 'http://127.0.0.1:19098/v3/api-docs',
      timeout: 90_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: 'npm run preview -- --port 15073',
      url: 'http://127.0.0.1:15073',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
