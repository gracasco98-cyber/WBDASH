// product.repo.ts — Repository layer for Product + ProductIdentifier.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here beyond the archive-when-emptied rule, which is a data-integrity
// invariant of moveIdentifier, not business logic that belongs in a service layer.
import type { PrismaClient } from "@prisma/client";

export interface ProductIdentifierRow {
  id: string;
  productId: string;
  channelType: "AMAZON" | "SHOPIFY";
  marketplace: string;
  asin: string | null;
  sku: string | null;
  /** Sales VAT rate as a percentage (e.g. 22), manually entered. Informational
   *  for Amazon — the dashboard VAT tile uses real AmazonOrderItem.itemTax. */
  vatRate: number | null;
}

export interface ProductWithIdentifiers {
  id: string;
  name: string;
  brand: string | null;
  status: "ACTIVE" | "ARCHIVED";
  identifiers: ProductIdentifierRow[];
}

function toProductWithIdentifiers(row: any): ProductWithIdentifiers {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand ?? null,
    status: row.status,
    identifiers: (row.identifiers ?? []).map((i: any) => ({
      id: i.id,
      productId: i.productId,
      channelType: i.channelType,
      marketplace: i.marketplace,
      asin: i.asin,
      sku: i.sku,
      vatRate: i.vatRate !== null && i.vatRate !== undefined ? Number(i.vatRate) : null,
    })),
  };
}

export async function findAllProducts(
  prisma: PrismaClient,
  params?: { status?: "ACTIVE" | "ARCHIVED" }
): Promise<ProductWithIdentifiers[]> {
  const rows = await prisma.product.findMany({
    where: params?.status ? { status: params.status } : undefined,
    include: { identifiers: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toProductWithIdentifiers);
}

export async function findProductById(
  prisma: PrismaClient,
  id: string
): Promise<ProductWithIdentifiers | null> {
  const row = await prisma.product.findUnique({
    where: { id },
    include: { identifiers: true },
  });
  return row ? toProductWithIdentifiers(row) : null;
}

/** Products that have at least one identifier matching any of the given SKUs. */
export async function findProductsByIdentifierSkus(
  prisma: PrismaClient,
  skus: string[]
): Promise<ProductWithIdentifiers[]> {
  if (skus.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { identifiers: { some: { sku: { in: skus } } } },
    include: { identifiers: true },
  });
  return rows.map(toProductWithIdentifiers);
}

export async function createProduct(
  prisma: PrismaClient,
  params: { name: string; brand?: string | null }
): Promise<ProductWithIdentifiers> {
  const row = await prisma.product.create({
    data: { name: params.name, brand: params.brand ?? null },
    include: { identifiers: true },
  });
  return toProductWithIdentifiers(row);
}

export async function createIdentifier(
  prisma: PrismaClient,
  params: {
    productId: string;
    channelType: "AMAZON" | "SHOPIFY";
    marketplace: string;
    asin?: string | null;
    sku?: string | null;
  }
): Promise<ProductIdentifierRow> {
  const row = await prisma.productIdentifier.create({
    data: {
      productId: params.productId,
      channelType: params.channelType,
      marketplace: params.marketplace,
      asin: params.asin ?? null,
      sku: params.sku ?? null,
    },
  });
  return { ...row, vatRate: row.vatRate !== null ? Number(row.vatRate) : null };
}

/** Sets (or clears, with `vatRate: null`) the sales VAT rate on an identifier. */
export async function updateIdentifierVatRate(
  prisma: PrismaClient,
  params: { identifierId: string; vatRate: number | null }
): Promise<void> {
  await prisma.productIdentifier.update({
    where: { id: params.identifierId },
    data: { vatRate: params.vatRate },
  });
}

/**
 * Reassigns an identifier to a different product. If the source product is
 * left with zero identifiers, it is archived (soft delete — CLAUDE.md
 * principle 16), never deleted.
 */
export async function moveIdentifier(
  prisma: PrismaClient,
  params: { identifierId: string; targetProductId: string }
): Promise<void> {
  const identifier = await prisma.productIdentifier.findUniqueOrThrow({
    where: { id: params.identifierId },
  });
  const sourceProductId = identifier.productId;

  await prisma.$transaction(async (tx) => {
    await tx.productIdentifier.update({
      where: { id: params.identifierId },
      data: { productId: params.targetProductId },
    });

    const remaining = await tx.productIdentifier.count({
      where: { productId: sourceProductId },
    });
    if (remaining === 0) {
      await tx.product.update({
        where: { id: sourceProductId },
        data: { status: "ARCHIVED" },
      });
    }
  });
}

export async function renameProduct(
  prisma: PrismaClient,
  params: { productId: string; name: string }
): Promise<void> {
  await prisma.product.update({
    where: { id: params.productId },
    data: { name: params.name },
  });
}

/** Existing Amazon identifier keys (marketplace::asin), for the seed script's idempotency check. */
export async function findExistingAmazonIdentifierKeys(
  prisma: PrismaClient
): Promise<Set<string>> {
  const rows = await prisma.productIdentifier.findMany({
    where: { channelType: "AMAZON" },
    select: { asin: true, marketplace: true },
  });
  return new Set(rows.map((r) => `${r.marketplace}::${r.asin}`));
}
