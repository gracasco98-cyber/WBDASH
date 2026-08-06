import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { createSupplier } from "../../../src/repositories/purchasing/suppliers.repo";
import { addSupplierProduct, updateSupplierProductPrice, updateSupplierProductDetails, removeSupplierProduct } from "../../../src/repositories/purchasing/supplier-products.repo";

let db: TestDb;
let supplierId: string;
let productId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  const s = await createSupplier(db.prisma, { legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT" });
  supplierId = s.id;
  const p = await db.prisma.product.create({ data: { name: "Resveratrolo 500mg" } });
  productId = p.id;
});

describe("supplier-products.repo", () => {
  it("addSupplierProduct creates the product link and its first price history row atomically", async () => {
    const sp = await addSupplierProduct(db.prisma, supplierId, {
      productId, standardPrice: 4.5, currency: "EUR", moq: 500, leadTimeDays: 21,
    });
    expect(Number(sp.standardPrice)).toBe(4.5);
    const history = await db.prisma.supplierProductPriceHistory.findMany({ where: { supplierProductId: sp.id } });
    expect(history).toHaveLength(1);
    expect(Number(history[0].price)).toBe(4.5);
    expect(history[0].source).toBe("initial");
  });

  it("updateSupplierProductPrice appends a new history row and updates the cached standardPrice", async () => {
    const sp = await addSupplierProduct(db.prisma, supplierId, { productId, standardPrice: 4.5, currency: "EUR" });
    const updated = await updateSupplierProductPrice(db.prisma, sp.id, { price: 5.2, source: "listino 2026-09" });
    expect(Number(updated.standardPrice)).toBe(5.2);
    const history = await db.prisma.supplierProductPriceHistory.findMany({ where: { supplierProductId: sp.id }, orderBy: { validFrom: "asc" } });
    expect(history).toHaveLength(2);
    expect(Number(history[0].price)).toBe(4.5); // original untouched
    expect(Number(history[1].price)).toBe(5.2);
  });

  it("updateSupplierProductDetails changes non-price fields without touching price/history", async () => {
    const sp = await addSupplierProduct(db.prisma, supplierId, { productId, standardPrice: 4.5, currency: "EUR", moq: 500 });
    const updated = await updateSupplierProductDetails(db.prisma, sp.id, { moq: 1000, leadTimeDays: 14 });
    expect(updated.moq).toBe(1000);
    expect(Number(updated.standardPrice)).toBe(4.5);
    const history = await db.prisma.supplierProductPriceHistory.findMany({ where: { supplierProductId: sp.id } });
    expect(history).toHaveLength(1);
  });

  it("removeSupplierProduct is blocked when price history exists (onDelete: Restrict)", async () => {
    const sp = await addSupplierProduct(db.prisma, supplierId, { productId, standardPrice: 4.5, currency: "EUR" });
    await expect(removeSupplierProduct(db.prisma, sp.id)).rejects.toThrow();
  });
});
