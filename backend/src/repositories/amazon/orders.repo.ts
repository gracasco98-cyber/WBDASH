// orders.repo.ts — Repository layer for AmazonOrder + AmazonOrderItem entities.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, AmazonOrder, AmazonOrderItem, Prisma } from "@prisma/client";
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
