import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { createPurchaseOrder, transitionPurchaseOrderStatus, findPurchaseOrderById, type CreatePurchaseOrderInput } from "../../../src/repositories/purchasing/purchase-orders.repo";
import { createGoodsReceipt, findGoodsReceiptsByOrderId, OverReceiptError } from "../../../src/repositories/purchasing/goods-receipts.repo";
import { InvalidTransitionError } from "../../../src/repositories/purchasing/purchase-orders.repo";

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

/** Creates an order and advances it to CONFIRMED (a receivable status) via the existing FASE D transitions. */
async function confirmedOrder() {
  const po = await createPurchaseOrder(db.prisma, baseOrder());
  await transitionPurchaseOrderStatus(db.prisma, po.id, "SENT", userId);
  return transitionPurchaseOrderStatus(db.prisma, po.id, "CONFIRMED", userId);
}

describe("goods-receipts.repo", () => {
  it("creates a full-quantity receipt, sets receivedQty, and transitions the order to RECEIVED", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    const gr = await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-14"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-08-13"),
      carrier: "BRT", receivedById: userId,
      lines: [{ purchaseOrderLineId: lineId, receivedQty: 100 }],
    });

    expect(gr.grnNumber).toBe("GR-2026-000001");
    const updated = await findPurchaseOrderById(db.prisma, po.id);
    expect(updated!.logisticStatus).toBe("RECEIVED");
    expect(updated!.lines[0].receivedQty).toBe(100);
    expect(updated!.lines[0].remainingQty).toBe(0);
    expect(updated!.statusHistory[0]).toMatchObject({ fromStatus: "CONFIRMED", toStatus: "RECEIVED" });
  });

  it("creates a partial receipt and transitions the order to PARTIALLY_RECEIVED", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-14"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-08-13"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 40 }],
    });

    const updated = await findPurchaseOrderById(db.prisma, po.id);
    expect(updated!.logisticStatus).toBe("PARTIALLY_RECEIVED");
    expect(updated!.lines[0].receivedQty).toBe(40);
    expect(updated!.lines[0].remainingQty).toBe(60);
  });

  it("a second receipt completing a PARTIALLY_RECEIVED order transitions it to RECEIVED", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-14"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-08-13"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 40 }],
    });
    const second = await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-20"),
      supplierDdtNumber: "DDT-1002", supplierDdtDate: new Date("2026-08-19"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 60 }],
    });

    expect(second.grnNumber).toBe("GR-2026-000002");
    const updated = await findPurchaseOrderById(db.prisma, po.id);
    expect(updated!.logisticStatus).toBe("RECEIVED");
    expect(updated!.lines[0].receivedQty).toBe(100);
  });

  it("rejects a receipt that would exceed the ordered quantity", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    await expect(createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-14"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-08-13"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 150 }],
    })).rejects.toThrow(OverReceiptError);

    const unchanged = await findPurchaseOrderById(db.prisma, po.id);
    expect(unchanged!.lines[0].receivedQty).toBe(0);
    expect(unchanged!.logisticStatus).toBe("CONFIRMED");
  });

  it("rejects a receipt with two lines for the SAME purchaseOrderLineId whose sum exceeds remaining", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    // 60 + 60 = 120 > 100 remaining. Neither individual row exceeds remaining on its own,
    // so a validation loop that checks each row independently against a stale snapshot
    // would wrongly let both pass.
    await expect(createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-14"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-08-13"),
      receivedById: userId,
      lines: [
        { purchaseOrderLineId: lineId, receivedQty: 60 },
        { purchaseOrderLineId: lineId, receivedQty: 60 },
      ],
    })).rejects.toThrow(OverReceiptError);

    const unchanged = await findPurchaseOrderById(db.prisma, po.id);
    expect(unchanged!.lines[0].receivedQty).toBe(0);
    expect(unchanged!.logisticStatus).toBe("CONFIRMED");
    const receipts = await findGoodsReceiptsByOrderId(db.prisma, po.id);
    expect(receipts).toHaveLength(0);
  });

  it("rejects a receipt whose purchaseOrderLineId does not belong to the target order", async () => {
    const po = await confirmedOrder();
    const otherPo = await confirmedOrder();
    const otherFull = await findPurchaseOrderById(db.prisma, otherPo.id);
    const foreignLineId = otherFull!.lines[0].id;

    await expect(createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-14"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-08-13"),
      receivedById: userId,
      lines: [{ purchaseOrderLineId: foreignLineId, receivedQty: 10 }],
    })).rejects.toThrow(`PurchaseOrderLine ${foreignLineId} does not belong to order ${po.id}`);
  });

  it("rejects a receipt against an order in a non-receivable status (DRAFT)", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    await expect(createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-14"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-08-13"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 10 }],
    })).rejects.toThrow(InvalidTransitionError);
  });

  it("findGoodsReceiptsByOrderId returns receipts newest-first with their lines", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-10"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-08-09"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 30 }],
    });
    await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-08-14"),
      supplierDdtNumber: "DDT-1002", supplierDdtDate: new Date("2026-08-13"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 20 }],
    });

    const receipts = await findGoodsReceiptsByOrderId(db.prisma, po.id);
    expect(receipts).toHaveLength(2);
    expect(receipts[0].supplierDdtNumber).toBe("DDT-1002"); // newest first
    expect(receipts[0].lines).toHaveLength(1);
    expect(receipts[0].lines[0].receivedQty).toBe(20);
  });

  // No automated test here for the PurchaseOrderLine_receivedQty_check DB
  // constraint (migration 20260815210711_add_received_qty_check_constraint):
  // this file's setupTestDb() (see helpers/db.ts) provisions its Postgres
  // container via `prisma db push`, which diffs against schema.prisma only
  // and never reads migration SQL — so a raw CHECK constraint (not expressible
  // in this Prisma version's schema language) never exists in the test
  // database, only in real dev/production databases built via `migrate
  // deploy`/`migrate dev`. Verified manually against the real dedicated dev
  // DB instead: a direct `purchaseOrderLine.update` bypassing
  // createGoodsReceipt entirely, setting receivedQty above orderedQty,
  // was rejected by Postgres with a CHECK constraint violation.
});
