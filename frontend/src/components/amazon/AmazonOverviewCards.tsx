"use client";
import { AmazonOverview, AmazonPeriodStats } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { fmtEur } from "@/lib/fmt";

interface Props {
  overview: AmazonOverview | null;
  loading: boolean;
  onPeriodSelect?: (period: string) => void;
  activePeriod?: string;
}

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-zinc-600 text-xs">â€”</span>;
  const isPos = pct > 0;
  const isNeg = pct < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
      isPos ? "text-emerald-400" : isNeg ? "text-red-400" : "text-zinc-500"
    }`}>
      <Icon size={11} />
      {isPos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function Skeleton() {
  return <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />;
}

function PeriodColumn({
  label,
  data,
  loading,
  isForecast,
  accent,
  onClick,
  isActive,
}: {
  label: string;
  data: AmazonPeriodStats | null;
  loading: boolean;
  isForecast?: boolean;
  accent?: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  const borderColor = isActive          ? "border-accent-primary/60"
                    : accent === "blue"   ? "border-blue-500/30"
                    : accent === "purple" ? "border-purple-500/30"
                    : accent === "amber"  ? "border-amber-500/30"
                    : "border-zinc-700/50";

  const headerBg = isActive          ? "bg-accent-primary/10"
                 : accent === "blue"   ? "bg-blue-500/10"
                 : accent === "purple" ? "bg-purple-500/10"
                 : accent === "amber"  ? "bg-amber-500/10"
                 : "bg-zinc-800/40";

  const rows = [
    {
      label: "Vendite",
      value: data ? fmtEur(data.grossRevenue) : null,
      color: "text-white",
      bold: true,
    },
    {
      label: "Ordini / UnitÃ ",
      value: data ? `${data.orderCount} / ${data.unitsSold}` : null,
      color: "text-zinc-300",
    },
    {
      label: "Resi/Annullati",
      value: data ? `âˆ’${data.cancelledCount}` : null,
      color: data && data.cancelledCount > 0 ? "text-orange-400" : "text-zinc-500",
    },
    {
      label: "Costo pubblicitÃ ",
      value: data ? (data.adSpend > 0 ? `âˆ’${fmtEur(data.adSpend)}` : "â€”") : null,
      color: data && data.adSpend > 0 ? "text-red-400" : "text-zinc-500",
    },
    {
      label: "Comm. stimate",
      value: data ? `âˆ’${fmtEur(data.estFees)}` : null,
      color: "text-orange-300/80",
      small: true,
    },
    {
      label: "Payout stimato",
      value: data ? fmtEur(data.estPayout) : null,
      color: "text-blue-400",
      bold: true,
    },
  ];

  return (
    <div
      className={`flex flex-col border ${borderColor} rounded-xl overflow-hidden bg-bg-card transition-all ${
        onClick ? "cursor-pointer hover:border-accent-primary/50 hover:shadow-[0_0_12px_rgba(99,102,241,0.08)]" : ""
      } ${isActive ? "shadow-[0_0_16px_rgba(99,102,241,0.12)]" : ""}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className={`${headerBg} px-4 py-3 border-b ${borderColor}`}>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{label}</div>
          {onClick && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${
              isActive
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-zinc-800 text-zinc-600 group-hover:text-zinc-400"
            }`}>
              {isActive ? "Attivo" : "Seleziona"}
            </span>
          )}
        </div>
        {isForecast && (
          <div className="text-[10px] text-zinc-600 mt-0.5">proiezione mese</div>
        )}
        {data && (
          <div className="mt-1">
            <PctBadge pct={data.pctChange} />
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="flex flex-col divide-y divide-zinc-800/60">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2.5 gap-2">
            <span className={`text-xs ${row.small ? "text-zinc-600" : "text-zinc-500"} shrink-0`}>{row.label}</span>
            {loading ? (
              <Skeleton />
            ) : (
              <span className={`text-sm font-medium tabular-nums ${row.color} ${row.bold ? "font-semibold" : ""} text-right`}>
                {row.value ?? "â€”"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Map card key â†’ period filter value (null = not clickable)
const CARD_PERIOD_MAP: Partial<Record<string, string>> = {
  today:     "today",
  yesterday: "yesterday",
  mtd:       "month",
};

export default function AmazonOverviewCards({ overview, loading, onPeriodSelect, activePeriod }: Props) {
  const columns: Array<{
    key: keyof Omit<AmazonOverview, "meta">;
    label: string;
    accent?: string;
    isForecast?: boolean;
  }> = [
    { key: "today",     label: "Oggi",               accent: "blue"   },
    { key: "yesterday", label: "Ieri",                accent: "purple" },
    { key: "mtd",       label: "Mese in corso",       accent: "amber"  },
    { key: "forecast",  label: "Previsione mese",     isForecast: true },
    { key: "lastMonth", label: "Mese scorso"                           },
  ];

  return (
    /* Mobile: horizontal scroll strip â€” Desktop: 5-column grid */
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-3 pb-1 w-max sm:w-auto sm:grid sm:grid-cols-2 xl:grid-cols-5 sm:gap-4">
        {columns.map(({ key, label, accent, isForecast }) => {
          const targetPeriod = CARD_PERIOD_MAP[key];
          return (
            /* min-w on mobile so cards don't collapse; sm:min-w-0 restores grid behaviour */
            <div key={key} className="min-w-[230px] shrink-0 sm:min-w-0">
              <PeriodColumn
                label={label}
                data={overview ? (overview[key] as AmazonPeriodStats) : null}
                loading={loading}
                isForecast={isForecast}
                accent={accent}
                onClick={targetPeriod && onPeriodSelect ? () => onPeriodSelect(targetPeriod) : undefined}
                isActive={!!targetPeriod && activePeriod === targetPeriod}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
