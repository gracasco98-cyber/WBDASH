"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatEUR } from "@/lib/marketplaces";
import type { TopSupplierEntry } from "@/lib/api/acquisti-dashboard";

interface Props { data: TopSupplierEntry[] }

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      <div className="text-white font-medium">{formatEUR(payload[0].value)}</div>
    </div>
  );
};

export default function TopSuppliersChart({ data }: Props) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3 sm:p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Top fornitori per valore ordini</h2>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">Nessun ordine ancora</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`} />
            <YAxis type="category" dataKey="legalName" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(96,165,250,0.06)" }} />
            <Bar dataKey="totalValue" fill="#60a5fa" radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
