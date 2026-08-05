import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllPaymentTerms, createPaymentTerm, deactivatePaymentTerm } from "../../../src/repositories/purchasing/payment-terms.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("payment-terms.repo", () => {
  it("creates a payment term with its installment rules in one transaction", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "Ri.Ba. 30/60/90", type: "RIBA", endOfMonth: false, paymentMethod: "RIBA",
      installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 33.34 },
        { installmentNumber: 2, offsetDays: 60, percentage: 33.33 },
        { installmentNumber: 3, offsetDays: 90, percentage: 33.33 },
      ],
    });
    expect(term.installments).toHaveLength(3);
    const all = await findAllPaymentTerms(db.prisma);
    expect(all).toHaveLength(1);
    expect(all[0].installments.map(i => Number(i.percentage)).sort()).toEqual([33.33, 33.33, 33.34]);
  });

  it("rejects installment percentages that don't sum to exactly 100", async () => {
    await expect(createPaymentTerm(db.prisma, {
      name: "Bad Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 50 },
        { installmentNumber: 2, offsetDays: 60, percentage: 40 },
      ],
    })).rejects.toThrow(/100/);
  });

  it("deactivate sets isActive=false without deleting the installment rules", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "Immediate", type: "IMMEDIATE", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 0, percentage: 100 }],
    });
    await deactivatePaymentTerm(db.prisma, term.id);
    const row = await db.prisma.paymentTerm.findUnique({ where: { id: term.id }, include: { installments: true } });
    expect(row!.isActive).toBe(false);
    expect(row!.installments).toHaveLength(1);
  });
});
