"use client";
import { useState } from "react";
import { Check, Copy, Package } from "lucide-react";
import { MetricId, ViewConfig, ProductRow, ChannelRow, CHANNEL_FLAGS, METRIC_DEFS } from "./crossChannelTypes";
import { getVal, fmtSimple, formatCompact, formatEUR } from "./crossChannelUtils";

// ── MetricCell ─────────────────────────────────────────────────────────────────

export function MetricCell({ product, id, isPrimary }: {
  product: ProductRow; id: MetricId; isPrimary: boolean;
}) {
  const val = getVal(product, id);

  if (id === "revenue") {
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold text-gray-900" : "text-xs text-gray-600"}`}>
        {formatCompact(val)}
        {isPrimary && product.channels.length > 1 && (
          <div className="text-[9px] text-gray-600">{product.channels.length} canali</div>
        )}
      </div>
    );
  }

  if (id === "orders") {
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold text-gray-900" : "text-xs text-gray-600"}`}>
        {val.toLocaleString("it-IT")}
        {isPrimary && <div className="text-[9px] text-gray-600">ordini</div>}
      </div>
    );
  }

  if (id === "units") {
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold text-gray-900" : "text-xs text-gray-600"}`}>
        {val.toLocaleString("it-IT")}
        {isPrimary && <div className="text-[9px] text-gray-600">unità</div>}
      </div>
    );
  }

  if (id === "adSpend") {
    if (val <= 0) return <div className="text-right text-gray-500 text-xs">—</div>;
    const acos = product.totalRevenue > 0 ? ((val / product.totalRevenue) * 100).toFixed(0) : null;
    return (
      <div className={`text-right tabular-nums font-mono leading-tight ${isPrimary ? "text-sm font-bold" : "text-xs"} text-orange-600`}>
        {formatCompact(val)}
        {acos && <div className="text-[9px] text-orange-600">ACOS {acos}%</div>}
      </div>
    );
  }

  if (id === "margin") {
    if (product.margin === null || product.margin === undefined || product.margin === 0) {
      return <div className="text-right text-gray-500 text-xs">—</div>;
    }
    const pct = product.margin;
    const col = pct >= 30 ? "text-emerald-600" : pct >= 15 ? "text-amber-600" : "text-red-600";
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold" : "text-[10px] font-semibold font-mono"} ${col}`}>
        {pct.toFixed(1)}%
        {product.grossProfit !== null && (
          <div className={`text-[9px] ${product.grossProfit >= 0 ? "text-gray-600" : "text-red-600"}`}>
            {formatCompact(product.grossProfit)}
          </div>
        )}
      </div>
    );
  }

  if (id === "refunds") {
    if (val <= 0) return <div className="text-right text-gray-500 text-xs">—</div>;
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold text-red-600" : "text-xs text-red-600"}`}>
        {fmtSimple(id, val)}
      </div>
    );
  }

  if (id === "promo") {
    if (val <= 0) return <div className="text-right text-gray-500 text-xs">—</div>;
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold text-amber-600" : "text-xs text-amber-600"}`}>
        {fmtSimple(id, val)}
      </div>
    );
  }

  if (id === "percentRefunds" || id === "unitSoldSessionPct") {
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold text-gray-900" : "text-xs text-gray-600"}`}>
        {fmtSimple(id, val)}
      </div>
    );
  }

  if (id === "roi" || id === "realAcos") {
    if (val <= -Infinity) return <div className="text-right text-gray-500 text-xs">—</div>;
    const col = id === "roi" && val >= 0 ? "text-emerald-600" : "text-orange-600";
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold" : "text-xs"} ${col}`}>
        {fmtSimple(id, val)}
      </div>
    );
  }

  if (id === "bsr") {
    if (val >= Infinity) return <div className="text-right text-gray-500 text-xs">—</div>;
    return (
      <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold text-gray-700" : "text-xs text-gray-600"}`}>
        {fmtSimple(id, val)}
      </div>
    );
  }

  return (
    <div className={`text-right tabular-nums leading-tight ${isPrimary ? "text-sm font-bold text-gray-900" : "text-xs text-gray-600"}`}>
      {fmtSimple(id, val)}
    </div>
  );
}

// ── CopyBtn ────────────────────────────────────────────────────────────────────

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity" title={`Copia: ${text}`}>
      {copied ? <Check size={10} className="text-accent-primary" /> : <Copy size={10} className="text-zinc-400" />}
    </button>
  );
}

// ── ProductThumb ───────────────────────────────────────────────────────────────

export function ProductThumb({ url, title }: { url: string | null; title: string }) {
  const [err, setErr] = useState(false);
  if (!url || err) {
    return (
      <div className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-zinc-200 flex items-center justify-center text-gray-600 shrink-0">
        <Package size={16} />
      </div>
    );
  }
  return (
    <img src={url} alt={title} onError={() => setErr(true)}
      className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg object-cover shrink-0 border border-zinc-200" />
  );
}

// ── Channel breakdown rows ─────────────────────────────────────────────────────

function ChannelExpandedRowMobile({ ch, totalRevenue }: { ch: ChannelRow; totalRevenue: number }) {
  const pct = totalRevenue > 0 ? (ch.revenue / totalRevenue) * 100 : 0;
  const flag = CHANNEL_FLAGS[ch.channelKey] ?? "🌐";
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50" style={{ borderLeft: `2px solid ${ch.color}55` }}>
      <span className="text-xs shrink-0">{flag}</span>
      <span className="text-[11px] text-gray-700 font-medium truncate flex-1">{ch.label}</span>
      <div className="w-12 h-1 rounded-full bg-zinc-200 overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: ch.color, opacity: 0.7 }} />
      </div>
      <span className="text-[11px] font-mono text-gray-900 tabular-nums shrink-0 w-14 text-right">{formatCompact(ch.revenue)}</span>
      <span className="text-[10px] text-gray-600 tabular-nums shrink-0 w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function ChannelExpandedRowDesktop({ ch, totalRevenue }: { ch: ChannelRow; totalRevenue: number }) {
  const pct = totalRevenue > 0 ? (ch.revenue / totalRevenue) * 100 : 0;
  const acos = ch.adSpend > 0 && ch.revenue > 0 ? ((ch.adSpend / ch.revenue) * 100).toFixed(0) : null;
  const flag = CHANNEL_FLAGS[ch.channelKey] ?? "🌐";
  return (
    <div className="flex items-center gap-3 ml-6 pl-4 py-2 pr-4 bg-gray-50" style={{ borderLeft: `2px solid ${ch.color}55` }}>
      <div className="flex items-center gap-1 w-32 shrink-0">
        <span className="text-[11px]">{flag}</span>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ch.color }} />
        <span className="text-[11px] text-gray-700 font-medium truncate">{ch.label}</span>
      </div>
      <div className="w-20 h-1 rounded-full bg-zinc-200 overflow-hidden shrink-0">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: ch.color, opacity: 0.7 }} />
      </div>
      <span className="text-[11px] font-mono font-medium text-gray-900 tabular-nums w-16 text-right shrink-0">{formatCompact(ch.revenue)}</span>
      <span className="text-[11px] text-gray-600 tabular-nums w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
      <span className="text-[11px] text-gray-700 tabular-nums w-12 text-right shrink-0">{ch.orders} ord.</span>
      {ch.adSpend > 0
        ? <span className="text-[11px] tabular-nums text-orange-600 font-mono w-14 text-right shrink-0">{formatCompact(ch.adSpend)}</span>
        : <span className="text-[11px] text-gray-400 w-14 text-right shrink-0">—</span>
      }
      {ch.source === "amazon" && acos !== null && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500/70 font-mono shrink-0">ACOS {acos}%</span>
      )}
    </div>
  );
}

// ── ExpandedBreakdown ──────────────────────────────────────────────────────────

export function ExpandedBreakdown({ product }: { product: ProductRow }) {
  return (
    <div className="border-t border-zinc-100">
      <div className="px-3 sm:px-4 py-1.5 bg-gray-50">
        <span className="text-[10px] text-gray-600 uppercase tracking-widest">
          Suddivisione · {product.channels.length} canali
        </span>
      </div>
      <div className="divide-y divide-zinc-100">
        {product.channels.map((ch) => (
          <div key={`${ch.source}-${ch.channelKey}`}>
            <div className="sm:hidden">
              <ChannelExpandedRowMobile ch={ch} totalRevenue={product.totalRevenue} />
            </div>
            <div className="hidden sm:block">
              <ChannelExpandedRowDesktop ch={ch} totalRevenue={product.totalRevenue} />
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 sm:px-6 py-1.5 border-t border-zinc-100 bg-gray-50 flex flex-wrap justify-between gap-1 text-[10px] text-gray-600">
        <span>{formatEUR(product.totalRevenue)} · {product.totalOrders} ordini · {product.totalUnits} un.</span>
        {product.adSpend > 0 && <span className="text-orange-500/50">Ad: {formatEUR(product.adSpend)}</span>}
      </div>
    </div>
  );
}

// ── ProductLineMobile ──────────────────────────────────────────────────────────

export function ProductLineMobile({ product, rank, expanded, onToggle, cfg }: {
  product: ProductRow; rank: number; expanded: boolean; onToggle: () => void; cfg: ViewConfig;
}) {
  const primaryVal = getVal(product, cfg.primaryMetric);
  const secondaryMetrics = cfg.visibleCols
    .filter(id => id !== cfg.primaryMetric && (id === "revenue" || id === "orders" || id === "units"))
    .slice(0, 2);

  return (
    <div>
      <div className="px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-2.5">
          <div className="relative shrink-0">
            <ProductThumb url={product.imageUrl} title={product.productTitle} />
            <span className="absolute -top-1 -left-1 text-[9px] text-gray-600 tabular-nums bg-white/80 rounded px-0.5 leading-tight">{rank}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">{product.productTitle}</div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {product.asin && <span className="text-[9px] text-gray-600 font-mono">{product.asin.slice(0, 10)}</span>}
              {product.sku && <span className="text-[9px] text-gray-700 font-mono truncate max-w-[80px]">{product.sku}</span>}
              {product.channels.length > 1 && <span className="text-[9px] text-gray-600">{product.channels.length} canali</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-base font-bold tabular-nums text-gray-900 leading-tight">
              {fmtSimple(cfg.primaryMetric, primaryVal)}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {secondaryMetrics.map(id => (
                <span key={id} className="text-[9px] text-gray-600 tabular-nums">
                  {METRIC_DEFS.find(d => d.id === id)!.short}&nbsp;{fmtSimple(id, getVal(product, id))}
                </span>
              ))}
              {cfg.visibleCols.includes("margin") && product.margin !== null && product.margin !== undefined && product.margin !== 0 && (
                <span className={`text-[9px] font-semibold font-mono ${
                  product.margin >= 30 ? "text-emerald-600" : product.margin >= 15 ? "text-amber-600" : "text-red-600"
                }`}>
                  {product.margin.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: expanded ? `${product.channels.length * 44 + 64}px` : "0px", opacity: expanded ? 1 : 0 }}>
        <ExpandedBreakdown product={product} />
      </div>
    </div>
  );
}
