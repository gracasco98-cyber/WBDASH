"use client";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { MetricId, ViewConfig, ProductRow, ChannelGroup, METRIC_DEFS } from "./crossChannelTypes";
import { buildGridCols, formatCompact } from "./crossChannelUtils";
import { MetricCell, CopyBtn, ProductThumb, ExpandedBreakdown, ProductLineMobile } from "./ProductDetailView";

// ── ChannelGroupHeader ─────────────────────────────────────────────────────────

export function ChannelGroupHeader({ group, expanded, onToggle }: {
  group: ChannelGroup; expanded: boolean; onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 border-y border-zinc-200 cursor-pointer hover:bg-gray-100 transition-colors group"
    >
      <ChevronDown
        size={14}
        className="text-gray-500 transition-transform duration-200 shrink-0"
        style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
      />
      <span className="text-xs shrink-0">{group.flag}</span>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: group.color }} />
      <span className="text-xs font-bold text-gray-900">{group.label}</span>
      <span className="text-[10px] text-gray-600 ml-1">({group.products.length} prodotti)</span>
      <span className="ml-auto flex items-center gap-2.5 text-[10px] text-gray-700 shrink-0">
        <span className="font-mono">{formatCompact(group.totalRevenue)}</span>
        <span className="text-gray-600">·</span>
        <span>{group.totalOrders.toLocaleString("it-IT")} ord.</span>
      </span>
    </div>
  );
}

// ── ProductLineDesktop ─────────────────────────────────────────────────────────

function ProductLineDesktop({ product, rank, expanded, onToggle, cfg }: {
  product: ProductRow; rank: number; expanded: boolean; onToggle: () => void; cfg: ViewConfig;
}) {
  const enabledMetrics = METRIC_DEFS.filter(d => cfg.visibleCols.includes(d.id));
  const gridCols = buildGridCols(cfg.visibleCols);

  return (
    <div>
      <div
        className="group grid gap-2 px-4 py-3 items-center hover:bg-gray-50 transition-colors cursor-pointer"
        style={{ gridTemplateColumns: gridCols }}
        onClick={onToggle}
      >
        <span className="text-[10px] text-gray-600 tabular-nums text-right">{rank}</span>
        <ProductThumb url={product.imageUrl} title={product.productTitle} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate leading-tight">
            {product.productTitle.length > 52 ? product.productTitle.slice(0, 50) + "…" : product.productTitle}
          </div>
          <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
            {product.asin && (
              <span className="flex items-center text-xs text-gray-600 font-mono group/asin">
                <span className="text-gray-700 mr-0.5">ASIN:</span>
                <span className="text-gray-700">{product.asin}</span>
                <CopyBtn text={product.asin} />
              </span>
            )}
            {product.sku && (
              <span className="flex items-center text-xs text-gray-600 font-mono group/sku">
                <span className="text-gray-700 mr-0.5">SKU:</span>
                <span className="text-gray-700">{product.sku}</span>
                <CopyBtn text={product.sku} />
              </span>
            )}
          </div>
        </div>
        {enabledMetrics.map(({ id }) => (
          <MetricCell key={id} product={product} id={id} isPrimary={id === cfg.primaryMetric} />
        ))}
        <div className="flex justify-center text-gray-600">
          <ChevronDown size={13} className="transition-transform duration-200"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }} />
        </div>
      </div>
      <div className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: expanded ? `${product.channels.length * 48 + 64}px` : "0px", opacity: expanded ? 1 : 0 }}>
        <ExpandedBreakdown product={product} />
      </div>
    </div>
  );
}

// ── ProductSection ─────────────────────────────────────────────────────────────

export function ProductSection({ title, color, products, expanded, onToggle, showAll, onToggleAll, cfg, onSortToggle }: {
  title: string; color: string; products: ProductRow[];
  expanded: Set<string>; onToggle: (id: string) => void;
  showAll: boolean; onToggleAll: () => void;
  cfg: ViewConfig;
  onSortToggle: (id: MetricId) => void;
}) {
  const enabledMetrics = METRIC_DEFS.filter(d => cfg.visibleCols.includes(d.id));
  const gridCols = buildGridCols(cfg.visibleCols);
  const visible = showAll ? products : products.slice(0, 10);
  if (products.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-50 border-y border-zinc-200">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs font-bold text-gray-900">{title}</span>
        <span className="text-[10px] text-gray-500 ml-1">{products.length} prodotti</span>
      </div>

      <div
        className="hidden sm:grid gap-2 px-4 py-1.5 text-[10px] uppercase tracking-widest border-b border-zinc-100"
        style={{ gridTemplateColumns: gridCols }}
      >
        <span className="text-gray-600">#</span>
        <span />
        <span className="text-gray-600">Prodotto</span>
        {enabledMetrics.map(({ id, short }) => (
          <button
            key={id}
            onClick={() => onSortToggle(id)}
            className={`text-right flex items-center justify-end gap-0.5 transition-colors hover:text-gray-800 ${
              cfg.sortBy === id ? "text-gray-800" : "text-gray-600"
            } ${id === cfg.primaryMetric ? "font-semibold" : ""}`}
          >
            {cfg.sortBy === id && (
              cfg.sortDir === "desc"
                ? <ArrowDown size={8} className="shrink-0" />
                : <ArrowUp size={8} className="shrink-0" />
            )}
            <span>{short}</span>
            {id === cfg.primaryMetric && (
              <span className="ml-0.5 text-[7px] text-accent-primary/70">●</span>
            )}
          </button>
        ))}
        <span />
      </div>

      <div className="divide-y divide-zinc-100">
        {visible.map((p, i) => (
          <div key={p.id}>
            <div className="sm:hidden">
              <ProductLineMobile product={p} rank={i + 1} expanded={expanded.has(p.id)} onToggle={() => onToggle(p.id)} cfg={cfg} />
            </div>
            <div className="hidden sm:block">
              <ProductLineDesktop product={p} rank={i + 1} expanded={expanded.has(p.id)} onToggle={() => onToggle(p.id)} cfg={cfg} />
            </div>
          </div>
        ))}
      </div>

      {products.length > 10 && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-zinc-100 flex justify-between items-center bg-gray-50">
          <span className="text-[10px] text-gray-600">{showAll ? `${products.length} prodotti` : `10 di ${products.length}`}</span>
          <button onClick={onToggleAll} className="text-[10px] text-gray-600 hover:text-gray-900 transition-colors">
            {showAll ? "Mostra meno ↑" : `Tutti (${products.length}) ↓`}
          </button>
        </div>
      )}
    </div>
  );
}
