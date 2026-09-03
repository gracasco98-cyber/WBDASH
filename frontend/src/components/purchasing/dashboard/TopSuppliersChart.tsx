"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatEUR } from "@/lib/marketplaces";
import type { TopSupplierEntry } from "@/lib/api/acquisti-dashboard";

interface Props { data: TopSupplierEntry[] }

// This page's light theme is a deliberate, fixed choice (matching Prima
// Nota) independent of the app-wide dark/light toggle — not derived from
// useTheme(), unlike the rest of the dashboard.
const BLUE_HEX = "#2a78d6";

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="text-slate-500 mb-1">{label}</div>
      <div className="text-slate-900 font-medium">{formatEUR(payload[0].value)}</div>
    </div>
  );
};

export default function TopSuppliersChart({ data }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 mb-4">Top fornitori per valore ordini</h2>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Nessun ordine ancora</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`} />
            <YAxis type="category" dataKey="legalName" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: `${BLUE_HEX}0f` }} />
            <Bar dataKey="totalValue" fill={BLUE_HEX} radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
