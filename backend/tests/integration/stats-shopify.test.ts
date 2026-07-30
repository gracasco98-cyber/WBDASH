/**
 * stats-shopify.test.ts — Integration tests locking in Shopify KPI summary aggregations.
 *
 * PR 6 of the revision roadmap.
 *
 * Strategy: real Postgres via testcontainers + seeded ShopifyOrder fixtures.
 * The query logic from stats.routes.ts is replicated here via db.prisma.$queryRawUnsafe,
 * which lets us test the actual SQL with real data without fighting the module-level
 * `new PrismaClient()` singleton (option c from the spec — acceptable because the SQL is
 * the core logic and is simple enough to replicate faithfully).
 *
 * Reference "now": vi.useFakeTimers is set to 2026-04-15T10:00:00Z (CEST = UTC+2).
 * Italy offset in April = 2 hours.
 *
 * LOCK-IN behaviors documented in test comments.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupTestDb, truncateAll, type TestDb } from '../helpers/db';
import { sampleShopifyOrders } from '../fixtures/shopify-orders.fixture';

// ─── Reference time ───────────────────────────────────────────────────────────
// 2026-04-15T10:00:00Z — a Wednesday in CEST (UTC+2).
// Italy offset in April (month >= 3 and <= 10) = 2.
const REF_NOW = new Date('2026-04-15T10:00:00Z');

// ─── Helpers mirroring stats.routes.ts logic ─────────────────────────────────

/** Mirrors italyOffsetHours() in stats.routes.ts */
function italyOffsetHours(): number {
  const m = REF_NOW.getMonth() + 1; // April = 4
  return m >= 3 && m <= 10 ? 2 : 1;
}

/** Mirrors italyDateToUtc() in stats.routes.ts */
function italyDateToUtc(dateStr: string, endOfDay = false): Date {
  const offset = italyOffsetHours();
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (endOfDay) {
    return new Date(Date.UTC(y, mo - 1, d, 23 - offset, 59, 59, 999));
  } else {
    return new Date(Date.UTC(y, mo - 1, d, -offset, 0, 0, 0));
  }
}

/** Mirrors getDateRange() in stats.routes.ts.
 *  Uses REF_NOW instead of `new Date()` so tests are deterministic. */
function getDateRange(filter: string, from?: string, to?: string) {
  const now    = REF_NOW;
  const offset = italyOffsetHours();

  // Italy midnight in UTC
  const todayStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    -offset, 0, 0, 0,
  ));

  switch (filter) {
    case 'today':
      return { gte: todayStart };
    case 'yesterday': {
      const yStart = new Date(todayStart);
      yStart.setUTCDate(yStart.getUTCDate() - 1);
      return { gte: yStart, lt: todayStart };
    }
    case 'last7':
      // LOCK-IN: last7 uses raw ms subtraction from Date.now(), NOT Italy-aligned.
      return { gte: new Date(REF_NOW.getTime() - 7 * 86400000) };
    case 'month': {
      const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, -offset, 0, 0, 0));
      return { gte: mStart };
    }
    case 'custom': {
      const resolvedTo = to || from;
      return {
        gte: from ? italyDateToUtc(from, false) : undefined,
        lte: resolvedTo ? italyDateToUtc(resolvedTo, true) : undefined,
      };
    }
    default:
      return { gte: todayStart };
  }
}

/** Build a WHERE string from a date range — mirrors the logic in stats.routes.ts GET /summary */
function buildWhere(
  filter: string,
  opts: { from?: string; to?: string; marketplace?: string; status?: string } = {},
): string {
  const dateRange = getDateRange(filter, opts.from, opts.to) as any;
  const conds: string[] = [`"isTest" = false`];

  if (dateRange.gte) conds.push(`"createdAt" >= '${(dateRange.gte as Date).toISOString()}'::timestamp`);
  if (dateRange.lte) conds.push(`"createdAt" <= '${(dateRange.lte as Date).toISOString()}'::timestamp`);
  if (dateRange.lt)  conds.push(`"createdAt" <  '${(dateRange.lt  as Date).toISOString()}'::timestamp`);

  if (opts.marketplace && opts.marketplace !== 'all') {
    conds.push(`"marketplaceDetected" = '${opts.marketplace.replace(/'/g, '')}'`);
  }
  if (opts.status && opts.status !== 'all') {
    conds.push(`"financialStatus" = '${opts.status.replace(/'/g, '')}'`);
  }

  return conds.join(' AND ');
}

/** Run the totals aggregation — mirrors the first $queryRawUnsafe in GET /summary */
async function querySummaryTotals(prisma: any, filter: string, opts: { from?: string; to?: string } = {}) {
  const WHERE = buildWhere(filter, opts);
  type TotRow = { totalRevenue: string; netRevenue: string; totalRefunds: string; orderCount: string };
  const rows = await prisma.$queryRawUnsafe<TotRow[]>(`
    SELECT
      COALESCE(SUM("totalAmount"),    0)::FLOAT8 AS "totalRevenue",
      COALESCE(SUM("netAmount"),      0)::FLOAT8 AS "netRevenue",
      COALESCE(SUM("refundedAmount"), 0)::FLOAT8 AS "totalRefunds",
      COUNT(*)::INTEGER                          AS "orderCount"
    FROM "ShopifyOrder" WHERE ${WHERE}
  `);
  const row = rows[0] ?? { totalRevenue: 0, netRevenue: 0, totalRefunds: 0, orderCount: 0 };
  const orderCount = Number(row.orderCount);
  return {
    totalRevenue: Number(row.totalRevenue),
    netRevenue:   Number(row.netRevenue),
    totalRefunds: Number(row.totalRefunds),
    orderCount,
    aov: orderCount > 0 ? Number(row.totalRevenue) / orderCount : 0,
  };
}

/** Run the marketplace breakdown — mirrors the second $queryRawUnsafe in GET /summary */
async function queryMarketplaceBreakdown(prisma: any, filter: string, opts: { from?: string; to?: string } = {}) {
  const WHERE = buildWhere(filter, opts);
  type MpRow = { marketplace: string; revenue: string; net: string; count: string };
  const rows = await prisma.$queryRawUnsafe<MpRow[]>(`
    SELECT
      "marketplaceDetected"                       AS marketplace,
      COALESCE(SUM("totalAmount"), 0)::FLOAT8     AS revenue,
      COALESCE(SUM("netAmount"),   0)::FLOAT8     AS net,
      COUNT(*)::INTEGER                           AS count
    FROM "ShopifyOrder" WHERE ${WHERE}
    GROUP BY "marketplaceDetected"
  `);
  const byMarketplace: Record<string, { count: number; revenue: number; net: number }> = {};
  for (const row of rows) {
    byMarketplace[row.marketplace] = {
      count:   Number(row.count),
      revenue: Number(row.revenue),
      net:     Number(row.net),
    };
  }
  return byMarketplace;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Shopify KPIs — integration (PR 6)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await setupTestDb();
  }, 120_000); // testcontainers boot can take 60–90s

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    await truncateAll(db.prisma);
    // Seed all fixture orders
    for (const order of sampleShopifyOrders) {
      await db.prisma.shopifyOrder.create({ data: order });
    }
  });

  // ── 1. last7: revenue total ──────────────────────────────────────────────────
  it('last7: total revenue sums all non-test orders in the 7-day window', async () => {
    const result = await querySummaryTotals(db.prisma, 'last7');
    // Orders in [2026-04-08T10:00:00Z, now): #1003(50), #1004(120), #1005(200), #1006(80), #1007(60), #1008(150), #1009(30)
    // isTest excluded: #1003T(999) → excluded
    // LOCK-IN: isCancelled orders (#1004) are NOT excluded
    expect(result.totalRevenue).toBe(690);
  });

  // ── 2. last7: net revenue ────────────────────────────────────────────────────
  it('last7: net revenue equals totalAmount - refundedAmount per order', async () => {
    const result = await querySummaryTotals(db.prisma, 'last7');
    // #1003(net=50), #1004(net=100, refunded 20), #1005(net=200), #1006(net=80),
    // #1007(net=60), #1008(net=150), #1009(net=0, fully refunded)
    expect(result.netRevenue).toBe(640);
  });

  // ── 3. last7: order count ────────────────────────────────────────────────────
  it('last7: order count includes cancelled orders but excludes test orders', async () => {
    const result = await querySummaryTotals(db.prisma, 'last7');
    // 7 qualifying orders: #1003, #1004(cancelled), #1005, #1006, #1007, #1008, #1009
    // LOCK-IN: cancelled orders ARE counted
    expect(result.orderCount).toBe(7);
  });

  // ── 4. last7: AOV ────────────────────────────────────────────────────────────
  it('last7: AOV = totalRevenue / orderCount (uses totalAmount, not netAmount)', async () => {
    const result = await querySummaryTotals(db.prisma, 'last7');
    // LOCK-IN: AOV is computed from totalRevenue (totalAmount), NOT netRevenue
    // 690 / 7 = 98.571...
    expect(result.aov).toBeCloseTo(690 / 7, 5);
  });

  // ── 5. last7: total refunds ──────────────────────────────────────────────────
  it('last7: totalRefunds sums refundedAmount across all qualifying orders', async () => {
    const result = await querySummaryTotals(db.prisma, 'last7');
    // #1004(refundedAmount=20) + #1009(refundedAmount=30) = 50
    expect(result.totalRefunds).toBe(50);
  });

  // ── 6. today: revenue and order count ────────────────────────────────────────
  it('today: returns orders created on Italy date 2026-04-15 only', async () => {
    // today >= Italy midnight 2026-04-15 = UTC 2026-04-14T22:00:00Z
    // Orders: #1007 (22:30Z) + #1008 (08:00Z of next UTC day but still April 15 Italy) ...
    // Wait — #1008 is 2026-04-15T08:00Z which is > 2026-04-14T22:00Z, so yes today
    const result = await querySummaryTotals(db.prisma, 'today');
    expect(result.totalRevenue).toBe(210); // 60 + 150
    expect(result.orderCount).toBe(2);
    expect(result.aov).toBe(105); // 210/2
  });

  // ── 7. yesterday: Italy date 2026-04-14 ─────────────────────────────────────
  it('yesterday: returns orders in Italy date 2026-04-14 window', async () => {
    // [2026-04-13T22:00:00Z, 2026-04-14T22:00:00Z)
    // Only #1006 (2026-04-13T23:00Z) qualifies
    const result = await querySummaryTotals(db.prisma, 'yesterday');
    expect(result.totalRevenue).toBe(80);
    expect(result.orderCount).toBe(1);
    expect(result.aov).toBe(80);
  });

  // ── 8. custom date range: 2026-04-10 to 2026-04-12 (Italy timezone) ─────────
  it('custom: filters by Italy-local date boundaries', async () => {
    // from=2026-04-10 → Italy midnight = UTC 2026-04-09T22:00Z
    // to=2026-04-12   → Italy end of day = UTC 2026-04-12T21:59:59.999Z
    // Orders in range:
    //   #1003 (2026-04-10T09Z  → Italy 11:00) ✓
    //   #1004 (2026-04-11T14Z  → Italy 16:00) ✓
    //   #1005 (2026-04-12T10Z  → Italy 12:00) ✓
    //   #1009 (2026-04-12T16Z  → Italy 18:00) ✓ — within UTC 21:59:59 end boundary
    const result = await querySummaryTotals(db.prisma, 'custom', { from: '2026-04-10', to: '2026-04-12' });
    expect(result.totalRevenue).toBe(400); // 50+120+200+30
    expect(result.orderCount).toBe(4);
    expect(result.aov).toBeCloseTo(400 / 4, 5); // = 100
  });

  // ── 9. custom single day: 2026-04-11 ────────────────────────────────────────
  it('custom: single-day filter (from only, no to) uses same date for both bounds', async () => {
    // LOCK-IN: if to is omitted, resolvedTo = from (same day)
    // from=to=2026-04-11 → [2026-04-10T22:00Z, 2026-04-11T21:59:59.999Z]
    // Only #1004 (2026-04-11T14:00Z) falls in this range
    const result = await querySummaryTotals(db.prisma, 'custom', { from: '2026-04-11' });
    expect(result.totalRevenue).toBe(120);
    expect(result.orderCount).toBe(1);
  });

  // ── 10. isTest exclusion ─────────────────────────────────────────────────────
  it('isTest=true orders are excluded from all KPI queries', async () => {
    // #1003T has totalAmount=999 and isTest=true — must NEVER appear in results
    const result7 = await querySummaryTotals(db.prisma, 'last7');
    // If test orders were included, revenue would be 690+999=1689
    expect(result7.totalRevenue).toBe(690);
    expect(result7.totalRevenue).not.toBe(1689);
  });

  // ── 11. isCancelled NOT excluded (LOCK-IN) ───────────────────────────────────
  it('LOCK-IN: isCancelled=true orders are NOT excluded from KPI queries', async () => {
    // #1004 has isCancelled=true, totalAmount=120
    // If cancelled orders WERE excluded: revenue would be 690-120=570
    // Since they are NOT excluded: revenue = 690
    const result = await querySummaryTotals(db.prisma, 'last7');
    expect(result.totalRevenue).toBe(690); // not 570
    expect(result.orderCount).toBe(7);     // not 6
  });

  // ── 12. empty period: no division by zero ────────────────────────────────────
  it('empty period returns zeros without division-by-zero error', async () => {
    // Use a custom date range far in the future with no orders
    const result = await querySummaryTotals(db.prisma, 'custom', { from: '2030-01-01', to: '2030-01-02' });
    expect(result.totalRevenue).toBe(0);
    expect(result.netRevenue).toBe(0);
    expect(result.totalRefunds).toBe(0);
    expect(result.orderCount).toBe(0);
    expect(result.aov).toBe(0); // AOV must be 0, not NaN/Infinity
    expect(Number.isFinite(result.aov)).toBe(true);
  });

  // ── 13. marketplace breakdown — last7 ───────────────────────────────────────
  it('last7: marketplace breakdown groups revenue correctly per marketplace', async () => {
    const byMp = await queryMarketplaceBreakdown(db.prisma, 'last7');

    // REDCARE_IT: #1003(50) + #1005(200)
    expect(byMp['REDCARE_IT']).toBeDefined();
    expect(byMp['REDCARE_IT'].revenue).toBe(250);
    expect(byMp['REDCARE_IT'].count).toBe(2);

    // TEMU_IT: #1004(120)
    expect(byMp['TEMU_IT']).toBeDefined();
    expect(byMp['TEMU_IT'].revenue).toBe(120);
    expect(byMp['TEMU_IT'].count).toBe(1);

    // BENU_FARMA: #1006(80)
    expect(byMp['BENU_FARMA']).toBeDefined();
    expect(byMp['BENU_FARMA'].revenue).toBe(80);
    expect(byMp['BENU_FARMA'].count).toBe(1);

    // EBAY_IT: #1007(60)
    expect(byMp['EBAY_IT']).toBeDefined();
    expect(byMp['EBAY_IT'].revenue).toBe(60);
    expect(byMp['EBAY_IT'].count).toBe(1);

    // TIKTOK_SHOP: #1008(150)
    expect(byMp['TIKTOK_SHOP']).toBeDefined();
    expect(byMp['TIKTOK_SHOP'].revenue).toBe(150);
    expect(byMp['TIKTOK_SHOP'].count).toBe(1);

    // UNCLASSIFIED: #1009(30)
    expect(byMp['UNCLASSIFIED']).toBeDefined();
    expect(byMp['UNCLASSIFIED'].revenue).toBe(30);
    expect(byMp['UNCLASSIFIED'].count).toBe(1);
  });

  // ── 14. marketplace breakdown — net revenue per marketplace ─────────────────
  it('last7: marketplace breakdown net revenue reflects refunds correctly', async () => {
    const byMp = await queryMarketplaceBreakdown(db.prisma, 'last7');

    // TEMU_IT: #1004 totalAmount=120, refundedAmount=20, netAmount=100
    expect(byMp['TEMU_IT'].net).toBe(100);
    expect(byMp['TEMU_IT'].revenue).toBe(120); // totalAmount, not netAmount

    // UNCLASSIFIED: #1009 totalAmount=30, refundedAmount=30, netAmount=0
    expect(byMp['UNCLASSIFIED'].net).toBe(0);
    expect(byMp['UNCLASSIFIED'].revenue).toBe(30);
  });

  // ── 15. marketplace filter on summary ───────────────────────────────────────
  it('last7 + marketplace filter: returns only orders from that marketplace', async () => {
    const WHERE = buildWhere('last7', { marketplace: 'REDCARE_IT' });
    type TotRow = { totalRevenue: string; orderCount: string };
    const rows = await db.prisma.$queryRawUnsafe<TotRow[]>(`
      SELECT
        COALESCE(SUM("totalAmount"), 0)::FLOAT8 AS "totalRevenue",
        COUNT(*)::INTEGER                       AS "orderCount"
      FROM "ShopifyOrder" WHERE ${WHERE}
    `);
    const row = rows[0]!;
    expect(Number(row.totalRevenue)).toBe(250); // #1003(50) + #1005(200)
    expect(Number(row.orderCount)).toBe(2);
  });

  // ── 16. LOCK-IN: last7 uses raw ms (not Italy-aligned) ──────────────────────
  it('LOCK-IN: last7 boundary is Date.now()-7days ms (not Italy midnight)', async () => {
    // last7 gte = REF_NOW - 604800000ms = 2026-04-08T10:00:00.000Z
    // An order at 2026-04-08T09:59:59Z should NOT be in last7
    await db.prisma.shopifyOrder.create({
      data: {
        shopifyOrderId: 'gid://shopify/Order/9999',
        orderName: '#9999',
        createdAt:   new Date('2026-04-08T09:59:59Z'), // just before last7 cutoff
        updatedAt:   new Date('2026-04-08T09:59:59Z'),
        processedAt: new Date('2026-04-08T09:59:59Z'),
        cancelledAt: null,
        closedAt:    null,
        totalAmount:  77,
        currency: 'EUR',
        financialStatus: 'paid',
        fulfillmentStatus: 'fulfilled',
        rawTags: ['REDCARE_IT'],
        sourceName: null,
        sourceIdentifier: null,
        channelDisplayName: null,
        customerCountry: 'IT',
        customerEmail: null,
        marketplaceDetected: 'REDCARE_IT',
        marketplaceDetectionReason: 'tag',
        isRefunded: false,
        refundedAmount: 0,
        netAmount: 77,
        isCancelled: false,
        isTest: false,
        lineItemsCount: 1,
        rawData: null,
      },
    });

    const result = await querySummaryTotals(db.prisma, 'last7');
    // #9999 is BEFORE last7 cutoff (2026-04-08T10:00Z), so still 690, not 690+77
    expect(result.totalRevenue).toBe(690);
    expect(result.orderCount).toBe(7);
  });

  // ── 17. LOCK-IN: last7 includes order exactly at cutoff boundary ─────────────
  it('LOCK-IN: order at exactly last7 cutoff (gte) is included', async () => {
    await db.prisma.shopifyOrder.create({
      data: {
        shopifyOrderId: 'gid://shopify/Order/9998',
        orderName: '#9998',
        createdAt:   new Date('2026-04-08T10:00:00Z'), // exactly at last7 cutoff
        updatedAt:   new Date('2026-04-08T10:00:00Z'),
        processedAt: new Date('2026-04-08T10:00:00Z'),
        cancelledAt: null,
        closedAt:    null,
        totalAmount:  33,
        currency: 'EUR',
        financialStatus: 'paid',
        fulfillmentStatus: 'fulfilled',
        rawTags: ['TEMU_IT'],
        sourceName: null,
        sourceIdentifier: null,
        channelDisplayName: null,
        customerCountry: 'IT',
        customerEmail: null,
        marketplaceDetected: 'TEMU_IT',
        marketplaceDetectionReason: 'tag',
        isRefunded: false,
        refundedAmount: 0,
        netAmount: 33,
        isCancelled: false,
        isTest: false,
        lineItemsCount: 1,
        rawData: null,
      },
    });

    const result = await querySummaryTotals(db.prisma, 'last7');
    // #9998 exactly at cutoff → included (gte is inclusive)
    expect(result.totalRevenue).toBe(723); // 690 + 33
    expect(result.orderCount).toBe(8);
  });

  // ── 18. orders outside all periods don't affect results ─────────────────────
  it('old orders (2025-01-01) do not appear in last7 or today results', async () => {
    // #1000 is from 2025-01-01 — way outside all windows
    const resultLast7 = await querySummaryTotals(db.prisma, 'last7');
    const resultToday = await querySummaryTotals(db.prisma, 'today');

    // last7 total = 690 (not 690+10)
    expect(resultLast7.totalRevenue).toBe(690);
    // today total = 210 (not 210+10)
    expect(resultToday.totalRevenue).toBe(210);
  });

  // ── 19. status filter on summary ────────────────────────────────────────────
  it('last7 + status filter: returns only orders with matching financialStatus', async () => {
    const WHERE = buildWhere('last7', { status: 'refunded' });
    type TotRow = { totalRevenue: string; orderCount: string };
    const rows = await db.prisma.$queryRawUnsafe<TotRow[]>(`
      SELECT
        COALESCE(SUM("totalAmount"), 0)::FLOAT8 AS "totalRevenue",
        COUNT(*)::INTEGER                       AS "orderCount"
      FROM "ShopifyOrder" WHERE ${WHERE}
    `);
    const row = rows[0]!;
    // financialStatus='refunded': #1004(120) + #1009(30) = 150, count=2
    expect(Number(row.orderCount)).toBe(2);
    expect(Number(row.totalRevenue)).toBe(150);
  });

  // ── 20. month filter: all orders from Italy month start ──────────────────────
  it('month: returns all orders from Italy month start (April 1 = 2026-03-31T22:00Z)', async () => {
    // Italy April 1 midnight = UTC 2026-03-31T22:00:00Z (offset=2)
    // Orders >= 2026-03-31T22:00Z: #1001 (2026-03-10 — NO), #1002 (2026-03-25 — NO)
    // + all April orders (#1003..#1009) = 7 orders (excl. test)
    const result = await querySummaryTotals(db.prisma, 'month');
    expect(result.orderCount).toBe(7);
    expect(result.totalRevenue).toBe(690);
  });
});
