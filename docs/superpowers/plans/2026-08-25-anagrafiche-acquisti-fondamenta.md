# Anagrafiche acquisti — Fondamenta (Parte 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Magazzini, Banche and Condizioni di pagamento from read-only tables into pages with full create/edit CRUD, plus usage counters and a live payment-schedule preview, per `docs/superpowers/specs/2026-08-25-anagrafiche-acquisti-fondamenta-design.md`.

**Architecture:** Backend fills the one real gap (no `PaymentTerm` update endpoint) and adds `_count` includes to two existing list queries — no schema changes, no migration. Frontend gets three new forms following the established `SupplierForm.tsx` `Section`/`Field` pattern, three new `nuovo`/`[id]` page pairs mirroring `fornitori/nuovo` and `fornitori/[id]`, a small pure client-side mirror of the backend's payment-schedule math for the live preview, and the three existing `*Tab.tsx` list components gain a "+ Nuovo" button, clickable rows, and (for Magazzini/Condizioni pagamento) a usage column.

**Tech Stack:** Node/Express/TypeScript + Prisma (backend), Next.js 14 + Tailwind (frontend), Vitest + Testcontainers (backend tests), Vitest + jsdom (frontend tests).

## Global Constraints

- Repository layer only: routes/services never call Prisma directly — only `backend/src/repositories/**` (`CLAUDE.md`).
- No schema changes, no new Prisma migration — every field this plan touches already exists (confirmed in the design spec §2).
- All Decimal DB columns (`percentage`, `openingBalance`, etc.) already arrive as plain JS `number` at the repository boundary — a global Prisma client extension (`backend/src/db.ts`, `convertDecimalsDeep`) converts every `Decimal` automatically. Never call `.toNumber()` or add manual Decimal handling in this plan's code.
- Frontend forms follow the `Section`/`Field` component pair and `inputClass` constant exactly as defined in `frontend/src/components/purchasing/SupplierForm.tsx` (dark theme: `bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-primary/50`).
- Matching this codebase's existing convention (confirmed: `SupplierForm.tsx`, `FornitoriTab.tsx`, and every page under `frontend/src/app/acquisti/fornitori/` have no dedicated test file), the new form components, tab components, and pages in Tasks 5–7 get no dedicated test files. Pure/computational code (repository functions, `payment-schedule.ts`) does get tests, following `backend/tests/repositories/purchasing/*.test.ts` and `frontend/src/lib/mergeOrders.test.ts`.
- Backend tests use Testcontainers via `setupTestDb()`/`truncateAll()` (`backend/tests/helpers/db.ts`) — run with `cd backend && npx vitest run <path>`.
- Frontend tests: `cd frontend && npx vitest run <path>`.

---

### Task 1: Backend — `updatePaymentTerm()` repository function + `PUT /payment-terms/:id` route

**Files:**
- Modify: `backend/src/repositories/purchasing/payment-terms.repo.ts`
- Modify: `backend/src/purchasing/routes/master-data.routes.ts`
- Test: `backend/tests/repositories/purchasing/payment-terms.repo.test.ts`
- Test: `backend/tests/integration/purchasing-master-data.test.ts`

**Interfaces:**
- Produces: `updatePaymentTerm(prisma: PrismaClient, id: string, data: UpdatePaymentTermInput): Promise<PaymentTermWithInstallments>` where `UpdatePaymentTermInput = { name: string; type: string; endOfMonth: boolean; fixedDay?: number | null; paymentMethod: PurchasePaymentMethod; installments: { installmentNumber: number; offsetDays: number; percentage: number }[] }`.
- Produces: `PUT /payment-terms/:id` route — 200 with the updated term on success, 400 if installment percentages don't sum to 100 (±0.01), 404 if the id doesn't exist.

- [ ] **Step 1: Write the failing repo tests**

Open `backend/tests/repositories/purchasing/payment-terms.repo.test.ts`. Update the import on line 3 to include `updatePaymentTerm`:

```ts
import { findAllPaymentTerms, createPaymentTerm, updatePaymentTerm, deactivatePaymentTerm } from "../../../src/repositories/purchasing/payment-terms.repo";
```

Add these two `it` blocks inside the existing `describe("payment-terms.repo", ...)`, after the `"deactivate sets isActive=false..."` test:

```ts
  it("updates a payment term's fields and replaces all installments", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "Old Name", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });

    const updated = await updatePaymentTerm(db.prisma, term.id, {
      name: "New Name", type: "RIBA", endOfMonth: true, fixedDay: 10, paymentMethod: "RIBA",
      installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 50 },
        { installmentNumber: 2, offsetDays: 60, percentage: 50 },
      ],
    });

    expect(updated.name).toBe("New Name");
    expect(updated.type).toBe("RIBA");
    expect(updated.endOfMonth).toBe(true);
    expect(updated.fixedDay).toBe(10);
    expect(updated.installments).toHaveLength(2);
    expect(updated.installments.map(i => i.offsetDays)).toEqual([30, 60]);

    const row = await db.prisma.paymentTerm.findUnique({ where: { id: term.id }, include: { installments: true } });
    expect(row!.installments).toHaveLength(2); // the old single installment is gone, not left dangling
  });

  it("rejects installment percentages that don't sum to 100 on update, leaving existing installments untouched", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });

    await expect(updatePaymentTerm(db.prisma, term.id, {
      name: "Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 50 }],
    })).rejects.toThrow(/100/);

    const row = await db.prisma.paymentTerm.findUnique({ where: { id: term.id }, include: { installments: true } });
    expect(row!.installments).toHaveLength(1);
    expect(Number(row!.installments[0].percentage)).toBe(100);
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd backend && npx vitest run tests/repositories/purchasing/payment-terms.repo.test.ts`
Expected: FAIL — `updatePaymentTerm is not a function` (or a TypeScript import error).

- [ ] **Step 3: Implement `updatePaymentTerm`**

In `backend/src/repositories/purchasing/payment-terms.repo.ts`, add this new export directly after `createPaymentTerm` (before `deactivatePaymentTerm`):

```ts
export interface UpdatePaymentTermInput {
  name: string;
  type: string;
  endOfMonth: boolean;
  fixedDay?: number | null;
  paymentMethod: PurchasePaymentMethod;
  installments: { installmentNumber: number; offsetDays: number; percentage: number }[];
}

export async function updatePaymentTerm(
  prisma: PrismaClient,
  id: string,
  data: UpdatePaymentTermInput
): Promise<PaymentTermWithInstallments> {
  const totalPct = data.installments.reduce((s, i) => s + i.percentage, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Installment percentages must sum to 100, got ${totalPct}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.paymentTermInstallmentRule.deleteMany({ where: { paymentTermId: id } });
    return tx.paymentTerm.update({
      where: { id },
      data: {
        name: data.name, type: data.type, endOfMonth: data.endOfMonth,
        fixedDay: data.fixedDay ?? null, paymentMethod: data.paymentMethod,
        installments: { create: data.installments },
      },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
    });
  });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd backend && npx vitest run tests/repositories/purchasing/payment-terms.repo.test.ts`
Expected: PASS (5 tests: the 3 existing + the 2 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/payment-terms.repo.ts backend/tests/repositories/purchasing/payment-terms.repo.test.ts
git commit -m "feat(purchasing): add updatePaymentTerm repository function"
```

- [ ] **Step 6: Write the failing route tests**

In `backend/tests/integration/purchasing-master-data.test.ts`, add these two `it` blocks inside `describe("purchasing master-data routes", ...)`, after the existing `"DELETE /warehouses/:id deactivates..."` test:

```ts
  it("PUT /payment-terms/:id replaces installments and rejects a bad percentage sum with 400", async () => {
    const post = await request(app).post("/api/purchasing/payment-terms").send({
      name: "Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });

    const put = await request(app).put(`/api/purchasing/payment-terms/${post.body.id}`).send({
      name: "Term Updated", type: "RIBA", endOfMonth: false, paymentMethod: "RIBA",
      installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 60 },
        { installmentNumber: 2, offsetDays: 60, percentage: 40 },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.body.installments).toHaveLength(2);

    const bad = await request(app).put(`/api/purchasing/payment-terms/${post.body.id}`).send({
      name: "Term Updated", type: "RIBA", endOfMonth: false, paymentMethod: "RIBA",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 50 }],
    });
    expect(bad.status).toBe(400);
  });

  it("PUT /payment-terms/:id returns 404 for a non-existent id", async () => {
    const res = await request(app).put("/api/purchasing/payment-terms/does-not-exist").send({
      name: "X", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 7: Run the tests and confirm they fail**

Run: `cd backend && npx vitest run tests/integration/purchasing-master-data.test.ts`
Expected: FAIL — `PUT /api/purchasing/payment-terms/:id` returns 404 for the whole router (route doesn't exist yet), not the expected 200/400.

- [ ] **Step 8: Implement the route**

In `backend/src/purchasing/routes/master-data.routes.ts`, update the payment-terms import on line 5:

```ts
import { findAllPaymentTerms, createPaymentTerm, updatePaymentTerm, deactivatePaymentTerm } from "../../repositories/purchasing/payment-terms.repo";
```

Add this route directly after the existing `POST /payment-terms` handler (before `DELETE /payment-terms/:id`):

```ts
masterDataRouter.put("/payment-terms/:id", async (req: Request, res: Response) => {
  try {
    const { name, type, endOfMonth, fixedDay, paymentMethod, installments } = req.body ?? {};
    if (!name || !type || !paymentMethod || !Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({ error: "name, type, paymentMethod, installments[] required" });
    }
    const term = await updatePaymentTerm(prisma, req.params.id, {
      name, type, endOfMonth: !!endOfMonth, fixedDay: fixedDay ?? null, paymentMethod, installments,
    });
    res.json(term);
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "PaymentTerm not found" });
    const message = err instanceof Error ? err.message : String(err);
    if (/sum to 100/.test(message)) return res.status(400).json({ error: message });
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `cd backend && npx vitest run tests/integration/purchasing-master-data.test.ts`
Expected: PASS (6 tests: the 4 existing + the 2 new).

- [ ] **Step 10: Commit**

```bash
git add backend/src/purchasing/routes/master-data.routes.ts backend/tests/integration/purchasing-master-data.test.ts
git commit -m "feat(purchasing): add PUT /payment-terms/:id route"
```

---

### Task 2: Backend — usage counts on Warehouse and PaymentTerm list queries

**Files:**
- Modify: `backend/src/repositories/purchasing/warehouses.repo.ts`
- Modify: `backend/src/repositories/purchasing/payment-terms.repo.ts`
- Test: `backend/tests/repositories/purchasing/warehouses.repo.test.ts`
- Test: `backend/tests/repositories/purchasing/payment-terms.repo.test.ts`

**Interfaces:**
- Consumes: `createPurchaseOrder(prisma, CreatePurchaseOrderInput): Promise<PurchaseOrder>` from `backend/src/repositories/purchasing/purchase-orders.repo.ts` (existing, used only in tests here). `createSupplier(prisma, CreateSupplierInput): Promise<Supplier>` from `backend/src/repositories/purchasing/suppliers.repo.ts` (existing, used only in tests here).
- Produces: `findAllWarehouses()` rows now include `_count: { purchaseOrders: number }`. `findAllPaymentTerms()` rows now include `_count: { suppliers: number; purchaseOrders: number }`.

- [ ] **Step 1: Write the failing test for Warehouse usage count**

In `backend/tests/repositories/purchasing/warehouses.repo.test.ts`, add this import after the existing one:

```ts
import { createPurchaseOrder } from "../../../src/repositories/purchasing/purchase-orders.repo";
```

Add this `it` block inside `describe("warehouses.repo", ...)`, after the existing `"deactivate sets isActive=false..."` test:

```ts
  it("includes a _count of purchase orders referencing each warehouse", async () => {
    const used = await createWarehouse(db.prisma, { name: "Used Warehouse", code: "MAG-USED" });
    const unused = await createWarehouse(db.prisma, { name: "Unused Warehouse", code: "MAG-UNUSED" });

    const supplierId = (await db.prisma.supplier.create({
      data: { legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT" },
    })).id;
    const paymentTermId = (await db.prisma.paymentTerm.create({
      data: { name: "30gg", type: "STANDARD", paymentMethod: "BONIFICO" },
    })).id;
    const productId = (await db.prisma.product.create({ data: { name: "Widget Test" } })).id;
    const userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;

    await createPurchaseOrder(db.prisma, {
      supplierId, orderDate: new Date("2026-08-08"), currency: "EUR", buyerId: userId,
      warehouseId: used.id, paymentTermId,
      lines: [{ productId, description: "Widget Test", orderedQty: 1, unitOfMeasure: "PZ", unitPrice: 1, taxableAmount: 1, vatAmount: 0, totalAmount: 1 }],
    });

    const all = await findAllWarehouses(db.prisma);
    expect(all.find(w => w.id === used.id)!._count.purchaseOrders).toBe(1);
    expect(all.find(w => w.id === unused.id)!._count.purchaseOrders).toBe(0);
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd backend && npx vitest run tests/repositories/purchasing/warehouses.repo.test.ts`
Expected: FAIL — `Property '_count' does not exist` (TypeScript) or `undefined` at runtime, since `findAllWarehouses` doesn't include it yet.

- [ ] **Step 3: Add the `_count` include**

In `backend/src/repositories/purchasing/warehouses.repo.ts`, replace `findAllWarehouses`:

```ts
export async function findAllWarehouses(prisma: PrismaClient) {
  return prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { purchaseOrders: true } } },
  });
}
```

Note: the explicit `Promise<Warehouse[]>` return-type annotation is removed — Prisma infers the richer type (`Warehouse & { _count: { purchaseOrders: number } }`) from the `include`, and re-adding a narrower manual annotation would hide the new field from callers.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd backend && npx vitest run tests/repositories/purchasing/warehouses.repo.test.ts`
Expected: PASS (5 tests: the 4 existing + the 1 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/warehouses.repo.ts backend/tests/repositories/purchasing/warehouses.repo.test.ts
git commit -m "feat(purchasing): add purchase-order usage count to findAllWarehouses"
```

- [ ] **Step 6: Write the failing test for PaymentTerm usage counts**

In `backend/tests/repositories/purchasing/payment-terms.repo.test.ts`, add these imports after the existing one:

```ts
import { createSupplier } from "../../../src/repositories/purchasing/suppliers.repo";
import { createPurchaseOrder } from "../../../src/repositories/purchasing/purchase-orders.repo";
```

Add this `it` block inside `describe("payment-terms.repo", ...)`, after the tests added in Task 1:

```ts
  it("includes a _count of suppliers and purchase orders using each payment term", async () => {
    const used = await createPaymentTerm(db.prisma, {
      name: "Used Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });
    const unused = await createPaymentTerm(db.prisma, {
      name: "Unused Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }],
    });

    await createSupplier(db.prisma, {
      legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT",
      defaultPaymentTermId: used.id,
    });

    const warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino", code: "MAG-1" } })).id;
    const productId = (await db.prisma.product.create({ data: { name: "Widget Test" } })).id;
    const userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
    const supplierForOrderId = (await db.prisma.supplier.create({
      data: { legalName: "Order Supplier", internalCode: "FORN-002", supplierType: "Produttore", country: "IT" },
    })).id;
    await createPurchaseOrder(db.prisma, {
      supplierId: supplierForOrderId, orderDate: new Date("2026-08-08"), currency: "EUR", buyerId: userId,
      warehouseId, paymentTermId: used.id,
      lines: [{ productId, description: "Widget Test", orderedQty: 1, unitOfMeasure: "PZ", unitPrice: 1, taxableAmount: 1, vatAmount: 0, totalAmount: 1 }],
    });

    const all = await findAllPaymentTerms(db.prisma);
    const usedRow = all.find(t => t.id === used.id)!;
    const unusedRow = all.find(t => t.id === unused.id)!;
    expect(usedRow._count.suppliers).toBe(1);
    expect(usedRow._count.purchaseOrders).toBe(1);
    expect(unusedRow._count.suppliers).toBe(0);
    expect(unusedRow._count.purchaseOrders).toBe(0);
  });
```

- [ ] **Step 7: Run the test and confirm it fails**

Run: `cd backend && npx vitest run tests/repositories/purchasing/payment-terms.repo.test.ts`
Expected: FAIL — `_count` is `undefined`.

- [ ] **Step 8: Add the `_count` include**

In `backend/src/repositories/purchasing/payment-terms.repo.ts`, replace `findAllPaymentTerms`:

```ts
export async function findAllPaymentTerms(prisma: PrismaClient) {
  return prisma.paymentTerm.findMany({
    include: {
      installments: { orderBy: { installmentNumber: "asc" } },
      _count: { select: { suppliers: true, purchaseOrders: true } },
    },
    orderBy: { name: "asc" },
  });
}
```

Same note as Step 3: the `Promise<PaymentTermWithInstallments[]>` annotation is removed so Prisma's inferred type (which now also carries `_count`) flows through.

- [ ] **Step 9: Run the test and confirm it passes**

Run: `cd backend && npx vitest run tests/repositories/purchasing/payment-terms.repo.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 10: Commit**

```bash
git add backend/src/repositories/purchasing/payment-terms.repo.ts backend/tests/repositories/purchasing/payment-terms.repo.test.ts
git commit -m "feat(purchasing): add supplier/purchase-order usage counts to findAllPaymentTerms"
```

---

### Task 3: Frontend — API client (`update()` methods, `_count` types, `put()` helper)

**Files:**
- Modify: `frontend/src/lib/api/purchasing.ts`

**Interfaces:**
- Produces: `api.purchasing.warehouses.update(id, data)`, `api.purchasing.paymentTerms.update(id, data)`, `api.purchasing.bankAccounts.update(id, data)`.
- Produces: exported types `PaymentTermInput`, `CreateBankAccountInput`, `UpdateBankAccountInput` — consumed by Tasks 5–7's pages.
- Produces: `Warehouse._count: { purchaseOrders: number }`, `PaymentTerm._count: { suppliers: number; purchaseOrders: number }` — consumed by Tasks 5 and 7's tab components.

- [ ] **Step 1: Replace the file**

This is a small, fully-typed wrapper file with no existing test (confirmed: no file under `frontend/src/lib/api/*.test.ts` in this codebase — thin API clients aren't unit tested here). Replace the entire contents of `frontend/src/lib/api/purchasing.ts`:

```ts
// lib/api/purchasing.ts — Warehouse, PaymentTerm, BankAccount master data.
import { apiUrl, get } from "./client";

export interface Warehouse {
  id: string; name: string; code: string; address: string | null; isActive: boolean;
  _count: { purchaseOrders: number };
}

export interface PaymentTermInstallmentRule {
  id: string; installmentNumber: number; offsetDays: number; percentage: number;
}

export interface PaymentTerm {
  id: string; name: string; type: string; endOfMonth: boolean; fixedDay: number | null;
  paymentMethod: string; isActive: boolean; installments: PaymentTermInstallmentRule[];
  _count: { suppliers: number; purchaseOrders: number };
}

export interface PaymentTermInput {
  name: string; type: string; endOfMonth: boolean; fixedDay?: number;
  paymentMethod: string;
  installments: { installmentNumber: number; offsetDays: number; percentage: number }[];
}

export interface BankAccount {
  id: string; bankName: string; alias: string; accountHolder: string; iban: string;
  bic: string | null; currency: string; openingBalance: number; openingBalanceDate: string;
  isActive: boolean; accountingCode: string | null; notes: string | null;
}

export interface CreateBankAccountInput {
  bankName: string; alias: string; accountHolder: string; iban: string; bic?: string;
  currency?: string; openingBalance: number; openingBalanceDate: string;
  accountingCode?: string; notes?: string;
}

export interface UpdateBankAccountInput {
  bankName: string; alias: string; accountHolder: string; bic?: string; accountingCode?: string; notes?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PUT", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(apiUrl(path), { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export const purchasing = {
  warehouses: {
    list: () => get<Warehouse[]>("/api/purchasing/warehouses"),
    create: (data: { name: string; code: string; address?: string }) => post<Warehouse>("/api/purchasing/warehouses", data),
    update: (id: string, data: { name: string; address?: string }) => put<Warehouse>(`/api/purchasing/warehouses/${id}`, data),
    deactivate: (id: string) => del(`/api/purchasing/warehouses/${id}`),
  },
  paymentTerms: {
    list: () => get<PaymentTerm[]>("/api/purchasing/payment-terms"),
    create: (data: PaymentTermInput) => post<PaymentTerm>("/api/purchasing/payment-terms", data),
    update: (id: string, data: PaymentTermInput) => put<PaymentTerm>(`/api/purchasing/payment-terms/${id}`, data),
    deactivate: (id: string) => del(`/api/purchasing/payment-terms/${id}`),
  },
  bankAccounts: {
    list: () => get<BankAccount[]>("/api/purchasing/bank-accounts"),
    create: (data: CreateBankAccountInput) => post<BankAccount>("/api/purchasing/bank-accounts", data),
    update: (id: string, data: UpdateBankAccountInput) => put<BankAccount>(`/api/purchasing/bank-accounts/${id}`, data),
    deactivate: (id: string) => del(`/api/purchasing/bank-accounts/${id}`),
  },
};
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: fails at this point with errors in `MagazziniTab.tsx`/`BancheTab.tsx`/`CondizioniPagamentoTab.tsx` if they reference removed fields, or passes cleanly if not — these three components only read fields that still exist (`code`, `name`, `address`, `isActive`, `alias`, `bankName`, `iban`, `openingBalance`, `paymentMethod`, `installments`), so this step is expected to PASS. If it doesn't, stop and re-check the type definitions above against current usages in those three files before proceeding.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/purchasing.ts
git commit -m "feat(purchasing): add update() methods and _count types to the master-data API client"
```

---

### Task 4: Frontend — client-side payment-schedule mirror

**Files:**
- Create: `frontend/src/lib/payment-schedule.ts`
- Test: `frontend/src/lib/payment-schedule.test.ts`

**Interfaces:**
- Produces: `computeDueDate(anchorDate: Date, endOfMonth: boolean, fixedDay: number | null, offsetDays: number): Date` and `computePaymentSchedule(anchorDate: Date, term: { endOfMonth: boolean; fixedDay: number | null; installments: { installmentNumber: number; offsetDays: number; percentage: number }[] }, totalAmount: number): { installmentNumber: number; dueDate: Date; amount: number }[]` — consumed by Task 7's `PaymentTermForm.tsx`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/payment-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDueDate, computePaymentSchedule } from "./payment-schedule";

describe("computeDueDate", () => {
  it("plain offsetDays, no end-of-month, no fixed day", () => {
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), false, null, 30);
    expect(due.toISOString().slice(0, 10)).toBe("2026-04-04");
  });

  it("end-of-month rolls the anchor to the last day of its month before adding days", () => {
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), true, null, 0);
    expect(due.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("the approved worked example: 2026-03-05, 30 days, end-of-month on, fixed day 10 -> 2026-05-10", () => {
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), true, 10, 30);
    expect(due.toISOString().slice(0, 10)).toBe("2026-05-10");
  });

  it("fixed day always moves to the NEXT month, even if fixedDay is later in the same month as the step-2 result", () => {
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), false, 20, 31);
    expect(due.toISOString().slice(0, 10)).toBe("2026-05-20");
  });

  it("fixed day rollover from December lands in January of the next year", () => {
    const due = computeDueDate(new Date("2026-12-15T00:00:00.000Z"), false, 10, 5);
    expect(due.toISOString().slice(0, 10)).toBe("2027-01-10");
  });
});

describe("computePaymentSchedule", () => {
  it("splits totalAmount across installments by percentage, sorted by installmentNumber", () => {
    const schedule = computePaymentSchedule(
      new Date("2026-03-05T00:00:00.000Z"),
      { endOfMonth: false, fixedDay: null, installments: [
        { installmentNumber: 2, offsetDays: 60, percentage: 50 },
        { installmentNumber: 1, offsetDays: 30, percentage: 50 },
      ] },
      1000
    );
    expect(schedule.map(s => s.installmentNumber)).toEqual([1, 2]);
    expect(schedule[0].amount).toBe(500);
    expect(schedule[1].amount).toBe(500);
  });

  it("the last installment absorbs any rounding remainder so the sum always equals totalAmount exactly", () => {
    const schedule = computePaymentSchedule(
      new Date("2026-03-05T00:00:00.000Z"),
      { endOfMonth: false, fixedDay: null, installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 33.33 },
        { installmentNumber: 2, offsetDays: 60, percentage: 33.33 },
        { installmentNumber: 3, offsetDays: 90, percentage: 33.34 },
      ] },
      100
    );
    const sumCents = schedule.reduce((s, i) => s + Math.round(i.amount * 100), 0);
    expect(sumCents).toBe(10000);
  });

  it("a single 100% installment gets the full amount on the computed due date", () => {
    const schedule = computePaymentSchedule(
      new Date("2026-03-05T00:00:00.000Z"),
      { endOfMonth: false, fixedDay: null, installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }] },
      305.5
    );
    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(305.5);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd frontend && npx vitest run src/lib/payment-schedule.test.ts`
Expected: FAIL — cannot find module `./payment-schedule`.

- [ ] **Step 3: Implement the mirror**

Create `frontend/src/lib/payment-schedule.ts`:

```ts
// lib/payment-schedule.ts — pure mirror of backend/src/purchasing/payment-schedule.ts.
// Same UTC-only logic, same rounding rules. Powers the live preview in
// PaymentTermForm.tsx. If the backend version changes, update this one too.

export function computeDueDate(
  anchorDate: Date,
  endOfMonth: boolean,
  fixedDay: number | null,
  offsetDays: number
): Date {
  let y = anchorDate.getUTCFullYear();
  let m = anchorDate.getUTCMonth();
  let d = anchorDate.getUTCDate();

  if (endOfMonth) {
    const eom = new Date(Date.UTC(y, m + 1, 0));
    y = eom.getUTCFullYear();
    m = eom.getUTCMonth();
    d = eom.getUTCDate();
  }

  const afterOffset = new Date(Date.UTC(y, m, d + offsetDays));

  if (fixedDay !== null) {
    return new Date(Date.UTC(afterOffset.getUTCFullYear(), afterOffset.getUTCMonth() + 1, fixedDay));
  }
  return afterOffset;
}

export interface PreviewInstallment { installmentNumber: number; offsetDays: number; percentage: number; }
export interface ScheduledInstallment { installmentNumber: number; dueDate: Date; amount: number; }

export function computePaymentSchedule(
  anchorDate: Date,
  term: { endOfMonth: boolean; fixedDay: number | null; installments: PreviewInstallment[] },
  totalAmount: number
): ScheduledInstallment[] {
  const sorted = [...term.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const totalCents = Math.round(totalAmount * 100);
  let allocatedCents = 0;

  return sorted.map((inst, i) => {
    const isLast = i === sorted.length - 1;
    const cents = isLast ? totalCents - allocatedCents : Math.round(totalCents * (inst.percentage / 100));
    allocatedCents += cents;
    return {
      installmentNumber: inst.installmentNumber,
      dueDate: computeDueDate(anchorDate, term.endOfMonth, term.fixedDay, inst.offsetDays),
      amount: cents / 100,
    };
  });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/lib/payment-schedule.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/payment-schedule.ts frontend/src/lib/payment-schedule.test.ts
git commit -m "feat(purchasing): add client-side payment-schedule mirror for the live preview"
```

---

### Task 5: Frontend — Magazzini (Warehouse) create/edit

**Files:**
- Create: `frontend/src/components/purchasing/WarehouseForm.tsx`
- Create: `frontend/src/app/acquisti/magazzini/nuovo/page.tsx`
- Create: `frontend/src/app/acquisti/magazzini/[id]/page.tsx`
- Modify: `frontend/src/components/purchasing/MagazziniTab.tsx`

**Interfaces:**
- Consumes: `api.purchasing.warehouses.{list,create,update}` from Task 3. `Warehouse` type (with `_count`) from Task 3.
- Produces: `WarehouseForm` component, `WarehouseFormState`, `EMPTY_WAREHOUSE_FORM` — used only within this task.

- [ ] **Step 1: Create the form component**

Create `frontend/src/components/purchasing/WarehouseForm.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

export interface WarehouseFormState {
  name: string; code: string; address: string;
}

export const EMPTY_WAREHOUSE_FORM: WarehouseFormState = { name: "", code: "", address: "" };

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
  initial?: Partial<WarehouseFormState>;
  disableCode?: boolean;
  submitLabel: string;
  onSubmit: (data: WarehouseFormState) => Promise<void>;
}

export default function WarehouseForm({ initial, disableCode, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<WarehouseFormState>({ ...EMPTY_WAREHOUSE_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ ...EMPTY_WAREHOUSE_FORM, ...initial });
  }, [initial]);

  const set = <K extends keyof WarehouseFormState>(key: K, value: WarehouseFormState[K]) =>
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
      <Section title="Magazzino">
        <Field label="Nome *"><input required className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} /></Field>
        <Field label="Codice *"><input required disabled={disableCode} className={inputClass} value={form.code} onChange={e => set("code", e.target.value)} /></Field>
        <Field label="Indirizzo"><input className={inputClass} value={form.address} onChange={e => set("address", e.target.value)} /></Field>
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

- [ ] **Step 2: Create the "nuovo" page**

Create `frontend/src/app/acquisti/magazzini/nuovo/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import WarehouseForm, { EMPTY_WAREHOUSE_FORM, WarehouseFormState } from "@/components/purchasing/WarehouseForm";
import { api } from "@/lib/api";

export default function NuovoMagazzinoPage() {
  const router = useRouter();

  const handleSubmit = async (form: WarehouseFormState) => {
    await api.purchasing.warehouses.create({ name: form.name, code: form.code, address: form.address || undefined });
    router.push("/acquisti/magazzini");
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Magazzino</h1>
            <WarehouseForm initial={EMPTY_WAREHOUSE_FORM} submitLabel="Crea magazzino" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the edit page**

Create `frontend/src/app/acquisti/magazzini/[id]/page.tsx`. There is no `GET /warehouses/:id` endpoint — this page loads the full list and filters client-side, matching the current scale of this table (per design spec §9):

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import WarehouseForm, { WarehouseFormState } from "@/components/purchasing/WarehouseForm";
import { api } from "@/lib/api";
import type { Warehouse } from "@/lib/api/purchasing";

export default function ModificaMagazzinoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.warehouses.list()
      .then(rows => setWarehouse(rows.find(w => w.id === params.id) ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: WarehouseFormState) => {
    await api.purchasing.warehouses.update(params.id, { name: form.name, address: form.address || undefined });
    router.push("/acquisti/magazzini");
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!warehouse) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Magazzino non trovato</div>;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">{warehouse.name}</h1>
            <WarehouseForm
              initial={{ name: warehouse.name, code: warehouse.code, address: warehouse.address ?? "" }}
              disableCode
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

- [ ] **Step 4: Update `MagazziniTab.tsx`**

Replace the entire contents of `frontend/src/components/purchasing/MagazziniTab.tsx`:

```tsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Warehouse } from "@/lib/api/purchasing";

export default function MagazziniTab() {
  const [rows, setRows] = useState<Warehouse[]>([]);
  useEffect(() => { api.purchasing.warehouses.list().then(setRows).catch(() => {}); }, []);
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-bg-border">
        <span className="text-xs text-zinc-500">{rows.length} magazzini</span>
        <Link
          href="/acquisti/magazzini/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
        >
          <Plus size={13} /> Nuovo magazzino
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Codice</th><th className="px-3 py-2.5">Nome</th>
            <th className="px-3 py-2.5">Indirizzo</th><th className="px-3 py-2.5">Utilizzo</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
              <td className="px-3 py-2.5 font-mono">
                <Link href={`/acquisti/magazzini/${r.id}`} className="text-accent-primary hover:underline">{r.code}</Link>
              </td>
              <td className="px-3 py-2.5">{r.name}</td>
              <td className="px-3 py-2.5 text-zinc-500">{r.address ?? "—"}</td>
              <td className="px-3 py-2.5">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${r._count.purchaseOrders > 0 ? "bg-accent-blue/15 text-accent-blue" : "bg-zinc-800 text-zinc-500"}`}>
                  {r._count.purchaseOrders > 0 ? `${r._count.purchaseOrders} ordini` : "Non ancora usato"}
                </span>
              </td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun magazzino — inizia creandone uno</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Type-check and manually verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

Start the dev servers (`cd backend && npm run dev`, `cd frontend && npm run dev`) and manually verify in the browser: `/acquisti/magazzini` shows the "+ Nuovo magazzino" button and a "Utilizzo" column; creating a warehouse redirects back to the list and the new row appears; clicking a warehouse's code opens `/acquisti/magazzini/[id]` with the code field disabled; editing name/address and saving redirects back and the row reflects the change.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/purchasing/WarehouseForm.tsx frontend/src/app/acquisti/magazzini/nuovo/page.tsx frontend/src/app/acquisti/magazzini/\[id\]/page.tsx frontend/src/components/purchasing/MagazziniTab.tsx
git commit -m "feat(purchasing): add create/edit UI and usage column for Magazzini"
```

---

### Task 6: Frontend — Banche (BankAccount) create/edit

**Files:**
- Create: `frontend/src/components/purchasing/BankAccountForm.tsx`
- Create: `frontend/src/app/acquisti/banche/nuovo/page.tsx`
- Create: `frontend/src/app/acquisti/banche/[id]/page.tsx`
- Modify: `frontend/src/components/purchasing/BancheTab.tsx`

**Interfaces:**
- Consumes: `api.purchasing.bankAccounts.{list,create,update}`, `BankAccount`, `CreateBankAccountInput`, `UpdateBankAccountInput` from Task 3.
- Produces: `BankAccountForm` component, `BankAccountFormState`, `EMPTY_BANK_ACCOUNT_FORM` — used only within this task.

- [ ] **Step 1: Create the form component**

Create `frontend/src/components/purchasing/BankAccountForm.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

export interface BankAccountFormState {
  bankName: string; alias: string; accountHolder: string; iban: string; bic: string;
  currency: string; openingBalance: string; openingBalanceDate: string;
  accountingCode: string; notes: string;
}

export const EMPTY_BANK_ACCOUNT_FORM: BankAccountFormState = {
  bankName: "", alias: "", accountHolder: "", iban: "", bic: "",
  currency: "EUR", openingBalance: "0", openingBalanceDate: "",
  accountingCode: "", notes: "",
};

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
      <div className="pb-2 border-b border-bg-border">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {note && <p className="text-[10px] text-zinc-500 mt-0.5">{note}</p>}
      </div>
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
  initial?: Partial<BankAccountFormState>;
  disableImmutableFields?: boolean;
  submitLabel: string;
  onSubmit: (data: BankAccountFormState) => Promise<void>;
}

export default function BankAccountForm({ initial, disableImmutableFields, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<BankAccountFormState>({ ...EMPTY_BANK_ACCOUNT_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ ...EMPTY_BANK_ACCOUNT_FORM, ...initial });
  }, [initial]);

  const set = <K extends keyof BankAccountFormState>(key: K, value: BankAccountFormState[K]) =>
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
      <Section title="Identificazione">
        <Field label="Banca *"><input required className={inputClass} value={form.bankName} onChange={e => set("bankName", e.target.value)} /></Field>
        <Field label="Alias *"><input required className={inputClass} value={form.alias} onChange={e => set("alias", e.target.value)} /></Field>
        <Field label="Intestatario *"><input required className={inputClass} value={form.accountHolder} onChange={e => set("accountHolder", e.target.value)} /></Field>
        <Field label="IBAN *"><input required disabled={disableImmutableFields} className={inputClass} value={form.iban} onChange={e => set("iban", e.target.value)} /></Field>
        <Field label="BIC/SWIFT"><input className={inputClass} value={form.bic} onChange={e => set("bic", e.target.value)} /></Field>
        <Field label="Valuta"><input disabled={disableImmutableFields} className={inputClass} value={form.currency} onChange={e => set("currency", e.target.value)} /></Field>
      </Section>

      <Section title="Saldo iniziale" note={disableImmutableFields ? "Il saldo iniziale non è modificabile dopo la creazione" : undefined}>
        <Field label="Saldo iniziale *"><input required type="number" step="0.01" disabled={disableImmutableFields} className={inputClass} value={form.openingBalance} onChange={e => set("openingBalance", e.target.value)} /></Field>
        <Field label="Data saldo iniziale *"><input required type="date" disabled={disableImmutableFields} className={inputClass} value={form.openingBalanceDate} onChange={e => set("openingBalanceDate", e.target.value)} /></Field>
      </Section>

      <Section title="Altro">
        <Field label="Codice contabile"><input className={inputClass} value={form.accountingCode} onChange={e => set("accountingCode", e.target.value)} /></Field>
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

- [ ] **Step 2: Create the "nuovo" page**

Create `frontend/src/app/acquisti/banche/nuovo/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import BankAccountForm, { EMPTY_BANK_ACCOUNT_FORM, BankAccountFormState } from "@/components/purchasing/BankAccountForm";
import { api } from "@/lib/api";

export default function NuovoContoPage() {
  const router = useRouter();

  const handleSubmit = async (form: BankAccountFormState) => {
    await api.purchasing.bankAccounts.create({
      bankName: form.bankName, alias: form.alias, accountHolder: form.accountHolder, iban: form.iban,
      bic: form.bic || undefined, currency: form.currency || undefined,
      openingBalance: Number(form.openingBalance), openingBalanceDate: form.openingBalanceDate,
      accountingCode: form.accountingCode || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/banche");
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Conto Banca</h1>
            <BankAccountForm initial={EMPTY_BANK_ACCOUNT_FORM} submitLabel="Crea conto" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the edit page**

Create `frontend/src/app/acquisti/banche/[id]/page.tsx`:

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import BankAccountForm, { BankAccountFormState } from "@/components/purchasing/BankAccountForm";
import { api } from "@/lib/api";
import type { BankAccount } from "@/lib/api/purchasing";

export default function ModificaContoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.bankAccounts.list()
      .then(rows => setAccount(rows.find(a => a.id === params.id) ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: BankAccountFormState) => {
    await api.purchasing.bankAccounts.update(params.id, {
      bankName: form.bankName, alias: form.alias, accountHolder: form.accountHolder,
      bic: form.bic || undefined, accountingCode: form.accountingCode || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/banche");
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!account) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Conto non trovato</div>;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">{account.alias}</h1>
            <BankAccountForm
              initial={{
                bankName: account.bankName, alias: account.alias, accountHolder: account.accountHolder,
                iban: account.iban, bic: account.bic ?? "", currency: account.currency,
                openingBalance: String(account.openingBalance), openingBalanceDate: account.openingBalanceDate.slice(0, 10),
                accountingCode: account.accountingCode ?? "", notes: account.notes ?? "",
              }}
              disableImmutableFields
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

- [ ] **Step 4: Update `BancheTab.tsx`**

Replace the entire contents of `frontend/src/components/purchasing/BancheTab.tsx`:

```tsx
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
```

- [ ] **Step 5: Type-check and manually verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

With the dev servers running, manually verify: `/acquisti/banche` shows "+ Nuovo conto"; creating a bank account redirects back and the row appears; clicking a row's alias opens `/acquisti/banche/[id]` with IBAN, valuta, saldo iniziale and data saldo iniziale all disabled (with the note visible under "Saldo iniziale"); editing bankName/alias/accountHolder/bic/accountingCode/notes and saving works.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/purchasing/BankAccountForm.tsx frontend/src/app/acquisti/banche/nuovo/page.tsx frontend/src/app/acquisti/banche/\[id\]/page.tsx frontend/src/components/purchasing/BancheTab.tsx
git commit -m "feat(purchasing): add create/edit UI for Banche"
```

---

### Task 7: Frontend — Condizioni di pagamento (PaymentTerm) create/edit with installment editor and live preview

**Files:**
- Create: `frontend/src/components/purchasing/PaymentTermForm.tsx`
- Create: `frontend/src/app/acquisti/condizioni-pagamento/nuovo/page.tsx`
- Create: `frontend/src/app/acquisti/condizioni-pagamento/[id]/page.tsx`
- Modify: `frontend/src/components/purchasing/CondizioniPagamentoTab.tsx`

**Interfaces:**
- Consumes: `api.purchasing.paymentTerms.{list,create,update}`, `PaymentTerm`, `PaymentTermInput` from Task 3. `computePaymentSchedule` from Task 4.
- Produces: `PaymentTermForm` component, `PaymentTermFormState`, `PaymentTermInstallmentFormRow`, `EMPTY_PAYMENT_TERM_FORM` — used only within this task.

- [ ] **Step 1: Create the form component**

Create `frontend/src/components/purchasing/PaymentTermForm.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { computePaymentSchedule } from "@/lib/payment-schedule";

export interface PaymentTermInstallmentFormRow {
  installmentNumber: number; offsetDays: string; percentage: string;
}

export interface PaymentTermFormState {
  name: string; type: string; endOfMonth: boolean; fixedDay: string;
  paymentMethod: string; installments: PaymentTermInstallmentFormRow[];
}

export const EMPTY_PAYMENT_TERM_FORM: PaymentTermFormState = {
  name: "", type: "", endOfMonth: false, fixedDay: "", paymentMethod: "",
  installments: [{ installmentNumber: 1, offsetDays: "30", percentage: "100" }],
};

const PAYMENT_METHODS = ["", "BONIFICO", "RIBA", "ASSEGNO", "CONTANTI", "PAYPAL", "CARTA", "ALTRO"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-white pb-2 border-b border-bg-border">{title}</h2>
      {children}
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
  initial?: Partial<PaymentTermFormState>;
  submitLabel: string;
  onSubmit: (data: PaymentTermFormState) => Promise<void>;
}

export default function PaymentTermForm({ initial, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<PaymentTermFormState>({ ...EMPTY_PAYMENT_TERM_FORM, ...initial });
  const [sampleAmount, setSampleAmount] = useState("1000");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ ...EMPTY_PAYMENT_TERM_FORM, ...initial });
  }, [initial]);

  const set = <K extends keyof PaymentTermFormState>(key: K, value: PaymentTermFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const setInstallment = (index: number, key: keyof PaymentTermInstallmentFormRow, value: string) =>
    setForm(prev => ({
      ...prev,
      installments: prev.installments.map((inst, i) => i === index ? { ...inst, [key]: value } : inst),
    }));

  const addInstallment = () =>
    setForm(prev => ({
      ...prev,
      installments: [...prev.installments, { installmentNumber: prev.installments.length + 1, offsetDays: "0", percentage: "0" }],
    }));

  const removeInstallment = (index: number) =>
    setForm(prev => ({
      ...prev,
      installments: prev.installments.filter((_, i) => i !== index).map((inst, i) => ({ ...inst, installmentNumber: i + 1 })),
    }));

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

  const percentageSum = form.installments.reduce((s, i) => s + (Number(i.percentage) || 0), 0);
  const allValid = form.installments.every(
    i => i.offsetDays !== "" && i.percentage !== "" && !Number.isNaN(Number(i.offsetDays)) && !Number.isNaN(Number(i.percentage))
  ) && Math.abs(percentageSum - 100) < 0.01;
  const preview = allValid
    ? computePaymentSchedule(
        new Date(),
        {
          endOfMonth: form.endOfMonth,
          fixedDay: form.fixedDay ? Number(form.fixedDay) : null,
          installments: form.installments.map(i => ({
            installmentNumber: i.installmentNumber, offsetDays: Number(i.offsetDays), percentage: Number(i.percentage),
          })),
        },
        Number(sampleAmount) || 0
      )
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section title="Condizione">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome *"><input required className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} /></Field>
          <Field label="Tipo *"><input required className={inputClass} value={form.type} onChange={e => set("type", e.target.value)} placeholder="es. RIBA, BONIFICO, IMMEDIATE" /></Field>
          <Field label="Metodo di pagamento *">
            <select required className={inputClass} value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m || "—"}</option>)}
            </select>
          </Field>
          <Field label="Giorno fisso"><input type="number" className={inputClass} value={form.fixedDay} onChange={e => set("fixedDay", e.target.value)} /></Field>
          <Field label="Fine mese">
            <input type="checkbox" checked={form.endOfMonth} onChange={e => set("endOfMonth", e.target.checked)} className="w-4 h-4" />
          </Field>
        </div>
      </Section>

      <Section title="Rate">
        <div className="space-y-2">
          {form.installments.map((inst, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={`Rata ${inst.installmentNumber} — giorni`}>
                <input type="number" className={inputClass} value={inst.offsetDays} onChange={e => setInstallment(i, "offsetDays", e.target.value)} />
              </Field>
              <Field label="Percentuale">
                <input type="number" step="0.01" className={inputClass} value={inst.percentage} onChange={e => setInstallment(i, "percentage", e.target.value)} />
              </Field>
              <button
                type="button"
                onClick={() => removeInstallment(i)}
                disabled={form.installments.length === 1}
                className="text-accent-red text-xs px-2 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={addInstallment} className="text-xs text-accent-primary hover:underline">+ Aggiungi rata</button>
          <p className={`text-xs ${Math.abs(percentageSum - 100) < 0.01 ? "text-zinc-500" : "text-accent-red"}`}>
            Totale percentuali: {percentageSum.toFixed(2)}%
          </p>
        </div>
      </Section>

      <Section title="Anteprima">
        <div className="space-y-2">
          <Field label="Importo di esempio">
            <input type="number" className={`${inputClass} max-w-[160px]`} value={sampleAmount} onChange={e => setSampleAmount(e.target.value)} />
          </Field>
          {preview ? (
            <div className="border-l-2 border-accent-primary pl-3 space-y-1 text-xs text-zinc-400">
              {preview.map(p => (
                <div key={p.installmentNumber}>
                  Rata {p.installmentNumber} — <span className="text-zinc-200">€ {p.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span> il{" "}
                  <span className="text-accent-primary">{p.dueDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">Completa le rate per vedere l&apos;anteprima</p>
          )}
        </div>
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

- [ ] **Step 2: Create the "nuovo" page**

Create `frontend/src/app/acquisti/condizioni-pagamento/nuovo/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import PaymentTermForm, { EMPTY_PAYMENT_TERM_FORM, PaymentTermFormState } from "@/components/purchasing/PaymentTermForm";
import { api } from "@/lib/api";
import type { PaymentTermInput } from "@/lib/api/purchasing";

function toApiInput(form: PaymentTermFormState): PaymentTermInput {
  return {
    name: form.name, type: form.type, endOfMonth: form.endOfMonth,
    fixedDay: form.fixedDay ? Number(form.fixedDay) : undefined,
    paymentMethod: form.paymentMethod,
    installments: form.installments.map(i => ({
      installmentNumber: i.installmentNumber, offsetDays: Number(i.offsetDays), percentage: Number(i.percentage),
    })),
  };
}

export default function NuovaCondizionePage() {
  const router = useRouter();

  const handleSubmit = async (form: PaymentTermFormState) => {
    await api.purchasing.paymentTerms.create(toApiInput(form));
    router.push("/acquisti/condizioni-pagamento");
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuova Condizione di Pagamento</h1>
            <PaymentTermForm initial={EMPTY_PAYMENT_TERM_FORM} submitLabel="Crea condizione" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the edit page**

Create `frontend/src/app/acquisti/condizioni-pagamento/[id]/page.tsx`:

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import PaymentTermForm, { PaymentTermFormState } from "@/components/purchasing/PaymentTermForm";
import { api } from "@/lib/api";
import type { PaymentTerm, PaymentTermInput } from "@/lib/api/purchasing";

function toApiInput(form: PaymentTermFormState): PaymentTermInput {
  return {
    name: form.name, type: form.type, endOfMonth: form.endOfMonth,
    fixedDay: form.fixedDay ? Number(form.fixedDay) : undefined,
    paymentMethod: form.paymentMethod,
    installments: form.installments.map(i => ({
      installmentNumber: i.installmentNumber, offsetDays: Number(i.offsetDays), percentage: Number(i.percentage),
    })),
  };
}

export default function ModificaCondizionePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [term, setTerm] = useState<PaymentTerm | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.paymentTerms.list()
      .then(rows => setTerm(rows.find(t => t.id === params.id) ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: PaymentTermFormState) => {
    await api.purchasing.paymentTerms.update(params.id, toApiInput(form));
    router.push("/acquisti/condizioni-pagamento");
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!term) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Condizione non trovata</div>;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">{term.name}</h1>
            <PaymentTermForm
              initial={{
                name: term.name, type: term.type, endOfMonth: term.endOfMonth,
                fixedDay: term.fixedDay !== null ? String(term.fixedDay) : "",
                paymentMethod: term.paymentMethod,
                installments: term.installments.map(i => ({
                  installmentNumber: i.installmentNumber, offsetDays: String(i.offsetDays), percentage: String(i.percentage),
                })),
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

- [ ] **Step 4: Update `CondizioniPagamentoTab.tsx`**

Replace the entire contents of `frontend/src/components/purchasing/CondizioniPagamentoTab.tsx`:

```tsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { PaymentTerm } from "@/lib/api/purchasing";

export default function CondizioniPagamentoTab() {
  const [rows, setRows] = useState<PaymentTerm[]>([]);
  useEffect(() => { api.purchasing.paymentTerms.list().then(setRows).catch(() => {}); }, []);
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-bg-border">
        <span className="text-xs text-zinc-500">{rows.length} condizioni di pagamento</span>
        <Link
          href="/acquisti/condizioni-pagamento/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
        >
          <Plus size={13} /> Nuova condizione
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Metodo</th>
            <th className="px-3 py-2.5">Rate</th><th className="px-3 py-2.5">Utilizzo</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const used = r._count.suppliers > 0 || r._count.purchaseOrders > 0;
            return (
              <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                <td className="px-3 py-2.5">
                  <Link href={`/acquisti/condizioni-pagamento/${r.id}`} className="text-accent-primary hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2.5">{r.paymentMethod}</td>
                <td className="px-3 py-2.5">{r.installments.map(i => `${i.offsetDays}gg ${i.percentage}%`).join(" / ")}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${used ? "bg-accent-blue/15 text-accent-blue" : "bg-zinc-800 text-zinc-500"}`}>
                    {used ? `${r._count.suppliers} fornitori · ${r._count.purchaseOrders} ordini` : "Non ancora usata"}
                  </span>
                </td>
                <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessuna condizione di pagamento — inizia creandone una</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Type-check and manually verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

With the dev servers running, manually verify: `/acquisti/condizioni-pagamento` shows "+ Nuova condizione" and a "Utilizzo" column; opening "nuovo" and adding/removing installment rows renumbers them and updates "Totale percentuali" live; setting percentages to sum to 100 makes the "Anteprima" section show computed due dates for the sample amount (default 1000); saving redirects back and the new row appears; opening an existing condition pre-fills all fields including installments, and the preview reflects the loaded data immediately.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/purchasing/PaymentTermForm.tsx frontend/src/app/acquisti/condizioni-pagamento/nuovo/page.tsx frontend/src/app/acquisti/condizioni-pagamento/\[id\]/page.tsx frontend/src/components/purchasing/CondizioniPagamentoTab.tsx
git commit -m "feat(purchasing): add create/edit UI, usage column and live preview for Condizioni di pagamento"
```

---

## Final Verification

After all 7 tasks are complete:

- [ ] Run the full backend suite: `cd backend && npx vitest run` — expect all tests passing, no regressions.
- [ ] Run the full frontend suite: `cd frontend && npx vitest run` — expect all tests passing, no regressions.
- [ ] Run `cd frontend && npx tsc --noEmit` and `cd backend && npx tsc --noEmit` — both clean.
- [ ] Manual smoke test of all three areas end-to-end (create, edit, deactivate) as described in each task's Step 5/6.
- [ ] Proceed to the final whole-branch review (superpowers:requesting-code-review) and superpowers:finishing-a-development-branch, per subagent-driven-development.
