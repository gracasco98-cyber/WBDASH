import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { nextSequenceValue, formatPoNumber } from "../../../src/repositories/purchasing/document-sequence.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("document-sequence.repo", () => {
  it("starts at 1 for a new (documentType, year)", async () => {
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(1);
  });

  it("increments on each call for the same (documentType, year)", async () => {
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(1);
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(2);
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(3);
  });

  it("keeps separate counters per year", async () => {
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(1);
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2027)).toBe(1);
  });

  it("keeps separate counters per documentType", async () => {
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(1);
    expect(await nextSequenceValue(db.prisma, "GOODS_RECEIPT", 2026)).toBe(1);
  });

  it("produces no duplicate values under concurrent calls", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026))
    );
    expect(new Set(results).size).toBe(20);
    expect(Math.max(...results)).toBe(20);
  });

  it("formatPoNumber pads to 6 digits", () => {
    expect(formatPoNumber(2026, 1)).toBe("PO-2026-000001");
    expect(formatPoNumber(2026, 123456)).toBe("PO-2026-123456");
  });
});
