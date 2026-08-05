/**
 * error-log.repo.test.ts — Integration tests for the AppErrorLog repository layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findRecentErrors } from "../../../src/repositories/shopify/error-log.repo";

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
});

describe("findRecentErrors", () => {
  it("returns an empty array when no errors are logged", async () => {
    const errors = await findRecentErrors(db.prisma);
    expect(errors).toEqual([]);
  });

  it("returns errors ordered most-recent first", async () => {
    await db.prisma.appErrorLog.create({
      data: { source: "sync", message: "first", createdAt: new Date("2026-08-01T00:00:00Z") },
    });
    await db.prisma.appErrorLog.create({
      data: { source: "sync", message: "second", createdAt: new Date("2026-08-02T00:00:00Z") },
    });

    const errors = await findRecentErrors(db.prisma);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toBe("second");
    expect(errors[1].message).toBe("first");
  });

  it("respects the take limit", async () => {
    await db.prisma.appErrorLog.createMany({
      data: [
        { source: "sync", message: "a" },
        { source: "sync", message: "b" },
        { source: "sync", message: "c" },
      ],
    });

    const errors = await findRecentErrors(db.prisma, 2);
    expect(errors).toHaveLength(2);
  });
});
