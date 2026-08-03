"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, ProductPerformance, ProductsResponse } from "@/lib/api";
import ProductTable from "@/components/products/ProductTable";
import ProductDetailModal from "@/components/products/ProductDetailModal";
import ChannelDailyView from "@/components/products/ChannelDailyView";
import SyncStatus from "@/components/dashboard/SyncStatus";
import ShopifyBIOverview from "@/components/dashboard/ShopifyBIOverview";
import SellerboardKpiCards from "@/components/dashboard/SellerboardKpiCards";
import OverviewViewTabs, { DashboardView } from "@/components/dashboard/OverviewViewTabs";
import { RefreshCw, Search, BarChart2, Package } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { getMeta } from "@/lib/marketplaces";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";

const MARKETPLACES = [
  "all", "REDCARE_IT", "REDCARE_DE", "TEMU_IT", "TEMU_ES", "TEMU_FR", "TEMU_DE",
  "EBAY", "BENU_FARMA", "TIKTOK", "UNCLASSIFIED",
];

const DATE_FILTERS = [
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7", label: "7 giorni" },
  { value: "last30", label: "30 giorni" },
  { value: "month", label: "Questo mese" },
];

type Tab = "products" | "channels";

export default function ProductsPage() {
  const [tab, setTab] = useState<Tab>("products");
  const [activeView, setActiveView] = useState<DashboardView>("tiles");

  // Products tab state
  const [filter, setFilter] = useState("last30");
  const { marketplace, setMarketplace } = useMarketplaceFilter();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("grossRevenue");
  const [sortDir, setSortDir] = useState("desc");
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ProductPerformance | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [clockTime,   setClockTime]   = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { filter, sortBy, sortDir };
      if (marketplace !== "all") params.marketplace = marketplace;
      if (search) params.search = search;
      const result = await api.products(params);
      setData(result);
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter, marketplace, search, sortBy, sortDir]);

  useEffect(() => {
    if (tab === "products") load();
  }, [load, tab]);

  useEffect(() => {
    const t = setInterval(() => { if (tab === "products") load(); }, 120_000);
    return () => clearInterval(t);
  }, [load, tab]);

  // Live clock — ticks every second
  useEffect(() => {
    const t = setInterval(() => setClockTime(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <AppHeader
        accentColor="primary"
        centerContent={
          <OverviewViewTabs activeView={activeView} onChange={setActiveView} />
        }
        rightExtras={
          <>
            <div className="hidden sm:block"><SyncStatus /></div>
            <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
              <span>Agg. {clockTime.toLocaleTimeString("it-IT")}</span>
            </div>
            <button
              onClick={load}
              className="p-1.5 md:p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </>
        }
      />

      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
      <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Page header + tabs */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Marketplace</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Vendite per prodotto e per canale marketplace con storico giornaliero.
            </p>
          </div>
          {/* Inner tab switcher */}
          <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1 self-start sm:self-auto">
            <button
              onClick={() => setTab("products")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg font-medium transition-all ${
                tab === "products"
                  ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Package size={13} />
              <span className="hidden sm:inline">Per </span>Prodotto
            </button>
            <button
              onClick={() => setTab("channels")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg font-medium transition-all ${
                tab === "channels"
                  ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <BarChart2 size={13} />
              <span className="hidden sm:inline">Per </span>Canale
            </button>
          </div>
        </div>

        {/* ── View: Tiles shows KPI cards, Chart shows channel view, Trends shows BI overview ── */}
        {activeView === "tiles" && (
          <SellerboardKpiCards
            activePeriod={filter}
            onPeriodSelect={(period) => {
              setFilter(period);
              setTab("products");
            }}
            defaultSource="shopify"
          />
        )}

        {activeView === "chart" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Andamento vendite per canale</p>
            <ChannelDailyView />
          </div>
        )}

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

        {activeView === "trends" && (
          <ShopifyBIOverview
            onPeriodSelect={(period) => {
              setFilter(period);
              setTab("products");
            }}
            activePeriod={filter}
          />
        )}

        {/* ── TAB: Per Prodotto ── */}
        {tab === "products" && (
          <>
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 bg-bg-card border border-bg-border rounded-lg p-1 overflow-x-auto scrollbar-hide">
                {DATE_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-md transition-all whitespace-nowrap ${
                      filter === f.value
                        ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <select
                value={marketplace}
                onChange={(e) => setMarketplace(e.target.value)}
                className="w-full sm:w-auto bg-bg-card border border-bg-border text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-primary/40"
              >
                <option value="all">Tutti i canali</option>
                {MARKETPLACES.filter((m) => m !== "all").map((m) => (
                  <option key={m} value={m}>{getMeta(m).label}</option>
                ))}
              </select>

              <div className="relative w-full sm:w-auto">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Cerca prodotto / SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-52 bg-bg-card border border-bg-border text-zinc-300 text-xs rounded-lg pl-8 pr-4 py-2 focus:outline-none focus:border-accent-primary/40 placeholder:text-zinc-600"
                />
              </div>

              <select
                value={`${sortBy}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(":");
                  setSortBy(k);
                  setSortDir(d);
                }}
                className="w-full sm:w-auto bg-bg-card border border-bg-border text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-primary/40"
              >
                <option value="grossRevenue:desc">Fatturato ↓</option>
                <option value="grossRevenue:asc">Fatturato ↑</option>
                <option value="unitsSold:desc">Unità ↓</option>
                <option value="unitsSold:asc">Unità ↑</option>
                <option value="netRevenue:desc">Netto ↓</option>
                <option value="refundedAmount:desc">Rimborsi ↓</option>
              </select>

              <div className="sm:ml-auto text-xs text-zinc-500">
                {data ? `${data.products.length} prodotti` : "—"}
              </div>
            </div>

            <ProductTable
              products={data?.products ?? []}
              loading={loading}
              onDetail={setSelectedProduct}
            />

            <div className="text-xs text-zinc-600 space-y-1">
              <p>* I dati sono aggregati dagli ordini Shopify sincronizzati. Lo snapshot storico viene aggiornato ogni ora.</p>
              <p>* I rimborsi sono approssimati: Shopify non sempre espone il rimborso per singola riga d&apos;ordine.</p>
            </div>
          </>
        )}

        {/* ── TAB: Per Canale ── */}
        {tab === "channels" && (
          <ChannelDailyView />
        )}
      </main>
        </div>{/* end flex-1 */}
      </div>{/* end flex */}

      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}
