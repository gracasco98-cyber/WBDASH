/**
 * orders.repo.test.ts — Integration tests for the ShopifyOrder repository layer.
 *
 * Tests confirm the interface contract: right inputs produce right DB outputs.
 * The SQL-correctness of the underlying Prisma queries is covered by
 * stats-shopify.test.ts; these tests focus on the repo function API itself.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { sampleShopifyOrders } from "../../fixtures/shopify-orders.fixture";
import {
  findOrdersByDateRange,
  countOrdersByDateRange,
  findOrdersForTimeseries,
  findOrderByShopifyId,
  findOrderForBroadcast,
  findDistinctMarketplaces,
  findOrdersForReclassification,
  upsertShopifyOrder,
  updateOrderMarketplace,
  correctOrderDate,
} from "../../../src/repositories/shopify/orders.repo";

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
  for (const o of sampleShopifyOrders) {
    await db.prisma.shopifyOrder.create({ data: o });
  }
});

// ─── findOrdersByDateRange ────────────────────────────────────────────────────

describe("findOrdersByDateRange", () => {
  it("returns orders within the date range", async () => {
    const result = await findOrdersByDateRange(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"),
      to:   new Date("2026-04-12T23:59:59Z"),
    });
    const ids = result.map((o) => o.shopifyOrderId);
    // #1003T (test), #1003, #1004, #1005, #1009 are in this range
    expect(ids).toContain("gid://shopify/Order/1003");
    expect(ids).toContain("gid://shopify/Order/1003T");
    expect(ids).toContain("gid://shopify/Order/1004");
    expect(ids).toContain("gid://shopify/Order/1005");
  });

  it("excludes test orders when excludeTest=true", async () => {
    const result = await findOrdersByDateRange(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"),
      to:   new Date("2026-04-12T23:59:59Z"),
      excludeTest: true,
    });
    const ids = result.map((o) => o.shopifyOrderId);
    expect(ids).not.toContain("gid://shopify/Order/1003T");
  });

  it("filters by marketplace", async () => {
    const result = await findOrdersByDateRange(db.prisma, {
      from: new Date("2026-04-01T00:00:00Z"),
      to:   new Date("2026-04-30T23:59:59Z"),
      marketplace: "REDCARE_IT",
      excludeTest: true,
    });
    expect(result.every((o) => o.marketplaceDetected === "REDCARE_IT")).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by financial status", async () => {
    const result = await findOrdersByDateRange(db.prisma, {
      from: new Date("2026-04-01T00:00:00Z"),
      to:   new Date("2026-04-30T23:59:59Z"),
      financialStatus: "refunded",
      excludeTest: true,
    });
    expect(result.every((o) => o.financialStatus === "refunded")).toBe(true);
  });

  it("respects pagination with skip and take", async () => {
    const first = await findOrdersByDateRange(db.prisma, {
      from: new Date("2026-04-01T00:00:00Z"),
      to:   new Date("2026-04-30T23:59:59Z"),
      excludeTest: true,
      skip: 0,
      take: 2,
    });
    const second = await findOrdersByDateRange(db.prisma, {
      from: new Date("2026-04-01T00:00:00Z"),
      to:   new Date("2026-04-30T23:59:59Z"),
      excludeTest: true,
      skip: 2,
      take: 2,
    });
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    // Pages must not overlap
    const firstIds = new Set(first.map((o) => o.id));
    for (const o of second) {
      expect(firstIds.has(o.id)).toBe(false);
    }
  });

  it("returns empty array for an empty date range", async () => {
    const result = await findOrdersByDateRange(db.prisma, {
      from: new Date("2020-01-01T00:00:00Z"),
      to:   new Date("2020-01-02T00:00:00Z"),
    });
    expect(result).toHaveLength(0);
  });
});

// ─── countOrdersByDateRange ───────────────────────────────────────────────────

describe("countOrdersByDateRange", () => {
  it("counts orders matching the range", async () => {
    const count = await countOrdersByDateRange(db.prisma, {
      from: new Date("2026-04-01T00:00:00Z"),
      to:   new Date("2026-04-30T23:59:59Z"),
      excludeTest: true,
    });
    // #1003..#1009 minus the test order (#1003T)
    expect(count).toBe(7);
  });

  it("returns 0 for empty range", async () => {
    const count = await countOrdersByDateRange(db.prisma, {
      from: new Date("2020-01-01T00:00:00Z"),
      to:   new Date("2020-01-02T00:00:00Z"),
    });
    expect(count).toBe(0);
  });
});

// ─── findOrdersForTimeseries ──────────────────────────────────────────────────

describe("findOrdersForTimeseries", () => {
  it("returns only the fields needed for bucketing", async () => {
    const result = await findOrdersForTimeseries(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"),
      to:   new Date("2026-04-15T23:59:59Z"),
      excludeTest: true,
    });
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect(r).toHaveProperty("createdAt");
      expect(r).toHaveProperty("totalAmount");
      expect(r).toHaveProperty("marketplaceDetected");
      expect(r).not.toHaveProperty("rawData");
    }
  });

  it("orders results ascending", async () => {
    const result = await findOrdersForTimeseries(db.prisma, {
      from: new Date("2026-04-01T00:00:00Z"),
      to:   new Date("2026-04-30T23:59:59Z"),
      excludeTest: true,
    });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        result[i - 1].createdAt.getTime()
      );
    }
  });
});

// ─── findOrderByShopifyId ─────────────────────────────────────────────────────

describe("findOrderByShopifyId", () => {
  it("returns the order when found", async () => {
    const order = await findOrderByShopifyId(
      db.prisma,
      "gid://shopify/Order/1003"
    );
    expect(order).not.toBeNull();
    expect(order?.orderName).toBe("#1003");
  });

  it("returns null when not found", async () => {
    const order = await findOrderByShopifyId(db.prisma, "non-existent-id");
    expect(order).toBeNull();
  });
});

// ─── findOrderForBroadcast ────────────────────────────────────────────────────

describe("findOrderForBroadcast", () => {
  it("returns only the broadcast-relevant fields", async () => {
    const order = await findOrderForBroadcast(
      db.prisma,
      "gid://shopify/Order/1007"
    );
    expect(order).not.toBeNull();
    expect(order).toHaveProperty("orderName");
    expect(order).toHaveProperty("totalAmount");
    expect(order).toHaveProperty("marketplaceDetected");
    expect(order).toHaveProperty("createdAt");
    expect(order).not.toHaveProperty("rawData");
  });

  it("returns null for missing order", async () => {
    const order = await findOrderForBroadcast(db.prisma, "missing-id");
    expect(order).toBeNull();
  });
});

// ─── findDistinctMarketplaces ─────────────────────────────────────────────────

describe("findDistinctMarketplaces", () => {
  it("returns distinct marketplaces with counts", async () => {
    const results = await findDistinctMarketplaces(db.prisma);
    const marketplaces = results.map((r) => r.marketplaceDetected);
    expect(marketplaces).toContain("REDCARE_IT");
    expect(marketplaces).toContain("TEMU_IT");
    // Test orders should be excluded
    // REDCARE_IT has a test order — count should only include non-test
    const redcare = results.find((r) => r.marketplaceDetected === "REDCARE_IT");
    expect(redcare).toBeDefined();
  });
});

// ─── findOrdersForReclassification ───────────────────────────────────────────

describe("findOrdersForReclassification", () => {
  it("returns only UNCLASSIFIED orders when onlyUnclassified=true", async () => {
    const results = await findOrdersForReclassification(db.prisma, {
      onlyUnclassified: true,
      skip: 0,
      take: 100,
    });
    expect(results.every((r) => r.marketplaceDetected === "UNCLASSIFIED")).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("returns required fields only", async () => {
    const results = await findOrdersForReclassification(db.prisma, {
      onlyUnclassified: false,
      skip: 0,
      take: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("rawTags");
      expect(r).toHaveProperty("sourceName");
      expect(r).toHaveProperty("channelDisplayName");
      expect(r).toHaveProperty("marketplaceDetected");
      expect(r).not.toHaveProperty("rawData");
    }
  });
});

// ─── upsertShopifyOrder ───────────────────────────────────────────────────────

describe("upsertShopifyOrder", () => {
  const newId = "gid://shopify/Order/9999";

  it("inserts a new order", async () => {
    await upsertShopifyOrder(
      db.prisma,
      {
        shopifyOrderId: newId,
        orderName: "#9999",
        createdAt: new Date("2026-04-20T10:00:00Z"),
        updatedAt: new Date("2026-04-20T10:00:00Z"),
        totalAmount: 99,
        currency: "EUR",
        financialStatus: "paid",
        rawTags: [],
        marketplaceDetected: "DIRECT",
        isRefunded: false,
        refundedAmount: 0,
        netAmount: 99,
        isCancelled: false,
        isTest: false,
        lineItemsCount: 0,
      },
      { updatedAt: new Date("2026-04-20T10:00:00Z"), syncedAt: new Date() },
      newId
    );

    const found = await findOrderByShopifyId(db.prisma, newId);
    expect(found).not.toBeNull();
    expect(found?.orderName).toBe("#9999");
    expect(found?.totalAmount).toBe(99);
  });

  it("updates an existing order on conflict", async () => {
    const existingId = "gid://shopify/Order/1003";
    await upsertShopifyOrder(
      db.prisma,
      {
        shopifyOrderId: existingId,
        orderName: "#1003",
        createdAt: new Date("2026-04-10T09:00:00Z"),
        updatedAt: new Date("2026-04-10T09:00:00Z"),
        totalAmount: 50,
        currency: "EUR",
        financialStatus: "paid",
        rawTags: ["REDCARE_IT"],
        marketplaceDetected: "REDCARE_IT",
        isRefunded: false,
        refundedAmount: 0,
        netAmount: 50,
        isCancelled: false,
        isTest: false,
        lineItemsCount: 1,
      },
      { totalAmount: 75, syncedAt: new Date() },
      existingId
    );

    const found = await findOrderByShopifyId(db.prisma, existingId);
    expect(found?.totalAmount).toBe(75);
  });
});

// ─── updateOrderMarketplace ───────────────────────────────────────────────────

describe("updateOrderMarketplace", () => {
  it("updates marketplace and reason on an existing order", async () => {
    const existing = await db.prisma.shopifyOrder.findFirst({
      where: { shopifyOrderId: "gid://shopify/Order/1009" },
    });
    expect(existing).not.toBeNull();

    await updateOrderMarketplace(
      db.prisma,
      existing!.id,
      "REDCARE_IT",
      "test-override"
    );

    const updated = await findOrderByShopifyId(
      db.prisma,
      "gid://shopify/Order/1009"
    );
    expect(updated?.marketplaceDetected).toBe("REDCARE_IT");
    expect(updated?.marketplaceDetectionReason).toBe("test-override");
  });
});

// ─── correctOrderDate ──────────────────────────────────────────────────────────

describe("correctOrderDate", () => {
  it("corrects createdAt and cascades to all line items' orderDate, returning the previous value", async () => {
    const order = await db.prisma.shopifyOrder.create({
      data: {
        ...sampleShopifyOrders[0],
        shopifyOrderId: "gid://shopify/Order/CORR1",
        createdAt: new Date("2026-08-24T07:41:00Z"), // giorno del sync (sbagliato)
        lineItems: {
          create: [
            {
              shopifyLineItemId: "li-corr1-a",
              shopifyProductId: "p1",
              productTitle: "Prodotto A",
              quantity: 1,
              unitPrice: 10,
              originalUnitPrice: 10,
              lineTotal: 10,
              orderDate: new Date("2026-08-24T07:41:00Z"),
            },
            {
              shopifyLineItemId: "li-corr1-b",
              shopifyProductId: "p2",
              productTitle: "Prodotto B",
              quantity: 1,
              unitPrice: 5,
              originalUnitPrice: 5,
              lineTotal: 5,
              orderDate: new Date("2026-08-24T07:41:00Z"),
            },
          ],
        },
      },
    });

    const realDate = new Date("2026-08-18T18:14:50Z");
    const result = await correctOrderDate(db.prisma, "gid://shopify/Order/CORR1", realDate);

    expect(result).toEqual({ previousCreatedAt: new Date("2026-08-24T07:41:00Z") });

    const updatedOrder = await db.prisma.shopifyOrder.findUnique({
      where: { id: order.id },
      include: { lineItems: true },
    });
    expect(updatedOrder!.createdAt).toEqual(realDate);
    expect(updatedOrder!.lineItems).toHaveLength(2);
    for (const li of updatedOrder!.lineItems) {
      expect(li.orderDate).toEqual(realDate);
    }
  });

  it("is a no-op (returns null) when the order already has the given date", async () => {
    const realDate = new Date("2026-08-18T18:14:50Z");
    await db.prisma.shopifyOrder.create({
      data: { ...sampleShopifyOrders[0], shopifyOrderId: "gid://shopify/Order/CORR2", createdAt: realDate },
    });

    const result = await correctOrderDate(db.prisma, "gid://shopify/Order/CORR2", realDate);

    expect(result).toBeNull();
  });

  it("returns null for an unknown shopifyOrderId instead of throwing", async () => {
    const result = await correctOrderDate(db.prisma, "gid://shopify/Order/DOES-NOT-EXIST", new Date());
    expect(result).toBeNull();
  });
});
