/**
 * ads.repo.test.ts — Integration tests for the AmazonAdSnapshot date-range and
 * AmazonAdSearchTerm repository functions added during the E.1 repository-layer
 * cleanup. (countAllAdSnapshots and other pre-existing functions in this file
 * are not yet covered — out of scope for this refactor.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import {
  findAmazonAdSnapshotDateRange,
  findAdSnapshotCampaignNames,
  findLatestAdSearchTermSync,
  findAdSearchTerms,
} from "../../../src/repositories/amazon/ads.repo";

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

// ─── findAdSnapshotCampaignNames ───────────────────────────────────────────────

describe("findAdSnapshotCampaignNames", () => {
  it("returns the most recent campaignName per (campaignId, marketplace)", async () => {
    await db.prisma.amazonAdSnapshot.create({
      data: {
        amazonAccountId: accountId, snapshotDate: new Date("2026-04-10"),
        marketplace: "IT", campaignId: "camp-1", campaignName: "Old Name",
      },
    });
    await db.prisma.amazonAdSnapshot.create({
      data: {
        amazonAccountId: accountId, snapshotDate: new Date("2026-04-14"),
        marketplace: "IT", campaignId: "camp-1", campaignName: "New Name",
      },
    });

    await runWithAccount(accountId, async () => {
      const rows = await findAdSnapshotCampaignNames(db.prisma, {});
      const row = rows.find(r => r.campaignId === "camp-1");
      expect(row?.campaignName).toBe("New Name");
    });
  });

  it("filters by marketplace when provided", async () => {
    await db.prisma.amazonAdSnapshot.createMany({
      data: [
        { amazonAccountId: accountId, snapshotDate: new Date("2026-04-10"), marketplace: "IT", campaignId: "camp-it", campaignName: "IT Campaign" },
        { amazonAccountId: accountId, snapshotDate: new Date("2026-04-10"), marketplace: "DE", campaignId: "camp-de", campaignName: "DE Campaign" },
      ],
    });

    await runWithAccount(accountId, async () => {
      const rows = await findAdSnapshotCampaignNames(db.prisma, { marketplace: "IT" });
      expect(rows.map(r => r.campaignId)).toEqual(["camp-it"]);
    });
  });
});

// ─── findLatestAdSearchTermSync + findAdSearchTerms ────────────────────────────

const baseSearchTerm = {
  query: "vitamin d", keywordText: "vitamin d", matchType: "exact",
  campaignId: "camp-1", campaignName: "Campaign 1", adGroupId: "ag-1",
  dateFrom: "2026-04-01", dateTo: "2026-04-30",
  impressions: 100, clicks: 10, spend: 5, sales: 20, orders: 2,
  acos: 25, roas: 4, ctr: 10, cpc: 0.5, isWasted: false,
};

describe("findLatestAdSearchTermSync", () => {
  it("returns null when no search term sync has ever run", async () => {
    await runWithAccount(accountId, async () => {
      const latest = await findLatestAdSearchTermSync(db.prisma, {});
      expect(latest).toBeNull();
    });
  });

  it("returns the most recent sync's date range and timestamp", async () => {
    await db.prisma.amazonAdSearchTerm.create({
      data: { ...baseSearchTerm, amazonAccountId: accountId, marketplace: "IT", syncedAt: new Date("2026-04-01T00:00:00Z") },
    });
    await db.prisma.amazonAdSearchTerm.create({
      data: { ...baseSearchTerm, amazonAccountId: accountId, marketplace: "IT", query: "vitamin c", dateFrom: "2026-05-01", dateTo: "2026-05-31", syncedAt: new Date("2026-05-01T00:00:00Z") },
    });

    await runWithAccount(accountId, async () => {
      const latest = await findLatestAdSearchTermSync(db.prisma, { marketplace: "IT" });
      expect(latest?.dateFrom).toBe("2026-05-01");
      expect(latest?.dateTo).toBe("2026-05-31");
    });
  });
});

describe("findAdSearchTerms", () => {
  it("returns rows for the exact period, sorted by the requested field", async () => {
    await db.prisma.amazonAdSearchTerm.create({
      data: { ...baseSearchTerm, amazonAccountId: accountId, marketplace: "IT", query: "low spend", spend: 1 },
    });
    await db.prisma.amazonAdSearchTerm.create({
      data: { ...baseSearchTerm, amazonAccountId: accountId, marketplace: "IT", query: "high spend", spend: 50 },
    });

    await runWithAccount(accountId, async () => {
      const rows = await findAdSearchTerms(db.prisma, {
        dateFrom: "2026-04-01", dateTo: "2026-04-30", sortBy: "spend", sortDir: "desc",
      });
      expect(rows.map(r => r.query)).toEqual(["high spend", "low spend"]);
    });
  });

  it("falls back to sorting by spend when sortBy is not in the allow-list", async () => {
    await db.prisma.amazonAdSearchTerm.create({
      data: { ...baseSearchTerm, amazonAccountId: accountId, marketplace: "IT", query: "a", spend: 5 },
    });

    await runWithAccount(accountId, async () => {
      // "amazonAccountId" is not a valid sort field — must not be passed through as an ORDER BY key
      const rows = await findAdSearchTerms(db.prisma, {
        dateFrom: "2026-04-01", dateTo: "2026-04-30", sortBy: "amazonAccountId", sortDir: "desc",
      });
      expect(rows).toHaveLength(1);
    });
  });

  it("filters by wastedOnly", async () => {
    await db.prisma.amazonAdSearchTerm.create({
      data: { ...baseSearchTerm, amazonAccountId: accountId, marketplace: "IT", query: "wasted", isWasted: true },
    });
    await db.prisma.amazonAdSearchTerm.create({
      data: { ...baseSearchTerm, amazonAccountId: accountId, marketplace: "IT", query: "not wasted", isWasted: false },
    });

    await runWithAccount(accountId, async () => {
      const rows = await findAdSearchTerms(db.prisma, {
        dateFrom: "2026-04-01", dateTo: "2026-04-30", wastedOnly: true, sortBy: "spend", sortDir: "desc",
      });
      expect(rows.map(r => r.query)).toEqual(["wasted"]);
    });
  });
});
