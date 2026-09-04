import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { getBoardLayout, saveBoardLayout } from "../../../src/repositories/tasks/board-layout.repo";

let db: TestDb;
let alice: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  alice = (await db.prisma.user.create({ data: { email: "alice@example.com", passwordHash: "x", role: "user" } })).id;
});

describe("board-layout.repo", () => {
  it("returns null when the user has no saved layout yet", async () => {
    expect(await getBoardLayout(db.prisma, alice)).toBeNull();
  });

  it("saves and retrieves a layout", async () => {
    const layout = [{ i: "w1", type: "tasks", x: 0, y: 0, w: 2, h: 2 }];
    await saveBoardLayout(db.prisma, { userId: alice, layout });
    expect(await getBoardLayout(db.prisma, alice)).toEqual(layout);
  });

  it("overwrites the previous layout on a second save (upsert, one row per user)", async () => {
    await saveBoardLayout(db.prisma, { userId: alice, layout: [{ i: "w1", type: "tasks", x: 0, y: 0, w: 2, h: 2 }] });
    const updated = [{ i: "w1", type: "tasks", x: 1, y: 1, w: 3, h: 2 }];
    await saveBoardLayout(db.prisma, { userId: alice, layout: updated });
    expect(await getBoardLayout(db.prisma, alice)).toEqual(updated);
  });
});
