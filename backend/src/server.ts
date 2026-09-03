// server.ts — Express entry point
//
// dotenv must load before any other import: `./db` reads process.env.DATABASE_URL
// at module-load time to construct `pgPool` (a plain `pg.Pool`, not lazy like
// Prisma), so if dotenv.config() ran after that import, pgPool would capture
// `undefined` and connect-pg-simple would fall back to Postgres' default
// database (the OS username) — every session-touching route then 500s.
import "dotenv/config";

import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { prisma, pgPool } from "./db";
import rateLimit from "express-rate-limit";
import { handleWebhook } from "./webhooks/webhooks";
import statsRouter from "./routes/stats.routes";
import productsRouter from "./routes/products.routes";
import { runInitialSync, startPolling, startSnapshotPolling } from "./jobs/sync.job";
import amazonRouter from "./amazon/routes";
import { startAmazonPolling, startAmazonSnapshotPolling, forEachActiveAccount } from "./amazon/sync.job";
import { startMiraklPolling } from "./mirakl/syncOrders.job";
import { bootstrapCalibration, bootstrapFromExcel, bootstrapComponentModel, runDailyCalibration } from "./amazon/forecast";
import chatRouter from "./routes/chat.routes";
import analyticsRouter from "./routes/analytics.routes";
import authRouter from "./auth/auth.routes";
import adminRouter from "./auth/admin.routes";
import { requireAuth } from "./middleware/auth.middleware";
import { amazonAccountMiddleware } from "./middleware/amazon-account.middleware";
import { masterDataRouter } from "./purchasing/routes/master-data.routes";
import { suppliersRouter } from "./purchasing/routes/suppliers.routes";
import { purchaseOrdersRouter } from "./purchasing/routes/purchase-orders.routes";
import { goodsReceiptsRouter } from "./purchasing/routes/goods-receipts.routes";
import { dashboardRouter } from "./purchasing/routes/dashboard.routes";
import { paymentDuesRouter } from "./purchasing/routes/payment-dues.routes";
import { businessContactsRouter } from "./purchasing/routes/business-contacts.routes";
import { bankMovementsRouter } from "./purchasing/routes/bank-movements.routes";
import miraklRouter from "./routes/mirakl.routes";
import marketingRedcareRouter from "./routes/marketingRedcare.routes";
import { startRedcareKeywordTrackingSchedule } from "./jobs/redcareKeywordTracking.job";
import { addSSEClient, sseClientCount } from "./sse/sse";

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Validate required secrets ────────────────────────────────────────────────
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error(
    "[Server] FATAL: SESSION_SECRET must be set and at least 32 characters long."
  );
  process.exit(1);
}

// ─── Session store (PostgreSQL) ───────────────────────────────────────────────
const PgSessionStore = connectPgSimple(session);

const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE_HOURS ?? "720") * 60 * 60 * 1000;

const sessionMiddleware = session({
  name:   "dash_sid",
  secret: process.env.SESSION_SECRET!,
  store:  new PgSessionStore({
    pool: pgPool,
    tableName: "user_sessions",
    createTableIfMissing: true,
    ttl: SESSION_MAX_AGE / 1000,   // seconds
    pruneSessionInterval: 60 * 15, // prune expired every 15 min
  }),
  resave:            false,
  saveUninitialized: false,
  // Rolling: every authenticated request resets the cookie's expiry, so the
  // session only expires after SESSION_MAX_AGE_HOURS of inactivity, not a
  // fixed window from login — matches the 30-day trust window already used
  // for the MFA "trusted device" cookie (TRUSTED_DEVICE_DAYS, auth.routes.ts).
  rolling: true,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge:   SESSION_MAX_AGE,
    path:     "/",
  },
});

// ─── Global rate limit (DDoS mitigation) ─────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 300,              // 300 req/min/IP — enough for a dashboard
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Troppe richieste. Riprova tra un momento." },
});

// ─── CORS — allow only trusted origins ───────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map(o => o.trim());

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server (no origin) and listed origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// ─── Raw body capture for HMAC verification ───────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith("/webhooks")) {
    let data = Buffer.alloc(0);
    req.on("data", (chunk) => { data = Buffer.concat([data, chunk]); });
    req.on("end", () => {
      (req as any).rawBody = data;
      next();
    });
  } else {
    next();
  }
});

// ─── Middleware stack ─────────────────────────────────────────────────────────
app.set("trust proxy", 1);          // trust nginx X-Forwarded-For
app.use(globalLimiter);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // preflight
app.use(express.json({ limit: "2mb" }));
app.use(sessionMiddleware);

// ─── Public routes (no auth required) ────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date(), sseClients: sseClientCount() }));
app.post("/webhooks/shopify", handleWebhook);   // HMAC-verified internally
app.use("/api/auth", authRouter);               // login / logout / me (public login endpoint)

// ─── SSE stream (auth-gated) ──────────────────────────────────────────────────
app.get("/api/sse/events", requireAuth, (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send initial connected event so client knows stream is live
  res.write(`event: connected\ndata: {"ts":${Date.now()}}\n\n`);

  addSSEClient(res);

  // If client disconnects (browser tab closed) remove from set
  req.on("close", () => res.end());
});

// ─── Protected routes (requireAuth applied globally below) ───────────────────
// amazonAccountMiddleware runs on every router that may touch Amazon-scoped
// tables (some, like stats/products, mix Shopify + Amazon in one response) —
// see middleware/amazon-account.middleware.ts for resolution rules.
app.use("/api/stats",      requireAuth, amazonAccountMiddleware, statsRouter);
app.use("/api/products",   requireAuth, amazonAccountMiddleware, productsRouter);
app.use("/api/amazon",     requireAuth, amazonAccountMiddleware, amazonRouter);
app.use("/api/chat",       requireAuth, amazonAccountMiddleware, chatRouter);
app.use("/api/analytics",  requireAuth, amazonAccountMiddleware, analyticsRouter);
app.use("/api/auth/admin", requireAuth, adminRouter);
app.use("/api/purchasing", requireAuth, masterDataRouter);
app.use("/api/purchasing", requireAuth, suppliersRouter);
app.use("/api/purchasing", requireAuth, businessContactsRouter);
app.use("/api/purchasing", requireAuth, bankMovementsRouter);
app.use("/api/purchasing", requireAuth, purchaseOrdersRouter);
app.use("/api/purchasing", requireAuth, goodsReceiptsRouter);
app.use("/api/purchasing", requireAuth, dashboardRouter);
app.use("/api/purchasing", requireAuth, paymentDuesRouter);
app.use("/api/mirakl",     requireAuth, miraklRouter);
app.use("/api/marketing/redcare", requireAuth, marketingRedcareRouter);

// ─── 404 / error handler ─────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Endpoint non trovato." }));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Never expose stack traces to the client
  console.error("[Server] Unhandled error:", err);
  res.status(500).json({ error: "Errore interno del server." });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function bootstrap() {
  // Ensure sync state row exists
  await prisma.syncState.upsert({
    where: { id: "main" },
    create: { id: "main", status: "idle" },
    update: {},
  });

  const state = await prisma.syncState.findUnique({ where: { id: "main" } });
  const needsInitial = !state?.lastSyncAt;

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });

  if (needsInitial) {
    console.log("[Server] First run — starting historical sync...");
    runInitialSync().then(() => startPolling());
  } else {
    console.log("[Server] Resuming — starting polling...");
    startPolling();
  }

  startSnapshotPolling();

  // ── Amazon module ──
  if (process.env.AMAZON_EU_REFRESH_TOKEN) {
    startAmazonPolling();
    startAmazonSnapshotPolling();

    // bootstrapCalibration/runDailyCalibration read the current AmazonAccount
    // via getCurrentAccountId() — like the sync jobs in amazon/sync.job.ts,
    // these run outside any HTTP request (server boot / cron), so they must
    // resolve and iterate active accounts themselves via forEachActiveAccount.
    forEachActiveAccount("Calibration bootstrap", async () => {
      await bootstrapCalibration();
      await bootstrapFromExcel();
      await bootstrapComponentModel();
    }).catch(err => console.warn("[Server] Calibration bootstrap error:", err));

    const now = new Date();
    const next2am = new Date(now);
    next2am.setHours(2, 0, 0, 0);
    if (next2am <= now) next2am.setDate(next2am.getDate() + 1);
    const msUntil2am = next2am.getTime() - now.getTime();
    const runDailyCalibrationForAllAccounts = () =>
      forEachActiveAccount("Daily calibration", () => runDailyCalibration())
        .catch(err => console.warn("[Calibration] Daily job error:", err));
    setTimeout(() => {
      runDailyCalibrationForAllAccounts();
      setInterval(runDailyCalibrationForAllAccounts, 86400000);
    }, msUntil2am);
    console.log(`[Server] Calibration daily job scheduled (first run in ${Math.round(msUntil2am / 60000)} min)`);
  } else {
    console.log("[Server] Amazon module disabled (AMAZON_EU_REFRESH_TOKEN not set)");
  }

  // ── Mirakl module (Redcare / Shop-Apotheke) ──
  if (process.env.MIRAKL_API_KEY) {
    startMiraklPolling();
  } else {
    console.log("[Server] Mirakl module disabled (MIRAKL_API_KEY not set)");
  }

  // ── Marketing / Redcare keyword tracking (public site, no credentials needed) ──
  if (process.env.REDCARE_KEYWORD_TRACKING_ENABLED === "true") {
    startRedcareKeywordTrackingSchedule();
  } else {
    console.log("[Server] Redcare keyword tracking disabled (REDCARE_KEYWORD_TRACKING_ENABLED not set)");
  }
}

bootstrap().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});
