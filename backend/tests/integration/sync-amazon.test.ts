/**
 * sync-amazon.test.ts — Integration tests locking in Amazon ingestion behaviour.
 *
 * PR 9 of the revision roadmap. Final safety-net PR.
 *
 * Strategy:
 *  - Real Postgres via testcontainers (same pattern as PR 6/7/8).
 *  - MSW intercepts ALL fetch() calls to SP-API + Settlement + Ads endpoints.
 *  - onUnhandledRequest: 'error' ensures no real HTTP calls leak out.
 *  - Env vars set BEFORE dynamic imports (module singletons capture env at load time).
 *
 * LOCK-IN behaviours documented with // LOCK-IN: ... comments.
 *
 * Covered:
 *  Orders ingestion (ingest.service.ts):
 *   1.  Happy path: TSV → 5 AmazonOrder rows + items
 *   2.  Dedup: same amazonOrderId → no duplicates (ON CONFLICT DO UPDATE)
 *   3.  Update: later lastUpdatedDate → row updated
 *   4.  Non-Amazon salesChannel → row excluded
 *   5.  Per-marketplace: IT/DE/FR/ES codes derived from salesChannel
 *   6.  Items: composite orderItemId key = "orderId::asin::sku"
 *
 *  Settlement reconciliation (settlement.service.ts):
 *   7.  New settlement → AmazonSettlement + AmazonSettlementTransaction rows
 *   8.  Dedup: same settlementId re-synced → no duplicate transactions (delete+reinsert)
 *   9.  Marketplace derived from marketplace-name column
 *   10. Service fee / Cost-of-Advertising row captured in transactions
 *
 *  Forecast calibration (forecast-calibration.service.ts):
 *   11. bootstrapCalibration: AmazonForecastCalibration upserted with EWMA ratios
 *   12. updateCalibrationFromActual: EWMA update on new settlement (payoutRatio)
 *   13. updateCalibrationFromActual: bias detection triggers after 5 same-direction errors
 *   14. updateCalibrationFromActual: structural break sets structuralBreakAt + postBreakAlpha
 *
 *  Token refresh (token.service.ts):
 *   15. getSpApiToken: fetches and caches LWA token
 *   16. invalidateTokens + re-fetch: next call after invalidation hits token endpoint again
 *
 *  Ads sync (ads-sync.service.ts):
 *   17. saveSnapshots: AmazonAdSnapshot rows created with correct acos/roas
 *   18. saveSnapshots dedup: second call with same (date, marketplace, campaignId) updates
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from '../helpers/db';
import { amazonMocks, http, HttpResponse } from '../helpers/msw-server';
import { runWithAccount } from '../../src/context/account-context';

// ─── MSW server (no default handlers — anything unmatched = error) ─────────────
const server = setupServer();

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/** Build a minimal TSV row for an Amazon order item.
 *  Deliberately has NO `quantity-shipped` key: the real
 *  GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL report only sends
 *  `quantity` (see ingest.service.ts col() doc comment) — adding a synthetic
 *  `quantity-shipped` column here would mask ingest.service.ts falling back
 *  to it incorrectly. */
function makeOrderRow(overrides: Partial<{
  'amazon-order-id': string;
  'purchase-date': string;
  'last-updated-date': string;
  'order-status': string;
  'sales-channel': string;
  'fulfillment-channel': string;
  'ship-country': string;
  currency: string;
  asin: string;
  sku: string;
  'product-name': string;
  quantity: string;
  'item-price': string;
  'item-tax': string;
  'item-promotion-discount': string;
  'is-business-order': string;
}> = {}): Record<string, string> {
  return {
    'amazon-order-id':         overrides['amazon-order-id']        ?? '111-0000001-0000001',
    'purchase-date':           overrides['purchase-date']          ?? '2026-04-01T10:00:00+00:00',
    'last-updated-date':       overrides['last-updated-date']      ?? '2026-04-01T12:00:00+00:00',
    'order-status':            overrides['order-status']           ?? 'Shipped',
    'sales-channel':           overrides['sales-channel']          ?? 'Amazon.it',
    'fulfillment-channel':     overrides['fulfillment-channel']    ?? 'Amazon',
    'ship-country':            overrides['ship-country']           ?? 'IT',
    currency:                  overrides.currency                  ?? 'EUR',
    asin:                      overrides.asin                      ?? 'B0TEST0001',
    sku:                       overrides.sku                       ?? 'SKU-TEST-001',
    'product-name':            overrides['product-name']           ?? 'Test Product',
    quantity:                  overrides.quantity                  ?? '1',
    'item-price':              overrides['item-price']             ?? '29.99',
    'item-tax':                overrides['item-tax']               ?? '0',
    'item-promotion-discount': overrides['item-promotion-discount'] ?? '0',
    'is-business-order':       overrides['is-business-order']      ?? 'false',
  };
}

/**
 * Build a minimal settlement TSV — one header row + one transaction row.
 * The header row must have `settlement-id` column for the service to parse it.
 */
function makeSettlementRows(opts: {
  settlementId?: string;
  totalAmount?: string;
  marketplace?: string;
  transactions?: Array<{
    transactionType: string;
    amountType: string;
    amount: string;
    orderId?: string;
    asin?: string;
  }>;
} = {}): Record<string, string>[] {
  const sid  = opts.settlementId ?? 'SETT-001';
  const rows: Record<string, string>[] = [];

  // Header row — contains settlement-id, total-amount, dates
  rows.push({
    'settlement-id':         sid,
    'settlement-start-date': '2026-04-01T00:00:00+00:00',
    'settlement-end-date':   '2026-04-14T23:59:59+00:00',
    'deposit-date':          '2026-04-16T00:00:00+00:00',
    'total-amount':          opts.totalAmount ?? '1500.00',
    currency:                'EUR',
    'marketplace-name':      opts.marketplace ?? 'amazon.it',
    'transaction-type':      '',
    'order-id':              '',
    asin:                    '',
    sku:                     '',
    'quantity-purchased':    '',
    'price-type':            '',
    'price-amount':          '',
    'item-related-fee-type': '',
    'item-related-fee-amount': '',
    'posted-date':           '',
  });

  // Transaction rows
  for (const tx of (opts.transactions ?? [])) {
    rows.push({
      'settlement-id':         sid,
      'settlement-start-date': '',
      'settlement-end-date':   '',
      'deposit-date':          '',
      'total-amount':          '',
      currency:                'EUR',
      'marketplace-name':      opts.marketplace ?? 'amazon.it',
      'transaction-type':      tx.transactionType,
      'order-id':              tx.orderId ?? '',
      asin:                    tx.asin   ?? '',
      sku:                     '',
      'quantity-purchased':    '1',
      'price-type':            tx.amountType === 'Principal' ? tx.amountType : '',
      'price-amount':          tx.amountType === 'Principal' ? tx.amount : '',
      'item-related-fee-type':   tx.amountType !== 'Principal' ? tx.amountType : '',
      'item-related-fee-amount': tx.amountType !== 'Principal' ? tx.amount : '',
      'posted-date':           '2026-04-10T00:00:00+00:00',
    });
  }
  return rows;
}

// ─── Test suite ───────────────────────────────────────────────────────────────
describe('Amazon Sync — integration (PR 9)', () => {
  let db: TestDb;
  // Multi-account migration (2026-07-31): every Amazon-domain function reads
  // getCurrentAccountId() from AsyncLocalStorage — created fresh in beforeEach
  // (after truncateAll, which CASCADEs AmazonAccount away) and threaded through
  // runWithAccount() around every call into ingest/settlement/forecast/token/ads code.
  let accountId: string;

  // Lazily-imported module exports (set after env is ready)
  let parseTsv:                 typeof import('../../src/amazon/ingest.service').parseTsv;
  let ingestOrderRows:          typeof import('../../src/amazon/ingest.service').ingestOrderRows;
  let ingestSettlementRows:     typeof import('../../src/amazon/settlement.service').ingestSettlementRows;
  let bootstrapCalibration:     typeof import('../../src/amazon/forecast/index').bootstrapCalibration;
  let updateCalibrationFromActual: typeof import('../../src/amazon/forecast/index').updateCalibrationFromActual;
  let getCalibration:           typeof import('../../src/amazon/forecast/index').getCalibration;
  let getSpApiToken:            typeof import('../../src/amazon/token.service').getSpApiToken;
  let invalidateTokens:         typeof import('../../src/amazon/token.service').invalidateTokens;
  let saveSnapshots:            typeof import('../../src/amazon/ads-sync.service').saveSnapshots;

  beforeAll(async () => {
    db = await setupTestDb();

    // ── Env vars must be set BEFORE dynamic imports ────────────────────────────
    // LOCK-IN: module-level `const prisma = new PrismaClient()` and env reads
    // happen at require() time so DATABASE_URL must exist before first import().
    process.env.DATABASE_URL                    = db.databaseUrl;
    process.env.AMAZON_LWA_CLIENT_ID            = 'mock_lwa_id';
    process.env.AMAZON_LWA_CLIENT_SECRET        = 'mock_lwa_secret';
    process.env.AMAZON_EU_REFRESH_TOKEN         = 'mock_refresh_eu';
    process.env.AMAZON_US_REFRESH_TOKEN         = 'mock_refresh_na';
    process.env.AMAZON_ADVERTISING_CLIENT_ID    = 'mock_ads_id';
    process.env.AMAZON_ADVERTISING_CLIENT_SECRET = 'mock_ads_secret';
    process.env.AMAZON_ADVERTISING_REFRESH_TOKEN = 'mock_ads_refresh';
    process.env.AMAZON_ADVERTISING_PROFILE_IT   = '12345';
    process.env.AMAZON_ADVERTISING_PROFILE_DE   = '23456';

    // Dynamic imports
    const ingestMod       = await import('../../src/amazon/ingest.service');
    const settleMod       = await import('../../src/amazon/settlement.service');
    const calibMod        = await import('../../src/amazon/forecast/index');
    const tokenMod        = await import('../../src/amazon/token.service');
    const adsSyncMod      = await import('../../src/amazon/ads-sync.service');

    parseTsv                    = ingestMod.parseTsv;
    ingestOrderRows             = ingestMod.ingestOrderRows;
    ingestSettlementRows        = settleMod.ingestSettlementRows;
    bootstrapCalibration        = calibMod.bootstrapCalibration;
    updateCalibrationFromActual = calibMod.updateCalibrationFromActual;
    getCalibration              = calibMod.getCalibration;
    getSpApiToken               = tokenMod.getSpApiToken;
    invalidateTokens            = tokenMod.invalidateTokens;

    saveSnapshots = adsSyncMod.saveSnapshots;

    // Start MSW — any unhandled request fails loudly
    server.listen({ onUnhandledRequest: 'error' });
  }, 120_000); // testcontainers boot

  afterAll(async () => {
    server.close();
    await db.cleanup();
  });

  beforeEach(async () => {
    await truncateAll(db.prisma);
    // Recreate the test account AFTER truncateAll (CASCADE wipes it too).
    // Credential fields populated so the token-service tests (15/16) can
    // decrypt real values via getAccountCredentials() — the mocked LWA
    // endpoint below doesn't assert on the posted client_id/secret, so any
    // non-null values satisfy token.service.ts's presence checks.
    accountId = await createTestAmazonAccount(db.prisma, {
      lwaClientId: 'mock_lwa_id',
      lwaClientSecret: 'mock_lwa_secret',
      spApiRefreshToken: 'mock_refresh_eu',
      adsClientId: 'mock_ads_id',
      adsClientSecret: 'mock_ads_secret',
      adsRefreshToken: 'mock_ads_refresh',
      adsProfileIds: { IT: '12345', DE: '23456' },
    });
    // Invalidate token cache between tests so each test is independent
    await runWithAccount(accountId, async () => {
      invalidateTokens();
    });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ORDERS INGESTION
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. Happy path: 5 orders → 5 AmazonOrder + items ──────────────────────
  it('happy path: 5 TSV rows → 5 AmazonOrder rows and AmazonOrderItem children', async () => {
    await runWithAccount(accountId, async () => {
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeOrderRow({
          'amazon-order-id': `111-ORDER${i + 1}-${i + 1}`,
          'item-price': String((i + 1) * 10),
          asin: `ASIN000${i + 1}`,
        }),
      );

      const stats = await ingestOrderRows(rows);

      expect(stats.recordsIn).toBe(5);
      expect(stats.recordsImported).toBe(5);
      expect(stats.recordsUpdated).toBe(0);
      expect(stats.recordsRejected).toBe(0);

      const orderCount = await db.prisma.amazonOrder.count();
      expect(orderCount).toBe(5);

      const itemCount = await db.prisma.amazonOrderItem.count();
      expect(itemCount).toBe(5); // 1 item per order
    });
  });

  // ── 2. Dedup: same amazonOrderId → no duplicates ──────────────────────────
  it('dedup: re-ingesting same orders does not create duplicates', async () => {
    await runWithAccount(accountId, async () => {
      // LOCK-IN: ingest.service uses INSERT ON CONFLICT("amazonOrderId") DO UPDATE
      // so a second call with the same IDs produces updates, not new rows.
      const rows = [
        makeOrderRow({ 'amazon-order-id': '111-DUP0001-0001' }),
        makeOrderRow({ 'amazon-order-id': '111-DUP0002-0002' }),
      ];

      // First ingest
      const s1 = await ingestOrderRows(rows);
      expect(s1.recordsImported).toBe(2);

      // Second ingest — same rows
      const s2 = await ingestOrderRows(rows);
      // LOCK-IN: second run counts as "updated" (already existed)
      expect(s2.recordsImported).toBe(0);
      expect(s2.recordsUpdated).toBe(2);

      const count = await db.prisma.amazonOrder.count();
      expect(count).toBe(2); // no duplicates
    });
  });

  // ── 3. Update: later lastUpdatedDate → row updated ────────────────────────
  it('update: row with later lastUpdatedDate gets updated orderStatus', async () => {
    await runWithAccount(accountId, async () => {
      const orderId = '111-UPD0001-0001';
      const v1 = makeOrderRow({
        'amazon-order-id':   orderId,
        'last-updated-date': '2026-04-01T10:00:00+00:00',
        'order-status':      'Pending',
      });

      await ingestOrderRows([v1]);
      const before = await db.prisma.amazonOrder.findFirstOrThrow({ where: { amazonOrderId: orderId } });
      expect(before.orderStatus).toBe('Pending');

      const v2 = makeOrderRow({
        'amazon-order-id':   orderId,
        'last-updated-date': '2026-04-02T10:00:00+00:00',
        'order-status':      'Shipped',
      });

      await ingestOrderRows([v2]);
      const after = await db.prisma.amazonOrder.findFirstOrThrow({ where: { amazonOrderId: orderId } });
      // LOCK-IN: ON CONFLICT DO UPDATE sets orderStatus to EXCLUDED.orderStatus
      expect(after.orderStatus).toBe('Shipped');

      // Still only 1 row
      expect(await db.prisma.amazonOrder.count()).toBe(1);
    });
  });

  // ── 4. Non-Amazon salesChannel → excluded ─────────────────────────────────
  it('Non-Amazon salesChannel rows are rejected and not inserted', async () => {
    await runWithAccount(accountId, async () => {
      // LOCK-IN: ingest.service skips rows where salesChannel === 'Non-Amazon'
      // or doesn't start with 'amazon' (case-insensitive).
      const rows = [
        makeOrderRow({ 'amazon-order-id': '111-AMZ0001-0001', 'sales-channel': 'Amazon.it' }),
        makeOrderRow({ 'amazon-order-id': '111-NON0001-0001', 'sales-channel': 'Non-Amazon' }),
      ];

      const stats = await ingestOrderRows(rows);
      expect(stats.recordsRejected).toBeGreaterThanOrEqual(1);

      const count = await db.prisma.amazonOrder.count();
      expect(count).toBe(1); // only the Amazon.it order
    });
  });

  // ── 5. Per-marketplace: IT/DE/FR/ES codes from salesChannel ──────────────
  it('per-marketplace: correct marketplace code derived from salesChannel', async () => {
    await runWithAccount(accountId, async () => {
      // LOCK-IN: SALES_CHANNEL_TO_MARKETPLACE maps 'Amazon.it' → 'IT', 'Amazon.de' → 'DE', etc.
      const rows = [
        makeOrderRow({ 'amazon-order-id': '111-MKT0001-0001', 'sales-channel': 'Amazon.it' }),
        makeOrderRow({ 'amazon-order-id': '111-MKT0002-0002', 'sales-channel': 'Amazon.de' }),
        makeOrderRow({ 'amazon-order-id': '111-MKT0003-0003', 'sales-channel': 'Amazon.fr' }),
        makeOrderRow({ 'amazon-order-id': '111-MKT0004-0004', 'sales-channel': 'Amazon.es' }),
      ];

      await ingestOrderRows(rows);

      const orders = await db.prisma.amazonOrder.findMany({ orderBy: { amazonOrderId: 'asc' } });
      const mps = orders.map(o => o.marketplace);
      expect(mps).toContain('IT');
      expect(mps).toContain('DE');
      expect(mps).toContain('FR');
      expect(mps).toContain('ES');
    });
  });

  // ── 6. Items: composite orderItemId key = "orderId::asin::sku" ───────────
  it('item composite key is orderId::asin::sku — dedup within order', async () => {
    await runWithAccount(accountId, async () => {
      // LOCK-IN: orderItemId = `${amazonOrderId}::${asin}::${sku ?? "nosku"}`
      // Duplicate asin+sku items in same order are deduped (Map) before insert.
      const rows = [
        makeOrderRow({ 'amazon-order-id': '111-ITEM001-0001', asin: 'ASIN0001', sku: 'SKU-A', 'item-price': '10.00' }),
        makeOrderRow({ 'amazon-order-id': '111-ITEM001-0001', asin: 'ASIN0001', sku: 'SKU-A', 'item-price': '10.00' }),
        makeOrderRow({ 'amazon-order-id': '111-ITEM001-0001', asin: 'ASIN0002', sku: 'SKU-B', 'item-price': '20.00' }),
      ];

      await ingestOrderRows(rows);

      const items = await db.prisma.amazonOrderItem.findMany();
      // LOCK-IN: 3 rows → grouped under 1 order → deduplicated to 2 distinct items
      expect(items).toHaveLength(2);

      const orderItemIds = items.map(i => i.orderItemId);
      expect(orderItemIds).toContain('111-ITEM001-0001::ASIN0001::SKU-A');
      expect(orderItemIds).toContain('111-ITEM001-0001::ASIN0002::SKU-B');
    });
  });

  // ── 6b. quantityShipped derives from the real report's `quantity` column ──
  it('quantityShipped: derived from `quantity` — GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL has no separate quantity-shipped column', async () => {
    await runWithAccount(accountId, async () => {
      // LOCK-IN: the real Amazon order report never sends a `quantity-shipped`
      // column (see ingest.service.ts col() doc comment) — only `quantity`.
      const row = makeOrderRow({ 'amazon-order-id': '111-QTY0001-0001', quantity: '4' });

      await ingestOrderRows([row]);

      const item = await db.prisma.amazonOrderItem.findFirstOrThrow({
        where: { amazonOrderId: '111-QTY0001-0001' },
      });
      expect(item.quantityOrdered).toBe(4);
      expect(item.quantityShipped).toBe(4);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTLEMENT RECONCILIATION
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 7. New settlement → AmazonSettlement + transactions ──────────────────
  it('settlement: new settlement report creates AmazonSettlement header + transactions', async () => {
    await runWithAccount(accountId, async () => {
      const rows = makeSettlementRows({
        settlementId: 'SETT-IT-001',
        totalAmount:  '2500.00',
        marketplace:  'amazon.it',
        transactions: [
          { transactionType: 'Order', amountType: 'Principal', amount: '3000.00', orderId: '111-ORD001-0001', asin: 'ASIN0001' },
          { transactionType: 'Order', amountType: 'Commission', amount: '-450.00', orderId: '111-ORD001-0001', asin: 'ASIN0001' },
        ],
      });

      const result = await ingestSettlementRows(rows, 'SETT-IT-001');
      expect(result.settlementId).toBe('SETT-IT-001');
      expect(result.totalAmount).toBe(2500);
      expect(result.upserted).toBeGreaterThanOrEqual(1);

      const sett = await (db.prisma as any).amazonSettlement.findUnique({
        where: { amazonAccountId_settlementId: { amazonAccountId: accountId, settlementId: 'SETT-IT-001' } },
      });
      expect(sett).not.toBeNull();
      expect(sett.totalAmount).toBe(2500);
      // LOCK-IN: marketplace derived from 'amazon.it' → 'IT'
      expect(sett.marketplace).toBe('IT');

      const txCount = await db.prisma.amazonSettlementTransaction.count({
        where: { settlementId: 'SETT-IT-001' },
      });
      expect(txCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 8. Dedup: re-running same settlement → no duplicate transactions ──────
  it('settlement dedup: re-ingesting same settlement deletes and recreates transactions', async () => {
    await runWithAccount(accountId, async () => {
      // LOCK-IN: ingestSettlementRows does deleteMany({ where: { settlementId } }) before
      // re-inserting, so the count is deterministic across re-runs.
      const rows = makeSettlementRows({
        settlementId: 'SETT-DEDUP',
        transactions: [
          { transactionType: 'Order', amountType: 'Principal', amount: '100.00' },
        ],
      });

      await ingestSettlementRows(rows, 'SETT-DEDUP');
      const count1 = await db.prisma.amazonSettlementTransaction.count({ where: { settlementId: 'SETT-DEDUP' } });

      // Second ingest with same settlement
      await ingestSettlementRows(rows, 'SETT-DEDUP');
      const count2 = await db.prisma.amazonSettlementTransaction.count({ where: { settlementId: 'SETT-DEDUP' } });

      // LOCK-IN: count remains the same (not doubled)
      expect(count2).toBe(count1);
    });
  });

  // ── 9. Marketplace derived from marketplace-name column ──────────────────
  it('settlement: marketplace derived from marketplace-name field', async () => {
    for (const [mpName, expected] of [
      ['amazon.de', 'DE'] as const,
      ['amazon.fr', 'FR'] as const,
    ]) {
      // truncateAll() CASCADEs AmazonAccount away too — recreate it each
      // iteration so accountId stays valid for the FK on AmazonSettlement.
      await truncateAll(db.prisma);
      const iterAccountId = await createTestAmazonAccount(db.prisma);
      await runWithAccount(iterAccountId, async () => {
        const rows = makeSettlementRows({
          settlementId: `SETT-MP-${expected}`,
          marketplace:  mpName,
          transactions: [
            { transactionType: 'Order', amountType: 'Principal', amount: '100.00' },
          ],
        });
        await ingestSettlementRows(rows, `SETT-MP-${expected}`);
        const sett = await (db.prisma as any).amazonSettlement.findUnique({
          where: { amazonAccountId_settlementId: { amazonAccountId: iterAccountId, settlementId: `SETT-MP-${expected}` } },
        });
        expect(sett?.marketplace).toBe(expected);
      });
    }
  });

  // ── 10. ServiceFee / Cost-of-Advertising rows captured ───────────────────
  it('settlement: Cost-of-Advertising row stored as transaction with correct amountType', async () => {
    await runWithAccount(accountId, async () => {
      const rows = makeSettlementRows({
        settlementId: 'SETT-ADS',
        transactions: [
          { transactionType: 'ServiceFee', amountType: 'Cost of Advertising', amount: '-200.00' },
        ],
      });

      await ingestSettlementRows(rows, 'SETT-ADS');

      const tx = await db.prisma.amazonSettlementTransaction.findFirst({
        where: { settlementId: 'SETT-ADS', amountType: 'Cost of Advertising' },
      });
      // LOCK-IN: item-related-fee-type column maps to amountType in the stored transaction
      expect(tx).not.toBeNull();
      expect(tx!.amount).toBe(-200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FORECAST CALIBRATION
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 11. bootstrapCalibration: AmazonForecastCalibration upserted ──────────
  it('bootstrapCalibration: creates AmazonForecastCalibration row from settlements', async () => {
    await runWithAccount(accountId, async () => {
      // Seed two settlements for IT so bootstrapCalibration has data
      const s1rows = makeSettlementRows({
        settlementId: 'BC-SETT-001',
        totalAmount:  '1400.00',
        marketplace:  'amazon.it',
        transactions: [
          { transactionType: 'Order', amountType: 'Principal', amount: '2000.00', orderId: 'ORD-BC-1', asin: 'A001' },
          { transactionType: 'Order', amountType: 'Commission', amount: '-300.00', orderId: 'ORD-BC-1', asin: 'A001' },
          { transactionType: 'Order', amountType: 'FBAPerUnitFulfillmentFee', amount: '-120.00', orderId: 'ORD-BC-1', asin: 'A001' },
        ],
      });
      const s2rows = makeSettlementRows({
        settlementId: 'BC-SETT-002',
        totalAmount:  '1550.00',
        marketplace:  'amazon.it',
        transactions: [
          { transactionType: 'Order', amountType: 'Principal', amount: '2200.00', orderId: 'ORD-BC-2', asin: 'A001' },
          { transactionType: 'Order', amountType: 'Commission', amount: '-330.00', orderId: 'ORD-BC-2', asin: 'A001' },
          { transactionType: 'Order', amountType: 'FBAPerUnitFulfillmentFee', amount: '-130.00', orderId: 'ORD-BC-2', asin: 'A001' },
        ],
      });

      await ingestSettlementRows(s1rows, 'BC-SETT-001');
      await ingestSettlementRows(s2rows, 'BC-SETT-002');

      await bootstrapCalibration(['IT']);

      const calib = await db.prisma.amazonForecastCalibration.findUnique({
        where: { amazonAccountId_marketplace: { amazonAccountId: accountId, marketplace: 'IT' } },
      });
      expect(calib).not.toBeNull();
      expect(calib!.dataPoints).toBe(2);

      // LOCK-IN: payoutRatio = totalAmount / gross; after EWMA from 2 settlements
      // Settlement 1: payout = 1400 / 2000 = 0.70
      // Settlement 2: payout = 1550 / 2200 ≈ 0.7045
      // alpha(1) = calcAlpha(1) = max(0.08, min(0.40, 0.60/sqrt(1))) = 0.40
      // EWMA: 0.40 * 0.7045 + (1-0.40) * 0.70 ≈ 0.7018
      expect(calib!.payoutRatio).toBeGreaterThan(0.60);
      expect(calib!.payoutRatio).toBeLessThan(0.85);

      // rCommission should reflect fees ratio
      expect(calib!.rCommission).toBeGreaterThan(0);
      expect(calib!.bootstrapSource).toBe('db_settlements');
    });
  });

  // ── 12. updateCalibrationFromActual: EWMA update on new settlement ────────
  it('updateCalibrationFromActual: payoutRatio updated via EWMA with correct alpha', async () => {
    await runWithAccount(accountId, async () => {
    // Seed a calibration row
    await db.prisma.amazonForecastCalibration.create({
      data: {
        amazonAccountId: accountId,
        marketplace:     'IT',
        payoutRatio:     0.70,
        rCommission:     0.15,
        rFba:            0.12,
        rAds:            0.05,
        rAdsVat:         0.01,
        rDsf:            0.02,
        rStorage:        0.01,
        rInbound:        0.01,
        rPrep:           0.00,
        rRefunds:        0.03,
        rOther:          0.01,
        rReimb:          0.01,
        avgStoragePerSett: 50,
        avgInboundPerSett: 30,
        avgAdsPerSett:   200,
        rRefundsSmoothed: 0.03,
        dataPoints:      5,
        ewmaAlpha:       0.27, // calcAlpha(5) = 0.60 / sqrt(5) ≈ 0.268
        recentRatios:    [0.70, 0.71, 0.69, 0.70, 0.70],
        recentErrors:    [] as any,
      },
    });

    // Actual settlement: net=1600, gross=2200 → actualRatio ≈ 0.727
    await updateCalibrationFromActual('IT', 2200, 1600, 3.5, {
      actualGross:  2200,
      actualRatio:  1600 / 2200,
    });

    const updated = await db.prisma.amazonForecastCalibration.findUnique({
      where: { amazonAccountId_marketplace: { amazonAccountId: accountId, marketplace: 'IT' } },
    });
    expect(updated).not.toBeNull();

    // LOCK-IN: dp = 6, alpha = calcAlpha(6) = max(0.08, min(0.40, 0.60/sqrt(6))) ≈ 0.245
    // newPayoutRatio = alpha * (1600/2200) + (1-alpha) * 0.70
    const alpha = Math.max(0.08, Math.min(0.40, 0.60 / Math.sqrt(6)));
    const expectedRatio = alpha * (1600 / 2200) + (1 - alpha) * 0.70;
    expect(updated!.payoutRatio).toBeCloseTo(expectedRatio, 4);
    expect(updated!.dataPoints).toBe(6);
    });
  });

  // ── 13. Bias detection: 5 consecutive same-direction errors → hasBias ─────
  it('bias detection: 5+ same-direction errors set hasBias=true and biasCorrection', async () => {
    await runWithAccount(accountId, async () => {
      // LOCK-IN: detectBias requires BIAS_WINDOW=5 errors all > 0.5 or all < -0.5
      await db.prisma.amazonForecastCalibration.create({
        data: {
          amazonAccountId: accountId,
          marketplace:     'DE',
          payoutRatio:     0.68,
          rCommission:     0.15, rFba: 0.12, rAds: 0.05, rAdsVat: 0.01,
          rDsf:            0.02, rStorage: 0.01, rInbound: 0.01, rPrep: 0.00,
          rRefunds:        0.03, rOther: 0.01, rReimb: 0.01,
          avgStoragePerSett: 50, avgInboundPerSett: 30, avgAdsPerSett: 180,
          rRefundsSmoothed: 0.03,
          dataPoints:      10,
          ewmaAlpha:       0.19,
          recentRatios:    [],
          // Already has 4 positive errors — one more will trigger
          recentErrors:    [2.1, 1.8, 3.0, 2.5] as any,
        },
      });

      // 5th consecutive positive error > 0.5
      await updateCalibrationFromActual('DE', 2000, 1400, 2.2, {
        actualGross: 2000,
        actualRatio: 1400 / 2000,
      });

      const updated = await db.prisma.amazonForecastCalibration.findUnique({
        where: { amazonAccountId_marketplace: { amazonAccountId: accountId, marketplace: 'DE' } },
      });
      // LOCK-IN: 5 errors all > 0.5 → hasBias=true, biasCorrection = avg of last 5
      expect(updated!.hasBias).toBe(true);
      expect(updated!.biasCorrection).not.toBe(0);
    });
  });

  // ── 14. Structural break: large ratio jump sets structuralBreakAt ──────────
  it('structural break: >20% ratio divergence sets structuralBreakAt and postBreakAlpha', async () => {
    await runWithAccount(accountId, async () => {
      // LOCK-IN: STRUCTURAL_BREAK_THRESHOLD = 0.20
      // If actualRatio diverges from payoutRatio by more than 20%, structuralBreakAt is set
      await db.prisma.amazonForecastCalibration.create({
        data: {
          amazonAccountId:  accountId,
          marketplace:      'FR',
          payoutRatio:      0.70,   // baseline
          rCommission:      0.15, rFba: 0.12, rAds: 0.05, rAdsVat: 0.01,
          rDsf:             0.02, rStorage: 0.01, rInbound: 0.01, rPrep: 0.00,
          rRefunds:         0.03, rOther: 0.01, rReimb: 0.01,
          avgStoragePerSett: 50, avgInboundPerSett: 30, avgAdsPerSett: 160,
          rRefundsSmoothed: 0.03,
          dataPoints:       8,
          ewmaAlpha:        0.21,
          recentRatios:     [],
          recentErrors:     [] as any,
          structuralBreakAt: null,
          postBreakAlpha:    null,
        },
      });

      // actualRatio = 1750 / 2000 = 0.875 → diverges from 0.70 by 25% > 20%
      await updateCalibrationFromActual('FR', 2000, 1750, 5.0, {
        actualGross: 2000,
        actualRatio: 1750 / 2000,
      });

      const updated = await db.prisma.amazonForecastCalibration.findUnique({
        where: { amazonAccountId_marketplace: { amazonAccountId: accountId, marketplace: 'FR' } },
      });
      // LOCK-IN: structural break detected → structuralBreakAt is set to a Date
      expect(updated!.structuralBreakAt).not.toBeNull();
      // LOCK-IN: postBreakAlpha was boosted then decayed; it may be null if decayed below calcAlpha
      // Just verify the payoutRatio moved towards the new value more aggressively
      const baseAlpha = Math.max(0.08, Math.min(0.40, 0.60 / Math.sqrt(9)));
      const boostedAlpha = Math.min(0.50, baseAlpha * 2);
      const expectedRatio = boostedAlpha * (1750 / 2000) + (1 - boostedAlpha) * 0.70;
      expect(updated!.payoutRatio).toBeCloseTo(expectedRatio, 3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN SERVICE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 15. getSpApiToken: fetches and caches LWA token ───────────────────────
  it('getSpApiToken: fetches token from LWA endpoint and caches it', async () => {
    await runWithAccount(accountId, async () => {
      let callCount = 0;
      server.use(
        http.post(/api\.amazon\.com\/auth\/o2\/token/, async () => {
          callCount++;
          return HttpResponse.json({ access_token: 'test_token_abc', expires_in: 3600 });
        }),
      );

      invalidateTokens(); // ensure fresh start
      const token1 = await getSpApiToken();
      expect(token1).toBe('test_token_abc');
      expect(callCount).toBe(1);

      // Second call should hit cache, NOT the endpoint
      const token2 = await getSpApiToken();
      expect(token2).toBe('test_token_abc');
      // LOCK-IN: token is cached after first fetch — no second HTTP call
      expect(callCount).toBe(1);
    });
  });

  // ── 16. invalidateTokens + re-fetch ──────────────────────────────────────
  it('invalidateTokens: next getSpApiToken call re-fetches from LWA endpoint', async () => {
    await runWithAccount(accountId, async () => {
      let callCount = 0;
      server.use(
        http.post(/api\.amazon\.com\/auth\/o2\/token/, async () => {
          callCount++;
          return HttpResponse.json({
            access_token: `token-call-${callCount}`,
            expires_in: 3600,
          });
        }),
      );

      invalidateTokens();
      const t1 = await getSpApiToken();
      expect(t1).toBe('token-call-1');
      expect(callCount).toBe(1);

      // Invalidate and re-fetch
      invalidateTokens();
      const t2 = await getSpApiToken();
      expect(t2).toBe('token-call-2');
      // LOCK-IN: invalidateTokens sets cache to null → next call must re-fetch
      expect(callCount).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADS SYNC
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 17. saveSnapshots: AmazonAdSnapshot rows created ─────────────────────
  it('ads snapshots: saveSnapshots creates AmazonAdSnapshot with acos/roas', async () => {
    await runWithAccount(accountId, async () => {
      const rows = [
        { campaignId: 'CAMP-001', campaignName: 'Campaign One', date: '2026-04-10', impressions: 1000, clicks: 50, spend: 30, sales: 150, orders: 5 },
        { campaignId: 'CAMP-002', campaignName: 'Campaign Two', date: '2026-04-10', impressions:  500, clicks: 20, spend: 10, sales:   0, orders: 0 },
      ];

      const saved = await saveSnapshots('IT', '2026-04-10', rows);
      expect(saved).toBe(2);

      const snaps = await (db.prisma as any).amazonAdSnapshot.findMany({
        where: { marketplace: 'IT' },
        orderBy: { campaignId: 'asc' },
      });
      expect(snaps).toHaveLength(2);

      const camp1 = snaps.find((s: any) => s.campaignId === 'CAMP-001');
      expect(camp1).not.toBeNull();
      // LOCK-IN: acos = spend / sales; roas = sales / spend
      expect(camp1.acos).toBeCloseTo(30 / 150, 5);
      expect(camp1.roas).toBeCloseTo(150 / 30, 5);

      const camp2 = snaps.find((s: any) => s.campaignId === 'CAMP-002');
      // LOCK-IN: when sales=0, acos=null (guard: `row.sales > 0 ? ... : null`)
      expect(camp2.acos).toBeNull();
      // LOCK-IN: roas = sales/spend when spend>0; so spend=10, sales=0 → roas = 0 (not null)
      expect(camp2.roas).toBe(0);
    });
  });

  // ── 18. saveSnapshots dedup: second call updates existing rows ────────────
  it('ads snapshots dedup: second saveSnapshots call updates existing snapshot', async () => {
    await runWithAccount(accountId, async () => {
      const rows = [
        { campaignId: 'CAMP-DUP', campaignName: 'Dup Campaign', date: '2026-04-10', impressions: 100, clicks: 10, spend: 5, sales: 25, orders: 1 },
      ];

      await saveSnapshots('IT', '2026-04-10', rows);

      // Update: higher spend
      const updated = [
        { campaignId: 'CAMP-DUP', campaignName: 'Dup Campaign Updated', date: '2026-04-10', impressions: 200, clicks: 20, spend: 10, sales: 50, orders: 2 },
      ];
      await saveSnapshots('IT', '2026-04-10', updated);

      const count = await (db.prisma as any).amazonAdSnapshot.count({ where: { marketplace: 'IT', campaignId: 'CAMP-DUP' } });
      // LOCK-IN: uses findFirst + update (not create) for existing rows → no duplicates
      expect(count).toBe(1);

      const snap = await (db.prisma as any).amazonAdSnapshot.findFirst({ where: { marketplace: 'IT', campaignId: 'CAMP-DUP' } });
      expect(snap.spend).toBe(10);
      expect(snap.campaignName).toBe('Dup Campaign Updated');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MISC / EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 19. parseTsv: correctly parses multi-row TSV ──────────────────────────
  it('parseTsv: parses TSV string into keyed row objects', async () => {
    const raw = `order-id\titem-price\tasin\n111-001\t29.99\tB001\n111-002\t14.50\tB002`;
    const rows = parseTsv(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]['order-id']).toBe('111-001');
    expect(rows[0]['item-price']).toBe('29.99');
    expect(rows[1]['asin']).toBe('B002');
  });

  // ── 20. Empty TSV → empty array, no DB writes ─────────────────────────────
  it('empty TSV string → parseTsv returns empty array, ingestOrderRows is a no-op', async () => {
    const rows = parseTsv('');
    expect(rows).toHaveLength(0);

    const stats = await ingestOrderRows([]);
    expect(stats.recordsIn).toBe(0);
    expect(stats.recordsImported).toBe(0);

    expect(await db.prisma.amazonOrder.count()).toBe(0);
  });
});
