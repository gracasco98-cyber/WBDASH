// inventory.repo.ts — Repository layer for AmazonInventory entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient } from "@prisma/client";
import { getCurrentAccountId, getCurrentAccountIds } from "../../context/account-context";

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Current stock (qtyTotal) per asin+marketplace, for the given ASINs, current account only.
 */
export async function findInventoryForAsins(
  prisma: PrismaClient,
  params: { asins: string[]; marketplace?: string }
): Promise<Array<{ asin: string; marketplace: string; qtyTotal: number }>> {
  if (params.asins.length === 0) return [];
  const rows = await prisma.amazonInventory.findMany({
    where: {
      amazonAccountId: { in: getCurrentAccountIds() },
      asin: { in: params.asins },
      ...(params.marketplace && params.marketplace !== "all" ? { marketplace: params.marketplace } : {}),
    },
    select: { asin: true, marketplace: true, qtyTotal: true },
  });
  return rows;
}

/**
 * All inventory rows for the current account, optionally scoped to one
 * marketplace, sorted by days-remaining then quantity (most urgent first).
 * Used by the /inventory dashboard page.
 */
export async function findAllInventory(
  prisma: PrismaClient,
  params: { marketplace?: string }
): Promise<any[]> {
  return (prisma as any).amazonInventory.findMany({
    where: {
      amazonAccountId: getCurrentAccountId(),
      ...(params.marketplace ? { marketplace: params.marketplace } : {}),
    },
    orderBy: [{ daysRemaining: "asc" }, { qtyTotal: "asc" }],
  });
}

export interface AsinVelocity {
  asin: string;
  dailyVelocity: number;
}

/**
 * Daily sales velocity (units/day, 30-day-window average) per ASIN, for the
 * current account, excluding cancelled orders. `since` is the window start;
 * the window length (used as the averaging divisor) is passed separately so
 * callers stay explicit about it rather than the function assuming 30 days.
 */
export async function computeSalesVelocityByAsin(
  prisma: PrismaClient,
  params: { since: Date; windowDays: number; marketplace?: string }
): Promise<AsinVelocity[]> {
  const accountId = getCurrentAccountId();
  const mpFilter = params.marketplace ? ` AND o.marketplace = '${params.marketplace.replace(/'/g, "")}'` : "";
  return prisma.$queryRawUnsafe<AsinVelocity[]>(`
    SELECT
      i.asin,
      COALESCE(SUM(i."quantityOrdered"), 0)::FLOAT8 / ${params.windowDays}.0 AS "dailyVelocity"
    FROM "AmazonOrderItem" i
    JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
    WHERE i."purchaseDate" >= '${params.since.toISOString()}'::timestamp
      AND o."orderStatus" NOT IN ('Canceled','Cancelled')
      AND i."amazonAccountId" = '${accountId}'
      ${mpFilter}
    GROUP BY i.asin
  `);
}

export interface AsinMarketVelocity {
  asin: string;
  market: string;
  dailyVelocity: number;
}

/**
 * Daily sales velocity per ASIN, broken down by (approximated) marketplace
 * from the Shopify-style salesChannel string — used for the PAN-EU FBA
 * inventory view, which needs a combined-EU total plus a per-market split.
 * Excludes cancelled orders and the Non-Amazon channel.
 */
export async function computeCombinedEuVelocity(
  prisma: PrismaClient,
  params: { since: Date; windowDays: number }
): Promise<AsinMarketVelocity[]> {
  const accountId = getCurrentAccountId();
  return prisma.$queryRawUnsafe<AsinMarketVelocity[]>(`
    SELECT
      i.asin,
      CASE
        WHEN o."salesChannel" ILIKE '%amazon.it%' THEN 'IT'
        WHEN o."salesChannel" ILIKE '%amazon.de%' THEN 'DE'
        WHEN o."salesChannel" ILIKE '%amazon.fr%' THEN 'FR'
        WHEN o."salesChannel" ILIKE '%amazon.es%' THEN 'ES'
        ELSE 'OTHER'
      END AS market,
      COALESCE(SUM(i."quantityOrdered"), 0)::FLOAT8 / ${params.windowDays}.0 AS "dailyVelocity"
    FROM "AmazonOrderItem" i
    JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
    WHERE i."purchaseDate" >= '${params.since.toISOString()}'::timestamp
      AND o."orderStatus" NOT IN ('Canceled','Cancelled')
      AND o."salesChannel" != 'Non-Amazon'
      AND i."amazonAccountId" = '${accountId}'
    GROUP BY i.asin, market
  `);
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Upsert an inventory record by asin+sku+marketplace, scoped to the current account.
 */
export async function upsertAmazonInventory(
  prisma: PrismaClient,
  params: {
    asin: string;
    sku?: string | null;
    marketplace: string;
    productTitle?: string | null;
    imageUrl?: string | null;
    qtyAfn: number;
    qtyMfn: number;
    qtyInbound: number;
    qtyReserved: number;
    qtyTotal: number;
    reorderPoint: number;
    reorderQty: number;
    leadTimeDays: number;
  }
): Promise<any> {
  const amazonAccountId = getCurrentAccountId();
  return (prisma as any).amazonInventory.upsert({
    where: {
      amazonAccountId_asin_sku_marketplace: {
        amazonAccountId,
        asin: params.asin,
        sku:  params.sku ?? "",
        marketplace: params.marketplace,
      },
    },
    create: {
      amazonAccountId,
      asin:          params.asin,
      sku:           params.sku ?? null,
      marketplace:   params.marketplace,
      productTitle:  params.productTitle ?? null,
      imageUrl:      params.imageUrl ?? null,
      qtyAfn:        params.qtyAfn,
      qtyMfn:        params.qtyMfn,
      qtyInbound:    params.qtyInbound,
      qtyReserved:   params.qtyReserved,
      qtyTotal:      params.qtyTotal,
      reorderPoint:  params.reorderPoint,
      reorderQty:    params.reorderQty,
      leadTimeDays:  params.leadTimeDays,
      lastSyncedAt:  new Date(),
    },
    update: {
      productTitle:  params.productTitle ?? undefined,
      imageUrl:      params.imageUrl ?? undefined,
      qtyAfn:        params.qtyAfn,
      qtyMfn:        params.qtyMfn,
      qtyInbound:    params.qtyInbound,
      qtyReserved:   params.qtyReserved,
      qtyTotal:      params.qtyTotal,
      reorderPoint:  params.reorderPoint,
      reorderQty:    params.reorderQty,
      leadTimeDays:  params.leadTimeDays,
      lastSyncedAt:  new Date(),
    },
  });
}
