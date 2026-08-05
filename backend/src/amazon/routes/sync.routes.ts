// amazon/routes/sync.routes.ts — Sync jobs, auth, and admin endpoints
import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../../db";
import {
  countAllAmazonOrders,
  countAllAmazonOrderItems,
  groupAmazonOrdersByMarketplace,
  findAmazonOrderDateRange,
} from "../../repositories/amazon/orders.repo";
import {
  countAllAmazonProductSnapshots,
  findAmazonProductSnapshotDateRange,
} from "../../repositories/amazon/product-snapshots.repo";
import {
  countAllAdSnapshots,
  findAmazonAdSnapshotDateRange,
} from "../../repositories/amazon/ads.repo";
import {
  findRecentSyncJobs,
  countSyncJobsByStatus,
} from "../../repositories/amazon/sync-jobs.repo";
import { countSettlementTransactions } from "../../repositories/amazon/settlement.repo";
import { runAmazonBackfill, runAmazonIncrementalSync, syncAdsBackfill, runFullAmazonDatabaseSync, getFullSyncProgress } from "../sync.job";
import { runAmazonSnapshotJob, computeAllAmazonHistoricalSnapshots, computeSnapshotRange } from "../snapshot.service";
import { syncSettlementReports } from "../settlement.service";
import { syncAdsDaily } from "../ads-sync.service";
import { runSearchTermSync, _stSyncing } from "./ppc-extra.routes";
import { syncKeywordMetrics } from "../ads-sync.service";

export const syncRouter = Router();

// ─── POST /sync/ads/search-terms ───────────────────────────────────────────────
// Trigger search term report generation (async — takes ~10 min)
syncRouter.post("/sync/ads/search-terms", async (req: Request, res: Response) => {
  const { days = 30, marketplace } = req.body ?? {};
  if (_stSyncing) {
    return res.json({ status: "already_running" });
  }
  res.json({ status: "started", days, marketplace: marketplace ?? "all" });
  runSearchTermSync(Number(days), marketplace || undefined).catch(console.error);
});

// ─── POST /sync/ads/keywords ───────────────────────────────────────────────────
// Trigger keyword metrics sync (async — runs in background)
syncRouter.post("/sync/ads/keywords", async (req: Request, res: Response) => {
  const { days = 30 } = req.body ?? {};
  res.json({ status: "started", days });
  syncKeywordMetrics(Number(days)).catch(console.error);
});

// ─── GET /sync/jobs ────────────────────────────────────────────────────────────
syncRouter.get("/sync/jobs", async (_req: Request, res: Response) => {
  try {
    const jobs = await findRecentSyncJobs(prisma, 100);
    res.json(jobs);
  } catch (err) {
    console.error("[Amazon] GET /sync/jobs:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /sync/backfill ──────────────────────────────────────────────────────
syncRouter.post("/sync/backfill", async (req: Request, res: Response) => {
  const { days = 30, marketplace, dateFrom } = req.body ?? {};
  const resolvedDays = dateFrom
    ? Math.round((Date.now() - new Date(dateFrom).getTime()) / 86400000)
    : Number(days);
  res.json({ status: "started", days: resolvedDays, marketplace: marketplace ?? "ALL_EU", region: (marketplace === "US" || marketplace === "CA" || marketplace === "MX" || marketplace === "ALL_NA") ? "NA" : "EU" });
  runAmazonBackfill(resolvedDays, marketplace || undefined, dateFrom ? new Date(dateFrom) : undefined).catch(console.error);
});

// ─── POST /sync/full ───────────────────────────────────────────────────────────
// Orchestrated full-database sync: orders + settlement + ads + snapshots
syncRouter.post("/sync/full", async (req: Request, res: Response) => {
  const { dateFrom = "2024-12-31" } = req.body ?? {};
  const prog = getFullSyncProgress();
  if (prog.running) {
    return res.json({ status: "already_running", progress: prog });
  }
  res.json({ status: "started", dateFrom });
  runFullAmazonDatabaseSync(new Date(dateFrom)).catch(console.error);
});

// ─── GET /sync/full/progress ──────────────────────────────────────────────────
syncRouter.get("/sync/full/progress", (_req: Request, res: Response) => {
  res.json(getFullSyncProgress());
});

// ─── POST /sync/incremental ───────────────────────────────────────────────────
syncRouter.post("/sync/incremental", async (_req: Request, res: Response) => {
  res.json({ status: "started" });
  runAmazonIncrementalSync().catch(console.error);
});

// ─── POST /sync/snapshot ──────────────────────────────────────────────────────
syncRouter.post("/sync/snapshot", async (_req: Request, res: Response) => {
  res.json({ status: "started" });
  runAmazonSnapshotJob().catch(console.error);
});

// ─── GET /sync/db-stats ────────────────────────────────────────────────────────
// Returns row counts and date ranges for all Amazon tables (Phase 3 verification)
syncRouter.get("/sync/db-stats", async (_req: Request, res: Response) => {
  try {
    const [
      orderCount,
      itemCount,
      snapshotCount,
      adSnapshotCount,
      syncJobDone,
      syncJobFailed,
      orderDateRange,
      snapshotDateRange,
      adDateRange,
    ] = await Promise.all([
      countAllAmazonOrders(prisma),
      countAllAmazonOrderItems(prisma),
      countAllAmazonProductSnapshots(prisma),
      countAllAdSnapshots(prisma),
      countSyncJobsByStatus(prisma, "done"),
      countSyncJobsByStatus(prisma, "failed"),
      findAmazonOrderDateRange(prisma),
      findAmazonProductSnapshotDateRange(prisma),
      findAmazonAdSnapshotDateRange(prisma),
    ]);

    // Settlement table
    let settlementCount = 0;
    try {
      settlementCount = await countSettlementTransactions(prisma);
    } catch { /* table may not exist yet */ }

    // Marketplace breakdown
    const mpBreakdown = await groupAmazonOrdersByMarketplace(prisma);

    res.json({
      tables: {
        amazonOrder:           { rows: orderCount,      dateMin: orderDateRange?.min, dateMax: orderDateRange?.max },
        amazonOrderItem:       { rows: itemCount },
        amazonProductSnapshot: { rows: snapshotCount,   dateMin: snapshotDateRange?.min, dateMax: snapshotDateRange?.max },
        amazonAdSnapshot:      { rows: adSnapshotCount, dateMin: adDateRange?.min, dateMax: adDateRange?.max },
        amazonSettlement:      { rows: settlementCount },
      },
      syncJobs: { done: syncJobDone, failed: syncJobFailed },
      marketplaceBreakdown: mpBreakdown.map(r => ({ marketplace: r.marketplace, orders: r._count })),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Amazon] GET /sync/db-stats:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /sync/snapshot/full ─────────────────────────────────────────────────
// Body: { days?: number }  — default 180. Recomputes snapshots from existing AmazonOrderItem data.
syncRouter.post("/sync/snapshot/full", async (req: Request, res: Response) => {
  const days = Math.min(Number(req.body?.days ?? 180), 730);
  res.json({ status: "started", days });
  computeAllAmazonHistoricalSnapshots(days).catch(console.error);
});

// ─── POST /sync/historical ────────────────────────────────────────────────────
// Full 180-day historical pipeline:
//   1. Order backfill via SP-API (re-fetches raw orders for last N days)
//   2. Snapshot computation from all imported order data
syncRouter.post("/sync/historical", async (req: Request, res: Response) => {
  const days = Math.min(Number(req.body?.days ?? 180), 365);
  res.json({ status: "started", pipeline: ["order_backfill", "snapshot_rebuild"], days });

  (async () => {
    console.log(`[Historical] Starting ${days}-day pipeline…`);
    try {
      console.log(`[Historical] Phase 1: Order backfill (${days} days EU)…`);
      await runAmazonBackfill(days);
      console.log("[Historical] Phase 1 done. Phase 2: Snapshot rebuild…");
      await computeAllAmazonHistoricalSnapshots(days);
      console.log(`[Historical] Pipeline complete.`);
    } catch (err) {
      console.error("[Historical] Pipeline error:", String(err).slice(0, 200));
    }
  })().catch(console.error);
});

// ─── POST /sync/settlement ────────────────────────────────────────────────────
syncRouter.post("/sync/settlement", async (_req: Request, res: Response) => {
  res.json({ status: "started" });
  syncSettlementReports().catch(console.error);
});

// ─── POST /sync/ads ────────────────────────────────────────────────────────────
syncRouter.post("/sync/ads", async (req: Request, res: Response) => {
  const { days } = req.body ?? {};
  res.json({ status: "started", days: days ?? "daily" });
  if (days) {
    syncAdsBackfill(Number(days)).catch(console.error);
  } else {
    syncAdsDaily().catch(console.error);
  }
});

// ─── OAuth helpers ────────────────────────────────────────────────────────────
const APP_ID = "amzn1.sp.solution.7281ed5a-0939-46d5-8c42-bee9ac711fcd";

// GET /auth/start  → redirect to Amazon authorization page
syncRouter.get("/auth/start", (req: Request, res: Response) => {
  const host = process.env.BACKEND_PUBLIC_URL || `http://${req.headers.host}`;
  const callbackHost = req.query.redirect_host as string || host;
  const redirectUri = `${callbackHost}/api/amazon/auth/callback`;
  const state = Math.random().toString(36).substring(2, 10);

  const authUrl =
    `https://sellercentral.amazon.it/apps/authorize/consent` +
    `?application_id=${APP_ID}` +
    `&state=${state}` +
    `&version=beta` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  console.log(`[Amazon Auth] Auth URL: ${authUrl}`);

  res.send(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Amazon Auth</title>
    <style>
      body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
      .card{background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:40px;max-width:720px;width:90%}
      h1{margin:0 0 8px;font-size:20px;color:#6ee7b7}
      p{color:#a1a1aa;line-height:1.6;font-size:14px}
      pre{background:#0a0a0f;border:1px solid #1e1e2e;border-radius:8px;padding:14px;font-size:11px;color:#60a5fa;white-space:pre-wrap;word-break:break-all}
      .btn{display:inline-block;margin-top:20px;padding:12px 28px;background:rgba(110,231,183,.1);border:1px solid rgba(110,231,183,.2);color:#6ee7b7;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600}
      .note{background:rgba(251,191,36,.05);border:1px solid rgba(251,191,36,.2);border-radius:8px;padding:12px 16px;margin-top:16px;font-size:13px;color:#fbbf24}
    </style></head><body><div class="card">
    <h1>🔐 Autorizzazione Amazon SP-API</h1>
    <p>Clicca il pulsante qui sotto per autorizzare l'app <strong>MyDashboard_Claude</strong>.</p>
    <p>Dopo aver autorizzato, Amazon ti reindirizzerà a:</p>
    <pre>${redirectUri}</pre>
    <div class="note">⚠️ Se il redirect fallisce (pagina non trovata), copia il parametro <strong>spapi_oauth_code=...</strong> dall'URL del browser e aprilo qui:</br>
    <strong>http://192.168.1.43:3001/api/amazon/auth/callback?spapi_oauth_code=IL_CODICE</strong></div>
    <a class="btn" href="${authUrl}" target="_self">→ Autorizza su Amazon Seller Central</a>
    </div></body></html>`);
});

// GET /auth/callback  → receive code, exchange for refresh_token, save to env
syncRouter.get("/auth/callback", async (req: Request, res: Response) => {
  const code = req.query.spapi_oauth_code as string | undefined;
  const error = req.query.error as string | undefined;
  const host = process.env.BACKEND_PUBLIC_URL || `http://${req.headers.host}`;
  const redirectUri = `${host}/api/amazon/auth/callback`;

  const html = (title: string, body: string, ok = true) => `
    <!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Amazon Auth</title>
    <style>
      body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
      .card{background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:40px;max-width:660px;width:90%}
      h1{margin:0 0 16px;font-size:22px;color:${ok ? "#6ee7b7" : "#f87171"}}
      p{color:#a1a1aa;line-height:1.6}
      pre{background:#0a0a0f;border:1px solid #1e1e2e;border-radius:8px;padding:16px;font-size:12px;color:#6ee7b7;white-space:pre-wrap;word-break:break-all}
      .step{background:rgba(110,231,183,.05);border:1px solid rgba(110,231,183,.15);border-radius:8px;padding:16px;margin-top:16px}
      .btn{display:inline-block;margin-top:16px;padding:10px 20px;background:rgba(110,231,183,.1);border:1px solid rgba(110,231,183,.2);color:#6ee7b7;border-radius:8px;text-decoration:none;font-size:14px}
    </style></head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;

  if (error || !code) {
    console.error(`[Amazon Auth] Error: ${error || "no code"}`);
    return res.status(400).send(html("❌ Errore autorizzazione",
      `<p>Amazon ha restituito un errore: <code>${error || "nessun codice ricevuto"}</code></p>
       <p>Assicurati che il redirect URI <strong>${redirectUri}</strong> sia registrato nella tua app in Seller Central.</p>
       <a class="btn" href="/api/amazon/auth/start">Riprova</a>`,
      false));
  }

  try {
    console.log("[Amazon Auth] Exchanging code for refresh_token...");

    const params = new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      redirect_uri:  redirectUri,
      client_id:     process.env.AMAZON_LWA_CLIENT_ID!,
      client_secret: process.env.AMAZON_LWA_CLIENT_SECRET!,
    });

    const tokenRes = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const json = await tokenRes.json() as any;

    if (!tokenRes.ok || !json.refresh_token) {
      throw new Error(JSON.stringify(json));
    }

    const refreshToken: string = json.refresh_token;

    // Update process.env immediately (no restart needed for current process)
    process.env.AMAZON_EU_REFRESH_TOKEN = refreshToken;

    // Also persist to .env file on host (mounted path if available, else log only)
    const envCandidates = [
      "/host-env/.env",
      path.join(process.cwd(), ".env"),
      "/app/.env",
    ];
    let saved = false;
    for (const envPath of envCandidates) {
      try {
        if (fs.existsSync(envPath)) {
          let content = fs.readFileSync(envPath, "utf-8");
          const regex = /^AMAZON_EU_REFRESH_TOKEN=.*$/m;
          if (regex.test(content)) {
            content = content.replace(regex, `AMAZON_EU_REFRESH_TOKEN=${refreshToken}`);
          } else {
            content += `\nAMAZON_EU_REFRESH_TOKEN=${refreshToken}`;
          }
          fs.writeFileSync(envPath, content, "utf-8");
          console.log(`[Amazon Auth] Token saved to ${envPath}`);
          saved = true;
          break;
        }
      } catch {}
    }

    console.log(`[Amazon Auth] ✅ Refresh token obtained! Saved=${saved}`);
    console.log(`[Amazon Auth] Token: ${refreshToken.substring(0, 40)}...`);

    return res.send(html("✅ Autorizzazione completata!",
      `<p>Il nuovo <strong>refresh_token</strong> è stato ottenuto con successo${saved ? " e salvato nel file <code>.env</code>" : ""}.</p>
       <pre>${refreshToken}</pre>
       <div class="step">
         <strong>⚠️ Il token è già attivo per questa sessione.</strong>
         <p>Per renderlo permanente, copia il token qui sopra e incollalo nel file <code>.env</code> alla riga:</p>
         <pre>AMAZON_EU_REFRESH_TOKEN=${refreshToken}</pre>
         <p>Poi riavvia il backend:</p>
         <pre>docker compose restart backend</pre>
         <p>Oppure avvia subito il backfill — il token è già in memoria:</p>
       </div>
       <a class="btn" href="http://192.168.1.43:3000/amazon/sync">→ Vai a Sync Center</a>`
    ));
  } catch (err) {
    console.error("[Amazon Auth] Token exchange failed:", err);
    return res.status(500).send(html("❌ Errore scambio token",
      `<p>Impossibile ottenere il refresh_token:</p><pre>${String(err)}</pre>
       <p>Verifica che <strong>${redirectUri}</strong> sia nella lista dei redirect URI consentiti nella tua app Seller Central.</p>
       <a class="btn" href="/api/amazon/auth/start">Riprova</a>`,
      false));
  }
});
