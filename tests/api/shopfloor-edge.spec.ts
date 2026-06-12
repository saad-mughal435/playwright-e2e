import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Negative-path and edge-case tests for the live ShopFloor API, extending the
 * read-only happy paths in shopfloor.spec.ts (see issue #1):
 *
 *   - role-based 403s (operator/qc tokens hitting endpoints above their role)
 *   - validation + business-rule rejections on the job-order lifecycle
 *   - OEE boundary behaviour (over-speed clamp, downtime > planned, zero units)
 *
 * Unlike the read-only suite, these tests DO create their own scratch entities
 * (job orders + downtime events). That is safe against the live instance:
 * the API runs on an in-memory H2 database (ddl-auto: create-drop) that is
 * re-seeded from scratch on every restart — and the free Render instance
 * restarts whenever it wakes from sleep — so nothing persists. Order numbers
 * carry a per-run unique suffix so repeated runs against a warm instance
 * never collide with each other or with the seeded JO-2026-* orders.
 *
 * The free instance sleeps when idle, so a cold start can take ~50s; the
 * warm-up hook below wakes it before the assertions run.
 */

const API_BASE = process.env.API_BASE_URL ?? 'https://shopfloor-api-lvb0.onrender.com';
const PASSWORD = 'password'; // shared demo password for all seeded users
const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Unique, non-seeded order number so reruns on a warm instance never collide. */
const orderNo = (tag: string) => `E2E-${RUN_ID}-${tag}`;

async function loginAs(ctx: APIRequestContext, username: string): Promise<string> {
  const res = await ctx.post('/api/auth/login', { data: { username, password: PASSWORD } });
  expect(res.ok(), `login as ${username} returned ${res.status()}`).toBeTruthy();
  return (await res.json()).token as string;
}

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

test.describe('ShopFloor API — negative paths and OEE edge cases', () => {
  let manager: string;
  let operator: string;
  let qc: string;
  /** Seeded LINE-A (Krones PET, rated 7200 units/hour). */
  let lineA: { id: number; ratedUnitsPerHour: number };

  // Wake the free-tier instance before the assertions (cold start ~50s),
  // then log in once per seeded role.
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
    manager = await loginAs(ctx, 'manager');
    operator = await loginAs(ctx, 'operator');
    qc = await loginAs(ctx, 'qc');

    const lines = await (await ctx.get('/api/lines', bearer(manager))).json();
    lineA = lines.find((l: { code: string }) => l.code === 'LINE-A');
    expect(lineA, 'seeded LINE-A present').toBeTruthy();
    expect(lineA.ratedUnitsPerHour).toBeGreaterThan(0);
    await ctx.dispose();
  });

  /** Creates a scratch PLANNED job order on LINE-A as manager; returns its id. */
  async function createOrder(
    req: APIRequestContext,
    tag: string,
    plannedRuntimeMinutes: number,
  ): Promise<number> {
    const res = await req.post('/api/job-orders', {
      ...bearer(manager),
      data: {
        orderNo: orderNo(tag),
        lineId: lineA.id,
        product: 'E2E scratch run',
        plannedQty: 1000,
        plannedRuntimeMinutes,
      },
    });
    expect(res.status(), `create ${tag} returned ${res.status()}`).toBe(200);
    return (await res.json()).id as number;
  }

  test.describe('Role-based authorization (403)', () => {
    // @PreAuthorize("hasRole('MANAGER')") on JobOrderController.create.
    test('operator cannot create job orders (manager-only)', async ({ request }) => {
      const res = await request.post('/api/job-orders', {
        ...bearer(operator),
        data: {
          orderNo: orderNo('FORBIDDEN'),
          lineId: lineA.id,
          product: 'should never exist',
          plannedQty: 100,
          plannedRuntimeMinutes: 60,
        },
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('You do not have permission to perform this action');
    });

    // @PreAuthorize("hasRole('MANAGER')") on LineController.create.
    test('operator cannot create production lines (manager-only)', async ({ request }) => {
      const res = await request.post('/api/lines', {
        ...bearer(operator),
        data: { code: `E2E-${RUN_ID}`, name: 'should never exist', ratedUnitsPerHour: 1000 },
      });
      expect(res.status()).toBe(403);
    });

    // QC holds require hasAnyRole('QC', 'MANAGER') — operator is excluded.
    test('operator cannot raise QC holds (qc/manager only)', async ({ request }) => {
      const res = await request.post('/api/qc/holds', {
        ...bearer(operator),
        data: { jobOrderId: 1, reason: 'should never exist', severity: 'LOW' },
      });
      expect(res.status()).toBe(403);
    });

    // Lifecycle transitions require hasAnyRole('OPERATOR', 'MANAGER') — qc is excluded.
    // Method security runs before the service, so no state is touched.
    test('qc cannot start job orders (operator/manager only)', async ({ request }) => {
      const orders = await (await request.get('/api/job-orders', bearer(qc))).json();
      const res = await request.post(`/api/job-orders/${orders[0].id}/start`, bearer(qc));
      expect(res.status()).toBe(403);
    });

    // Inventory writes require hasAnyRole('OPERATOR', 'MANAGER') — qc is excluded.
    test('qc cannot post inventory receipts (operator/manager only)', async ({ request }) => {
      const res = await request.post('/api/inventory/receipts', {
        ...bearer(qc),
        data: { sku: 'PET-PREFORM-28G', quantity: 1, unitCost: 0.01 },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('Validation and business-rule rejections', () => {
    test('rejects a job order with blank/missing/non-positive fields (400 + field details)', async ({
      request,
    }) => {
      const res = await request.post('/api/job-orders', {
        ...bearer(manager),
        data: { orderNo: '', product: '', plannedQty: -5, plannedRuntimeMinutes: 0 },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Validation failed');
      const details = (body.details as string[]).join('; ');
      for (const field of ['orderNo', 'lineId', 'product', 'plannedQty', 'plannedRuntimeMinutes']) {
        expect(details, `details flag ${field}`).toContain(field);
      }
    });

    // OEE edge case "zero planned minutes": @Positive on plannedRuntimeMinutes
    // rejects it at the API boundary, so OeeCalculator's divide-by-zero guard
    // (availability denominator) is unreachable through the live API.
    test('rejects zero planned runtime minutes at the boundary (divide-by-zero guard)', async ({
      request,
    }) => {
      const res = await request.post('/api/job-orders', {
        ...bearer(manager),
        data: {
          orderNo: orderNo('ZEROMIN'),
          lineId: lineA.id,
          product: 'zero planned minutes',
          plannedQty: 100,
          plannedRuntimeMinutes: 0,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect((body.details as string[]).join('; ')).toContain('plannedRuntimeMinutes');
    });

    test('rejects negative unit counts when closing (400, no state change)', async ({
      request,
    }) => {
      const id = await createOrder(request, 'NEGCLOSE', 60);
      await request.post(`/api/job-orders/${id}/start`, bearer(operator));

      const res = await request.post(`/api/job-orders/${id}/close`, {
        ...bearer(operator),
        data: { goodUnits: -1, rejectUnits: -10 },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Validation failed');
      expect((body.details as string[]).join('; ')).toContain('goodUnits');

      // The rejected close must not have advanced the lifecycle.
      const after = await (await request.get(`/api/job-orders/${id}`, bearer(manager))).json();
      expect(after.status).toBe('RUNNING');
    });

    test('rejects downtime with non-positive minutes and blank reason (400)', async ({
      request,
    }) => {
      const id = await createOrder(request, 'BADDT', 60);
      const res = await request.post(`/api/job-orders/${id}/downtime`, {
        ...bearer(operator),
        data: { minutes: 0, reason: '' },
      });
      expect(res.status()).toBe(400);
      const details = ((await res.json()).details as string[]).join('; ');
      expect(details).toContain('minutes');
      expect(details).toContain('reason');
    });

    test('creating a job order on an unknown line returns 404', async ({ request }) => {
      const res = await request.post('/api/job-orders', {
        ...bearer(manager),
        data: {
          orderNo: orderNo('NOLINE'),
          lineId: 999_999,
          product: 'orphan',
          plannedQty: 100,
          plannedRuntimeMinutes: 60,
        },
      });
      expect(res.status()).toBe(404);
    });

    test('enforces the PLANNED → RUNNING → CLOSED lifecycle (409 on illegal transitions)', async ({
      request,
    }) => {
      const id = await createOrder(request, 'LIFEC', 60);

      // Duplicate order number → BusinessRuleException → 409.
      const dup = await request.post('/api/job-orders', {
        ...bearer(manager),
        data: {
          orderNo: orderNo('LIFEC'),
          lineId: lineA.id,
          product: 'duplicate',
          plannedQty: 100,
          plannedRuntimeMinutes: 60,
        },
      });
      expect(dup.status()).toBe(409);
      expect((await dup.json()).message).toContain('already exists');

      // PLANNED → RUNNING is legal (operator role is sufficient).
      const start = await request.post(`/api/job-orders/${id}/start`, bearer(operator));
      expect(start.status()).toBe(200);
      expect((await start.json()).status).toBe('RUNNING');

      // RUNNING → RUNNING is not: only PLANNED orders can be started.
      const restart = await request.post(`/api/job-orders/${id}/start`, bearer(operator));
      expect(restart.status()).toBe(409);
      expect((await restart.json()).message).toContain('only PLANNED orders can be started');

      // RUNNING → CLOSED is legal.
      const close = await request.post(`/api/job-orders/${id}/close`, {
        ...bearer(operator),
        data: { goodUnits: 900, rejectUnits: 100 },
      });
      expect(close.status()).toBe(200);
      expect((await close.json()).status).toBe('CLOSED');

      // Closing twice → 409.
      const reclose = await request.post(`/api/job-orders/${id}/close`, {
        ...bearer(operator),
        data: { goodUnits: 900, rejectUnits: 100 },
      });
      expect(reclose.status()).toBe(409);
      expect((await reclose.json()).message).toContain('already closed');

      // Logging downtime against a closed order → 409.
      const lateDt = await request.post(`/api/job-orders/${id}/downtime`, {
        ...bearer(operator),
        data: { minutes: 5, reason: 'too late' },
      });
      expect(lateDt.status()).toBe(409);
      expect((await lateDt.json()).message).toContain('closed job order');
    });
  });

  test.describe('OEE edge cases on close', () => {
    /** Every OEE factor must come back clamped to [0, 1]. */
    function expectFactorsInUnitRange(job: Record<string, unknown>) {
      for (const key of ['availability', 'performance', 'quality', 'oee']) {
        const value = Number(job[key]);
        expect(Number.isFinite(value), `${key} should be numeric`).toBeTruthy();
        expect(value, `${key} >= 0`).toBeGreaterThanOrEqual(0);
        expect(value, `${key} <= 1`).toBeLessThanOrEqual(1);
      }
    }

    test('clamps performance to 1 when output exceeds the line rated speed', async ({
      request,
    }) => {
      // 5 planned minutes on LINE-A (7200 u/h = 120 u/min) can ideally make
      // 600 units; closing with 5000 good units would put raw performance at
      // ~8.3 — OeeCalculator clamps each factor to [0, 1] instead of 500ing.
      const id = await createOrder(request, 'CLAMP', 5);
      await request.post(`/api/job-orders/${id}/start`, bearer(operator));

      const res = await request.post(`/api/job-orders/${id}/close`, {
        ...bearer(operator),
        data: { goodUnits: 5000, rejectUnits: 0 },
      });
      expect(res.status()).toBe(200);
      const job = await res.json();
      expect(job.status).toBe('CLOSED');
      expectFactorsInUnitRange(job);
      expect(Number(job.performance), 'over-speed performance clamped').toBe(1);
      expect(Number(job.availability), 'no downtime logged').toBe(1);
      expect(Number(job.quality), 'all units good').toBe(1);
      expect(Number(job.oee)).toBe(1);
    });

    test('floors availability and performance at 0 when downtime exceeds planned runtime', async ({
      request,
    }) => {
      // runTime = max(0, planned - downtime) = max(0, 5 - 30) = 0, so
      // availability is 0 and the performance ratio's zero denominator is
      // guarded to 0 instead of dividing by zero.
      const id = await createOrder(request, 'OVERDT', 5);
      await request.post(`/api/job-orders/${id}/start`, bearer(operator));
      const dt = await request.post(`/api/job-orders/${id}/downtime`, {
        ...bearer(operator),
        data: { minutes: 30, reason: 'E2E: downtime exceeding planned runtime' },
      });
      expect(dt.status()).toBe(200);

      const res = await request.post(`/api/job-orders/${id}/close`, {
        ...bearer(operator),
        data: { goodUnits: 100, rejectUnits: 0 },
      });
      expect(res.status()).toBe(200);
      const job = await res.json();
      expectFactorsInUnitRange(job);
      expect(job.downtimeMinutes).toBe(30);
      expect(Number(job.availability)).toBe(0);
      expect(Number(job.performance)).toBe(0);
      expect(Number(job.quality), 'quality unaffected by downtime').toBe(1);
      expect(Number(job.oee)).toBe(0);
    });

    test('closing with zero units yields zero quality/performance, not a 500', async ({
      request,
    }) => {
      // goodUnits + rejectUnits = 0 hits the quality ratio's divide-by-zero
      // guard (and ideal minutes are 0), so quality/performance/oee are 0.
      const id = await createOrder(request, 'ZEROU', 5);
      await request.post(`/api/job-orders/${id}/start`, bearer(operator));

      const res = await request.post(`/api/job-orders/${id}/close`, {
        ...bearer(operator),
        data: { goodUnits: 0, rejectUnits: 0 },
      });
      expect(res.status()).toBe(200);
      const job = await res.json();
      expect(job.status).toBe('CLOSED');
      expectFactorsInUnitRange(job);
      expect(Number(job.quality)).toBe(0);
      expect(Number(job.performance)).toBe(0);
      expect(Number(job.availability), 'no downtime logged').toBe(1);
      expect(Number(job.oee)).toBe(0);
    });
  });
});
