import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllPaymentTerms, createPaymentTerm, updatePaymentTerm, deactivatePaymentTerm } from "../../../src/repositories/purchasing/payment-terms.repo";
import { createSupplier } from "../../../src/repositories/purchasing/suppliers.repo";
import { createPurchaseOrder } from "../../../src/repositories/purchasing/purchase-orders.repo";

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

  it("updates a payment term's fields and replaces all installments", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "Old Name", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });

    const updated = await updatePaymentTerm(db.prisma, term.id, {
      name: "New Name", type: "RIBA", endOfMonth: true, fixedDay: 10, paymentMethod: "RIBA",
      installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 50 },
        { installmentNumber: 2, offsetDays: 60, percentage: 50 },
      ],
    });

    expect(updated.name).toBe("New Name");
    expect(updated.type).toBe("RIBA");
    expect(updated.endOfMonth).toBe(true);
    expect(updated.fixedDay).toBe(10);
    expect(updated.installments).toHaveLength(2);
    expect(updated.installments.map(i => i.offsetDays)).toEqual([30, 60]);

    const row = await db.prisma.paymentTerm.findUnique({ where: { id: term.id }, include: { installments: true } });
    expect(row!.installments).toHaveLength(2); // the old single installment is gone, not left dangling
  });

  it("rejects installment percentages that don't sum to 100 on update, leaving existing installments untouched", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });

    await expect(updatePaymentTerm(db.prisma, term.id, {
      name: "Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 50 }],
    })).rejects.toThrow(/100/);

    const row = await db.prisma.paymentTerm.findUnique({ where: { id: term.id }, include: { installments: true } });
    expect(row!.installments).toHaveLength(1);
    expect(Number(row!.installments[0].percentage)).toBe(100);
  });

  it("includes a _count of suppliers and purchase orders using each payment term", async () => {
    const used = await createPaymentTerm(db.prisma, {
      name: "Used Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });
    const unused = await createPaymentTerm(db.prisma, {
      name: "Unused Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });

    await createSupplier(db.prisma, {
      legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT",
      defaultPaymentTermId: used.id,
    });

    const warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino", code: "MAG-1" } })).id;
    const productId = (await db.prisma.product.create({ data: { name: "Widget Test" } })).id;
    const userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
    const supplierForOrderId = (await db.prisma.supplier.create({
      data: { legalName: "Order Supplier", internalCode: "FORN-002", supplierType: "Produttore", country: "IT" },
    })).id;
    await createPurchaseOrder(db.prisma, {
      supplierId: supplierForOrderId, orderDate: new Date("2026-08-08"), currency: "EUR", buyerId: userId,
      warehouseId, paymentTermId: used.id,
      lines: [{ productId, description: "Widget Test", orderedQty: 1, unitOfMeasure: "PZ", unitPrice: 1, taxableAmount: 1, vatAmount: 0, totalAmount: 1 }],
    });

    const all = await findAllPaymentTerms(db.prisma);
    const usedRow = all.find(t => t.id === used.id)!;
    const unusedRow = all.find(t => t.id === unused.id)!;
    expect(usedRow._count.suppliers).toBe(1);
    expect(usedRow._count.purchaseOrders).toBe(1);
    expect(unusedRow._count.suppliers).toBe(0);
    expect(unusedRow._count.purchaseOrders).toBe(0);
  });
});
