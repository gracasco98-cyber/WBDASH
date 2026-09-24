/**
 * sync-state.repo.test.ts — Integration tests for the SyncState repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  findSyncState,
  initSyncState,
  updateSyncProgress,
  completeSyncState,
  markSyncStateError,
  completeIncrementalSync,
} from "../../../src/repositories/shopify/sync-state.repo";

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
});

describe("findSyncState", () => {
  it("returns null when no row exists yet", async () => {
    const state = await findSyncState(db.prisma);
    expect(state).toBeNull();
  });

  it("returns the singleton row once created", async () => {
    await db.prisma.syncState.create({ data: { id: "main", status: "idle" } });
    const state = await findSyncState(db.prisma);
    expect(state?.id).toBe("main");
    expect(state?.status).toBe("idle");
  });
});

describe("initSyncState", () => {
  it("creates the row as running on first call", async () => {
    const state = await initSyncState(db.prisma);
    expect(state.id).toBe("main");
    expect(state.status).toBe("running");
  });

  it("resets status to running and clears a prior error on an existing row", async () => {
    await db.prisma.syncState.create({
      data: { id: "main", status: "error", error: "boom" },
    });
    const state = await initSyncState(db.prisma);
    expect(state.status).toBe("running");
    expect(state.error).toBeNull();
  });
});

describe("updateSyncProgress", () => {
  it("updates totalSynced and lastSyncAt on the existing row", async () => {
    await db.prisma.syncState.create({ data: { id: "main", status: "running" } });
    const state = await updateSyncProgress(db.prisma, 42);
    expect(state.totalSynced).toBe(42);
    expect(state.lastSyncAt).not.toBeNull();
  });
});

describe("completeSyncState", () => {
  it("sets status idle with the final absolute total", async () => {
    await db.prisma.syncState.create({ data: { id: "main", status: "running" } });
    const state = await completeSyncState(db.prisma, 100);
    expect(state.status).toBe("idle");
    expect(state.totalSynced).toBe(100);
    expect(state.lastSyncAt).not.toBeNull();
  });
});

describe("markSyncStateError", () => {
  it("sets status error with the given message", async () => {
    await db.prisma.syncState.create({ data: { id: "main", status: "running" } });
    const state = await markSyncStateError(db.prisma, "API timeout");
    expect(state.status).toBe("error");
    expect(state.error).toBe("API timeout");
  });
});

describe("completeIncrementalSync", () => {
  it("increments totalSynced instead of replacing it", async () => {
    await db.prisma.syncState.create({ data: { id: "main", status: "idle", totalSynced: 50 } });
    const state = await completeIncrementalSync(db.prisma, 7);
    expect(state.totalSynced).toBe(57);
    expect(state.status).toBe("idle");
  });
});
