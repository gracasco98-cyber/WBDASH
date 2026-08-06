// amazon/routes/settlement.routes.ts — Settlement dashboard and payment list endpoints
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { getCurrentAccountId } from "../../context/account-context";
import {
  computeHistoricalFeeRatiosByMarketplace,
  type HistoricalFeeRatios,
} from "../../repositories/amazon/settlement.repo";
export const settlementRouter = Router();

const DASHBOARD_MARKETPLACES = ["IT", "DE", "FR", "ES"];

// ─── GET /dashboard ─────────────────────────────────────────────────────────────
// Returns THREE distinct settlement statuses:
// 1. "inFlight"  — Orders from the last 28 days NOT YET in any settlement.
// 2. "overdue"   — Orders OLDER than 45 days within the settlement coverage window
//                  that have NEVER appeared in any settlement.
// 3. Historical payout ratios per marketplace.
settlementRouter.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const amazonAccountId = getCurrentAccountId();

    // ── 1. Per-marketplace fee ratios from historical settlement data ───────────
    const feeRatioRows = await computeHistoricalFeeRatiosByMarketplace(prisma, DASHBOARD_MARKETPLACES);

    // Map of per-marketplace fee data
    const feeMap = new Map<string, HistoricalFeeRatios>(feeRatioRows.map(r => [r.marketplace, r]));

    // ── 2. Historical account totals (full settlement period) ──────────────────
    const acctTotals = feeRatioRows.reduce((acc, r) => {
      acc.grossSales   += r.grossSales;
      acc.realPayout   += r.realPayout;
      acc.amazonTake   += r.grossSales - r.realPayout;
      return acc;
    }, { grossSales: 0, realPayout: 0, amazonTake: 0 });

    // ── 3. In-flight (riserva) — last 28 days, not yet in any settlement ───────
    const inFlightRows = await prisma.$queryRawUnsafe<{
      marketplace: string; count: bigint; gross: number;
      last_settlement_end: string; last_settlement_deposit: string | null;
    }[]>(`
      WITH last_sett AS (
        SELECT marketplace,
          MAX("endDate")::date::text     AS last_end,
          MAX("depositDate")::date::text AS last_deposit
        FROM "AmazonSettlement"
        WHERE marketplace IN ('IT','DE','FR','ES') AND "amazonAccountId" = '${amazonAccountId}'
        GROUP BY marketplace
      )
      SELECT
        o.marketplace,
        COUNT(DISTINCT o."amazonOrderId")       AS count,
        COALESCE(SUM(o."itemTotal"),0)::FLOAT8  AS gross,
        ls.last_end                             AS last_settlement_end,
        ls.last_deposit                         AS last_settlement_deposit
      FROM "AmazonOrder" o
      JOIN last_sett ls ON ls.marketplace = o.marketplace
      WHERE o."orderStatus" NOT IN ('Cancelled','Pending')
        AND o."purchaseDate" >= NOW() - INTERVAL '28 days'
        AND o."amazonAccountId" = '${amazonAccountId}'
        AND NOT EXISTS (
          SELECT 1 FROM "AmazonSettlementTransaction" st
          WHERE st."orderId" = o."amazonOrderId"
            AND st."amountType" = 'Principal' AND st."transactionType" = 'Order'
            AND st."amazonAccountId" = '${amazonAccountId}'
        )
      GROUP BY o.marketplace, ls.last_end, ls.last_deposit
      ORDER BY gross DESC
    `);

    // ── 4. Overdue — older than 45 days, within coverage, never settled ────────
    const overdueRows = await prisma.$queryRawUnsafe<{
      marketplace: string; count: bigint; gross: number;
    }[]>(`
      WITH mp_coverage AS (
        SELECT marketplace,
          MIN("startDate")::date AS cov_from,
          MAX("endDate")::date   AS cov_to
        FROM "AmazonSettlement"
        WHERE marketplace NOT IN ('EU') AND "amazonAccountId" = '${amazonAccountId}'
        GROUP BY marketplace
      )
      SELECT
        o.marketplace,
        COUNT(DISTINCT o."amazonOrderId")       AS count,
        COALESCE(SUM(o."itemTotal"),0)::FLOAT8  AS gross
      FROM "AmazonOrder" o
      JOIN mp_coverage mc ON mc.marketplace = o.marketplace
      WHERE o."orderStatus" NOT IN ('Cancelled','Pending')
        AND o."purchaseDate"::date >= mc.cov_from
        AND o."purchaseDate"::date <= mc.cov_to - INTERVAL '45 days'
        AND o."amazonAccountId" = '${amazonAccountId}'
        AND NOT EXISTS (
          SELECT 1 FROM "AmazonSettlementTransaction" st
          WHERE st."orderId" = o."amazonOrderId"
            AND st."amountType" = 'Principal' AND st."transactionType" = 'Order'
            AND st."amazonAccountId" = '${amazonAccountId}'
        )
      GROUP BY o.marketplace
      ORDER BY gross DESC
    `);

    // ── 5. Last settlement per marketplace ─────────────────────────────────────
    const lastSett = await prisma.$queryRawUnsafe<{
      marketplace: string; deposit_date: string; total_amount: number;
      end_date: string; next_expected: string;
    }[]>(`
      SELECT marketplace,
        MAX("depositDate")::date::text AS deposit_date,
        MAX("totalAmount")::FLOAT8     AS total_amount,
        MAX("endDate")::date::text     AS end_date,
        (MAX("endDate") + INTERVAL '14 days')::date::text AS next_expected
      FROM "AmazonSettlement"
      WHERE marketplace IN ('IT','DE','FR','ES') AND "amazonAccountId" = '${amazonAccountId}'
      GROUP BY marketplace
      ORDER BY marketplace
    `);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const round1 = (n: number) => Math.round(n * 10) / 10;

    const inFlight = inFlightRows.map(r => {
      const fr   = feeMap.get(r.marketplace);
      const gr   = Number(r.gross);
      const payoutRatio  = fr ? fr.payoutRatio : 0.42;
      const estNet       = round2(gr * payoutRatio);
      const estCommission  = fr ? round2(gr * fr.rCommission) : 0;
      const estFba         = fr ? round2(gr * fr.rFba)        : 0;
      const estAds         = fr ? round2(gr * fr.rAds)        : 0;
      const estAdsVat      = fr ? round2(gr * fr.rAdsVat)     : 0;
      const estDsf         = fr ? round2(gr * fr.rDsf)        : 0;
      const estStorage     = fr ? round2(gr * fr.rStorage)    : 0;
      const estInbound     = fr ? round2(gr * fr.rInbound)    : 0;
      const estPrep        = fr ? round2(gr * fr.rPrep)       : 0;
      const estRefunds     = fr ? round2(gr * fr.rRefunds)    : 0;
      const estOther       = fr ? round2(gr * fr.rOther)      : 0;

      return {
        marketplace:           r.marketplace,
        count:                 Number(r.count),
        grossAmount:           round2(gr),
        estNetAmount:          estNet,
        payoutRatioPct:        round1(payoutRatio * 100),
        lastSettlementEnd:     r.last_settlement_end ?? null,
        lastSettlementDeposit: r.last_settlement_deposit ?? null,
        feeBreakdown: {
          commission: estCommission,
          fbaFee:     estFba,
          adsCost:    estAds,
          adsVat:     estAdsVat,
          dsf:        estDsf,
          storage:    estStorage,
          inbound:    estInbound,
          prep:       estPrep,
          refunds:    estRefunds,
          otherCharges: estOther,
          commissionPct: fr ? round1(fr.rCommission * 100) : 0,
          fbaPct:        fr ? round1(fr.rFba * 100)        : 0,
          adsPct:        fr ? round1(fr.rAds * 100)        : 0,
        },
      };
    });

    const overdue = overdueRows.map(r => ({
      marketplace: r.marketplace,
      count:       Number(r.count),
      grossAmount: round2(Number(r.gross)),
    }));

    const totalInFlightGross = inFlight.reduce((s, r) => s + r.grossAmount, 0);
    const totalInFlightNet   = inFlight.reduce((s, r) => s + r.estNetAmount, 0);
    const totalOverdueGross  = overdue.reduce((s, r) => s + r.grossAmount, 0);

    res.json({
      inFlight: {
        count:        inFlight.reduce((s, r) => s + r.count, 0),
        totalGross:   round2(totalInFlightGross),
        totalEstNet:  round2(totalInFlightNet),
        totalEstFees: round2(totalInFlightGross - totalInFlightNet),
        byMarketplace: inFlight,
      },
      overdue: {
        count:        overdue.reduce((s, r) => s + r.count, 0),
        totalGross:   round2(totalOverdueGross),
        byMarketplace: overdue,
      },
      lastSettlements: lastSett.map(s => {
        const fr = feeMap.get(s.marketplace);
        return {
          marketplace:     s.marketplace,
          depositDate:     s.deposit_date,
          totalAmount:     round2(Number(s.total_amount)),
          endDate:         s.end_date,
          nextExpected:    s.next_expected,
          payoutRatioPct:  fr ? round1(fr.payoutRatio * 100) : 42,
          historicalFees: {
            commissionPct: fr ? round1(fr.rCommission * 100) : 0,
            fbaPct:        fr ? round1(fr.rFba * 100)        : 0,
            adsPct:        fr ? round1(fr.rAds * 100)        : 0,
            storagePct:    fr ? round1((fr.rStorage + fr.rInbound + fr.rPrep) * 100) : 0,
            grossSales:    fr ? round2(fr.grossSales)         : 0,
            realPayout:    fr ? round2(fr.realPayout)         : 0,
          },
        };
      }),
      accountSummary: {
        historicalGross:     round2(acctTotals.grossSales),
        historicalPayout:    round2(acctTotals.realPayout),
        historicalAmazonTake: round2(acctTotals.amazonTake),
        avgPayoutPct:        round1(acctTotals.grossSales > 0
          ? (acctTotals.realPayout / acctTotals.grossSales) * 100 : 0),
      },
    });
  } catch (err) {
    console.error("[Amazon] GET /dashboard:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /payments ────────────────────────────────────────────────────────────
settlementRouter.get("/payments", async (req: Request, res: Response) => {
  try {
    const amazonAccountId = getCurrentAccountId();
    const { marketplace } = req.query as Record<string, string>;
    const mpFilterParam = marketplace && marketplace !== "all" ? marketplace.replace(/'/g, "") : null;

    type SettRow = {
      settlementId: string; marketplace: string;
      start_date: string; end_date: string; deposit_date: string | null;
      total_amount: number; currency: string;
      principal: number; taxes: number; shipping_net: number;
      refunds_total: number; fba_fees: number; commission: number;
      digital_svc_fee: number; ppc_cost: number; other_svc_fees: number;
      reserved: number; computed_net: number; order_count: number;
      has_data_warning: boolean;
    };

    const mpWhereSettlement = mpFilterParam
      ? `WHERE s.marketplace = '${mpFilterParam}' AND s."amazonAccountId" = '${amazonAccountId}'`
      : `WHERE s."amazonAccountId" = '${amazonAccountId}'`;
    const mpWhereJoin       = mpFilterParam ? `AND t.marketplace = '${mpFilterParam}'` : "";

    const settlements = await prisma.$queryRawUnsafe<SettRow[]>(`
      SELECT
        s."settlementId",
        s.marketplace,
        s."startDate"::date::text                                               AS start_date,
        s."endDate"::date::text                                                 AS end_date,
        s."depositDate"::date::text                                             AS deposit_date,
        s."totalAmount"::FLOAT8                                                 AS total_amount,
        s.currency,
        COALESCE(SUM(CASE WHEN t."amountType" = 'Principal'
                           AND t."transactionType" = 'Order'
                           AND t.marketplace != 'EU'             THEN t.amount ELSE 0 END),0)::FLOAT8  AS principal,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('Tax','ShippingTax','GiftWrapTax',
                          'TaxDiscount','MarketplaceFacilitatorVAT-Principal',
                          'MarketplaceFacilitatorVAT-Shipping','LowValueGoodsTax')
                           AND t.marketplace != 'EU'             THEN t.amount ELSE 0 END),0)::FLOAT8  AS taxes,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('Shipping','ShippingTax','ShippingChargeback')
                           AND t."transactionType" = 'Order'
                           AND t.marketplace != 'EU'             THEN t.amount ELSE 0 END),0)::FLOAT8  AS shipping_net,
        COALESCE(SUM(CASE WHEN t."transactionType" = 'Refund'
                           AND t.marketplace != 'EU'             THEN t.amount ELSE 0 END),0)::FLOAT8  AS refunds_total,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('FBAPerUnitFulfillmentFee','FBAPerOrderFulfillmentFee',
                          'FBAWeightBasedFee','LabelingPrepFee','PickAndPackFee','FulfillmentFee')
                           AND t.marketplace != 'EU'             THEN t.amount ELSE 0 END),0)::FLOAT8  AS fba_fees,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('Commission','VariableClosingFee','DigitalServicesFee')
                           AND t."transactionType" = 'Order'
                           AND t.marketplace != 'EU'             THEN t.amount ELSE 0 END),0)::FLOAT8  AS commission,
        COALESCE(SUM(CASE WHEN t."amountType" = 'DigitalServicesFee'
                           AND t."transactionType" = 'Order'
                           AND t.marketplace != 'EU'             THEN t.amount ELSE 0 END),0)::FLOAT8  AS digital_svc_fee,
        COALESCE(SUM(CASE WHEN t."transactionType" = 'ServiceFee'
                           AND (t."amountType" ILIKE '%advertising%'
                             OR t."amountType" ILIKE '%cost per click%'
                             OR t."amountType" ILIKE '%sponsored%'
                             OR t."amountType" = 'TaxAmount')    THEN t.amount ELSE 0 END),0)::FLOAT8  AS ppc_cost,
        COALESCE(SUM(CASE WHEN t.marketplace = 'EU'
                           AND NOT (t."transactionType" = 'ServiceFee'
                             AND (t."amountType" ILIKE '%advertising%'
                               OR t."amountType" ILIKE '%cost per click%'
                               OR t."amountType" ILIKE '%sponsored%'
                               OR t."amountType" = 'TaxAmount'))
                           AND t."amountType" NOT IN ('Current Reserve Amount','Previous Reserve Amount Balance')
                                                                 THEN t.amount ELSE 0 END),0)::FLOAT8  AS other_svc_fees,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('Current Reserve Amount','Previous Reserve Amount Balance')
                                                                 THEN t.amount ELSE 0 END),0)::FLOAT8  AS reserved,
        COALESCE(SUM(t.amount),0)::FLOAT8                                                              AS computed_net,
        COUNT(DISTINCT CASE WHEN t."transactionType" = 'Order' AND t."orderId" IS NOT NULL
                            THEN t."orderId" END)::INTEGER                                             AS order_count
      FROM "AmazonSettlement" s
      LEFT JOIN "AmazonSettlementTransaction" t ON t."settlementId" = s."settlementId" AND t."amazonAccountId" = s."amazonAccountId"
      ${mpWhereSettlement}
      GROUP BY s."settlementId", s.marketplace, s."startDate", s."endDate", s."depositDate", s."totalAmount", s.currency
      ORDER BY s."endDate" DESC
      LIMIT 2000
    `);

    const txOnlySettlements = await prisma.$queryRawUnsafe<{
      settlementId: string; marketplace: string; date_from: string; date_to: string;
      computed_net: number; order_count: number;
      principal: number; taxes: number; fba_fees: number; commission: number;
      refunds_total: number;
    }[]>(`
      SELECT
        t."settlementId",
        MAX(CASE WHEN t.marketplace NOT IN ('EU') THEN t.marketplace END) AS marketplace,
        MIN(t."postedDate")::date::text AS date_from,
        MAX(t."postedDate")::date::text AS date_to,
        COALESCE(SUM(t.amount),0)::FLOAT8 AS computed_net,
        COUNT(DISTINCT CASE WHEN t."transactionType"='Order' AND t."orderId" IS NOT NULL THEN t."orderId" END)::INTEGER AS order_count,
        COALESCE(SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END),0)::FLOAT8 AS principal,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('Tax','ShippingTax') THEN t.amount ELSE 0 END),0)::FLOAT8 AS taxes,
        COALESCE(SUM(CASE WHEN t."amountType" IN ('FBAPerUnitFulfillmentFee','FBAPerOrderFulfillmentFee') THEN t.amount ELSE 0 END),0)::FLOAT8 AS fba_fees,
        COALESCE(SUM(CASE WHEN t."amountType"='Commission' AND t."transactionType"='Order' THEN t.amount ELSE 0 END),0)::FLOAT8 AS commission,
        COALESCE(SUM(CASE WHEN t."transactionType"='Refund' THEN t.amount ELSE 0 END),0)::FLOAT8 AS refunds_total
      FROM "AmazonSettlementTransaction" t
      WHERE t."amazonAccountId" = '${amazonAccountId}'
        AND t."settlementId" NOT IN (SELECT "settlementId" FROM "AmazonSettlement" WHERE "amazonAccountId" = '${amazonAccountId}')
        ${mpFilterParam ? `AND t.marketplace = '${mpFilterParam}'` : ""}
      GROUP BY t."settlementId"
      HAVING MAX(CASE WHEN t.marketplace NOT IN ('EU') THEN t.marketplace END) IS NOT NULL
      ORDER BY date_to DESC
      LIMIT 500
    `);

    // ── 3. Build unified enriched list ────────────────────────────────────────
    const enriched: any[] = settlements
      .filter(s => s.marketplace != null)
      .map(s => {
        const hasSettlementHeader = Number(s.total_amount) !== 0;
        const netPayout = hasSettlementHeader ? Number(s.total_amount) : Number(s.computed_net);
        const diff = netPayout - Number(s.computed_net);
        return {
          settlementId:      s.settlementId,
          marketplace:       String(s.marketplace ?? "?"),
          dateFrom:          String(s.start_date ?? ""),
          dateTo:            String(s.end_date ?? ""),
          depositDate:       s.deposit_date ? String(s.deposit_date) : null,
          currency:          String(s.currency ?? "EUR"),
          netPayout,
          principal:         Number(s.principal),
          taxes:             Number(s.taxes),
          shippingNet:       Number(s.shipping_net),
          refunds:           Math.abs(Number(s.refunds_total)),
          fbaFees:           Math.abs(Number(s.fba_fees)),
          commission:        Math.abs(Number(s.commission)),
          ppcCost:           Math.abs(Number(s.ppc_cost)),
          otherFees:         Number(s.other_svc_fees),
          reserved:          Number(s.reserved),
          computedNet:       Number(s.computed_net),
          orderCount:        Number(s.order_count),
          hasDataWarning:    hasSettlementHeader && Math.abs(diff) > 1,
          missingAmount:     hasSettlementHeader ? diff : 0,
        };
      });

    // Add fallback (no-header) settlements
    for (const t of txOnlySettlements) {
      if (!enriched.find(s => s.settlementId === t.settlementId)) {
        enriched.push({
          settlementId: t.settlementId,
          marketplace:  String(t.marketplace ?? "?"),
          dateFrom:     String(t.date_from ?? ""),
          dateTo:       String(t.date_to ?? ""),
          depositDate:  null,
          currency:     "EUR",
          netPayout:    Number(t.computed_net),
          principal:    Number(t.principal),
          taxes:        Number(t.taxes),
          shippingNet:  0,
          refunds:      Math.abs(Number(t.refunds_total)),
          fbaFees:      Math.abs(Number(t.fba_fees)),
          commission:   Math.abs(Number(t.commission)),
          ppcCost:      0,
          otherFees:    0,
          reserved:     0,
          computedNet:  Number(t.computed_net),
          orderCount:   Number(t.order_count),
          hasDataWarning: true,
          missingAmount: 0,
        });
      }
    }
    enriched.sort((a, b) => b.dateTo.localeCompare(a.dateTo));

    // ── 4. Next payment dates per marketplace (last settlement endDate + 14d) ──
    const lastByMarket = new Map<string, string>();
    for (const s of enriched) {
      if (s.dateTo && (!lastByMarket.has(s.marketplace) || s.dateTo > lastByMarket.get(s.marketplace)!)) {
        lastByMarket.set(s.marketplace, s.dateTo);
      }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextPayments: Record<string, { date: string; daysUntil: number; lastSettlementNet: number }> = {};
    for (const [mp, lastDate] of lastByMarket.entries()) {
      const last = new Date(lastDate);
      last.setHours(0, 0, 0, 0);
      const next = new Date(last);
      next.setDate(next.getDate() + 14);
      const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
      const lastSettlement = enriched.find(s => s.marketplace === mp && s.dateTo === lastDate);
      nextPayments[mp] = {
        date: next.toISOString().split("T")[0],
        daysUntil,
        lastSettlementNet: lastSettlement?.netPayout ?? 0,
      };
    }

    // ── 5. Per-marketplace summary ────────────────────────────────────────────
    const summaryMap = new Map<string, { totalNet: number; totalGross: number; count: number }>();
    for (const s of enriched) {
      const prev = summaryMap.get(s.marketplace) ?? { totalNet: 0, totalGross: 0, count: 0 };
      summaryMap.set(s.marketplace, {
        totalNet:   prev.totalNet   + s.netPayout,
        totalGross: prev.totalGross + s.principal,
        count:      prev.count + 1,
      });
    }
    const summary = Array.from(summaryMap.entries())
      .map(([mp, v]) => ({ marketplace: mp, totalNet: v.totalNet, totalGross: v.totalGross, settlementCount: v.count }))
      .sort((a, b) => b.totalNet - a.totalNet);

    // ── 6. Monthly PPC from AmazonAdSnapshot ──────────────────────────────────
    type AdRow = { month: string; spend: number };
    const adRows = await prisma.$queryRawUnsafe<AdRow[]>(`
      SELECT
        DATE_TRUNC('month', "snapshotDate")::date::text AS month,
        COALESCE(SUM(spend),0)::FLOAT8 AS spend
      FROM "AmazonAdSnapshot"
      WHERE "amazonAccountId" = '${amazonAccountId}'
        ${mpFilterParam ? `AND marketplace = '${mpFilterParam}'` : ""}
      GROUP BY DATE_TRUNC('month', "snapshotDate")
      ORDER BY month DESC
      LIMIT 12
    `);

    res.json({
      settlements:    enriched,
      nextPayments,
      summary,
      monthlyAdSpend: adRows.map(r => ({ month: String(r.month), spend: Number(r.spend) })),
    });
  } catch (err) {
    console.error("[Amazon] GET /payments:", err);
    res.status(500).json({ error: String(err) });
  }
});

