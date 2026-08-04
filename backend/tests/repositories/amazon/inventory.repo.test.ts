/**
 * inventory.repo.test.ts — Integration tests for the AmazonInventory repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { upsertAmazonInventory, findInventoryForAsins } from "../../../src/repositories/amazon/inventory.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

describe("findInventoryForAsins", () => {
  it("returns qtyTotal per asin+marketplace, filtered to the requested ASINs", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonInventory(db.prisma, {
        asin: "B0ABC123", sku: "SKU-RSV-01", marketplace: "IT",
        qtyAfn: 180, qtyMfn: 0, qtyInbound: 4, qtyReserved: 0, qtyTotal: 184,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });
      await upsertAmazonInventory(db.prisma, {
        asin: "B0OTHER", sku: "SKU-OTHER", marketplace: "IT",
        qtyAfn: 10, qtyMfn: 0, qtyInbound: 0, qtyReserved: 0, qtyTotal: 10,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
      });

      const rows = await findInventoryForAsins(db.prisma, { asins: ["B0ABC123"] });
      expect(rows).toEqual([{ asin: "B0ABC123", marketplace: "IT", qtyTotal: 184 }]);
    });
  });
});
