"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/api/suppliers";

export default function FornitoriTab() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const load = useCallback(() => { api.suppliers.list().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-bg-border">
        <span className="text-xs text-zinc-500">{rows.length} fornitori</span>
        <Link
          href="/acquisti/fornitori/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
        >
          <Plus size={13} /> Nuovo Fornitore
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Codice</th><th className="px-3 py-2.5">Ragione sociale</th>
            <th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Paese</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
              <td className="px-3 py-2.5">
                <Link href={`/acquisti/fornitori/${r.id}`} className="font-mono text-accent-primary hover:underline">{r.internalCode}</Link>
              </td>
              <td className="px-3 py-2.5">{r.legalName}</td>
              <td className="px-3 py-2.5">{r.supplierType}</td>
              <td className="px-3 py-2.5">{r.country}</td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun fornitore — inizia creandone uno</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
