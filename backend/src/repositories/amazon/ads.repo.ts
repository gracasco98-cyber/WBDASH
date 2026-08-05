// ads.repo.ts — Repository layer for AmazonAdSnapshot, AmazonAdKeywordSnapshot,
//               AmazonAdSearchTerm, and AmazonAdKeyword entities.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
// Every operation is scoped to the current Amazon account (context/account-context.ts).
import type { PrismaClient, Prisma } from "@prisma/client";
import { toNum } from "../../utils/decimal";
import { getCurrentAccountId } from "../../context/account-context";

// ─── AmazonAdSnapshot — Read ──────────────────────────────────────────────────

/**
 * Count all AmazonAdSnapshot rows for the current account. Used for DB stats / verification.
 */
export async function countAllAdSnapshots(prisma: PrismaClient): Promise<number> {
  return prisma.amazonAdSnapshot.count({ where: { amazonAccountId: getCurrentAccountId() } });
}

/**
 * Earliest/latest snapshotDate across all AmazonAdSnapshot rows for the
 * current account. Used for DB stats / verification.
 */
export async function findAmazonAdSnapshotDateRange(
  prisma: PrismaClient
): Promise<{ min: Date | null; max: Date | null }> {
  const accountId = getCurrentAccountId();
  const [row] = await prisma.$queryRaw<[{ min: Date | null; max: Date | null }]>`
    SELECT MIN("snapshotDate") AS min, MAX("snapshotDate") AS max FROM "AmazonAdSnapshot" WHERE "amazonAccountId" = ${accountId}`;
  return row;
}

/**
 * Count ad snapshots matching the given date range and optional marketplace filter.
 * Used to detect whether data exists for a requested period (fallback logic).
 */
export async function countAdSnapshotsByDateRange(
  prisma: PrismaClient,
  params: { from: Date; to: Date; marketplace?: string }
): Promise<number> {
  return prisma.amazonAdSnapshot.count({
    where: {
      amazonAccountId: getCurrentAccountId(),
      snapshotDate: { gte: params.from, lte: params.to },
      ...(params.marketplace ? { marketplace: params.marketplace } : {}),
    },
  });
}

/**
 * Group ad snapshots by campaignId + marketplace for aggregated metrics, within the current account.
 * Used by GET /ppc and GET /ppc/products.
 */
export async function groupAdSnapshotsByCampaign(
  prisma: PrismaClient,
  params: {
    from: Date;
    to: Date;
    marketplace?: string;
  }
): Promise<Array<{
  campaignId: string;
  marketplace: string;
  _sum: { impressions: number | null; clicks: number | null; spend: number | null; sales: number | null; orders: number | null };
}>> {
  const where: Prisma.AmazonAdSnapshotWhereInput = {
    amazonAccountId: getCurrentAccountId(),
    snapshotDate: { gte: params.from, lte: params.to },
  };
  if (params.marketplace) where.marketplace = params.marketplace;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (prisma.amazonAdSnapshot.groupBy as any)({
    by: ["campaignId", "marketplace"],
    where,
    _sum: { impressions: true, clicks: true, spend: true, sales: true, orders: true },
  })) as any[];
  return rows.map((r) => ({
    campaignId: r.campaignId,
    marketplace: r.marketplace,
    _sum: {
      impressions: r._sum.impressions,
      clicks: r._sum.clicks,
      spend: toNum(r._sum.spend),
      sales: toNum(r._sum.sales),
      orders: r._sum.orders,
    },
  }));
}

// ─── AmazonAdSearchTerm ───────────────────────────────────────────────────────

/**
 * Delete all search term rows for the current account + a given marketplace + period.
 * Used before re-inserting fresh data (idempotent).
 */
export async function deleteAdSearchTerms(
  prisma: PrismaClient,
  params: { marketplace: string; dateFrom: Date; dateTo: Date }
): Promise<void> {
  await (prisma as any).amazonAdSearchTerm.deleteMany({
    where: {
      amazonAccountId: getCurrentAccountId(),
      marketplace: params.marketplace,
      dateFrom:    params.dateFrom,
      dateTo:      params.dateTo,
    },
  });
}

/**
 * Batch-insert ad search terms (skipDuplicates = true) for the current account.
 * Accepts the same data shape that routes.ts previously built inline.
 */
export async function createAdSearchTerms(
  prisma: PrismaClient,
  data: Array<{
    marketplace:  string;
    dateFrom:     Date;
    dateTo:       Date;
    query:        string;
    keywordText:  string | null;
    matchType:    string | null;
    campaignId:   string | null;
    campaignName: string | null;
    adGroupId:    string | null;
    impressions:  number;
    clicks:       number;
    spend:        number;
    sales:        number;
    orders:       number;
    acos:         number | null;
    roas:         number | null;
    ctr:          number;
    cpc:          number;
    isWasted:     boolean;
    syncedAt:     Date;
  }>
): Promise<number> {
  const amazonAccountId = getCurrentAccountId();
  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < data.length; i += BATCH) {
    const res = await (prisma as any).amazonAdSearchTerm.createMany({
      data: data.slice(i, i + BATCH).map((d) => ({ ...d, amazonAccountId })),
      skipDuplicates: true,
    });
    total += res.count;
  }
  return total;
}
