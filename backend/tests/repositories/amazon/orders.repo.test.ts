/**
 * orders.repo.test.ts — Integration tests for the AmazonOrder + AmazonOrderItem repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { sampleAmazonOrders, sampleAmazonOrderItems } from "../../fixtures/amazon-orders.fixture";
import {
  findAmazonOrdersByDateRange,
  findAmazonOrdersWithItems,
  countAmazonOrders,
  countAllAmazonOrders,
  countAllAmazonOrderItems,
  groupAmazonOrdersByMarketplace,
  groupAmazonItemsByAsin,
} from "../../../src/repositories/amazon/orders.repo";

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
  for (const o of sampleAmazonOrders) {
    await db.prisma.amazonOrder.create({ data: o });
  }
  for (const i of sampleAmazonOrderItems) {
    await db.prisma.amazonOrderItem.create({ data: i });
  }
});

// ─── findAmazonOrdersByDateRange ──────────────────────────────────────────────

describe("findAmazonOrdersByDateRange", () => {
  it("returns orders within the date range", async () => {
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

  it("excludes orders outside the date range", async () => {
    const result = await findAmazonOrdersByDateRange(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"),
      to:   new Date("2026-04-12T23:59:59Z"),
    });
    const ids = result.map((o) => o.amazonOrderId);
    expect(ids).not.toContain("AZ-IT-OLD");
    expect(ids).not.toContain("AZ-IT-004"); // today
  });

  it("filters by marketplace", async () => {
    const result = await findAmazonOrdersByDateRange(db.prisma, {
      from:        new Date("2026-04-01T00:00:00Z"),
      to:          new Date("2026-04-30T23:59:59Z"),
      marketplace: "DE",
    });
    expect(result.every((o) => o.marketplace === "DE")).toBe(true);
    expect(result.length).toBe(3);
  });

  it("excludes cancelled orders when excludeCancelled=true", async () => {
    const result = await findAmazonOrdersByDateRange(db.prisma, {
      from:              new Date("2026-04-01T00:00:00Z"),
      to:                new Date("2026-04-30T23:59:59Z"),
      excludeCancelled:  true,
    });
    const ids = result.map((o) => o.amazonOrderId);
    expect(ids).not.toContain("AZ-IT-CANCEL");
  });

  it("excludes Non-Amazon orders when excludeNonAmazon=true", async () => {
    const result = await findAmazonOrdersByDateRange(db.prisma, {
      from:             new Date("2026-04-01T00:00:00Z"),
      to:               new Date("2026-04-30T23:59:59Z"),
      excludeNonAmazon: true,
    });
    const ids = result.map((o) => o.amazonOrderId);
    expect(ids).not.toContain("AZ-IT-NONAMAZON");
  });
});

// ─── countAmazonOrders ────────────────────────────────────────────────────────

describe("countAmazonOrders", () => {
  it("counts all orders in range (no filter)", async () => {
    const count = await countAmazonOrders(db.prisma, {
      from: new Date("2026-04-01T00:00:00Z"),
      to:   new Date("2026-04-30T23:59:59Z"),
    });
    // 12 active + CANCEL + NONAMAZON = 14 in range (OLD is excluded by date)
    expect(count).toBe(14);
  });

  it("counts with excludeCancelled=true", async () => {
    const count = await countAmazonOrders(db.prisma, {
      from:             new Date("2026-04-01T00:00:00Z"),
      to:               new Date("2026-04-30T23:59:59Z"),
      excludeCancelled: true,
    });
    expect(count).toBe(13); // excludes AZ-IT-CANCEL
  });
});

// ─── countAllAmazonOrders ─────────────────────────────────────────────────────

describe("countAllAmazonOrders", () => {
  it("returns total order count", async () => {
    const count = await countAllAmazonOrders(db.prisma);
    expect(count).toBe(sampleAmazonOrders.length);
  });
});

// ─── countAllAmazonOrderItems ──────────────────────────────────────────────────

describe("countAllAmazonOrderItems", () => {
  it("returns total item count", async () => {
    const count = await countAllAmazonOrderItems(db.prisma);
    expect(count).toBe(sampleAmazonOrderItems.length);
  });
});

// ─── groupAmazonOrdersByMarketplace ───────────────────────────────────────────

describe("groupAmazonOrdersByMarketplace", () => {
  it("groups orders by marketplace", async () => {
    const groups = await groupAmazonOrdersByMarketplace(db.prisma);
    const mp = new Map(groups.map(g => [g.marketplace, g._count]));
    expect(mp.get("IT")).toBeGreaterThanOrEqual(5); // IT orders
    expect(mp.get("DE")).toBe(3);
    expect(mp.get("FR")).toBe(2);
    expect(mp.get("ES")).toBe(2);
  });
});

// ─── findAmazonOrdersWithItems ────────────────────────────────────────────────

describe("findAmazonOrdersWithItems", () => {
  it("includes items for each order", async () => {
    const orders = await findAmazonOrdersWithItems(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"),
      to:   new Date("2026-04-10T23:59:59Z"),
    });
    const order1 = orders.find(o => o.amazonOrderId === "AZ-IT-001");
    expect(order1).toBeDefined();
    expect(order1!.items.length).toBe(2); // 2 items for AZ-IT-001
  });
});

// ─── groupAmazonItemsByAsin ────────────────────────────────────────────────────

describe("groupAmazonItemsByAsin", () => {
  it("returns ASIN-level aggregates", async () => {
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

  it("excludes Non-Amazon channel items when excludeNonAmazon=true", async () => {
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
