"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, ReceiptText } from "lucide-react";
import type { AmazonPpcBillingCycle } from "@/lib/api";
import { fmtEur } from "./paymentUtils";

const fmtDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function PpcBillingCycleCard({
  cycles,
  loading,
}: {
  cycles: AmazonPpcBillingCycle[];
  loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!cycles.some((cycle) => cycle.accountId === selectedId)) {
      setSelectedId(cycles[0]?.accountId ?? null);
    }
  }, [cycles, selectedId]);

  const cycle = cycles.find((item) => item.accountId === selectedId) ?? cycles[0] ?? null;
  const recentDays = useMemo(() => cycle?.daily.slice(-7) ?? [], [cycle]);
  const maxDailySpend = Math.max(...recentDays.map((day) => day.spend), 1);
  const progress = Math.max(0, Math.min(100, cycle?.progressPct ?? 0));
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const spendForDate = (date: Date) => cycle?.daily.find((day) => day.date === localDateKey(date))?.spend ?? 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-accent-amber/35 bg-bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-amber/25 bg-accent-amber/10 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-amber/15 text-accent-amber"><Gauge size={17} /></span>
          <div>
            <h2 className="font-semibold text-zinc-100">Ciclo addebito PPC Amazon</h2>
            <p className="text-[11px] text-zinc-500">Reset soltanto sul movimento PPC reale nei settlement</p>
          </div>
        </div>
        {cycle && (
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${cycle.status === "charge_expected" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-accent-amber/30 bg-bg-card text-accent-amber"}`}>
            {cycle.status === "charge_expected" ? "100% · addebito atteso" : "In accumulo"}
          </span>
        )}
      </div>

      {cycles.length > 1 && (
        <div className="flex gap-2 border-b border-bg-border px-5 py-2.5">
          {cycles.map((item) => (
            <button key={item.accountId} type="button" onClick={() => setSelectedId(item.accountId)} className={`rounded-full border px-3 py-1 text-xs ${item.accountId === cycle?.accountId ? "border-accent-amber/35 bg-accent-amber/10 font-semibold text-accent-amber" : "border-bg-border text-zinc-500 hover:text-zinc-300"}`}>
              {item.accountName} · {Math.round(item.progressPct)}%
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse bg-bg-hover/30" />
      ) : !cycle ? (
        <div className="p-8 text-center text-sm text-zinc-500">Nessun dato PPC disponibile.</div>
      ) : (
        <>
          <div className="grid gap-6 p-5 lg:grid-cols-[230px_1fr_280px]">
            <div className="flex items-center gap-4">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--color-accent-amber, #f59e0b) 0 ${progress}%, rgba(113,113,122,.18) ${progress}% 100%)` }}>
                <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full bg-bg-card">
                  <strong className="text-2xl tabular-nums text-accent-amber">{Math.round(progress)}%</strong>
                  <span className="text-[9px] uppercase text-zinc-500">del ciclo</span>
                </div>
              </div>
              <div><div className="text-[10px] uppercase tracking-wider text-zinc-500">Accumulato</div><div className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">{fmtEur(cycle.accumulatedSpend)}</div><div className="mt-1 text-xs text-zinc-500">su soglia {fmtEur(cycle.threshold)}</div></div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs"><span className="font-semibold text-zinc-300">Spesa incrementale giornaliera</span><span className="text-zinc-500">ultimi {recentDays.length} giorni</span></div>
              <div className="mt-4 flex h-24 items-end gap-2 border-b border-bg-border px-1">
                {recentDays.map((day) => (
                  <div key={day.date} className="group relative flex h-full flex-1 items-end">
                    <div className="w-full rounded-t bg-accent-amber/65 transition-colors group-hover:bg-accent-amber" style={{ height: `${Math.max(8, (day.spend / maxDailySpend) * 100)}%` }} />
                    <span className="absolute -top-1 left-1/2 hidden -translate-x-1/2 -translate-y-full rounded bg-bg-base px-1.5 py-1 text-[9px] tabular-nums text-zinc-300 shadow group-hover:block">+{fmtEur(day.spend)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[9px] text-zinc-500">{recentDays.map((day) => <span key={day.date}>{fmtDate(day.date)}</span>)}</div>
            </div>

            <div className="space-y-2">
              <div className="rounded-xl border border-accent-amber/25 bg-accent-amber/10 p-3"><div className="text-[10px] uppercase text-accent-amber">Manca alla soglia</div><div className="mt-1 text-xl font-bold tabular-nums text-accent-amber">{fmtEur(cycle.remaining)}</div><div className="mt-1 text-[10px] text-zinc-500">{cycle.estimatedDaysToThreshold == null ? "Ritmo non ancora stimabile" : `≈ ${cycle.estimatedDaysToThreshold} gg al ritmo attuale`}</div></div>
              <div className="rounded-xl bg-bg-base p-3"><div className="flex justify-between text-[10px] text-zinc-500"><span>Ultimo addebito reale</span><strong className="text-zinc-300">{cycle.lastCharge ? fmtDate(cycle.lastCharge.date) : "Non rilevato"}</strong></div>{cycle.lastCharge && <div className="mt-1 flex justify-between text-[11px]"><span className="text-zinc-500">Importo PPC</span><strong className="tabular-nums text-zinc-200">{fmtEur(cycle.lastCharge.amount)}</strong></div>}</div>
            </div>
          </div>
          <div className="grid gap-2 border-t border-bg-border bg-bg-hover/20 px-5 py-3 text-xs sm:grid-cols-4">
            <div><span className="text-zinc-500">Oggi</span><strong className="ml-2 tabular-nums text-accent-amber">+{fmtEur(spendForDate(today))}</strong></div>
            <div><span className="text-zinc-500">Ieri</span><strong className="ml-2 tabular-nums text-zinc-300">+{fmtEur(spendForDate(yesterday))}</strong></div>
            <div><span className="text-zinc-500">Media 7 gg</span><strong className="ml-2 tabular-nums text-zinc-300">{fmtEur(cycle.averageDailySpend7d)}</strong></div>
            <div className="sm:text-right"><ReceiptText size={12} className="mr-1 inline text-zinc-500"/><span className="text-zinc-500">Dati al</span><strong className="ml-2 text-zinc-300">{cycle.updatedThrough ? fmtDate(cycle.updatedThrough) : "—"}</strong></div>
          </div>
        </>
      )}
    </section>
  );
}
