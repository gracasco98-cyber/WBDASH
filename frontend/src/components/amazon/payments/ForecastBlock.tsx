"use client";
import { useMemo } from "react";
import { Clock, BarChart2 } from "lucide-react";
import { fmtEur } from "@/lib/fmt";
import { AmazonPaymentForecast } from "@/lib/api";
import CountryBreakdownRow from "./CountryBreakdownRow";

interface Props {
  forecast:        AmazonPaymentForecast | null;
  loading:         boolean;
  isHighlighted?:  boolean;
}

function fmtLong(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });
}
function fmtShort(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("it-IT", {
    day: "numeric", month: "short",
  });
}

export default function ForecastBlock({ forecast, loading, isHighlighted }: Props) {
  const derived = useMemo(() => {
    if (!forecast) return null;

    // Use ALL marketplaces that have data — no hardcoded filter
    const mpRows = forecast.byMarketplace.filter((r) => (r.projectedNet ?? 0) > 0);
    const totalNet = mpRows.reduce((s, r) => s + (r.projectedNet ?? 0), 0);

    // Normalise percentages: last row gets remainder to ensure exactly 100%
    let remaining = 100;
    const breakdown = [...mpRows]
      .sort((a, b) => (b.projectedNet ?? 0) - (a.projectedNet ?? 0))
      .map((r, i, arr) => {
        const isLast = i === arr.length - 1;
        const pct = isLast
          ? remaining
          : Math.round(((r.projectedNet ?? 0) / Math.max(1, totalNet)) * 100);
        if (!isLast) remaining -= pct;
        return { marketplace: r.marketplace, amount: r.projectedNet ?? 0, pct };
      });

    // Deferred: all marketplaces with positive estDeferredNet
    const deferredTotal = forecast.byMarketplace.reduce((s, r) => s + (r.estDeferredNet ?? 0), 0);
    const deferredRows  = forecast.byMarketplace
      .filter((r) => (r.estDeferredNet ?? 0) > 0)
      .map((r) => ({ marketplace: r.marketplace, amount: r.estDeferredNet ?? 0 }))
      .sort((a, b) => b.amount - a.amount);

    const cycle = forecast.cycle;
    return {
      breakdown,
      totalNet,
      deferred:     { total: deferredTotal, rows: deferredRows },
      depositDate:  cycle?.nextDepositEst   ?? null,
      daysUntil:    cycle?.daysUntilDeposit ?? null,
      captureStart: cycle?.captureStart     ?? null,
      captureEnd:   cycle?.captureEnd       ?? null,
    };
  }, [forecast]);

  const highlightClass = isHighlighted ? "ring-2 ring-blue-300" : "";

  return (
    <div className="space-y-4">
      {/* Forecast card */}
      <section className={`bg-bg-card border border-bg-border rounded-2xl overflow-hidden transition-shadow ${highlightClass}`}>
        {/* Header */}
        <div className="border-b border-bg-border px-5 py-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-auto">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="font-semibold text-gray-800 text-sm">Prossimo Pagamento</span>
          </div>
          {derived?.depositDate && derived.daysUntil != null && (
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                derived.daysUntil <= 3
                  ? "bg-amber-50 text-amber-600 border border-amber-200"
                  : "bg-blue-50 text-blue-600 border border-blue-200"
              }`}
            >
              tra {derived.daysUntil} gg
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : derived ? (
            <>
              {/* Date + projected amount */}
              <div>
                <p className="text-xs text-gray-400 mb-1">
                  {derived.depositDate ? fmtLong(derived.depositDate) : "Data non disponibile"}
                </p>
                <p className="text-4xl font-bold text-blue-600 tracking-tight tabular-nums">
                  {fmtEur(derived.totalNet)}
                </p>
                {derived.totalNet === 0 ? (
                  <div className="mt-2 space-y-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                      In elaborazione
                    </span>
                    <p className="text-xs text-gray-400">
                      Il forecast per questo ciclo non è ancora disponibile. Riprova tra qualche ora.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">previsione netto stimato</p>
                )}
              </div>

              {/* Capture window (DD+7 order range) */}
              {derived.captureStart && derived.captureEnd && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-gray-500">
                  <Clock size={13} className="text-gray-400 shrink-0" />
                  <div>
                    <span className="text-gray-700 font-medium">
                      Ordini: {fmtShort(derived.captureStart)} {"→"} {fmtShort(derived.captureEnd)}
                    </span>
                    <span className="text-gray-400 ml-2">· Criterio: DD+7</span>
                  </div>
                </div>
              )}

              {/* Per-country breakdown */}
              {derived.breakdown.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Per Paese</p>
                  {derived.breakdown.map((r) => (
                    <CountryBreakdownRow
                      key={r.marketplace}
                      marketplace={r.marketplace}
                      amount={r.amount}
                      pct={r.pct}
                      color="blue"
                    />
                  ))}
                  {/* Total row */}
                  <div className="flex items-center justify-between pt-2 border-t border-bg-border">
                    <span className="text-xs text-gray-500 font-semibold">Totale</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900 tabular-nums">
                        {fmtEur(derived.totalNet)}
                      </span>
                      <span className="text-xs text-gray-400 w-8 text-right">100%</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-10 text-center space-y-3">
              <BarChart2 size={32} className="mx-auto text-gray-200" />
              <p className="text-sm text-gray-400">Dati forecast non disponibili</p>
            </div>
          )}
        </div>
      </section>

      {/* Deferred card — only shown when estDeferredNet > 0 */}
      {!loading && derived && derived.deferred.total > 0 && (
        <section className="bg-bg-card border border-bg-border rounded-2xl overflow-hidden">
          <div className="border-b border-bg-border px-5 py-3.5 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
            <span className="font-semibold text-gray-600 text-sm">Transazioni Posticipate</span>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-400">
              {derived.captureStart && derived.captureEnd
                ? `Periodo: ${fmtShort(derived.captureStart)} → ${fmtShort(derived.captureEnd)}`
                : "Periodo non disponibile"}
              <span className="ml-2">· pagamento: ciclo successivo (+14 gg)</span>
            </p>
            <p className="text-2xl font-bold text-gray-500 tabular-nums">
              {fmtEur(derived.deferred.total)}
            </p>
            <div className="space-y-2.5">
              {derived.deferred.rows.map((r) => (
                <CountryBreakdownRow
                  key={r.marketplace}
                  marketplace={r.marketplace}
                  amount={r.amount}
                  color="zinc"
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
