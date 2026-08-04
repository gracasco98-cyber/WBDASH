import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../helpers/db";
import { runWithAccount } from "../../src/context/account-context";
import { createProduct, createIdentifier } from "../../src/repositories/amazon/product.repo";

// findAdSpendForAsins now returns { asin, marketplace, spend } — marketplace is
// part of the shape because the route keys its ads map by `${marketplace}::${asin}`.
vi.mock("../../src/repositories/amazon/ad-spend.repo", () => ({
  findAdSpendForAsins: vi.fn(async (): Promise<Array<{ asin: string; marketplace: string; spend: number }>> => []),
}));

let db: TestDb;
let accountId: string;
let app: express.Express;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let productsPerformanceRouter: any;

beforeAll(async () => {
  db = await setupTestDb();
  // src/db.ts's `prisma` singleton reads DATABASE_URL at module-load time (see
  // its own comment: "Importers must ensure DATABASE_URL is set in process.env
  // BEFORE the first import"). The route module imports that singleton, so it
  // must be dynamically imported here, after the testcontainer is up and
  // DATABASE_URL points at it — same pattern as
  // tests/integration/sync-amazon.test.ts ("Env vars set BEFORE dynamic
  // imports"). A static top-level import would bind the singleton to whatever
  // DATABASE_URL existed at process start (e.g. a local dev DB), and the route
  // handlers would silently read/write the wrong database.
  process.env.DATABASE_URL = db.databaseUrl;
  ({ productsPerformanceRouter } = await import("../../src/amazon/routes/products-performance.routes"));
}, 60_000);
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

describe("GET /products/performance", () => {
  it("returns performance groups for products with sales in range", async () => {
    await runWithAccount(accountId, async () => {
      const product = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-01" });
      // AmazonOrderItem has an FK to AmazonOrder(amazonAccountId, amazonOrderId) — the
      // parent order row must exist first (see product-performance.repo.test.ts).
      await db.prisma.amazonOrder.create({
        data: {
          amazonAccountId: accountId, amazonOrderId: "O1",
          purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"),
          orderStatus: "Shipped", marketplace: "IT",
        },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O1", orderItemId: "I1", asin: "B0ABC123", sku: "SKU-RSV-01", productTitle: "Resveratrolo", marketplace: "IT", quantityOrdered: 5, quantityShipped: 5, itemPrice: 100, promotionDiscount: 0, purchaseDate: new Date("2026-08-01") } as any,
      });
    });

    const res = await request(app).get("/products/performance").query({ marketplace: "all", from: "2026-08-01", to: "2026-08-02" });
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].aggregate.units).toBe(5);
  });

  it("attributes ad spend to the right marketplace when one ASIN sells on two", async () => {
    // End-to-end guard for the ASIN-only ads key bug: IT and DE are separate
    // ProductIdentifier rows for the same ASIN. Each must receive only its own
    // marketplace's spend, and the aggregate must sum to 27 — not 2 × 27.
    const { findAdSpendForAsins } = await import("../../src/repositories/amazon/ad-spend.repo");
    (findAdSpendForAsins as any).mockResolvedValueOnce([
      { asin: "B0ABC123", marketplace: "IT", spend: 20 },
      { asin: "B0ABC123", marketplace: "DE", spend: 7 },
    ]);

    await runWithAccount(accountId, async () => {
      const product = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-IT" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "DE", asin: "B0ABC123", sku: "SKU-RSV-DE" });
      for (const mp of ["IT", "DE"] as const) {
        await db.prisma.amazonOrder.create({
          data: { amazonAccountId: accountId, amazonOrderId: `O-${mp}`, purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"), orderStatus: "Shipped", marketplace: mp },
        });
        await db.prisma.amazonOrderItem.create({
          data: { amazonAccountId: accountId, amazonOrderId: `O-${mp}`, orderItemId: `I-${mp}`, asin: "B0ABC123", sku: `SKU-RSV-${mp}`, productTitle: "Resveratrolo", marketplace: mp, quantityOrdered: 5, quantityShipped: 5, itemPrice: 100, promotionDiscount: 0, purchaseDate: new Date("2026-08-01") } as any,
        });
      }
    });

    const res = await request(app).get("/products/performance").query({ marketplace: "all", from: "2026-08-01", to: "2026-08-02" });
    expect(res.status).toBe(200);
    const group = res.body.groups[0];
    expect(group.rows.find((r: any) => r.marketplace === "IT").adsSpend).toBe(20);
    expect(group.rows.find((r: any) => r.marketplace === "DE").adsSpend).toBe(7);
    expect(group.aggregate.adsSpend).toBeCloseTo(27, 2);
  });
});

describe("PATCH /products/:id", () => {
  it("renames a product", async () => {
    let productId = "";
    await runWithAccount(accountId, async () => {
      const p = await createProduct(db.prisma, { name: "Old Name" });
      productId = p.id;
    });
    const res = await request(app).patch(`/products/${productId}`).send({ name: "New Name" });
    expect(res.status).toBe(204);
  });
});

describe("PATCH /products/identifiers/:id", () => {
  it("moves an identifier to another product", async () => {
    let identifierId = "";
    let targetId = "";
    await runWithAccount(accountId, async () => {
      const source = await createProduct(db.prisma, { name: "Source" });
      const target = await createProduct(db.prisma, { name: "Target" });
      const ident = await createIdentifier(db.prisma, { productId: source.id, channelType: "AMAZON", marketplace: "IT", asin: "B0X", sku: "SKU-X" });
      identifierId = ident.id;
      targetId = target.id;
    });
    const res = await request(app).patch(`/products/identifiers/${identifierId}`).send({ targetProductId: targetId });
    expect(res.status).toBe(204);
  });
});
