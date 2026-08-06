"use client";
import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import SupplierForm, { SupplierFormState } from "@/components/purchasing/SupplierForm";
import { api } from "@/lib/api";
import type { SupplierDetail } from "@/lib/api/suppliers";

type DetailTab = "panoramica" | "prodotti" | "contatti";
const COMING_SOON_TABS = ["Ordini", "DDT", "Fatture", "Scadenze", "Pagamenti", "Documenti"];

function toFormState(s: SupplierDetail): Partial<SupplierFormState> {
  return {
    legalName: s.legalName, tradeName: s.tradeName ?? "", internalCode: s.internalCode,
    supplierType: s.supplierType, country: s.country, language: s.language ?? "", defaultCurrency: s.defaultCurrency,
    vatNumber: s.vatNumber ?? "", taxCode: s.taxCode ?? "", foreignVatNumber: s.foreignVatNumber ?? "",
    sdiCode: s.sdiCode ?? "", pec: s.pec ?? "", taxRegime: s.taxRegime ?? "", fiscalNotes: s.fiscalNotes ?? "",
    addressLine: s.addressLine ?? "", streetNumber: s.streetNumber ?? "", postalCode: s.postalCode ?? "",
    city: s.city ?? "", province: s.province ?? "", addressCountry: s.addressCountry ?? "",
    defaultPaymentMethod: s.defaultPaymentMethod ?? "", paymentDays: s.paymentDays?.toString() ?? "",
    bankName: s.bankName ?? "", iban: s.iban ?? "", bic: s.bic ?? "", ribaEnabled: s.ribaEnabled,
  };
}

function ContattiTab({ supplier, onChange }: { supplier: SupplierDetail; onChange: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await api.suppliers.contacts.create(supplier.id, { name, role: role || null, email: email || null });
      setName(""); setRole(""); setEmail("");
      onChange();
    } finally { setAdding(false); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-bg-card border border-bg-border rounded-xl divide-y divide-bg-border/40">
        {supplier.contacts.map(c => (
          <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-xs text-zinc-300">
            <div>
              <span className="font-medium">{c.name}</span>
              {c.role && <span className="text-zinc-500"> — {c.role}</span>}
              {c.isPrimary && <span className="ml-2 text-[9px] uppercase tracking-wide text-accent-primary border border-accent-primary/30 rounded px-1 py-0.5">Principale</span>}
            </div>
            <div className="text-zinc-500">{c.email}</div>
            <button
              onClick={() => api.suppliers.contacts.remove(supplier.id, c.id).then(onChange)}
              className="text-accent-red hover:underline"
            >
              Rimuovi
            </button>
          </div>
        ))}
        {supplier.contacts.length === 0 && <div className="text-center text-zinc-600 py-6 text-xs">Nessun contatto</div>}
      </div>
      <form onSubmit={addContact} className="flex flex-wrap items-end gap-2 bg-bg-card border border-bg-border rounded-xl p-3">
        <input required placeholder="Nome" value={name} onChange={e => setName(e.target.value)} className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200" />
        <input placeholder="Ruolo" value={role} onChange={e => setRole(e.target.value)} className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200" />
        <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200" />
        <button disabled={adding} className="px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium">Aggiungi contatto</button>
      </form>
    </div>
  );
}

function ProdottiTab({ supplier, onChange }: { supplier: SupplierDetail; onChange: () => void }) {
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [adding, setAdding] = useState(false);

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await api.suppliers.products.add(supplier.id, { productId, standardPrice: Number(price) });
      setProductId(""); setPrice("");
      onChange();
    } finally { setAdding(false); }
  };

  const bumpPrice = async (spId: string, currentPrice: number) => {
    const input = window.prompt("Nuovo prezzo:", String(currentPrice));
    if (!input) return;
    const newPrice = Number(input);
    if (Number.isNaN(newPrice)) return;
    await api.suppliers.products.updatePrice(supplier.id, spId, { price: newPrice, source: "modifica manuale" });
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
              <th className="px-3 py-2.5">SKU fornitore</th><th className="px-3 py-2.5">Prezzo</th>
              <th className="px-3 py-2.5">MOQ</th><th className="px-3 py-2.5">Lead time</th><th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {supplier.products.map(p => (
              <tr key={p.id} className="border-b border-bg-border/40 text-zinc-300">
                <td className="px-3 py-2.5 font-mono">{p.supplierSku ?? p.productId}</td>
                <td className="px-3 py-2.5 tabular-nums">€ {p.standardPrice.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5">{p.moq ?? "—"}</td>
                <td className="px-3 py-2.5">{p.leadTimeDays ? `${p.leadTimeDays}gg` : "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={() => bumpPrice(p.id, p.standardPrice)} className="text-accent-blue hover:underline">Aggiorna prezzo</button>
                </td>
              </tr>
            ))}
            {supplier.products.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-6">Nessun prodotto collegato</td></tr>}
          </tbody>
        </table>
      </div>
      <form onSubmit={addProduct} className="flex flex-wrap items-end gap-2 bg-bg-card border border-bg-border rounded-xl p-3">
        <input required placeholder="ID Prodotto" value={productId} onChange={e => setProductId(e.target.value)} className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono" />
        <input required placeholder="Prezzo" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200" />
        <button disabled={adding} className="px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium">Collega prodotto</button>
      </form>
    </div>
  );
}

export default function FornitoreDetailPage({ params }: { params: { id: string } }) {
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [tab, setTab] = useState<DetailTab>("panoramica");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.suppliers.get(params.id).then(setSupplier).catch(() => setSupplier(null)).finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (form: SupplierFormState) => {
    await api.suppliers.update(params.id, {
      ...form,
      paymentDays: form.paymentDays ? Number(form.paymentDays) : null,
      defaultPaymentMethod: form.defaultPaymentMethod || null,
    });
    load();
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!supplier) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Fornitore non trovato</div>;

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "panoramica", label: "Panoramica" },
    { id: "prodotti", label: `Prodotti (${supplier.products.length})` },
    { id: "contatti", label: `Contatti (${supplier.contacts.length})` },
  ];

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white">{supplier.legalName}</h1>
              <p className="text-xs text-zinc-500 font-mono">{supplier.internalCode} · {supplier.isActive ? "Attivo" : "Disattivato"}</p>
            </div>
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
              {COMING_SOON_TABS.map(label => (
                <button key={label} disabled title="Prossimamente" className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 border border-bg-border cursor-not-allowed flex items-center gap-1.5">
                  {label}
                  <span className="text-[9px] uppercase tracking-wide text-zinc-700 border border-zinc-800 rounded px-1 py-0.5 shrink-0">Prossimamente</span>
                </button>
              ))}
            </div>
            {tab === "panoramica" && <SupplierForm initial={toFormState(supplier)} disableInternalCode submitLabel="Salva modifiche" onSubmit={handleUpdate} />}
            {tab === "prodotti" && <ProdottiTab supplier={supplier} onChange={load} />}
            {tab === "contatti" && <ContattiTab supplier={supplier} onChange={load} />}
          </main>
        </div>
      </div>
    </div>
  );
}
