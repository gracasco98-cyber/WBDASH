/**
 * line-items.repo.test.ts — Integration tests for the OrderLineItem repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  groupLineItemsByProduct,
  groupLineItemsForSnapshot,
  findLineItemSample,
  upsertLineItem,
} from "../../../src/repositories/shopify/line-items.repo";

let db: TestDb;

// Seed: one order + two line items
const ORDER_ID_PLACEHOLDER = ""; // filled after insert

beforeAll(async () => {
  db = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await db.cleanup();
});

// Helper: create an order and return its DB id
async function seedOrder(): Promise<string> {
  const order = await db.prisma.shopifyOrder.create({
    data: {
      shopifyOrderId: "gid://shopify/Order/LI-1",
      orderName: "#LI-1",
      createdAt: new Date("2026-04-10T09:00:00Z"),
      updatedAt: new Date("2026-04-10T09:00:00Z"),
      totalAmount: 60,
      currency: "EUR",
      financialStatus: "paid",
      rawTags: ["REDCARE_IT"],
      marketplaceDetected: "REDCARE_IT",
      isRefunded: false,
      refundedAmount: 0,
      netAmount: 60,
      isCancelled: false,
      isTest: false,
      lineItemsCount: 2,
    },
  });
  return order.id;
}

beforeEach(async () => {
  await truncateAll(db.prisma);
});

// ─── upsertLineItem ───────────────────────────────────────────────────────────

describe("upsertLineItem", () => {
  it("inserts a new line item", async () => {
    const orderId = await seedOrder();
    await upsertLineItem(
      db.prisma,
      "li-001",
      {
        shopifyLineItemId: "li-001",
        orderId,
        shopifyProductId: "prod-A",
        productTitle: "Product A",
        quantity: 2,
        unitPrice: 15,
        originalUnitPrice: 15,
        lineTotal: 30,
        currency: "EUR",
        marketplace: "REDCARE_IT",
        orderDate: new Date("2026-04-10T09:00:00Z"),
      },
      { quantity: 2 }
    );

    const found = await db.prisma.orderLineItem.findUnique({
      where: { shopifyLineItemId: "li-001" },
    });
    expect(found).not.toBeNull();
    expect(found?.productTitle).toBe("Product A");
    expect(found?.quantity).toBe(2);
  });

  it("updates an existing line item on conflict", async () => {
    const orderId = await seedOrder();
    // Insert first
    await db.prisma.orderLineItem.create({
      data: {
        shopifyLineItemId: "li-002",
        orderId,
        shopifyProductId: "prod-B",
        productTitle: "Product B",
        quantity: 1,
        unitPrice: 20,
        originalUnitPrice: 20,
        lineTotal: 20,
        currency: "EUR",
        marketplace: "REDCARE_IT",
        orderDate: new Date("2026-04-10T09:00:00Z"),
      },
    });

    // Upsert with updated quantity
    await upsertLineItem(
      db.prisma,
      "li-002",
      {
        shopifyLineItemId: "li-002",
        orderId,
        shopifyProductId: "prod-B",
        productTitle: "Product B",
        quantity: 3,
        unitPrice: 20,
        originalUnitPrice: 20,
        lineTotal: 60,
        currency: "EUR",
        marketplace: "REDCARE_IT",
        orderDate: new Date("2026-04-10T09:00:00Z"),
      },
      { quantity: 3, lineTotal: 60 }
    );

    const found = await db.prisma.orderLineItem.findUnique({
      where: { shopifyLineItemId: "li-002" },
    });
    expect(found?.quantity).toBe(3);
    expect(found?.lineTotal).toBe(60);
  });
});

// ─── groupLineItemsByProduct ──────────────────────────────────────────────────

describe("groupLineItemsByProduct", () => {
  it("returns grouped product sums within date range", async () => {
    const orderId = await seedOrder();
    await db.prisma.orderLineItem.createMany({
      data: [
        {
          shopifyLineItemId: "g-001",
          orderId,
          shopifyProductId: "prod-X",
          productTitle: "Product X",
          quantity: 2,
          unitPrice: 10,
          originalUnitPrice: 10,
          lineTotal: 20,
          currency: "EUR",
          marketplace: "REDCARE_IT",
          orderDate: new Date("2026-04-10T09:00:00Z"),
        },
        {
          shopifyLineItemId: "g-002",
          orderId,
          shopifyProductId: "prod-X",
          productTitle: "Product X",
          quantity: 3,
          unitPrice: 10,
          originalUnitPrice: 10,
          lineTotal: 30,
          currency: "EUR",
          marketplace: "REDCARE_IT",
          orderDate: new Date("2026-04-11T09:00:00Z"),
        },
      ],
    });

    const groups = await groupLineItemsByProduct(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"),
      to: new Date("2026-04-11T23:59:59Z"),
    });

    const productX = groups.find(
      (g) => g.shopifyProductId === "prod-X" && g.marketplace === "REDCARE_IT"
    );
    expect(productX).toBeDefined();
    expect(productX!._sum.quantity).toBe(5);
    expect(productX!._sum.lineTotal).toBe(50);
  });

  it("excludes line items belonging to Shopify test orders", async () => {
    const orderId = await seedOrder();
    await db.prisma.shopifyOrder.update({ where: { id: orderId }, data: { isTest: true } });
    await db.prisma.orderLineItem.create({
      data: {
        shopifyLineItemId: "test-001", orderId, shopifyProductId: "prod-test",
        productTitle: "Test product", quantity: 9, unitPrice: 10, originalUnitPrice: 10,
        lineTotal: 90, currency: "EUR", marketplace: "REDCARE_IT",
        orderDate: new Date("2026-04-10T09:00:00Z"),
      },
    });
    const groups = await groupLineItemsByProduct(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"), to: new Date("2026-04-10T23:59:59Z"),
    });
    expect(groups).toHaveLength(0);
  });

  it("filters by marketplace", async () => {
    const orderId = await seedOrder();
    await db.prisma.orderLineItem.createMany({
      data: [
        {
          shopifyLineItemId: "mp-001",
          orderId,
          shopifyProductId: "prod-Y",
          productTitle: "Product Y",
          quantity: 1,
          unitPrice: 5,
          originalUnitPrice: 5,
          lineTotal: 5,
          currency: "EUR",
          marketplace: "TEMU_IT",
          orderDate: new Date("2026-04-10T09:00:00Z"),
        },
        {
          shopifyLineItemId: "mp-002",
          orderId,
          shopifyProductId: "prod-Y",
          productTitle: "Product Y",
          quantity: 2,
          unitPrice: 5,
          originalUnitPrice: 5,
          lineTotal: 10,
          currency: "EUR",
          marketplace: "REDCARE_IT",
          orderDate: new Date("2026-04-10T09:00:00Z"),
        },
      ],
    });

    const groups = await groupLineItemsByProduct(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"),
      to: new Date("2026-04-10T23:59:59Z"),
      marketplace: "REDCARE_IT",
    });

    expect(groups.every((g) => g.marketplace === "REDCARE_IT")).toBe(true);
  });
});

// ─── groupLineItemsForSnapshot ────────────────────────────────────────────────

describe("groupLineItemsForSnapshot", () => {
  it("aggregates line items for the snapshot computation", async () => {
    const orderId = await seedOrder();
    await db.prisma.orderLineItem.createMany({
      data: [
        {
          shopifyLineItemId: "snap-001",
          orderId,
          shopifyProductId: "snap-prod",
          productTitle: "Snap Product",
          quantity: 4,
          unitPrice: 25,
          originalUnitPrice: 25,
          lineTotal: 100,
          currency: "EUR",
          marketplace: "REDCARE_IT",
          orderDate: new Date("2026-04-10T09:00:00Z"),
        },
      ],
    });

    const groups = await groupLineItemsForSnapshot(db.prisma, {
      from: new Date("2026-04-10T00:00:00Z"),
      to: new Date("2026-04-10T23:59:59Z"),
    });

    const g = groups.find((r) => r.shopifyProductId === "snap-prod");
    expect(g).toBeDefined();
    expect(g!._sum.quantity).toBe(4);
    expect(g!._sum.lineTotal).toBe(100);
  });
});

// ─── findLineItemSample ───────────────────────────────────────────────────────

describe("findLineItemSample", () => {
  it("returns sample data for a product+marketplace combination", async () => {
    const orderId = await seedOrder();
    await db.prisma.orderLineItem.create({
      data: {
        shopifyLineItemId: "samp-001",
        orderId,
        shopifyProductId: "prod-sample",
        productTitle: "Sample Product",
        sku: "SKU-001",
        imageUrl: "https://example.com/img.jpg",
        quantity: 1,
        unitPrice: 10,
        originalUnitPrice: 10,
        lineTotal: 10,
        currency: "EUR",
        marketplace: "REDCARE_IT",
        orderDate: new Date("2026-04-10T09:00:00Z"),
      },
    });

    const sample = await findLineItemSample(db.prisma, {
      shopifyProductId: "prod-sample",
      marketplace: "REDCARE_IT",
      from: new Date("2026-04-10T00:00:00Z"),
      to: new Date("2026-04-10T23:59:59Z"),
    });

    expect(sample).not.toBeNull();
    expect(sample?.productTitle).toBe("Sample Product");
    expect(sample?.sku).toBe("SKU-001");
    expect(sample?.imageUrl).toBe("https://example.com/img.jpg");
  });

  it("returns null when no matching line item exists", async () => {
    const sample = await findLineItemSample(db.prisma, {
      shopifyProductId: "non-existent",
      marketplace: "REDCARE_IT",
      from: new Date("2026-04-10T00:00:00Z"),
      to: new Date("2026-04-10T23:59:59Z"),
    });
    expect(sample).toBeNull();
  });
});
