"use client";
import React from "react";
import {
  CalendarDays, CheckCircle2, AlertTriangle, XCircle,
} from "lucide-react";
import type { PaymentItem } from "./paymentTypes";
import { COUNTRY_FLAGS, COUNTRY_NAMES } from "./paymentTypes";
import { fmtEur, fmtDay } from "./paymentUtils";

// ── ValidatorDot ───────────────────────────────────────────────────────────────

function ValidatorDot({ status }: { status: "reconciled" | "partial" | "error" }) {
  if (status === "reconciled")
    return <span title="Riconciliato (scarto < 0,5%)"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /></span>;
  if (status === "partial")
    return <span title="Parziale (scarto 0,5% - 5%)"><AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" /></span>;
  return <span title="Errore (scarto > 5%)"><XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" /></span>;
}

// ── PaymentCard ────────────────────────────────────────────────────────────────

function PaymentCard({ payment, selected, onClick }: { payment: PaymentItem; selected: boolean; onClick: () => void }) {
  const cls = payment.status === "Ricevuto"
    ? { bg: "bg-emerald-500/10 border-emerald-500/25", badge: "bg-emerald-500/20 text-emerald-300", amount: "text-emerald-400", date: "text-emerald-400", ring: "ring-emerald-500/40" }
    : payment.status === "Prossimo"
    ? { bg: "bg-blue-500/10 border-blue-500/25",       badge: "bg-blue-500/20 text-blue-300",       amount: "text-blue-400",   date: "text-blue-400",   ring: "ring-blue-500/40" }
    : { bg: "bg-white/[0.04] border-white/10",         badge: "bg-white/10 text-zinc-500",          amount: "text-zinc-600",   date: "text-zinc-500",   ring: "ring-zinc-500/30" };

  return (
    <button type="button" onClick={onClick}
      className={`min-w-[190px] rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${cls.bg} ${selected ? `ring-2 ${cls.ring} ring-offset-1 ring-offset-bg-card` : ""}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls.badge}`}>{payment.status}</span>
        {payment.daysLabel && <span className="text-[11px] text-zinc-600">{payment.daysLabel}</span>}
        {payment.validatorStatus && payment.validatorStatus !== "unknown" && (
          <ValidatorDot status={payment.validatorStatus} />
        )}
      </div>
      <p className={`text-sm font-semibold ${cls.date}`}>{fmtDay(payment.date)}</p>
      <div className="mt-2 flex flex-wrap gap-1 leading-none">
        {payment.countries.map(c => (
          <span key={c} title={`${COUNTRY_NAMES[c] ?? c}`} style={{ fontSize: "1.15rem", lineHeight: 1 }}>
            {COUNTRY_FLAGS[c]
              ? COUNTRY_FLAGS[c]
              : <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 rounded px-0.5">{c}</span>
            }
          </span>
        ))}
      </div>
      <p className={`mt-2 text-base font-bold tabular-nums ${cls.amount}`}>
        {payment.amount != null ? fmtEur(payment.amount) : <span className="text-xs italic text-zinc-600">da calcolare</span>}
      </p>
      {payment.note && <p className="mt-1 text-[10px] italic text-zinc-600">{payment.note}</p>}
    </button>
  );
}

// ── PaymentTimeline ────────────────────────────────────────────────────────────

export interface PaymentTimelineProps {
  payments:           PaymentItem[];
  selectedPaymentId:  string;
  onSelect:           (id: string) => void;
  loading:            boolean;
}

export function PaymentTimeline({ payments, selectedPaymentId, onSelect, loading }: PaymentTimelineProps) {
  return (
    <section className="rounded-2xl border border-bg-border bg-bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <CalendarDays className="h-4 w-4" />
        Calendario pagamenti
        <span className="ml-auto font-normal normal-case tracking-normal text-zinc-600">cicli di 14 giorni</span>
      </div>
      {loading ? (
        <div className="flex gap-3">
          {[...Array(5)].map((_, i) => <div key={i} className="min-w-[190px] h-32 rounded-2xl bg-bg-base animate-pulse" />)}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {payments.map(p => (
            <PaymentCard key={p.id} payment={p} selected={selectedPaymentId === p.id} onClick={() => onSelect(p.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
