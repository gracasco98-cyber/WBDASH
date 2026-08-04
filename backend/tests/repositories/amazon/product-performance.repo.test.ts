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
  const identifier = await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-01" });
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
  return { product, identifier };
}

describe("resolveProductPerformance", () => {
  it("computes units/sales/promo from AmazonOrderItem for a single product+marketplace", async () => {
    await runWithAccount(accountId, async () => {
      const { product, identifier } = await seedOneProductWithSales();
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      const group = groups.find(g => g.product.id === product.id)!;
      expect(group.rows).toHaveLength(1);
      expect(group.rows[0].units).toBe(10);
      expect(group.rows[0].sales).toBe(200);
      expect(group.rows[0].promo).toBe(5);
      expect(group.rows[0].identifierId).toBe(identifier.id);
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

  it("hasRealCogs reflects whether a COGS row exists for the identifier", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      const withoutCogs = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      expect(withoutCogs[0].rows[0].hasRealCogs).toBe(false);
      expect(withoutCogs[0].rows[0].cogs).toBe(0);

      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0.5 });
      const withCogs = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      expect(withCogs[0].rows[0].hasRealCogs).toBe(true);
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

  it("returns null adsSpend/realAcos when no adsSpendByKey map is provided", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      expect(groups[0].rows[0].adsSpend).toBeNull();
      expect(groups[0].rows[0].realAcos).toBeNull();
    });
  });

  it("uses adsSpendByKey when provided, and computes realAcos", async () => {
    await runWithAccount(accountId, async () => {
      await seedOneProductWithSales();
      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
        adsSpendByKey: new Map([["IT::B0ABC123", { spend: 10 }]]),
      });
      const row = groups[0].rows[0];
      expect(row.adsSpend).toBe(10);
      expect(row.realAcos).toBeCloseTo(10 / 200, 4);
    });
  });

  it("assigns ad spend per marketplace, never duplicating one marketplace's spend onto another", async () => {
    await runWithAccount(accountId, async () => {
      // Same ASIN on two marketplaces (IT + DE) under one product. The buggy code
      // keyed the ads map by ASIN alone, so BOTH identifier rows received the same
      // combined (IT+DE) spend, and the aggregate then summed it — doubling real
      // ad spend and corrupting grossProfit/netProfit/margin/roi/realAcos.
      const product = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-IT" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "DE", asin: "B0ABC123", sku: "SKU-RSV-DE" });

      await db.prisma.amazonOrder.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-IT", purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"), orderStatus: "Shipped", marketplace: "IT" },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-IT", orderItemId: "I-IT", asin: "B0ABC123", sku: "SKU-RSV-IT", productTitle: "Resveratrolo 500mg", marketplace: "IT", quantityOrdered: 10, quantityShipped: 10, itemPrice: 200, itemTax: 0, promotionDiscount: 0, purchaseDate: new Date("2026-08-01") } as any,
      });
      await db.prisma.amazonOrder.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-DE", purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"), orderStatus: "Shipped", marketplace: "DE" },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-DE", orderItemId: "I-DE", asin: "B0ABC123", sku: "SKU-RSV-DE", productTitle: "Resveratrolo 500mg", marketplace: "DE", quantityOrdered: 5, quantityShipped: 5, itemPrice: 100, itemTax: 0, promotionDiscount: 0, purchaseDate: new Date("2026-08-01") } as any,
      });

      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
        adsSpendByKey: new Map([
          ["IT::B0ABC123", { spend: 20 }],
          ["DE::B0ABC123", { spend: 7 }],
        ]),
      });
      const group = groups.find((g) => g.product.id === product.id)!;
      const itRow = group.rows.find((r) => r.marketplace === "IT")!;
      const deRow = group.rows.find((r) => r.marketplace === "DE")!;

      expect(itRow.adsSpend).toBe(20);
      expect(deRow.adsSpend).toBe(7);
      expect(itRow.realAcos).toBeCloseTo(20 / 200, 4);
      expect(deRow.realAcos).toBeCloseTo(7 / 100, 4);
      // Aggregate sums each marketplace's own spend once — 27, not 40 or 54.
      expect(group.aggregate.adsSpend).toBeCloseTo(27, 2);
      expect(group.aggregate.realAcos).toBeCloseTo(27 / 300, 4);
    });
  });

  it("applies marketplace-then-ALL COGS priority per identifier, not the first-loaded row for the ASIN", async () => {
    await runWithAccount(accountId, async () => {
      // Same ASIN on two marketplaces (IT + DE) under one product — this is the
      // shape the buggy code missed: cogsByAsin was keyed by asin only, so whichever
      // COGS row happened to load first for "B0ABC123" was reused for *every*
      // identifier sharing that ASIN, regardless of marketplace.
      const product = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-IT" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "DE", asin: "B0ABC123", sku: "SKU-RSV-DE" });

      await db.prisma.amazonOrder.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-IT", purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"), orderStatus: "Shipped", marketplace: "IT" },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-IT", orderItemId: "I-IT", asin: "B0ABC123", sku: "SKU-RSV-IT", productTitle: "Resveratrolo 500mg", marketplace: "IT", quantityOrdered: 10, quantityShipped: 10, itemPrice: 200, itemTax: 0, promotionDiscount: 0, purchaseDate: new Date("2026-08-01") } as any,
      });
      await db.prisma.amazonOrder.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-DE", purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"), orderStatus: "Shipped", marketplace: "DE" },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-DE", orderItemId: "I-DE", asin: "B0ABC123", sku: "SKU-RSV-DE", productTitle: "Resveratrolo 500mg", marketplace: "DE", quantityOrdered: 5, quantityShipped: 5, itemPrice: 100, itemTax: 0, promotionDiscount: 0, purchaseDate: new Date("2026-08-01") } as any,
      });

      // IT gets a marketplace-specific COGS row; the "ALL" row is the fallback for
      // marketplaces (like DE here) with no specific row. findCogsForAsins("all")
      // fetches IT + ALL, so both rows land in the same resolveProductPerformance
      // call — exactly the scenario where the old asin-only cache collided.
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0 });
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "ALL", cogsPerUnit: 9, shippingCost: 0 });

      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      const group = groups.find((g) => g.product.id === product.id)!;
      const itRow = group.rows.find((r) => r.marketplace === "IT")!;
      const deRow = group.rows.find((r) => r.marketplace === "DE")!;

      expect(itRow.cogs).toBeCloseTo(4 * 10, 2); // exact IT match: (4 + 0) * 10 units
      expect(deRow.cogs).toBeCloseTo(9 * 5, 2); // no DE-specific row: falls back to ALL: (9 + 0) * 5 units
    });
  });

  it("aggregate hasRealFees is true only when every identifier row has real settlement fees", async () => {
    await runWithAccount(accountId, async () => {
      const product = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-IT" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "DE", asin: "B0DEF456", sku: "SKU-RSV-DE" });

      await db.prisma.amazonOrder.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-IT", purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"), orderStatus: "Shipped", marketplace: "IT" },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-IT", orderItemId: "I-IT", asin: "B0ABC123", sku: "SKU-RSV-IT", productTitle: "Resveratrolo 500mg", marketplace: "IT", quantityOrdered: 10, quantityShipped: 10, itemPrice: 200, itemTax: 0, promotionDiscount: 0, purchaseDate: new Date("2026-08-01") } as any,
      });
      await db.prisma.amazonOrder.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-DE", purchaseDate: new Date("2026-08-01"), lastUpdatedDate: new Date("2026-08-01"), orderStatus: "Shipped", marketplace: "DE" },
      });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-DE", orderItemId: "I-DE", asin: "B0DEF456", sku: "SKU-RSV-DE", productTitle: "Resveratrolo 500mg", marketplace: "DE", quantityOrdered: 5, quantityShipped: 5, itemPrice: 100, itemTax: 0, promotionDiscount: 0, purchaseDate: new Date("2026-08-01") } as any,
      });

      // Only the IT identifier has a real settlement transaction — DE has none, so
      // it falls back to the fee estimate (hasRealFees: false).
      await createSettlementTransactions(db.prisma, [
        { settlementId: "S1", transactionType: "Order", orderId: "O-IT", asin: "B0ABC123", sku: "SKU-RSV-IT", marketplace: "IT", amountType: "Commission", amount: -30, currency: "EUR", postedDate: new Date("2026-08-01") },
      ] as any);

      const groups = await resolveProductPerformance(db.prisma, {
        marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-02"),
      });
      const group = groups.find((g) => g.product.id === product.id)!;
      const itRow = group.rows.find((r) => r.marketplace === "IT")!;
      const deRow = group.rows.find((r) => r.marketplace === "DE")!;

      expect(itRow.hasRealFees).toBe(true);
      expect(deRow.hasRealFees).toBe(false);
      expect(group.aggregate.hasRealFees).toBe(false);
    });
  });
});
