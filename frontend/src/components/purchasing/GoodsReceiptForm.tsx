"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { PurchaseOrderLine, CreateGoodsReceiptLineInput } from "@/lib/api/purchase-orders";

interface Props {
  purchaseOrderId: string;
  lines: PurchaseOrderLine[]; // only lines with remainingQty > 0 should be passed in
  onDone: () => void;
  onCancel: () => void;
}

export default function GoodsReceiptForm({ purchaseOrderId, lines, onDone, onCancel }: Props) {
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierDdtNumber, setSupplierDdtNumber] = useState("");
  const [supplierDdtDate, setSupplierDdtDate] = useState(new Date().toISOString().slice(0, 10));
  const [carrier, setCarrier] = useState("");
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, String(l.remainingQty)]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const receiptLines: CreateGoodsReceiptLineInput[] = lines
        .map((l) => ({ purchaseOrderLineId: l.id, receivedQty: Number(qtyByLine[l.id] || 0) }))
        .filter((l) => l.receivedQty > 0);
      if (receiptLines.length === 0) {
        setError("Inserisci almeno una quantità ricevuta");
        setSubmitting(false);
        return;
      }
      await api.purchaseOrders.goodsReceipts.create(purchaseOrderId, {
        receiptDate, supplierDdtNumber, supplierDdtDate, carrier: carrier || undefined, lines: receiptLines,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la registrazione del DDT");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">Registra DDT</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <label className="space-y-1">
          <span className="text-slate-500">Numero DDT fornitore</span>
          <input value={supplierDdtNumber} onChange={(e) => setSupplierDdtNumber(e.target.value)}
            className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-400" />
        </label>
        <label className="space-y-1">
          <span className="text-slate-500">Data DDT fornitore</span>
          <input type="date" value={supplierDdtDate} onChange={(e) => setSupplierDdtDate(e.target.value)}
            className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-400" />
        </label>
        <label className="space-y-1">
          <span className="text-slate-500">Data ricezione</span>
          <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)}
            className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-400" />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-slate-500">Corriere/vettore (opzionale)</span>
          <input value={carrier} onChange={(e) => setCarrier(e.target.value)}
            className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-400" />
        </label>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 text-left border-b border-slate-200">
            <th className="py-2">Riga</th><th className="py-2">Residua</th><th className="py-2">Ricevuta ora</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-100">
              <td className="py-2 text-slate-700">{l.description}</td>
              <td className="py-2 text-slate-500">{l.remainingQty}</td>
              <td className="py-2">
                <input type="number" min={0} max={l.remainingQty} value={qtyByLine[l.id] ?? ""}
                  onChange={(e) => setQtyByLine((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  className="w-24 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-slate-700 focus:outline-none focus:border-emerald-400" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={submitting || !supplierDdtNumber}
          className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors">
          Salva DDT
        </button>
        <button onClick={onCancel} disabled={submitting}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 transition-colors">
          Annulla
        </button>
      </div>
    </div>
  );
}
