import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;
let alice: string;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { boardRouter } = await import("../../src/routes/board.routes");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: alice, role: "user" }; next(); });
  app.use("/api/board", boardRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  alice = (await db.prisma.user.create({ data: { email: "alice@example.com", passwordHash: "x", role: "user" } })).id;
});

describe("GET /api/board/layout", () => {
  it("returns an empty layout when the user has never saved one", async () => {
    const res = await request(app).get("/api/board/layout");
    expect(res.status).toBe(200);
    expect(res.body.layout).toEqual([]);
  });
});

describe("PUT /api/board/layout", () => {
  it("saves the layout and it's retrievable afterwards", async () => {
    const layout = [{ i: "w1", type: "tasks", x: 0, y: 0, w: 2, h: 2 }];
    const put = await request(app).put("/api/board/layout").send({ layout });
    expect(put.status).toBe(204);

    const get = await request(app).get("/api/board/layout");
    expect(get.body.layout).toEqual(layout);
  });

  it("returns 400 when layout is not an array", async () => {
    const res = await request(app).put("/api/board/layout").send({ layout: "not-an-array" });
    expect(res.status).toBe(400);
  });
});
