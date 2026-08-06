import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllSuppliers, findSupplierById, createSupplier, updateSupplier, deactivateSupplier } from "../../../src/repositories/purchasing/suppliers.repo";

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
