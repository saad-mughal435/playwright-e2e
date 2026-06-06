import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * API tests for the live ShopFloor API (Spring Boot 3 / Java 21), deployed on a
 * free Render instance and linked from saadm.dev.
 *
 * Read-only by design: login + GET endpoints only — no POST/mutations — so the
 * suite never alters the seeded demo data.
 *
 * The free instance sleeps when idle, so a cold start can take ~50s; the
 * warm-up hook below wakes it before the assertions run.
 */

const API_BASE = process.env.API_BASE_URL ?? 'https://shopfloor-api-lvb0.onrender.com';
const CREDS = { username: 'manager', password: 'password' };

async function getToken(ctx: APIRequestContext): Promise<string> {
  const res = await ctx.post('/api/auth/login', { data: CREDS });
  expect(res.ok(), `login returned ${res.status()}`).toBeTruthy();
  return (await res.json()).token as string;
}

test.describe('ShopFloor API', () => {
  // Wake the free-tier instance before the assertions (cold start ~50s).
  test.beforeAll(async () => {
    // The free Render instance can take ~50s to cold-start; without this the
    // default 30s hook timeout kills the wake-up loop before the API responds.
    test.setTimeout(150_000);
    const ctx = await request.newContext({ baseURL: API_BASE });
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await ctx.get('/actuator/health', { timeout: 30_000 });
        if (res.ok()) break;
      } catch {
        /* still waking up — retry */
      }
    }
    await ctx.dispose();
  });

  test('reports healthy via Spring Boot Actuator', async ({ request }) => {
    const res = await request.get('/actuator/health', { timeout: 60_000 });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).status).toBe('UP');
  });

  test('publishes an OpenAPI document describing the auth endpoint', async ({ request }) => {
    const res = await request.get('/v3/api-docs', { timeout: 60_000 });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();
    expect(doc.paths?.['/api/auth/login'], 'login path documented').toBeTruthy();
  });

  test.describe('Authentication', () => {
    test('issues a JWT for valid credentials', async ({ request }) => {
      const res = await request.post('/api/auth/login', { data: CREDS });
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      expect(body.token, 'token present').toBeTruthy();
      expect(body.token.split('.'), 'looks like a JWT').toHaveLength(3);
      expect(body.role).toBe('MANAGER');
      expect(body.expiresAt, 'expiry present').toBeTruthy();
    });

    test('rejects invalid credentials with 401', async ({ request }) => {
      const res = await request.post('/api/auth/login', {
        data: { username: 'manager', password: 'definitely-wrong' },
      });
      expect(res.status()).toBe(401);
    });

    test('rejects unauthenticated access to a protected resource with 401', async ({
      request,
    }) => {
      const res = await request.get('/api/lines');
      expect(res.status()).toBe(401);
    });
  });

  test.describe('Authenticated reads', () => {
    let token: string;

    test.beforeAll(async () => {
      const ctx = await request.newContext({ baseURL: API_BASE });
      token = await getToken(ctx);
      await ctx.dispose();
    });

    const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

    test('lists the seeded production lines', async ({ request }) => {
      const res = await request.get('/api/lines', auth());
      expect(res.ok()).toBeTruthy();

      const lines = await res.json();
      expect(Array.isArray(lines)).toBeTruthy();
      const codes = lines.map((l: { code: string }) => l.code);
      expect(codes).toContain('LINE-A');
      expect(codes).toContain('LINE-B');
      expect(lines[0].ratedUnitsPerHour).toBeGreaterThan(0);
    });

    test('computes rolling OEE for a line', async ({ request }) => {
      const lines = await (await request.get('/api/lines', auth())).json();
      const res = await request.get(`/api/lines/${lines[0].id}/oee`, auth());
      expect(res.ok()).toBeTruthy();

      const oee = await res.json();
      expect(oee.lineCode, 'OEE carries the line code').toBeTruthy();
      for (const key of ['availability', 'performance', 'quality', 'oee']) {
        const value = Number(oee[key]);
        expect(Number.isFinite(value), `${key} should be numeric`).toBeTruthy();
        expect(value, `${key} should be non-negative`).toBeGreaterThanOrEqual(0);
      }
    });

    test('lists job orders driven through the real lifecycle', async ({ request }) => {
      const res = await request.get('/api/job-orders', auth());
      expect(res.ok()).toBeTruthy();

      const orders = await res.json();
      expect(orders.length, 'seeded job orders present').toBeGreaterThan(0);
      expect(
        orders.some((o: { orderNo?: string }) => o.orderNo?.startsWith('JO-2026')),
        'a JO-2026-* order exists',
      ).toBeTruthy();
    });

    test('lists inventory items with on-hand balances', async ({ request }) => {
      const res = await request.get('/api/inventory', auth());
      expect(res.ok()).toBeTruthy();

      const items = await res.json();
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty('sku');
      expect(items[0]).toHaveProperty('onHand');
    });

    test('lists QC holds', async ({ request }) => {
      const res = await request.get('/api/qc/holds', auth());
      expect(res.ok()).toBeTruthy();
      expect(Array.isArray(await res.json())).toBeTruthy();
    });
  });
});
