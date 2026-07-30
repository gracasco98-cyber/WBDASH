"use client";
// WhatHappeningCard and WhyChangedCard — intelligence analysis panels
// used inside CollectedPaymentsCard.

import React, { useState } from "react";
import { ChevronRight, AlertTriangle } from "lucide-react";
import type { IntelligenceResult } from "./paymentTypes";
import { formatCurrencyIT, formatPercentageIT, formatDeltaIT, isComparisonSignificant } from "./paymentUtils";

// ── WhySection ─────────────────────────────────────────────────────────────────

function WhySection({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border-t border-bg-border/50 pt-2 mt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition mb-1.5"
      >
        <span>{title}</span>
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── SalesRow ───────────────────────────────────────────────────────────────────

function SalesRow({ label, cur, cmp, showGuard, highlight = false }: {
  label: string; cur: number; cmp: number | null; showGuard: boolean; highlight?: boolean;
}) {
  const delta = cmp !== null ? cur - cmp : null;
  const deltaGood = delta !== null && delta >= 0;

  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 ${highlight ? "border-t border-bg-border/50 pt-1 mt-0.5" : ""}`}>
      <span className={highlight ? "text-zinc-300 font-semibold" : "text-zinc-500"}>{label}</span>
      <div className="flex items-center gap-2 shrink-0 tabular-nums">
        {cmp !== null && <span className="text-zinc-600">{formatCurrencyIT(cmp)}</span>}
        {cmp !== null && <span className="text-zinc-600 text-[10px]">vs</span>}
        <span className={highlight ? "text-zinc-200 font-bold" : "text-zinc-300"}>{formatCurrencyIT(cur)}</span>
        {delta !== null && (
          <span className={`text-[11px] font-bold ${deltaGood ? "text-emerald-400" : "text-red-400"}`}>
            {formatDeltaIT(delta)}
            {!showGuard && cmp !== null && cmp !== 0 && (
              <span className="font-normal text-zinc-600 ml-0.5">
                ({formatPercentageIT((delta / Math.abs(cmp)) * 100)})
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ── WhatHappeningCard ──────────────────────────────────────────────────────────

export function WhatHappeningCard({ intelligence }: { intelligence: IntelligenceResult }) {
  const { bullets, anomalyAlerts, dataQuality } = intelligence;
  const visibleAlerts = (anomalyAlerts ?? []).filter(a => !a.includes("settlement con dati")).slice(0, 2);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-base/60 px-4 py-3.5">
      <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Cosa sta succedendo
      </h3>
      {dataQuality.issues.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 text-[10px] text-amber-400/80">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {dataQuality.issues[0]}
        </div>
      )}
      <ul className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {visibleAlerts.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-bg-border pt-2.5">
          {visibleAlerts.map((a, i) => (
            <p key={i} className="flex items-start gap-2 text-[11px] text-amber-400/80">
              <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0 text-amber-500/70" />
              {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── WhyChangedCard ─────────────────────────────────────────────────────────────

export function WhyChangedCard({ intelligence, positive, showGuard }: {
  intelligence: IntelligenceResult;
  positive:     boolean;
  showGuard:    boolean;
}) {
  const [openProducts, setOpenProducts] = useState(true);
  const [openOrders,   setOpenOrders]   = useState(true);
  const [openSales,    setOpenSales]    = useState(true);
  const [openCosts,    setOpenCosts]    = useState(true);
  const { summaryLine, products, orders, sales, costs } = intelligence;
  if (!summaryLine) return null;

  const hasComp = orders.cmp > 0 || Math.abs(sales.cmpNet) > 0;

  return (
    <div className={`rounded-xl border px-4 py-3.5 ${positive ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-red-500/20 bg-red-500/[0.04]"}`}>
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {"Perché è cambiato"}
      </h3>
      <p className={`mb-3 text-sm font-semibold ${positive ? "text-emerald-300" : "text-red-300"}`}>{summaryLine}</p>

      <WhySection title="Prodotti" open={openProducts} onToggle={() => setOpenProducts(v => !v)}>
        {products.available && products.lines.length > 0 ? (
          <div className="space-y-1.5">
            {products.lines.map(line => (
              <div key={line.asin} className="flex items-center justify-between gap-2 py-0.5">
                <div className="min-w-0 flex-1">
                  <span className="text-xs text-zinc-300 truncate block">{line.title}</span>
                  <span className="text-[10px] text-zinc-600">{line.asin}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs tabular-nums">
                  <span className={line.deltaRevenue >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                    {formatDeltaIT(line.deltaRevenue)}
                  </span>
                  {hasComp && (
                    <span className="text-zinc-600">
                      {line.curUnits - line.cmpUnits >= 0 ? "+" : ""}{line.curUnits - line.cmpUnits} u
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-600 italic">{products.message ?? "Nessun prodotto disponibile."}</p>
        )}
      </WhySection>

      <WhySection title="Ordini" open={openOrders} onToggle={() => setOpenOrders(v => !v)}>
        <div className="text-sm text-zinc-400">
          {hasComp ? (
            <span>
              <span className="font-semibold text-zinc-200">{orders.cur}</span>
              <span className="text-zinc-600"> ordini vs </span>
              <span className="font-semibold text-zinc-400">{orders.cmp}</span>
              <span className="text-zinc-600"> confronto </span>
              <span className={`font-bold ${orders.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {orders.delta >= 0 ? "+" : ""}{orders.delta}
                {!showGuard && orders.cmp > 0 && (
                  <span className="font-normal"> ({formatPercentageIT((orders.delta / orders.cmp) * 100)})</span>
                )}
              </span>
            </span>
          ) : (
            <span><span className="font-semibold text-zinc-200">{orders.cur}</span> ordini nel periodo</span>
          )}
        </div>
      </WhySection>

      <WhySection title="Vendite" open={openSales} onToggle={() => setOpenSales(v => !v)}>
        <div className="space-y-1 text-xs">
          <SalesRow label="Lordo"    cur={sales.curGross}   cmp={hasComp ? sales.cmpGross   : null} showGuard={showGuard} />
          <SalesRow label="Rimborsi" cur={sales.curRefunds} cmp={hasComp ? sales.cmpRefunds : null} showGuard={showGuard} />
          <SalesRow label="Netto"    cur={sales.curNet}     cmp={hasComp ? sales.cmpNet     : null} showGuard={showGuard} highlight />
        </div>
      </WhySection>

      <WhySection title="Costi (fee FBA + commissioni)" open={openCosts} onToggle={() => setOpenCosts(v => !v)}>
        <div className="text-xs text-zinc-400">
          {hasComp ? (
            <span>
              <span className="text-zinc-300 font-medium">{formatCurrencyIT(Math.abs(costs.curFees))}</span>
              <span className="text-zinc-600"> vs </span>
              <span>{formatCurrencyIT(Math.abs(costs.cmpFees))}</span>
              <span className={`ml-2 font-bold ${costs.delta >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                {formatDeltaIT(costs.delta)}
                {!showGuard && costs.cmpFees !== 0 && (
                  <span className="font-normal text-zinc-600 ml-1">
                    ({formatPercentageIT((costs.delta / Math.abs(costs.cmpFees)) * 100)})
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="text-zinc-300 font-medium">{formatCurrencyIT(Math.abs(costs.curFees))}</span>
          )}
        </div>
      </WhySection>
    </div>
  );
}
