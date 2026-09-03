"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { StatusBreakdownEntry } from "@/lib/api/acquisti-dashboard";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito", CANCELLED: "Annullato",
};

interface Props { data: StatusBreakdownEntry[] }

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="text-slate-500 mb-1">{label}</div>
      <div className="text-slate-900 font-medium">{payload[0].value} ordini</div>
    </div>
  );
};

export default function StatusBreakdownChart({ data }: Props) {
  const chartData = data.map(d => ({ status: STATUS_LABEL[d.status] ?? d.status, count: d.count }));
  const isEmpty = data.every(d => d.count === 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 mb-4">Ordini per stato</h2>
      {isEmpty ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Nessun ordine ancora</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="status" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(5,150,105,0.06)" }} />
            <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
