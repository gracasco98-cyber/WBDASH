"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { SupplierPaymentDue } from "@/lib/api/payment-dues";

export default function ScadenzeWidget() {
  const [dues, setDues] = useState<SupplierPaymentDue[]>([]);

  useEffect(() => {
    api.paymentDues.list({ status: "PENDING" })
      .then(rows => setDues([...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3)))
      .catch(() => setDues([]));
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="text-[10px] uppercase tracking-wide text-amber-950/60 mb-1.5">Prossime scadenze</div>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {dues.map(d => (
          <div key={d.id} className="text-xs text-amber-950/80 flex justify-between gap-2">
            <span className="truncate">{d.purchaseOrder.supplier.legalName}</span>
            <span className="shrink-0 tabular-nums">€ {d.amount.toFixed(0)}</span>
          </div>
        ))}
        {dues.length === 0 && <p className="text-xs text-amber-950/50">Nessuna scadenza imminente</p>}
      </div>
    </div>
  );
}
