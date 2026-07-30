"use client";
import Link from "next/link";
import { getMeta, formatEUR, formatCompact } from "@/lib/marketplaces";

interface ShopifyRow {
  count: number;
  revenue: number;
  net: number;
}

interface AmazonRow {
  revenue: number;
  orders: number;
}

interface Props {
  data: [string, ShopifyRow][];
  totalRevenue: number;
  /** Amazon byMarketplace breakdown from AmazonSummary */
  amazonByMarketplace?: Record<string, AmazonRow>;
  /** Total Amazon revenue to include in grand total */
  amazonTotalRevenue?: number;
}

// Unified row for display
interface UnifiedRow {
  key: string;
  label: string;
  color: string;
  revenue: number;
  orders: number;
  isAmazon: boolean;
  href: string;
}

export default function MarketplaceTable({
  data,
  totalRevenue,
  amazonByMarketplace,
  amazonTotalRevenue = 0,
}: Props) {
  const grandTotal = totalRevenue + amazonTotalRevenue;

  // Build unified rows: Shopify channels + Amazon sub-channels
  const rows: UnifiedRow[] = [
    // Shopify / external marketplace rows
    ...data.map(([mp, info]) => {
      const meta = getMeta(mp);
      return {
        key: mp,
        label: meta.label,
        color: meta.color,
        revenue: info.revenue,
        orders: info.count,
        isAmazon: false,
        href: `/?marketplace=${mp}`,
      };
    }),
    // Amazon per-marketplace rows
    ...Object.entries(amazonByMarketplace ?? {}).map(([mp, info]) => ({
      key: `amzn-${mp}`,
      label: `Amazon ${mp}`,
      color: "#fbbf24",
      revenue: info.revenue,
      orders: info.orders,
      isAmazon: true,
      href: `/amazon?marketplace=${mp}`,
    })),
  ].sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white">Canali di vendita</h2>
        <span className="text-xs text-zinc-500">per fatturato</span>
      </div>

      {/* Grand total */}
      {amazonTotalRevenue > 0 && (
        <div className="flex items-center justify-between py-2 mb-1 border-b border-bg-border">
          <span className="text-xs text-zinc-400 font-medium">Totale cross-channel</span>
          <span className="text-sm font-semibold text-white tabular-nums">{formatEUR(grandTotal)}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-zinc-600 text-sm">
          Nessun dato
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-1 pr-0.5 mt-1">
          {rows.map((row, idx) => {
            const pct = grandTotal > 0 ? (row.revenue / grandTotal) * 100 : 0;
            return (
              <Link
                key={row.key}
                href={row.href}
                className="group block hover:bg-white/[0.02] rounded-lg transition-colors -mx-1 px-1"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-zinc-600 w-4 tabular-nums shrink-0">{idx + 1}</span>
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: row.color, opacity: row.isAmazon ? 0.9 : 1 }}
                    />
                    <span className="text-sm text-zinc-200 truncate">{row.label}</span>
                    {row.isAmazon && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-400/10 text-amber-400/70 font-medium shrink-0">
                        Amzn
                      </span>
                    )}
                    <span className="text-xs text-zinc-600 shrink-0">×{row.orders}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-xs text-zinc-600 tabular-nums">{pct.toFixed(0)}%</span>
                    <span className="text-sm font-medium tabular-nums" style={{ color: row.color }}>
                      {formatCompact(row.revenue)}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1 rounded-full bg-bg-border ml-6 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: row.color,
                      opacity: row.isAmazon ? 0.6 : 0.7,
                    }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer: totals breakdown */}
      {amazonTotalRevenue > 0 && (
        <div className="mt-3 pt-3 border-t border-bg-border flex justify-between text-[10px] text-zinc-600">
          <span>Shopify {((totalRevenue / grandTotal) * 100).toFixed(0)}% · Amazon {((amazonTotalRevenue / grandTotal) * 100).toFixed(0)}%</span>
          <Link href="/amazon" className="text-amber-400/50 hover:text-amber-400 transition-colors">
            Dettaglio Amazon →
          </Link>
        </div>
      )}
    </div>
  );
}
