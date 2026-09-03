"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { OrdersOverTimePoint } from "@/lib/api/acquisti-dashboard";

interface Props { data: OrdersOverTimePoint[] }

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="text-slate-500 mb-1">{formatDay(label)}</div>
      <div className="text-slate-900 font-medium">{payload[0].value} ordini</div>
    </div>
  );
};

export default function OrdersOverTimeChart({ data }: Props) {
  const isEmpty = data.every(d => d.count === 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 mb-4">Ordini creati — ultimi 30 giorni</h2>
      {isEmpty ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Nessun ordine negli ultimi 30 giorni</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradOrdersOverTime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              interval="preserveStartEnd" tickFormatter={formatDay} />
            <YAxis tick={{ fill: "#64748b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="count" stroke="#059669" strokeWidth={2} fill="url(#gradOrdersOverTime)"
              dot={false} activeDot={{ r: 4, fill: "#059669", stroke: "#ffffff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
