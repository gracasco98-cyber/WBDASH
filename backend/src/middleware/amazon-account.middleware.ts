// middleware/amazon-account.middleware.ts — resolves which AmazonAccount a
// request operates on, then makes it available to every repository/service
// downstream via context/account-context.ts. Mounted on every router that
// may touch Amazon-scoped tables (amazon/**, but also stats/products/
// analytics/chat, which mix Shopify + Amazon data in the same endpoints).
//
// Resolution order:
//   1. ?amazonAccountId=ALL (or X-Amazon-Account-Id: ALL) — binds every
//      active account at once (read-only aggregation; see
//      product-performance.repo.ts and its sibling read helpers, the only
//      callers that read multiple ids via getCurrentAccountIds()). Must be
//      requested explicitly by the caller — the main dashboard does this
//      deliberately (2026-08-07) when no single account is selected. Every
//      other endpoint keeps the pre-existing behavior below, so a write/sync
//      route can never silently run against "whichever account happened to
//      be first" just because 2+ accounts exist.
//   2. ?amazonAccountId=<id> query param (or X-Amazon-Account-Id header)
//      binds exactly that one account.
//   3. if exactly one active account exists, use it (keeps single-account
//      setups friction-free — no client change needed)
//   4. otherwise (zero accounts, or 2+ with none specified): proceed WITHOUT
//      binding an account. Amazon-scoped repository calls will throw a clear
//      "No Amazon account in scope" error if actually invoked — this keeps
//      Shopify-only parts of mixed endpoints working, and never silently
//      guesses which account's data to return when it's ambiguous.
import { Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { runWithAccounts } from "../context/account-context";
import { findActiveAccounts } from "../repositories/amazon/accounts.repo";

export async function amazonAccountMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const requested =
      (req.query.amazonAccountId as string | undefined) ||
      (req.header("x-amazon-account-id") ?? undefined);

    const accounts = await findActiveAccounts(prisma);

    let accountIds: string[] = [];
    if (requested === "ALL") {
      accountIds = accounts.map((a) => a.id);
    } else if (requested) {
      const match = accounts.find((a) => a.id === requested);
      if (!match) {
        res.status(400).json({ error: `Unknown or inactive amazonAccountId: ${requested}` });
        return;
      }
      accountIds = [match.id];
    } else if (accounts.length === 1) {
      accountIds = [accounts[0].id];
    }
    // accounts.length === 0, or 2+ with none specified and no "ALL": leave accountIds empty.

    if (accountIds.length === 0) {
      next();
      return;
    }

    await runWithAccounts(
      accountIds,
      () =>
        new Promise<void>((resolve) => {
          res.once("finish", () => resolve());
          res.once("close", () => resolve());
          next();
        })
    );
  } catch (err) {
    next(err);
  }
}
