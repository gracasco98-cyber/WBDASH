/**
 * component-breakdown.service.ts
 *
 * Causal component breakdown model:
 *  - computeComponentBreakdown — pure fee-waterfall calculation (no DB)
 *  - computeComponentParameters — DB: compute FBA/unit, refund lag, PPC averages
 *  - bootstrapComponentModel    — run computeComponentParameters for all marketplaces
 *  - getCalibrationStatus       — read status overview for all marketplaces
 */

import type { CalibrationRatios } from "./calibration-update.service";
import { prisma } from "../../db";
import {
  updateCalibrationComponents,
  findAllCalibrations,
} from "../../repositories/amazon/forecast.repo";

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKETPLACES_ALL = ["IT", "DE", "ES", "FR", "PL", "NL", "SE", "UK"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComponentBreakdown {
  gross: number;
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  inboundFees: number;
  dsfFees: number;
  otherFees: number;
  refunds: number;
  ppcSpend: number;
  reimbursements: number;
  net: number;
  // CI
  ciMin: number;
  ciMax: number;
  confidence: number;
  // Meta
  topDrivers: string[];
  modelVersion: "causal_v2" | "ratio_fallback";
}

// ─── Component breakdown (pure function — no DB access) ───────────────────────

export function computeComponentBreakdown(
  calib: CalibrationRatios,
  gross: number,
  units: number,
  prevSettlementGross: number,  // gross from previous (already settled) period
  settlementDays: number,        // ~14
  anchorNet?: number,            // EWMA-calibrated net total (used as anchor for scaling)
): ComponentBreakdown {
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // ── Step 1: Raw component estimates (causal model) ─────────────────────────

  // Referral fees: ratio of gross (stable, doesn't scale with units)
  const rawReferral = gross * calib.rCommission;

  // FBA fees: per-unit model when data available, else ratio fallback
  const rawFba = calib.avgFbaPerUnit > 0 && units > 0
    ? units * calib.avgFbaPerUnit
    : gross * calib.rFba;

  // Storage: fixed per settlement period (not scaled — absolute amount)
  const storageFees = r2(calib.avgStoragePerSett);

  // Inbound: fixed per settlement period (not scaled — absolute amount)
  const inboundFees = r2(calib.avgInboundPerSett);

  // DSF (Digital Services Fee): ratio
  const rawDsf = gross * calib.rDsf;

  // Other fees: ratio
  const rawOther = gross * calib.rOther;

  // Refunds: lag model — refunds in this settlement come mostly from PREVIOUS period's orders
  // Lag of ~21-25 days means current period orders won't refund until NEXT settlement
  const refundBase = prevSettlementGross > 0 ? prevSettlementGross : gross;
  const rawRefunds = refundBase * calib.rRefundsSmoothed;

  // PPC: use 7d trend (most recent), else 30d, else fallback to avgAdsPerSett / 14
  const ppcDaily = calib.ppcDailyAvg7d > 0 ? calib.ppcDailyAvg7d
    : calib.ppcDailyAvg30d > 0 ? calib.ppcDailyAvg30d
    : (calib.avgAdsPerSett / 14);
  const rawPpc = ppcDaily * settlementDays;

  // Reimbursements: ratio (positive)
  const rawReimb = gross * calib.rReimb;

  // Raw net from causal model
  const rawNet = gross - rawReferral - rawFba - storageFees - inboundFees
               - rawDsf - rawOther - rawRefunds - rawPpc + rawReimb;

  // ── Step 2: EWMA anchor scaling ────────────────────────────────────────────
  // If anchorNet is provided (EWMA-calibrated), scale all ratio-based fees proportionally
  // so that the component sum matches the EWMA total. Fixed fees (storage, inbound) stay as-is.
  // This makes the breakdown internally consistent while each component stays calibrating.

  let scale = 1.0;
  let net: number;
  if (anchorNet !== undefined && anchorNet > 0 && rawNet !== anchorNet) {
    const fixedFees = storageFees + inboundFees;
    const rawRatioBased = rawReferral + rawFba + rawDsf + rawOther + rawRefunds + rawPpc - rawReimb;
    const anchorRatioBased = (gross - anchorNet) - fixedFees;
    scale = rawRatioBased > 0 ? anchorRatioBased / rawRatioBased : 1.0;
    net = anchorNet;
  } else {
    net = r2(rawNet);
  }

  const referralFees  = r2(rawReferral * scale);
  const fbaFees       = r2(rawFba      * scale);
  const dsfFees       = r2(rawDsf      * scale);
  const otherFees     = r2(rawOther    * scale);
  const refunds       = r2(rawRefunds  * scale);
  const ppcSpend      = r2(rawPpc      * scale);
  const reimbursements = r2(rawReimb   * scale);

  // ── Step 3: Confidence interval ────────────────────────────────────────────
  const stdDev = calib.forecastStdDev > 0 ? calib.forecastStdDev : gross * 0.08;
  const ciMin = r2(net - 1.5 * stdDev);
  const ciMax = r2(net + 1.5 * stdDev);
  const confidence = Math.min(0.95, Math.max(0.20,
    calib.confidenceScore * (calib.forecastStdDev > 0 ? 1 : 0.6)
  ));

  // Top 3 drivers by magnitude
  const components = [
    { name: "Referral fees", value: referralFees },
    { name: "FBA fees", value: fbaFees },
    { name: "Storage fees", value: storageFees },
    { name: "Refunds", value: refunds },
    { name: "PPC spend", value: ppcSpend },
    { name: "DSF fees", value: dsfFees },
    { name: "Other fees", value: otherFees },
  ].filter(c => c.value > 0).sort((a, b) => b.value - a.value);
  const total = components.reduce((s, c) => s + c.value, 0);
  const topDrivers = components.slice(0, 3).map(c =>
    `${c.name} (${total > 0 ? Math.round(c.value / total * 100) : 0}%)`
  );

  const modelVersion: "causal_v2" | "ratio_fallback" =
    calib.avgFbaPerUnit > 0 || calib.ppcDailyAvg7d > 0 ? "causal_v2" : "ratio_fallback";

  return {
    gross, referralFees, fbaFees, storageFees, inboundFees, dsfFees, otherFees,
    refunds, ppcSpend, reimbursements, net,
    ciMin, ciMax, confidence, topDrivers, modelVersion,
  };
}

// ─── Compute component model parameters from DB for one marketplace ───────────

export async function computeComponentParameters(marketplace: string): Promise<void> {
  // FBA per unit: total FBA fees / total units ordered for matched transactions
  const fbaRows = await prisma.$queryRawUnsafe<{ total_fba: number; total_units: number }[]>(`
    SELECT
      SUM(ABS(t.amount))::FLOAT8 AS total_fba,
      SUM(oi."quantityOrdered")::FLOAT8 AS total_units
    FROM "AmazonSettlementTransaction" t
    JOIN "AmazonSettlement" s ON s."settlementId" = t."settlementId"
    JOIN "AmazonOrderItem" oi ON oi."amazonOrderId" = t."orderId"
    WHERE t."amountType" = 'FBAPerUnitFulfillmentFee'
      AND s.marketplace = '${marketplace}'
  `);
  const fb = fbaRows[0];
  const avgFbaPerUnit = fb && Number(fb.total_units) > 0
    ? Number(fb.total_fba) / Number(fb.total_units) : 0;

  // Avg units per order
  const unitsRows = await prisma.$queryRawUnsafe<{ avg_units: number }[]>(`
    SELECT AVG(oi."quantityOrdered")::FLOAT8 AS avg_units
    FROM "AmazonOrderItem" oi
    JOIN "AmazonOrder" o ON o."amazonOrderId" = oi."amazonOrderId"
    WHERE o.marketplace = '${marketplace}'
  `);
  const avgUnitsPerOrder = Number(unitsRows[0]?.avg_units ?? 1) || 1;

  // Refund lag: avg days from order purchase to refund transaction's settlement end
  const lagRows = await prisma.$queryRawUnsafe<{ avg_lag: number }[]>(`
    SELECT AVG(EXTRACT(day FROM s."endDate" - o."purchaseDate"))::FLOAT8 AS avg_lag
    FROM "AmazonSettlementTransaction" t
    JOIN "AmazonOrder" o ON o."amazonOrderId" = t."orderId"
    JOIN "AmazonSettlement" s ON s."settlementId" = t."settlementId"
    WHERE t."transactionType" = 'Refund'
      AND s.marketplace = '${marketplace}'
  `);
  const refundLagDays = Number(lagRows[0]?.avg_lag ?? 30) || 30;

  // PPC daily averages from AmazonAdSnapshot
  const ppcRows = await prisma.$queryRawUnsafe<{ avg7d: number; avg30d: number }[]>(`
    SELECT
      (SUM(CASE WHEN "snapshotDate" >= CURRENT_DATE - 7  THEN spend ELSE 0 END) /
       NULLIF(COUNT(DISTINCT CASE WHEN "snapshotDate" >= CURRENT_DATE - 7  THEN "snapshotDate" END), 0))::FLOAT8 AS avg7d,
      (SUM(CASE WHEN "snapshotDate" >= CURRENT_DATE - 30 THEN spend ELSE 0 END) /
       NULLIF(COUNT(DISTINCT CASE WHEN "snapshotDate" >= CURRENT_DATE - 30 THEN "snapshotDate" END), 0))::FLOAT8 AS avg30d
    FROM "AmazonAdSnapshot"
    WHERE marketplace = '${marketplace}'
  `);
  const ppcDailyAvg7d  = Number(ppcRows[0]?.avg7d  ?? 0) || 0;
  const ppcDailyAvg30d = Number(ppcRows[0]?.avg30d ?? 0) || 0;

  const updated = await updateCalibrationComponents(prisma, marketplace, {
    avgFbaPerUnit, avgUnitsPerOrder, refundLagDays, ppcDailyAvg7d, ppcDailyAvg30d,
  });

  if (updated.count > 0) {
    console.log(`[Calibration] ${marketplace}: component model updated — FBA/unit=€${avgFbaPerUnit.toFixed(2)}, refundLag=${refundLagDays.toFixed(0)}d, PPC/d=€${ppcDailyAvg7d.toFixed(0)}`);
  }
}

// ─── Bootstrap component model for all marketplaces ──────────────────────────

export async function bootstrapComponentModel(marketplaces = MARKETPLACES_ALL): Promise<void> {
  console.log("[Calibration] Computing component model parameters…");
  await Promise.all(marketplaces.map(mp =>
    computeComponentParameters(mp).catch(err =>
      console.warn(`[Calibration] computeComponentParameters(${mp}):`, err)
    )
  ));
}

// ─── Calibration status overview ─────────────────────────────────────────────

export async function getCalibrationStatus(): Promise<object[]> {
  const recs = await findAllCalibrations(prisma);

  return recs.map(r => ({
    marketplace:         r.marketplace,
    payoutRatioPct:      Math.round(r.payoutRatio * 1000) / 10,
    dataPoints:          r.dataPoints,
    confidenceScore:     r.confidenceScore,
    avgForecastErrorPct: r.avgForecastErrorPct,
    bestForecastErrorPct: r.bestForecastErrorPct,
    hasBias:             r.hasBias,
    biasCorrection:      r.biasCorrection,
    structuralBreakAt:   r.structuralBreakAt,
    seasonalMonths:      Object.keys((r.seasonalFactors as Record<string,number> | null) ?? {}),
    bootstrapSource:     r.bootstrapSource,
    lastUpdatedAt:       r.lastUpdatedAt,
    avgAdsPerSett:       Math.round(r.avgAdsPerSett * 100) / 100,
  }));
}
