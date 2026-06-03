import { test, expect } from '@playwright/test';
import { PAGES } from './fixtures/routes';

/**
 * Smoke tests: every core page must return a successful response, have a
 * non-empty <title>, and render a visible body. This is the first line of
 * defence against a broken deploy.
 */
test.describe('Smoke — core pages', () => {
  for (const { path, name } of PAGES) {
    test(`${name} (${path}) loads with a 2xx response`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

      expect(response, `expected a response for ${path}`).not.toBeNull();
      expect(
        response!.status(),
        `${path} returned HTTP ${response!.status()}`,
      ).toBeLessThan(400);

      await expect(page).toHaveTitle(/.+/);
      await expect(page.locator('body')).toBeVisible();
    });
  }
});
