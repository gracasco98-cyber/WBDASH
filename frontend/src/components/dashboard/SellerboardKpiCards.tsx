"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import {
  api,
  ShopifyOverview,
  ShopifyPeriodStats,
  AmazonOverview,
  AmazonPeriodStats,
  Summary,
  AmazonSummary,
} from "@/lib/api";
import { fmtEur, fmtNum, fmtPct } from "@/lib/fmt";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  activePeriod?:    string;
  onPeriodSelect?:  (filter: string) => void;
  setFrom?:         (v: string) => void;
  setTo?:           (v: string) => void;
  defaultSource?:   SourceTab;
}

// ─── Source tab ───────────────────────────────────────────────────────────────

type SourceTab = "total" | "shopify" | "amazon";

// ─── Card header colors ───────────────────────────────────────────────────────

const HEADER_COLORS: Record<string, string> = {
  today:     "#e8d5b7",
  yesterday: "#f0dcc8",
  d7:        "#f5e5d4",
  d14:       "#faeee6",
  d30:       "#fdf7f0",
};

// ─── Period config ────────────────────────────────────────────────────────────

interface PeriodConfig {
  key:         string;
  label:       string;
  filterKey:   string;   // key passed to onPeriodSelect
}

const PERIODS: PeriodConfig[] = [
  { key: "today",     label: "Oggi",      filterKey: "today"    },
  { key: "yesterday", label: "Ieri",      filterKey: "yesterday" },
  { key: "d7",        label: "7 giorni",  filterKey: "last7"    },
  { key: "d14",       label: "14 giorni", filterKey: "custom"   },
  { key: "d30",       label: "30 giorni", filterKey: "custom"   },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function nDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateRangeLabel(key: string): string {
  const now = new Date();
  const fmt = (d: Date) =>
    d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });

  if (key === "today")     return fmt(now);
  if (key === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return fmt(d);
  }
  const n = key === "d7" ? 7 : key === "d14" ? 14 : 30;
  const from = new Date(now);
  from.setDate(from.getDate() - n + 1);
  return `${fmtShort(from)} - ${fmtShort(now)}`;
}

// ─── Weighted-average pct ─────────────────────────────────────────────────────

function weightedPct(
  aPct: number | null, aW: number,
  bPct: number | null, bW: number,
): number | null {
  if (aPct === null && bPct === null) return null;
  const total = aW + bW;
  if (total === 0) return null;
  return ((aPct ?? 0) * aW + (bPct ?? 0) * bW) / total;
}

// ─── Combined KPI per card ────────────────────────────────────────────────────

interface CardKpi {
  sales:      number;   // shopify.grossRevenue + amazon.grossRevenue
  orders:     number;   // shopify.orderCount + amazon.orderCount
  units:      number;   // amazon.unitsSold
  refundsAmt: number;   // shopify.refunds (euro amount)
  advCost:    number;   // amazon.adSpend (negative representation)
  estPayout:  number;   // amazon.estPayout
  netProfit:  number;   // (shopify.netRevenue + amazon.estPayout) - amazon.adSpend
  marginPct:  number | null;
  pctChange:  number | null;
}

function buildKpiTotal(
  s: ShopifyPeriodStats | null,
  a: AmazonPeriodStats  | null,
  pctOverride?: number | null,
): CardKpi {
  const sGross    = s?.grossRevenue ?? 0;
  const sNet      = s?.netRevenue   ?? 0;
  const sOrders   = s?.orderCount   ?? 0;
  const sRefunds  = s?.refunds      ?? 0;
  const aGross    = a?.grossRevenue ?? 0;
  const aOrders   = a?.orderCount   ?? 0;
  const aUnits    = a?.unitsSold    ?? 0;
  const aAdSpend  = a?.adSpend      ?? 0;
  const aPayout   = a?.estPayout    ?? 0;

  const sales     = sGross + aGross;
  const orders    = sOrders + aOrders;
  const netProfit = (sNet + aPayout) - aAdSpend;
  const marginPct = sales > 0 ? (netProfit / sales) * 100 : null;

  const pctChange = pctOverride !== undefined
    ? pctOverride
    : weightedPct(s?.pctChange ?? null, sGross, a?.pctChange ?? null, aGross);

  return {
    sales, orders,
    units:      aUnits,
    refundsAmt: sRefunds,
    advCost:    aAdSpend,
    estPayout:  aPayout,
    netProfit,
    marginPct,
    pctChange,
  };
}

function buildKpiShopify(s: ShopifyPeriodStats | null): CardKpi {
  const gross   = s?.grossRevenue ?? 0;
  const net     = s?.netRevenue   ?? 0;
  const margin  = gross > 0 ? (net / gross) * 100 : null;
  return {
    sales:      gross,
    orders:     s?.orderCount  ?? 0,
    units:      0,
    refundsAmt: s?.refunds     ?? 0,
    advCost:    0,
    estPayout:  0,
    netProfit:  net,
    marginPct:  margin,
    pctChange:  s?.pctChange   ?? null,
  };
}

function buildKpiAmazon(a: AmazonPeriodStats | null): CardKpi {
  const gross   = a?.grossRevenue ?? 0;
  const payout  = a?.estPayout    ?? 0;
  const adSpend = a?.adSpend      ?? 0;
  const net     = payout - adSpend;
  const margin  = gross > 0 ? (net / gross) * 100 : null;
  return {
    sales:      gross,
    orders:     a?.orderCount ?? 0,
    units:      a?.unitsSold  ?? 0,
    refundsAmt: 0,
    advCost:    adSpend,
    estPayout:  payout,
    netProfit:  net,
    marginPct:  margin,
    pctChange:  a?.pctChange  ?? null,
  };
}

function buildKpiFromSummary(
  s: Summary | null,
  a: AmazonSummary | null,
  source: SourceTab,
): CardKpi {
  if (source === "shopify") return buildKpiShopify(s ? {
    grossRevenue: s.totalRevenue,
    netRevenue:   s.netRevenue,
    orderCount:   s.orderCount,
    refunds:      s.totalRefunds,
    pctChange:    null,
  } : null);

  if (source === "amazon") return buildKpiAmazon(a ? {
    grossRevenue:  a.totalRevenue,
    orderCount:    a.orderCount,
    unitsSold:     a.unitsSold,
    cancelledCount: 0,
    adSpend:       a.adSpend,
    estFees:       0,
    estPayout:     a.estimatedPayout,
    pctChange:     null,
  } : null);

  // total
  const sStats: ShopifyPeriodStats | null = s ? {
    grossRevenue: s.totalRevenue,
    netRevenue:   s.netRevenue,
    orderCount:   s.orderCount,
    refunds:      s.totalRefunds,
    pctChange:    null,
  } : null;
  const aStats: AmazonPeriodStats | null = a ? {
    grossRevenue:  a.totalRevenue,
    orderCount:    a.orderCount,
    unitsSold:     a.unitsSold,
    cancelledCount: 0,
    adSpend:       a.adSpend,
    estFees:       0,
    estPayout:     a.estimatedPayout,
    pctChange:     null,
  } : null;
  return buildKpiTotal(sStats, aStats, null);
}

// ─── PCT Badge ────────────────────────────────────────────────────────────────

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const pos  = pct > 0;
  const Icon = pos ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold rounded px-1 py-0.5 ${
        pos
          ? "text-emerald-400 bg-emerald-400/10"
          : "text-red-400 bg-red-400/10"
      }`}
    >
      <Icon size={9} strokeWidth={2.5} />
      {pos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ w = "w-20", h = "h-4" }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded bg-white/10 animate-pulse`} />;
}

// ─── Single KPI Card ──────────────────────────────────────────────────────────

interface CardProps {
  period:    PeriodConfig;
  kpi:       CardKpi | null;
  loading:   boolean;
  isActive:  boolean;
  source:    SourceTab;
  onClick?:  () => void;
}

function KpiCard({ period, kpi, loading, isActive, source, onClick }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const headerColor = HEADER_COLORS[period.key] ?? "#1E3A5F";

  const handleCardClick = () => {
    onClick?.();
  };

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(v => !v);
  };

  const showAdvCost  = source !== "shopify";
  const showEstPayout = source !== "shopify";
  const showUnits    = source !== "shopify";

  return (
    <div
      onClick={handleCardClick}
      className={`flex flex-col rounded-xl overflow-hidden border transition-all select-none
        ${onClick ? "cursor-pointer" : ""}
        ${isActive
          ? "border-white/60 ring-1 ring-white/20 shadow-[0_0_24px_rgba(255,255,255,0.10)]"
          : "border-bg-border hover:border-white/20"
        }
        bg-bg-card`}
    >
      {/* ── Colored header band ── */}
      <div
        className="px-3 py-2.5 shrink-0"
        style={{ backgroundColor: headerColor, minHeight: 60 }}
      >
        <div className="flex items-start justify-between gap-1">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide leading-tight" style={{ color: '#1f2937' }}>
              {period.label}
            </p>
            <p className="text-[10px] mt-0.5 leading-tight" style={{ color: '#4b5563' }}>
              {dateRangeLabel(period.key)}
            </p>
          </div>
          {!loading && kpi && (
            <PctBadge pct={kpi.pctChange} />
          )}
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="px-4 py-3 flex flex-col gap-2.5 flex-1">

        {/* Sales */}
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs text-zinc-500">Sales</span>
          </div>
          {loading ? (
            <Skeleton w="w-28" h="h-7" />
          ) : (
            <p className="text-2xl font-bold text-white tabular-nums leading-tight">
              {fmtEur(kpi?.sales ?? 0)}
            </p>
          )}
        </div>

        {/* Orders / Units · Refunds */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">
              Ordini{showUnits && kpi && kpi.units > 0 ? " / Unita" : ""}
            </p>
            {loading ? <Skeleton /> : (
              <p className="text-sm font-semibold text-white tabular-nums">
                {fmtNum(kpi?.orders ?? 0)}
                {showUnits && kpi && kpi.units > 0 && (
                  <span className="text-zinc-400 font-normal"> / {fmtNum(kpi.units)}</span>
                )}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Resi</p>
            {loading ? <Skeleton /> : (
              <p className={`text-sm font-semibold tabular-nums ${
                kpi && kpi.refundsAmt > 0 ? "text-blue-400" : "text-zinc-600"
              }`}>
                {kpi && kpi.refundsAmt > 0
                  ? fmtEur(kpi.refundsAmt)
                  : "—"}
              </p>
            )}
          </div>
        </div>

        {/* Adv. cost · Est. payout */}
        {(showAdvCost || showEstPayout) && (
          <div className="grid grid-cols-2 gap-2">
            {showAdvCost && (
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Adv. cost</p>
                {loading ? <Skeleton /> : (
                  <p className={`text-sm font-semibold tabular-nums ${
                    kpi && kpi.advCost > 0 ? "text-red-400" : "text-zinc-600"
                  }`}>
                    {kpi && kpi.advCost > 0
                      ? `-${fmtEur(kpi.advCost)}`
                      : "—"}
                  </p>
                )}
              </div>
            )}
            {showEstPayout && (
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Est. payout</p>
                {loading ? <Skeleton /> : (
                  <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                    {fmtEur(kpi?.estPayout ?? 0)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Net profit */}
        <div className="pt-1 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs text-zinc-500">Net profit</span>
            {!loading && kpi && <PctBadge pct={kpi.pctChange} />}
          </div>
          {loading ? <Skeleton w="w-24" h="h-5" /> : (
            <p className="text-base font-semibold text-emerald-400 tabular-nums">
              {fmtEur(kpi?.netProfit ?? 0)}
            </p>
          )}
        </div>

        {/* Expanded section */}
        {expanded && (
          <div className="pt-1 border-t border-white/[0.06] flex flex-col gap-2">
            {/* Margin % */}
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Margin %</p>
              {loading ? <Skeleton w="w-16" /> : (
                <p className={`text-sm font-semibold tabular-nums ${
                  kpi && kpi.marginPct !== null
                    ? kpi.marginPct >= 20
                      ? "text-emerald-400"
                      : kpi.marginPct >= 10
                        ? "text-amber-400"
                        : "text-red-400"
                    : "text-zinc-600"
                }`}>
                  {kpi?.marginPct !== null && kpi?.marginPct !== undefined
                    ? fmtPct(kpi.marginPct)
                    : "—"}
                </p>
              )}
            </div>

            {/* Units (Amazon) */}
            {showUnits && (
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Unita (Amazon)</p>
                {loading ? <Skeleton w="w-12" /> : (
                  <p className="text-sm font-semibold text-white tabular-nums">
                    {fmtNum(kpi?.units ?? 0)}
                  </p>
                )}
              </div>
            )}

            {/* Resi / Rimborsi */}
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Resi / Rimborsi</p>
              {loading ? <Skeleton w="w-20" /> : (
                <p className={`text-sm font-semibold tabular-nums ${
                  kpi && kpi.refundsAmt > 0 ? "text-amber-400" : "text-zinc-600"
                }`}>
                  {kpi && kpi.refundsAmt > 0
                    ? fmtEur(kpi.refundsAmt)
                    : "—"}
                </p>
              )}
            </div>
          </div>
        )}

        {/* More / Less button */}
        <button
          onClick={handleMoreClick}
          className="mt-auto pt-1 flex items-center justify-center gap-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? (
            <>Meno <ChevronUp size={11} /></>
          ) : (
            <>More <ChevronDown size={11} /></>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Source Tab Button ────────────────────────────────────────────────────────

const SOURCE_META: Record<SourceTab, { label: string; color: string }> = {
  total:   { label: "Totale",  color: "#6366f1" },
  shopify: { label: "Shopify", color: "#6ee7b7" },
  amazon:  { label: "Amazon",  color: "#fbbf24" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SellerboardKpiCards({
  activePeriod,
  onPeriodSelect,
  setFrom,
  setTo,
  defaultSource = "total",
}: Props) {
  // ── State ──
  const [sourceTab, setSourceTab] = useState<SourceTab>(defaultSource);

  // Overview data (today + yesterday come from overview endpoints)
  const [shopifyOv, setShopifyOv] = useState<ShopifyOverview | null>(null);
  const [amazonOv,  setAmazonOv]  = useState<AmazonOverview  | null>(null);

  // Period summary data
  const [s7,  setS7]  = useState<Summary       | null>(null);
  const [a7,  setA7]  = useState<AmazonSummary | null>(null);
  const [s14, setS14] = useState<Summary       | null>(null);
  const [a14, setA14] = useState<AmazonSummary | null>(null);
  const [s30, setS30] = useState<Summary       | null>(null);
  const [a30, setA30] = useState<AmazonSummary | null>(null);

  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // ── Load data ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = toISODate(new Date());
      const from14 = toISODate(nDaysAgo(13)); // 14 days inclusive
      const from30 = toISODate(nDaysAgo(29)); // 30 days inclusive

      const [ov, aOv, sum7, aSum7, sum14, aSum14, sum30, aSum30] = await Promise.all([
        api.overview(),
        api.amazon.overview(),
        api.summary({ filter: "last7" }),
        api.amazon.summary({ filter: "last7" }),
        api.summary({ filter: "custom", from: from14, to: today }),
        api.amazon.summary({ filter: "custom", from: from14, to: today }),
        api.summary({ filter: "custom", from: from30, to: today }),
        api.amazon.summary({ filter: "custom", from: from30, to: today }),
      ]);

      setShopifyOv(ov);
      setAmazonOv(aOv);
      setS7(sum7);   setA7(aSum7);
      setS14(sum14); setA14(aSum14);
      setS30(sum30); setA30(aSum30);
      setLastFetch(new Date());
    } catch (err) {
      console.error("[SellerboardKpiCards] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(load, 300_000);
    return () => clearInterval(t);
  }, [load]);

  // ── Build KPI per card ──
  const kpiForPeriod = useCallback((key: string): CardKpi | null => {
    if (loading) return null;

    if (key === "today" || key === "yesterday") {
      const sData = shopifyOv ? (shopifyOv[key as "today" | "yesterday"] as ShopifyPeriodStats) : null;
      const aData = amazonOv  ? (amazonOv[key  as "today" | "yesterday"] as AmazonPeriodStats)  : null;

      if (sourceTab === "shopify") return buildKpiShopify(sData);
      if (sourceTab === "amazon")  return buildKpiAmazon(aData);
      return buildKpiTotal(
        sData,
        aData,
        weightedPct(
          sData?.pctChange ?? null, sData?.grossRevenue ?? 0,
          aData?.pctChange ?? null, aData?.grossRevenue ?? 0,
        ),
      );
    }

    // 7d / 14d / 30d
    const [sSum, aSum] =
      key === "d7"  ? [s7,  a7]  :
      key === "d14" ? [s14, a14] :
                      [s30, a30];

    return buildKpiFromSummary(sSum, aSum, sourceTab);
  }, [loading, shopifyOv, amazonOv, s7, a7, s14, a14, s30, a30, sourceTab]);

  // ── Handle card click ──
  const handleCardClick = (period: PeriodConfig) => {
    if (!onPeriodSelect) return;

    if (period.key === "d14" || period.key === "d30") {
      const n     = period.key === "d14" ? 13 : 29;
      const today = toISODate(new Date());
      const from  = toISODate(nDaysAgo(n));
      setFrom?.(from);
      setTo?.(today);
    }
    onPeriodSelect(period.filterKey);
  };

  // ── Render ──
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">

      {/* Header bar */}
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">
            5 periodi a confronto &middot; Sellerboard KPI
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lastFetch && (
            <span className="text-[10px] text-zinc-700 hidden sm:block">
              {lastFetch.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={load}
            className="p-1.5 rounded-lg border border-bg-border text-zinc-500 hover:text-white transition-colors"
            title="Aggiorna dati"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Source toggle */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-bg-border overflow-x-auto scrollbar-hide">
        {(["total", "shopify", "amazon"] as SourceTab[]).map(tab => {
          const { label, color } = SOURCE_META[tab];
          const isActive = sourceTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setSourceTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all shrink-0 ${
                isActive
                  ? "text-white"
                  : "border-bg-border text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
              }`}
              style={isActive ? {
                background:  color + "20",
                borderColor: color + "55",
                color,
              } : {}}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      <div className="p-4">
        {/* Mobile: horizontal scroll */}
        <div className="sm:hidden -mx-4 px-4">
          <div
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {PERIODS.map(period => {
              const kpi      = kpiForPeriod(period.key);
              const isActive = activePeriod === period.filterKey;
              return (
                <div key={period.key} className="snap-start shrink-0 w-[78vw] max-w-[280px]">
                  <KpiCard
                    period={period}
                    kpi={kpi}
                    loading={loading}
                    isActive={isActive}
                    source={sourceTab}
                    onClick={onPeriodSelect ? () => handleCardClick(period) : undefined}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-1 mt-2">
            {PERIODS.map(p => (
              <div key={p.key} className="w-1 h-1 rounded-full bg-zinc-700" />
            ))}
          </div>
        </div>

        {/* Desktop: 5-column grid */}
        <div className="hidden sm:grid grid-cols-5 gap-3">
          {PERIODS.map(period => {
            const kpi      = kpiForPeriod(period.key);
            const isActive = activePeriod === period.filterKey;
            return (
              <KpiCard
                key={period.key}
                period={period}
                kpi={kpi}
                loading={loading}
                isActive={isActive}
                source={sourceTab}
                onClick={onPeriodSelect ? () => handleCardClick(period) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
