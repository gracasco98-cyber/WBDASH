// stats.routes.ts — REST API for dashboard metrics
import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { runInitialSync, runIncrementalSync } from "../jobs/sync.job";
import { detectMarketplace } from "../config/marketplace-rules";
import {
  findOrdersForTimeseries,
  findOrdersByDateRange,
  countOrdersByDateRange,
  findOrderByShopifyId,
  findDistinctMarketplaces,
  findOrdersForReclassification,
  updateOrderMarketplace,
} from "../repositories/shopify/orders.repo";

const router = Router();

// ─── Italy timezone offset (UTC+2 Apr-Oct CEST, UTC+1 Nov-Mar CET) ───────────
function italyOffsetHours(): number {
  const m = new Date().getMonth() + 1; // 1–12
  return m >= 3 && m <= 10 ? 2 : 1;
}

/**
 * Convert a date-only string (YYYY-MM-DD from <input type="date">) to a UTC Date
 * anchored to Italy local midnight, so orders stored in UTC are correctly included.
 * @param dateStr  "YYYY-MM-DD"
 * @param endOfDay true → Italy 23:59:59, false → Italy 00:00:00
 */
function italyDateToUtc(dateStr: string, endOfDay = false): Date {
  const offset = italyOffsetHours();
  const [y, mo, d] = dateStr.split("-").map(Number);
  if (endOfDay) {
    // Italy 23:59:59 → UTC 23:59:59 - offset
    return new Date(Date.UTC(y, mo - 1, d, 23 - offset, 59, 59, 999));
  } else {
    // Italy 00:00:00 → UTC 00:00:00 - offset = previous day at (24-offset)
    return new Date(Date.UTC(y, mo - 1, d, -offset, 0, 0, 0));
  }
}

// ─── Helper: date range ───────────────────────────────────────────────────────
function getDateRange(filter: string, from?: string, to?: string) {
  const now = new Date();
  const offset = italyOffsetHours();

  // Italy midnight in UTC
  const todayStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    -offset, 0, 0, 0
  ));

  switch (filter) {
    case "today":
      return { gte: todayStart };
    case "yesterday": {
      const yStart = new Date(todayStart);
      yStart.setUTCDate(yStart.getUTCDate() - 1);
      return { gte: yStart, lt: todayStart };
    }
    case "last7":
      return { gte: new Date(Date.now() - 7 * 86400000) };
    case "month": {
      // First day of current month at Italy midnight
      const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, -offset, 0, 0, 0));
      return { gte: mStart };
    }
    case "custom": {
      // from/to are "YYYY-MM-DD" strings from <input type="date">
      // Convert to Italy-local boundaries → UTC
      // If only one date is provided, treat it as a single-day filter
      const resolvedTo = to || from; // if no end date, use same as start
      return {
        gte: from ? italyDateToUtc(from, false) : undefined,
        lte: resolvedTo ? italyDateToUtc(resolvedTo, true) : undefined,
      };
    }
    default:
      return { gte: todayStart };
  }
}

// ─── GET /api/stats/summary ───────────────────────────────────────────────────
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { filter = "today", from, to, marketplace, status } = req.query as Record<string, string>;
    const dateRange = getDateRange(filter, from, to) as any;

    // Build parameterized WHERE conditions from the date range + filters
    const conds: string[] = [`"isTest" = false`];
    if (dateRange.gte) conds.push(`"createdAt" >= '${(dateRange.gte as Date).toISOString()}'::timestamp`);
    if (dateRange.lte) conds.push(`"createdAt" <= '${(dateRange.lte as Date).toISOString()}'::timestamp`);
    if (dateRange.lt)  conds.push(`"createdAt" <  '${(dateRange.lt  as Date).toISOString()}'::timestamp`);
    if (marketplace && marketplace !== "all") conds.push(`"marketplaceDetected" = '${marketplace.replace(/'/g, "")}'`);
    if (status && status !== "all")           conds.push(`"financialStatus" = '${status.replace(/'/g, "")}'`);
    const WHERE = conds.join(" AND ");

    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    type TotRow = { totalRevenue: string; netRevenue: string; totalRefunds: string; orderCount: string };
    type MpRow  = { marketplace: string; revenue: string; net: string; count: string };
    type LhRow  = { revenue: string; count: string };

    // 3 aggregation queries in parallel — DB does the heavy lifting, no JS reduce
    const [totRows, mpRows, lhRows] = await Promise.all([
      prisma.$queryRawUnsafe<TotRow[]>(`
        SELECT
          COALESCE(SUM("totalAmount"),    0)::FLOAT8 AS "totalRevenue",
          COALESCE(SUM("netAmount"),      0)::FLOAT8 AS "netRevenue",
          COALESCE(SUM("refundedAmount"), 0)::FLOAT8 AS "totalRefunds",
          COUNT(*)::INTEGER                          AS "orderCount"
        FROM "ShopifyOrder" WHERE ${WHERE}
      `),
      prisma.$queryRawUnsafe<MpRow[]>(`
        SELECT
          "marketplaceDetected"                       AS marketplace,
          COALESCE(SUM("totalAmount"), 0)::FLOAT8     AS revenue,
          COALESCE(SUM("netAmount"),   0)::FLOAT8     AS net,
          COUNT(*)::INTEGER                           AS count
        FROM "ShopifyOrder" WHERE ${WHERE}
        GROUP BY "marketplaceDetected"
      `),
      prisma.$queryRawUnsafe<LhRow[]>(`
        SELECT
          COALESCE(SUM("totalAmount"), 0)::FLOAT8 AS revenue,
          COUNT(*)::INTEGER                        AS count
        FROM "ShopifyOrder"
        WHERE ${WHERE} AND "createdAt" >= '${oneHourAgo}'::timestamp
      `),
    ]);

    const tot        = totRows[0] ?? { totalRevenue: 0, netRevenue: 0, totalRefunds: 0, orderCount: 0 };
    const orderCount = Number(tot.orderCount);

    const byMarketplace: Record<string, { count: number; revenue: number; net: number }> = {};
    for (const row of mpRows) {
      byMarketplace[row.marketplace] = {
        count:   Number(row.count),
        revenue: Number(row.revenue),
        net:     Number(row.net),
      };
    }

    const lh = lhRows[0] ?? { revenue: 0, count: 0 };

    res.json({
      totalRevenue:  Number(tot.totalRevenue),
      netRevenue:    Number(tot.netRevenue),
      totalRefunds:  Number(tot.totalRefunds),
      orderCount,
      aov: orderCount > 0 ? Number(tot.totalRevenue) / orderCount : 0,
      lastHour: {
        revenue: Number(lh.revenue),
        orders:  Number(lh.count),
      },
      byMarketplace,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/stats/product-overview ─────────────────────────────────────────
// Per-product 5-period BI: queries AmazonProductSnapshot + ProductDailySnapshot.
// Params: asin?, productId?, splitByMarketplace?
router.get("/product-overview", async (req: Request, res: Response) => {
  try {
    const { asin, productId, splitByMarketplace } = req.query as Record<string, string>;
    const doSplit = splitByMarketplace === "true";

    if (!asin && !productId) return res.status(400).json({ error: "asin or productId required" });

    // ── Italy date helpers ─────────────────────────────────────────────────────
    const now    = new Date();
    const offset = italyOffsetHours();
    const italyNow = new Date(now.getTime() + offset * 3_600_000);

    function iDate(daysAgo = 0): string {
      const d = new Date(italyNow.getTime() - daysAgo * 86_400_000);
      return d.toISOString().split("T")[0];
    }

    const today      = iDate(0);
    const yesterday  = iDate(1);
    const y2         = iDate(2); // day before yesterday
    const monthStart = `${italyNow.getFullYear()}-${String(italyNow.getMonth() + 1).padStart(2, "0")}-01`;
    const daysElapsed = parseInt(today.split("-")[2], 10);
    const daysInMonth = new Date(italyNow.getFullYear(), italyNow.getMonth() + 1, 0).getDate();

    const prevMonthDate = new Date(italyNow.getFullYear(), italyNow.getMonth() - 1, 1);
    const lmStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const lmEnd   = new Date(italyNow.getFullYear(), italyNow.getMonth(), 0);
    const lmEndStr = lmEnd.toISOString().split("T")[0];
    // Same day-of-month in last month for MTD-comparison
    const lmMtdDay = Math.min(daysElapsed, lmEnd.getDate());
    const lmMtdEnd = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-${String(lmMtdDay).padStart(2, "0")}`;

    // ── Query helpers ──────────────────────────────────────────────────────────
    const safeAsin      = (asin      ?? "").replace(/'/g, "");
    const safeProductId = (productId ?? "").replace(/'/g, "");

    type AmzRow  = { grossRevenue: number; unitsSold: number; orderCount: number; adSpend: number; refundedAmount: number; marketplace?: string };
    type ShopRow = { grossRevenue: number; unitsSold: number; orderCount: number; refundedAmount: number; marketplace?: string };

    const qAmz = async (from: string, to: string, split = false): Promise<AmzRow[]> => {
      if (!asin) return [];
      return prisma.$queryRawUnsafe<AmzRow[]>(`
        SELECT ${split ? '"marketplace",' : ''}
          COALESCE(SUM("grossRevenue"),    0)::FLOAT8  AS "grossRevenue",
          COALESCE(SUM("unitsSold"),       0)::INTEGER AS "unitsSold",
          COALESCE(SUM("orderCount"),      0)::INTEGER AS "orderCount",
          COALESCE(SUM("adSpend"),         0)::FLOAT8  AS "adSpend",
          COALESCE(SUM("refundedAmount"),  0)::FLOAT8  AS "refundedAmount"
        FROM "AmazonProductSnapshot"
        WHERE asin = '${safeAsin}'
          AND "snapshotDate" >= '${from}'::date
          AND "snapshotDate" <= '${to}'::date
        ${split ? 'GROUP BY "marketplace"' : ''}
      `);
    };

    const qShop = async (from: string, to: string, split = false): Promise<ShopRow[]> => {
      if (!productId) return [];
      return prisma.$queryRawUnsafe<ShopRow[]>(`
        SELECT ${split ? '"marketplace",' : ''}
          COALESCE(SUM("grossRevenue"),   0)::FLOAT8  AS "grossRevenue",
          COALESCE(SUM("unitsSold"),      0)::INTEGER AS "unitsSold",
          COALESCE(SUM("orderCount"),     0)::INTEGER AS "orderCount",
          COALESCE(SUM("refundedAmount"), 0)::FLOAT8  AS "refundedAmount"
        FROM "ProductDailySnapshot"
        WHERE "shopifyProductId" = '${safeProductId}'
          AND "snapshotDate" >= '${from}'::date
          AND "snapshotDate" <= '${to}'::date
        ${split ? 'GROUP BY "marketplace"' : ''}
      `);
    };

    function merge(amzRows: AmzRow[], shopRows: ShopRow[]) {
      const a = amzRows[0]  ?? { grossRevenue: 0, unitsSold: 0, orderCount: 0, adSpend: 0, refundedAmount: 0 };
      const s = shopRows[0] ?? { grossRevenue: 0, unitsSold: 0, orderCount: 0, refundedAmount: 0 };
      return {
        grossRevenue:    a.grossRevenue + s.grossRevenue,
        shopifyRevenue:  s.grossRevenue,
        amazonRevenue:   a.grossRevenue,
        unitsSold:       (a.unitsSold as number) + (s.unitsSold as number),
        orderCount:      (a.orderCount as number) + (s.orderCount as number),
        adSpend:         a.adSpend,
        refunds:         a.refundedAmount + s.refundedAmount,
        netRevenue:      (a.grossRevenue - a.refundedAmount - a.adSpend) + (s.grossRevenue - s.refundedAmount),
      };
    }

    function pct(cur: number, prev: number) {
      if (!prev) return null;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    }

    // Fetch all periods in parallel
    const [ta, ts, ya, ys, y2a, y2s, mtda, mtds, lma, lms, lmMtda, lmMtds] = await Promise.all([
      qAmz(today, today), qShop(today, today),
      qAmz(yesterday, yesterday), qShop(yesterday, yesterday),
      qAmz(y2, y2), qShop(y2, y2),
      qAmz(monthStart, today), qShop(monthStart, today),
      qAmz(lmStart, lmEndStr), qShop(lmStart, lmEndStr),
      qAmz(lmStart, lmMtdEnd), qShop(lmStart, lmMtdEnd),
    ]);

    const todayS     = merge(ta, ts);
    const yS         = merge(ya, ys);
    const y2S        = merge(y2a, y2s);
    const mtdS       = merge(mtda, mtds);
    const lmS        = merge(lma, lms);
    const lmMtdS     = merge(lmMtda, lmMtds);

    const fcastGross = daysElapsed > 0 ? mtdS.grossRevenue / daysElapsed * daysInMonth : 0;
    const forecast   = {
      grossRevenue:   fcastGross,
      shopifyRevenue: daysElapsed > 0 ? mtdS.shopifyRevenue / daysElapsed * daysInMonth : 0,
      amazonRevenue:  daysElapsed > 0 ? mtdS.amazonRevenue  / daysElapsed * daysInMonth : 0,
      netRevenue:     daysElapsed > 0 ? mtdS.netRevenue     / daysElapsed * daysInMonth : 0,
      unitsSold:      daysElapsed > 0 ? Math.round(mtdS.unitsSold  / daysElapsed * daysInMonth) : 0,
      orderCount:     daysElapsed > 0 ? Math.round(mtdS.orderCount / daysElapsed * daysInMonth) : 0,
      adSpend:        daysElapsed > 0 ? mtdS.adSpend  / daysElapsed * daysInMonth : 0,
      refunds:        daysElapsed > 0 ? mtdS.refunds  / daysElapsed * daysInMonth : 0,
    };

    const result: any = {
      today:     { ...todayS, pctChange: pct(todayS.grossRevenue,  yS.grossRevenue) },
      yesterday: { ...yS,     pctChange: pct(yS.grossRevenue,      y2S.grossRevenue) },
      mtd:       { ...mtdS,   pctChange: pct(mtdS.grossRevenue,    lmMtdS.grossRevenue) },
      forecast:  { ...forecast, pctChange: pct(fcastGross,         lmS.grossRevenue) },
      lastMonth: { ...lmS,    pctChange: null },
      meta: { daysElapsed, daysInMonth },
    };

    // Optional per-marketplace split (MTD + all periods)
    if (doSplit) {
      const [splitAmzMtd, splitShopMtd, splitAmzLm, splitShopLm] = await Promise.all([
        qAmz(monthStart, today, true), qShop(monthStart, today, true),
        qAmz(lmStart, lmEndStr, true), qShop(lmStart, lmEndStr, true),
      ]);

      const byMp: Record<string, any> = {};
      const addRow = (key: string, source: string, mp: string, r: AmzRow | ShopRow, period: "mtd" | "lastMonth") => {
        if (!byMp[key]) byMp[key] = { source, marketplace: mp, mtd: { grossRevenue: 0, unitsSold: 0, orderCount: 0, adSpend: 0 }, lastMonth: { grossRevenue: 0, unitsSold: 0, orderCount: 0 } };
        byMp[key][period].grossRevenue += r.grossRevenue;
        byMp[key][period].unitsSold    += r.unitsSold;
        byMp[key][period].orderCount   += r.orderCount;
        if (source === "amazon" && period === "mtd") byMp[key][period].adSpend = (byMp[key][period].adSpend ?? 0) + ((r as AmzRow).adSpend ?? 0);
      };
      for (const r of splitAmzMtd)  addRow(`amz_${r.marketplace}`,  "amazon",   r.marketplace!, r, "mtd");
      for (const r of splitShopMtd) addRow(`shop_${r.marketplace}`, "shopify",  r.marketplace!, r, "mtd");
      for (const r of splitAmzLm)   addRow(`amz_${r.marketplace}`,  "amazon",   r.marketplace!, r, "lastMonth");
      for (const r of splitShopLm)  addRow(`shop_${r.marketplace}`, "shopify",  r.marketplace!, r, "lastMonth");
      result.byMarketplace = byMp;
    }

    return res.json(result);
  } catch (err) {
    console.error("[Stats] GET /product-overview:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/stats/overview ──────────────────────────────────────────────────
// Returns 5-period BI KPIs for Shopify: today / yesterday / MTD / forecast / last month
// All dates are Italy-timezone-aware. Optional ?marketplace= filter.
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.query as Record<string, string>;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace.replace(/'/g, "") : null;

    const now    = new Date();
    const offset = italyOffsetHours();

    // Italy midnight today (UTC)
    const todayStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), -offset, 0, 0, 0,
    ));
    const todayEnd        = new Date(todayStart.getTime() + 86400000 - 1);
    const yesterdayStart  = new Date(todayStart.getTime() - 86400000);
    const yesterdayEnd    = new Date(todayStart.getTime() - 1);
    const dayBeforeStart  = new Date(yesterdayStart.getTime() - 86400000);
    const dayBeforeEnd    = new Date(yesterdayStart.getTime() - 1);

    // Italy "now" for day-of-month
    const italyNow   = new Date(now.getTime() + offset * 3_600_000);
    const daysElapsed = Math.max(1, italyNow.getUTCDate());
    const daysInMonth = new Date(italyNow.getUTCFullYear(), italyNow.getUTCMonth() + 1, 0).getDate();

    const monthStart = new Date(Date.UTC(
      italyNow.getUTCFullYear(), italyNow.getUTCMonth(), 1, -offset, 0, 0, 0,
    ));
    const lastMonthStart = new Date(Date.UTC(
      italyNow.getUTCFullYear(), italyNow.getUTCMonth() - 1, 1, -offset, 0, 0, 0,
    ));
    const lastMonthEnd   = new Date(monthStart.getTime() - 1);
    const lastMonthDays  = new Date(italyNow.getUTCFullYear(), italyNow.getUTCMonth(), 0).getDate();
    const mtdLastEnd     = new Date(lastMonthStart.getTime() + Math.min(daysElapsed, lastMonthDays) * 86_400_000 - 1);
    const mblStart       = new Date(Date.UTC(
      italyNow.getUTCFullYear(), italyNow.getUTCMonth() - 2, 1, -offset, 0, 0, 0,
    ));
    const mblEnd         = new Date(lastMonthStart.getTime() - 1);

    const wideFrom = mblStart;
    const wideTo   = todayEnd;
    const mpW      = mpFilter ? `AND "marketplaceDetected" = '${mpFilter}'` : "";
    const iso      = (d: Date) => d.toISOString();

    // 7 periods — ALL LOWERCASE aliases (PostgreSQL folds unquoted identifiers to lowercase)
    const periods: [string, Date, Date][] = [
      ["today",      todayStart,      todayEnd     ],
      ["yesterday",  yesterdayStart,  yesterdayEnd ],
      ["daybefore",  dayBeforeStart,  dayBeforeEnd ],
      ["mtd",        monthStart,      wideTo       ],
      ["lastmonth",  lastMonthStart,  lastMonthEnd ],
      ["mtdlast",    lastMonthStart,  mtdLastEnd   ],
      ["mbl",        mblStart,        mblEnd       ],
    ];

    const colsSql = periods.map(([name, from, to]) => `
      COUNT(CASE WHEN "createdAt" >= '${iso(from)}'::timestamp
                  AND "createdAt" <= '${iso(to)}'::timestamp THEN 1 END)::INTEGER AS ${name}_ordercount,
      COALESCE(SUM(CASE WHEN "createdAt" >= '${iso(from)}'::timestamp
                         AND "createdAt" <= '${iso(to)}'::timestamp
                        THEN "totalAmount"    ELSE 0 END), 0)::FLOAT8 AS ${name}_grossrevenue,
      COALESCE(SUM(CASE WHEN "createdAt" >= '${iso(from)}'::timestamp
                         AND "createdAt" <= '${iso(to)}'::timestamp
                        THEN "netAmount"      ELSE 0 END), 0)::FLOAT8 AS ${name}_netrevenue,
      COALESCE(SUM(CASE WHEN "createdAt" >= '${iso(from)}'::timestamp
                         AND "createdAt" <= '${iso(to)}'::timestamp
                        THEN "refundedAmount" ELSE 0 END), 0)::FLOAT8 AS ${name}_refunds
    `).join(",\n");

    type FlatRow = Record<string, number>;
    const rows = await prisma.$queryRawUnsafe<FlatRow[]>(`
      SELECT ${colsSql}
      FROM "ShopifyOrder"
      WHERE "isTest" = false
        AND "createdAt" >= '${iso(wideFrom)}'::timestamp
        AND "createdAt" <= '${iso(wideTo)}'::timestamp
        ${mpW}
    `);
    const row = rows[0] ?? {};

    function buildStats(name: string) {
      return {
        grossRevenue: Number(row[`${name}_grossrevenue`] ?? 0),
        netRevenue:   Number(row[`${name}_netrevenue`]   ?? 0),
        orderCount:   Number(row[`${name}_ordercount`]   ?? 0),
        refunds:      Number(row[`${name}_refunds`]      ?? 0),
      };
    }

    const today     = buildStats("today");
    const yesterday = buildStats("yesterday");
    const dayBefore = buildStats("daybefore");
    const mtd       = buildStats("mtd");
    const lastMonth = buildStats("lastmonth");
    const mtdLast   = buildStats("mtdlast");
    const mbl       = buildStats("mbl");

    function pct(cur: number, prev: number): number | null {
      if (prev === 0) return null;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    }

    const fc = (v: number) => daysElapsed > 0 ? v / daysElapsed * daysInMonth : 0;
    const forecast = {
      grossRevenue: fc(mtd.grossRevenue),
      netRevenue:   fc(mtd.netRevenue),
      orderCount:   Math.round(fc(mtd.orderCount)),
      refunds:      fc(mtd.refunds),
    };

    res.json({
      today:     { ...today,     pctChange: pct(today.grossRevenue,     yesterday.grossRevenue) },
      yesterday: { ...yesterday, pctChange: pct(yesterday.grossRevenue, dayBefore.grossRevenue) },
      mtd:       { ...mtd,       pctChange: pct(mtd.grossRevenue,       mtdLast.grossRevenue)   },
      forecast:  { ...forecast,  pctChange: pct(forecast.grossRevenue,  lastMonth.grossRevenue) },
      lastMonth: { ...lastMonth, pctChange: pct(lastMonth.grossRevenue, mbl.grossRevenue)       },
      meta: { daysElapsed, daysInMonth },
    });
  } catch (err) {
    console.error("[Stats] GET /overview:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/stats/timeseries ────────────────────────────────────────────────
router.get("/timeseries", async (req: Request, res: Response) => {
  try {
    const { bucket = "hour", filter = "today", from, to, marketplace } = req.query as Record<string, string>;
    // BUG FIX: was getDateRange(filter) — missing from/to caused custom ranges to be ignored
    const dateRange = getDateRange(filter, from, to);
    const where: any = { createdAt: dateRange, isTest: false };
    if (marketplace && marketplace !== "all") where.marketplaceDetected = marketplace;

    const orders = await findOrdersForTimeseries(prisma, {
      from: (dateRange as any).gte,
      to: (dateRange as any).lte,
      before: (dateRange as any).lt,
      marketplace: (marketplace && marketplace !== "all") ? marketplace : undefined,
      excludeTest: true,
    });

    // For multi-day custom ranges, group by date instead of hour
    const isMultiDay = filter === "custom"
      ? (from !== to && !!from && !!to) || !to
      : filter === "last7" || filter === "month";

    const groups: Record<string, { revenue: number; count: number }> = {};
    const offset = italyOffsetHours();

    for (const o of orders) {
      const d = new Date(o.createdAt);
      // Shift to Italy local time for grouping
      const localMs = d.getTime() + offset * 3600000;
      const local = new Date(localMs);

      let key: string;
      if (isMultiDay) {
        // Group by date (Italy local)
        key = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2,"0")}-${String(local.getUTCDate()).padStart(2,"0")}`;
      } else if (bucket === "minute") {
        key = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
      } else {
        key = `${String(local.getUTCHours()).padStart(2, "0")}:00`;
      }
      if (!groups[key]) groups[key] = { revenue: 0, count: 0 };
      groups[key].revenue += o.totalAmount;
      groups[key].count++;
    }

    res.json(
      Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, data]) => ({ time, ...data }))
    );
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/stats/orders ────────────────────────────────────────────────────
router.get("/orders", async (req: Request, res: Response) => {
  try {
    const {
      filter = "today",
      from, to,
      marketplace,
      status,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;

    const dateRange = getDateRange(filter, from, to);
    const where: any = { createdAt: dateRange, isTest: false };
    if (marketplace && marketplace !== "all") where.marketplaceDetected = marketplace;
    if (status && status !== "all") where.financialStatus = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const repoParams = {
      from: (dateRange as any).gte,
      to: (dateRange as any).lte,
      before: (dateRange as any).lt,
      marketplace: (marketplace && marketplace !== "all") ? marketplace : undefined,
      financialStatus: (status && status !== "all") ? status : undefined,
      excludeTest: true,
    };
    const [orders, total] = await Promise.all([
      findOrdersByDateRange(prisma, { ...repoParams, skip, take: parseInt(limit) }),
      countOrdersByDateRange(prisma, repoParams),
    ]);

    res.json({ orders, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/stats/order/:id ─────────────────────────────────────────────────
router.get("/order/:id", async (req: Request, res: Response) => {
  try {
    const order = await findOrderByShopifyId(prisma, req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/stats/hour-channels ────────────────────────────────────────────
// Returns per-marketplace revenue + orders for a specific hour slot.
// hour param: "09:00" (Italy local HH:MM). filter/from/to define the day.
router.get("/hour-channels", async (req: Request, res: Response) => {
  try {
    const { hour, filter = "today", from, to, marketplace } = req.query as Record<string, string>;
    if (!hour) return res.status(400).json({ error: "hour param required" });

    const dateRange = getDateRange(filter, from, to) as any;
    const offset    = italyOffsetHours();

    // Translate Italy hour → UTC window
    const [hh] = hour.split(":").map(Number);
    const utcHour = ((hh - offset) % 24 + 24) % 24; // wrap negative

    // Build a WHERE that constrains to the day range AND the specific UTC hour
    const conds: string[] = [`"isTest" = false`];
    if (dateRange.gte) conds.push(`"createdAt" >= '${(dateRange.gte as Date).toISOString()}'::timestamp`);
    if (dateRange.lte) conds.push(`"createdAt" <= '${(dateRange.lte as Date).toISOString()}'::timestamp`);
    if (dateRange.lt)  conds.push(`"createdAt" <  '${(dateRange.lt  as Date).toISOString()}'::timestamp`);
    conds.push(`EXTRACT(HOUR FROM "createdAt") = ${utcHour}`);
    if (marketplace && marketplace !== "all") conds.push(`"marketplaceDetected" = '${marketplace.replace(/'/g,"")}'`);
    const WHERE = conds.join(" AND ");

    type Row = { marketplace: string; revenue: string; net: string; orders: string };
    const rows = await prisma.$queryRawUnsafe<Row[]>(`
      SELECT
        "marketplaceDetected"                      AS marketplace,
        COALESCE(SUM("totalAmount"),   0)::FLOAT8  AS revenue,
        COALESCE(SUM("netAmount"),     0)::FLOAT8  AS net,
        COUNT(*)::INTEGER                          AS orders
      FROM "ShopifyOrder"
      WHERE ${WHERE}
      GROUP BY "marketplaceDetected"
      ORDER BY revenue DESC
    `);

    res.json(rows.map(r => ({
      marketplace: r.marketplace,
      revenue:     Number(r.revenue),
      net:         Number(r.net),
      orders:      Number(r.orders),
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/stats/marketplaces ─────────────────────────────────────────────
router.get("/marketplaces", async (_req: Request, res: Response) => {
  try {
    const results = await findDistinctMarketplaces(prisma);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/stats/reclassify ───────────────────────────────────────────────
// Re-run detectMarketplace() on ALL orders (or only UNCLASSIFIED) and update DB.
// Call this after adding new marketplace rules.
router.post("/reclassify", async (req: Request, res: Response) => {
  const { onlyUnclassified = true } = req.body ?? {};
  res.json({ status: "started", onlyUnclassified });

  // Run async in background
  (async () => {
    console.log(`[Reclassify] Starting ${onlyUnclassified ? "UNCLASSIFIED-only" : "ALL"} reclassification...`);
    let updated = 0, skipped = 0, page = 0;
    const PAGE = 500;

    while (true) {
      const orders = await findOrdersForReclassification(prisma, {
        onlyUnclassified,
        // When onlyUnclassified=true, always skip=0: as we update orders they leave
        // the UNCLASSIFIED pool, so the next page always starts from the new first row.
        // When processing ALL orders, use normal pagination.
        skip: page * PAGE,
        take: PAGE,
      });

      if (orders.length === 0) break;

      for (const order of orders) {
        const result = detectMarketplace(
          order.rawTags ?? [],
          order.sourceName,
          order.channelDisplayName
        );
        if (result.marketplace !== order.marketplaceDetected) {
          await updateOrderMarketplace(prisma, order.id, result.marketplace, result.reason);
          updated++;
        } else {
          skipped++;
        }
      }

      console.log(`[Reclassify] Page ${page + 1}: processed ${orders.length} orders (updated: ${updated}, skipped: ${skipped})`);
      page++;
    }

    console.log(`[Reclassify] ✅ Done. Updated: ${updated}, Unchanged: ${skipped}`);
  })().catch(err => console.error("[Reclassify] Error:", err));
});

// ─── POST /api/stats/sync ─────────────────────────────────────────────────────
router.post("/sync", async (req: Request, res: Response) => {
  const { full } = req.query;
  res.json({ status: "started" });
  // Run async, don't block
  if (full === "true") {
    runInitialSync().catch(console.error);
  } else {
    runIncrementalSync().catch(console.error);
  }
});

// ─── GET /api/stats/sync-status ──────────────────────────────────────────────
router.get("/sync-status", async (_req: Request, res: Response) => {
  try {
    const state = await prisma.syncState.findUnique({ where: { id: "main" } });
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/stats/errors ────────────────────────────────────────────────────
router.get("/errors", async (_req: Request, res: Response) => {
  try {
    const errors = await prisma.appErrorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(errors);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/stats/test-detection ──────────────────────────────────────────
router.post("/test-detection", async (req: Request, res: Response) => {
  const { tags, sourceName, channelDisplayName } = req.body;
  const tagList = Array.isArray(tags) ? tags : (tags ?? "").split(",").map((t: string) => t.trim()).filter(Boolean);
  const result = detectMarketplace(tagList, sourceName ?? null, channelDisplayName ?? null);
  res.json(result);
});

export default router;
