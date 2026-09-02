// marketingRedcare.routes.ts — Live keyword search + tracked-watch CRUD/history
// for the Marketing/Redcare keyword BI page.
import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { fetchSearchResults, type RedcareMarket } from "../redcareSearch/client";
import { logError } from "../services/shopify.service";
import {
  createOrReactivateWatch, findActiveWatches, deactivateWatch, findLatestSnapshot, findSnapshotHistory,
} from "../repositories/marketing/redcareWatch.repo";
import { runRedcareKeywordTracking } from "../jobs/redcareKeywordTracking.job";

const router = Router();
const VALID_MARKETS = ["IT", "DE"];

router.get("/search", async (req: Request, res: Response) => {
  const market = String(req.query.market ?? "");
  const q = String(req.query.q ?? "").trim();
  if (!VALID_MARKETS.includes(market)) {
    return res.status(400).json({ error: "Parametro market non valido (IT o DE)." });
  }
  if (!q) {
    return res.status(400).json({ error: "Parametro q (keyword) obbligatorio." });
  }
  try {
    const result = await fetchSearchResults(market as RedcareMarket, q);
    res.json(result);
  } catch (err) {
    await logError("marketing-redcare-search", err, { market, q });
    res.status(502).json({ error: "Impossibile recuperare i risultati di ricerca da Redcare in questo momento." });
  }
});

router.post("/watches", async (req: Request, res: Response) => {
  const { market, keyword, ean, label, isOwn } = req.body ?? {};
  if (!VALID_MARKETS.includes(market) || !keyword || !ean) {
    return res.status(400).json({ error: "market, keyword ed ean sono obbligatori." });
  }
  try {
    const watch = await createOrReactivateWatch(prisma, {
      market, keyword, ean, label: label ?? null, isOwn: !!isOwn,
    });
    res.status(201).json(watch);
  } catch (err) {
    await logError("marketing-redcare-create-watch", err, { market, keyword, ean });
    res.status(500).json({ error: "Impossibile salvare la keyword da monitorare." });
  }
});

router.get("/watches", async (req: Request, res: Response) => {
  try {
    const watches = await findActiveWatches(prisma, {
      market: typeof req.query.market === "string" ? req.query.market : undefined,
      keyword: typeof req.query.keyword === "string" ? req.query.keyword : undefined,
    });
    const withLatest = await Promise.all(
      watches.map(async (w) => ({ ...w, latestSnapshot: await findLatestSnapshot(prisma, w.id) }))
    );
    res.json({ watches: withLatest });
  } catch (err) {
    await logError("marketing-redcare-list-watches", err);
    res.status(500).json({ error: "Impossibile recuperare le keyword monitorate." });
  }
});

router.get("/watches/:id/history", async (req: Request, res: Response) => {
  const days = Number(req.query.days ?? 30);
  const since = new Date(Date.now() - (Number.isFinite(days) ? days : 30) * 86_400_000);
  try {
    const snapshots = await findSnapshotHistory(prisma, req.params.id, since);
    res.json({ snapshots });
  } catch (err) {
    await logError("marketing-redcare-watch-history", err, { watchId: req.params.id });
    res.status(500).json({ error: "Impossibile recuperare lo storico." });
  }
});

router.delete("/watches/:id", async (req: Request, res: Response) => {
  try {
    await deactivateWatch(prisma, req.params.id);
    res.status(204).send();
  } catch (err) {
    await logError("marketing-redcare-delete-watch", err, { watchId: req.params.id });
    res.status(500).json({ error: "Impossibile rimuovere la keyword monitorata." });
  }
});

// Manual "run now" trigger for the daily tracking job — same fire-and-forget
// pattern as POST /api/stats/sync: respond immediately, run in the
// background, so a slow/large run of the job never ties up the request.
router.post("/run-now", async (_req: Request, res: Response) => {
  res.json({ status: "started" });
  runRedcareKeywordTracking().catch((err) => logError("marketing-redcare-run-now", err));
});

export default router;
