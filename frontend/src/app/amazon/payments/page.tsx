"use client";
// Amazon Payments page — thin orchestrator.
// All state, data fetching, and derived logic live in usePaymentsData.
// All UI lives in sub-components under components/amazon/payments/.

import React from "react";
import { AlertCircle } from "lucide-react";
import { usePaymentsData } from "@/hooks/usePaymentsData";
import { PaymentHeader }         from "@/components/amazon/payments/PaymentHeader";
import { PaymentTimeline }       from "@/components/amazon/payments/PaymentTimeline";
import { CollectedPaymentsCard } from "@/components/amazon/payments/CollectedPaymentsCard";
import { NextPaymentCard }       from "@/components/amazon/payments/NextPaymentCard";
import { filterByPeriod, getPeriodLabel } from "@/components/amazon/payments/paymentUtils";

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

      </div>
    </div>
  );
}
