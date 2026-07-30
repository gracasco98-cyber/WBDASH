"use client";
import React from "react";
import { RefreshCw, Download, Loader2 } from "lucide-react";
import type { Settlement } from "./paymentTypes";
import { downloadCsvFromSettlements } from "./paymentUtils";

export interface PaymentHeaderProps {
  loading:     boolean;
  periodLabel: string;
  settlements: Settlement[];
  currentRange: { from: Date; to: Date };
  selectedCountry: string;
  onRefresh:   () => void;
  // filterByPeriod passed in so this component has no direct analytics import
  filterFn: (settlements: Settlement[], country: string, from: Date, to: Date) => Settlement[];
}

export function PaymentHeader({
  loading, periodLabel, settlements, currentRange, selectedCountry, onRefresh, filterFn,
}: PaymentHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Pagamenti Amazon</h1>
        <p className="mt-1 text-sm text-zinc-500">Seller Central &middot; Cicli di liquidazione EU</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            const filtered = filterFn(settlements, selectedCountry, currentRange.from, currentRange.to);
            downloadCsvFromSettlements(filtered, periodLabel);
          }}
          disabled={loading || settlements.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-bg-border bg-bg-card px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        <button
          onClick={onRefresh} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-bg-border bg-bg-card px-4 py-2 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Caricamento" : "Aggiorna"}
        </button>
      </div>
    </div>
  );
}
