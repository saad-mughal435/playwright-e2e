import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Automated accessibility checks via axe-core (WCAG 2.0/2.1 A & AA rules).
 *
 * The scan runs once on desktop Chromium — axe results are engine-independent,
 * so re-running across every browser adds noise without coverage. We gate on
 * the most impactful violations (critical + serious) so the suite catches real
 * barriers without being blocked by minor best-practice nits.
 *
 * Each page is scanned in both the light and the dark theme, since saadm.dev
 * ships a light/dark toggle and contrast can regress independently per theme.
 */
const BLOCKING_IMPACTS = ['critical', 'serious'];
const PATHS = ['/', '/contact.html', '/demo.html'];

async function expectNoBlockingViolations(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('body')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter((v) =>
    BLOCKING_IMPACTS.includes(v.impact ?? ''),
  );

  // Surface a readable summary in the failure message if anything trips.
  const summary = blocking
    .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
    .join('\n');

  expect(blocking, summary).toEqual([]);
}

test.describe('Accessibility (axe-core)', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'a11y scan runs once on desktop Chromium',
  );

  test.describe('light theme', () => {
    for (const path of PATHS) {
      test(`no critical or serious violations: ${path}`, async ({ page }) => {
        await expectNoBlockingViolations(page, path);
      });
    }
  });

  test.describe('dark theme', () => {
    test.beforeEach(async ({ page }) => {
      // Pin the saved theme before the page's no-FOUC head script reads it.
      await page.addInitScript(() => {
        try {
          window.localStorage.setItem('theme', 'dark');
        } catch {
          /* private mode */
        }
      });
    });

    for (const path of PATHS) {
      test(`no critical or serious violations: ${path}`, async ({ page }) => {
        await expectNoBlockingViolations(page, path);
      });
    }
  });
});
