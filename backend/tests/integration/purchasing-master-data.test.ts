import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { masterDataRouter } = await import("../../src/purchasing/routes/master-data.routes");
  app = express();
  app.use(express.json());
  app.use("/api/purchasing", masterDataRouter);
});

afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("purchasing master-data routes", () => {
  it("POST + GET /warehouses round-trips a warehouse", async () => {
    const post = await request(app).post("/api/purchasing/warehouses").send({ name: "Magazzino Centrale", code: "MAG-01" });
    expect(post.status).toBe(200);
    const get = await request(app).get("/api/purchasing/warehouses");
    expect(get.body).toHaveLength(1);
    expect(get.body[0].code).toBe("MAG-01");
  });

  it("POST /payment-terms rejects installments not summing to 100 with a 400", async () => {
    const res = await request(app).post("/api/purchasing/payment-terms").send({
      name: "Bad", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 50 }],
    });
    expect(res.status).toBe(400);
  });

  it("POST + GET /bank-accounts round-trips a bank account", async () => {
    const post = await request(app).post("/api/purchasing/bank-accounts").send({
      bankName: "Intesa", alias: "Intesa WEBPLAN", accountHolder: "WBDASH SRL",
      iban: "IT60X0542811101000000123456", openingBalance: 1000, openingBalanceDate: "2026-01-01",
    });
    expect(post.status).toBe(200);
    const get = await request(app).get("/api/purchasing/bank-accounts");
    expect(get.body).toHaveLength(1);
  });

  it("DELETE /warehouses/:id deactivates, does not remove the row", async () => {
    const post = await request(app).post("/api/purchasing/warehouses").send({ name: "X", code: "MAG-99" });
    await request(app).delete(`/api/purchasing/warehouses/${post.body.id}`);
    const row = await db.prisma.warehouse.findUnique({ where: { id: post.body.id } });
    expect(row!.isActive).toBe(false);
  });
});
