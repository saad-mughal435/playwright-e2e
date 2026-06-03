import { test, expect } from '@playwright/test';

/**
 * Real click-through navigation. Skipped on emulated mobile viewports, where
 * the homepage may collapse navigation behind a menu affordance.
 */
test.describe('Navigation', () => {
  test.skip(
    ({ isMobile }) => !!isMobile,
    'desktop navigation only — mobile nav is covered by smoke + projects specs',
  );

  test('navigates from the homepage to the contact page', async ({ page }) => {
    await page.goto('/');

    const contactLink = page.locator('#root a[href*="contact"]').first();
    await expect(contactLink).toBeVisible({ timeout: 15_000 });
    await contactLink.click();

    await expect(page).toHaveURL(/contact/);
    await expect(page.locator('#contact-form')).toBeVisible();
  });
});
