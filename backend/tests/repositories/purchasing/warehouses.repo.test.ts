import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllWarehouses, createWarehouse, updateWarehouse, deactivateWarehouse } from "../../../src/repositories/purchasing/warehouses.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("warehouses.repo", () => {
  it("creates a warehouse and finds it in the active list", async () => {
    await createWarehouse(db.prisma, { name: "Magazzino Centrale", code: "MAG-01" });
    const all = await findAllWarehouses(db.prisma);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Magazzino Centrale");
    expect(all[0].isActive).toBe(true);
  });

  it("rejects a duplicate code", async () => {
    await createWarehouse(db.prisma, { name: "A", code: "DUP" });
    await expect(createWarehouse(db.prisma, { name: "B", code: "DUP" })).rejects.toThrow();
  });

  it("updates name/address without touching code", async () => {
    const w = await createWarehouse(db.prisma, { name: "Old Name", code: "MAG-02" });
    const updated = await updateWarehouse(db.prisma, w.id, { name: "New Name", address: "Via Roma 1" });
    expect(updated.name).toBe("New Name");
    expect(updated.address).toBe("Via Roma 1");
    expect(updated.code).toBe("MAG-02");
  });

  it("deactivate sets isActive=false instead of deleting the row", async () => {
    const w = await createWarehouse(db.prisma, { name: "To Deactivate", code: "MAG-03" });
    await deactivateWarehouse(db.prisma, w.id);
    const row = await db.prisma.warehouse.findUnique({ where: { id: w.id } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(false);
  });
});
