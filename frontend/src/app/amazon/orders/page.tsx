"use client";
import { useState, useEffect, useCallback } from "react";
import { api, AmazonOrdersResponse } from "@/lib/api";
import AmazonFilterBar from "@/components/amazon/AmazonFilterBar";
import AmazonOrdersTable from "@/components/amazon/AmazonOrdersTable";
import { RefreshCw, Download } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export default function AmazonOrdersPage() {
  const [filter,      setFilter]      = useState("last30");
  const [from,        setFrom]        = useState("");
  const [to,          setTo]          = useState("");
  const [marketplace, setMarketplace] = useState("all");
  const [status,      setStatus]      = useState("");
  const [page,        setPage]        = useState(1);
  const [data,        setData]        = useState<AmazonOrdersResponse | null>(null);
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
      const params: Record<string, string> = { filter, page: String(page), limit: "50" };
      if (filter === "custom") {
        if (from) params.from = from;
        if (to)   params.to   = to;
      }
      if (marketplace !== "all") params.marketplace = marketplace;
      if (status) params.status = status;
      setData(await api.amazon.orders(params));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter, from, to, marketplace, status, page]);

  useEffect(() => { load(); }, [load]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filter, from, to, marketplace, status]);

  const STATUS_OPTIONS = ["", "Shipped", "Delivered", "Pending", "Unshipped", "Canceled"];

  const handleExport = () => {
    const params = new URLSearchParams({ filter });
    if (filter === "custom") {
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
    }
    if (marketplace !== "all") params.set("marketplace", marketplace);
    if (status) params.set("status", status);
    window.location.href = `${BASE}/api/amazon/orders/export?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">Ordini Amazon</h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">Tutti gli ordini sincronizzati da Amazon SP-API</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 text-xs font-medium transition-colors"
          >
            <Download size={13} />
            Esporta CSV
          </button>
          <button
            onClick={load}
            className="p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

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

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-bg-card border border-bg-border text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || "Tutti gli status"}</option>
          ))}
        </select>

        <div className="ml-auto text-xs text-zinc-500">
          {data ? `${data.total} ordini totali` : "—"}
        </div>
      </div>

      <AmazonOrdersTable
        orders={data?.orders ?? []}
        total={data?.total ?? 0}
        page={page}
        loading={loading}
        onPageChange={setPage}
      />
    </div>
  );
}
