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
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <h2 className="text-sm font-semibold text-white px-4 py-3 border-b border-bg-border">Ultimi ordini</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Numero</th><th className="px-3 py-2.5">Fornitore</th>
            <th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Stato</th><th className="px-3 py-2.5">Totale</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
              <td className="px-3 py-2.5">
                <Link href={`/acquisti/ordini/${o.id}`} className="font-mono text-accent-primary hover:underline">{o.poNumber}</Link>
              </td>
              <td className="px-3 py-2.5">{o.supplierName}</td>
              <td className="px-3 py-2.5">{new Date(o.orderDate).toLocaleDateString("it-IT")}</td>
              <td className="px-3 py-2.5">{STATUS_LABEL[o.logisticStatus]}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatEUR(o.totalValue)}</td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun ordine ancora</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
