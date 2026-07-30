"use client";
import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { api, ShopifyOverview, ShopifyPeriodStats, AmazonOverview, AmazonPeriodStats } from "@/lib/api";
import { getMeta } from "@/lib/marketplaces";
import { fmtEur } from "@/lib/fmt";

// â”€â”€â”€ Marketplace tab config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MP_FLAG: Record<string, string> = {
  REDCARE_IT:     "it",
  REDCARE_DE:     "de",
  TEMU_IT:        "it",
  TEMU_FR:        "fr",
  TEMU_DE:        "de",
  TEMU_ES:        "es",
  BENU_FARMA:     "ch",
  SHOPIFY_DIRECT: "it",
  TIKTOK:         "",
  EBAY:           "",
  ALIEXPRESS:     "",
};

const SHOPIFY_TAB_ORDER = [
  "all",
  "REDCARE_IT", "REDCARE_DE",
  "TEMU_IT", "TEMU_FR", "TEMU_DE", "TEMU_ES",
  "EBAY", "BENU_FARMA", "TIKTOK", "SHOPIFY_DIRECT", "ALIEXPRESS",
];

const AMAZON_TABS = [
  { value: "all", label: "Tutti EU" },
  { value: "IT",  label: "ðŸ‡®ðŸ‡¹ IT" },
  { value: "DE",  label: "ðŸ‡©ðŸ‡ª DE" },
  { value: "FR",  label: "ðŸ‡«ðŸ‡· FR" },
  { value: "ES",  label: "ðŸ‡ªðŸ‡¸ ES" },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FlagImg({ code }: { code: string }) {
  if (!code) return null;
  return (
    <img
      src={`/images/flags/${code}.png`}
      alt={code}
      className="inline-block object-cover rounded-[2px] shrink-0"
      style={{ width: 14, height: 10 }}
    />
  );
}

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-zinc-700 text-[10px]">â€”</span>;
  const pos = pct > 0;
  const neg = pct < 0;
  const Icon = pos ? TrendingUp : neg ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
      pos ? "text-emerald-400" : neg ? "text-red-400" : "text-zinc-500"
    }`}>
      <Icon size={9} />
      {pos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function SkeletonCell() {
  return <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />;
}

// Weighted-average pct change for merged view
function mergedPct(
  aPct: number | null, aWeight: number,
  bPct: number | null, bWeight: number,
): number | null {
  if (aPct === null && bPct === null) return null;
  const total = aWeight + bWeight;
  if (total === 0) return null;
  const aContrib = aPct !== null ? aPct * aWeight : 0;
  const bContrib = bPct !== null ? bPct * bWeight : 0;
  return (aContrib + bContrib) / total;
}

// â”€â”€â”€ Row type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Row {
  key:    string;
  label:  string;
  value:  string | null;
  color:  string;
  bold?:  boolean;
  small?: boolean;
  separator?: boolean; // thin line above this row
}

// â”€â”€â”€ Period column â€” unified renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ColProps {
  label:       string;
  sub?:        string;
  rows:        Row[];
  pctChange:   number | null;
  loading:     boolean;
  accent?:     "blue" | "purple" | "amber" | "green";
  isForecast?: boolean;
  onClick?:    () => void;
  isActive?:   boolean;
  /** Hero number shown large between header and rows (used in "Totale" view) */
  heroValue?:  string;
  heroLabel?:  string;
  showHero?:   boolean;
}

function PeriodCol({ label, sub, rows, pctChange, loading, accent, isForecast, onClick, isActive, heroValue, heroLabel, showHero }: ColProps) {
  const borderColor =
    isActive            ? "border-accent-primary/60"
    : accent === "blue"   ? "border-[#FFC300]/25"
    : accent === "purple" ? "border-[#ECCB08]/25"
    : accent === "amber"  ? "border-[#D4AF00]/25"
    : accent === "green"  ? "border-[#F4B400]/25"
    : "border-zinc-800/60";

  const headerBg =
    isActive            ? "bg-accent-primary/10"
    : accent === "blue"   ? "bg-[#FFC300]/8"
    : accent === "purple" ? "bg-[#ECCB08]/8"
    : accent === "amber"  ? "bg-[#D4AF00]/8"
    : accent === "green"  ? "bg-[#F4B400]/8"
    : "bg-zinc-900/40";

  return (
    <div
      onClick={onClick}
      className={`flex flex-col border ${borderColor} rounded-xl overflow-hidden bg-bg-card transition-all
        ${onClick ? "cursor-pointer hover:border-accent-primary/40 hover:shadow-[0_0_14px_rgba(99,102,241,0.08)]" : ""}
        ${isActive ? "shadow-[0_0_18px_rgba(99,102,241,0.12)]" : ""}`}
    >
      {/* Card header */}
      <div className={`${headerBg} px-3.5 py-2.5 border-b ${borderColor}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide leading-none">
            {label}
          </span>
          {onClick && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
              isActive
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-zinc-800/80 text-zinc-600"
            }`}>
              {isActive ? "Attivo" : "Filtra"}
            </span>
          )}
        </div>
        {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
        {isForecast && <div className="text-[10px] text-zinc-600 mt-0.5">proiezione mese</div>}
        <div className="mt-1.5">
          {loading ? <SkeletonCell /> : <PctBadge pct={pctChange} />}
        </div>
      </div>

      {/* â”€â”€ Hero number (total gross) â€” only when in "Totale" view â”€â”€ */}
      {showHero && (
        <div className="px-3.5 py-3 border-b border-zinc-800/50 bg-emerald-500/[0.04]">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">
            {heroLabel ?? "Fatturato Lordo Totale"}
          </div>
          {loading ? (
            <div className="h-8 w-32 bg-zinc-800 rounded animate-pulse" />
          ) : (
            <div className="text-3xl font-bold text-emerald-400 tabular-nums leading-none">
              {heroValue}
            </div>
          )}
        </div>
      )}

      {/* Metric rows */}
      <div className="flex flex-col divide-y divide-zinc-800/40">
        {rows.map(row => (
          <div
            key={row.key}
            className={`flex items-center justify-between px-3 sm:px-3.5 py-1.5 sm:py-2 gap-2 ${
              row.separator ? "border-t border-zinc-800/60 mt-0.5 pt-2" : ""
            }`}
          >
            <span className={`text-[10px] shrink-0 ${row.small ? "text-zinc-600" : "text-zinc-500"}`}>
              {row.label}
            </span>
            {loading ? (
              <SkeletonCell />
            ) : (
              <span className={`text-xs sm:text-sm tabular-nums text-right ${row.color} ${row.bold ? "font-semibold" : "font-medium"}`}>
                {row.value ?? "â€”"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// â”€â”€â”€ Row builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function shopifyRows(data: ShopifyPeriodStats | null): Row[] {
  return [
    {
      key: "gross", label: "Fatturato lordo",
      value: data ? fmtEur(data.grossRevenue) : null,
      color: "text-white", bold: true,
    },
    {
      key: "net", label: "Netto",
      value: data ? fmtEur(data.netRevenue) : null,
      color: "text-emerald-400", bold: true,
    },
    {
      key: "orders", label: "Ordini",
      value: data ? String(data.orderCount) : null,
      color: "text-zinc-300",
    },
    {
      key: "refunds", label: "Resi / Rimborsi",
      value: data ? (data.refunds > 0 ? `âˆ’${fmtEur(data.refunds)}` : "â€”") : null,
      color: data && data.refunds > 0 ? "text-amber-400" : "text-zinc-600",
      small: true,
    },
    {
      key: "margin", label: "Margine %",
      value: data && data.grossRevenue > 0
        ? `${((data.netRevenue / data.grossRevenue) * 100).toFixed(1)}%`
        : null,
      color: data && data.grossRevenue > 0
        ? (data.netRevenue / data.grossRevenue) >= 0.25 ? "text-emerald-400/80"
        : (data.netRevenue / data.grossRevenue) >= 0.10 ? "text-amber-400/80"
        : "text-red-400/80"
        : "text-zinc-600",
      small: true,
    },
  ];
}

function amazonRows(data: AmazonPeriodStats | null): Row[] {
  return [
    {
      key: "gross", label: "Venduto lordo",
      value: data ? fmtEur(data.grossRevenue) : null,
      color: "text-white", bold: true,
    },
    {
      key: "payout", label: "Payout stimato",
      value: data ? fmtEur(data.estPayout) : null,
      color: "text-amber-400", bold: true,
    },
    {
      key: "orders", label: "Ordini",
      value: data ? String(data.orderCount) : null,
      color: "text-zinc-300",
    },
    {
      key: "units", label: "UnitÃ  vendute",
      value: data ? String(data.unitsSold) : null,
      color: "text-zinc-400", small: true,
    },
    {
      key: "adSpend", label: "Ad Spend PPC",
      value: data ? (data.adSpend > 0 ? fmtEur(data.adSpend) : "â€”") : null,
      color: data && data.adSpend > 0 ? "text-purple-400" : "text-zinc-600",
      small: true,
    },
    {
      key: "margin", label: "Margine stim. %",
      value: data && data.grossRevenue > 0
        ? `${((data.estPayout / data.grossRevenue) * 100).toFixed(1)}%`
        : null,
      color: data && data.grossRevenue > 0
        ? (data.estPayout / data.grossRevenue) >= 0.30 ? "text-emerald-400/80"
        : (data.estPayout / data.grossRevenue) >= 0.15 ? "text-amber-400/80"
        : "text-red-400/80"
        : "text-zinc-600",
      small: true,
    },
  ];
}

function totalRows(s: ShopifyPeriodStats | null, a: AmazonPeriodStats | null): Row[] {
  const totalGross = (s?.grossRevenue ?? 0) + (a?.grossRevenue ?? 0);
  const totalNet   = (s?.netRevenue   ?? 0) + (a?.estPayout   ?? 0);
  const totalOrd   = (s?.orderCount   ?? 0) + (a?.orderCount  ?? 0);
  const margin     = totalGross > 0 ? (totalNet / totalGross) * 100 : null;

  return [
    {
      key: "shopify", label: "Shopify",
      value: s ? fmtEur(s.grossRevenue) : null,
      color: "text-emerald-400/80",
    },
    {
      key: "amazon", label: "Amazon",
      value: a ? fmtEur(a.grossRevenue) : null,
      color: "text-amber-400/80",
    },
    {
      key: "totalGross", label: "Lordo totale",
      value: (s || a) ? fmtEur(totalGross) : null,
      color: "text-white", bold: true, separator: true,
    },
    {
      key: "orders", label: "Ordini totali",
      value: (s || a) ? String(totalOrd) : null,
      color: "text-zinc-300",
    },
    {
      key: "adSpend", label: "Ad Spend (Amazon)",
      value: a ? (a.adSpend > 0 ? fmtEur(a.adSpend) : "â€”") : null,
      color: a && a.adSpend > 0 ? "text-purple-400" : "text-zinc-600",
      small: true,
    },
    {
      key: "refunds", label: "Rimborsi (Shopify)",
      value: s ? (s.refunds > 0 ? `âˆ’${fmtEur(s.refunds)}` : "â€”") : null,
      color: s && s.refunds > 0 ? "text-amber-400" : "text-zinc-600",
      small: true,
    },
    {
      key: "margin", label: "Margine medio %",
      value: margin !== null ? `${margin.toFixed(1)}%` : null,
      color: margin !== null
        ? margin >= 25 ? "text-emerald-400/80"
        : margin >= 12 ? "text-amber-400/80"
        : "text-red-400/80"
        : "text-zinc-600",
      small: true,
    },
  ];
}

// â”€â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Props {
  activeMarketplaces?: string[];
  onPeriodSelect?: (filter: string) => void;
  activePeriod?: string;
  /** When true (Overview page): show aggregated Shopify + Amazon totals */
  includeAmazon?: boolean;
  /** Called when the user changes the internal marketplace sub-filter */
  onMarketplaceSelect?: (mp: string) => void;
}

type SourceTab = "total" | "shopify" | "amazon";

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ShopifyBIOverview({ activeMarketplaces, onPeriodSelect, activePeriod, includeAmazon = false, onMarketplaceSelect }: Props) {
  // Source view â€” only relevant when includeAmazon
  const [sourceTab, setSourceTab] = useState<SourceTab>("total");

  // Shopify marketplace sub-filter
  const [selectedMp, setSelectedMp] = useState("all");

  // Data
  const [shopifyData, setShopifyData] = useState<ShopifyOverview | null>(null);
  const [amazonData,  setAmazonData]  = useState<AmazonOverview | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [lastFetch,   setLastFetch]   = useState<Date | null>(null);

  const shopifyTabs = SHOPIFY_TAB_ORDER.filter(mp =>
    mp === "all" || !activeMarketplaces || activeMarketplaces.includes(mp)
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const shopifyParams: Record<string, string> = {};
      if (selectedMp !== "all" && sourceTab !== "amazon") shopifyParams.marketplace = selectedMp;

      if (includeAmazon) {
        const amazonMp = sourceTab === "amazon" ? selectedMp : undefined;
        const amazonParams: Record<string, string> = {};
        if (amazonMp && amazonMp !== "all") amazonParams.marketplace = amazonMp;

        const [s, a] = await Promise.all([
          api.overview(shopifyParams),
          api.amazon.overview(amazonParams),
        ]);
        setShopifyData(s);
        setAmazonData(a);
      } else {
        setShopifyData(await api.overview(shopifyParams));
      }
      setLastFetch(new Date());
    } catch (e) {
      console.error("[ShopifyBIOverview] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedMp, sourceTab, includeAmazon]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const CARD_TO_FILTER: Record<string, string> = {
    today:     "today",
    yesterday: "yesterday",
    mtd:       "month",
  };

  const columns: Array<{
    key:       keyof Omit<ShopifyOverview, "meta">;
    label:     string;
    accent?:   "blue" | "purple" | "amber" | "green";
    isForecast?: boolean;
  }> = [
    { key: "today",     label: "Oggi",           accent: "blue"   },
    { key: "yesterday", label: "Ieri",            accent: "purple" },
    { key: "mtd",       label: "Mese in corso",   accent: "amber"  },
    { key: "forecast",  label: "Previsione mese", isForecast: true },
    { key: "lastMonth", label: "Mese scorso",     accent: "green"  },
  ];

  // Section title
  const titleLabel = !includeAmazon
    ? "Business Intelligence â€” Shopify"
    : sourceTab === "total"   ? "Business Intelligence â€” Totale (Shopify + Amazon)"
    : sourceTab === "shopify" ? "Business Intelligence â€” Shopify"
    :                           "Business Intelligence â€” Amazon";

  const selectedMeta = selectedMp === "all"
    ? { label: includeAmazon && sourceTab === "total" ? "Tutti i canali" : "Tutti i canali", color: "#6366f1" }
    : getMeta(selectedMp);

  // Summary bar data
  const sToday = shopifyData?.today;
  const aToday = amazonData?.today;
  const sMtd   = shopifyData?.mtd;
  const aMtd   = amazonData?.mtd;
  const sFcast  = shopifyData?.forecast;
  const aFcast  = amazonData?.forecast;
  const sLast   = shopifyData?.lastMonth;
  const aLast   = amazonData?.lastMonth;

  const totalTodayGross  = (sToday?.grossRevenue  ?? 0) + (aToday?.grossRevenue ?? 0);
  const totalMtdGross    = (sMtd?.grossRevenue    ?? 0) + (aMtd?.grossRevenue   ?? 0);
  const totalMtdNet      = (sMtd?.netRevenue      ?? 0) + (aMtd?.estPayout      ?? 0);
  const totalFcastGross  = (sFcast?.grossRevenue  ?? 0) + (aFcast?.grossRevenue  ?? 0);
  const totalLastGross   = (sLast?.grossRevenue   ?? 0) + (aLast?.grossRevenue   ?? 0);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">

      {/* â”€â”€ Section header â”€â”€ */}
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: selectedMeta.color }}
          />
          <p className="text-[10px] text-zinc-500">
            5 periodi a confronto
            {sourceTab !== "amazon" && shopifyData && (
              <> Â· giorno {shopifyData.meta.daysElapsed}/{shopifyData.meta.daysInMonth}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lastFetch && (
            <span className="text-[10px] text-zinc-700 hidden sm:block">
              {lastFetch.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
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

      {/* â”€â”€ Source toggle (only when includeAmazon) â”€â”€ */}
      {includeAmazon && (
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-bg-border overflow-x-auto scrollbar-hide">
          {(["total", "shopify", "amazon"] as SourceTab[]).map(tab => {
            const tabLabel =
              tab === "total"   ? "ðŸŒ Totale" :
              tab === "shopify" ? "ðŸ›’ Shopify" :
                                  "ðŸ“¦ Amazon";
            const tabColor =
              tab === "total"   ? "#6366f1" :
              tab === "shopify" ? "#6ee7b7" :
                                  "#fbbf24";
            const isActive = sourceTab === tab;
            return (
              <button
                key={tab}
                onClick={() => { setSourceTab(tab); setSelectedMp("all"); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all shrink-0 ${
                  isActive
                    ? "text-white"
                    : "border-bg-border text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
                }`}
                style={isActive ? { background: tabColor + "20", borderColor: tabColor + "55", color: tabColor } : {}}
              >
                {tabLabel}
              </button>
            );
          })}

          {/* Divider + sub-tabs for Shopify or Amazon */}
          {(sourceTab === "shopify" || sourceTab === "amazon") && (
            <div className="flex items-center gap-1 ml-3 pl-3 border-l border-bg-border/60">
              {sourceTab === "shopify"
                ? shopifyTabs.map(mp => {
                    const isActive = selectedMp === mp;
                    const meta     = mp === "all" ? { label: "Tutti", color: "#6366f1" } : getMeta(mp);
                    const flag     = MP_FLAG[mp] ?? "";
                    return (
                      <button
                        key={mp}
                        onClick={() => { setSelectedMp(mp); onMarketplaceSelect?.(mp === "all" ? "all" : mp); }}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap border transition-all shrink-0 ${
                          isActive
                            ? "text-white"
                            : "border-bg-border text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
                        }`}
                        style={isActive ? { background: meta.color + "22", borderColor: meta.color + "55", color: meta.color } : {}}
                      >
                        {mp === "all" ? <span className="text-xs">ðŸŒ</span>
                          : flag ? <FlagImg code={flag} />
                          : <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: meta.color }} />}
                        {meta.label}
                      </button>
                    );
                  })
                : AMAZON_TABS.map(({ value, label }) => {
                    const isActive = selectedMp === value;
                    return (
                      <button
                        key={value}
                        onClick={() => { setSelectedMp(value); onMarketplaceSelect?.(`AMAZON_${value}`); }}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap border transition-all shrink-0 ${
                          isActive
                            ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                            : "border-bg-border text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })
              }
            </div>
          )}
        </div>
      )}

      {/* â”€â”€ Marketplace tabs (non-Amazon mode only) â”€â”€ */}
      {!includeAmazon && (
        <div className="flex gap-1 overflow-x-auto px-4 py-2.5 border-b border-bg-border scrollbar-hide">
          {shopifyTabs.map(mp => {
            const isActive = selectedMp === mp;
            const meta     = mp === "all" ? { label: "Tutti", color: "#6366f1" } : getMeta(mp);
            const flag     = MP_FLAG[mp] ?? "";
            return (
              <button
                key={mp}
                onClick={() => { setSelectedMp(mp); onMarketplaceSelect?.(mp === "all" ? "all" : mp); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap border transition-all shrink-0 ${
                  isActive
                    ? "border-transparent text-white"
                    : "border-bg-border text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
                }`}
                style={isActive ? { background: meta.color + "22", borderColor: meta.color + "55", color: meta.color } : {}}
              >
                {mp === "all" ? (
                  <span className="text-xs leading-none">ðŸŒ</span>
                ) : flag ? (
                  <FlagImg code={flag} />
                ) : (
                  <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: meta.color }} />
                )}
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {/* â”€â”€ 5 period cards â”€â”€ */}
      <div className="p-4">
        {/* Mobile: horizontal scroll carousel */}
        <div className="sm:hidden -mx-4 px-4">
          <div
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {columns.map(({ key, label, accent, isForecast }) => {
              const filterTarget = CARD_TO_FILTER[key];
              const isCardActive = !!filterTarget && activePeriod === filterTarget;
              const sData = shopifyData ? (shopifyData[key] as ShopifyPeriodStats) : null;
              const aData = amazonData  ? (amazonData[key]  as AmazonPeriodStats)  : null;

              let rows: Row[];
              let pct: number | null;
              let heroValue: string | undefined;
              let heroLabel: string | undefined;
              if (!includeAmazon || sourceTab === "shopify") {
                rows = shopifyRows(sData);
                pct  = sData?.pctChange ?? null;
              } else if (sourceTab === "amazon") {
                rows = amazonRows(aData);
                pct  = aData?.pctChange ?? null;
              } else {
                rows = totalRows(sData, aData);
                pct  = mergedPct(
                  sData?.pctChange ?? null, sData?.grossRevenue ?? 0,
                  aData?.pctChange ?? null, aData?.grossRevenue ?? 0,
                );
                const tGross = (sData?.grossRevenue ?? 0) + (aData?.grossRevenue ?? 0);
                if (sData || aData) {
                  heroValue = fmtEur(tGross);
                  heroLabel = "Fatturato Lordo Totale";
                }
              }

              return (
                <div key={key} className="snap-start shrink-0 w-[78vw] max-w-[280px]">
                  <PeriodCol
                    label={label}
                    rows={rows}
                    pctChange={pct}
                    loading={loading}
                    accent={accent}
                    isForecast={isForecast}
                    isActive={isCardActive}
                    heroValue={heroValue}
                    heroLabel={heroLabel}
                    showHero={includeAmazon && sourceTab === "total"}
                    onClick={
                      filterTarget && onPeriodSelect
                        ? () => onPeriodSelect(filterTarget)
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
          {/* Scroll hint dots */}
          <div className="flex justify-center gap-1 mt-2">
            {columns.map(({ key }) => (
              <div key={key} className="w-1 h-1 rounded-full bg-zinc-700" />
            ))}
          </div>
        </div>

        {/* Desktop: standard grid */}
        <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {columns.map(({ key, label, accent, isForecast }) => {
            const filterTarget = CARD_TO_FILTER[key];
            const isCardActive = !!filterTarget && activePeriod === filterTarget;
            const sData = shopifyData ? (shopifyData[key] as ShopifyPeriodStats) : null;
            const aData = amazonData  ? (amazonData[key]  as AmazonPeriodStats)  : null;

            let rows: Row[];
            let pct: number | null;
            let heroValue: string | undefined;
            let heroLabel: string | undefined;
            if (!includeAmazon || sourceTab === "shopify") {
              rows = shopifyRows(sData);
              pct  = sData?.pctChange ?? null;
            } else if (sourceTab === "amazon") {
              rows = amazonRows(aData);
              pct  = aData?.pctChange ?? null;
            } else {
              rows = totalRows(sData, aData);
              pct  = mergedPct(
                sData?.pctChange ?? null, sData?.grossRevenue ?? 0,
                aData?.pctChange ?? null, aData?.grossRevenue ?? 0,
              );
              const tGross = (sData?.grossRevenue ?? 0) + (aData?.grossRevenue ?? 0);
              if (sData || aData) {
                heroValue = fmtEur(tGross);
                heroLabel = "Fatturato Lordo Totale";
              }
            }

            return (
              <PeriodCol
                key={key}
                label={label}
                rows={rows}
                pctChange={pct}
                loading={loading}
                accent={accent}
                isForecast={isForecast}
                isActive={isCardActive}
                heroValue={heroValue}
                heroLabel={heroLabel}
                showHero={includeAmazon && sourceTab === "total"}
                onClick={
                  filterTarget && onPeriodSelect
                    ? () => onPeriodSelect(filterTarget)
                    : undefined
                }
              />
            );
          })}
        </div>

        {/* â”€â”€ Summary bar â”€â”€ */}
        {!loading && (shopifyData || amazonData) && (
          <div className="mt-3 pt-3 border-t border-bg-border/50 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px]">
            {/* Total view â€” show cross-channel aggregates */}
            {includeAmazon && sourceTab === "total" ? (
              <>
                <span className="text-zinc-600">
                  Oggi{" "}
                  <span className="text-white tabular-nums font-medium">{fmtEur(totalTodayGross)}</span>
                </span>
                <span className="text-zinc-600">
                  MTD lordo{" "}
                  <span className="text-white tabular-nums font-medium">{fmtEur(totalMtdGross)}</span>
                </span>
                <span className="text-zinc-600">
                  MTD netto{" "}
                  <span className="text-accent-primary tabular-nums font-medium">{fmtEur(totalMtdNet)}</span>
                </span>
                {totalMtdGross > 0 && (
                  <span className="text-zinc-600">
                    Margine MTD{" "}
                    <span className="text-zinc-300 tabular-nums font-medium">
                      {((totalMtdNet / totalMtdGross) * 100).toFixed(1)}%
                    </span>
                  </span>
                )}
                <span className="text-zinc-600">
                  Previsione{" "}
                  <span className="text-blue-400 tabular-nums font-medium">{fmtEur(totalFcastGross)}</span>
                </span>
                <span className="text-zinc-600">
                  Mese scorso{" "}
                  <span className="text-zinc-400 tabular-nums font-medium">{fmtEur(totalLastGross)}</span>
                </span>
                {/* Shopify vs Amazon split */}
                {shopifyData && amazonData && totalMtdGross > 0 && (
                  <span className="text-zinc-600 ml-auto hidden sm:inline">
                    Shopify{" "}
                    <span className="text-emerald-400/80 font-medium tabular-nums">
                      {((shopifyData.mtd.grossRevenue / totalMtdGross) * 100).toFixed(0)}%
                    </span>
                    {" Â· "}Amazon{" "}
                    <span className="text-amber-400/80 font-medium tabular-nums">
                      {((amazonData.mtd.grossRevenue / totalMtdGross) * 100).toFixed(0)}%
                    </span>
                  </span>
                )}
              </>
            ) : !includeAmazon || sourceTab === "shopify" ? (
              /* Shopify-only summary */
              <>
                <span className="text-zinc-600">
                  MTD lordo{" "}
                  <span className="text-white tabular-nums font-medium">{fmtEur(shopifyData?.mtd.grossRevenue ?? 0)}</span>
                </span>
                <span className="text-zinc-600">
                  MTD netto{" "}
                  <span className="text-emerald-400 tabular-nums font-medium">{fmtEur(shopifyData?.mtd.netRevenue ?? 0)}</span>
                </span>
                {shopifyData && shopifyData.mtd.grossRevenue > 0 && (
                  <span className="text-zinc-600">
                    Margine MTD{" "}
                    <span className="text-zinc-300 tabular-nums font-medium">
                      {((shopifyData.mtd.netRevenue / shopifyData.mtd.grossRevenue) * 100).toFixed(1)}%
                    </span>
                  </span>
                )}
                <span className="text-zinc-600">
                  Previsione{" "}
                  <span className="text-blue-400 tabular-nums font-medium">{fmtEur(shopifyData?.forecast.grossRevenue ?? 0)}</span>
                </span>
                <span className="text-zinc-600">
                  Mese scorso{" "}
                  <span className="text-zinc-400 tabular-nums font-medium">{fmtEur(shopifyData?.lastMonth.grossRevenue ?? 0)}</span>
                </span>
              </>
            ) : (
              /* Amazon-only summary */
              <>
                <span className="text-zinc-600">
                  MTD lordo{" "}
                  <span className="text-amber-400 tabular-nums font-medium">{fmtEur(amazonData?.mtd.grossRevenue ?? 0)}</span>
                </span>
                <span className="text-zinc-600">
                  MTD payout{" "}
                  <span className="text-emerald-400 tabular-nums font-medium">{fmtEur(amazonData?.mtd.estPayout ?? 0)}</span>
                </span>
                {amazonData && amazonData.mtd.grossRevenue > 0 && (
                  <span className="text-zinc-600">
                    Margine stim.{" "}
                    <span className="text-zinc-300 tabular-nums font-medium">
                      {((amazonData.mtd.estPayout / amazonData.mtd.grossRevenue) * 100).toFixed(1)}%
                    </span>
                  </span>
                )}
                <span className="text-zinc-600">
                  Ad Spend MTD{" "}
                  <span className="text-purple-400 tabular-nums font-medium">{fmtEur(amazonData?.mtd.adSpend ?? 0)}</span>
                </span>
                <span className="text-zinc-600">
                  Previsione{" "}
                  <span className="text-blue-400 tabular-nums font-medium">{fmtEur(amazonData?.forecast.grossRevenue ?? 0)}</span>
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
