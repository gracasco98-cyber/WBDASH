"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { PaymentTerm } from "@/lib/api/purchasing";

export default function CondizioniPagamentoTab() {
  const [rows, setRows] = useState<PaymentTerm[]>([]);
  useEffect(() => { api.purchasing.paymentTerms.list().then(setRows).catch(() => {}); }, []);
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-bg-border">
        <span className="text-xs text-zinc-500">{rows.length} condizioni di pagamento</span>
        <Link
          href="/acquisti/condizioni-pagamento/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
        >
          <Plus size={13} /> Nuova condizione
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Metodo</th>
            <th className="px-3 py-2.5">Rate</th><th className="px-3 py-2.5">Utilizzo</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const used = r._count.suppliers > 0 || r._count.purchaseOrders > 0;
            return (
              <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                <td className="px-3 py-2.5">
                  <Link href={`/acquisti/condizioni-pagamento/${r.id}`} className="text-accent-primary hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2.5">{r.paymentMethod}</td>
                <td className="px-3 py-2.5">{r.installments.map(i => `${i.offsetDays}gg ${i.percentage}%`).join(" / ")}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${used ? "bg-accent-blue/15 text-accent-blue" : "bg-zinc-800 text-zinc-500"}`}>
                    {used ? `${r._count.suppliers} fornitori · ${r._count.purchaseOrders} ordini` : "Non ancora usata"}
                  </span>
                </td>
                <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessuna condizione di pagamento — inizia creandone una</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
