/**
 * bias-detection.service.ts
 *
 * Pure functions for bias and structural break detection.
 * No DB access — data-in / data-out only.
 */

// ─── Constants (shared via re-export so callers can use them if needed) ────────

export const BIAS_WINDOW             = 5;    // N consecutive same-direction errors = bias
export const STRUCTURAL_BREAK_THRESHOLD = 0.20; // 20% deviation triggers break detection
export const RECENT_HISTORY_SIZE     = 10;   // how many past values to keep

// ─── Core EWMA math helpers (pure, no external deps) ─────────────────────────

/** Adaptive EWMA alpha: faster updates when fewer data points. */
export function calcAlpha(dataPoints: number): number {
  return Math.max(0.08, Math.min(0.40, 0.60 / Math.sqrt(Math.max(1, dataPoints))));
}

/** Exponentially-weighted moving average update step. */
export function ewma(old: number, actual: number, alpha: number): number {
  return alpha * actual + (1 - alpha) * old;
}

// ─── Bias detection ──────────────────────────────────────────────────────────

export function detectBias(errors: number[]): { hasBias: boolean; correction: number } {
  if (errors.length < BIAS_WINDOW) return { hasBias: false, correction: 0 };
  const last = errors.slice(-BIAS_WINDOW);
  const allPositive = last.every(e => e > 0.5);   // consistently over-estimating
  const allNegative = last.every(e => e < -0.5);  // consistently under-estimating
  if (!allPositive && !allNegative) return { hasBias: false, correction: 0 };
  const correction = last.reduce((s, e) => s + e, 0) / last.length;
  return { hasBias: true, correction };
}

// ─── Structural break detection ───────────────────────────────────────────────

/**
 * Determines whether a new actual ratio represents a structural break
 * relative to the current EWMA payout ratio.
 * Returns the detected break info or null if no break.
 */
export function detectStructuralBreak(
  actualRatio: number,
  currentEwmaRatio: number,
  currentAlpha: number,
  dataPoints: number,
): { isBreak: boolean; postBreakAlpha: number | null } {
  const relDiff = Math.abs(actualRatio - currentEwmaRatio) / currentEwmaRatio;
  if (relDiff > STRUCTURAL_BREAK_THRESHOLD) {
    const postBreakAlpha = Math.min(0.50, currentAlpha * 2); // boost alpha temporarily
    return { isBreak: true, postBreakAlpha };
  }
  return { isBreak: false, postBreakAlpha: null };
}

/**
 * Decay a post-break alpha toward the steady-state alpha.
 * Returns null when the boosted alpha has decayed back to steady state.
 */
export function decayPostBreakAlpha(
  postBreakAlpha: number,
  steadyStateAlpha: number,
): number | null {
  const decayed = postBreakAlpha * 0.6;
  return decayed > steadyStateAlpha ? decayed : null;
}
