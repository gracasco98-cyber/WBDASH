// inventory.repo.ts — Repository layer for AmazonInventory entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient } from "@prisma/client";

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Upsert an inventory record by asin+sku+marketplace.
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
  return (prisma as any).amazonInventory.upsert({
    where: {
      asin_sku_marketplace: {
        asin: params.asin,
        sku:  params.sku ?? "",
        marketplace: params.marketplace,
      },
    },
    create: {
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
