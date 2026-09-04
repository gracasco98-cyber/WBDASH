import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;
let alice: string;
let bob: string;
let currentUserId: string;

vi.mock("../../src/sse/sse", () => ({
  broadcastToUser: vi.fn(),
}));

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { tasksRouter } = await import("../../src/routes/tasks.routes");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: currentUserId, role: "user" }; next(); });
  app.use("/api/tasks", tasksRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  alice = (await db.prisma.user.create({ data: { email: "alice@example.com", passwordHash: "x", role: "user" } })).id;
  bob = (await db.prisma.user.create({ data: { email: "bob@example.com", passwordHash: "x", role: "user" } })).id;
  currentUserId = alice;
  vi.clearAllMocks();
});

describe("POST /api/tasks", () => {
  it("creates a task assigned to another user and notifies them via SSE", async () => {
    const { broadcastToUser } = await import("../../src/sse/sse");
    const res = await request(app).post("/api/tasks").send({ title: "Controlla scadenza IVA", assigneeId: bob });
    expect(res.status).toBe(201);
    expect(res.body.createdById).toBe(alice);
    expect(res.body.assigneeId).toBe(bob);
    expect(broadcastToUser).toHaveBeenCalledWith(bob, "task:assigned", expect.objectContaining({ taskId: res.body.id }));
  });

  it("does not notify when a user assigns a task to themselves", async () => {
    const { broadcastToUser } = await import("../../src/sse/sse");
    await request(app).post("/api/tasks").send({ title: "Task mio", assigneeId: alice });
    expect(broadcastToUser).not.toHaveBeenCalled();
  });

  it("returns 400 when title is missing", async () => {
    const res = await request(app).post("/api/tasks").send({ assigneeId: bob });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tasks", () => {
  it("defaults to tasks assigned to the current user", async () => {
    await request(app).post("/api/tasks").send({ title: "Per Bob", assigneeId: bob });
    currentUserId = bob;
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Per Bob");
  });

  it("scope=created returns tasks the current user created", async () => {
    await request(app).post("/api/tasks").send({ title: "Per Bob", assigneeId: bob });
    const res = await request(app).get("/api/tasks").query({ scope: "created" });
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Per Bob");
  });
});

describe("PATCH /api/tasks/:id/status", () => {
  it("updates the status of a task", async () => {
    const create = await request(app).post("/api/tasks").send({ title: "Task", assigneeId: bob });
    const res = await request(app).patch(`/api/tasks/${create.body.id}/status`).send({ status: "DONE" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DONE");
  });

  it("returns 400 for an invalid status", async () => {
    const create = await request(app).post("/api/tasks").send({ title: "Task", assigneeId: bob });
    const res = await request(app).patch(`/api/tasks/${create.body.id}/status`).send({ status: "BOGUS" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tasks/assignable-users", () => {
  it("returns active users as id+email", async () => {
    const res = await request(app).get("/api/tasks/assignable-users");
    expect(res.status).toBe(200);
    expect(res.body.users.map((u: any) => u.email).sort()).toEqual(["alice@example.com", "bob@example.com"]);
  });
});
