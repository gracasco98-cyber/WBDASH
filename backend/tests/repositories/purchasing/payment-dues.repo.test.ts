import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllPaymentDues, markPaymentDuePaid } from "../../../src/repositories/purchasing/payment-dues.repo";

let db: TestDb;
let supplierId: string;
let warehouseId: string;
let paymentTermId: string;
let productId: string;
let userId: string;
let poId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  supplierId = (await db.prisma.supplier.create({
    data: { legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT" },
  })).id;
  warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino Centrale", code: "MAG-1" } })).id;
  paymentTermId = (await db.prisma.paymentTerm.create({
    data: { name: "30gg", type: "STANDARD", paymentMethod: "BONIFICO" },
  })).id;
  productId = (await db.prisma.product.create({ data: { name: "Widget Test" } })).id;
  userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
  const po = await db.prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-000001", supplierId, orderDate: new Date("2026-03-01"), currency: "EUR",
      buyerId: userId, warehouseId, paymentTermId,
      lines: { create: [{ productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ", unitPrice: 5, taxableAmount: 50, vatAmount: 11, totalAmount: 61 }] },
    },
  });
  poId = po.id;
});

describe("payment-dues.repo", () => {
  it("findAllPaymentDues returns dues with supplier/order info, ordered by dueDate ascending", async () => {
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-05-10"), amount: 61 } });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 2, dueDate: new Date("2026-04-10"), amount: 30 } });

    const dues = await findAllPaymentDues(db.prisma);
    expect(dues).toHaveLength(2);
    expect(dues[0].dueDate.toISOString().slice(0, 10)).toBe("2026-04-10"); // earliest first
    expect(dues[0].purchaseOrder.poNumber).toBe("PO-2026-000001");
    expect(dues[0].purchaseOrder.supplier.legalName).toBe("Acme Supply Srl");
  });

  it("findAllPaymentDues filters by status", async () => {
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-04-10"), amount: 61, status: "PAID", paidDate: new Date("2026-04-09"), paidAmount: 61 } });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 2, dueDate: new Date("2026-05-10"), amount: 30 } });

    expect(await findAllPaymentDues(db.prisma, { status: "PENDING" })).toHaveLength(1);
    expect(await findAllPaymentDues(db.prisma, { status: "PAID" })).toHaveLength(1);
  });

  it("findAllPaymentDues filters by supplierId", async () => {
    const otherSupplier = await db.prisma.supplier.create({ data: { legalName: "Other Srl", internalCode: "FORN-002", supplierType: "Produttore", country: "IT" } });
    const otherPo = await db.prisma.purchaseOrder.create({
      data: { poNumber: "PO-2026-000002", supplierId: otherSupplier.id, orderDate: new Date(), currency: "EUR", buyerId: userId, warehouseId, paymentTermId },
    });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date(), amount: 61 } });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: otherPo.id, installmentNumber: 1, dueDate: new Date(), amount: 40 } });

    const filtered = await findAllPaymentDues(db.prisma, { supplierId });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].purchaseOrder.poNumber).toBe("PO-2026-000001");
  });

  it("markPaymentDuePaid sets status/paidDate/paidAmount", async () => {
    const due = await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-04-10"), amount: 61 } });
    const updated = await markPaymentDuePaid(db.prisma, due.id, new Date("2026-04-08"), 61);
    expect(updated.status).toBe("PAID");
    expect(Number(updated.paidAmount)).toBe(61);
    expect(updated.paidDate!.toISOString().slice(0, 10)).toBe("2026-04-08");
  });

  it("markPaymentDuePaid throws on an unknown id", async () => {
    await expect(markPaymentDuePaid(db.prisma, "does-not-exist", new Date(), 0)).rejects.toThrow();
  });
});
