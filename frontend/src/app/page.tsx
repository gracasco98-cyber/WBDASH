"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { api, Summary, TimePoint, Order, AmazonSummary } from "@/lib/api";
import { getMeta, formatEUR, formatCompact } from "@/lib/marketplaces";
import SalesTabs from "@/components/dashboard/SalesTabs";
import ChartsTabs from "@/components/dashboard/ChartsTabs";
import SyncStatus from "@/components/dashboard/SyncStatus";
import FilterBar, { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";
import GlobalPeriodSelector from "@/components/dashboard/GlobalPeriodSelector";
import CrossChannelProducts from "@/components/dashboard/CrossChannelProducts";
import OrderToastContainer, { LiveOrder } from "@/components/dashboard/OrderToast";
import HourChannelModal from "@/components/dashboard/HourChannelModal";
import ShopifyBIOverview from "@/components/dashboard/ShopifyBIOverview";
import SellerboardKpiCards from "@/components/dashboard/SellerboardKpiCards";
import OverviewViewTabs, { DashboardView } from "@/components/dashboard/OverviewViewTabs";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ProductBIOverview, { SelectedProduct } from "@/components/dashboard/ProductBIOverview";
import { useSSE } from "@/hooks/useSSE";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { getDateRangeForPreset } from "@/lib/periodUtils";
import {
  RefreshCw, Eye, EyeOff, ChevronDown,
} from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";

// ─── Section visibility ────────────────────────────────────────────────────────
type SectionId = "bi_overview" | "charts" | "products";
const SECTION_DEFAULTS: Record<SectionId, boolean> = {
  bi_overview: true,
  charts:      true,
  products:    true,
};
const STORAGE_KEY = "dashboard_sections_v3";

function loadSections(): Record<SectionId, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SECTION_DEFAULTS };
    return { ...SECTION_DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...SECTION_DEFAULTS }; }
}
function saveSections(s: Record<SectionId, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

/** Thin divider bar with a show/hide toggle — placed ABOVE each section.
 *  Does NOT wrap children; visibility is controlled via conditional rendering
 *  in the caller, so no overflow-hidden issues. */
function SectionBar({
  label, visible, onToggle,
}: {
  label: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 group py-0.5">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-700 hover:text-zinc-400 transition-colors shrink-0"
      >
        <ChevronDown size={10} className={`transition-transform duration-200 ${visible ? "" : "-rotate-90"}`} />
        {label}
      </button>
      <div className="flex-1 h-px bg-bg-border/25" />
      <button
        onClick={onToggle}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] border transition-all opacity-0 group-hover:opacity-100 ${
          visible
            ? "border-zinc-700/60 text-zinc-600 hover:text-zinc-300 hover:border-zinc-500"
            : "border-zinc-600 text-zinc-400 bg-zinc-800/50 opacity-100"
        }`}
      >
        {visible ? <EyeOff size={9} /> : <Eye size={9} />}
        <span>{visible ? "Nascondi" : "Mostra"}</span>
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<DashboardView>("tiles");
  const { state: periodState, setPreset, setDateRange } = usePeriodFilter();
  const { marketplace, setMarketplace } = useMarketplaceFilter();
  const [status, setStatus] = useState("all");

  // Derive filter and date range from global period state
  const filter = periodState.preset;
  const from = periodState.preset === "custom" ? periodState.from : "";
  const to = periodState.preset === "custom" ? periodState.to : "";

  // For non-custom presets, calculate date range
  const presetDateRange = periodState.preset !== "custom" ? getDateRangeForPreset(periodState.preset) : null;
  const apiFrom = presetDateRange?.from || from;
  const apiTo = presetDateRange?.to || to;

  // Per-user section visibility — hydrated from localStorage after mount
  const [sections, setSections] = useState<Record<SectionId, boolean>>(SECTION_DEFAULTS);
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  useEffect(() => { setSections(loadSections()); }, []);
  const toggleSection = (id: SectionId) => {
    setSections(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveSections(next);
      return next;
    });
  };

  const [summary, setSummary] = useState<Summary | null>(null);
  const [amazonSummary, setAmazonSummary] = useState<AmazonSummary | null>(null);
  const [timeseries, setTimeseries] = useState<TimePoint[]>([]);
  const [amazonTimeseries, setAmazonTimeseries] = useState<TimePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [clockTime,   setClockTime]   = useState(new Date());
  const [selectedHour, setSelectedHour] = useState<string | null>(null);

  // Ref to detectNewOrders — allows load() to call it without creating a dependency cycle
  // (detectNewOrders is defined after load, so we use a ref that gets synced after definition)
  const detectNewOrdersRef = useRef<(orders: Order[]) => void>(() => {});


  // Detect if the selected marketplace is an Amazon channel (AMAZON_IT, AMAZON_DE, etc.)
  const isAmazonMp  = isAmazonChannel(marketplace);
  const amazonMpCode = amazonChannelCode(marketplace);   // "IT" | "DE" | "FR" | "ES" | null

  const params = useCallback(() => {
    const p: Record<string, string> = { filter, status };
    if (filter === "custom") { p.from = apiFrom; p.to = apiTo; }
    // Only pass Shopify marketplace filter for Shopify channels
    if (!isAmazonMp && marketplace !== "all") p.marketplace = marketplace;
    return p;
  }, [filter, marketplace, status, apiFrom, apiTo, isAmazonMp]);

  const load = useCallback(async () => {
    try {
      const p = params();

      // Amazon params: same date filter + optional Amazon-specific marketplace code
      const amazonParams: Record<string, string> = { filter };
      if (filter === "custom") { amazonParams.from = apiFrom; amazonParams.to = apiTo; }
      if (isAmazonMp && amazonMpCode) amazonParams.marketplace = amazonMpCode;

      const [s, ts, o, az, azTs] = await Promise.all([
        api.summary(p),
        api.timeseries({ ...p, bucket: filter === "today" ? "minute" : "hour" }),
        api.orders({ ...p, page: "1", limit: "50" }),
        api.amazon.summary(amazonParams).catch(() => null),     // graceful fallback
        api.amazon.timeseries(amazonParams).catch(() => []),    // graceful fallback
      ]);
      setSummary(s);
      setTimeseries(ts);
      setAmazonSummary(az);
      setAmazonTimeseries(Array.isArray(azTs) ? azTs : []);
      setLastRefresh(new Date());
      detectNewOrdersRef.current(o.orders);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [params, filter, apiFrom, apiTo, isAmazonMp, amazonMpCode]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Auto-refresh every 15s — keeps sticky notes near-real-time even without SSE
  useEffect(() => {
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Live clock — ticks every second, independent of data refresh
  useEffect(() => {
    const t = setInterval(() => setClockTime(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // ─── Live order sticky notes ──────────────────────────────────────────────
  const [liveOrders, setLiveOrders]   = useState<LiveOrder[]>([]);
  const lastOrderIdRef                = useRef<string | null>(null);
  const isFirstLoadRef                = useRef(true);
  const loadRef                       = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  const pushToast = useCallback((order: LiveOrder) => {
    setLiveOrders(prev => [...prev.slice(-4), order]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setLiveOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  // ── Polling-based detection: compares most-recent order on every load ───────
  // Works even when SSE is blocked (proxies, auth issues, etc.)
  const detectNewOrders = useCallback((freshOrders: Order[]) => {
    if (freshOrders.length === 0) return;
    const topId = freshOrders[0].shopifyOrderId;

    if (isFirstLoadRef.current) {
      // First load — just remember the current top; don't toast
      lastOrderIdRef.current = topId;
      isFirstLoadRef.current = false;
      return;
    }

    if (topId !== lastOrderIdRef.current) {
      // Find all orders newer than the last known one and toast each
      const lastIdx = freshOrders.findIndex(o => o.shopifyOrderId === lastOrderIdRef.current);
      const newOnes = lastIdx === -1 ? [freshOrders[0]] : freshOrders.slice(0, lastIdx);
      lastOrderIdRef.current = topId;

      for (const o of newOnes.slice(0, 3)) {
        pushToast({
          id:          `poll-${o.shopifyOrderId}`,
          source:      "shopify",
          orderName:   o.orderName,
          total:       o.totalAmount,
          marketplace: o.marketplaceDetected,
          ts:          o.createdAt,
        });
      }
    }
  }, [pushToast]);

  // Sync the ref so load() can always call the latest version
  useEffect(() => { detectNewOrdersRef.current = detectNewOrders; }, [detectNewOrders]);

  // ── SSE as bonus layer (immediate, when the connection works) ────────────
  useSSE(useCallback((event, data: unknown) => {
    const d = data as Record<string, unknown>;
    if (event === "order:new") {
      // SSE fires before the next poll → show toast immediately + refresh data
      const incomingId = String(d.orderName ?? "");
      // Guard: don't double-toast if polling already caught it
      const alreadySeen = lastOrderIdRef.current !== null &&
        liveOrders.some(o => o.orderName === incomingId);
      if (!alreadySeen) {
        pushToast({
          id:          `sse-${Date.now()}`,
          source:      "shopify",
          orderName:   String(d.orderName ?? ""),
          total:       Number(d.total ?? 0),
          marketplace: String(d.marketplace ?? ""),
          ts:          String(d.ts ?? new Date().toISOString()),
        });
      }
      loadRef.current();
    } else if (event === "amazon:sync") {
      if (Number(d.imported ?? 0) > 0) loadRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToast]));

  // ── Combined / cross-channel metrics ────────────────────────────────────────
  // "all"         → Shopify all + Amazon all   (combined)
  // "AMAZON_XX"   → Amazon XX only             (Amazon channel selected)
  // "SHOPIFY_CH"  → Shopify filtered only      (Shopify channel selected)
  const includeAmazon  = (marketplace === "all" || isAmazonMp) && amazonSummary !== null;
  // Label for active filter context
  const filterLabel = isAmazonMp
    ? `Amazon ${amazonMpCode} · solo canale Amazon`
    : marketplace !== "all"
    ? `${getMeta(marketplace).label} · solo canale Shopify`
    : null;

  // Marketplace badge breakdown (Shopify only — Amazon has its own area)
  const topMarketplaces = summary
    ? Object.entries(summary.byMarketplace)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 6)
    : [];

  // All Shopify marketplace rows (no slice limit) for donut chart
  const allShopifyMarketplaces = summary
    ? Object.entries(summary.byMarketplace).sort((a, b) => b[1].revenue - a[1].revenue)
    : [];

  return (
    <div className="min-h-screen bg-bg-base">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <AppHeader
        accentColor="primary"
        notificationCount={liveOrders.length}
        centerContent={
          <OverviewViewTabs activeView={activeView} onChange={setActiveView} />
        }
        rightExtras={
          <>
            <div className="hidden xl:block"><SyncStatus /></div>
            {/* Live clock */}
            <div className="hidden xl:flex items-center gap-2 text-xs text-zinc-500">
              <div className="live-dot w-1.5 h-1.5 rounded-full bg-accent-primary" />
              <span>{clockTime.toLocaleTimeString("it-IT")}</span>
            </div>
            {/* Refresh */}
            <button
              onClick={() => load()}
              className="hidden sm:flex p-1.5 md:p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </>
        }
      />

      {/* ── Desktop sidebar + content layout ──────────────────────────────────── */}
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">

      <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6 overflow-x-hidden">

        {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 w-full">
          <FilterBar
            marketplace={marketplace} setMarketplace={setMarketplace}
            status={status} setStatus={setStatus}
            selectedProduct={selectedProduct}
            onSelectProduct={setSelectedProduct}
          />
          <div className="ml-auto">
            <GlobalPeriodSelector />
          </div>
        </div>

        {/* ── Context banner (active filter) ──────────────────────────────────── */}
        {filterLabel && (
          <div className="flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: isAmazonMp ? "#fbbf24" : getMeta(marketplace).color }} />
            <span className="text-zinc-400">{filterLabel}</span>
            <button
              onClick={() => setMarketplace("all")}
              className="text-zinc-600 hover:text-zinc-300 transition-colors ml-1"
            >
              ✕ Rimuovi filtro
            </button>
          </div>
        )}


        {/* ── Main view area — driven by header tab (Tiles / Chart / P&L / Trends) ── */}

        {/* TILES: Sellerboard KPI cards + product search */}
        {activeView === "tiles" && (
          <>
            <SectionBar label="Business Intelligence" visible={sections.bi_overview} onToggle={() => toggleSection("bi_overview")} />
            {sections.bi_overview && (
              selectedProduct ? (
                <ProductBIOverview
                  product={selectedProduct}
                  onClear={() => setSelectedProduct(null)}
                />
              ) : (
                <SellerboardKpiCards
                  activePeriod={filter}
                  onPeriodSelect={(period: string) => {
                    if (period === "custom") {
                      setPreset("custom");
                    } else {
                      setPreset(period as any);
                    }
                  }}
                  setFrom={(from: string) => {
                    if (periodState.preset === "custom" && periodState.to) {
                      setDateRange(from, periodState.to);
                    }
                  }}
                  setTo={(to: string) => {
                    if (periodState.preset === "custom" && periodState.from) {
                      setDateRange(periodState.from, to);
                    }
                  }}
                />
              )
            )}
          </>
        )}

        {/* CHART: unified charts with tabs */}
        {activeView === "chart" && (
          <div className="space-y-4">
            <ChartsTabs
              data={timeseries}
              bucket={filter === "today" ? "minute" : "hour"}
              multiDay={filter !== "today" && filter !== "yesterday" && (filter !== "custom" || apiFrom !== apiTo)}
              amazonData={marketplace === "all" ? amazonTimeseries : undefined}
              onHourClick={setSelectedHour}
              marketplace={marketplace}
              isAmazonMp={isAmazonMp}
              amazonMpCode={amazonMpCode}
              filter={filter}
              from={apiFrom}
              to={apiTo}
              shopifyData={allShopifyMarketplaces}
              shopifyTotal={summary?.totalRevenue ?? 0}
              amazonByMarketplace={marketplace === "all" ? amazonSummary?.byMarketplace : undefined}
              amazonTotalRevenue={marketplace === "all" ? (amazonSummary?.totalRevenue ?? 0) : 0}
              onMarketplaceSelect={setMarketplace}
              loading={loading}
            />
          </div>
        )}

        {/* P&L: link to Amazon P&L page */}
        {activeView === "pl" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="text-center">
              <p className="text-white font-semibold mb-1">Profit &amp; Loss — Amazon</p>
              <p className="text-sm text-zinc-400">Visualizza margini, costi e redditività per periodo</p>
            </div>
            <a
              href="/amazon/pl"
              className="px-6 py-2.5 rounded-lg bg-accent-amber/10 border border-accent-amber/20 text-accent-amber font-medium hover:bg-accent-amber/20 transition-colors"
            >
              Apri sezione P&amp;L →
            </a>
          </div>
        )}

        {/* TRENDS: ShopifyBIOverview historical breakdown */}
        {activeView === "trends" && (
          <ShopifyBIOverview
            activeMarketplaces={allShopifyMarketplaces.map(([mp]) => mp)}
            onPeriodSelect={(period: string) => {
              if (period === "custom") {
                setPreset("custom");
              } else {
                setPreset(period as any);
              }
            }}
            onMarketplaceSelect={setMarketplace}
            activePeriod={filter}
            includeAmazon={true}
          />
        )}

        {/* ── Cross-channel product performance ──────────────────────────────── */}
        <div className="animate-in" style={{ animationDelay: "100ms" }}>
          <SectionBar label="Prodotti" visible={sections.products} onToggle={() => toggleSection("products")} />
          {sections.products && (
            <div className="mt-2">
              <CrossChannelProducts
                filter={filter}
                from={apiFrom}
                to={apiTo}
                marketplace={marketplace}
              />
            </div>
          )}
        </div>

        {/* ── Charts row — only in Tiles view (desktop) ─────────────────────── */}
        {activeView === "tiles" && (
          <div className="hidden md:block animate-in" style={{ animationDelay: "60ms" }}>
            <SectionBar label="Grafici andamento" visible={sections.charts} onToggle={() => toggleSection("charts")} />
            {sections.charts && (
              <div className="mt-2">
                <ChartsTabs
                  data={timeseries}
                  bucket={filter === "today" ? "minute" : "hour"}
                  multiDay={filter !== "today" && filter !== "yesterday" && (filter !== "custom" || apiFrom !== apiTo)}
                  amazonData={marketplace === "all" ? amazonTimeseries : undefined}
                  onHourClick={setSelectedHour}
                  marketplace={marketplace}
                  isAmazonMp={isAmazonMp}
                  amazonMpCode={amazonMpCode}
                  filter={filter}
                  from={apiFrom}
                  to={apiTo}
                  shopifyData={allShopifyMarketplaces}
                  shopifyTotal={summary?.totalRevenue ?? 0}
                  amazonByMarketplace={marketplace === "all" ? amazonSummary?.byMarketplace : undefined}
                  amazonTotalRevenue={marketplace === "all" ? (amazonSummary?.totalRevenue ?? 0) : 0}
                  onMarketplaceSelect={setMarketplace}
                  loading={loading}
                />
              </div>
            )}
          </div>
        )}


      </main>

        </div>{/* end flex-1 content wrapper */}
      </div>{/* end flex sidebar layout */}

      {/* ── Hourly channel breakdown modal ──────────────────────────────── */}
      <HourChannelModal
        hour={selectedHour}
        filter={filter}
        from={apiFrom}
        to={apiTo}
        marketplace={marketplace}
        onClose={() => setSelectedHour(null)}
      />

      {/* ── Hidden-sections pill (bottom-left, fixed) ─────────────────────── */}
      {Object.values(sections).some(v => !v) && (
        <div className="fixed bottom-4 left-4 z-50 flex flex-wrap gap-1.5 max-w-xs">
          {(Object.keys(sections) as SectionId[])
            .filter(id => !sections[id])
            .map(id => {
              const labels: Record<SectionId, string> = {
                bi_overview: "BI Overview", charts: "Grafici", products: "Prodotti",
              };
              return (
                <button
                  key={id}
                  onClick={() => toggleSection(id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-medium border border-zinc-700 bg-bg-card/90 backdrop-blur-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-all shadow-lg"
                >
                  <Eye size={10} />
                  {labels[id]}
                </button>
              );
            })
          }
        </div>
      )}

      {/* ── Live order toasts (bottom-right, fixed) ─────────────────────── */}
      <OrderToastContainer orders={liveOrders} onDismiss={dismissToast} />
    </div>
  );
}
