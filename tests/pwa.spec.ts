import { test, expect } from '@playwright/test';

/**
 * Lahza is an installable Progressive Web App. These tests verify the two
 * pillars that make "Add to Home Screen" work: a valid web app manifest and a
 * reachable service worker.
 */
test.describe('Lahza PWA', () => {
  test('serves a valid web app manifest', async ({ page, request }) => {
    await page.goto('/lahza/');

    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href, 'a <link rel="manifest"> should be present').toBeTruthy();

    const manifestUrl = new URL(href!, page.url()).toString();
    const response = await request.get(manifestUrl);
    expect(response.ok(), `manifest fetch ${response.status()}`).toBeTruthy();

    const manifest = await response.json();
    expect(
      manifest.name ?? manifest.short_name,
      'manifest should declare a name',
    ).toBeTruthy();
    expect(
      Array.isArray(manifest.icons) && manifest.icons.length > 0,
      'manifest should declare at least one icon',
    ).toBeTruthy();
  });

  test('ships a reachable service worker script', async ({ request }) => {
    const response = await request.get('/lahza/sw.js');
    expect(response.ok(), `service worker fetch ${response.status()}`).toBeTruthy();

    const body = await response.text();
    expect(body.length, 'service worker should not be empty').toBeGreaterThan(0);
  });

  test('the browser supports service workers', async ({ page }) => {
    await page.goto('/lahza/');
    const supported = await page.evaluate(() => 'serviceWorker' in navigator);
    expect(supported).toBeTruthy();
  });
});
