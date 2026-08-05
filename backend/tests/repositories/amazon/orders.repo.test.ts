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
