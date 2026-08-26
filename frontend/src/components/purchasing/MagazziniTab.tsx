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
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-bg-border">
        <span className="text-xs text-zinc-500">{rows.length} magazzini</span>
        <Link
          href="/acquisti/magazzini/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
        >
          <Plus size={13} /> Nuovo magazzino
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Codice</th><th className="px-3 py-2.5">Nome</th>
            <th className="px-3 py-2.5">Indirizzo</th><th className="px-3 py-2.5">Utilizzo</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
              <td className="px-3 py-2.5 font-mono">
                <Link href={`/acquisti/magazzini/${r.id}`} className="text-accent-primary hover:underline">{r.code}</Link>
              </td>
              <td className="px-3 py-2.5">{r.name}</td>
              <td className="px-3 py-2.5 text-zinc-500">{r.address ?? "—"}</td>
              <td className="px-3 py-2.5">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${r._count.purchaseOrders > 0 ? "bg-accent-blue/15 text-accent-blue" : "bg-zinc-800 text-zinc-500"}`}>
                  {r._count.purchaseOrders > 0 ? `${r._count.purchaseOrders} ordini` : "Non ancora usato"}
                </span>
              </td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun magazzino — inizia creandone uno</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
