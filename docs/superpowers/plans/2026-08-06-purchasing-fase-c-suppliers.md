# FASE C — Anagrafica Fornitori Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Supplier master-data entity (with contacts and priced product relationships, full price history) to the Purchasing module, including the first real create/edit forms in this codebase — a dedicated `/anagrafiche/fornitori/[id]` detail page with tabs, replacing the disabled "Fornitori" placeholder from FASE B.

**Architecture:** Four new Prisma models (`Supplier`, `SupplierContact`, `SupplierProduct`, `SupplierProductPriceHistory`) under the same company-wide (no `amazonAccountId`/`organizationId`) purchasing domain established in FASE B. Repository layer split by aggregate (`suppliers.repo.ts`, `supplier-contacts.repo.ts`, `supplier-products.repo.ts`), a new `suppliers.routes.ts` mounted alongside FASE B's `master-data.routes.ts` at the same `/api/purchasing` base path. Frontend: the "Fornitori" tab in `/anagrafiche` is promoted from disabled to a real list, plus two new pages (`/anagrafiche/fornitori/nuovo`, `/anagrafiche/fornitori/[id]`) establishing this codebase's first multi-section form pattern — confirmed via research that no precedent exists, so this plan defines the pattern from scratch (one grouped form-state object, inline validation, section-per-`<fieldset>` layout).

**Tech Stack:** Same as FASE B — Express + TypeScript + Prisma + PostgreSQL, Next.js 14 + Tailwind, Vitest + Testcontainers.

## Global Constraints

- **Repo-layer rule (absolute):** only `backend/src/repositories/**` calls Prisma directly.
- **Schema conventions:** `id String @id @default(cuid())`; `createdAt DateTime @default(now())` / `updatedAt DateTime @updatedAt` on mutable models; monetary fields `Decimal @db.Decimal(14, 4)`; reuse the existing `PurchasePaymentMethod` enum (FASE B) for `Supplier.defaultPaymentMethod`.
- **No `amazonAccountId` / no `organizationId`** anywhere (same confirmed decision as FASE B).
- **Soft deactivation only for `Supplier`** (`isActive = false`, matching FASE B's `Warehouse`/`PaymentTerm`/`BankAccount` convention exactly) — the architecture doc's original text separately mentioned a `deletedAt` field for Supplier, which this plan drops as redundant with `isActive`; use `isActive` alone for consistency with the rest of the module.
- **`SupplierContact` and `SupplierProduct` MAY be hard-deleted** — deliberate, reasoned exception to the module's general "never hard-delete" rule: neither entity is referenced by any economically-significant record yet (no `PurchaseOrderLine.supplierProductId` FK exists — purchase orders will reference `Product` directly, not `SupplierProduct`, per the architecture doc's ERD). A contact or a supplier-product listing is address-book-like data, not a financial record. `SupplierProductPriceHistory` rows are never deleted (append-only, same pattern as `AmazonCogsPriceEntry`/FASE B's general philosophy) even when the parent `SupplierProduct` is removed — the price history survives independently for audit purposes (its `supplierProductId` FK does not cascade-delete; deleting a `SupplierProduct` with existing history rows is blocked at the DB level, forcing an explicit decision rather than silently orphaning or cascading financial history).
- **Price changes never overwrite `SupplierProduct.standardPrice` in place** — every price change appends a new `SupplierProductPriceHistory` row; `SupplierProduct.standardPrice`/`lastPriceDate` are then updated to mirror the latest history row (a denormalized "current price" cache for fast list rendering), never edited independently of a history row being created in the same transaction.
- **Migrations:** `prisma migrate dev` only, never `db push`. **Task 1's migration step requires explicit user confirmation before running** — same gate as every schema change in this project. Next migration must sort after `20260805195643_add_purchasing_master_data`.
- **Branch:** `feature/supplier-management`, already checked out off `origin/develop` (which now includes FASE B, merged as PR #3) in the worktree at `.claude/worktrees/purchasing-erp`.
- **Frontend form pattern (new, no prior precedent in this codebase — confirmed by research):** one grouped `useState` object per form (not per-field `useState` calls, unlike the codebase's only prior form example `CreateUserModal` which has just 3 fields) — the field count here (25+) makes per-field state unmanageable. Sections render as visually grouped blocks (`<fieldset>`-style divs with a heading), not actual `<fieldset>` tags (matches this codebase's existing div-based section pattern, e.g. `Section` component in `frontend/src/app/orders/[id]/page.tsx`). No form library (React Hook Form, etc.) — matches this codebase's zero-dependency form convention observed in `CreateUserModal`.
- **Detail route pattern:** `findUnique + include` for a single record with relations, modeled directly on `backend/src/repositories/amazon/product.repo.ts:53-62`'s `findProductById` (`Promise<T | null>`, typed return interface, no repo function throws on not-found — the route layer maps `null` to 404).
- **Test command:** `cd backend && npx vitest run <path>` for a single file; `npx tsc --noEmit` for typecheck (backend and frontend, both already confirmed as the correct commands via FASE B).

---

### Task 0: Create the feature branch

Already done — this plan was written directly on `feature/supplier-management` (branched from `origin/develop` after FASE B/PR #3 merged). No action needed; the first implementer starts directly on Task 1.

---

### Task 1: Prisma schema — Supplier, SupplierContact, SupplierProduct, SupplierProductPriceHistory

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create (generated): `backend/prisma/migrations/<timestamp>_add_supplier_master_data/migration.sql`

**Interfaces:**
- Produces: models `Supplier`, `SupplierContact`, `SupplierProduct`, `SupplierProductPriceHistory` — every later task's Prisma calls depend on these exact field names/types.

- [ ] **Step 1: Add the models**

Append at the end of `backend/prisma/schema.prisma`:

```prisma
// ─── Purchasing module — FASE C: supplier master data ──────────────────────
// See docs/superpowers/specs/2026-08-05-purchasing-erp-architecture.md §2.
model Supplier {
  id              String    @id @default(cuid())
  // Identificazione
  legalName       String
  tradeName       String?
  internalCode    String    @unique
  isActive        Boolean   @default(true)
  supplierType    String
  country         String    // registration/nationality country, distinct from the physical address country below
  language        String?
  defaultCurrency String    @default("EUR")
  // Dati fiscali
  vatNumber       String?
  taxCode         String?
  foreignVatNumber String?
  sdiCode         String?
  pec             String?
  taxRegime       String?
  fiscalNotes     String?
  // Indirizzo
  addressLine     String?
  streetNumber    String?
  postalCode      String?
  city            String?
  province        String?
  addressCountry  String?
  // Pagamenti
  defaultPaymentMethod PurchasePaymentMethod?
  defaultPaymentTermId String?
  defaultPaymentTerm   PaymentTerm?           @relation(fields: [defaultPaymentTermId], references: [id])
  paymentDays     Int?
  bankName        String?
  iban            String?
  bic             String?
  ribaEnabled     Boolean   @default(false)
  fixedPaymentDays Int[]    @default([])
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  contacts        SupplierContact[]
  products        SupplierProduct[]

  @@index([isActive])
  @@index([vatNumber])
}

model SupplierContact {
  id         String   @id @default(cuid())
  supplierId String
  supplier   Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  name       String
  role       String?
  email      String?
  phone      String?
  whatsapp   String?
  isPrimary  Boolean  @default(false)
  notes      String?
  createdAt  DateTime @default(now())

  @@index([supplierId])
}

model SupplierProduct {
  id                 String   @id @default(cuid())
  supplierId         String
  supplier           Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  productId          String
  product            Product  @relation(fields: [productId], references: [id])
  supplierSku        String?
  supplierProductName String?
  standardPrice      Decimal  @db.Decimal(14, 4)
  currency           String   @default("EUR")
  moq                Int?
  orderMultiple      Int?
  leadTimeDays       Int?
  unitsPerCarton     Int?
  unitsPerPallet     Int?
  weightKg           Decimal? @db.Decimal(10, 3)
  conditions         String?
  lastPriceDate      DateTime
  isPreferredSupplier Boolean @default(false)
  notes              String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  priceHistory       SupplierProductPriceHistory[]

  @@unique([supplierId, productId])
  @@index([supplierId])
  @@index([productId])
}

// Append-only — never updated or deleted. Restrict (not cascade) on the
// parent FK: deleting a SupplierProduct with price history must be a
// conscious, blocked action, not a silent cascade that erases financial
// history (see Global Constraints).
model SupplierProductPriceHistory {
  id                String          @id @default(cuid())
  supplierProductId String
  supplierProduct   SupplierProduct @relation(fields: [supplierProductId], references: [id], onDelete: Restrict)
  price             Decimal         @db.Decimal(14, 4)
  currency          String          @default("EUR")
  validFrom         DateTime        @default(now())
  source            String
  note              String?

  @@index([supplierProductId, validFrom])
}
```

- [ ] **Step 2: Add the back-relation to `Product`**

Find the `Product` model (`backend/prisma/schema.prisma:749`). Add one line after `identifiers ProductIdentifier[]`:

```prisma
  identifiers ProductIdentifier[]
  supplierProducts SupplierProduct[]
```

- [ ] **Step 3: Add the back-relation to `PaymentTerm`**

Find the `PaymentTerm` model (`backend/prisma/schema.prisma:801`, added in FASE B). Add one line after `installments  PaymentTermInstallmentRule[]`:

```prisma
  installments  PaymentTermInstallmentRule[]
  suppliers     Supplier[]
```

- [ ] **Step 4: Validate**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: STOP — confirm with the user before applying the migration**

Show the user the diff (`git diff backend/prisma/schema.prisma`) and get an explicit go-ahead before Step 6 (CLAUDE.md principle #6).

- [ ] **Step 6: Generate and apply the migration**

```bash
npx prisma migrate dev --name add_supplier_master_data
```
Expected: a new migration folder sorting after `20260805195643_add_purchasing_master_data`, containing 4 `CREATE TABLE` statements, FKs (including the `onDelete: Restrict` on price history and `onDelete: Cascade` on contacts/products), and indexes — applied cleanly, no drift.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(purchasing): add Supplier, SupplierContact, SupplierProduct, SupplierProductPriceHistory models"
```

---

### Task 2: `suppliers.repo.ts`

**Files:**
- Create: `backend/src/repositories/purchasing/suppliers.repo.ts`
- Test: `backend/tests/repositories/purchasing/suppliers.repo.test.ts`

**Interfaces:**
- Produces:
  - `findAllSuppliers(prisma): Promise<Supplier[]>`
  - `SupplierWithRelations = Supplier & { contacts: SupplierContact[]; products: (SupplierProduct & { priceHistory: SupplierProductPriceHistory[] })[] }`
  - `findSupplierById(prisma, id: string): Promise<SupplierWithRelations | null>`
  - `createSupplier(prisma, data: CreateSupplierInput): Promise<Supplier>`
  - `updateSupplier(prisma, id: string, data: Partial<CreateSupplierInput>): Promise<Supplier>`
  - `deactivateSupplier(prisma, id: string): Promise<Supplier>`
  - Consumed by Task 5 (routes).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/suppliers.repo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllSuppliers, findSupplierById, createSupplier, updateSupplier, deactivateSupplier } from "../../../src/repositories/purchasing/suppliers.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

const baseInput = {
  legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore",
  country: "IT", defaultCurrency: "EUR",
};

describe("suppliers.repo", () => {
  it("creates a supplier and finds it in the list", async () => {
    await createSupplier(db.prisma, baseInput);
    const all = await findAllSuppliers(db.prisma);
    expect(all).toHaveLength(1);
    expect(all[0].legalName).toBe("Acme Supply Srl");
    expect(all[0].isActive).toBe(true);
  });

  it("rejects a duplicate internalCode", async () => {
    await createSupplier(db.prisma, baseInput);
    await expect(createSupplier(db.prisma, { ...baseInput, legalName: "Other" })).rejects.toThrow();
  });

  it("findSupplierById returns null for an unknown id", async () => {
    const result = await findSupplierById(db.prisma, "does-not-exist");
    expect(result).toBeNull();
  });

  it("findSupplierById includes empty contacts/products arrays for a supplier with none", async () => {
    const s = await createSupplier(db.prisma, baseInput);
    const result = await findSupplierById(db.prisma, s.id);
    expect(result).not.toBeNull();
    expect(result!.contacts).toEqual([]);
    expect(result!.products).toEqual([]);
  });

  it("updates fields without touching internalCode", async () => {
    const s = await createSupplier(db.prisma, baseInput);
    const updated = await updateSupplier(db.prisma, s.id, { legalName: "Acme Supply New Name" });
    expect(updated.legalName).toBe("Acme Supply New Name");
    expect(updated.internalCode).toBe("FORN-001");
  });

  it("deactivate sets isActive=false instead of deleting the row", async () => {
    const s = await createSupplier(db.prisma, baseInput);
    await deactivateSupplier(db.prisma, s.id);
    const row = await db.prisma.supplier.findUnique({ where: { id: s.id } });
    expect(row!.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx vitest run tests/repositories/purchasing/suppliers.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/suppliers.repo.ts`:

```typescript
// repositories/purchasing/suppliers.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, Supplier, SupplierContact, SupplierProduct, SupplierProductPriceHistory, PurchasePaymentMethod } from "@prisma/client";

export type SupplierWithRelations = Supplier & {
  contacts: SupplierContact[];
  products: (SupplierProduct & { priceHistory: SupplierProductPriceHistory[] })[];
};

export async function findAllSuppliers(prisma: PrismaClient): Promise<Supplier[]> {
  return prisma.supplier.findMany({ orderBy: { legalName: "asc" } });
}

export async function findSupplierById(prisma: PrismaClient, id: string): Promise<SupplierWithRelations | null> {
  return prisma.supplier.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { isPrimary: "desc" } },
      products: { include: { priceHistory: { orderBy: { validFrom: "desc" } } } },
    },
  });
}

export interface CreateSupplierInput {
  legalName: string;
  tradeName?: string | null;
  internalCode: string;
  supplierType: string;
  country: string;
  language?: string | null;
  defaultCurrency?: string;
  vatNumber?: string | null;
  taxCode?: string | null;
  foreignVatNumber?: string | null;
  sdiCode?: string | null;
  pec?: string | null;
  taxRegime?: string | null;
  fiscalNotes?: string | null;
  addressLine?: string | null;
  streetNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  addressCountry?: string | null;
  defaultPaymentMethod?: PurchasePaymentMethod | null;
  defaultPaymentTermId?: string | null;
  paymentDays?: number | null;
  bankName?: string | null;
  iban?: string | null;
  bic?: string | null;
  ribaEnabled?: boolean;
  fixedPaymentDays?: number[];
}

export async function createSupplier(prisma: PrismaClient, data: CreateSupplierInput): Promise<Supplier> {
  return prisma.supplier.create({ data });
}

export async function updateSupplier(
  prisma: PrismaClient,
  id: string,
  data: Partial<Omit<CreateSupplierInput, "internalCode">>
): Promise<Supplier> {
  return prisma.supplier.update({ where: { id }, data });
}

export async function deactivateSupplier(prisma: PrismaClient, id: string): Promise<Supplier> {
  return prisma.supplier.update({ where: { id }, data: { isActive: false } });
}
```
Note: `updateSupplier`'s type excludes `internalCode` from `CreateSupplierInput` — same "identifying field is immutable after creation" pattern as FASE B's `BankAccount.iban`.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/repositories/purchasing/suppliers.repo.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/suppliers.repo.ts backend/tests/repositories/purchasing/suppliers.repo.test.ts
git commit -m "feat(purchasing): add suppliers repository"
```

---

### Task 3: `supplier-contacts.repo.ts`

**Files:**
- Create: `backend/src/repositories/purchasing/supplier-contacts.repo.ts`
- Test: `backend/tests/repositories/purchasing/supplier-contacts.repo.test.ts`

**Interfaces:**
- Produces: `createContact(prisma, supplierId: string, data: CreateContactInput): Promise<SupplierContact>`, `updateContact(prisma, id: string, data: Partial<CreateContactInput>): Promise<SupplierContact>`, `deleteContact(prisma, id: string): Promise<void>` — consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/supplier-contacts.repo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { createSupplier } from "../../../src/repositories/purchasing/suppliers.repo";
import { createContact, updateContact, deleteContact } from "../../../src/repositories/purchasing/supplier-contacts.repo";

let db: TestDb;
let supplierId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  const s = await createSupplier(db.prisma, { legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT" });
  supplierId = s.id;
});

describe("supplier-contacts.repo", () => {
  it("creates a contact linked to the supplier", async () => {
    const contact = await createContact(db.prisma, supplierId, { name: "Mario Rossi", role: "Sales", email: "mario@acme.it", isPrimary: true });
    expect(contact.supplierId).toBe(supplierId);
    expect(contact.isPrimary).toBe(true);
  });

  it("updates a contact's fields", async () => {
    const contact = await createContact(db.prisma, supplierId, { name: "Mario Rossi" });
    const updated = await updateContact(db.prisma, contact.id, { phone: "+39 02 1234567" });
    expect(updated.phone).toBe("+39 02 1234567");
    expect(updated.name).toBe("Mario Rossi");
  });

  it("deletes a contact (hard delete — contacts carry no financial history)", async () => {
    const contact = await createContact(db.prisma, supplierId, { name: "Mario Rossi" });
    await deleteContact(db.prisma, contact.id);
    const row = await db.prisma.supplierContact.findUnique({ where: { id: contact.id } });
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx vitest run tests/repositories/purchasing/supplier-contacts.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/supplier-contacts.repo.ts`:

```typescript
// repositories/purchasing/supplier-contacts.repo.ts — Company-wide, no amazonAccountId.
// Hard-deletable by design: a contact carries no financial/history significance
// (see plan Global Constraints for the reasoning behind this module-wide exception).
import type { PrismaClient, SupplierContact } from "@prisma/client";

export interface CreateContactInput {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

export async function createContact(
  prisma: PrismaClient,
  supplierId: string,
  data: CreateContactInput
): Promise<SupplierContact> {
  return prisma.supplierContact.create({ data: { ...data, supplierId } });
}

export async function updateContact(
  prisma: PrismaClient,
  id: string,
  data: Partial<CreateContactInput>
): Promise<SupplierContact> {
  return prisma.supplierContact.update({ where: { id }, data });
}

export async function deleteContact(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.supplierContact.delete({ where: { id } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/repositories/purchasing/supplier-contacts.repo.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/supplier-contacts.repo.ts backend/tests/repositories/purchasing/supplier-contacts.repo.test.ts
git commit -m "feat(purchasing): add supplier-contacts repository"
```

---

### Task 4: `supplier-products.repo.ts`

**Files:**
- Create: `backend/src/repositories/purchasing/supplier-products.repo.ts`
- Test: `backend/tests/repositories/purchasing/supplier-products.repo.test.ts`

**Interfaces:**
- Produces:
  - `addSupplierProduct(prisma, supplierId: string, data: AddSupplierProductInput): Promise<SupplierProduct>` — creates the `SupplierProduct` row AND its first `SupplierProductPriceHistory` row atomically.
  - `updateSupplierProductPrice(prisma, supplierProductId: string, data: { price: number; currency?: string; source: string; note?: string }): Promise<SupplierProduct>` — appends a new `SupplierProductPriceHistory` row and updates `SupplierProduct.standardPrice`/`currency`/`lastPriceDate` to match, atomically. **Never** updates `standardPrice` without a corresponding history row.
  - `updateSupplierProductDetails(prisma, supplierProductId: string, data: Partial<Omit<AddSupplierProductInput, "productId" | "standardPrice" | "currency">>): Promise<SupplierProduct>` — for non-price fields (MOQ, lead time, etc.).
  - `removeSupplierProduct(prisma, id: string): Promise<void>` — hard delete (see Global Constraints; blocked by the DB's `onDelete: Restrict` FK if price history exists — this function lets that constraint surface as a Prisma error, does not pre-check).
  - Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/supplier-products.repo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { createSupplier } from "../../../src/repositories/purchasing/suppliers.repo";
import { addSupplierProduct, updateSupplierProductPrice, updateSupplierProductDetails, removeSupplierProduct } from "../../../src/repositories/purchasing/supplier-products.repo";

let db: TestDb;
let supplierId: string;
let productId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  const s = await createSupplier(db.prisma, { legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT" });
  supplierId = s.id;
  const p = await db.prisma.product.create({ data: { name: "Resveratrolo 500mg" } });
  productId = p.id;
});

describe("supplier-products.repo", () => {
  it("addSupplierProduct creates the product link and its first price history row atomically", async () => {
    const sp = await addSupplierProduct(db.prisma, supplierId, {
      productId, standardPrice: 4.5, currency: "EUR", moq: 500, leadTimeDays: 21,
    });
    expect(Number(sp.standardPrice)).toBe(4.5);
    const history = await db.prisma.supplierProductPriceHistory.findMany({ where: { supplierProductId: sp.id } });
    expect(history).toHaveLength(1);
    expect(Number(history[0].price)).toBe(4.5);
    expect(history[0].source).toBe("initial");
  });

  it("updateSupplierProductPrice appends a new history row and updates the cached standardPrice", async () => {
    const sp = await addSupplierProduct(db.prisma, supplierId, { productId, standardPrice: 4.5, currency: "EUR" });
    const updated = await updateSupplierProductPrice(db.prisma, sp.id, { price: 5.2, source: "listino 2026-09" });
    expect(Number(updated.standardPrice)).toBe(5.2);
    const history = await db.prisma.supplierProductPriceHistory.findMany({ where: { supplierProductId: sp.id }, orderBy: { validFrom: "asc" } });
    expect(history).toHaveLength(2);
    expect(Number(history[0].price)).toBe(4.5); // original untouched
    expect(Number(history[1].price)).toBe(5.2);
  });

  it("updateSupplierProductDetails changes non-price fields without touching price/history", async () => {
    const sp = await addSupplierProduct(db.prisma, supplierId, { productId, standardPrice: 4.5, currency: "EUR", moq: 500 });
    const updated = await updateSupplierProductDetails(db.prisma, sp.id, { moq: 1000, leadTimeDays: 14 });
    expect(updated.moq).toBe(1000);
    expect(Number(updated.standardPrice)).toBe(4.5);
    const history = await db.prisma.supplierProductPriceHistory.findMany({ where: { supplierProductId: sp.id } });
    expect(history).toHaveLength(1);
  });

  it("removeSupplierProduct is blocked when price history exists (onDelete: Restrict)", async () => {
    const sp = await addSupplierProduct(db.prisma, supplierId, { productId, standardPrice: 4.5, currency: "EUR" });
    await expect(removeSupplierProduct(db.prisma, sp.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx vitest run tests/repositories/purchasing/supplier-products.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/supplier-products.repo.ts`:

```typescript
// repositories/purchasing/supplier-products.repo.ts — Company-wide, no amazonAccountId.
// standardPrice is a denormalized cache of the latest SupplierProductPriceHistory
// row, kept in sync inside the same transaction — never edited independently.
import type { PrismaClient, SupplierProduct } from "@prisma/client";

export interface AddSupplierProductInput {
  productId: string;
  supplierSku?: string | null;
  supplierProductName?: string | null;
  standardPrice: number;
  currency?: string;
  moq?: number | null;
  orderMultiple?: number | null;
  leadTimeDays?: number | null;
  unitsPerCarton?: number | null;
  unitsPerPallet?: number | null;
  weightKg?: number | null;
  conditions?: string | null;
  isPreferredSupplier?: boolean;
  notes?: string | null;
}

export async function findProductsForSupplier(prisma: PrismaClient, supplierId: string) {
  return prisma.supplierProduct.findMany({
    where: { supplierId },
    include: { priceHistory: { orderBy: { validFrom: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function addSupplierProduct(
  prisma: PrismaClient,
  supplierId: string,
  data: AddSupplierProductInput
): Promise<SupplierProduct> {
  const now = new Date();
  const currency = data.currency ?? "EUR";
  return prisma.supplierProduct.create({
    data: {
      supplierId,
      productId: data.productId,
      supplierSku: data.supplierSku ?? null,
      supplierProductName: data.supplierProductName ?? null,
      standardPrice: data.standardPrice,
      currency,
      moq: data.moq ?? null,
      orderMultiple: data.orderMultiple ?? null,
      leadTimeDays: data.leadTimeDays ?? null,
      unitsPerCarton: data.unitsPerCarton ?? null,
      unitsPerPallet: data.unitsPerPallet ?? null,
      weightKg: data.weightKg ?? null,
      conditions: data.conditions ?? null,
      lastPriceDate: now,
      isPreferredSupplier: data.isPreferredSupplier ?? false,
      notes: data.notes ?? null,
      priceHistory: {
        create: { price: data.standardPrice, currency, validFrom: now, source: "initial" },
      },
    },
  });
}

export async function updateSupplierProductPrice(
  prisma: PrismaClient,
  supplierProductId: string,
  data: { price: number; currency?: string; source: string; note?: string }
): Promise<SupplierProduct> {
  const now = new Date();
  const [, updated] = await prisma.$transaction([
    prisma.supplierProductPriceHistory.create({
      data: { supplierProductId, price: data.price, currency: data.currency ?? "EUR", validFrom: now, source: data.source, note: data.note ?? null },
    }),
    prisma.supplierProduct.update({
      where: { id: supplierProductId },
      data: { standardPrice: data.price, currency: data.currency ?? undefined, lastPriceDate: now },
    }),
  ]);
  return updated;
}

export async function updateSupplierProductDetails(
  prisma: PrismaClient,
  supplierProductId: string,
  data: Partial<Omit<AddSupplierProductInput, "productId" | "standardPrice" | "currency">>
): Promise<SupplierProduct> {
  return prisma.supplierProduct.update({ where: { id: supplierProductId }, data });
}

export async function removeSupplierProduct(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.supplierProduct.delete({ where: { id } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/repositories/purchasing/supplier-products.repo.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/supplier-products.repo.ts backend/tests/repositories/purchasing/supplier-products.repo.test.ts
git commit -m "feat(purchasing): add supplier-products repository with append-only price history"
```

---

### Task 5: `suppliers.routes.ts`

**Files:**
- Create: `backend/src/purchasing/routes/suppliers.routes.ts`
- Modify: `backend/src/server.ts` (mount alongside `masterDataRouter`)
- Test: `backend/tests/integration/purchasing-suppliers.test.ts`

**Interfaces:**
- Consumes: all repository functions from Tasks 2-4.
- Produces: `suppliersRouter` exposing:
  - `GET /api/purchasing/suppliers`, `GET /api/purchasing/suppliers/:id` (404 if not found), `POST /api/purchasing/suppliers`, `PUT /api/purchasing/suppliers/:id`, `DELETE /api/purchasing/suppliers/:id` (deactivate)
  - `POST /api/purchasing/suppliers/:id/contacts`, `PUT /api/purchasing/suppliers/:supplierId/contacts/:contactId`, `DELETE /api/purchasing/suppliers/:supplierId/contacts/:contactId`
  - `POST /api/purchasing/suppliers/:id/products`, `PUT /api/purchasing/suppliers/:supplierId/products/:supplierProductId/price`, `PUT /api/purchasing/suppliers/:supplierId/products/:supplierProductId`, `DELETE /api/purchasing/suppliers/:supplierId/products/:supplierProductId`
  - Consumed by Task 6-8 (frontend).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/purchasing-suppliers.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { suppliersRouter } = await import("../../src/purchasing/routes/suppliers.routes");
  app = express();
  app.use(express.json());
  app.use("/api/purchasing", suppliersRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("suppliers routes", () => {
  it("POST creates a supplier, GET list finds it, GET :id returns it with empty contacts/products", async () => {
    const post = await request(app).post("/api/purchasing/suppliers").send({
      legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT",
    });
    expect(post.status).toBe(200);
    const list = await request(app).get("/api/purchasing/suppliers");
    expect(list.body).toHaveLength(1);
    const detail = await request(app).get(`/api/purchasing/suppliers/${post.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.contacts).toEqual([]);
    expect(detail.body.products).toEqual([]);
  });

  it("GET :id returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/purchasing/suppliers/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("POST /:id/contacts adds a contact, visible in the detail view", async () => {
    const post = await request(app).post("/api/purchasing/suppliers").send({
      legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT",
    });
    await request(app).post(`/api/purchasing/suppliers/${post.body.id}/contacts`).send({ name: "Mario Rossi", isPrimary: true });
    const detail = await request(app).get(`/api/purchasing/suppliers/${post.body.id}`);
    expect(detail.body.contacts).toHaveLength(1);
    expect(detail.body.contacts[0].name).toBe("Mario Rossi");
  });

  it("POST /:id/products then PUT .../price appends history and updates the cached price", async () => {
    const supplierRes = await request(app).post("/api/purchasing/suppliers").send({
      legalName: "Acme", internalCode: "F2", supplierType: "Produttore", country: "IT",
    });
    const product = await db.prisma.product.create({ data: { name: "Test Product" } });
    const spRes = await request(app).post(`/api/purchasing/suppliers/${supplierRes.body.id}/products`).send({
      productId: product.id, standardPrice: 4.5,
    });
    expect(spRes.status).toBe(200);
    const priceRes = await request(app)
      .put(`/api/purchasing/suppliers/${supplierRes.body.id}/products/${spRes.body.id}/price`)
      .send({ price: 5.2, source: "listino aggiornato" });
    expect(priceRes.status).toBe(200);
    expect(Number(priceRes.body.standardPrice)).toBe(5.2);
    const detail = await request(app).get(`/api/purchasing/suppliers/${supplierRes.body.id}`);
    expect(detail.body.products[0].priceHistory).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx vitest run tests/integration/purchasing-suppliers.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the router**

Create `backend/src/purchasing/routes/suppliers.routes.ts`:

```typescript
// purchasing/routes/suppliers.routes.ts — Supplier + nested contacts/products CRUD.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { findAllSuppliers, findSupplierById, createSupplier, updateSupplier, deactivateSupplier } from "../../repositories/purchasing/suppliers.repo";
import { createContact, updateContact, deleteContact } from "../../repositories/purchasing/supplier-contacts.repo";
import { addSupplierProduct, updateSupplierProductPrice, updateSupplierProductDetails, removeSupplierProduct } from "../../repositories/purchasing/supplier-products.repo";

export const suppliersRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
suppliersRouter.get("/suppliers", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllSuppliers(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

suppliersRouter.get("/suppliers/:id", async (req: Request, res: Response) => {
  try {
    const supplier = await findSupplierById(prisma, req.params.id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    res.json(supplier);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

suppliersRouter.post("/suppliers", async (req: Request, res: Response) => {
  try {
    const { legalName, internalCode, supplierType, country } = req.body ?? {};
    if (!legalName || !internalCode || !supplierType || !country) {
      return res.status(400).json({ error: "legalName, internalCode, supplierType, country required" });
    }
    res.json(await createSupplier(prisma, req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

suppliersRouter.put("/suppliers/:id", async (req: Request, res: Response) => {
  try {
    res.json(await updateSupplier(prisma, req.params.id, req.body ?? {}));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Supplier not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.delete("/suppliers/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivateSupplier(prisma, req.params.id));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Supplier not found" });
    res.status(500).json({ error: String(err) });
  }
});

// ─── Contacts ────────────────────────────────────────────────────────────────
suppliersRouter.post("/suppliers/:id/contacts", async (req: Request, res: Response) => {
  try {
    const { name } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "name required" });
    res.json(await createContact(prisma, req.params.id, req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

suppliersRouter.put("/suppliers/:supplierId/contacts/:contactId", async (req: Request, res: Response) => {
  try {
    res.json(await updateContact(prisma, req.params.contactId, req.body ?? {}));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Contact not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.delete("/suppliers/:supplierId/contacts/:contactId", async (req: Request, res: Response) => {
  try {
    await deleteContact(prisma, req.params.contactId);
    res.json({ ok: true });
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Contact not found" });
    res.status(500).json({ error: String(err) });
  }
});

// ─── Supplier products ───────────────────────────────────────────────────────
suppliersRouter.post("/suppliers/:id/products", async (req: Request, res: Response) => {
  try {
    const { productId, standardPrice } = req.body ?? {};
    if (!productId || standardPrice === undefined) {
      return res.status(400).json({ error: "productId, standardPrice required" });
    }
    res.json(await addSupplierProduct(prisma, req.params.id, { ...req.body, standardPrice: Number(standardPrice) }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

suppliersRouter.put("/suppliers/:supplierId/products/:supplierProductId/price", async (req: Request, res: Response) => {
  try {
    const { price, currency, source, note } = req.body ?? {};
    if (price === undefined || !source) return res.status(400).json({ error: "price, source required" });
    res.json(await updateSupplierProductPrice(prisma, req.params.supplierProductId, { price: Number(price), currency, source, note }));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "SupplierProduct not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.put("/suppliers/:supplierId/products/:supplierProductId", async (req: Request, res: Response) => {
  try {
    res.json(await updateSupplierProductDetails(prisma, req.params.supplierProductId, req.body ?? {}));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "SupplierProduct not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.delete("/suppliers/:supplierId/products/:supplierProductId", async (req: Request, res: Response) => {
  try {
    await removeSupplierProduct(prisma, req.params.supplierProductId);
    res.json({ ok: true });
  } catch (err) {
    // P2003 = FK constraint violation — the onDelete: Restrict on price history firing.
    if ((err as any)?.code === "P2003") {
      return res.status(409).json({ error: "Impossibile rimuovere: esiste uno storico prezzi collegato" });
    }
    if (notFound(err)) return res.status(404).json({ error: "SupplierProduct not found" });
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Mount the router**

In `backend/src/server.ts`, add the import near the `masterDataRouter` import and mount it right after that line:

```typescript
import { masterDataRouter } from "./purchasing/routes/master-data.routes";
import { suppliersRouter } from "./purchasing/routes/suppliers.routes";
// ...
app.use("/api/purchasing", requireAuth, masterDataRouter);
app.use("/api/purchasing", requireAuth, suppliersRouter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/integration/purchasing-suppliers.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/purchasing/routes/suppliers.routes.ts backend/src/server.ts backend/tests/integration/purchasing-suppliers.test.ts
git commit -m "feat(purchasing): add suppliers REST routes with nested contacts/products"
```

---

### Task 6: Frontend API client + promote "Fornitori" tab to a real list

**Files:**
- Create: `frontend/src/lib/api/suppliers.ts`
- Modify: `frontend/src/lib/api/index.ts`
- Modify: `frontend/src/app/anagrafiche/page.tsx`

**Interfaces:**
- Consumes: Task 5's REST endpoints.
- Produces: `api.suppliers.{list, get, create, update, deactivate, contacts.{create,update,remove}, products.{add,updatePrice,updateDetails,remove}}`, a `FornitoriTab` component listing suppliers with a "+ Nuovo Fornitore" button linking to `/anagrafiche/fornitori/nuovo`, each row linking to `/anagrafiche/fornitori/[id]`.

- [ ] **Step 1: Create the API client**

Create `frontend/src/lib/api/suppliers.ts`:

```typescript
// lib/api/suppliers.ts — Supplier, SupplierContact, SupplierProduct.
import { apiUrl, get } from "./client";

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
}

export interface SupplierContact {
  id: string; supplierId: string; name: string; role: string | null; email: string | null;
  phone: string | null; whatsapp: string | null; isPrimary: boolean; notes: string | null;
}

export interface SupplierProductPriceHistory {
  id: string; price: number; currency: string; validFrom: string; source: string; note: string | null;
}

export interface SupplierProduct {
  id: string; supplierId: string; productId: string; supplierSku: string | null;
  supplierProductName: string | null; standardPrice: number; currency: string;
  moq: number | null; orderMultiple: number | null; leadTimeDays: number | null;
  unitsPerCarton: number | null; unitsPerPallet: number | null; weightKg: number | null;
  conditions: string | null; lastPriceDate: string; isPreferredSupplier: boolean;
  notes: string | null; priceHistory: SupplierProductPriceHistory[];
}

export type SupplierDetail = Supplier & { contacts: SupplierContact[]; products: SupplierProduct[] };

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
async function del(path: string): Promise<void> {
  const res = await fetch(apiUrl(path), { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export const suppliers = {
  list: () => get<Supplier[]>("/api/purchasing/suppliers"),
  get: (id: string) => get<SupplierDetail>(`/api/purchasing/suppliers/${id}`),
  create: (data: Record<string, unknown>) => post<Supplier>("/api/purchasing/suppliers", data),
  update: (id: string, data: Record<string, unknown>) => put<Supplier>(`/api/purchasing/suppliers/${id}`, data),
  deactivate: (id: string) => del(`/api/purchasing/suppliers/${id}`),
  contacts: {
    create: (supplierId: string, data: Record<string, unknown>) => post<SupplierContact>(`/api/purchasing/suppliers/${supplierId}/contacts`, data),
    update: (supplierId: string, contactId: string, data: Record<string, unknown>) => put<SupplierContact>(`/api/purchasing/suppliers/${supplierId}/contacts/${contactId}`, data),
    remove: (supplierId: string, contactId: string) => del(`/api/purchasing/suppliers/${supplierId}/contacts/${contactId}`),
  },
  products: {
    add: (supplierId: string, data: Record<string, unknown>) => post<SupplierProduct>(`/api/purchasing/suppliers/${supplierId}/products`, data),
    updatePrice: (supplierId: string, spId: string, data: { price: number; currency?: string; source: string; note?: string }) =>
      put<SupplierProduct>(`/api/purchasing/suppliers/${supplierId}/products/${spId}/price`, data),
    updateDetails: (supplierId: string, spId: string, data: Record<string, unknown>) => put<SupplierProduct>(`/api/purchasing/suppliers/${supplierId}/products/${spId}`, data),
    remove: (supplierId: string, spId: string) => del(`/api/purchasing/suppliers/${supplierId}/products/${spId}`),
  },
};
```

Wire it into `frontend/src/lib/api/index.ts` the same way `purchasing` was added in FASE B (import + add `suppliers` to the `api` object).

- [ ] **Step 2: Promote "Fornitori" in `anagrafiche/page.tsx`**

In `frontend/src/app/anagrafiche/page.tsx`:
1. Change `type Tab = "banche" | "magazzini" | "condizioni-pagamento";` to `type Tab = "banche" | "magazzini" | "condizioni-pagamento" | "fornitori";`
2. Change `const COMING_SOON = ["Fornitori", "Clienti", "Categorie contabili", "Trasportatori"];` to `const COMING_SOON = ["Clienti", "Categorie contabili", "Trasportatori"];`
3. Add `{ id: "fornitori", label: "Fornitori" }` to the `TABS` array.
4. Add a `FornitoriTab` component (new import from a new file, see Step 3 below) and `{tab === "fornitori" && <FornitoriTab />}` to the render switch.

- [ ] **Step 3: Create the `FornitoriTab` component**

Create `frontend/src/components/purchasing/FornitoriTab.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/api/suppliers";

export default function FornitoriTab() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const load = useCallback(() => { api.suppliers.list().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-bg-border">
        <span className="text-xs text-zinc-500">{rows.length} fornitori</span>
        <Link
          href="/anagrafiche/fornitori/nuovo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
        >
          <Plus size={13} /> Nuovo Fornitore
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Codice</th><th className="px-3 py-2.5">Ragione sociale</th>
            <th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Paese</th><th className="px-3 py-2.5">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
              <td className="px-3 py-2.5">
                <Link href={`/anagrafiche/fornitori/${r.id}`} className="font-mono text-accent-primary hover:underline">{r.internalCode}</Link>
              </td>
              <td className="px-3 py-2.5">{r.legalName}</td>
              <td className="px-3 py-2.5">{r.supplierType}</td>
              <td className="px-3 py-2.5">{r.country}</td>
              <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun fornitore — inizia creandone uno</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/frontend && npx tsc --noEmit
```
Expected: no errors (the `/anagrafiche/fornitori/nuovo` and `/anagrafiche/fornitori/[id]` routes don't exist yet — that's fine, `<Link>` doesn't require the target route to exist at typecheck time; Tasks 7-8 create them).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/suppliers.ts frontend/src/lib/api/index.ts frontend/src/app/anagrafiche/page.tsx frontend/src/components/purchasing/FornitoriTab.tsx
git commit -m "feat(purchasing): promote Fornitori tab to a real supplier list"
```

---

### Task 7: Frontend — `/anagrafiche/fornitori/nuovo` (create form)

**Files:**
- Create: `frontend/src/components/purchasing/SupplierForm.tsx`
- Create: `frontend/src/app/anagrafiche/fornitori/nuovo/page.tsx`

**Interfaces:**
- Consumes: `api.suppliers.create` (Task 6).
- Produces: `SupplierForm` — a reusable 6-section form component taking `initial?: Partial<SupplierFormState>` and `onSubmit: (data: SupplierFormState) => Promise<void>`, used by both this task (create) and Task 8 (edit).

- [ ] **Step 1: Create the shared form component**

Create `frontend/src/components/purchasing/SupplierForm.tsx`. This is the first multi-section form in the codebase (confirmed no precedent exists — see plan Global Constraints): one grouped state object, section blocks as plain `<div>`s with a heading, native HTML validation (`required`) matching the codebase's only prior form example (`CreateUserModal`).

```tsx
"use client";
import { useState } from "react";

export interface SupplierFormState {
  legalName: string; tradeName: string; internalCode: string; supplierType: string;
  country: string; language: string; defaultCurrency: string;
  vatNumber: string; taxCode: string; foreignVatNumber: string; sdiCode: string; pec: string; taxRegime: string; fiscalNotes: string;
  addressLine: string; streetNumber: string; postalCode: string; city: string; province: string; addressCountry: string;
  defaultPaymentMethod: string; paymentDays: string; bankName: string; iban: string; bic: string; ribaEnabled: boolean;
}

export const EMPTY_SUPPLIER_FORM: SupplierFormState = {
  legalName: "", tradeName: "", internalCode: "", supplierType: "", country: "IT", language: "it", defaultCurrency: "EUR",
  vatNumber: "", taxCode: "", foreignVatNumber: "", sdiCode: "", pec: "", taxRegime: "", fiscalNotes: "",
  addressLine: "", streetNumber: "", postalCode: "", city: "", province: "", addressCountry: "IT",
  defaultPaymentMethod: "", paymentDays: "", bankName: "", iban: "", bic: "", ribaEnabled: false,
};

const PAYMENT_METHODS = ["", "BONIFICO", "RIBA", "ASSEGNO", "CONTANTI", "PAYPAL", "CARTA", "ALTRO"];

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
  initial?: Partial<SupplierFormState>;
  disableInternalCode?: boolean;
  submitLabel: string;
  onSubmit: (data: SupplierFormState) => Promise<void>;
}

export default function SupplierForm({ initial, disableInternalCode, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<SupplierFormState>({ ...EMPTY_SUPPLIER_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof SupplierFormState>(key: K, value: SupplierFormState[K]) =>
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
        <Field label="Ragione sociale *"><input required className={inputClass} value={form.legalName} onChange={e => set("legalName", e.target.value)} /></Field>
        <Field label="Nome commerciale"><input className={inputClass} value={form.tradeName} onChange={e => set("tradeName", e.target.value)} /></Field>
        <Field label="Codice interno *"><input required disabled={disableInternalCode} className={inputClass} value={form.internalCode} onChange={e => set("internalCode", e.target.value)} /></Field>
        <Field label="Tipologia fornitore *"><input required className={inputClass} value={form.supplierType} onChange={e => set("supplierType", e.target.value)} placeholder="es. Produttore, Distributore" /></Field>
        <Field label="Nazione *"><input required className={inputClass} value={form.country} onChange={e => set("country", e.target.value)} /></Field>
        <Field label="Lingua"><input className={inputClass} value={form.language} onChange={e => set("language", e.target.value)} /></Field>
        <Field label="Valuta predefinita"><input className={inputClass} value={form.defaultCurrency} onChange={e => set("defaultCurrency", e.target.value)} /></Field>
      </Section>

      <Section title="Dati fiscali">
        <Field label="Partita IVA"><input className={inputClass} value={form.vatNumber} onChange={e => set("vatNumber", e.target.value)} /></Field>
        <Field label="Codice fiscale"><input className={inputClass} value={form.taxCode} onChange={e => set("taxCode", e.target.value)} /></Field>
        <Field label="VAT number estero"><input className={inputClass} value={form.foreignVatNumber} onChange={e => set("foreignVatNumber", e.target.value)} /></Field>
        <Field label="Codice SDI"><input className={inputClass} value={form.sdiCode} onChange={e => set("sdiCode", e.target.value)} /></Field>
        <Field label="PEC"><input type="email" className={inputClass} value={form.pec} onChange={e => set("pec", e.target.value)} /></Field>
        <Field label="Regime fiscale"><input className={inputClass} value={form.taxRegime} onChange={e => set("taxRegime", e.target.value)} /></Field>
        <Field label="Note fiscali"><input className={inputClass} value={form.fiscalNotes} onChange={e => set("fiscalNotes", e.target.value)} /></Field>
      </Section>

      <Section title="Indirizzo">
        <Field label="Indirizzo"><input className={inputClass} value={form.addressLine} onChange={e => set("addressLine", e.target.value)} /></Field>
        <Field label="Civico"><input className={inputClass} value={form.streetNumber} onChange={e => set("streetNumber", e.target.value)} /></Field>
        <Field label="CAP"><input className={inputClass} value={form.postalCode} onChange={e => set("postalCode", e.target.value)} /></Field>
        <Field label="Città"><input className={inputClass} value={form.city} onChange={e => set("city", e.target.value)} /></Field>
        <Field label="Provincia"><input className={inputClass} value={form.province} onChange={e => set("province", e.target.value)} /></Field>
        <Field label="Nazione"><input className={inputClass} value={form.addressCountry} onChange={e => set("addressCountry", e.target.value)} /></Field>
      </Section>

      <Section title="Pagamenti">
        <Field label="Modalità predefinita">
          <select className={inputClass} value={form.defaultPaymentMethod} onChange={e => set("defaultPaymentMethod", e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m || "—"}</option>)}
          </select>
        </Field>
        <Field label="Giorni pagamento"><input type="number" className={inputClass} value={form.paymentDays} onChange={e => set("paymentDays", e.target.value)} /></Field>
        <Field label="Banca fornitore"><input className={inputClass} value={form.bankName} onChange={e => set("bankName", e.target.value)} /></Field>
        <Field label="IBAN"><input className={inputClass} value={form.iban} onChange={e => set("iban", e.target.value)} /></Field>
        <Field label="BIC/SWIFT"><input className={inputClass} value={form.bic} onChange={e => set("bic", e.target.value)} /></Field>
        <Field label="Abilitato Ri.Ba.">
          <input type="checkbox" checked={form.ribaEnabled} onChange={e => set("ribaEnabled", e.target.checked)} className="w-4 h-4" />
        </Field>
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

Create `frontend/src/app/anagrafiche/fornitori/nuovo/page.tsx`:

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
    router.push(`/anagrafiche/fornitori/${supplier.id}`);
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

- [ ] **Step 3: Typecheck**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual browser verification**

Navigate to `/anagrafiche/fornitori/nuovo`, fill in the required fields (Ragione sociale, Codice interno, Tipologia fornitore, Nazione), submit, confirm redirect to `/anagrafiche/fornitori/[new-id]` (will 404 until Task 8 — that's expected at this point in the plan; confirm the POST succeeded by checking the Fornitori list instead).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/purchasing/SupplierForm.tsx frontend/src/app/anagrafiche/fornitori/nuovo/page.tsx
git commit -m "feat(purchasing): add supplier create form"
```

---

### Task 8: Frontend — `/anagrafiche/fornitori/[id]` (detail page with tabs)

**Files:**
- Create: `frontend/src/app/anagrafiche/fornitori/[id]/page.tsx`

**Interfaces:**
- Consumes: `api.suppliers.get/update` (Task 6), `SupplierForm` (Task 7), `api.suppliers.contacts.*`/`products.*` (Task 6).
- Produces: the supplier detail page with tabs `PANORAMICA` (the edit form, pre-filled), `PRODOTTI` (list + add-product mini-form + price-update action), `CONTATTI` (list + add-contact mini-form) — plus disabled "Prossimamente" tabs for `ORDINI`/`DDT`/`FATTURE`/`SCADENZE`/`PAGAMENTI`/`DOCUMENTI` (not built until later phases), matching the tab structure from `docs/superpowers/specs/2026-08-05-purchasing-erp-architecture.md`'s §26/27.

- [ ] **Step 1: Create the detail page**

Create `frontend/src/app/anagrafiche/fornitori/[id]/page.tsx`:

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
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual browser verification**

Full end-to-end flow: `/anagrafiche` → Fornitori tab → "+ Nuovo Fornitore" → fill required fields → submit → redirected to the new supplier's detail page → confirm Panoramica tab shows the saved data → switch to Contatti, add a contact, confirm it appears → switch to Prodotti, add a product (need a real `productId` — query `SELECT id FROM "Product" LIMIT 1` against the dev DB, or create one via the existing products UI first), confirm it appears with the entered price → click "Aggiorna prezzo", confirm the displayed price updates → confirm the 6 "Prossimamente" tabs are visibly disabled with the badge pattern established in FASE B.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/anagrafiche/fornitori/[id]/page.tsx
git commit -m "feat(purchasing): add supplier detail page with Panoramica/Prodotti/Contatti tabs"
```

---

## Final verification (after all tasks)

- [ ] Full backend test suite: `cd backend && npx vitest run` — expect the same pre-existing Testcontainers hook-timeout flakiness observed in FASE B (environmental, not a regression — confirmed there via isolation reruns); no new assertion failures among tests that do run.
- [ ] `npx tsc --noEmit` (backend and frontend) — clean.
- [ ] Full manual browser walkthrough per Task 8 Step 3.
- [ ] Push `feature/supplier-management` and open a PR against `develop`.

## Self-Review

**Spec coverage:** every entity from the architecture doc's §2/§3 (Supplier, SupplierContact, SupplierProduct, SupplierProductPriceHistory) is covered — Task 1 (schema), Tasks 2-4 (repos), Task 5 (routes), Tasks 6-8 (frontend: list, create, detail/edit with tabs). The architecture doc's §27 "Dettaglio Fornitore" tab list (Overview/Prodotti/Ordini/Ricezioni/Fatture/Scadenze/Pagamenti/Documenti/Statistiche) is only partially built now (Panoramica/Prodotti/Contatti) — the rest are explicitly disabled "Prossimamente" tabs, matching FASE B's established pattern for functionality that depends on later phases (Ordini→FASE D, Ricezioni→FASE E, Fatture→FASE G, Scadenze→FASE I, Pagamenti→FASE M). "Statistiche" (aggregates like "Totale acquistato anno") has no data to aggregate yet (no Purchase Orders exist) — correctly out of scope, not stubbed.

**Deviations from the architecture doc, and why:**
1. Dropped the separate `deletedAt` field for `Supplier`, keeping only `isActive` — redundant soft-delete mechanisms in the original doc text, resolved in favor of consistency with FASE B's established convention.
2. Resolved the `country` field name collision (appeared in both "Identificazione" and "Indirizzo" sections of the original doc) by naming the address one `addressCountry`.
3. `SupplierContact`/`SupplierProduct` are hard-deletable, an explicit exception to the module's general no-hard-delete rule — justified in Global Constraints (no financial history references them; `SupplierProductPriceHistory` itself remains append-only and is what's actually protected).

**Placeholder scan:** no TBD/vague steps — every step has complete code, including the full 25-field form (all fields from the architecture doc's Supplier ERD entry are present, none deferred with a "add more fields later" comment).

**Type consistency:** `SupplierFormState` (Task 7) field names match `toFormState()`'s mapping (Task 8) and the repository's `CreateSupplierInput` (Task 2) field-for-field; `SupplierWithRelations`/`SupplierDetail` (Task 2 backend / Task 6 frontend) both shape `{ ...Supplier, contacts, products }` identically; `addSupplierProduct`/`updateSupplierProductPrice` signatures (Task 4) match exactly what Task 5's routes and Task 8's `ProdottiTab` call.
