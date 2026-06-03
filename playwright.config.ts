import { defineConfig, devices } from '@playwright/test';

/**
 * Target under test. Defaults to the live production site so CI doubles as an
 * uptime / regression monitor. Override for local work, e.g.:
 *   BASE_URL=http://127.0.0.1:8000 npx playwright test
 */
const BASE_URL = process.env.BASE_URL ?? 'https://saadm.dev';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,

  // Never let a stray `test.only` slip into CI.
  forbidOnly: !!process.env.CI,

  // Production is a live network target, so allow a couple of retries in CI to
  // absorb transient blips without hiding genuine regressions.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],

  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
