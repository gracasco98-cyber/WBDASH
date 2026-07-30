"use client";
import { useEffect, useState, useCallback } from "react";
import { X, BarChart2, ShoppingBag } from "lucide-react";
import { api, HourChannelRow } from "@/lib/api";
import { getMeta, formatEUR } from "@/lib/marketplaces";

interface Props {
  hour:        string | null;    // "09:00" Italy local — null = closed
  filter:      string;
  from?:       string;
  to?:         string;
  marketplace?: string;
  onClose:     () => void;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function HourChannelModal({ hour, filter, from, to, marketplace, onClose }: Props) {
  const [rows, setRows]       = useState<HourChannelRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (h: string) => {
    setLoading(true);
    setRows([]);
    try {
      const params: Record<string, string> = { hour: h, filter };
      if (filter === "custom") { if (from) params.from = from; if (to) params.to = to; }
      if (marketplace && marketplace !== "all") params.marketplace = marketplace;
      const data = await api.hourChannels(params);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter, from, to, marketplace]);

  useEffect(() => {
    if (hour) load(hour);
  }, [hour, load]);

  if (!hour) return null;

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalOrders  = rows.reduce((s, r) => s + r.orders, 0);
  const totalNet     = rows.reduce((s, r) => s + r.net, 0);
  const maxRevenue   = rows.length ? Math.max(...rows.map(r => r.revenue)) : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-bg-card border border-bg-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-bg-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
              <BarChart2 size={16} className="text-accent-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Fascia oraria {hour}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">Sito — vendite per canale</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 divide-x divide-bg-border px-0 border-b border-bg-border">
          {[
            { label: "Fatturato", value: formatEUR(totalRevenue) },
            { label: "Netto",     value: formatEUR(totalNet) },
            { label: "Ordini",    value: String(totalOrders) },
          ].map(({ label, value }) => (
            <div key={label} className="px-5 py-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Channel breakdown */}
        <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">
              Caricamento…
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-zinc-600">
              <ShoppingBag size={28} className="opacity-30" />
              <span className="text-sm">Nessun ordine in questa fascia</span>
            </div>
          )}

          {!loading && rows.map((row) => {
            const meta   = getMeta(row.marketplace);
            const pct    = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
            const barPct = maxRevenue > 0   ? (row.revenue / maxRevenue)   * 100 : 0;

            return (
              <div key={row.marketplace} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="shrink-0 w-2 h-2 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="text-zinc-300 truncate">{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className="text-zinc-500 w-6 text-right">{row.orders}</span>
                    <span className="text-zinc-400 w-12 text-right">{pct.toFixed(0)}%</span>
                    <span className="text-white font-semibold w-20 text-right">
                      {formatEUR(row.revenue)}
                    </span>
                  </div>
                </div>
                <Bar pct={barPct} color={meta.color} />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bg-border bg-bg-base/30">
          <p className="text-[10px] text-zinc-600">
            Solo ordini Sito · canale basato su marketplaceDetected
          </p>
        </div>
      </div>
    </div>
  );
}
