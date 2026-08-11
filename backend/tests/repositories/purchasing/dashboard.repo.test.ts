import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { getDashboardSummary } from "../../../src/repositories/purchasing/dashboard.repo";
import { createPurchaseOrder, transitionPurchaseOrderStatus } from "../../../src/repositories/purchasing/purchase-orders.repo";

let db: TestDb;
let warehouseId: string;
let paymentTermId: string;
let productId: string;
let userId: string;
let supplierAId: string;
let supplierBId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  supplierAId = (await db.prisma.supplier.create({
    data: { legalName: "Fornitore A", internalCode: "F-A", supplierType: "Produttore", country: "IT" },
  })).id;
  supplierBId = (await db.prisma.supplier.create({
    data: { legalName: "Fornitore B", internalCode: "F-B", supplierType: "Produttore", country: "IT", isActive: false },
  })).id;
  warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino", code: "MAG-1" } })).id;
  paymentTermId = (await db.prisma.paymentTerm.create({ data: { name: "30gg", type: "STANDARD", paymentMethod: "BONIFICO" } })).id;
  productId = (await db.prisma.product.create({ data: { name: "Widget" } })).id;
  userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
});

function baseOrder(supplierId: string, unitPrice = 5) {
  const taxable = 10 * unitPrice;
  const vat = Math.round(taxable * 0.22 * 100) / 100;
  return {
    supplierId, orderDate: new Date(), currency: "EUR", buyerId: userId, warehouseId, paymentTermId,
    lines: [{
      productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ", unitPrice,
      taxableAmount: taxable, vatAmount: vat, totalAmount: taxable + vat,
    }],
  };
}

describe("dashboard.repo", () => {
  it("counts only active suppliers", async () => {
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.activeSuppliers).toBe(1);
  });

  it("counts orders in progress and excludes CANCELLED, sums their value", async () => {
    await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    const po2 = await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    await transitionPurchaseOrderStatus(db.prisma, po2.id, "CANCELLED", userId);
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.ordersInProgress).toBe(1);
    expect(summary.valueInProgress).toBe(61);
  });

  it("breaks down orders by logistic status, including zero-count statuses, always 8 entries", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    await transitionPurchaseOrderStatus(db.prisma, po.id, "SENT", userId);
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.statusBreakdown).toHaveLength(8);
    expect(summary.statusBreakdown.find(s => s.status === "SENT")?.count).toBe(1);
    expect(summary.statusBreakdown.find(s => s.status === "DRAFT")?.count).toBe(0);
    expect(summary.statusBreakdown.find(s => s.status === "CANCELLED")?.count).toBe(0);
  });

  it("returns a 30-day time series, zero-padded, with today's order counted", async () => {
    await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.ordersOverTime).toHaveLength(30);
    const total = summary.ordersOverTime.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(1);
    expect(summary.ordersOverTime[29].count).toBe(1);
  });

  it("ranks top suppliers by order value, descending", async () => {
    await createPurchaseOrder(db.prisma, baseOrder(supplierAId, 100));
    await createPurchaseOrder(db.prisma, baseOrder(supplierBId, 1));
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.topSuppliers[0].legalName).toBe("Fornitore A");
    expect(summary.topSuppliers[0].orderCount).toBe(1);
    expect(summary.topSuppliers[0].totalValue).toBeCloseTo(1220, 1);
    expect(summary.topSuppliers[1].legalName).toBe("Fornitore B");
  });

  it("lists recent orders newest first with a computed total value", async () => {
    const older = { ...baseOrder(supplierAId), orderDate: new Date("2026-01-01") };
    const newer = { ...baseOrder(supplierBId), orderDate: new Date("2026-06-01") };
    await createPurchaseOrder(db.prisma, older);
    await createPurchaseOrder(db.prisma, newer);
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.recentOrders).toHaveLength(2);
    expect(summary.recentOrders[0].supplierName).toBe("Fornitore B");
    expect(summary.recentOrders[1].supplierName).toBe("Fornitore A");
    expect(summary.recentOrders[0].totalValue).toBe(61);
  });

  it("returns a fully-populated, empty-but-valid summary on an empty database", async () => {
    await truncateAll(db.prisma);
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.ordersInProgress).toBe(0);
    expect(summary.valueInProgress).toBe(0);
    expect(summary.activeSuppliers).toBe(0);
    expect(summary.statusBreakdown).toHaveLength(8);
    expect(summary.ordersOverTime).toHaveLength(30);
    expect(summary.topSuppliers).toEqual([]);
    expect(summary.recentOrders).toEqual([]);
  });
});
