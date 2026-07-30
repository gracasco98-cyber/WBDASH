/**
 * fmt.ts — Canonical number/currency formatters for the entire dashboard.
 *
 * Convention IT locale:
 *   - Separatore migliaia : punto  (1.234)
 *   - Separatore decimali : virgola (1.234,56)
 *   - Valuta              : €1.234,56
 */

/** Euro con 2 decimali fissi: €1.234,56 */
export const fmtEur = (v: number, dec = 2): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(v ?? 0);

/** Numero intero con separatore migliaia: 1.234 */
export const fmtNum = (v: number): string =>
  new Intl.NumberFormat("it-IT").format(v ?? 0);

/** Percentuale con 1 decimale: 12,3% */
export const fmtPct = (v: number | null | undefined, dec = 1): string =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(v) + "%";

/**
 * Compatto per assi grafici:
 *   >= 1000 → €1,2k
 *   < 1000  → €234,56
 */
export const fmtEurCompact = (v: number): string => {
  if (Math.abs(v) >= 1000)
    return (
      "€" +
      new Intl.NumberFormat("it-IT", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(v / 1000) +
      "k"
    );
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
};
