// mirakl.routes.ts — Read-only reconciliation status for the homepage banner.
import { Router, Request, Response } from "express";
import { findStuckMiraklOrders } from "../mirakl/health";
import { logError } from "../services/shopify.service";

const router = Router();

// ─── GET / — stuck Mirakl orders (see mirakl/health.ts) ────────────────────────
router.get("/stuck-orders", async (_req: Request, res: Response) => {
  try {
    const stuckOrders = await findStuckMiraklOrders();
    res.json({ stuckOrders });
  } catch (err) {
    await logError("mirakl-health-route", err);
    res.status(500).json({ error: "Impossibile verificare lo stato degli ordini Mirakl." });
  }
});

export default router;
