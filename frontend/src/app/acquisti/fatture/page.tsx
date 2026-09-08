"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ReceiptText, Plus } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { SupplierInvoice } from "@/lib/api/supplier-invoices";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" });

export default function FatturePage() {
  const [rows, setRows] = useState<SupplierInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.supplierInvoices.list().then(setRows).catch(() => setError("Impossibile caricare le fatture"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleVoid = async (id: string) => {
    if (!window.confirm("Annullare questa fattura? L'operazione non è reversibile dall'interfaccia.")) return;
    setVoidingId(id);
    setError(null);
    try {
      await api.supplierInvoices.void(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'annullamento");
    } finally {
      setVoidingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-4">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText size={20} className="text-emerald-600" />
                  <h1 className="text-2xl font-bold tracking-tight">Fatture Fornitore</h1>
                </div>
                <p className="text-sm text-slate-500 mt-1">Registro delle fatture ricevute dai fornitori</p>
              </div>
              <Link
                href="/acquisti/fatture/nuovo"
                className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 w-fit"
              >
                <Plus size={15} /> Nuova fattura
              </Link>
            </header>

            {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider">
                      <th className="px-3 py-2.5">Numero</th><th className="px-3 py-2.5">Data</th>
                      <th className="px-3 py-2.5">Fornitore</th><th className="px-3 py-2.5">Ordine</th>
                      <th className="px-3 py-2.5">Totale</th><th className="px-3 py-2.5">Stato</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(inv => (
                      <tr key={inv.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/40">
                        <td className="px-3 py-2.5 font-mono">
                          <Link href={`/acquisti/fatture/${inv.id}`} className="text-emerald-700 hover:underline">{inv.invoiceNumber}</Link>
                        </td>
                        <td className="px-3 py-2.5">{dateFmt.format(new Date(inv.invoiceDate))}</td>
                        <td className="px-3 py-2.5">{inv.supplier.legalName}</td>
                        <td className="px-3 py-2.5">
                          {inv.purchaseOrder ? (
                            <Link href={`/acquisti/ordini/${inv.purchaseOrder.id}`} className="font-mono text-emerald-700 hover:underline">
                              {inv.purchaseOrder.poNumber}
                            </Link>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">{eur.format(inv.totalAmount)}</td>
                        <td className="px-3 py-2.5">
                          {inv.voidedAt ? (
                            <span className="rounded-full bg-rose-50 text-rose-700 px-2 py-1 text-[10px] font-semibold">Annullata</span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[10px] font-semibold">Attiva</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!inv.voidedAt && (
                            <button
                              onClick={() => handleVoid(inv.id)}
                              disabled={voidingId === inv.id}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium hover:bg-rose-100 disabled:opacity-50 transition-colors"
                            >
                              Annulla
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-slate-400 py-8">Nessuna fattura registrata</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
