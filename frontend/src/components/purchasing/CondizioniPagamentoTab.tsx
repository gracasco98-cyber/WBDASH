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
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200">
        <span className="text-xs text-slate-500">{rows.length} condizioni di pagamento</span>
        <Link
          href="/acquisti/condizioni-pagamento/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
        >
          <Plus size={13} /> Nuova condizione
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200">
            <th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Metodo</th>
            <th className="px-3 py-2.5">Rate</th><th className="px-3 py-2.5">Utilizzo</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const used = r._count.suppliers > 0 || r._count.purchaseOrders > 0;
            return (
              <tr key={r.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/30">
                <td className="px-3 py-2.5">
                  <Link href={`/acquisti/condizioni-pagamento/${r.id}`} className="text-emerald-700 hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2.5">{r.paymentMethod}</td>
                <td className="px-3 py-2.5">{r.installments.map(i => `${i.offsetDays}gg ${i.percentage}%`).join(" / ")}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${used ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    {used ? `${r._count.suppliers} fornitori · ${r._count.purchaseOrders} ordini` : "Non ancora usata"}
                  </span>
                </td>
                <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-8">Nessuna condizione di pagamento — inizia creandone una</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
