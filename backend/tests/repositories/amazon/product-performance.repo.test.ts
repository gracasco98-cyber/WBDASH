import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { createProduct, createIdentifier } from "../../../src/repositories/amazon/product.repo";
import { upsertAmazonInventory } from "../../../src/repositories/amazon/inventory.repo";
import { createSettlementTransactions } from "../../../src/repositories/amazon/settlement.repo";
import { upsertCogs } from "../../../src/repositories/amazon/cogs.repo";
import { resolveProductPerformance } from "../../../src/repositories/amazon/product-performance.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

async function seedOneProductWithSales() {
  const product = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
  await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-01" });
  // AmazonOrderItem has an FK to AmazonOrder(amazonAccountId, amazonOrderId) — the
  // parent order row must exist first (see orders.repo.test.ts for the same pattern).
  await db.prisma.amazonOrder.create({
    data: {
      amazonAccountId: accountId, amazonOrderId: "O1",
      purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"),
      orderStatus: "Shipped", marketplace: "IT",
    },
  });
  await db.prisma.amazonOrderItem.create({
    data: {
      amazonAccountId: accountId, amazonOrderId: "O1", orderItemId: "I1",
      asin: "B0ABC123", sku: "SKU-RSV-01", productTitle: "Resveratrolo 500mg", marketplace: "IT",
      quantityOrdered: 10, quantityShipped: 10, itemPrice: 200, itemTax: 0, promotionDiscount: 5,
      purchaseDate: new Date("2026-08-01"),
    } as any,
  });
  return product;
}

describe("resolveProductPerformance", () => {
  it("computes units/sales/promo from AmazonOrderItem for a single product+marketplace", async () => {
    await runWithAccount(accountId, async () => {
      const product = await seedOneProductWithSales();
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      const group = groups.find(g => g.product.id === product.id)!;
      expect(group.rows).toHaveLength(1);
      expect(group.rows[0].units).toBe(10);
      expect(group.rows[0].sales).toBe(200);
      expect(group.rows[0].promo).toBe(5);
      expect(group.aggregate.units).toBe(10);
    });
  });

  it("uses real settlement fees/refunds when present (hasRealFees=true)", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      await createSettlementTransactions(db.prisma, [
        { settlementId: "S1", transactionType: "Order", orderId: "O1", asin: "B0ABC123", sku: "SKU-RSV-01", marketplace: "IT", amountType: "Commission", amount: -30, currency: "EUR", postedDate: new Date("2026-08-01") },
        { settlementId: "S1", transactionType: "Refund", orderId: "O2", asin: "B0ABC123", sku: "SKU-RSV-01", marketplace: "IT", amountType: "Principal", amount: -20, currency: "EUR", postedDate: new Date("2026-08-01") },
      ] as any);

      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      const row = groups[0].rows[0];
      expect(row.hasRealFees).toBe(true);
      expect(row.amazonFees).toBe(30);
      expect(row.refundsAmount).toBe(20);
      expect(row.refundsCount).toBe(1);
    });
  });

  it("falls back to the 15%/€3.80 fee estimate when no settlement data exists", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      const row = groups[0].rows[0];
      expect(row.hasRealFees).toBe(false);
      expect(row.amazonFees).toBeCloseTo(200 * 0.15 + 10 * 3.8, 2);
    });
  });

  it("includes COGS and derives grossProfit/margin", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0.5 });
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      const row = groups[0].rows[0];
      expect(row.cogs).toBeCloseTo(45, 2); // (4 + 0.5) * 10
      expect(row.grossProfit).toBeCloseTo(row.sales - row.refundsAmount - row.amazonFees - row.cogs, 2);
    });
  });

  it("includes stock from inventory", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      await upsertAmazonInventory(db.prisma, {
        asin: "B0ABC123", sku: "SKU-RSV-01", marketplace: "IT",
        qtyAfn: 184, qtyMfn: 0, qtyInbound: 0, qtyReserved: 0, qtyTotal: 184,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      expect(groups[0].rows[0].stock).toBe(184);
    });
  });

  it("returns null adsSpend/realAcos when no adsSpendByAsin map is provided", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      expect(groups[0].rows[0].adsSpend).toBeNull();
      expect(groups[0].rows[0].realAcos).toBeNull();
    });
  });

  it("uses adsSpendByAsin when provided, and computes realAcos", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
        adsSpendByAsin: new Map([["B0ABC123", { spend: 10 }]]),
      });
      const row = groups[0].rows[0];
      expect(row.adsSpend).toBe(10);
      expect(row.realAcos).toBeCloseTo(10 / 200, 4);
    });
  });
});
