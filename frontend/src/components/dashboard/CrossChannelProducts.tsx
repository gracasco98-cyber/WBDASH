"use client";
import { useRef, useEffect } from "react";
import { Package, SlidersHorizontal } from "lucide-react";
import { AggregatedProductsView } from "@/components/dashboard/AggregatedProductsView";
import { useCrossChannelData } from "@/hooks/useCrossChannelData";
import { SettingsPanel } from "./cross-channel/SettingsPanel";
import { ChannelGroupHeader, ProductSection } from "./cross-channel/ProductSection";
import { DEFAULT_CONFIG, METRIC_DEFS, CrossChannelProductsProps, ActiveSection } from "./cross-channel/crossChannelTypes";
import { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";
import { getMeta } from "@/lib/marketplaces";

export default function CrossChannelProducts({ filter, from, to, marketplace }: CrossChannelProductsProps) {
  const cc = useCrossChannelData(filter, from, to, marketplace);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings panel when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        cc.setSettingsOpen(false);
      }
    }
    if (cc.settingsOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cc.settingsOpen, cc.setSettingsOpen]);

  const sourceLabel = isAmazonChannel(marketplace)
    ? `Amazon ${amazonChannelCode(marketplace)}`
    : marketplace !== "all" ? getMeta(marketplace).label : "Tutti i canali";

  const tabCls = (s: ActiveSection) =>
    `px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-md font-medium transition-all whitespace-nowrap ${
      cc.section === s ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20" : "text-gray-600 hover:text-gray-900"
    }`;

  const cfgModified = cc.cfg.primaryMetric !== DEFAULT_CONFIG.primaryMetric
    || cc.cfg.sortBy !== DEFAULT_CONFIG.sortBy
    || cc.cfg.visibleCols.length !== DEFAULT_CONFIG.visibleCols.length;

  // Build aggregated data for groupByProduct view
  const aggregatedData = {
    products: cc.groupedProducts.map(gp => ({
      asin: gp.asin, sku: gp.sku, ean: gp.ean,
      productTitle: gp.productTitle, imageUrl: gp.imageUrl,
      totalRevenue: gp.totalRevenue, totalOrders: gp.totalOrders, totalUnits: gp.totalUnits,
      sales: gp.totalRevenue, margin: gp.margin || null,
      promo: gp.promo || 0, percentRefunds: gp.percentRefunds || 0,
      amazonFees: gp.amazonFees || 0, costOfGoods: gp.costOfGoods || 0,
      grossProfit: gp.grossProfit || 0, netProfit: gp.netProfit || 0,
      estimatedPayout: gp.estimatedPayout || 0, expenses: gp.expenses || 0,
      roi: gp.roi || null, realAcos: gp.realAcos || null,
      sessionsDay: gp.sessionsDay || null, unitSoldSessionPct: gp.unitSoldSessionPct || null,
      shippingCosts: gp.shippingCosts || 0, totalRefunds: gp.refunds || 0,
      totalAdSpend: gp.adSpend || 0, marketplaces: gp.marketplaces || [],
    })),
    kpis: {
      totalGross: cc.groupedProducts.reduce((sum: number, p: any) => sum + p.totalRevenue, 0),
      totalNet: 0,
      totalUnits: cc.groupedProducts.reduce((sum: number, p: any) => sum + p.totalUnits, 0),
      totalOrders: cc.groupedProducts.reduce((sum: number, p: any) => sum + p.totalOrders, 0),
      productCount: cc.groupedProducts.length,
    },
    limit: 50,
    total: cc.groupedProducts.length,
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-5 py-3 sm:py-4 border-b border-zinc-200">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Prodotti — Performance Cross-Channel</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {sourceLabel} · {filter === "today" ? "oggi" : filter}
            {!cc.loading && ` · ${cc.amazonProducts.length} Amazon · ${cc.shopifyProducts.length} Web Store`}
            {!cc.loading && ` · ordinato per `}
            {!cc.loading && <span className="text-gray-700">{METRIC_DEFS.find(d => d.id === cc.cfg.sortBy)?.label}</span>}
            {!cc.loading && ` · grande: `}
            {!cc.loading && <span className="text-accent-primary/70">{METRIC_DEFS.find(d => d.id === cc.cfg.primaryMetric)?.label}</span>}
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
          <div className="flex items-center gap-0.5 bg-gray-50 border border-zinc-200 rounded-lg p-1 flex-wrap">
            <button className={tabCls("all")} onClick={() => cc.setSection("all")}>Tutti</button>
            <button className={tabCls("amazon")} onClick={() => cc.setSection("amazon")}>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Amazon
              </span>
            </button>
            <button className={tabCls("shopify")} onClick={() => cc.setSection("shopify")}>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-primary inline-block" />Web Store
              </span>
            </button>
            <button className={tabCls("temu")} onClick={() => cc.setSection("temu")}>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Temu
              </span>
            </button>
            <button className={tabCls("redcare")} onClick={() => cc.setSection("redcare")}>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />Redcare
              </span>
            </button>
            <select
              value={cc.cfg.viewMode}
              onChange={(e) => cc.updateCfg({ ...cc.cfg, viewMode: e.target.value as "marketplace" | "groupByProduct" })}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs bg-white text-gray-900 hover:border-zinc-300 transition-all cursor-pointer"
            >
              <option value="marketplace">Per Canale</option>
              <option value="groupByProduct">Per Prodotto</option>
            </select>
          </div>

          <div ref={settingsRef} className="relative">
            <button
              onClick={() => cc.setSettingsOpen(v => !v)}
              title="Personalizza colonne e vista"
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] transition-all ${
                cc.settingsOpen || cfgModified
                  ? "bg-accent-primary/10 text-accent-primary border-accent-primary/30"
                  : "text-gray-600 border-zinc-200 hover:text-gray-900 hover:border-zinc-300"
              }`}
            >
              <SlidersHorizontal size={12} />
              <span className="hidden sm:inline">Vista</span>
              {cfgModified && !cc.settingsOpen && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent-primary ml-0.5" />
              )}
            </button>
            {cc.settingsOpen && (
              <SettingsPanel cfg={cc.cfg} onChange={cc.updateCfg} onClose={() => cc.setSettingsOpen(false)} />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {cc.loading ? (
        <div className="divide-y divide-zinc-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 sm:px-4 py-3 flex items-center gap-3 animate-pulse">
              <div className="w-5 h-3 rounded bg-zinc-200 hidden sm:block" />
              <div className="w-9 h-9 rounded-lg bg-zinc-200 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 sm:w-52 rounded bg-zinc-200" />
                <div className="h-2 w-24 rounded bg-zinc-200" />
              </div>
              <div className="w-16 h-4 rounded bg-zinc-200" />
            </div>
          ))}
        </div>
      ) : cc.cfg.viewMode === "groupByProduct" ? (
        <div className="px-3 sm:px-4 py-3">
          <AggregatedProductsView
            data={aggregatedData}
            loading={false}
            error={null}
            viewConfig={cc.cfg}
          />
        </div>
      ) : (
        <>
          {cc.channelGroups.length > 0 ? (
            cc.channelGroups.map(group => {
              const show = cc.section === "all" || cc.section === group.source;
              if (!show) return null;
              const isExpanded = cc.expandedChannels.has(group.channelKey);
              return (
                <div key={group.channelKey} className="border-b border-zinc-100 last:border-b-0">
                  <ChannelGroupHeader
                    group={group}
                    expanded={isExpanded}
                    onToggle={() => cc.toggleChannel(group.channelKey)}
                  />
                  {isExpanded && (
                    <ProductSection
                      title={group.label}
                      color={group.color}
                      products={group.products}
                      expanded={cc.expanded}
                      onToggle={cc.toggleExpanded}
                      showAll={cc.showAllByChannel.get(group.channelKey) ?? false}
                      onToggleAll={() => cc.toggleShowAll(group.channelKey)}
                      cfg={cc.cfg}
                      onSortToggle={cc.handleSortToggle}
                    />
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-600">
              <Package size={28} className="text-gray-700" />
              <span className="text-sm">Nessun prodotto nel periodo selezionato</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
