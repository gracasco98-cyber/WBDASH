// amazon/routes/payments-aux.routes.ts — DD7 reserve, unreconciled, export, fees, reimbursements
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { toCsv } from "./orders.routes";
import { getDateRange } from "../utils/datetime";
import {
  computeDd7Reserve,
  findUnreconciledOrders,
  countUnreconciledOrders,
  sumUnreconciledByMarketplace,
  findMarketplaceCoverage,
} from "../../repositories/amazon/orders.repo";
import {
  computeCurrentReserveByMarketplace,
  findSettlementsForExport,
  computeFeeBreakdown,
  computeReimbursementsByMonth,
} from "../../repositories/amazon/settlement.repo";

export const paymentsAuxRouter = Router();

// ─── GET /payments/dd7-reserve ────────────────────────────────────────────────
paymentsAuxRouter.get("/payments/dd7-reserve", async (_req: Request, res: Response) => {
  try {
    const rows = await computeDd7Reserve(prisma);
    const reserveMap = await computeCurrentReserveByMarketplace(prisma);

    const r2 = (n: number) => Math.round(n * 100) / 100;

    const byMarketplace = rows.map(r => ({
      marketplace:       r.marketplace,
      inDd7Hold:         r.inDd7Hold,
      dd7Gross:          r2(r.dd7Gross),
      pastDd7Count:      r.pastDd7Count,
      pastDd7Gross:      r2(r.pastDd7Gross),
      earliestRelease:   r.earliestRelease,
      latestRelease:     r.latestRelease,
      settlementReserve: r2(reserveMap.get(r.marketplace) ?? 0),
    }));

    res.json({
      byMarketplace,
      totals: {
        inDd7Hold:    byMarketplace.reduce((s, r) => s + r.inDd7Hold, 0),
        dd7Gross:     r2(byMarketplace.reduce((s, r) => s + r.dd7Gross, 0)),
        pastDd7Count: byMarketplace.reduce((s, r) => s + r.pastDd7Count, 0),
        pastDd7Gross: r2(byMarketplace.reduce((s, r) => s + r.pastDd7Gross, 0)),
      },
      amazonNotice: {
        title: "Amazon DD+7 Reserve — Visibilità transazionale in arrivo",
        detail: "Amazon sta implementando la visibilità a livello di transazione per le riserve DD+7 entro il 30 Aprile 2026. Potrai vedere ogni ordine differito con la data di rilascio stimata nei report Transaction View.",
        rolloutDate: "2026-04-30",
      },
      note: "DD+7: fondi trattenuti 7 giorni dopo la data di consegna stimata (purchaseDate + 3gg delivery + 7gg hold = purchaseDate + 10gg). Stima basata su ordini Shipped/Delivered negli ultimi 21 giorni non ancora in nessun settlement.",
    });
  } catch (err) {
    console.error("[Amazon] GET /payments/dd7-reserve:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /payments/unreconciled ───────────────────────────────────────────────
// Unreconciled orders. By default uses per-marketplace settlement coverage.
paymentsAuxRouter.get("/payments/unreconciled", async (req: Request, res: Response) => {
  try {
    const { marketplace, search, page: pageQ, limit: limitQ, from, to } = req.query as Record<string, string>;
    const page     = Math.max(1, parseInt(pageQ ?? "1", 10));
    const limit    = Math.min(parseInt(limitQ ?? "50", 10), 500);
    const offset   = (page - 1) * limit;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace : undefined;

    const customFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    const customTo   = to   && /^\d{4}-\d{2}-\d{2}$/.test(to)   ? to   : null;
    const isCustom   = !!(customFrom || customTo);

    const unreconciledParams = { marketplace: mpFilter, search, customFrom, customTo };

    const [rows, total, totals, coveragePerMp] = await Promise.all([
      findUnreconciledOrders(prisma, { ...unreconciledParams, limit, offset }),
      countUnreconciledOrders(prisma, unreconciledParams),
      sumUnreconciledByMarketplace(prisma, unreconciledParams),
      findMarketplaceCoverage(prisma),
    ]);

    res.json({
      orders: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      isCustomRange: isCustom,
      customFrom,
      customTo,
      totals,
      coverageByMarketplace: coveragePerMp,
    });
  } catch (err) {
    console.error("[Amazon] GET /payments/unreconciled:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /payments/unreconciled/export ────────────────────────────────────────
paymentsAuxRouter.get("/payments/unreconciled/export", async (req: Request, res: Response) => {
  try {
    const { marketplace, from, to } = req.query as Record<string, string>;
    const mpFilter   = marketplace && marketplace !== "all" ? marketplace : undefined;
    const customFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    const customTo   = to   && /^\d{4}-\d{2}-\d{2}$/.test(to)   ? to   : null;

    const rows = await findUnreconciledOrders(prisma, {
      marketplace: mpFilter, customFrom, customTo, limit: 100000, offset: 0,
    });

    const firstRow = rows[0];
    const fileFrom = firstRow?.covFrom ?? "unknown";
    const fileTo   = firstRow?.covTo   ?? "unknown";

    const csv = toCsv(
      ["Order ID","Marketplace","Data Ordine","Stato","Fulfillment","Importo (€)","Valuta","Copertura Da","Copertura A"],
      rows.map(r => [
        r.amazonOrderId, r.marketplace,
        r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString("it-IT") : "",
        r.orderStatus, r.fulfillmentChannel, r.itemTotal, r.currency,
        r.covFrom, r.covTo,
      ])
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="amazon_non_riconciliati_${fileFrom}_${fileTo}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[Amazon] GET /payments/unreconciled/export:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /payments/export ─────────────────────────────────────────────────────
// Download settlements list as CSV
paymentsAuxRouter.get("/payments/export", async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.query as Record<string, string>;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace : undefined;

    const rows = await findSettlementsForExport(prisma, { marketplace: mpFilter });

    const csv = toCsv(
      ["Settlement ID","Marketplace","Da","A","Data Deposito","Payout Reale (€)","Valuta","Vendite Lorde","Commissioni","FBA Fees","Rimborsi","PPC","Altre Fee","Riserve","Netto Calcolato","N. Ordini"],
      rows.map(r => [
        r.settlementId, r.marketplace, r.startDate, r.endDate, r.depositDate ?? "",
        r.totalAmount, r.currency,
        r.principal, Math.abs(r.commission), Math.abs(r.fbaFees), Math.abs(r.refundsTotal),
        Math.abs(r.ppcCost), r.otherSvcFees, r.reserved, r.computedNet, r.orderCount,
      ])
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="amazon_settlements.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[Amazon] GET /payments/export:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /fees ──────────────────────────────────────────────────────────────────
// Real fee breakdown from settlement transactions
paymentsAuxRouter.get("/fees", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();
    const mpFilter = marketplace && marketplace !== "all" ? marketplace : undefined;

    const rows = await computeFeeBreakdown(prisma, { dateFrom, dateTo, marketplace: mpFilter });

    const totalFees = rows.reduce((s, r) => s + r.total, 0);
    res.json({
      breakdown: rows.map((r) => ({
        type: r.amountType,
        total: Math.round(r.total * 100) / 100,
        count: r.count,
        pct: totalFees > 0 ? Math.round((r.total / totalFees) * 1000) / 10 : 0,
      })),
      totalFees: Math.round(totalFees * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /reimbursements ───────────────────────────────────────────────────────
paymentsAuxRouter.get("/reimbursements", async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.query as Record<string, string>;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace : undefined;

    const rows = await computeReimbursementsByMonth(prisma, { marketplace: mpFilter });
    res.json(rows.map((r) => ({ month: r.month, amount: r.amount, count: r.count })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
