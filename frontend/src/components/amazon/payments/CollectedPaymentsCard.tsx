"use client";
// "Incassato" card: period selector, comparison pills, hero amount, analysis,
// bar chart, and country breakdown. Pure presentational — all data via props.

import React, { useState, useEffect } from "react";
import { ChevronDown, TrendingUp, TrendingDown } from "lucide-react";
import type { AnalyticsResult, IntelligenceResult, CountryData } from "./paymentTypes";
import { PERIOD_OPTIONS, COMPARE_OPTIONS } from "./paymentTypes";
import { fmtEur, isComparisonSignificant, formatCountryCode } from "./paymentUtils";
import { WhatHappeningCard, WhyChangedCard } from "./AnalysisCards";
import { PaymentBarChart } from "./PaymentBarChart";

// ── VariationBadge ─────────────────────────────────────────────────────────────

function VariationBadge({ variation }: { variation: number }) {
  const positive = variation >= 0;
  return (
    <span className={`mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold border ${
      positive ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-red-500/15 text-red-300 border-red-500/25"
    }`}>
      {positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
      {positive ? "+" : ""}{variation.toFixed(1).replace(".", ",")}%
    </span>
  );
}

// ── CountryRow ─────────────────────────────────────────────────────────────────

function CountryRow({ country, showComparison = false }: {
  country: CountryData; showComparison?: boolean;
}) {
  const hasComp = showComparison && country.comparisonAmount > 0;
  const varPct  = hasComp ? ((country.amount - country.comparisonAmount) / country.comparisonAmount) * 100 : null;

  return (
    <div className="rounded-lg px-1 py-0.5 transition hover:bg-white/[0.03]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>{country.flag}</span>
          <span className="text-sm font-medium text-zinc-300 truncate">{country.country}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasComp && varPct !== null && (
            <span className={`flex items-center gap-0.5 text-[10px] font-bold tabular-nums ${varPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {varPct >= 0 ? "▲" : "▼"}
              {varPct >= 0 ? "+" : ""}{varPct.toFixed(1).replace(".", ",")}%
            </span>
          )}
          <span className="font-bold tabular-nums text-sm text-emerald-400">{fmtEur(country.amount)}</span>
          <span className="w-8 text-right text-zinc-600 text-xs">{country.percentage}%</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06]">
        <div className="h-1.5 rounded-full bg-emerald-500/60 transition-all" style={{ width: `${Math.min(country.percentage, 100)}%` }} />
      </div>
      {hasComp && (
        <p className="mt-0.5 text-right text-[10px] text-zinc-700">{fmtEur(country.comparisonAmount)} nel confronto</p>
      )}
    </div>
  );
}

// ── CountryDropdown ────────────────────────────────────────────────────────────

function CountryDropdown({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="inline-flex min-w-[150px] items-center justify-between gap-2 rounded-xl border border-bg-border bg-bg-base px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200">
        <span className="uppercase tracking-wide text-zinc-600 text-[10px]">Paese</span>
        <span className="text-zinc-200 font-semibold">{formatCountryCode(value)}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-bg-border bg-bg-card p-2 shadow-2xl max-h-64 overflow-y-auto">
          {options.map(opt => (
            <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${opt === value ? "bg-emerald-500/15 font-semibold text-emerald-300" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"}`}>
              {formatCountryCode(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DropdownSelect ─────────────────────────────────────────────────────────────

function DropdownSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="inline-flex min-w-[130px] items-center justify-between gap-2 rounded-xl border border-bg-border bg-bg-base px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200">
        <span className="uppercase tracking-wide text-zinc-600 text-[10px]">{label}</span>
        <span className="text-zinc-200 font-semibold">{value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-bg-border bg-bg-card p-2 shadow-2xl">
          {options.map(opt => (
            <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${opt === value ? "bg-emerald-500/15 font-semibold text-emerald-300" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"}`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CollectedPaymentsCard ──────────────────────────────────────────────────────

export interface CollectedPaymentsCardProps {
  period:             string;
  setPeriod:          (v: string) => void;
  compareMode:        string;
  setCompareMode:     (v: string) => void;
  selectedCountry:    string;
  setSelectedCountry: (v: string) => void;
  availableCountries: string[];
  analytics:          AnalyticsResult;
  intelligence:       IntelligenceResult;
  showComparison:     boolean;
  loading:            boolean;
  periodLabel:        string;
  customFrom:         string;
  customTo:           string;
  onCustomFrom:       (v: string) => void;
  onCustomTo:         (v: string) => void;
  compRange:          { from: Date; to: Date; label: string } | null;
  cycle:              any;
  daysUntilNext:      number | null;
}

export function CollectedPaymentsCard({
  period, setPeriod, compareMode, setCompareMode,
  selectedCountry, setSelectedCountry, availableCountries,
  analytics, intelligence, showComparison, loading,
  periodLabel, customFrom, customTo, onCustomFrom, onCustomTo,
  compRange, cycle, daysUntilNext,
}: CollectedPaymentsCardProps) {
  const nextPeriodEnd = cycle?.nextPeriodEnd ?? null;
  const { current, comparison, variationPct, hasComparisonData } = analytics;
  const avgPerCycle = current.bars.length > 0 ? current.total / current.bars.length : 0;

  return (
    <section className="rounded-2xl border border-bg-border bg-bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bg-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          <h2 className="font-semibold text-zinc-100">Incassato</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CountryDropdown value={selectedCountry} onChange={setSelectedCountry} options={availableCountries} />
          <DropdownSelect label="Periodo" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Compare pills */}
        <div className="flex flex-wrap gap-2 text-xs">
          {COMPARE_OPTIONS.map(opt => {
            const active = opt === compareMode;
            return (
              <button key={opt} type="button" onClick={() => setCompareMode(opt)}
                className={`rounded-full px-3 py-1.5 transition border ${
                  active
                    ? opt === "Non confrontare"
                      ? "border-bg-border bg-white/[0.08] font-medium text-zinc-300"
                      : "border-blue-500/40 bg-blue-500/15 font-semibold text-blue-300"
                    : "border-transparent text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
                }`}>
                {active && opt !== "Non confrontare" && <span className="mr-1 text-blue-400">&bull;</span>}
                {opt}
              </button>
            );
          })}
        </div>

        {/* Custom date inputs */}
        {period === "Periodo personalizzato" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Da</span>
            <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)}
              className="text-xs border border-bg-border rounded-lg px-2.5 py-1 text-zinc-300 bg-bg-base focus:outline-none focus:border-emerald-500/50" />
            <span className="text-xs text-zinc-500">a</span>
            <input type="date" value={customTo} min={customFrom || undefined} onChange={e => onCustomTo(e.target.value)}
              className="text-xs border border-bg-border rounded-lg px-2.5 py-1 text-zinc-300 bg-bg-base focus:outline-none focus:border-emerald-500/50" />
          </div>
        )}

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-bg-border border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Next payment hint */}
            {nextPeriodEnd && (
              <p className="text-sm text-zinc-500">
                Prossimo pagamento:{" "}
                <span className="font-semibold text-zinc-300">
                  {new Date(nextPeriodEnd + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                </span>
                {daysUntilNext != null && daysUntilNext > 0 && <span className="ml-1 text-zinc-600">&middot; tra {daysUntilNext} gg</span>}
                {daysUntilNext != null && daysUntilNext <= 0 && <span className="ml-1 font-semibold text-emerald-400">&middot; oggi</span>}
              </p>
            )}

            {/* Hero amount */}
            <div>
              <p className="text-sm text-zinc-500">{periodLabel}</p>
              <div className="mt-1 flex flex-wrap items-end gap-3">
                <h3 className="text-4xl font-bold tracking-tight text-zinc-100 tabular-nums">{fmtEur(current.total)}</h3>
                {showComparison && variationPct !== null && <VariationBadge variation={variationPct} />}
              </div>
              <p className="mt-1.5 text-sm text-zinc-500">
                <span className="font-semibold text-zinc-300">{current.bars.length}</span>
                {" "}{current.bars.length === 1 ? "pagamento ricevuto" : "pagamenti ricevuti"}
                {showComparison && hasComparisonData && comparison && (
                  <span className="text-zinc-600"> vs {comparison.bars.length} nel confronto</span>
                )}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                <span>netto liquidato (data pagamento Amazon)</span>
                {current.bars.length > 0 && (
                  <span className="text-zinc-600">&middot; media {fmtEur(avgPerCycle)} / ciclo</span>
                )}
              </div>
              {showComparison && compRange && (
                <p className="mt-1 text-xs text-zinc-500 italic">
                  Periodo di confronto: {compRange.label}
                  {!hasComparisonData && <span className="ml-1 text-amber-400">(nessun dato disponibile)</span>}
                  {hasComparisonData && comparison && (
                    <span className="ml-1 text-zinc-400 font-medium">{fmtEur(comparison.total)}</span>
                  )}
                </p>
              )}
            </div>

            <WhatHappeningCard intelligence={intelligence} />

            {showComparison && hasComparisonData && variationPct !== null && (
              <WhyChangedCard
                intelligence={intelligence}
                positive={variationPct >= 0}
                showGuard={!isComparisonSignificant(analytics.comparison?.total ?? 0)}
              />
            )}

            <PaymentBarChart
              curBars={current.bars}
              cmpBars={comparison?.bars ?? []}
              showComparison={showComparison && hasComparisonData}
              compLabel={compRange?.label ?? "Confronto"}
            />

            {current.breakdown.length > 0 ? (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Per paese</h3>
                <div className="space-y-2.5">
                  {current.breakdown.map(c => (
                    <CountryRow key={c.code} country={c} showComparison={showComparison && hasComparisonData} />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-6">Nessun pagamento nel periodo selezionato</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
