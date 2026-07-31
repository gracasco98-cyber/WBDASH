// chat/tools.ts — Data access layer for the AI chatbot
// All DB queries run server-side. No secrets are exposed to the frontend.

import { prisma } from "../db";
import { getCurrentAccountId } from "../context/account-context";

// ─── Multi-account helpers ─────────────────────────────────────────────────────
// These chat tools mix Shopify + Amazon data in a single response. The account
// middleware (server.ts) is lenient on /api/chat: if 0 or 2+ Amazon accounts
// exist and none was specified, getCurrentAccountId() throws rather than guess.
// For endpoints that report Shopify-only data too, we catch specifically that
// error and degrade the Amazon portion gracefully instead of failing the whole
// tool call — the Shopify numbers are still useful to the user even if Amazon
// scope is ambiguous. Endpoints that are Amazon-only in practice (inventory,
// PPC, margin) let the error propagate since there is nothing else to show.
function isNoAccountError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("No Amazon account in scope");
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function safeDate(s?: string, daysAgo = 30): Date {
  if (!s) return new Date(Date.now() - daysAgo * 86400000);
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(Date.now() - daysAgo * 86400000) : d;
}
function datePair(from?: string, to?: string) {
  return { from: safeDate(from, 30), to: safeDate(to, 0) };
}
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

// ─── Tool 1: Sales Summary ────────────────────────────────────────────────────

export async function getSalesSummary(args: {
  dateFrom?: string; dateTo?: string;
  channel?: "shopify" | "amazon" | "all";
  marketplace?: string;
}): Promise<any> {
  const { from, to } = datePair(args.dateFrom, args.dateTo);
  const ch = args.channel ?? "all";
  const result: Record<string, any> = {
    period: { from: isoDate(from), to: isoDate(to) },
  };

  if (ch === "all" || ch === "shopify") {
    const [row] = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*)::INTEGER                         AS "orders",
        COALESCE(SUM("totalAmount"),  0)::FLOAT8  AS "grossRevenue",
        COALESCE(SUM("netAmount"),    0)::FLOAT8  AS "netRevenue",
        COALESCE(SUM("refundedAmount"),0)::FLOAT8 AS "refunds",
        COALESCE(SUM("lineItemsCount"),0)::INTEGER AS "units"
      FROM "ShopifyOrder"
      WHERE "createdAt" BETWEEN ${from} AND ${to}
        AND "isTest" = false
        AND "financialStatus" != 'voided'
    `;
    result.shopify = row;
  }

  if (ch === "all" || ch === "amazon") {
    try {
      const accountId = getCurrentAccountId();
      const mpFilter = args.marketplace && args.marketplace !== "all"
        ? `AND i.marketplace = '${args.marketplace.toUpperCase().slice(0, 2)}'`
        : "";
      const [row] = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COUNT(DISTINCT o."amazonOrderId")::INTEGER  AS "orders",
          COALESCE(SUM(i."itemPrice"),     0)::FLOAT8 AS "grossRevenue",
          COALESCE(SUM(i."quantityOrdered"),0)::INTEGER AS "units",
          COUNT(DISTINCT i.asin)::INTEGER             AS "uniqueProducts"
        FROM "AmazonOrderItem" i
        JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
        WHERE i."purchaseDate" BETWEEN '${from.toISOString()}' AND '${to.toISOString()}'
          AND o."orderStatus" NOT IN ('Canceled','Cancelled')
          AND o."amazonAccountId" = '${accountId}'
          AND i."amazonAccountId" = '${accountId}'
          ${mpFilter}
      `);
      result.amazon = row;
    } catch (e) {
      if (!isNoAccountError(e)) throw e;
      result.amazon = { unavailable: true, note: "Dati Amazon non disponibili: nessun account Amazon univoco selezionato per questa richiesta." };
    }
  }

  result.totalGrossRevenue =
    Number(result.shopify?.grossRevenue ?? 0) + Number(result.amazon?.grossRevenue ?? 0);
  result.totalOrders =
    Number(result.shopify?.orders ?? 0) + Number(result.amazon?.orders ?? 0);

  return result;
}

// ─── Tool 2: Top / Bottom Products ───────────────────────────────────────────

export async function getTopProducts(args: {
  dateFrom?: string; dateTo?: string;
  channel?: string; limit?: number;
  sortBy?: "revenue" | "units" | "orders";
  order?: "asc" | "desc";
}): Promise<any> {
  const { from, to } = datePair(args.dateFrom, args.dateTo);
  const limit = Math.min(Number(args.limit) || 10, 20);
  const dir   = (args.order ?? "desc").toUpperCase();
  const cols: Record<string, string> = {
    revenue: '"grossRevenue"', units: '"unitsSold"', orders: '"orderCount"',
  };
  const col = cols[args.sortBy ?? "revenue"] ?? '"grossRevenue"';
  const result: Record<string, any> = {
    period: { from: isoDate(from), to: isoDate(to) },
    sortBy: args.sortBy ?? "revenue", order: args.order ?? "desc",
  };

  if (!args.channel || args.channel === "all" || args.channel === "shopify") {
    result.shopify = await prisma.$queryRawUnsafe<any[]>(`
      SELECT "shopifyProductId", MAX("productTitle") AS "productTitle",
             SUM("unitsSold")::INTEGER   AS "unitsSold",
             ROUND(SUM("grossRevenue")::NUMERIC, 2)  AS "grossRevenue",
             ROUND(SUM("netRevenue")::NUMERIC, 2)    AS "netRevenue",
             SUM("orderCount")::INTEGER  AS "orderCount"
      FROM "ProductDailySnapshot"
      WHERE "snapshotDate" BETWEEN '${isoDate(from)}' AND '${isoDate(to)}'
      GROUP BY "shopifyProductId"
      ORDER BY ${col} ${dir} LIMIT ${limit}
    `);
  }

  if (!args.channel || args.channel === "all" || args.channel === "amazon") {
    try {
      const accountId = getCurrentAccountId();
      result.amazon = await prisma.$queryRawUnsafe<any[]>(`
        SELECT asin, MAX(sku) AS sku, MAX("productTitle") AS "productTitle",
               SUM("unitsSold")::INTEGER   AS "unitsSold",
               ROUND(SUM("grossRevenue")::NUMERIC, 2) AS "grossRevenue",
               ROUND(SUM("netRevenue")::NUMERIC, 2)   AS "netRevenue",
               SUM("orderCount")::INTEGER  AS "orderCount"
        FROM "AmazonProductSnapshot"
        WHERE "snapshotDate" BETWEEN '${isoDate(from)}' AND '${isoDate(to)}'
          AND "amazonAccountId" = '${accountId}'
        GROUP BY asin
        ORDER BY ${col} ${dir} LIMIT ${limit}
      `);
    } catch (e) {
      if (!isNoAccountError(e)) throw e;
      result.amazon = { unavailable: true, note: "Dati Amazon non disponibili: nessun account Amazon univoco selezionato per questa richiesta." };
    }
  }

  return result;
}

// ─── Tool 3: Channel Comparison (Shopify vs Amazon) ──────────────────────────

export async function getChannelComparison(args: {
  dateFrom?: string; dateTo?: string;
}): Promise<any> {
  const { from, to } = datePair(args.dateFrom, args.dateTo);

  const [sh] = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::INTEGER AS "orders",
           ROUND(COALESCE(SUM("totalAmount"),  0)::NUMERIC, 2) AS "grossRevenue",
           ROUND(COALESCE(SUM("netAmount"),    0)::NUMERIC, 2) AS "netRevenue",
           ROUND(COALESCE(SUM("refundedAmount"),0)::NUMERIC,2) AS "refunds",
           COALESCE(SUM("lineItemsCount"), 0)::INTEGER          AS "units"
    FROM "ShopifyOrder"
    WHERE "createdAt" BETWEEN ${from} AND ${to}
      AND "isTest" = false AND "financialStatus" != 'voided'
  `;
  const shByMp = await prisma.$queryRaw<any[]>`
    SELECT "marketplaceDetected" AS mp,
           COUNT(*)::INTEGER AS "orders",
           ROUND(COALESCE(SUM("totalAmount"),0)::NUMERIC,2) AS "revenue"
    FROM "ShopifyOrder"
    WHERE "createdAt" BETWEEN ${from} AND ${to}
      AND "isTest"=false AND "financialStatus"!='voided'
    GROUP BY "marketplaceDetected" ORDER BY "revenue" DESC
  `;

  let am: any = null;
  let amByMp: any[] = [];
  let amazonNote: string | undefined;
  try {
    const accountId = getCurrentAccountId();
    [am] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(DISTINCT o."amazonOrderId")::INTEGER           AS "orders",
             ROUND(COALESCE(SUM(i."itemPrice"),      0)::NUMERIC,2) AS "grossRevenue",
             COALESCE(SUM(i."quantityOrdered"),       0)::INTEGER AS "units"
      FROM "AmazonOrderItem" i
      JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
      WHERE i."purchaseDate" BETWEEN ${from} AND ${to}
        AND o."orderStatus" NOT IN ('Canceled','Cancelled')
        AND o."amazonAccountId" = ${accountId}
        AND i."amazonAccountId" = ${accountId}
    `;
    amByMp = await prisma.$queryRaw<any[]>`
      SELECT i.marketplace,
             COUNT(DISTINCT o."amazonOrderId")::INTEGER           AS "orders",
             ROUND(COALESCE(SUM(i."itemPrice"),0)::NUMERIC,2)     AS "revenue"
      FROM "AmazonOrderItem" i
      JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
      WHERE i."purchaseDate" BETWEEN ${from} AND ${to}
        AND o."orderStatus" NOT IN ('Canceled','Cancelled')
        AND o."amazonAccountId" = ${accountId}
        AND i."amazonAccountId" = ${accountId}
      GROUP BY i.marketplace ORDER BY "revenue" DESC
    `;
  } catch (e) {
    if (!isNoAccountError(e)) throw e;
    amazonNote = "Dati Amazon non disponibili: nessun account Amazon univoco selezionato per questa richiesta.";
  }

  const shRev  = Number(sh?.grossRevenue ?? 0);
  const amRev  = Number(am?.grossRevenue ?? 0);
  const total  = shRev + amRev;

  return {
    period: { from: isoDate(from), to: isoDate(to) },
    totalRevenue: total,
    shopify: { ...sh, sharePct: total > 0 ? Math.round(shRev / total * 100) : 0, byMarketplace: shByMp },
    amazon:  { ...am, sharePct: total > 0 ? Math.round(amRev / total * 100) : 0, byMarketplace: amByMp, ...(amazonNote ? { note: amazonNote } : {}) },
  };
}

// ─── Tool 4: Period Comparison ────────────────────────────────────────────────

export async function getPeriodComparison(args: {
  period1From: string; period1To: string;
  period2From: string; period2To: string;
}): Promise<any> {
  const p1 = datePair(args.period1From, args.period1To);
  const p2 = datePair(args.period2From, args.period2To);

  async function fetchPeriod(from: Date, to: Date) {
    const [sh] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::INTEGER AS "orders",
             ROUND(COALESCE(SUM("totalAmount"),0)::NUMERIC,2) AS "revenue"
      FROM "ShopifyOrder"
      WHERE "createdAt" BETWEEN ${from} AND ${to}
        AND "isTest"=false AND "financialStatus"!='voided'
    `;
    let am: any = null;
    try {
      const accountId = getCurrentAccountId();
      [am] = await prisma.$queryRaw<any[]>`
        SELECT COUNT(DISTINCT o."amazonOrderId")::INTEGER AS "orders",
               ROUND(COALESCE(SUM(i."itemPrice"),0)::NUMERIC,2) AS "revenue"
        FROM "AmazonOrderItem" i
        JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
        WHERE i."purchaseDate" BETWEEN ${from} AND ${to}
          AND o."orderStatus" NOT IN ('Canceled','Cancelled')
          AND o."amazonAccountId" = ${accountId}
          AND i."amazonAccountId" = ${accountId}
      `;
    } catch (e) {
      if (!isNoAccountError(e)) throw e;
      // Amazon scope ambiguous/unavailable — degrade to 0 so the Shopify-only
      // comparison (which the caller can still act on) doesn't fail entirely.
    }
    const shRev = Number(sh?.revenue ?? 0);
    const amRev = Number(am?.revenue ?? 0);
    return {
      from: isoDate(from), to: isoDate(to),
      shopifyRevenue: shRev, shopifyOrders: Number(sh?.orders ?? 0),
      amazonRevenue:  amRev, amazonOrders:  Number(am?.orders ?? 0),
      totalRevenue: shRev + amRev,
    };
  }

  const [d1, d2] = await Promise.all([fetchPeriod(p1.from, p1.to), fetchPeriod(p2.from, p2.to)]);

  function chg(a: number, b: number) {
    return b === 0 ? null : +((a - b) / b * 100).toFixed(1);
  }

  return {
    period1: d1, period2: d2,
    changes: {
      totalRevenuePct:   chg(d1.totalRevenue,   d2.totalRevenue),
      shopifyRevenuePct: chg(d1.shopifyRevenue, d2.shopifyRevenue),
      amazonRevenuePct:  chg(d1.amazonRevenue,  d2.amazonRevenue),
      shopifyOrdersPct:  chg(d1.shopifyOrders,  d2.shopifyOrders),
      amazonOrdersPct:   chg(d1.amazonOrders,   d2.amazonOrders),
    },
  };
}

// ─── Tool 5: Amazon Inventory Summary ────────────────────────────────────────
// Note: FBA live stock is fetched from SP-API in real-time (not stored in DB).
// This tool uses AmazonInventory table if populated, otherwise provides
// velocity-based insights from recent order data.

export async function getAmazonInventorySummary(): Promise<any> {
  // Amazon-only tool (no Shopify data mixed in) — resolve the account once up
  // front so a "No Amazon account in scope" error propagates clearly to the
  // caller instead of being silently absorbed by the `catch {}` below, which
  // exists only to trigger the velocity fallback on genuine query failures.
  const accountId = getCurrentAccountId();

  // Try the AmazonInventory table first
  try {
    const [count] = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::INTEGER AS n FROM "AmazonInventory" WHERE "amazonAccountId" = ${accountId}`;
    if (Number(count?.n ?? 0) > 0) {
      const [summary] = await prisma.$queryRaw<any[]>`
        SELECT
          COUNT(DISTINCT asin)::INTEGER              AS "totalSkus",
          COALESCE(SUM("qtyAfn"),0)::INTEGER         AS "totalFulfillable",
          COALESCE(SUM("qtyInbound"),0)::INTEGER     AS "totalInbound",
          COUNT(CASE WHEN "qtyAfn"=0 THEN 1 END)::INTEGER          AS "outOfStock",
          COUNT(CASE WHEN "qtyAfn">0 AND "qtyAfn"<15 THEN 1 END)::INTEGER AS "criticalStock"
        FROM "AmazonInventory"
        WHERE "amazonAccountId" = ${accountId}
      `;
      const critical = await prisma.$queryRaw<any[]>`
        SELECT asin, sku, "qtyAfn" AS fulfillable, "qtyInbound" AS inbound
        FROM "AmazonInventory" WHERE "qtyAfn" < 20 AND "amazonAccountId" = ${accountId}
        ORDER BY "qtyAfn" ASC LIMIT 10
      `;
      return { source: "AmazonInventory", summary, criticalProducts: critical };
    }
  } catch {}

  // Fallback: velocity from recent 30-day orders (best available approximation)
  const since = new Date(Date.now() - 30 * 86400000);
  const topVelocity = await prisma.$queryRaw<any[]>`
    SELECT i.asin, MAX(i.sku) AS sku, MAX(i."productTitle") AS "productTitle",
           SUM(i."quantityOrdered")::INTEGER AS "unitsSold30d",
           ROUND((SUM(i."quantityOrdered")::FLOAT / 30)::NUMERIC, 2) AS "dailyVelocity"
    FROM "AmazonOrderItem" i
    JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
    WHERE i."purchaseDate" >= ${since}
      AND o."orderStatus" NOT IN ('Canceled','Cancelled')
      AND o."amazonAccountId" = ${accountId}
      AND i."amazonAccountId" = ${accountId}
    GROUP BY i.asin
    ORDER BY "unitsSold30d" DESC
    LIMIT 20
  `;
  const [totals] = await prisma.$queryRaw<any[]>`
    SELECT COUNT(DISTINCT i.asin)::INTEGER AS "activeSkus",
           SUM(i."quantityOrdered")::INTEGER AS "totalUnits30d"
    FROM "AmazonOrderItem" i
    JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
    WHERE i."purchaseDate" >= ${since}
      AND o."orderStatus" NOT IN ('Canceled','Cancelled')
      AND o."amazonAccountId" = ${accountId}
      AND i."amazonAccountId" = ${accountId}
  `;

  return {
    source: "velocity_estimate",
    note: "Dati stock live non disponibili nel DB (l'inventario FBA viene letto in tempo reale dall'API). Dati stimati da velocità vendita 30gg.",
    activeSkus: totals?.activeSkus ?? 0,
    totalUnitsSold30d: totals?.totalUnits30d ?? 0,
    topSellingProducts: topVelocity.slice(0, 10),
    suggestedAction: "Apri la pagina /amazon/inventory per vedere lo stock live FBA con giorni rimanenti e prodotti critici.",
  };
}

// ─── Tool 6: Amazon PPC Summary ──────────────────────────────────────────────

export async function getAmazonPpcSummary(args: {
  dateFrom?: string; dateTo?: string;
}): Promise<any> {
  const { from, to } = datePair(args.dateFrom, args.dateTo);
  // Amazon-only tool (no Shopify data mixed in) — let "No Amazon account in
  // scope" propagate to the caller, there's nothing else to show.
  const accountId = getCurrentAccountId();
  const [summary] = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(DISTINCT "campaignId")::INTEGER          AS "campaigns",
      COALESCE(SUM("impressions"),0)::INTEGER        AS "impressions",
      COALESCE(SUM("clicks"),0)::INTEGER             AS "clicks",
      ROUND(COALESCE(SUM("spend"),0)::NUMERIC,2)     AS "spend",
      ROUND(COALESCE(SUM("sales"),0)::NUMERIC,2)     AS "sales",
      CASE WHEN SUM("sales")>0
        THEN ROUND((SUM("spend")/SUM("sales")*100)::NUMERIC,1)
        ELSE NULL END AS "acos",
      CASE WHEN SUM("spend")>0
        THEN ROUND((SUM("sales")/SUM("spend"))::NUMERIC,2)
        ELSE NULL END AS "roas"
    FROM "AmazonAdSnapshot"
    WHERE "snapshotDate" BETWEEN ${from} AND ${to}
      AND "amazonAccountId" = ${accountId}
  `;
  const topCampaigns = await prisma.$queryRaw<any[]>`
    SELECT "campaignName",
           ROUND(SUM("spend")::NUMERIC,2)  AS "spend",
           ROUND(SUM("sales")::NUMERIC,2)  AS "sales",
           CASE WHEN SUM("sales")>0
             THEN ROUND((SUM("spend")/SUM("sales")*100)::NUMERIC,1)
             ELSE NULL END AS "acos"
    FROM "AmazonAdSnapshot"
    WHERE "snapshotDate" BETWEEN ${from} AND ${to}
      AND "amazonAccountId" = ${accountId}
    GROUP BY "campaignName"
    ORDER BY "spend" DESC LIMIT 8
  `;
  return { period: { from: isoDate(from), to: isoDate(to) }, summary, topCampaigns };
}

// ─── Tool 7: Margin Analysis ─────────────────────────────────────────────────

export async function getMarginAnalysis(args: {
  dateFrom?: string; dateTo?: string; limit?: number;
}): Promise<any> {
  const { from, to } = datePair(args.dateFrom, args.dateTo);
  const limit = Math.min(Number(args.limit) || 10, 20);
  // Amazon-only tool (no Shopify data mixed in) — let "No Amazon account in
  // scope" propagate to the caller, there's nothing else to show.
  const accountId = getCurrentAccountId();
  // Amazon fee model: 15% referral + €3.80/unit FBA
  const products = await prisma.$queryRawUnsafe<any[]>(`
    SELECT s.asin,
           MAX(s."productTitle")                         AS "productTitle",
           SUM(s."unitsSold")::INTEGER                   AS "unitsSold",
           ROUND(SUM(s."grossRevenue")::NUMERIC,2)       AS "grossRevenue",
           ROUND(COALESCE(MAX(c."cogsPerUnit"),0)::NUMERIC,2) AS "cogsPerUnit",
           ROUND(COALESCE(MAX(c."shippingCost"),0)::NUMERIC,2) AS "shippingCost",
           CASE WHEN SUM(s."grossRevenue")>0 THEN
             ROUND((
               (SUM(s."grossRevenue")
                - SUM(s."unitsSold") * (COALESCE(MAX(c."cogsPerUnit"),0) + COALESCE(MAX(c."shippingCost"),0))
                - SUM(s."grossRevenue") * 0.15
                - SUM(s."unitsSold") * 3.8
               ) / SUM(s."grossRevenue") * 100
             )::NUMERIC, 1)
           ELSE NULL END AS "marginPct",
           CASE WHEN MAX(c."cogsPerUnit") IS NULL THEN true ELSE false END AS "missingCogs"
    FROM "AmazonProductSnapshot" s
    LEFT JOIN "AmazonProductCogs" c ON c.asin = s.asin AND c."amazonAccountId" = '${accountId}'
    WHERE s."snapshotDate" BETWEEN '${isoDate(from)}' AND '${isoDate(to)}'
      AND s."amazonAccountId" = '${accountId}'
    GROUP BY s.asin
    HAVING SUM(s."grossRevenue") > 0
    ORDER BY "grossRevenue" DESC
    LIMIT ${limit}
  `);
  return { period: { from: isoDate(from), to: isoDate(to) }, products };
}

// ─── Tool 8: Dashboard Context (always called first) ─────────────────────────

export async function getDashboardContext(): Promise<any> {
  const [shopifyCount] = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::INTEGER AS n FROM "ShopifyOrder" WHERE "isTest"=false
  `;
  const [lastSync] = await prisma.$queryRaw<any[]>`
    SELECT "lastSyncAt" FROM "SyncState" WHERE id='main' LIMIT 1
  `;
  const [shopifyFirst] = await prisma.$queryRaw<any[]>`
    SELECT MIN("createdAt") AS "firstOrder" FROM "ShopifyOrder" WHERE "isTest"=false
  `;

  // This is "always called first" for chat context and mixes Shopify + Amazon
  // data — degrade the Amazon portion gracefully rather than blocking the
  // whole dashboard context if no single Amazon account is in scope.
  let amazonCount: any = null;
  let lastAmz: any = null;
  let amazonFirst: any = null;
  let amazonNote: string | undefined;
  try {
    const accountId = getCurrentAccountId();
    [amazonCount] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::INTEGER AS n FROM "AmazonOrder" WHERE "amazonAccountId" = ${accountId}
    `;
    [lastAmz] = await prisma.$queryRaw<any[]>`
      SELECT MAX("completedAt") AS "lastSync" FROM "AmazonSyncJob" WHERE status='done' AND "amazonAccountId" = ${accountId}
    `;
    [amazonFirst] = await prisma.$queryRaw<any[]>`
      SELECT MIN("purchaseDate") AS "firstOrder" FROM "AmazonOrder" WHERE "amazonAccountId" = ${accountId}
    `;
  } catch (e) {
    if (!isNoAccountError(e)) throw e;
    amazonNote = "Dati Amazon non disponibili: nessun account Amazon univoco selezionato per questa richiesta.";
  }

  return {
    today:              new Date().toISOString().slice(0, 10),
    shopifyTotalOrders: Number(shopifyCount?.n ?? 0),
    amazonTotalOrders:  Number(amazonCount?.n  ?? 0),
    shopifyFirstOrder:  shopifyFirst?.firstOrder ?? null,
    amazonFirstOrder:   amazonFirst?.firstOrder  ?? null,
    lastShopifySync:    lastSync?.lastSyncAt     ?? null,
    lastAmazonSync:     lastAmz?.lastSync        ?? null,
    ...(amazonNote ? { amazonDataNote: amazonNote } : {}),
  };
}
