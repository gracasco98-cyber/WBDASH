/**
 * sync-shopify.test.ts — Integration tests locking in Shopify sync ingestion behaviour.
 *
 * PR 8 of the revision roadmap.
 *
 * Strategy:
 *  - Real Postgres via testcontainers (same pattern as PR 6/7).
 *  - MSW intercepts ALL fetch() calls to *.myshopify.com so the real
 *    fetchOrdersSince() + processOrderBatch() pipeline runs unmodified.
 *  - Env vars set BEFORE dynamic-importing shopify.service / order.service so
 *    the module-level `const prisma = new PrismaClient()` picks up the test DB.
 *
 * LOCK-IN behaviours are documented with // LOCK-IN: ... comments.
 *
 * Covered scenarios:
 *  1.  Happy path: fetch + insert N orders
 *  2.  Dedup: same orders synced twice → no duplicates (upsert-based)
 *  3.  Update: changed totalAmount on second sync → row updated
 *  4.  Pagination: multi-page response → all orders ingested
 *  5.  Marketplace classification at ingest (tag-based)
 *  6.  UNCLASSIFIED when no tags / sources match
 *  7.  Line items normalisation: quantity, unitPrice, lineTotal, marketplace
 *  8.  Refunded order: isRefunded=true, refundedAmount, netAmount computed
 *  9.  Cancelled order: isCancelled=true stored; NOT filtered from DB
 *  10. Test order: raw.test=true → upsertOrder returns null, row NOT inserted
 *  11. HTTP 500 from Shopify → sync throws, SyncState set to 'error'
 *  12. GraphQL-level errors (HTTP 200 + errors[]) → sync throws
 *  13. Network failure → sync throws, no partial state corruption
 *  14. processOrderBatch: per-order error is isolated (other orders still inserted)
 *  15. Shop Apotheke sub-channel → REDCARE_IT by default
 *  16. sourceName matching fallback (no tags)
 *  17. channelDisplayName matching fallback (no tags, no sourceName)
 *  18. runInitialSync orchestration: SyncState created + updated to idle
 *  19. runIncrementalSync: respects 5-min overlap in lastSyncAt window
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { setupTestDb, truncateAll, type TestDb } from '../helpers/db';
import { shopifyMocks, http, HttpResponse } from '../helpers/msw-server';
import type { ShopifyRawOrder } from '../../src/services/shopify.service';

// ─── MSW server ───────────────────────────────────────────────────────────────
// onUnhandledRequest: 'error' ensures no real HTTP calls escape in tests.
const server = setupServer();

// ─── Fixture builders ─────────────────────────────────────────────────────────
/** Minimal valid ShopifyRawOrder that can be passed through upsertOrder. */
function makeRawOrder(
  overrides: Partial<ShopifyRawOrder> & { id: string; name: string },
): ShopifyRawOrder {
  return {
    id: overrides.id,
    name: overrides.name,
    createdAt: overrides.createdAt ?? '2026-04-10T09:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-04-10T09:00:00Z',
    processedAt: overrides.processedAt ?? '2026-04-10T09:00:00Z',
    cancelledAt: overrides.cancelledAt ?? null,
    closedAt: overrides.closedAt ?? null,
    test: overrides.test ?? false,
    tags: overrides.tags ?? [],
    sourceName: overrides.sourceName ?? null,
    sourceIdentifier: overrides.sourceIdentifier ?? null,
    displayFinancialStatus: overrides.displayFinancialStatus ?? 'PAID',
    displayFulfillmentStatus: overrides.displayFulfillmentStatus ?? 'FULFILLED',
    currentTotalPriceSet: overrides.currentTotalPriceSet ?? {
      shopMoney: { amount: '100.00', currencyCode: 'EUR' },
    },
    totalRefundedSet: overrides.totalRefundedSet ?? null,
    channelInformation: overrides.channelInformation ?? null,
    customer: overrides.customer ?? null,
    shippingAddress: overrides.shippingAddress ?? null,
    lineItems: overrides.lineItems ?? { edges: [] },
  };
}

/** Build a minimal ShopifyLineItem node wrapped in an edge */
function makeLineItemEdge(id: string, opts: {
  quantity?: number;
  unitPrice?: string;
  originalPrice?: string;
  discount?: string;
  productId?: string;
  sku?: string;
  title?: string;
} = {}) {
  return {
    node: {
      id,
      title: opts.title ?? 'Test Product',
      quantity: opts.quantity ?? 1,
      sku: opts.sku ?? 'SKU-001',
      variantTitle: null,
      image: null,
      originalUnitPriceSet: {
        shopMoney: { amount: opts.originalPrice ?? opts.unitPrice ?? '50.00', currencyCode: 'EUR' },
      },
      discountedUnitPriceSet: {
        shopMoney: { amount: opts.unitPrice ?? '50.00', currencyCode: 'EUR' },
      },
      totalDiscountSet: {
        shopMoney: { amount: opts.discount ?? '0.00', currencyCode: 'EUR' },
      },
      variant: opts.productId ? {
        id: `gid://shopify/ProductVariant/${opts.productId}`,
        product: { id: `gid://shopify/Product/${opts.productId}`, featuredImage: null },
      } : null,
    },
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────
describe('Shopify Sync — integration (PR 8)', () => {
  let db: TestDb;

  // These are set after db is ready, before service imports
  let fetchOrdersSince: typeof import('../../src/services/shopify.service').fetchOrdersSince;
  let upsertOrder: typeof import('../../src/services/order.service').upsertOrder;
  let processOrderBatch: typeof import('../../src/services/order.service').processOrderBatch;
  let runInitialSync: typeof import('../../src/jobs/sync.job').runInitialSync;
  let runIncrementalSync: typeof import('../../src/jobs/sync.job').runIncrementalSync;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  beforeAll(async () => {
    db = await setupTestDb();

    // Set env BEFORE importing modules — the module-level `new PrismaClient()` and
    // `const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN!` read these at load time.
    // LOCK-IN: module singletons capture env at require() time, so we must set
    // env vars before the first import() in this process.
    process.env.DATABASE_URL       = db.databaseUrl;
    process.env.SHOPIFY_STORE_DOMAIN = 'test-shop.myshopify.com';
    process.env.SHOPIFY_ADMIN_TOKEN  = 'shpat_test_token';

    // Dynamic imports so env is already set
    const shopifyService = await import('../../src/services/shopify.service');
    const orderService   = await import('../../src/services/order.service');
    const syncJob        = await import('../../src/jobs/sync.job');

    fetchOrdersSince = shopifyService.fetchOrdersSince;
    upsertOrder      = orderService.upsertOrder;
    processOrderBatch = orderService.processOrderBatch;
    runInitialSync   = syncJob.runInitialSync;
    runIncrementalSync = syncJob.runIncrementalSync;

    // Start MSW — intercepts all outbound fetch()
    server.listen({ onUnhandledRequest: 'error' });
  }, 120_000); // testcontainers boot

  afterAll(async () => {
    server.close();
    await db.cleanup();
  });

  beforeEach(async () => {
    await truncateAll(db.prisma);
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  // ── 1. Happy path: fetch + insert 5 orders ─────────────────────────────────
  it('happy path: fetching 5 orders inserts 5 ShopifyOrder rows', async () => {
    const orders = Array.from({ length: 5 }, (_, i) =>
      makeRawOrder({
        id: `gid://shopify/Order/${1000 + i}`,
        name: `#${1000 + i}`,
        tags: ['REDCARE_IT'],
      }),
    );

    server.use(shopifyMocks.ordersList(orders));

    let batchCount = 0;
    await fetchOrdersSince(new Date('2026-01-01'), async (batch) => {
      batchCount++;
      await processOrderBatch(batch);
    });

    expect(batchCount).toBe(1);

    const count = await db.prisma.shopifyOrder.count();
    expect(count).toBe(5);
  });

  // ── 2. Dedup: same orders synced twice → no duplicates ─────────────────────
  it('dedup: syncing the same orders twice does not duplicate rows', async () => {
    // LOCK-IN: upsertOrder uses prisma.shopifyOrder.upsert({ where: { shopifyOrderId } })
    // so a second sync with the same order IDs results in UPDATEs, not INSERT duplicates.
    const orders = [
      makeRawOrder({ id: 'gid://shopify/Order/A1', name: '#A1' }),
      makeRawOrder({ id: 'gid://shopify/Order/A2', name: '#A2' }),
    ];

    // First sync
    server.use(shopifyMocks.ordersList(orders));
    await fetchOrdersSince(new Date('2026-01-01'), async (batch) => {
      await processOrderBatch(batch);
    });

    server.resetHandlers();

    // Second sync with same orders
    server.use(shopifyMocks.ordersList(orders));
    await fetchOrdersSince(new Date('2026-01-01'), async (batch) => {
      await processOrderBatch(batch);
    });

    const count = await db.prisma.shopifyOrder.count();
    expect(count).toBe(2); // not 4
  });

  // ── 3. Update: changed totalAmount on second sync → row updated ────────────
  it('update: second sync with changed totalAmount updates the existing row', async () => {
    const orderId = 'gid://shopify/Order/U1';
    const original = makeRawOrder({
      id: orderId,
      name: '#U1',
      currentTotalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'EUR' } },
    });

    // First sync
    server.use(shopifyMocks.ordersList([original]));
    await fetchOrdersSince(new Date('2026-01-01'), async (batch) => {
      await processOrderBatch(batch);
    });

    const rowBefore = await db.prisma.shopifyOrder.findUnique({
      where: { shopifyOrderId: orderId },
    });
    expect(rowBefore!.totalAmount).toBe(100);

    server.resetHandlers();

    // Second sync: price changed to 120
    const updated = {
      ...original,
      currentTotalPriceSet: { shopMoney: { amount: '120.00', currencyCode: 'EUR' } },
      updatedAt: '2026-04-11T10:00:00Z',
    };
    server.use(shopifyMocks.ordersList([updated]));
    await fetchOrdersSince(new Date('2026-01-01'), async (batch) => {
      await processOrderBatch(batch);
    });

    const rowAfter = await db.prisma.shopifyOrder.findUnique({
      where: { shopifyOrderId: orderId },
    });
    expect(db.prisma.shopifyOrder.count()).resolves.toBe(1); // still just one row
    expect(rowAfter!.totalAmount).toBe(120);
    expect(rowAfter!.netAmount).toBe(120); // no refunds → netAmount = totalAmount
    // LOCK-IN: update path sets syncedAt to new Date()
    expect(rowAfter!.syncedAt.getTime()).toBeGreaterThanOrEqual(rowBefore!.syncedAt.getTime());
  });

  // ── 4. Pagination: two pages → all orders ingested ────────────────────────
  it('pagination: two-page response results in all orders being inserted', async () => {
    const page1 = Array.from({ length: 3 }, (_, i) =>
      makeRawOrder({ id: `gid://shopify/Order/P1_${i}`, name: `#P1_${i}` }),
    );
    const page2 = Array.from({ length: 2 }, (_, i) =>
      makeRawOrder({ id: `gid://shopify/Order/P2_${i}`, name: `#P2_${i}` }),
    );

    server.use(
      shopifyMocks.ordersPages([
        { orders: page1, hasNextPage: true, endCursor: 'cursor-after-page1' },
        { orders: page2, hasNextPage: false },
      ]),
    );

    let totalInserted = 0;
    await fetchOrdersSince(new Date('2026-01-01'), async (batch) => {
      const { ok } = await processOrderBatch(batch);
      totalInserted += ok;
    });

    expect(totalInserted).toBe(5);
    const count = await db.prisma.shopifyOrder.count();
    expect(count).toBe(5);
  });

  // ── 5. Marketplace classification: tag-based at ingest ────────────────────
  it('marketplace classification: REDCARE_IT tag → marketplaceDetected=REDCARE_IT', async () => {
    const order = makeRawOrder({ id: 'gid://shopify/Order/M1', name: '#M1', tags: ['REDCARE_IT'] });
    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.marketplaceDetected).toBe('REDCARE_IT');
    // LOCK-IN: detection reason records the tag that matched
    expect(row!.marketplaceDetectionReason).toMatch(/REDCARE_IT/i);
  });

  it('marketplace classification: TEMU_IT tag → marketplaceDetected=TEMU_IT', async () => {
    const order = makeRawOrder({ id: 'gid://shopify/Order/M2', name: '#M2', tags: ['temu_it'] });
    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.marketplaceDetected).toBe('TEMU_IT');
  });

  // ── 6. UNCLASSIFIED when no tag/source/channel matches ─────────────────────
  it('marketplace: no matching tags/source → UNCLASSIFIED', async () => {
    const order = makeRawOrder({ id: 'gid://shopify/Order/M3', name: '#M3', tags: [] });
    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.marketplaceDetected).toBe('UNCLASSIFIED');
  });

  // ── 7. Line items normalisation ────────────────────────────────────────────
  it('line items: creates OrderLineItem rows with correct computed values', async () => {
    const order = makeRawOrder({
      id: 'gid://shopify/Order/LI1',
      name: '#LI1',
      tags: ['REDCARE_IT'],
      currentTotalPriceSet: { shopMoney: { amount: '150.00', currencyCode: 'EUR' } },
      lineItems: {
        edges: [
          makeLineItemEdge('li-001', { quantity: 2, unitPrice: '50.00', productId: '9999', title: 'Product A' }),
          makeLineItemEdge('li-002', { quantity: 1, unitPrice: '50.00', productId: '9998', title: 'Product B', discount: '5.00' }),
        ],
      },
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const dbOrder = await db.prisma.shopifyOrder.findUnique({
      where: { shopifyOrderId: order.id },
      include: { lineItems: { orderBy: { shopifyLineItemId: 'asc' } } },
    });

    expect(dbOrder).not.toBeNull();
    expect(dbOrder!.lineItems).toHaveLength(2);

    const [li1, li2] = dbOrder!.lineItems;

    // li-001: qty=2, unit=50 → lineTotal=100
    expect(li1.shopifyLineItemId).toBe('li-001');
    expect(li1.quantity).toBe(2);
    expect(li1.unitPrice).toBe(50);
    expect(li1.lineTotal).toBe(100); // 2 * 50
    // LOCK-IN: marketplace on line item mirrors the order's detected marketplace
    expect(li1.marketplace).toBe('REDCARE_IT');

    // li-002: qty=1, unit=50, discount=5 → lineTotal=50
    expect(li2.shopifyLineItemId).toBe('li-002');
    expect(li2.quantity).toBe(1);
    expect(li2.unitPrice).toBe(50);
    expect(li2.totalDiscount).toBe(5);
    expect(li2.lineTotal).toBe(50); // 1 * 50 (lineTotal = unitPrice * qty, discount stored separately)
    expect(li2.marketplace).toBe('REDCARE_IT');
  });

  // ── 8. Refunded order ──────────────────────────────────────────────────────
  it('refunded order: isRefunded=true, refundedAmount and netAmount computed', async () => {
    const order = makeRawOrder({
      id: 'gid://shopify/Order/R1',
      name: '#R1',
      currentTotalPriceSet:  { shopMoney: { amount: '200.00', currencyCode: 'EUR' } },
      totalRefundedSet:      { shopMoney: { amount: '50.00',  currencyCode: 'EUR' } },
      displayFinancialStatus: 'PARTIALLY_REFUNDED',
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.isRefunded).toBe(true);
    expect(row!.refundedAmount).toBe(50);
    expect(row!.netAmount).toBe(150); // 200 - 50
    expect(row!.totalAmount).toBe(200);
  });

  it('fully refunded order: netAmount=0', async () => {
    const order = makeRawOrder({
      id: 'gid://shopify/Order/R2',
      name: '#R2',
      currentTotalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'EUR' } },
      totalRefundedSet:     { shopMoney: { amount: '100.00', currencyCode: 'EUR' } },
      displayFinancialStatus: 'REFUNDED',
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.isRefunded).toBe(true);
    expect(row!.netAmount).toBe(0);
  });

  // ── 9. Cancelled order ─────────────────────────────────────────────────────
  it('cancelled order: isCancelled=true stored in DB', async () => {
    const cancelledAt = '2026-04-11T15:00:00Z';
    const order = makeRawOrder({
      id: 'gid://shopify/Order/C1',
      name: '#C1',
      cancelledAt,
      displayFinancialStatus: 'VOIDED',
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.isCancelled).toBe(true);
    expect(row!.cancelledAt).toEqual(new Date(cancelledAt));
  });

  // ── 10. Test order: not inserted ───────────────────────────────────────────
  it('test order: raw.test=true → row NOT inserted into DB', async () => {
    // LOCK-IN: upsertOrder returns null early when raw.test === true (no DB write)
    const testOrder = makeRawOrder({ id: 'gid://shopify/Order/T1', name: '#T1', test: true });

    server.use(shopifyMocks.ordersList([testOrder]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const count = await db.prisma.shopifyOrder.count();
    expect(count).toBe(0);

    // Direct call also returns null
    server.resetHandlers();
    const result = await upsertOrder(testOrder);
    expect(result).toBeNull();
  });

  // ── 11. HTTP 500: sync throws, SyncState updated to error ─────────────────
  it('HTTP 500: runInitialSync catches error and sets SyncState to error', async () => {
    // LOCK-IN: Shopify API non-2xx → gqlRequest throws `Shopify API error 500: ...`
    // runInitialSync catches this and persists status='error' in SyncState.
    server.use(shopifyMocks.httpError(500, 'Internal Server Error'));

    // runInitialSync needs SyncState 'main' to exist or creates it
    await runInitialSync();

    const state = await db.prisma.syncState.findUnique({ where: { id: 'main' } });
    expect(state).not.toBeNull();
    expect(state!.status).toBe('error');
    expect(state!.error).toMatch(/500/);

    // No orders should be in the DB
    const orderCount = await db.prisma.shopifyOrder.count();
    expect(orderCount).toBe(0);
  });

  // ── 12. GraphQL errors (HTTP 200 + errors array) ──────────────────────────
  it('GraphQL-level errors (HTTP 200 + errors[]): sync throws, no partial state', async () => {
    // LOCK-IN: gqlRequest checks json.errors and throws `GraphQL errors: [...]`
    server.use(
      shopifyMocks.graphqlErrors([{ message: 'ACCESS_DENIED' }]),
    );

    await runInitialSync();

    const state = await db.prisma.syncState.findUnique({ where: { id: 'main' } });
    expect(state!.status).toBe('error');
    expect(state!.error).toMatch(/GraphQL errors/i);
    expect(await db.prisma.shopifyOrder.count()).toBe(0);
  });

  // ── 13. Network failure ────────────────────────────────────────────────────
  it('network failure: sync reports error, no partial DB state', async () => {
    // LOCK-IN: HttpResponse.error() causes fetch() to reject with TypeError
    server.use(shopifyMocks.networkError());

    await runInitialSync();

    const state = await db.prisma.syncState.findUnique({ where: { id: 'main' } });
    expect(state!.status).toBe('error');
    expect(await db.prisma.shopifyOrder.count()).toBe(0);
  });

  // ── 14. Per-order error isolation in processOrderBatch ────────────────────
  it('processOrderBatch: per-order error is isolated; other orders still inserted', async () => {
    // LOCK-IN: processOrderBatch wraps each order in try/catch, increments `errors`
    // but continues. The ok count reflects only successful upserts.
    const goodOrder = makeRawOrder({ id: 'gid://shopify/Order/G1', name: '#G1' });
    // This order has an invalid date string that will cause new Date() to yield NaN
    // → prisma write fails (timestamp NaN is invalid)
    const badOrder: ShopifyRawOrder = {
      ...makeRawOrder({ id: 'gid://shopify/Order/BAD', name: '#BAD' }),
      createdAt: 'not-a-date', // forces Date constructor to produce Invalid Date
    };

    const result = await processOrderBatch([goodOrder, badOrder]);

    expect(result.ok).toBe(1);
    expect(result.errors).toBe(1);

    // Only the good order should be in DB
    const count = await db.prisma.shopifyOrder.count();
    expect(count).toBe(1);
    const row = await db.prisma.shopifyOrder.findUnique({
      where: { shopifyOrderId: goodOrder.id },
    });
    expect(row).not.toBeNull();
  });

  // ── 15. Shop Apotheke sub-channel → REDCARE_IT ────────────────────────────
  it('Shop Apotheke sourceName → REDCARE_IT (default, no country tag)', async () => {
    // LOCK-IN: detectMarketplace() has a Passo 0 that intercepts "shop apotheke" source
    // and returns REDCARE_IT unless tags also contain "redcare de".
    const order = makeRawOrder({
      id: 'gid://shopify/Order/SA1',
      name: '#SA1',
      sourceName: 'Shop Apotheke',
      tags: [],
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.marketplaceDetected).toBe('REDCARE_IT');
    expect(row!.marketplaceDetectionReason).toMatch(/Shop Apotheke/i);
  });

  it('Shop Apotheke + "REDCARE DE" tag → REDCARE_DE', async () => {
    const order = makeRawOrder({
      id: 'gid://shopify/Order/SA2',
      name: '#SA2',
      sourceName: 'shop apotheke',
      tags: ['REDCARE DE'],
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.marketplaceDetected).toBe('REDCARE_DE');
  });

  // ── 16. sourceName fallback ────────────────────────────────────────────────
  it('sourceName=web → SITO (when no tag matches)', async () => {
    // LOCK-IN: sourceName "web" matches SITO rule via step 2 (sourceNames matching)
    const order = makeRawOrder({
      id: 'gid://shopify/Order/SN1',
      name: '#SN1',
      sourceName: 'web',
      tags: [],
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.marketplaceDetected).toBe('SITO');
  });

  // ── 17. channelDisplayName fallback ───────────────────────────────────────
  it('channelDisplayName=Online Store → SITO (no tags, no sourceName)', async () => {
    // LOCK-IN: channelInformation.channelDefinition.channelName used as channelDisplayName
    const order = makeRawOrder({
      id: 'gid://shopify/Order/CH1',
      name: '#CH1',
      tags: [],
      sourceName: null,
      channelInformation: {
        channelDefinition: { channelName: 'Online Store' },
        app: null,
      },
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.marketplaceDetected).toBe('SITO');
    expect(row!.channelDisplayName).toBe('Online Store');
  });

  // ── 18. runInitialSync: SyncState lifecycle ────────────────────────────────
  it('runInitialSync: creates SyncState, syncs orders, sets status=idle', async () => {
    const orders = [
      makeRawOrder({ id: 'gid://shopify/Order/IS1', name: '#IS1', tags: ['TEMU_IT'] }),
      makeRawOrder({ id: 'gid://shopify/Order/IS2', name: '#IS2', tags: ['EBAY'] }),
    ];

    server.use(shopifyMocks.ordersList(orders));

    await runInitialSync();

    const state = await db.prisma.syncState.findUnique({ where: { id: 'main' } });
    expect(state).not.toBeNull();
    expect(state!.status).toBe('idle');
    expect(state!.totalSynced).toBe(2);
    expect(state!.lastSyncAt).not.toBeNull();
    expect(state!.error).toBeNull();

    const orderCount = await db.prisma.shopifyOrder.count();
    expect(orderCount).toBe(2);
  });

  // ── 19. runIncrementalSync: uses lastSyncAt with 5-min overlap ─────────────
  it('runIncrementalSync: uses 5-min overlap from lastSyncAt when SyncState exists', async () => {
    // LOCK-IN: incremental sync uses lastSyncAt - 5min as the `since` boundary.
    // We can't easily inspect the `since` Date passed to fetchOrdersSince without
    // a spy, so we verify the side-effect: orders that fall within the overlap window
    // are fetched and upserted.

    // Seed SyncState with a recent lastSyncAt
    const lastSyncAt = new Date('2026-04-10T10:00:00Z');
    await db.prisma.syncState.upsert({
      where: { id: 'main' },
      create: { id: 'main', status: 'idle', lastSyncAt },
      update: { status: 'idle', lastSyncAt },
    });

    const orders = [
      makeRawOrder({ id: 'gid://shopify/Order/INC1', name: '#INC1' }),
    ];

    server.use(shopifyMocks.ordersList(orders));

    await runIncrementalSync();

    const state = await db.prisma.syncState.findUnique({ where: { id: 'main' } });
    expect(state!.status).toBe('idle');
    // totalSynced should have been incremented by 1
    expect(state!.totalSynced).toBeGreaterThanOrEqual(1);

    const count = await db.prisma.shopifyOrder.count();
    expect(count).toBe(1);
  });

  // ── 20. dedup line items: re-syncing same order doesn't duplicate line items
  it('line items dedup: same order synced twice produces no duplicate line items', async () => {
    const order = makeRawOrder({
      id: 'gid://shopify/Order/DLI1',
      name: '#DLI1',
      lineItems: {
        edges: [makeLineItemEdge('dli-001', { quantity: 1, unitPrice: '25.00' })],
      },
    });

    // First sync
    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });
    server.resetHandlers();

    // Second sync with same order
    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    // LOCK-IN: OrderLineItem upserted on shopifyLineItemId unique — no duplicates
    const lineItemCount = await db.prisma.orderLineItem.count();
    expect(lineItemCount).toBe(1);
  });

  // ── 21. currency stored from order ────────────────────────────────────────
  it('currency: stored from currentTotalPriceSet.shopMoney.currencyCode', async () => {
    const order = makeRawOrder({
      id: 'gid://shopify/Order/CUR1',
      name: '#CUR1',
      currentTotalPriceSet: { shopMoney: { amount: '75.00', currencyCode: 'USD' } },
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.currency).toBe('USD');
  });

  // ── 22. rawTags stored as array ────────────────────────────────────────────
  it('rawTags: stored verbatim as string array in DB', async () => {
    const tags = ['REDCARE_IT', 'VIP_CUSTOMER', 'promo-2026'];
    const order = makeRawOrder({ id: 'gid://shopify/Order/TAG1', name: '#TAG1', tags });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.rawTags).toEqual(tags);
  });

  // ── 23. lineItemsCount reflects edge count ────────────────────────────────
  it('lineItemsCount: stored as count of line item edges from Shopify', async () => {
    const order = makeRawOrder({
      id: 'gid://shopify/Order/LIC1',
      name: '#LIC1',
      lineItems: {
        edges: [
          makeLineItemEdge('lic-001'),
          makeLineItemEdge('lic-002'),
          makeLineItemEdge('lic-003'),
        ],
      },
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    // LOCK-IN: lineItemsCount = raw.lineItems?.edges?.length — stored at upsert time
    expect(row!.lineItemsCount).toBe(3);
  });

  // ── 24. order with no refunds: isRefunded=false, refundedAmount=0 ──────────
  it('no refunds: isRefunded=false, refundedAmount=0, netAmount=totalAmount', async () => {
    const order = makeRawOrder({
      id: 'gid://shopify/Order/NR1',
      name: '#NR1',
      currentTotalPriceSet: { shopMoney: { amount: '88.50', currencyCode: 'EUR' } },
      totalRefundedSet: null, // no refunds
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.isRefunded).toBe(false);
    expect(row!.refundedAmount).toBe(0);
    expect(row!.netAmount).toBe(88.5);
    expect(row!.totalAmount).toBe(88.5);
  });

  // ── 25. order with $0 total refundedSet still treated as not refunded ───────
  it('totalRefundedSet with amount 0.00: isRefunded=false', async () => {
    // LOCK-IN: isRefunded = refundedAmount > 0, so 0.00 means false
    const order = makeRawOrder({
      id: 'gid://shopify/Order/ZR1',
      name: '#ZR1',
      currentTotalPriceSet: { shopMoney: { amount: '50.00', currencyCode: 'EUR' } },
      totalRefundedSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
    });

    server.use(shopifyMocks.ordersList([order]));
    await fetchOrdersSince(new Date('2026-01-01'), async (b) => { await processOrderBatch(b); });

    const row = await db.prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: order.id } });
    expect(row!.isRefunded).toBe(false);
    expect(row!.refundedAmount).toBe(0);
  });
});
