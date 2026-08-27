import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { upsertAdvertisedProductSnapshot, findAdSpendForAsins } from "../../../src/repositories/amazon/ad-spend.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

describe("ad-spend.repo", () => {
  it("upserts a snapshot and sums spend per ASIN+marketplace across the date range", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 10, sales: 100, impressions: 500, clicks: 20, orders: 3,
      });
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-02"), marketplace: "IT", asin: "B0ABC123", campaignId: "C2",
        spend: 5, sales: 50, impressions: 200, clicks: 8, orders: 1,
      });

      const rows = await findAdSpendForAsins(db.prisma, {
        asins: ["B0ABC123"], dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-03"),
      });
      expect(rows).toEqual([{ asin: "B0ABC123", marketplace: "IT", spend: 15 }]);
    });
  });

  it("re-upserting the same snapshotDate+marketplace+asin+campaignId updates instead of duplicating", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 10, sales: 100, impressions: 500, clicks: 20, orders: 3,
      });
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 12, sales: 110, impressions: 550, clicks: 22, orders: 4,
      });

      const rows = await findAdSpendForAsins(db.prisma, {
        asins: ["B0ABC123"], dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-01"),
      });
      expect(rows).toEqual([{ asin: "B0ABC123", marketplace: "IT", spend: 12 }]);
    });
  });

  it("does not include yesterday when an Italy-local single-day range starts on the previous UTC date", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-26T00:00:00.000Z"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 91.78, sales: 100, impressions: 500, clicks: 20, orders: 3,
      });
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-27T00:00:00.000Z"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 49.96, sales: 50, impressions: 200, clicks: 8, orders: 1,
      });

      // 27 August in Italy (CEST) is 26 Aug 22:00Z through 27 Aug 21:59Z.
      // AmazonAdvertisedProductSnapshot.snapshotDate is a SQL DATE, so passing
      // these instants directly makes Prisma truncate the lower bound to
      // 2026-08-26 and incorrectly returns 91.78 + 49.96 = 141.74.
      const rows = await findAdSpendForAsins(db.prisma, {
        asins: ["B0ABC123"],
        dateFrom: new Date("2026-08-26T22:00:00.000Z"),
        dateTo: new Date("2026-08-27T21:59:59.999Z"),
      });

      expect(rows).toEqual([{ asin: "B0ABC123", marketplace: "IT", spend: 49.96 }]);
    });
  });

  it("filters by marketplace when provided", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 10, sales: 100, impressions: 500, clicks: 20, orders: 3,
      });
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "DE", asin: "B0ABC123", campaignId: "C1",
        spend: 7, sales: 70, impressions: 300, clicks: 12, orders: 2,
      });

      const rows = await findAdSpendForAsins(db.prisma, {
        asins: ["B0ABC123"], marketplace: "DE", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-01"),
      });
      expect(rows).toEqual([{ asin: "B0ABC123", marketplace: "DE", spend: 7 }]);
    });
  });

  it("keeps the same ASIN's spend separate per marketplace when no marketplace filter is given", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 10, sales: 100, impressions: 500, clicks: 20, orders: 3,
      });
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "DE", asin: "B0ABC123", campaignId: "C1",
        spend: 7, sales: 70, impressions: 300, clicks: 12, orders: 2,
      });

      const rows = await findAdSpendForAsins(db.prisma, {
        asins: ["B0ABC123"], marketplace: "all", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-01"),
      });
      expect(rows).toHaveLength(2);
      expect(rows).toContainEqual({ asin: "B0ABC123", marketplace: "IT", spend: 10 });
      expect(rows).toContainEqual({ asin: "B0ABC123", marketplace: "DE", spend: 7 });
    });
  });
});
