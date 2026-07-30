"use client";
import { useMemo } from "react";
import { getMeta, formatEUR, formatCompact } from "@/lib/marketplaces";
import Link from "next/link";

// ─── Country flag helper
const FLAG_CODES: Record<string, string> = {
  IT: "it", DE: "de", FR: "fr", ES: "es",
  PL: "pl", UK: "gb", US: "us", CH: "ch",
};
function getFlag(key: string): string {
  const suffix = key.split("_").pop() ?? "";
  if (suffix in FLAG_CODES) return FLAG_CODES[suffix];
  if (key === "SHOPIFY_DIRECT") return "it";
  if (key === "BENU_FARMA")     return "ch";
  return "";
}

function FlagImg({ code, className = "" }: { code: string; className?: string }) {
  if (!code) return null;
  return (
    <img
      src={`/images/flags/${code}.png`}
      alt={code.toUpperCase()}
      className={`inline-block object-cover rounded-[2px] shrink-0 ${className}`}
      style={{ width: 16, height: 11 }}
    />
  );
}

// ─── Amazon country → accent colour
const AMAZON_COLORS: Record<string, string> = {
  IT: "#f59e0b",
  DE: "#3b82f6",
  FR: "#a78bfa",
  ES: "#ec4899",
  PL: "#06b6d4",
  UK: "#10b981",
  US: "#22c55e",
  CA: "#f97316",
};

// ─── Types
interface ShopifyRow { count: number; revenue: number; net: number }
interface AmazonRow  { revenue: number; orders: number; units?: number }

interface Segment {
  key: string;
  label: string;
  flag: string;
  color: string;
  revenue: number;
  orders: number;
  isAmazon: boolean;
  href: string;
}

interface Props {
  shopifyData: [string, ShopifyRow][];
  shopifyTotal: number;
  amazonByMarketplace?: Record<string, AmazonRow>;
  amazonTotalRevenue?: number;
  marketplace: string;
  onSelect: (mp: string) => void;
  loading?: boolean;
}

// ─── Skeleton
function Skeleton() {
  return (
    <div className="flex-1 flex flex-col gap-4 p-4">
      <div className="h-12 bg-zinc-800/40 rounded animate-pulse" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-10 bg-zinc-800/30 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ─── Main component — Modern stacked bar + segment grid
export default function MarketplaceDonutContent({
  shopifyData,
  shopifyTotal,
  amazonByMarketplace,
  amazonTotalRevenue = 0,
  marketplace,
  onSelect,
  loading = false,
}: Props) {
  if (loading) return <Skeleton />;

  // Build unified segment list
  const segments: Segment[] = useMemo(() => {
    const rows: Segment[] = [
      ...shopifyData.map(([mp, info]) => {
        const meta = getMeta(mp);
        return {
          key: mp, label: meta.label, flag: getFlag(mp), color: meta.color,
          revenue: info.revenue, orders: info.count,
          isAmazon: false, href: `/?marketplace=${mp}`,
        };
      }),
      ...Object.entries(amazonByMarketplace ?? {}).map(([code, info]) => ({
        key: `AMAZON_${code}`,
        label: `Amazon ${code}`,
        flag: getFlag(`AMAZON_${code}`),
        color: AMAZON_COLORS[code] ?? "#fbbf24",
        revenue: info.revenue,
        orders: info.orders,
        isAmazon: true,
        href: `/amazon?marketplace=${code}`,
      })),
    ]
      .filter(s => s.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopifyData, amazonByMarketplace]);

  const grandTotal = shopifyTotal + amazonTotalRevenue;

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 text-zinc-600 text-sm">
        Nessun dato
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-0 p-4">
      {/* ─── Overall Stacked Bar ─── */}
      <div className="mb-4 pb-4 border-b border-bg-border/50">
        <div className="flex items-end justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Distribuzione per canale
          </h3>
          <span className="text-xs font-semibold text-white tabular-nums">
            {formatCompact(grandTotal)}
          </span>
        </div>
        <div className="flex h-2 rounded-full bg-zinc-800/40 overflow-hidden gap-0.5">
          {segments.map((seg) => {
            const pct = grandTotal > 0 ? (seg.revenue / grandTotal) * 100 : 0;
            const isActive = marketplace === seg.key;
            return (
              <div
                key={seg.key}
                className="transition-all duration-300 cursor-pointer hover:brightness-125 relative group"
                style={{
                  flexBasis: `${pct}%`,
                  minWidth: pct > 2 ? "4px" : "2px",
                  background: seg.color,
                  opacity: marketplace === "all" ? 0.85 : isActive ? 1 : 0.25,
                }}
                onClick={() => onSelect(marketplace === seg.key ? "all" : seg.key)}
                title={`${seg.label}: ${formatCompact(seg.revenue)} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
      </div>

      {/* ─── Segment Cards Grid ─── */}
      <div className="space-y-2 min-h-0 overflow-y-auto">
        {segments.map((seg, idx) => {
          const pct = grandTotal > 0 ? (seg.revenue / grandTotal) * 100 : 0;
          const isActive = marketplace === seg.key;
          const dimmed = marketplace !== "all" && !isActive;

          return (
            <button
              key={seg.key}
              onClick={() => onSelect(marketplace === seg.key ? "all" : seg.key)}
              className={`w-full text-left transition-all rounded-lg border
                ${
                  isActive
                    ? "border-white/20 bg-white/[0.05]"
                    : "border-white/5 hover:border-white/10 hover:bg-white/[0.025]"
                }
              `}
            >
              <div className="px-3 py-2.5 space-y-1.5">
                {/* Row 1: Rank, Indicator, Name, Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-[10px] font-semibold text-zinc-600 w-5 text-center"
                      style={{ opacity: dimmed ? 0.4 : 1 }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                      style={{
                        background: seg.color,
                        opacity: dimmed ? 0.25 : 1,
                        boxShadow: isActive ? `0 0 6px ${seg.color}40` : "none",
                      }}
                    />
                    {seg.flag && (
                      <span style={{ opacity: dimmed ? 0.3 : 1 }} className="transition-opacity shrink-0">
                        <FlagImg code={seg.flag} />
                      </span>
                    )}
                    <span
                      className={`text-xs font-medium truncate transition-colors ${
                        isActive ? "text-white" : dimmed ? "text-zinc-600" : "text-zinc-300"
                      }`}
                    >
                      {seg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {seg.isAmazon && (
                      <span className="text-[8px] px-1.5 rounded-sm bg-amber-400/15 text-amber-400/70 font-medium">
                        Amazon
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 2: Revenue + Orders + Percentage */}
                <div className="flex items-center justify-between gap-3 pl-8">
                  <div className="flex items-baseline gap-4 text-[11px]">
                    <div>
                      <span
                        className="font-semibold transition-colors"
                        style={{
                          color: seg.color,
                          opacity: dimmed ? 0.35 : 1,
                        }}
                      >
                        {formatCompact(seg.revenue)}
                      </span>
                      <span className="text-zinc-600 ml-1">entrate</span>
                    </div>
                    <div className="text-zinc-500">
                      {seg.orders.toLocaleString("it-IT")}
                      <span className="text-zinc-700 ml-1">ordini</span>
                    </div>
                  </div>
                  <span
                    className="font-semibold text-xs tabular-nums transition-opacity"
                    style={{ opacity: dimmed ? 0.4 : 1 }}
                  >
                    {pct.toFixed(1)}%
                  </span>
                </div>

                {/* Row 3: Percentage bar */}
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: seg.color,
                      opacity: dimmed ? 0.2 : isActive ? 1 : 0.6,
                      boxShadow: isActive ? `0 0 8px ${seg.color}60` : "none",
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── Summary Footer ─── */}
      {amazonTotalRevenue > 0 && (
        <div className="mt-3 pt-3 border-t border-bg-border/50 flex flex-col gap-2 text-[10px]">
          <div className="flex justify-between items-center">
            <div className="space-x-4 text-zinc-500">
              <span>
                Shopify{" "}
                <span className="text-white font-semibold">
                  {grandTotal > 0 ? ((shopifyTotal / grandTotal) * 100).toFixed(0) : 0}%
                </span>
              </span>
              <span>
                Amazon{" "}
                <span className="text-white font-semibold">
                  {grandTotal > 0 ? ((amazonTotalRevenue / grandTotal) * 100).toFixed(0) : 0}%
                </span>
              </span>
            </div>
            <Link
              href="/amazon"
              className="px-2 py-1 rounded text-amber-400/50 hover:text-amber-400 hover:bg-amber-400/5 transition-all"
            >
              Dettagli Amazon →
            </Link>
          </div>
        </div>
      )}

      {/* Reset filter hint */}
      {marketplace !== "all" && (
        <button
          onClick={() => onSelect("all")}
          className="mt-2 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          Visualizza tutti i canali ×
        </button>
      )}
    </div>
  );
}
