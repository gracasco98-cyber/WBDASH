// product-snapshots.repo.ts — Repository layer for ProductDailySnapshot entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, ProductDailySnapshot, Prisma } from "@prisma/client";
import { toNum } from "../../utils/decimal";

// ─── Read operations ──────────────────────────────────────────────────────────

/** Same shape as ProductDailySnapshot but with monetary fields as plain numbers. */
export type ProductDailySnapshotDTO = Omit<
  ProductDailySnapshot,
  "grossRevenue" | "refundedAmount" | "netRevenue"
> & { grossRevenue: number; refundedAmount: number; netRevenue: number };

/**
 * Return daily snapshots for a product within a date range.
 * Ordered by snapshotDate ASC for charting.
 */
export async function findSnapshotsByProductId(
  prisma: PrismaClient,
  params: {
    shopifyProductId: string;
    from: Date;
    marketplace?: string;
  }
): Promise<ProductDailySnapshotDTO[]> {
  const where: Prisma.ProductDailySnapshotWhereInput = {
    shopifyProductId: params.shopifyProductId,
    snapshotDate: { gte: params.from },
  };
  if (params.marketplace) where.marketplace = params.marketplace;

  const rows = await prisma.productDailySnapshot.findMany({
    where,
    orderBy: { snapshotDate: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    grossRevenue: toNum(r.grossRevenue),
    refundedAmount: toNum(r.refundedAmount),
    netRevenue: toNum(r.netRevenue),
  }));
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Upsert a daily snapshot for a product+marketplace+date combination.
 */
export async function upsertProductSnapshot(
  prisma: PrismaClient,
  params: {
    snapshotDate: Date;
    shopifyProductId: string;
    marketplace: string;
    create: Prisma.ProductDailySnapshotCreateInput;
    update: Prisma.ProductDailySnapshotUpdateInput;
  }
): Promise<ProductDailySnapshot> {
  return prisma.productDailySnapshot.upsert({
    where: {
      snapshotDate_shopifyProductId_marketplace: {
        snapshotDate:    params.snapshotDate,
        shopifyProductId: params.shopifyProductId,
        marketplace:      params.marketplace,
      },
    },
    create: params.create,
    update: params.update,
  });
}
