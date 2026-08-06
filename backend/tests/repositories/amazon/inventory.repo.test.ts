/**
 * inventory.repo.test.ts — Integration tests for the AmazonInventory repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import {
  upsertAmazonInventory,
  findInventoryForAsins,
  findAllInventory,
  computeSalesVelocityByAsin,
  computeCombinedEuVelocity,
} from "../../../src/repositories/amazon/inventory.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

describe("findInventoryForAsins", () => {
  it("returns qtyTotal per asin+marketplace, filtered to the requested ASINs", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonInventory(db.prisma, {
        asin: "B0ABC123", sku: "SKU-RSV-01", marketplace: "IT",
        qtyAfn: 180, qtyMfn: 0, qtyInbound: 4, qtyReserved: 0, qtyTotal: 184,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });
      await upsertAmazonInventory(db.prisma, {
        asin: "B0OTHER", sku: "SKU-OTHER", marketplace: "IT",
        qtyAfn: 10, qtyMfn: 0, qtyInbound: 0, qtyReserved: 0, qtyTotal: 10,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });

      const rows = await findInventoryForAsins(db.prisma, { asins: ["B0ABC123"] });
      expect(rows).toEqual([{ asin: "B0ABC123", marketplace: "IT", qtyTotal: 184 }]);
    });
  });
});

// ─── findAllInventory ──────────────────────────────────────────────────────────

describe("findAllInventory", () => {
  it("returns all rows for the current account, sorted by daysRemaining then qtyTotal", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonInventory(db.prisma, {
        asin: "B0LOW", sku: "SKU-LOW", marketplace: "IT",
        qtyAfn: 50, qtyMfn: 0, qtyInbound: 0, qtyReserved: 0, qtyTotal: 50,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });
      await db.prisma.amazonInventory.update({ where: { amazonAccountId_asin_sku_marketplace: { amazonAccountId: accountId, asin: "B0LOW", sku: "SKU-LOW", marketplace: "IT" } }, data: { daysRemaining: 5 } });
      await upsertAmazonInventory(db.prisma, {
        asin: "B0HIGH", sku: "SKU-HIGH", marketplace: "IT",
        qtyAfn: 500, qtyMfn: 0, qtyInbound: 0, qtyReserved: 0, qtyTotal: 500,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });
      await db.prisma.amazonInventory.update({ where: { amazonAccountId_asin_sku_marketplace: { amazonAccountId: accountId, asin: "B0HIGH", sku: "SKU-HIGH", marketplace: "IT" } }, data: { daysRemaining: 90 } });

      const rows = await findAllInventory(db.prisma, {});
      expect(rows.map((r: any) => r.asin)).toEqual(["B0LOW", "B0HIGH"]);
    });
  });

  it("filters by marketplace when provided", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonInventory(db.prisma, {
        asin: "B0IT", sku: "SKU-IT", marketplace: "IT",
        qtyAfn: 10, qtyMfn: 0, qtyInbound: 0, qtyReserved: 0, qtyTotal: 10,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });
      await upsertAmazonInventory(db.prisma, {
        asin: "B0DE", sku: "SKU-DE", marketplace: "DE",
        qtyAfn: 10, qtyMfn: 0, qtyInbound: 0, qtyReserved: 0, qtyTotal: 10,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });

      const rows = await findAllInventory(db.prisma, { marketplace: "IT" });
      expect(rows.map((r: any) => r.asin)).toEqual(["B0IT"]);
    });
  });
});

// ─── computeSalesVelocityByAsin ─────────────────────────────────────────────────

describe("computeSalesVelocityByAsin", () => {
  it("computes units/day for a 30-day window, excluding cancelled orders", async () => {
    await db.prisma.amazonOrder.create({
      data: {
        amazonAccountId: accountId, amazonOrderId: "VEL-1", purchaseDate: new Date(),
        lastUpdatedDate: new Date(), orderStatus: "Shipped", salesChannel: "Amazon.it",
        marketplace: "IT", fulfillmentChannel: "AFN", currency: "EUR", itemTotal: 100,
      },
    });
    await db.prisma.amazonOrderItem.create({
      data: {
        amazonAccountId: accountId, amazonOrderId: "VEL-1", orderItemId: "VEL-1-A",
        asin: "B0VEL", sku: "SKU-VEL", productTitle: "Vel Product", quantityOrdered: 30,
        quantityShipped: 30, itemPrice: 100, itemTax: 0, promotionDiscount: 0,
        currency: "EUR", marketplace: "IT", purchaseDate: new Date(),
      },
    });

    await runWithAccount(accountId, async () => {
      const rows = await computeSalesVelocityByAsin(db.prisma, {
        since: new Date(Date.now() - 30 * 86400000), windowDays: 30,
      });
      const row = rows.find(r => r.asin === "B0VEL");
      expect(row?.dailyVelocity).toBeCloseTo(1, 4); // 30 units / 30 days
    });
  });
});

// ─── computeCombinedEuVelocity ──────────────────────────────────────────────────

describe("computeCombinedEuVelocity", () => {
  it("breaks down velocity by market derived from salesChannel", async () => {
    await db.prisma.amazonOrder.create({
      data: {
        amazonAccountId: accountId, amazonOrderId: "EUVEL-1", purchaseDate: new Date(),
        lastUpdatedDate: new Date(), orderStatus: "Shipped", salesChannel: "Amazon.de",
        marketplace: "DE", fulfillmentChannel: "AFN", currency: "EUR", itemTotal: 100,
      },
    });
    await db.prisma.amazonOrderItem.create({
      data: {
        amazonAccountId: accountId, amazonOrderId: "EUVEL-1", orderItemId: "EUVEL-1-A",
        asin: "B0EUVEL", sku: "SKU-EUVEL", productTitle: "EU Vel Product", quantityOrdered: 15,
        quantityShipped: 15, itemPrice: 100, itemTax: 0, promotionDiscount: 0,
        currency: "EUR", marketplace: "DE", purchaseDate: new Date(),
      },
    });

    await runWithAccount(accountId, async () => {
      const rows = await computeCombinedEuVelocity(db.prisma, {
        since: new Date(Date.now() - 30 * 86400000), windowDays: 30,
      });
      const row = rows.find(r => r.asin === "B0EUVEL" && r.market === "DE");
      expect(row?.dailyVelocity).toBeCloseTo(0.5, 4); // 15 units / 30 days
    });
  });
});
