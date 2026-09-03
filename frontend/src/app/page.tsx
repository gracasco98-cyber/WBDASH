"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { api, Summary, TimePoint, Order, AmazonSummary, ProductPerformanceGroup } from "@/lib/api";
import { getMeta, formatEUR, formatCompact } from "@/lib/marketplaces";
import SalesTabs from "@/components/dashboard/SalesTabs";
import ChartsTabs from "@/components/dashboard/ChartsTabs";
import SyncStatus from "@/components/dashboard/SyncStatus";
import FilterBar, { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";
import GlobalPeriodSelector from "@/components/dashboard/GlobalPeriodSelector";
import PeriodTiles from "@/components/products/PeriodTiles";
import ProductsPerformanceTable, { GroupBy, RowEntry, buildShopifyMarketplaceRows } from "@/components/products/ProductsPerformanceTable";
import OrderToastContainer, { LiveOrder } from "@/components/dashboard/OrderToast";
import HourChannelModal from "@/components/dashboard/HourChannelModal";
import ShopifyBIOverview from "@/components/dashboard/ShopifyBIOverview";
import StuckOrdersBanner from "@/components/dashboard/StuckOrdersBanner";
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
import { useAmazonAccount } from "@/hooks/useAmazonAccount";

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
  const { state: periodState, setPreset } = usePeriodFilter();
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
  // null until mount — seeding with new Date() here would embed the server's
  // render time into the SSR HTML, which then mismatches the client's
  // hydration time and trips a hydration error.
  const [clockTime,   setClockTime]   = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);

  // Ref to detectNewOrders — allows load() to call it without creating a dependency cycle
  // (detectNewOrders is defined after load, so we use a ref that gets synced after definition)
  const detectNewOrdersRef = useRef<(orders: Order[]) => void>(() => {});


  // Detect if the selected marketplace is an Amazon channel (AMAZON_IT, AMAZON_DE, etc.)
  const isAmazonMp  = isAmazonChannel(marketplace);
  const amazonMpCode = amazonChannelCode(marketplace);   // "IT" | "DE" | "FR" | "ES" | null

  // ── Products performance (BUSINESS INTELLIGENCE / PRODOTTI sections) ──────
  // Declared after isAmazonMp/amazonMpCode since loadProductGroups depends on them.
  const [productsGroupBy, setProductsGroupBy] = useState<GroupBy>("marketplace");
  const [productGroups, setProductGroups] = useState<ProductPerformanceGroup[]>([]);
  const [shopifyMarketplaceRows, setShopifyMarketplaceRows] = useState<RowEntry[]>([]);

  const { selectedAccountId } = useAmazonAccount();
  // Main dashboard default: aggregate every active Amazon account when the
  // user hasn't drilled into one specific account (see PeriodTiles.tsx for
  // the matching change on the tiles above this table, and
  // amazon-account.middleware.ts for why the backend needs this explicitly).
  const productsAmazonAccountId = selectedAccountId ?? "ALL";

  const fetchProductGroups = useCallback(() => {
    const productMarketplace = isAmazonMp ? (amazonMpCode ?? "all") : "all";
    return api.productPerformance.get({ marketplace: productMarketplace, from: apiFrom, to: apiTo, amazonAccountId: productsAmazonAccountId });
  }, [isAmazonMp, amazonMpCode, apiFrom, apiTo, productsAmazonAccountId]);

  // Uncancellable on-demand reload — wired directly to ProductsPerformanceTable's
  // onRenamed/onMoved callbacks (fired outside the effect below, after a mutation
  // succeeds), so it always applies its result regardless of subsequent effect runs.
  const loadProductGroups = useCallback(async () => {
    try {
      const { groups } = await fetchProductGroups();
      setProductGroups(groups);
    } catch (err) {
      console.error("[DashboardPage] Failed to load product groups:", err);
    }
  }, [fetchProductGroups]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { groups } = await fetchProductGroups();
        if (!cancelled) setProductGroups(groups);
      } catch (err) {
        if (!cancelled) console.error("[DashboardPage] Failed to load product groups:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchProductGroups]);

  const params = useCallback(() => {
    const p: Record<string, string> = { filter: "custom", status };
    if (filter === "custom") {
      p.from = apiFrom; p.to = apiTo;
    } else {
      const range = getDateRangeForPreset(filter);
      if (range) { p.from = range.from; p.to = range.to; }
    }
    // Only pass Shopify marketplace filter for Shopify channels
    if (!isAmazonMp && marketplace !== "all") p.marketplace = marketplace;
    return p;
  }, [filter, marketplace, status, apiFrom, apiTo, isAmazonMp]);

  // ── Shopify (non-Amazon) marketplace rows for the home "Prodotti" table ──
  // Hidden when an Amazon-specific channel is selected (matches filterLabel's
  // "solo canale Amazon" semantics) — otherwise reuses the same /api/products
  // endpoint and marketplace scoping as the dedicated /products page.
  const loadShopifyMarketplaceRows = useCallback(async () => {
    if (isAmazonMp) { setShopifyMarketplaceRows([]); return; }
    try {
      const { products } = await api.products(params());
      setShopifyMarketplaceRows(buildShopifyMarketplaceRows(products));
    } catch (err) {
      console.error("[DashboardPage] Failed to load Shopify product performance:", err);
    }
  }, [isAmazonMp, params]);

  useEffect(() => {
    loadShopifyMarketplaceRows();
  }, [loadShopifyMarketplaceRows]);

  const load = useCallback(async () => {
    try {
      const p = params();

      // Amazon params: same date filter + optional Amazon-specific marketplace code
      const amazonParams: Record<string, string> = { filter: "custom" };
      if (filter === "custom") {
        amazonParams.from = apiFrom; amazonParams.to = apiTo;
      } else {
        const range = getDateRangeForPreset(filter);
        if (range) { amazonParams.from = range.from; amazonParams.to = range.to; }
      }
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

  // Live clock — ticks every second, independent of data refresh.
  // Seeds the first real value client-side only (see clockTime's useState).
  useEffect(() => {
    setClockTime(new Date());
    const t = setInterval(() => setClockTime(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // ─── Live order sticky notes ──────────────────────────────────────────────
  const [liveOrders, setLiveOrders]   = useState<LiveOrder[]>([]);
  const lastOrderIdRef                = useRef<string | null>(null);
  const isFirstLoadRef                = useRef(true);
  const loadRef                       = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Re-baseline the "new order" toast detector whenever the filter/scope
  // changes: a different filter's top order is not a new sale, just a
  // different view of existing orders — without this, switching marketplace/
  // date-range/status re-triggers load() (see the [load] effect above) and
  // detectNewOrders() below mistakes that different top-of-list order for a
  // fresh one, toasting a "new order" that never happened.
  useEffect(() => {
    isFirstLoadRef.current = true;
  }, [filter, marketplace, status, apiFrom, apiTo]);

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

  // Shared between the Tiles view (concatenated directly under PeriodTiles into one
  // panel) and every other tab (rendered standalone below that tab's own content).
  const productsTable = (
    <ProductsPerformanceTable
      groups={productGroups}
      groupBy={productsGroupBy}
      onGroupByChange={setProductsGroupBy}
      onRenamed={loadProductGroups}
      onMoved={loadProductGroups}
      onVatRateChanged={loadProductGroups}
      shopifyMarketplaceRows={shopifyMarketplaceRows}
    />
  );
  const productsBlock = sections.products && <div className="mt-2">{productsTable}</div>;

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
              <span>{clockTime ? clockTime.toLocaleTimeString("it-IT") : "--:--:--"}</span>
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

        <StuckOrdersBanner />

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

        {/* TILES: BI tiles + product table concatenated into a single Sellerboard-style panel */}
        {activeView === "tiles" && (
          selectedProduct ? (
            <>
              <SectionBar label="Business Intelligence" visible={sections.bi_overview} onToggle={() => toggleSection("bi_overview")} />
              {sections.bi_overview && (
                <ProductBIOverview
                  product={selectedProduct}
                  onClear={() => setSelectedProduct(null)}
                />
              )}
            </>
          ) : (
            <div className="space-y-2">
              <SectionBar label="Business Intelligence" visible={sections.bi_overview} onToggle={() => toggleSection("bi_overview")} />
              {sections.bi_overview && (
                <>
                  <div className="flex items-end justify-between gap-4 px-1 pb-1">
                    <div>
                      <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Confronto periodi</h1>
                      <p className="mt-0.5 text-[10px] text-zinc-500">Performance commerciale e marginalità a colpo d’occhio</p>
                    </div>
                    <div className="hidden sm:block rounded-full border border-bg-border bg-bg-card px-2.5 py-1 text-[10px] text-zinc-500">Dati aggiornati in tempo reale</div>
                  </div>
                  <PeriodTiles />
                </>
              )}
              {productsBlock}
            </div>
          )
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
        {/* On the Tiles view this is concatenated directly under PeriodTiles (see above) into
            one Sellerboard-style panel; on other tabs it renders standalone below that tab's content. */}
        {activeView !== "tiles" && (
          <div className="animate-in" style={{ animationDelay: "100ms" }}>
            <SectionBar label="Prodotti" visible={sections.products} onToggle={() => toggleSection("products")} />
            {sections.products && <div className="mt-2">{productsTable}</div>}
          </div>
        )}

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
