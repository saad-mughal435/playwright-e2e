import { test, expect } from '@playwright/test';

/**
 * Site-wide error sweep: load every key page of saadm.dev (shell + all demo
 * apps) in a real browser and fail if the page throws, logs console errors,
 * gets a 4xx/5xx on a same-origin request, or trips the Content-Security-
 * Policy. Catches the class of regression that curl-level checks cannot
 * (e.g. a CSP change silently un-styling a demo).
 */

const PAGES = [
  '/',
  '/contact.html',
  '/demo.html',
  '/notes/',
  '/notes/itch-orderbook-reconstruction.html',
  '/notes/shopfloor-oee-engine.html',
  '/notes/krones-operations-software.html',
  '/hft-book/viewer.html',
  '/app/',
  '/b2b/', '/b2b/catalog.html', '/b2b/cart.html',
  '/b2c/', '/b2c/products.html', '/b2c/checkout.html',
  '/property/', '/property/search.html', '/property/listing.html', '/property/admin.html',
  '/vacation/', '/vacation/search.html', '/vacation/admin.html',
  '/pos/', '/pos/terminal.html', '/pos/kitchen.html', '/pos/admin.html',
  '/sanad/', '/sanad/inbox.html', '/sanad/chat.html', '/sanad/kb.html',
  '/watad/', '/watad/console.html', '/watad/energy.html',
  '/marsad/', '/marsad/console.html', '/marsad/driver.html',
  '/nabta/', '/nabta/app.html',
  '/lahza/',
];

// Console noise that is not a site bug (third-party advisories, expected
// mock-mode fallbacks). Keep this list short and specific.
const IGNORE = [
  /cdn\.tailwindcss\.com should not be used in production/i,
  /\[mock\]/i,
  // Browser echo of a failed request; real failures are caught (and
  // filtered) by the response listener below, so this line is a duplicate.
  /failed to load resource/i,
];

// Same-origin endpoints that 404 BY DESIGN: the AI demos probe their
// Cloudflare Worker route and fall back to deterministic mock mode when it
// is not deployed. A 404 here is the expected no-Worker signal, not a bug.
const EXPECTED_404 = /\/api\/\w+\/ai\//;

test.describe('site sweep - no runtime errors on any page', () => {
  // Error sweep, not a rendering check - one engine is enough, and 39 pages
  // x 5 projects would add ~10 CI minutes for no extra signal.
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile, 'sweep runs on desktop Chromium only');

  for (const path of PAGES) {
    test(`clean load: ${path}`, async ({ page, baseURL }) => {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      const badResponses: string[] = [];
      const cspViolations: string[] = [];

      page.on('pageerror', (err) => pageErrors.push(String(err)));
      page.on('console', (msg) => {
        const text = msg.text();
        if (IGNORE.some((re) => re.test(text))) return;
        if (/content security policy/i.test(text)) cspViolations.push(text);
        else if (msg.type() === 'error') consoleErrors.push(text);
      });
      page.on('response', (res) => {
        if (res.status() >= 400 && res.url().startsWith(baseURL!) && !EXPECTED_404.test(res.url())) {
          badResponses.push(`${res.status()} ${res.url()}`);
        }
      });

      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000); // let SPAs boot, timers tick, lazy assets land

      expect(pageErrors, `uncaught exceptions on ${path}`).toEqual([]);
      expect(cspViolations, `CSP violations on ${path}`).toEqual([]);
      expect(badResponses, `failed same-origin requests on ${path}`).toEqual([]);
      expect(consoleErrors, `console errors on ${path}`).toEqual([]);
    });
  }
});
