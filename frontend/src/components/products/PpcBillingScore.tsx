"use client";

import { Gauge } from "lucide-react";
import type { AmazonPpcBillingCycle } from "@/lib/api";
import { fmtEur } from "./MetricRow";

export default function PpcBillingScore({
  cycle,
  showAccountName = false,
}: {
  cycle: AmazonPpcBillingCycle;
  showAccountName?: boolean;
}) {
  const progress = Math.max(0, Math.min(100, cycle.progressPct));
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todaySpend = cycle.daily.find((day) => day.date === todayKey)?.spend ?? 0;
  const chargeExpected = cycle.status === "charge_expected";

  return (
    <div
      aria-label={`Ciclo PPC Amazon ${progress}%`}
      className="mt-auto rounded-[9px] border border-accent-amber/35 bg-accent-amber/10 px-2.5 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-accent-amber">
          <Gauge size={12} className="shrink-0" />
          <span className="truncate">Ciclo PPC Amazon</span>
        </span>
        <span className="rounded-full bg-accent-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-amber">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="text-[13px] font-bold tabular-nums text-zinc-200">
          {fmtEur(cycle.accumulatedSpend)}
          <span className="ml-1 text-[9px] font-normal text-zinc-500">/ {fmtEur(cycle.threshold)}</span>
        </span>
        <span className="text-[9px] tabular-nums text-zinc-500">+{fmtEur(todaySpend)} oggi</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-base ring-1 ring-accent-amber/20">
        <div className="h-full rounded-full bg-accent-amber transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px]">
        <span className="font-semibold text-accent-amber">
          {chargeExpected ? "Addebito atteso" : `${fmtEur(cycle.remaining)} all’addebito`}
        </span>
        <span className="truncate text-zinc-500">
          {showAccountName ? cycle.accountName : "Reset su addebito reale"}
        </span>
      </div>
    </div>
  );
}
