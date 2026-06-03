import { test, expect } from '@playwright/test';

/**
 * Contact form coverage. The form posts to a third-party backend, so these
 * tests deliberately stop short of submitting — they assert structure,
 * validation contract, and spam protection without sending a real message.
 */
test.describe('Contact form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact.html');
  });

  test('renders all expected fields', async ({ page }) => {
    await expect(page.locator('#contact-form')).toBeVisible();
    await expect(page.locator('#f-name')).toBeVisible();
    await expect(page.locator('#f-email')).toBeVisible();
    await expect(page.locator('#f-message')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
  });

  test('enforces a required + typed validation contract', async ({ page }) => {
    await expect(page.locator('#f-name')).toHaveAttribute('required', /.*/);
    await expect(page.locator('#f-email')).toHaveAttribute('type', 'email');
    await expect(page.locator('#f-email')).toHaveAttribute('required', /.*/);
    await expect(page.locator('#f-message')).toHaveAttribute('required', /.*/);
  });

  test('accepts input without sending a message', async ({ page }) => {
    await page.locator('#f-name').fill('QA Smoke Test');
    await page.locator('#f-email').fill('qa@example.com');
    await page
      .locator('#f-message')
      .fill('Automated Playwright check — please ignore, not a real enquiry.');

    await expect(page.locator('#f-name')).toHaveValue('QA Smoke Test');
    await expect(page.locator('#f-email')).toHaveValue('qa@example.com');
    // Intentionally NOT clicking submit: avoids hitting the form backend.
  });

  test('hides a honeypot field from real users', async ({ page }) => {
    const honeypot = page.locator('#contact-form input[name="_honey"]');
    await expect(honeypot).toHaveCount(1);
    await expect(honeypot).toHaveAttribute('aria-hidden', 'true');
  });
});
