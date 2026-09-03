import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupServer } from "msw/node";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";
import { redcareSearchMocks } from "../helpers/msw-server";

const server = setupServer();
let db: TestDb;
let app: Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;

  const { default: marketingRedcareRouter } = await import("../../src/routes/marketingRedcare.routes");
  app = express();
  app.use(express.json());
  app.use("/api/marketing/redcare", marketingRedcareRouter);

  server.listen({
    onUnhandledRequest: (req, print) => {
      if (new URL(req.url).hostname === "127.0.0.1") return;
      print.error();
    },
  });
}, 60_000);

afterAll(async () => { server.close(); await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });
afterEach(() => server.resetHandlers());

describe("GET /api/marketing/redcare/search", () => {
  it("returns live ranked results for a keyword", async () => {
    server.use(redcareSearchMocks.searchPage("IT", "products_mktplc_prod_IT_it", [
      { ean: "1", productName: "A", price: 1000, best_offer: { seller: { name: "NATURPLAN" }, type: "MIRAKL" }, _rankingInfo: {} },
    ], 1));

    const res = await request(app).get("/api/marketing/redcare/search").query({ market: "IT", q: "diosmina" });
    expect(res.status).toBe(200);
    expect(res.body.hits[0]).toMatchObject({ ean: "1", position: 1 });
  });

  it("returns 400 for an invalid market", async () => {
    const res = await request(app).get("/api/marketing/redcare/search").query({ market: "FR", q: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/api/marketing/redcare/search").query({ market: "IT" });
    expect(res.status).toBe(400);
  });

  it("returns 502 when the upstream fetch fails", async () => {
    server.use(redcareSearchMocks.httpError("IT", 503));
    const res = await request(app).get("/api/marketing/redcare/search").query({ market: "IT", q: "x" });
    expect(res.status).toBe(502);
  });
});

describe("watches CRUD + history", () => {
  it("creates a watch, lists it with no snapshot yet, then soft-deletes it", async () => {
    const create = await request(app).post("/api/marketing/redcare/watches")
      .send({ market: "IT", keyword: "diosmina", ean: "8057808520034", isOwn: true });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(app).get("/api/marketing/redcare/watches");
    expect(list.status).toBe(200);
    expect(list.body.watches).toHaveLength(1);
    expect(list.body.watches[0].latestSnapshot).toBeNull();

    const del = await request(app).delete(`/api/marketing/redcare/watches/${id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get("/api/marketing/redcare/watches");
    expect(listAfter.body.watches).toHaveLength(0);
  });

  it("returns 400 when required fields are missing on create", async () => {
    const res = await request(app).post("/api/marketing/redcare/watches").send({ market: "IT" });
    expect(res.status).toBe(400);
  });

  it("history returns an empty list for a watch with no snapshots yet", async () => {
    const create = await request(app).post("/api/marketing/redcare/watches")
      .send({ market: "IT", keyword: "diosmina", ean: "1", isOwn: true });
    const res = await request(app).get(`/api/marketing/redcare/watches/${create.body.id}/history`);
    expect(res.status).toBe(200);
    expect(res.body.snapshots).toEqual([]);
  });
});

describe("POST /api/marketing/redcare/run-now", () => {
  it("responds immediately with status=started and runs the tracking job in the background", async () => {
    const create = await request(app).post("/api/marketing/redcare/watches")
      .send({ market: "IT", keyword: "diosmina esperidina", ean: "8057808520034", isOwn: true });
    const watchId = create.body.id;

    server.use(redcareSearchMocks.searchPage("IT", "products_mktplc_prod_IT_it", [
      { ean: "8057808520034", productName: "Deiscente VENAVIL", price: 1190, best_offer: { seller: { name: "NATURPLAN" }, type: "MIRAKL" }, _rankingInfo: {} },
    ], 1));

    const res = await request(app).post("/api/marketing/redcare/run-now");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "started" });

    // The job runs async (not awaited by the route, same pattern as
    // POST /api/stats/sync) — poll briefly for the snapshot it writes.
    await vi.waitFor(async () => {
      const history = await request(app).get(`/api/marketing/redcare/watches/${watchId}/history`);
      expect(history.body.snapshots).toHaveLength(1);
      expect(history.body.snapshots[0]).toMatchObject({ found: true, position: 1 });
    }, { timeout: 2000 });
  });
});

describe("POST /api/marketing/redcare/watches/check-now", () => {
  it("checks only the watches for the given market+ean and returns the result synchronously", async () => {
    const create = await request(app).post("/api/marketing/redcare/watches")
      .send({ market: "IT", keyword: "diosmina esperidina", ean: "8057808520034", isOwn: true });
    const watchId = create.body.id;
    await request(app).post("/api/marketing/redcare/watches")
      .send({ market: "IT", keyword: "altra keyword", ean: "999", isOwn: true });

    server.use(redcareSearchMocks.searchPage("IT", "products_mktplc_prod_IT_it", [
      { ean: "8057808520034", productName: "Deiscente VENAVIL", price: 1190, best_offer: { seller: { name: "NATURPLAN" }, type: "MIRAKL" }, _rankingInfo: {} },
    ], 1));

    const res = await request(app).post("/api/marketing/redcare/watches/check-now")
      .send({ market: "IT", ean: "8057808520034" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checked: 1, errors: 0 });

    const history = await request(app).get(`/api/marketing/redcare/watches/${watchId}/history`);
    expect(history.body.snapshots).toHaveLength(1);
    expect(history.body.snapshots[0]).toMatchObject({ found: true, position: 1 });
  });

  it("returns 400 when market or ean is missing", async () => {
    const res = await request(app).post("/api/marketing/redcare/watches/check-now").send({ market: "IT" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when no active watch exists for the given market+ean", async () => {
    const res = await request(app).post("/api/marketing/redcare/watches/check-now")
      .send({ market: "IT", ean: "nonexistent" });
    expect(res.status).toBe(404);
  });
});
