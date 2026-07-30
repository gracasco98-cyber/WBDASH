"use client";
import { AmazonSummary } from "@/lib/api";
import { fmtEur } from "@/lib/fmt";

interface Props {
  summary: AmazonSummary | null;
  loading: boolean;
}

const MARKETPLACE_META: Record<string, { label: string; flag: string; color: string }> = {
  IT: { label: "Amazon.it", flag: "🇮🇹", color: "#22c55e" },
  DE: { label: "Amazon.de", flag: "🇩🇪", color: "#3b82f6" },
  FR: { label: "Amazon.fr", flag: "🇫🇷", color: "#6366f1" },
  ES: { label: "Amazon.es", flag: "🇪🇸", color: "#f59e0b" },
};

export default function AmazonMarketplaceTable({ summary, loading }: Props) {
  if (loading) {
    return <div className="h-64 bg-bg-card border border-bg-border rounded-xl animate-pulse" />;
  }

  const entries = Object.entries(summary?.byMarketplace ?? {})
    .map(([mp, d]) => ({ mp, ...d }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRev = entries.reduce((s, e) => s + e.revenue, 0);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Per Marketplace</h3>
      {entries.length === 0 ? (
        <div className="text-zinc-600 text-sm text-center py-8">Nessun dato</div>
      ) : (
        <div className="space-y-3">
          {entries.map((e, i) => {
            const meta = MARKETPLACE_META[e.mp] ?? { label: e.mp, flag: "🌐", color: "#6ee7b7" };
            const pct = totalRev > 0 ? (e.revenue / totalRev) * 100 : 0;
            return (
              <div key={e.mp}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{meta.flag}</span>
                    <span className="text-xs text-zinc-300 font-medium">{meta.label}</span>
                    <span className="text-xs text-zinc-600">#{i + 1}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-white tabular-nums">{fmtEur(e.revenue)}</span>
                    <span className="text-xs text-zinc-500 ml-2">{e.orders} ordini</span>
                  </div>
                </div>
                <div className="h-1 bg-bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: meta.color, opacity: 0.7 }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-xs text-zinc-600">{pct.toFixed(1)}%</span>
                  <span className="text-xs text-zinc-600">{e.units} unità</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
