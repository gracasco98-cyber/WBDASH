"use client";
import { useMemo } from "react";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TimePoint } from "@/lib/api";
import { formatEUR, formatCompact } from "@/lib/marketplaces";

interface Props {
  data: TimePoint[];
  bucket: "minute" | "hour";
  multiDay?: boolean;
  amazonData?: TimePoint[];
  /** Called when user clicks an area point — receives Italy local hour "HH:00" */
  onHourClick?: (hour: string) => void;
  /** When true, renders without the outer card wrapper (used inside SalesTabs) */
  hideCard?: boolean;
}

// ─── Tooltip for stacked AreaChart ───────────────────────────────────────────
const AreaTooltip = ({ active, payload, label, stacked }: any) => {
  if (!active || !payload?.length) return null;

  if (stacked) {
    const shopify = payload.find((p: any) => p.dataKey === "shopifyRevenue")?.value ?? 0;
    const amazon  = payload.find((p: any) => p.dataKey === "amazonRevenue")?.value ?? 0;
    const count   = payload.find((p: any) => p.dataKey === "count")?.value ?? 0;
    return (
      <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs space-y-1">
        <div className="text-zinc-400 font-medium">{label}</div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          <span className="text-zinc-300">Shopify</span>
          <span className="text-white font-semibold ml-auto">{formatEUR(shopify)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          <span className="text-zinc-300">Amazon</span>
          <span className="text-white font-semibold ml-auto">{formatEUR(amazon)}</span>
        </div>
        <div className="border-t border-white/5 pt-1 flex justify-between text-zinc-500">
          <span>Totale</span>
          <span className="text-zinc-300 font-semibold">{formatEUR(shopify + amazon)}</span>
        </div>
        <div className="text-zinc-600">{count} ordini</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      <div className="text-white font-medium">{formatEUR(payload[0]?.value ?? 0)}</div>
    </div>
  );
};

// ─── Legend ───────────────────────────────────────────────────────────────────
const Legend = ({ stacked }: { stacked: boolean }) => (
  <div className="flex items-center gap-4 text-xs text-zinc-500">
    {stacked ? (
      <>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded bg-emerald-400/70 inline-block" />
          Shopify
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded bg-amber-400/70 inline-block" />
          Amazon
        </span>
      </>
    ) : (
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-0.5 rounded bg-accent-primary/70 inline-block" />
        Fatturato
      </span>
    )}
  </div>
);

export default function SalesChart({ data, bucket, multiDay = false, amazonData, onHourClick, hideCard = false }: Props) {
  const showStacked = multiDay && !!amazonData && amazonData.length > 0;
  const amazonDayTotal = !multiDay && amazonData && amazonData.length > 0
    ? amazonData.reduce((s, d) => s + d.revenue, 0) : 0;

  // Aggregate minute data → hourly and pad to full 24 hours (00:00–23:00)
  const hourlyData24 = useMemo(() => {
    if (multiDay) return data;
    const groups: Record<string, { time: string; revenue: number; count: number }> = {};
    if (bucket === "minute") {
      for (const pt of data) {
        const hh  = pt.time.split(":")[0];
        const key = `${hh}:00`;
        if (!groups[key]) groups[key] = { time: key, revenue: 0, count: 0 };
        groups[key].revenue += pt.revenue;
        groups[key].count   += pt.count;
      }
    } else {
      for (const pt of data) groups[pt.time] = { ...pt };
    }
    // Pad all 24 hours with 0 for missing slots
    for (let h = 0; h < 24; h++) {
      const key = `${String(h).padStart(2, "0")}:00`;
      if (!groups[key]) groups[key] = { time: key, revenue: 0, count: 0 };
    }
    return Object.values(groups).sort((a, b) => a.time.localeCompare(b.time));
  }, [data, bucket, multiDay]);

  // Stacked merge (multi-day Shopify + Amazon)
  const mergedData = useMemo(() => {
    if (!showStacked) return data;
    const shopifyMap = new Map(data.map(d => [d.time, d]));
    const amazonMap  = new Map((amazonData ?? []).map(d => [d.time, d]));
    const allKeys    = new Set([...shopifyMap.keys(), ...amazonMap.keys()]);
    return [...allKeys].sort().map(time => ({
      time,
      shopifyRevenue: shopifyMap.get(time)?.revenue ?? 0,
      amazonRevenue:  amazonMap.get(time)?.revenue  ?? 0,
      count: (shopifyMap.get(time)?.count ?? 0) + (amazonMap.get(time)?.count ?? 0),
    }));
  }, [data, amazonData, showStacked]);

  const formatLabel = (label: string) => {
    if (!multiDay) return label;
    const parts = label.split("-");
    if (parts.length !== 3) return label;
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  };

  const chartData = showStacked ? mergedData : multiDay ? data : hourlyData24;
  const isEmpty   = chartData.length === 0;

  const handleAreaClick = (entry: any) => {
    if (entry?.activePayload?.[0] && onHourClick) {
      onHourClick(entry.activePayload[0].payload.time);
    }
  };

  const inner = (
    <div className={hideCard ? "h-full min-h-[200px] sm:min-h-[260px]" : "rounded-xl border border-bg-border bg-bg-card p-3 sm:p-5 h-full min-h-[240px] sm:min-h-[300px]"}>
      {/* Header: title + legend (hidden when embedded in SalesTabs) */}
      {!hideCard && (
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Andamento Vendite</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {multiDay ? "Per giorno" : "Per fascia oraria — clicca per dettaglio"}
              {" "}— ora locale Italia
              {showStacked && <span className="ml-1 text-accent-primary/70">· Shopify + Amazon</span>}
            </p>
          </div>
          <Legend stacked={showStacked} />
        </div>
      )}

      {isEmpty ? (
        <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">
          Nessun dato per il periodo selezionato
        </div>
      ) : showStacked ? (
        /* ── Stacked AreaChart (multi-day Shopify + Amazon) ── */
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={mergedData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradShopify" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gradAmazon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={formatLabel}
            />
            <YAxis
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
              width={48}
            />
            <Tooltip content={<AreaTooltip stacked={true} />} cursor={{ stroke: "#2a2a3e", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="amazonRevenue" stackId="1"
              stroke="#fbbf24" strokeWidth={1.5} fill="url(#gradAmazon)"
              dot={false} activeDot={{ r: 3, fill: "#fbbf24", stroke: "#0a0a0f", strokeWidth: 2 }} />
            <Area type="monotone" dataKey="shopifyRevenue" stackId="1"
              stroke="#6ee7b7" strokeWidth={2} fill="url(#gradShopify)"
              dot={false} activeDot={{ r: 4, fill: "#6ee7b7", stroke: "#0a0a0f", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        /* ── Single-source AreaChart (intraday hourly or multi-day) ── */
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            onClick={onHourClick ? handleAreaClick : undefined}
            style={onHourClick && !multiDay ? { cursor: "pointer" } : undefined}
          >
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={formatLabel}
            />
            <YAxis
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`}
              width={52}
            />
            <Tooltip content={<AreaTooltip stacked={false} />} cursor={{ stroke: "#2a2a3e", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="revenue"
              stroke="#6ee7b7" strokeWidth={2} fill="url(#gradRevenue)"
              dot={false} activeDot={{ r: 4, fill: "#6ee7b7", stroke: "#0a0a0f", strokeWidth: 2 }} />
            {amazonDayTotal > 0 && (
              <ReferenceLine
                y={amazonDayTotal}
                stroke="#fbbf24" strokeDasharray="5 3" strokeOpacity={0.5}
                label={{
                  value: `Amazon ${formatCompact(amazonDayTotal)}`,
                  fill: "#fbbf24", fontSize: 9, opacity: 0.7, position: "insideTopRight",
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  return inner;
}
