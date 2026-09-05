"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { CalendarDays, Search, Download, WalletCards, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { SupplierPaymentDue, PaymentDueStatus } from "@/lib/api/payment-dues";
import { buildScadenzarioCsv } from "./csv";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" });

export default function ScadenzarioPage() {
  const [rows, setRows] = useState<SupplierPaymentDue[]>([]);
  const [statusFilter, setStatusFilter] = useState<PaymentDueStatus | "">("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupplierPaymentDue | null>(null);

  const load = useCallback(() => {
    api.paymentDues.list(statusFilter ? { status: statusFilter } : undefined).then(setRows).catch(() => {});
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (id: string, amount: number) => {
    setPayingId(id);
    setError(null);
    try {
      await api.paymentDues.markPaid(id, new Date().toISOString().slice(0, 10), amount);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la registrazione del pagamento");
    } finally {
      setPayingId(null);
    }
  };

  const handleExport = () => {
    const csv = buildScadenzarioCsv(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scadenzario.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.purchaseOrder.poNumber.toLowerCase().includes(q) ||
      r.purchaseOrder.supplier.legalName.toLowerCase().includes(q)
    );
  }, [rows, search]);

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
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays size={20} className="text-emerald-600" />
                <h1 className="text-2xl font-bold tracking-tight">Scadenzario</h1>
                <span className="text-[10px] uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">Tema chiaro</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">Scadenze fornitori, stato pagamenti e prossime rate</p>
            </div>

            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Totale da pagare", value: eur.format(kpis.totalDue), icon: WalletCards, cls: "text-slate-900" },
                { label: "Scaduto", value: eur.format(kpis.overdue), icon: AlertTriangle, cls: kpis.overdue > 0 ? "text-rose-600" : "text-slate-900" },
                { label: "In scadenza (7gg)", value: eur.format(kpis.dueThisWeek), icon: Clock, cls: kpis.dueThisWeek > 0 ? "text-amber-700" : "text-slate-900" },
                { label: "Pagato", value: eur.format(kpis.paid), icon: CheckCircle2, cls: "text-emerald-700" },
              ].map(({ label, value, icon: Icon, cls }) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>{label}</span>
                    <Icon size={15} className={cls} />
                  </div>
                  <div className={`mt-2 text-lg font-bold tabular-nums ${cls}`}>{value}</div>
                </div>
              ))}
            </section>

            {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold">Scadenze</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{filteredRows.length}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filtra per stato"
                    className="h-8 bg-white border border-slate-200 rounded-lg px-2.5 text-xs text-slate-700 shadow-sm"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as PaymentDueStatus | "")}
                  >
                    <option value="">Tutte le scadenze</option>
                    <option value="PENDING">Da pagare</option>
                    <option value="PAID">Pagate</option>
                  </select>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Cerca ordine, fornitore..."
                      className="h-8 w-52 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-none focus:border-emerald-400"
                    />
                  </div>
                  <button
                    onClick={handleExport}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Download size={13} /> Esporta
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider">
                      <th className="px-3 py-2.5">Scadenza</th><th className="px-3 py-2.5">Ordine</th>
                      <th className="px-3 py-2.5">Fornitore</th><th className="px-3 py-2.5">Rata</th>
                      <th className="px-3 py-2.5">Importo</th><th className="px-3 py-2.5">Stato</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(r => {
                      const isOverdue = r.status === "PENDING" && r.dueDate.slice(0, 10) < today;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setSelected(r)}
                          className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/40 cursor-pointer"
                        >
                          <td className={`px-3 py-2.5 ${isOverdue ? "text-rose-600 font-medium" : ""}`}>
                            {dateFmt.format(new Date(r.dueDate))}
                          </td>
                          <td className="px-3 py-2.5">
                            <Link
                              href={`/acquisti/ordini/${r.purchaseOrderId}`}
                              onClick={e => e.stopPropagation()}
                              className="font-mono text-emerald-700 hover:underline"
                            >
                              {r.purchaseOrder.poNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">{r.purchaseOrder.supplier.legalName}</td>
                          <td className="px-3 py-2.5">{r.installmentNumber}</td>
                          <td className="px-3 py-2.5 font-mono tabular-nums">{eur.format(r.amount)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                              r.status === "PAID" ? "bg-emerald-50 text-emerald-700"
                              : isOverdue ? "bg-rose-50 text-rose-700"
                              : "bg-slate-100 text-slate-600"
                            }`}>
                              {r.status === "PAID" ? "Pagato" : isOverdue ? "Scaduta" : "Da pagare"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {r.status === "PENDING" && (
                              <button
                                onClick={e => { e.stopPropagation(); handleMarkPaid(r.id, r.amount); }}
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
                    {filteredRows.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-slate-400 py-8">Nessuna scadenza</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Scheda scadenza</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{selected.purchaseOrder.poNumber}</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.purchaseOrder.supplier.legalName}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">×</button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-100 p-3">
                <p className="text-[10px] uppercase text-slate-600">Importo rata</p>
                <p className="mt-1 font-mono font-bold text-slate-900">{eur.format(selected.amount)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3">
                <p className="text-[10px] uppercase text-slate-600">Rata</p>
                <p className="mt-1 font-mono font-bold text-slate-900">#{selected.installmentNumber}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Scadenza</label>
                <p className="mt-1 rounded-lg border border-slate-200 p-2.5 text-sm">{dateFmt.format(new Date(selected.dueDate))}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Stato</label>
                <p className="mt-1 rounded-lg border border-slate-200 p-2.5 text-sm">
                  {selected.status === "PAID"
                    ? `Pagato${selected.paidDate ? ` il ${dateFmt.format(new Date(selected.paidDate))}` : ""}`
                    : "Da pagare"}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Ordine collegato</label>
                <Link
                  href={`/acquisti/ordini/${selected.purchaseOrderId}`}
                  className="mt-1 block rounded-lg border border-slate-200 p-2.5 text-sm font-mono text-emerald-700 hover:underline"
                >
                  {selected.purchaseOrder.poNumber}
                </Link>
              </div>
            </div>

            {selected.status === "PENDING" && (
              <button
                onClick={() => handleMarkPaid(selected.id, selected.amount)}
                disabled={payingId === selected.id}
                className="mt-6 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors"
              >
                Segna come pagato
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
