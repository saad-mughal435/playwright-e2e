import { defineConfig, devices } from '@playwright/test';

/**
 * Targets under test, both overridable for local work:
 *   - SITE_URL: the static portfolio (browser E2E + a11y specs)
 *   - API_URL:  the ShopFloor API (api/*.spec.ts)
 *
 * Defaults point at live production so CI doubles as an uptime / regression
 * monitor. Example local override:
 *   BASE_URL=http://127.0.0.1:8000 npx playwright test --project=chromium
 */
const SITE_URL = process.env.BASE_URL ?? 'https://saadm.dev';
const API_URL = process.env.API_BASE_URL ?? 'https://shopfloor-api-lvb0.onrender.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,

  // Never let a stray `test.only` slip into CI.
  forbidOnly: !!process.env.CI,

  // Live network targets, so allow a couple of retries in CI to absorb
  // transient blips (and free-tier API cold starts) without hiding regressions.
  retries: process.env.CI ? 3 : 0,
  workers: process.env.CI ? 4 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],

  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: SITE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Browser E2E + accessibility — run cross-browser and on mobile emulation.
    {
      name: 'chromium',
      testIgnore: '**/api/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: '**/api/**',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: '**/api/**',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      testIgnore: '**/api/**',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari',
      testIgnore: '**/api/**',
      use: { ...devices['iPhone 14'] },
    },

    // API tests — no browser, single project, points at the ShopFloor API.
    {
      name: 'api',
      testMatch: '**/api/**',
      use: { baseURL: API_URL },
    },
  ],
});
