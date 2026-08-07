import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../helpers/db";
import { getCurrentAccountIds, tryGetCurrentAccountId } from "../../src/context/account-context";

let db: TestDb;
let app: express.Express;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let amazonAccountMiddleware: any;

beforeAll(async () => {
  db = await setupTestDb();
  // Same reason as products-performance.routes.test.ts: src/db.ts's `prisma`
  // singleton reads DATABASE_URL at import time, so the middleware module
  // (which imports it transitively via accounts.repo.ts) must be imported
  // dynamically, after DATABASE_URL points at the testcontainer.
  process.env.DATABASE_URL = db.databaseUrl;
  ({ amazonAccountMiddleware } = await import("../../src/middleware/amazon-account.middleware"));
}, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  app = express();
  app.use(amazonAccountMiddleware);
  app.get("/whoami", (_req, res) => {
    const ids = tryGetCurrentAccountId() ? getCurrentAccountIds() : null;
    res.json({ ids });
  });
});

describe("amazonAccountMiddleware", () => {
  it("leaves no account bound when zero accounts exist", async () => {
    const res = await request(app).get("/whoami");
    expect(res.body.ids).toBeNull();
  });

  it("auto-binds the single account when exactly one exists", async () => {
    const accountId = await createTestAmazonAccount(db.prisma);
    const res = await request(app).get("/whoami");
    expect(res.body.ids).toEqual([accountId]);
  });

  it("leaves no account bound when 2+ exist and none is requested (still ambiguous by default)", async () => {
    await createTestAmazonAccount(db.prisma, { sellerId: "SELLER-A" });
    await createTestAmazonAccount(db.prisma, { sellerId: "SELLER-B" });
    const res = await request(app).get("/whoami");
    expect(res.body.ids).toBeNull();
  });

  it("binds every active account when amazonAccountId=ALL is requested explicitly", async () => {
    const accountA = await createTestAmazonAccount(db.prisma, { sellerId: "SELLER-A" });
    const accountB = await createTestAmazonAccount(db.prisma, { sellerId: "SELLER-B" });
    const res = await request(app).get("/whoami?amazonAccountId=ALL");
    expect(res.body.ids?.sort()).toEqual([accountA, accountB].sort());
  });

  it("binds only the requested account when amazonAccountId is passed, even with 2+ active", async () => {
    const accountA = await createTestAmazonAccount(db.prisma, { sellerId: "SELLER-A" });
    await createTestAmazonAccount(db.prisma, { sellerId: "SELLER-B" });
    const res = await request(app).get(`/whoami?amazonAccountId=${accountA}`);
    expect(res.body.ids).toEqual([accountA]);
  });

  it("rejects an unknown/inactive amazonAccountId with 400", async () => {
    await createTestAmazonAccount(db.prisma);
    const res = await request(app).get("/whoami?amazonAccountId=not-a-real-id");
    expect(res.status).toBe(400);
  });
});
