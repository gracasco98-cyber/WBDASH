// board.routes.ts — Personal "bacheca" widget-layout persistence, one row per user.
import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { getBoardLayout, saveBoardLayout } from "../repositories/tasks/board-layout.repo";
import { logError } from "../services/shopify.service";

export const boardRouter = Router();

boardRouter.get("/layout", async (req: Request, res: Response) => {
  try {
    const layout = await getBoardLayout(prisma, req.user!.id);
    res.json({ layout: layout ?? [] });
  } catch (err) {
    await logError("board-get-layout", err);
    res.status(500).json({ error: "Impossibile recuperare la bacheca." });
  }
});

boardRouter.put("/layout", async (req: Request, res: Response) => {
  const { layout } = req.body as { layout?: unknown };
  if (!Array.isArray(layout)) return res.status(400).json({ error: "layout deve essere un array." });
  try {
    await saveBoardLayout(prisma, { userId: req.user!.id, layout: layout as any });
    res.status(204).send();
  } catch (err) {
    await logError("board-save-layout", err);
    res.status(500).json({ error: "Impossibile salvare la bacheca." });
  }
});
