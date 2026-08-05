// orders.repo.ts — Repository layer for AmazonOrder + AmazonOrderItem entities.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, AmazonOrder, AmazonOrderItem } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { toNum } from "../../utils/decimal";
import { getCurrentAccountId } from "../../context/account-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FindAmazonOrdersParams {
  from?: Date;
  to?: Date;
  marketplace?: string;
  /** When true, excludes salesChannel = 'Non-Amazon' */
  excludeNonAmazon?: boolean;
  /** When true, excludes orderStatus IN ('Canceled','Cancelled') */
  excludeCancelled?: boolean;
  orderStatus?: string;
  skip?: number;
  take?: number;
}

// ─── Read operations — AmazonOrder ────────────────────────────────────────────

/**
 * Find orders within the given date range (purchaseDate).
 * Ordered by purchaseDate DESC.
 */
export async function findAmazonOrdersByDateRange(
  prisma: PrismaClient,
  params: FindAmazonOrdersParams
): Promise<AmazonOrder[]> {
  const where = buildOrderWhere(params);
  return prisma.amazonOrder.findMany({
    where,
    orderBy: { purchaseDate: "desc" },
    skip: params.skip,
    take: params.take,
  });
}

/**
 * Find orders within the given date range, including their items.
 * Used for CSV export.
 */
export async function findAmazonOrdersWithItems(
  prisma: PrismaClient,
  params: FindAmazonOrdersParams & { includeItems?: boolean }
): Promise<(AmazonOrder & { items: AmazonOrderItem[] })[]> {
  const where = buildOrderWhere(params);
  return prisma.amazonOrder.findMany({
    where,
    include: { items: true },
    orderBy: { purchaseDate: "desc" },
    take: params.take ?? 50000,
  });
}

/**
 * Count orders matching the given date range and optional filters.
 */
export async function countAmazonOrders(
  prisma: PrismaClient,
  params: FindAmazonOrdersParams
): Promise<number> {
  const where = buildOrderWhere(params);
  return prisma.amazonOrder.count({ where });
}

/**
 * Count all AmazonOrder rows (no filter). Used for DB stats / verification.
 */
export async function countAllAmazonOrders(prisma: PrismaClient): Promise<number> {
  return prisma.amazonOrder.count({ where: { amazonAccountId: getCurrentAccountId() } });
}

/**
 * Group orders by marketplace with count, for the current account. Used for DB stats marketplace breakdown.
 */
export async function groupAmazonOrdersByMarketplace(
  prisma: PrismaClient
): Promise<{ marketplace: string; _count: number }[]> {
  const groups = await prisma.amazonOrder.groupBy({
    by: ["marketplace"],
    where: { amazonAccountId: getCurrentAccountId() },
    _count: true,
    orderBy: { _count: { marketplace: "desc" } },
  });
  return groups.map(g => ({ marketplace: g.marketplace, _count: g._count }));
}

/**
 * Earliest/latest purchaseDate across all AmazonOrder rows for the current
 * account. Used for DB stats / verification.
 */
export async function findAmazonOrderDateRange(
  prisma: PrismaClient
): Promise<{ min: Date | null; max: Date | null }> {
  const accountId = getCurrentAccountId();
  const [row] = await prisma.$queryRaw<[{ min: Date | null; max: Date | null }]>`
    SELECT MIN("purchaseDate") AS min, MAX("purchaseDate") AS max FROM "AmazonOrder" WHERE "amazonAccountId" = ${accountId}`;
  return row;
}

export interface AmazonOrderExportRow {
  amazonOrderId: string;
  marketplace: string;
  purchaseDate: string;
  orderStatus: string;
  fulfillmentChannel: string;
  salesChannel: string;
  itemTotal: number;
  currency: string;
  isPaid: boolean;
  settlementId: string | null;
  depositDate: string | null;
}

/**
 * Orders for CSV export (up to 50k), joined against the first matching
 * settlement transaction (if any) to report paid/unpaid status. Uses a
 * LATERAL join, which Prisma's query builder cannot express directly.
 * Parameters are passed as real bound values (Prisma.sql), not string-
 * interpolated, unlike the raw SQL this replaces.
 */
export async function findAmazonOrdersForExport(
  prisma: PrismaClient,
  params: { from: string; to: string; marketplace?: string; status?: string }
): Promise<AmazonOrderExportRow[]> {
  const amazonAccountId = getCurrentAccountId();
  const conditions = [Prisma.sql`o."purchaseDate" >= ${params.from}::date`];
  conditions.push(Prisma.sql`o."purchaseDate" <= ${params.to}::date + interval '1 day'`);
  conditions.push(Prisma.sql`o."amazonAccountId" = ${amazonAccountId}`);
  if (params.marketplace) conditions.push(Prisma.sql`o.marketplace = ${params.marketplace}`);
  if (params.status) conditions.push(Prisma.sql`o."orderStatus" = ${params.status}`);
  const whereClause = Prisma.join(conditions, " AND ");

  return prisma.$queryRaw<AmazonOrderExportRow[]>`
    SELECT
      o."amazonOrderId", o.marketplace, o."purchaseDate"::text, o."orderStatus",
      o."fulfillmentChannel", o."salesChannel", o."itemTotal"::FLOAT8, o.currency,
      CASE WHEN st."orderId" IS NOT NULL THEN true ELSE false END AS "isPaid",
      st."settlementId",
      s."depositDate"::date::text AS "depositDate"
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
    WHERE ${whereClause}
    ORDER BY o."purchaseDate" DESC
    LIMIT 50000
  `;
}

// ─── Unreconciled orders (GET /payments/unreconciled + /unreconciled/export) ──
// Both endpoints previously duplicated the same "marketplace settlement
// coverage window" SQL almost verbatim (docs/tech-debt.md E.1) — one
// paginated for the UI, one unpaginated for CSV export. Consolidated into
// one shared query builder; the two callers only differ in limit/offset.

export interface UnreconciledOrdersParams {
  marketplace?: string;
  search?: string;
  customFrom?: string | null;
  customTo?: string | null;
}

/** Builds the `mp_coverage` CTE: either a fixed custom date range (if the
 *  caller passed explicit from/to dates) or each marketplace's real
 *  settlement coverage window (min/max settlement dates). */
function buildCoverageCte(accountId: string, params: UnreconciledOrdersParams): Prisma.Sql {
  const mpWhere = params.marketplace ? Prisma.sql`AND o.marketplace = ${params.marketplace}` : Prisma.empty;
  const isCustom = !!(params.customFrom || params.customTo);
  if (isCustom) {
    const from = params.customFrom ?? "2020-01-01";
    const to = params.customTo ?? new Date().toISOString().split("T")[0];
    return Prisma.sql`
      WITH mp_coverage AS (
        SELECT DISTINCT o.marketplace,
          ${from}::date AS cov_from,
          ${to}::date AS cov_to
        FROM "AmazonOrder" o
        WHERE o."amazonAccountId" = ${accountId}
        ${mpWhere}
      )`;
  }
  return Prisma.sql`
    WITH mp_coverage AS (
      SELECT marketplace,
        MIN("startDate")::date AS cov_from,
        MAX("endDate")::date   AS cov_to
      FROM "AmazonSettlement"
      WHERE marketplace NOT IN ('EU')
        AND "amazonAccountId" = ${accountId}
      GROUP BY marketplace
    )`;
}

/** Shared WHERE clause: orders within their marketplace's coverage window,
 *  not cancelled/pending, with no matching settlement transaction yet. */
function buildUnreconciledWhere(accountId: string, params: UnreconciledOrdersParams): Prisma.Sql {
  const mpWhere = params.marketplace ? Prisma.sql`AND o.marketplace = ${params.marketplace}` : Prisma.empty;
  const searchWhere = params.search?.trim()
    ? Prisma.sql`AND o."amazonOrderId" ILIKE ${"%" + params.search.trim() + "%"}`
    : Prisma.empty;
  return Prisma.sql`
    FROM "AmazonOrder" o
    JOIN mp_coverage mc ON mc.marketplace = o.marketplace
    WHERE o."orderStatus" NOT IN ('Cancelled', 'Pending')
      AND o."purchaseDate"::date >= mc.cov_from
      AND o."purchaseDate"::date <= mc.cov_to
      AND o."amazonAccountId" = ${accountId}
      ${mpWhere}
      ${searchWhere}
      AND NOT EXISTS (
        SELECT 1 FROM "AmazonSettlementTransaction" st
        WHERE st."orderId" = o."amazonOrderId"
          AND st."amazonAccountId" = o."amazonAccountId"
          AND st."amountType" = 'Principal'
          AND st."transactionType" = 'Order'
      )`;
}

export interface UnreconciledOrderRow {
  amazonOrderId: string;
  marketplace: string;
  purchaseDate: string;
  orderStatus: string;
  fulfillmentChannel: string;
  itemTotal: number;
  currency: string;
  covFrom: string;
  covTo: string;
}

/**
 * Unreconciled orders (no matching settlement transaction yet), one page.
 * Used directly (paginated) by the UI, and with a large limit/offset=0 by
 * the CSV export endpoint — the single duplication point between them.
 */
export async function findUnreconciledOrders(
  prisma: PrismaClient,
  params: UnreconciledOrdersParams & { limit: number; offset: number }
): Promise<UnreconciledOrderRow[]> {
  const accountId = getCurrentAccountId();
  const coverageCte = buildCoverageCte(accountId, params);
  const whereSql = buildUnreconciledWhere(accountId, params);
  const rows = await prisma.$queryRaw<Array<{
    amazonOrderId: string; marketplace: string; purchaseDate: string;
    orderStatus: string; fulfillmentChannel: string; itemTotal: number; currency: string;
    cov_from: string; cov_to: string;
  }>>`
    ${coverageCte}
    SELECT o."amazonOrderId", o.marketplace, o."purchaseDate"::text, o."orderStatus",
           o."fulfillmentChannel", o."itemTotal"::FLOAT8, o.currency,
           mc.cov_from::text, mc.cov_to::text
    ${whereSql}
    ORDER BY o."purchaseDate" DESC
    LIMIT ${params.limit} OFFSET ${params.offset}
  `;
  return rows.map((r) => ({
    amazonOrderId: r.amazonOrderId, marketplace: r.marketplace, purchaseDate: r.purchaseDate,
    orderStatus: r.orderStatus, fulfillmentChannel: r.fulfillmentChannel, itemTotal: r.itemTotal,
    currency: r.currency, covFrom: r.cov_from, covTo: r.cov_to,
  }));
}

/** Total count of unreconciled orders matching the same filters, for pagination. */
export async function countUnreconciledOrders(
  prisma: PrismaClient,
  params: UnreconciledOrdersParams
): Promise<number> {
  const accountId = getCurrentAccountId();
  const coverageCte = buildCoverageCte(accountId, params);
  const whereSql = buildUnreconciledWhere(accountId, params);
  const [row] = await prisma.$queryRaw<[{ total: bigint }]>`
    ${coverageCte}
    SELECT COUNT(*) AS total
    ${whereSql}
  `;
  return Number(row.total);
}

export interface UnreconciledMarketplaceTotal {
  marketplace: string;
  count: number;
  amount: number;
  covFrom: string;
  covTo: string;
}

/** Unreconciled order count + gross amount, grouped by marketplace. */
export async function sumUnreconciledByMarketplace(
  prisma: PrismaClient,
  params: UnreconciledOrdersParams
): Promise<UnreconciledMarketplaceTotal[]> {
  const accountId = getCurrentAccountId();
  const coverageCte = buildCoverageCte(accountId, params);
  const whereSql = buildUnreconciledWhere(accountId, params);
  const rows = await prisma.$queryRaw<Array<{ marketplace: string; count: bigint; amount: number; cov_from: string; cov_to: string }>>`
    ${coverageCte}
    SELECT o.marketplace,
           COUNT(*) AS count,
           COALESCE(SUM(o."itemTotal"),0)::FLOAT8 AS amount,
           mc.cov_from::text, mc.cov_to::text
    ${whereSql}
    GROUP BY o.marketplace, mc.cov_from, mc.cov_to
    ORDER BY amount DESC
  `;
  return rows.map((r) => ({
    marketplace: r.marketplace, count: Number(r.count), amount: r.amount,
    covFrom: r.cov_from, covTo: r.cov_to,
  }));
}

export interface MarketplaceCoverage {
  marketplace: string;
  covFrom: string;
  covTo: string;
  settlementCount: number;
}

/** Settlement coverage window (min/max dates) + settlement count, per marketplace. */
export async function findMarketplaceCoverage(prisma: PrismaClient): Promise<MarketplaceCoverage[]> {
  const accountId = getCurrentAccountId();
  const rows = await prisma.$queryRaw<Array<{ marketplace: string; cov_from: string; cov_to: string; settlement_count: bigint }>>`
    SELECT marketplace,
      MIN("startDate")::date::text AS cov_from,
      MAX("endDate")::date::text   AS cov_to,
      COUNT(*)::BIGINT             AS settlement_count
    FROM "AmazonSettlement"
    WHERE marketplace NOT IN ('EU')
      AND "amazonAccountId" = ${accountId}
    GROUP BY marketplace
    ORDER BY marketplace
  `;
  return rows.map((r) => ({
    marketplace: r.marketplace, covFrom: r.cov_from, covTo: r.cov_to, settlementCount: Number(r.settlement_count),
  }));
}

export interface Dd7ReserveRow {
  marketplace: string;
  inDd7Hold: number;
  dd7Gross: number;
  pastDd7Count: number;
  pastDd7Gross: number;
  earliestRelease: string | null;
  latestRelease: string | null;
}

/**
 * DD+7 reserve estimate: orders Shipped/Delivered in the last 21 days, not
 * yet in any settlement, split into "still in the 7-day hold" vs. "past the
 * estimated release date" (purchaseDate + 3d delivery + 7d hold = +10d).
 */
export async function computeDd7Reserve(prisma: PrismaClient): Promise<Dd7ReserveRow[]> {
  const accountId = getCurrentAccountId();
  const rows = await prisma.$queryRaw<Array<{
    marketplace: string;
    in_dd7_hold: bigint;
    dd7_gross: number;
    past_dd7: bigint;
    past_dd7_gross: number;
    earliest_release: string | null;
    latest_release: string | null;
  }>>`
    WITH order_ages AS (
      SELECT o.marketplace, o."amazonOrderId", o."itemTotal",
        o."purchaseDate",
        (o."purchaseDate" + INTERVAL '3 days')::date AS est_delivery,
        (o."purchaseDate" + INTERVAL '10 days')::date AS est_release
      FROM "AmazonOrder" o
      WHERE o."orderStatus" IN ('Shipped','Delivered')
        AND o."purchaseDate" >= NOW() - INTERVAL '21 days'
        AND o."amazonAccountId" = ${accountId}
        AND NOT EXISTS (
          SELECT 1 FROM "AmazonSettlementTransaction" st
          WHERE st."orderId" = o."amazonOrderId"
            AND st."amazonAccountId" = o."amazonAccountId"
            AND st."amountType"='Principal' AND st."transactionType"='Order'
        )
    )
    SELECT marketplace,
      COUNT(CASE WHEN est_release >= CURRENT_DATE THEN 1 END)    AS in_dd7_hold,
      COALESCE(SUM(CASE WHEN est_release >= CURRENT_DATE THEN "itemTotal" ELSE 0 END),0)::FLOAT8 AS dd7_gross,
      COUNT(CASE WHEN est_release < CURRENT_DATE THEN 1 END)     AS past_dd7,
      COALESCE(SUM(CASE WHEN est_release < CURRENT_DATE THEN "itemTotal" ELSE 0 END),0)::FLOAT8  AS past_dd7_gross,
      MIN(CASE WHEN est_release >= CURRENT_DATE THEN est_release::text END) AS earliest_release,
      MAX(CASE WHEN est_release >= CURRENT_DATE THEN est_release::text END) AS latest_release
    FROM order_ages
    WHERE marketplace IN ('IT','DE','ES','FR')
    GROUP BY marketplace ORDER BY dd7_gross DESC
  `;
  return rows.map((r) => ({
    marketplace: r.marketplace, inDd7Hold: Number(r.in_dd7_hold), dd7Gross: r.dd7_gross,
    pastDd7Count: Number(r.past_dd7), pastDd7Gross: r.past_dd7_gross,
    earliestRelease: r.earliest_release, latestRelease: r.latest_release,
  }));
}

// ─── Read operations — AmazonOrderItem ────────────────────────────────────────

/**
 * Count all AmazonOrderItem rows for the current account. Used for DB stats / verification.
 */
export async function countAllAmazonOrderItems(prisma: PrismaClient): Promise<number> {
  return prisma.amazonOrderItem.count({ where: { amazonAccountId: getCurrentAccountId() } });
}

/**
 * Group order items by ASIN and marketplace for snapshot computation.
 * Returns aggregated unitsSold, grossRevenue, and count.
 */
export async function groupAmazonItemsForSnapshot(
  prisma: PrismaClient,
  params: { from: Date; to: Date }
): Promise<Array<{
  asin: string;
  marketplace: string;
  _sum: { quantityOrdered: number | null; itemPrice: number | null };
  _count: { id: number };
}>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (prisma.amazonOrderItem.groupBy as any)({
    by: ["asin", "marketplace"],
    where: {
      amazonAccountId: getCurrentAccountId(),
      purchaseDate: { gte: params.from, lte: params.to },
      order: { orderStatus: { notIn: ["Canceled", "Cancelled"] } },
    },
    _sum: {
      quantityOrdered: true,
      itemPrice: true,
    },
    _count: { id: true },
  })) as any[];
  return rows.map((r) => ({
    asin: r.asin,
    marketplace: r.marketplace,
    _sum: { quantityOrdered: r._sum.quantityOrdered, itemPrice: toNum(r._sum.itemPrice) },
    _count: r._count,
  }));
}

/**
 * Find the most recent item for an ASIN+marketplace pair in a date window.
 * Used to get representative productTitle/sku for snapshot creation.
 */
export async function findRepresentativeItem(
  prisma: PrismaClient,
  params: { asin: string; marketplace: string; from: Date; to: Date }
): Promise<Pick<AmazonOrderItem, "productTitle" | "sku"> | null> {
  return prisma.amazonOrderItem.findFirst({
    where: {
      amazonAccountId: getCurrentAccountId(),
      asin: params.asin,
      marketplace: params.marketplace,
      purchaseDate: { gte: params.from, lte: params.to },
    },
    select: { productTitle: true, sku: true },
    orderBy: { purchaseDate: "desc" },
  });
}

/**
 * Count distinct orders (by amazonOrderId) for one ASIN+marketplace pair in a
 * date window, excluding cancelled orders. Used by the daily snapshot job as a
 * cross-check against the item-level _count (an order can contain the same
 * ASIN more than once as separate line items).
 */
export async function countDistinctOrdersForSnapshot(
  prisma: PrismaClient,
  params: { asin: string; marketplace: string; from: Date; to: Date }
): Promise<number> {
  const accountId = getCurrentAccountId();
  const [row] = await prisma.$queryRaw<[{ distinctOrders: number }]>`
    SELECT COUNT(DISTINCT i."amazonOrderId")::INTEGER AS "distinctOrders"
    FROM "AmazonOrderItem" i
    JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
    WHERE i.asin = ${params.asin}
      AND i.marketplace = ${params.marketplace}
      AND i."purchaseDate" >= ${params.from}::timestamp
      AND i."purchaseDate" <= ${params.to}::timestamp
      AND o."orderStatus" NOT IN ('Canceled','Cancelled')
      AND i."amazonAccountId" = ${accountId}
  `;
  return row.distinctOrders;
}

/**
 * Group items by ASIN for the products endpoint.
 * Returns aggregated quantityOrdered, itemPrice, promotionDiscount.
 */
export async function groupAmazonItemsByAsin(
  prisma: PrismaClient,
  params: {
    purchaseDateRange: { gte?: Date; lte?: Date };
    marketplace?: string;
    search?: string;
    excludeNonAmazon?: boolean;
  }
): Promise<Array<{
  asin: string;
  _sum: { quantityOrdered: number | null; itemPrice: number | null; promotionDiscount: number | null };
  _count: { id: number };
}>> {
  const where: Prisma.AmazonOrderItemWhereInput = {
    amazonAccountId: getCurrentAccountId(),
    purchaseDate: params.purchaseDateRange,
    order: { salesChannel: { not: "Non-Amazon" } },
  };
  if (params.marketplace && params.marketplace !== "all") {
    where.marketplace = params.marketplace;
  }
  if (params.search) {
    where.OR = [
      { asin: { contains: params.search, mode: "insensitive" } },
      { sku:  { contains: params.search, mode: "insensitive" } },
      { productTitle: { contains: params.search, mode: "insensitive" } },
    ];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (prisma.amazonOrderItem.groupBy as any)({
    by: ["asin"],
    where,
    _sum: { quantityOrdered: true, itemPrice: true, promotionDiscount: true },
    _count: { id: true },
  })) as any[];
  return rows.map((r) => ({
    asin: r.asin,
    _sum: {
      quantityOrdered: r._sum.quantityOrdered,
      itemPrice: toNum(r._sum.itemPrice),
      promotionDiscount: toNum(r._sum.promotionDiscount),
    },
    _count: r._count,
  }));
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildOrderWhere(params: FindAmazonOrdersParams): Prisma.AmazonOrderWhereInput {
  const where: Prisma.AmazonOrderWhereInput = { amazonAccountId: getCurrentAccountId() };

  if (params.from || params.to) {
    where.purchaseDate = {};
    if (params.from) (where.purchaseDate as any).gte = params.from;
    if (params.to)   (where.purchaseDate as any).lte = params.to;
  }

  if (params.marketplace) {
    where.marketplace = params.marketplace;
  }

  if (params.excludeNonAmazon) {
    where.salesChannel = { not: "Non-Amazon" };
  }

  if (params.excludeCancelled) {
    where.orderStatus = { notIn: ["Canceled", "Cancelled"] };
  } else if (params.orderStatus) {
    where.orderStatus = params.orderStatus;
  }

  return where;
}
