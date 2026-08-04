import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../helpers/db";
import { runWithAccount } from "../../src/context/account-context";
import { seedProductsFromSku } from "../../src/scripts/seed-products-from-sku";
import { findAllProducts } from "../../src/repositories/amazon/product.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

describe("seedProductsFromSku", () => {
  it("groups ASINs sharing a SKU across marketplaces into one Product", async () => {
    await runWithAccount(accountId, async () => {
      const now = new Date();
      await db.prisma.amazonOrder.createMany({
        data: [
          { amazonAccountId: accountId, amazonOrderId: "O1", purchaseDate: now, lastUpdatedDate: now, orderStatus: "Shipped", marketplace: "IT" },
          { amazonAccountId: accountId, amazonOrderId: "O2", purchaseDate: now, lastUpdatedDate: now, orderStatus: "Shipped", marketplace: "DE" },
          { amazonAccountId: accountId, amazonOrderId: "O3", purchaseDate: now, lastUpdatedDate: now, orderStatus: "Shipped", marketplace: "IT" },
        ] as any,
      });

      await db.prisma.amazonOrderItem.createMany({
        data: [
          { amazonAccountId: accountId, amazonOrderId: "O1", orderItemId: "I1", asin: "B0ABC123", sku: "SKU-RSV-01", productTitle: "Resveratrolo", marketplace: "IT", purchaseDate: now },
          { amazonAccountId: accountId, amazonOrderId: "O2", orderItemId: "I2", asin: "B0DEF456", sku: "SKU-RSV-01", productTitle: "Resveratrolo", marketplace: "DE", purchaseDate: now },
          { amazonAccountId: accountId, amazonOrderId: "O3", orderItemId: "I3", asin: "B0XYZ789", sku: "SKU-MAG-02", productTitle: "Magnesio", marketplace: "IT", purchaseDate: now },
        ] as any,
      });

      const result = await seedProductsFromSku(db.prisma);
      expect(result.productsCreated).toBe(2);
      expect(result.identifiersCreated).toBe(3);

      const products = await findAllProducts(db.prisma);
      const rsv = products.find(p => p.identifiers.some(i => i.sku === "SKU-RSV-01"));
      expect(rsv?.identifiers).toHaveLength(2);
      const mag = products.find(p => p.identifiers.some(i => i.sku === "SKU-MAG-02"));
      expect(mag?.identifiers).toHaveLength(1);
    });
  });

  it("creates one Product per ASIN when sku is null", async () => {
    await runWithAccount(accountId, async () => {
      const now = new Date();
      await db.prisma.amazonOrder.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O4", purchaseDate: now, lastUpdatedDate: now, orderStatus: "Shipped", marketplace: "IT" } as any,
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O4", orderItemId: "I4", asin: "B0NOSKU", sku: null, productTitle: "No SKU Item", marketplace: "IT", purchaseDate: now } as any,
      });
      const result = await seedProductsFromSku(db.prisma);
      expect(result.productsCreated).toBe(1);
      expect(result.identifiersCreated).toBe(1);
    });
  });

  it("is idempotent — running twice does not duplicate identifiers", async () => {
    await runWithAccount(accountId, async () => {
      const now = new Date();
      await db.prisma.amazonOrder.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O5", purchaseDate: now, lastUpdatedDate: now, orderStatus: "Shipped", marketplace: "IT" } as any,
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O5", orderItemId: "I5", asin: "B0ABC123", sku: "SKU-RSV-01", productTitle: "Resveratrolo", marketplace: "IT", purchaseDate: now } as any,
      });
      await seedProductsFromSku(db.prisma);
      const second = await seedProductsFromSku(db.prisma);
      expect(second.identifiersCreated).toBe(0);

      const products = await findAllProducts(db.prisma);
      expect(products.flatMap(p => p.identifiers)).toHaveLength(1);
    });
  });
});
