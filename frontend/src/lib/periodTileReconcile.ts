// lib/periodTileReconcile.ts — keeps a period tile's numbers consistent when
// its Amazon revenue comes from the live Sales API instead of the product rows.
import type { ProductPerformanceRow } from "@/lib/api";

/** Same operational rules the backend uses (product-performance.repo.ts). */
const AMAZON_VAT_RATE = 10;
const FEE_ESTIMATE_PCT = 0.15;
const FEE_ESTIMATE_PER_UNIT = 3.8;

export interface LiveAmazonSummary {
  totalRevenue: number;
  unitsSold: number;
  refunds?: number | null;
  refundCount?: number | null;
}

/**
 * The live summary can know about orders and refunds that the product rows
 * have not received yet. Replacing only revenue/units/refunds would leave
 * VAT, fees, COGS and the margin on the row totals, so the displayed items
 * would no longer add up. The difference is carried into every item instead:
 * VAT extracted at 10/110, fees at the usual 15% + €3.80/unit estimate, COGS
 * at the period's average cost per unit.
 */
export function reconcileWithLiveSummary(
  rows: ProductPerformanceRow,
  live: LiveAmazonSummary | null,
): ProductPerformanceRow {
  if (!live) return rows;

  const deltaSales = live.totalRevenue - rows.sales;
  const deltaUnits = live.unitsSold - rows.units;
  const refundsAmount = Math.max(rows.refundsAmount, live.refunds ?? 0);
  const deltaRefunds = refundsAmount - rows.refundsAmount;

  const deltaVat = (deltaSales - deltaRefunds) * AMAZON_VAT_RATE / (100 + AMAZON_VAT_RATE);
  const deltaFees = deltaSales * FEE_ESTIMATE_PCT + deltaUnits * FEE_ESTIMATE_PER_UNIT;
  const avgCogsPerUnit = rows.units > 0 ? rows.cogs / rows.units : 0;
  const deltaCogs = avgCogsPerUnit * deltaUnits;
  const changed = deltaSales !== 0 || deltaUnits !== 0;

  const sales = live.totalRevenue;
  const units = live.unitsSold;
  const vatAmount = (rows.vatAmount ?? 0) + deltaVat;
  const amazonFees = rows.amazonFees + deltaFees;
  const cogs = rows.cogs + deltaCogs;
  // Apply only the difference, so a period without live-only orders keeps
  // exactly the rows' figures.
  const deltaProfit = deltaSales - deltaRefunds - deltaVat - deltaFees - deltaCogs;
  const grossProfit = rows.grossProfit + deltaProfit;
  const netProfit = rows.netProfit + deltaProfit;

  return {
    ...rows,
    sales,
    units,
    refundsAmount,
    refundsCount: Math.max(rows.refundsCount, live.refundCount ?? 0),
    vatAmount,
    amazonFees,
    cogs,
    hasRealFees: rows.hasRealFees && !changed,
    grossProfit,
    netProfit,
    estimatedPayout: rows.estimatedPayout + deltaSales - deltaRefunds - deltaFees,
    margin: sales > 0 ? netProfit / sales : 0,
    refundPct: sales > 0 ? refundsAmount / sales : 0,
    avgSellingPrice: units > 0 ? sales / units : 0,
    realAcos: rows.adsSpend !== null && sales > 0 ? rows.adsSpend / sales : null,
  };
}
