import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  deleteDailyAdSpend,
  findDailyAdSpends,
  upsertDailyAdSpend,
} from "../../../src/repositories/marketing/marketplaceAdSpend.repo";

let db: TestDb;
beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("MarketplaceAdSpend repository", () => {
  it("stores one current amount per marketplace and day", async () => {
    const spendDate = new Date("2026-09-06T00:00:00.000Z");
    const first = await upsertDailyAdSpend(db.prisma, {
      spendDate, marketplace: "REDCARE_IT", amount: 12.34,
    });
    const updated = await upsertDailyAdSpend(db.prisma, {
      spendDate, marketplace: "REDCARE_IT", amount: 20.5,
    });

    expect(updated.id).toBe(first.id);
    const rows = await findDailyAdSpends(db.prisma, {
      from: spendDate, to: spendDate, marketplace: "REDCARE_IT",
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(20.5);
  });

  it("writes an immutable audit record for updates and deletes", async () => {
    const row = await upsertDailyAdSpend(db.prisma, {
      spendDate: new Date("2026-09-05T00:00:00.000Z"),
      marketplace: "REDCARE_DE",
      amount: 9.99,
    });
    await deleteDailyAdSpend(db.prisma, row.id);

    const audit = await db.prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(audit.map((entry) => entry.action)).toEqual([
      "MARKETPLACE_AD_SPEND_UPSERT",
      "MARKETPLACE_AD_SPEND_DELETE",
    ]);
    expect(await findDailyAdSpends(db.prisma, {
      from: new Date("2026-09-05T00:00:00.000Z"),
      to: new Date("2026-09-05T00:00:00.000Z"),
    })).toEqual([]);
  });
});
