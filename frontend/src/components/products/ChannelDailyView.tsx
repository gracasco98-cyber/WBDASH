"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ChannelDailyResponse } from "@/lib/api";
import { getMeta } from "@/lib/marketplaces";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar,
} from "recharts";
import { TrendingUp, Package, ShoppingBag, RotateCcw } from "lucide-react";
import { fmtEur, fmtEurCompact, fmtNum } from "@/lib/fmt";

function fmtDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
}

const FILTERS = [
  { value: "last7", label: "7 giorni" },
  { value: "last30", label: "30 giorni" },
  { value: "month", label: "Questo mese" },
  { value: "last90", label: "90 giorni" },
];

interface Props {
  initialFilter?: string;
}

export default function ChannelDailyView({ initialFilter = "last30" }: Props) {
  const [filter, setFilter] = useState(initialFilter);
  const [data, setData] = useState<ChannelDailyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChannels, setActiveChannels] = useState<Set<string>>(new Set());
  const [metric, setMetric] = useState<"grossRevenue" | "unitsSold">("grossRevenue");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.channelDaily({ filter });
      setData(result);
      setActiveChannels(new Set(result.marketplaces));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const toggleChannel = (mp: string) => {
    setActiveChannels((prev) => {
      const next = new Set(prev);
      if (next.has(mp)) { next.delete(mp); } else { next.add(mp); }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-bg-card rounded-lg animate-pulse" />
        <div className="h-72 bg-bg-card rounded-xl animate-pulse" />
        <div className="h-48 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data || data.marketplaces.length === 0) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-12 text-center">
        <TrendingUp size={40} className="mx-auto mb-3 text-zinc-600" />
        <p className="text-zinc-400">Nessun dato disponibile per il periodo selezionato.</p>
        <p className="text-xs text-zinc-600 mt-1">Assicurati che la sincronizzazione sia completata.</p>
      </div>
    );
  }

  // Filter chart data to active channels only
  const chartData = data.chartData.map((row) => {
    const filtered: Record<string, string | number> = { date: fmtDate(row.date as string) };
    let total = 0;
    for (const mp of data.marketplaces) {
      if (activeChannels.has(mp)) {
        const val = metric === "unitsSold"
          ? (data.rows.filter(r => r.date === row.date && r.marketplace === mp)
              .reduce((s, r) => s + r.unitsSold, 0))
          : Number(row[mp] ?? 0);
        filtered[mp] = val;
        total += val;
      }
    }
    filtered.total = total;
    return filtered;
  });

  // Totals for active channels only
  const activeTotals = Object.entries(data.totals)
    .filter(([mp]) => activeChannels.has(mp))
    .sort((a, b) => b[1].grossRevenue - a[1].grossRevenue);

  const grandTotal = activeTotals.reduce((s, [, t]) => s + t.grossRevenue, 0);
  const grandUnits = activeTotals.reduce((s, [, t]) => s + t.unitsSold, 0);
  const grandOrders = activeTotals.reduce((s, [, t]) => s + t.orderCount, 0);

  // Build pivot table: rows=dates (desc), cols=channels
  const pivotDates = [...data.dates].reverse().slice(0, 30); // last 30 days newest first

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period */}
        <div className="flex items-center gap-0.5 bg-bg-card border border-bg-border rounded-lg p-1 overflow-x-auto scrollbar-hide">
          {FILTERS.map((f) => (
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

        {/* Metric toggle */}
        <div className="flex items-center gap-0.5 bg-bg-card border border-bg-border rounded-lg p-1">
          <button
            onClick={() => setMetric("grossRevenue")}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-md transition-all ${
              metric === "grossRevenue"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Fatturato
          </button>
          <button
            onClick={() => setMetric("unitsSold")}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-md transition-all ${
              metric === "unitsSold"
                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            UnitÃ 
          </button>
        </div>
      </div>

      {/* KPI summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Fatturato totale", value: fmtEur(grandTotal), icon: <TrendingUp size={14} />, color: "text-green-400" },
          { label: "UnitÃ  vendute", value: fmtNum(grandUnits), icon: <Package size={14} />, color: "text-purple-400" },
          { label: "Ordini", value: fmtNum(grandOrders), icon: <ShoppingBag size={14} />, color: "text-blue-400" },
          { label: "Canali attivi", value: String(activeTotals.length), icon: <RotateCcw size={14} />, color: "text-amber-400" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-bg-card rounded-xl p-3 sm:p-4 border border-bg-border">
            <div className={`flex items-center gap-2 mb-1 sm:mb-1.5 ${color}`}>{icon}<span className="text-[10px] sm:text-xs text-zinc-400">{label}</span></div>
            <div className="text-lg sm:text-xl font-bold text-white font-mono">{value}</div>
          </div>
        ))}
      </div>

      {/* Channel toggle pills */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {data.marketplaces.map((mp) => {
          const meta = getMeta(mp);
          const active = activeChannels.has(mp);
          const total = data.totals[mp];
          return (
            <button
              key={mp}
              onClick={() => toggleChannel(mp)}
              className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium border transition-all ${
                active ? "opacity-100" : "opacity-35"
              }`}
              style={{
                borderColor: active ? meta.color : "rgba(255,255,255,0.06)",
                background: active ? meta.bg : "transparent",
                color: active ? meta.color : "#a1a1aa",
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
              {meta.label}
              <span className="font-mono opacity-80">{fmtEurCompact(total?.grossRevenue ?? 0)}</span>
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-bg-border bg-bg-card p-3 sm:p-5">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <p className="text-xs sm:text-sm font-medium text-zinc-300">
            {metric === "grossRevenue" ? "Fatturato giornaliero per canale" : "UnitÃ  vendute per canale"}
          </p>
          <span className="text-xs text-zinc-500">{data.dates.length} giorni</span>
        </div>
        <div className="h-[200px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717a", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={data.dates.length > 20 ? Math.floor(data.dates.length / 15) : 0}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={metric === "grossRevenue" ? fmtEurCompact : (v) => String(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#a1a1aa", marginBottom: 6 }}
                formatter={(value: number, name: string) => {
                  const meta = getMeta(name);
                  return [
                    metric === "grossRevenue" ? fmtEur(value) : fmtNum(value),
                    meta.label,
                  ];
                }}
              />
              <Legend
                formatter={(value) => getMeta(value).label}
                wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
              />
              {data.marketplaces
                .filter((mp) => activeChannels.has(mp))
                .map((mp) => (
                  <Bar
                    key={mp}
                    dataKey={mp}
                    stackId="a"
                    fill={getMeta(mp).color}
                    name={mp}
                    radius={mp === data.marketplaces[data.marketplaces.length - 1] ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-channel summary table */}
      <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-bg-border">
          <p className="text-sm font-medium text-zinc-300">Riepilogo per canale</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-bg-base/40 border-b border-bg-border">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wide">Canale</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wide">UnitÃ </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wide">Ordini</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wide">Fatturato</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wide">Netto</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wide">% sul totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {activeTotals.map(([mp, t]) => {
                const meta = getMeta(mp);
                const pct = grandTotal > 0 ? (t.grossRevenue / grandTotal) * 100 : 0;
                return (
                  <tr key={mp} className="hover:bg-bg-base/20 transition-colors">
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-white tabular-nums">
                      {fmtNum(t.unitsSold)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-zinc-400 tabular-nums">
                      {fmtNum(t.orderCount)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-white tabular-nums">
                      {fmtEur(t.grossRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-accent-primary tabular-nums">
                      {fmtEur(t.netRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-bg-base overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: meta.color }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400 tabular-nums w-8 text-right">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="bg-bg-base/40 font-medium">
                <td className="px-5 py-3 text-sm text-zinc-300">Totale</td>
                <td className="px-4 py-3 text-right text-sm font-mono text-white tabular-nums">{fmtNum(grandUnits)}</td>
                <td className="px-4 py-3 text-right text-sm font-mono text-zinc-400 tabular-nums">{fmtNum(grandOrders)}</td>
                <td className="px-4 py-3 text-right text-sm font-mono text-white tabular-nums">{fmtEur(grandTotal)}</td>
                <td className="px-4 py-3 text-right text-sm font-mono text-accent-primary tabular-nums">
                  {fmtEur(activeTotals.reduce((s, [, t]) => s + t.netRevenue, 0))}
                </td>
                <td className="px-4 py-3 text-right text-xs text-zinc-500">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily pivot table (newest first, last 30 days) */}
      <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-bg-border flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-300">Dettaglio giornaliero per canale (fatturato)</p>
          <span className="text-xs text-zinc-500">{pivotDates.length} giorni piÃ¹ recenti</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-bg-base/40 border-b border-bg-border">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-400 uppercase tracking-wide sticky left-0 bg-bg-base/60">Data</th>
                {data.marketplaces.filter(mp => activeChannels.has(mp)).map((mp) => (
                  <th
                    key={mp}
                    className="px-4 py-2.5 text-right font-medium uppercase tracking-wide whitespace-nowrap"
                    style={{ color: getMeta(mp).color }}
                  >
                    {getMeta(mp).label}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-medium text-zinc-300 uppercase tracking-wide">Totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {pivotDates.map((date) => {
                const activeMarketplaces = data.marketplaces.filter((mp) => activeChannels.has(mp));
                const rowTotal = activeMarketplaces.reduce((s, mp) => {
                  const row = data.rows.find((r) => r.date === date && r.marketplace === mp);
                  return s + (row?.grossRevenue ?? 0);
                }, 0);
                if (rowTotal === 0) return null;
                return (
                  <tr key={date} className="hover:bg-bg-base/20 transition-colors">
                    <td className="px-4 py-2 font-mono text-zinc-400 sticky left-0 bg-bg-card whitespace-nowrap">
                      {new Date(date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    </td>
                    {activeMarketplaces.map((mp) => {
                      const row = data.rows.find((r) => r.date === date && r.marketplace === mp);
                      const val = row?.grossRevenue ?? 0;
                      return (
                        <td key={mp} className="px-4 py-2 text-right font-mono tabular-nums">
                          <span className={val > 0 ? "text-white" : "text-zinc-700"}>
                            {val > 0 ? fmtEurCompact(val) : "â€”"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-mono text-white font-medium tabular-nums">
                      {fmtEurCompact(rowTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
