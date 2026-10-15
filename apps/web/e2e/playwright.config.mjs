// Browser tests against the built app (`npm run build` first). The global setup
// starts an isolated server: temporary data directory, random APP_ENC_KEY, free
// local port. Tests share one instance and build on each other, so run serially.
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  outputDir: fileURLToPath(new URL('../../../.tmp/playwright', import.meta.url)),
  globalSetup: './global-setup.mjs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 860 },
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
