/**
 * forecast-snapshot.service.ts
 *
 * Accuracy tracking, forecast snapshot saves, reconciliation against actual
 * settlements, automatic 6h snapshot job, and Excel historical import.
 *
 * DB-heavy module — all functions interact with Prisma.
 *
 * Depends on:
 *  - calibration-update.service (getCalibration, updateCalibrationFromActual,
 *                                bootstrapCalibration — imported lazily to avoid cycles)
 *  - seasonality.service        (getMonth — pure helper)
 *  - forecast.repo + settlement.repo
 */

import * as fs from "fs";
import { prisma } from "../../db";
import {
  findCalibrationByMarketplace,
  findRecentForecastSnapshot,
  createForecastSnapshot,
  updateForecastSnapshot,
  findPendingReconciliationSnapshots,
  upsertCalibration,
} from "../../repositories/amazon/forecast.repo";
import { findSettlementNearDate } from "../../repositories/amazon/settlement.repo";
import { getMonth, buildSeasonalFactors, SLOW_EWMA_FACTOR } from "./seasonality.service";
import { calcAlpha, ewma } from "./bias-detection.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKETPLACES_ALL = ["IT", "DE", "ES", "FR", "PL", "NL", "SE", "UK"];
const EXCEL_PATH       = "/data/pagamenti-amazon.xlsx";
const RECENT_HISTORY_SIZE = 10;

// ─── Save forecast snapshot (idempotent within 24h) ──────────────────────────

export async function saveForecastSnapshot(
  marketplace: string,
  periodStart: string,
  periodEnd: string,
  depositEst: string,
  forecastGross: number,
  forecastNet: number,
  forecastFees: number,
  payoutRatioPct: number,
  totalOrders: number,
): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);

  const existing = await findRecentForecastSnapshot(prisma, { marketplace, periodEnd, cutoff });

  if (existing) {
    await updateForecastSnapshot(prisma, existing.id, {
      forecastGross, forecastNet, forecastFees, payoutRatioPct, totalOrders, snapshotDate: new Date(),
    });
  } else {
    await createForecastSnapshot(prisma, {
      marketplace, periodStart, periodEnd, depositEst,
      forecastGross, forecastNet, forecastFees, payoutRatioPct, totalOrders,
    });
  }
}

// ─── Reconcile snapshots vs actual settlements ────────────────────────────────

export async function reconcileForecastSnapshots(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const snapshots = await findPendingReconciliationSnapshots(prisma, today);

  if (snapshots.length === 0) return;
  console.log(`[Calibration] Reconciling ${snapshots.length} pending snapshot(s)…`);

  // Lazy import to avoid circular dependency
  // (calibration-update imports forecast-snapshot, so forecast-snapshot imports calibration-update lazily)
  const { updateCalibrationFromActual } = await import("./calibration-update.service");

  for (const snap of snapshots) {
    const periodEndMs = new Date(snap.periodEnd + "T12:00:00").getTime();

    // Find a settlement whose endDate falls within ±7 days of snapshot periodEnd
    const settled = await findSettlementNearDate(prisma, {
      marketplace: snap.marketplace,
      nearDate: new Date(periodEndMs),
      windowDays: 7,
    });

    if (!settled || !settled.totalAmount) continue;

    const actualNet = Number(settled.totalAmount);
    if (actualNet <= 0 || snap.forecastNet <= 0) continue;

    // Query settlement transactions for actualGross and actualAds
    const txStats = await prisma.$queryRawUnsafe<{
      gross: number; ads_abs: number;
      r_commission: number; r_fba: number; r_refunds: number;
    }[]>(`
      SELECT
        SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END)::FLOAT8 AS gross,
        ABS(SUM(CASE WHEN t."amountType"='Cost of Advertising' THEN t.amount ELSE 0 END))::FLOAT8 AS ads_abs,
        (ABS(SUM(CASE WHEN t."amountType"='Commission' THEN t.amount ELSE 0 END)) /
          NULLIF(SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END),0))::FLOAT8 AS r_commission,
        (ABS(SUM(CASE WHEN t."amountType"='FBAPerUnitFulfillmentFee' THEN t.amount ELSE 0 END)) /
          NULLIF(SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END),0))::FLOAT8 AS r_fba,
        (ABS(SUM(CASE WHEN t."transactionType"='Refund' THEN t.amount ELSE 0 END)) /
          NULLIF(SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END),0))::FLOAT8 AS r_refunds
      FROM "AmazonSettlementTransaction" t
      WHERE t."settlementId" = '${settled.settlementId}'
    `);

    const tx = txStats[0];
    const actualGross   = tx ? Number(tx.gross)   : 0;
    const actualAdsAbs  = tx ? Number(tx.ads_abs)  : undefined;
    const actualRatio   = actualGross > 0 ? actualNet / actualGross : undefined;

    // Signed error: positive = over-estimated, negative = under-estimated
    const signedError   = ((snap.forecastNet - actualNet) / actualNet) * 100;
    const absError      = Math.abs(signedError);
    const settMonth     = getMonth(settled.endDate.toISOString());

    // Update snapshot record
    await updateForecastSnapshot(prisma, snap.id, {
      actualNet, actualGross: actualGross || null,
      settlementId: settled.settlementId,
      errorPct: absError,
      reconciledAt: new Date(),
    });

    // Update calibration with actual data
    await updateCalibrationFromActual(
      snap.marketplace,
      snap.forecastGross,
      actualNet,
      signedError,
      {
        actualGross: actualGross || undefined,
        actualAdsAbs,
        actualRatio,
        settlementMonth: settMonth,
        newRCommission: tx ? Number(tx.r_commission) : undefined,
        newRFba:        tx ? Number(tx.r_fba)        : undefined,
        newRRefunds:    tx ? Number(tx.r_refunds)    : undefined,
      }
    );

    console.log(`[Calibration] ${snap.marketplace} period ${snap.periodEnd}: forecast €${snap.forecastNet.toFixed(0)} vs actual €${actualNet.toFixed(0)} → error ${signedError.toFixed(1)}%`);
  }
}

// ─── Compute and save forecast snapshots for all marketplaces ─────────────────
// This is the AUTOMATIC job — runs every 6h independently of page loads.

export async function computeAndSaveForecasts(
  marketplaces = MARKETPLACES_ALL
): Promise<void> {
  const today = new Date();

  // Lazy import to avoid circular dependency
  const { getCalibration } = await import("./calibration-update.service");

  // Filter to marketplaces that have settlement cycle data
  const cycleRows = await prisma.$queryRawUnsafe<{
    marketplace: string;
    last_start: string; last_end: string;
    next_period_end: string; next_deposit_est: string;
  }[]>(`
    SELECT marketplace,
      MAX("startDate")::date::text   AS last_start,
      MAX("endDate")::date::text     AS last_end,
      (MAX("endDate") + INTERVAL '14 days')::date::text    AS next_period_end,
      (MAX("depositDate") + INTERVAL '14 days')::date::text AS next_deposit_est
    FROM "AmazonSettlement"
    WHERE marketplace = ANY(ARRAY[${marketplaces.map(m => `'${m}'`).join(",")}])
    GROUP BY marketplace
  `);

  if (cycleRows.length === 0) return;

  const mpList = cycleRows.map(r => r.marketplace);

  // Open unsettled orders: current period + stragglers
  const openRows = await prisma.$queryRawUnsafe<{
    marketplace: string;
    current_orders: bigint; current_gross: number;
    straggler_orders: bigint; straggler_gross: number;
  }[]>(`
    WITH last_sett AS (
      SELECT marketplace, MAX("startDate") AS last_start, MAX("endDate") AS last_end
      FROM "AmazonSettlement"
      WHERE marketplace = ANY(ARRAY[${mpList.map(m => `'${m}'`).join(",")}])
      GROUP BY marketplace
    ),
    current_p AS (
      SELECT o.marketplace,
        COUNT(DISTINCT o."amazonOrderId") AS cnt, COALESCE(SUM(o."itemTotal"),0) AS gross
      FROM "AmazonOrder" o JOIN last_sett ls ON ls.marketplace = o.marketplace
      WHERE o."orderStatus" NOT IN ('Cancelled','Pending')
        AND o."purchaseDate" > ls.last_end
        AND NOT EXISTS (SELECT 1 FROM "AmazonSettlementTransaction" st
          WHERE st."orderId" = o."amazonOrderId" AND st."amountType"='Principal' AND st."transactionType"='Order')
      GROUP BY o.marketplace
    ),
    straggler_p AS (
      SELECT o.marketplace,
        COUNT(DISTINCT o."amazonOrderId") AS cnt, COALESCE(SUM(o."itemTotal"),0) AS gross
      FROM "AmazonOrder" o JOIN last_sett ls ON ls.marketplace = o.marketplace
      WHERE o."orderStatus" NOT IN ('Cancelled','Pending')
        AND o."purchaseDate" >= ls.last_start AND o."purchaseDate" <= ls.last_end
        AND NOT EXISTS (SELECT 1 FROM "AmazonSettlementTransaction" st
          WHERE st."orderId" = o."amazonOrderId" AND st."amountType"='Principal' AND st."transactionType"='Order')
      GROUP BY o.marketplace
    )
    SELECT
      COALESCE(cp.marketplace, sp.marketplace) AS marketplace,
      COALESCE(cp.cnt, 0)::BIGINT   AS current_orders,
      COALESCE(cp.gross, 0)::FLOAT8 AS current_gross,
      COALESCE(sp.cnt, 0)::BIGINT   AS straggler_orders,
      COALESCE(sp.gross, 0)::FLOAT8 AS straggler_gross
    FROM current_p cp FULL OUTER JOIN straggler_p sp ON sp.marketplace = cp.marketplace
  `);

  const openMap  = new Map(openRows.map(r => [r.marketplace, r]));
  const cycleMap = new Map(cycleRows.map(r => [r.marketplace, r]));

  let saved = 0;
  for (const mp of mpList) {
    const calib = await getCalibration(mp);
    if (!calib || calib.dataPoints < 1) continue;

    const cycle = cycleMap.get(mp);
    if (!cycle) continue;

    const open  = openMap.get(mp);
    const currentGross   = Number(open?.current_gross   ?? 0);
    const stragglerGross = Number(open?.straggler_gross ?? 0);
    const totalGross     = currentGross + stragglerGross;
    const totalOrders    = Number(open?.current_orders  ?? 0) + Number(open?.straggler_orders ?? 0);

    const estNet  = Math.round(totalGross * calib.payoutRatio * 100) / 100;
    const estFees = Math.round((totalGross - estNet) * 100) / 100;
    const ratioPct = Math.round(calib.payoutRatio * 1000) / 10;

    await saveForecastSnapshot(
      mp,
      cycle.last_end,
      cycle.next_period_end,
      cycle.next_deposit_est,
      Math.round(totalGross * 100) / 100,
      estNet,
      estFees,
      ratioPct,
      totalOrders,
    ).catch(err => console.warn(`[Forecast] saveForecastSnapshot(${mp}):`, err));

    saved++;
  }

  console.log(`[Calibration] Auto-snapshot: saved/updated ${saved} forecast(s) at ${today.toISOString()}`);
}

// ─── Excel historical import ──────────────────────────────────────────────────
// Reads PAGAMENTI AMAZON.xlsx from /data/pagamenti-amazon.xlsx (mounted volume)
// Extracts EFFETTIVO rows from new-format sheets (BE, IE, NL, PL, SE)
// and seeds AmazonForecastCalibration for those marketplaces.

// Excel sheet names are in Italian; strip trailing spaces before lookup
const SHEET_TO_MARKETPLACE: Record<string, string> = {
  // New-format sheets (have full VENDITE column data)
  "BELGIO":   "BE",
  "IRLANDA":  "IE",
  "OLANDA":   "NL",
  "POLONIA":  "PL",
  "SVEZIA":   "SE",
  // Old-format sheets — skipped (IT/DE/FR/ES/UK have better data in DB)
  // "ITALIA":   "IT", "GERMANIA": "DE", "SPAGNA": "ES", "FRANCIA": "FR", "UK": "UK"
};

// New-format column indices (0-based)
const COL_DATE        = 0;  // GIORNO
const COL_NET         = 1;  // RICAVI NETTI
const COL_GROSS       = 3;  // VENDITE
const COL_REFUNDS     = 4;  // RIMBORSI
const COL_FEES        = 5;  // SPESE
const COL_PAYMENT     = 9;  // VERSAMENTO PROGRAMMATO

function isEffettivoRow(row: unknown[]): boolean {
  return row.some(cell => typeof cell === "string" && cell.toLowerCase().includes("effettivo"));
}

function isNewFormat(rows: unknown[][]): boolean {
  // Scan first 10 rows to find the column header row (it's not always row 0)
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const str = rows[i].map(h => String(h ?? "").toLowerCase()).join("|");
    if (str.includes("vendite") && str.includes("rimborsi")) return true;
  }
  return false;
}

export async function bootstrapFromExcel(): Promise<void> {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.log(`[Calibration] Excel file not found at ${EXCEL_PATH}, skipping Excel import`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let xlsx: any;
  try {
    // xlsx is installed at runtime in the container (npm install xlsx)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    xlsx = require("xlsx");
  } catch {
    console.warn("[Calibration] xlsx package not available, skipping Excel import");
    return;
  }

  console.log("[Calibration] Starting Excel historical import…");
  const wb = xlsx.readFile(EXCEL_PATH);

  for (const sheetName of wb.SheetNames) {
    const mp = SHEET_TO_MARKETPLACE[sheetName.trim()];
    if (!mp) continue; // skip old-format sheets (IT/DE/FR/ES) — DB has better data

    const ws   = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    if (data.length < 3) continue;

    // Detect format (search first 10 rows for VENDITE+RIMBORSI columns)
    if (!isNewFormat(data)) {
      console.log(`[Calibration] ${sheetName}: old format detected, skipping (no VENDITE column)`);
      continue;
    }

    // Collect EFFETTIVO rows (actual settled periods)
    interface ExcelSettlement {
      marketplace: string;
      settlementDate: string;
      gross: number; realPayout: number; payoutRatio: number;
      rRefunds: number;
    }
    const settlements: ExcelSettlement[] = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown[];
      if (!isEffettivoRow(row)) continue;

      const gross    = Math.abs(Number(row[COL_GROSS]    ?? 0));
      const refunds  = Math.abs(Number(row[COL_REFUNDS]  ?? 0));
      const net      = Math.abs(Number(row[COL_PAYMENT]  ?? 0) || Number(row[COL_NET] ?? 0));
      const dateVal  = row[COL_DATE];
      const dateStr  = dateVal instanceof Date
        ? dateVal.toISOString().split("T")[0]
        : String(dateVal ?? "").slice(0, 10);

      if (gross <= 0 || net <= 0) continue;

      const payoutRatio = net / gross;
      if (payoutRatio <= 0 || payoutRatio > 1.5) continue; // sanity check

      settlements.push({
        marketplace:    mp,
        settlementDate: dateStr,
        gross, realPayout: net, payoutRatio,
        rRefunds:  gross > 0 ? refunds / gross : 0,
      });
    }

    if (settlements.length === 0) {
      console.log(`[Calibration] ${sheetName}: no EFFETTIVO rows with gross+net found`);
      continue;
    }

    // Sort oldest → newest
    settlements.sort((a, b) => a.settlementDate.localeCompare(b.settlementDate));

    // Check if DB already has a bootstrap for this marketplace with more data points
    const existing = await findCalibrationByMarketplace(prisma, mp);
    if (existing && existing.dataPoints >= settlements.length && existing.bootstrapSource !== "excel_import") {
      console.log(`[Calibration] ${mp}: DB already has ${existing.dataPoints} dp ≥ Excel ${settlements.length}, skipping`);
      continue;
    }

    // EWMA bootstrap from Excel data
    const seasonal = buildSeasonalFactors(settlements);
    let pr = settlements[0].payoutRatio;
    let rRefunds = settlements[0].rRefunds;
    let rRefundsSmoothed = settlements[0].rRefunds;
    const recentRatios: number[] = [pr];

    for (let i = 1; i < settlements.length; i++) {
      const s     = settlements[i];
      const alpha = calcAlpha(i);
      const alphaSlow = Math.max(0.04, alpha * SLOW_EWMA_FACTOR);
      pr           = ewma(pr, s.payoutRatio, alpha);
      rRefunds     = ewma(rRefunds, s.rRefunds, alpha);
      rRefundsSmoothed = ewma(rRefundsSmoothed, s.rRefunds, alphaSlow);
      if (recentRatios.length >= RECENT_HISTORY_SIZE) recentRatios.shift();
      recentRatios.push(s.payoutRatio);
    }

    const dp = settlements.length;

    await upsertCalibration(
      prisma,
      mp,
      {
        marketplace: mp,
        payoutRatio: pr,
        rCommission: 0, rFba: 0, rAds: 0, rAdsVat: 0, rDsf: 0,
        rStorage: 0, rInbound: 0, rPrep: 0,
        rRefunds, rOther: 0, rReimb: 0,
        avgStoragePerSett: 0, avgInboundPerSett: 0,
        avgAdsPerSett: 0, rRefundsSmoothed,
        dataPoints: dp, ewmaAlpha: calcAlpha(dp),
        recentRatios, recentErrors: [],
        seasonalFactors: seasonal as object,
        bootstrapSource: "excel_import",
      },
      {
        payoutRatio: pr, rRefunds, rRefundsSmoothed,
        dataPoints: dp, ewmaAlpha: calcAlpha(dp),
        recentRatios, recentErrors: [],
        hasBias: false, biasCorrection: 0, postBreakAlpha: null,
        seasonalFactors: seasonal as object,
        bootstrapSource: "excel_import",
        lastUpdatedAt: new Date(),
      }
    );

    console.log(`[Calibration] ${mp} (Excel): ${dp} settlements → payoutRatio=${(pr*100).toFixed(1)}%`);
  }
}
