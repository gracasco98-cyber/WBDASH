# Acquisti Nav Reorg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Purchasing module a dedicated "ACQUISTI" sidebar group where Fornitori, Ordini Fornitore, Magazzini, Banche, and Condizioni di pagamento each get their own page (instead of being tabs crammed into one "Anagrafiche" container), with placeholders for the not-yet-built phases of the document flow (Ricezioni/DDT, Fatture, Scadenzario, Prima Nota).

**Architecture:** Pure frontend reorganization — no backend, schema, or API changes. Three read-only list views (Magazzini/Banche/Condizioni-pagamento) move from inline functions in `anagrafiche/page.tsx` to standalone components under `components/purchasing/`, matching the existing `FornitoriTab.tsx` pattern exactly. Each gets its own thin page at `/acquisti/**`. The existing Fornitori create/detail pages move from `/anagrafiche/fornitori/**` to `/acquisti/fornitori/**` unchanged except for one internal redirect path. `GlobalSidebar.tsx` gets a new `ACQUISTI` group; `/anagrafiche/**` is deleted once the new tree is confirmed working.

**Tech Stack:** Next.js 14 (App Router) + Tailwind, same as the rest of this frontend. No test suite for this work — matches this codebase's established precedent for purchasing UI (`SupplierForm.tsx`, `FornitoriTab.tsx`, and every FASE D page have none); verification is `tsc --noEmit` + manual browser check.

**Design doc:** `docs/superpowers/specs/2026-08-11-acquisti-nav-reorg-design.md`

## Global Constraints

- No new functionality: Magazzini/Banche/Condizioni-pagamento are read-only today (no create form exists for any of them) and stay read-only after the move — this is a pure relocation, not a feature addition.
- No backend changes of any kind in this plan.
- `/acquisti` itself gets no landing page, consistent with how `FINANCE`/`INVENTORY`/`MARKETING` have no landing page of their own — sidebar links go straight to sub-pages.
- Delete `/anagrafiche/**` only after the new `/acquisti/**` tree is confirmed working (Task 4, after Tasks 1-3) — never delete before the replacement exists and typechecks.
- Branch: `feature/acquisti-nav-reorg`, already created off `develop` and currently checked out — it already holds one commit (the design doc). Do not create a new branch.
- Verification command: `cd frontend && npx tsc --noEmit`.

---

### Task 1: Extract Magazzini/Banche/Condizioni-pagamento into standalone components

**Files:**
- Create: `frontend/src/components/purchasing/MagazziniTab.tsx`
- Create: `frontend/src/components/purchasing/BancheTab.tsx`
- Create: `frontend/src/components/purchasing/CondizioniPagamentoTab.tsx`

**Interfaces:**
- Consumes: `api.purchasing.warehouses.list()`, `api.purchasing.bankAccounts.list()`, `api.purchasing.paymentTerms.list()` (all pre-existing, from FASE B), and the `Warehouse`/`BankAccount`/`PaymentTerm` types from `@/lib/api/purchasing`.
- Produces: three default-exported components with no props, each fetching and rendering its own list — used by Task 2's new pages.

- [ ] **Step 1: Create `frontend/src/components/purchasing/MagazziniTab.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `frontend/src/components/purchasing/BancheTab.tsx`**

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { BankAccount } from "@/lib/api/purchasing";

export default function BancheTab() {
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
```

- [ ] **Step 3: Create `frontend/src/components/purchasing/CondizioniPagamentoTab.tsx`**

```tsx
"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { PaymentTerm } from "@/lib/api/purchasing";

export default function CondizioniPagamentoTab() {
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
```

- [ ] **Step 4: Typecheck and commit**
```bash
cd frontend && npx tsc --noEmit
git add frontend/src/components/purchasing/MagazziniTab.tsx frontend/src/components/purchasing/BancheTab.tsx frontend/src/components/purchasing/CondizioniPagamentoTab.tsx
git commit -m "refactor(purchasing): extract Magazzini/Banche/CondizioniPagamento into standalone components"
```

---

### Task 2: Build the `/acquisti/**` page tree

**Files:**
- Create: `frontend/src/app/acquisti/fornitori/page.tsx`
- Create: `frontend/src/app/acquisti/magazzini/page.tsx`
- Create: `frontend/src/app/acquisti/banche/page.tsx`
- Create: `frontend/src/app/acquisti/condizioni-pagamento/page.tsx`
- Create: `frontend/src/app/acquisti/fornitori/nuovo/page.tsx` (moved from `frontend/src/app/anagrafiche/fornitori/nuovo/page.tsx`, one redirect path changed)
- Create: `frontend/src/app/acquisti/fornitori/[id]/page.tsx` (moved from `frontend/src/app/anagrafiche/fornitori/[id]/page.tsx`, unchanged)
- Modify: `frontend/src/components/purchasing/FornitoriTab.tsx` (two hrefs updated from `/anagrafiche/fornitori/...` to `/acquisti/fornitori/...`)

**Interfaces:**
- Consumes: `MagazziniTab`/`BancheTab`/`CondizioniPagamentoTab` (Task 1), pre-existing `FornitoriTab`/`SupplierForm` components, `api.suppliers.*`.
- Produces: the full `/acquisti/fornitori`, `/acquisti/fornitori/nuovo`, `/acquisti/fornitori/[id]`, `/acquisti/magazzini`, `/acquisti/banche`, `/acquisti/condizioni-pagamento` routes — used by Task 3's sidebar links.

- [ ] **Step 1: Create `frontend/src/app/acquisti/fornitori/page.tsx`**

```tsx
"use client";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import FornitoriTab from "@/components/purchasing/FornitoriTab";

export default function FornitoriPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Fornitori</h1>
            <FornitoriTab />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/app/acquisti/magazzini/page.tsx`**

```tsx
"use client";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import MagazziniTab from "@/components/purchasing/MagazziniTab";

export default function MagazziniPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Magazzini</h1>
            <MagazziniTab />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/app/acquisti/banche/page.tsx`**

```tsx
"use client";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import BancheTab from "@/components/purchasing/BancheTab";

export default function BanchePage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Banche</h1>
            <BancheTab />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/app/acquisti/condizioni-pagamento/page.tsx`**

```tsx
"use client";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import CondizioniPagamentoTab from "@/components/purchasing/CondizioniPagamentoTab";

export default function CondizioniPagamentoPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Condizioni di pagamento</h1>
            <CondizioniPagamentoTab />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/src/app/acquisti/fornitori/nuovo/page.tsx`**

Same as `frontend/src/app/anagrafiche/fornitori/nuovo/page.tsx` today, with the redirect target changed from `/anagrafiche/fornitori/${supplier.id}` to `/acquisti/fornitori/${supplier.id}`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import SupplierForm, { EMPTY_SUPPLIER_FORM, SupplierFormState } from "@/components/purchasing/SupplierForm";
import { api } from "@/lib/api";

export default function NuovoFornitorePage() {
  const router = useRouter();

  const handleSubmit = async (form: SupplierFormState) => {
    const supplier = await api.suppliers.create({
      ...form,
      paymentDays: form.paymentDays ? Number(form.paymentDays) : null,
      defaultPaymentMethod: form.defaultPaymentMethod || null,
    });
    router.push(`/acquisti/fornitori/${supplier.id}`);
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Fornitore</h1>
            <SupplierForm initial={EMPTY_SUPPLIER_FORM} submitLabel="Crea Fornitore" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `frontend/src/app/acquisti/fornitori/[id]/page.tsx`**

Byte-identical to `frontend/src/app/anagrafiche/fornitori/[id]/page.tsx` today — it contains no `/anagrafiche` references to update (`ContattiTab`, `ProdottiTab`, and `FornitoreDetailPage` only call `api.suppliers.*`, never navigate by path):

```tsx
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
    } catch (err) {
      window.alert("Impossibile aggiungere il contatto. Riprova.");
    } finally { setAdding(false); }
  };

  const removeContact = async (contactId: string) => {
    try {
      await api.suppliers.contacts.remove(supplier.id, contactId);
      onChange();
    } catch (err) {
      window.alert("Impossibile rimuovere il contatto. Riprova.");
    }
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
              onClick={() => removeContact(c.id)}
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
    } catch (err) {
      window.alert("Impossibile collegare il prodotto. Riprova.");
    } finally { setAdding(false); }
  };

  const bumpPrice = async (spId: string, currentPrice: number) => {
    const input = window.prompt("Nuovo prezzo:", String(currentPrice));
    if (!input) return;
    const newPrice = Number(input);
    if (Number.isNaN(newPrice)) return;
    try {
      await api.suppliers.products.updatePrice(supplier.id, spId, { price: newPrice, source: "modifica manuale" });
      onChange();
    } catch (err) {
      window.alert("Impossibile aggiornare il prezzo. Riprova.");
    }
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
                <td className="px-3 py-2.5 font-mono">{p.product?.name ?? p.supplierSku ?? p.productId}</td>
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
```

- [ ] **Step 7: Update the two `/anagrafiche/fornitori/...` links inside `frontend/src/components/purchasing/FornitoriTab.tsx`**

In the existing file, change:
```tsx
          href="/anagrafiche/fornitori/nuovo"
```
to:
```tsx
          href="/acquisti/fornitori/nuovo"
```
and change:
```tsx
                <Link href={`/anagrafiche/fornitori/${r.id}`} className="font-mono text-accent-primary hover:underline">{r.internalCode}</Link>
```
to:
```tsx
                <Link href={`/acquisti/fornitori/${r.id}`} className="font-mono text-accent-primary hover:underline">{r.internalCode}</Link>
```

- [ ] **Step 8: Typecheck and commit**
```bash
cd frontend && npx tsc --noEmit
git add frontend/src/app/acquisti frontend/src/components/purchasing/FornitoriTab.tsx
git commit -m "feat(purchasing): build the /acquisti page tree (Fornitori, Magazzini, Banche, Condizioni di pagamento)"
```

Note: `frontend/src/app/anagrafiche/**` still exists at this point and both trees work side by side — it is removed only in Task 4, after Task 3 wires the sidebar to the new tree.

---

### Task 3: Update the sidebar

**Files:**
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx`

**Interfaces:**
- Consumes: nothing new (routes from Task 2 already exist).
- Produces: the new `ACQUISTI` sidebar group, visible to every page that renders `<GlobalSidebar/>`.

- [ ] **Step 1: Add the `ShoppingBag` import**

In `frontend/src/components/layout/GlobalSidebar.tsx`, change:
```tsx
import {
  LayoutDashboard, ShoppingCart, Wallet, Boxes, Megaphone, LifeBuoy, Shield,
  ChevronDown,
} from "lucide-react";
```
to:
```tsx
import {
  LayoutDashboard, ShoppingCart, ShoppingBag, Wallet, Boxes, Megaphone, LifeBuoy, Shield,
  ChevronDown,
} from "lucide-react";
```

- [ ] **Step 2: Remove "Anagrafiche" from the INVENTORY group and add the new ACQUISTI group**

Change:
```tsx
  {
    key: "inventory", label: "INVENTORY", icon: Boxes,
    items: [
      { href: "/amazon/cogs", label: "COGS" },
      { href: "/amazon/inventory", label: "Magazzino" },
      { href: "/anagrafiche", label: "Anagrafiche" },
      { label: "Purchase Orders", comingSoon: true },
    ],
  },
```
to:
```tsx
  {
    key: "inventory", label: "INVENTORY", icon: Boxes,
    items: [
      { href: "/amazon/cogs", label: "COGS" },
      { href: "/amazon/inventory", label: "Magazzino" },
    ],
  },
  {
    key: "acquisti", label: "ACQUISTI", icon: ShoppingBag,
    items: [
      { href: "/acquisti/fornitori", label: "Fornitori" },
      { href: "/acquisti/ordini", label: "Ordini Fornitore" },
      { label: "Ricezioni / DDT", comingSoon: true },
      { label: "Fatture Fornitore", comingSoon: true },
      { href: "/acquisti/magazzini", label: "Magazzini" },
      { href: "/acquisti/banche", label: "Banche" },
      { href: "/acquisti/condizioni-pagamento", label: "Condizioni pagamento" },
      { label: "Scadenzario", comingSoon: true },
      { label: "Prima Nota", comingSoon: true },
    ],
  },
```

Note this removes the old `{ href: "/acquisti/ordini", label: "Ordini Fornitore" }` entry from `INVENTORY` (added in FASE D) and re-adds it inside the new `ACQUISTI` group — it must not end up listed in both places.

- [ ] **Step 3: Add `acquisti` to the default-open groups state**

Change:
```tsx
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    finance: true, inventory: true, marketing: true, supporto: true, admin: true,
  });
```
to:
```tsx
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    finance: true, inventory: true, acquisti: true, marketing: true, supporto: true, admin: true,
  });
```

- [ ] **Step 4: Typecheck and commit**
```bash
cd frontend && npx tsc --noEmit
git add frontend/src/components/layout/GlobalSidebar.tsx
git commit -m "feat(purchasing): add dedicated ACQUISTI sidebar group"
```

---

### Task 4: Remove the old `/anagrafiche` tree

**Files:**
- Delete: `frontend/src/app/anagrafiche/page.tsx`
- Delete: `frontend/src/app/anagrafiche/fornitori/nuovo/page.tsx`
- Delete: `frontend/src/app/anagrafiche/fornitori/[id]/page.tsx`

**Interfaces:** none — this task only removes now-unreachable files. Nothing else in the codebase imports from `frontend/src/app/anagrafiche/**` (Next.js App Router pages are never imported by other files, only resolved by the file-system router) — confirm this with a repo-wide search before deleting, since a stray reference would silently 404 instead of failing a build.

- [ ] **Step 1: Confirm nothing outside `app/anagrafiche/**` itself references the old paths**
```bash
cd frontend && grep -rln "anagrafiche" src/ --include="*.tsx" --include="*.ts" | grep -v "^src/app/anagrafiche/"
```
Expected: no output. (Matches inside `src/app/anagrafiche/**` itself are expected and harmless — that whole directory is deleted in Step 2 below. Task 2's Step 7 already removed the only two references from outside it, inside `FornitoriTab.tsx`. If this command prints any file outside `app/anagrafiche/`, stop and fix that reference before deleting.)

- [ ] **Step 2: Delete the old tree**
```bash
git rm -r frontend/src/app/anagrafiche
```

- [ ] **Step 3: Typecheck and commit**
```bash
cd frontend && npx tsc --noEmit
git commit -m "chore(purchasing): remove the old /anagrafiche tree, superseded by /acquisti"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**
```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Repo-wide search for stale references**
```bash
cd frontend && grep -rn "anagrafiche" src/
```
Expected: no output anywhere in the frontend source (not just `.tsx`/`.ts` — catches stray references in config or other file types too).

- [ ] **Step 3: Manual browser verification**

With both dev servers running (`docker start wbdash-dev-postgres`, then `npm run dev` in `backend/` and `frontend/`):
1. Sidebar shows a new "ACQUISTI" group between INVENTORY and MARKETING, open by default.
2. Click "Fornitori" → `/acquisti/fornitori` loads the list (same content as the old Anagrafiche → Fornitori tab).
3. "Nuovo Fornitore" → create a supplier → redirects to `/acquisti/fornitori/<id>`, not `/anagrafiche/fornitori/<id>`.
4. Click "Ordini Fornitore", "Magazzini", "Banche", "Condizioni pagamento" — each opens its own page under `/acquisti/**` with the expected content.
5. Confirm "Ricezioni / DDT", "Fatture Fornitore", "Scadenzario", "Prima Nota" show as disabled "Prossimamente" entries, once each (not duplicated).
6. Visit `/anagrafiche` directly in the browser — confirm it now 404s (Next.js App Router default not-found page).

- [ ] **Step 4: Final commit if Step 3 surfaced any fixes**

If manual verification found an issue, fix it, re-run `tsc --noEmit`, and commit the fix separately with a `fix(purchasing): ...` message.

---

## After this plan

Once merged, the next two agreed pieces of work — each brainstormed fresh, not assumed from here — are: (2) a Business Intelligence dashboard for the gestionale (ordini in corso, stock totale, fatture da riconciliare, ecc.), and (3) a visual/color redesign across the whole app.
