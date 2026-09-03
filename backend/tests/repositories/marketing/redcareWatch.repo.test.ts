import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  createOrReactivateWatch, findActiveWatches, deactivateWatch,
  createSnapshot, findLatestSnapshot, findSnapshotHistory,
} from "../../../src/repositories/marketing/redcareWatch.repo";

let db: TestDb;
beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("createOrReactivateWatch", () => {
  it("creates a new active watch", async () => {
    const watch = await createOrReactivateWatch(db.prisma, {
      market: "IT", keyword: "diosmina esperidina", ean: "8057808520034", label: null, isOwn: true,
    });
    expect(watch.active).toBe(true);
    expect(watch.isOwn).toBe(true);
  });

  it("reactivates a previously deactivated watch instead of creating a duplicate", async () => {
    const created = await createOrReactivateWatch(db.prisma, {
      market: "IT", keyword: "diosmina", ean: "111", label: null, isOwn: false,
    });
    await deactivateWatch(db.prisma, created.id);

    const reactivated = await createOrReactivateWatch(db.prisma, {
      market: "IT", keyword: "diosmina", ean: "111", label: "Competitor X", isOwn: false,
    });
    expect(reactivated.id).toBe(created.id);
    expect(reactivated.active).toBe(true);
    expect(reactivated.label).toBe("Competitor X");
  });
});

describe("findActiveWatches", () => {
  it("excludes deactivated watches and filters by market", async () => {
    const it1 = await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "diosmina", ean: "1", label: null, isOwn: true });
    const de1 = await createOrReactivateWatch(db.prisma, { market: "DE", keyword: "diosmin", ean: "2", label: null, isOwn: true });
    const it2 = await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "diosmina", ean: "3", label: null, isOwn: false });
    await deactivateWatch(db.prisma, it2.id);

    const all = await findActiveWatches(db.prisma);
    expect(all.map((w) => w.id).sort()).toEqual([it1.id, de1.id].sort());

    const itOnly = await findActiveWatches(db.prisma, { market: "IT" });
    expect(itOnly.map((w) => w.id)).toEqual([it1.id]);
  });

  it("filters by ean", async () => {
    const a = await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "diosmina", ean: "111", label: null, isOwn: true });
    await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "diosmina", ean: "222", label: null, isOwn: true });

    const filtered = await findActiveWatches(db.prisma, { ean: "111" });
    expect(filtered.map((w) => w.id)).toEqual([a.id]);
  });

  it("filters by an explicit set of ids", async () => {
    const a = await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "diosmina", ean: "111", label: null, isOwn: true });
    const b = await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "esperidina", ean: "111", label: null, isOwn: true });
    await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "altro", ean: "111", label: null, isOwn: true });

    const filtered = await findActiveWatches(db.prisma, { ids: [a.id, b.id] });
    expect(filtered.map((w) => w.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("snapshots", () => {
  it("createSnapshot + findLatestSnapshot returns the most recently created one", async () => {
    const watch = await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "diosmina", ean: "1", label: null, isOwn: true });
    await createSnapshot(db.prisma, {
      watchId: watch.id, found: true, position: 3, nbHits: 29,
      price: 11.9, sellerName: "NATURPLAN", productName: "X", promoted: null, promotedByReRanking: null,
    });
    await new Promise((r) => setTimeout(r, 5));
    await createSnapshot(db.prisma, {
      watchId: watch.id, found: true, position: 1, nbHits: 29,
      price: 11.9, sellerName: "NATURPLAN", productName: "X", promoted: null, promotedByReRanking: null,
    });

    const latest = await findLatestSnapshot(db.prisma, watch.id);
    expect(latest?.position).toBe(1);
  });

  it("findLatestSnapshot returns null when no snapshot exists yet", async () => {
    const watch = await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "diosmina", ean: "1", label: null, isOwn: true });
    expect(await findLatestSnapshot(db.prisma, watch.id)).toBeNull();
  });

  it("findSnapshotHistory returns only snapshots at/after the given date, oldest first", async () => {
    const watch = await createOrReactivateWatch(db.prisma, { market: "IT", keyword: "diosmina", ean: "1", label: null, isOwn: true });
    await createSnapshot(db.prisma, {
      watchId: watch.id, found: true, position: 5, nbHits: 29,
      price: null, sellerName: null, productName: null, promoted: null, promotedByReRanking: null,
    });

    const future = new Date(Date.now() + 60_000);
    expect(await findSnapshotHistory(db.prisma, watch.id, future)).toEqual([]);

    const past = new Date(Date.now() - 60_000);
    const history = await findSnapshotHistory(db.prisma, watch.id, past);
    expect(history).toHaveLength(1);
    expect(history[0].position).toBe(5);
  });
});
