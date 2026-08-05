// sync-state.repo.ts — Repository layer for the SyncState singleton row (id "main").
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, SyncState } from "@prisma/client";

const MAIN_ID = "main";

// ─── Read operations ──────────────────────────────────────────────────────────

export async function findSyncState(prisma: PrismaClient): Promise<SyncState | null> {
  return prisma.syncState.findUnique({ where: { id: MAIN_ID } });
}

// ─── Write operations ─────────────────────────────────────────────────────────

/** Marks the singleton row "running", creating it on first run. */
export async function initSyncState(prisma: PrismaClient): Promise<SyncState> {
  return prisma.syncState.upsert({
    where: { id: MAIN_ID },
    create: { id: MAIN_ID, status: "running" },
    update: { status: "running", error: null },
  });
}

/** Records an in-progress batch count during the historical sync. */
export async function updateSyncProgress(prisma: PrismaClient, totalSynced: number): Promise<SyncState> {
  return prisma.syncState.update({
    where: { id: MAIN_ID },
    data: { totalSynced, lastSyncAt: new Date() },
  });
}

/** Marks the historical sync complete with its final absolute total. */
export async function completeSyncState(prisma: PrismaClient, totalSynced: number): Promise<SyncState> {
  return prisma.syncState.update({
    where: { id: MAIN_ID },
    data: { status: "idle", lastSyncAt: new Date(), totalSynced },
  });
}

export async function markSyncStateError(prisma: PrismaClient, error: string): Promise<SyncState> {
  return prisma.syncState.update({
    where: { id: MAIN_ID },
    data: { status: "error", error },
  });
}

/** Marks an incremental poll complete, adding to the running total instead of replacing it. */
export async function completeIncrementalSync(prisma: PrismaClient, syncedIncrement: number): Promise<SyncState> {
  return prisma.syncState.update({
    where: { id: MAIN_ID },
    data: { lastSyncAt: new Date(), status: "idle", totalSynced: { increment: syncedIncrement } },
  });
}
