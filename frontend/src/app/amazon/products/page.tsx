"use client";
import { useState, useEffect, useCallback } from "react";
import { api, AmazonProduct, AmazonProductsResponse } from "@/lib/api";
import AmazonFilterBar from "@/components/amazon/AmazonFilterBar";
import AmazonProductsTable from "@/components/amazon/AmazonProductsTable";
import { RefreshCw, Search, Download } from "lucide-react";
import { fmtEur } from "@/lib/fmt";

export default function AmazonProductsPage() {
  const [filter,      setFilter]      = useState("last30");
  const [from,        setFrom]        = useState("");
  const [to,          setTo]          = useState("");
  const [marketplace, setMarketplace] = useState("all");
  const [search,      setSearch]      = useState("");
  const [sortBy,      setSortBy]      = useState("grossRevenue");
  const [sortDir,     setSortDir]     = useState("desc");
  const [data,        setData]        = useState<AmazonProductsResponse | null>(null);
  const [loading,     setLoading]     = useState(true);

  // Default custom dates to today when switching to custom mode
  const handleFilterChange = (f: string) => {
    setFilter(f);
    if (f === "custom" && !from) {
      const today = new Date().toISOString().split("T")[0];
      setFrom(today);
      setTo(today);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { filter, sortBy, sortDir };
      if (filter === "custom") {
        if (from) params.from = from;
        if (to)   params.to   = to;
      }
      if (marketplace !== "all") params.marketplace = marketplace;
      if (search) params.search = search;
      setData(await api.amazon.products(params));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter, from, to, marketplace, search, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  // Build export URL with all active filters (including custom dates)
  const handleExport = () => {
    const params: Record<string, string> = { filter };
    if (filter === "custom") {
      if (from) params.from = from;
      if (to)   params.to   = to;
    }
    if (marketplace !== "all") params.marketplace = marketplace;
    api.amazon.exportOrders(params);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">Prodotti Amazon</h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">Vendite per ASIN / SKU su Amazon EU</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg hover:bg-emerald-500/20 transition-colors"
          >
            <Download size={13} /> Esporta CSV
          </button>
          <button
            onClick={load}
            className="p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* KPI row */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
          {[
            { label: "Fatturato Lordo",   value: fmtEur(data.kpis.totalGross),                                color: "text-white"        },
            { label: "Payout Stimato",    value: fmtEur(data.products.reduce((s,p) => s + p.estPayout, 0)),    color: "text-blue-400"     },
            { label: "Utile Lordo",       value: fmtEur(data.products.reduce((s,p) => s + p.grossProfit, 0)),  color: data.products.reduce((s,p) => s + p.grossProfit, 0) >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Comm. Stimate",     value: fmtEur(data.products.reduce((s,p) => s + p.estFees, 0)),      color: "text-red-400"      },
            { label: "COGS Totale",       value: fmtEur(data.products.reduce((s,p) => s + p.cogsTotal, 0)),    color: "text-orange-400"   },
            { label: "Unità Vendute",     value: String(data.kpis.totalUnits),                                 color: "text-zinc-300"     },
            { label: "N° Prodotti",       value: String(data.kpis.productCount),                               color: "text-zinc-300"     },
          ].map((k) => (
            <div key={k.label} className="bg-bg-card border border-bg-border rounded-xl p-3">
              <div className="text-xs text-zinc-500 mb-1">{k.label}</div>
              <div className={`text-sm font-semibold tabular-nums ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <AmazonFilterBar
          filter={filter}
          marketplace={marketplace}
          onFilterChange={handleFilterChange}
          onMarketplaceChange={setMarketplace}
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
        />

        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Cerca ASIN / SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-bg-card border border-bg-border text-zinc-300 text-xs rounded-lg pl-8 pr-4 py-2 w-48 focus:outline-none focus:border-accent-primary/40 placeholder:text-zinc-600"
          />
        </div>

        <select
          value={`${sortBy}:${sortDir}`}
          onChange={(e) => {
            const [k, d] = e.target.value.split(":");
            setSortBy(k);
            setSortDir(d);
          }}
          className="bg-bg-card border border-bg-border text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-primary/40"
        >
          <option value="grossRevenue:desc">Fatturato ↓</option>
          <option value="grossRevenue:asc">Fatturato ↑</option>
          <option value="unitsSold:desc">Unità ↓</option>
          <option value="unitsSold:asc">Unità ↑</option>
          <option value="orderCount:desc">Ordini ↓</option>
        </select>

        <div className="ml-auto text-xs text-zinc-500">
          {data ? `${data.products.length} prodotti` : "—"}
        </div>
      </div>

      <AmazonProductsTable products={data?.products ?? []} loading={loading} />
    </div>
  );
}
