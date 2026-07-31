// amazon/routes/accounts.routes.ts — Manage AmazonAccount records.
// Unlike other amazon/routes/** files, these endpoints intentionally do NOT
// require an amazonAccountId to already be resolved (amazonAccountMiddleware
// leaves context unset when zero/ambiguous accounts exist) — this is how a
// first account gets created in the first place.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { findActiveAccounts, createAccount } from "../../repositories/amazon/accounts.repo";

export const accountsRouter = Router();

// ─── GET /accounts — list active accounts (id, name, region only — never credentials) ──
accountsRouter.get("/accounts", async (_req: Request, res: Response) => {
  try {
    const accounts = await findActiveAccounts(prisma);
    res.json(
      accounts.map((a) => ({ id: a.id, name: a.name, sellerId: a.sellerId, region: a.region }))
    );
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /accounts — create a new Amazon account ────────────────────────────
accountsRouter.post("/accounts", async (req: Request, res: Response) => {
  try {
    const {
      name,
      sellerId,
      region,
      lwaClientId,
      lwaClientSecret,
      spApiRefreshToken,
      adsClientId,
      adsClientSecret,
      adsRefreshToken,
      adsProfileIds,
    } = req.body ?? {};

    if (!name || !sellerId) {
      res.status(400).json({ error: "name and sellerId are required" });
      return;
    }

    const account = await createAccount(prisma, {
      name,
      sellerId,
      region,
      lwaClientId,
      lwaClientSecret,
      spApiRefreshToken,
      adsClientId,
      adsClientSecret,
      adsRefreshToken,
      adsProfileIds,
    });

    res.status(201).json({ id: account.id, name: account.name, sellerId: account.sellerId, region: account.region });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
