// purchasing/routes/dashboard.routes.ts — Acquisti/Amministrazione dashboard summary.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { getDashboardSummary } from "../../repositories/purchasing/dashboard.repo";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    res.json(await getDashboardSummary(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
