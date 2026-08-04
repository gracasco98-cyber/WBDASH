// ad-spend.repo.ts — Repository layer for AmazonAdvertisedProductSnapshot.
// Populated by a background sync job (ads-sync.service.ts's
// syncAdvertisedProductDaily), read by the products/performance route.
// Never call the Amazon Ads API from here — this file only touches Prisma.
import type { PrismaClient } from "@prisma/client";
import { getCurrentAccountId } from "../../context/account-context";
import { toNum } from "../../utils/decimal";

export async function upsertAdvertisedProductSnapshot(
  prisma: PrismaClient,
  params: {
    snapshotDate: Date;
    marketplace: string;
    asin: string;
    campaignId: string;
    spend: number;
    sales: number;
    impressions: number;
    clicks: number;
    orders: number;
  }
): Promise<void> {
  const amazonAccountId = getCurrentAccountId();
  await prisma.amazonAdvertisedProductSnapshot.upsert({
    where: {
      amazonAccountId_snapshotDate_marketplace_asin_campaignId: {
        amazonAccountId,
        snapshotDate: params.snapshotDate,
        marketplace: params.marketplace,
        asin: params.asin,
        campaignId: params.campaignId,
      },
    },
    create: {
      amazonAccountId,
      snapshotDate: params.snapshotDate,
      marketplace: params.marketplace,
      asin: params.asin,
      campaignId: params.campaignId,
      spend: params.spend,
      sales: params.sales,
      impressions: params.impressions,
      clicks: params.clicks,
      orders: params.orders,
    },
    update: {
      spend: params.spend,
      sales: params.sales,
      impressions: params.impressions,
      clicks: params.clicks,
      orders: params.orders,
    },
  });
}

/**
 * Sums spend per ASIN across the date range (and every campaign), current
 * account only. Used by the products/performance route to build its ads
 * spend map without ever calling the Amazon Ads API in the request path.
 */
export async function findAdSpendForAsins(
  prisma: PrismaClient,
  params: { asins: string[]; marketplace?: string; dateFrom: Date; dateTo: Date }
): Promise<Array<{ asin: string; spend: number }>> {
  if (params.asins.length === 0) return [];
  const rows = await prisma.amazonAdvertisedProductSnapshot.groupBy({
    by: ["asin"],
    where: {
      amazonAccountId: getCurrentAccountId(),
      asin: { in: params.asins },
      snapshotDate: { gte: params.dateFrom, lte: params.dateTo },
      ...(params.marketplace && params.marketplace !== "all" ? { marketplace: params.marketplace } : {}),
    },
    _sum: { spend: true },
  });
  return rows.map((r) => ({ asin: r.asin, spend: toNum(r._sum.spend ?? 0) }));
}
