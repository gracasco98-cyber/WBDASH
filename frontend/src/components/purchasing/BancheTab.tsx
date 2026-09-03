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
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200">
        <span className="text-xs text-slate-500">{rows.length} conti</span>
        <Link
          href="/acquisti/banche/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
        >
          <Plus size={13} /> Nuovo conto
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200">
            <th className="px-3 py-2.5">Alias</th><th className="px-3 py-2.5">Banca</th>
            <th className="px-3 py-2.5">IBAN</th><th className="px-3 py-2.5">Saldo iniziale</th>
            <th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/30">
              <td className="px-3 py-2.5">
                <Link href={`/acquisti/banche/${r.id}`} className="text-emerald-700 hover:underline">{r.alias}</Link>
              </td>
              <td className="px-3 py-2.5">{r.bankName}</td>
              <td className="px-3 py-2.5 font-mono">{r.iban}</td>
              <td className="px-3 py-2.5 tabular-nums">€ {r.openingBalance.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-8">Nessun conto banca — inizia creandone uno</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
