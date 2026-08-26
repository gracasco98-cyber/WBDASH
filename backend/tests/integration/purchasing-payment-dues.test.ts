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
let poId: string;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { paymentDuesRouter } = await import("../../src/purchasing/routes/payment-dues.routes");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId, role: "user" }; next(); });
  app.use("/api/purchasing", paymentDuesRouter);
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

  const po = await db.prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-000001",
      supplierId, orderDate: new Date("2026-08-08"), currency: "EUR",
      logisticStatus: "CONFIRMED",
      buyerId: userId, warehouseId, paymentTermId,
      lines: {
        create: [{
          productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ",
          unitPrice: 5, taxableAmount: 50, vatAmount: 11, totalAmount: 61,
        }],
      },
    },
  });
  poId = po.id;
});

describe("payment-dues routes", () => {
  it("GET /payment-dues with no filters returns 200 and an array including a seeded due", async () => {
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-09-10"), amount: 61 } });

    const res = await request(app).get("/api/purchasing/payment-dues");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ installmentNumber: 1, status: "PENDING" });
  });

  it("GET /payment-dues?status=PAID returns only paid ones", async () => {
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-09-10"), amount: 61, status: "PAID", paidDate: new Date("2026-09-09"), paidAmount: 61 } });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 2, dueDate: new Date("2026-10-10"), amount: 30 } });

    const res = await request(app).get("/api/purchasing/payment-dues").query({ status: "PAID" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe("PAID");
  });

  it("POST /payment-dues/:id/mark-paid with a valid body returns 200 and status PAID", async () => {
    const due = await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-09-10"), amount: 61 } });

    const res = await request(app).post(`/api/purchasing/payment-dues/${due.id}/mark-paid`).send({ paidDate: "2026-09-08", paidAmount: 61 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAID");
  });

  it("POST /payment-dues/:id/mark-paid with missing paidDate returns 400", async () => {
    const due = await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-09-10"), amount: 61 } });

    const res = await request(app).post(`/api/purchasing/payment-dues/${due.id}/mark-paid`).send({ paidAmount: 61 });
    expect(res.status).toBe(400);
  });

  it("POST /payment-dues/:id/mark-paid on an unknown id returns 404", async () => {
    const res = await request(app).post("/api/purchasing/payment-dues/does-not-exist/mark-paid").send({ paidDate: "2026-09-08", paidAmount: 61 });
    expect(res.status).toBe(404);
  });
});
