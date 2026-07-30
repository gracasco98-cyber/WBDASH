// sync.job.ts — Initial historical sync + polling every 60s
import { prisma } from "../db";
import {
  fetchOrdersSince,
  logError,
} from "../services/shopify.service";
import { processOrderBatch } from "../services/order.service";
import { runDailySnapshotJob } from "../services/product.service";

// ─── Initial historical sync (90 days back) ───────────────────────────────────
export async function runInitialSync(): Promise<void> {
  const ninety = new Date();
  ninety.setDate(ninety.getDate() - 90);

  console.log("[Sync] Starting historical sync from", ninety.toISOString());

  await prisma.syncState.upsert({
    where: { id: "main" },
    create: { id: "main", status: "running" },
    update: { status: "running", error: null },
  });

  let totalSynced = 0;

  try {
    await fetchOrdersSince(ninety, async (batch) => {
      const { ok } = await processOrderBatch(batch);
      totalSynced += ok;
      console.log(`[Sync] Progress: ${totalSynced} orders upserted`);

      await prisma.syncState.update({
        where: { id: "main" },
        data: { totalSynced, lastSyncAt: new Date() },
      });
    });

    await prisma.syncState.update({
      where: { id: "main" },
      data: {
        status: "idle",
        lastSyncAt: new Date(),
        totalSynced,
      },
    });

    console.log(`[Sync] Historical sync complete. Total: ${totalSynced}`);
  } catch (err) {
    await logError("initial-sync", err);
    await prisma.syncState.update({
      where: { id: "main" },
      data: {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// ─── Incremental polling (every 60s) ─────────────────────────────────────────
export async function runIncrementalSync(): Promise<void> {
  const state = await prisma.syncState.findUnique({ where: { id: "main" } });
  const since = state?.lastSyncAt
    ? new Date(state.lastSyncAt.getTime() - 5 * 60 * 1000) // 5 min overlap
    : new Date(Date.now() - 10 * 60 * 1000); // fallback: last 10 min

  console.log("[Sync] Incremental sync since", since.toISOString());

  try {
    let synced = 0;
    await fetchOrdersSince(since, async (batch) => {
      const { ok } = await processOrderBatch(batch);
      synced += ok;
    });

    await prisma.syncState.update({
      where: { id: "main" },
      data: {
        lastSyncAt: new Date(),
        status: "idle",
        totalSynced: { increment: synced },
      },
    });

    if (synced > 0) {
      console.log(`[Sync] Incremental: ${synced} orders updated`);
    }
  } catch (err) {
    await logError("incremental-sync", err);
  }
}

// ─── Start polling loop ───────────────────────────────────────────────────────
export function startPolling(intervalMs = 60_000): void {
  console.log(`[Sync] Polling started (every ${intervalMs / 1000}s)`);
  setInterval(async () => {
    try {
      await runIncrementalSync();
    } catch (err) {
      await logError("polling", err);
    }
  }, intervalMs);
}

// ─── Start snapshot polling (default: every hour) ─────────────────────────────
export function startSnapshotPolling(intervalMs = 3_600_000): void {
  // Run immediately on start
  runDailySnapshotJob().catch((err) => logError("snapshot-startup", err));

  const interval = parseInt(process.env.SNAPSHOT_INTERVAL_MS ?? String(intervalMs));
  console.log(`[Snapshot] Polling started (every ${interval / 1000 / 60}min)`);
  setInterval(async () => {
    try {
      await runDailySnapshotJob();
    } catch (err) {
      await logError("snapshot-polling", err);
    }
  }, interval);
}
