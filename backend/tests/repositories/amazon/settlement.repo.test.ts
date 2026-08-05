/**
 * settlement.repo.test.ts — Integration tests for the AmazonSettlement + AmazonSettlementTransaction
 * repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { sampleSettlements, sampleSettlementTransactions } from "../../fixtures/amazon-settlements.fixture";
import {
  upsertAmazonSettlement,
  findSettlementNearDate,
  deleteSettlementTransactions,
  createSettlementTransactions,
  findTransactionsForOrders,
  findTransactionsForAsins,
  countSettlementTransactions,
  computeHistoricalFeeRatiosByMarketplace,
  computeSettlementRatiosForCalibration,
  findSettlementOrderGroups,
  countSettlementOrderGroups,
  findNonOrderMovements,
  findSettlementHeader,
  computeSettlementReconciliation,
  findCrossSettlementOrders,
} from "../../../src/repositories/amazon/settlement.repo";

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

// ─── upsertAmazonSettlement ───────────────────────────────────────────────────

describe("upsertAmazonSettlement", () => {
  it("creates a new settlement header", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonSettlement(db.prisma, {
        settlementId: "SETT-TEST-001",
        marketplace:  "IT",
        totalAmount:  500,
        startDate:    new Date("2026-04-01"),
        endDate:      new Date("2026-04-14"),
        currency:     "EUR",
      });
      const recs = await (db.prisma as any).amazonSettlement.findUnique({
        where: { amazonAccountId_settlementId: { amazonAccountId: accountId, settlementId: "SETT-TEST-001" } },
      });
      expect(recs).not.toBeNull();
      expect(recs.totalAmount).toBe(500);
      expect(recs.marketplace).toBe("IT");
    });
  });

  it("updates existing settlement on re-upsert", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAmazonSettlement(db.prisma, {
        settlementId: "SETT-TEST-001",
        marketplace:  "IT",
        totalAmount:  500,
        startDate:    new Date("2026-04-01"),
        endDate:      new Date("2026-04-14"),
        currency:     "EUR",
      });
      await upsertAmazonSettlement(db.prisma, {
        settlementId: "SETT-TEST-001",
        marketplace:  "IT",
        totalAmount:  600, // updated
        startDate:    new Date("2026-04-01"),
        endDate:      new Date("2026-04-14"),
        currency:     "EUR",
      });
      const rec = await (db.prisma as any).amazonSettlement.findUnique({
        where: { amazonAccountId_settlementId: { amazonAccountId: accountId, settlementId: "SETT-TEST-001" } },
      });
      expect(rec.totalAmount).toBe(600);
    });
  });

  it("LOCK-IN: totalAmount is stored verbatim (not computed from transactions)", async () => {
    // This test documents the quirk: totalAmount = bank transfer amount,
    // NOT the sum of individual transaction rows.
    await runWithAccount(accountId, async () => {
      await upsertAmazonSettlement(db.prisma, {
        settlementId: "SETT-QUIRK",
        marketplace:  "DE",
        totalAmount:  450,  // bank transfer: intentionally different from txn sum
        startDate:    new Date("2026-03-01"),
        endDate:      new Date("2026-03-14"),
        currency:     "EUR",
      });
      const rec = await (db.prisma as any).amazonSettlement.findUnique({
        where: { amazonAccountId_settlementId: { amazonAccountId: accountId, settlementId: "SETT-QUIRK" } },
      });
      expect(rec.totalAmount).toBe(450); // stored verbatim — not recomputed
    });
  });
});

// ─── findSettlementNearDate ───────────────────────────────────────────────────

describe("findSettlementNearDate", () => {
  beforeEach(async () => {
    // Seed fixture settlements
    for (const s of sampleSettlements) {
      await (db.prisma as any).amazonSettlement.create({ data: { ...s, amazonAccountId: accountId } });
    }
  });

  it("finds a settlement within ±7 days", async () => {
    await runWithAccount(accountId, async () => {
      const result = await findSettlementNearDate(db.prisma, {
        marketplace: "IT",
        nearDate:    new Date("2026-03-14T12:00:00Z"), // exactly the endDate of SETT-IT-001
        windowDays:  7,
      });
      expect(result).not.toBeNull();
      expect(result!.settlementId).toBe("SETT-IT-001");
    });
  });

  it("returns null when no settlement in window", async () => {
    await runWithAccount(accountId, async () => {
      const result = await findSettlementNearDate(db.prisma, {
        marketplace: "IT",
        nearDate:    new Date("2026-01-01T00:00:00Z"), // far from any settlement
        windowDays:  7,
      });
      expect(result).toBeNull();
    });
  });
});

// ─── Transaction operations ────────────────────────────────────────────────────

describe("deleteSettlementTransactions + createSettlementTransactions", () => {
  beforeEach(async () => {
    for (const s of sampleSettlements) {
      await (db.prisma as any).amazonSettlement.create({ data: { ...s, amazonAccountId: accountId } });
    }
  });

  it("creates and deletes transactions for a settlement", async () => {
    await runWithAccount(accountId, async () => {
      const txData = sampleSettlementTransactions.filter(t => t.settlementId === "SETT-IT-001");
      const inserted = await createSettlementTransactions(db.prisma, txData as any);
      expect(inserted).toBe(txData.length);

      await deleteSettlementTransactions(db.prisma, "SETT-IT-001");
      const remaining = await db.prisma.amazonSettlementTransaction.count({
        where: { settlementId: "SETT-IT-001", amazonAccountId: accountId },
      });
      expect(remaining).toBe(0);
    });
  });
});

// ─── findTransactionsForOrders ────────────────────────────────────────────────

describe("findTransactionsForOrders", () => {
  beforeEach(async () => {
    for (const s of sampleSettlements) {
      await (db.prisma as any).amazonSettlement.create({ data: { ...s, amazonAccountId: accountId } });
    }
    for (const t of sampleSettlementTransactions) {
      await db.prisma.amazonSettlementTransaction.create({ data: { ...t, amazonAccountId: accountId } as any });
    }
  });

  it("returns transactions for matching order IDs", async () => {
    await runWithAccount(accountId, async () => {
      // Fixture uses 'AZ-IT-SETT-A', 'AZ-IT-SETT-B' as order IDs
      const txns = await findTransactionsForOrders(db.prisma, ["AZ-IT-SETT-A", "AZ-IT-SETT-B"]);
      expect(txns.length).toBeGreaterThan(0);
      const orderIds = [...new Set(txns.map(t => t.orderId))];
      expect(orderIds).toContain("AZ-IT-SETT-A");
    });
  });

  it("returns empty array for empty input", async () => {
    await runWithAccount(accountId, async () => {
      const txns = await findTransactionsForOrders(db.prisma, []);
      expect(txns).toEqual([]);
    });
  });
});

// ─── countSettlementTransactions ─────────────────────────────────────────────

describe("countSettlementTransactions", () => {
  it("returns 0 when no transactions", async () => {
    await runWithAccount(accountId, async () => {
      const count = await countSettlementTransactions(db.prisma);
      expect(count).toBe(0);
    });
  });

  it("returns correct count after insertion", async () => {
    await runWithAccount(accountId, async () => {
      for (const s of sampleSettlements) {
        await (db.prisma as any).amazonSettlement.create({ data: { ...s, amazonAccountId: accountId } });
      }
      const txData = sampleSettlementTransactions.filter(t => t.settlementId === "SETT-IT-001");
      await createSettlementTransactions(db.prisma, txData as any);
      const count = await countSettlementTransactions(db.prisma);
      expect(count).toBe(txData.length);
    });
  });
});

// ─── findTransactionsForAsins ────────────────────────────────────────────────

describe("findTransactionsForAsins", () => {
  it("returns fee/refund transactions for the given ASINs within a date range", async () => {
    await runWithAccount(accountId, async () => {
      await createSettlementTransactions(db.prisma, [
        { settlementId: "S1", transactionType: "Order", orderId: "O1", asin: "B0ABC123", sku: "SKU-RSV-01", marketplace: "IT", amountType: "Commission", amount: -1.5, currency: "EUR", postedDate: new Date("2026-08-01") },
        { settlementId: "S1", transactionType: "Refund", orderId: "O2", asin: "B0ABC123", sku: "SKU-RSV-01", marketplace: "IT", amountType: "Principal", amount: -20, currency: "EUR", postedDate: new Date("2026-08-02") },
        { settlementId: "S1", transactionType: "Order", orderId: "O3", asin: "B0OTHER", sku: "SKU-X", marketplace: "IT", amountType: "Commission", amount: -3, currency: "EUR", postedDate: new Date("2026-08-01") },
      ] as any);

      const rows = await findTransactionsForAsins(db.prisma, {
        asins: ["B0ABC123"],
        dateFrom: new Date("2026-08-01"),
        dateTo: new Date("2026-08-03"),
      });
      expect(rows).toHaveLength(2);
      expect(rows.every(r => r.asin === "B0ABC123")).toBe(true);
    });
  });
});

// ─── computeHistoricalFeeRatiosByMarketplace ──────────────────────────────────
// One settlement, one marketplace (IT), hand-computed expected ratios:
//   gross (Principal/Order) = 1000
//   commission = 150 (stored as -150) → ratio 0.15
//   fba        = 80  (stored as -80)  → ratio 0.08
//   ads        = 50  (stored as -50)  → ratio 0.05
//   adsVat     = 10  (stored as -10)  → ratio 0.01
//   dsf        = 5   (stored as -5)   → ratio 0.005
//   storage    = 20  (stored as -20)  → ratio 0.02
//   inbound    = 15  (stored as -15)  → ratio 0.015
//   prep       = 8   (stored as -8)   → ratio 0.008
//   refunds    = 30  (stored as -30)  → ratio 0.03
//   other      = 12  (stored as -12, amountType=OtherAmount/Adjustment, not in the reimb exclusion list) → ratio 0.012
//   reimb      = 25  (stored as +25, amountType=OtherAmount/REVERSAL_REIMBURSEMENT — a credit, not negated) → ratio 0.025
//   realPayout = 850 (AmazonSettlement.totalAmount) → payoutRatio 0.85
//   nSett = 1 (one distinct settlementId) → avgStoragePerSett = 20, avgInboundPerSett = 15
describe("computeHistoricalFeeRatiosByMarketplace", () => {
  it("computes correct per-marketplace fee ratios from settlement + transaction data", async () => {
    await runWithAccount(accountId, async () => {
      await db.prisma.amazonSettlement.create({
        data: {
          amazonAccountId: accountId,
          settlementId: "FR1",
          marketplace: "IT",
          startDate: new Date("2026-04-01"),
          endDate: new Date("2026-04-14"),
          totalAmount: 850,
        },
      });
      const txn = (amountType: string, transactionType: string, amount: number) => ({
        amazonAccountId: accountId,
        settlementId: "FR1",
        transactionType,
        marketplace: "IT",
        amountType,
        amount,
        postedDate: new Date("2026-04-10"),
      });
      await db.prisma.amazonSettlementTransaction.createMany({
        data: [
          txn("Principal", "Order", 1000),
          txn("Commission", "Order", -150),
          txn("FBAPerUnitFulfillmentFee", "Order", -80),
          txn("Cost of Advertising", "Order", -50),
          txn("TaxAmount", "ServiceFee", -10),
          txn("DigitalServicesFee", "Order", -5),
          txn("OtherAmount", "Storage Fee", -20),
          txn("OtherAmount", "Inbound Transportation Fee", -15),
          txn("OtherAmount", "WarehousePrep", -8),
          txn("Principal", "Refund", -30),
          txn("OtherAmount", "Adjustment", -12),
          txn("OtherAmount", "REVERSAL_REIMBURSEMENT", 25),
        ],
      });

      const [row] = await computeHistoricalFeeRatiosByMarketplace(db.prisma, ["IT", "DE", "ES", "FR"]);

      expect(row.marketplace).toBe("IT");
      expect(row.grossSales).toBeCloseTo(1000, 4);
      expect(row.realPayout).toBeCloseTo(850, 4);
      expect(row.payoutRatio).toBeCloseTo(0.85, 4);
      expect(row.rCommission).toBeCloseTo(0.15, 4);
      expect(row.rFba).toBeCloseTo(0.08, 4);
      expect(row.rAds).toBeCloseTo(0.05, 4);
      expect(row.rAdsVat).toBeCloseTo(0.01, 4);
      expect(row.rDsf).toBeCloseTo(0.005, 4);
      expect(row.rStorage).toBeCloseTo(0.02, 4);
      expect(row.rInbound).toBeCloseTo(0.015, 4);
      expect(row.rPrep).toBeCloseTo(0.008, 4);
      expect(row.rRefunds).toBeCloseTo(0.03, 4);
      expect(row.rOther).toBeCloseTo(0.012, 4);
      expect(row.rReimb).toBeCloseTo(0.025, 4);
      expect(row.nSett).toBe(1);
      expect(row.avgStoragePerSett).toBeCloseTo(20, 4);
      expect(row.avgInboundPerSett).toBeCloseTo(15, 4);
    });
  });

  it("returns one row per marketplace, scoped to the requested list", async () => {
    await runWithAccount(accountId, async () => {
      for (const mp of ["IT", "DE"]) {
        await db.prisma.amazonSettlement.create({
          data: {
            amazonAccountId: accountId,
            settlementId: `S-${mp}`,
            marketplace: mp,
            startDate: new Date("2026-04-01"),
            endDate: new Date("2026-04-14"),
            totalAmount: 100,
          },
        });
        await db.prisma.amazonSettlementTransaction.create({
          data: {
            amazonAccountId: accountId,
            settlementId: `S-${mp}`,
            transactionType: "Order",
            marketplace: mp,
            amountType: "Principal",
            amount: 200,
            postedDate: new Date("2026-04-10"),
          },
        });
      }

      const rows = await computeHistoricalFeeRatiosByMarketplace(db.prisma, ["IT"]);
      expect(rows).toHaveLength(1);
      expect(rows[0].marketplace).toBe("IT");
    });
  });

  it("returns an empty array when no settlements exist for the current account", async () => {
    await runWithAccount(accountId, async () => {
      const rows = await computeHistoricalFeeRatiosByMarketplace(db.prisma, ["IT", "DE", "ES", "FR"]);
      expect(rows).toEqual([]);
    });
  });
});

// ─── computeSettlementRatiosForCalibration ────────────────────────────────────

describe("computeSettlementRatiosForCalibration", () => {
  it("returns one row per settlement (not aggregated across settlements)", async () => {
    await runWithAccount(accountId, async () => {
      for (const [settlementId, endDate, totalAmount, gross] of [
        ["S1", "2026-04-01", 85, 100],
        ["S2", "2026-04-15", 170, 200],
      ] as const) {
        await db.prisma.amazonSettlement.create({
          data: {
            amazonAccountId: accountId,
            settlementId,
            marketplace: "IT",
            startDate: new Date("2026-03-15"),
            endDate: new Date(endDate),
            totalAmount,
          },
        });
        await db.prisma.amazonSettlementTransaction.create({
          data: {
            amazonAccountId: accountId,
            settlementId,
            transactionType: "Order",
            marketplace: "IT",
            amountType: "Principal",
            amount: gross,
            postedDate: new Date(endDate),
          },
        });
      }

      const rows = await computeSettlementRatiosForCalibration(db.prisma, "IT", 30);
      expect(rows).toHaveLength(2);
      // Ordered ASC by endDate
      expect(rows[0].settlementId).toBe("S1");
      expect(rows[0].gross).toBeCloseTo(100, 4);
      expect(rows[0].realPayout).toBeCloseTo(85, 4);
      expect(rows[1].settlementId).toBe("S2");
      expect(rows[1].gross).toBeCloseTo(200, 4);
    });
  });

  it("respects the lastN limit", async () => {
    await runWithAccount(accountId, async () => {
      for (let i = 1; i <= 5; i++) {
        const settlementId = `S${i}`;
        await db.prisma.amazonSettlement.create({
          data: {
            amazonAccountId: accountId,
            settlementId,
            marketplace: "IT",
            startDate: new Date("2026-03-15"),
            endDate: new Date(`2026-04-0${i}`),
            totalAmount: 85,
          },
        });
        await db.prisma.amazonSettlementTransaction.create({
          data: {
            amazonAccountId: accountId,
            settlementId,
            transactionType: "Order",
            marketplace: "IT",
            amountType: "Principal",
            amount: 100,
            postedDate: new Date(`2026-04-0${i}`),
          },
        });
      }

      const rows = await computeSettlementRatiosForCalibration(db.prisma, "IT", 3);
      expect(rows).toHaveLength(3);
    });
  });

  it("returns an empty array for a marketplace with no settlements", async () => {
    await runWithAccount(accountId, async () => {
      const rows = await computeSettlementRatiosForCalibration(db.prisma, "DE", 30);
      expect(rows).toEqual([]);
    });
  });
});

// ─── Settlement detail / reconciliation ────────────────────────────────────────
// Fixture: settlement "SETT-TXN" (totalAmount=100), two orders:
//   ORD-1 (SKU-A): Principal/Order=100, Commission/Order=-15, FBAPerUnitFulfillmentFee=-8
//   ORD-2 (SKU-B): Principal/Order=50, Refund=-10
//   Non-order: ServiceFee/Storage Fee=-5 (orderId null)
// computedNet = 100-15-8+50-10-5 = 112; orderNet = 117; nonOrderNet = -5

async function seedSettlementDetailFixture() {
  await db.prisma.amazonSettlement.create({
    data: {
      amazonAccountId: accountId, settlementId: "SETT-TXN", marketplace: "IT",
      startDate: new Date("2026-04-01"), endDate: new Date("2026-04-14"), totalAmount: 100,
    },
  });
  await db.prisma.amazonSettlementTransaction.createMany({
    data: [
      { amazonAccountId: accountId, settlementId: "SETT-TXN", transactionType: "Order", orderId: "ORD-1", sku: "SKU-A", marketplace: "IT", amountType: "Principal", amount: 100, postedDate: new Date("2026-04-10") },
      { amazonAccountId: accountId, settlementId: "SETT-TXN", transactionType: "Order", orderId: "ORD-1", sku: "SKU-A", marketplace: "IT", amountType: "Commission", amount: -15, postedDate: new Date("2026-04-10") },
      { amazonAccountId: accountId, settlementId: "SETT-TXN", transactionType: "Order", orderId: "ORD-1", sku: "SKU-A", marketplace: "IT", amountType: "FBAPerUnitFulfillmentFee", amount: -8, postedDate: new Date("2026-04-10") },
      { amazonAccountId: accountId, settlementId: "SETT-TXN", transactionType: "Order", orderId: "ORD-2", sku: "SKU-B", marketplace: "IT", amountType: "Principal", amount: 50, postedDate: new Date("2026-04-11") },
      { amazonAccountId: accountId, settlementId: "SETT-TXN", transactionType: "Refund", orderId: "ORD-2", sku: "SKU-B", marketplace: "IT", amountType: "Principal", amount: -10, postedDate: new Date("2026-04-11") },
      { amazonAccountId: accountId, settlementId: "SETT-TXN", transactionType: "ServiceFee", orderId: null, marketplace: "IT", amountType: "OtherAmount", amount: -5, postedDate: new Date("2026-04-12") },
    ],
  });
}

describe("findSettlementOrderGroups", () => {
  it("groups transactions by order, computing each fee bucket", async () => {
    await seedSettlementDetailFixture();
    await runWithAccount(accountId, async () => {
      const rows = await findSettlementOrderGroups(db.prisma, { settlementId: "SETT-TXN", limit: 50, offset: 0 });
      expect(rows).toHaveLength(2);
      const ord1 = rows.find(r => r.orderId === "ORD-1")!;
      expect(ord1.principal).toBeCloseTo(100, 4);
      expect(ord1.commission).toBeCloseTo(-15, 4);
      expect(ord1.fbaFee).toBeCloseTo(-8, 4);
      expect(ord1.hasRefund).toBe(false);
      const ord2 = rows.find(r => r.orderId === "ORD-2")!;
      expect(ord2.refundAmount).toBeCloseTo(-10, 4);
      expect(ord2.hasRefund).toBe(true);
    });
  });

  it("filters by search term against orderId/sku", async () => {
    await seedSettlementDetailFixture();
    await runWithAccount(accountId, async () => {
      const rows = await findSettlementOrderGroups(db.prisma, { settlementId: "SETT-TXN", search: "sku-a", limit: 50, offset: 0 });
      expect(rows.map(r => r.orderId)).toEqual(["ORD-1"]);
    });
  });
});

describe("countSettlementOrderGroups", () => {
  it("counts distinct orders in a settlement", async () => {
    await seedSettlementDetailFixture();
    await runWithAccount(accountId, async () => {
      const total = await countSettlementOrderGroups(db.prisma, { settlementId: "SETT-TXN" });
      expect(total).toBe(2);
    });
  });
});

describe("findNonOrderMovements", () => {
  it("returns transactions with no orderId", async () => {
    await seedSettlementDetailFixture();
    await runWithAccount(accountId, async () => {
      const rows = await findNonOrderMovements(db.prisma, "SETT-TXN");
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBeCloseTo(-5, 4);
    });
  });
});

describe("findSettlementHeader", () => {
  it("returns the settlement header fields", async () => {
    await seedSettlementDetailFixture();
    await runWithAccount(accountId, async () => {
      const header = await findSettlementHeader(db.prisma, "SETT-TXN");
      expect(header?.totalAmount).toBeCloseTo(100, 4);
      expect(header?.marketplace).toBe("IT");
    });
  });

  it("returns null when the settlement doesn't exist", async () => {
    await runWithAccount(accountId, async () => {
      const header = await findSettlementHeader(db.prisma, "NON-EXISTENT");
      expect(header).toBeNull();
    });
  });
});

describe("computeSettlementReconciliation", () => {
  it("computes net totals split by order vs. non-order", async () => {
    await seedSettlementDetailFixture();
    await runWithAccount(accountId, async () => {
      const reconc = await computeSettlementReconciliation(db.prisma, "SETT-TXN");
      expect(reconc.computedNet).toBeCloseTo(112, 4);
      expect(reconc.orderNet).toBeCloseTo(117, 4);
      expect(reconc.nonOrderNet).toBeCloseTo(-5, 4);
    });
  });
});

describe("findCrossSettlementOrders", () => {
  it("finds other settlements an order also appears in", async () => {
    await seedSettlementDetailFixture();
    await db.prisma.amazonSettlement.create({
      data: {
        amazonAccountId: accountId, settlementId: "SETT-OTHER", marketplace: "IT",
        startDate: new Date("2026-05-01"), endDate: new Date("2026-05-14"), totalAmount: 20,
      },
    });
    await db.prisma.amazonSettlementTransaction.create({
      data: { amazonAccountId: accountId, settlementId: "SETT-OTHER", transactionType: "Order", orderId: "ORD-1", marketplace: "IT", amountType: "Principal", amount: 20, postedDate: new Date("2026-05-10") },
    });

    await runWithAccount(accountId, async () => {
      const map = await findCrossSettlementOrders(db.prisma, { orderIds: ["ORD-1", "ORD-2"], excludeSettlementId: "SETT-TXN" });
      expect(map.get("ORD-1")).toEqual(["SETT-OTHER"]);
      expect(map.has("ORD-2")).toBe(false);
    });
  });

  it("returns an empty map when orderIds is empty", async () => {
    await runWithAccount(accountId, async () => {
      const map = await findCrossSettlementOrders(db.prisma, { orderIds: [], excludeSettlementId: "SETT-TXN" });
      expect(map.size).toBe(0);
    });
  });
});
