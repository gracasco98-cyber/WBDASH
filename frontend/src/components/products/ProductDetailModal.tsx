"use client";
import { useEffect, useState } from "react";
import { api, ProductPerformance, ProductHistoryPoint } from "@/lib/api";
import { getMeta } from "@/lib/marketplaces";
import { X, TrendingUp, Package, RotateCcw, Image as ImageIcon } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from "recharts";
import { fmtEur, fmtEurCompact, fmtNum } from "@/lib/fmt";

interface Props {
  product: ProductPerformance | null;
  onClose: () => void;
}

export default function ProductDetailModal({ product, onClose }: Props) {
  const [history, setHistory] = useState<ProductHistoryPoint[]>([]);
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("daily");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    api.productHistory(product.shopifyProductId, { marketplace: product.marketplace, granularity })
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [product, granularity]);

  if (!product) return null;

  const meta = getMeta(product.marketplace);

  // Format date label based on granularity
  const fmtDate = (d: string) => {
    if (granularity === "monthly") return d;
    if (granularity === "weekly") return d;
    const dt = new Date(d);
    return `${dt.getDate()}/${dt.getMonth() + 1}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4 pb-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl bg-bg-card border border-bg-border rounded-2xl shadow-2xl z-10">
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-bg-border">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-bg-base border border-bg-border flex-shrink-0 flex items-center justify-center">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.productTitle} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={24} className="text-zinc-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white leading-tight">{product.productTitle}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {product.sku && (
                <span className="text-xs font-mono text-zinc-400 bg-bg-base px-2 py-0.5 rounded border border-bg-border">
                  SKU: {product.sku}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: meta.bg, color: meta.color }}
              >
                {meta.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-bg-base text-zinc-400 hover:text-white transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* KPI mini cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-6 border-b border-bg-border">
          {[
            { label: "Unità vendute", value: fmtNum(product.unitsSold), icon: <Package size={14} />, color: "text-purple-400" },
            { label: "Fatturato lordo", value: fmtEur(product.grossRevenue), icon: <TrendingUp size={14} />, color: "text-green-400" },
            { label: "Fatturato netto", value: fmtEur(product.netRevenue), icon: <TrendingUp size={14} />, color: "text-accent-primary" },
            { label: "Rimborsi", value: fmtEur(product.refundedAmount), icon: <RotateCcw size={14} />, color: product.refundedAmount > 0 ? "text-red-400" : "text-zinc-500" },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-bg-base rounded-xl p-4 border border-bg-border">
              <div className={`flex items-center gap-2 mb-2 ${color}`}>{icon}<span className="text-xs text-zinc-400">{label}</span></div>
              <div className="text-lg font-bold text-white font-mono">{value}</div>
            </div>
          ))}
        </div>

        {/* Granularity tabs */}
        <div className="flex items-center gap-2 px-6 pt-4">
          <span className="text-xs text-zinc-500">Vista:</span>
          {(["daily", "weekly", "monthly"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                granularity === g
                  ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                  : "border-bg-border text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {g === "daily" ? "Giornaliero" : g === "weekly" ? "Settimanale" : "Mensile"}
            </button>
          ))}
        </div>

        {/* Charts */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="h-48 bg-bg-base animate-pulse rounded-xl" />
          ) : history.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
              Nessun dato storico disponibile. Attendi la prossima sincronizzazione snapshot.
            </div>
          ) : (
            <>
              {/* Revenue chart */}
              <div>
                <p className="text-xs text-zinc-400 font-medium mb-3 uppercase tracking-wide">Andamento Fatturato</p>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtEurCompact(v)} />
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "#a1a1aa" }}
                        formatter={(v: number) => [fmtEur(v), ""]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
                      <Line type="monotone" dataKey="grossRevenue" name="Lordo" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="netRevenue" name="Netto" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Units chart */}
              <div>
                <p className="text-xs text-zinc-400 font-medium mb-3 uppercase tracking-wide">Unità Vendute</p>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "#a1a1aa" }}
                      />
                      <Bar dataKey="unitsSold" name="Unità vendute" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
