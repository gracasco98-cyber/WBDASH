"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "@/lib/api";
import type { ShopifyOverview, AmazonOverview, Summary, AmazonSummary } from "@/lib/api";
import { fmtEur } from "@/lib/fmt";

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }
function todayStr()       { return fmtDate(new Date()); }
function nDaysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n + 1);
  return fmtDate(d);
}

// ── Internal data shape ───────────────────────────────────────────────────────
interface ShopifySlice {
  grossRevenue: number; netRevenue: number;
  orderCount:   number; refunds:    number;
  pctChange:    number | null;
}
interface AmazonSlice {
  grossRevenue: number; estPayout: number;
  orderCount:   number; unitsSold: number;
  adSpend:      number; pctChange: number | null;
}
interface PeriodData { shopify: ShopifySlice | null; amazon: AmazonSlice | null; }

type SourceTab = "total" | "shopify" | "amazon";

const PERIOD_COLS = [
  { key: "today",     label: "Oggi",      accent: "#10b981", filterKey: "today",     customDays: null },
  { key: "yesterday", label: "Ieri",      accent: "#3b82f6", filterKey: "yesterday", customDays: null },
  { key: "d7",        label: "7 giorni",  accent: "#8b5cf6", filterKey: "last7",     customDays: null },
  { key: "d14",       label: "14 giorni", accent: "#f59e0b", filterKey: "custom",    customDays: 14   },
  { key: "d30",       label: "30 giorni", accent: "#f43f5e", filterKey: "custom",    customDays: 30   },
] as const;

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  activePeriod?:   string;
  onPeriodSelect?: (filter: string) => void;
  setFrom?:        (v: string) => void;
  setTo?:          (v: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SellerboardCards({
  activePeriod, onPeriodSelect, setFrom, setTo,
}: Props) {
  const [sourceTab, setSourceTab] = useState<SourceTab>("total");
  const [periods,   setPeriods]   = useState<Record<string, PeriodData>>({});
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tod    = todayStr();
      const from14 = nDaysAgoStr(14);
      const from30 = nDaysAgoStr(30);

      const [ovS, ovA, s7, a7, s14, a14, s30, a30] = await Promise.all([
        api.overview().catch((): ShopifyOverview | null => null),
        api.amazon.overview().catch((): AmazonOverview | null => null),
        api.summary({ filter: "last7" }).catch((): Summary | null => null),
        api.amazon.summary({ filter: "last7" }).catch((): AmazonSummary | null => null),
        api.summary({ filter: "custom", from: from14, to: tod }).catch((): Summary | null => null),
        api.amazon.summary({ filter: "custom", from: from14, to: tod }).catch((): AmazonSummary | null => null),
        api.summary({ filter: "custom", from: from30, to: tod }).catch((): Summary | null => null),
        api.amazon.summary({ filter: "custom", from: from30, to: tod }).catch((): AmazonSummary | null => null),
      ]);

      function sOv(k: keyof Omit<ShopifyOverview, "meta">): ShopifySlice | null {
        if (!ovS) return null;
        const p = ovS[k] as import("@/lib/api").ShopifyPeriodStats;
        return { grossRevenue: p.grossRevenue, netRevenue: p.netRevenue, orderCount: p.orderCount, refunds: p.refunds, pctChange: p.pctChange };
      }
      function aOv(k: keyof Omit<AmazonOverview, "meta">): AmazonSlice | null {
        if (!ovA) return null;
        const p = ovA[k] as import("@/lib/api").AmazonPeriodStats;
        return { grossRevenue: p.grossRevenue, estPayout: p.estPayout, orderCount: p.orderCount, unitsSold: p.unitsSold, adSpend: p.adSpend, pctChange: p.pctChange };
      }
      function sSm(s: Summary | null): ShopifySlice | null {
        if (!s) return null;
        return { grossRevenue: s.totalRevenue, netRevenue: s.netRevenue, orderCount: s.orderCount, refunds: s.totalRefunds, pctChange: null };
      }
      function aSm(a: AmazonSummary | null): AmazonSlice | null {
        if (!a) return null;
        return { grossRevenue: a.totalRevenue, estPayout: a.estimatedPayout, orderCount: a.orderCount, unitsSold: a.unitsSold, adSpend: a.adSpend, pctChange: null };
      }

      setPeriods({
        today:     { shopify: sOv("today"),     amazon: aOv("today")     },
        yesterday: { shopify: sOv("yesterday"),  amazon: aOv("yesterday")  },
        d7:        { shopify: sSm(s7),           amazon: aSm(a7)           },
        d14:       { shopify: sSm(s14),          amazon: aSm(a14)          },
        d30:       { shopify: sSm(s30),          amazon: aSm(a30)          },
      });
      setLastFetch(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  // ── Derived values ─────────────────────────────────────────────────────────
  function derive(d: PeriodData) {
    const s = sourceTab !== "amazon"  ? d.shopify : null;
    const a = sourceTab !== "shopify" ? d.amazon  : null;
    const gross   = (s?.grossRevenue ?? 0) + (a?.grossRevenue ?? 0);
    const net     = (s?.netRevenue   ?? 0) + (a?.estPayout   ?? 0);
    const orders  = (s?.orderCount   ?? 0) + (a?.orderCount  ?? 0);
    const units   =  a?.unitsSold  ?? null;
    const refunds =  s?.refunds    ?? null;
    const adSpend =  a?.adSpend    ?? null;
    const payout  =  a?.estPayout  ?? null;
    const margin  = gross > 0 ? (net / gross) * 100 : null;

    // pct: weighted blend of Shopify + Amazon
    const sPct = s?.pctChange ?? null;
    const aPct = a?.pctChange ?? null;
    let pct: number | null = null;
    if (sPct !== null || aPct !== null) {
      const totalW = (s?.grossRevenue ?? 0) + (a?.grossRevenue ?? 0);
      pct = totalW > 0
        ? ((sPct ?? 0) * (s?.grossRevenue ?? 0) + (aPct ?? 0) * (a?.grossRevenue ?? 0)) / totalW
        : sPct ?? aPct;
    }

    return { gross, net, orders, units, refunds, adSpend, payout, margin, pct };
  }

  function isActive(colKey: string): boolean {
    if (colKey === "today"     && activePeriod === "today")     return true;
    if (colKey === "yesterday" && activePeriod === "yesterday") return true;
    if (colKey === "d7"        && activePeriod === "last7")     return true;
    return false;
  }

  function handleClick(col: typeof PERIOD_COLS[number]) {
    if (!onPeriodSelect) return;
    if (col.customDays !== null) {
      setFrom?.(nDaysAgoStr(col.customDays));
      setTo?.(todayStr());
      onPeriodSelect("custom");
    } else {
      onPeriodSelect(col.filterKey as string);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(["total", "shopify", "amazon"] as SourceTab[]).map(tab => {
            const label = tab === "total" ? "Totale" : tab === "shopify" ? "Shopify" : "Amazon";
            const color = tab === "total" ? "#6366f1" : tab === "shopify" ? "#10b981" : "#f59e0b";
            const active = sourceTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setSourceTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  active ? "" : "border-bg-border text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
                }`}
                style={active ? { background: color + "18", borderColor: color + "55", color } : {}}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {lastFetch && (
            <span className="text-[10px] text-zinc-700 hidden lg:block">
              Aggiornato {lastFetch.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={load}
            className="p-1.5 rounded-lg border border-bg-border text-zinc-500 hover:text-white transition-colors"
            title="Aggiorna"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Cards row ── */}
      <div className="grid grid-cols-5 gap-2">
        {PERIOD_COLS.map(col => {
          const active = isActive(col.key);
          const d      = periods[col.key];
          const vals   = d ? derive(d) : null;

          return (
            <div
              key={col.key}
              onClick={() => handleClick(col)}
              className={`relative rounded-xl border bg-bg-card cursor-pointer transition-all overflow-hidden group ${
                active
                  ? "border-zinc-600 shadow-lg"
                  : "border-bg-border hover:border-zinc-600"
              }`}
            >
              {/* Top accent bar */}
              <div
                className="h-[3px] w-full transition-opacity"
                style={{
                  background: col.accent,
                  opacity: active ? 1 : 0.25,
                }}
              />

              {/* Header */}
              <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-1">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: active ? col.accent : "#71717a" }}
                >
                  {col.label}
                </span>
                {vals?.pct !== null && vals?.pct !== undefined && (
                  <PctBadge pct={vals.pct} />
                )}
              </div>

              {/* Hero revenue */}
              <div className="px-3.5 pb-3">
                {!vals ? (
                  <div className="h-7 w-24 bg-zinc-800 rounded animate-pulse mb-1" />
                ) : (
                  <p className="text-xl font-bold text-white tabular-nums leading-tight">
                    {fmtEur(vals.gross)}
                  </p>
                )}
                <p className="text-[10px] text-zinc-600 mt-0.5">Fatturato lordo</p>
              </div>

              {/* Divider */}
              <div className="mx-3.5 border-t border-bg-border/60" />

              {/* Metric rows */}
              <div className="px-3.5 py-3 space-y-1.5">
                <MetricRow label="Ordini" value={vals ? vals.orders.toLocaleString("it-IT") : null} />

                {(sourceTab === "total" || sourceTab === "amazon") && (
                  <MetricRow
                    label="Unità"
                    value={vals?.units != null ? vals.units.toLocaleString("it-IT") : null}
                  />
                )}

                {(sourceTab === "total" || sourceTab === "shopify") && (
                  <MetricRow
                    label="Resi"
                    value={vals?.refunds != null ? (vals.refunds > 0 ? `−${fmtEur(vals.refunds)}` : "—") : null}
                    color={vals?.refunds != null && vals.refunds > 0 ? "#f59e0b" : undefined}
                  />
                )}

                {(sourceTab === "total" || sourceTab === "amazon") && (
                  <MetricRow
                    label="Ad Spend"
                    value={vals?.adSpend != null ? (vals.adSpend > 0 ? fmtEur(vals.adSpend) : "—") : null}
                    color={vals?.adSpend != null && vals.adSpend > 0 ? "#a78bfa" : undefined}
                  />
                )}

                {(sourceTab === "total" || sourceTab === "amazon") && (
                  <MetricRow
                    label="Payout"
                    value={vals?.payout != null ? fmtEur(vals.payout) : null}
                    color="#10b981"
                  />
                )}

                <div className="pt-0.5 border-t border-bg-border/40">
                  <MetricRow
                    label="Netto"
                    value={vals ? fmtEur(vals.net) : null}
                    color="#10b981"
                    bold
                  />
                </div>

                {vals?.margin != null && (
                  <MetricRow
                    label="Margine"
                    value={`${vals.margin.toFixed(1)}%`}
                    color={
                      vals.margin >= 30 ? "#10b981"
                      : vals.margin >= 15 ? "#f59e0b"
                      : "#f43f5e"
                    }
                  />
                )}
              </div>

              {/* Active glow overlay */}
              {active && (
                <div
                  className="absolute inset-0 pointer-events-none rounded-xl"
                  style={{
                    boxShadow: `inset 0 0 0 1px ${col.accent}33`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricRow({
  label, value, color, bold,
}: {
  label: string;
  value: string | null;
  color?: string;
  bold?:  boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-[11px] text-zinc-600 shrink-0">{label}</span>
      {value === null ? (
        <div className="h-3 w-12 bg-zinc-800 rounded animate-pulse" />
      ) : (
        <span
          className={`text-[11px] tabular-nums ${bold ? "font-semibold" : ""}`}
          style={{ color: color ?? "#a1a1aa" }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function PctBadge({ pct }: { pct: number }) {
  const pos  = pct > 0;
  const neg  = pct < 0;
  const Icon = pos ? TrendingUp : neg ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold shrink-0 ${
        pos ? "text-emerald-400" : neg ? "text-red-400" : "text-zinc-500"
      }`}
    >
      <Icon size={9} />
      {pos ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}
