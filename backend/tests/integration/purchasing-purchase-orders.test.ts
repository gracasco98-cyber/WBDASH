import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;
let supplierId: string;
let warehouseId: string;
let paymentTermId: string;
let productId: string;
let userId: string;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { purchaseOrdersRouter } = await import("../../src/purchasing/routes/purchase-orders.routes");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId, role: "user" }; next(); });
  app.use("/api/purchasing", purchaseOrdersRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  supplierId = (await db.prisma.supplier.create({
    data: { legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT" },
  })).id;
  warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino", code: "MAG-1" } })).id;
  paymentTermId = (await db.prisma.paymentTerm.create({ data: { name: "30gg", type: "STANDARD", paymentMethod: "BONIFICO" } })).id;
  productId = (await db.prisma.product.create({ data: { name: "Widget" } })).id;
  userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
});

function baseBody() {
  return {
    supplierId, orderDate: "2026-08-08", currency: "EUR", warehouseId, paymentTermId,
    lines: [{ productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ", unitPrice: 5, taxableAmount: 50, vatAmount: 11, totalAmount: 61 }],
  };
}

describe("purchase-orders routes", () => {
  it("GET /products returns active products", async () => {
    const res = await request(app).get("/api/purchasing/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Widget");
  });

  it("POST creates an order, GET list finds it, GET :id returns lines", async () => {
    const post = await request(app).post("/api/purchasing/purchase-orders").send(baseBody());
    expect(post.status).toBe(200);
    expect(post.body.poNumber).toBe("PO-2026-000001");
    const list = await request(app).get("/api/purchasing/purchase-orders");
    expect(list.body).toHaveLength(1);
    const detail = await request(app).get(`/api/purchasing/purchase-orders/${post.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.lines).toHaveLength(1);
    expect(detail.body.lines[0].remainingQty).toBe(10);
  });

  it("POST rejects an order with no lines", async () => {
    const res = await request(app).post("/api/purchasing/purchase-orders").send({ ...baseBody(), lines: [] });
    expect(res.status).toBe(400);
  });

  it("POST rejects a line missing totalAmount with 400, not a 500 from NaN", async () => {
    const body = baseBody();
    delete (body.lines[0] as any).totalAmount;
    const res = await request(app).post("/api/purchasing/purchase-orders").send(body);
    expect(res.status).toBe(400);
  });

  it("GET :id returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/purchasing/purchase-orders/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("POST /:id/transition moves status and returns 409 for an invalid jump", async () => {
    const post = await request(app).post("/api/purchasing/purchase-orders").send(baseBody());
    const sent = await request(app).post(`/api/purchasing/purchase-orders/${post.body.id}/transition`).send({ toStatus: "SENT" });
    expect(sent.status).toBe(200);
    expect(sent.body.logisticStatus).toBe("SENT");
    const jump = await request(app).post(`/api/purchasing/purchase-orders/${post.body.id}/transition`).send({ toStatus: "READY" });
    expect(jump.status).toBe(409);
  });

  it("POST /:id/transition returns 404 for an unknown order", async () => {
    const res = await request(app).post("/api/purchasing/purchase-orders/does-not-exist/transition").send({ toStatus: "SENT" });
    expect(res.status).toBe(404);
  });
});
