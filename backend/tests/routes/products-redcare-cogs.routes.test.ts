import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createTestAmazonAccount, setupTestDb, truncateAll, type TestDb } from "../helpers/db";
import { runWithAccount } from "../../src/context/account-context";
import { createIdentifier, createProduct } from "../../src/repositories/amazon/product.repo";
import { upsertCogs } from "../../src/repositories/amazon/cogs.repo";

let db: TestDb;
let accountId: string;
let app: express.Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { default: productsRouter } = await import("../../src/routes/products.routes");
  app = express();
  app.use((req, _res, next) => runWithAccount(accountId, () => next()));
  app.use("/products", productsRouter);
});

afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

describe("GET /products Redcare COGS", () => {
  it("returns COGS for Redcare units by bridging the Shopify SKU to the Amazon ASIN", async () => {
    await runWithAccount(accountId, async () => {
      const product = await createProduct(db.prisma, { name: "VENAVIL" });
      await createIdentifier(db.prisma, {
        productId: product.id,
        channelType: "AMAZON",
        marketplace: "IT",
        asin: "B0VENAVILIT",
        sku: "VENAVIL",
      });
      await upsertCogs(db.prisma, {
        asin: "B0VENAVILIT",
        marketplace: "ALL",
        cogsPerUnit: 2.6,
        shippingCost: 0.4,
      });

      const order = await db.prisma.shopifyOrder.create({
        data: {
          shopifyOrderId: "gid://shopify/Order/redcare-1",
          orderName: "#REDCARE-1",
          createdAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          totalAmount: 100,
          netAmount: 100,
          financialStatus: "paid",
          marketplaceDetected: "REDCARE_IT",
          lineItemsCount: 1,
        },
      });
      await db.prisma.orderLineItem.create({
        data: {
          shopifyLineItemId: "gid://shopify/LineItem/redcare-1",
          orderId: order.id,
          shopifyProductId: "gid://shopify/Product/venavil",
          productTitle: "VENAVIL",
          sku: "VENAVIL",
          quantity: 4,
          unitPrice: 25,
          originalUnitPrice: 25,
          lineTotal: 100,
          marketplace: "REDCARE_IT",
          orderDate: new Date("2026-10-10T10:00:00Z"),
        },
      });
    });

    const response = await request(app)
      .get("/products")
      .query({ filter: "custom", from: "2026-10-10", to: "2026-10-10", marketplace: "REDCARE_IT" });

    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.products[0]).toMatchObject({
      sku: "VENAVIL",
      unitsSold: 4,
      cogsTotal: 12,
      hasCogs: true,
    });
  });
});
