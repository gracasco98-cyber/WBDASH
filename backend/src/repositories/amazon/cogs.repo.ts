// cogs.repo.ts — Repository layer for AmazonProductCogs + AmazonCogsPriceEntry.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient } from "@prisma/client";

// ─── AmazonProductCogs ────────────────────────────────────────────────────────

/**
 * Find all COGS records, ordered by updatedAt DESC.
 */
export async function findAllCogs(prisma: PrismaClient): Promise<any[]> {
  return (prisma as any).amazonProductCogs.findMany({ orderBy: { updatedAt: "desc" } });
}

/**
 * Find COGS records for a list of ASINs, optionally filtered by marketplace.
 * Returns both the requested marketplace and "ALL" records so the caller can
 * apply priority logic.
 */
export async function findCogsForAsins(
  prisma: PrismaClient,
  params: { asins: string[]; marketplace?: string }
): Promise<any[]> {
  const { asins, marketplace } = params;
  return (prisma as any).amazonProductCogs.findMany({
    where: {
      asin: { in: asins },
      OR: (marketplace && marketplace !== "all")
        ? [{ marketplace }, { marketplace: "ALL" }]
        : [{ marketplace: "IT" }, { marketplace: "ALL" }],
    },
  });
}

/**
 * Find COGS records that have a non-null imageUrl (used for inventory enrichment).
 */
export async function findCogsImages(
  prisma: PrismaClient
): Promise<{ asin: string; imageUrl: string }[]> {
  return (prisma as any).amazonProductCogs.findMany({
    select: { asin: true, imageUrl: true },
    where: { imageUrl: { not: null } },
  });
}

/**
 * Upsert a single COGS record by asin+marketplace.
 * Used by POST /cogs, POST /cogs/bulk, and the catalog image cache.
 */
export async function upsertCogs(
  prisma: PrismaClient,
  params: {
    asin: string;
    marketplace: string;
    cogsPerUnit: number;
    shippingCost?: number;
    vatRate?: number;
    vatCategory?: string | null;
    currency?: string;
    notes?: string | null;
    sku?: string | null;
    productTitle?: string | null;
    imageUrl?: string | null;
  }
): Promise<any> {
  return (prisma as any).amazonProductCogs.upsert({
    where: { asin_marketplace: { asin: params.asin, marketplace: params.marketplace } },
    create: {
      asin:         params.asin,
      marketplace:  params.marketplace,
      cogsPerUnit:  params.cogsPerUnit,
      shippingCost: params.shippingCost ?? 0,
      vatRate:      params.vatRate ?? 0,
      vatCategory:  params.vatCategory ?? null,
      currency:     params.currency ?? "EUR",
      notes:        params.notes ?? null,
      sku:          params.sku ?? null,
      productTitle: params.productTitle ?? null,
      imageUrl:     params.imageUrl ?? null,
    },
    update: {
      cogsPerUnit:  params.cogsPerUnit,
      shippingCost: params.shippingCost ?? undefined,
      vatRate:      params.vatRate ?? undefined,
      vatCategory:  params.vatCategory,
      currency:     params.currency,
      notes:        params.notes,
      sku:          params.sku,
      productTitle: params.productTitle,
      imageUrl:     params.imageUrl,
    },
  });
}

/**
 * Upsert only the imageUrl on a COGS record. Creates a placeholder record if none exists.
 * Fire-and-forget — errors are swallowed by the caller.
 */
export async function upsertCogsImageUrl(
  prisma: PrismaClient,
  asin: string,
  imageUrl: string
): Promise<void> {
  await (prisma as any).amazonProductCogs.upsert({
    where: { asin_marketplace: { asin, marketplace: "ALL" } },
    create: { asin, marketplace: "ALL", imageUrl, cogsPerUnit: 0, shippingCost: 0, vatRate: 0 },
    update: { imageUrl },
  });
}

/**
 * Update cogsPerUnit (and optionally shippingCost) for all records matching an ASIN.
 * Used after deleting the most recent price entry to re-sync to previous.
 */
export async function updateCogsForAsin(
  prisma: PrismaClient,
  params: { asin: string; cogsPerUnit: number; shippingCost?: number }
): Promise<void> {
  await (prisma as any).amazonProductCogs.updateMany({
    where: { asin: params.asin },
    data: {
      cogsPerUnit:  params.cogsPerUnit,
      ...(params.shippingCost !== undefined && { shippingCost: params.shippingCost }),
    },
  });
}

/**
 * Delete a COGS record by ID.
 */
export async function deleteCogs(prisma: PrismaClient, id: string): Promise<void> {
  await (prisma as any).amazonProductCogs.delete({ where: { id } });
}

// ─── AmazonCogsPriceEntry ─────────────────────────────────────────────────────

/**
 * Find all price history entries, optionally filtered by ASIN.
 * Ordered by asin ASC, purchaseDate DESC.
 */
export async function findPriceEntries(
  prisma: PrismaClient,
  params?: { asin?: string }
): Promise<any[]> {
  const where = params?.asin ? { asin: params.asin } : {};
  return (prisma as any).amazonCogsPriceEntry.findMany({
    where,
    orderBy: [{ asin: "asc" }, { purchaseDate: "desc" }],
  });
}

/**
 * Find the most recent price entry for an ASIN.
 * Returns null if no entries exist.
 */
export async function findMostRecentPriceEntry(
  prisma: PrismaClient,
  asin: string
): Promise<any | null> {
  return (prisma as any).amazonCogsPriceEntry.findFirst({
    where: { asin },
    orderBy: { purchaseDate: "desc" },
  });
}

/**
 * Create a new price history entry.
 */
export async function createPriceEntry(
  prisma: PrismaClient,
  data: {
    asin: string;
    sku?: string | null;
    productTitle?: string | null;
    imageUrl?: string | null;
    marketplace: string;
    supplier?: string | null;
    purchaseDate: Date;
    pricePerUnit: number;
    shippingCost: number;
    quantity?: number | null;
    notes?: string | null;
    currency: string;
  }
): Promise<any> {
  return (prisma as any).amazonCogsPriceEntry.create({ data });
}

/**
 * Update a price history entry by ID.
 */
export async function updatePriceEntry(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
): Promise<any> {
  return (prisma as any).amazonCogsPriceEntry.update({ where: { id }, data });
}

/**
 * Delete a price history entry by ID, returning the deleted record.
 */
export async function deletePriceEntry(prisma: PrismaClient, id: string): Promise<any> {
  return (prisma as any).amazonCogsPriceEntry.delete({ where: { id } });
}
