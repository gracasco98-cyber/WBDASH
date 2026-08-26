# Anagrafiche — Clienti e Agenti (Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the standalone "Fornitori" page into a 3-tab "Anagrafiche" page (Fornitori · Clienti · Agenti), where Clienti/Agenti are a new lightweight, shared `BusinessContact` entity, per `docs/superpowers/specs/2026-08-26-anagrafiche-clienti-agenti-design.md`.

**Architecture:** One new Prisma model (`BusinessContact`, a free-text `type` field — no enum, same pattern as `Supplier.supplierType`) with full CRUD (create/update/deactivate) from day one. Two new generic frontend components (`ContactForm`, `ContactsTab`) parameterized by `type`/`basePath`/`title`, reused for both Clienti and Agenti instead of duplicating code. A new `/acquisti/anagrafiche` page hosts three tabs via the existing `TabsWithCount` component — the Fornitori tab renders the existing `FornitoriTab` unchanged; Clienti/Agenti render `ContactsTab` with different props. The old `/acquisti/fornitori` list page becomes a redirect; its `nuovo`/`[id]` sibling routes are untouched.

**Tech Stack:** Node/Express/TypeScript + Prisma (backend), Next.js 14 + Tailwind (frontend), Vitest + Testcontainers (backend tests).

## Global Constraints

- Repository layer only: routes/services never call Prisma directly — only `backend/src/repositories/**` (`CLAUDE.md`).
- New Prisma model + migration required for this plan (the only prior features in this project sequence that needed one). Additive only — new table, no changes to any existing table. Run `cd backend && npx prisma migrate dev --name add_business_contact` to generate it; never hand-write migration SQL.
- `BusinessContact.type` is a plain `String`, not a Prisma enum — matches the existing `Supplier.supplierType` convention in this schema, and lets a future type (e.g. "Trasportatori") be added without a migration. The two values used today (`"CLIENTE"`, `"AGENTE"`) are enforced only in the frontend (the create pages hard-code the type; there is no free-text type input anywhere a user could typo it).
- `BusinessContact.type` is immutable after creation — `updateBusinessContact()` never accepts a `type` field, matching the precedent set by `Warehouse.code` (immutable after creation) in the prior Fondamenta feature.
- Frontend forms/components follow the `Section`/`Field` pattern and `inputClass` constant from `frontend/src/components/purchasing/SupplierForm.tsx`, and the `PageHeader`/`TabsWithCount` components from `frontend/src/components/ui/` (built in the prior Fornitori dense-pattern feature — do not recreate them).
- Matching this codebase's existing convention, the new frontend form/list/page components get no dedicated test files. The backend repository and route functions do get tests.
- Backend tests use Testcontainers via `setupTestDb()`/`truncateAll()` (`backend/tests/helpers/db.ts`) — run with `cd backend && npx vitest run <path>`.
- Frontend: `cd frontend && npx tsc --noEmit`.

---

### Task 1: Backend — `BusinessContact` schema + repository + routes

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration (via `prisma migrate dev`)
- Create: `backend/src/repositories/purchasing/business-contacts.repo.ts`
- Create: `backend/src/purchasing/routes/business-contacts.routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/repositories/purchasing/business-contacts.repo.test.ts`
- Test: `backend/tests/integration/purchasing-business-contacts.test.ts`

**Interfaces:**
- Produces: `findAllBusinessContacts(prisma)`, `createBusinessContact(prisma, CreateBusinessContactInput)`, `updateBusinessContact(prisma, id, UpdateInput)`, `deactivateBusinessContact(prisma, id)`.
- Produces: `GET/POST/PUT/DELETE /api/purchasing/business-contacts[/:id]`.

- [ ] **Step 1: Add the Prisma model**

In `backend/prisma/schema.prisma`, insert this new model directly after the closing `}` of `model BankAccount` (line 871) and before the `// ─── Purchasing module — FASE C...` comment that precedes `model Supplier`:

```prisma
// ─── Purchasing module — Anagrafiche: Clienti/Agenti (Fase 2) ──────────────────
// See docs/superpowers/specs/2026-08-26-anagrafiche-clienti-agenti-design.md.
// A single lightweight shared table for simple contact registries (Clienti,
// Agenti, future types) — unrelated to SupplierContact (a person-contact that
// belongs to a specific Supplier, a different concept untouched by this model).
model BusinessContact {
  id        String   @id @default(cuid())
  type      String   // "CLIENTE" | "AGENTE" | free text — same pattern as Supplier.supplierType, no enum
  name      String
  referent  String?
  email     String?
  phone     String?
  address   String?
  notes     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type])
  @@index([isActive])
}
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && npx prisma migrate dev --name add_business_contact`
Expected: a new migration folder under `backend/prisma/migrations/`, applied cleanly to your local dev database, Prisma Client regenerated. If your local dev database has drift unrelated to this change (a known recurring issue in this project — see prior session notes), use a dedicated fresh Postgres container and `prisma migrate deploy` first, then retry `migrate dev`, exactly as done for previous features in this project.

- [ ] **Step 3: Commit the schema + migration**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(purchasing): add BusinessContact model for Clienti/Agenti"
```

- [ ] **Step 4: Write the failing repo tests**

Create `backend/tests/repositories/purchasing/business-contacts.repo.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  findAllBusinessContacts, createBusinessContact, updateBusinessContact, deactivateBusinessContact,
} from "../../../src/repositories/purchasing/business-contacts.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("business-contacts.repo", () => {
  it("creates a business contact and finds it in the list", async () => {
    await createBusinessContact(db.prisma, { type: "CLIENTE", name: "Acme Retail Srl" });
    const all = await findAllBusinessContacts(db.prisma);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Acme Retail Srl");
    expect(all[0].type).toBe("CLIENTE");
    expect(all[0].isActive).toBe(true);
  });

  it("creates a business contact with all optional fields set", async () => {
    const c = await createBusinessContact(db.prisma, {
      type: "AGENTE", name: "Mario Rossi", referent: "Mario Rossi", email: "mario@example.com",
      phone: "+39 333 1234567", address: "Via Roma 1, Milano", notes: "Agente Nord Italia",
    });
    expect(c.email).toBe("mario@example.com");
    expect(c.notes).toBe("Agente Nord Italia");
  });

  it("updates name/referent/email/phone/address/notes without touching type", async () => {
    const c = await createBusinessContact(db.prisma, { type: "CLIENTE", name: "Old Name" });
    const updated = await updateBusinessContact(db.prisma, c.id, {
      name: "New Name", referent: "New Referent", email: "new@example.com",
      phone: "123", address: "New Address", notes: "New Notes",
    });
    expect(updated.name).toBe("New Name");
    expect(updated.referent).toBe("New Referent");
    expect(updated.type).toBe("CLIENTE");
  });

  it("deactivate sets isActive=false instead of deleting the row", async () => {
    const c = await createBusinessContact(db.prisma, { type: "AGENTE", name: "To Deactivate" });
    await deactivateBusinessContact(db.prisma, c.id);
    const row = await db.prisma.businessContact.findUnique({ where: { id: c.id } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(false);
  });
});
```

- [ ] **Step 5: Run the tests and confirm they fail**

Run: `cd backend && npx vitest run tests/repositories/purchasing/business-contacts.repo.test.ts`
Expected: FAIL — the repo module doesn't exist yet.

- [ ] **Step 6: Implement the repository**

Create `backend/src/repositories/purchasing/business-contacts.repo.ts`:

```ts
// repositories/purchasing/business-contacts.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, BusinessContact } from "@prisma/client";

export async function findAllBusinessContacts(prisma: PrismaClient): Promise<BusinessContact[]> {
  return prisma.businessContact.findMany({ orderBy: { name: "asc" } });
}

export interface CreateBusinessContactInput {
  type: string;
  name: string;
  referent?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export async function createBusinessContact(
  prisma: PrismaClient,
  data: CreateBusinessContactInput
): Promise<BusinessContact> {
  return prisma.businessContact.create({ data });
}

export async function updateBusinessContact(
  prisma: PrismaClient,
  id: string,
  data: Partial<{
    name: string; referent: string | null; email: string | null;
    phone: string | null; address: string | null; notes: string | null;
  }>
): Promise<BusinessContact> {
  return prisma.businessContact.update({ where: { id }, data });
}

export async function deactivateBusinessContact(prisma: PrismaClient, id: string): Promise<BusinessContact> {
  return prisma.businessContact.update({ where: { id }, data: { isActive: false } });
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd backend && npx vitest run tests/repositories/purchasing/business-contacts.repo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/src/repositories/purchasing/business-contacts.repo.ts backend/tests/repositories/purchasing/business-contacts.repo.test.ts
git commit -m "feat(purchasing): add business-contacts repository"
```

- [ ] **Step 9: Write the failing route tests**

Create `backend/tests/integration/purchasing-business-contacts.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { businessContactsRouter } = await import("../../src/purchasing/routes/business-contacts.routes");
  app = express();
  app.use(express.json());
  app.use("/api/purchasing", businessContactsRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("purchasing business-contacts routes", () => {
  it("POST + GET /business-contacts round-trips a contact", async () => {
    const post = await request(app).post("/api/purchasing/business-contacts").send({ type: "CLIENTE", name: "Acme Retail Srl" });
    expect(post.status).toBe(200);
    const get = await request(app).get("/api/purchasing/business-contacts");
    expect(get.body).toHaveLength(1);
    expect(get.body[0].type).toBe("CLIENTE");
  });

  it("POST /business-contacts rejects a missing name with 400", async () => {
    const res = await request(app).post("/api/purchasing/business-contacts").send({ type: "CLIENTE" });
    expect(res.status).toBe(400);
  });

  it("PUT /business-contacts/:id updates fields and returns 404 for a non-existent id", async () => {
    const post = await request(app).post("/api/purchasing/business-contacts").send({ type: "AGENTE", name: "Mario Rossi" });
    const put = await request(app).put(`/api/purchasing/business-contacts/${post.body.id}`).send({ name: "Mario Bianchi" });
    expect(put.status).toBe(200);
    expect(put.body.name).toBe("Mario Bianchi");

    const missing = await request(app).put("/api/purchasing/business-contacts/does-not-exist").send({ name: "X" });
    expect(missing.status).toBe(404);
  });

  it("DELETE /business-contacts/:id deactivates, does not remove the row", async () => {
    const post = await request(app).post("/api/purchasing/business-contacts").send({ type: "CLIENTE", name: "X" });
    await request(app).delete(`/api/purchasing/business-contacts/${post.body.id}`);
    const row = await db.prisma.businessContact.findUnique({ where: { id: post.body.id } });
    expect(row!.isActive).toBe(false);
  });
});
```

- [ ] **Step 10: Run the tests and confirm they fail**

Run: `cd backend && npx vitest run tests/integration/purchasing-business-contacts.test.ts`
Expected: FAIL — route module doesn't exist yet.

- [ ] **Step 11: Implement the routes and mount them**

Create `backend/src/purchasing/routes/business-contacts.routes.ts`:

```ts
// purchasing/routes/business-contacts.routes.ts — BusinessContact CRUD (Clienti/Agenti).
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  findAllBusinessContacts, createBusinessContact, updateBusinessContact, deactivateBusinessContact,
} from "../../repositories/purchasing/business-contacts.repo";

export const businessContactsRouter = Router();

businessContactsRouter.get("/business-contacts", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllBusinessContacts(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

businessContactsRouter.post("/business-contacts", async (req: Request, res: Response) => {
  try {
    const { type, name, referent, email, phone, address, notes } = req.body ?? {};
    if (!type || !name) return res.status(400).json({ error: "type and name required" });
    res.json(await createBusinessContact(prisma, {
      type, name, referent: referent ?? null, email: email ?? null, phone: phone ?? null,
      address: address ?? null, notes: notes ?? null,
    }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

businessContactsRouter.put("/business-contacts/:id", async (req: Request, res: Response) => {
  try {
    const { name, referent, email, phone, address, notes } = req.body ?? {};
    res.json(await updateBusinessContact(prisma, req.params.id, { name, referent, email, phone, address, notes }));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "BusinessContact not found" });
    res.status(500).json({ error: String(err) });
  }
});

businessContactsRouter.delete("/business-contacts/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivateBusinessContact(prisma, req.params.id));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "BusinessContact not found" });
    res.status(500).json({ error: String(err) });
  }
});
```

In `backend/src/server.ts`, add the import next to the other purchasing route imports (near line 35, after `paymentDuesRouter`):

```ts
import { businessContactsRouter } from "./purchasing/routes/business-contacts.routes";
```

And mount it next to the other `/api/purchasing` mounts (near line 164, after `suppliersRouter`):

```ts
app.use("/api/purchasing", requireAuth, businessContactsRouter);
```

- [ ] **Step 12: Run the tests and confirm they pass**

Run: `cd backend && npx vitest run tests/integration/purchasing-business-contacts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 13: Commit**

```bash
git add backend/src/purchasing/routes/business-contacts.routes.ts backend/src/server.ts backend/tests/integration/purchasing-business-contacts.test.ts
git commit -m "feat(purchasing): add business-contacts routes"
```

---

### Task 2: Frontend — API client

**Files:**
- Modify: `frontend/src/lib/api/purchasing.ts`

**Interfaces:**
- Produces: `BusinessContact`, `CreateBusinessContactInput`, `UpdateBusinessContactInput` types; `api.purchasing.businessContacts.{list,create,update,deactivate}` — consumed by Tasks 3–4.

- [ ] **Step 1: Add the types and API methods**

In `frontend/src/lib/api/purchasing.ts`, add these three interfaces near the other type definitions (after the `BankAccount`-related interfaces):

```ts
export interface BusinessContact {
  id: string; type: string; name: string; referent: string | null; email: string | null;
  phone: string | null; address: string | null; notes: string | null; isActive: boolean;
}

export interface CreateBusinessContactInput {
  type: string; name: string; referent?: string; email?: string; phone?: string; address?: string; notes?: string;
}

export interface UpdateBusinessContactInput {
  name: string; referent?: string; email?: string; phone?: string; address?: string; notes?: string;
}
```

Add this new key inside the exported `purchasing` object, after `bankAccounts`:

```ts
  businessContacts: {
    list: () => get<BusinessContact[]>("/api/purchasing/business-contacts"),
    create: (data: CreateBusinessContactInput) => post<BusinessContact>("/api/purchasing/business-contacts", data),
    update: (id: string, data: UpdateBusinessContactInput) => put<BusinessContact>(`/api/purchasing/business-contacts/${id}`, data),
    deactivate: (id: string) => del(`/api/purchasing/business-contacts/${id}`),
  },
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/purchasing.ts
git commit -m "feat(purchasing): add businessContacts to the API client"
```

---

### Task 3: Frontend — `ContactForm` and `ContactsTab` shared components

**Files:**
- Create: `frontend/src/components/purchasing/ContactForm.tsx`
- Create: `frontend/src/components/purchasing/ContactsTab.tsx`

**Interfaces:**
- Consumes: `api.purchasing.businessContacts.list()`, `BusinessContact` type from Task 2. `PageHeader`, `TabsWithCount` from `frontend/src/components/ui/` (built in the prior Fornitori dense-pattern feature, unchanged).
- Produces: `ContactForm` component, `ContactFormState`, `EMPTY_CONTACT_FORM`. `ContactsTab({ type, basePath, title })` component — both consumed by Task 4.

- [ ] **Step 1: Create `ContactForm.tsx`**

Create `frontend/src/components/purchasing/ContactForm.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

export interface ContactFormState {
  name: string; referent: string; email: string; phone: string; address: string; notes: string;
}

export const EMPTY_CONTACT_FORM: ContactFormState = {
  name: "", referent: "", email: "", phone: "", address: "", notes: "",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-white pb-2 border-b border-bg-border">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-zinc-400 flex flex-col gap-1">
      {label}
      {children}
    </label>
  );
}

const inputClass = "bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-primary/50";

interface Props {
  initial?: Partial<ContactFormState>;
  submitLabel: string;
  onSubmit: (data: ContactFormState) => Promise<void>;
}

export default function ContactForm({ initial, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<ContactFormState>({ ...EMPTY_CONTACT_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ ...EMPTY_CONTACT_FORM, ...initial });
  }, [initial]);

  const set = <K extends keyof ContactFormState>(key: K, value: ContactFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section title="Contatto">
        <Field label="Nome *"><input required className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} /></Field>
        <Field label="Referente"><input className={inputClass} value={form.referent} onChange={e => set("referent", e.target.value)} /></Field>
        <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={e => set("email", e.target.value)} /></Field>
        <Field label="Telefono"><input className={inputClass} value={form.phone} onChange={e => set("phone", e.target.value)} /></Field>
        <Field label="Indirizzo"><input className={inputClass} value={form.address} onChange={e => set("address", e.target.value)} /></Field>
        <Field label="Note"><input className={inputClass} value={form.notes} onChange={e => set("notes", e.target.value)} /></Field>
      </Section>

      {error && <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">{error}</div>}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-accent-primary text-bg-base text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? "Salvataggio…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `ContactsTab.tsx`**

Create `frontend/src/components/purchasing/ContactsTab.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { BusinessContact } from "@/lib/api/purchasing";
import PageHeader from "@/components/ui/PageHeader";
import TabsWithCount from "@/components/ui/TabsWithCount";

interface Props {
  type: string;
  basePath: string;
  title: string;
}

export default function ContactsTab({ type, basePath, title }: Props) {
  const [rows, setRows] = useState<BusinessContact[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const load = useCallback(() => { api.purchasing.businessContacts.list().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const typeRows = useMemo(() => rows.filter(r => r.type === type), [rows, type]);
  const activeCount = typeRows.filter(r => r.isActive).length;
  const inactiveCount = typeRows.filter(r => !r.isActive).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return typeRows
      .filter(r => (tab === "active" ? r.isActive : !r.isActive))
      .filter(r => !q || [r.name, r.referent, r.email, r.phone]
        .some(field => field?.toLowerCase().includes(q)));
  }, [typeRows, tab, search]);

  return (
    <div className="space-y-3">
      <PageHeader
        title={title}
        summary={`${typeRows.length} ${title.toLowerCase()}`}
        search={{ value: search, onChange: setSearch, placeholder: "Cerca nome, referente, email..." }}
        actions={
          <Link
            href={`${basePath}/nuovo`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
          >
            <Plus size={13} /> Nuovo
          </Link>
        }
      />

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
              <th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Referente</th>
              <th className="px-3 py-2.5">Email</th><th className="px-3 py-2.5">Telefono</th>
              <th className="px-3 py-2.5">Stato</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                <td className="px-3 py-2.5">
                  <Link href={`${basePath}/${r.id}`} className="font-medium text-accent-primary hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2.5">{r.referent ?? "—"}</td>
                <td className="px-3 py-2.5">{r.email ?? "—"}</td>
                <td className="px-3 py-2.5">{r.phone ?? "—"}</td>
                <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun contatto trovato</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/purchasing/ContactForm.tsx frontend/src/components/purchasing/ContactsTab.tsx
git commit -m "feat(purchasing): add generic ContactForm/ContactsTab components for Clienti/Agenti"
```

---

### Task 4: Frontend — Anagrafiche page + Clienti/Agenti create/edit pages

**Files:**
- Create: `frontend/src/app/acquisti/anagrafiche/page.tsx`
- Create: `frontend/src/app/acquisti/anagrafiche/clienti/nuovo/page.tsx`
- Create: `frontend/src/app/acquisti/anagrafiche/clienti/[id]/page.tsx`
- Create: `frontend/src/app/acquisti/anagrafiche/agenti/nuovo/page.tsx`
- Create: `frontend/src/app/acquisti/anagrafiche/agenti/[id]/page.tsx`

**Interfaces:**
- Consumes: `FornitoriTab` (unchanged, existing). `ContactForm`, `ContactsTab` from Task 3. `api.purchasing.businessContacts`, `api.suppliers.list()`.

- [ ] **Step 1: Create the top-level Anagrafiche page**

Create `frontend/src/app/acquisti/anagrafiche/page.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import FornitoriTab from "@/components/purchasing/FornitoriTab";
import ContactsTab from "@/components/purchasing/ContactsTab";
import TabsWithCount from "@/components/ui/TabsWithCount";
import { api } from "@/lib/api";

type AnagraficheTab = "fornitori" | "clienti" | "agenti";

export default function AnagrafichePage() {
  const [tab, setTab] = useState<AnagraficheTab>("fornitori");
  const [supplierCount, setSupplierCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);
  const [agentCount, setAgentCount] = useState(0);

  const loadCounts = useCallback(() => {
    api.suppliers.list().then(rows => setSupplierCount(rows.length)).catch(() => {});
    api.purchasing.businessContacts.list().then(rows => {
      setClientCount(rows.filter(r => r.type === "CLIENTE").length);
      setAgentCount(rows.filter(r => r.type === "AGENTE").length);
    }).catch(() => {});
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Anagrafiche</h1>
            <TabsWithCount
              tabs={[
                { id: "fornitori", label: "Fornitori", count: supplierCount },
                { id: "clienti", label: "Clienti", count: clientCount },
                { id: "agenti", label: "Agenti", count: agentCount },
              ]}
              activeId={tab}
              onChange={id => setTab(id as AnagraficheTab)}
            />
            {tab === "fornitori" && <FornitoriTab />}
            {tab === "clienti" && <ContactsTab type="CLIENTE" basePath="/acquisti/anagrafiche/clienti" title="Clienti" />}
            {tab === "agenti" && <ContactsTab type="AGENTE" basePath="/acquisti/anagrafiche/agenti" title="Agenti" />}
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the Clienti "nuovo" page**

Create `frontend/src/app/acquisti/anagrafiche/clienti/nuovo/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ContactForm, { EMPTY_CONTACT_FORM, ContactFormState } from "@/components/purchasing/ContactForm";
import { api } from "@/lib/api";

export default function NuovoClientePage() {
  const router = useRouter();

  const handleSubmit = async (form: ContactFormState) => {
    await api.purchasing.businessContacts.create({
      type: "CLIENTE", name: form.name, referent: form.referent || undefined, email: form.email || undefined,
      phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/anagrafiche");
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Cliente</h1>
            <ContactForm initial={EMPTY_CONTACT_FORM} submitLabel="Crea cliente" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the Clienti edit page**

Create `frontend/src/app/acquisti/anagrafiche/clienti/[id]/page.tsx`:

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ContactForm, { ContactFormState } from "@/components/purchasing/ContactForm";
import { api } from "@/lib/api";
import type { BusinessContact } from "@/lib/api/purchasing";

export default function ModificaClientePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [contact, setContact] = useState<BusinessContact | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.businessContacts.list()
      .then(rows => setContact(rows.find(c => c.id === params.id) ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: ContactFormState) => {
    await api.purchasing.businessContacts.update(params.id, {
      name: form.name, referent: form.referent || undefined, email: form.email || undefined,
      phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/anagrafiche");
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!contact) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Cliente non trovato</div>;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">{contact.name}</h1>
            <ContactForm
              initial={{
                name: contact.name, referent: contact.referent ?? "", email: contact.email ?? "",
                phone: contact.phone ?? "", address: contact.address ?? "", notes: contact.notes ?? "",
              }}
              submitLabel="Salva modifiche"
              onSubmit={handleSubmit}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the Agenti "nuovo" page**

Create `frontend/src/app/acquisti/anagrafiche/agenti/nuovo/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ContactForm, { EMPTY_CONTACT_FORM, ContactFormState } from "@/components/purchasing/ContactForm";
import { api } from "@/lib/api";

export default function NuovoAgentePage() {
  const router = useRouter();

  const handleSubmit = async (form: ContactFormState) => {
    await api.purchasing.businessContacts.create({
      type: "AGENTE", name: form.name, referent: form.referent || undefined, email: form.email || undefined,
      phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/anagrafiche");
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Agente</h1>
            <ContactForm initial={EMPTY_CONTACT_FORM} submitLabel="Crea agente" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the Agenti edit page**

Create `frontend/src/app/acquisti/anagrafiche/agenti/[id]/page.tsx`:

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ContactForm, { ContactFormState } from "@/components/purchasing/ContactForm";
import { api } from "@/lib/api";
import type { BusinessContact } from "@/lib/api/purchasing";

export default function ModificaAgentePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [contact, setContact] = useState<BusinessContact | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.businessContacts.list()
      .then(rows => setContact(rows.find(c => c.id === params.id) ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: ContactFormState) => {
    await api.purchasing.businessContacts.update(params.id, {
      name: form.name, referent: form.referent || undefined, email: form.email || undefined,
      phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/anagrafiche");
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!contact) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Agente non trovato</div>;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">{contact.name}</h1>
            <ContactForm
              initial={{
                name: contact.name, referent: contact.referent ?? "", email: contact.email ?? "",
                phone: contact.phone ?? "", address: contact.address ?? "", notes: contact.notes ?? "",
              }}
              submitLabel="Salva modifiche"
              onSubmit={handleSubmit}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/acquisti/anagrafiche
git commit -m "feat(purchasing): add Anagrafiche page with Fornitori/Clienti/Agenti tabs"
```

---

### Task 5: Frontend — redirect old Fornitori page, update sidebar and work-areas hub

**Files:**
- Modify: `frontend/src/app/acquisti/fornitori/page.tsx`
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx`
- Modify: `frontend/src/components/purchasing/dashboard/WorkAreasHub.tsx`

**Interfaces:**
- Consumes: nothing new — this task only repoints existing navigation.

- [ ] **Step 1: Redirect the old Fornitori list page**

Replace the entire contents of `frontend/src/app/acquisti/fornitori/page.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FornitoriPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/acquisti/anagrafiche"); }, [router]);
  return null;
}
```

Note: `frontend/src/app/acquisti/fornitori/nuovo/page.tsx` and `frontend/src/app/acquisti/fornitori/[id]/page.tsx` are **not** touched — only this list page moves.

- [ ] **Step 2: Update the sidebar**

In `frontend/src/components/layout/GlobalSidebar.tsx`, in the `"amministrazione"` group's `items` array, change:

```ts
      { href: "/acquisti/fornitori", label: "Fornitori" },
```

to:

```ts
      { href: "/acquisti/anagrafiche", label: "Anagrafiche" },
```

- [ ] **Step 3: Update the work-areas hub**

In `frontend/src/components/purchasing/dashboard/WorkAreasHub.tsx`, change the import on line 3 from:

```ts
import { Truck, ShoppingCart, Boxes, Landmark, CalendarClock } from "lucide-react";
```

to:

```ts
import { Users, ShoppingCart, Boxes, Landmark, CalendarClock } from "lucide-react";
```

And change the first entry in the `AREAS` array from:

```ts
  { href: "/acquisti/fornitori", label: "Fornitori", icon: Truck },
```

to:

```ts
  { href: "/acquisti/anagrafiche", label: "Anagrafiche", icon: Users },
```

- [ ] **Step 4: Type-check and manually verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

With the dev servers running, manually verify: the sidebar shows "Anagrafiche" instead of "Fornitori" and links to `/acquisti/anagrafiche`; the dashboard's work-areas hub tile shows "Anagrafiche" with a Users icon; visiting `/acquisti/fornitori` directly redirects to `/acquisti/anagrafiche`; on `/acquisti/anagrafiche`, the Fornitori tab shows the existing Fornitori list unchanged, and the Clienti/Agenti tabs show empty states with working "+ Nuovo" buttons; creating a Cliente and an Agente both work end-to-end (create → list → edit → save); the tab counts at the top (Fornitori/Clienti/Agenti) update after creating a new contact and revisiting the page.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/acquisti/fornitori/page.tsx frontend/src/components/layout/GlobalSidebar.tsx frontend/src/components/purchasing/dashboard/WorkAreasHub.tsx
git commit -m "feat(purchasing): repoint navigation from Fornitori to Anagrafiche"
```

---

## Final Verification

After all 5 tasks are complete:

- [ ] Run the full backend purchasing suite: `cd backend && npx vitest run tests/repositories/purchasing tests/integration/purchasing-business-contacts.test.ts tests/integration/purchasing-suppliers.test.ts` — expect all passing, no regressions.
- [ ] Run `cd frontend && npx tsc --noEmit` and `cd backend && npx tsc --noEmit` — both clean.
- [ ] Manual smoke test of `/acquisti/anagrafiche` as described in Task 5 Step 4.
- [ ] Proceed to the final whole-branch review (superpowers:requesting-code-review) and superpowers:finishing-a-development-branch, per subagent-driven-development.
