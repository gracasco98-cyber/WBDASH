"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { SupplierPaymentDue, PaymentDueStatus } from "@/lib/api/payment-dues";

export default function ScadenzarioPage() {
  const [rows, setRows] = useState<SupplierPaymentDue[]>([]);
  const [statusFilter, setStatusFilter] = useState<PaymentDueStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.paymentDues.list(statusFilter ? { status: statusFilter } : undefined).then(setRows).catch(() => {});
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (id: string, amount: number) => {
    setPayingId(id);
    setError(null);
    try {
      await api.paymentDues.markPaid(id, new Date().toISOString().slice(0, 10), amount);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la registrazione del pagamento");
    } finally {
      setPayingId(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-5xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Scadenzario</h1>

            <select
              className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as PaymentDueStatus | "")}
            >
              <option value="">Tutte le scadenze</option>
              <option value="PENDING">Da pagare</option>
              <option value="PAID">Pagate</option>
            </select>

            {error && <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">{error}</div>}

            <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
                    <th className="px-3 py-2.5">Scadenza</th><th className="px-3 py-2.5">Ordine</th>
                    <th className="px-3 py-2.5">Fornitore</th><th className="px-3 py-2.5">Rata</th>
                    <th className="px-3 py-2.5">Importo</th><th className="px-3 py-2.5">Stato</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isOverdue = r.status === "PENDING" && r.dueDate.slice(0, 10) < today;
                    return (
                      <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                        <td className={`px-3 py-2.5 ${isOverdue ? "text-accent-red font-medium" : ""}`}>
                          {new Date(r.dueDate).toLocaleDateString("it-IT")}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/acquisti/ordini/${r.purchaseOrderId}`} className="font-mono text-accent-primary hover:underline">
                            {r.purchaseOrder.poNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">{r.purchaseOrder.supplier.legalName}</td>
                        <td className="px-3 py-2.5">{r.installmentNumber}</td>
                        <td className="px-3 py-2.5">€ {r.amount.toFixed(2)}</td>
                        <td className="px-3 py-2.5">
                          {r.status === "PAID" ? (
                            <span className="text-accent-primary">Pagato{r.paidDate ? ` il ${new Date(r.paidDate).toLocaleDateString("it-IT")}` : ""}</span>
                          ) : isOverdue ? (
                            <span className="text-accent-red">Scaduta</span>
                          ) : (
                            <span className="text-zinc-500">Da pagare</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.status === "PENDING" && (
                            <button
                              onClick={() => handleMarkPaid(r.id, r.amount)}
                              disabled={payingId === r.id}
                              className="px-2.5 py-1 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 disabled:opacity-50 transition-colors"
                            >
                              Segna come pagato
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7} className="text-center text-zinc-600 py-8">Nessuna scadenza</td></tr>}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
