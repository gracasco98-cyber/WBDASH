"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { useAmazonAccount } from "@/hooks/useAmazonAccount";
import { usePpcBillingCycle } from "@/hooks/usePpcBillingCycle";

const REFRESH_MS = 10 * 60_000;

const fmtCents = (value: number) =>
  value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtShortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

/** Amazon overview card: Amazon.it ads spend since the last real invoice charge. */
export default function AdsThresholdCard() {
  const { selectedAccountId } = useAmazonAccount();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  const { primary: cycle, isLoading, hasError } = usePpcBillingCycle(selectedAccountId ?? "ALL", tick);

  const score = cycle?.progressPct ?? 0;
  const threshold = cycle?.threshold ?? 500;
  const reached = cycle?.status === "charge_expected";
  const lastCharge = cycle?.lastCharge ?? null;

  return (
    <section className="rounded-xl border border-bg-border bg-bg-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge size={16} className={reached ? "text-amber-400" : "text-purple-400"} />
          <div>
            <p className="text-xs font-semibold text-zinc-200">Soglia Ads Amazon</p>
            <p className="text-[10px] text-zinc-500">Spesa Ads Amazon.it dall’ultimo addebito reale della fattura</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-zinc-100">€ {fmtCents(cycle?.accumulatedSpend ?? 0)}</p>
          <p className="text-[10px] text-zinc-500">di € {threshold.toLocaleString("it-IT")} + IVA</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-base">
        <div className={`h-full rounded-full transition-all ${reached ? "bg-amber-400" : "bg-purple-500"}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-zinc-500">
        <span>Score {score.toFixed(1).replace(".", ",")}/100</span>
        <span>{reached ? "Soglia raggiunta · addebito in attesa" : `Mancano € ${fmtCents(cycle?.remaining ?? threshold)}`}</span>
      </div>
      {lastCharge && (
        <p className="mt-1 text-[10px] text-zinc-500">
          {`Ultimo addebito ${fmtShortDate(lastCharge.date)} · € ${fmtCents(lastCharge.amount)} + IVA`}
        </p>
      )}
      {isLoading && !cycle && <p className="mt-2 text-[10px] text-zinc-600">Caricamento spesa Ads…</p>}
      {!isLoading && hasError && <p className="mt-2 text-[10px] text-red-400">Dati soglia non disponibili</p>}
    </section>
  );
}
