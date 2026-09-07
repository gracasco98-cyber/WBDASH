"use client";
import type { ProductPerformanceRow } from "@/lib/api";

// ── Shared formatters ────────────────────────────────────────────────────────
export const fmtEur = (n: number) => `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtPct = (n: number) => `${(n * 100).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
export const dash = (v: number | null, fmt: (n: number) => string) => (v === null ? "—" : fmt(v));

/** accent-primary (#6ee7b7) is this app's positive/success token — same one
 *  GlobalSidebar uses for active links. accent-red (#f87171) is its negative
 *  counterpart. Both are theme tokens, so the table follows the theme toggle. */
const profitClass = (n: number) => (n < 0 ? "text-accent-red" : "text-accent-primary");

/** grossProfit, netProfit, margin and roi are all derived from amazonFees and
 *  cogs. When either of those is an estimate rather than real settlement/COGS
 *  data, every derived figure inherits that uncertainty and must say so —
 *  otherwise the UI presents an estimate as a verified fact. */
export const isEstimated = (m: ProductPerformanceRow) => !m.hasRealFees || !m.hasRealCogs;

const DERIVED_ESTIMATE_TITLE = "Calcolato su fee/COGS parzialmente stimati";

function EstimateBadge({ title }: { title: string }) {
  return <span title={title} className="text-accent-amber text-[9px] ml-[3px]">≈</span>;
}

export function MetricCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2.5 ${className}`}>{children}</td>;
}

function ProfitCell({ value, fmt, estimated }: { value: number; fmt: (n: number) => string; estimated: boolean }) {
  return (
    <MetricCell>
      <span className={`font-semibold ${profitClass(value)}`}>{fmt(value)}</span>
      {estimated && <EstimateBadge title={DERIVED_ESTIMATE_TITLE} />}
    </MetricCell>
  );
}

interface MetricRowProps {
  /** Full content of the first (label) cell — differs between parent rows
   *  (expand toggle + rename) and child rows (thumbnail + move action). */
  label: React.ReactNode;
  metrics: ProductPerformanceRow;
  isChild?: boolean;
  /** Optional inline VAT-rate editor rendered beside the COGS value. */
  vatEditor?: React.ReactNode;
  /** Column names (matching COLUMNS in ProductsPerformanceTable, e.g.
   *  "Fee Amazon") to omit from this row — driven by the "Colonne" picker.
   *  The label cell is never hideable. */
  hiddenColumns?: Set<string>;
}

/**
 * Renders the 17 metric cells shared by parent and child rows. Extracted so the
 * two row variants differ only in their label cell and background, instead of
 * duplicating the whole metric block (and its estimate-badge logic) twice.
 */
const NO_COST_DATA_TITLE = "Costi non tracciati per questo canale";

export default function MetricRow({
  label,
  metrics: m,
  isChild = false,
  hiddenColumns,
  vatEditor,
}: MetricRowProps) {
  const estimated = isEstimated(m);
  // Distinct from "estimated": for non-Amazon channels there is no fee/COGS
  // tracking at all yet, so showing a computed profit (fees/cogs=0) would be
  // a fabricated 100%-margin figure, not a real estimate.
  const hasCostData = m.costDataAvailable !== false;
  const noCost = <span title={NO_COST_DATA_TITLE}>—</span>;

  const cells: { column: string; node: React.ReactNode }[] = [
    { column: "Unità", node: m.units },
    { column: "Resi", node: fmtEur(m.refundsAmount) },
    { column: "Ricavi", node: fmtEur(m.sales) },
    { column: "Promo", node: fmtEur(m.promo) },
    { column: "Ads", node: dash(m.adsSpend, fmtEur) },
    { column: "% Resi", node: fmtPct(m.refundPct) },
    {
      column: "Fee Amazon",
      node: hasCostData ? (
        <>
          {fmtEur(m.amazonFees)}
          {!m.hasRealFees && (
            <EstimateBadge title="Stimato — settlement non ancora disponibile" />
          )}
        </>
      ) : (
        noCost
      ),
    },
    {
      column: "COGS",
      node: hasCostData ? (
        <>
          {fmtEur(m.cogs)}
          {!m.hasRealCogs && (
            <EstimateBadge title="Stimato — nessun COGS configurato per questo ASIN" />
          )}
          {vatEditor}
        </>
      ) : (
        noCost
      ),
    },
    {
      column: "Profitto lordo",
      node: hasCostData ? (
        <>
          <span className={`font-semibold ${profitClass(m.grossProfit)}`}>
            {fmtEur(m.grossProfit)}
          </span>
          {estimated && <EstimateBadge title={DERIVED_ESTIMATE_TITLE} />}
        </>
      ) : (
        noCost
      ),
    },
    {
      column: "Profitto netto",
      node: hasCostData ? (
        <>
          <span className={`font-semibold ${profitClass(m.netProfit)}`}>
            {fmtEur(m.netProfit)}
          </span>
          {estimated && <EstimateBadge title={DERIVED_ESTIMATE_TITLE} />}
        </>
      ) : (
        noCost
      ),
    },
    {
      column: "Payout stimato",
      node: hasCostData ? fmtEur(m.estimatedPayout) : noCost,
    },
    {
      column: "Margine",
      node: hasCostData ? (
        <>
          <span className={`font-semibold ${profitClass(m.margin)}`}>
            {fmtPct(m.margin)}
          </span>
          {estimated && <EstimateBadge title={DERIVED_ESTIMATE_TITLE} />}
        </>
      ) : (
        noCost
      ),
    },
    {
      column: "ROI",
      node: hasCostData ? (
        <>
          <span className={`font-semibold ${profitClass(m.roi)}`}>
            {fmtPct(m.roi)}
          </span>
          {estimated && <EstimateBadge title={DERIVED_ESTIMATE_TITLE} />}
        </>
      ) : (
        noCost
      ),
    },
    { column: "ACOS reale", node: dash(m.realAcos, fmtPct) },
    { column: "Prezzo medio", node: fmtEur(m.avgSellingPrice) },
    { column: "BSR", node: dash(m.bsr, (n) => String(n)) },
    // stock 0 with no inventory row means "unknown", not "zero units"
    { column: "Stock", node: m.hasStockData ? m.stock : "—" },
  ];

  return (
    <tr className={isChild ? "bg-bg-hover/50" : "border-b border-bg-border/60"}>
      <MetricCell className="sticky left-0 z-10 bg-bg-card border-r border-bg-border/70 font-medium">{label}</MetricCell>
      {cells.filter((c) => !hiddenColumns?.has(c.column)).map((c) => (
        <MetricCell key={c.column}>{c.node}</MetricCell>
      ))}
    </tr>
  );
}
