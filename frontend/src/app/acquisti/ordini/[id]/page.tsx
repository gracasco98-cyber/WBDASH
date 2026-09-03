"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { PurchaseOrderDetail, LogisticStatus } from "@/lib/api/purchase-orders";
import GoodsReceiptForm from "@/components/purchasing/GoodsReceiptForm";
import GoodsReceiptsList from "@/components/purchasing/GoodsReceiptsList";
import type { GoodsReceipt } from "@/lib/api/purchase-orders";
import OrderStatusStepper from "@/components/purchasing/OrderStatusStepper";

const STATUS_LABEL: Record<LogisticStatus, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito",
  PARTIALLY_RECEIVED: "Parz. ricevuto", RECEIVED: "Ricevuto", COMPLETED: "Completato", CANCELLED: "Annullato",
};

// Mirrors backend/src/purchasing/purchase-order-state-machine.ts — only used to
// decide which buttons to show. The server independently re-validates every
// transition, so a stale copy here can only ever be overly permissive in the
// UI (an extra button that then 409s), never actually bypass a rule.
const NEXT_STATUSES: Record<LogisticStatus, LogisticStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"], SENT: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["READY", "CANCELLED"], READY: ["PARTIALLY_SHIPPED", "CANCELLED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "CANCELLED"], SHIPPED: ["CANCELLED"],
  PARTIALLY_RECEIVED: [], RECEIVED: [], COMPLETED: [], CANCELLED: [],
};

const RECEIVABLE_STATUSES: LogisticStatus[] = [
  "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "PARTIALLY_RECEIVED",
];

export default function OrdineDettaglioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => { api.purchaseOrders.get(id).then(setPo).catch(() => setError("Ordine non trovato")); }, [id]);
  useEffect(() => { load(); }, [load]);

  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [showReceiptForm, setShowReceiptForm] = useState(false);

  const loadReceipts = useCallback(() => {
    api.purchaseOrders.goodsReceipts.list(id).then(setReceipts).catch(() => {});
  }, [id]);
  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  const handleTransition = async (toStatus: LogisticStatus) => {
    setTransitioning(true);
    setError(null);
    try {
      await api.purchaseOrders.transition(id, toStatus);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la transizione di stato");
    } finally {
      setTransitioning(false);
    }
  };

  const handleDelete = async () => {
    if (!po || deleteConfirmInput !== po.poNumber) return;
    setDeleting(true);
    setError(null);
    try {
      await api.purchaseOrders.delete(id);
      router.push("/acquisti/ordini");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
      setDeleting(false);
    }
  };

  if (error && !po) {
    return <div className="min-h-screen bg-[#f5f6fa] flex items-center justify-center text-slate-500 text-sm">{error}</div>;
  }
  if (!po) return null;

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-6xl mx-auto px-4 md:px-6 py-5 space-y-4">

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 font-mono">{po.poNumber}</h1>
                {po.logisticStatus !== "CANCELLED" && (
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                    {STATUS_LABEL[po.logisticStatus]}
                  </span>
                )}
              </div>
              <OrderStatusStepper logisticStatus={po.logisticStatus} />
              {error && (
                <div className="mt-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="flex flex-col lg:flex-row gap-4 items-start">
              <div className="flex-1 min-w-0 w-full space-y-4">

                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <h2 className="text-sm font-bold text-slate-900 px-4 py-3 border-b border-slate-200">Righe</h2>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2.5">Descrizione</th><th className="px-3 py-2.5">Ordinata</th>
                        <th className="px-3 py-2.5">Ricevuta</th><th className="px-3 py-2.5">Residua</th>
                        <th className="px-3 py-2.5">Prezzo unit.</th><th className="px-3 py-2.5">Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map(l => (
                        <tr key={l.id} className="border-b border-slate-100 text-slate-700">
                          <td className="px-3 py-2.5">{l.description}</td>
                          <td className="px-3 py-2.5">{l.orderedQty}</td>
                          <td className="px-3 py-2.5">{l.receivedQty}</td>
                          <td className="px-3 py-2.5">{l.remainingQty}</td>
                          <td className="px-3 py-2.5">€ {l.unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-2.5">€ {l.totalAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {po.lines.some(l => l.remainingQty > 0) && RECEIVABLE_STATUSES.includes(po.logisticStatus) && (
                  <div className="space-y-2">
                    {!showReceiptForm ? (
                      <button onClick={() => setShowReceiptForm(true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors">
                        + Registra DDT
                      </button>
                    ) : (
                      <GoodsReceiptForm
                        purchaseOrderId={id}
                        lines={po.lines.filter(l => l.remainingQty > 0)}
                        onDone={() => { setShowReceiptForm(false); load(); loadReceipts(); }}
                        onCancel={() => setShowReceiptForm(false)}
                      />
                    )}
                  </div>
                )}

                <GoodsReceiptsList receipts={receipts} />

              </div>

              <div className="w-full lg:w-72 shrink-0 space-y-4">

                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-xs shadow-sm">
                  <div><div className="text-slate-500">Fornitore</div><div className="text-slate-700">{po.supplier?.legalName}</div></div>
                  <div><div className="text-slate-500">Magazzino</div><div className="text-slate-700">{po.warehouse?.name}</div></div>
                  <div><div className="text-slate-500">Data ordine</div><div className="text-slate-700">{new Date(po.orderDate).toLocaleDateString("it-IT")}</div></div>
                  <div><div className="text-slate-500">Valuta</div><div className="text-slate-700">{po.currency}</div></div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                  <h2 className="text-sm font-bold text-slate-900">Azioni di stato</h2>
                  <div className="flex flex-col gap-2 items-stretch">
                    {NEXT_STATUSES[po.logisticStatus].map(next => (
                      <button
                        key={next}
                        disabled={transitioning}
                        onClick={() => handleTransition(next)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors text-center"
                      >
                        → {STATUS_LABEL[next]}
                      </button>
                    ))}
                    {NEXT_STATUSES[po.logisticStatus].length === 0 && <span className="text-xs text-slate-400">Nessuna transizione disponibile da questo stato</span>}
                  </div>
                </div>

                <details className="rounded-xl border border-slate-200 bg-white p-5 group shadow-sm">
                  <summary className="text-sm font-bold text-slate-900 cursor-pointer list-none flex items-center justify-between">
                    Storico stato
                    <span className="text-slate-400 text-xs transition-transform group-open:rotate-180">⌄</span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {po.statusHistory.length === 0 && <div className="text-xs text-slate-400">Nessuna transizione registrata</div>}
                    {po.statusHistory.map(h => (
                      <div key={h.id} className="text-xs text-slate-500">
                        {new Date(h.changedAt).toLocaleString("it-IT")} — {STATUS_LABEL[h.fromStatus]} → {STATUS_LABEL[h.toStatus]}
                        {h.note ? ` (${h.note})` : ""}
                      </div>
                    ))}
                  </div>
                </details>

                <div className="rounded-xl border border-rose-200 bg-white p-5 space-y-3 shadow-sm">
                  <h2 className="text-sm font-bold text-rose-700">Zona pericolosa</h2>
                  <p className="text-xs text-slate-500">
                    Elimina definitivamente questo ordine, incluse le righe, lo storico stato e tutti i DDT registrati. Operazione irreversibile — per un ordine reale usa "Annulla" invece, che conserva lo storico.
                  </p>
                  {!showDeleteConfirm ? (
                    <button onClick={() => setShowDeleteConfirm(true)}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium hover:bg-rose-100 transition-colors">
                      Elimina definitivamente
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-500">
                        Digita <span className="font-mono text-slate-700">{po.poNumber}</span> per confermare:
                      </label>
                      <input
                        value={deleteConfirmInput}
                        onChange={(e) => setDeleteConfirmInput(e.target.value)}
                        className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-slate-700 text-xs font-mono focus:outline-none focus:border-emerald-400"
                        placeholder={po.poNumber}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleDelete}
                          disabled={deleting || deleteConfirmInput !== po.poNumber}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium hover:bg-rose-100 disabled:opacity-40 transition-colors"
                        >
                          Conferma eliminazione
                        </button>
                        <button
                          onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput(""); }}
                          disabled={deleting}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 transition-colors"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}
