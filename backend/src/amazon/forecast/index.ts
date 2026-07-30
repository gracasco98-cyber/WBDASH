/**
 * backend/src/amazon/forecast/index.ts
 *
 * Facade — re-exports the public API of all forecast sub-modules.
 * Callers import from "./forecast" or "../amazon/forecast" and get
 * exactly the same surface as the old forecast-calibration.service.ts.
 */

// ─── Calibration update (EWMA, bootstrap) ────────────────────────────────────
export {
  bootstrapCalibration,
  getCalibration,
  updateCalibrationFromActual,
  runDailyCalibration,
  calcAlpha,
  ewma,
  calcConfidence,
} from "./calibration-update.service";

export type { CalibrationRatios } from "./calibration-update.service";

// ─── Component model (pure breakdown + DB parameter computation + status) ─────
export {
  computeComponentBreakdown,
  computeComponentParameters,
  bootstrapComponentModel,
  getCalibrationStatus,
} from "./component-breakdown.service";

export type { ComponentBreakdown } from "./component-breakdown.service";

// ─── Bias / structural break detection (pure) ────────────────────────────────
export {
  detectBias,
  detectStructuralBreak,
  decayPostBreakAlpha,
  BIAS_WINDOW,
  STRUCTURAL_BREAK_THRESHOLD,
  RECENT_HISTORY_SIZE,
} from "./bias-detection.service";

// ─── Seasonality (pure) ───────────────────────────────────────────────────────
export {
  getSeasonalFactor,
  buildSeasonalFactors,
  updateSeasonalFactor,
  getMonth,
  SLOW_EWMA_FACTOR,
} from "./seasonality.service";

export type { SettlementForSeasonality } from "./seasonality.service";

// ─── Forecast snapshots + reconciliation + Excel import ──────────────────────
export {
  saveForecastSnapshot,
  reconcileForecastSnapshots,
  computeAndSaveForecasts,
  bootstrapFromExcel,
} from "./forecast-snapshot.service";
