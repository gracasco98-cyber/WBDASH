import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  createSupplierInvoice,
  findAllSupplierInvoices,
  findSupplierInvoiceById,
  voidSupplierInvoice,
} from "../../../src/repositories/purchasing/supplier-invoices.repo";

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
      lines: { create: [{ productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ", unitPrice: 10, taxableAmount: 100, vatAmount: 22, totalAmount: 122 }] },
    },
  });
  poId = po.id;
});

describe("supplier-invoices.repo", () => {
  it("createSupplierInvoice without a purchaseOrderId leaves the order's financialStatus untouched (there is no order)", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-001", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    expect(invoice.purchaseOrderId).toBeNull();
    expect(invoice.source).toBe("MANUAL");
    expect(invoice.voidedAt).toBeNull();
  });

  it("createSupplierInvoice with a purchaseOrderId covering less than the order total sets PARTIALLY_INVOICED", async () => {
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-002", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("PARTIALLY_INVOICED");
  });

  it("a second invoice that brings the total to the order's full value sets INVOICED", async () => {
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-003", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-004", invoiceDate: new Date("2026-03-06"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("INVOICED");
  });

  it("voidSupplierInvoice sets voidedAt and recomputes the linked order back down", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-005", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 100, vatAmount: 22, totalAmount: 122,
    }, userId);
    let po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("INVOICED");

    const voided = await voidSupplierInvoice(db.prisma, invoice.id);
    expect(voided.voidedAt).not.toBeNull();
    po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("OPEN");
  });

  it("voidSupplierInvoice is a no-op when the invoice is already voided", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-006", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    const firstVoid = await voidSupplierInvoice(db.prisma, invoice.id);
    const secondVoid = await voidSupplierInvoice(db.prisma, invoice.id);
    expect(secondVoid.voidedAt).toEqual(firstVoid.voidedAt);
  });

  it("createSupplierInvoice does not overwrite a financialStatus outside FASE G scope (PARTIALLY_PAID/PAID)", async () => {
    await db.prisma.purchaseOrder.update({ where: { id: poId }, data: { financialStatus: "PAID" } });
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-007", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("PAID");
  });

  it("findAllSupplierInvoices excludes voided invoices by default and includes them with includeVoided", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-008", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    await voidSupplierInvoice(db.prisma, invoice.id);
    await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-009", invoiceDate: new Date("2026-03-06"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);

    expect(await findAllSupplierInvoices(db.prisma)).toHaveLength(1);
    expect(await findAllSupplierInvoices(db.prisma, { includeVoided: true })).toHaveLength(2);
  });

  it("findAllSupplierInvoices filters by supplierId and purchaseOrderId, ordered by invoiceDate desc", async () => {
    const otherSupplier = await db.prisma.supplier.create({
      data: { legalName: "Other Srl", internalCode: "FORN-002", supplierType: "Produttore", country: "IT" },
    });
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-010", invoiceDate: new Date("2026-03-01"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);
    await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-011", invoiceDate: new Date("2026-03-10"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);
    await createSupplierInvoice(db.prisma, {
      supplierId: otherSupplier.id, invoiceNumber: "FT-012", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);

    const bySupplier = await findAllSupplierInvoices(db.prisma, { supplierId });
    expect(bySupplier).toHaveLength(2);
    expect(bySupplier[0].invoiceNumber).toBe("FT-011"); // most recent invoiceDate first

    const byOrder = await findAllSupplierInvoices(db.prisma, { purchaseOrderId: poId });
    expect(byOrder).toHaveLength(1);
    expect(byOrder[0].invoiceNumber).toBe("FT-010");
  });

  it("findSupplierInvoiceById returns the invoice with supplier and order joined, or throws on unknown id", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-013", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);
    const found = await findSupplierInvoiceById(db.prisma, invoice.id);
    expect(found.supplier.legalName).toBe("Acme Supply Srl");
    expect(found.purchaseOrder?.poNumber).toBe("PO-2026-000001");

    await expect(findSupplierInvoiceById(db.prisma, "does-not-exist")).rejects.toThrow();
  });

  it("createSupplierInvoice rejects a duplicate (supplierId, invoiceNumber) pair", async () => {
    await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-014", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);
    await expect(createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-014", invoiceDate: new Date("2026-03-06"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId)).rejects.toThrow();
  });
});
