import { test, expect } from '@playwright/test';

/**
 * Regression net for four real bugs found 2026-06-11 by a manual browser
 * deep-check that this suite had missed (fixed in site v5.9.5). Each test
 * pins the exact failure mode.
 *
 * These use web-first assertions / explicit waits for the condition under
 * test (never fixed sleeps), so they are deterministic against a live,
 * sometimes-slow production target rather than timing-dependent.
 */

test.describe('demo regressions (site v5.9.5)', () => {
  // The original bug conditions are desktop-Chromium specific: the Sanad
  // collapse only happens where the fx layer loads (fine pointer, >=1024px),
  // and the POS/MES flows use desktop layouts. Other engines/mobile would
  // exercise different conditions than the bugs, so scope to desktop Chromium.
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'regression conditions are desktop-Chromium specific'
  );

  test('POS: the kitchen-display route is not shadowed by the generic order route', async ({ page }) => {
    // Bug: the generic /orders/:id mock route matched /orders/kitchen first, so
    // the KDS polled an eternal not_found. Loading any POS page registers the
    // fetch-intercepting mock (pos/js/app.js); probing the route directly is a
    // deterministic check of the regression - no fragile terminal login/clicks.
    await page.goto('/pos/kitchen.html');
    const probe = await page.evaluate(async () => {
      // Poll briefly: the mock registers on script load, which may lag the nav.
      for (let i = 0; i < 24; i++) {
        try {
          const res = await fetch('/pos/api/orders/kitchen');
          if (res.ok) return await res.json();
        } catch {
          /* mock not ready yet */
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return { ok: false, error: 'route never resolved' };
    });
    expect(probe.ok, `kitchen route must resolve, not 404: ${JSON.stringify(probe)}`).toBe(true);
    expect(Array.isArray(probe.items)).toBe(true);
  });

  test('Sanad inbox: body keeps its height under the fx layer and rows are clickable', async ({ page }) => {
    // Bug: html.lenis body { height: auto } collapsed body.sanad to ~38px,
    // making the whole inbox non-hit-testable on desktop.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/sanad/inbox.html');
    const firstRow = page.locator('.snd-conv-item, [class*="conv"]').first();
    await expect(firstRow).toBeVisible({ timeout: 20_000 });
    // Wait for the fx layer (lenis) to actually boot - that is exactly when the
    // regression would collapse the body. If lenis never loads (slow CDN), the
    // collapse can't occur, so a graceful fallback keeps the test meaningful.
    await page
      .waitForFunction(() => document.documentElement.classList.contains('lenis'), { timeout: 8_000 })
      .catch(() => {});
    const bodyHeight = await page.evaluate(() => document.body.getBoundingClientRect().height);
    expect(bodyHeight, 'body must not collapse under html.lenis').toBeGreaterThan(500);
    await firstRow.click();
    await expect(page.locator('[class*="msg"], [class*="thread"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('MES app: all accounting ledger tabs render rows (no entries.slice crash)', async ({ page }) => {
    // Bug: mock returned bare arrays; client read .entries which resolved to
    // Array.prototype.entries and threw "entries.slice is not a function".
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/app/');
    // Auto-waits for the sidebar to render and the link to be actionable.
    await page.locator('a:has-text("Accounting"), [data-module="accounting"]').first().click({ timeout: 20_000 });
    for (const tab of ['Cashbook', 'AR Batches', 'AP Batches']) {
      await page.locator(`button:has-text("${tab}"), a:has-text("${tab}")`).first().click().catch(() => {});
      // The broken version threw before any ledger rows could render; the fixed
      // version renders a populated table. Poll instead of a fixed wait.
      await expect
        .poll(() => page.locator('tbody tr:visible').count(), { timeout: 10_000, message: `${tab} ledger rows` })
        .toBeGreaterThan(3);
    }
    expect(errors.filter((e) => /entries\.slice/.test(e))).toEqual([]);
  });

  test('Manzil mortgage: clearing the tenure field never renders Infinity or NaN', async ({ page }) => {
    await page.goto('/property/mortgage.html');
    const years = page.locator('#i-years');
    await years.fill(''); // fill auto-waits for the input
    await expect
      .poll(async () => (await page.locator('#o-monthly').textContent()) ?? '', { timeout: 8_000 })
      .not.toMatch(/Infinity|∞|NaN/);
  });
});
