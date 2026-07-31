// amazon/routes/orders.routes.ts — Orders, Summary, Timeseries, Overview endpoints
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  countAmazonOrders,
  findAmazonOrdersWithItems,
} from "../../repositories/amazon/orders.repo";
import { italyOffsetMs, italyDayStart, getDateRange } from "../utils/datetime";
import { getCurrentAccountId } from "../../context/account-context";

export const ordersRouter = Router();

// ─── CSV helper (local) ──────────────────────────────────────────────────────
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const BOM = "﻿"; // UTF-8 BOM so Excel opens with correct encoding
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map(r => r.map(escape).join(",")),
  ];
  return BOM + lines.join("\r\n");
}

// ─── GET /overview ─────────────────────────────────────────────────────────────
// Returns 5-period KPIs: today, yesterday, MTD, forecast, last month
ordersRouter.get("/overview", async (req: Request, res: Response) => {
  console.log(`[Amazon] /overview HIT — ip=${req.ip} mp=${req.query.marketplace ?? "all"}`);
  try {
    const amazonAccountId = getCurrentAccountId();
    const { marketplace } = req.query as Record<string, string>;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace.replace(/'/g, "") : null;

    const now = new Date();
    const todayStart = italyDayStart(now);
    const todayEnd   = new Date(todayStart.getTime() + 86400000 - 1);

    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const yesterdayEnd   = new Date(todayStart.getTime() - 1);

    const dayBeforeStart = new Date(yesterdayStart.getTime() - 86400000);
    const dayBeforeEnd   = new Date(yesterdayStart.getTime() - 1);

    const monthStart     = italyDayStart(new Date(now.getFullYear(), now.getMonth(), 1));
    const lastMonthStart = italyDayStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEnd   = new Date(monthStart.getTime() - 1);
    const monthBeforeLastStart = italyDayStart(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const monthBeforeLastEnd   = new Date(lastMonthStart.getTime() - 1);

    const italyNow    = new Date(now.getTime() + italyOffsetMs());
    const daysElapsed = Math.max(1, italyNow.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const lastMonthDays     = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const mtdLastMonthStart = lastMonthStart;
    const mtdLastMonthEnd   = new Date(lastMonthStart.getTime() + Math.min(daysElapsed, lastMonthDays) * 86400000 - 1);

    // ── Wide window covering all 7 periods in one pass ─────────────────────────
    const wideFrom = monthBeforeLastStart;
    const wideTo   = todayEnd;
    const mpW      = mpFilter ? ` AND o.marketplace = '${mpFilter}'` : "";
    const adMpW    = mpFilter ? ` AND marketplace = '${mpFilter}'` : "";
    const iso      = (d: Date) => d.toISOString();
    // For AmazonAdSnapshot queries: snapshots store Italian calendar dates.
    const isoSnapD = (d: Date) => new Date(d.getTime() + italyOffsetMs()).toISOString().split("T")[0];

    // 7 period definitions  [name, from, to]
    // IMPORTANT: names MUST be ALL LOWERCASE
    const periods: [string, Date, Date][] = [
      ["today",      todayStart,           todayEnd          ],
      ["yesterday",  yesterdayStart,       yesterdayEnd      ],
      ["daybefore",  dayBeforeStart,       dayBeforeEnd      ],
      ["mtd",        monthStart,           wideTo            ],
      ["lastmonth",  lastMonthStart,       lastMonthEnd      ],
      ["mtdlast",    mtdLastMonthStart,    mtdLastMonthEnd   ],
      ["mbl",        monthBeforeLastStart, monthBeforeLastEnd],
    ];

    // ── Query 1: order metrics
    const orderColsSql = periods.map(([name, from, to]) => `
      COUNT(DISTINCT CASE WHEN o."purchaseDate" >= '${iso(from)}'::timestamp AND o."purchaseDate" <= '${iso(to)}'::timestamp
            AND o."orderStatus" NOT IN ('Canceled','Cancelled') THEN o."amazonOrderId" END)::INTEGER AS ${name}_ordercount,
      COALESCE(SUM(CASE WHEN o."purchaseDate" >= '${iso(from)}'::timestamp AND o."purchaseDate" <= '${iso(to)}'::timestamp
            AND o."orderStatus" NOT IN ('Canceled','Cancelled') THEN i."itemPrice" ELSE 0 END), 0)::FLOAT8 AS ${name}_grossrevenue,
      COALESCE(SUM(CASE WHEN o."purchaseDate" >= '${iso(from)}'::timestamp AND o."purchaseDate" <= '${iso(to)}'::timestamp
            AND o."orderStatus" NOT IN ('Canceled','Cancelled') THEN i."quantityOrdered" ELSE 0 END), 0)::INTEGER AS ${name}_unitssold,
      COUNT(DISTINCT CASE WHEN o."purchaseDate" >= '${iso(from)}'::timestamp AND o."purchaseDate" <= '${iso(to)}'::timestamp
            AND o."orderStatus" IN ('Canceled','Cancelled') THEN o."amazonOrderId" END)::INTEGER AS ${name}_cancelledcount
    `).join(",\n");

    // ── Query 2: ad spend for all 7 periods from AmazonAdSnapshot
    const adColsSql = periods.map(([name, from, to]) =>
      `COALESCE(SUM(CASE WHEN "snapshotDate" >= '${isoSnapD(from)}'::date AND "snapshotDate" <= '${isoSnapD(to)}'::date THEN spend ELSE 0 END), 0)::FLOAT8 AS ${name}_adspend`
    ).join(",\n");

    type FlatRow = Record<string, number>;
    const [ordersRow, adsRow] = await Promise.all([
      prisma.$queryRawUnsafe<FlatRow[]>(`
        SELECT ${orderColsSql}
        FROM "AmazonOrder" o
        LEFT JOIN "AmazonOrderItem" i ON i."amazonAccountId" = o."amazonAccountId" AND i."amazonOrderId" = o."amazonOrderId"
        WHERE o."purchaseDate" >= '${iso(wideFrom)}'::timestamp
          AND o."purchaseDate" <= '${iso(wideTo)}'::timestamp
          AND o."salesChannel" != 'Non-Amazon'
          AND o."amazonAccountId" = '${amazonAccountId}'
          ${mpW}
      `).then(r => r[0] ?? {}),

      prisma.$queryRawUnsafe<FlatRow[]>(`
        SELECT ${adColsSql}
        FROM "AmazonAdSnapshot"
        WHERE "snapshotDate" >= '${isoSnapD(wideFrom)}'::date
          AND "snapshotDate" <= '${isoSnapD(wideTo)}'::date
          AND "amazonAccountId" = '${amazonAccountId}'
          ${adMpW}
      `).then(r => r[0] ?? {}),
    ]);

    // ── Build per-period stats ─────────────────────────────────────────────────
    function buildStats(name: string) {
      const grossRevenue   = Number(ordersRow[`${name}_grossrevenue`]   ?? 0);
      const orderCount     = Number(ordersRow[`${name}_ordercount`]     ?? 0);
      const unitsSold      = Number(ordersRow[`${name}_unitssold`]      ?? 0);
      const cancelledCount = Number(ordersRow[`${name}_cancelledcount`] ?? 0);
      const adSpend        = Number(adsRow[`${name}_adspend`]           ?? 0);
      const estFees        = grossRevenue * 0.15 + unitsSold * 3.80;
      const estPayout      = Math.max(0, grossRevenue - estFees - adSpend);
      return { grossRevenue, orderCount, unitsSold, cancelledCount, adSpend, estFees, estPayout };
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

    // Forecast = MTD scaled to full month
    const fc = (v: number) => daysElapsed > 0 ? v / daysElapsed * daysInMonth : 0;
    const forecast = {
      grossRevenue:   fc(mtd.grossRevenue),
      orderCount:     Math.round(fc(mtd.orderCount)),
      unitsSold:      Math.round(fc(mtd.unitsSold)),
      cancelledCount: Math.round(fc(mtd.cancelledCount)),
      adSpend:        fc(mtd.adSpend),
      estFees:        fc(mtd.estFees),
      estPayout:      fc(mtd.estPayout),
    };

    const payload = {
      today:     { ...today,     pctChange: pct(today.grossRevenue,     yesterday.grossRevenue) },
      yesterday: { ...yesterday, pctChange: pct(yesterday.grossRevenue, dayBefore.grossRevenue) },
      mtd:       { ...mtd,       pctChange: pct(mtd.grossRevenue,       mtdLast.grossRevenue)   },
      forecast:  { ...forecast,  pctChange: pct(forecast.grossRevenue,  lastMonth.grossRevenue) },
      lastMonth: { ...lastMonth, pctChange: pct(lastMonth.grossRevenue, mbl.grossRevenue)       },
      meta: { daysElapsed, daysInMonth },
    };
    console.log(`[Amazon] GET /overview → today: ${today.orderCount} orders, €${today.grossRevenue.toFixed(2)}`);
    res.json(payload);
  } catch (err) {
    console.error("[Amazon] GET /overview:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /summary ───────────────────────────────────────────────────────────────
ordersRouter.get("/summary", async (req: Request, res: Response) => {
  try {
    const amazonAccountId = getCurrentAccountId();
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();

    type SummaryRow = {
      marketplace: string;
      orderCount: bigint | number;
      unitsSold: bigint | number;
      grossRevenue: number | string;
    };

    const mpFilter = marketplace && marketplace !== "all" ? ` AND o.marketplace = '${marketplace.replace(/'/g, "")}'` : "";

    const rows = await prisma.$queryRawUnsafe<SummaryRow[]>(`
      SELECT
        o.marketplace,
        COUNT(DISTINCT o."amazonOrderId")::INTEGER AS "orderCount",
        COALESCE(SUM(i."quantityOrdered"), 0)::INTEGER AS "unitsSold",
        COALESCE(SUM(i."itemPrice"), 0)::FLOAT8 AS "grossRevenue"
      FROM "AmazonOrder" o
      LEFT JOIN "AmazonOrderItem" i ON i."amazonAccountId" = o."amazonAccountId" AND i."amazonOrderId" = o."amazonOrderId"
      WHERE o."purchaseDate" >= '${dateFrom.toISOString()}'::timestamp
        AND o."purchaseDate" <= '${dateTo.toISOString()}'::timestamp
        AND o."orderStatus" NOT IN ('Canceled', 'Cancelled')
        AND o."salesChannel" != 'Non-Amazon'
        AND o."amazonAccountId" = '${amazonAccountId}'
        ${mpFilter}
      GROUP BY o.marketplace
    `);

    const byMarketplace: Record<string, { revenue: number; orders: number; units: number }> = {};
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalUnits = 0;

    for (const row of rows) {
      const rev    = Number(row.grossRevenue);
      const orders = Number(row.orderCount);
      const units  = Number(row.unitsSold);
      byMarketplace[row.marketplace] = { revenue: rev, orders, units };
      totalRevenue += rev;
      totalOrders  += orders;
      totalUnits   += units;
    }

    // PPC totals from AmazonAdSnapshot
    const _summaryItz = italyOffsetMs();
    const _adFrom = new Date(dateFrom.getTime() + _summaryItz).toISOString().split("T")[0];
    const _adTo   = new Date(dateTo.getTime()   + _summaryItz).toISOString().split("T")[0];
    type AdRow = { spend: number | string; sales: number | string };
    const adRows = await prisma.$queryRawUnsafe<AdRow[]>(`
      SELECT COALESCE(SUM(spend), 0)::FLOAT8 AS spend, COALESCE(SUM(sales), 0)::FLOAT8 AS sales
      FROM "AmazonAdSnapshot"
      WHERE "snapshotDate" >= '${_adFrom}'::date
        AND "snapshotDate" <= '${_adTo}'::date
        AND "amazonAccountId" = '${amazonAccountId}'
        ${marketplace && marketplace !== "all" ? `AND marketplace = '${marketplace.replace(/'/g, "")}'` : ""}
    `);

    const adSpend = Number(adRows[0]?.spend ?? 0);
    const adSales = Number(adRows[0]?.sales ?? 0);
    const acos = adSales > 0 ? (adSpend / adSales) * 100 : 0;
    const estimatedPayout = totalRevenue - adSpend;

    res.json({
      totalRevenue,
      netRevenue: totalRevenue,
      orderCount: totalOrders,
      unitsSold: totalUnits,
      adSpend,
      acos: Math.round(acos * 100) / 100,
      estimatedPayout,
      byMarketplace,
    });
  } catch (err) {
    console.error("[Amazon] GET /summary:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /timeseries ────────────────────────────────────────────────────────────
ordersRouter.get("/timeseries", async (req: Request, res: Response) => {
  try {
    const amazonAccountId = getCurrentAccountId();
    const { filter = "last30", from, to, marketplace, granularity = "day" } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();

    const mpFilter = marketplace && marketplace !== "all"
      ? ` AND o.marketplace = '${marketplace.replace(/'/g, "")}'` : "";

    type TsMpRow = { ts: string | Date; marketplace: string; revenue: number | string; count: bigint | number };

    if (granularity === "hour") {
      const rows = await prisma.$queryRawUnsafe<TsMpRow[]>(`
        SELECT
          TO_CHAR(o."purchaseDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:00') AS ts,
          o.marketplace,
          COALESCE(SUM(i."itemPrice"), 0)::FLOAT8 AS revenue,
          COUNT(DISTINCT o."amazonOrderId")::INTEGER AS count
        FROM "AmazonOrder" o
        LEFT JOIN "AmazonOrderItem" i ON i."amazonAccountId" = o."amazonAccountId" AND i."amazonOrderId" = o."amazonOrderId"
        WHERE o."purchaseDate" >= '${dateFrom.toISOString()}'::timestamp
          AND o."purchaseDate" <= '${dateTo.toISOString()}'::timestamp
          AND o."orderStatus" NOT IN ('Canceled', 'Cancelled')
          AND o."salesChannel" != 'Non-Amazon'
          AND o."amazonAccountId" = '${amazonAccountId}'
          ${mpFilter}
        GROUP BY TO_CHAR(o."purchaseDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:00'), o.marketplace
        ORDER BY TO_CHAR(o."purchaseDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:00') ASC
      `);

      const hourMap = new Map<string, Record<string, number>>();
      for (const r of rows) {
        const hour = String(r.ts);
        if (!hourMap.has(hour)) hourMap.set(hour, { revenue: 0, count: 0 });
        const d = hourMap.get(hour)!;
        const rev = Number(r.revenue);
        const cnt = Number(r.count);
        d.revenue += rev;
        d.count   += cnt;
        d[`mp_${r.marketplace}`] = (d[`mp_${r.marketplace}`] ?? 0) + rev;
        d[`mpc_${r.marketplace}`] = (d[`mpc_${r.marketplace}`] ?? 0) + cnt;
      }

      res.json(
        Array.from(hourMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([time, d]) => ({ time, ...d }))
      );
    } else {
      const rows = await prisma.$queryRawUnsafe<TsMpRow[]>(`
        SELECT
          DATE(o."purchaseDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome') AS ts,
          o.marketplace,
          COALESCE(SUM(i."itemPrice"), 0)::FLOAT8 AS revenue,
          COUNT(DISTINCT o."amazonOrderId")::INTEGER AS count
        FROM "AmazonOrder" o
        LEFT JOIN "AmazonOrderItem" i ON i."amazonAccountId" = o."amazonAccountId" AND i."amazonOrderId" = o."amazonOrderId"
        WHERE o."purchaseDate" >= '${dateFrom.toISOString()}'::timestamp
          AND o."purchaseDate" <= '${dateTo.toISOString()}'::timestamp
          AND o."orderStatus" NOT IN ('Canceled', 'Cancelled')
          AND o."salesChannel" != 'Non-Amazon'
          AND o."amazonAccountId" = '${amazonAccountId}'
          ${mpFilter}
        GROUP BY DATE(o."purchaseDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome'), o.marketplace
        ORDER BY DATE(o."purchaseDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome') ASC
      `);

      const dayMap = new Map<string, Record<string, number>>();
      for (const r of rows) {
        const day = r.ts instanceof Date ? r.ts.toISOString().split("T")[0] : String(r.ts).split("T")[0];
        if (!dayMap.has(day)) dayMap.set(day, { revenue: 0, count: 0 });
        const d = dayMap.get(day)!;
        const rev = Number(r.revenue);
        const cnt = Number(r.count);
        d.revenue += rev;
        d.count   += cnt;
        d[`mp_${r.marketplace}`] = (d[`mp_${r.marketplace}`] ?? 0) + rev;
        d[`mpc_${r.marketplace}`] = (d[`mpc_${r.marketplace}`] ?? 0) + cnt;
      }

      res.json(
        Array.from(dayMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([time, d]) => ({ time, ...d }))
      );
    }
  } catch (err) {
    console.error("[Amazon] GET /timeseries:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /orders ────────────────────────────────────────────────────────────────
ordersRouter.get("/orders", async (req: Request, res: Response) => {
  try {
    const amazonAccountId = getCurrentAccountId();
    const { filter = "last30", from, to, marketplace, page = "1", limit = "50", status } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));

    const where: any = { purchaseDate: range };
    if (marketplace && marketplace !== "all") where.marketplace = marketplace;
    if (status) {
      where.orderStatus = status;
    } else {
      where.orderStatus = { notIn: ["Canceled", "Cancelled"] };
    }

    // Build WHERE conditions for raw SQL
    const conditions: string[] = [
      `o."purchaseDate" >= '${range.gte!.toISOString()}' AND o."purchaseDate" <= '${range.lte ? range.lte.toISOString() : new Date().toISOString()}'`,
      `o."amazonAccountId" = '${amazonAccountId}'`,
    ];
    if (marketplace && marketplace !== "all") conditions.push(`o."marketplace" = '${marketplace.replace(/'/g, "''")}'`);
    if (status) {
      conditions.push(`o."orderStatus" = '${status.replace(/'/g, "''")}'`);
    } else {
      conditions.push(`o."orderStatus" NOT IN ('Canceled', 'Cancelled')`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const offset = (pageNum - 1) * limitNum;

    const [totalResult, ordersRaw, itemsRaw] = await Promise.all([
      countAmazonOrders(prisma, {
        from:             range.gte as Date,
        to:               range.lte as Date,
        marketplace:      marketplace && marketplace !== "all" ? marketplace : undefined,
        excludeCancelled: !status,
        orderStatus:      status || undefined,
      }),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          o.*,
          st."settlementId"                                              AS "settlementId",
          CASE WHEN st."orderId" IS NOT NULL THEN true ELSE false END    AS "isPaid",
          s."depositDate"                                                AS "depositDate"
        FROM "AmazonOrder" o
        LEFT JOIN LATERAL (
          SELECT st2."settlementId", st2."orderId"
          FROM "AmazonSettlementTransaction" st2
          WHERE st2."amazonAccountId" = o."amazonAccountId"
            AND st2."orderId" = o."amazonOrderId"
            AND st2."amountType" = 'Principal'
            AND st2."transactionType" = 'Order'
          LIMIT 1
        ) st ON true
        LEFT JOIN "AmazonSettlement" s ON s."amazonAccountId" = o."amazonAccountId" AND s."settlementId" = st."settlementId"
        ${whereClause}
        ORDER BY o."purchaseDate" DESC
        LIMIT ${limitNum} OFFSET ${offset}
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT oi.*
        FROM "AmazonOrderItem" oi
        WHERE oi."amazonAccountId" = '${amazonAccountId}'
          AND oi."amazonOrderId" IN (
          SELECT o."amazonOrderId" FROM "AmazonOrder" o
          ${whereClause}
          ORDER BY o."purchaseDate" DESC
          LIMIT ${limitNum} OFFSET ${offset}
        )
      `),
    ]);

    // Group items by amazonOrderId
    const itemsByOrder: Record<string, any[]> = {};
    for (const item of itemsRaw) {
      const key = item.amazonOrderId;
      if (!itemsByOrder[key]) itemsByOrder[key] = [];
      itemsByOrder[key].push(item);
    }

    const orders = ordersRaw.map((o: any) => ({
      ...o,
      items: itemsByOrder[o.amazonOrderId] ?? [],
      isPaid: Boolean(o.isPaid),
    }));

    res.json({ orders, total: totalResult, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[Amazon] GET /orders:", err);
    res.status(500).json({ error: String(err) });
  }
});

