/**
 * seasonality.service.ts
 *
 * Pure functions for seasonality factor computation and application.
 * No DB access — data-in / data-out only.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const SLOW_EWMA_FACTOR = 0.40; // refund alpha = alpha × this (cross-settlement noise)

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-settlement data needed to build seasonal factors */
export interface SettlementForSeasonality {
  settlementDate: string; // YYYY-MM-DD
  payoutRatio: number;
}

// ─── Month extraction ────────────────────────────────────────────────────────

export function getMonth(dateStr: string): string {
  return dateStr.slice(5, 7); // "2024-04-15" → "04"
}

// ─── Seasonal factor lookup for current month ─────────────────────────────────

export function getSeasonalFactor(seasonalFactors: Record<string, number> | null, month: string): number {
  if (!seasonalFactors) return 1.0;
  return seasonalFactors[month] ?? 1.0;
}

// ─── Build seasonal factors from settlement history ───────────────────────────

export function buildSeasonalFactors(settlements: SettlementForSeasonality[]): Record<string, number> {
  if (settlements.length < 4) return {};

  const overallAvg = settlements.reduce((s, r) => s + r.payoutRatio, 0) / settlements.length;
  if (overallAvg <= 0) return {};

  // Group by month, compute average ratio per month
  const byMonth: Record<string, number[]> = {};
  for (const sett of settlements) {
    const m = getMonth(sett.settlementDate);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(sett.payoutRatio);
  }

  const factors: Record<string, number> = {};
  for (const [month, ratios] of Object.entries(byMonth)) {
    const monthAvg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    factors[month] = monthAvg / overallAvg;
  }

  return factors;
}

// ─── Update seasonal factor for a settlement month (EWMA) ────────────────────

/**
 * Returns an updated seasonalFactors record incorporating the new
 * month's actual ratio observation.
 */
export function updateSeasonalFactor(
  seasonalRaw: Record<string, number>,
  settlementMonth: string,
  actualRatio: number,
  currentEwmaRatio: number,
  alpha = 0.3,
): Record<string, number> {
  if (currentEwmaRatio <= 0) return seasonalRaw;
  const monthFactor = actualRatio / currentEwmaRatio;
  const existing    = seasonalRaw[settlementMonth] ?? 1.0;
  return {
    ...seasonalRaw,
    [settlementMonth]: alpha * monthFactor + (1 - alpha) * existing,
  };
}
