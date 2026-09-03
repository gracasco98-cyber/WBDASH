"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { SupplierPaymentDue, PaymentDueStatus } from "@/lib/api/payment-dues";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

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
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const kpis = useMemo(() => {
    const pending = rows.filter(r => r.status === "PENDING");
    return {
      totalDue: pending.reduce((s, r) => s + r.amount, 0),
      overdue: pending.filter(r => r.dueDate.slice(0, 10) < today).reduce((s, r) => s + r.amount, 0),
      dueThisWeek: pending.filter(r => r.dueDate.slice(0, 10) >= today && r.dueDate.slice(0, 10) <= weekAhead).reduce((s, r) => s + r.amount, 0),
      paid: rows.filter(r => r.status === "PAID").reduce((s, r) => s + r.amount, 0),
    };
  }, [rows, today, weekAhead]);

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={20} className="text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight">Scadenzario</h1>
              <span className="text-[10px] uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">Tema chiaro</span>
            </div>

            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Totale da pagare", value: eur.format(kpis.totalDue), cls: "text-slate-900" },
                { label: "Scaduto", value: eur.format(kpis.overdue), cls: kpis.overdue > 0 ? "text-rose-600" : "text-slate-900" },
                { label: "In scadenza (7gg)", value: eur.format(kpis.dueThisWeek), cls: kpis.dueThisWeek > 0 ? "text-amber-700" : "text-slate-900" },
                { label: "Pagato", value: eur.format(kpis.paid), cls: "text-emerald-700" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
                  <div className={`mt-2 text-lg font-bold tabular-nums ${cls}`}>{value}</div>
                </div>
              ))}
            </section>

            <select
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 shadow-sm"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as PaymentDueStatus | "")}
            >
              <option value="">Tutte le scadenze</option>
              <option value="PENDING">Da pagare</option>
              <option value="PAID">Pagate</option>
            </select>

            {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200">
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
                      <tr key={r.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/30">
                        <td className={`px-3 py-2.5 ${isOverdue ? "text-rose-600 font-medium" : ""}`}>
                          {new Date(r.dueDate).toLocaleDateString("it-IT")}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/acquisti/ordini/${r.purchaseOrderId}`} className="font-mono text-emerald-700 hover:underline">
                            {r.purchaseOrder.poNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">{r.purchaseOrder.supplier.legalName}</td>
                        <td className="px-3 py-2.5">{r.installmentNumber}</td>
                        <td className="px-3 py-2.5">€ {r.amount.toFixed(2)}</td>
                        <td className="px-3 py-2.5">
                          {r.status === "PAID" ? (
                            <span className="text-emerald-700">Pagato{r.paidDate ? ` il ${new Date(r.paidDate).toLocaleDateString("it-IT")}` : ""}</span>
                          ) : isOverdue ? (
                            <span className="text-rose-600">Scaduta</span>
                          ) : (
                            <span className="text-slate-500">Da pagare</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.status === "PENDING" && (
                            <button
                              onClick={() => handleMarkPaid(r.id, r.amount)}
                              disabled={payingId === r.id}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                            >
                              Segna come pagato
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-8">Nessuna scadenza</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
