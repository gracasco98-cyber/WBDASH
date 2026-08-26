# Anagrafiche — Pattern denso (Fase 1: Fornitori) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple 5-column Fornitori table with a denser, more informative layout — header with summary + search, stat-tiles, Attivi/Disattivati tabs, richer table columns — using WBDASH's existing light theme (default theme) and existing Tailwind token classes, per `docs/superpowers/specs/2026-08-25-anagrafiche-dense-pattern-fornitori-design.md`.

**Architecture:** One small backend addition (`findAllSuppliers()` gains `defaultPaymentTerm.name` and a `_count.products`, same `_count` pattern already used for Warehouse/PaymentTerm in the prior Fondamenta feature). Three new presentational components in a new cross-domain `frontend/src/components/ui/` folder (`PageHeader`, `StatTile`/`StatTileRow`, `TabsWithCount`) — no hooks, no state, reusable by future areas. `FornitoriTab.tsx` is rewritten to use them, with client-side search and Attivi/Disattivati filtering (the list is already fully loaded via `api.suppliers.list()`, same scale as today).

**Tech Stack:** Node/Express/TypeScript + Prisma (backend), Next.js 14 + Tailwind (frontend), Vitest + Testcontainers (backend tests).

## Global Constraints

- Repository layer only: routes/services never call Prisma directly — only `backend/src/repositories/**` (`CLAUDE.md`).
- No schema changes, no new Prisma migration — `Supplier.defaultPaymentTerm` and `Supplier.products` relations already exist (confirmed in the design spec §5).
- No new color palette — reuse the existing Tailwind semantic classes already used throughout `frontend/src/components/purchasing/*` (`bg-bg-card`, `border-bg-border`, `bg-bg-hover`, `text-zinc-300/400/500`, `text-accent-primary`, `text-accent-amber`, `bg-accent-primary/10`, `bg-accent-blue/15`). These already render correctly in both themes via existing global overrides in `frontend/src/app/globals.css` — do not add new hex values or new CSS.
- The new shared components (`PageHeader`, `StatTile`, `StatTileRow`, `TabsWithCount`) are pure presentational components (props in, JSX out) — no `"use client"` directive needed (matches the existing convention in `frontend/src/components/purchasing/OrderStatusStepper.tsx`, which also has no directive).
- Matching this codebase's existing convention (no test files for `SupplierForm.tsx`, `FornitoriTab.tsx`, or any page under `frontend/src/app/acquisti/fornitori/`), the new UI components and the `FornitoriTab.tsx` rewrite get no dedicated test files. The backend repository change does get a test, following `backend/tests/repositories/purchasing/*.test.ts`.
- Backend tests use Testcontainers via `setupTestDb()`/`truncateAll()` (`backend/tests/helpers/db.ts`) — run with `cd backend && npx vitest run <path>`.
- Frontend: `cd frontend && npx tsc --noEmit`.

---

### Task 1: Backend — `findAllSuppliers()` gains default payment term name + product count

**Files:**
- Modify: `backend/src/repositories/purchasing/suppliers.repo.ts`
- Test: `backend/tests/repositories/purchasing/suppliers.repo.test.ts`

**Interfaces:**
- Produces: `findAllSuppliers()` rows now include `defaultPaymentTerm: { name: string } | null` and `_count: { products: number }`.

- [ ] **Step 1: Write the failing test**

Open `backend/tests/repositories/purchasing/suppliers.repo.test.ts`. Update the imports at the top of the file to add the two extra repositories needed for fixtures:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllSuppliers, findSupplierById, createSupplier, updateSupplier, deactivateSupplier } from "../../../src/repositories/purchasing/suppliers.repo";
import { createPaymentTerm } from "../../../src/repositories/purchasing/payment-terms.repo";
import { addSupplierProduct } from "../../../src/repositories/purchasing/supplier-products.repo";
```

Add this `it` block inside `describe("suppliers.repo", ...)`, after the existing `"rejects a duplicate internalCode"` test:

```ts
  it("includes the default payment term name and a count of linked products", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "30gg fine mese", type: "STANDARD", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });
    const withTerm = await createSupplier(db.prisma, { ...baseInput, internalCode: "FORN-010", defaultPaymentTermId: term.id });
    const withoutTerm = await createSupplier(db.prisma, { ...baseInput, legalName: "No Term Srl", internalCode: "FORN-011" });
    const product = await db.prisma.product.create({ data: { name: "Widget Test" } });
    await addSupplierProduct(db.prisma, withTerm.id, { productId: product.id, standardPrice: 10 });

    const all = await findAllSuppliers(db.prisma);
    const withTermRow = all.find(s => s.id === withTerm.id)!;
    const withoutTermRow = all.find(s => s.id === withoutTerm.id)!;

    expect(withTermRow.defaultPaymentTerm?.name).toBe("30gg fine mese");
    expect(withTermRow._count.products).toBe(1);
    expect(withoutTermRow.defaultPaymentTerm).toBeNull();
    expect(withoutTermRow._count.products).toBe(0);
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd backend && npx vitest run tests/repositories/purchasing/suppliers.repo.test.ts`
Expected: FAIL — `defaultPaymentTerm`/`_count` are `undefined` on the returned rows.

- [ ] **Step 3: Add the include**

In `backend/src/repositories/purchasing/suppliers.repo.ts`, replace `findAllSuppliers`:

```ts
export async function findAllSuppliers(prisma: PrismaClient) {
  return prisma.supplier.findMany({
    orderBy: { legalName: "asc" },
    include: {
      defaultPaymentTerm: { select: { name: true } },
      _count: { select: { products: true } },
    },
  });
}
```

Note: the `Promise<Supplier[]>` return-type annotation is removed — Prisma infers the richer type (with `defaultPaymentTerm` and `_count`) from the `include`, and a narrower manual annotation would hide the new fields from callers. This is the same pattern already used for `findAllWarehouses`/`findAllPaymentTerms` in the prior Fondamenta feature.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd backend && npx vitest run tests/repositories/purchasing/suppliers.repo.test.ts`
Expected: PASS (6 tests: the 5 existing + the 1 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/suppliers.repo.ts backend/tests/repositories/purchasing/suppliers.repo.test.ts
git commit -m "feat(purchasing): add default payment term name and product count to findAllSuppliers"
```

---

### Task 2: Frontend — shared `PageHeader`/`StatTile`/`TabsWithCount` components

**Files:**
- Create: `frontend/src/components/ui/PageHeader.tsx`
- Create: `frontend/src/components/ui/StatTile.tsx`
- Create: `frontend/src/components/ui/TabsWithCount.tsx`

**Interfaces:**
- Produces: `PageHeader({ title, summary?, subtitle?, search?, actions? })`, `StatTile({ value, label, tone? })`, `StatTileRow({ children })`, `TabsWithCount({ tabs, activeId, onChange })` — all consumed by Task 3.

- [ ] **Step 1: Create `PageHeader.tsx`**

Create `frontend/src/components/ui/PageHeader.tsx`:

```tsx
import { Search } from "lucide-react";

interface Props {
  title: string;
  summary?: string;
  subtitle?: string;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  actions?: React.ReactNode;
}

export default function PageHeader({ title, summary, subtitle, search, actions }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg sm:text-xl font-bold text-white">{title}</h1>
          {summary && (
            <span className="text-[10.5px] text-zinc-500 bg-bg-card border border-bg-border rounded-md px-2 py-0.5">
              {summary}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-zinc-500 mt-1 max-w-lg">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {search && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? "Cerca..."}
              className="bg-bg-hover border border-bg-border rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-primary/50 w-44"
            />
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `StatTile.tsx`**

Create `frontend/src/components/ui/StatTile.tsx`:

```tsx
export interface StatTileProps {
  value: number | string;
  label: string;
  tone?: "primary" | "neutral" | "amber";
}

const TONE_CLASSES: Record<NonNullable<StatTileProps["tone"]>, string> = {
  primary: "text-accent-primary",
  neutral: "text-zinc-300",
  amber: "text-accent-amber",
};

export function StatTile({ value, label, tone = "neutral" }: StatTileProps) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl px-3.5 py-2.5">
      <div className={`text-base font-bold ${TONE_CLASSES[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

export function StatTileRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">{children}</div>;
}
```

- [ ] **Step 3: Create `TabsWithCount.tsx`**

Create `frontend/src/components/ui/TabsWithCount.tsx`:

```tsx
export interface TabItem {
  id: string;
  label: string;
  count: number;
}

interface Props {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export default function TabsWithCount({ tabs, activeId, onChange }: Props) {
  return (
    <div className="flex gap-1 border-b border-bg-border">
      {tabs.map(tab => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              active ? "text-accent-primary border-accent-primary" : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            {tab.label}
            <span className={`text-[9.5px] rounded px-1.5 py-0.5 ${active ? "bg-accent-primary/10 text-accent-primary" : "bg-bg-hover text-zinc-500"}`}>
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (these files aren't imported anywhere yet, but must be self-consistent — no unused-prop or type errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/PageHeader.tsx frontend/src/components/ui/StatTile.tsx frontend/src/components/ui/TabsWithCount.tsx
git commit -m "feat(ui): add shared PageHeader/StatTile/TabsWithCount components"
```

---

### Task 3: Frontend — `Supplier` type update + `FornitoriTab.tsx` rewrite

**Files:**
- Modify: `frontend/src/lib/api/suppliers.ts`
- Modify: `frontend/src/components/purchasing/FornitoriTab.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `StatTile`/`StatTileRow`, `TabsWithCount` from Task 2. `defaultPaymentTerm`/`_count.products` fields from Task 1 (already present on the `GET /suppliers` response — no route change needed, it's a plain passthrough).

- [ ] **Step 1: Update the `Supplier` type**

In `frontend/src/lib/api/suppliers.ts`, replace the `Supplier` interface:

```ts
export interface Supplier {
  id: string; legalName: string; tradeName: string | null; internalCode: string;
  isActive: boolean; supplierType: string; country: string; language: string | null;
  defaultCurrency: string; vatNumber: string | null; taxCode: string | null;
  foreignVatNumber: string | null; sdiCode: string | null; pec: string | null;
  taxRegime: string | null; fiscalNotes: string | null; addressLine: string | null;
  streetNumber: string | null; postalCode: string | null; city: string | null;
  province: string | null; addressCountry: string | null;
  defaultPaymentMethod: string | null; defaultPaymentTermId: string | null;
  paymentDays: number | null; bankName: string | null; iban: string | null;
  bic: string | null; ribaEnabled: boolean; fixedPaymentDays: number[];
  defaultPaymentTerm: { name: string } | null;
  _count: { products: number };
}
```

- [ ] **Step 2: Rewrite `FornitoriTab.tsx`**

Replace the entire contents of `frontend/src/components/purchasing/FornitoriTab.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/api/suppliers";
import PageHeader from "@/components/ui/PageHeader";
import { StatTile, StatTileRow } from "@/components/ui/StatTile";
import TabsWithCount from "@/components/ui/TabsWithCount";

export default function FornitoriTab() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const load = useCallback(() => { api.suppliers.list().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const activeCount = rows.filter(r => r.isActive).length;
  const inactiveCount = rows.filter(r => !r.isActive).length;
  const missingPaymentTermCount = rows.filter(r => !r.defaultPaymentTerm).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => (tab === "active" ? r.isActive : !r.isActive))
      .filter(r => !q || [r.legalName, r.tradeName, r.internalCode, r.vatNumber]
        .some(field => field?.toLowerCase().includes(q)));
  }, [rows, tab, search]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Fornitori"
        summary={`${rows.length} fornitori · ${missingPaymentTermCount} senza condizione pagamento`}
        subtitle="Anagrafica fornitori: dati fiscali, pagamenti e prodotti collegati."
        search={{ value: search, onChange: setSearch, placeholder: "Cerca nome, codice, P.IVA..." }}
        actions={
          <Link
            href="/acquisti/fornitori/nuovo"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
          >
            <Plus size={13} /> Nuovo Fornitore
          </Link>
        }
      />

      <StatTileRow>
        <StatTile value={activeCount} label="Attivi" tone="primary" />
        <StatTile value={inactiveCount} label="Disattivati" tone="neutral" />
        <StatTile value={missingPaymentTermCount} label="Senza condizione pagamento" tone="amber" />
      </StatTileRow>

      <TabsWithCount
        tabs={[
          { id: "active", label: "Attivi", count: activeCount },
          { id: "inactive", label: "Disattivati", count: inactiveCount },
        ]}
        activeId={tab}
        onChange={id => setTab(id as "active" | "inactive")}
      />

      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
              <th className="px-3 py-2.5">Fornitore</th><th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">P.IVA</th><th className="px-3 py-2.5">Condizione</th>
              <th className="px-3 py-2.5">Prodotti</th><th className="px-3 py-2.5">Stato</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                <td className="px-3 py-2.5">
                  <Link href={`/acquisti/fornitori/${r.id}`} className="font-medium text-accent-primary hover:underline">{r.legalName}</Link>
                  <div className="text-[10px] text-zinc-500 font-mono">{r.internalCode}</div>
                </td>
                <td className="px-3 py-2.5">{r.supplierType}</td>
                <td className="px-3 py-2.5 font-mono">{r.vatNumber ?? r.foreignVatNumber ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {r.defaultPaymentTerm ? r.defaultPaymentTerm.name : <span className="text-accent-amber">— mancante</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${r._count.products > 0 ? "bg-accent-blue/15 text-accent-blue" : "bg-zinc-800 text-zinc-500"}`}>
                    {r._count.products > 0 ? r._count.products : "Nessuno"}
                  </span>
                </td>
                <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center text-zinc-600 py-8">Nessun fornitore trovato</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and manually verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

With the dev servers running (`cd backend && npm run dev`, `cd frontend && npm run dev`), manually verify at `/acquisti/fornitori`: the header shows the summary pill and search box; the stat-tiles show correct Attivi/Disattivati/Senza-condizione counts; clicking "Disattivati" filters the table and the tab's own count matches; typing in the search box filters by name/code/P.IVA live; a supplier with no `defaultPaymentTermId` shows "— mancante" in amber and is counted in the stat-tile; a supplier with linked products shows the count badge, one with none shows "Nessuno"; the "+ Nuovo Fornitore" button and the fornitore-name link both still navigate correctly (unchanged behavior from before this task).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/suppliers.ts frontend/src/components/purchasing/FornitoriTab.tsx
git commit -m "feat(purchasing): apply dense Anagrafiche pattern to Fornitori list"
```

---

## Final Verification

After all 3 tasks are complete:

- [ ] Run the full backend suppliers-related suite: `cd backend && npx vitest run tests/repositories/purchasing/suppliers.repo.test.ts tests/integration/purchasing-suppliers.test.ts` — expect all passing, no regressions.
- [ ] Run `cd frontend && npx tsc --noEmit` and `cd backend && npx tsc --noEmit` — both clean.
- [ ] Manual smoke test of `/acquisti/fornitori` as described in Task 3 Step 3.
- [ ] Proceed to the final whole-branch review (superpowers:requesting-code-review) and superpowers:finishing-a-development-branch, per subagent-driven-development.
