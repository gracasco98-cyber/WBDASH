"use client";
import Link from "next/link";
import { formatEUR } from "@/lib/marketplaces";
import type { RecentOrderEntry } from "@/lib/api/acquisti-dashboard";
import type { LogisticStatus } from "@/lib/api/purchase-orders";

const STATUS_LABEL: Record<LogisticStatus, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito",
  PARTIALLY_RECEIVED: "Parz. ricevuto", RECEIVED: "Ricevuto", COMPLETED: "Completato", CANCELLED: "Annullato",
};

interface Props { orders: RecentOrderEntry[] }

export default function RecentOrdersTable({ orders }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <h2 className="text-sm font-bold text-slate-900 px-4 py-3 border-b border-slate-200">Ultimi ordini</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200">
            <th className="px-3 py-2.5">Numero</th><th className="px-3 py-2.5">Fornitore</th>
            <th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Stato</th><th className="px-3 py-2.5">Totale</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/30">
              <td className="px-3 py-2.5">
                <Link href={`/acquisti/ordini/${o.id}`} className="font-mono text-emerald-700 hover:underline">{o.poNumber}</Link>
              </td>
              <td className="px-3 py-2.5">{o.supplierName}</td>
              <td className="px-3 py-2.5">{new Date(o.orderDate).toLocaleDateString("it-IT")}</td>
              <td className="px-3 py-2.5">{STATUS_LABEL[o.logisticStatus]}</td>
              <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-900">{formatEUR(o.totalValue)}</td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-8">Nessun ordine ancora</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
