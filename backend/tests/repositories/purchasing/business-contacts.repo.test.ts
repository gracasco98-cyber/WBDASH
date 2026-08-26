import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  findAllBusinessContacts, createBusinessContact, updateBusinessContact, deactivateBusinessContact,
} from "../../../src/repositories/purchasing/business-contacts.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("business-contacts.repo", () => {
  it("creates a business contact and finds it in the list", async () => {
    await createBusinessContact(db.prisma, { type: "CLIENTE", name: "Acme Retail Srl" });
    const all = await findAllBusinessContacts(db.prisma);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Acme Retail Srl");
    expect(all[0].type).toBe("CLIENTE");
    expect(all[0].isActive).toBe(true);
  });

  it("creates a business contact with all optional fields set", async () => {
    const c = await createBusinessContact(db.prisma, {
      type: "AGENTE", name: "Mario Rossi", referent: "Mario Rossi", email: "mario@example.com",
      phone: "+39 333 1234567", address: "Via Roma 1, Milano", notes: "Agente Nord Italia",
    });
    expect(c.email).toBe("mario@example.com");
    expect(c.notes).toBe("Agente Nord Italia");
  });

  it("updates name/referent/email/phone/address/notes without touching type", async () => {
    const c = await createBusinessContact(db.prisma, { type: "CLIENTE", name: "Old Name" });
    const updated = await updateBusinessContact(db.prisma, c.id, {
      name: "New Name", referent: "New Referent", email: "new@example.com",
      phone: "123", address: "New Address", notes: "New Notes",
    });
    expect(updated.name).toBe("New Name");
    expect(updated.referent).toBe("New Referent");
    expect(updated.type).toBe("CLIENTE");
  });

  it("deactivate sets isActive=false instead of deleting the row", async () => {
    const c = await createBusinessContact(db.prisma, { type: "AGENTE", name: "To Deactivate" });
    await deactivateBusinessContact(db.prisma, c.id);
    const row = await db.prisma.businessContact.findUnique({ where: { id: c.id } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(false);
  });
});
