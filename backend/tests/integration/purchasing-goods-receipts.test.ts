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
let poLineId: string;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { goodsReceiptsRouter } = await import("../../src/purchasing/routes/goods-receipts.routes");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId, role: "user" }; next(); });
  app.use("/api/purchasing", goodsReceiptsRouter);
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
    include: { lines: true },
  });
  poId = po.id;
  poLineId = po.lines[0].id;
});

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    receiptDate: "2026-08-10", supplierDdtNumber: "DDT-001", supplierDdtDate: "2026-08-09",
    lines: [{ purchaseOrderLineId: poLineId, receivedQty: 10 }],
    ...overrides,
  };
}

describe("goods-receipts routes", () => {
  it("POST on a CONFIRMED order with a valid full-quantity line returns 201 and moves the order to RECEIVED", async () => {
    const res = await request(app).post(`/api/purchasing/purchase-orders/${poId}/goods-receipts`).send(baseBody());
    expect(res.status).toBe(201);
    expect(res.body.supplierDdtNumber).toBe("DDT-001");
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0]).toMatchObject({ purchaseOrderLineId: poLineId, receivedQty: 10 });
    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.logisticStatus).toBe("RECEIVED");
  });

  it("POST with a purchaseOrderLineId that doesn't belong to the order returns 400", async () => {
    const other = await db.prisma.purchaseOrder.create({
      data: {
        poNumber: "PO-2026-000003",
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
      include: { lines: true },
    });
    const res = await request(app).post(`/api/purchasing/purchase-orders/${poId}/goods-receipts`).send(
      baseBody({ lines: [{ purchaseOrderLineId: other.lines[0].id, receivedQty: 5 }] })
    );
    expect(res.status).toBe(400);
  });

  it("POST with receivedQty exceeding the remaining quantity returns 409", async () => {
    const res = await request(app).post(`/api/purchasing/purchase-orders/${poId}/goods-receipts`).send(
      baseBody({ lines: [{ purchaseOrderLineId: poLineId, receivedQty: 999 }] })
    );
    expect(res.status).toBe(409);
  });

  it("POST on a DRAFT order returns 409", async () => {
    const draft = await db.prisma.purchaseOrder.create({
      data: {
        poNumber: "PO-2026-000002",
        supplierId, orderDate: new Date("2026-08-08"), currency: "EUR",
        logisticStatus: "DRAFT",
        buyerId: userId, warehouseId, paymentTermId,
        lines: {
          create: [{
            productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ",
            unitPrice: 5, taxableAmount: 50, vatAmount: 11, totalAmount: 61,
          }],
        },
      },
      include: { lines: true },
    });
    const res = await request(app).post(`/api/purchasing/purchase-orders/${draft.id}/goods-receipts`).send(
      baseBody({ lines: [{ purchaseOrderLineId: draft.lines[0].id, receivedQty: 5 }] })
    );
    expect(res.status).toBe(409);
  });

  it("POST with missing supplierDdtNumber returns 400", async () => {
    const body = baseBody();
    delete (body as any).supplierDdtNumber;
    const res = await request(app).post(`/api/purchasing/purchase-orders/${poId}/goods-receipts`).send(body);
    expect(res.status).toBe(400);
  });

  it("GET on an order with two receipts returns 200 and an array of length 2", async () => {
    await request(app).post(`/api/purchasing/purchase-orders/${poId}/goods-receipts`).send(
      baseBody({ supplierDdtNumber: "DDT-001", lines: [{ purchaseOrderLineId: poLineId, receivedQty: 4 }] })
    );
    await request(app).post(`/api/purchasing/purchase-orders/${poId}/goods-receipts`).send(
      baseBody({ supplierDdtNumber: "DDT-002", lines: [{ purchaseOrderLineId: poLineId, receivedQty: 3 }] })
    );
    const res = await request(app).get(`/api/purchasing/purchase-orders/${poId}/goods-receipts`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});
