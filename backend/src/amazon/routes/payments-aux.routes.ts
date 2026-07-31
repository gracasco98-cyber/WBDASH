// amazon/routes/payments-aux.routes.ts — DD7 reserve, unreconciled, export, fees, reimbursements
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { toCsv } from "./orders.routes";
import { getDateRange } from "../utils/datetime";
import { getCurrentAccountId } from "../../context/account-context";

export const paymentsAuxRouter = Router();

// ─── GET /payments/dd7-reserve ────────────────────────────────────────────────
paymentsAuxRouter.get("/payments/dd7-reserve", async (_req: Request, res: Response) => {
  try {
    const accountId = getCurrentAccountId();
    const rows = await prisma.$queryRawUnsafe<{
      marketplace: string;
      in_dd7_hold: bigint;
      dd7_gross: number;
      past_dd7: bigint;
      past_dd7_gross: number;
      earliest_release: string | null;
      latest_release: string | null;
    }[]>(`
      WITH order_ages AS (
        SELECT o.marketplace, o."amazonOrderId", o."itemTotal",
          o."purchaseDate",
          (o."purchaseDate" + INTERVAL '3 days')::date AS est_delivery,
          (o."purchaseDate" + INTERVAL '10 days')::date AS est_release
        FROM "AmazonOrder" o
        WHERE o."orderStatus" IN ('Shipped','Delivered')
          AND o."purchaseDate" >= NOW() - INTERVAL '21 days'
          AND o."amazonAccountId" = '${accountId}'
          AND NOT EXISTS (
            SELECT 1 FROM "AmazonSettlementTransaction" st
            WHERE st."orderId" = o."amazonOrderId"
              AND st."amazonAccountId" = o."amazonAccountId"
              AND st."amountType"='Principal' AND st."transactionType"='Order'
          )
      )
      SELECT marketplace,
        COUNT(CASE WHEN est_release >= CURRENT_DATE THEN 1 END)    AS in_dd7_hold,
        COALESCE(SUM(CASE WHEN est_release >= CURRENT_DATE THEN "itemTotal" ELSE 0 END),0)::FLOAT8 AS dd7_gross,
        COUNT(CASE WHEN est_release < CURRENT_DATE THEN 1 END)     AS past_dd7,
        COALESCE(SUM(CASE WHEN est_release < CURRENT_DATE THEN "itemTotal" ELSE 0 END),0)::FLOAT8  AS past_dd7_gross,
        MIN(CASE WHEN est_release >= CURRENT_DATE THEN est_release::text END) AS earliest_release,
        MAX(CASE WHEN est_release >= CURRENT_DATE THEN est_release::text END) AS latest_release
      FROM order_ages
      WHERE marketplace IN ('IT','DE','ES','FR')
      GROUP BY marketplace ORDER BY dd7_gross DESC
    `);

    const reserveRows = await prisma.$queryRawUnsafe<{
      marketplace: string; current_reserve: number;
    }[]>(`
      SELECT s.marketplace,
        SUM(CASE WHEN t."transactionType"='Current Reserve Amount' THEN t.amount ELSE 0 END)::FLOAT8 AS current_reserve
      FROM "AmazonSettlementTransaction" t
      JOIN "AmazonSettlement" s ON s."amazonAccountId" = t."amazonAccountId" AND s."settlementId" = t."settlementId"
      WHERE s.marketplace IN ('IT','DE','ES','FR')
        AND t."transactionType" IN ('Current Reserve Amount','Previous Reserve Amount Balance')
        AND t."amazonAccountId" = '${accountId}'
      GROUP BY s.marketplace
    `);
    const reserveMap = new Map(reserveRows.map(r => [r.marketplace, Number(r.current_reserve)]));

    const r2 = (n: number) => Math.round(n * 100) / 100;

    const byMarketplace = rows.map(r => ({
      marketplace:       r.marketplace,
      inDd7Hold:         Number(r.in_dd7_hold),
      dd7Gross:          r2(Number(r.dd7_gross)),
      pastDd7Count:      Number(r.past_dd7),
      pastDd7Gross:      r2(Number(r.past_dd7_gross)),
      earliestRelease:   r.earliest_release ?? null,
      latestRelease:     r.latest_release ?? null,
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
    const accountId = getCurrentAccountId();
    const { marketplace, search, page: pageQ, limit: limitQ, from, to } = req.query as Record<string, string>;
    const page     = Math.max(1, parseInt(pageQ ?? "1", 10));
    const limit    = Math.min(parseInt(limitQ ?? "50", 10), 500);
    const offset   = (page - 1) * limit;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace.replace(/'/g,"''") : null;
    const mpWhere  = mpFilter ? `AND o.marketplace = '${mpFilter}'` : "";
    const srchWhere = search?.trim()
      ? `AND o."amazonOrderId" ILIKE '%${search.trim().replace(/'/g,"''")}%'`
      : "";

    const customFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    const customTo   = to   && /^\d{4}-\d{2}-\d{2}$/.test(to)   ? to   : null;
    const isCustom   = !!(customFrom || customTo);

    const mpCovSQL = isCustom
      ? `WITH mp_coverage AS (
          SELECT DISTINCT o.marketplace,
            '${customFrom ?? "2020-01-01"}'::date AS cov_from,
            '${customTo   ?? new Date().toISOString().split("T")[0]}'::date AS cov_to
          FROM "AmazonOrder" o
          WHERE o."amazonAccountId" = '${accountId}'
          ${mpWhere}
        )`
      : `WITH mp_coverage AS (
          SELECT marketplace,
            MIN("startDate")::date AS cov_from,
            MAX("endDate")::date   AS cov_to
          FROM "AmazonSettlement"
          WHERE marketplace NOT IN ('EU')
            AND "amazonAccountId" = '${accountId}'
          GROUP BY marketplace
        )`;

    const baseWhere = `
      FROM "AmazonOrder" o
      JOIN mp_coverage mc ON mc.marketplace = o.marketplace
      WHERE o."orderStatus" NOT IN ('Cancelled', 'Pending')
        AND o."purchaseDate"::date >= mc.cov_from
        AND o."purchaseDate"::date <= mc.cov_to
        AND o."amazonAccountId" = '${accountId}'
        ${mpWhere}
        ${srchWhere}
        AND NOT EXISTS (
          SELECT 1 FROM "AmazonSettlementTransaction" st
          WHERE st."orderId" = o."amazonOrderId"
            AND st."amazonAccountId" = o."amazonAccountId"
            AND st."amountType" = 'Principal'
            AND st."transactionType" = 'Order'
        )`;

    type Row = {
      amazonOrderId: string; marketplace: string; purchaseDate: string;
      orderStatus: string; fulfillmentChannel: string; itemTotal: number; currency: string;
      cov_from: string; cov_to: string;
    };

    const [rows, countRes, totals, coveragePerMp] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(`
        ${mpCovSQL}
        SELECT o."amazonOrderId", o.marketplace, o."purchaseDate"::text, o."orderStatus",
               o."fulfillmentChannel", o."itemTotal"::FLOAT8, o.currency,
               mc.cov_from::text, mc.cov_to::text
        ${baseWhere}
        ORDER BY o."purchaseDate" DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      prisma.$queryRawUnsafe<{ total: bigint }[]>(`
        ${mpCovSQL}
        SELECT COUNT(*) AS total
        ${baseWhere}
      `),
      prisma.$queryRawUnsafe<{ marketplace: string; count: bigint; amount: number; cov_from: string; cov_to: string }[]>(`
        ${mpCovSQL}
        SELECT o.marketplace,
               COUNT(*) AS count,
               COALESCE(SUM(o."itemTotal"),0)::FLOAT8 AS amount,
               mc.cov_from::text, mc.cov_to::text
        ${baseWhere}
        GROUP BY o.marketplace, mc.cov_from, mc.cov_to
        ORDER BY amount DESC
      `),
      prisma.$queryRawUnsafe<{ marketplace: string; cov_from: string; cov_to: string; settlement_count: bigint }[]>(`
        SELECT marketplace,
          MIN("startDate")::date::text AS cov_from,
          MAX("endDate")::date::text   AS cov_to,
          COUNT(*)::BIGINT             AS settlement_count
        FROM "AmazonSettlement"
        WHERE marketplace NOT IN ('EU')
          AND "amazonAccountId" = '${accountId}'
        GROUP BY marketplace
        ORDER BY marketplace
      `),
    ]);

    res.json({
      orders: rows,
      pagination: { page, limit, total: Number(countRes[0]?.total ?? 0), pages: Math.ceil(Number(countRes[0]?.total ?? 0) / limit) },
      isCustomRange: isCustom,
      customFrom,
      customTo,
      totals: totals.map(t => ({
        marketplace: t.marketplace,
        count:       Number(t.count),
        amount:      Number(t.amount),
        covFrom:     String(t.cov_from ?? ""),
        covTo:       String(t.cov_to   ?? ""),
      })),
      coverageByMarketplace: coveragePerMp.map(c => ({
        marketplace:     c.marketplace,
        covFrom:         String(c.cov_from ?? ""),
        covTo:           String(c.cov_to   ?? ""),
        settlementCount: Number(c.settlement_count),
      })),
    });
  } catch (err) {
    console.error("[Amazon] GET /payments/unreconciled:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /payments/unreconciled/export ────────────────────────────────────────
paymentsAuxRouter.get("/payments/unreconciled/export", async (req: Request, res: Response) => {
  try {
    const accountId = getCurrentAccountId();
    const { marketplace, from, to } = req.query as Record<string, string>;
    const mpFilter   = marketplace && marketplace !== "all" ? marketplace.replace(/'/g,"''") : null;
    const mpWhere    = mpFilter ? `AND o.marketplace = '${mpFilter}'` : "";
    const customFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    const customTo   = to   && /^\d{4}-\d{2}-\d{2}$/.test(to)   ? to   : null;
    const isCustom   = !!(customFrom || customTo);

    const mpCovSQL = isCustom
      ? `WITH mp_coverage AS (
          SELECT DISTINCT o.marketplace,
            '${customFrom ?? "2020-01-01"}'::date AS cov_from,
            '${customTo   ?? new Date().toISOString().split("T")[0]}'::date AS cov_to
          FROM "AmazonOrder" o
          WHERE o."amazonAccountId" = '${accountId}'
          ${mpWhere}
        )`
      : `WITH mp_coverage AS (
          SELECT marketplace,
            MIN("startDate")::date AS cov_from,
            MAX("endDate")::date   AS cov_to
          FROM "AmazonSettlement"
          WHERE marketplace NOT IN ('EU')
            AND "amazonAccountId" = '${accountId}'
          GROUP BY marketplace
        )`;

    type Row = {
      amazonOrderId: string; marketplace: string; purchaseDate: string;
      orderStatus: string; fulfillmentChannel: string; itemTotal: number; currency: string;
      cov_from: string; cov_to: string;
    };

    const rows = await prisma.$queryRawUnsafe<Row[]>(`
      ${mpCovSQL}
      SELECT o."amazonOrderId", o.marketplace, o."purchaseDate"::text, o."orderStatus",
             o."fulfillmentChannel", o."itemTotal"::FLOAT8, o.currency,
             mc.cov_from::text, mc.cov_to::text
      FROM "AmazonOrder" o
      JOIN mp_coverage mc ON mc.marketplace = o.marketplace
      WHERE o."purchaseDate"::date >= mc.cov_from
        AND o."purchaseDate"::date <= mc.cov_to
        AND o."orderStatus" NOT IN ('Cancelled', 'Pending')
        AND o."amazonAccountId" = '${accountId}'
        ${mpWhere}
        AND NOT EXISTS (
          SELECT 1 FROM "AmazonSettlementTransaction" st
          WHERE st."orderId" = o."amazonOrderId"
            AND st."amazonAccountId" = o."amazonAccountId"
            AND st."amountType" = 'Principal'
            AND st."transactionType" = 'Order'
        )
      ORDER BY o."purchaseDate" DESC
      LIMIT 100000
    `);

    const firstRow = rows[0] as any;
    const fileFrom = firstRow?.cov_from ?? "unknown";
    const fileTo   = firstRow?.cov_to   ?? "unknown";

    const csv = toCsv(
      ["Order ID","Marketplace","Data Ordine","Stato","Fulfillment","Importo (€)","Valuta","Copertura Da","Copertura A"],
      rows.map(r => [
        r.amazonOrderId, r.marketplace,
        r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString("it-IT") : "",
        r.orderStatus, r.fulfillmentChannel, r.itemTotal, r.currency,
        r.cov_from, r.cov_to,
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
    const accountId = getCurrentAccountId();
    const { marketplace } = req.query as Record<string, string>;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace : null;
    const mpWhere = mpFilter
      ? `WHERE s."amazonAccountId" = '${accountId}' AND s.marketplace = '${mpFilter.replace(/'/g,"''")}' `
      : `WHERE s."amazonAccountId" = '${accountId}' `;

    type SRow = {
      settlementId: string; marketplace: string; start_date: string; end_date: string;
      deposit_date: string | null; total_amount: number; currency: string;
      principal: number; commission: number; fba_fees: number; refunds_total: number;
      ppc_cost: number; other_svc_fees: number; reserved: number; computed_net: number; order_count: number;
    };

    const rows = await prisma.$queryRawUnsafe<SRow[]>(`
      SELECT
        s."settlementId", s.marketplace,
        s."startDate"::date::text AS start_date, s."endDate"::date::text AS end_date,
        s."depositDate"::date::text AS deposit_date,
        s."totalAmount"::FLOAT8 AS total_amount, s.currency,
        COALESCE(SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' AND t.marketplace!='EU' THEN t.amount ELSE 0 END),0)::FLOAT8 AS principal,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('Commission','VariableClosingFee') AND t."transactionType"='Order' AND t.marketplace!='EU' THEN t.amount ELSE 0 END),0)::FLOAT8 AS commission,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('FBAPerUnitFulfillmentFee','FBAPerOrderFulfillmentFee','FBAWeightBasedFee','FulfillmentFee') AND t.marketplace!='EU' THEN t.amount ELSE 0 END),0)::FLOAT8 AS fba_fees,
        COALESCE(SUM(CASE WHEN t."transactionType"='Refund' AND t.marketplace!='EU' THEN t.amount ELSE 0 END),0)::FLOAT8 AS refunds_total,
        COALESCE(SUM(CASE WHEN t."transactionType"='ServiceFee' AND (t."amountType" ILIKE '%advertising%' OR t."amountType" ILIKE '%cost per click%') THEN t.amount ELSE 0 END),0)::FLOAT8 AS ppc_cost,
        COALESCE(SUM(CASE WHEN t.marketplace='EU' AND NOT (t."transactionType"='ServiceFee' AND t."amountType" ILIKE '%advertising%') AND t."amountType" NOT IN ('Current Reserve Amount','Previous Reserve Amount Balance') THEN t.amount ELSE 0 END),0)::FLOAT8 AS other_svc_fees,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('Current Reserve Amount','Previous Reserve Amount Balance') THEN t.amount ELSE 0 END),0)::FLOAT8 AS reserved,
        COALESCE(SUM(t.amount),0)::FLOAT8 AS computed_net,
        COUNT(DISTINCT CASE WHEN t."transactionType"='Order' AND t."orderId" IS NOT NULL THEN t."orderId" END)::INTEGER AS order_count
      FROM "AmazonSettlement" s
      LEFT JOIN "AmazonSettlementTransaction" t ON t."amazonAccountId" = s."amazonAccountId" AND t."settlementId" = s."settlementId"
      ${mpWhere}
      GROUP BY s."settlementId", s.marketplace, s."startDate", s."endDate", s."depositDate", s."totalAmount", s.currency
      ORDER BY s."endDate" DESC
    `);

    const csv = toCsv(
      ["Settlement ID","Marketplace","Da","A","Data Deposito","Payout Reale (€)","Valuta","Vendite Lorde","Commissioni","FBA Fees","Rimborsi","PPC","Altre Fee","Riserve","Netto Calcolato","N. Ordini"],
      rows.map(r => [
        r.settlementId, r.marketplace, r.start_date, r.end_date, r.deposit_date ?? "",
        r.total_amount, r.currency,
        r.principal, Math.abs(r.commission), Math.abs(r.fba_fees), Math.abs(r.refunds_total),
        Math.abs(r.ppc_cost), r.other_svc_fees, r.reserved, r.computed_net, r.order_count,
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
    const accountId = getCurrentAccountId();
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();
    const mpW = marketplace && marketplace !== "all" ? ` AND marketplace = '${marketplace.replace(/'/g,"")}'` : "";

    type FeeRow = { amountType: string; total: number; count: number };
    const rows = await prisma.$queryRawUnsafe<FeeRow[]>(`
      SELECT
        "amountType",
        COALESCE(SUM(ABS(amount)), 0)::FLOAT8 AS total,
        COUNT(*)::INTEGER AS count
      FROM "AmazonSettlementTransaction"
      WHERE "postedDate" >= '${dateFrom.toISOString()}'::timestamp
        AND "postedDate" <= '${dateTo.toISOString()}'::timestamp
        AND "amazonAccountId" = '${accountId}'
        ${mpW}
      GROUP BY "amountType"
      ORDER BY total DESC
    `);

    const totalFees = rows.reduce((s, r) => s + Number(r.total), 0);
    res.json({
      breakdown: rows.map((r) => ({
        type: r.amountType,
        total: Math.round(Number(r.total) * 100) / 100,
        count: Number(r.count),
        pct: totalFees > 0 ? Math.round((Number(r.total) / totalFees) * 1000) / 10 : 0,
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
    const accountId = getCurrentAccountId();
    const { marketplace } = req.query as Record<string, string>;
    const mpW = marketplace && marketplace !== "all" ? ` AND marketplace = '${marketplace.replace(/'/g,"")}'` : "";

    type RbRow = { month: string; amount: number; count: number };
    const rows = await prisma.$queryRawUnsafe<RbRow[]>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "postedDate"), 'YYYY-MM') AS month,
        COALESCE(SUM(amount), 0)::FLOAT8 AS amount,
        COUNT(*)::INTEGER AS count
      FROM "AmazonSettlementTransaction"
      WHERE ("amountType" ILIKE '%reimburse%' OR "amountType" ILIKE '%compensat%')
        AND "amazonAccountId" = '${accountId}'
        ${mpW}
      GROUP BY DATE_TRUNC('month', "postedDate")
      ORDER BY 1 DESC
    `);
    res.json(rows.map((r) => ({ month: r.month, amount: Number(r.amount), count: Number(r.count) })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
