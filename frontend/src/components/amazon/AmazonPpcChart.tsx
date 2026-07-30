"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { fmtEur, fmtEurCompact } from "@/lib/fmt";

interface DataPoint { date: string; spend: number; sales: number; }

interface Props {
  data: DataPoint[];
  loading: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl px-4 py-3 shadow-xl text-xs space-y-1">
      <p className="text-zinc-400 font-medium mb-2">{label}</p>
      {payload.map((e: any) => (
        <div key={e.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: e.fill }} />
          <span className="text-zinc-400">{e.name === "spend" ? "Ad Spend" : "Vendite attribuite"}:</span>
          <span className="text-white font-semibold">{fmtEur(Number(e.value))}</span>
        </div>
      ))}
      {payload.length === 2 && payload[1].value > 0 && (
        <div className="border-t border-bg-border pt-1 mt-1 text-zinc-500">
          ACOS: {((payload[0].value / payload[1].value) * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
};

export default function AmazonPpcChart({ data, loading }: Props) {
  if (loading) {
    return <div className="h-64 bg-bg-card border border-bg-border rounded-xl animate-pulse" />;
  }

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Ad Spend vs Vendite Attribuite</h3>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-accent-amber inline-block" /> Ad Spend</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-accent-primary inline-block" /> Vendite</span>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-zinc-600 text-sm">
          Nessun dato PPC — configura le credenziali Advertising API
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={50}
              tickFormatter={(v) => fmtEurCompact(v)} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="spend" fill="#fbbf24" opacity={0.85} radius={[2, 2, 0, 0]} />
            <Bar dataKey="sales" fill="#6ee7b7" opacity={0.85} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
