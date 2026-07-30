// orders.repo.ts — Repository layer for ShopifyOrder entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, ShopifyOrder, Prisma } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FindOrdersParams {
  /** Lower bound (inclusive). */
  from?: Date;
  /** Upper bound (inclusive). */
  to?: Date;
  /** Upper bound (exclusive) — used for "yesterday < todayStart" ranges. */
  before?: Date;
  marketplace?: string;
  financialStatus?: string;
  /** When true, adds `isTest = false` to the WHERE clause. */
  excludeTest?: boolean;
  skip?: number;
  take?: number;
}

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Return orders matching the given date range and optional filters.
 * Ordered by createdAt DESC.
 */
export async function findOrdersByDateRange(
  prisma: PrismaClient,
  params: FindOrdersParams
): Promise<ShopifyOrder[]> {
  const where = buildWhere(params);
  return prisma.shopifyOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: params.skip,
    take: params.take,
  });
}

/**
 * Count orders matching the given date range and optional filters.
 */
export async function countOrdersByDateRange(
  prisma: PrismaClient,
  params: FindOrdersParams
): Promise<number> {
  const where = buildWhere(params);
  return prisma.shopifyOrder.count({ where });
}

/**
 * Return orders for time-series usage — only the fields needed for bucketing.
 * Ordered by createdAt ASC (for chronological grouping).
 */
export async function findOrdersForTimeseries(
  prisma: PrismaClient,
  params: FindOrdersParams
): Promise<Pick<ShopifyOrder, "createdAt" | "totalAmount" | "marketplaceDetected">[]> {
  const where = buildWhere(params);
  return prisma.shopifyOrder.findMany({
    where,
    select: { createdAt: true, totalAmount: true, marketplaceDetected: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Find a single order by its Shopify GID (e.g. "gid://shopify/Order/12345").
 * Returns null if not found.
 */
export async function findOrderByShopifyId(
  prisma: PrismaClient,
  shopifyOrderId: string
): Promise<ShopifyOrder | null> {
  return prisma.shopifyOrder.findUnique({
    where: { shopifyOrderId },
  });
}

/**
 * Find a single order by its Shopify GID, returning only the fields needed
 * for SSE live-broadcast after a webhook.
 */
export async function findOrderForBroadcast(
  prisma: PrismaClient,
  shopifyOrderId: string
): Promise<Pick<ShopifyOrder, "orderName" | "totalAmount" | "marketplaceDetected" | "createdAt"> | null> {
  return prisma.shopifyOrder.findUnique({
    where: { shopifyOrderId },
    select: { orderName: true, totalAmount: true, marketplaceDetected: true, createdAt: true },
  });
}

/**
 * Return distinct marketplace values with their order count.
 * Used for populating marketplace filter dropdowns.
 */
export async function findDistinctMarketplaces(
  prisma: PrismaClient
): Promise<Array<{ marketplaceDetected: string; _count: true }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.shopifyOrder.groupBy as any)({
    by: ["marketplaceDetected"],
    _count: true,
    where: { isTest: false },
  });
}

/**
 * Find unclassified or all orders for re-classification.
 * Returns only the fields needed by detectMarketplace().
 */
export async function findOrdersForReclassification(
  prisma: PrismaClient,
  params: {
    onlyUnclassified: boolean;
    skip: number;
    take: number;
  }
): Promise<
  Pick<
    ShopifyOrder,
    "id" | "rawTags" | "sourceName" | "channelDisplayName" | "marketplaceDetected"
  >[]
> {
  return prisma.shopifyOrder.findMany({
    where: params.onlyUnclassified ? { marketplaceDetected: "UNCLASSIFIED" } : {},
    select: {
      id: true,
      rawTags: true,
      sourceName: true,
      channelDisplayName: true,
      marketplaceDetected: true,
    },
    skip: params.onlyUnclassified ? 0 : params.skip,
    take: params.take,
    orderBy: { createdAt: "asc" },
  });
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Upsert a Shopify order. Returns the persisted entity.
 */
export async function upsertShopifyOrder(
  prisma: PrismaClient,
  create: Prisma.ShopifyOrderCreateInput,
  update: Prisma.ShopifyOrderUpdateInput,
  shopifyOrderId: string
): Promise<ShopifyOrder> {
  return prisma.shopifyOrder.upsert({
    where: { shopifyOrderId },
    create,
    update,
  });
}

/**
 * Update the marketplace classification fields on a single order.
 */
export async function updateOrderMarketplace(
  prisma: PrismaClient,
  id: string,
  marketplace: string,
  reason: string | null
): Promise<ShopifyOrder> {
  return prisma.shopifyOrder.update({
    where: { id },
    data: {
      marketplaceDetected: marketplace,
      marketplaceDetectionReason: reason,
    },
  });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildWhere(params: FindOrdersParams): Prisma.ShopifyOrderWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (params.from)   createdAt.gte = params.from;
  if (params.to)     createdAt.lte = params.to;
  if (params.before) createdAt.lt  = params.before;

  const where: Prisma.ShopifyOrderWhereInput = {};
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
  if (params.excludeTest)                where.isTest    = false;
  if (params.marketplace)                where.marketplaceDetected = params.marketplace;
  if (params.financialStatus)            where.financialStatus     = params.financialStatus;

  return where;
}
