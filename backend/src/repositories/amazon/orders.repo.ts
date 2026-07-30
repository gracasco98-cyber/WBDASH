// orders.repo.ts — Repository layer for AmazonOrder + AmazonOrderItem entities.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, AmazonOrder, AmazonOrderItem, Prisma } from "@prisma/client";

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
  return prisma.amazonOrder.count();
}

/**
 * Group orders by marketplace with count. Used for DB stats marketplace breakdown.
 */
export async function groupAmazonOrdersByMarketplace(
  prisma: PrismaClient
): Promise<{ marketplace: string; _count: number }[]> {
  const groups = await prisma.amazonOrder.groupBy({
    by: ["marketplace"],
    _count: true,
    orderBy: { _count: { marketplace: "desc" } },
  });
  return groups.map(g => ({ marketplace: g.marketplace, _count: g._count }));
}

// ─── Read operations — AmazonOrderItem ────────────────────────────────────────

/**
 * Count all AmazonOrderItem rows (no filter). Used for DB stats / verification.
 */
export async function countAllAmazonOrderItems(prisma: PrismaClient): Promise<number> {
  return prisma.amazonOrderItem.count();
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
  return prisma.amazonOrderItem.groupBy({
    by: ["asin", "marketplace"],
    where: {
      purchaseDate: { gte: params.from, lte: params.to },
      order: { orderStatus: { notIn: ["Canceled", "Cancelled"] } },
    },
    _sum: {
      quantityOrdered: true,
      itemPrice: true,
    },
    _count: { id: true },
  }) as any;
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
      asin: params.asin,
      marketplace: params.marketplace,
      purchaseDate: { gte: params.from, lte: params.to },
    },
    select: { productTitle: true, sku: true },
    orderBy: { purchaseDate: "desc" },
  });
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
  return prisma.amazonOrderItem.groupBy({
    by: ["asin"],
    where,
    _sum: { quantityOrdered: true, itemPrice: true, promotionDiscount: true },
    _count: { id: true },
  }) as any;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildOrderWhere(params: FindAmazonOrdersParams): Prisma.AmazonOrderWhereInput {
  const where: Prisma.AmazonOrderWhereInput = {};

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
