import { test, expect } from '@playwright/test';

/**
 * The homepage ships rich, static <head> metadata (canonical, Open Graph,
 * Twitter cards, JSON-LD structured data). These are SEO load-bearing, so the
 * suite guards them against accidental regressions.
 */
test.describe('SEO & structured data (homepage)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('declares a canonical URL on the production origin', async ({ page }) => {
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://saadm.dev/',
    );
  });

  test('has a substantive meta description', async ({ page }) => {
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute('content');

    expect(description, 'meta description should be present').toBeTruthy();
    expect(description!.length).toBeGreaterThan(80);
  });

  test('exposes Open Graph and Twitter card tags', async ({ page }) => {
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
  });

  test('ships valid Person JSON-LD structured data', async ({ page }) => {
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();

    expect(blocks.length, 'at least one JSON-LD block').toBeGreaterThan(0);

    // JSON.parse throws on malformed data, which fails the test as intended.
    const schemas = blocks.map((block) => JSON.parse(block));
    const person = schemas.find((schema) => schema['@type'] === 'Person');

    expect(person, 'a Person schema should be present').toBeTruthy();
    expect(person.name, 'Person schema should carry a name').toBeTruthy();
  });
});
