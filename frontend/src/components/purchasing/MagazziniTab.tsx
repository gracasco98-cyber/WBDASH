"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Warehouse } from "@/lib/api/purchasing";

export default function MagazziniTab() {
  const [rows, setRows] = useState<Warehouse[]>([]);
  useEffect(() => { api.purchasing.warehouses.list().then(setRows).catch(() => {}); }, []);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200">
        <span className="text-xs text-slate-500">{rows.length} magazzini</span>
        <Link
          href="/acquisti/magazzini/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
        >
          <Plus size={13} /> Nuovo magazzino
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200">
            <th className="px-3 py-2.5">Codice</th><th className="px-3 py-2.5">Nome</th>
            <th className="px-3 py-2.5">Indirizzo</th><th className="px-3 py-2.5">Utilizzo</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/30">
              <td className="px-3 py-2.5 font-mono">
                <Link href={`/acquisti/magazzini/${r.id}`} className="text-emerald-700 hover:underline">{r.code}</Link>
              </td>
              <td className="px-3 py-2.5">{r.name}</td>
              <td className="px-3 py-2.5 text-slate-500">{r.address ?? "—"}</td>
              <td className="px-3 py-2.5">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${r._count.purchaseOrders > 0 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                  {r._count.purchaseOrders > 0 ? `${r._count.purchaseOrders} ordini` : "Non ancora usato"}
                </span>
              </td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-8">Nessun magazzino — inizia creandone uno</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
