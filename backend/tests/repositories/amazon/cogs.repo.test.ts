import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { upsertCogs, findCogsForAsins, findAllCogsProducts } from "../../../src/repositories/amazon/cogs.repo";

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

describe("findAllCogsProducts", () => {
  it("returns all COGS rows for the current account when no marketplace is given", async () => {
    await runWithAccount(accountId, async () => {
      await upsertCogs(db.prisma, { asin: "B0ONE", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0.5 });
      await upsertCogs(db.prisma, { asin: "B0TWO", marketplace: "DE", cogsPerUnit: 9, shippingCost: 1 });

      const rows = await findAllCogsProducts(db.prisma, {});
      expect(rows.map((r: any) => r.asin).sort()).toEqual(["B0ONE", "B0TWO"]);
    });
  });

  it("includes ALL-marketplace records when a specific marketplace is requested", async () => {
    await runWithAccount(accountId, async () => {
      await upsertCogs(db.prisma, { asin: "B0IT", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0.5 });
      await upsertCogs(db.prisma, { asin: "B0ALL", marketplace: "ALL", cogsPerUnit: 3, shippingCost: 0.2 });
      await upsertCogs(db.prisma, { asin: "B0DE", marketplace: "DE", cogsPerUnit: 9, shippingCost: 1 });

      const rows = await findAllCogsProducts(db.prisma, { marketplace: "IT" });
      expect(rows.map((r: any) => r.asin).sort()).toEqual(["B0ALL", "B0IT"]);
    });
  });
});
