"use client";
// Grouped side-by-side bar chart for payment periods.

import React, { useState } from "react";
import { fmtDay, fmtShort, formatCurrencyIT, isComparisonSignificant } from "./paymentUtils";

interface GroupedBar {
  index:     number;
  curDate:   string | null;
  curAmount: number;
  cmpDate:   string | null;
  cmpAmount: number;
}

function buildGroupedBars(
  curBars: { date: string; amount: number }[],
  cmpBars: { date: string; amount: number }[],
): GroupedBar[] {
  const N = Math.max(curBars.length, cmpBars.length);
  return Array.from({ length: N }, (_, i) => ({
    index:     i,
    curDate:   curBars[i]?.date   ?? null,
    curAmount: curBars[i]?.amount ?? 0,
    cmpDate:   cmpBars[i]?.date   ?? null,
    cmpAmount: cmpBars[i]?.amount ?? 0,
  }));
}

export interface PaymentBarChartProps {
  curBars:        { date: string; amount: number }[];
  cmpBars:        { date: string; amount: number }[];
  showComparison: boolean;
  compLabel:      string;
}

export function PaymentBarChart({ curBars, cmpBars, showComparison, compLabel }: PaymentBarChartProps) {
  const [tooltip, setTooltip] = useState<(GroupedBar & { x: number }) | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  if (curBars.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl bg-white/[0.04] text-xs text-zinc-500">
        Nessun pagamento nel periodo
      </div>
    );
  }

  const groups    = buildGroupedBars(curBars, showComparison ? cmpBars : []);
  const maxVal    = Math.max(1, ...groups.map(g => Math.max(g.curAmount, g.cmpAmount)));
  const N         = groups.length;
  const labelStep = N <= 7 ? 1 : Math.ceil(N / 6);

  return (
    <div className="relative select-none rounded-xl bg-gradient-to-b from-emerald-500/[0.04] to-transparent px-2 pt-4 pb-8">
      <div ref={containerRef} className="flex items-end gap-1 h-28">
        {groups.map((g, i) => {
          const curH = (g.curAmount / maxVal) * 100;
          const cmpH = showComparison ? (g.cmpAmount / maxVal) * 100 : 0;
          const hovered = tooltip?.index === i;

          return (
            <div
              key={i}
              className="relative flex-1 flex items-end gap-px"
              style={{ height: "100%" }}
              onMouseEnter={e => {
                const rect = containerRef.current?.getBoundingClientRect();
                const el   = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const x    = rect ? ((el.left + el.width / 2 - rect.left) / rect.width) * 100 : 50;
                setTooltip({ ...g, x });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {showComparison && (
                <div
                  className={`flex-1 rounded-t-sm transition-all ${hovered ? "bg-amber-400/80" : "bg-amber-400/50"}`}
                  style={{ height: `${Math.max(cmpH, cmpH > 0 ? 2 : 0)}%`, minHeight: cmpH > 0 ? "2px" : "0" }}
                />
              )}
              <div
                className={`flex-1 rounded-t-sm transition-all ${hovered ? "bg-emerald-400" : "bg-emerald-500/75"}`}
                style={{ height: `${Math.max(curH, curH > 0 ? 2 : 0)}%`, minHeight: curH > 0 ? "2px" : "0" }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex mt-1.5">
        {groups.map((g, i) => (
          <div key={i} className="flex-1 overflow-hidden text-center">
            {(i % labelStep === 0 || i === N - 1) && g.curDate && (
              <span className="text-[9px] text-zinc-600 whitespace-nowrap">{fmtShort(g.curDate)}</span>
            )}
          </div>
        ))}
      </div>

      {showComparison && (
        <div className="flex items-center gap-4 mt-0.5 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-500/75" /> Periodo selezionato
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber-400/50" /> {compLabel}
          </span>
          {N !== curBars.length || N !== (cmpBars.length || curBars.length) && (
            <span className="text-zinc-700 ml-auto">
              {curBars.length} vs {cmpBars.length} pagamenti
            </span>
          )}
        </div>
      )}

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-xl border border-bg-border bg-bg-card px-3 py-2.5 shadow-xl text-xs min-w-[160px]"
          style={{
            bottom: "calc(100% - 20px)",
            left:   `${Math.min(Math.max(tooltip.x, 10), 80)}%`,
            transform: "translateX(-50%)",
          }}
        >
          {tooltip.curDate && (
            <>
              <p className="text-zinc-500 mb-0.5 text-[10px]">Periodo selezionato</p>
              <p className="text-[10px] text-zinc-600">{fmtDay(tooltip.curDate)}</p>
              <p className="font-bold text-emerald-400 text-sm">{formatCurrencyIT(tooltip.curAmount)}</p>
            </>
          )}
          {showComparison && tooltip.cmpDate && (
            <>
              <div className="my-1.5 border-t border-bg-border" />
              <p className="text-zinc-500 text-[10px]">{compLabel}</p>
              <p className="text-[10px] text-zinc-600">{fmtDay(tooltip.cmpDate)}</p>
              <p className="font-semibold text-amber-400">{formatCurrencyIT(tooltip.cmpAmount)}</p>
              {tooltip.curAmount > 0 && tooltip.cmpAmount > 0 && (
                <>
                  <div className="my-1 border-t border-bg-border" />
                  {(() => {
                    const diff  = tooltip.curAmount - tooltip.cmpAmount;
                    const pct   = (diff / tooltip.cmpAmount) * 100;
                    const sign  = diff >= 0 ? "+" : "";
                    const cls   = diff >= 0 ? "text-emerald-400" : "text-red-400";
                    return (
                      <p className={`font-semibold text-xs ${cls}`}>
                        {sign}{formatCurrencyIT(Math.abs(diff))}
                        {isComparisonSignificant(tooltip.cmpAmount) && (
                          <span className="ml-1">({sign}{pct.toFixed(1).replace(".", ",")}%)</span>
                        )}
                      </p>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
