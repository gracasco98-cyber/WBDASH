// amazon/routes/forecast.routes.ts — Forecast snapshots + calibration view
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { getCurrentAccountId } from "../../context/account-context";
import { getCalibration, saveForecastSnapshot, getCalibrationStatus, computeComponentBreakdown } from "../forecast";
import { computeHistoricalFeeRatiosByMarketplace } from "../../repositories/amazon/settlement.repo";

export const forecastRouter = Router();

// ─── GET /payments/forecast ────────────────────────────────────────────────────
// Precise forecast for the next Amazon payment.
// Uses:
//   1. Historical per-fee ratios from settled data (proven accurate vs real bank transfers)
//   2. All open unsettled orders: current period (post last_end) + stragglers from previous period
//   3. Settlement cycle metadata (14-day cycle, median 9-day delay)
// Returns gross breakdown, fee waterfall, and estimated net per marketplace.
forecastRouter.get("/payments/forecast", async (_req: Request, res: Response) => {
  try {
    const amazonAccountId = getCurrentAccountId();
    const MARKETPLACES = ["IT", "DE", "ES", "FR"];
    const ALL_EU_MARKETPLACES = ["IT", "DE", "ES", "FR", "NL", "PL", "UK", "SE"];

    // ── 1. Historical fee ratios (verified against real bank transfers) ─────────
    const feeRatioRows = await computeHistoricalFeeRatiosByMarketplace(prisma, ["IT", "DE", "ES", "FR"]);

    type FR = typeof feeRatioRows[0];
    const frMap = new Map<string, FR>(feeRatioRows.map(r => [r.marketplace, r]));

    // ── 2. Settlement cycle info per marketplace ────────────────────────────────
    const cycleRows = await prisma.$queryRawUnsafe<{
      marketplace: string;
      last_start: string; last_end: string;
      last_deposit: string;
      next_period_end: string;
      next_deposit_est: string;
    }[]>(`
      SELECT marketplace,
        MAX("startDate")::date::text AS last_start,
        MAX("endDate")::date::text   AS last_end,
        MAX("depositDate")::date::text AS last_deposit,
        (MAX("endDate") + INTERVAL '14 days')::date::text   AS next_period_end,
        (MAX("depositDate") + INTERVAL '14 days')::date::text AS next_deposit_est
      FROM "AmazonSettlement"
      WHERE marketplace = ANY(ARRAY['IT','DE','ES','FR']) AND "amazonAccountId" = '${amazonAccountId}'
      GROUP BY marketplace
    `);
    const cycleMap = new Map(cycleRows.map(r => [r.marketplace, r]));

    // ── 2b. Last-3-cycle net payouts per marketplace (for history-based projection) ─
    const histNetRows = await prisma.$queryRawUnsafe<{
      marketplace: string;
      net_c1: number; net_c2: number; net_c3: number;
    }[]>(`
      WITH ranked AS (
        SELECT marketplace, "totalAmount",
          ROW_NUMBER() OVER (PARTITION BY marketplace ORDER BY "endDate" DESC) AS rn
        FROM "AmazonSettlement"
        WHERE marketplace = ANY(ARRAY['IT','DE','ES','FR']) AND "amazonAccountId" = '${amazonAccountId}'
      )
      SELECT marketplace,
        MAX(CASE WHEN rn=1 THEN "totalAmount" END)::FLOAT8 AS net_c1,
        MAX(CASE WHEN rn=2 THEN "totalAmount" END)::FLOAT8 AS net_c2,
        MAX(CASE WHEN rn=3 THEN "totalAmount" END)::FLOAT8 AS net_c3
      FROM ranked WHERE rn <= 3
      GROUP BY marketplace
    `);
    const histNetMap = new Map(histNetRows.map(r => [r.marketplace, r]));

    // ── 2c. Additional EU settlements (non-EUR currencies or tiny volume) ─────────
    const additionalSettlRows = await prisma.$queryRawUnsafe<{
      marketplace: string; currency: string;
      net_c1: number; net_c2: number; net_c3: number;
      last_end: string; last_deposit: string; next_deposit_est: string;
    }[]>(`
      WITH ranked AS (
        SELECT marketplace, currency, "totalAmount", "endDate", "depositDate",
          ROW_NUMBER() OVER (PARTITION BY marketplace ORDER BY "endDate" DESC) AS rn
        FROM "AmazonSettlement"
        WHERE marketplace = ANY(ARRAY['NL','PL','UK','SE']) AND "amazonAccountId" = '${amazonAccountId}'
      )
      SELECT marketplace,
        MAX(currency) AS currency,
        MAX(CASE WHEN rn=1 THEN "totalAmount" END)::FLOAT8 AS net_c1,
        MAX(CASE WHEN rn=2 THEN "totalAmount" END)::FLOAT8 AS net_c2,
        MAX(CASE WHEN rn=3 THEN "totalAmount" END)::FLOAT8 AS net_c3,
        MAX(CASE WHEN rn=1 THEN "endDate" END)::date::text AS last_end,
        MAX(CASE WHEN rn=1 THEN "depositDate" END)::date::text AS last_deposit,
        (MAX(CASE WHEN rn=1 THEN "depositDate" END) + INTERVAL '14 days')::date::text AS next_deposit_est
      FROM ranked WHERE rn <= 3
      GROUP BY marketplace
      ORDER BY MAX("totalAmount") DESC
    `);

    // ── 3. Open unsettled orders: current period + genuine DD+9 stragglers ─────
    const openRows = await prisma.$queryRawUnsafe<{
      marketplace: string;
      current_orders: bigint; current_gross: number;
      straggler_orders: bigint; straggler_gross: number;
      earliest_date: string; latest_date: string;
    }[]>(`
      WITH last_sett AS (
        SELECT marketplace, MAX("startDate") AS last_start, MAX("endDate") AS last_end
        FROM "AmazonSettlement" WHERE marketplace = ANY(ARRAY['IT','DE','ES','FR']) AND "amazonAccountId" = '${amazonAccountId}' GROUP BY marketplace
      ),
      current_p AS (
        SELECT o.marketplace,
          COUNT(DISTINCT o."amazonOrderId") AS cnt, SUM(o."itemTotal") AS gross,
          MIN(o."purchaseDate")::date::text AS earliest, MAX(o."purchaseDate")::date::text AS latest
        FROM "AmazonOrder" o JOIN last_sett ls ON ls.marketplace = o.marketplace
        WHERE o."orderStatus" NOT IN ('Cancelled','Pending')
          AND o."purchaseDate" > ls.last_end
          AND o."purchaseDate" <= NOW()
          AND o."amazonAccountId" = '${amazonAccountId}'
          AND NOT EXISTS (SELECT 1 FROM "AmazonSettlementTransaction" st
            WHERE st."orderId" = o."amazonOrderId" AND st."amountType"='Principal' AND st."transactionType"='Order'
              AND st."amazonAccountId" = '${amazonAccountId}')
        GROUP BY o.marketplace
      ),
      straggler_p AS (
        SELECT o.marketplace,
          COUNT(DISTINCT o."amazonOrderId") AS cnt, SUM(o."itemTotal") AS gross
        FROM "AmazonOrder" o JOIN last_sett ls ON ls.marketplace = o.marketplace
        WHERE o."orderStatus" NOT IN ('Cancelled','Pending')
          AND o."purchaseDate" >= ls.last_end - INTERVAL '8 days'
          AND o."purchaseDate" <= ls.last_end
          AND o."amazonAccountId" = '${amazonAccountId}'
          AND NOT EXISTS (SELECT 1 FROM "AmazonSettlementTransaction" st
            WHERE st."orderId" = o."amazonOrderId" AND st."amountType"='Principal' AND st."transactionType"='Order'
              AND st."amazonAccountId" = '${amazonAccountId}')
        GROUP BY o.marketplace
      )
      SELECT
        COALESCE(cp.marketplace, sp.marketplace)   AS marketplace,
        COALESCE(cp.cnt, 0)                        AS current_orders,
        COALESCE(cp.gross, 0)::FLOAT8              AS current_gross,
        COALESCE(sp.cnt, 0)                        AS straggler_orders,
        COALESCE(sp.gross, 0)::FLOAT8              AS straggler_gross,
        COALESCE(cp.earliest, '')                  AS earliest_date,
        COALESCE(cp.latest, '')                    AS latest_date
      FROM current_p cp
      FULL OUTER JOIN straggler_p sp ON sp.marketplace = cp.marketplace
      ORDER BY COALESCE(cp.gross, 0) + COALESCE(sp.gross, 0) DESC
    `);

    // ── 3b. Previous settlement gross (for refund lag model) ──────────────────
    const prevSettGrossRows = await prisma.$queryRawUnsafe<{ marketplace: string; prev_gross: number }[]>(`
      WITH ranked AS (
        SELECT s.marketplace, s."settlementId", s."endDate"
        , ROW_NUMBER() OVER (PARTITION BY s.marketplace ORDER BY s."endDate" DESC) AS rn
        FROM "AmazonSettlement" s
        WHERE s.marketplace = ANY(ARRAY['IT','DE','ES','FR']) AND s."amazonAccountId" = '${amazonAccountId}'
      )
      SELECT r.marketplace,
        SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END)::FLOAT8 AS prev_gross
      FROM ranked r
      JOIN "AmazonSettlementTransaction" t ON t."settlementId" = r."settlementId"
      WHERE r.rn = 1
        AND t."amazonAccountId" = '${amazonAccountId}'
      GROUP BY r.marketplace
    `);
    const prevSettGrossMap = new Map(prevSettGrossRows.map(r => [r.marketplace, Number(r.prev_gross)]));

    // ── 3c. Total units for open (unsettled) orders per marketplace ────────────
    const openUnitsRows = await prisma.$queryRawUnsafe<{ marketplace: string; total_units: number }[]>(`
      WITH last_sett AS (
        SELECT marketplace, MAX("startDate") AS last_start, MAX("endDate") AS last_end
        FROM "AmazonSettlement" WHERE marketplace = ANY(ARRAY['IT','DE','ES','FR']) AND "amazonAccountId" = '${amazonAccountId}' GROUP BY marketplace
      )
      SELECT o.marketplace,
        SUM(oi."quantityOrdered")::INTEGER AS total_units
      FROM "AmazonOrder" o
      JOIN "AmazonOrderItem" oi ON oi."amazonOrderId" = o."amazonOrderId" AND oi."amazonAccountId" = o."amazonAccountId"
      JOIN last_sett ls ON ls.marketplace = o.marketplace
      WHERE o."orderStatus" NOT IN ('Cancelled','Pending')
        AND o."purchaseDate" > ls.last_end
        AND o."purchaseDate" <= NOW()
        AND o."amazonAccountId" = '${amazonAccountId}'
        AND NOT EXISTS (SELECT 1 FROM "AmazonSettlementTransaction" st
          WHERE st."orderId" = o."amazonOrderId" AND st."amountType"='Principal' AND st."transactionType"='Order'
            AND st."amazonAccountId" = '${amazonAccountId}')
      GROUP BY o.marketplace
    `);
    const openUnitsMap = new Map(openUnitsRows.map(r => [r.marketplace, Number(r.total_units)]));

    // ── 3d. Payable / Borderline / Deferred split ──────────────────────────────
    const payableSplitRows = await prisma.$queryRawUnsafe<{
      marketplace: string;
      payable_gross: number; payable_orders: number;
      borderline_gross: number; borderline_orders: number;
      deferred_gross: number; deferred_orders: number;
    }[]>(`
      WITH last_sett AS (
        SELECT marketplace, MAX("endDate") AS last_end,
          (MAX("endDate") + INTERVAL '14 days') AS cycle_end
        FROM "AmazonSettlement" WHERE marketplace = ANY(ARRAY['IT','DE','ES','FR']) AND "amazonAccountId" = '${amazonAccountId}'
        GROUP BY marketplace
      )
      SELECT o.marketplace,
        SUM(CASE WHEN o."purchaseDate" + INTERVAL '9 days' <= ls.cycle_end
                 THEN o."itemTotal" ELSE 0 END)::FLOAT8 AS payable_gross,
        COUNT(CASE WHEN o."purchaseDate" + INTERVAL '9 days' <= ls.cycle_end THEN 1 END)::INTEGER AS payable_orders,
        SUM(CASE WHEN o."purchaseDate" + INTERVAL '9 days' > ls.cycle_end
                  AND o."purchaseDate" + INTERVAL '9 days' <= ls.cycle_end + INTERVAL '1 day'
                 THEN o."itemTotal" ELSE 0 END)::FLOAT8 AS borderline_gross,
        COUNT(CASE WHEN o."purchaseDate" + INTERVAL '9 days' > ls.cycle_end
                    AND o."purchaseDate" + INTERVAL '9 days' <= ls.cycle_end + INTERVAL '1 day'
                   THEN 1 END)::INTEGER AS borderline_orders,
        SUM(CASE WHEN o."purchaseDate" + INTERVAL '9 days' > ls.cycle_end + INTERVAL '1 day'
                 THEN o."itemTotal" ELSE 0 END)::FLOAT8 AS deferred_gross,
        COUNT(CASE WHEN o."purchaseDate" + INTERVAL '9 days' > ls.cycle_end + INTERVAL '1 day'
                   THEN 1 END)::INTEGER AS deferred_orders
      FROM "AmazonOrder" o
      JOIN last_sett ls ON ls.marketplace = o.marketplace
      WHERE o."purchaseDate" > ls.last_end
        AND o."orderStatus" NOT IN ('Cancelled','Pending')
        AND o."amazonAccountId" = '${amazonAccountId}'
      GROUP BY o.marketplace
    `);
    const payableSplitMap = new Map(payableSplitRows.map(r => [r.marketplace, r]));

    // ── 4. Build per-marketplace forecast ──────────────────────────────────────
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const r1 = (n: number) => Math.round(n * 10) / 10;

    const today = new Date();

    const calibrations = await Promise.all(
      ["IT","DE","ES","FR"].map(mp => getCalibration(mp).then(c => ({ mp, c })))
    );
    const calibMap = new Map(calibrations.map(({ mp, c }) => [mp, c]));

    const openRowMap = new Map(openRows.map(r => [r.marketplace, r]));
    const FORECAST_MARKETS = ["IT", "DE", "ES", "FR"];
    const byMarketplace = FORECAST_MARKETS.map(mp => {
      const fr    = frMap.get(mp);
      const cycle = cycleMap.get(mp);
      if (!fr || !cycle) return null;

      const openRow = openRowMap.get(mp);
      const row = {
        marketplace:      mp,
        current_orders:   openRow?.current_orders   ?? BigInt(0),
        current_gross:    openRow?.current_gross    ?? 0,
        straggler_orders: openRow?.straggler_orders ?? BigInt(0),
        straggler_gross:  openRow?.straggler_gross  ?? 0,
        earliest_date:    openRow?.earliest_date    ?? "",
        latest_date:      openRow?.latest_date      ?? "",
      };

      const currentGross    = Number(row.current_gross);
      const stragglerGross  = Number(row.straggler_gross);
      const totalGross      = currentGross + stragglerGross;
      const totalOrders     = Number(row.current_orders) + Number(row.straggler_orders);

      const calib = calibMap.get(mp);
      const useCalib = calib !== null && calib !== undefined && calib.dataPoints >= 3;
      const pr = useCalib ? calib!.payoutRatio : fr.payoutRatio;

      const periodStart  = cycle.last_end;
      const periodEnd    = cycle.next_period_end;
      const depositEst   = cycle.next_deposit_est;
      const daysUntilDeposit = Math.ceil((new Date(depositEst + "T12:00:00").getTime() - today.getTime()) / 86400000);
      const daysElapsed = Math.ceil((today.getTime() - new Date(periodStart + "T12:00:00").getTime()) / 86400000);

      const CYCLE_DAYS = 14;
      const safeElapsed = Math.max(1, Math.min(CYCLE_DAYS, daysElapsed));
      const cycleCompletionPct = r1((safeElapsed / CYCLE_DAYS) * 100);
      const cycleDaysRemaining = Math.max(0, CYCLE_DAYS - safeElapsed);
      const dailyRunRate = currentGross / safeElapsed;

      const histNet = histNetMap.get(mp);
      const hn1 = Math.max(0, Number(histNet?.net_c1 ?? 0));
      const hn2 = Math.max(0, Number(histNet?.net_c2 ?? 0));
      const hn3 = Math.max(0, Number(histNet?.net_c3 ?? 0));
      const histCycles = [hn1, hn2, hn3].filter(n => n > 0);
      let histAvgNet: number;
      if (histCycles.length >= 3) {
        histAvgNet = (hn1 * 3 + hn2 * 2 + hn3 * 1) / 6;
      } else if (histCycles.length === 2) {
        histAvgNet = (hn1 * 2 + hn2 * 1) / 3;
      } else if (histCycles.length === 1) {
        histAvgNet = hn1;
      } else {
        histAvgNet = (totalGross + dailyRunRate * cycleDaysRemaining) * pr;
      }
      const projectedNet   = r2(histAvgNet);
      const projectedGross = r2(histAvgNet / Math.max(0.001, pr));
      const projectedFees  = r2(projectedGross - projectedNet);

      const estNet = r2(totalGross * pr);

      const feeRatio = (calibField: number | undefined, rawField: number) =>
        r2(projectedGross * (useCalib && calibField !== undefined ? calibField : Number(rawField)));

      const estCommission = feeRatio(calib?.rCommission, fr.rCommission);
      const estFba        = feeRatio(calib?.rFba,        fr.rFba);
      const estAds = useCalib && calib!.avgAdsPerSett > 0
        ? r2(calib!.avgAdsPerSett)
        : feeRatio(calib?.rAds, fr.rAds);
      const estAdsVat     = feeRatio(calib?.rAdsVat,     fr.rAdsVat);
      const estDsf        = feeRatio(calib?.rDsf,        fr.rDsf);
      const estStorage    = r2(useCalib && calib?.avgStoragePerSett ? calib!.avgStoragePerSett : fr.avgStoragePerSett);
      const estInbound    = feeRatio(calib?.rInbound,    fr.rInbound);
      const estPrep       = feeRatio(calib?.rPrep,       fr.rPrep);
      const estRefunds = useCalib && calib!.rRefundsSmoothed > 0
        ? r2(projectedGross * calib!.rRefundsSmoothed)
        : feeRatio(calib?.rRefunds, fr.rRefunds);
      const estOther      = feeRatio(calib?.rOther,      fr.rOther);
      const estReimb      = feeRatio(calib?.rReimb,      fr.rReimb);

      const estTotalFees = r2(projectedGross - projectedNet);

      const lastEndDate  = new Date(cycle.last_end  + "T12:00:00");
      const nextEndDate  = new Date(cycle.next_period_end + "T12:00:00");
      const captureStartDate = new Date(lastEndDate);
      captureStartDate.setDate(captureStartDate.getDate() - 8);
      const captureEndDate   = new Date(nextEndDate);
      captureEndDate.setDate(captureEndDate.getDate() - 9);

      const captureStartStr = captureStartDate.toISOString().split("T")[0];
      const captureEndStr   = captureEndDate.toISOString().split("T")[0];
      const captureWindowDays   = Math.round((captureEndDate.getTime() - captureStartDate.getTime()) / 86400000) + 1;
      const captureElapsedDays  = Math.min(captureWindowDays, Math.max(0,
        Math.round((today.getTime() - captureStartDate.getTime()) / 86400000) + 1));
      const captureDaysRemaining = Math.max(0, captureWindowDays - captureElapsedDays);
      const captureCompletionPct = r1(Math.min(100, Math.max(5,
        (captureElapsedDays / captureWindowDays) * 100)));

      const scenarioPessimistic = r2(Math.min(...histCycles));
      const scenarioRealistic   = projectedNet;
      const scenarioOptimistic  = r2(Math.max(...histCycles));
      const rangeMin            = scenarioPessimistic;
      const rangeMax            = scenarioOptimistic;

      const histVariance = histCycles.length >= 2
        ? (Math.max(...histCycles) - Math.min(...histCycles)) / Math.max(1, histAvgNet)
        : 0.35;
      const confidence = r1(Math.min(94, Math.max(22,
        cycleCompletionPct * Math.max(0.45, 1 - histVariance * 0.6)
      )));

      const split = payableSplitMap.get(mp);
      const payableGrossAO    = r2(Number(split?.payable_gross    ?? 0));
      const borderlineGrossAO = r2(Number(split?.borderline_gross ?? 0));
      const deferredGrossAO   = r2(Number(split?.deferred_gross   ?? 0));
      const payableOrdersAO   = Number(split?.payable_orders   ?? 0);
      const deferredOrdersAO  = Number(split?.deferred_orders  ?? 0);
      const aoCurrentTotal = payableGrossAO + borderlineGrossAO + deferredGrossAO;
      const deferredFrac = aoCurrentTotal > 0 ? deferredGrossAO / aoCurrentTotal : 0.5;
      const estDeferredNet = r2(projectedGross * deferredFrac * pr);

      return {
        marketplace: mp,
        currentPeriodOrders:  Number(row.current_orders),
        stragglerOrders:      Number(row.straggler_orders),
        totalOrders,
        currentPeriodGross:  r2(currentGross),
        stragglerGross:      r2(stragglerGross),
        totalGross:          r2(totalGross),
        estNetPayout:   estNet,
        projectedNet,
        projectedGross,
        projectedFees,
        cycleCompletionPct,
        cycleDaysRemaining,
        dailyRunRate:   r2(dailyRunRate),
        estTotalFees,
        payoutRatioPct: r1(pr * 100),
        feeBreakdown: {
          commission:   estCommission,  commissionPct: r1(fr.rCommission * 100),
          fbaFee:       estFba,         fbaPct:        r1(fr.rFba * 100),
          adsCost:      estAds,         adsPct:        r1(fr.rAds * 100),
          adsVat:       estAdsVat,
          dsf:          estDsf,
          storage:      estStorage,
          inbound:      estInbound,
          prep:         estPrep,
          refunds:      estRefunds,
          otherCharges: estOther,
          reimbursements: estReimb,
        },
        historicalGross:  r2(fr.grossSales),
        historicalPayout: r2(fr.realPayout),
        nSettlements:     fr.nSett,
        periodStart,
        periodEnd,
        depositEst,
        daysElapsed,
        daysUntilDeposit,
        captureStart:          captureStartStr,
        captureEnd:            captureEndStr,
        captureWindowDays,
        captureElapsedDays,
        captureDaysRemaining,
        captureCompletionPct,
        confidencePct: captureCompletionPct,
        rangeMin,
        rangeMax,
        confidence,
        scenarioPessimistic,
        scenarioRealistic,
        scenarioOptimistic,
        payableGrossAO,
        deferredGrossAO,
        borderlineGrossAO,
        payableOrdersAO,
        deferredOrdersAO,
        estDeferredNet,
        payableCutoffDate: captureEndStr,
        calibrated:            useCalib,
        calibDataPoints:       useCalib ? calib!.dataPoints : 0,
        calibConfidenceScore:  useCalib ? calib!.confidenceScore : null,
        calibAvgErrorPct:      useCalib ? calib!.avgForecastErrorPct : null,
        componentBreakdown: useCalib ? computeComponentBreakdown(
          calib!,
          totalGross,
          openUnitsMap.get(mp) ?? 0,
          prevSettGrossMap.get(mp) ?? 0,
          captureWindowDays,
          estNet,
        ) : null,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    // ── 5. Save forecast snapshots for later reconciliation ────────────────────
    Promise.all(
      byMarketplace.map(mp =>
        saveForecastSnapshot(
          mp.marketplace,
          mp.periodStart,
          mp.periodEnd,
          mp.depositEst,
          mp.totalGross,
          mp.estNetPayout,
          mp.estTotalFees,
          mp.payoutRatioPct,
          mp.totalOrders,
        ).catch(err => console.warn(`[Forecast] saveForecastSnapshot(${mp.marketplace}):`, err))
      )
    );

    const totals = {
      totalOrders:       byMarketplace.reduce((s, r) => s + r.totalOrders, 0),
      totalGross:        r2(byMarketplace.reduce((s, r) => s + r.totalGross, 0)),
      totalEstFees:      r2(byMarketplace.reduce((s, r) => s + r.estTotalFees, 0)),
      totalEstNet:       r2(byMarketplace.reduce((s, r) => s + r.estNetPayout, 0)),
      totalProjectedNet: r2(byMarketplace.reduce((s, r) => s + r.projectedNet, 0)),
      totalProjectedGross: r2(byMarketplace.reduce((s, r) => s + r.projectedGross, 0)),
      avgCycleCompletionPct: r1(
        byMarketplace.length > 0
          ? byMarketplace.reduce((s, r) => s + r.cycleCompletionPct, 0) / byMarketplace.length
          : 0
      ),
      totalRangeMin:             r2(byMarketplace.reduce((s, r) => s + r.rangeMin, 0)),
      totalRangeMax:             r2(byMarketplace.reduce((s, r) => s + r.rangeMax, 0)),
      totalScenarioPessimistic:  r2(byMarketplace.reduce((s, r) => s + r.scenarioPessimistic, 0)),
      totalScenarioOptimistic:   r2(byMarketplace.reduce((s, r) => s + r.scenarioOptimistic, 0)),
      avgConfidence: r1(
        byMarketplace.length > 0
          ? byMarketplace.reduce((s, r) => s + r.confidence * r.projectedNet, 0)
            / Math.max(1, byMarketplace.reduce((s, r) => s + r.projectedNet, 0))
          : 0
      ),
      totalEstDeferredNet: r2(byMarketplace.reduce((s, r) => s + r.estDeferredNet, 0)),
    };

    const itCycle = cycleMap.get("IT");

    res.json({
      byMarketplace,
      totals,
      cycle: itCycle ? {
        lastSettlementEnd:  itCycle.last_end,
        lastDepositDate:    itCycle.last_deposit,
        nextPeriodEnd:      itCycle.next_period_end,
        nextDepositEst:     itCycle.next_deposit_est,
        daysUntilDeposit:   Math.ceil((new Date(itCycle.next_deposit_est + "T12:00:00").getTime() - today.getTime()) / 86400000),
        captureStart:       byMarketplace.find(r => r.marketplace === "IT")?.captureStart ?? "",
        captureEnd:         byMarketplace.find(r => r.marketplace === "IT")?.captureEnd ?? "",
        captureWindowDays:  byMarketplace.find(r => r.marketplace === "IT")?.captureWindowDays ?? 14,
        captureElapsedDays: byMarketplace.find(r => r.marketplace === "IT")?.captureElapsedDays ?? 0,
        captureDaysRemaining: byMarketplace.find(r => r.marketplace === "IT")?.captureDaysRemaining ?? 0,
        captureCompletionPct: byMarketplace.find(r => r.marketplace === "IT")?.captureCompletionPct ?? 0,
      } : null,
      additionalEU: additionalSettlRows.map(r => {
        const n1 = Math.max(0, Number(r.net_c1 ?? 0));
        const n2 = Math.max(0, Number(r.net_c2 ?? 0));
        const n3 = Math.max(0, Number(r.net_c3 ?? 0));
        const cycles = [n1, n2, n3].filter(n => n > 0);
        const avgNet = cycles.length >= 3 ? (n1*3 + n2*2 + n3) / 6
          : cycles.length === 2 ? (n1*2 + n2) / 3 : n1;
        const daysToDeposit = r.next_deposit_est
          ? Math.ceil((new Date(r.next_deposit_est + "T12:00:00").getTime() - today.getTime()) / 86400000) : null;
        return {
          marketplace: r.marketplace,
          currency: r.currency,
          avgHistoricalNet: r2(avgNet),
          lastCycleNet: r2(n1),
          lastEnd: r.last_end,
          lastDeposit: r.last_deposit,
          nextDepositEst: r.next_deposit_est,
          daysUntilDeposit: daysToDeposit,
        };
      }),
      note: "Net forecast uses proven payout ratio (net_bank_transfer / gross_principal) verified against real transfers. projectedNet uses history-weighted average of last 3 settlement bank transfers — more accurate than linear extrapolation from partial order data. Fee breakdown uses per-fee historical ratios for itemisation.",
    });
  } catch (err) {
    console.error("[Amazon] GET /payments/forecast:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /forecast/calibration ─────────────────────────────────────────────────
forecastRouter.get("/forecast/calibration", async (_req: Request, res: Response) => {
  try {
    const status = await getCalibrationStatus();
    res.json(status);
  } catch (err) {
    console.error("[Amazon] GET /forecast/calibration:", err);
    res.status(500).json({ error: String(err) });
  }
});
