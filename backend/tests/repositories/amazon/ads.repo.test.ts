/**
 * ads.repo.test.ts — Integration tests for the AmazonAdSnapshot date-range repository function.
 * (countAllAdSnapshots and other pre-existing functions in this file are not yet covered —
 * out of scope for this refactor; this file only tests the function added here.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { findAmazonAdSnapshotDateRange } from "../../../src/repositories/amazon/ads.repo";

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
});

describe("findAmazonAdSnapshotDateRange", () => {
  it("returns null min/max when no ad snapshots exist", async () => {
    await runWithAccount(accountId, async () => {
      const range = await findAmazonAdSnapshotDateRange(db.prisma);
      expect(range.min).toBeNull();
      expect(range.max).toBeNull();
    });
  });

  it("returns the earliest and latest snapshotDate across all rows", async () => {
    await db.prisma.amazonAdSnapshot.create({
      data: {
        amazonAccountId: accountId,
        snapshotDate: new Date("2026-04-10T00:00:00.000Z"),
        marketplace: "IT",
        campaignId: "camp-1",
        campaignName: "Campaign 1",
      },
    });
    await db.prisma.amazonAdSnapshot.create({
      data: {
        amazonAccountId: accountId,
        snapshotDate: new Date("2026-04-14T00:00:00.000Z"),
        marketplace: "IT",
        campaignId: "camp-2",
        campaignName: "Campaign 2",
      },
    });

    await runWithAccount(accountId, async () => {
      const range = await findAmazonAdSnapshotDateRange(db.prisma);
      expect(range.min?.toISOString()).toBe("2026-04-10T00:00:00.000Z");
      expect(range.max?.toISOString()).toBe("2026-04-14T00:00:00.000Z");
    });
  });
});
