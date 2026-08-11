"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { PurchaseOrder, LogisticStatus } from "@/lib/api/purchase-orders";

const STATUS_LABEL: Record<LogisticStatus, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito",
  PARTIALLY_RECEIVED: "Parz. ricevuto", RECEIVED: "Ricevuto", COMPLETED: "Completato", CANCELLED: "Annullato",
};

export default function OrdiniFornitorePage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(() => {
    api.purchaseOrders.list(statusFilter ? { logisticStatus: statusFilter } : undefined).then(setRows).catch(() => {});
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-5xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg sm:text-xl font-bold text-white">Ordini Fornitore</h1>
              <Link
                href="/acquisti/ordini/nuovo"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
              >
                <Plus size={13} /> Nuovo Ordine
              </Link>
            </div>

            <select
              className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">Tutti gli stati</option>
              {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>

            <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
                    <th className="px-3 py-2.5">Numero</th><th className="px-3 py-2.5">Fornitore</th>
                    <th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Magazzino</th>
                    <th className="px-3 py-2.5">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                      <td className="px-3 py-2.5">
                        <Link href={`/acquisti/ordini/${r.id}`} className="font-mono text-accent-primary hover:underline">{r.poNumber}</Link>
                      </td>
                      <td className="px-3 py-2.5">{r.supplier?.legalName ?? "—"}</td>
                      <td className="px-3 py-2.5">{new Date(r.orderDate).toLocaleDateString("it-IT")}</td>
                      <td className="px-3 py-2.5">{r.warehouse?.name ?? "—"}</td>
                      <td className="px-3 py-2.5">{STATUS_LABEL[r.logisticStatus]}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun ordine — inizia creandone uno</td></tr>}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
