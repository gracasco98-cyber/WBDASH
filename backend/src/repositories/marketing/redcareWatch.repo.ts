// redcareWatch.repo.ts — Repository layer for MarketingKeywordWatch/Snapshot.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, MarketingKeywordWatch, MarketingKeywordSnapshot } from "@prisma/client";

export interface CreateOrReactivateWatchInput {
  market: string;
  keyword: string;
  ean: string;
  label: string | null;
  isOwn: boolean;
}

export async function createOrReactivateWatch(
  prisma: PrismaClient,
  data: CreateOrReactivateWatchInput
): Promise<MarketingKeywordWatch> {
  return prisma.marketingKeywordWatch.upsert({
    where: { market_keyword_ean: { market: data.market, keyword: data.keyword, ean: data.ean } },
    create: { market: data.market, keyword: data.keyword, ean: data.ean, label: data.label, isOwn: data.isOwn, active: true },
    update: { active: true, label: data.label, isOwn: data.isOwn },
  });
}

export async function findActiveWatches(
  prisma: PrismaClient,
  filter?: { market?: string; keyword?: string }
): Promise<MarketingKeywordWatch[]> {
  return prisma.marketingKeywordWatch.findMany({
    where: {
      active: true,
      ...(filter?.market ? { market: filter.market } : {}),
      ...(filter?.keyword ? { keyword: filter.keyword } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function deactivateWatch(prisma: PrismaClient, id: string): Promise<MarketingKeywordWatch> {
  return prisma.marketingKeywordWatch.update({ where: { id }, data: { active: false } });
}

export interface CreateSnapshotInput {
  watchId: string;
  found: boolean;
  position: number | null;
  nbHits: number;
  price: number | null;
  sellerName: string | null;
  productName: string | null;
  promoted: boolean | null;
  promotedByReRanking: boolean | null;
}

export async function createSnapshot(prisma: PrismaClient, data: CreateSnapshotInput): Promise<MarketingKeywordSnapshot> {
  return prisma.marketingKeywordSnapshot.create({ data });
}

export async function findLatestSnapshot(prisma: PrismaClient, watchId: string): Promise<MarketingKeywordSnapshot | null> {
  return prisma.marketingKeywordSnapshot.findFirst({ where: { watchId }, orderBy: { checkedAt: "desc" } });
}

export async function findSnapshotHistory(
  prisma: PrismaClient,
  watchId: string,
  since: Date
): Promise<MarketingKeywordSnapshot[]> {
  return prisma.marketingKeywordSnapshot.findMany({
    where: { watchId, checkedAt: { gte: since } },
    orderBy: { checkedAt: "asc" },
  });
}
