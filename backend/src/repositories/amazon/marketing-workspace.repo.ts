import type { Prisma, PrismaClient } from "@prisma/client";
import { getCurrentAccountId } from "../../context/account-context";
import { italyDateString } from "../../amazon/utils/datetime";
import { toItalyDateColumnValue } from "./ad-spend.repo";

export interface DailyProductMetric {
  date: string;
  sales: number;
  units: number;
  ppcSales: number;
  ppcUnits: number;
  ppcSpend: number;
  impressions: number;
  clicks: number;
}

export async function findMarketingWorkspace(
  prisma: PrismaClient,
  productId: string,
  marketplace: string,
) {
  return prisma.amazonMarketingWorkspace.findUnique({
    where: {
      amazonAccountId_productId_marketplace: {
        amazonAccountId: getCurrentAccountId(), productId, marketplace,
      },
    },
  });
}

export async function upsertMarketingWorkspace(
  prisma: PrismaClient,
  params: {
    productId: string;
    marketplace: string;
    overview?: Prisma.InputJsonValue;
    communication?: Prisma.InputJsonValue;
    ped?: Prisma.InputJsonValue;
    workbook?: Prisma.InputJsonValue;
    assets?: Prisma.InputJsonValue;
    trafficData?: Prisma.InputJsonValue;
    lastSyncAt?: Date;
    lastSyncStatus?: string;
    lastSyncError?: string | null;
  },
) {
  const amazonAccountId = getCurrentAccountId();
  const data = {
    ...(params.overview !== undefined ? { overview: params.overview } : {}),
    ...(params.communication !== undefined ? { communication: params.communication } : {}),
    ...(params.ped !== undefined ? { ped: params.ped } : {}),
    ...(params.workbook !== undefined ? { workbook: params.workbook } : {}),
    ...(params.assets !== undefined ? { assets: params.assets } : {}),
    ...(params.trafficData !== undefined ? { trafficData: params.trafficData } : {}),
    ...(params.lastSyncAt !== undefined ? { lastSyncAt: params.lastSyncAt } : {}),
    ...(params.lastSyncStatus !== undefined ? { lastSyncStatus: params.lastSyncStatus } : {}),
    ...(params.lastSyncError !== undefined ? { lastSyncError: params.lastSyncError } : {}),
  };
  return prisma.amazonMarketingWorkspace.upsert({
    where: { amazonAccountId_productId_marketplace: { amazonAccountId, productId: params.productId, marketplace: params.marketplace } },
    create: { amazonAccountId, productId: params.productId, marketplace: params.marketplace, ...data },
    update: data,
  });
}

export async function listMarketingWorkspaces(prisma: PrismaClient) {
  return prisma.amazonMarketingWorkspace.findMany({
    where: { amazonAccountId: getCurrentAccountId() },
    select: { productId: true, marketplace: true },
  });
}

export async function findDailyProductMetrics(
  prisma: PrismaClient,
  params: { asin: string; marketplace: string; from: Date; to: Date },
): Promise<DailyProductMetric[]> {
  const amazonAccountId = getCurrentAccountId();
  const [items, ads] = await Promise.all([
    prisma.amazonOrderItem.findMany({
      where: {
        amazonAccountId, asin: params.asin, marketplace: params.marketplace,
        purchaseDate: { gte: params.from, lte: params.to },
        order: { orderStatus: { notIn: ["Canceled", "Cancelled"] } },
      },
      select: { purchaseDate: true, quantityOrdered: true, itemPrice: true, itemTax: true, promotionDiscount: true },
    }),
    prisma.amazonAdvertisedProductSnapshot.groupBy({
      by: ["snapshotDate"],
      where: {
        amazonAccountId, asin: params.asin, marketplace: params.marketplace,
        snapshotDate: { gte: toItalyDateColumnValue(params.from), lte: toItalyDateColumnValue(params.to) },
      },
      _sum: { sales: true, orders: true, units: true, spend: true, impressions: true, clicks: true },
    }),
  ]);

  const byDate = new Map<string, DailyProductMetric>();
  const row = (date: string) => {
    if (!byDate.has(date)) byDate.set(date, { date, sales: 0, units: 0, ppcSales: 0, ppcUnits: 0, ppcSpend: 0, impressions: 0, clicks: 0 });
    return byDate.get(date)!;
  };
  for (const item of items) {
    const target = row(italyDateString(item.purchaseDate));
    target.units += item.quantityOrdered;
    target.sales += Number(item.itemPrice) + Number(item.itemTax) - Number(item.promotionDiscount);
  }
  for (const ad of ads) {
    const target = row(italyDateString(ad.snapshotDate));
    target.ppcSales += Number(ad._sum.sales ?? 0);
    target.ppcUnits += ad._sum.units ?? 0;
    target.ppcSpend += Number(ad._sum.spend ?? 0);
    target.impressions += ad._sum.impressions ?? 0;
    target.clicks += ad._sum.clicks ?? 0;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
