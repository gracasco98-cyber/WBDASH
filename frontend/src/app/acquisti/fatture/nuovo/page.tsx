"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/api/suppliers";
import type { PurchaseOrder } from "@/lib/api/purchase-orders";

const inputClass = "bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-400";

export default function NuovaFatturaPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxableAmount, setTaxableAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.suppliers.list().then(setSuppliers).catch(() => setLoadError("Impossibile caricare i fornitori. Ricarica la pagina e riprova."));
  }, []);

  useEffect(() => {
    setPurchaseOrderId("");
    if (!supplierId) { setOrders([]); return; }
    api.purchaseOrders.list({ supplierId }).then(setOrders).catch(() => setOrders([]));
  }, [supplierId]);

  const totalAmount = (Number(taxableAmount) || 0) + (Number(vatAmount) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.supplierInvoices.create({
        supplierId,
        purchaseOrderId: purchaseOrderId || undefined,
        invoiceNumber,
        invoiceDate,
        taxableAmount: Number(taxableAmount) || 0,
        vatAmount: Number(vatAmount) || 0,
        totalAmount,
        notes: notes || undefined,
      });
      router.push("/acquisti/fatture");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-2xl mx-auto px-4 md:px-6 py-5 space-y-4">
            <h1 className="text-2xl font-bold tracking-tight">Nuova Fattura Fornitore</h1>
            {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{loadError}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Fornitore *
                    <select required id="supplierId" className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.legalName}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Ordine collegato (opzionale)
                    <select id="purchaseOrderId" className={inputClass} value={purchaseOrderId} onChange={e => setPurchaseOrderId(e.target.value)} disabled={!supplierId}>
                      <option value="">— nessuno —</option>
                      {orders.map(o => <option key={o.id} value={o.id}>{o.poNumber}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Numero fattura *
                    <input required id="invoiceNumber" className={inputClass} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Data fattura *
                    <input required id="invoiceDate" type="date" className={inputClass} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Imponibile *
                    <input required id="taxableAmount" type="number" min="0" step="0.01" className={inputClass} value={taxableAmount} onChange={e => setTaxableAmount(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    IVA *
                    <input required id="vatAmount" type="number" min="0" step="0.01" className={inputClass} value={vatAmount} onChange={e => setVatAmount(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Totale
                    <input id="totalAmount" type="number" className={inputClass} value={totalAmount} readOnly disabled />
                  </label>
                </div>
                <label className="text-xs text-slate-500 flex flex-col gap-1">
                  Note
                  <textarea id="notes" className={inputClass} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
                </label>
              </div>

              {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? "Salvataggio…" : "Salva fattura"}
              </button>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
