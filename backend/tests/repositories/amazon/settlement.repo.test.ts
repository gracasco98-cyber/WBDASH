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
