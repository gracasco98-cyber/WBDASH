"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { Warehouse } from "@/lib/api/purchasing";

export default function MagazziniTab() {
  const [rows, setRows] = useState<Warehouse[]>([]);
  useEffect(() => { api.purchasing.warehouses.list().then(setRows).catch(() => {}); }, []);
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Codice</th><th className="px-3 py-2.5">Nome</th>
            <th className="px-3 py-2.5">Indirizzo</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300">
              <td className="px-3 py-2.5 font-mono">{r.code}</td>
              <td className="px-3 py-2.5">{r.name}</td>
              <td className="px-3 py-2.5 text-zinc-500">{r.address ?? "—"}</td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="text-center text-zinc-600 py-8">Nessun magazzino</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
