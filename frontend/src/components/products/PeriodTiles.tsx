"use client";
import { useEffect, useState } from "react";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";
import { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";
import type { PeriodPreset } from "@/context/PeriodContext";
import { api } from "@/lib/api";
import type { ProductPerformanceRow } from "@/lib/api";
import { formatDateToIso } from "@/lib/periodUtils";
import { fmtEur } from "./MetricRow";

const TILES: { preset: PeriodPreset; label: string; accent: string }[] = [
  { preset: "today", label: "Oggi", accent: "border-l-accent-blue" },
  { preset: "yesterday", label: "Ieri", accent: "border-l-accent-primary" },
  { preset: "last7", label: "7 giorni", accent: "border-l-accent-primary" },
  { preset: "last14", label: "14 giorni", accent: "border-l-accent-primary" },
  { preset: "last30", label: "30 giorni", accent: "border-l-accent-primary" },
];

function presetDateRange(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  switch (preset) {
    case "today": return { from: formatDateToIso(today), to: formatDateToIso(today) };
    case "yesterday": return { from: formatDateToIso(daysAgo(1)), to: formatDateToIso(daysAgo(1)) };
    case "last7": return { from: formatDateToIso(daysAgo(6)), to: formatDateToIso(today) };
    case "last14": return { from: formatDateToIso(daysAgo(13)), to: formatDateToIso(today) };
    case "last30": return { from: formatDateToIso(daysAgo(29)), to: formatDateToIso(today) };
    default: return { from: formatDateToIso(today), to: formatDateToIso(today) };
  }
}

/** Exported for direct unit testing: the hasRealFees / hasRealCogs / hasStockData
 *  flags it computes are not surfaced in this component's UI, so they are
 *  otherwise unobservable. */
export function sumAggregate(rows: ProductPerformanceRow[]): ProductPerformanceRow | null {
  if (rows.length === 0) return null;
  // Explicit zeroed initial value — reduce() without one uses rows[0] as the
  // seed and silently leaves every field it doesn't touch at row 0's value
  // instead of summing it, which is wrong for a multi-row aggregate.
  const base = rows.reduce(
    (acc, r) => ({
      units: acc.units + r.units,
      sales: acc.sales + r.sales,
      promo: acc.promo + r.promo,
      refundsAmount: acc.refundsAmount + r.refundsAmount,
      refundsCount: acc.refundsCount + r.refundsCount,
      amazonFees: acc.amazonFees + r.amazonFees,
      cogs: acc.cogs + r.cogs,
      stock: acc.stock + r.stock,
      grossProfit: acc.grossProfit + r.grossProfit,
      netProfit: acc.netProfit + r.netProfit,
      estimatedPayout: acc.estimatedPayout + r.estimatedPayout,
      adsSpend: r.adsSpend !== null ? (acc.adsSpend ?? 0) + r.adsSpend : acc.adsSpend,
      // AND-logic with a `true` seed, matching resolveProductPerformance's
      // aggregate and ProductsPerformanceTable's buildRowsByMarketplace: the
      // total only claims "verified" when EVERY contributing product is. OR-logic
      // inverts exactly the safeguard these flags exist to provide.
      hasRealFees: acc.hasRealFees && r.hasRealFees,
      hasRealCogs: acc.hasRealCogs && r.hasRealCogs,
      hasStockData: acc.hasStockData && r.hasStockData,
    }),
    { units: 0, sales: 0, promo: 0, refundsAmount: 0, refundsCount: 0, amazonFees: 0, cogs: 0, stock: 0, grossProfit: 0, netProfit: 0, estimatedPayout: 0, adsSpend: null as number | null, hasRealFees: true, hasRealCogs: true, hasStockData: true }
  );
  return {
    identifierId: "", asin: "", marketplace: "ALL", sku: null, bsr: null,
    ...base,
    refundPct: base.sales > 0 ? base.refundsAmount / base.sales : 0,
    realAcos: base.adsSpend !== null && base.sales > 0 ? base.adsSpend / base.sales : null,
    margin: base.sales > 0 ? base.netProfit / base.sales : 0,
    roi: base.cogs > 0 ? base.netProfit / base.cogs : 0,
    avgSellingPrice: base.units > 0 ? base.sales / base.units : 0,
  };
}

export default function PeriodTiles() {
  const { state, setPreset } = usePeriodFilter();
  const { marketplace: globalMarketplace } = useMarketplaceFilter();
  // Same translation the home page applies before hitting the product-performance
  // endpoint: only Amazon channels narrow the scope, everything else is "all".
  const productMarketplace = isAmazonChannel(globalMarketplace) ? (amazonChannelCode(globalMarketplace) ?? "all") : "all";
  const [totals, setTotals] = useState<Partial<Record<PeriodPreset, ProductPerformanceRow | null>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          TILES.map(async ({ preset }) => {
            const { from, to } = presetDateRange(preset);
            const { groups } = await api.productPerformance.get({ marketplace: productMarketplace, from, to });
            return [preset, sumAggregate(groups.map((g) => g.aggregate))] as const;
          })
        );
        if (!cancelled) setTotals(Object.fromEntries(results));
      } catch (err) {
        if (!cancelled) console.error("[PeriodTiles] Failed to load period tiles:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [productMarketplace]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {TILES.map(({ preset, label, accent }) => {
        const totalRow = totals[preset];
        const active = state.preset === preset;
        return (
          <button
            key={preset}
            aria-label={label}
            onClick={() => setPreset(preset)}
            className={`text-left rounded-lg overflow-hidden p-0 cursor-pointer border transition-colors bg-bg-card hover:bg-bg-hover ${
              active ? "border-accent-primary" : "border-bg-border"
            }`}
          >
            <div className={`bg-bg-hover px-3.5 py-2.5 border-l-2 ${accent}`}>
              <div className="font-semibold text-[13px] text-zinc-200">{label}</div>
            </div>
            <div className="px-3.5 py-3 text-[11px] text-zinc-400">
              <div className="text-zinc-500 text-[10px]">Ricavi</div>
              <div className="text-[19px] font-bold text-white tabular-nums">{totalRow ? fmtEur(totalRow.sales) : "—"}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
