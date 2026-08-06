import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { suppliersRouter } = await import("../../src/purchasing/routes/suppliers.routes");
  app = express();
  app.use(express.json());
  app.use("/api/purchasing", suppliersRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("suppliers routes", () => {
  it("POST creates a supplier, GET list finds it, GET :id returns it with empty contacts/products", async () => {
    const post = await request(app).post("/api/purchasing/suppliers").send({
      legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT",
    });
    expect(post.status).toBe(200);
    const list = await request(app).get("/api/purchasing/suppliers");
    expect(list.body).toHaveLength(1);
    const detail = await request(app).get(`/api/purchasing/suppliers/${post.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.contacts).toEqual([]);
    expect(detail.body.products).toEqual([]);
  });

  it("GET :id returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/purchasing/suppliers/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("POST /:id/contacts adds a contact, visible in the detail view", async () => {
    const post = await request(app).post("/api/purchasing/suppliers").send({
      legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT",
    });
    await request(app).post(`/api/purchasing/suppliers/${post.body.id}/contacts`).send({ name: "Mario Rossi", isPrimary: true });
    const detail = await request(app).get(`/api/purchasing/suppliers/${post.body.id}`);
    expect(detail.body.contacts).toHaveLength(1);
    expect(detail.body.contacts[0].name).toBe("Mario Rossi");
  });

  it("POST /:id/contacts returns 404 when the supplier does not exist", async () => {
    const res = await request(app)
      .post("/api/purchasing/suppliers/does-not-exist/contacts")
      .send({ name: "Mario Rossi" });
    expect(res.status).toBe(404);
  });

  it("POST /:id/products returns 404 when the supplier does not exist", async () => {
    const product = await db.prisma.product.create({ data: { name: "Test Product" } });
    const res = await request(app)
      .post("/api/purchasing/suppliers/does-not-exist/products")
      .send({ productId: product.id, standardPrice: 4.5 });
    expect(res.status).toBe(404);
  });

  it("POST /:id/products then PUT .../price appends history and updates the cached price", async () => {
    const supplierRes = await request(app).post("/api/purchasing/suppliers").send({
      legalName: "Acme", internalCode: "F2", supplierType: "Produttore", country: "IT",
    });
    const product = await db.prisma.product.create({ data: { name: "Test Product" } });
    const spRes = await request(app).post(`/api/purchasing/suppliers/${supplierRes.body.id}/products`).send({
      productId: product.id, standardPrice: 4.5,
    });
    expect(spRes.status).toBe(200);
    const priceRes = await request(app)
      .put(`/api/purchasing/suppliers/${supplierRes.body.id}/products/${spRes.body.id}/price`)
      .send({ price: 5.2, source: "listino aggiornato" });
    expect(priceRes.status).toBe(200);
    expect(Number(priceRes.body.standardPrice)).toBe(5.2);
    const detail = await request(app).get(`/api/purchasing/suppliers/${supplierRes.body.id}`);
    expect(detail.body.products[0].priceHistory).toHaveLength(2);
  });
});
