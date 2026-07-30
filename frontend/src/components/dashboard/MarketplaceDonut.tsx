"use client";
import { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector,
} from "recharts";
import { getMeta, formatEUR, formatCompact } from "@/lib/marketplaces";
import Link from "next/link";

// ─── Country flag helper — returns lowercase ISO code for /images/flags/*.png ─
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

// ─── Flag image component ─────────────────────────────────────────────────────
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

// ─── Amazon country → accent colour ──────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface ShopifyRow { count: number; revenue: number; net: number }
interface AmazonRow  { revenue: number; orders: number; units?: number }

interface Segment {
  key: string;
  label: string;
  flag: string;   // lowercase ISO code e.g. "it", "de"
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

// ─── Active slice: pushed out + outer ring ────────────────────────────────────
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 9}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 13} outerRadius={outerRadius + 15}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.5} />
    </g>
  );
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const seg: Segment = payload[0].payload;
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs space-y-1 z-50">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: seg.color }} />
        <FlagImg code={seg.flag} />
        <span className="text-zinc-200 font-semibold">{seg.label}</span>
        {seg.isAmazon && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-400/10 text-amber-400/70 font-medium">Amzn</span>
        )}
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-zinc-500">Fatturato</span>
        <span className="text-white font-semibold tabular-nums">{formatEUR(seg.revenue)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-zinc-500">Ordini</span>
        <span className="text-zinc-300 tabular-nums">{seg.orders}</span>
      </div>
    </div>
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 h-full flex flex-col">
      <div className="h-4 w-40 bg-zinc-800 rounded animate-pulse mb-4" />
      <div className="flex items-center justify-center" style={{ height: 200 }}>
        <div className="w-44 h-44 rounded-full bg-zinc-800/60 animate-pulse" />
      </div>
      <div className="space-y-2 mt-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-7 bg-zinc-800/50 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MarketplaceDonut({
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
  const activeIdx  = marketplace === "all" ? -1 : segments.findIndex(s => s.key === marketplace);
  const activeSeg  = activeIdx >= 0 ? segments[activeIdx] : null;

  const handlePieClick = (_: any, index: number) => {
    const seg = segments[index];
    if (!seg) return;
    onSelect(marketplace === seg.key ? "all" : seg.key);
  };

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 h-full flex flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="text-sm font-semibold text-white">Canali di vendita</h2>
        {marketplace !== "all" ? (
          <button
            onClick={() => onSelect("all")}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Tutti ×
          </button>
        ) : (
          <span className="text-xs text-zinc-600">clicca per filtrare</span>
        )}
      </div>

      {segments.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-zinc-600 text-sm">
          Nessun dato
        </div>
      ) : (
        <>
          {/* ── Donut ── */}
          <div className="relative shrink-0" style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segments}
                  dataKey="revenue"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={88}
                  paddingAngle={2}
                  activeIndex={activeIdx >= 0 ? activeIdx : undefined}
                  activeShape={renderActiveShape}
                  onClick={handlePieClick}
                  style={{ cursor: "pointer", outline: "none" }}
                  strokeWidth={0}
                >
                  {segments.map((seg) => (
                    <Cell
                      key={seg.key}
                      fill={seg.color}
                      opacity={marketplace === "all" || marketplace === seg.key ? 1 : 0.22}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={false}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
              {activeSeg ? (
                <>
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider mb-0.5"
                    style={{ color: activeSeg.color, opacity: 0.8 }}
                  >
                    {activeSeg.label}
                  </span>
                  <span className="text-lg font-bold text-white tabular-nums leading-tight">
                    {formatCompact(activeSeg.revenue)}
                  </span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">
                    {activeSeg.orders} ordini
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">
                    Totale
                  </span>
                  <span className="text-lg font-bold text-white tabular-nums leading-tight">
                    {formatCompact(grandTotal)}
                  </span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">
                    {segments.length} canali
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ── Ranked list ── */}
          <div className="flex-1 overflow-y-auto space-y-0.5 mt-1 min-h-0">
            {segments.map((seg, idx) => {
              const pct      = grandTotal > 0 ? (seg.revenue / grandTotal) * 100 : 0;
              const isActive = marketplace === seg.key;
              const dimmed   = marketplace !== "all" && !isActive;

              return (
                <button
                  key={seg.key}
                  onClick={() => onSelect(marketplace === seg.key ? "all" : seg.key)}
                  className={`w-full text-left rounded-lg transition-all px-1 py-1 -mx-1
                    ${isActive ? "bg-white/[0.05] ring-1 ring-inset ring-white/10" : "hover:bg-white/[0.025]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-zinc-600 w-3 tabular-nums shrink-0">{idx + 1}</span>
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0 transition-opacity"
                        style={{ background: seg.color, opacity: dimmed ? 0.25 : 1 }}
                      />
                      {seg.flag && (
                        <span style={{ opacity: dimmed ? 0.3 : 1 }} className="transition-opacity shrink-0">
                          <FlagImg code={seg.flag} />
                        </span>
                      )}
                      <span
                        className={`text-xs truncate transition-colors ${
                          isActive ? "text-white font-medium" : dimmed ? "text-zinc-600" : "text-zinc-300"
                        }`}
                      >
                        {seg.label}
                      </span>
                      {seg.isAmazon && (
                        <span className="text-[8px] px-1 rounded bg-amber-400/10 text-amber-400/60 font-medium shrink-0">
                          A
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-zinc-600 tabular-nums">{pct.toFixed(0)}%</span>
                      <span
                        className="text-xs font-semibold tabular-nums transition-opacity"
                        style={{ color: seg.color, opacity: dimmed ? 0.35 : 1 }}
                      >
                        {formatCompact(seg.revenue)}
                      </span>
                    </div>
                  </div>
                  {/* micro-bar */}
                  <div className="h-[2px] rounded-full bg-white/5 ml-5 mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: seg.color,
                        opacity: dimmed ? 0.2 : isActive ? 0.9 : 0.55,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Footer ── */}
          {amazonTotalRevenue > 0 && (
            <div className="mt-3 pt-2.5 border-t border-bg-border flex items-center justify-between shrink-0">
              <span className="text-[10px] text-zinc-600">
                Shop {grandTotal > 0 ? ((shopifyTotal / grandTotal) * 100).toFixed(0) : 0}%
                {" · "}
                Amzn {grandTotal > 0 ? ((amazonTotalRevenue / grandTotal) * 100).toFixed(0) : 0}%
              </span>
              <Link
                href="/amazon"
                className="text-[10px] text-amber-400/50 hover:text-amber-400 transition-colors"
              >
                Dettaglio Amazon →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
