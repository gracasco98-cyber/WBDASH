import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupServer } from "msw/node";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";
import { miraklMocks } from "../helpers/msw-server";

const server = setupServer();
let db: TestDb;
let app: Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  process.env.MIRAKL_API_URL = "https://shopapotheke.mirakl.net/api";
  process.env.MIRAKL_API_KEY = "test-key";

  const { default: miraklRouter } = await import("../../src/routes/mirakl.routes");
  app = express();
  app.use(express.json());
  app.use("/api/mirakl", miraklRouter);

  // "error" (usato altrove) tratterebbe come errore anche la richiesta HTTP
  // reale che supertest fa verso il server Express locale — a differenza
  // degli altri test di questo modulo, qui la richiesta sotto test passa
  // davvero per rete locale, non solo per le chiamate mockate verso Mirakl.
  server.listen({
    onUnhandledRequest: (request, print) => {
      if (new URL(request.url).hostname === "127.0.0.1") return;
      print.error();
    },
  });
}, 60_000);

afterAll(async () => {
  server.close();
  await db.cleanup();
});
beforeEach(async () => { await truncateAll(db.prisma); });
afterEach(() => server.resetHandlers());

describe("GET /api/mirakl/stuck-orders", () => {
  it("returns an empty list when Mirakl has no open orders", async () => {
    server.use(miraklMocks.newOrders([]));
    const res = await request(app).get("/api/mirakl/stuck-orders");
    expect(res.status).toBe(200);
    expect(res.body.stuckOrders).toEqual([]);
  });

  it("returns 500 with a clear error instead of crashing when Mirakl is unreachable", async () => {
    server.use(miraklMocks.httpError(500, "boom"));
    const res = await request(app).get("/api/mirakl/stuck-orders");
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});
