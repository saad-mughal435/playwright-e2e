import { test, expect } from '@playwright/test';
import { PROJECTS } from './fixtures/routes';

/**
 * Each interactive project demo must load successfully and render real
 * content (not a blank shell). Data-driven from the routes fixture.
 */
test.describe('Project demos', () => {
  for (const { path, name } of PROJECTS) {
    test(`${name} (${path}) loads and renders content`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

      expect(response, `expected a response for ${path}`).not.toBeNull();
      expect(
        response!.status(),
        `${path} returned HTTP ${response!.status()}`,
      ).toBeLessThan(400);

      await expect(page).toHaveTitle(/.+/);
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }
});
