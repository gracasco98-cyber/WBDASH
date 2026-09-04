import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  createTask, listTasks, updateTaskStatus, listActiveUsers,
} from "../../../src/repositories/tasks/task.repo";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  alice = (await db.prisma.user.create({ data: { email: "alice@example.com", passwordHash: "x", role: "user" } })).id;
  bob = (await db.prisma.user.create({ data: { email: "bob@example.com", passwordHash: "x", role: "user" } })).id;
});

describe("task.repo", () => {
  it("creates a task with a title, creator and assignee, defaulting to TODO", async () => {
    const task = await createTask(db.prisma, { title: "Controlla scadenza IVA", createdById: alice, assigneeId: bob });
    expect(task.title).toBe("Controlla scadenza IVA");
    expect(task.status).toBe("TODO");
    expect(task.createdById).toBe(alice);
    expect(task.assigneeId).toBe(bob);
  });

  it("listTasks filters by assignee", async () => {
    await createTask(db.prisma, { title: "Task per Bob", createdById: alice, assigneeId: bob });
    await createTask(db.prisma, { title: "Task per Alice", createdById: bob, assigneeId: alice });

    const bobsTasks = await listTasks(db.prisma, { assigneeId: bob });
    expect(bobsTasks).toHaveLength(1);
    expect(bobsTasks[0].title).toBe("Task per Bob");
  });

  it("listTasks filters by creator", async () => {
    await createTask(db.prisma, { title: "Task per Bob", createdById: alice, assigneeId: bob });
    await createTask(db.prisma, { title: "Task per Alice", createdById: bob, assigneeId: alice });

    const createdByAlice = await listTasks(db.prisma, { createdById: alice });
    expect(createdByAlice).toHaveLength(1);
    expect(createdByAlice[0].title).toBe("Task per Bob");
  });

  it("updateTaskStatus transitions status and sets completedAt only when moving to DONE", async () => {
    const task = await createTask(db.prisma, { title: "Task", createdById: alice, assigneeId: bob });

    const inProgress = await updateTaskStatus(db.prisma, { id: task.id, status: "IN_PROGRESS" });
    expect(inProgress.status).toBe("IN_PROGRESS");
    expect(inProgress.completedAt).toBeNull();

    const done = await updateTaskStatus(db.prisma, { id: task.id, status: "DONE" });
    expect(done.status).toBe("DONE");
    expect(done.completedAt).not.toBeNull();
  });

  it("listActiveUsers returns only active users, id and email only", async () => {
    await db.prisma.user.update({ where: { id: bob }, data: { isActive: false } });
    const users = await listActiveUsers(db.prisma);
    expect(users.map(u => u.email)).toEqual(["alice@example.com"]);
    expect(Object.keys(users[0]).sort()).toEqual(["email", "id"]);
  });
});
