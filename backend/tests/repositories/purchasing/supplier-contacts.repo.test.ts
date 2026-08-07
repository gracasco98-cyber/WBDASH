import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { createSupplier } from "../../../src/repositories/purchasing/suppliers.repo";
import { createContact, updateContact, deleteContact } from "../../../src/repositories/purchasing/supplier-contacts.repo";

let db: TestDb;
let supplierId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  const s = await createSupplier(db.prisma, { legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT" });
  supplierId = s.id;
});

describe("supplier-contacts.repo", () => {
  it("creates a contact linked to the supplier", async () => {
    const contact = await createContact(db.prisma, supplierId, { name: "Mario Rossi", role: "Sales", email: "mario@acme.it", isPrimary: true });
    expect(contact.supplierId).toBe(supplierId);
    expect(contact.isPrimary).toBe(true);
  });

  it("updates a contact's fields", async () => {
    const contact = await createContact(db.prisma, supplierId, { name: "Mario Rossi" });
    const updated = await updateContact(db.prisma, contact.id, { phone: "+39 02 1234567" });
    expect(updated.phone).toBe("+39 02 1234567");
    expect(updated.name).toBe("Mario Rossi");
  });

  it("deletes a contact (hard delete — contacts carry no financial history)", async () => {
    const contact = await createContact(db.prisma, supplierId, { name: "Mario Rossi" });
    await deleteContact(db.prisma, contact.id);
    const row = await db.prisma.supplierContact.findUnique({ where: { id: contact.id } });
    expect(row).toBeNull();
  });
});
