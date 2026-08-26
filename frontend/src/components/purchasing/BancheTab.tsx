"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { BankAccount } from "@/lib/api/purchasing";

export default function BancheTab() {
  const [rows, setRows] = useState<BankAccount[]>([]);
  const load = useCallback(() => { api.purchasing.bankAccounts.list().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-bg-border">
        <span className="text-xs text-zinc-500">{rows.length} conti</span>
        <Link
          href="/acquisti/banche/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
        >
          <Plus size={13} /> Nuovo conto
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Alias</th><th className="px-3 py-2.5">Banca</th>
            <th className="px-3 py-2.5">IBAN</th><th className="px-3 py-2.5">Saldo iniziale</th>
            <th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
              <td className="px-3 py-2.5">
                <Link href={`/acquisti/banche/${r.id}`} className="text-accent-primary hover:underline">{r.alias}</Link>
              </td>
              <td className="px-3 py-2.5">{r.bankName}</td>
              <td className="px-3 py-2.5 font-mono">{r.iban}</td>
              <td className="px-3 py-2.5 tabular-nums">€ {r.openingBalance.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun conto banca — inizia creandone uno</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
