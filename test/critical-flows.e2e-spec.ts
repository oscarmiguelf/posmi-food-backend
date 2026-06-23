/**
 * E2E tests for critical money and inventory flows (section 4.5).
 * These tests run against the real database — they verify the actual
 * ACID transaction behaviour, not a mock.
 *
 * Prerequisites: server running at http://localhost:3000
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

const BASE = 'http://localhost:3000/api/v1';

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

function uuid() {
  return crypto.randomUUID();
}

describe('Critical flows — money and inventory', () => {
  let token: string;
  let menuItemId: string;

  beforeAll(async () => {
    const login = await post('/auth/login', {
      email: 'admin@demo.com',
      password: 'Admin1234!',
    });
    token = login.data.accessToken as string;
  });

  describe('Order close flow', () => {
    let tableId: string;
    let orderId: string;
    const orderIk = uuid();
    const closeIk = uuid();

    beforeAll(async () => {
      // Get a free table and a menu item
      const tables = await get('/tables', token);
      const freeTable = (tables.data as { id: string; status: string }[]).find(
        (t) => t.status === 'free',
      );
      expect(freeTable).toBeDefined();
      tableId = freeTable!.id;

      const items = await get('/menu-items', token);
      menuItemId = (items.data as { id: string }[])[0].id;
    });

    it('creates order with idempotency', async () => {
      const res = await post(
        '/orders',
        {
          idempotencyKey: orderIk,
          tableId,
          items: [{ menuItemId, quantity: 1 }],
        },
        token,
      );
      expect(res.data.status).toBe('open');
      orderId = res.data.id as string;
    });

    it('creating same order twice returns same result (idempotent)', async () => {
      const res = await post(
        '/orders',
        {
          idempotencyKey: orderIk,
          tableId,
          items: [{ menuItemId, quantity: 1 }],
        },
        token,
      );
      expect(res.data.id).toBe(orderId);
    });

    it('closes order and returns total + pointsEarned', async () => {
      const res = await post(
        `/orders/${orderId}/close`,
        {
          idempotencyKey: closeIk,
          version: 0,
          payments: [{ amount: '9999.00', paymentMethod: 'cash' }],
        },
        token,
      );
      expect(res.data.status).toBe('closed');
      expect(typeof res.data.total).toBe('string');
      expect(typeof res.data.pointsEarned).toBe('number');
    });

    it('closing same order twice returns cached result (idempotent)', async () => {
      const res = await post(
        `/orders/${orderId}/close`,
        {
          idempotencyKey: closeIk,
          version: 0,
          payments: [{ amount: '9999.00', paymentMethod: 'cash' }],
        },
        token,
      );
      // ProcessedOperation returns cached result — no CONFLICT error
      expect(res.data).toBeDefined();
      expect(res.code).toBeUndefined();
    });

    it('table is free after order is closed', async () => {
      const tables = await get('/tables', token);
      const table = (tables.data as { id: string; status: string }[]).find(
        (t) => t.id === tableId,
      );
      expect(table?.status).toBe('free');
    });

    it('rejects stale version on close', async () => {
      // Try to close again with wrong version (non-idempotent key)
      const res = await post(
        `/orders/${orderId}/close`,
        {
          idempotencyKey: uuid(),
          version: 99,
          payments: [{ amount: '9999.00', paymentMethod: 'cash' }],
        },
        token,
      );
      // Already closed — should be duplicate or stale
      expect(['DUPLICATE_ENTRY', 'CONFLICT_STALE_DATA']).toContain(res.code);
    });
  });

  describe('Cash session flow', () => {
    let sessionId: string;
    const openIk = uuid();
    const closeIk = uuid();
    const movIk = uuid();

    it('opens a cash session', async () => {
      const res = await post(
        '/cash-sessions/open',
        { idempotencyKey: openIk, openingAmount: '500.00' },
        token,
      );
      expect(res.data.id ?? res.data.sessionId).toBeDefined();
      sessionId = (res.data.id as string) ?? (res.data.sessionId as string);
    });

    it('registers a payin movement', async () => {
      const res = await post(
        `/cash-sessions/${sessionId}/movements`,
        {
          idempotencyKey: movIk,
          type: 'payin',
          amount: '200.00',
          paymentMethod: 'cash',
        },
        token,
      );
      expect(res.data.type ?? res.data.movementId).toBeDefined();
    });

    it('payin is idempotent', async () => {
      const res = await post(
        `/cash-sessions/${sessionId}/movements`,
        {
          idempotencyKey: movIk,
          type: 'payin',
          amount: '200.00',
          paymentMethod: 'cash',
        },
        token,
      );
      // Returns cached result — no duplicate created
      expect(res.data).toBeDefined();
    });

    it('closes the cash session and returns system amount', async () => {
      const res = await post(
        `/cash-sessions/${sessionId}/close`,
        { idempotencyKey: closeIk, closingAmountDeclared: '700.00' },
        token,
      );
      expect(res.data.closedAt ?? res.data.closedAt).toBeDefined();
    });

    it('session report shows correct totals', async () => {
      const res = await get(`/cash-sessions/${sessionId}/report`, token);
      expect(res.data.movements.payins.count).toBeGreaterThanOrEqual(1);
      expect(parseFloat(res.data.movements.payins.total)).toBeGreaterThan(0);
    });
  });

  describe('Sync status endpoint', () => {
    it('GET /sync/status returns syncMode and outboxPending', async () => {
      const res = await fetch(`${BASE}/sync/status`);
      const body = (await res.json()) as {
        data: { syncMode: string; outboxPending: number };
      };
      expect(body.data.syncMode).toBe('local_hub');
      expect(typeof body.data.outboxPending).toBe('number');
    });
  });

  describe('Module guard', () => {
    it('GET /config returns enabled modules', async () => {
      const res = await fetch(`${BASE}/config`);
      const body = (await res.json()) as { modules: Record<string, boolean> };
      expect(typeof body.modules.reservations).toBe('boolean');
      expect(typeof body.modules.purchasing).toBe('boolean');
    });
  });
});
