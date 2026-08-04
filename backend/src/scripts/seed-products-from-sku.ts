// seed-products-from-sku.ts — One-off seed: groups every distinct Amazon
// ASIN already seen in AmazonOrderItem into a Product, keyed by SKU. ASINs
// sharing a SKU across marketplaces land under the same Product; ASINs
// without a SKU each become their own Product. Idempotent (safe to re-run
// after new syncs bring in ASINs not seen before — it only creates
// identifiers that don't already exist).
// Run manually: npm run seed:products
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { createProduct, createIdentifier, findProductsByIdentifierSkus } from "../repositories/amazon/product.repo";

interface DistinctAsinRow {
  asin: string;
  sku: string | null;
  marketplace: string;
}

export async function seedProductsFromSku(
  db: PrismaClient
): Promise<{ productsCreated: number; identifiersCreated: number }> {
  const distinctRows = await db.$queryRaw<DistinctAsinRow[]>`
    SELECT DISTINCT ON (asin, marketplace) asin, sku, marketplace
    FROM "AmazonOrderItem"
    ORDER BY asin, marketplace, "purchaseDate" DESC
  `;

  const existingIdentifiers = await db.productIdentifier.findMany({
    where: { channelType: "AMAZON" },
    select: { asin: true, marketplace: true },
  });
  const existingKeys = new Set(existingIdentifiers.map((i) => `${i.marketplace}::${i.asin}`));

  const skusToGroup = [...new Set(distinctRows.map((r) => r.sku).filter((s): s is string => !!s))];
  const existingProductsBySku = await findProductsByIdentifierSkus(db, skusToGroup);
  const productIdBySku = new Map<string, string>();
  for (const p of existingProductsBySku) {
    for (const ident of p.identifiers) {
      if (ident.sku) productIdBySku.set(ident.sku, p.id);
    }
  }

  let productsCreated = 0;
  let identifiersCreated = 0;

  for (const row of distinctRows) {
    const key = `${row.marketplace}::${row.asin}`;
    if (existingKeys.has(key)) continue;

    let productId: string | undefined = row.sku ? productIdBySku.get(row.sku) : undefined;
    if (!productId) {
      const created = await createProduct(db, { name: row.asin });
      productId = created.id;
      productsCreated++;
      if (row.sku) productIdBySku.set(row.sku, productId);
    }

    await createIdentifier(db, {
      productId,
      channelType: "AMAZON",
      marketplace: row.marketplace,
      asin: row.asin,
      sku: row.sku,
    });
    identifiersCreated++;
    existingKeys.add(key);
  }

  return { productsCreated, identifiersCreated };
}

async function main(): Promise<void> {
  const result = await seedProductsFromSku(prisma);
  console.log(`[seed-products-from-sku] Created ${result.productsCreated} products, ${result.identifiersCreated} identifiers.`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[seed-products-from-sku] Failed:", err);
    process.exit(1);
  });
}
