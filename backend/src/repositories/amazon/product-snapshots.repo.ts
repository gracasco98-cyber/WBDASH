// product-snapshots.repo.ts — Repository layer for AmazonProductSnapshot entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, AmazonProductSnapshot, Prisma } from "@prisma/client";
import { toNum } from "../../utils/decimal";
import { getCurrentAccountId } from "../../context/account-context";

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
    amazonAccountId: getCurrentAccountId(),
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
  return prisma.amazonProductSnapshot.count({ where: { amazonAccountId: getCurrentAccountId() } });
}

/**
 * Earliest/latest snapshotDate across all AmazonProductSnapshot rows for the
 * current account. Used for DB stats / verification.
 */
export async function findAmazonProductSnapshotDateRange(
  prisma: PrismaClient
): Promise<{ min: Date | null; max: Date | null }> {
  const accountId = getCurrentAccountId();
  const [row] = await prisma.$queryRaw<[{ min: Date | null; max: Date | null }]>`
    SELECT MIN("snapshotDate") AS min, MAX("snapshotDate") AS max FROM "AmazonProductSnapshot" WHERE "amazonAccountId" = ${accountId}`;
  return row;
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Upsert a daily product snapshot (unique on snapshotDate + asin + marketplace).
 */
export async function upsertAmazonProductSnapshot(
  prisma: PrismaClient,
  params: UpsertSnapshotParams
): Promise<void> {
  const amazonAccountId = getCurrentAccountId();
  await prisma.amazonProductSnapshot.upsert({
    where: {
      amazonAccountId_snapshotDate_asin_marketplace: {
        amazonAccountId,
        snapshotDate: params.snapshotDate,
        asin: params.asin,
        marketplace: params.marketplace,
      },
    },
    create: {
      amazonAccountId,
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
