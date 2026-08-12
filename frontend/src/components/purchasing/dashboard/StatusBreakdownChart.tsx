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
    <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      <div className="text-white font-medium">{payload[0].value} ordini</div>
    </div>
  );
};

export default function StatusBreakdownChart({ data }: Props) {
  const chartData = data.map(d => ({ status: STATUS_LABEL[d.status] ?? d.status, count: d.count }));
  const isEmpty = data.every(d => d.count === 0);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3 sm:p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Ordini per stato</h2>
      {isEmpty ? (
        <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">Nessun ordine ancora</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--bg-border)" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="status" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(5,150,105,0.06)" }} />
            <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
