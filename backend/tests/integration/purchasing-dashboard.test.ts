import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { dashboardRouter } = await import("../../src/purchasing/routes/dashboard.routes");
  app = express();
  app.use(express.json());
  app.use("/api/purchasing", dashboardRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("dashboard routes", () => {
  it("GET /dashboard returns a fully-populated summary on an empty database", async () => {
    const res = await request(app).get("/api/purchasing/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.ordersInProgress).toBe(0);
    expect(res.body.valueInProgress).toBe(0);
    expect(res.body.activeSuppliers).toBe(0);
    expect(res.body.statusBreakdown).toHaveLength(8);
    expect(res.body.ordersOverTime).toHaveLength(30);
    expect(res.body.topSuppliers).toEqual([]);
    expect(res.body.recentOrders).toEqual([]);
  });

  it("GET /dashboard reflects a real supplier", async () => {
    await db.prisma.supplier.create({
      data: { legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT" },
    });
    const res = await request(app).get("/api/purchasing/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.activeSuppliers).toBe(1);
  });
});
