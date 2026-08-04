"use client";
import { useEffect, useState } from "react";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import type { PeriodPreset } from "@/context/PeriodContext";
import { api } from "@/lib/api";
import type { ProductPerformanceRow } from "@/lib/api";
import { formatDateToIso } from "@/lib/periodUtils";

const TILES: { preset: PeriodPreset; label: string; color: string }[] = [
  { preset: "today", label: "Oggi", color: "linear-gradient(135deg,#4f7fe8,#3b6fd8)" },
  { preset: "yesterday", label: "Ieri", color: "linear-gradient(135deg,#4aa89a,#3d9188)" },
  { preset: "last7", label: "7 giorni", color: "linear-gradient(135deg,#4aa89a,#3d9188)" },
  { preset: "last14", label: "14 giorni", color: "linear-gradient(135deg,#4aa89a,#3d9188)" },
  { preset: "last30", label: "30 giorni", color: "linear-gradient(135deg,#4aa89a,#3d9188)" },
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

function sumAggregate(rows: ProductPerformanceRow[]): ProductPerformanceRow | null {
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
      hasRealFees: acc.hasRealFees || r.hasRealFees,
      hasRealCogs: acc.hasRealCogs || r.hasRealCogs,
    }),
    { units: 0, sales: 0, promo: 0, refundsAmount: 0, refundsCount: 0, amazonFees: 0, cogs: 0, stock: 0, grossProfit: 0, netProfit: 0, estimatedPayout: 0, adsSpend: null as number | null, hasRealFees: false, hasRealCogs: false }
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

const fmtEur = (n: number) => `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PeriodTiles() {
  const { state, setPreset } = usePeriodFilter();
  const [totals, setTotals] = useState<Record<PeriodPreset, ProductPerformanceRow | null>>({} as any);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          TILES.map(async ({ preset }) => {
            const { from, to } = presetDateRange(preset);
            const { groups } = await api.productPerformance.get({ marketplace: "all", from, to });
            return [preset, sumAggregate(groups.map((g) => g.aggregate))] as const;
          })
        );
        if (!cancelled) setTotals(Object.fromEntries(results) as any);
      } catch (err) {
        if (!cancelled) console.error("[PeriodTiles] Failed to load period tiles:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
      {TILES.map(({ preset, label, color }) => {
        const totalRow = totals[preset];
        const active = state.preset === preset;
        return (
          <button
            key={preset}
            aria-label={label}
            onClick={() => setPreset(preset)}
            style={{
              textAlign: "left", background: "#fff", border: active ? "2px solid #111" : "1px solid #e5e7eb",
              borderRadius: 8, overflow: "hidden", cursor: "pointer", padding: 0,
            }}
          >
            <div style={{ background: color, color: "#fff", padding: "10px 14px" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
            </div>
            <div style={{ padding: "12px 14px", fontSize: 11, color: "#374151" }}>
              <div style={{ color: "#9ca3af", fontSize: 10 }}>Ricavi</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: "#111" }}>{totalRow ? fmtEur(totalRow.sales) : "—"}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
