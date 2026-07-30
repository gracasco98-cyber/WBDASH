"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, AmazonCogs, AmazonCogsPriceEntry } from "@/lib/api";
import {
  Search, RefreshCw, Package, DollarSign, Info, Plus,
  ChevronDown, Edit2, Trash2, TrendingUp, TrendingDown,
  Minus, Check, X, Truck, Building2, Globe,
} from "lucide-react";
import { fmtEur } from "@/lib/fmt";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────

const MP_FLAGS: Record<string, string> = {
  IT: "🇮🇹", DE: "🇩🇪", FR: "🇫🇷", ES: "🇪🇸",
  UK: "🇬🇧", NL: "🇳🇱", PL: "🇵🇱", SE: "🇸🇪",
  BE: "🇧🇪", ALL: "🌍",
};

const MP_LABEL: Record<string, string> = {
  IT: "Italia", DE: "Germania", FR: "Francia", ES: "Spagna",
  UK: "UK", NL: "Olanda", PL: "Polonia", SE: "Svezia",
  BE: "Belgio", ALL: "Tutti",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AsinGroup {
  asin: string;
  sku: string | null;
  productTitle: string | null;
  imageUrl: string | null;
  rows: AmazonCogs[];
  entries: AmazonCogsPriceEntry[];
  avgCogs: number;
  minCogs: number;
  maxCogs: number;
  marketplaces: string[];
  lastUpdated: Date;
  latestEntryPrice: number | null;
  priceChange: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fuzzyMatch(text: string | null | undefined, query: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (t.includes(q)) return true;
  return q.split(" ").filter(Boolean).every(w => t.includes(w));
}

function buildGroups(cogs: AmazonCogs[], entries: AmazonCogsPriceEntry[]): AsinGroup[] {
  const byAsin = new Map<string, AmazonCogs[]>();
  for (const c of cogs) {
    const arr = byAsin.get(c.asin) ?? [];
    arr.push(c);
    byAsin.set(c.asin, arr);
  }
  const entriesByAsin = new Map<string, AmazonCogsPriceEntry[]>();
  for (const e of entries) {
    const arr = entriesByAsin.get(e.asin) ?? [];
    arr.push(e);
    entriesByAsin.set(e.asin, arr);
  }

  return Array.from(byAsin.entries()).map(([asin, rows]) => {
    const imageUrl = rows.find(r => r.imageUrl)?.imageUrl ?? null;
    const productTitle = rows
      .map(r => r.productTitle).filter((t): t is string => !!t)
      .sort((a, b) => b.length - a.length)[0] ?? null;
    const sku = rows.find(r => r.sku)?.sku ?? null;
    const cogsValues = rows.map(r => r.cogsPerUnit).filter(v => v > 0);
    const avgCogs = cogsValues.length > 0 ? cogsValues.reduce((s, v) => s + v, 0) / cogsValues.length : 0;
    const minCogs = cogsValues.length > 0 ? Math.min(...cogsValues) : 0;
    const maxCogs = cogsValues.length > 0 ? Math.max(...cogsValues) : 0;
    const marketplaces = rows.map(r => r.marketplace).sort();
    const lastUpdated = new Date(Math.max(...rows.map(r => new Date(r.updatedAt).getTime())));
    const asinEntries = (entriesByAsin.get(asin) ?? []).sort(
      (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
    );
    const latestEntryPrice = asinEntries[0]?.pricePerUnit ?? null;
    const priceChange = asinEntries.length >= 2
      ? asinEntries[0].pricePerUnit - asinEntries[1].pricePerUnit : 0;

    return { asin, sku, productTitle, imageUrl, rows, entries: asinEntries, avgCogs, minCogs, maxCogs, marketplaces, lastUpdated, latestEntryPrice, priceChange };
  }).sort((a, b) => {
    if (a.entries.length > 0 && b.entries.length === 0) return -1;
    if (a.entries.length === 0 && b.entries.length > 0) return 1;
    return b.avgCogs - a.avgCogs;
  });
}

// ─── Product Image ────────────────────────────────────────────────────────────

function ProductImage({ url, title }: { url: string | null; title: string | null }) {
  const [err, setErr] = useState(false);
  if (!url || err) {
    return (
      <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0">
        <Package size={16} className="text-zinc-600" />
      </div>
    );
  }
  return (
    <img src={url} alt={title ?? ""} onError={() => setErr(true)}
      className="w-12 h-12 rounded-xl object-contain bg-zinc-800 border border-zinc-700/60 shrink-0" />
  );
}

// ─── Price Chart ──────────────────────────────────────────────────────────────

function PriceChart({ entries }: { entries: AmazonCogsPriceEntry[] }) {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
  );
  const data = sorted.map(e => ({
    date: new Date(e.purchaseDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }),
    price: e.pricePerUnit,
    total: e.pricePerUnit + e.shippingCost,
  }));
  const minP = Math.min(...data.map(d => d.price)) * 0.92;
  const maxP = Math.max(...data.map(d => d.price)) * 1.08;

  return (
    <div>
      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Andamento prezzo acquisto</p>
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis domain={[minP, maxP]} tick={{ fill: "#52525b", fontSize: 10 }} tickLine={false} axisLine={false}
            tickFormatter={v => `€${v.toFixed(2)}`} width={52} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number, name: string) => [fmtEur(v), name === "price" ? "Prezzo acquisto" : "Totale con spediz."]}
          />
          <Line type="monotone" dataKey="price" stroke="#60a5fa" strokeWidth={2}
            dot={{ r: 4, fill: "#60a5fa", strokeWidth: 0 }} activeDot={{ r: 6 }} />
          {data.some(d => d.total !== d.price) && (
            <Line type="monotone" dataKey="total" stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Entry Form ───────────────────────────────────────────────────────────────

function EntryForm({ asin, sku, productTitle, imageUrl, marketplace, initial, onSave, onCancel }: {
  asin: string; sku?: string | null; productTitle?: string | null; imageUrl?: string | null; marketplace: string;
  initial?: Partial<AmazonCogsPriceEntry>; onSave: (data: Partial<AmazonCogsPriceEntry>) => Promise<void>; onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    supplier: initial?.supplier ?? "",
    purchaseDate: initial?.purchaseDate ? initial.purchaseDate.slice(0, 10) : today,
    pricePerUnit: initial?.pricePerUnit ?? 0,
    shippingCost: initial?.shippingCost ?? 0,
    quantity: initial?.quantity ?? ("" as number | ""),
    notes: initial?.notes ?? "",
    currency: initial?.currency ?? "EUR",
    marketplace: initial?.marketplace ?? marketplace,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.pricePerUnit || !form.purchaseDate) return;
    setSaving(true);
    try {
      await onSave({ ...initial, asin, sku: sku ?? null, productTitle: productTitle ?? null, imageUrl: imageUrl ?? null,
        marketplace: form.marketplace, supplier: form.supplier || null, purchaseDate: form.purchaseDate,
        pricePerUnit: Number(form.pricePerUnit), shippingCost: Number(form.shippingCost),
        quantity: form.quantity !== "" ? Number(form.quantity) : null, notes: form.notes || null, currency: form.currency });
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 rounded-full bg-blue-400" />
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
          {initial?.id ? "Modifica acquisto" : "Registra nuovo acquisto"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Data *</span>
          <input type="date" value={form.purchaseDate} onChange={e => set("purchaseDate", e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Fornitore</span>
          <input type="text" placeholder="es. VALEO" value={form.supplier} onChange={e => set("supplier", e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder-zinc-700" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Prezzo/unità *</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
            <input type="number" step="0.0001" min="0" value={form.pricePerUnit} onChange={e => set("pricePerUnit", e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg pl-7 pr-3 py-2 w-full focus:outline-none focus:border-blue-500" />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Spediz. inbound/un.</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
            <input type="number" step="0.0001" min="0" value={form.shippingCost} onChange={e => set("shippingCost", e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg pl-7 pr-3 py-2 w-full focus:outline-none focus:border-blue-500" />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Quantità ordinata</span>
          <input type="number" min="1" placeholder="es. 500" value={form.quantity} onChange={e => set("quantity", e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder-zinc-700" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Marketplace</span>
          <select value={form.marketplace} onChange={e => set("marketplace", e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
            {["ALL","IT","DE","FR","ES","UK","NL","PL","SE","BE"].map(m => (
              <option key={m} value={m}>{MP_FLAGS[m] ?? "🌐"} {MP_LABEL[m] ?? m}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Note</span>
          <input type="text" placeholder="es. lotto #301, qualità A..." value={form.notes} onChange={e => set("notes", e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder-zinc-700" />
        </label>
      </div>
      <div className="bg-zinc-800/40 rounded-lg px-4 py-3 flex flex-wrap items-center gap-6 text-xs">
        <span className="text-zinc-500">Prezzo: <span className="text-white font-mono font-semibold">{fmtEur(Number(form.pricePerUnit) || 0)}</span></span>
        <span className="text-zinc-500">Spediz.: <span className="text-zinc-300 font-mono">{fmtEur(Number(form.shippingCost) || 0)}</span></span>
        <span className="text-blue-400 font-semibold">Totale/unità: {fmtEur((Number(form.pricePerUnit) || 0) + (Number(form.shippingCost) || 0))}</span>
        {form.quantity && <span className="text-zinc-500">Valore ordine: <span className="text-zinc-300 font-mono">{fmtEur(((Number(form.pricePerUnit)||0)+(Number(form.shippingCost)||0))*Number(form.quantity))}</span></span>}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-zinc-800">
          <X size={12} /> Annulla
        </button>
        <button onClick={submit} disabled={saving || !form.pricePerUnit || !form.purchaseDate}
          className="flex items-center gap-1.5 px-4 py-2 text-xs bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-40">
          <Check size={12} /> {saving ? "Salvataggio..." : "Salva acquisto"}
        </button>
      </div>
    </div>
  );
}

// ─── Expanded Panel ───────────────────────────────────────────────────────────

function AsinPanel({ group, onRefresh, onEditCogs }: {
  group: AsinGroup; onRefresh: () => void; onEditCogs: (row: AmazonCogs) => void;
}) {
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editEntry, setEditEntry] = useState<AmazonCogsPriceEntry | null>(null);

  const sortedEntries = [...group.entries].sort(
    (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
  );

  async function handleSaveEntry(data: Partial<AmazonCogsPriceEntry>) {
    await api.amazon.saveCogsPriceEntry(data);
    setShowEntryForm(false); setEditEntry(null); onRefresh();
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm("Eliminare questo acquisto?")) return;
    await api.amazon.deleteCogsPriceEntry(id); onRefresh();
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/60 px-6 py-5 space-y-6">

      {/* Marketplace COGS */}
      <div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">
          COGS per marketplace · {group.rows.length} configurazioni
        </p>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-black/30 border-b border-zinc-800">
                {["Marketplace", "Costo/unità", "Spediz.", "Totale/unità", "IVA", "SKU", "Note", ""].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-zinc-600 font-medium uppercase tracking-wide first:pl-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {group.rows.map(row => {
                const total = row.cogsPerUnit + (row.shippingCost ?? 0);
                return (
                  <tr key={row.id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-3 py-2.5 pl-4">
                      <span className="flex items-center gap-2">
                        <span className="text-base">{MP_FLAGS[row.marketplace] ?? "🌐"}</span>
                        <span className="text-zinc-200 font-medium">{MP_LABEL[row.marketplace] ?? row.marketplace}</span>
                        <span className="text-zinc-700 text-[10px] font-mono">{row.marketplace}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-white tabular-nums">{fmtEur(row.cogsPerUnit)}</td>
                    <td className="px-3 py-2.5 font-mono text-zinc-400 tabular-nums">
                      {(row.shippingCost ?? 0) > 0 ? fmtEur(row.shippingCost ?? 0) : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-400 tabular-nums">{fmtEur(total)}</td>
                    <td className="px-3 py-2.5 text-zinc-500">{row.vatRate ? `${row.vatRate}%` : <span className="text-zinc-700">—</span>}</td>
                    <td className="px-3 py-2.5 font-mono text-zinc-600 text-[10px]">{row.sku ?? <span className="text-zinc-800">—</span>}</td>
                    <td className="px-3 py-2.5 text-zinc-600 max-w-[140px] truncate">{row.notes ?? ""}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => onEditCogs(row)}
                        className="p-1.5 rounded hover:bg-zinc-700 text-zinc-600 hover:text-blue-400 transition-colors">
                        <Edit2 size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price chart */}
      {group.entries.length >= 2 && <PriceChart entries={group.entries} />}

      {/* Purchase history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
            Storico acquisti · {group.entries.length} registrazioni
          </p>
          <button onClick={() => { setShowEntryForm(true); setEditEntry(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 border border-blue-500/25 text-blue-400 text-xs rounded-lg hover:bg-blue-500/25 transition-colors">
            <Plus size={12} /> Aggiungi acquisto
          </button>
        </div>

        {(showEntryForm || editEntry) && (
          <div className="mb-4">
            <EntryForm
              asin={group.asin} sku={group.sku} productTitle={group.productTitle}
              imageUrl={group.imageUrl} marketplace={group.rows[0]?.marketplace ?? "IT"}
              initial={editEntry ?? undefined}
              onSave={handleSaveEntry}
              onCancel={() => { setShowEntryForm(false); setEditEntry(null); }}
            />
          </div>
        )}

        {sortedEntries.length > 0 ? (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-black/30 border-b border-zinc-800">
                  {["Data", "Fornitore", "MP", "Prezzo/un.", "Spediz.", "Totale", "Qtà", "Note", ""].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-zinc-600 font-medium uppercase tracking-wide first:pl-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {sortedEntries.map((e, idx) => {
                  const isLatest = idx === 0;
                  const prev = sortedEntries[idx + 1];
                  const diff = prev ? e.pricePerUnit - prev.pricePerUnit : 0;
                  return (
                    <tr key={e.id} className={`hover:bg-zinc-800/20 transition-colors ${isLatest ? "bg-blue-500/[0.04]" : ""}`}>
                      <td className="px-3 py-2.5 pl-4">
                        <div className="flex items-center gap-1.5">
                          {isLatest && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold shrink-0">ATTIVO</span>}
                          <span className={isLatest ? "text-zinc-200 font-medium" : "text-zinc-500"}>
                            {new Date(e.purchaseDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {e.supplier
                          ? <span className="flex items-center gap-1 text-zinc-300"><Building2 size={10} className="text-zinc-600" />{e.supplier}</span>
                          : <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span>{MP_FLAGS[e.marketplace] ?? "🌐"} <span className="text-zinc-500">{e.marketplace}</span></span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono font-semibold tabular-nums ${isLatest ? "text-white" : "text-zinc-400"}`}>{fmtEur(e.pricePerUnit)}</span>
                          {diff !== 0 && (
                            <span className={`text-[9px] font-mono flex items-center gap-0.5 ${diff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {diff > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                              {diff > 0 ? "+" : ""}{fmtEur(Math.abs(diff))}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-zinc-500">
                        {e.shippingCost > 0 ? fmtEur(e.shippingCost) : <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-blue-400 tabular-nums">{fmtEur(e.pricePerUnit + e.shippingCost)}</td>
                      <td className="px-3 py-2.5 font-mono text-zinc-500">
                        {e.quantity ? e.quantity.toLocaleString("it-IT") : <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-600 max-w-[120px] truncate">{e.notes ?? ""}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditEntry(e); setShowEntryForm(false); }}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-600 hover:text-blue-400 transition-colors">
                            <Edit2 size={11} />
                          </button>
                          <button onClick={() => handleDeleteEntry(e.id)}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-600 hover:text-red-400 transition-colors">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : !showEntryForm && (
          <div className="flex flex-col items-center gap-2 py-6 text-zinc-700">
            <Package size={24} />
            <span className="text-xs">Nessun acquisto registrato</span>
            <button onClick={() => setShowEntryForm(true)} className="text-xs text-blue-400/70 hover:text-blue-400 transition-colors">
              + Aggiungi il primo acquisto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COGS Edit Drawer ─────────────────────────────────────────────────────────

function CogsEditDrawer({ item, onSave, onClose }: {
  item: AmazonCogs | null; onSave: (data: any) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({ cogsPerUnit: item?.cogsPerUnit ?? 0, shippingCost: item?.shippingCost ?? 0, vatRate: item?.vatRate ?? 0, notes: item?.notes ?? "" });
  if (!item) return null;
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{MP_FLAGS[item.marketplace] ?? "🌐"}</span>
          <div>
            <h2 className="text-base font-bold text-white">COGS — {MP_LABEL[item.marketplace] ?? item.marketplace}</h2>
            <p className="text-xs text-zinc-500 font-mono">{item.asin}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[{ key: "cogsPerUnit", label: "Costo prodotto/unità (€)" }, { key: "shippingCost", label: "Spediz. inbound/unità (€)" }, { key: "vatRate", label: "Aliquota IVA %" }].map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</span>
              <input type="number" step="0.0001" value={(form as any)[key]} onChange={e => set(key, Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Note</span>
            <input type="text" value={form.notes} onChange={e => set("notes", e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
          </label>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5 text-xs text-zinc-500 space-y-0.5">
          <div className="text-zinc-400 font-medium mb-1">Riepilogo</div>
          <div>Prodotto: <span className="text-white font-mono">{fmtEur(form.cogsPerUnit)}</span></div>
          <div>Spedizione: <span className="text-white font-mono">{fmtEur(form.shippingCost)}</span></div>
          <div className="text-blue-400 font-semibold">Totale/unità: {fmtEur(form.cogsPerUnit + form.shippingCost)}</div>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Annulla</button>
          <button onClick={() => onSave({ ...item, ...form })}
            className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm rounded-lg hover:bg-blue-500/30 transition-colors">
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CogsPage() {
  const [cogs,     setCogs]     = useState<AmazonCogs[]>([]);
  const [entries,  setEntries]  = useState<AmazonCogsPriceEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCogs, setEditingCogs] = useState<AmazonCogs | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cogsData, entriesData] = await Promise.all([
        api.amazon.cogs() as Promise<AmazonCogs[]>,
        api.amazon.cogsEntries().catch(() => [] as AmazonCogsPriceEntry[]),
      ]);
      setCogs(cogsData);
      setEntries(entriesData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups  = useMemo(() => buildGroups(cogs, entries), [cogs, entries]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    return groups.filter(g =>
      fuzzyMatch(g.asin, search) || fuzzyMatch(g.sku, search) || fuzzyMatch(g.productTitle, search)
    );
  }, [groups, search]);

  const toggleExpand = (asin: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(asin) ? n.delete(asin) : n.add(asin); return n; });

  async function handleSaveCogs(data: any) {
    await api.amazon.saveCogs(data.asin, data.marketplace ?? "ALL", data.cogsPerUnit, data.notes);
    setEditingCogs(null);
    load();
  }

  const withHistory    = groups.filter(g => g.entries.length > 0).length;
  const withoutHistory = groups.length - withHistory;
  const avgPrice       = groups.filter(g => g.avgCogs > 0).reduce((s, g) => s + g.avgCogs, 0) /
                         Math.max(1, groups.filter(g => g.avgCogs > 0).length) || 0;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Gestione COGS</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Costo del venduto · <span className="text-zinc-400">{groups.length} prodotti unici</span>
            <span className="text-zinc-700"> · {cogs.length} configurazioni marketplace</span>
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Prodotti unici",     value: String(groups.length),  icon: Package,    color: "text-white" },
          { label: "Con storico prezzi", value: String(withHistory),     icon: TrendingUp, color: "text-blue-400" },
          { label: "Senza storico",      value: String(withoutHistory),  icon: DollarSign, color: withoutHistory > 0 ? "text-amber-400" : "text-zinc-600" },
          { label: "COGS medio/unità",   value: fmtEur(avgPrice),        icon: DollarSign, color: "text-emerald-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-bg-card border border-bg-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} className={color} />
              <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Alert */}
      {withoutHistory > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <Info size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm">
            <span className="text-amber-400 font-semibold">{withoutHistory} prodotti</span>
            <span className="text-zinc-400"> senza storico prezzi di acquisto. Clicca su un prodotto per aggiungere i dati.</span>
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">

        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-bg-border">
          <Search size={14} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            placeholder="Cerca per nome prodotto, ASIN o SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-zinc-300 placeholder-zinc-600 outline-none flex-1"
            autoComplete="off"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-zinc-600 hover:text-white transition-colors shrink-0">
              <X size={14} />
            </button>
          )}
          <span className="text-xs text-zinc-600 shrink-0 tabular-nums font-mono">
            {filtered.length}/{groups.length}
          </span>
        </div>

        {/* Column headers */}
        <div className="grid px-4 py-2 text-[10px] text-zinc-600 uppercase tracking-widest border-b border-bg-border/50"
          style={{ gridTemplateColumns: "3.5rem 1fr 8rem 8rem 10rem 5rem 2rem" }}>
          <span />
          <span>Prodotto</span>
          <span className="text-right">COGS attuale</span>
          <span className="text-right">Totale/unità</span>
          <span className="pl-1">Marketplace</span>
          <span className="text-right">Storico</span>
          <span />
        </div>

        {/* Content */}
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-bg-border/30 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-zinc-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-52 rounded bg-zinc-800" />
                <div className="h-2 w-32 rounded bg-zinc-800" />
              </div>
              <div className="w-20 h-4 rounded bg-zinc-800" />
              <div className="w-20 h-4 rounded bg-zinc-800" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-zinc-600">
            <Package size={32} className="opacity-30" />
            <p className="text-sm">{search ? `Nessun risultato per "${search}"` : "Nessun prodotto trovato"}</p>
            {search && <button onClick={() => setSearch("")} className="text-xs text-blue-400 hover:text-blue-300">Cancella ricerca</button>}
          </div>
        ) : (
          <div className="divide-y divide-bg-border/30">
            {filtered.map(g => {
              const isOpen = expanded.has(g.asin);
              const displayCogs = g.latestEntryPrice ?? g.avgCogs;
              const displayShipping = g.rows.find(r => r.shippingCost && r.shippingCost > 0)?.shippingCost ?? 0;
              const total = displayCogs + displayShipping;
              const hasHistory = g.entries.length > 0;

              return (
                <div key={g.asin}>
                  <div
                    className="grid px-4 py-3 items-center cursor-pointer hover:bg-white/[0.015] transition-colors"
                    style={{ gridTemplateColumns: "3.5rem 1fr 8rem 8rem 10rem 5rem 2rem" }}
                    onClick={() => toggleExpand(g.asin)}
                  >
                    {/* Image */}
                    <ProductImage url={g.imageUrl} title={g.productTitle} />

                    {/* Title + meta */}
                    <div className="min-w-0 px-3">
                      <p className="text-sm text-zinc-100 font-medium truncate leading-snug">
                        {g.productTitle
                          ? (g.productTitle.length > 60 ? g.productTitle.slice(0, 58) + "…" : g.productTitle)
                          : <span className="text-zinc-600 italic text-xs">Titolo non disponibile</span>
                        }
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-zinc-600 font-mono">{g.asin}</span>
                        {g.sku && <span className="text-[10px] text-zinc-700 font-mono">· {g.sku}</span>}
                        {!hasHistory
                          ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500/60">nessun storico</span>
                          : <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70">{g.entries.length} acquist{g.entries.length === 1 ? "o" : "i"}</span>
                        }
                      </div>
                    </div>

                    {/* COGS */}
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-sm font-semibold font-mono text-white tabular-nums">{fmtEur(displayCogs)}</span>
                        {g.priceChange !== 0 && (
                          <span className={`text-[9px] ${g.priceChange > 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {g.priceChange > 0 ? "▲" : "▼"}
                          </span>
                        )}
                      </div>
                      {g.minCogs !== g.maxCogs && (
                        <div className="text-[10px] text-zinc-700 tabular-nums">{fmtEur(g.minCogs)}–{fmtEur(g.maxCogs)}</div>
                      )}
                    </div>

                    {/* Total */}
                    <div className="text-right">
                      <span className={`text-sm font-semibold font-mono tabular-nums ${total > 0 ? "text-blue-400" : "text-zinc-700"}`}>
                        {fmtEur(total)}
                      </span>
                    </div>

                    {/* Marketplace flags */}
                    <div className="flex flex-wrap gap-0.5 pl-1">
                      {g.marketplaces.slice(0, 8).map(mp => (
                        <span key={mp} title={MP_LABEL[mp] ?? mp} className="text-base leading-none">{MP_FLAGS[mp] ?? "🌐"}</span>
                      ))}
                      {g.marketplaces.length > 8 && <span className="text-[10px] text-zinc-600">+{g.marketplaces.length - 8}</span>}
                    </div>

                    {/* History count */}
                    <div className="text-right">
                      {hasHistory
                        ? <span className="text-xs text-zinc-400 tabular-nums">{g.entries.length} entry</span>
                        : <span className="text-zinc-700 text-xs">—</span>
                      }
                    </div>

                    {/* Chevron */}
                    <div className="flex justify-center">
                      <ChevronDown size={14} className="text-zinc-600 transition-transform duration-200"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                    </div>
                  </div>

                  {isOpen && <AsinPanel group={g} onRefresh={load} onEditCogs={setEditingCogs} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingCogs && <CogsEditDrawer item={editingCogs} onSave={handleSaveCogs} onClose={() => setEditingCogs(null)} />}
    </div>
  );
}
