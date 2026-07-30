// products.routes.ts — Product Performance REST API
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
// Prisma namespace imported for Prisma.sql tagged template literal
import { prisma } from "../db";
import {
  computeDailySnapshot,
  runDailySnapshotJob,
  computeAllHistoricalSnapshots,
} from "../services/product.service";
import { groupLineItemsByProduct, findLineItemSample } from "../repositories/shopify/line-items.repo";
import { findSnapshotsByProductId } from "../repositories/shopify/product-snapshots.repo";

const router = Router();

// ─── Helper: date range ────────────────────────────────────────────────────────
function getDateRange(filter: string, from?: string, to?: string) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  switch (filter) {
    case "today":
      return { gte: todayStart, lte: todayEnd };
    case "yesterday": {
      const yStart = new Date(todayStart);
      yStart.setDate(yStart.getDate() - 1);
      const yEnd = new Date(yStart);
      yEnd.setHours(23, 59, 59, 999);
      return { gte: yStart, lte: yEnd };
    }
    case "last7":
      return { gte: new Date(Date.now() - 7 * 86400000), lte: todayEnd };
    case "last30":
      return { gte: new Date(Date.now() - 30 * 86400000), lte: todayEnd };
    case "last90":
      return { gte: new Date(Date.now() - 90 * 86400000), lte: todayEnd };
    case "month": {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { gte: mStart, lte: todayEnd };
    }
    case "custom":
      return {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      };
    default:
      return { gte: new Date(Date.now() - 30 * 86400000), lte: todayEnd };
  }
}

// ─── GET /api/products ─────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      filter = "last30",
      from,
      to,
      marketplace,
      search,
      sortBy = "grossRevenue",
      sortDir = "desc",
    } = req.query as Record<string, string>;

    const dateRange = getDateRange(filter, from, to);
    const dateFrom = (dateRange as any).gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = (dateRange as any).lte ?? new Date();

    const groups = await groupLineItemsByProduct(prisma, {
      from: dateFrom,
      to: dateTo,
      marketplace: (marketplace && marketplace !== "all") ? marketplace : undefined,
      search: search || undefined,
    });

    // Count distinct orders per product via raw SQL
    type DistinctOrderRow = { shopifyProductId: string; marketplace: string; distinctOrders: bigint | number };
    const distinctOrdersRaw = await prisma.$queryRaw<DistinctOrderRow[]>`
      SELECT "shopifyProductId", marketplace, COUNT(DISTINCT "orderId")::INTEGER AS "distinctOrders"
      FROM "OrderLineItem"
      WHERE "orderDate" >= ${dateFrom}::timestamp AND "orderDate" <= ${dateTo}::timestamp
      GROUP BY "shopifyProductId", marketplace
    `;
    const distinctMap = new Map<string, number>();
    for (const r of distinctOrdersRaw) {
      distinctMap.set(`${r.shopifyProductId}|${r.marketplace}`, Number(r.distinctOrders));
    }

    const products = await Promise.all(
      groups.map(async (g) => {
        const sample = await findLineItemSample(prisma, {
          shopifyProductId: g.shopifyProductId,
          marketplace: g.marketplace,
          from: dateFrom,
          to: dateTo,
        });
        const grossRevenue = g._sum.lineTotal ?? 0;
        const refundedAmount = g._sum.refundedAmount ?? 0;
        return {
          shopifyProductId: g.shopifyProductId,
          productTitle: sample?.productTitle ?? "Unknown",
          sku: sample?.sku ?? null,
          imageUrl: sample?.imageUrl ?? null,
          marketplace: g.marketplace,
          unitsSold: g._sum.quantity ?? 0,
          grossRevenue,
          refundedAmount,
          netRevenue: grossRevenue - refundedAmount,
          orderCount: distinctMap.get(`${g.shopifyProductId}|${g.marketplace}`) ?? g._count.id,
          avgUnitPrice: g._avg.unitPrice ?? 0,
          totalDiscount: g._sum.totalDiscount ?? 0,
        };
      })
    );

    const validSortKeys = ["grossRevenue", "netRevenue", "unitsSold", "orderCount", "refundedAmount"];
    const key = validSortKeys.includes(sortBy) ? sortBy : "grossRevenue";
    products.sort((a, b) =>
      sortDir === "asc" ? (a as any)[key] - (b as any)[key] : (b as any)[key] - (a as any)[key]
    );

    // ── KPIs from ShopifyOrder (matches Overview dashboard revenue) ──
    type OrderKpiRow = { gross: string | number; net: string | number; refunds: string | number; orderCount: string | number };
    const mpCondition = marketplace && marketplace !== "all"
      ? Prisma.sql`AND "marketplaceDetected" = ${marketplace}`
      : Prisma.sql``;
    const orderKpis = await prisma.$queryRaw<OrderKpiRow[]>`
      SELECT
        SUM("totalAmount")::FLOAT8    AS gross,
        SUM("netAmount")::FLOAT8      AS net,
        SUM("refundedAmount")::FLOAT8 AS refunds,
        COUNT(*)::INTEGER             AS "orderCount"
      FROM "ShopifyOrder"
      WHERE "createdAt" >= ${dateFrom}::timestamp
        AND "createdAt" <= ${dateTo}::timestamp
        AND "isTest" = false
        ${mpCondition}
    `;

    res.json({
      products,
      kpis: {
        totalGross:   Number(orderKpis[0]?.gross   ?? 0),
        totalNet:     Number(orderKpis[0]?.net     ?? 0),
        totalUnits:   products.reduce((s, p) => s + p.unitsSold, 0),
        totalRefunds: Number(orderKpis[0]?.refunds ?? 0),
        productCount: products.length,
      },
    });
  } catch (err) {
    console.error("[Products] GET /:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/products/channel-daily ─────────────────────────────────────────
// Daily revenue + orders grouped by channel — uses ShopifyOrder (same source as main dashboard)
// + units sold from OrderLineItem merged in JS
router.get("/channel-daily", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo = range.lte ?? new Date();

    // ── 1. Revenue + order count from ShopifyOrder (identical to main dashboard) ──
    type OrderRow = {
      date: Date;
      marketplace: string;
      orderCount: bigint | number;
      grossRevenue: string | number;
      refundedAmount: string | number;
      netRevenue: string | number;
    };

    let orderRows: OrderRow[];
    if (marketplace && marketplace !== "all") {
      orderRows = await prisma.$queryRaw<OrderRow[]>`
        SELECT
          DATE("createdAt") AS date,
          "marketplaceDetected" AS marketplace,
          COUNT(*)::INTEGER AS "orderCount",
          SUM("totalAmount")::FLOAT8 AS "grossRevenue",
          SUM("refundedAmount")::FLOAT8 AS "refundedAmount",
          SUM("netAmount")::FLOAT8 AS "netRevenue"
        FROM "ShopifyOrder"
        WHERE "createdAt" >= ${dateFrom}::timestamp
          AND "createdAt" <= ${dateTo}::timestamp
          AND "isTest" = false
          AND "marketplaceDetected" = ${marketplace}
        GROUP BY DATE("createdAt"), "marketplaceDetected"
        ORDER BY DATE("createdAt") ASC, "marketplaceDetected" ASC
      `;
    } else {
      orderRows = await prisma.$queryRaw<OrderRow[]>`
        SELECT
          DATE("createdAt") AS date,
          "marketplaceDetected" AS marketplace,
          COUNT(*)::INTEGER AS "orderCount",
          SUM("totalAmount")::FLOAT8 AS "grossRevenue",
          SUM("refundedAmount")::FLOAT8 AS "refundedAmount",
          SUM("netAmount")::FLOAT8 AS "netRevenue"
        FROM "ShopifyOrder"
        WHERE "createdAt" >= ${dateFrom}::timestamp
          AND "createdAt" <= ${dateTo}::timestamp
          AND "isTest" = false
        GROUP BY DATE("createdAt"), "marketplaceDetected"
        ORDER BY DATE("createdAt") ASC, "marketplaceDetected" ASC
      `;
    }

    // ── 2. Units sold from OrderLineItem ──
    type UnitRow = {
      date: Date;
      marketplace: string;
      unitsSold: bigint | number;
    };

    let unitRows: UnitRow[];
    if (marketplace && marketplace !== "all") {
      unitRows = await prisma.$queryRaw<UnitRow[]>`
        SELECT
          DATE("orderDate") AS date,
          marketplace,
          SUM(quantity)::INTEGER AS "unitsSold"
        FROM "OrderLineItem"
        WHERE "orderDate" >= ${dateFrom}::timestamp
          AND "orderDate" <= ${dateTo}::timestamp
          AND marketplace = ${marketplace}
        GROUP BY DATE("orderDate"), marketplace
        ORDER BY DATE("orderDate") ASC
      `;
    } else {
      unitRows = await prisma.$queryRaw<UnitRow[]>`
        SELECT
          DATE("orderDate") AS date,
          marketplace,
          SUM(quantity)::INTEGER AS "unitsSold"
        FROM "OrderLineItem"
        WHERE "orderDate" >= ${dateFrom}::timestamp
          AND "orderDate" <= ${dateTo}::timestamp
        GROUP BY DATE("orderDate"), marketplace
        ORDER BY DATE("orderDate") ASC
      `;
    }

    // Normalise unit rows into a lookup map
    const unitsMap = new Map<string, number>();
    for (const r of unitRows) {
      const d = r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0];
      unitsMap.set(`${d}|${r.marketplace}`, Number(r.unitsSold));
    }

    // ── 3. Merge: build final rows using ShopifyOrder as source of truth ──
    const rows = orderRows.map((r) => {
      const gross = Number(r.grossRevenue);
      const refunded = Number(r.refundedAmount);
      const net = Number(r.netRevenue);
      const dateStr = r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0];
      return {
        date: dateStr,
        marketplace: r.marketplace,
        unitsSold: unitsMap.get(`${dateStr}|${r.marketplace}`) ?? 0,
        grossRevenue: gross,
        refundedAmount: refunded,
        netRevenue: net,
        orderCount: Number(r.orderCount),
      };
    });

    // Unique sorted dates and marketplaces
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    const marketplaces = [...new Set(rows.map((r) => r.marketplace))].sort();

    // Wide-format chart data for recharts (one row per date, one key per channel)
    const chartData = dates.map((date) => {
      const entry: Record<string, string | number> = { date };
      let total = 0;
      for (const mp of marketplaces) {
        const row = rows.find((r) => r.date === date && r.marketplace === mp);
        const val = row ? row.grossRevenue : 0;
        entry[mp] = val;
        total += val;
      }
      entry.total = total;
      return entry;
    });

    // Totals per marketplace
    const totals: Record<string, { unitsSold: number; grossRevenue: number; netRevenue: number; orderCount: number }> = {};
    for (const row of rows) {
      if (!totals[row.marketplace]) {
        totals[row.marketplace] = { unitsSold: 0, grossRevenue: 0, netRevenue: 0, orderCount: 0 };
      }
      totals[row.marketplace].unitsSold += row.unitsSold;
      totals[row.marketplace].grossRevenue += row.grossRevenue;
      totals[row.marketplace].netRevenue += row.netRevenue;
      totals[row.marketplace].orderCount += row.orderCount;
    }

    res.json({ rows, dates, marketplaces, chartData, totals });
  } catch (err) {
    console.error("[Products] GET /channel-daily:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/products/snapshot ──────────────────────────────────────────────
router.post("/snapshot", async (_req: Request, res: Response) => {
  res.json({ status: "started" });
  runDailySnapshotJob().catch(console.error);
});

// ─── POST /api/products/snapshot/full ─────────────────────────────────────────
router.post("/snapshot/full", async (_req: Request, res: Response) => {
  res.json({ status: "started", message: "Computing 90-day historical snapshots in background" });
  computeAllHistoricalSnapshots().catch(console.error);
});

// ─── GET /api/products/:productId/history ─────────────────────────────────────
// IMPORTANT: keep this AFTER all static routes above
router.get("/:productId/history", async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { marketplace, granularity = "daily" } = req.query as Record<string, string>;

    const since = new Date(Date.now() - 90 * 86400000);

    const snapshots = await findSnapshotsByProductId(prisma, {
      shopifyProductId: decodeURIComponent(productId),
      from: since,
      marketplace: (marketplace && marketplace !== "all") ? marketplace : undefined,
    });

    if (granularity === "weekly") {
      const weeks: Record<string, any> = {};
      for (const s of snapshots) {
        const week = getISOWeek(new Date(s.snapshotDate));
        if (!weeks[week]) weeks[week] = { date: week, unitsSold: 0, grossRevenue: 0, refundedAmount: 0, netRevenue: 0, orderCount: 0 };
        weeks[week].unitsSold += s.unitsSold;
        weeks[week].grossRevenue += s.grossRevenue;
        weeks[week].refundedAmount += s.refundedAmount;
        weeks[week].netRevenue += s.netRevenue;
        weeks[week].orderCount += s.orderCount;
      }
      return res.json(Object.values(weeks));
    }

    if (granularity === "monthly") {
      const months: Record<string, any> = {};
      for (const s of snapshots) {
        const d = new Date(s.snapshotDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!months[key]) months[key] = { date: key, unitsSold: 0, grossRevenue: 0, refundedAmount: 0, netRevenue: 0, orderCount: 0 };
        months[key].unitsSold += s.unitsSold;
        months[key].grossRevenue += s.grossRevenue;
        months[key].refundedAmount += s.refundedAmount;
        months[key].netRevenue += s.netRevenue;
        months[key].orderCount += s.orderCount;
      }
      return res.json(Object.values(months));
    }

    return res.json(
      snapshots.map((s) => ({
        date: s.snapshotDate.toISOString().split("T")[0],
        unitsSold: s.unitsSold,
        grossRevenue: s.grossRevenue,
        refundedAmount: s.refundedAmount,
        netRevenue: s.netRevenue,
        orderCount: s.orderCount,
      }))
    );
  } catch (err) {
    console.error("[Products] GET /:id/history:", err);
    res.status(500).json({ error: String(err) });
  }
});

function getISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ─── GET /api/products/aggregated ──────────────────────────────────────────────
// Groups products by (EAN, ASIN, imageUrl) for Amazon; (SKU, imageUrl) for Shopify
router.get("/aggregated", async (req: Request, res: Response) => {
  try {
    const {
      filter = "last30",
      from,
      to,
      marketplaces,
      search,
      sortBy = "grossRevenue",
      sortDir = "desc",
      limit = "50",
    } = req.query as Record<string, string>;

    const range = getDateRange(filter, from, to);
    const dateFrom = (range as any).gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo = (range as any).lte ?? new Date();
    const limitNum = Math.min(parseInt(limit) || 50, 500);
    const mpArray = marketplaces ? marketplaces.split(",").map(m => m.trim()) : undefined;

    // Query Amazon data with comprehensive metrics
    const amazonGroups = await (prisma as any).amazonOrderItem.groupBy({
      by: ["asin"],
      where: {
        purchaseDate: range,
        order: { salesChannel: { not: "Non-Amazon" } },
        ...(mpArray && mpArray.length > 0 ? { order: { marketplace: { in: mpArray } } } : {}),
      },
      _sum: {
        quantityOrdered: true,
        itemPrice: true,
        promotionDiscount: true,
      },
      _count: { id: true },
    });

    // Get Amazon product details and COGS
    const amazonDetails = amazonGroups.length > 0 ? await (prisma as any).amazonProductCogs.findMany({
      where: {
        asin: { in: amazonGroups.map(g => g.asin) },
        OR: mpArray && mpArray.length > 0
          ? mpArray.map(mp => ({ marketplace: mp })).concat([{ marketplace: "ALL" }])
          : [{ marketplace: "IT" }, { marketplace: "ALL" }],
      },
    }) : [];

    const amazonDetailMap = new Map(amazonDetails.map(d => [d.asin, d])) as Map<string, any>;

    // Get Amazon settlement data (refunds, fees, payouts)
    const amazonSettlements = amazonGroups.length > 0 ? await (prisma as any).amazonSettlementTransaction.findMany({
      where: {
        asin: { in: amazonGroups.map(g => g.asin) },
        postedDate: range,
        ...(mpArray && mpArray.length > 0 ? { marketplace: { in: mpArray } } : {}),
      },
    }) : [];

    // Get Amazon Ads data (ad spend)
    const amazonAds = amazonGroups.length > 0 ? await (prisma as any).amazonAdSnapshot.findMany({
      where: {
        snapshotDate: {
          gte: dateFrom,
          lte: dateTo,
        },
        ...(mpArray && mpArray.length > 0 ? { marketplace: { in: mpArray } } : {}),
      },
    }) : [];

    // Get Amazon product snapshots (sessions)
    const amazonSnapshots = amazonGroups.length > 0 ? await (prisma as any).amazonProductSnapshot.findMany({
      where: {
        asin: { in: amazonGroups.map(g => g.asin) },
        snapshotDate: {
          gte: dateFrom,
          lte: dateTo,
        },
        ...(mpArray && mpArray.length > 0 ? { marketplace: { in: mpArray } } : {}),
      },
    }) : [];

    // Build settlement aggregates by ASIN
    const settlementsByAsin = new Map<string, any>();
    for (const settlement of amazonSettlements) {
      const asin = settlement.asin!;
      if (!settlementsByAsin.has(asin)) {
        settlementsByAsin.set(asin, {
          totalRefunds: 0,
          amazonFees: 0,
          shippingCosts: 0,
          refundCost: 0,
          totalPayout: 0,
        });
      }
      const agg = settlementsByAsin.get(asin)!;
      // settlement.amount is a Prisma.Decimal (monetary column) — convert once,
      // `+=` on a Decimal silently concatenates strings instead of adding.
      const amount = Number(settlement.amount);

      if (settlement.transactionType === "Refund") {
        agg.totalRefunds += Math.abs(amount);
        agg.refundCost += Math.abs(amount);
      }
      if (settlement.amountType?.includes("Commission") || settlement.amountType?.includes("Fee")) {
        agg.amazonFees += Math.abs(amount);
      }
      if (settlement.amountType?.includes("Shipping") || settlement.amountType?.includes("Inbound")) {
        agg.shippingCosts += Math.abs(amount);
      }
      if (settlement.amountType === "Principal") {
        agg.totalPayout += amount;
      }
    }

    // Build ads aggregates by ASIN (from campaigns)
    const adsByAsin = new Map<string, number>();
    for (const ad of amazonAds) {
      // Assuming campaign name or tags contain ASIN info, or sum all spend
      // For now, distribute based on campaigns
      const spend = ad.spend || 0;
      // Note: without explicit ASIN in AmazonAdSnapshot, we'd need to join via campaign
      // For MVP, we skip ASIN-specific ad spend
    }

    // Build snapshot aggregates by ASIN and extract BSR
    const snapshotsByAsin = new Map<string, any>();
    const bsrByAsin = new Map<string, number>();
    for (const snap of amazonSnapshots) {
      const asin = snap.asin;
      if (!snapshotsByAsin.has(asin)) {
        snapshotsByAsin.set(asin, {
          totalSessions: 0,
          snapshotCount: 0,
        });
      }
      const agg = snapshotsByAsin.get(asin)!;
      agg.totalSessions += snap.unitsSold || 0; // Using unitsSold as proxy for sessions
      agg.snapshotCount += 1;

      // Extract BSR (best = lowest number during the period)
      if (snap.bsr && (!bsrByAsin.has(asin) || snap.bsr < bsrByAsin.get(asin)!)) {
        bsrByAsin.set(asin, snap.bsr);
      }
    }

    // Build products array from Amazon
    const products: any[] = [];

    for (const group of amazonGroups) {
      const detail = amazonDetailMap.get(group.asin);
      if (!detail) continue;

      const totalRevenue = Number(group._sum.itemPrice ?? 0);
      const totalUnits = Number(group._sum.quantityOrdered ?? 0);
      const totalOrders = group._count.id;
      const promo = Number(group._sum.promotionDiscount ?? 0);

      // Get aggregated settlement data
      const settlement = settlementsByAsin.get(group.asin) || {
        totalRefunds: 0,
        amazonFees: 0,
        shippingCosts: 0,
        refundCost: 0,
        totalPayout: 0,
      };

      // Get COGS
      const costOfGoods = (detail.cogsPerUnit ?? 0) * totalUnits;
      const shippingCosts = (detail.shippingCost ?? 0) * totalUnits;

      // Calculate metrics
      const grossProfit = totalRevenue - costOfGoods;
      const netProfit = grossProfit - settlement.amazonFees;
      const percentRefunds = totalOrders > 0 ? (settlement.totalRefunds / totalOrders) * 100 : 0;
      const totalAdSpend = adsByAsin.get(group.asin) || 0;
      const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const roi = totalAdSpend > 0 ? (netProfit / totalAdSpend) * 100 : 0;
      const realAcos = totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : 0;

      const snapshot = snapshotsByAsin.get(group.asin) || { totalSessions: 0 };
      const sessionsDay = snapshot.snapshotCount > 0 ? snapshot.totalSessions / snapshot.snapshotCount : 0;
      const unitSoldSessionPct = sessionsDay > 0 ? (totalUnits / sessionsDay) * 100 : 0;

      products.push({
        ean: detail.ean ?? null,
        asin: group.asin,
        sku: detail.sku ?? null,
        imageUrl: detail.imageUrl ?? group.imageUrl ?? null,
        productTitle: detail.productTitle ?? "Unknown",
        totalRevenue,
        totalOrders,
        totalUnits,
        sales: totalRevenue,
        promo,
        percentRefunds,
        amazonFees: settlement.amazonFees,
        costOfGoods,
        grossProfit,
        netProfit,
        estimatedPayout: settlement.totalPayout,
        expenses: settlement.amazonFees + settlement.shippingCosts,
        margin,
        roi,
        realAcos,
        sessionsDay,
        unitSoldSessionPct,
        shippingCosts,
        totalRefunds: settlement.totalRefunds,
        totalAdSpend,
        sellableReturns: 0, // Would need separate data
        refundCost: settlement.refundCost,
        bsr: bsrByAsin.get(group.asin) ?? null, // Best (lowest) BSR from snapshots
        marketplaces: [
          {
            mp: detail.marketplace,
            label: `Amazon ${detail.marketplace}`,
            revenue: totalRevenue,
            orders: totalOrders,
            units: totalUnits,
          },
        ],
      });
    }

    // Query Shopify data (from productPerformance)
    const shopifyWhere: any = {
      orderDate: range,
    };
    if (mpArray && mpArray.length > 0) {
      shopifyWhere.marketplace = { in: mpArray };
    }
    if (search) {
      shopifyWhere.OR = [
        { productTitle: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ];
    }

    const shopifyGroups = await (prisma as any).orderLineItem.groupBy({
      by: ["sku", "imageUrl", "marketplace"],
      where: shopifyWhere,
      _sum: { quantity: true, lineTotal: true },
      _count: { id: true },
    });

    // Process Shopify groups
    for (const group of shopifyGroups) {
      const totalRevenue = Number(group._sum.lineTotal ?? 0);
      const totalUnits = Number(group._sum.quantity ?? 0);

      products.push({
        ean: null,
        asin: null,
        sku: group.sku ?? null,
        imageUrl: group.imageUrl ?? null,
        productTitle: "Unknown",
        totalRevenue,
        totalOrders: group._count.id,
        totalUnits,
        totalAdSpend: 0,
        totalRefunds: 0,
        marketplaces: [
          {
            mp: group.marketplace,
            label: group.marketplace,
            revenue: totalRevenue,
            orders: group._count.id,
            units: totalUnits,
          },
        ],
        sales: totalRevenue,
        promo: 0,
        percentRefunds: 0,
        amazonFees: 0,
        costOfGoods: 0,
        grossProfit: 0,
        netProfit: 0,
        estimatedPayout: 0,
        expenses: 0,
        margin: null,
        roi: null,
        realAcos: null,
        sessionsDay: null,
        unitSoldSessionPct: null,
        shippingCosts: null,
        sellableReturns: 0,
        refundCost: 0,
        bsr: null,
      });
    }

    // Sort
    const validKeys = ["totalRevenue", "totalUnits", "totalOrders", "grossProfit", "netProfit", "margin", "roi"];
    const sortKey = validKeys.includes(sortBy) ? sortBy : "totalRevenue";
    products.sort((a, b) =>
      sortDir === "asc"
        ? (a as any)[sortKey] - (b as any)[sortKey]
        : (b as any)[sortKey] - (a as any)[sortKey]
    );

    // Limit
    const paginatedProducts = products.slice(0, limitNum);

    // KPIs
    const kpis = {
      totalGross: products.reduce((s, p) => s + p.totalRevenue, 0),
      totalNet: products.reduce((s, p) => s + p.netProfit, 0),
      totalUnits: products.reduce((s, p) => s + p.totalUnits, 0),
      totalOrders: products.reduce((s, p) => s + p.totalOrders, 0),
      totalAdSpend: products.reduce((s, p) => s + (p.totalAdSpend || 0), 0),
      totalRefunds: products.reduce((s, p) => s + (p.totalRefunds || 0), 0),
      totalFees: products.reduce((s, p) => s + (p.amazonFees || 0), 0),
      productCount: paginatedProducts.length,
    };

    res.json({
      products: paginatedProducts,
      kpis,
      limit: limitNum,
      total: products.length,
    });
  } catch (err) {
    console.error("[Products] GET /aggregated:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
