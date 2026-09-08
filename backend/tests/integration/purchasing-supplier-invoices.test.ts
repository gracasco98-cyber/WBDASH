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
  const { supplierInvoicesRouter } = await import("../../src/purchasing/routes/supplier-invoices.routes");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId, role: "user" }; next(); });
  app.use("/api/purchasing", supplierInvoicesRouter);
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

describe("supplier-invoices routes", () => {
  it("POST /supplier-invoices with a valid body returns 201 and updates the linked order's financialStatus", async () => {
    const res = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-001", invoiceDate: "2026-08-10",
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    });
    expect(res.status).toBe(201);
    expect(res.body.invoiceNumber).toBe("FT-001");

    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("INVOICED");
  });

  it("POST /supplier-invoices with missing required fields returns 400", async () => {
    const res = await request(app).post("/api/purchasing/supplier-invoices").send({ supplierId });
    expect(res.status).toBe(400);
  });

  it("POST /supplier-invoices with a duplicate (supplierId, invoiceNumber) returns 409", async () => {
    await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-002", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    const res = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-002", invoiceDate: "2026-08-11", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    expect(res.status).toBe(409);
  });

  it("GET /supplier-invoices with no filters returns 200 and excludes voided invoices", async () => {
    const created = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-003", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    await request(app).post(`/api/purchasing/supplier-invoices/${created.body.id}/void`);

    const res = await request(app).get("/api/purchasing/supplier-invoices");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("GET /supplier-invoices?includeVoided=true includes voided invoices", async () => {
    const created = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-004", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    await request(app).post(`/api/purchasing/supplier-invoices/${created.body.id}/void`);

    const res = await request(app).get("/api/purchasing/supplier-invoices").query({ includeVoided: "true" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /supplier-invoices?supplierId=X filters by supplier", async () => {
    await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-005", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    const res = await request(app).get("/api/purchasing/supplier-invoices").query({ supplierId });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /supplier-invoices/:id returns 200 with supplier/order joined, 404 on unknown id", async () => {
    const created = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-006", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    const res = await request(app).get(`/api/purchasing/supplier-invoices/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.supplier.legalName).toBe("Acme");
    expect(res.body.purchaseOrder.poNumber).toBe("PO-2026-000001");

    const notFound = await request(app).get("/api/purchasing/supplier-invoices/does-not-exist");
    expect(notFound.status).toBe(404);
  });

  it("POST /supplier-invoices/:id/void returns 200 with voidedAt set, 404 on unknown id", async () => {
    const created = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-007", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    const res = await request(app).post(`/api/purchasing/supplier-invoices/${created.body.id}/void`);
    expect(res.status).toBe(200);
    expect(res.body.voidedAt).not.toBeNull();

    const notFound = await request(app).post("/api/purchasing/supplier-invoices/does-not-exist/void");
    expect(notFound.status).toBe(404);
  });

  it("POST /supplier-invoices with a supplierId that doesn't exist returns 404, not 500", async () => {
    const res = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId: "does-not-exist", invoiceNumber: "FT-008", invoiceDate: "2026-08-10",
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    expect(res.status).toBe(404);
  });

  it("POST /supplier-invoices with a purchaseOrderId belonging to a different supplier returns 400", async () => {
    const otherSupplier = await db.prisma.supplier.create({
      data: { legalName: "Other Srl", internalCode: "F2", supplierType: "Produttore", country: "IT" },
    });
    const otherPo = await db.prisma.purchaseOrder.create({
      data: {
        poNumber: "PO-2026-000002",
        supplierId: otherSupplier.id, orderDate: new Date("2026-08-08"), currency: "EUR",
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

    const res = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, purchaseOrderId: otherPo.id, invoiceNumber: "FT-009", invoiceDate: "2026-08-10",
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    });
    expect(res.status).toBe(400);
  });
});
