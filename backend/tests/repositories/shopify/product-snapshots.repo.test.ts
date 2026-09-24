/**
 * product-snapshots.repo.test.ts — Integration tests for the ProductDailySnapshot repo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  findSnapshotsByProductId,
  upsertProductSnapshot,
} from "../../../src/repositories/shopify/product-snapshots.repo";

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
});

// Seed helper
async function seedSnapshot(opts: {
  date: string;
  productId: string;
  marketplace: string;
  unitsSold?: number;
  grossRevenue?: number;
}) {
  return db.prisma.productDailySnapshot.create({
    data: {
      snapshotDate: new Date(opts.date),
      shopifyProductId: opts.productId,
      marketplace: opts.marketplace,
      productTitle: "Test Product",
      unitsSold: opts.unitsSold ?? 1,
      grossRevenue: opts.grossRevenue ?? 10,
      refundedAmount: 0,
      netRevenue: opts.grossRevenue ?? 10,
      orderCount: 1,
    },
  });
}

// ─── findSnapshotsByProductId ─────────────────────────────────────────────────

describe("findSnapshotsByProductId", () => {
  it("returns snapshots for a product from a given date", async () => {
    await seedSnapshot({ date: "2026-04-01", productId: "prod-Z", marketplace: "REDCARE_IT", grossRevenue: 50 });
    await seedSnapshot({ date: "2026-04-05", productId: "prod-Z", marketplace: "REDCARE_IT", grossRevenue: 70 });
    await seedSnapshot({ date: "2026-03-01", productId: "prod-Z", marketplace: "REDCARE_IT", grossRevenue: 30 });

    const snapshots = await findSnapshotsByProductId(db.prisma, {
      shopifyProductId: "prod-Z",
      from: new Date("2026-04-01"),
    });

    expect(snapshots).toHaveLength(2);
    // Should be ordered ascending
    expect(snapshots[0].snapshotDate <= snapshots[1].snapshotDate).toBe(true);
    // Old snapshot should be excluded
    expect(snapshots.every((s) => s.snapshotDate >= new Date("2026-04-01"))).toBe(true);
  });

  it("filters by marketplace when provided", async () => {
    await seedSnapshot({ date: "2026-04-01", productId: "prod-MP", marketplace: "REDCARE_IT" });
    await seedSnapshot({ date: "2026-04-01", productId: "prod-MP", marketplace: "TEMU_IT" });

    const snapshots = await findSnapshotsByProductId(db.prisma, {
      shopifyProductId: "prod-MP",
      from: new Date("2026-04-01"),
      marketplace: "REDCARE_IT",
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].marketplace).toBe("REDCARE_IT");
  });

  it("returns empty array for unknown product", async () => {
    const snapshots = await findSnapshotsByProductId(db.prisma, {
      shopifyProductId: "non-existent",
      from: new Date("2026-01-01"),
    });
    expect(snapshots).toHaveLength(0);
  });
});

// ─── upsertProductSnapshot ────────────────────────────────────────────────────

describe("upsertProductSnapshot", () => {
  it("creates a new snapshot", async () => {
    await upsertProductSnapshot(db.prisma, {
      snapshotDate: new Date("2026-04-10"),
      shopifyProductId: "prod-new",
      marketplace: "DIRECT",
      create: {
        snapshotDate: new Date("2026-04-10"),
        shopifyProductId: "prod-new",
        productTitle: "New Product",
        marketplace: "DIRECT",
        unitsSold: 5,
        grossRevenue: 100,
        refundedAmount: 0,
        netRevenue: 100,
        orderCount: 3,
      },
      update: {
        unitsSold: 5,
        grossRevenue: 100,
        refundedAmount: 0,
        netRevenue: 100,
        orderCount: 3,
      },
    });

    const snapshots = await findSnapshotsByProductId(db.prisma, {
      shopifyProductId: "prod-new",
      from: new Date("2026-04-10"),
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].unitsSold).toBe(5);
    expect(snapshots[0].grossRevenue).toBe(100);
  });

  it("updates an existing snapshot on conflict", async () => {
    // Pre-seed
    await db.prisma.productDailySnapshot.create({
      data: {
        snapshotDate: new Date("2026-04-10"),
        shopifyProductId: "prod-upd",
        marketplace: "DIRECT",
        productTitle: "Update Product",
        unitsSold: 1,
        grossRevenue: 20,
        refundedAmount: 0,
        netRevenue: 20,
        orderCount: 1,
      },
    });

    await upsertProductSnapshot(db.prisma, {
      snapshotDate: new Date("2026-04-10"),
      shopifyProductId: "prod-upd",
      marketplace: "DIRECT",
      create: {
        snapshotDate: new Date("2026-04-10"),
        shopifyProductId: "prod-upd",
        productTitle: "Update Product",
        marketplace: "DIRECT",
        unitsSold: 10,
        grossRevenue: 200,
        refundedAmount: 0,
        netRevenue: 200,
        orderCount: 5,
      },
      update: {
        unitsSold: 10,
        grossRevenue: 200,
        refundedAmount: 0,
        netRevenue: 200,
        orderCount: 5,
      },
    });

    const snapshots = await findSnapshotsByProductId(db.prisma, {
      shopifyProductId: "prod-upd",
      from: new Date("2026-04-10"),
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].unitsSold).toBe(10);
    expect(snapshots[0].grossRevenue).toBe(200);
  });
});
