"use client";
import type { ProductPerformanceRow } from "@/lib/api";

// ── Shared formatters ────────────────────────────────────────────────────────
export const fmtEur = (n: number) => `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** fmtEur with a non-breaking space: narrow tiles must not split "€" from the amount. */
export const fmtEurNoWrap = (n: number) => fmtEur(n).replace(" ", "\u00A0");
export const fmtPct = (n: number) => `${(n * 100).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
export const dash = (v: number | null, fmt: (n: number) => string) => (v === null ? "—" : fmt(v));

/** Desktop widths deliberately mirror the roomy marketplace table used as the
 * visual reference for this dashboard. The table scrolls horizontally instead
 * of squeezing labels and monetary values into unreadable cells. */
export const IDENTITY_COLUMN_CLASS =
  "md:w-[480px] md:min-w-[480px] md:max-w-[480px]";

export const SUMMARY_IDENTITY_COLUMN_CLASS =
  "md:w-[300px] md:min-w-[300px] md:max-w-[300px] lg:w-[340px] lg:min-w-[340px] lg:max-w-[340px] xl:w-[360px] xl:min-w-[360px] xl:max-w-[360px]";

export const METRIC_COLUMN_CLASSES: Record<string, string> = {
  "Unità": "md:w-[88px] md:min-w-[88px]",
  "Resi": "md:w-[112px] md:min-w-[112px]",
  "Incasso": "md:w-[132px] md:min-w-[132px]",
  "Promo": "md:w-[112px] md:min-w-[112px]",
  "Ads": "md:w-[112px] md:min-w-[112px]",
  "% Resi": "md:w-[96px] md:min-w-[96px]",
  "Fee marketplace": "md:w-[148px] md:min-w-[148px]",
  "COGS": "md:w-[132px] md:min-w-[132px]",
  "IVA": "md:w-[120px] md:min-w-[120px]",
  "Profitto lordo": "md:w-[150px] md:min-w-[150px]",
  "Margine pulito": "md:w-[150px] md:min-w-[150px]",
  "Payout": "md:w-[150px] md:min-w-[150px]",
  "Margine": "md:w-[112px] md:min-w-[112px]",
  "ROI": "md:w-[104px] md:min-w-[104px]",
  "ACOS reale": "md:w-[112px] md:min-w-[112px]",
  "Prezzo medio": "md:w-[132px] md:min-w-[132px]",
  "BSR": "md:w-[96px] md:min-w-[96px]",
  "Stock": "md:w-[104px] md:min-w-[104px]",
};

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
  /** On mobile, reveal every metric in the product card. The four summary
   *  metrics remain visible even while the card is collapsed. */
  mobileExpanded?: boolean;
  /** Gives aggregate marketplace rows a stronger visual hierarchy than their
   *  product children without changing any metric rendering. */
  tone?: "default" | "marketplace";
  /** The compact responsive view uses a narrower identity column; the complete
   *  analytical view keeps the full reference width. */
  identityColumnClass?: string;
}

/**
 * Renders the 17 metric cells shared by parent and child rows. Extracted so the
 * two row variants differ only in their label cell and background, instead of
 * duplicating the whole metric block (and its estimate-badge logic) twice.
 */
const NO_COST_DATA_TITLE = "Costi non tracciati per questo canale";
const MOBILE_SUMMARY_COLUMNS = new Set([
  "Unità",
  "Incasso",
  "Ads",
  "Margine pulito",
  "Margine",
  "ACOS reale",
]);

export default function MetricRow({
  label,
  metrics: m,
  isChild = false,
  hiddenColumns,
  vatEditor,
  mobileExpanded = false,
  tone = "default",
  identityColumnClass = IDENTITY_COLUMN_CLASS,
}: MetricRowProps) {
  const estimated = isEstimated(m);
  // Distinct from "estimated": for non-Amazon channels there is no fee/COGS
  // tracking at all yet, so showing a computed profit (fees/cogs=0) would be
  // a fabricated 100%-margin figure, not a real estimate.
  const hasCostData = m.costDataAvailable !== false;
  const noCost = <span title={NO_COST_DATA_TITLE}>—</span>;

  const cells: { column: string; node: React.ReactNode }[] = [
    { column: "Unità", node: m.units },
    {
      column: "Resi",
      node: (
        <span className="inline-flex flex-col items-end leading-tight">
          <span className={m.refundsCount > 0 ? "text-accent-blue" : ""}>
            {m.refundsCount}
          </span>
          <span className="mt-0.5 text-[9px] font-normal text-zinc-500">
            {fmtEur(m.refundsAmount)}
          </span>
        </span>
      ),
    },
    { column: "Incasso", node: fmtEur(m.sales) },
    { column: "Promo", node: fmtEur(m.promo) },
    { column: "Ads", node: dash(m.adsSpend, fmtEur) },
    { column: "% Resi", node: fmtPct(m.refundPct) },
    {
      column: "Fee marketplace",
      node: hasCostData && m.feeKind !== "mixed" ? (
        <>
          {fmtEur(m.amazonFees)}
          {!m.hasRealFees && (
            <EstimateBadge title={m.feeKind === "redcare" ? "Stimato — fee Redcare 15%" : "Stimato — settlement Amazon non ancora disponibile"} />
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
      column: "IVA",
      node: hasCostData ? fmtEur(m.vatAmount ?? 0) : noCost,
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
      column: "Margine pulito",
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
      column: "Payout",
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
    <tr
      className={`grid grid-cols-2 overflow-hidden rounded-xl border shadow-sm transition-colors md:table-row md:rounded-none md:border-0 md:shadow-none md:hover:bg-bg-hover/35 ${
        isChild
          ? "mx-2 border-bg-border bg-bg-card md:border-b md:border-bg-border/70"
          : tone === "marketplace"
            ? "border-bg-border bg-bg-card md:border-b md:border-bg-border"
          : "border-bg-border bg-bg-card md:border-b md:border-bg-border/60"
      }`}
    >
      <MetricCell className={`${identityColumnClass} col-span-2 block border-b px-3 py-3 font-medium md:sticky md:left-0 md:z-10 md:table-cell md:border-b-0 md:border-r md:px-4 ${isChild ? "md:py-3.5" : "md:py-4"} ${tone === "marketplace" && !isChild ? "border-bg-border bg-bg-card" : "border-bg-border/70 bg-bg-card"}`}>
        {label}
      </MetricCell>
      {cells.map((c) => {
        const visibleOnMobile = mobileExpanded || MOBILE_SUMMARY_COLUMNS.has(c.column);
        const desktopVisibility = hiddenColumns?.has(c.column)
          ? "md:hidden"
          : "md:table-cell";
        return (
          <td
            key={c.column}
            data-mobile-metric={c.column}
            className={`${visibleOnMobile ? "flex" : "hidden"} ${desktopVisibility} ${METRIC_COLUMN_CLASSES[c.column] ?? ""} min-w-0 flex-col gap-1 border-b border-bg-border/50 px-3 py-2.5 odd:border-r md:border-b-0 md:border-l md:border-bg-border/70 md:px-3 md:py-4 md:text-right md:align-middle`}
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-zinc-500 md:hidden">
              {c.column}
            </span>
            <span className="text-sm font-semibold tabular-nums text-zinc-300 md:whitespace-nowrap md:text-[12.5px] md:font-normal">
              {c.node}
            </span>
          </td>
        );
      })}
    </tr>
  );
}
