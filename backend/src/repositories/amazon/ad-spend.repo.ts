// ad-spend.repo.ts — Repository layer for AmazonAdvertisedProductSnapshot.
// Populated by a background sync job (ads-sync.service.ts's
// syncAdvertisedProductDaily), read by the products/performance route.
// Never call the Amazon Ads API from here — this file only touches Prisma.
import type { PrismaClient } from "@prisma/client";
import { italyDateString } from "../../amazon/utils/datetime";
import { getCurrentAccountId } from "../../context/account-context";
import { toNum } from "../../utils/decimal";

/**
 * Convert an instant delimiting an Italy-local reporting period to the UTC
 * midnight Date Prisma expects for a PostgreSQL DATE column.
 *
 * `snapshotDate` has no time zone. Passing Italy midnight as an instant (for
 * example 2026-08-26T22:00Z for 27 August CEST) makes Prisma truncate it to
 * 26 August and includes the previous day's spend in the query.
 */
export function toItalyDateColumnValue(date: Date): Date {
  return new Date(`${italyDateString(date)}T00:00:00.000Z`);
}

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
 * Sums spend per ASIN *and marketplace* across the date range (and every
 * campaign), current account only. Used by the products/performance route to
 * build its ads spend map without ever calling the Amazon Ads API in the
 * request path.
 *
 * Grouping by marketplace as well as ASIN is load-bearing: the same ASIN is
 * routinely sold on several marketplaces, each one a distinct ProductIdentifier
 * row (unique on channelType+marketplace+asin). Grouping by ASIN alone returned
 * one combined figure that every identifier row for that ASIN then claimed as
 * its own, so the product aggregate summed the same spend once per marketplace
 * — inflating ad spend and corrupting every profit/margin/ROI/ACOS figure
 * derived from it.
 */
export async function findAdSpendForAsins(
  prisma: PrismaClient,
  params: { asins: string[]; marketplace?: string; dateFrom: Date; dateTo: Date }
): Promise<Array<{ asin: string; marketplace: string; spend: number }>> {
  if (params.asins.length === 0) return [];
  const snapshotDateFrom = toItalyDateColumnValue(params.dateFrom);
  const snapshotDateTo = toItalyDateColumnValue(params.dateTo);
  const rows = await prisma.amazonAdvertisedProductSnapshot.groupBy({
    by: ["asin", "marketplace"],
    where: {
      amazonAccountId: getCurrentAccountId(),
      asin: { in: params.asins },
      snapshotDate: { gte: snapshotDateFrom, lte: snapshotDateTo },
      ...(params.marketplace && params.marketplace !== "all" ? { marketplace: params.marketplace } : {}),
    },
    _sum: { spend: true },
  });
  return rows.map((r) => ({ asin: r.asin, marketplace: r.marketplace, spend: toNum(r._sum.spend ?? 0) }));
}
