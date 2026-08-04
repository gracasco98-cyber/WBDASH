"use client";
import { useEffect, useState } from "react";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import type { PeriodPreset } from "@/context/PeriodContext";
import { api } from "@/lib/api";
import type { ProductPerformanceRow } from "@/lib/api";

const TILES: { preset: PeriodPreset; label: string; color: string }[] = [
  { preset: "today", label: "Oggi", color: "#3b6fd8" },
  { preset: "yesterday", label: "Ieri", color: "#3d9188" },
  { preset: "last7", label: "7 giorni", color: "#3d9188" },
  { preset: "last14", label: "14 giorni", color: "#3d9188" },
];

function presetDateRange(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  switch (preset) {
    case "today": return { from: iso(today), to: iso(today) };
    case "yesterday": return { from: iso(daysAgo(1)), to: iso(daysAgo(1)) };
    case "last7": return { from: iso(daysAgo(6)), to: iso(today) };
    case "last14": return { from: iso(daysAgo(13)), to: iso(today) };
    default: return { from: iso(today), to: iso(today) };
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
    }),
    { units: 0, sales: 0, promo: 0, refundsAmount: 0, refundsCount: 0, amazonFees: 0, cogs: 0, stock: 0, grossProfit: 0, netProfit: 0, estimatedPayout: 0, adsSpend: null as number | null, hasRealFees: false }
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
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
