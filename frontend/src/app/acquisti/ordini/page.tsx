"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { PurchaseOrder, LogisticStatus } from "@/lib/api/purchase-orders";

const STATUS_LABEL: Record<LogisticStatus, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito",
  PARTIALLY_RECEIVED: "Parz. ricevuto", RECEIVED: "Ricevuto", COMPLETED: "Completato", CANCELLED: "Annullato",
};

const OPEN_STATUSES: LogisticStatus[] = ["DRAFT", "SENT", "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "PARTIALLY_RECEIVED"];

export default function OrdiniFornitorePage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.purchaseOrders.list(statusFilter ? { logisticStatus: statusFilter } : undefined)
      .then(setRows)
      .catch(() => { setRows([]); setError("Impossibile caricare gli ordini. Verifica la connessione e riprova."); })
      .finally(() => setLoading(false));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => {
    const today = new Date();
    return {
      draft: rows.filter(r => r.logisticStatus === "DRAFT").length,
      sent: rows.filter(r => r.logisticStatus === "SENT").length,
      partiallyReceived: rows.filter(r => r.logisticStatus === "PARTIALLY_RECEIVED").length,
      overdue: rows.filter(r =>
        OPEN_STATUSES.includes(r.logisticStatus) && r.expectedDeliveryDate && new Date(r.expectedDeliveryDate) < today
      ).length,
    };
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20} className="text-emerald-600" />
                <h1 className="text-2xl font-bold tracking-tight">Ordini Fornitore</h1>
                <span className="text-[10px] uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">Tema chiaro</span>
              </div>
              <Link
                href="/acquisti/ordini/nuovo"
                className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 w-fit"
              >
                <Plus size={15} /> Nuovo ordine
              </Link>
            </div>

            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Bozze", value: kpis.draft, cls: "text-slate-900" },
                { label: "Inviati", value: kpis.sent, cls: "text-slate-900" },
                { label: "Parzialmente ricevuti", value: kpis.partiallyReceived, cls: "text-amber-700" },
                { label: "In ritardo", value: kpis.overdue, cls: kpis.overdue > 0 ? "text-rose-600" : "text-slate-900" },
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
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">Tutti gli stati</option>
              {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>

            {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"><span>{error}</span><button onClick={load} className="font-semibold underline">Riprova</button></div>}

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5">Numero</th><th className="px-3 py-2.5">Fornitore</th>
                    <th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Magazzino</th>
                    <th className="px-3 py-2.5">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={5} className="text-center text-slate-400 py-10">Caricamento ordini…</td></tr> : rows.map(r => (
                    <tr key={r.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/30">
                      <td className="px-3 py-2.5">
                        <Link href={`/acquisti/ordini/${r.id}`} className="font-mono text-emerald-700 hover:underline">{r.poNumber}</Link>
                      </td>
                      <td className="px-3 py-2.5">{r.supplier?.legalName ?? "—"}</td>
                      <td className="px-3 py-2.5">{new Date(r.orderDate).toLocaleDateString("it-IT")}</td>
                      <td className="px-3 py-2.5">{r.warehouse?.name ?? "—"}</td>
                      <td className="px-3 py-2.5">{STATUS_LABEL[r.logisticStatus]}</td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && !error && <tr><td colSpan={5} className="text-center text-slate-400 py-8">Nessun ordine — inizia creandone uno</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
