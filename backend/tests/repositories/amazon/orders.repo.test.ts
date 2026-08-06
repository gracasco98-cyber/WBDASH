/**
 * orders.repo.test.ts — Integration tests for the AmazonOrder + AmazonOrderItem repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { sampleAmazonOrders, sampleAmazonOrderItems } from "../../fixtures/amazon-orders.fixture";
import {
  findAmazonOrdersByDateRange,
  findAmazonOrdersWithItems,
  countAmazonOrders,
  countAllAmazonOrders,
  countAllAmazonOrderItems,
  groupAmazonOrdersByMarketplace,
  groupAmazonItemsByAsin,
  findAmazonOrderDateRange,
  countDistinctOrdersForSnapshot,
  findAmazonOrdersForExport,
  findUnreconciledOrders,
  countUnreconciledOrders,
  sumUnreconciledByMarketplace,
  findMarketplaceCoverage,
  computeDd7Reserve,
} from "../../../src/repositories/amazon/orders.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => {
  db = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
  for (const o of sampleAmazonOrders) {
    await db.prisma.amazonOrder.create({ data: { ...o, amazonAccountId: accountId } });
  }
  for (const i of sampleAmazonOrderItems) {
    await db.prisma.amazonOrderItem.create({ data: { ...i, amazonAccountId: accountId } });
  }
});

// ─── findAmazonOrdersByDateRange ──────────────────────────────────────────────

describe("findAmazonOrdersByDateRange", () => {
  it("returns orders within the date range", async () => {
    await runWithAccount(accountId, async () => {
      // AZ-IT-001: 2026-04-10T09:00Z, AZ-IT-002: 2026-04-11, AZ-IT-003: 2026-04-12
      // AZ-DE-001: 2026-04-09T08:00Z — OUTSIDE the range (starts Apr 10)
      const result = await findAmazonOrdersByDateRange(db.prisma, {
        from: new Date("2026-04-10T00:00:00Z"),
        to:   new Date("2026-04-12T23:59:59Z"),
      });
      const ids = result.map((o) => o.amazonOrderId);
      expect(ids).toContain("AZ-IT-001");
      expect(ids).toContain("AZ-IT-002");
      expect(ids).toContain("AZ-IT-003");
      expect(ids).not.toContain("AZ-DE-001"); // Apr 9, before range
    });
  });

  it("excludes orders outside the date range", async () => {
    await runWithAccount(accountId, async () => {
      const result = await findAmazonOrdersByDateRange(db.prisma, {
        from: new Date("2026-04-10T00:00:00Z"),
        to:   new Date("2026-04-12T23:59:59Z"),
      });
      const ids = result.map((o) => o.amazonOrderId);
      expect(ids).not.toContain("AZ-IT-OLD");
      expect(ids).not.toContain("AZ-IT-004"); // today
    });
  });

  it("filters by marketplace", async () => {
    await runWithAccount(accountId, async () => {
      const result = await findAmazonOrdersByDateRange(db.prisma, {
        from:        new Date("2026-04-01T00:00:00Z"),
        to:          new Date("2026-04-30T23:59:59Z"),
        marketplace: "DE",
      });
      expect(result.every((o) => o.marketplace === "DE")).toBe(true);
      expect(result.length).toBe(3);
    });
  });

  it("excludes cancelled orders when excludeCancelled=true", async () => {
    await runWithAccount(accountId, async () => {
      const result = await findAmazonOrdersByDateRange(db.prisma, {
        from:              new Date("2026-04-01T00:00:00Z"),
        to:                new Date("2026-04-30T23:59:59Z"),
        excludeCancelled:  true,
      });
      const ids = result.map((o) => o.amazonOrderId);
      expect(ids).not.toContain("AZ-IT-CANCEL");
    });
  });

  it("excludes Non-Amazon orders when excludeNonAmazon=true", async () => {
    await runWithAccount(accountId, async () => {
      const result = await findAmazonOrdersByDateRange(db.prisma, {
        from:             new Date("2026-04-01T00:00:00Z"),
        to:               new Date("2026-04-30T23:59:59Z"),
        excludeNonAmazon: true,
      });
      const ids = result.map((o) => o.amazonOrderId);
      expect(ids).not.toContain("AZ-IT-NONAMAZON");
    });
  });
});

// ─── countAmazonOrders ────────────────────────────────────────────────────────

describe("countAmazonOrders", () => {
  it("counts all orders in range (no filter)", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countAmazonOrders(db.prisma, {
        from: new Date("2026-04-01T00:00:00Z"),
        to:   new Date("2026-04-30T23:59:59Z"),
      });
      // 12 active + CANCEL + NONAMAZON = 14 in range (OLD is excluded by date)
      expect(count).toBe(14);
    });
  });

  it("counts with excludeCancelled=true", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countAmazonOrders(db.prisma, {
        from:             new Date("2026-04-01T00:00:00Z"),
        to:               new Date("2026-04-30T23:59:59Z"),
        excludeCancelled: true,
      });
      expect(count).toBe(13); // excludes AZ-IT-CANCEL
    });
  });
});

// ─── countAllAmazonOrders ─────────────────────────────────────────────────────

describe("countAllAmazonOrders", () => {
  it("returns total order count", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countAllAmazonOrders(db.prisma);
      expect(count).toBe(sampleAmazonOrders.length);
    });
  });
});

// ─── countAllAmazonOrderItems ──────────────────────────────────────────────────

describe("countAllAmazonOrderItems", () => {
  it("returns total item count", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countAllAmazonOrderItems(db.prisma);
      expect(count).toBe(sampleAmazonOrderItems.length);
    });
  });
});

// ─── groupAmazonOrdersByMarketplace ───────────────────────────────────────────

describe("groupAmazonOrdersByMarketplace", () => {
  it("groups orders by marketplace", async () => {
    await runWithAccount(accountId, async () => {
      const groups = await groupAmazonOrdersByMarketplace(db.prisma);
      const mp = new Map(groups.map(g => [g.marketplace, g._count]));
      expect(mp.get("IT")).toBeGreaterThanOrEqual(5); // IT orders
      expect(mp.get("DE")).toBe(3);
      expect(mp.get("FR")).toBe(2);
      expect(mp.get("ES")).toBe(2);
    });
  });
});

// ─── findAmazonOrdersWithItems ────────────────────────────────────────────────

describe("findAmazonOrdersWithItems", () => {
  it("includes items for each order", async () => {
    await runWithAccount(accountId, async () => {
      const orders = await findAmazonOrdersWithItems(db.prisma, {
        from: new Date("2026-04-10T00:00:00Z"),
        to:   new Date("2026-04-10T23:59:59Z"),
      });
      const order1 = orders.find(o => o.amazonOrderId === "AZ-IT-001");
      expect(order1).toBeDefined();
      expect(order1!.items.length).toBe(2); // 2 items for AZ-IT-001
    });
  });
});

// ─── groupAmazonItemsByAsin ────────────────────────────────────────────────────

describe("groupAmazonItemsByAsin", () => {
  it("returns ASIN-level aggregates", async () => {
    await runWithAccount(accountId, async () => {
      const groups = await groupAmazonItemsByAsin(db.prisma, {
        purchaseDateRange: {
          gte: new Date("2026-04-01T00:00:00Z"),
          lte: new Date("2026-04-30T23:59:59Z"),
        },
        excludeNonAmazon: true,
      });
      expect(groups.length).toBeGreaterThan(0);
      // AZ-IT-001 has 2 items × €45 = €90
      const it001 = groups.find(g => g.asin === "B0A1IT001A");
      expect(it001).toBeDefined();
      expect(it001?._sum.itemPrice).toBeCloseTo(45.0, 1);
    });
  });

  it("excludes Non-Amazon channel items when excludeNonAmazon=true", async () => {
    await runWithAccount(accountId, async () => {
      const groups = await groupAmazonItemsByAsin(db.prisma, {
        purchaseDateRange: {
          gte: new Date("2026-04-01T00:00:00Z"),
          lte: new Date("2026-04-30T23:59:59Z"),
        },
        excludeNonAmazon: true,
      });
      const asins = groups.map(g => g.asin);
      expect(asins).not.toContain("B0ANONAMZN1"); // Non-Amazon item
    });
  });
});

// ─── findAmazonOrderDateRange ─────────────────────────────────────────────────

describe("findAmazonOrderDateRange", () => {
  it("returns the earliest and latest purchaseDate across all orders for the current account", async () => {
    await runWithAccount(accountId, async () => {
      const range = await findAmazonOrderDateRange(db.prisma);
      // AZ-IT-OLD is the earliest (2025-01-01), AZ-IT-004 is the latest (2026-04-14T22:30Z)
      expect(range.min?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
      expect(range.max?.toISOString()).toBe("2026-04-14T22:30:00.000Z");
    });
  });

  it("returns null min/max when the current account has no orders", async () => {
    const otherAccountId = await createTestAmazonAccount(db.prisma, { name: "Empty Account" });
    await runWithAccount(otherAccountId, async () => {
      const range = await findAmazonOrderDateRange(db.prisma);
      expect(range.min).toBeNull();
      expect(range.max).toBeNull();
    });
  });
});

// ─── countDistinctOrdersForSnapshot ───────────────────────────────────────────

describe("countDistinctOrdersForSnapshot", () => {
  it("counts one distinct order for an ASIN sold once on that day", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countDistinctOrdersForSnapshot(db.prisma, {
        asin: "B0A1IT001A",
        marketplace: "IT",
        from: new Date("2026-04-10T00:00:00Z"),
        to: new Date("2026-04-10T23:59:59Z"),
      });
      expect(count).toBe(1);
    });
  });

  it("excludes cancelled orders from the distinct count", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countDistinctOrdersForSnapshot(db.prisma, {
        asin: "B0ACANCEL1A",
        marketplace: "IT",
        from: new Date("2026-04-10T00:00:00Z"),
        to: new Date("2026-04-10T23:59:59Z"),
      });
      expect(count).toBe(0);
    });
  });

  it("returns 0 when no order matches the asin/marketplace/date window", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countDistinctOrdersForSnapshot(db.prisma, {
        asin: "NON-EXISTENT-ASIN",
        marketplace: "IT",
        from: new Date("2026-04-10T00:00:00Z"),
        to: new Date("2026-04-10T23:59:59Z"),
      });
      expect(count).toBe(0);
    });
  });
});

// ─── findAmazonOrdersForExport ─────────────────────────────────────────────────

describe("findAmazonOrdersForExport", () => {
  it("returns orders within the date range, marked unpaid when no settlement transaction exists", async () => {
    await runWithAccount(accountId, async () => {
      const rows = await findAmazonOrdersForExport(db.prisma, {
        from: "2026-04-10", to: "2026-04-12",
      });
      const ids = rows.map(r => r.amazonOrderId);
      expect(ids).toContain("AZ-IT-001");
      expect(ids).toContain("AZ-IT-002");
      expect(ids).toContain("AZ-IT-003");
      expect(ids).not.toContain("AZ-DE-001"); // Apr 9, before range
      expect(rows.every(r => r.isPaid === false)).toBe(true);
      expect(rows.every(r => r.settlementId === null)).toBe(true);
    });
  });

  it("filters by marketplace", async () => {
    await runWithAccount(accountId, async () => {
      const rows = await findAmazonOrdersForExport(db.prisma, {
        from: "2026-04-08", to: "2026-04-13", marketplace: "DE",
      });
      expect(rows.every(r => r.marketplace === "DE")).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("filters by status", async () => {
    await runWithAccount(accountId, async () => {
      const rows = await findAmazonOrdersForExport(db.prisma, {
        from: "2026-04-08", to: "2026-04-13", status: "Cancelled",
      });
      expect(rows.every(r => r.orderStatus === "Cancelled")).toBe(true);
      expect(rows.map(r => r.amazonOrderId)).toContain("AZ-IT-CANCEL");
    });
  });

  it("marks an order paid when a matching settlement transaction exists", async () => {
    await db.prisma.amazonSettlement.create({
      data: {
        amazonAccountId: accountId, settlementId: "SETT-EXPORT-1", marketplace: "IT",
        startDate: new Date("2026-04-01"), endDate: new Date("2026-04-14"),
        depositDate: new Date("2026-04-16"), totalAmount: 100,
      },
    });
    await db.prisma.amazonSettlementTransaction.create({
      data: {
        amazonAccountId: accountId, settlementId: "SETT-EXPORT-1",
        transactionType: "Order", orderId: "AZ-IT-001", marketplace: "IT",
        amountType: "Principal", amount: 90, postedDate: new Date("2026-04-14"),
      },
    });

    await runWithAccount(accountId, async () => {
      const rows = await findAmazonOrdersForExport(db.prisma, { from: "2026-04-10", to: "2026-04-10" });
      const row = rows.find(r => r.amazonOrderId === "AZ-IT-001");
      expect(row?.isPaid).toBe(true);
      expect(row?.settlementId).toBe("SETT-EXPORT-1");
      expect(row?.depositDate).toBe("2026-04-16");
    });
  });
});

// ─── Unreconciled orders (payments-aux.routes.ts) ─────────────────────────────
// These run under a dedicated, isolated account (not the shared KPI fixture
// account above) so the coverage-window/settlement-transaction logic under
// test isn't entangled with the unrelated KPI fixture data.

async function seedUnreconciledFixture(prisma: TestDb["prisma"]) {
  const isoAccountId = await createTestAmazonAccount(prisma, { name: "Unreconciled Fixture Account" });

  // Coverage windows: IT covers all of April, DE covers Apr 1-15 only.
  await prisma.amazonSettlement.create({
    data: {
      amazonAccountId: isoAccountId, settlementId: "SETT-UNREC-IT", marketplace: "IT",
      startDate: new Date("2026-04-01"), endDate: new Date("2026-04-30"), totalAmount: 100,
    },
  });
  await prisma.amazonSettlement.create({
    data: {
      amazonAccountId: isoAccountId, settlementId: "SETT-UNREC-DE", marketplace: "DE",
      startDate: new Date("2026-04-01"), endDate: new Date("2026-04-15"), totalAmount: 50,
    },
  });

  const order = (over: Partial<AmazonOrder>) => ({
    lastUpdatedDate: over.purchaseDate, salesChannel: "Amazon.it", fulfillmentChannel: "AFN",
    shipCountry: over.marketplace, currency: "EUR", isBusinessOrder: false,
    amazonAccountId: isoAccountId, ...over,
  });

  // Two IT orders inside the coverage window, no settlement transaction yet → unreconciled.
  await prisma.amazonOrder.create({ data: order({
    amazonOrderId: "UNREC-IT-1", marketplace: "IT", purchaseDate: new Date("2026-04-10"),
    orderStatus: "Shipped", itemTotal: 40,
  }) as any });
  await prisma.amazonOrder.create({ data: order({
    amazonOrderId: "UNREC-IT-2", marketplace: "IT", purchaseDate: new Date("2026-04-12"),
    orderStatus: "Shipped", itemTotal: 60,
  }) as any });
  // Cancelled → excluded regardless of settlement status.
  await prisma.amazonOrder.create({ data: order({
    amazonOrderId: "UNREC-IT-CANCEL", marketplace: "IT", purchaseDate: new Date("2026-04-11"),
    orderStatus: "Cancelled", itemTotal: 999,
  }) as any });
  // Already reconciled (has a matching Principal/Order settlement transaction) → excluded.
  await prisma.amazonOrder.create({ data: order({
    amazonOrderId: "UNREC-IT-PAID", marketplace: "IT", purchaseDate: new Date("2026-04-13"),
    orderStatus: "Shipped", itemTotal: 25,
  }) as any });
  await prisma.amazonSettlementTransaction.create({
    data: {
      amazonAccountId: isoAccountId, settlementId: "SETT-UNREC-IT", transactionType: "Order",
      orderId: "UNREC-IT-PAID", marketplace: "IT", amountType: "Principal", amount: 25,
      postedDate: new Date("2026-04-14"),
    },
  });
  // Outside the IT coverage window → excluded.
  await prisma.amazonOrder.create({ data: order({
    amazonOrderId: "UNREC-IT-OLD", marketplace: "IT", purchaseDate: new Date("2025-01-01"),
    orderStatus: "Shipped", itemTotal: 10,
  }) as any });

  // One DE order inside its (narrower) coverage window, unreconciled.
  await prisma.amazonOrder.create({ data: order({
    amazonOrderId: "UNREC-DE-1", marketplace: "DE", purchaseDate: new Date("2026-04-05"),
    orderStatus: "Shipped", itemTotal: 70,
  }) as any });

  return isoAccountId;
}

describe("findUnreconciledOrders", () => {
  it("returns only orders with no matching settlement transaction, within their marketplace's coverage window", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      const rows = await findUnreconciledOrders(db.prisma, { limit: 50, offset: 0 });
      const ids = rows.map(r => r.amazonOrderId);
      expect(ids).toEqual(expect.arrayContaining(["UNREC-IT-1", "UNREC-IT-2", "UNREC-DE-1"]));
      expect(ids).not.toContain("UNREC-IT-CANCEL");
      expect(ids).not.toContain("UNREC-IT-PAID");
      expect(ids).not.toContain("UNREC-IT-OLD");
    });
  });

  it("filters by marketplace", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      const rows = await findUnreconciledOrders(db.prisma, { marketplace: "DE", limit: 50, offset: 0 });
      expect(rows.map(r => r.amazonOrderId)).toEqual(["UNREC-DE-1"]);
    });
  });

  it("filters by search term against amazonOrderId", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      const rows = await findUnreconciledOrders(db.prisma, { search: "IT-2", limit: 50, offset: 0 });
      expect(rows.map(r => r.amazonOrderId)).toEqual(["UNREC-IT-2"]);
    });
  });

  it("respects limit/offset for pagination", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      const page1 = await findUnreconciledOrders(db.prisma, { marketplace: "IT", limit: 1, offset: 0 });
      const page2 = await findUnreconciledOrders(db.prisma, { marketplace: "IT", limit: 1, offset: 1 });
      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(1);
      expect(page1[0].amazonOrderId).not.toBe(page2[0].amazonOrderId);
    });
  });

  it("uses a fixed custom date range instead of settlement coverage when customFrom/customTo are given", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      // UNREC-IT-OLD (2025-01-01) is outside the normal IT settlement coverage,
      // but a custom range spanning it should pick it up.
      const rows = await findUnreconciledOrders(db.prisma, {
        marketplace: "IT", customFrom: "2024-01-01", customTo: "2025-06-01", limit: 50, offset: 0,
      });
      expect(rows.map(r => r.amazonOrderId)).toEqual(["UNREC-IT-OLD"]);
    });
  });
});

describe("countUnreconciledOrders", () => {
  it("counts unreconciled orders matching the same filters as findUnreconciledOrders", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      const total = await countUnreconciledOrders(db.prisma, {});
      expect(total).toBe(3); // UNREC-IT-1, UNREC-IT-2, UNREC-DE-1
    });
  });

  it("scopes the count to one marketplace", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      const total = await countUnreconciledOrders(db.prisma, { marketplace: "IT" });
      expect(total).toBe(2);
    });
  });
});

describe("sumUnreconciledByMarketplace", () => {
  it("groups unreconciled gross amount + count by marketplace", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      const totals = await sumUnreconciledByMarketplace(db.prisma, {});
      const it = totals.find(t => t.marketplace === "IT")!;
      const de = totals.find(t => t.marketplace === "DE")!;
      expect(it.count).toBe(2);
      expect(it.amount).toBeCloseTo(100, 4); // 40 + 60
      expect(de.count).toBe(1);
      expect(de.amount).toBeCloseTo(70, 4);
    });
  });
});

describe("findMarketplaceCoverage", () => {
  it("returns settlement coverage window (min/max dates) + count per marketplace", async () => {
    const isoAccountId = await seedUnreconciledFixture(db.prisma);
    await runWithAccount(isoAccountId, async () => {
      const coverage = await findMarketplaceCoverage(db.prisma);
      const it = coverage.find(c => c.marketplace === "IT")!;
      const de = coverage.find(c => c.marketplace === "DE")!;
      expect(it.covFrom).toBe("2026-04-01");
      expect(it.covTo).toBe("2026-04-30");
      expect(it.settlementCount).toBe(1);
      expect(de.covFrom).toBe("2026-04-01");
      expect(de.covTo).toBe("2026-04-15");
    });
  });

  it("returns an empty array when the account has no settlements", async () => {
    const emptyAccountId = await createTestAmazonAccount(db.prisma, { name: "No Settlements Account" });
    await runWithAccount(emptyAccountId, async () => {
      const coverage = await findMarketplaceCoverage(db.prisma);
      expect(coverage).toEqual([]);
    });
  });
});

// ─── computeDd7Reserve ─────────────────────────────────────────────────────────
// Uses NOW()/CURRENT_DATE internally, so fixture dates are relative to the
// actual test run time rather than fixed calendar dates.

describe("computeDd7Reserve", () => {
  it("splits Shipped/Delivered, unsettled orders from the last 21 days into in-hold vs. past-due by estimated release date", async () => {
    const isoAccountId = await createTestAmazonAccount(db.prisma, { name: "DD7 Fixture Account" });
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();

    const order = (over: Partial<AmazonOrder>) => ({
      lastUpdatedDate: over.purchaseDate, salesChannel: "Amazon.it", fulfillmentChannel: "AFN",
      shipCountry: "IT", currency: "EUR", isBusinessOrder: false, marketplace: "IT",
      amazonAccountId: isoAccountId, ...over,
    });

    // Purchased 5 days ago → est_release = +10d - 5d = 5 days from now → still in hold.
    await db.prisma.amazonOrder.create({ data: order({
      amazonOrderId: "DD7-IN-HOLD", purchaseDate: new Date(now.getTime() - 5 * dayMs),
      orderStatus: "Shipped", itemTotal: 50,
    }) as any });
    // Purchased 15 days ago → est_release = +10d - 15d = 5 days ago → past due.
    await db.prisma.amazonOrder.create({ data: order({
      amazonOrderId: "DD7-PAST-DUE", purchaseDate: new Date(now.getTime() - 15 * dayMs),
      orderStatus: "Delivered", itemTotal: 30,
    }) as any });
    // Purchased 30 days ago → outside the 21-day window entirely, must not appear at all.
    await db.prisma.amazonOrder.create({ data: order({
      amazonOrderId: "DD7-TOO-OLD", purchaseDate: new Date(now.getTime() - 30 * dayMs),
      orderStatus: "Shipped", itemTotal: 999,
    }) as any });

    await runWithAccount(isoAccountId, async () => {
      const [row] = await computeDd7Reserve(db.prisma);
      expect(row.marketplace).toBe("IT");
      expect(row.inDd7Hold).toBe(1);
      expect(row.dd7Gross).toBeCloseTo(50, 4);
      expect(row.pastDd7Count).toBe(1);
      expect(row.pastDd7Gross).toBeCloseTo(30, 4);
    });
  });

  it("excludes orders that already have a matching settlement transaction", async () => {
    const isoAccountId = await createTestAmazonAccount(db.prisma, { name: "DD7 Settled Account" });
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();

    await db.prisma.amazonOrder.create({ data: {
      amazonOrderId: "DD7-SETTLED", marketplace: "IT", purchaseDate: new Date(now.getTime() - 5 * dayMs),
      lastUpdatedDate: new Date(now.getTime() - 5 * dayMs), orderStatus: "Shipped",
      salesChannel: "Amazon.it", fulfillmentChannel: "AFN", shipCountry: "IT", currency: "EUR",
      itemTotal: 50, isBusinessOrder: false, amazonAccountId: isoAccountId,
    } as any });
    await db.prisma.amazonSettlement.create({
      data: {
        amazonAccountId: isoAccountId, settlementId: "SETT-DD7", marketplace: "IT",
        startDate: new Date(now.getTime() - 10 * dayMs), endDate: now, totalAmount: 50,
      },
    });
    await db.prisma.amazonSettlementTransaction.create({
      data: {
        amazonAccountId: isoAccountId, settlementId: "SETT-DD7", transactionType: "Order",
        orderId: "DD7-SETTLED", marketplace: "IT", amountType: "Principal", amount: 50,
        postedDate: now,
      },
    });

    await runWithAccount(isoAccountId, async () => {
      const rows = await computeDd7Reserve(db.prisma);
      const it = rows.find(r => r.marketplace === "IT");
      expect(it?.inDd7Hold ?? 0).toBe(0);
      expect(it?.pastDd7Count ?? 0).toBe(0);
    });
  });
});
