import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { upsertCogs, findCogsForAsins } from "../../../src/repositories/amazon/cogs.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

describe("findCogsForAsins with marketplace=all", () => {
  it("returns COGS rows for every marketplace, not just IT", async () => {
    await runWithAccount(accountId, async () => {
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0.5 });
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "DE", cogsPerUnit: 9, shippingCost: 1 });

      const rows = await findCogsForAsins(db.prisma, { asins: ["B0ABC123"], marketplace: "all" });
      const marketplaces = rows.map((r: any) => r.marketplace).sort();
      expect(marketplaces).toEqual(["DE", "IT"]);
    });
  });

  it("still returns only the requested marketplace + ALL fallback when a specific marketplace is passed", async () => {
    await runWithAccount(accountId, async () => {
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0.5 });
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "DE", cogsPerUnit: 9, shippingCost: 1 });

      const rows = await findCogsForAsins(db.prisma, { asins: ["B0ABC123"], marketplace: "DE" });
      const marketplaces = rows.map((r: any) => r.marketplace).sort();
      expect(marketplaces).toEqual(["DE"]);
    });
  });
});
