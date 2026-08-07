// cogs.repo.ts — Repository layer for AmazonProductCogs + AmazonCogsPriceEntry.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
// Every operation is scoped to the current Amazon account (context/account-context.ts).
import type { PrismaClient } from "@prisma/client";
import { toNum } from "../../utils/decimal";
import { getCurrentAccountId, getCurrentAccountIds } from "../../context/account-context";

/** Converts the Decimal-typed monetary fields on a raw COGS row to plain numbers. */
function normalizeCogsRow(row: any): any {
  if (!row) return row;
  return {
    ...row,
    cogsPerUnit: toNum(row.cogsPerUnit),
    shippingCost: toNum(row.shippingCost),
  };
}

/** Converts the Decimal-typed monetary fields on a raw price-entry row to plain numbers. */
function normalizePriceEntryRow(row: any): any {
  if (!row) return row;
  return {
    ...row,
    pricePerUnit: toNum(row.pricePerUnit),
    shippingCost: toNum(row.shippingCost),
  };
}

// ─── AmazonProductCogs ────────────────────────────────────────────────────────

/**
 * Find all COGS records for the current account, ordered by updatedAt DESC.
 */
export async function findAllCogs(prisma: PrismaClient): Promise<any[]> {
  const rows = await (prisma as any).amazonProductCogs.findMany({
    where: { amazonAccountId: getCurrentAccountId() },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(normalizeCogsRow);
}

/**
 * Find COGS records for a list of ASINs (current account only), optionally filtered by marketplace.
 * Returns both the requested marketplace and "ALL" records so the caller can
 * apply priority logic.
 */
export async function findCogsForAsins(
  prisma: PrismaClient,
  params: { asins: string[]; marketplace?: string }
): Promise<any[]> {
  const { asins, marketplace } = params;
  const rows = await (prisma as any).amazonProductCogs.findMany({
    where: {
      amazonAccountId: { in: getCurrentAccountIds() },
      asin: { in: asins },
      ...(marketplace && marketplace !== "all"
        ? { OR: [{ marketplace }, { marketplace: "ALL" }] }
        : {}),
    },
  });
  return rows.map(normalizeCogsRow);
}

/**
 * Find COGS records for the current account that have a non-null imageUrl (used for inventory enrichment).
 */
export async function findCogsImages(
  prisma: PrismaClient
): Promise<{ asin: string; imageUrl: string }[]> {
  return (prisma as any).amazonProductCogs.findMany({
    select: { asin: true, imageUrl: true },
    where: { amazonAccountId: getCurrentAccountId(), imageUrl: { not: null } },
  });
}

/**
 * All COGS records for the current account, optionally scoped to one
 * marketplace (also including "ALL"-marketplace records, same priority
 * convention as findCogsForAsins). Used by the inventory page to surface
 * products that have COGS configured but no inventory row yet.
 */
export async function findAllCogsProducts(
  prisma: PrismaClient,
  params: { marketplace?: string }
): Promise<any[]> {
  const rows = await (prisma as any).amazonProductCogs.findMany({
    where: params.marketplace
      ? { amazonAccountId: getCurrentAccountId(), OR: [{ marketplace: params.marketplace }, { marketplace: "ALL" }] }
      : { amazonAccountId: getCurrentAccountId() },
  });
  return rows.map(normalizeCogsRow);
}

/**
 * Upsert a single COGS record by asin+marketplace, scoped to the current account.
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
  const amazonAccountId = getCurrentAccountId();
  const row = await (prisma as any).amazonProductCogs.upsert({
    where: {
      amazonAccountId_asin_marketplace: { amazonAccountId, asin: params.asin, marketplace: params.marketplace },
    },
    create: {
      amazonAccountId,
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
  return normalizeCogsRow(row);
}

/**
 * Upsert only the imageUrl on a COGS record, scoped to the current account.
 * Creates a placeholder record if none exists. Fire-and-forget — errors are swallowed by the caller.
 */
export async function upsertCogsImageUrl(
  prisma: PrismaClient,
  asin: string,
  imageUrl: string
): Promise<void> {
  const amazonAccountId = getCurrentAccountId();
  await (prisma as any).amazonProductCogs.upsert({
    where: { amazonAccountId_asin_marketplace: { amazonAccountId, asin, marketplace: "ALL" } },
    create: { amazonAccountId, asin, marketplace: "ALL", imageUrl, cogsPerUnit: 0, shippingCost: 0, vatRate: 0 },
    update: { imageUrl },
  });
}

/**
 * Update cogsPerUnit (and optionally shippingCost) for all records matching an ASIN, current account only.
 * Used after deleting the most recent price entry to re-sync to previous.
 */
export async function updateCogsForAsin(
  prisma: PrismaClient,
  params: { asin: string; cogsPerUnit: number; shippingCost?: number }
): Promise<void> {
  await (prisma as any).amazonProductCogs.updateMany({
    where: { asin: params.asin, amazonAccountId: getCurrentAccountId() },
    data: {
      cogsPerUnit:  params.cogsPerUnit,
      ...(params.shippingCost !== undefined && { shippingCost: params.shippingCost }),
    },
  });
}

/**
 * Delete a COGS record by ID. `id` is the record's own primary key (globally
 * unique), so no account filter is needed here.
 */
export async function deleteCogs(prisma: PrismaClient, id: string): Promise<void> {
  await (prisma as any).amazonProductCogs.delete({ where: { id } });
}

// ─── AmazonCogsPriceEntry ─────────────────────────────────────────────────────

/**
 * Find all price history entries for the current account, optionally filtered by ASIN.
 * Ordered by asin ASC, purchaseDate DESC.
 */
export async function findPriceEntries(
  prisma: PrismaClient,
  params?: { asin?: string }
): Promise<any[]> {
  const where: Record<string, unknown> = { amazonAccountId: getCurrentAccountId() };
  if (params?.asin) where.asin = params.asin;
  const rows = await (prisma as any).amazonCogsPriceEntry.findMany({
    where,
    orderBy: [{ asin: "asc" }, { purchaseDate: "desc" }],
  });
  return rows.map(normalizePriceEntryRow);
}

/**
 * Find the most recent price entry for an ASIN, within the current account.
 * Returns null if no entries exist.
 */
export async function findMostRecentPriceEntry(
  prisma: PrismaClient,
  asin: string
): Promise<any | null> {
  const row = await (prisma as any).amazonCogsPriceEntry.findFirst({
    where: { asin, amazonAccountId: getCurrentAccountId() },
    orderBy: { purchaseDate: "desc" },
  });
  return normalizePriceEntryRow(row);
}

/**
 * Create a new price history entry for the current account.
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
  const row = await (prisma as any).amazonCogsPriceEntry.create({
    data: { ...data, amazonAccountId: getCurrentAccountId() },
  });
  return normalizePriceEntryRow(row);
}

/**
 * Update a price history entry by ID. `id` is the record's own primary key
 * (globally unique), so no account filter is needed here.
 */
export async function updatePriceEntry(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
): Promise<any> {
  const row = await (prisma as any).amazonCogsPriceEntry.update({ where: { id }, data });
  return normalizePriceEntryRow(row);
}

/**
 * Delete a price history entry by ID, returning the deleted record.
 * `id` is the record's own primary key (globally unique), so no account filter is needed here.
 */
export async function deletePriceEntry(prisma: PrismaClient, id: string): Promise<any> {
  const row = await (prisma as any).amazonCogsPriceEntry.delete({ where: { id } });
  return normalizePriceEntryRow(row);
}
