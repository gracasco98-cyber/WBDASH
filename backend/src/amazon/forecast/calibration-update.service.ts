/**
 * calibration-update.service.ts
 *
 * EWMA calibration update logic:
 *  - bootstrapCalibration — seed calibration from DB settlement history
 *  - updateCalibrationFromActual — update EWMA from one settled period
 *  - getCalibration — read back calibrated ratios (with all corrections applied)
 *  - getCalibrationStatus — status overview for all marketplaces
 *  - runDailyCalibration — orchestrator for the 2 AM cron job
 *
 * Depends on:
 *  - bias-detection.service (pure: detectBias, detectStructuralBreak, decayPostBreakAlpha)
 *  - seasonality.service     (pure: getSeasonalFactor, buildSeasonalFactors, updateSeasonalFactor)
 *  - forecast.repo           (DB reads/writes)
 */

import { prisma } from "../../db";
import { getCurrentAccountId } from "../../context/account-context";
import {
  findCalibrationByMarketplace,
  updateCalibrationRecord,
  upsertCalibration,
} from "../../repositories/amazon/forecast.repo";
import {
  detectBias,
  detectStructuralBreak,
  decayPostBreakAlpha,
  RECENT_HISTORY_SIZE,
  calcAlpha,
  ewma,
} from "./bias-detection.service";
import {
  getSeasonalFactor,
  buildSeasonalFactors,
  updateSeasonalFactor,
  SLOW_EWMA_FACTOR,
  type SettlementForSeasonality,
} from "./seasonality.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKETPLACES_ALL = ["IT", "DE", "ES", "FR", "PL", "NL", "SE", "UK"];

// ─── Types (re-exported for callers) ─────────────────────────────────────────

export interface CalibrationRatios {
  payoutRatio: number;       // adjusted for seasonality + bias
  rCommission: number; rFba: number; rAds: number; rAdsVat: number;
  rDsf: number; rStorage: number; rInbound: number; rPrep: number;
  rRefunds: number; rOther: number; rReimb: number;
  avgStoragePerSett: number; avgInboundPerSett: number;
  avgAdsPerSett: number;       // absolute EUR PPC per settlement (use this for ads cost)
  rRefundsSmoothed: number;    // slower EWMA refund ratio
  dataPoints: number;
  confidenceScore: number;
  avgForecastErrorPct: number | null;
  hasBias: boolean;
  biasCorrection: number;
  seasonalFactor: number;      // current-month multiplier (1.0 = neutral)
  // Component model fields
  avgFbaPerUnit: number;
  avgUnitsPerOrder: number;
  refundLagDays: number;
  ppcDailyAvg7d: number;
  ppcDailyAvg30d: number;
  forecastStdDev: number;
}

// ─── Confidence score ─────────────────────────────────────────────────────────

export function calcConfidence(dataPoints: number, avgError: number | null): number {
  const dpScore  = Math.min(1, dataPoints / 20);
  const errScore = avgError === null ? 0.5 : Math.max(0, 1 - avgError / 30);
  return Math.round((dpScore * 0.6 + errScore * 0.4) * 100) / 100;
}

// Re-export for callers that imported these from calibration-update previously
export { calcAlpha, ewma } from "./bias-detection.service";

// ─── Internal type for raw settlement ratios ─────────────────────────────────

interface SettlementRatios extends SettlementForSeasonality {
  marketplace: string;
  gross: number; realPayout: number;
  rCommission: number; rFba: number; rAds: number; rAdsVat: number;
  rDsf: number; rStorage: number; rInbound: number; rPrep: number;
  rRefunds: number; rOther: number; rReimb: number;
  storageAmt: number; inboundAmt: number;
  adsAbs: number;
}

// ─── Compute per-settlement ratios from DB ────────────────────────────────────

async function computeSettlementRatios(marketplace: string, lastN = 30): Promise<SettlementRatios[]> {
  const amazonAccountId = getCurrentAccountId();
  const rows = await prisma.$queryRawUnsafe<{
    settlement_id: string;
    settlement_date: string;
    real_payout: number; gross: number; commission: number; fba: number;
    ads: number; ads_vat: number; dsf: number; storage: number;
    inbound: number; prep: number; refunds: number; other: number; reimb: number;
  }[]>(`
    SELECT
      s."settlementId" AS settlement_id,
      s."endDate"::date::text AS settlement_date,
      s."totalAmount"::FLOAT8 AS real_payout,
      SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END)::FLOAT8 AS gross,
      ABS(SUM(CASE WHEN t."amountType"='Commission'                         THEN t.amount ELSE 0 END))::FLOAT8 AS commission,
      ABS(SUM(CASE WHEN t."amountType"='FBAPerUnitFulfillmentFee'           THEN t.amount ELSE 0 END))::FLOAT8 AS fba,
      ABS(SUM(CASE WHEN t."amountType"='Cost of Advertising'                THEN t.amount ELSE 0 END))::FLOAT8 AS ads,
      ABS(SUM(CASE WHEN t."amountType"='TaxAmount' AND t."transactionType"='ServiceFee' THEN t.amount ELSE 0 END))::FLOAT8 AS ads_vat,
      ABS(SUM(CASE WHEN t."amountType"='DigitalServicesFee'                 THEN t.amount ELSE 0 END))::FLOAT8 AS dsf,
      ABS(SUM(CASE WHEN t."transactionType" IN ('Storage Fee','StorageRenewalBilling') THEN t.amount ELSE 0 END))::FLOAT8 AS storage,
      ABS(SUM(CASE WHEN t."transactionType"='Inbound Transportation Fee'    THEN t.amount ELSE 0 END))::FLOAT8 AS inbound,
      ABS(SUM(CASE WHEN t."transactionType" IN ('WarehousePrep','RemovalComplete','DisposalComplete') THEN t.amount ELSE 0 END))::FLOAT8 AS prep,
      ABS(SUM(CASE WHEN t."transactionType"='Refund'                        THEN t.amount ELSE 0 END))::FLOAT8 AS refunds,
      ABS(SUM(CASE WHEN t."amountType"='OtherAmount'
          AND t."transactionType" NOT IN ('Storage Fee','StorageRenewalBilling','WarehousePrep','RemovalComplete',
            'DisposalComplete','Inbound Transportation Fee','Current Reserve Amount',
            'Previous Reserve Amount Balance','REVERSAL_REIMBURSEMENT','WAREHOUSE_LOST',
            'WAREHOUSE_DAMAGE','MISSING_FROM_INBOUND') THEN t.amount ELSE 0 END))::FLOAT8 AS other,
      SUM(CASE WHEN t."amountType"='OtherAmount'
          AND t."transactionType" IN ('REVERSAL_REIMBURSEMENT','WAREHOUSE_LOST','WAREHOUSE_DAMAGE','MISSING_FROM_INBOUND')
          THEN t.amount ELSE 0 END)::FLOAT8 AS reimb
    FROM "AmazonSettlement" s
    JOIN "AmazonSettlementTransaction" t ON t."settlementId" = s."settlementId" AND t."amazonAccountId" = s."amazonAccountId"
    WHERE s.marketplace = '${marketplace}' AND s."amazonAccountId" = '${amazonAccountId}'
    GROUP BY s."settlementId", s."endDate", s."totalAmount"
    ORDER BY s."endDate" ASC
    LIMIT ${lastN}
  `);

  return rows
    .filter(r => r.gross > 0 && r.real_payout > 0)
    .map(r => ({
      marketplace,
      settlementDate: r.settlement_date,
      gross:         Number(r.gross),
      realPayout:    Number(r.real_payout),
      payoutRatio:   Number(r.real_payout) / Number(r.gross),
      rCommission:   Number(r.commission)  / Number(r.gross),
      rFba:          Number(r.fba)         / Number(r.gross),
      rAds:          Number(r.ads)         / Number(r.gross),
      rAdsVat:       Number(r.ads_vat)     / Number(r.gross),
      rDsf:          Number(r.dsf)         / Number(r.gross),
      rStorage:      Number(r.storage)     / Number(r.gross),
      rInbound:      Number(r.inbound)     / Number(r.gross),
      rPrep:         Number(r.prep)        / Number(r.gross),
      rRefunds:      Number(r.refunds)     / Number(r.gross),
      rOther:        Number(r.other)       / Number(r.gross),
      rReimb:        Number(r.reimb)       / Number(r.gross),
      storageAmt:    Number(r.storage),
      inboundAmt:    Number(r.inbound),
      adsAbs:        Number(r.ads),
    }));
}

// ─── Bootstrap calibration from DB settlements ───────────────────────────────

export async function bootstrapCalibration(
  marketplaces = MARKETPLACES_ALL
): Promise<void> {
  console.log("[Calibration] Starting bootstrap from DB settlements…");

  for (const mp of marketplaces) {
    const settlements = await computeSettlementRatios(mp, 30);
    if (settlements.length === 0) {
      console.log(`[Calibration] ${mp}: no settlements, skipping`);
      continue;
    }

    // Build seasonal factors from full history (before EWMA)
    const seasonalFactors = buildSeasonalFactors(settlements);

    // EWMA from oldest → newest
    let pr          = settlements[0].payoutRatio;
    let rCommission = settlements[0].rCommission;
    let rFba        = settlements[0].rFba;
    let rAds        = settlements[0].rAds;
    let rAdsVat     = settlements[0].rAdsVat;
    let rDsf        = settlements[0].rDsf;
    let rStorage    = settlements[0].rStorage;
    let rInbound    = settlements[0].rInbound;
    let rPrep       = settlements[0].rPrep;
    let rRefunds    = settlements[0].rRefunds;
    let rOther      = settlements[0].rOther;
    let rReimb      = settlements[0].rReimb;
    let storageAmt  = settlements[0].storageAmt;
    let inboundAmt  = settlements[0].inboundAmt;
    let adsAbs      = settlements[0].adsAbs;
    // Refund smoothed starts same as rRefunds but updates slower
    let rRefundsSmoothed = settlements[0].rRefunds;
    const recentRatios: number[] = [settlements[0].payoutRatio];

    for (let i = 1; i < settlements.length; i++) {
      const sett  = settlements[i];
      const alpha = calcAlpha(i);
      const alphaSlow = Math.max(0.04, alpha * SLOW_EWMA_FACTOR);

      pr           = ewma(pr,          sett.payoutRatio,  alpha);
      rCommission  = ewma(rCommission, sett.rCommission,  alpha);
      rFba         = ewma(rFba,        sett.rFba,         alpha);
      rAds         = ewma(rAds,        sett.rAds,         alpha);
      rAdsVat      = ewma(rAdsVat,     sett.rAdsVat,      alpha);
      rDsf         = ewma(rDsf,        sett.rDsf,         alpha);
      rStorage     = ewma(rStorage,    sett.rStorage,     alpha);
      rInbound     = ewma(rInbound,    sett.rInbound,     alpha);
      rPrep        = ewma(rPrep,       sett.rPrep,        alpha);
      rRefunds     = ewma(rRefunds,    sett.rRefunds,     alpha);
      rOther       = ewma(rOther,      sett.rOther,       alpha);
      rReimb       = ewma(rReimb,      sett.rReimb,       alpha);
      storageAmt   = ewma(storageAmt,  sett.storageAmt,   alpha);
      inboundAmt   = ewma(inboundAmt,  sett.inboundAmt,   alpha);
      adsAbs       = ewma(adsAbs,      sett.adsAbs,       alpha);
      rRefundsSmoothed = ewma(rRefundsSmoothed, sett.rRefunds, alphaSlow);

      if (recentRatios.length >= RECENT_HISTORY_SIZE) recentRatios.shift();
      recentRatios.push(sett.payoutRatio);
    }

    const dp = settlements.length;
    const finalAlpha = calcAlpha(dp);

    await upsertCalibration(
      prisma,
      mp,
      {
        marketplace: mp,
        payoutRatio: pr, rCommission, rFba, rAds, rAdsVat, rDsf,
        rStorage, rInbound, rPrep, rRefunds, rOther, rReimb,
        avgStoragePerSett: storageAmt, avgInboundPerSett: inboundAmt,
        avgAdsPerSett: adsAbs, rRefundsSmoothed,
        dataPoints: dp, ewmaAlpha: finalAlpha,
        recentRatios, recentErrors: [],
        seasonalFactors: seasonalFactors as object,
        bootstrapSource: "db_settlements",
      },
      {
        payoutRatio: pr, rCommission, rFba, rAds, rAdsVat, rDsf,
        rStorage, rInbound, rPrep, rRefunds, rOther, rReimb,
        avgStoragePerSett: storageAmt, avgInboundPerSett: inboundAmt,
        avgAdsPerSett: adsAbs, rRefundsSmoothed,
        dataPoints: dp, ewmaAlpha: finalAlpha,
        recentRatios, recentErrors: [],
        hasBias: false, biasCorrection: 0,
        postBreakAlpha: null,
        seasonalFactors: seasonalFactors as object,
        bootstrapSource: "db_settlements",
        lastUpdatedAt: new Date(),
      }
    );

    console.log(`[Calibration] ${mp}: calibrated from ${dp} settlements → payoutRatio=${(pr*100).toFixed(1)}% α=${finalAlpha.toFixed(2)}`);
  }
}

// ─── Read calibrated ratios (with all corrections applied) ───────────────────

export async function getCalibration(marketplace: string): Promise<CalibrationRatios | null> {
  const rec = await findCalibrationByMarketplace(prisma, marketplace);
  if (!rec || rec.dataPoints === 0) return null;

  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");
  const seasonal = rec.seasonalFactors as Record<string, number> | null;
  const seasonalFactor = getSeasonalFactor(seasonal, currentMonth);

  // Apply bias correction (50% damping to avoid over-correction)
  const biasAdjFactor = rec.hasBias ? (1 - rec.biasCorrection / 100 * 0.5) : 1.0;

  const adjustedPayoutRatio = rec.payoutRatio * seasonalFactor * biasAdjFactor;

  return {
    payoutRatio:        adjustedPayoutRatio,
    rCommission:        rec.rCommission,
    rFba:               rec.rFba,
    rAds:               rec.rAds,
    rAdsVat:            rec.rAdsVat,
    rDsf:               rec.rDsf,
    rStorage:           rec.rStorage,
    rInbound:           rec.rInbound,
    rPrep:              rec.rPrep,
    rRefunds:           rec.rRefunds,
    rOther:             rec.rOther,
    rReimb:             rec.rReimb,
    avgStoragePerSett:  rec.avgStoragePerSett,
    avgInboundPerSett:  rec.avgInboundPerSett,
    avgAdsPerSett:      rec.avgAdsPerSett,
    rRefundsSmoothed:   rec.rRefundsSmoothed,
    dataPoints:         rec.dataPoints,
    confidenceScore:    rec.confidenceScore,
    avgForecastErrorPct: rec.avgForecastErrorPct,
    hasBias:            rec.hasBias,
    biasCorrection:     rec.biasCorrection,
    seasonalFactor,
    avgFbaPerUnit:     rec.avgFbaPerUnit,
    avgUnitsPerOrder:  rec.avgUnitsPerOrder,
    refundLagDays:     rec.refundLagDays,
    ppcDailyAvg7d:     rec.ppcDailyAvg7d,
    ppcDailyAvg30d:    rec.ppcDailyAvg30d,
    forecastStdDev:    rec.forecastStdDev,
  };
}

// ─── Update calibration from one actual settlement ────────────────────────────

export async function updateCalibrationFromActual(
  marketplace: string,
  forecastGross: number,
  actualNet: number,
  signedErrorPct: number,     // positive = over-estimated, negative = under-estimated
  opts: {
    actualGross?: number;
    actualAdsAbs?: number;
    actualRatio?: number;     // actualNet / actualGross
    settlementMonth?: string; // "01"–"12"
    newRCommission?: number; newRFba?: number; newRRefunds?: number;
  } = {}
): Promise<void> {
  const rec = await findCalibrationByMarketplace(prisma, marketplace);
  if (!rec) return;

  const dp    = rec.dataPoints + 1;
  let alpha   = rec.postBreakAlpha !== null && rec.postBreakAlpha !== undefined
    ? Math.max(calcAlpha(dp), rec.postBreakAlpha)
    : calcAlpha(dp);
  const alphaSlow = Math.max(0.04, alpha * SLOW_EWMA_FACTOR);

  // Absolute error for accuracy tracking
  const absError = Math.abs(signedErrorPct);
  const absErrEur = Math.abs(actualNet * signedErrorPct / 100);
  const newForecastStdDev = rec.forecastStdDev > 0
    ? rec.forecastStdDev * 0.7 + absErrEur * 0.3
    : absErrEur;
  const avgErr   = rec.avgForecastErrorPct === null
    ? absError
    : rec.avgForecastErrorPct * 0.7 + absError * 0.3;
  const bestErr  = rec.bestForecastErrorPct === null
    ? absError
    : Math.min(rec.bestForecastErrorPct, absError);

  // Recent errors history (for bias detection)
  const recentErrors: number[] = (rec.recentErrors as number[] | null) ?? [];
  recentErrors.push(signedErrorPct);
  if (recentErrors.length > RECENT_HISTORY_SIZE) recentErrors.shift();

  // Bias detection
  const { hasBias, correction: biasCorrection } = detectBias(recentErrors);

  // Recent ratios history (for structural break detection)
  const recentRatios: number[] = (rec.recentRatios as number[] | null) ?? [];
  let structuralBreakAt: Date | null = rec.structuralBreakAt ?? null;
  let postBreakAlpha: number | null = null;

  const actualRatio = opts.actualRatio ?? (opts.actualGross && opts.actualGross > 0
    ? actualNet / opts.actualGross
    : null);

  if (actualRatio !== null) {
    // Structural break detection
    const { isBreak, postBreakAlpha: boostedAlpha } = detectStructuralBreak(
      actualRatio,
      rec.payoutRatio,
      alpha,
      dp,
    );

    if (isBreak && boostedAlpha !== null) {
      console.log(`[Calibration] ${marketplace}: structural break detected (ratio ${(rec.payoutRatio*100).toFixed(1)}% → ${(actualRatio*100).toFixed(1)}%)`);
      structuralBreakAt = new Date();
      postBreakAlpha    = boostedAlpha;
      alpha             = boostedAlpha; // use boosted alpha for this update
    }

    recentRatios.push(actualRatio);
    if (recentRatios.length > RECENT_HISTORY_SIZE) recentRatios.shift();
  }

  // Decay postBreakAlpha for next update
  if (postBreakAlpha !== null) {
    postBreakAlpha = decayPostBreakAlpha(postBreakAlpha, calcAlpha(dp));
  }

  // EWMA updates for fee ratios (when available from actual settlement)
  const newPayoutRatio = actualRatio !== null
    ? ewma(rec.payoutRatio, actualRatio, alpha)
    : rec.payoutRatio;

  const newRCommission = opts.newRCommission !== undefined
    ? ewma(rec.rCommission, opts.newRCommission, alpha)
    : rec.rCommission;
  const newRFba = opts.newRFba !== undefined
    ? ewma(rec.rFba, opts.newRFba, alpha)
    : rec.rFba;
  const newRRefunds = opts.newRRefunds !== undefined
    ? ewma(rec.rRefunds, opts.newRRefunds, alpha)
    : rec.rRefunds;
  const newRRefundsSmoothed = opts.newRRefunds !== undefined
    ? ewma(rec.rRefundsSmoothed, opts.newRRefunds, alphaSlow)
    : rec.rRefundsSmoothed;

  const newAvgAdsPerSett = opts.actualAdsAbs !== undefined
    ? ewma(rec.avgAdsPerSett, opts.actualAdsAbs, alpha)
    : rec.avgAdsPerSett;

  // Seasonal factor update for this settlement's month
  let seasonalRaw = (rec.seasonalFactors as Record<string, number> | null) ?? {};
  if (opts.settlementMonth && actualRatio !== null) {
    seasonalRaw = updateSeasonalFactor(seasonalRaw, opts.settlementMonth, actualRatio, rec.payoutRatio);
  }

  await updateCalibrationRecord(prisma, marketplace, {
    payoutRatio:         newPayoutRatio,
    rCommission:         newRCommission,
    rFba:                newRFba,
    rRefunds:            newRRefunds,
    rRefundsSmoothed:    newRRefundsSmoothed,
    avgAdsPerSett:       newAvgAdsPerSett,
    dataPoints:          dp,
    ewmaAlpha:           calcAlpha(dp),
    lastForecastErrorPct: absError,
    avgForecastErrorPct:  avgErr,
    bestForecastErrorPct: bestErr,
    confidenceScore:      calcConfidence(dp, avgErr),
    recentErrors:         recentErrors as object,
    recentRatios:         recentRatios as object,
    hasBias,
    biasCorrection,
    structuralBreakAt,
    postBreakAlpha,
    seasonalFactors:      seasonalRaw as object,
    forecastStdDev:       newForecastStdDev,
    lastUpdatedAt:        new Date(),
  });

  console.log(`[Calibration] ${marketplace}: updated dp=${dp} ratio=${(newPayoutRatio*100).toFixed(1)}% err=${signedErrorPct.toFixed(1)}%${hasBias ? " [BIAS]" : ""}${structuralBreakAt ? " [BREAK]" : ""}`);
}

// ─── Daily calibration job (2 AM) — import lazily to avoid circular deps ──────
// This orchestrator is here because it primarily drives calibration updates.
// It calls reconcile + bootstrap + snapshot, which are in their own modules.

export async function runDailyCalibration(): Promise<void> {
  console.log("[Calibration] Running daily calibration job…");
  // Lazy imports avoid circular dependency issues at module load time
  // (forecast-snapshot imports getCalibration from this module; we import back lazily)
  const snapshotMod   = await import("./forecast-snapshot.service");
  const componentMod  = await import("./component-breakdown.service");

  await snapshotMod.reconcileForecastSnapshots();
  await bootstrapCalibration();
  await snapshotMod.bootstrapFromExcel();
  await componentMod.bootstrapComponentModel();
  await snapshotMod.computeAndSaveForecasts();
  console.log("[Calibration] Daily calibration complete");
}
