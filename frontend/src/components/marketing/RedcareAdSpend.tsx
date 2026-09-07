"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, RefreshCw, Save, Trash2 } from "lucide-react";
import { marketingRedcare, type MarketplaceAdSpendEntry } from "@/lib/api/marketing-redcare";
import { fmtEur } from "@/lib/fmt";

type RedcareMarketplace = "REDCARE_IT" | "REDCARE_DE";

function italyToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export default function RedcareAdSpend() {
  const [entries, setEntries] = useState<MarketplaceAdSpendEntry[]>([]);
  const [spendDate, setSpendDate] = useState(italyToday);
  const [marketplace, setMarketplace] = useState<RedcareMarketplace>("REDCARE_IT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await marketingRedcare.listAdSpend();
      setEntries(result.entries);
    } catch {
      setError("Impossibile caricare la spesa Ads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.amount, 0), [entries]);

  async function save() {
    const numericAmount = Number(amount.replace(",", "."));
    if (!spendDate || !Number.isFinite(numericAmount) || numericAmount < 0) {
      setError("Inserisci una data e un importo valido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await marketingRedcare.saveAdSpend({ spendDate, marketplace, amount: numericAmount, note });
      setAmount("");
      setNote("");
      await load();
    } catch {
      setError("Salvataggio non riuscito. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry: MarketplaceAdSpendEntry) {
    if (!window.confirm(`Eliminare la spesa Ads del ${entry.spendDate}?`)) return;
    try {
      await marketingRedcare.deleteAdSpend(entry.id);
      await load();
    } catch {
      setError("Eliminazione non riuscita.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-bg-border bg-bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone size={16} className="text-purple-400" />
          <h2 className="text-sm font-semibold text-white">Aggiungi spesa giornaliera SA-Tech</h2>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Se la stessa data e lo stesso marketplace esistono già, l’importo viene aggiornato. Il costo entra subito in Ads, netto e margine della dashboard.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[150px_170px_150px_1fr_auto] gap-3 items-end">
          <label className="space-y-1">
            <span className="text-[11px] text-zinc-500">Data</span>
            <input type="date" value={spendDate} onChange={(e) => setSpendDate(e.target.value)} className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-zinc-200" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-zinc-500">Marketplace</span>
            <select value={marketplace} onChange={(e) => setMarketplace(e.target.value as RedcareMarketplace)} className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-zinc-200">
              <option value="REDCARE_IT">Redcare Italia</option>
              <option value="REDCARE_DE">Redcare Germania</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-zinc-500">Spesa Ads (€)</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-zinc-200" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-zinc-500">Nota (facoltativa)</span>
            <input placeholder="Es. report SA-Tech" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-zinc-200" />
          </label>
          <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-300 hover:bg-purple-500/20 disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Salva
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Spesa Ads giorno per giorno</h2>
            <p className="text-[11px] text-zinc-500">Ultimi tre mesi · totale {fmtEur(total)}</p>
          </div>
          <button onClick={load} className="p-2 text-zinc-500 hover:text-white" aria-label="Aggiorna"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg-base/40 text-[11px] uppercase text-zinc-500">
              <tr><th className="px-4 py-2.5 text-left">Data</th><th className="px-4 py-2.5 text-left">Marketplace</th><th className="px-4 py-2.5 text-right">Ads</th><th className="px-4 py-2.5 text-left">Nota</th><th className="w-12" /></tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {!loading && entries.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-600">Nessuna spesa Ads registrata.</td></tr>}
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-bg-base/20">
                  <td className="px-4 py-3 font-mono text-zinc-300">{new Date(`${entry.spendDate}T00:00:00`).toLocaleDateString("it-IT")}</td>
                  <td className="px-4 py-3 text-zinc-400">{entry.marketplace === "REDCARE_IT" ? "🇮🇹 Redcare IT" : "🇩🇪 Redcare DE"}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-purple-400">{fmtEur(entry.amount)}</td>
                  <td className="px-4 py-3 text-zinc-500">{entry.note || "—"}</td>
                  <td className="px-2 py-3"><button onClick={() => remove(entry)} className="p-1.5 text-zinc-600 hover:text-red-400" aria-label="Elimina"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
