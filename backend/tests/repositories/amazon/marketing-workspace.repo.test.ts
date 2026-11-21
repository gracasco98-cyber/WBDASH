import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAmazonAccount, setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { upsertAdvertisedProductSnapshot } from "../../../src/repositories/amazon/ad-spend.repo";
import {
  findDailyProductMetrics,
  findMarketingWorkspace,
  upsertMarketingWorkspace,
} from "../../../src/repositories/amazon/marketing-workspace.repo";

let db: TestDb;
let accountId: string;
let productId: string;

beforeAll(async () => { db = await setupTestDb(); });
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
  productId = (await db.prisma.product.create({ data: { name: "VENAVIL" } })).id;
});

describe("marketing-workspace.repo", () => {
  it("persists the editable workbook per account, product and marketplace", async () => {
    await runWithAccount(accountId, async () => {
      await upsertMarketingWorkspace(db.prisma, {
        productId, marketplace: "IT",
        workbook: { rows: [{ id: "2026-11-17", date: "2026-11-17", cells: { A: "2026-11-17", B: "Inizio lancio" } }], hiddenColumns: [], deletedRowIds: [] },
      });
      const stored = await findMarketingWorkspace(db.prisma, productId, "IT");
      expect(stored?.workbook).toMatchObject({ rows: [{ cells: { B: "Inizio lancio" } }] });
    });
  });

  it("merges order sales with true promoted PPC units instead of purchase count", async () => {
    await db.prisma.amazonOrder.create({
      data: {
        amazonAccountId: accountId, amazonOrderId: "ORDER-1",
        purchaseDate: new Date("2026-11-17T10:00:00Z"), lastUpdatedDate: new Date("2026-11-17T10:00:00Z"),
        orderStatus: "Shipped", marketplace: "IT", itemTotal: 39.8,
        items: { create: [{ orderItemId: "ITEM-1", asin: "B0D8V3N45", productTitle: "VENAVIL", quantityOrdered: 2, itemPrice: 32.62, itemTax: 7.18, marketplace: "IT", purchaseDate: new Date("2026-11-17T10:00:00Z") }] },
      },
    });
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-11-17T00:00:00Z"), marketplace: "IT", asin: "B0D8V3N45", campaignId: "C1",
        spend: 12.5, sales: 60, impressions: 500, clicks: 20, orders: 3, units: 5,
      });
      const rows = await findDailyProductMetrics(db.prisma, {
        asin: "B0D8V3N45", marketplace: "IT",
        from: new Date("2026-11-17T00:00:00Z"), to: new Date("2026-11-17T23:59:59Z"),
      });
      expect(rows).toEqual([expect.objectContaining({ date: "2026-11-17", sales: 39.8, units: 2, ppcSpend: 12.5, ppcSales: 60, ppcUnits: 5 })]);
    });
  });
});
