import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { listActiveProductsForPicker } from "../../../src/repositories/purchasing/products.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("products.repo (picker)", () => {
  it("lists active products ordered by name", async () => {
    await db.prisma.product.create({ data: { name: "Zeta Widget" } });
    await db.prisma.product.create({ data: { name: "Alpha Widget", brand: "Acme" } });
    const rows = await listActiveProductsForPicker(db.prisma);
    expect(rows.map(r => r.name)).toEqual(["Alpha Widget", "Zeta Widget"]);
    expect(rows[0].brand).toBe("Acme");
  });

  it("excludes archived products", async () => {
    await db.prisma.product.create({ data: { name: "Active One", status: "ACTIVE" } });
    await db.prisma.product.create({ data: { name: "Archived One", status: "ARCHIVED" } });
    const rows = await listActiveProductsForPicker(db.prisma);
    expect(rows.map(r => r.name)).toEqual(["Active One"]);
  });
});
