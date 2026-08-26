import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllSuppliers, findSupplierById, createSupplier, updateSupplier, deactivateSupplier } from "../../../src/repositories/purchasing/suppliers.repo";
import { createPaymentTerm } from "../../../src/repositories/purchasing/payment-terms.repo";
import { addSupplierProduct } from "../../../src/repositories/purchasing/supplier-products.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

const baseInput = {
  legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore",
  country: "IT", defaultCurrency: "EUR",
};

describe("suppliers.repo", () => {
  it("creates a supplier and finds it in the list", async () => {
    await createSupplier(db.prisma, baseInput);
    const all = await findAllSuppliers(db.prisma);
    expect(all).toHaveLength(1);
    expect(all[0].legalName).toBe("Acme Supply Srl");
    expect(all[0].isActive).toBe(true);
  });

  it("rejects a duplicate internalCode", async () => {
    await createSupplier(db.prisma, baseInput);
    await expect(createSupplier(db.prisma, { ...baseInput, legalName: "Other" })).rejects.toThrow();
  });

  it("includes the default payment term name and a count of linked products", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "30gg fine mese", type: "STANDARD", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });
    const withTerm = await createSupplier(db.prisma, { ...baseInput, internalCode: "FORN-010", defaultPaymentTermId: term.id });
    const withoutTerm = await createSupplier(db.prisma, { ...baseInput, legalName: "No Term Srl", internalCode: "FORN-011" });
    const product = await db.prisma.product.create({ data: { name: "Widget Test" } });
    await addSupplierProduct(db.prisma, withTerm.id, { productId: product.id, standardPrice: 10 });

    const all = await findAllSuppliers(db.prisma);
    const withTermRow = all.find(s => s.id === withTerm.id)!;
    const withoutTermRow = all.find(s => s.id === withoutTerm.id)!;

    expect(withTermRow.defaultPaymentTerm?.name).toBe("30gg fine mese");
    expect(withTermRow._count.products).toBe(1);
    expect(withoutTermRow.defaultPaymentTerm).toBeNull();
    expect(withoutTermRow._count.products).toBe(0);
  });

  it("findSupplierById returns null for an unknown id", async () => {
    const result = await findSupplierById(db.prisma, "does-not-exist");
    expect(result).toBeNull();
  });

  it("findSupplierById includes empty contacts/products arrays for a supplier with none", async () => {
    const s = await createSupplier(db.prisma, baseInput);
    const result = await findSupplierById(db.prisma, s.id);
    expect(result).not.toBeNull();
    expect(result!.contacts).toEqual([]);
    expect(result!.products).toEqual([]);
  });

  it("updates fields without touching internalCode", async () => {
    const s = await createSupplier(db.prisma, baseInput);
    const updated = await updateSupplier(db.prisma, s.id, { legalName: "Acme Supply New Name" });
    expect(updated.legalName).toBe("Acme Supply New Name");
    expect(updated.internalCode).toBe("FORN-001");
  });

  it("deactivate sets isActive=false instead of deleting the row", async () => {
    const s = await createSupplier(db.prisma, baseInput);
    await deactivateSupplier(db.prisma, s.id);
    const row = await db.prisma.supplier.findUnique({ where: { id: s.id } });
    expect(row!.isActive).toBe(false);
  });
});
