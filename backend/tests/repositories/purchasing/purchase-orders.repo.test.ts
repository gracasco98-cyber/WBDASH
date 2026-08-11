import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  createPurchaseOrder, findAllPurchaseOrders, findPurchaseOrderById,
  transitionPurchaseOrderStatus, InvalidTransitionError,
  type CreatePurchaseOrderInput,
} from "../../../src/repositories/purchasing/purchase-orders.repo";

let db: TestDb;
let supplierId: string;
let warehouseId: string;
let paymentTermId: string;
let productId: string;
let userId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  supplierId = (await db.prisma.supplier.create({
    data: { legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT" },
  })).id;
  warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino Centrale", code: "MAG-1" } })).id;
  paymentTermId = (await db.prisma.paymentTerm.create({
    data: { name: "30 giorni fine mese", type: "STANDARD", paymentMethod: "BONIFICO" },
  })).id;
  productId = (await db.prisma.product.create({ data: { name: "Widget Test" } })).id;
  userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
});

function baseOrder(overrides: Partial<CreatePurchaseOrderInput> = {}): CreatePurchaseOrderInput {
  return {
    supplierId, orderDate: new Date("2026-08-08"), currency: "EUR", buyerId: userId,
    warehouseId, paymentTermId,
    lines: [{
      productId, description: "Widget Test", orderedQty: 100, unitOfMeasure: "PZ",
      unitPrice: 2.5, taxableAmount: 250, vatAmount: 55, totalAmount: 305,
    }],
    ...overrides,
  };
}

describe("purchase-orders.repo", () => {
  it("creates a purchase order with a poNumber and a DRAFT/OPEN status", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    expect(po.poNumber).toBe("PO-2026-000001");
    expect(po.logisticStatus).toBe("DRAFT");
    expect(po.financialStatus).toBe("OPEN");
  });

  it("numbers a second order in the same year sequentially", async () => {
    await createPurchaseOrder(db.prisma, baseOrder());
    const second = await createPurchaseOrder(db.prisma, baseOrder());
    expect(second.poNumber).toBe("PO-2026-000002");
  });

  it("findPurchaseOrderById returns lines with a computed remainingQty", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    const found = await findPurchaseOrderById(db.prisma, po.id);
    expect(found!.lines).toHaveLength(1);
    expect(found!.lines[0].remainingQty).toBe(100);
    expect(found!.lines[0].receivedQty).toBe(0);
  });

  it("findPurchaseOrderById returns null for an unknown id", async () => {
    expect(await findPurchaseOrderById(db.prisma, "does-not-exist")).toBeNull();
  });

  it("findAllPurchaseOrders filters by logisticStatus", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    await transitionPurchaseOrderStatus(db.prisma, po.id, "SENT", userId);
    expect(await findAllPurchaseOrders(db.prisma, { logisticStatus: "SENT" })).toHaveLength(1);
    expect(await findAllPurchaseOrders(db.prisma, { logisticStatus: "DRAFT" })).toHaveLength(0);
  });

  it("transitions status and records history", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    const updated = await transitionPurchaseOrderStatus(db.prisma, po.id, "SENT", userId, "inviato via email");
    expect(updated.logisticStatus).toBe("SENT");
    const found = await findPurchaseOrderById(db.prisma, po.id);
    expect(found!.statusHistory).toHaveLength(1);
    expect(found!.statusHistory[0]).toMatchObject({
      fromStatus: "DRAFT", toStatus: "SENT", changedById: userId, note: "inviato via email",
    });
  });

  it("rejects an invalid transition and leaves status/history unchanged", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    await expect(transitionPurchaseOrderStatus(db.prisma, po.id, "CONFIRMED", userId)).rejects.toThrow(InvalidTransitionError);
    const found = await findPurchaseOrderById(db.prisma, po.id);
    expect(found!.logisticStatus).toBe("DRAFT");
    expect(found!.statusHistory).toHaveLength(0);
  });
});
