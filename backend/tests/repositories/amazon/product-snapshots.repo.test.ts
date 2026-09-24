/**
 * product-snapshots.repo.test.ts — Integration tests for the AmazonProductSnapshot repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import {
  upsertAmazonProductSnapshot,
  findProductSnapshotHistory,
  countAllAmazonProductSnapshots,
  findAmazonProductSnapshotDateRange,
} from "../../../src/repositories/amazon/product-snapshots.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

const BASE_SNAPSHOT = {
  snapshotDate:  new Date("2026-04-10T00:00:00.000Z"),
  asin:          "B0A1TEST001",
  sku:           "SKU-TEST-001",
  productTitle:  "Test Product A",
  marketplace:   "IT",
  unitsSold:     5,
  grossRevenue:  250,
  netRevenue:    250,
  orderCount:    3,
};

// ─── upsertAmazonProductSnapshot ─────────────────────────────────────────────

describe("upsertAmazonProductSnapshot", () => {
  it("creates a new snapshot", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonProductSnapshot(db.prisma, BASE_SNAPSHOT);
      const count = await db.prisma.amazonProductSnapshot.count();
      expect(count).toBe(1);
    });
  });

  it("updates an existing snapshot on re-upsert (same date+asin+marketplace)", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonProductSnapshot(db.prisma, BASE_SNAPSHOT);
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, unitsSold: 10, grossRevenue: 500 });

      const count = await db.prisma.amazonProductSnapshot.count();
      expect(count).toBe(1); // not duplicated

      const snap = await db.prisma.amazonProductSnapshot.findFirst({
        where: { asin: "B0A1TEST001", marketplace: "IT" },
      });
      expect(snap!.unitsSold).toBe(10);
      expect(snap!.grossRevenue).toBeCloseTo(500);
    });
  });

  it("creates separate snapshots for different marketplaces", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, marketplace: "IT" });
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, marketplace: "DE" });
      const count = await db.prisma.amazonProductSnapshot.count();
      expect(count).toBe(2);
    });
  });

  it("creates separate snapshots for different dates", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, snapshotDate: new Date("2026-04-10T00:00:00.000Z") });
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, snapshotDate: new Date("2026-04-11T00:00:00.000Z") });
      const count = await db.prisma.amazonProductSnapshot.count();
      expect(count).toBe(2);
    });
  });
});

// ─── findProductSnapshotHistory ───────────────────────────────────────────────

describe("findProductSnapshotHistory", () => {
  beforeEach(async () => {
    await runWithAccount(accountId, async () => {
      // Insert snapshots for two products over several days
      const dates = ["2026-04-08", "2026-04-09", "2026-04-10"];
      for (const d of dates) {
        await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, snapshotDate: new Date(`${d}T00:00:00.000Z`) });
        await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, asin: "B0A1TEST002", snapshotDate: new Date(`${d}T00:00:00.000Z`) });
      }
      // Older snapshot outside window
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, snapshotDate: new Date("2026-01-01T00:00:00.000Z") });
    });
  });

  it("returns snapshots for the requested ASIN from a date onwards", async () => {
    await runWithAccount(accountId, async () => {
      const snaps = await findProductSnapshotHistory(db.prisma, {
        asin: "B0A1TEST001",
        from: new Date("2026-04-08T00:00:00Z"),
      });
      expect(snaps.length).toBe(3);
      expect(snaps.every(s => s.asin === "B0A1TEST001")).toBe(true);
    });
  });

  it("returns snapshots ordered by snapshotDate ASC", async () => {
    await runWithAccount(accountId, async () => {
      const snaps = await findProductSnapshotHistory(db.prisma, {
        asin: "B0A1TEST001",
        from: new Date("2026-04-08T00:00:00Z"),
      });
      for (let i = 1; i < snaps.length; i++) {
        expect(snaps[i].snapshotDate.getTime()).toBeGreaterThanOrEqual(snaps[i - 1].snapshotDate.getTime());
      }
    });
  });

  it("excludes snapshots before the from date", async () => {
    await runWithAccount(accountId, async () => {
      const snaps = await findProductSnapshotHistory(db.prisma, {
        asin: "B0A1TEST001",
        from: new Date("2026-04-08T00:00:00Z"),
      });
      const dates = snaps.map(s => s.snapshotDate.toISOString().split("T")[0]);
      expect(dates).not.toContain("2026-01-01");
    });
  });

  it("filters by marketplace when provided", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, marketplace: "DE", snapshotDate: new Date("2026-04-10T00:00:00.000Z") });

      const snaps = await findProductSnapshotHistory(db.prisma, {
        asin:       "B0A1TEST001",
        from:       new Date("2026-04-01T00:00:00Z"),
        marketplace: "DE",
      });
      expect(snaps.every(s => s.marketplace === "DE")).toBe(true);
      expect(snaps.length).toBe(1);
    });
  });
});

// ─── countAllAmazonProductSnapshots ───────────────────────────────────────────

describe("countAllAmazonProductSnapshots", () => {
  it("returns 0 on empty DB", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countAllAmazonProductSnapshots(db.prisma);
      expect(count).toBe(0);
    });
  });

  it("returns correct count after upserts", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonProductSnapshot(db.prisma, BASE_SNAPSHOT);
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, asin: "B0A1TEST002" });
      const count = await countAllAmazonProductSnapshots(db.prisma);
      expect(count).toBe(2);
    });
  });
});

// ─── findAmazonProductSnapshotDateRange ───────────────────────────────────────

describe("findAmazonProductSnapshotDateRange", () => {
  it("returns null min/max when no snapshots exist", async () => {
    await runWithAccount(accountId, async () => {
      const range = await findAmazonProductSnapshotDateRange(db.prisma);
      expect(range.min).toBeNull();
      expect(range.max).toBeNull();
    });
  });

  it("returns the earliest and latest snapshotDate across all rows", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, snapshotDate: new Date("2026-04-10T00:00:00.000Z") });
      await upsertAmazonProductSnapshot(db.prisma, { ...BASE_SNAPSHOT, asin: "B0A1TEST002", snapshotDate: new Date("2026-04-12T00:00:00.000Z") });
      const range = await findAmazonProductSnapshotDateRange(db.prisma);
      expect(range.min?.toISOString()).toBe("2026-04-10T00:00:00.000Z");
      expect(range.max?.toISOString()).toBe("2026-04-12T00:00:00.000Z");
    });
  });
});
