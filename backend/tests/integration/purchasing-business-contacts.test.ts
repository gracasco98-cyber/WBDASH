import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { businessContactsRouter } = await import("../../src/purchasing/routes/business-contacts.routes");
  app = express();
  app.use(express.json());
  app.use("/api/purchasing", businessContactsRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("purchasing business-contacts routes", () => {
  it("POST + GET /business-contacts round-trips a contact", async () => {
    const post = await request(app).post("/api/purchasing/business-contacts").send({ type: "CLIENTE", name: "Acme Retail Srl" });
    expect(post.status).toBe(200);
    const get = await request(app).get("/api/purchasing/business-contacts");
    expect(get.body).toHaveLength(1);
    expect(get.body[0].type).toBe("CLIENTE");
  });

  it("POST /business-contacts rejects a missing name with 400", async () => {
    const res = await request(app).post("/api/purchasing/business-contacts").send({ type: "CLIENTE" });
    expect(res.status).toBe(400);
  });

  it("PUT /business-contacts/:id updates fields and returns 404 for a non-existent id", async () => {
    const post = await request(app).post("/api/purchasing/business-contacts").send({ type: "AGENTE", name: "Mario Rossi" });
    const put = await request(app).put(`/api/purchasing/business-contacts/${post.body.id}`).send({ name: "Mario Bianchi" });
    expect(put.status).toBe(200);
    expect(put.body.name).toBe("Mario Bianchi");

    const missing = await request(app).put("/api/purchasing/business-contacts/does-not-exist").send({ name: "X" });
    expect(missing.status).toBe(404);
  });

  it("DELETE /business-contacts/:id deactivates, does not remove the row", async () => {
    const post = await request(app).post("/api/purchasing/business-contacts").send({ type: "CLIENTE", name: "X" });
    await request(app).delete(`/api/purchasing/business-contacts/${post.body.id}`);
    const row = await db.prisma.businessContact.findUnique({ where: { id: post.body.id } });
    expect(row!.isActive).toBe(false);
  });
});
