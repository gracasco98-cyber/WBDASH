import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../helpers/db";
import { runWithAccount } from "../../src/context/account-context";
import { createProduct, createIdentifier } from "../../src/repositories/amazon/product.repo";

vi.mock("../../src/amazon/ads-api.service", () => ({
  isAdsConfigured: vi.fn(async () => false),
  getConfiguredProfiles: vi.fn(async () => []),
  fetchSPAdvertisedProductReport: vi.fn(async () => []),
}));

// dynamic import after DATABASE_URL is set by setupTestDb — same pattern as
// tests/integration/sync-amazon.test.ts and products-performance.routes.test.ts,
// required because src/db.ts's PrismaClient singleton captures env at module load time
let productsPerformanceRouter: import("../../src/amazon/routes/products-performance.routes").productsPerformanceRouter;

let db: TestDb;
let accountId: string;
let app: express.Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  ({ productsPerformanceRouter } = await import("../../src/amazon/routes/products-performance.routes"));
});
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).amazonAccountId = accountId; next(); });
  app.use((req, _res, next) => runWithAccount(accountId, () => next()));
  app.use("/", productsPerformanceRouter);
});

describe("GET /products/performance — period filter", () => {
  it("excludes an order outside the requested from/to window", async () => {
    await runWithAccount(accountId, async () => {
      const product = await createProduct(db.prisma, { name: "In Window" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0IN", sku: "SKU-IN" });
      await db.prisma.amazonOrder.create({
        data: {
          amazonAccountId: accountId, amazonOrderId: "O-IN",
          purchaseDate: new Date("2026-06-15"), lastUpdatedDate: new Date("2026-06-15"),
          orderStatus: "Shipped", marketplace: "IT",
        },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-IN", orderItemId: "I-IN", asin: "B0IN", sku: "SKU-IN", productTitle: "In Window", marketplace: "IT", quantityOrdered: 3, quantityShipped: 3, itemPrice: 60, promotionDiscount: 0, purchaseDate: new Date("2026-06-15") } as any,
      });

      const outOfWindow = await createProduct(db.prisma, { name: "Out Of Window" });
      await createIdentifier(db.prisma, { productId: outOfWindow.id, channelType: "AMAZON", marketplace: "IT", asin: "B0OUT", sku: "SKU-OUT" });
      await db.prisma.amazonOrder.create({
        data: {
          amazonAccountId: accountId, amazonOrderId: "O-OUT",
          purchaseDate: new Date("2026-01-01"), lastUpdatedDate: new Date("2026-01-01"),
          orderStatus: "Shipped", marketplace: "IT",
        },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-OUT", orderItemId: "I-OUT", asin: "B0OUT", sku: "SKU-OUT", productTitle: "Out Of Window", marketplace: "IT", quantityOrdered: 5, quantityShipped: 5, itemPrice: 100, promotionDiscount: 0, purchaseDate: new Date("2026-01-01") } as any,
      });
    });

    const res = await request(app).get("/products/performance").query({ marketplace: "all", from: "2026-06-01", to: "2026-06-30" });
    expect(res.status).toBe(200);
    const groups = res.body.groups;

    const inWindow = groups.find((g: any) => g.product.name === "In Window");
    const outOfWindow = groups.find((g: any) => g.product.name === "Out Of Window");

    expect(inWindow).toBeDefined();
    expect(inWindow.aggregate.units).toBe(3);  // The in-window order

    expect(outOfWindow).toBeDefined();
    expect(outOfWindow.aggregate.units).toBe(0);  // No orders in the filtered date range
  });
});
