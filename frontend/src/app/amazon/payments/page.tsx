"use client";
// Amazon Payments page — thin orchestrator.
// All state, data fetching, and derived logic live in usePaymentsData.
// All UI lives in sub-components under components/amazon/payments/.

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CircleDollarSign, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { ChannelDailyRow } from "@/lib/api";
import { usePaymentsData } from "@/hooks/usePaymentsData";
import { PaymentHeader }         from "@/components/amazon/payments/PaymentHeader";
import { PaymentTimeline }       from "@/components/amazon/payments/PaymentTimeline";
import { CollectedPaymentsCard } from "@/components/amazon/payments/CollectedPaymentsCard";
import { NextPaymentCard }       from "@/components/amazon/payments/NextPaymentCard";
import { filterByPeriod, getPeriodLabel } from "@/components/amazon/payments/paymentUtils";

function RedcareForecastCard({ rows, loading }: { rows: ChannelDailyRow[]; loading: boolean }) {
  const redcareRows = rows.filter(r => /redcare/i.test(r.marketplace));
  const activeDays = new Set(redcareRows.filter(r => r.netRevenue > 0).map(r => r.date)).size;
  const total = redcareRows.reduce((sum, r) => sum + Math.max(0, r.netRevenue), 0);
  const dailyAverage = activeDays > 0 ? total / activeDays : 0;
  const forecast = [7, 14, 30].map(days => ({ days, amount: dailyAverage * days }));

  return (
    <section className="rounded-2xl border border-bg-border bg-bg-card">
      <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" /><h2 className="font-semibold text-zinc-100">Redcare · soldi in arrivo</h2></div>
        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-300">Stima provvisoria</span>
      </div>
      <div className="space-y-4 p-5">
        {loading ? <div className="h-28 animate-pulse rounded-xl bg-bg-base" /> : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-xs text-zinc-500">Media giornaliera ultimi 30 giorni</p><p className="mt-1 text-3xl font-bold tabular-nums text-emerald-400">€ {dailyAverage.toLocaleString("it-IT", { maximumFractionDigits: 0 })}</p></div>
              <CircleDollarSign className="mb-1 h-7 w-7 text-emerald-400/70" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {forecast.map(f => <div key={f.days} className="rounded-xl bg-bg-base px-3 py-2.5"><p className="text-[10px] text-zinc-600">Tra {f.days} giorni</p><p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">€ {f.amount.toLocaleString("it-IT", { maximumFractionDigits: 0 })}</p></div>)}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-600"><Sparkles className="h-3 w-3 text-amber-400" /> Calcolo iniziale sugli ordini Redcare; verrà corretto quando sarà disponibile il pagamento reale dal marketplace.</p>
          </>
        )}
      </div>
    </section>
  );
}

export default function PaymentsPage() {
  const {
    data, loading, error, refresh,
    period, setPeriod,
    compareMode, setCompareMode,
    selectedCountry, setSelectedCountry,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    selectedPayId, setSelectedPayId,
  } = usePaymentsData();
  const [redcareRows, setRedcareRows] = useState<ChannelDailyRow[]>([]);
  const [redcareLoading, setRedcareLoading] = useState(true);

  useEffect(() => {
    setRedcareLoading(true);
    api.channelDaily({ filter: "last30" })
      .then(data => setRedcareRows(data.rows))
      .catch(() => setRedcareRows([]))
      .finally(() => setRedcareLoading(false));
  }, []);

  const showComparison = compareMode !== "Non confrontare";
  const periodLabel    = getPeriodLabel(period, customFrom, customTo);

  return (
    <div className="min-h-screen bg-bg-base px-4 md:px-6 py-6 md:py-8">
      <div className="mx-auto max-w-[1400px] space-y-6">

        <PaymentHeader
          loading={loading}
          periodLabel={periodLabel}
          settlements={data?.settlements ?? []}
          currentRange={data?.currentRange ?? { from: new Date(), to: new Date() }}
          selectedCountry={selectedCountry}
          onRefresh={refresh}
          filterFn={filterByPeriod}
        />

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}

        <PaymentTimeline
          payments={data?.paymentItems ?? []}
          selectedPaymentId={selectedPayId ?? ""}
          onSelect={setSelectedPayId}
          loading={loading}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          {data && (
            <CollectedPaymentsCard
              period={period}
              setPeriod={v => { setPeriod(v); setCompareMode("Non confrontare"); }}
              compareMode={compareMode}
              setCompareMode={setCompareMode}
              selectedCountry={selectedCountry}
              setSelectedCountry={setSelectedCountry}
              availableCountries={data.availableCountryOptions}
              analytics={data.analytics}
              intelligence={data.intelligence}
              showComparison={showComparison}
              loading={loading}
              periodLabel={periodLabel}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFrom={setCustomFrom}
              onCustomTo={setCustomTo}
              compRange={data.compRange}
              cycle={data.forecastData?.cycle ?? null}
              daysUntilNext={data.daysUntilNext}
            />
          )}
          {!data && (
            <div className="rounded-2xl border border-bg-border bg-bg-card h-64 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-bg-border border-t-emerald-500 rounded-full animate-spin" />
            </div>
          )}

          <NextPaymentCard
            forecast={data?.forecastData ?? null}
            countries={data?.forecastCountries ?? []}
            loading={loading}
            daysUntil={data?.daysUntilNext ?? null}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <RedcareForecastCard rows={redcareRows} loading={redcareLoading} />
          <section className="rounded-2xl border border-dashed border-bg-border bg-bg-card/50 p-5">
            <div className="flex items-center gap-2 text-zinc-200"><CalendarClock className="h-4 w-4 text-zinc-500" /><h2 className="font-semibold">Riconciliazione forecast</h2></div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">Quando il marketplace comunicherà l’importo effettivo, lo confronteremo con la previsione e aggiorneremo automaticamente il coefficiente per i prossimi pagamenti.</p>
            <div className="mt-4 rounded-xl bg-bg-base px-3 py-2.5 text-xs text-zinc-600">Nessun collegamento bancario: la conferma arriverà dai dati del marketplace.</div>
          </section>
        </div>

      </div>
    </div>
  );
}
