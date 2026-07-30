// product-snapshots.repo.ts — Repository layer for AmazonProductSnapshot entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, AmazonProductSnapshot, Prisma } from "@prisma/client";
import { toNum } from "../../utils/decimal";

/** Same shape as AmazonProductSnapshot but with monetary fields as plain numbers. */
export type AmazonProductSnapshotDTO = Omit<
  AmazonProductSnapshot,
  "grossRevenue" | "refundedAmount" | "netRevenue" | "adSpend"
> & { grossRevenue: number; refundedAmount: number; netRevenue: number; adSpend: number };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpsertSnapshotParams {
  snapshotDate: Date;
  asin: string;
  sku: string | null;
  productTitle: string | null;
  marketplace: string;
  unitsSold: number;
  grossRevenue: number;
  netRevenue: number;
  orderCount: number;
}

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Find product snapshots for a given ASIN within a date range.
 * Ordered by snapshotDate ASC (for time series charts).
 */
export async function findProductSnapshotHistory(
  prisma: PrismaClient,
  params: { asin: string; from: Date; marketplace?: string }
): Promise<AmazonProductSnapshotDTO[]> {
  const where: Prisma.AmazonProductSnapshotWhereInput = {
    asin: params.asin,
    snapshotDate: { gte: params.from },
  };
  if (params.marketplace && params.marketplace !== "all") {
    where.marketplace = params.marketplace;
  }
  const rows = await prisma.amazonProductSnapshot.findMany({
    where,
    orderBy: { snapshotDate: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    grossRevenue: toNum(r.grossRevenue),
    refundedAmount: toNum(r.refundedAmount),
    netRevenue: toNum(r.netRevenue),
    adSpend: toNum(r.adSpend),
  }));
}

/**
 * Count all AmazonProductSnapshot rows (no filter). Used for DB stats / verification.
 */
export async function countAllAmazonProductSnapshots(prisma: PrismaClient): Promise<number> {
  return prisma.amazonProductSnapshot.count();
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Upsert a daily product snapshot (unique on snapshotDate + asin + marketplace).
 */
export async function upsertAmazonProductSnapshot(
  prisma: PrismaClient,
  params: UpsertSnapshotParams
): Promise<void> {
  await prisma.amazonProductSnapshot.upsert({
    where: {
      snapshotDate_asin_marketplace: {
        snapshotDate: params.snapshotDate,
        asin: params.asin,
        marketplace: params.marketplace,
      },
    },
    create: {
      snapshotDate:  params.snapshotDate,
      asin:          params.asin,
      sku:           params.sku ?? null,
      productTitle:  params.productTitle ?? "",
      marketplace:   params.marketplace,
      unitsSold:     params.unitsSold,
      grossRevenue:  params.grossRevenue,
      netRevenue:    params.netRevenue,
      orderCount:    params.orderCount,
    },
    update: {
      unitsSold:     params.unitsSold,
      grossRevenue:  params.grossRevenue,
      netRevenue:    params.netRevenue,
      orderCount:    params.orderCount,
      productTitle:  params.productTitle ?? undefined,
    },
  });
}
