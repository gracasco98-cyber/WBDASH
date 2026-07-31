/**
 * stats-amazon.test.ts — Integration tests locking in Amazon KPI aggregations.
 *
 * PR 7 of the revision roadmap.
 *
 * Strategy: real Postgres via testcontainers + seeded AmazonOrder + AmazonOrderItem +
 * AmazonSettlement + AmazonSettlementTransaction fixtures.
 * The query logic from amazon/routes.ts is replicated via db.prisma.$queryRawUnsafe,
 * avoiding the module-level `new PrismaClient()` singleton (same approach as PR 6).
 *
 * Reference "now": vi.useFakeTimers is set to 2026-04-15T10:00:00Z (CEST = UTC+2 in April).
 * All date boundary computations assume this reference point.
 *
 * LOCK-IN behaviors documented in test comments.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from '../helpers/db';
import { sampleAmazonOrders, sampleAmazonOrderItems } from '../fixtures/amazon-orders.fixture';
import { sampleSettlements, sampleSettlementTransactions } from '../fixtures/amazon-settlements.fixture';

// ─── Reference time ───────────────────────────────────────────────────────────
// 2026-04-15T10:00:00Z — same as PR 6 Shopify tests.
const REF_NOW = new Date('2026-04-15T10:00:00Z');

// ─── Helpers mirroring amazon/routes.ts logic ─────────────────────────────────

/** Mirrors italyOffsetHours() in amazon/routes.ts */
function italyOffsetHours(): number {
  const m = REF_NOW.getMonth() + 1; // April = 4
  return m >= 3 && m <= 10 ? 2 : 1;
}

/** Mirrors italyOffsetMs() */
function italyOffsetMs(): number {
  return italyOffsetHours() * 3600000;
}

/**
 * Mirrors italyDayStart() in amazon/routes.ts.
 * NOTE: setHours() uses local timezone. Tests run in UTC (testcontainers default).
 * In UTC, setHours(-2) correctly yields Italy midnight = UTC-2h.
 * LOCK-IN: behavior differs if server TZ != UTC.
 */
function italyDayStart(date: Date): Date {
  const d = new Date(date);
  const offsetH = italyOffsetHours();
  d.setHours(0 - offsetH, 0, 0, 0);
  return d;
}

/** Mirrors italyDateToUtc() in amazon/routes.ts */
function italyDateToUtc(dateStr: string, endOfDay = false): Date {
  const offset = italyOffsetHours();
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (endOfDay) {
    return new Date(Date.UTC(y, mo - 1, d, 23 - offset, 59, 59, 999));
  } else {
    return new Date(Date.UTC(y, mo - 1, d, -offset, 0, 0, 0));
  }
}

/** Mirrors getDateRange() in amazon/routes.ts with REF_NOW replacing Date.now() */
function getDateRange(filter: string, from?: string, to?: string) {
  const now      = REF_NOW;
  const offsetMs = italyOffsetMs();
  const todayStart = italyDayStart(now);
  const todayEnd   = new Date(todayStart.getTime() + 86400000 - 1);

  switch (filter) {
    case 'today':     return { gte: todayStart, lte: todayEnd };
    case 'yesterday': {
      const yStart = new Date(todayStart.getTime() - 86400000);
      const yEnd   = new Date(todayStart.getTime() - 1);
      return { gte: yStart, lte: yEnd };
    }
    // LOCK-IN: last7 = Date.now() - 7*86400000 - italyOffsetMs (includes offset subtraction)
    // This differs from Shopify which uses Date.now() - 7*86400000 (no offset subtraction)
    case 'last7':  return { gte: new Date(REF_NOW.getTime() - 7  * 86400000 - offsetMs), lte: todayEnd };
    case 'last30': return { gte: new Date(REF_NOW.getTime() - 30 * 86400000 - offsetMs), lte: todayEnd };
    case 'month': {
      const monthStart = italyDayStart(new Date(now.getFullYear(), now.getMonth(), 1));
      return { gte: monthStart, lte: todayEnd };
    }
    case 'custom': {
      const resolvedTo = to || from;
      return {
        gte: from       ? italyDateToUtc(from,      false) : undefined,
        lte: resolvedTo ? italyDateToUtc(resolvedTo, true) : undefined,
      };
    }
    default: return { gte: new Date(REF_NOW.getTime() - 30 * 86400000 - offsetMs), lte: todayEnd };
  }
}

/** Core /summary aggregation — mirrors the SQL in GET /summary */
async function querySummary(
  prisma: any,
  accountId: string,
  filter: string,
  opts: { from?: string; to?: string; marketplace?: string } = {},
) {
  const range    = getDateRange(filter, opts.from, opts.to) as any;
  const dateFrom = range.gte ?? new Date(REF_NOW.getTime() - 30 * 86400000 - italyOffsetMs());
  const dateTo   = range.lte ?? REF_NOW;

  const mpFilter = opts.marketplace && opts.marketplace !== 'all'
    ? ` AND o.marketplace = '${opts.marketplace.replace(/'/g, '')}'`
    : '';

  type SummaryRow = {
    marketplace:  string;
    orderCount:   bigint | number;
    unitsSold:    bigint | number;
    grossRevenue: number | string;
  };

  const rows = await prisma.$queryRawUnsafe<SummaryRow[]>(`
    SELECT
      o.marketplace,
      COUNT(DISTINCT o."amazonOrderId")::INTEGER       AS "orderCount",
      COALESCE(SUM(i."quantityOrdered"), 0)::INTEGER   AS "unitsSold",
      COALESCE(SUM(i."itemPrice"), 0)::FLOAT8          AS "grossRevenue"
    FROM "AmazonOrder" o
    LEFT JOIN "AmazonOrderItem" i ON i."amazonAccountId" = o."amazonAccountId" AND i."amazonOrderId" = o."amazonOrderId"
    WHERE o."amazonAccountId" = '${accountId}'
      AND o."purchaseDate" >= '${dateFrom.toISOString()}'::timestamp
      AND o."purchaseDate" <= '${dateTo.toISOString()}'::timestamp
      AND o."orderStatus" NOT IN ('Canceled', 'Cancelled')
      AND o."salesChannel" != 'Non-Amazon'
      ${mpFilter}
    GROUP BY o.marketplace
  `);

  const byMarketplace: Record<string, { revenue: number; orders: number; units: number }> = {};
  let totalRevenue = 0;
  let totalOrders  = 0;
  let totalUnits   = 0;

  for (const row of rows) {
    const rev    = Number(row.grossRevenue);
    const orders = Number(row.orderCount);
    const units  = Number(row.unitsSold);
    byMarketplace[row.marketplace] = { revenue: rev, orders, units };
    totalRevenue += rev;
    totalOrders  += orders;
    totalUnits   += units;
  }

  return { totalRevenue, totalOrders, totalUnits, byMarketplace };
}

/** Settlement total — sum of all transactions for a given settlementId */
async function querySettlementTxnSum(prisma: any, accountId: string, settlementId: string): Promise<number> {
  type Row = { total: number | string };
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT COALESCE(SUM(amount), 0)::FLOAT8 AS total
    FROM "AmazonSettlementTransaction"
    WHERE "amazonAccountId" = '${accountId}'
      AND "settlementId" = '${settlementId}'
  `);
  return Number(rows[0]?.total ?? 0);
}

/** Settlement fee ratios — mirrors the CTE in GET /dashboard */
async function queryFeeRatios(prisma: any, accountId: string) {
  type FeeRow = {
    marketplace: string;
    gross_sales: number;
    real_payout: number;
    payout_ratio: number;
    r_commission: number;
    r_fba: number;
    r_refunds: number;
  };

  const rows = await prisma.$queryRawUnsafe<FeeRow[]>(`
    WITH sett_totals AS (
      SELECT marketplace, SUM("totalAmount") AS real_payout
      FROM "AmazonSettlement"
      WHERE "amazonAccountId" = '${accountId}'
        AND marketplace IN ('IT','DE','FR','ES')
      GROUP BY marketplace
    ),
    txn_totals AS (
      SELECT s.marketplace,
        SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END) AS gross_sales,
        SUM(CASE WHEN t."amountType"='Commission' THEN t.amount ELSE 0 END) AS commission,
        SUM(CASE WHEN t."amountType"='FBAPerUnitFulfillmentFee' THEN t.amount ELSE 0 END) AS fba_fee,
        SUM(CASE WHEN t."transactionType"='Refund' THEN t.amount ELSE 0 END) AS refunds
      FROM "AmazonSettlementTransaction" t
      JOIN "AmazonSettlement" s ON s."amazonAccountId" = t."amazonAccountId" AND s."settlementId" = t."settlementId"
      WHERE t."amazonAccountId" = '${accountId}'
        AND s.marketplace IN ('IT','DE','FR','ES')
      GROUP BY s.marketplace
    )
    SELECT
      tx.marketplace,
      tx.gross_sales::FLOAT8                                 AS gross_sales,
      st.real_payout::FLOAT8                                 AS real_payout,
      (st.real_payout / NULLIF(tx.gross_sales, 0))::FLOAT8   AS payout_ratio,
      (-tx.commission / NULLIF(tx.gross_sales, 0))::FLOAT8   AS r_commission,
      (-tx.fba_fee    / NULLIF(tx.gross_sales, 0))::FLOAT8   AS r_fba,
      (-tx.refunds    / NULLIF(tx.gross_sales, 0))::FLOAT8   AS r_refunds
    FROM txn_totals tx
    JOIN sett_totals st ON st.marketplace = tx.marketplace
    ORDER BY tx.gross_sales DESC
  `);

  const byMp: Record<string, FeeRow> = {};
  for (const r of rows) byMp[r.marketplace] = r;
  return byMp;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Amazon KPIs — integration (PR 7)', () => {
  let db: TestDb;
  let accountId: string;

  beforeAll(async () => {
    db = await setupTestDb();
  }, 120_000);

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    await truncateAll(db.prisma);
    accountId = await createTestAmazonAccount(db.prisma);

    // Seed Amazon orders (parent records first)
    for (const order of sampleAmazonOrders) {
      await db.prisma.amazonOrder.create({ data: { ...order, amazonAccountId: accountId } });
    }
    // Seed Amazon order items (children)
    for (const item of sampleAmazonOrderItems) {
      await db.prisma.amazonOrderItem.create({ data: { ...item, amazonAccountId: accountId } });
    }
    // Seed settlements
    for (const sett of sampleSettlements) {
      await db.prisma.amazonSettlement.create({ data: { ...sett, amazonAccountId: accountId } });
    }
    // Seed settlement transactions
    for (const txn of sampleSettlementTransactions) {
      await db.prisma.amazonSettlementTransaction.create({ data: { ...txn, amazonAccountId: accountId } });
    }
  });

  // ── 1. last30: IT marketplace revenue and order count ───────────────────────
  it('last30: IT marketplace grossRevenue and orderCount correct', async () => {
    const result = await querySummary(db.prisma, accountId, 'last30');
    const it = result.byMarketplace['IT'];
    // IT orders: AZ-IT-001(90) + AZ-IT-002(30) + AZ-IT-003(75) + AZ-IT-004(120) + AZ-IT-005(70)
    // LOCK-IN: AZ-IT-CANCEL excluded (Cancelled), AZ-IT-NONAMAZON excluded (Non-Amazon)
    // AZ-IT-OLD is outside last30 window
    expect(it).toBeDefined();
    expect(it.revenue).toBe(385);
    expect(it.orders).toBe(5);
    expect(it.units).toBe(9); // 2+1+3+1+2
  });

  // ── 2. last30: DE marketplace revenue ───────────────────────────────────────
  it('last30: DE marketplace grossRevenue and orderCount correct', async () => {
    const result = await querySummary(db.prisma, accountId, 'last30');
    const de = result.byMarketplace['DE'];
    // AZ-DE-001(80) + AZ-DE-002(100, business) + AZ-DE-003(45) = 225
    expect(de).toBeDefined();
    expect(de.revenue).toBe(225);
    expect(de.orders).toBe(3);
    expect(de.units).toBe(4); // 1+2+1
  });

  // ── 3. last30: FR marketplace revenue ───────────────────────────────────────
  it('last30: FR marketplace grossRevenue and orderCount correct', async () => {
    const result = await querySummary(db.prisma, accountId, 'last30');
    const fr = result.byMarketplace['FR'];
    // AZ-FR-001(80) + AZ-FR-002(55) = 135
    expect(fr).toBeDefined();
    expect(fr.revenue).toBe(135);
    expect(fr.orders).toBe(2);
    expect(fr.units).toBe(3); // 2+1
  });

  // ── 4. last30: ES marketplace revenue ───────────────────────────────────────
  it('last30: ES marketplace grossRevenue and orderCount correct', async () => {
    const result = await querySummary(db.prisma, accountId, 'last30');
    const es = result.byMarketplace['ES'];
    // AZ-ES-001(60) + AZ-ES-002(60) = 120
    expect(es).toBeDefined();
    expect(es.revenue).toBe(120);
    expect(es.orders).toBe(2);
    expect(es.units).toBe(3); // 1+2
  });

  // ── 5. last30: ALL_EU aggregate ──────────────────────────────────────────────
  it('last30: ALL_EU aggregate sums all marketplace revenues', async () => {
    const result = await querySummary(db.prisma, accountId, 'last30');
    // IT(385) + DE(225) + FR(135) + ES(120) = 865
    expect(result.totalRevenue).toBe(865);
    expect(result.totalOrders).toBe(12);
    expect(result.totalUnits).toBe(19);
  });

  // ── 6. LOCK-IN: Cancelled orders ARE excluded ───────────────────────────────
  it('LOCK-IN: cancelled orders are EXCLUDED from /summary (opposite of Shopify)', async () => {
    const result = await querySummary(db.prisma, accountId, 'last30');
    // AZ-IT-CANCEL has itemPrice=999 — if included, IT revenue would be 385+999=1384
    // LOCK-IN: Cancelled is EXCLUDED (WHERE NOT IN 'Canceled','Cancelled')
    const it = result.byMarketplace['IT'];
    expect(it.revenue).toBe(385);
    expect(it.revenue).not.toBe(1384);
  });

  // ── 7. LOCK-IN: Non-Amazon channel orders are excluded ──────────────────────
  it('LOCK-IN: salesChannel=Non-Amazon orders are EXCLUDED from /summary', async () => {
    const result = await querySummary(db.prisma, accountId, 'last30');
    // AZ-IT-NONAMAZON has itemPrice=888 — if included, IT revenue would be 385+888=1273
    const it = result.byMarketplace['IT'];
    expect(it.revenue).toBe(385);
    expect(it.revenue).not.toBe(1273);
  });

  // ── 8. LOCK-IN: Revenue is SUM(itemPrice), not AmazonOrder.itemTotal ────────
  it('LOCK-IN: revenue = SUM(AmazonOrderItem.itemPrice), not AmazonOrder.itemTotal', async () => {
    // All fixtures have itemTotal == sum(itemPrice), so this verifies the JOIN works.
    // Create a deliberate mismatch: seed an order with itemTotal=9999 but items summing to 10
    await db.prisma.amazonOrder.create({
      data: {
        amazonAccountId:    accountId,
        amazonOrderId:      'AZ-MISMATCH',
        purchaseDate:       new Date('2026-04-10T09:00:00Z'),
        lastUpdatedDate:    new Date('2026-04-10T09:00:00Z'),
        orderStatus:        'Shipped',
        salesChannel:       'Amazon.it',
        marketplace:        'IT',
        fulfillmentChannel: 'AFN',
        shipCountry:        'IT',
        currency:           'EUR',
        itemTotal:          9999.00,  // deliberately wrong
        isBusinessOrder:    false,
      },
    });
    await db.prisma.amazonOrderItem.create({
      data: {
        amazonAccountId:   accountId,
        amazonOrderId:     'AZ-MISMATCH',
        orderItemId:       'ITEM-MISMATCH-A',
        asin:              'B0AMISMATCH',
        sku:               'SKU-MISMATCH',
        productTitle:      'Mismatch Test',
        quantityOrdered:   1,
        quantityShipped:   1,
        itemPrice:         10.00,  // actual item price = 10
        itemTax:           2.00,
        promotionDiscount: 0,
        currency:          'EUR',
        marketplace:       'IT',
        purchaseDate:      new Date('2026-04-10T09:00:00Z'),
      },
    });

    const result = await querySummary(db.prisma, accountId, 'last30');
    // IT revenue should include 10 (itemPrice), not 9999 (itemTotal)
    // Without mismatch: IT=385. With mismatch item: IT=395
    const it = result.byMarketplace['IT'];
    expect(it.revenue).toBe(395);  // 385 + 10 (not 385 + 9999)
    expect(it.revenue).not.toBe(385 + 9999);
  });

  // ── 9. today: correct orders included ───────────────────────────────────────
  it('today: returns only orders with purchaseDate in Italy today window', async () => {
    // today gte = 2026-04-14T22:00:00Z (Italy midnight 2026-04-15, TZ=UTC)
    // Only AZ-IT-004 (2026-04-14T22:30Z) qualifies
    const result = await querySummary(db.prisma, accountId, 'today');
    expect(result.totalOrders).toBe(1);
    expect(result.totalRevenue).toBe(120);
    expect(result.byMarketplace['IT']).toBeDefined();
    expect(result.byMarketplace['IT'].revenue).toBe(120);
    expect(result.byMarketplace['IT'].orders).toBe(1);
    expect(result.byMarketplace['IT'].units).toBe(1);
  });

  // ── 10. yesterday ────────────────────────────────────────────────────────────
  it('yesterday: returns only orders in Italy yesterday window', async () => {
    // yesterday gte = 2026-04-13T22:00:00Z, lte = 2026-04-14T21:59:59.999Z (TZ=UTC)
    // Only AZ-IT-005 (2026-04-13T23:00Z) qualifies
    const result = await querySummary(db.prisma, accountId, 'yesterday');
    expect(result.totalOrders).toBe(1);
    expect(result.totalRevenue).toBe(70);
    expect(result.byMarketplace['IT']).toBeDefined();
    expect(result.byMarketplace['IT'].revenue).toBe(70);
    expect(result.byMarketplace['IT'].units).toBe(2);
  });

  // ── 11. last7: window includes Italy offset subtraction (LOCK-IN) ────────────
  it('LOCK-IN: last7 lower bound includes Italy offset subtraction (2026-04-08T08:00Z)', async () => {
    // last7 gte = Date.now() - 7*86400000 - italyOffsetMs()
    //           = 2026-04-15T10:00Z - 604800000ms - 7200000ms = 2026-04-08T08:00:00Z
    // AZ-ES-001 is at exactly 2026-04-08T08:00:00Z → included (gte is inclusive)
    const result = await querySummary(db.prisma, accountId, 'last7');
    const es = result.byMarketplace['ES'];
    expect(es).toBeDefined();
    expect(es.revenue).toBe(120); // includes AZ-ES-001(60) + AZ-ES-002(60)
    expect(es.orders).toBe(2);
  });

  // ── 12. last7: order just before lower bound is excluded ─────────────────────
  it('LOCK-IN: order at 2026-04-08T07:59:59Z (just before last7 gte) is excluded', async () => {
    await db.prisma.amazonOrder.create({
      data: {
        amazonAccountId:    accountId,
        amazonOrderId:      'AZ-BOUNDARY-BEFORE',
        purchaseDate:       new Date('2026-04-08T07:59:59Z'),  // 1s before last7 cutoff
        lastUpdatedDate:    new Date('2026-04-08T07:59:59Z'),
        orderStatus:        'Shipped',
        salesChannel:       'Amazon.es',
        marketplace:        'ES',
        fulfillmentChannel: 'AFN',
        shipCountry:        'ES',
        currency:           'EUR',
        itemTotal:          77.00,
        isBusinessOrder:    false,
      },
    });
    await db.prisma.amazonOrderItem.create({
      data: {
        amazonAccountId:   accountId,
        amazonOrderId:     'AZ-BOUNDARY-BEFORE',
        orderItemId:       'ITEM-BOUNDARY-A',
        asin:              'B0ABOUNDARY',
        sku:               null,
        productTitle:      'Boundary Test',
        quantityOrdered:   1,
        quantityShipped:   1,
        itemPrice:         77.00,
        itemTax:           0,
        promotionDiscount: 0,
        currency:          'EUR',
        marketplace:       'ES',
        purchaseDate:      new Date('2026-04-08T07:59:59Z'),
      },
    });

    const result = await querySummary(db.prisma, accountId, 'last7');
    const es = result.byMarketplace['ES'];
    // ES total should still be 120 (AZ-ES-001 + AZ-ES-002), not 197
    expect(es.revenue).toBe(120);
    expect(es.orders).toBe(2);
  });

  // ── 13. custom date range ────────────────────────────────────────────────────
  it('custom: Italy-aligned date boundaries filter correctly', async () => {
    // from=2026-04-10 → Italy midnight = UTC 2026-04-09T22:00Z
    // to=2026-04-12   → Italy 23:59:59 = UTC 2026-04-12T21:59:59Z
    // Orders in range:
    //   AZ-IT-001 (2026-04-10T09:00Z) ✓ (after 2026-04-09T22:00Z)
    //   AZ-IT-002 (2026-04-11T14:00Z) ✓
    //   AZ-IT-003 (2026-04-12T10:00Z) ✓ (before 21:59:59Z)
    //   AZ-FR-001 (2026-04-10T11:00Z) ✓
    //   AZ-DE-002 (2026-04-11T10:00Z) ✓
    //   AZ-DE-003 (2026-04-12T15:00Z) ✓ (before 21:59:59Z)
    //   AZ-ES-002 (2026-04-11T16:00Z) ✓
    //   AZ-FR-002 (2026-04-13T08:00Z) ✗ (2026-04-12T21:59:59Z boundary)
    // Also within range: AZ-IT-CANCEL (excluded), AZ-IT-NONAMAZON (excluded)
    const result = await querySummary(db.prisma, accountId, 'custom', { from: '2026-04-10', to: '2026-04-12' });

    // IT: AZ-IT-001(90) + AZ-IT-002(30) + AZ-IT-003(75) = 195
    expect(result.byMarketplace['IT']?.revenue).toBe(195);
    expect(result.byMarketplace['IT']?.orders).toBe(3);

    // DE: AZ-DE-002(100) + AZ-DE-003(45) = 145
    expect(result.byMarketplace['DE']?.revenue).toBe(145);
    expect(result.byMarketplace['DE']?.orders).toBe(2);

    // FR: AZ-FR-001(80) only (AZ-FR-002 is 2026-04-13, outside range)
    expect(result.byMarketplace['FR']?.revenue).toBe(80);
    expect(result.byMarketplace['FR']?.orders).toBe(1);

    // ES: AZ-ES-002(60)
    expect(result.byMarketplace['ES']?.revenue).toBe(60);
    expect(result.byMarketplace['ES']?.orders).toBe(1);

    // Total: 195+145+80+60 = 480
    expect(result.totalRevenue).toBe(480);
    expect(result.totalOrders).toBe(7);
  });

  // ── 14. custom single day ────────────────────────────────────────────────────
  it('custom: single-day filter (from only) uses same date for both bounds', async () => {
    // LOCK-IN: if to is omitted, resolvedTo = from (single day)
    // from=to=2026-04-11 → [2026-04-10T22:00Z, 2026-04-11T21:59:59Z]
    // AZ-IT-002 (2026-04-11T14:00Z) ✓
    // AZ-DE-002 (2026-04-11T10:00Z) ✓
    // AZ-ES-002 (2026-04-11T16:00Z) ✓
    const result = await querySummary(db.prisma, accountId, 'custom', { from: '2026-04-11' });
    expect(result.totalRevenue).toBe(30 + 100 + 60); // 190
    expect(result.totalOrders).toBe(3);
  });

  // ── 15. marketplace filter on /summary ──────────────────────────────────────
  it('marketplace filter: returns only orders from specified marketplace', async () => {
    const result = await querySummary(db.prisma, accountId, 'last30', { marketplace: 'DE' });
    // Only DE orders: AZ-DE-001(80) + AZ-DE-002(100) + AZ-DE-003(45) = 225
    expect(result.totalRevenue).toBe(225);
    expect(result.totalOrders).toBe(3);
    expect(result.byMarketplace['IT']).toBeUndefined();
    expect(result.byMarketplace['FR']).toBeUndefined();
    expect(result.byMarketplace['ES']).toBeUndefined();
    expect(result.byMarketplace['DE']?.revenue).toBe(225);
  });

  // ── 16. LOCK-IN: isBusinessOrder does NOT affect KPI filtering ───────────────
  it('LOCK-IN: isBusinessOrder=true orders ARE included in KPI aggregations', async () => {
    // AZ-DE-002 is a business order — it should be included
    const result = await querySummary(db.prisma, accountId, 'last30', { marketplace: 'DE' });
    // If B2B excluded: DE revenue = 80+45 = 125, count=2
    // LOCK-IN: B2B included: DE revenue = 225, count=3
    expect(result.totalRevenue).toBe(225);
    expect(result.totalOrders).toBe(3);
  });

  // ── 17. LOCK-IN: Unshipped orders ARE included in revenue ───────────────────
  it('LOCK-IN: orderStatus=Unshipped orders ARE included (not in exclusion list)', async () => {
    // AZ-IT-002 has orderStatus='Unshipped' — included because exclusion only covers
    // 'Canceled' and 'Cancelled'
    // If Unshipped excluded: IT revenue = 385-30 = 355, count=4
    const result = await querySummary(db.prisma, accountId, 'last30', { marketplace: 'IT' });
    expect(result.totalRevenue).toBe(385); // includes Unshipped order
    expect(result.totalOrders).toBe(5);
  });

  // ── 18. empty period returns zeros ──────────────────────────────────────────
  it('empty period returns empty byMarketplace without crash', async () => {
    const result = await querySummary(db.prisma, accountId, 'custom', { from: '2030-01-01', to: '2030-01-02' });
    expect(result.totalRevenue).toBe(0);
    expect(result.totalOrders).toBe(0);
    expect(result.totalUnits).toBe(0);
    expect(Object.keys(result.byMarketplace).length).toBe(0);
  });

  // ── 19. old orders do not appear in last7 or today ──────────────────────────
  it('old orders (AZ-IT-OLD from 2025-01-01) do not affect last7 or today results', async () => {
    const resultLast7 = await querySummary(db.prisma, accountId, 'last7');
    const resultToday = await querySummary(db.prisma, accountId, 'today');
    // last7 should not include AZ-IT-OLD (2025-01-01)
    expect(resultLast7.totalRevenue).toBe(865);
    // today should not include AZ-IT-OLD
    expect(resultToday.totalRevenue).toBe(120);
  });

  // ── 20. settlement total amount != sum of transactions (LOCK-IN) ─────────────
  it('LOCK-IN: settlement totalAmount (bank transfer) differs from sum of transactions for IT', async () => {
    const settlement = await db.prisma.amazonSettlement.findUnique({
      where: { amazonAccountId_settlementId: { amazonAccountId: accountId, settlementId: 'SETT-IT-001' } },
    });
    const txnSum = await querySettlementTxnSum(db.prisma, accountId, 'SETT-IT-001');

    expect(settlement).not.toBeNull();
    expect(settlement!.totalAmount).toBe(450); // actual bank transfer

    // txn sum: 300+200-45-30-18-12-60+9+6-10-3+3 = 340
    expect(txnSum).toBeCloseTo(340, 2);

    // LOCK-IN: they differ — bank deposit != sum of transaction lines
    expect(settlement!.totalAmount).not.toBeCloseTo(txnSum, 2);
    expect(settlement!.totalAmount - txnSum).toBeCloseTo(110, 2); // delta = 110
  });

  // ── 21. settlement total matches txn sum for DE (clean settlement) ────────────
  it('DE settlement totalAmount equals sum of transactions (clean settlement example)', async () => {
    const settlement = await db.prisma.amazonSettlement.findUnique({
      where: { amazonAccountId_settlementId: { amazonAccountId: accountId, settlementId: 'SETT-DE-001' } },
    });
    const txnSum = await querySettlementTxnSum(db.prisma, accountId, 'SETT-DE-001');

    expect(settlement!.totalAmount).toBe(280);
    // txn sum: 400-60-25-35 = 280 (clean match)
    expect(txnSum).toBeCloseTo(280, 2);
    expect(settlement!.totalAmount).toBeCloseTo(txnSum, 2);
  });

  // ── 22. settlement fee ratios — IT payout_ratio ──────────────────────────────
  it('settlement fee ratios: IT payout_ratio = totalAmount / gross_sales', async () => {
    const ratios = await queryFeeRatios(db.prisma, accountId);
    const it = ratios['IT'];
    expect(it).toBeDefined();
    // gross_sales = sum of Principal/Order txns = 300+200 = 500
    expect(Number(it.gross_sales)).toBeCloseTo(500, 2);
    // real_payout = SETT-IT-001 totalAmount = 450
    expect(Number(it.real_payout)).toBeCloseTo(450, 2);
    // payout_ratio = 450/500 = 0.9
    expect(Number(it.payout_ratio)).toBeCloseTo(0.9, 4);
  });

  // ── 23. settlement fee ratios — DE clean settlement ──────────────────────────
  it('settlement fee ratios: DE gross_sales, payout_ratio correct', async () => {
    const ratios = await queryFeeRatios(db.prisma, accountId);
    const de = ratios['DE'];
    expect(de).toBeDefined();
    // gross_sales = 400 (one Principal/Order txn)
    expect(Number(de.gross_sales)).toBeCloseTo(400, 2);
    // real_payout = 280
    expect(Number(de.real_payout)).toBeCloseTo(280, 2);
    // payout_ratio = 280/400 = 0.7
    expect(Number(de.payout_ratio)).toBeCloseTo(0.7, 4);
  });

  // ── 24. settlement fee ratios — IT commission ratio ──────────────────────────
  it('settlement fee ratios: IT r_commission reflects combined commission deductions', async () => {
    const ratios = await queryFeeRatios(db.prisma, accountId);
    const it = ratios['IT'];
    // commission = -45 + -30 + 9 (refund returns) = -66 (sum of all Commission txns)
    // r_commission = -(-66) / 500 = 66/500 = 0.132
    expect(Number(it.r_commission)).toBeCloseTo(0.132, 4);
  });

  // ── 25. settlement fee ratios — IT FBA ratio ──────────────────────────────────
  it('settlement fee ratios: IT r_fba reflects FBA fee deductions', async () => {
    const ratios = await queryFeeRatios(db.prisma, accountId);
    const it = ratios['IT'];
    // fba = -18 + -12 + 6 (refund) = -24
    // r_fba = -(-24)/500 = 24/500 = 0.048
    expect(Number(it.r_fba)).toBeCloseTo(0.048, 4);
  });

  // ── 26. settlement fee ratios — IT refund ratio ───────────────────────────────
  it('settlement fee ratios: IT r_refunds reflects Refund-type transactions sum', async () => {
    const ratios = await queryFeeRatios(db.prisma, accountId);
    const it = ratios['IT'];
    // Refund txns sum: -60 + 9 + 6 = -45 (principal refund + commission back + FBA back)
    // r_refunds = -(-45)/500 = 45/500 = 0.09
    expect(Number(it.r_refunds)).toBeCloseTo(0.09, 4);
  });

  // ── 27. settlement ratios absent for ES (no settlement data) ─────────────────
  it('no settlement data for ES: ES does not appear in fee ratio results', async () => {
    const ratios = await queryFeeRatios(db.prisma, accountId);
    // ES has no AmazonSettlement seeded → no row in fee ratios
    expect(ratios['ES']).toBeUndefined();
  });

  // ── 28. FR settlement total matches txn sum ────────────────────────────────────
  it('FR settlement totalAmount equals sum of transactions', async () => {
    const txnSum = await querySettlementTxnSum(db.prisma, accountId, 'SETT-FR-001');
    // 300-45-20-35 = 200
    expect(txnSum).toBeCloseTo(200, 2);
    const sett = await db.prisma.amazonSettlement.findUnique({
      where: { amazonAccountId_settlementId: { amazonAccountId: accountId, settlementId: 'SETT-FR-001' } },
    });
    expect(sett!.totalAmount).toBeCloseTo(txnSum, 2);
  });

  // ── 29. month filter: returns orders from Italy month start ────────────────────
  it('month: returns all orders from Italy April 1 (= UTC 2026-03-31T22:00Z)', async () => {
    // Italy April 1 midnight (TZ=UTC, setHours(-2)): new Date(2026-04-01).setHours(-2) = 2026-03-31T22:00Z
    // All fixture orders are in April 2026 (except AZ-IT-OLD which is Jan 2025)
    const result = await querySummary(db.prisma, accountId, 'month');
    // Same as last30 in this fixture set (all orders are after March 31 22:00Z)
    expect(result.totalOrders).toBe(12);
    expect(result.totalRevenue).toBe(865);
  });

  // ── 30. currency: all fixtures in EUR, no cross-currency issues ────────────────
  it('currency: all fixture orders are EUR — no cross-currency revenue mixing', async () => {
    // All sampleAmazonOrders have currency='EUR'
    type Row = { currency: string; count: number };
    const rows = await db.prisma.$queryRawUnsafe<Row[]>(`
      SELECT currency, COUNT(*)::INTEGER AS count
      FROM "AmazonOrder"
      WHERE "amazonAccountId" = '${accountId}'
      GROUP BY currency
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].currency).toBe('EUR');
    // LOCK-IN: /summary does not do currency conversion — all amounts assumed EUR
  });

  // ── 31. settlement transactions unique constraint preserved ────────────────────
  it('settlement transactions: unique constraint (settlementId, orderId, asin, amountType, transactionType) respected', async () => {
    // Verify no duplicate rows were silently discarded on insert
    type Row = { total_count: number };
    const rows = await db.prisma.$queryRawUnsafe<Row[]>(`
      SELECT COUNT(*)::INTEGER AS total_count
      FROM "AmazonSettlementTransaction"
      WHERE "amazonAccountId" = '${accountId}'
    `);
    expect(Number(rows[0].total_count)).toBe(sampleSettlementTransactions.length);
  });

  // ── 32. last7 + marketplace filter: DE only ───────────────────────────────────
  it('last7 + marketplace filter: returns only DE orders', async () => {
    const result = await querySummary(db.prisma, accountId, 'last7', { marketplace: 'DE' });
    expect(result.totalRevenue).toBe(225);
    expect(result.totalOrders).toBe(3);
    expect(result.byMarketplace['IT']).toBeUndefined();
  });
});
