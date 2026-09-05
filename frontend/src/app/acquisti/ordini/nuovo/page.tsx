"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ProductPicker from "@/components/purchasing/ProductPicker";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/api/suppliers";
import type { Warehouse, PaymentTerm } from "@/lib/api/purchasing";
import type { CreatePurchaseOrderLineInput } from "@/lib/api/purchase-orders";

const VAT_RATE = 0.22;

interface LineRow {
  productId: string; productName: string; orderedQty: string; unitPrice: string;
}

const EMPTY_LINE: LineRow = { productId: "", productName: "", orderedQty: "1", unitPrice: "0" };

function computeAmounts(qty: number, unitPrice: number) {
  const taxableAmount = Math.round(qty * unitPrice * 100) / 100;
  const vatAmount = Math.round(taxableAmount * VAT_RATE * 100) / 100;
  const totalAmount = Math.round((taxableAmount + vatAmount) * 100) / 100;
  return { taxableAmount, vatAmount, totalAmount };
}

const inputClass = "bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-400";

export default function NuovoOrdinePage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [paymentTermId, setPaymentTermId] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineRow[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.suppliers.list().then(setSuppliers),
      api.purchasing.warehouses.list().then(setWarehouses),
      api.purchasing.paymentTerms.list().then(setPaymentTerms),
    ]).catch(() => setLoadError("Impossibile caricare fornitori, magazzini o condizioni di pagamento. Ricarica la pagina e riprova."));
  }, []);

  const setLine = (i: number, patch: Partial<LineRow>) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const totals = lines.reduce((acc, l) => {
    const { taxableAmount, vatAmount, totalAmount } = computeAmounts(Number(l.orderedQty) || 0, Number(l.unitPrice) || 0);
    return { taxable: acc.taxable + taxableAmount, vat: acc.vat + vatAmount, total: acc.total + totalAmount };
  }, { taxable: 0, vat: 0, total: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (lines.some(l => !l.productId)) throw new Error("Seleziona un prodotto per ogni riga");
      const payloadLines: CreatePurchaseOrderLineInput[] = lines.map(l => {
        const qty = Number(l.orderedQty) || 0;
        const unitPrice = Number(l.unitPrice) || 0;
        const { taxableAmount, vatAmount, totalAmount } = computeAmounts(qty, unitPrice);
        return {
          productId: l.productId, description: l.productName,
          orderedQty: qty, unitOfMeasure: "PZ", unitPrice, taxableAmount, vatAmount, totalAmount,
        };
      });
      const po = await api.purchaseOrders.create({
        supplierId, orderDate, currency: "EUR", warehouseId, paymentTermId, lines: payloadLines,
      });
      router.push(`/acquisti/ordini/${po.id}`);
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
          <main className="max-w-4xl mx-auto px-4 md:px-6 py-5 space-y-4">
            <h1 className="text-2xl font-bold tracking-tight">Nuovo Ordine Fornitore</h1>
            {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{loadError}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Fornitore *
                    <select required className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.legalName}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Magazzino *
                    <select required className={inputClass} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Condizione di pagamento *
                    <select required className={inputClass} value={paymentTermId} onChange={e => setPaymentTermId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {paymentTerms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Data ordine *
                    <input required type="date" className={inputClass} value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-200">Righe ordine</h2>
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
                    <label className="text-xs text-slate-500 flex flex-col gap-1">
                      Prodotto *
                      <ProductPicker
                        value={line.productId || null}
                        onChange={p => setLine(i, { productId: p?.id ?? "", productName: p?.name ?? "" })}
                      />
                    </label>
                    <label className="text-xs text-slate-500 flex flex-col gap-1">
                      Quantità *
                      <input required type="number" min="0.01" step="0.01" className={inputClass} value={line.orderedQty} onChange={e => setLine(i, { orderedQty: e.target.value })} />
                    </label>
                    <label className="text-xs text-slate-500 flex flex-col gap-1">
                      Prezzo unitario *
                      <input required type="number" min="0" step="0.01" className={inputClass} value={line.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value })} />
                    </label>
                    <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="text-xs text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1.5">Rimuovi</button>
                  </div>
                ))}
                <button type="button" onClick={addLine} className="text-xs text-emerald-700 hover:underline">+ Aggiungi riga</button>

                <div className="pt-3 border-t border-slate-200 text-xs text-slate-500 space-y-1">
                  <div>Imponibile: € {totals.taxable.toFixed(2)}</div>
                  <div>IVA (22%): € {totals.vat.toFixed(2)}</div>
                  <div className="text-slate-900 font-semibold">Totale: € {totals.total.toFixed(2)}</div>
                </div>
              </div>

              {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? "Salvataggio…" : "Crea Ordine"}
              </button>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
