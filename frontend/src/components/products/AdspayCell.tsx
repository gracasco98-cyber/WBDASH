"use client";

import type { AmazonPpcBillingCycle } from "@/lib/api";
import { fmtEur } from "./MetricRow";

type Props = {
  cycle: AmazonPpcBillingCycle;
};

const fmtShortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

/** Non-breaking spaces keep "€ 600,00" and "18 set" on one line in narrow tiles. */
const keepTogether = (text: string) => text.replace(/ /g, " ");
const eur = (value: number) => keepTogether(fmtEur(value));

// Inline rgb(var(--…)) works with both the comma and the space-separated
// form of the theme triplets, unlike Tailwind's `/ <alpha-value>` utilities.
const ACCUMULATING_COLOR = "rgb(var(--accent-purple-rgb))";
const CHARGE_EXPECTED_COLOR = "rgb(var(--accent-amber-rgb))";

/**
 * "Adspay" cell of the Oggi tile: Amazon.it ads spend since the last real
 * invoice charge, scored 0–100 against the billing threshold. Meant to span
 * the whole row, so it stays readable in the narrowest (~136px) tiles.
 */
export default function AdspayCell({ cycle }: Props) {
  const progress = Math.max(0, Math.min(100, cycle.progressPct));
  const score = Math.round(progress);
  const chargeExpected = cycle.status === "charge_expected";
  const lastCharge = cycle.lastCharge;
  const tooltip = [
    `Score ${score}/100 · ${fmtEur(cycle.accumulatedSpend)} spesi da${lastCharge ? "ll’ultimo addebito" : " inizio dati"}`,
    lastCharge
      ? `Ultimo addebito ${fmtShortDate(lastCharge.date)}: ${fmtEur(lastCharge.amount)} + IVA (${fmtEur(lastCharge.totalAmount)} scalati)`
      : "Nessun addebito Ads rilevato",
  ].join("\n");

  return (
    <div title={tooltip} className="min-w-0 rounded-[9px] border border-bg-border/70 bg-bg-hover/30 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.08em] text-zinc-500">
        <span>Adspay</span>
        <span className="font-bold tabular-nums" style={{ color: chargeExpected ? CHARGE_EXPECTED_COLOR : ACCUMULATING_COLOR }}>
          {score}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1 tabular-nums">
        <span className="text-[11px] font-semibold text-zinc-300">{eur(cycle.accumulatedSpend)}</span>
        <span className="text-[9px] text-zinc-500">/ {eur(cycle.threshold)}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Adspay"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        className="mt-1 h-1 overflow-hidden rounded-full bg-bg-base"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress}%`, backgroundColor: chargeExpected ? CHARGE_EXPECTED_COLOR : ACCUMULATING_COLOR }}
        />
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[9px] text-zinc-500">
        <span>{lastCharge ? `dal ${keepTogether(fmtShortDate(lastCharge.date))}` : "nessun addebito rilevato"}</span>
        <span>{chargeExpected ? "addebito in arrivo" : `mancano ${eur(cycle.remaining)}`}</span>
      </div>
    </div>
  );
}
