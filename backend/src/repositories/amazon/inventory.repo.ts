// inventory.repo.ts — Repository layer for AmazonInventory entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient } from "@prisma/client";
import { getCurrentAccountId } from "../../context/account-context";

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
      amazonAccountId: getCurrentAccountId(),
      asin: { in: params.asins },
      ...(params.marketplace && params.marketplace !== "all" ? { marketplace: params.marketplace } : {}),
    },
    select: { asin: true, marketplace: true, qtyTotal: true },
  });
  return rows;
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
