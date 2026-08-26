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

export function MetricCell({ children }: { children: React.ReactNode }) {
  return <td className="px-2.5 py-2.5">{children}</td>;
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
}

/**
 * Renders the 17 metric cells shared by parent and child rows. Extracted so the
 * two row variants differ only in their label cell and background, instead of
 * duplicating the whole metric block (and its estimate-badge logic) twice.
 */
const NO_COST_DATA_TITLE = "Costi non tracciati per questo canale";

export default function MetricRow({ label, metrics: m, isChild = false }: MetricRowProps) {
  const estimated = isEstimated(m);
  // Distinct from "estimated": for non-Amazon channels there is no fee/COGS
  // tracking at all yet, so showing a computed profit (fees/cogs=0) would be
  // a fabricated 100%-margin figure, not a real estimate.
  const hasCostData = m.costDataAvailable !== false;
  return (
    <tr className={isChild ? "bg-bg-hover/50" : "border-b border-bg-border/60"}>
      <MetricCell>{label}</MetricCell>
      <MetricCell>{m.units}</MetricCell>
      <MetricCell>{fmtEur(m.refundsAmount)}</MetricCell>
      <MetricCell>{fmtEur(m.sales)}</MetricCell>
      <MetricCell>{fmtEur(m.promo)}</MetricCell>
      <MetricCell>{dash(m.adsSpend, fmtEur)}</MetricCell>
      <MetricCell>{fmtPct(m.refundPct)}</MetricCell>
      {hasCostData ? (
        <>
          <MetricCell>
            {fmtEur(m.amazonFees)}
            {!m.hasRealFees && <EstimateBadge title="Stimato — settlement non ancora disponibile" />}
          </MetricCell>
          <MetricCell>
            {fmtEur(m.cogs)}
            {!m.hasRealCogs && <EstimateBadge title="Stimato — nessun COGS configurato per questo ASIN" />}
          </MetricCell>
          <ProfitCell value={m.grossProfit} fmt={fmtEur} estimated={estimated} />
          <ProfitCell value={m.netProfit} fmt={fmtEur} estimated={estimated} />
        </>
      ) : (
        <>
          <MetricCell><span title={NO_COST_DATA_TITLE}>—</span></MetricCell>
          <MetricCell><span title={NO_COST_DATA_TITLE}>—</span></MetricCell>
          <MetricCell><span title={NO_COST_DATA_TITLE}>—</span></MetricCell>
          <MetricCell><span title={NO_COST_DATA_TITLE}>—</span></MetricCell>
        </>
      )}
      {hasCostData ? (
        <>
          <MetricCell>{fmtEur(m.estimatedPayout)}</MetricCell>
          <ProfitCell value={m.margin} fmt={fmtPct} estimated={estimated} />
          <ProfitCell value={m.roi} fmt={fmtPct} estimated={estimated} />
        </>
      ) : (
        <>
          <MetricCell><span title={NO_COST_DATA_TITLE}>—</span></MetricCell>
          <MetricCell><span title={NO_COST_DATA_TITLE}>—</span></MetricCell>
          <MetricCell><span title={NO_COST_DATA_TITLE}>—</span></MetricCell>
        </>
      )}
      <MetricCell>{dash(m.bsr, (n) => String(n))}</MetricCell>
      <MetricCell>{fmtEur(m.avgSellingPrice)}</MetricCell>
      <MetricCell>{dash(m.realAcos, fmtPct)}</MetricCell>
      {/* stock 0 with no inventory row means "unknown", not "zero units" */}
      <MetricCell>{m.hasStockData ? m.stock : "—"}</MetricCell>
    </tr>
  );
}
