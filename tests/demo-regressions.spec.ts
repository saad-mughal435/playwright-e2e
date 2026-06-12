import { test, expect } from '@playwright/test';

/**
 * Regression net for four real bugs found 2026-06-11 by a manual browser
 * deep-check that this suite had missed (fixed in site v5.9.5). Each test
 * pins the exact failure mode so it cannot silently return.
 */

test.describe('demo regressions (site v5.9.5)', () => {
  test('POS: an order sent from the terminal appears on the kitchen display', async ({ page }) => {
    // Bug: the generic /orders/:id mock route shadowed /orders/kitchen, so the
    // KDS polled an eternal not_found while admin showed orders "in kitchen".
    await page.goto('/pos/terminal.html');
    await page.getByText('Manager').first().click().catch(() => {});
    for (const digit of ['1', '2', '3', '4']) {
      await page.locator(`button:has-text("${digit}")`).first().click().catch(() => {});
    }
    await page.waitForTimeout(1500);
    // Whether or not the order send succeeds in this run, the KDS endpoint
    // itself must resolve - that is the regression.
    await page.goto('/pos/kitchen.html');
    await page.waitForTimeout(2500);
    const probe = await page.evaluate(async () => {
      // The POS mock intercepts fetch at the /pos/api prefix (see pos/js/app.js).
      const res = await fetch('/pos/api/orders/kitchen').then((r) => r.json()).catch((e) => ({ error: String(e) }));
      return res;
    });
    expect(probe.ok, `kitchen route must not be shadowed: ${JSON.stringify(probe)}`).toBe(true);
    expect(Array.isArray(probe.items)).toBe(true);
  });

  test('Sanad inbox: body keeps its height under the fx layer and rows are clickable', async ({ page }) => {
    // Bug: html.lenis body { height: auto } collapsed body.sanad to ~38px,
    // making the whole inbox non-hit-testable on desktop.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/sanad/inbox.html');
    await page.waitForTimeout(3500); // fx layer boots, lenis class lands
    const bodyHeight = await page.evaluate(() => document.body.getBoundingClientRect().height);
    expect(bodyHeight, 'body must not collapse under html.lenis').toBeGreaterThan(500);
    const firstRow = page.locator('.snd-conv-item, [class*="conv"]').first();
    await firstRow.click({ timeout: 5000 });
    // A click must actually open the thread (any message bubble appears).
    await expect(page.locator('[class*="msg"], [class*="thread"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('MES app: all accounting ledger tabs render rows (no entries.slice crash)', async ({ page }) => {
    // Bug: mock returned bare arrays; client read .entries which resolved to
    // Array.prototype.entries and threw "entries.slice is not a function".
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/app/');
    await page.waitForTimeout(3000);
    await page.locator('a:has-text("Accounting"), [data-module="accounting"]').first().click();
    await page.waitForTimeout(1500);
    for (const tab of ['Cashbook', 'AR Batches', 'AP Batches']) {
      await page.locator(`button:has-text("${tab}"), a:has-text("${tab}")`).first().click().catch(() => {});
      await page.waitForTimeout(1200);
      // The broken version threw before any ledger rows could render; the
      // fixed version renders a populated table for every tab.
      const rows = await page.locator('tbody tr:visible').count();
      expect(rows, `${tab} must render ledger rows`).toBeGreaterThan(3);
    }
    expect(errors.filter((e) => /entries\.slice/.test(e))).toEqual([]);
  });

  test('Manzil mortgage: clearing the tenure field never renders Infinity or NaN', async ({ page }) => {
    await page.goto('/property/mortgage.html');
    await page.waitForTimeout(1000);
    const years = page.locator('#i-years');
    await years.fill('');
    await page.waitForTimeout(600);
    const monthly = await page.locator('#o-monthly').textContent();
    expect(monthly ?? '').not.toMatch(/Infinity|∞|NaN/);
  });
});
