/**
 * forecast.repo.test.ts — Integration tests for the component-model parameter
 * repository functions added during the E.1 repository-layer cleanup.
 * (findCalibrationByMarketplace and other pre-existing functions in this file
 * are not yet covered — out of scope for this refactor.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import {
  computeFbaTotals,
  computeAvgUnitsPerOrder,
  computeRefundLagDays,
  computePpcDailyAverages,
} from "../../../src/repositories/amazon/forecast.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

async function seedOrder(orderId: string, marketplace: string, purchaseDate: Date) {
  await db.prisma.amazonOrder.create({
    data: {
      amazonAccountId: accountId, amazonOrderId: orderId, purchaseDate,
      lastUpdatedDate: purchaseDate, orderStatus: "Shipped", salesChannel: "Amazon.it",
      marketplace, fulfillmentChannel: "AFN", currency: "EUR", itemTotal: 100,
    },
  });
}

describe("computeFbaTotals", () => {
  it("sums FBA fee amounts and matched order units for one marketplace", async () => {
    await seedOrder("FBA-1", "IT", new Date("2026-04-10"));
    await db.prisma.amazonOrderItem.create({
      data: {
        amazonAccountId: accountId, amazonOrderId: "FBA-1", orderItemId: "FBA-1-A",
        asin: "B0FBA", sku: "SKU-FBA", productTitle: "FBA Product", quantityOrdered: 5,
        quantityShipped: 5, itemPrice: 100, itemTax: 0, promotionDiscount: 0,
        currency: "EUR", marketplace: "IT", purchaseDate: new Date("2026-04-10"),
      },
    });
    await db.prisma.amazonSettlement.create({
      data: {
        amazonAccountId: accountId, settlementId: "SETT-FBA", marketplace: "IT",
        startDate: new Date("2026-04-01"), endDate: new Date("2026-04-14"), totalAmount: 100,
      },
    });
    await db.prisma.amazonSettlementTransaction.create({
      data: {
        amazonAccountId: accountId, settlementId: "SETT-FBA", transactionType: "Order",
        orderId: "FBA-1", marketplace: "IT", amountType: "FBAPerUnitFulfillmentFee",
        amount: -15, postedDate: new Date("2026-04-14"),
      },
    });

    await runWithAccount(accountId, async () => {
      const { totalFba, totalUnits } = await computeFbaTotals(db.prisma, "IT");
      expect(totalFba).toBeCloseTo(15, 4);
      expect(totalUnits).toBe(5);
    });
  });

  it("returns null totals when no matching transactions exist", async () => {
    await runWithAccount(accountId, async () => {
      const { totalFba, totalUnits } = await computeFbaTotals(db.prisma, "IT");
      expect(totalFba).toBeNull();
      expect(totalUnits).toBeNull();
    });
  });
});

describe("computeAvgUnitsPerOrder", () => {
  it("averages quantityOrdered across order items for one marketplace", async () => {
    await seedOrder("AVG-1", "IT", new Date("2026-04-10"));
    await db.prisma.amazonOrderItem.createMany({
      data: [
        { amazonAccountId: accountId, amazonOrderId: "AVG-1", orderItemId: "AVG-1-A", asin: "B0AVG", sku: "SKU-AVG", productTitle: "Avg Product", quantityOrdered: 2, itemPrice: 10, marketplace: "IT", purchaseDate: new Date("2026-04-10") },
        { amazonAccountId: accountId, amazonOrderId: "AVG-1", orderItemId: "AVG-1-B", asin: "B0AVG2", sku: "SKU-AVG2", productTitle: "Avg Product 2", quantityOrdered: 4, itemPrice: 10, marketplace: "IT", purchaseDate: new Date("2026-04-10") },
      ],
    });

    await runWithAccount(accountId, async () => {
      const avg = await computeAvgUnitsPerOrder(db.prisma, "IT");
      expect(avg).toBeCloseTo(3, 4); // (2+4)/2
    });
  });

  it("returns null when no order items exist for the marketplace", async () => {
    await runWithAccount(accountId, async () => {
      const avg = await computeAvgUnitsPerOrder(db.prisma, "DE");
      expect(avg).toBeNull();
    });
  });
});

describe("computeRefundLagDays", () => {
  it("averages days between purchaseDate and the refund's settlement endDate", async () => {
    await seedOrder("LAG-1", "IT", new Date("2026-04-01"));
    await db.prisma.amazonSettlement.create({
      data: {
        amazonAccountId: accountId, settlementId: "SETT-LAG", marketplace: "IT",
        startDate: new Date("2026-04-15"), endDate: new Date("2026-04-21"), totalAmount: 100,
      },
    });
    await db.prisma.amazonSettlementTransaction.create({
      data: {
        amazonAccountId: accountId, settlementId: "SETT-LAG", transactionType: "Refund",
        orderId: "LAG-1", marketplace: "IT", amountType: "Principal",
        amount: -20, postedDate: new Date("2026-04-21"),
      },
    });

    await runWithAccount(accountId, async () => {
      const lag = await computeRefundLagDays(db.prisma, "IT");
      expect(lag).toBeCloseTo(20, 1); // Apr 1 -> Apr 21 = 20 days
    });
  });

  it("returns null when no refund transactions exist", async () => {
    await runWithAccount(accountId, async () => {
      const lag = await computeRefundLagDays(db.prisma, "IT");
      expect(lag).toBeNull();
    });
  });
});

describe("computePpcDailyAverages", () => {
  it("computes 7d and 30d daily spend averages from AmazonAdSnapshot", async () => {
    const today = new Date();
    const days = (n: number) => new Date(today.getTime() - n * 86400000);

    await db.prisma.amazonAdSnapshot.createMany({
      data: [
        { amazonAccountId: accountId, snapshotDate: days(1), marketplace: "IT", campaignId: "c1", campaignName: "C1", spend: 10 },
        { amazonAccountId: accountId, snapshotDate: days(2), marketplace: "IT", campaignId: "c1", campaignName: "C1", spend: 20 },
        { amazonAccountId: accountId, snapshotDate: days(20), marketplace: "IT", campaignId: "c1", campaignName: "C1", spend: 5 },
      ],
    });

    await runWithAccount(accountId, async () => {
      const { avg7d, avg30d } = await computePpcDailyAverages(db.prisma, "IT");
      expect(avg7d).toBeCloseTo(15, 4); // (10+20)/2 days with spend in the last 7 days
      expect(avg30d).toBeCloseTo(35 / 3, 4); // (10+20+5)/3 days with spend in the last 30 days
    });
  });

  it("returns null averages when no ad snapshots exist", async () => {
    await runWithAccount(accountId, async () => {
      const { avg7d, avg30d } = await computePpcDailyAverages(db.prisma, "IT");
      expect(avg7d).toBeNull();
      expect(avg30d).toBeNull();
    });
  });
});
