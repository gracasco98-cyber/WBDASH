// line-items.repo.ts — Repository layer for OrderLineItem entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, OrderLineItem, Prisma } from "@prisma/client";
import { toNum } from "../../utils/decimal";

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
  const rows = (await (prisma.orderLineItem.groupBy as any)({
    by: ["shopifyProductId", "marketplace"],
    where,
    _sum: { quantity: true, lineTotal: true, refundedAmount: true, totalDiscount: true },
    _count: { id: true },
    _avg: { unitPrice: true },
  })) as any[];
  return rows.map((r) => ({
    shopifyProductId: r.shopifyProductId,
    marketplace: r.marketplace,
    _sum: {
      quantity: r._sum.quantity,
      lineTotal: toNum(r._sum.lineTotal),
      refundedAmount: toNum(r._sum.refundedAmount),
      totalDiscount: toNum(r._sum.totalDiscount),
    },
    _count: r._count,
    _avg: { unitPrice: toNum(r._avg.unitPrice) },
  }));
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (prisma.orderLineItem.groupBy as any)({
    by: ["shopifyProductId", "marketplace"],
    where: {
      orderDate: { gte: params.from, lte: params.to },
      order: { isTest: false },
    },
    _sum: {
      quantity: true,
      lineTotal: true,
      refundedAmount: true,
    },
    _count: { id: true },
  })) as any[];
  return rows.map((r) => ({
    shopifyProductId: r.shopifyProductId,
    marketplace: r.marketplace,
    _sum: {
      quantity: r._sum.quantity,
      lineTotal: toNum(r._sum.lineTotal),
      refundedAmount: toNum(r._sum.refundedAmount),
    },
    _count: r._count,
  }));
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
    // Product totals must use the same population as /api/products KPIs:
    // Shopify test orders are excluded from all business metrics.
    order: { isTest: false },
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
