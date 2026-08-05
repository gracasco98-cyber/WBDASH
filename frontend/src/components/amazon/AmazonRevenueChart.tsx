"use client";
import { useState, useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TimePoint } from "@/lib/api";
import { fmtEur, fmtEurCompact } from "@/lib/fmt";

interface Props {
  data: TimePoint[];
  loading: boolean;
  hourlyMode?: boolean;
  selectedDate?: string;
  onDateSelect?: (date: string) => void;
}

// Marketplace colours — consistent across the app
const MP_COLORS: Record<string, string> = {
  IT: "#22d3ee",   // cyan
  DE: "#f59e0b",   // amber
  FR: "#818cf8",   // indigo
  ES: "#f97316",   // orange
  UK: "#34d399",   // emerald
  SE: "#fb7185",   // rose
  PL: "#a78bfa",   // violet
  BE: "#67e8f9",   // sky
  NL: "#4ade80",   // green
};

const MP_LABEL: Record<string, string> = {
  IT: "Italia", DE: "Germania", FR: "Francia", ES: "Spagna",
  UK: "UK", SE: "Svezia", PL: "Polonia", BE: "Belgio", NL: "Olanda",
};

const TOTAL_COLOR = "#60a5fa";

const DAY_COLORS = [
  "#60a5fa", "#f97316", "#22d3ee", "#34d399", "#f59e0b", "#8b5cf6", "#ec4899"
];

function CustomTooltip({ active, payload, label, visibleMps, hourlyMode }: any) {
  if (!active || !payload?.length) return null;

  if (hourlyMode) {
    // Hourly mode: show all days at this hour
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[200px]">
        <p className="text-zinc-400 font-semibold mb-2">{label}</p>
        {payload.map((entry: any, idx: number) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
              <span className="text-zinc-400">{entry.name}</span>
            </span>
            <span className="text-white font-semibold tabular-nums">{fmtEur(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    );
  } else {
    // Daily mode: original logic
    const total = payload.find((p: any) => p.dataKey === "revenue");
    const mps   = payload.filter((p: any) => p.dataKey.startsWith("mp_"));
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[160px]">
        <p className="text-zinc-400 font-semibold mb-2">{label}</p>
        {visibleMps.length > 0 ? (
          <>
            {mps.map((entry: any) => {
              const mp = entry.dataKey.replace("mp_", "");
              return (
                <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
                    <span className="text-zinc-400">{MP_LABEL[mp] ?? mp}</span>
                  </span>
                  <span className="text-white font-semibold tabular-nums">{fmtEur(Number(entry.value ?? 0))}</span>
                </div>
              );
            })}
            <div className="border-t border-zinc-800 mt-1.5 pt-1.5 flex items-center justify-between gap-4">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Totale</span>
              <span className="text-white font-bold tabular-nums">{fmtEur(total ? Number(total.value ?? 0) : 0)}</span>
            </div>
          </>
        ) : (
          total && (
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TOTAL_COLOR }} />
                <span className="text-zinc-400">Fatturato</span>
              </span>
              <span className="text-white font-semibold tabular-nums">{fmtEur(Number(total.value ?? 0))}</span>
            </div>
          )
        )}
      </div>
    );
  }
}

export default function AmazonRevenueChart({ data, loading, hourlyMode = false, selectedDate, onDateSelect }: Props) {
  // Transform data: always group by hour with dates as series
  const transformedData = useMemo(() => {
    if (data.length === 0) return [];

    // Extract unique dates from time field (format: YYYY-MM-DDTHH:00)
    const dateMap = new Map<string, Map<string, number>>();
    for (const point of data) {
      const [date, time] = String(point.time).split("T");
      if (!date || !time) continue;
      if (!dateMap.has(date)) dateMap.set(date, new Map());
      dateMap.get(date)!.set(time, point.revenue as number);
    }

    // Get all unique times (hours)
    const allTimes = new Set<string>();
    for (const timeMap of dateMap.values()) {
      for (const time of timeMap.keys()) allTimes.add(time);
    }
    const sortedTimes = Array.from(allTimes).sort();

    // Get unique dates sorted
    const sortedDates = Array.from(dateMap.keys()).sort();

    // Build chart data: { time: "HH:00", "2026-04-22": 123.45, "2026-04-21": 98.76, ... }
    const chartData = sortedTimes.map(time => {
      const row: Record<string, any> = { time };
      for (const date of sortedDates) {
        row[date] = dateMap.get(date)?.get(time) ?? 0;
      }
      return row;
    });

    return chartData;
  }, [data]);

  // Detect which marketplaces are present in data (daily mode only)
  const presentMps = useMemo(() => {
    if (hourlyMode) return [];
    const found = new Set<string>();
    for (const d of data) {
      for (const key of Object.keys(d)) {
        if (key.startsWith("mp_") && !key.startsWith("mpc_")) {
          const mp = key.slice(3);
          if (Number(d[key]) > 0) found.add(mp);
        }
      }
    }
    return Array.from(found).sort((a, b) => {
      // Sort by total revenue descending
      const totA = data.reduce((s, d) => s + Number(d[`mp_${a}`] ?? 0), 0);
      const totB = data.reduce((s, d) => s + Number(d[`mp_${b}`] ?? 0), 0);
      return totB - totA;
    });
  }, [data, hourlyMode]);

  // Toggle state: set of visible marketplace codes
  const [visibleMps, setVisibleMps] = useState<Set<string>>(new Set());

  // Sync visibleMps when presentMps changes (new data loaded)
  const allMpsKey = presentMps.join(",");
  useMemo(() => {
    setVisibleMps(new Set(presentMps));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMpsKey]);

  const toggleMp = (mp: string) => {
    setVisibleMps(prev => {
      const next = new Set(prev);
      if (next.has(mp)) next.delete(mp);
      else next.add(mp);
      return next;
    });
  };

  const selectOnly = (mp: string) => {
    setVisibleMps(new Set([mp]));
  };

  const selectAll = () => setVisibleMps(new Set(presentMps));

  const showingAll = visibleMps.size === presentMps.length;
  const showingTotal = visibleMps.size === 0;

  if (loading) {
    return <div className="h-64 bg-bg-card border border-bg-border rounded-xl animate-pulse" />;
  }

  // Always show hourly view (default behavior)
  const dateLabels = Object.keys(transformedData[0] || {}).filter(k => k !== "time");

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-white">Andamento Giornaliero - Totale per Fascia Oraria</h3>
      </div>

      {transformedData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-zinc-600 text-sm">
          Nessun dato disponibile — esegui un backfill dal Sync Center
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={transformedData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtEurCompact}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                content={<CustomTooltip hourlyMode={true} visibleMps={[]} />}
                cursor={{ stroke: "var(--text-secondary)", strokeWidth: 1 }}
              />
              {dateLabels.map((date, idx) => (
                <Line
                  key={date}
                  type="monotone"
                  dataKey={date}
                  stroke={DAY_COLORS[idx % DAY_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={new Date(date + "T12:00").toLocaleDateString("it-IT", { weekday: "short", month: "short", day: "numeric" })}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 text-[9px] text-zinc-700 text-center">
            Confronto vendite per ora tra {dateLabels.length} giorn{dateLabels.length === 1 ? "o" : "i"}
          </div>
        </>
      )}
    </div>
  );
}
