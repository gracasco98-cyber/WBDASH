"use client";
import React, { useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import type { AmazonPaymentForecast } from "@/lib/api";
import type { CountryData } from "./paymentTypes";
import { fmtEur, fmtDay, fmtShort } from "./paymentUtils";

// ── ScenarioRow ────────────────────────────────────────────────────────────────

function ScenarioRow({ label, amount, color, isCurrent }: {
  label: string; amount: number; color: string; isCurrent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isCurrent ? "bg-blue-500/10 border border-blue-500/20" : "hover:bg-white/[0.03]"}`}>
      <span className={`text-zinc-400 ${isCurrent ? "font-semibold text-zinc-200" : ""}`}>{label}</span>
      <span className={`font-bold tabular-nums ${color}`}>{fmtEur(amount)}</span>
    </div>
  );
}

// ── CountryRow ─────────────────────────────────────────────────────────────────

function CountryRow({ country }: { country: CountryData }) {
  return (
    <div className="rounded-lg px-1 py-0.5 transition hover:bg-white/[0.03]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>{country.flag}</span>
          <span className="text-sm font-medium text-zinc-300 truncate">{country.country}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold tabular-nums text-sm text-blue-400">{fmtEur(country.amount)}</span>
          <span className="w-8 text-right text-zinc-600 text-xs">{country.percentage}%</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06]">
        <div className="h-1.5 rounded-full bg-blue-500/60 transition-all" style={{ width: `${Math.min(country.percentage, 100)}%` }} />
      </div>
    </div>
  );
}

// ── NextPaymentCard ────────────────────────────────────────────────────────────

export interface NextPaymentCardProps {
  forecast:   AmazonPaymentForecast | null;
  countries:  CountryData[];
  loading:    boolean;
  daysUntil:  number | null;
}

export function NextPaymentCard({ forecast, countries, loading, daysUntil }: NextPaymentCardProps) {
  const [showScenarios, setShowScenarios] = useState(false);
  const total             = forecast?.totals?.totalProjectedNet       ?? 0;
  const totalPessimistic  = forecast?.totals?.totalScenarioPessimistic ?? 0;
  const totalOptimistic   = forecast?.totals?.totalScenarioOptimistic  ?? 0;
  const cycle             = forecast?.cycle ?? null;
  const settlementDate    = cycle?.nextPeriodEnd ?? null;
  const depositDate       = cycle?.nextDepositEst ?? null;
  const completionPct     = cycle?.captureCompletionPct ?? null;
  const daysRemaining     = cycle?.captureDaysRemaining ?? null;

  const daysLabel = daysUntil != null && daysUntil > 0 ? `tra ${daysUntil} gg`
    : daysUntil != null && daysUntil <= 0 ? "oggi" : null;

  return (
    <section className="rounded-2xl border border-bg-border bg-bg-card">
      <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-blue-500" />
          <h2 className="font-semibold text-zinc-100">Prossimo pagamento</h2>
        </div>
        {daysLabel && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${
            daysUntil != null && daysUntil <= 3
              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
              : "bg-blue-500/15 text-blue-300 border-blue-500/30"
          }`}>{daysLabel}</span>
        )}
      </div>

      <div className="space-y-5 p-5">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-bg-border border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : forecast ? (
          <>
            <div>
              <p className="text-sm text-zinc-500">
                Data pagamento Amazon{settlementDate ? ` · ${fmtDay(settlementDate)}` : ""}
              </p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-blue-400 tabular-nums">{fmtEur(total)}</p>
              <p className="text-sm text-zinc-500">previsione netto stimata &middot; scenario realistico</p>
              {depositDate && settlementDate && depositDate !== settlementDate && (
                <p className="mt-0.5 text-xs text-zinc-600">Bonifico atteso: {fmtDay(depositDate)}</p>
              )}
            </div>

            {completionPct !== null && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                  <span>Completamento ciclo</span>
                  <span className="font-semibold text-zinc-300">
                    {Math.round(completionPct)}%{daysRemaining != null ? ` · ${daysRemaining} gg rimasti` : ""}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.08]">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(completionPct, 100)}%` }} />
                </div>
              </div>
            )}

            <div>
              <button type="button" onClick={() => setShowScenarios(v => !v)}
                className="flex w-full items-center justify-between rounded-xl bg-bg-base px-3 py-2.5 text-sm text-zinc-500 transition hover:bg-white/[0.05]">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-400">Scenari</span>
                  <span className="text-xs text-zinc-600">{fmtEur(totalPessimistic)} &mdash; {fmtEur(totalOptimistic)}</span>
                </span>
                <ChevronRight className={`h-4 w-4 transition-transform ${showScenarios ? "rotate-90" : ""}`} />
              </button>
              {showScenarios && (
                <div className="mt-2 space-y-1.5 px-1">
                  <ScenarioRow label="Pessimistico" amount={totalPessimistic} color="text-amber-400" />
                  <ScenarioRow label="Realistico"   amount={total}           color="text-blue-400"   isCurrent />
                  <ScenarioRow label="Ottimistico"  amount={totalOptimistic} color="text-emerald-400" />
                </div>
              )}
            </div>

            {cycle?.captureStart && cycle?.captureEnd && (
              <div className="flex items-center gap-2 rounded-xl bg-bg-base px-3 py-2.5 text-sm text-zinc-500">
                <CalendarDays className="h-4 w-4 text-zinc-600 shrink-0" />
                <span>
                  Ordini: <strong className="text-zinc-300">{fmtShort(cycle.captureStart)} &rarr; {fmtShort(cycle.captureEnd)}</strong>
                  <span className="text-zinc-600 ml-1">&middot; Criterio: DD+9</span>
                </span>
              </div>
            )}

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Per paese</h3>
              {countries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-bg-border p-4 text-sm text-zinc-500 text-center">
                  Nessun importo disponibile per il prossimo pagamento.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {countries.map(c => <CountryRow key={c.code} country={c} />)}
                </div>
              )}
              {countries.length > 0 && (
                <div className="mt-4 flex justify-between border-t border-bg-border pt-3 text-sm">
                  <span className="text-zinc-500">Totale</span>
                  <span className="font-bold text-zinc-200">{fmtEur(total)} &middot; 100%</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500 text-center py-10">Dati forecast non disponibili</p>
        )}
      </div>
    </section>
  );
}
