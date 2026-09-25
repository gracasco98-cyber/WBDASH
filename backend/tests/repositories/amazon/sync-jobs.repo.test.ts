/**
 * sync-jobs.repo.test.ts — Integration tests for the AmazonSyncJob repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import {
  createSyncJob,
  finishSyncJob,
  findRecentSyncJobs,
  countSyncJobsByStatus,
  findLatestCompletedSyncJobEnd,
} from "../../../src/repositories/amazon/sync-jobs.repo";

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

// ─── createSyncJob ────────────────────────────────────────────────────────────

describe("createSyncJob", () => {
  it("creates a job with status=running and returns an ID", async () => {
    await runWithAccount(accountId, async () => {
      const id = await createSyncJob(db.prisma, {
        jobType:    "orders_backfill",
        marketplace: "IT",
        dateFrom:   new Date("2026-04-01"),
        dateTo:     new Date("2026-04-30"),
      });
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);

      const job = await db.prisma.amazonSyncJob.findUnique({ where: { id } });
      expect(job).not.toBeNull();
      expect(job!.status).toBe("running");
      expect(job!.jobType).toBe("orders_backfill");
    });
  });
});

// ─── finishSyncJob ────────────────────────────────────────────────────────────

describe("finishSyncJob", () => {
  it("marks a job as done with stats", async () => {
    await runWithAccount(accountId, async () => {
      const id = await createSyncJob(db.prisma, {
        jobType:    "orders_incremental",
        marketplace: "ALL_EU",
        dateFrom:   new Date("2026-04-14"),
        dateTo:     new Date("2026-04-15"),
      });
      await finishSyncJob(db.prisma, id, {
        recordsIn: 100, recordsImported: 90, recordsUpdated: 8, recordsRejected: 2,
      });
      const job = await db.prisma.amazonSyncJob.findUnique({ where: { id } });
      expect(job!.status).toBe("done");
      expect(job!.recordsImported).toBe(90);
      expect(job!.completedAt).not.toBeNull();
      expect(job!.errorMessage).toBeNull();
    });
  });

  it("marks a job as failed with error message", async () => {
    await runWithAccount(accountId, async () => {
      const id = await createSyncJob(db.prisma, {
        jobType:    "orders_backfill",
        marketplace: "DE",
        dateFrom:   new Date("2026-04-01"),
        dateTo:     new Date("2026-04-30"),
      });
      await finishSyncJob(db.prisma, id, {
        recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0,
      }, "SP-API timeout");
      const job = await db.prisma.amazonSyncJob.findUnique({ where: { id } });
      expect(job!.status).toBe("failed");
      expect(job!.errorMessage).toBe("SP-API timeout");
    });
  });
});

// ─── findRecentSyncJobs ────────────────────────────────────────────────────────

describe("findRecentSyncJobs", () => {
  it("returns jobs ordered by startedAt DESC", async () => {
    await runWithAccount(accountId, async () => {
      const id1 = await createSyncJob(db.prisma, { jobType: "orders_backfill", marketplace: "IT", dateFrom: new Date("2026-04-01"), dateTo: new Date("2026-04-07") });
      const id2 = await createSyncJob(db.prisma, { jobType: "orders_incremental", marketplace: "ALL_EU", dateFrom: new Date("2026-04-14"), dateTo: new Date("2026-04-15") });

      const jobs = await findRecentSyncJobs(db.prisma);
      expect(jobs.length).toBe(2);
      // Most recent should be first
      expect(jobs[0].id).toBe(id2);
      expect(jobs[1].id).toBe(id1);
    });
  });

  it("respects the take limit", async () => {
    await runWithAccount(accountId, async () => {
      for (let i = 0; i < 5; i++) {
        await createSyncJob(db.prisma, { jobType: "test", marketplace: "IT", dateFrom: new Date(), dateTo: new Date() });
      }
      const jobs = await findRecentSyncJobs(db.prisma, 3);
      expect(jobs.length).toBe(3);
    });
  });
});

// ─── countSyncJobsByStatus ────────────────────────────────────────────────────

describe("countSyncJobsByStatus", () => {
  it("counts jobs by status", async () => {
    await runWithAccount(accountId, async () => {
      const id1 = await createSyncJob(db.prisma, { jobType: "test", marketplace: "IT", dateFrom: new Date(), dateTo: new Date() });
      const id2 = await createSyncJob(db.prisma, { jobType: "test", marketplace: "DE", dateFrom: new Date(), dateTo: new Date() });
      await createSyncJob(db.prisma, { jobType: "test", marketplace: "FR", dateFrom: new Date(), dateTo: new Date() });

      await finishSyncJob(db.prisma, id1, { recordsIn: 0, recordsImported: 10, recordsUpdated: 0, recordsRejected: 0 });
      await finishSyncJob(db.prisma, id2, { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 }, "error");

      const done   = await countSyncJobsByStatus(db.prisma, "done");
      const failed = await countSyncJobsByStatus(db.prisma, "failed");
      const running = await countSyncJobsByStatus(db.prisma, "running");

      expect(done).toBe(1);
      expect(failed).toBe(1);
      expect(running).toBe(1); // id3 still running
    });
  });
});

// ─── findLatestCompletedSyncJobEnd ────────────────────────────────────────────

describe("findLatestCompletedSyncJobEnd", () => {
  const stats = { recordsIn: 1, recordsImported: 1, recordsUpdated: 0, recordsRejected: 0 };
  const job = (jobType: string, dateTo: string) =>
    createSyncJob(db.prisma, { jobType, marketplace: "IT", dateFrom: new Date("2026-09-01T00:00:00Z"), dateTo: new Date(dateTo) });

  it("returns the end of the newest successful job of that type", async () => {
    await runWithAccount(accountId, async () => {
      await finishSyncJob(db.prisma, await job("ads_charges", "2026-09-20T00:00:00Z"), stats);
      await finishSyncJob(db.prisma, await job("ads_charges", "2026-09-24T00:00:00Z"), stats);
      await finishSyncJob(db.prisma, await job("ads_charges", "2026-09-25T00:00:00Z"), stats, "boom");
      await finishSyncJob(db.prisma, await job("orders_incremental", "2026-09-26T00:00:00Z"), stats);

      const end = await findLatestCompletedSyncJobEnd(db.prisma, "ads_charges");
      expect(end?.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    });
  });

  it("returns null when that job type never completed for the account", async () => {
    await runWithAccount(accountId, async () => {
      await job("ads_charges", "2026-09-24T00:00:00Z"); // still running
      expect(await findLatestCompletedSyncJobEnd(db.prisma, "ads_charges")).toBeNull();
    });
  });
});
