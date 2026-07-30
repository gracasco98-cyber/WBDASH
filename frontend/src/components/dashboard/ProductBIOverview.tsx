"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { TrendingUp, TrendingDown, Minus, SplitSquareHorizontal, Layers, Package, ShoppingBag, RefreshCw } from "lucide-react";
import { fmtEur, fmtNum } from "@/lib/fmt";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SelectedProduct {
  id: string;
  asin?: string;
  shopifyProductId?: string;
  title: string;
  source: "amazon" | "shopify" | "both";
  marketplace: string;
}

interface PeriodStats {
  grossRevenue:   number;
  shopifyRevenue: number;
  amazonRevenue:  number;
  netRevenue:     number;
  unitsSold:      number;
  orderCount:     number;
  adSpend:        number;
  refunds:        number;
  pctChange:      number | null;
}

interface ProductOverview {
  today:     PeriodStats;
  yesterday: PeriodStats;
  mtd:       PeriodStats;
  forecast:  PeriodStats;
  lastMonth: PeriodStats;
  meta:      { daysElapsed: number; daysInMonth: number };
  byMarketplace?: Record<string, {
    source: string; marketplace: string;
    mtd:       { grossRevenue: number; unitsSold: number; orderCount: number; adSpend?: number };
    lastMonth: { grossRevenue: number; unitsSold: number; orderCount: number };
  }>;
}

interface Props {
  product:  SelectedProduct;
  onClear?: () => void;
}

// â”€â”€â”€ Badge helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const isPos = pct > 0, isNeg = pct < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
      isPos ? "text-emerald-400" : isNeg ? "text-red-400" : "text-zinc-500"
    }`}>
      <Icon size={9} />
      {isPos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function Sk() {
  return <div className="h-3.5 w-16 bg-zinc-800 rounded animate-pulse" />;
}

// â”€â”€â”€ Period column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PeriodCol({
  label, data, loading, isForecast, accent, hasShopify, hasAmazon,
}: {
  label: string; data: PeriodStats | null; loading: boolean;
  isForecast?: boolean; accent?: string; hasShopify: boolean; hasAmazon: boolean;
}) {
  const borderCls = accent === "blue"   ? "border-[#FFC300]/30"
                  : accent === "purple" ? "border-[#ECCB08]/30"
                  : accent === "amber"  ? "border-[#D4AF00]/30"
                  : "border-zinc-700/40";
  const headerCls = accent === "blue"   ? "bg-[#FFC300]/8"
                  : accent === "purple" ? "bg-[#ECCB08]/8"
                  : accent === "amber"  ? "bg-[#D4AF00]/8"
                  : "bg-zinc-800/30";

  const rows: Array<{ label: string; value: string | null; color: string; bold?: boolean; small?: boolean; sep?: boolean }> = [];

  if (hasShopify && hasAmazon) {
    rows.push({ label: "Shopify", value: data ? fmtEur(data.shopifyRevenue) : null, color: "text-accent-primary", small: true });
    rows.push({ label: "Amazon",  value: data ? fmtEur(data.amazonRevenue)  : null, color: "text-amber-400",       small: true });
    rows.push({ label: "Lordo totale", value: data ? fmtEur(data.grossRevenue) : null, color: "text-white", bold: true, sep: true });
  } else {
    rows.push({ label: "Lordo", value: data ? fmtEur(data.grossRevenue) : null, color: "text-white", bold: true });
  }

  rows.push({ label: "Ordini / UnitÃ ", value: data ? `${data.orderCount} / ${fmtNum(data.unitsSold)}` : null, color: "text-zinc-300" });

  if (hasAmazon && data && data.adSpend > 0) {
    rows.push({ label: "Ad Spend", value: data ? `âˆ’${fmtEur(data.adSpend)}` : null, color: "text-red-400/80", small: true });
  }
  if (data && data.refunds > 0) {
    rows.push({ label: "Rimborsi", value: data ? `âˆ’${fmtEur(data.refunds)}` : null, color: "text-orange-400/80", small: true });
  }
  rows.push({ label: "Netto stimato", value: data ? fmtEur(data.netRevenue) : null, color: "text-blue-400", bold: true, sep: true });

  return (
    <div className={`flex flex-col border ${borderCls} rounded-xl overflow-hidden bg-bg-card min-w-[190px] sm:min-w-0`}>
      {/* Header */}
      <div className={`${headerCls} px-3 py-2.5 border-b ${borderCls}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{label}</span>
          {isForecast && <span className="text-[9px] text-zinc-600 italic">proiezione</span>}
        </div>
        {loading ? <Sk /> : data ? (
          <div className="mt-1.5">
            <div className="text-sm font-bold text-white tabular-nums">{fmtEur(data.grossRevenue)}</div>
            <div className="mt-0.5"><PctBadge pct={data.pctChange} /></div>
          </div>
        ) : (
          <div className="text-xs text-zinc-700 mt-1">nessun dato</div>
        )}
      </div>

      {/* Rows */}
      <div className="flex flex-col divide-y divide-zinc-800/50 flex-1">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center justify-between px-3 py-2 gap-2 ${r.sep ? "border-t border-zinc-700/40" : ""}`}>
            <span className={`${r.small ? "text-[10px] text-zinc-600" : "text-xs text-zinc-500"} shrink-0`}>{r.label}</span>
            {loading ? <Sk /> : (
              <span className={`${r.small ? "text-xs" : "text-sm"} font-${r.bold ? "semibold" : "medium"} tabular-nums ${r.color} text-right`}>
                {r.value ?? "â€”"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// â”€â”€â”€ Marketplace split table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SplitTable({ byMarketplace }: { byMarketplace: ProductOverview["byMarketplace"] }) {
  if (!byMarketplace) return null;
  const rows = Object.values(byMarketplace).sort((a, b) => b.mtd.grossRevenue - a.mtd.grossRevenue);
  if (!rows.length) return <p className="text-xs text-zinc-600 px-4 py-3">Nessun dato per marketplace.</p>;

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bg-border/50">
            <th className="text-left px-3 py-2 text-zinc-600 font-medium uppercase text-[9px] tracking-widest">Canale</th>
            <th className="text-right px-3 py-2 text-zinc-600 font-medium uppercase text-[9px] tracking-widest">MTD Lordo</th>
            <th className="text-right px-3 py-2 text-zinc-600 font-medium uppercase text-[9px] tracking-widest">MTD UnitÃ </th>
            <th className="text-right px-3 py-2 text-zinc-600 font-medium uppercase text-[9px] tracking-widest">MTD Ordini</th>
            <th className="text-right px-3 py-2 text-zinc-600 font-medium uppercase text-[9px] tracking-widest hidden sm:table-cell">Mese scorso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bg-border/30">
          {rows.map((r) => (
            <tr key={`${r.source}_${r.marketplace}`} className="hover:bg-white/[0.02]">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${r.source === "amazon" ? "bg-amber-500/15" : "bg-accent-primary/15"}`}>
                    {r.source === "amazon"
                      ? <Package     size={10} className="text-amber-400" />
                      : <ShoppingBag size={10} className="text-accent-primary" />}
                  </div>
                  <div>
                    <div className="font-medium text-zinc-200 text-[11px]">
                      {r.source === "amazon" ? "Amazon" : "Shopify"} {r.marketplace}
                    </div>
                    <div className="text-[9px] text-zinc-600">{r.source}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-white tabular-nums">{fmtEur(r.mtd.grossRevenue)}</td>
              <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{fmtNum(r.mtd.unitsSold)}</td>
              <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{r.mtd.orderCount}</td>
              <td className="px-3 py-2.5 text-right text-zinc-500 tabular-nums hidden sm:table-cell">{fmtEur(r.lastMonth.grossRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ProductBIOverview({ product, onClear }: Props) {
  const [data,      setData]      = useState<ProductOverview | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [split,     setSplit]     = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async (withSplit = split) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (product.asin)             params.set("asin",       product.asin);
      if (product.shopifyProductId) params.set("productId",  product.shopifyProductId);
      if (withSplit)                params.set("splitByMarketplace", "true");

      const res = await fetch(`${BASE}/api/stats/product-overview?${params}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [product, split]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(), 5 * 60_000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const handleSplitToggle = () => {
    const next = !split;
    setSplit(next);
    load(next);
  };

  const hasShopify = !!(product.shopifyProductId || product.source === "shopify" || product.source === "both");
  const hasAmazon  = !!(product.asin || product.source === "amazon" || product.source === "both");

  const COLS: Array<{ key: keyof Omit<ProductOverview, "meta" | "byMarketplace">; label: string; accent?: string; isForecast?: boolean }> = [
    { key: "today",     label: "Oggi",            accent: "blue"   },
    { key: "yesterday", label: "Ieri",             accent: "purple" },
    { key: "mtd",       label: "Mese in corso",    accent: "amber"  },
    { key: "forecast",  label: "Previsione mese",  isForecast: true },
    { key: "lastMonth", label: "Mese scorso"                        },
  ];

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      {/* â”€â”€ Header â”€â”€ */}
      <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 border-b border-bg-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
            hasAmazon && !hasShopify ? "bg-amber-500/15" : hasShopify && !hasAmazon ? "bg-accent-primary/15" : "bg-zinc-700/40"
          }`}>
            {hasAmazon && !hasShopify ? <Package size={12} className="text-amber-400" /> :
             hasShopify && !hasAmazon ? <ShoppingBag size={12} className="text-accent-primary" /> :
             <Layers size={12} className="text-zinc-400" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{product.title}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1.5">
              {product.asin && <span className="font-mono">{product.asin}</span>}
              {product.asin && product.shopifyProductId && <span>Â·</span>}
              {product.shopifyProductId && <span>Shopify</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Split toggle */}
          <button
            onClick={handleSplitToggle}
            title={split ? "Vista aggregata" : "Dividi per paese"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
              split
                ? "bg-accent-primary/15 border-accent-primary/40 text-accent-primary"
                : "bg-bg-base border-bg-border text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <SplitSquareHorizontal size={11} />
            <span className="hidden sm:inline">Split paese</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => load()}
            className="p-1.5 rounded-lg border border-bg-border text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>

          {/* Clear */}
          {onClear && (
            <button
              onClick={onClear}
              className="p-1.5 rounded-lg border border-bg-border text-zinc-600 hover:text-red-400 transition-colors"
              title="Rimuovi prodotto"
            >
              Ã—
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 text-xs text-red-400 bg-red-500/5 border-b border-red-500/10">
          Errore: {error}
        </div>
      )}

      {/* â”€â”€ 5-period grid â€” horizontal scroll on mobile â”€â”€ */}
      <div className="p-3 sm:p-4">
        <div className="overflow-x-auto scrollbar-hide -mx-3 sm:mx-0 px-3 sm:px-0">
          <div className="flex gap-2 sm:gap-3 pb-1 sm:pb-0 sm:grid sm:grid-cols-5">
            {COLS.map(({ key, label, accent, isForecast }) => (
              <PeriodCol
                key={key}
                label={label}
                data={data ? data[key] as PeriodStats : null}
                loading={loading}
                isForecast={isForecast}
                accent={accent}
                hasShopify={hasShopify}
                hasAmazon={hasAmazon}
              />
            ))}
          </div>
        </div>

        {/* â”€â”€ Marketplace split table â”€â”€ */}
        {split && data && (
          <div className="mt-4 border border-bg-border/60 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-bg-border/50 flex items-center gap-2">
              <SplitSquareHorizontal size={11} className="text-zinc-500" />
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Breakdown per canale (MTD)</span>
            </div>
            <SplitTable byMarketplace={data.byMarketplace} />
          </div>
        )}

        {/* â”€â”€ Footer meta â”€â”€ */}
        {data && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-700">
            <span>Giorno {data.meta.daysElapsed}/{data.meta.daysInMonth}</span>
            {hasAmazon  && <span className="flex items-center gap-1"><Package     size={9} className="text-amber-500/60" />Amazon EU</span>}
            {hasShopify && <span className="flex items-center gap-1"><ShoppingBag size={9} className="text-accent-primary/60" />Shopify</span>}
          </div>
        )}
      </div>
    </div>
  );
}
