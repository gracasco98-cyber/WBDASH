"use client";
import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { Warehouse, PaymentTerm, BankAccount } from "@/lib/api/purchasing";
import FornitoriTab from "@/components/purchasing/FornitoriTab";

type Tab = "banche" | "magazzini" | "condizioni-pagamento" | "fornitori";
const COMING_SOON = ["Clienti", "Categorie contabili", "Trasportatori"];

function BancheTab() {
  const [rows, setRows] = useState<BankAccount[]>([]);
  const load = useCallback(() => { api.purchasing.bankAccounts.list().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
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
            <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300">
              <td className="px-3 py-2.5">{r.alias}</td>
              <td className="px-3 py-2.5">{r.bankName}</td>
              <td className="px-3 py-2.5 font-mono">{r.iban}</td>
              <td className="px-3 py-2.5 tabular-nums">€ {r.openingBalance.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun conto banca</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function MagazziniTab() {
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

function CondizioniPagamentoTab() {
  const [rows, setRows] = useState<PaymentTerm[]>([]);
  useEffect(() => { api.purchasing.paymentTerms.list().then(setRows).catch(() => {}); }, []);
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Metodo</th>
            <th className="px-3 py-2.5">Rate</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300">
              <td className="px-3 py-2.5">{r.name}</td>
              <td className="px-3 py-2.5">{r.paymentMethod}</td>
              <td className="px-3 py-2.5">{r.installments.map(i => `${i.offsetDays}gg ${i.percentage}%`).join(" / ")}</td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="text-center text-zinc-600 py-8">Nessuna condizione di pagamento</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function AnagraficheePage() {
  const [tab, setTab] = useState<Tab>("banche");
  const TABS: { id: Tab; label: string }[] = [
    { id: "banche", label: "Banche" },
    { id: "magazzini", label: "Magazzini" },
    { id: "condizioni-pagamento", label: "Condizioni di pagamento" },
    { id: "fornitori", label: "Fornitori" },
  ];

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Anagrafiche</h1>
            <div className="flex flex-wrap items-center gap-2 border-b border-bg-border pb-2">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    tab === t.id ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              {COMING_SOON.map(label => (
                <button
                  key={label}
                  disabled
                  title="Prossimamente"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 border border-bg-border cursor-not-allowed flex items-center gap-1.5"
                >
                  {label}
                  <span className="text-[9px] uppercase tracking-wide text-zinc-700 border border-zinc-800 rounded px-1 py-0.5 shrink-0">Prossimamente</span>
                </button>
              ))}
            </div>
            {tab === "banche" && <BancheTab />}
            {tab === "magazzini" && <MagazziniTab />}
            {tab === "condizioni-pagamento" && <CondizioniPagamentoTab />}
            {tab === "fornitori" && <FornitoriTab />}
          </main>
        </div>
      </div>
    </div>
  );
}
