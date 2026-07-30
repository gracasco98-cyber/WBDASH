"use client";
import { fmtEur } from "@/lib/fmt";
import { getFlagSm, MP_LABEL } from "./FlagSvgs";

interface Props {
  marketplace: string;
  amount:      number;
  /** If provided, renders percentage label and progress bar */
  pct?:        number;
  /** Controls the accent color of the amount and progress bar */
  color?:      "emerald" | "blue" | "zinc";
}

export default function CountryBreakdownRow({ marketplace, amount, pct, color = "emerald" }: Props) {
  const textColor =
    color === "emerald" ? "text-emerald-600"
    : color === "blue"  ? "text-blue-600"
    :                     "text-gray-500";

  const barColor =
    color === "emerald" ? "bg-emerald-500/50"
    : color === "blue"  ? "bg-blue-500/50"
    :                     "bg-gray-400/50";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{getFlagSm(marketplace)}</span>
          <span className="text-xs text-gray-700 font-medium">
            {MP_LABEL[marketplace] ?? marketplace}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-bold ${textColor}`}>{fmtEur(amount)}</span>
          {pct !== undefined && (
            <span className="text-xs text-gray-400 w-7 text-right font-medium">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      </div>
      {pct !== undefined && (
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}
