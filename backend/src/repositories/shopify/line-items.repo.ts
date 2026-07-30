// line-items.repo.ts — Repository layer for OrderLineItem entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, OrderLineItem, Prisma } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineItemDateRangeParams {
  from: Date;
  to: Date;
  marketplace?: string;
  search?: string;
}

export interface LineItemGroupRow {
  shopifyProductId: string;
  marketplace: string;
  _sum: {
    quantity: number | null;
    lineTotal: number | null;
    refundedAmount: number | null;
    totalDiscount: number | null;
  };
  _count: { id: number };
  _avg: { unitPrice: number | null };
}

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Group line items by (shopifyProductId, marketplace) within a date range.
 * Returns aggregated sums/counts used for the product performance table.
 */
export async function groupLineItemsByProduct(
  prisma: PrismaClient,
  params: LineItemDateRangeParams
): Promise<LineItemGroupRow[]> {
  const where = buildLineItemWhere(params);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.orderLineItem.groupBy as any)({
    by: ["shopifyProductId", "marketplace"],
    where,
    _sum: { quantity: true, lineTotal: true, refundedAmount: true, totalDiscount: true },
    _count: { id: true },
    _avg: { unitPrice: true },
  }) as Promise<LineItemGroupRow[]>;
}

/**
 * Group line items by (shopifyProductId, marketplace) within a date range
 * for the daily snapshot computation.
 */
export async function groupLineItemsForSnapshot(
  prisma: PrismaClient,
  params: { from: Date; to: Date }
): Promise<
  Array<{
    shopifyProductId: string;
    marketplace: string;
    _sum: { quantity: number | null; lineTotal: number | null; refundedAmount: number | null };
    _count: { id: number };
  }>
> {
  return prisma.orderLineItem.groupBy({
    by: ["shopifyProductId", "marketplace"],
    where: {
      orderDate: { gte: params.from, lte: params.to },
    },
    _sum: {
      quantity: true,
      lineTotal: true,
      refundedAmount: true,
    },
    _count: { id: true },
  }) as Promise<any>;
}

/**
 * Get a representative sample row (productTitle, sku, imageUrl) for a
 * given product+marketplace, used when building product snapshots.
 */
export async function findLineItemSample(
  prisma: PrismaClient,
  params: {
    shopifyProductId: string;
    marketplace: string;
    from: Date;
    to: Date;
  }
): Promise<Pick<OrderLineItem, "productTitle" | "sku" | "imageUrl"> | null> {
  return prisma.orderLineItem.findFirst({
    where: {
      shopifyProductId: params.shopifyProductId,
      marketplace: params.marketplace,
      orderDate: { gte: params.from, lte: params.to },
    },
    select: { productTitle: true, sku: true, imageUrl: true },
    orderBy: { orderDate: "desc" },
  });
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Upsert a single line item.  Returns the persisted entity.
 * Uses unchecked input types to allow passing `orderId` directly
 * instead of a nested relation object.
 */
export async function upsertLineItem(
  prisma: PrismaClient,
  shopifyLineItemId: string,
  create: Prisma.OrderLineItemUncheckedCreateInput,
  update: Prisma.OrderLineItemUncheckedUpdateInput
): Promise<OrderLineItem> {
  return prisma.orderLineItem.upsert({
    where: { shopifyLineItemId },
    create,
    update,
  });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildLineItemWhere(
  params: LineItemDateRangeParams
): Prisma.OrderLineItemWhereInput {
  const where: Prisma.OrderLineItemWhereInput = {
    orderDate: { gte: params.from, lte: params.to },
  };

  if (params.marketplace) where.marketplace = params.marketplace;

  if (params.search) {
    where.OR = [
      { productTitle: { contains: params.search, mode: "insensitive" } },
      { sku:          { contains: params.search, mode: "insensitive" } },
      { shopifyProductId: { contains: params.search, mode: "insensitive" } },
    ];
  }

  return where;
}
