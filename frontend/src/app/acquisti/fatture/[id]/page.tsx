"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { SupplierInvoice } from "@/lib/api/supplier-invoices";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" });

export default function FatturaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<SupplierInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);

  const load = () => { api.supplierInvoices.get(id).then(setInvoice).catch(() => setError("Impossibile caricare la fattura")); };
  useEffect(() => { load(); }, [id]);

  const handleVoid = async () => {
    if (!window.confirm("Annullare questa fattura? L'operazione non è reversibile dall'interfaccia.")) return;
    setVoiding(true);
    setError(null);
    try {
      const updated = await api.supplierInvoices.void(id);
      setInvoice(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'annullamento");
    } finally {
      setVoiding(false);
    }
  };

  if (!invoice) {
    return (
      <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
        <AppHeader accentColor="primary" />
        <div className="flex"><GlobalSidebar /><main className="flex-1 min-w-0 p-6 text-sm text-slate-500">{error ?? "Caricamento…"}</main></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Fattura Fornitore</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
                <p className="mt-1 text-sm text-slate-500">{invoice.supplier.legalName}</p>
              </div>
              {invoice.voidedAt ? (
                <span className="rounded-full bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-semibold">Annullata</span>
              ) : (
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-semibold">Attiva</span>
              )}
            </div>

            {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[10px] uppercase text-slate-500">Data fattura</p><p className="mt-1 text-sm">{dateFmt.format(new Date(invoice.invoiceDate))}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500">Ricevuta il</p><p className="mt-1 text-sm">{dateFmt.format(new Date(invoice.receivedDate))}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500">Imponibile</p><p className="mt-1 text-sm font-mono">{eur.format(invoice.taxableAmount)}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500">IVA</p><p className="mt-1 text-sm font-mono">{eur.format(invoice.vatAmount)}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500">Totale</p><p className="mt-1 text-sm font-mono font-bold">{eur.format(invoice.totalAmount)}</p></div>
                <div>
                  <p className="text-[10px] uppercase text-slate-500">Ordine collegato</p>
                  {invoice.purchaseOrder ? (
                    <Link href={`/acquisti/ordini/${invoice.purchaseOrder.id}`} className="mt-1 block text-sm font-mono text-emerald-700 hover:underline">
                      {invoice.purchaseOrder.poNumber}
                    </Link>
                  ) : <p className="mt-1 text-sm text-slate-400">—</p>}
                </div>
              </div>
              {invoice.notes && (
                <div><p className="text-[10px] uppercase text-slate-500">Note</p><p className="mt-1 text-sm">{invoice.notes}</p></div>
              )}
            </section>

            {!invoice.voidedAt && (
              <button
                onClick={handleVoid}
                disabled={voiding}
                className="px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 disabled:opacity-50 transition-colors"
              >
                {voiding ? "Annullamento…" : "Annulla fattura"}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
