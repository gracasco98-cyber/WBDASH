// amazon/sync.job.ts — Amazon backfill + incremental sync scheduler

import { prisma } from "../db";
import { ALL_EU_MARKETPLACE_IDS, ALL_NA_MARKETPLACE_IDS, MARKETPLACE_IDS, MARKETPLACE_REGION, REPORT_MAX_DAYS } from "./config";
import { fetchOrderReport } from "./sp-api.service";
import { parseTsv, ingestOrderRows, IngestStats } from "./ingest.service";
import { runAmazonSnapshotJob, computeAllAmazonHistoricalSnapshots } from "./snapshot.service";
import { syncSettlementReports } from "./settlement.service";
import { syncAdsDaily, syncAdsBackfill, refreshLiveCampaignCache, syncKeywordMetrics, syncAdsCatchUp } from "./ads-sync.service";
import { reconcileForecastSnapshots, computeAndSaveForecasts } from "./forecast";
import { broadcast } from "../sse/sse";
import { createSyncJob, finishSyncJob } from "../repositories/amazon/sync-jobs.repo";
import { countAllAdSnapshots } from "../repositories/amazon/ads.repo";
import { countAllAmazonOrders, countAllAmazonOrderItems } from "../repositories/amazon/orders.repo";
import { countAllAmazonProductSnapshots } from "../repositories/amazon/product-snapshots.repo";
import { countSyncJobsByStatus } from "../repositories/amazon/sync-jobs.repo";
import { runWithAccount, getCurrentAccountId } from "../context/account-context";
import { findActiveAccounts } from "../repositories/amazon/accounts.repo";
import { hasNACredentials } from "./token.service";

export { syncAdsBackfill };

// ─── Multi-account iteration ───────────────────────────────────────────────────
// setInterval/setTimeout callbacks run outside any HTTP request, so they don't
// inherit an AsyncLocalStorage account scope the way route handlers do (see
// context/account-context.ts) — they must resolve the account list themselves
// and run each account's sync sequentially (safer for SP-API rate limits than
// running all accounts concurrently).
async function forEachActiveAccount(
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  const accounts = await findActiveAccounts(prisma);
  if (accounts.length === 0) {
    console.warn(`[Amazon Sync] ${label}: no active AmazonAccount configured — skipping`);
    return;
  }
  for (const account of accounts) {
    try {
      await runWithAccount(account.id, fn);
    } catch (err) {
      console.error(`[Amazon Sync] ${label} failed for account ${account.id} (${account.name}):`, err);
    }
  }
}

/** Create a sync job record */
async function createJob(
  jobType: string,
  marketplace: string,
  dateFrom: Date,
  dateTo: Date
): Promise<string> {
  return createSyncJob(prisma, { jobType, marketplace, dateFrom, dateTo });
}

/** Update a sync job record */
async function finishJob(
  id: string,
  stats: { recordsIn: number; recordsImported: number; recordsUpdated: number; recordsRejected: number },
  error?: string
): Promise<void> {
  return finishSyncJob(prisma, id, stats, error);
}

/** Split a date range into chunks of at most REPORT_MAX_DAYS days */
function splitDateRange(from: Date, to: Date, chunkDays: number): Array<[Date, Date]> {
  const chunks: Array<[Date, Date]> = [];
  let cur = new Date(from);
  while (cur < to) {
    const end = new Date(cur);
    end.setDate(end.getDate() + chunkDays);
    if (end > to) end.setTime(to.getTime());
    chunks.push([new Date(cur), new Date(end)]);
    cur = new Date(end);
    cur.setDate(cur.getDate() + 1);
  }
  return chunks;
}

/**
 * Cache of marketplace IDs confirmed working per (account, region) —
 * keyed by `${amazonAccountId}:${region}` so two accounts never share a
 * probe result (fixed during the multi-account migration; previously a
 * single shared cache, see docs/tech-debt.md F.3).
 */
const validMarketplaceIdsCache = new Map<string, string[]>();

/** Fetch a report with automatic per-marketplace fallback on InvalidInput errors */
async function fetchReportRobust(marketplaceIds: string[], dateFrom: Date, dateTo: Date, region: "EU" | "NA" = "EU"): Promise<string> {
  try {
    return await fetchOrderReport(marketplaceIds, dateFrom, dateTo, region);
  } catch (err) {
    const msg = String(err);
    if (!msg.includes("InvalidInput") && !msg.includes("Invalid Marketplace")) throw err;

    const cacheKey = `${getCurrentAccountId()}:${region}`;

    // Try each marketplace individually, collect rows from valid ones
    console.log(`[Amazon Sync] Falling back to per-marketplace ${region} requests...`);
    const allRows: string[] = [];
    let headerLine = "";

    for (const mpId of marketplaceIds) {
      try {
        const raw = await fetchOrderReport([mpId], dateFrom, dateTo, region);
        const lines = raw.split("\n").filter(l => l.trim());
        if (lines.length > 1) {
          if (!headerLine) headerLine = lines[0];
          allRows.push(...lines.slice(1));
        }
        // Cache valid marketplace for this account+region
        const cache = validMarketplaceIdsCache.get(cacheKey);
        if (cache && !cache.includes(mpId)) cache.push(mpId);
        else if (!cache) validMarketplaceIdsCache.set(cacheKey, [mpId]);
      } catch (mpErr) {
        const mpMsg = String(mpErr);
        if (mpMsg.includes("InvalidInput") || mpMsg.includes("Invalid Marketplace")) {
          console.log(`[Amazon Sync] Skipping invalid ${region} marketplace ${mpId}`);
          const cache = validMarketplaceIdsCache.get(cacheKey);
          if (cache) validMarketplaceIdsCache.set(cacheKey, cache.filter(id => id !== mpId));
        } else {
          console.error(`[Amazon Sync] Error for ${region} marketplace ${mpId}:`, mpErr);
        }
      }
    }

    if (!headerLine) return "";
    return [headerLine, ...allRows].join("\n");
  }
}

/**
 * Run a backfill for N days back (or from an explicit start date).
 * Requests one report per date chunk, with per-marketplace fallback on errors.
 * @param days        How many days back from today (ignored if dateFrom is provided)
 * @param marketplace Optional marketplace code (IT|DE|FR|ES). Omit for ALL_EU.
 * @param dateFrom    Optional explicit start date (ISO string or Date)
 */
export async function runAmazonBackfill(
  days = 30,
  marketplace?: string,
  dateFrom?: Date | string
): Promise<void> {
  const dateTo = new Date();
  const resolvedFrom = dateFrom
    ? new Date(dateFrom)
    : (() => { const d = new Date(); d.setDate(d.getDate() - days); return d; })();

  // Determine region + marketplace IDs
  const isAllNA   = marketplace === "ALL_NA";
  const region: "EU" | "NA" = (marketplace && marketplace !== "ALL_NA")
    ? (MARKETPLACE_REGION[marketplace] ?? "EU")
    : isAllNA ? "NA" : "EU";
  const marketplaceLabel = marketplace ?? "ALL_EU";
  const marketplaceIds = isAllNA
    ? ALL_NA_MARKETPLACE_IDS
    : marketplace
    ? [MARKETPLACE_IDS[marketplace]].filter(Boolean)
    : ALL_EU_MARKETPLACE_IDS;

  const actualDays = Math.round((dateTo.getTime() - resolvedFrom.getTime()) / 86400000);
  console.log(`[Amazon Sync] Starting ${actualDays}-day backfill (${resolvedFrom.toISOString().split("T")[0]} → ${dateTo.toISOString().split("T")[0]}) for ${marketplaceLabel}...`);

  const chunks = splitDateRange(resolvedFrom, dateTo, REPORT_MAX_DAYS);
  const totals: IngestStats = { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 };

  for (const [from, to] of chunks) {
    const jobId = await createJob("orders_backfill", marketplaceLabel, from, to);
    const label = `${from.toISOString().split("T")[0]} → ${to.toISOString().split("T")[0]}`;

    try {
      console.log(`[Amazon Sync] Fetching report ${label}`);
      const raw = await fetchReportRobust(marketplaceIds, from, to, region);
      const rows = parseTsv(raw);
      console.log(`[Amazon Sync] Parsed ${rows.length} rows`);

      const stats = await ingestOrderRows(rows);
      totals.recordsIn        += stats.recordsIn;
      totals.recordsImported  += stats.recordsImported;
      totals.recordsUpdated   += stats.recordsUpdated;
      totals.recordsRejected  += stats.recordsRejected;
      console.log(`[Amazon Sync] ${label} done — +${stats.recordsImported} new, ~${stats.recordsUpdated} updated`);
      await finishJob(jobId, stats);
    } catch (err) {
      const msg = String(err);
      console.error(`[Amazon Sync] Backfill chunk ${label} failed:`, err);
      await finishJob(jobId, { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 }, msg);
    }
  }

  console.log(`[Amazon Sync] Backfill complete — total imported: ${totals.recordsImported}, updated: ${totals.recordsUpdated}`);
  console.log("[Amazon Sync] Rebuilding snapshots...");
  await runAmazonSnapshotJob();
}

/** Incremental sync for a single region */
async function runIncrementalForRegion(region: "EU" | "NA"): Promise<void> {
  const dateTo   = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 2);

  const marketplaceIds  = region === "NA" ? ALL_NA_MARKETPLACE_IDS : ALL_EU_MARKETPLACE_IDS;
  const marketplaceLabel = region === "NA" ? "ALL_NA" : "ALL_EU";

  const jobId = await createJob("orders_incremental", marketplaceLabel, dateFrom, dateTo);
  console.log(`[Amazon Sync] Running ${region} incremental sync (last 2 days)...`);

  try {
    const raw   = await fetchReportRobust(marketplaceIds, dateFrom, dateTo, region);
    const rows  = parseTsv(raw);
    const stats = await ingestOrderRows(rows);
    console.log(`[Amazon Sync] ${region} incremental done — in: ${stats.recordsIn}, imported: ${stats.recordsImported}, updated: ${stats.recordsUpdated}, rejected: ${stats.recordsRejected}`);
    await finishJob(jobId, stats);

    // Broadcast live event when new Amazon orders arrive
    if (stats.recordsImported > 0) {
      broadcast("amazon:sync", {
        region,
        imported: stats.recordsImported,
        updated:  stats.recordsUpdated,
        ts:       new Date().toISOString(),
      });
    }
  } catch (err) {
    const msg = String(err);
    console.error(`[Amazon Sync] ${region} incremental failed:`, err);
    await finishJob(jobId, { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 }, msg);
  }
}

/** Incremental sync: fetch orders updated in the last 2 days (EU + NA if configured) */
export async function runAmazonIncrementalSync(): Promise<void> {
  // Skip if full sync is running — avoid SP-API report contention
  if (_fullSyncRunning) {
    console.log("[Amazon Sync] Skipping incremental — full sync in progress");
    return;
  }

  // Always run EU
  await runIncrementalForRegion("EU");

  // Run NA only if the current account has NA-region SP-API credentials configured
  if (await hasNACredentials()) {
    await runIncrementalForRegion("NA");
  }

  await runAmazonSnapshotJob();
}

/** Start 5-minute incremental polling (all active Amazon accounts, sequentially) */
export function startAmazonPolling(): void {
  const INTERVAL_MS = 5 * 60 * 1_000; // 5 minuti
  console.log("[Amazon Sync] Starting 5-min incremental polling...");
  const run = () => forEachActiveAccount("incremental sync", runAmazonIncrementalSync);
  // First run after 15s to let DB settle
  setTimeout(() => { run().catch(console.error); }, 15_000);
  setInterval(() => { run().catch(console.error); }, INTERVAL_MS);
}

/**
 * Start daily snapshot cron (runs at 01:00 and also every hour for today's data).
 * Every scheduled job here runs once per active Amazon account, sequentially
 * (see forEachActiveAccount) — none of these callbacks have an inherited
 * request-scoped account context to fall back on.
 */
export function startAmazonSnapshotPolling(): void {
  console.log("[Amazon Sync] Starting snapshot polling...");

  // Hourly refresh of today + yesterday snapshots
  setInterval(() => {
    forEachActiveAccount("hourly snapshot refresh", runAmazonSnapshotJob).catch(console.error);
  }, 3_600_000);

  // Daily full rebuild at 01:00 local time
  function scheduleDailyRebuild() {
    const now = new Date();
    const next1am = new Date(now);
    next1am.setHours(1, 0, 0, 0);
    if (next1am <= now) next1am.setDate(next1am.getDate() + 1);
    const msUntil = next1am.getTime() - now.getTime();
    setTimeout(() => {
      console.log("[Amazon Sync] Daily snapshot rebuild starting...");
      forEachActiveAccount("daily snapshot rebuild", () => computeAllAmazonHistoricalSnapshots(180)).catch(console.error);
      scheduleDailyRebuild(); // re-schedule for next day
    }, msUntil);
    console.log(`[Amazon Sync] Daily rebuild scheduled in ${Math.round(msUntil / 3600000)}h`);
  }
  scheduleDailyRebuild();

  // Settlement sync: every 4 hours + reconcile forecast snapshots after each run
  const runSettlementAndReconcile = () =>
    forEachActiveAccount("settlement sync + reconcile", async () => {
      await syncSettlementReports().catch(console.error);
      await reconcileForecastSnapshots().catch(err =>
        console.warn("[Calibration] reconcile after settlement sync:", err)
      );
    });
  setInterval(() => {
    console.log("[Amazon Sync] Running scheduled settlement sync...");
    runSettlementAndReconcile().catch(console.error);
  }, 4 * 3_600_000);

  // First settlement sync after 30s on startup
  setTimeout(() => {
    runSettlementAndReconcile().catch(console.error);
  }, 30_000);

  // Automatic forecast snapshots: every 6h (independent of page loads)
  const runForecastSnapshots = () =>
    forEachActiveAccount("forecast snapshot", () =>
      computeAndSaveForecasts().catch(err =>
        console.warn("[Calibration] Auto forecast snapshot error:", err)
      )
    );
  setInterval(() => { runForecastSnapshots().catch(console.error); }, 6 * 3_600_000);
  // First run after 5 minutes (let settlement sync complete first)
  setTimeout(() => { runForecastSnapshots().catch(console.error); }, 5 * 60_000);

  // ── Ads campaign live-list cache: refresh every 2 minutes ──────────────────
  setInterval(() => {
    forEachActiveAccount("ads campaign cache refresh", refreshLiveCampaignCache).catch(console.error);
  }, 2 * 60_000);

  // Pre-warm the campaign cache 10s after startup (non-blocking)
  setTimeout(() => {
    forEachActiveAccount("ads campaign cache pre-warm", refreshLiveCampaignCache).catch(console.error);
  }, 10_000);

  // ── Ads daily metrics sync: every 24h ────────────────────────────────────
  setInterval(() => {
    console.log("[Amazon Sync] Running scheduled ads daily sync...");
    forEachActiveAccount("ads daily sync", syncAdsDaily).catch(console.error);
  }, 24 * 3_600_000);

  // Ads daily sync: run 90s after startup
  setTimeout(() => {
    forEachActiveAccount("ads daily sync", syncAdsDaily).catch(console.error);
  }, 90_000);

  // ── Keyword metrics sync: every 3 hours ──────────────────────────────────
  setInterval(() => {
    console.log("[Amazon Sync] Running 3h keyword metrics sync...");
    forEachActiveAccount("keyword metrics sync", () => syncKeywordMetrics(30)).catch(console.error);
  }, 3 * 3_600_000);

  // First keyword sync: 3 min after startup (let other syncs settle first)
  setTimeout(() => {
    forEachActiveAccount("keyword metrics sync", () => syncKeywordMetrics(30)).catch(console.error);
  }, 3 * 60_000);

  // ── Auto-backfill ads if AmazonAdSnapshot is empty ────────────────────────
  setTimeout(() => {
    forEachActiveAccount("ads auto-backfill check", async () => {
      const count = await countAllAdSnapshots(prisma);
      if (count === 0) {
        console.log("[Amazon Sync] No AmazonAdSnapshot data — auto-triggering 30-day ads backfill...");
        await syncAdsBackfill(30).catch(console.error);
      }
    }).catch((e) => console.warn("[Amazon Sync] Auto-backfill check failed:", e));
  }, 5_000);

  // ── Ads catch-up: on startup, sync any missing days from last snapshot to yesterday ──
  setTimeout(() => {
    forEachActiveAccount("ads catch-up", syncAdsCatchUp).catch((e) =>
      console.warn("[Ads CatchUp] startup failed:", e)
    );
  }, 60_000); // 60s after startup

  // ── Search term auto-sync: every night at 02:00 ──────────────────────────
  function scheduleNightlySearchTermSync() {
    const now = new Date();
    const next2am = new Date(now);
    next2am.setHours(2, 0, 0, 0);
    if (next2am <= now) next2am.setDate(next2am.getDate() + 1);
    const msUntil = next2am.getTime() - now.getTime();
    setTimeout(async () => {
      console.log("[Search Terms] Nightly auto-sync starting...");
      await forEachActiveAccount("nightly search term sync", async () => {
        const { runSearchTermSync } = await import("./routes");
        await runSearchTermSync(30);
      }).catch((e) => console.warn("[Search Terms] Nightly sync failed:", e));
      scheduleNightlySearchTermSync(); // re-schedule
    }, msUntil);
    console.log(`[Search Terms] Nightly sync scheduled in ${Math.round(msUntil / 3600000)}h`);
  }
  scheduleNightlySearchTermSync();
}

// ─── FULL DATABASE SYNC ────────────────────────────────────────────────────────
/**
 * Orchestrates a complete Amazon database sync from a given start date:
 *  Phase 1 — Orders backfill (SP-API flat-file report, 30-day chunks)
 *  Phase 2 — Settlement reports (all available, covers P&L)
 *  Phase 2 — Advertising daily metrics backfill (AmazonAdSnapshot)
 *  Phase 2 — Keyword metrics sync
 *  Phase 3 — Rebuild all daily product snapshots (AmazonProductSnapshot)
 * Progress is emitted via console and tracked in AmazonSyncJob records.
 */
export interface FullSyncProgress {
  phase: string;
  step: string;
  pct: number;
  detail: string;
}

let _fullSyncRunning = false;
let _fullSyncProgress: FullSyncProgress = { phase: "idle", step: "", pct: 0, detail: "" };
let _fullSyncError: string | null = null;

export function getFullSyncProgress() {
  return { ..._fullSyncProgress, running: _fullSyncRunning, error: _fullSyncError };
}

export async function runFullAmazonDatabaseSync(dateFrom: Date | string): Promise<void> {
  if (_fullSyncRunning) {
    console.log("[Full Sync] Already running — skipping duplicate request");
    return;
  }

  _fullSyncRunning = true;
  _fullSyncError = null;
  const startFrom = new Date(dateFrom);
  const now = new Date();
  const totalDays = Math.round((now.getTime() - startFrom.getTime()) / 86400000);

  const emit = (phase: string, step: string, pct: number, detail: string) => {
    _fullSyncProgress = { phase, step, pct, detail };
    console.log(`[Full Sync] [${pct}%] ${phase} › ${step} — ${detail}`);
  };

  try {
    // ── PHASE 1: ORDERS ────────────────────────────────────────────────────────
    const hasNA = await hasNACredentials();
    emit("Phase 1: Orders", "Starting", 1, `Backfill orders from ${startFrom.toISOString().split("T")[0]} — ${totalDays} days (EU${hasNA ? " + NA" : ""})`);

    const regionsToSync: Array<{ region: "EU" | "NA"; label: string; ids: string[] }> = [
      { region: "EU", label: "ALL_EU", ids: ALL_EU_MARKETPLACE_IDS },
      ...(hasNA ? [{ region: "NA" as "EU" | "NA", label: "ALL_NA", ids: ALL_NA_MARKETPLACE_IDS }] : []),
    ];

    const chunks = splitDateRange(startFrom, now, REPORT_MAX_DAYS);
    const totals: IngestStats = { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 };
    const totalChunks = chunks.length * regionsToSync.length;

    let chunkIdx = 0;
    for (const { region, label: regionLabel, ids } of regionsToSync) {
      for (const [from, to] of chunks) {
        const label = `${regionLabel} ${from.toISOString().split("T")[0]} → ${to.toISOString().split("T")[0]}`;
        const pctStart = Math.round(1 + (chunkIdx / totalChunks) * 35);
        const pctEnd   = Math.round(1 + ((chunkIdx + 1) / totalChunks) * 35);
        emit("Phase 1: Orders", `Chunk ${chunkIdx + 1}/${totalChunks} — richiesta report SP-API...`, pctStart, label);

        const jobId = await createJob("orders_backfill", regionLabel, from, to);
        try {
          emit("Phase 1: Orders", `Chunk ${chunkIdx + 1}/${totalChunks} — attesa Amazon (1-10 min)...`, pctStart, label);
          const raw = await fetchReportRobust(ids, from, to, region);
          emit("Phase 1: Orders", `Chunk ${chunkIdx + 1}/${totalChunks} — parsing e import DB...`, Math.round((pctStart + pctEnd) / 2), label);
          const rows = parseTsv(raw);
          const stats = await ingestOrderRows(rows);
          totals.recordsIn       += stats.recordsIn;
          totals.recordsImported += stats.recordsImported;
          totals.recordsUpdated  += stats.recordsUpdated;
          totals.recordsRejected += stats.recordsRejected;
          await finishJob(jobId, stats);
          emit("Phase 1: Orders", `Chunk ${chunkIdx + 1}/${totalChunks} ✅`, pctEnd, `${label} — +${stats.recordsImported} nuovi, ~${stats.recordsUpdated} aggiornati (totale: ${totals.recordsImported})`);
        } catch (err) {
          await finishJob(jobId, { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 }, String(err));
          console.error(`[Full Sync] Orders chunk ${label} failed:`, err);
          emit("Phase 1: Orders", `Chunk ${chunkIdx + 1}/${totalChunks} ⚠️ errore`, pctEnd, `${label} — ${String(err).slice(0, 100)}`);
        }
        chunkIdx++;
      }
    }

    emit("Phase 1: Orders", "Complete", 36, `Total: ${totals.recordsImported} imported, ${totals.recordsUpdated} updated`);

    // ── PHASE 2: SETTLEMENT (P&L) ─────────────────────────────────────────────
    emit("Phase 2: Settlement / P&L", "Starting", 37, "Fetching available settlement reports...");
    try {
      await syncSettlementReports();
      emit("Phase 2: Settlement / P&L", "Complete", 50, "Settlement reports synced");
    } catch (err) {
      console.error("[Full Sync] Settlement failed:", err);
      emit("Phase 2: Settlement / P&L", "Failed", 50, String(err).slice(0, 120));
    }

    // ── PHASE 2: ADS BACKFILL ─────────────────────────────────────────────────
    emit("Phase 2: Advertising (PPC)", "Starting", 51, `Backfill ads from ${startFrom.toISOString().split("T")[0]}...`);
    try {
      const adsDays = Math.min(totalDays, 365); // Ads API max ~1 year
      await syncAdsBackfill(adsDays);
      emit("Phase 2: Advertising (PPC)", "Complete", 70, `Ads backfill complete (${adsDays} days)`);
    } catch (err) {
      console.error("[Full Sync] Ads backfill failed:", err);
      emit("Phase 2: Advertising (PPC)", "Failed", 70, String(err).slice(0, 120));
    }

    // ── PHASE 2: KEYWORD METRICS ──────────────────────────────────────────────
    emit("Phase 2: Keyword Metrics", "Starting", 71, "Syncing keyword-level metrics...");
    try {
      const kwDays = Math.min(totalDays, 60); // keyword reports up to 60 days
      await syncKeywordMetrics(kwDays);
      emit("Phase 2: Keyword Metrics", "Complete", 80, "Keywords synced");
    } catch (err) {
      console.error("[Full Sync] Keyword metrics failed:", err);
      emit("Phase 2: Keyword Metrics", "Failed", 80, String(err).slice(0, 120));
    }

    // ── PHASE 3: SNAPSHOT REBUILD ─────────────────────────────────────────────
    emit("Phase 3: Snapshot Rebuild", "Starting", 81, "Rebuilding all product daily snapshots...");
    try {
      await computeAllAmazonHistoricalSnapshots(totalDays + 5);
      emit("Phase 3: Snapshot Rebuild", "Complete", 95, "All snapshots rebuilt");
    } catch (err) {
      console.error("[Full Sync] Snapshot rebuild failed:", err);
      emit("Phase 3: Snapshot Rebuild", "Failed", 95, String(err).slice(0, 120));
    }

    // ── PHASE 3: VERIFICATION ─────────────────────────────────────────────────
    emit("Phase 3: Verification", "Running", 96, "Counting records in all tables...");
    try {
      const [orders, items, snapshots, adSnapshots, settlements, syncJobs] = await Promise.all([
        countAllAmazonOrders(prisma),
        countAllAmazonOrderItems(prisma),
        countAllAmazonProductSnapshots(prisma),
        countAllAdSnapshots(prisma),
        (prisma as any).amazonSettlementEntry?.count().catch(() => 0) ?? Promise.resolve(0),
        countSyncJobsByStatus(prisma, "done"),
      ]);
      const summary = `Orders: ${orders} | Items: ${items} | Snapshots: ${snapshots} | AdSnapshots: ${adSnapshots} | SyncJobs done: ${syncJobs}`;
      emit("Phase 3: Verification", "Complete", 100, summary);
      console.log("[Full Sync] ✅ Database verification:", summary);
    } catch (err) {
      emit("Phase 3: Verification", "Done", 100, "Verification query failed — data may still be correct");
    }

    console.log("[Full Sync] ✅ Full Amazon database sync completed!");
  } catch (err) {
    _fullSyncError = String(err);
    console.error("[Full Sync] Fatal error:", err);
    _fullSyncProgress = { phase: "Error", step: "Fatal", pct: _fullSyncProgress.pct, detail: String(err).slice(0, 200) };
  } finally {
    _fullSyncRunning = false;
  }
}
