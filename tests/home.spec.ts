import { test, expect } from '@playwright/test';

/**
 * Homepage is a React single-page app: index.html ships an empty
 * `<div id="root">` that home.app.js (React 18 from a CDN) hydrates on load.
 * These tests assert the client-side render actually happens and shows the
 * expected identity + outbound links.
 */
test.describe('Homepage', () => {
  test('has the expected title and mounts the React app', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Muhammad Saad.*Developer/i);

    // #root starts empty in the HTML; once React mounts it has children.
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });
  });

  test('introduces Saad and what he builds', async ({ page }) => {
    await page.goto('/');

    const root = page.locator('#root');
    await expect(root).toContainText('Saad', { timeout: 15_000 });
    await expect(root).toContainText(/develop|automation|software/i);
  });

  test('links out to GitHub', async ({ page }) => {
    await page.goto('/');

    const github = page.locator('#root a[href*="github.com/saad-mughal435"]');
    await expect(github.first()).toBeVisible({ timeout: 15_000 });
  });
});
