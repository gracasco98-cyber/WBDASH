/**
 * settlement.repo.test.ts — Integration tests for the AmazonSettlement + AmazonSettlementTransaction
 * repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { sampleSettlements, sampleSettlementTransactions } from "../../fixtures/amazon-settlements.fixture";
import {
  upsertAmazonSettlement,
  findSettlementNearDate,
  deleteSettlementTransactions,
  createSettlementTransactions,
  findTransactionsForOrders,
  countSettlementTransactions,
} from "../../../src/repositories/amazon/settlement.repo";

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
});

// ─── upsertAmazonSettlement ───────────────────────────────────────────────────

describe("upsertAmazonSettlement", () => {
  it("creates a new settlement header", async () => {
    await upsertAmazonSettlement(db.prisma, {
      settlementId: "SETT-TEST-001",
      marketplace:  "IT",
      totalAmount:  500,
      startDate:    new Date("2026-04-01"),
      endDate:      new Date("2026-04-14"),
      currency:     "EUR",
    });
    const recs = await (db.prisma as any).amazonSettlement.findUnique({
      where: { settlementId: "SETT-TEST-001" },
    });
    expect(recs).not.toBeNull();
    expect(recs.totalAmount).toBe(500);
    expect(recs.marketplace).toBe("IT");
  });

  it("updates existing settlement on re-upsert", async () => {
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
      where: { settlementId: "SETT-TEST-001" },
    });
    expect(rec.totalAmount).toBe(600);
  });

  it("LOCK-IN: totalAmount is stored verbatim (not computed from transactions)", async () => {
    // This test documents the quirk: totalAmount = bank transfer amount,
    // NOT the sum of individual transaction rows.
    await upsertAmazonSettlement(db.prisma, {
      settlementId: "SETT-QUIRK",
      marketplace:  "DE",
      totalAmount:  450,  // bank transfer: intentionally different from txn sum
      startDate:    new Date("2026-03-01"),
      endDate:      new Date("2026-03-14"),
      currency:     "EUR",
    });
    const rec = await (db.prisma as any).amazonSettlement.findUnique({
      where: { settlementId: "SETT-QUIRK" },
    });
    expect(rec.totalAmount).toBe(450); // stored verbatim — not recomputed
  });
});

// ─── findSettlementNearDate ───────────────────────────────────────────────────

describe("findSettlementNearDate", () => {
  beforeEach(async () => {
    // Seed fixture settlements
    for (const s of sampleSettlements) {
      await (db.prisma as any).amazonSettlement.create({ data: s });
    }
  });

  it("finds a settlement within ±7 days", async () => {
    const result = await findSettlementNearDate(db.prisma, {
      marketplace: "IT",
      nearDate:    new Date("2026-03-14T12:00:00Z"), // exactly the endDate of SETT-IT-001
      windowDays:  7,
    });
    expect(result).not.toBeNull();
    expect(result!.settlementId).toBe("SETT-IT-001");
  });

  it("returns null when no settlement in window", async () => {
    const result = await findSettlementNearDate(db.prisma, {
      marketplace: "IT",
      nearDate:    new Date("2026-01-01T00:00:00Z"), // far from any settlement
      windowDays:  7,
    });
    expect(result).toBeNull();
  });
});

// ─── Transaction operations ────────────────────────────────────────────────────

describe("deleteSettlementTransactions + createSettlementTransactions", () => {
  beforeEach(async () => {
    for (const s of sampleSettlements) {
      await (db.prisma as any).amazonSettlement.create({ data: s });
    }
  });

  it("creates and deletes transactions for a settlement", async () => {
    const txData = sampleSettlementTransactions.filter(t => t.settlementId === "SETT-IT-001");
    const inserted = await createSettlementTransactions(db.prisma, txData as any);
    expect(inserted).toBe(txData.length);

    await deleteSettlementTransactions(db.prisma, "SETT-IT-001");
    const remaining = await db.prisma.amazonSettlementTransaction.count({
      where: { settlementId: "SETT-IT-001" },
    });
    expect(remaining).toBe(0);
  });
});

// ─── findTransactionsForOrders ────────────────────────────────────────────────

describe("findTransactionsForOrders", () => {
  beforeEach(async () => {
    for (const s of sampleSettlements) {
      await (db.prisma as any).amazonSettlement.create({ data: s });
    }
    for (const t of sampleSettlementTransactions) {
      await db.prisma.amazonSettlementTransaction.create({ data: t as any });
    }
  });

  it("returns transactions for matching order IDs", async () => {
    // Fixture uses 'AZ-IT-SETT-A', 'AZ-IT-SETT-B' as order IDs
    const txns = await findTransactionsForOrders(db.prisma, ["AZ-IT-SETT-A", "AZ-IT-SETT-B"]);
    expect(txns.length).toBeGreaterThan(0);
    const orderIds = [...new Set(txns.map(t => t.orderId))];
    expect(orderIds).toContain("AZ-IT-SETT-A");
  });

  it("returns empty array for empty input", async () => {
    const txns = await findTransactionsForOrders(db.prisma, []);
    expect(txns).toEqual([]);
  });
});

// ─── countSettlementTransactions ─────────────────────────────────────────────

describe("countSettlementTransactions", () => {
  it("returns 0 when no transactions", async () => {
    const count = await countSettlementTransactions(db.prisma);
    expect(count).toBe(0);
  });

  it("returns correct count after insertion", async () => {
    for (const s of sampleSettlements) {
      await (db.prisma as any).amazonSettlement.create({ data: s });
    }
    const txData = sampleSettlementTransactions.filter(t => t.settlementId === "SETT-IT-001");
    await createSettlementTransactions(db.prisma, txData as any);
    const count = await countSettlementTransactions(db.prisma);
    expect(count).toBe(txData.length);
  });
});
