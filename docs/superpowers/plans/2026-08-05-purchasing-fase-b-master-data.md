# FASE B — Anagrafiche di base (Warehouse, PaymentTerm, BankAccount) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first three master-data entities of the Purchasing/ERP module (Warehouse, PaymentTerm + its installment rules, BankAccount) plus a `User.purchasingRole` field for future RBAC, with full repository layer, REST routes, and a minimal frontend page — the first end-to-end, demoable slice of the 15-phase roadmap in `docs/superpowers/specs/2026-08-05-purchasing-erp-architecture.md`.

**Architecture:** Company-wide (not Amazon-account-scoped) entities under a new `backend/src/repositories/purchasing/` domain, following the existing repository-layer/Decimal/cuid conventions exactly. No money-movement logic in this phase — pure master-data CRUD, soft-deactivate only (never hard delete, per the module's non-negotiable §29 rule).

**Tech Stack:** Same as the rest of WBDASH backend/frontend — Express + TypeScript + Prisma + PostgreSQL, Next.js 14 + Tailwind, Vitest + Testcontainers.

## Global Constraints

- **Repo-layer rule (absolute):** only `backend/src/repositories/**` calls Prisma directly. New code goes in `backend/src/repositories/purchasing/`.
- **No `amazonAccountId` / no `getCurrentAccountId()`** on any entity in this plan — this module is company-wide, confirmed by the user (§11 of the architecture doc). Test files therefore use the **account-agnostic** scaffolding (`beforeAll(setupTestDb) / afterAll(cleanup) / beforeEach(truncateAll)` only — no `createTestAmazonAccount`, no `runWithAccount`), matching `backend/tests/repositories/shopify/error-log.repo.test.ts` and `sync-state.repo.test.ts`, **not** `product.repo.test.ts` (whose account scaffolding is vestigial/unused boilerplate, confirmed by this plan's research — do not copy it).
- **Schema conventions:** `id String @id @default(cuid())`; `createdAt DateTime @default(now())` / `updatedAt DateTime @updatedAt` on every mutable model; monetary fields `Decimal @db.Decimal(14, 4)`; Prisma enum (bare `enum Name { VALUE }` block, no `@map`) for closed value sets, matching `enum ChannelType`/`enum ProductStatus` in `backend/prisma/schema.prisma:738-746`.
- **`PaymentTermInstallmentRule.percentage` is `Decimal @db.Decimal(5, 2)`, not `Float`** — a deliberate exception to the project's general "ratios stay Float" convention (ACOS/ROAS/CTR): this percentage directly determines a money split and must sum to exactly 100.00 with no floating-point drift, unlike a pure analytics ratio.
- **No hard deletes anywhere in this module** — every "delete" repository function is actually a deactivation (`isActive = false`), per the module's non-negotiable rule (already-used administrative data is never physically removed).
- **Migrations:** `prisma migrate dev` only, never `db push`. **Task 1's migration step requires explicit user confirmation before running** (same gate as every schema change in this project).
- **RBAC field:** `User.purchasingRole String?` (nullable — `null` means no purchasing access), **separate** from the existing `User.role` field used by tested auth middleware — confirmed decision, do not touch `User.role`.
- **Routes mount:** `requireAuth` only (no `amazonAccountMiddleware` — this module has no Amazon-account concept), matching how `/api/auth/admin` is mounted in `backend/src/server.ts:149`.
- **Branch:** `feature/master-data` off `develop` (already checked out in the dedicated worktree at `.claude/worktrees/purchasing-erp`, currently on `docs/purchasing-erp-architecture` — Task 0 below switches it).
- **Test command:** `cd backend && npx vitest run <path>` for a single file; `npx tsc --noEmit` for typecheck.

---

### Task 0: Create the feature branch

- [ ] **Step 1:** From the current worktree (already on `docs/purchasing-erp-architecture`, which is committed and clean):
```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp
git fetch origin
git checkout -B feature/master-data origin/develop
```

---

### Task 1: Prisma schema — Warehouse, PaymentTerm, PaymentTermInstallmentRule, BankAccount, PurchasePaymentMethod enum, User.purchasingRole

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create (generated): `backend/prisma/migrations/<timestamp>_add_purchasing_master_data/migration.sql`

**Interfaces:**
- Produces: models `Warehouse` (`id, name, code, address, isActive, createdAt, updatedAt`), `PaymentTerm` (`id, name, type, endOfMonth, fixedDay, paymentMethod, isActive, createdAt, updatedAt`) with child `PaymentTermInstallmentRule` (`id, paymentTermId, installmentNumber, offsetDays, percentage`), `BankAccount` (`id, bankName, alias, accountHolder, iban, bic, currency, openingBalance, openingBalanceDate, isActive, accountingCode, notes, createdAt, updatedAt`), enum `PurchasePaymentMethod`, and `User.purchasingRole String?` — every later task's Prisma calls depend on these exact names/types.

- [ ] **Step 1: Add the enum and the three models**

Append at the end of `backend/prisma/schema.prisma`:

```prisma
// ─── Purchasing module — FASE B: base master data ──────────────────────────
// See docs/superpowers/specs/2026-08-05-purchasing-erp-architecture.md.
// Company-wide (no amazonAccountId) — this is not an Amazon-domain concept.
enum PurchasePaymentMethod {
  BONIFICO
  RIBA
  ASSEGNO
  CONTANTI
  PAYPAL
  CARTA
  ALTRO
}

model Warehouse {
  id        String   @id @default(cuid())
  name      String
  code      String   @unique
  address   String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isActive])
}

model PaymentTerm {
  id            String                       @id @default(cuid())
  name          String
  type          String
  endOfMonth    Boolean                      @default(false)
  fixedDay      Int?
  paymentMethod PurchasePaymentMethod
  isActive      Boolean                      @default(true)
  createdAt     DateTime                     @default(now())
  updatedAt     DateTime                     @updatedAt
  installments  PaymentTermInstallmentRule[]

  @@index([isActive])
}

// percentage is Decimal, not Float — deliberate exception to the "ratios stay
// Float" convention: this splits real money and must sum to exactly 100.00.
model PaymentTermInstallmentRule {
  id                String      @id @default(cuid())
  paymentTermId     String
  paymentTerm       PaymentTerm @relation(fields: [paymentTermId], references: [id], onDelete: Cascade)
  installmentNumber Int
  offsetDays        Int
  percentage        Decimal     @db.Decimal(5, 2)

  @@unique([paymentTermId, installmentNumber])
  @@index([paymentTermId])
}

model BankAccount {
  id                 String   @id @default(cuid())
  bankName           String
  alias              String
  accountHolder      String
  iban               String   @unique
  bic                String?
  currency           String   @default("EUR")
  openingBalance     Decimal  @default(0) @db.Decimal(14, 4)
  openingBalanceDate DateTime
  isActive           Boolean  @default(true)
  accountingCode     String?
  notes              String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([isActive])
}
```

- [ ] **Step 2: Add `purchasingRole` to `User`**

Find the `User` model (`backend/prisma/schema.prisma:642`). Add one line right after `role String @default("user")`:

```prisma
  role                String    @default("user")   // "master" | "admin" | "user"
  purchasingRole      String?                       // "ADMIN" | "MANAGEMENT" | "PURCHASING" | "WAREHOUSE" | "ACCOUNTING" | "READ_ONLY" | null = no purchasing access
```

- [ ] **Step 3: Validate**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: STOP — confirm with the user before applying the migration**

Show the user the diff (`git diff backend/prisma/schema.prisma`) and get an explicit go-ahead before Step 5 (CLAUDE.md principle #6 — every schema change needs explicit confirmation).

- [ ] **Step 5: Generate and apply the migration**

```bash
npx prisma migrate dev --name add_purchasing_master_data
```
Expected: a new migration folder sorting after `20260804194738_add_advertised_product_snapshot`, containing `CREATE TYPE "PurchasePaymentMethod"`, three `CREATE TABLE` statements, and `ALTER TABLE "User" ADD COLUMN "purchasingRole"` — applied cleanly, no drift.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(purchasing): add Warehouse, PaymentTerm, BankAccount master data + User.purchasingRole"
```

---

### Task 2: `warehouses.repo.ts`

**Files:**
- Create: `backend/src/repositories/purchasing/warehouses.repo.ts`
- Test: `backend/tests/repositories/purchasing/warehouses.repo.test.ts`

**Interfaces:**
- Produces: `findAllWarehouses(prisma): Promise<Warehouse[]>`, `createWarehouse(prisma, data: {name, code, address?}): Promise<Warehouse>`, `updateWarehouse(prisma, id, data: Partial<{name, address}>): Promise<Warehouse>`, `deactivateWarehouse(prisma, id): Promise<Warehouse>` — consumed by Task 5 (routes).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/warehouses.repo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllWarehouses, createWarehouse, updateWarehouse, deactivateWarehouse } from "../../../src/repositories/purchasing/warehouses.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("warehouses.repo", () => {
  it("creates a warehouse and finds it in the active list", async () => {
    await createWarehouse(db.prisma, { name: "Magazzino Centrale", code: "MAG-01" });
    const all = await findAllWarehouses(db.prisma);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Magazzino Centrale");
    expect(all[0].isActive).toBe(true);
  });

  it("rejects a duplicate code", async () => {
    await createWarehouse(db.prisma, { name: "A", code: "DUP" });
    await expect(createWarehouse(db.prisma, { name: "B", code: "DUP" })).rejects.toThrow();
  });

  it("updates name/address without touching code", async () => {
    const w = await createWarehouse(db.prisma, { name: "Old Name", code: "MAG-02" });
    const updated = await updateWarehouse(db.prisma, w.id, { name: "New Name", address: "Via Roma 1" });
    expect(updated.name).toBe("New Name");
    expect(updated.address).toBe("Via Roma 1");
    expect(updated.code).toBe("MAG-02");
  });

  it("deactivate sets isActive=false instead of deleting the row", async () => {
    const w = await createWarehouse(db.prisma, { name: "To Deactivate", code: "MAG-03" });
    await deactivateWarehouse(db.prisma, w.id);
    const row = await db.prisma.warehouse.findUnique({ where: { id: w.id } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx vitest run tests/repositories/purchasing/warehouses.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/warehouses.repo.ts`:

```typescript
// repositories/purchasing/warehouses.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, Warehouse } from "@prisma/client";

export async function findAllWarehouses(prisma: PrismaClient): Promise<Warehouse[]> {
  return prisma.warehouse.findMany({ orderBy: { name: "asc" } });
}

export async function createWarehouse(
  prisma: PrismaClient,
  data: { name: string; code: string; address?: string | null }
): Promise<Warehouse> {
  return prisma.warehouse.create({ data });
}

export async function updateWarehouse(
  prisma: PrismaClient,
  id: string,
  data: Partial<{ name: string; address: string | null }>
): Promise<Warehouse> {
  return prisma.warehouse.update({ where: { id }, data });
}

export async function deactivateWarehouse(prisma: PrismaClient, id: string): Promise<Warehouse> {
  return prisma.warehouse.update({ where: { id }, data: { isActive: false } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/repositories/purchasing/warehouses.repo.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/warehouses.repo.ts backend/tests/repositories/purchasing/warehouses.repo.test.ts
git commit -m "feat(purchasing): add warehouses repository"
```

---

### Task 3: `payment-terms.repo.ts`

**Files:**
- Create: `backend/src/repositories/purchasing/payment-terms.repo.ts`
- Test: `backend/tests/repositories/purchasing/payment-terms.repo.test.ts`

**Interfaces:**
- Produces: `findAllPaymentTerms(prisma): Promise<(PaymentTerm & { installments: PaymentTermInstallmentRule[] })[]>`, `createPaymentTerm(prisma, data: { name, type, endOfMonth, fixedDay?, paymentMethod, installments: { installmentNumber, offsetDays, percentage }[] }): Promise<PaymentTerm & { installments: PaymentTermInstallmentRule[] }>` (throws if `Σ percentage !== 100`), `deactivatePaymentTerm(prisma, id): Promise<PaymentTerm>` — consumed by Task 5 (routes) and, later, by FASE I's deadline-generation algorithm.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/payment-terms.repo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllPaymentTerms, createPaymentTerm, deactivatePaymentTerm } from "../../../src/repositories/purchasing/payment-terms.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("payment-terms.repo", () => {
  it("creates a payment term with its installment rules in one transaction", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "Ri.Ba. 30/60/90", type: "RIBA", endOfMonth: false, paymentMethod: "RIBA",
      installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 33.34 },
        { installmentNumber: 2, offsetDays: 60, percentage: 33.33 },
        { installmentNumber: 3, offsetDays: 90, percentage: 33.33 },
      ],
    });
    expect(term.installments).toHaveLength(3);
    const all = await findAllPaymentTerms(db.prisma);
    expect(all).toHaveLength(1);
    expect(all[0].installments.map(i => Number(i.percentage)).sort()).toEqual([33.33, 33.33, 33.34]);
  });

  it("rejects installment percentages that don't sum to exactly 100", async () => {
    await expect(createPaymentTerm(db.prisma, {
      name: "Bad Term", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 50 },
        { installmentNumber: 2, offsetDays: 60, percentage: 40 },
      ],
    })).rejects.toThrow(/100/);
  });

  it("deactivate sets isActive=false without deleting the installment rules", async () => {
    const term = await createPaymentTerm(db.prisma, {
      name: "Immediate", type: "IMMEDIATE", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 0, percentage: 100 }],
    });
    await deactivatePaymentTerm(db.prisma, term.id);
    const row = await db.prisma.paymentTerm.findUnique({ where: { id: term.id }, include: { installments: true } });
    expect(row!.isActive).toBe(false);
    expect(row!.installments).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx vitest run tests/repositories/purchasing/payment-terms.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/payment-terms.repo.ts`:

```typescript
// repositories/purchasing/payment-terms.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, PaymentTerm, PaymentTermInstallmentRule, PurchasePaymentMethod } from "@prisma/client";

type PaymentTermWithInstallments = PaymentTerm & { installments: PaymentTermInstallmentRule[] };

export async function findAllPaymentTerms(prisma: PrismaClient): Promise<PaymentTermWithInstallments[]> {
  return prisma.paymentTerm.findMany({
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export interface CreatePaymentTermInput {
  name: string;
  type: string;
  endOfMonth: boolean;
  fixedDay?: number | null;
  paymentMethod: PurchasePaymentMethod;
  installments: { installmentNumber: number; offsetDays: number; percentage: number }[];
}

export async function createPaymentTerm(
  prisma: PrismaClient,
  data: CreatePaymentTermInput
): Promise<PaymentTermWithInstallments> {
  const totalPct = data.installments.reduce((s, i) => s + i.percentage, 0);
  // Rounding tolerance: percentages are Decimal(5,2), so 0.01 covers legitimate
  // rounding (e.g. 33.34 + 33.33 + 33.33) without masking a real input error.
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Installment percentages must sum to 100, got ${totalPct}`);
  }

  return prisma.paymentTerm.create({
    data: {
      name: data.name, type: data.type, endOfMonth: data.endOfMonth,
      fixedDay: data.fixedDay ?? null, paymentMethod: data.paymentMethod,
      installments: { create: data.installments },
    },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
}

export async function deactivatePaymentTerm(prisma: PrismaClient, id: string): Promise<PaymentTerm> {
  return prisma.paymentTerm.update({ where: { id }, data: { isActive: false } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/repositories/purchasing/payment-terms.repo.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/payment-terms.repo.ts backend/tests/repositories/purchasing/payment-terms.repo.test.ts
git commit -m "feat(purchasing): add payment-terms repository with installment-sum validation"
```

---

### Task 4: `bank-accounts.repo.ts`

**Files:**
- Create: `backend/src/repositories/purchasing/bank-accounts.repo.ts`
- Test: `backend/tests/repositories/purchasing/bank-accounts.repo.test.ts`

**Interfaces:**
- Produces: `findAllBankAccounts(prisma): Promise<BankAccount[]>`, `createBankAccount(prisma, data): Promise<BankAccount>`, `updateBankAccount(prisma, id, data): Promise<BankAccount>`, `deactivateBankAccount(prisma, id): Promise<BankAccount>` — consumed by Task 5 (routes) and, later, by FASE K/L/M (bank ledger, cash journal, payments).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/bank-accounts.repo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllBankAccounts, createBankAccount, updateBankAccount, deactivateBankAccount } from "../../../src/repositories/purchasing/bank-accounts.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("bank-accounts.repo", () => {
  it("creates a bank account with an opening balance and finds it", async () => {
    await createBankAccount(db.prisma, {
      bankName: "Intesa Sanpaolo", alias: "Intesa WEBPLAN", accountHolder: "WBDASH SRL",
      iban: "IT60X0542811101000000123456", openingBalance: 10000, openingBalanceDate: new Date("2026-01-01"),
    });
    const all = await findAllBankAccounts(db.prisma);
    expect(all).toHaveLength(1);
    expect(Number(all[0].openingBalance)).toBe(10000);
  });

  it("rejects a duplicate IBAN", async () => {
    const iban = "IT60X0542811101000000999999";
    await createBankAccount(db.prisma, { bankName: "A", alias: "A", accountHolder: "X", iban, openingBalance: 0, openingBalanceDate: new Date() });
    await expect(createBankAccount(db.prisma, { bankName: "B", alias: "B", accountHolder: "Y", iban, openingBalance: 0, openingBalanceDate: new Date() })).rejects.toThrow();
  });

  it("updates alias/notes without touching IBAN or opening balance", async () => {
    const acc = await createBankAccount(db.prisma, {
      bankName: "Revolut", alias: "Old Alias", accountHolder: "WBDASH SRL",
      iban: "GB29NWBK60161331926819", openingBalance: 500, openingBalanceDate: new Date("2026-02-01"),
    });
    const updated = await updateBankAccount(db.prisma, acc.id, { alias: "Revolut WEBPLAN", notes: "Conto secondario" });
    expect(updated.alias).toBe("Revolut WEBPLAN");
    expect(updated.iban).toBe("GB29NWBK60161331926819");
    expect(Number(updated.openingBalance)).toBe(500);
  });

  it("deactivate sets isActive=false instead of deleting the row", async () => {
    const acc = await createBankAccount(db.prisma, {
      bankName: "Cassa", alias: "Cassa Contanti", accountHolder: "WBDASH SRL",
      iban: "IT00CASH00000000000000001", openingBalance: 0, openingBalanceDate: new Date(),
    });
    await deactivateBankAccount(db.prisma, acc.id);
    const row = await db.prisma.bankAccount.findUnique({ where: { id: acc.id } });
    expect(row!.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx vitest run tests/repositories/purchasing/bank-accounts.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/bank-accounts.repo.ts`:

```typescript
// repositories/purchasing/bank-accounts.repo.ts — Company-wide, no amazonAccountId.
// No bank credentials are ever stored here — only IBAN/BIC for identification.
import type { PrismaClient, BankAccount } from "@prisma/client";

export async function findAllBankAccounts(prisma: PrismaClient): Promise<BankAccount[]> {
  return prisma.bankAccount.findMany({ orderBy: { alias: "asc" } });
}

export interface CreateBankAccountInput {
  bankName: string;
  alias: string;
  accountHolder: string;
  iban: string;
  bic?: string | null;
  currency?: string;
  openingBalance: number;
  openingBalanceDate: Date;
  accountingCode?: string | null;
  notes?: string | null;
}

export async function createBankAccount(prisma: PrismaClient, data: CreateBankAccountInput): Promise<BankAccount> {
  return prisma.bankAccount.create({ data });
}

export async function updateBankAccount(
  prisma: PrismaClient,
  id: string,
  data: Partial<{ bankName: string; alias: string; accountHolder: string; bic: string | null; accountingCode: string | null; notes: string | null }>
): Promise<BankAccount> {
  return prisma.bankAccount.update({ where: { id }, data });
}

export async function deactivateBankAccount(prisma: PrismaClient, id: string): Promise<BankAccount> {
  return prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
}
```
Note: `updateBankAccount` deliberately excludes `iban`/`openingBalance`/`openingBalanceDate` from the updatable fields — IBAN identifies the account (changing it is really "create a new account"), and the opening balance is a fixed historical anchor the derived balance is computed from (§23 of the architecture doc), never edited after creation.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/repositories/purchasing/bank-accounts.repo.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/bank-accounts.repo.ts backend/tests/repositories/purchasing/bank-accounts.repo.test.ts
git commit -m "feat(purchasing): add bank-accounts repository"
```

---

### Task 5: REST routes — `master-data.routes.ts`

**Files:**
- Create: `backend/src/purchasing/routes/master-data.routes.ts`
- Modify: `backend/src/server.ts` (mount the router)
- Test: `backend/tests/integration/purchasing-master-data.test.ts`

**Interfaces:**
- Consumes: all repository functions from Tasks 2-4.
- Produces: `masterDataRouter` (Express `Router`) exposing:
  - `GET /api/purchasing/warehouses`, `POST /api/purchasing/warehouses`, `PUT /api/purchasing/warehouses/:id`, `DELETE /api/purchasing/warehouses/:id` (deactivate)
  - `GET /api/purchasing/payment-terms`, `POST /api/purchasing/payment-terms`, `DELETE /api/purchasing/payment-terms/:id` (deactivate)
  - `GET /api/purchasing/bank-accounts`, `POST /api/purchasing/bank-accounts`, `PUT /api/purchasing/bank-accounts/:id`, `DELETE /api/purchasing/bank-accounts/:id` (deactivate)
  - Consumed by Task 6 (frontend).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/purchasing-master-data.test.ts`:

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
  const { masterDataRouter } = await import("../../src/purchasing/routes/master-data.routes");
  app = express();
  app.use(express.json());
  app.use("/api/purchasing", masterDataRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("purchasing master-data routes", () => {
  it("POST + GET /warehouses round-trips a warehouse", async () => {
    const post = await request(app).post("/api/purchasing/warehouses").send({ name: "Magazzino Centrale", code: "MAG-01" });
    expect(post.status).toBe(200);
    const get = await request(app).get("/api/purchasing/warehouses");
    expect(get.body).toHaveLength(1);
    expect(get.body[0].code).toBe("MAG-01");
  });

  it("POST /payment-terms rejects installments not summing to 100 with a 400", async () => {
    const res = await request(app).post("/api/purchasing/payment-terms").send({
      name: "Bad", type: "BONIFICO", endOfMonth: false, paymentMethod: "BONIFICO",
      installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 50 }],
    });
    expect(res.status).toBe(400);
  });

  it("POST + GET /bank-accounts round-trips a bank account", async () => {
    const post = await request(app).post("/api/purchasing/bank-accounts").send({
      bankName: "Intesa", alias: "Intesa WEBPLAN", accountHolder: "WBDASH SRL",
      iban: "IT60X0542811101000000123456", openingBalance: 1000, openingBalanceDate: "2026-01-01",
    });
    expect(post.status).toBe(200);
    const get = await request(app).get("/api/purchasing/bank-accounts");
    expect(get.body).toHaveLength(1);
  });

  it("DELETE /warehouses/:id deactivates, does not remove the row", async () => {
    const post = await request(app).post("/api/purchasing/warehouses").send({ name: "X", code: "MAG-99" });
    await request(app).delete(`/api/purchasing/warehouses/${post.body.id}`);
    const row = await db.prisma.warehouse.findUnique({ where: { id: post.body.id } });
    expect(row!.isActive).toBe(false);
  });
});
```
`supertest`/`@types/supertest` are already devDependencies (`backend/package.json:45,49`) — no install needed. Every other integration test in this codebase drives repository functions directly rather than an Express app, so this is the first route-level test in the project; confirm the import compiles cleanly before relying on it.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/grazianocaschetto/dev/WBDASH/.claude/worktrees/purchasing-erp/backend
npx vitest run tests/integration/purchasing-master-data.test.ts
```
Expected: FAIL — module not found (and possibly a missing-dependency error for `supertest` — resolve that first per the note above).

- [ ] **Step 3: Implement the router**

Create `backend/src/purchasing/routes/master-data.routes.ts`:

```typescript
// purchasing/routes/master-data.routes.ts — Warehouse, PaymentTerm, BankAccount CRUD.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { findAllWarehouses, createWarehouse, updateWarehouse, deactivateWarehouse } from "../../repositories/purchasing/warehouses.repo";
import { findAllPaymentTerms, createPaymentTerm, deactivatePaymentTerm } from "../../repositories/purchasing/payment-terms.repo";
import { findAllBankAccounts, createBankAccount, updateBankAccount, deactivateBankAccount } from "../../repositories/purchasing/bank-accounts.repo";

export const masterDataRouter = Router();

// ─── Warehouses ──────────────────────────────────────────────────────────────
masterDataRouter.get("/warehouses", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllWarehouses(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.post("/warehouses", async (req: Request, res: Response) => {
  try {
    const { name, code, address } = req.body ?? {};
    if (!name || !code) return res.status(400).json({ error: "name and code required" });
    res.json(await createWarehouse(prisma, { name, code, address: address ?? null }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.put("/warehouses/:id", async (req: Request, res: Response) => {
  try {
    const { name, address } = req.body ?? {};
    res.json(await updateWarehouse(prisma, req.params.id, { name, address }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.delete("/warehouses/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivateWarehouse(prisma, req.params.id));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─── Payment terms ───────────────────────────────────────────────────────────
masterDataRouter.get("/payment-terms", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllPaymentTerms(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.post("/payment-terms", async (req: Request, res: Response) => {
  try {
    const { name, type, endOfMonth, fixedDay, paymentMethod, installments } = req.body ?? {};
    if (!name || !type || !paymentMethod || !Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({ error: "name, type, paymentMethod, installments[] required" });
    }
    const term = await createPaymentTerm(prisma, { name, type, endOfMonth: !!endOfMonth, fixedDay: fixedDay ?? null, paymentMethod, installments });
    res.json(term);
  } catch (err) {
    // Installment-sum validation error from the repo layer surfaces as a 400, not a 500.
    res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

masterDataRouter.delete("/payment-terms/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivatePaymentTerm(prisma, req.params.id));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─── Bank accounts ───────────────────────────────────────────────────────────
masterDataRouter.get("/bank-accounts", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllBankAccounts(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.post("/bank-accounts", async (req: Request, res: Response) => {
  try {
    const { bankName, alias, accountHolder, iban, bic, currency, openingBalance, openingBalanceDate, accountingCode, notes } = req.body ?? {};
    if (!bankName || !alias || !accountHolder || !iban || openingBalance === undefined || !openingBalanceDate) {
      return res.status(400).json({ error: "bankName, alias, accountHolder, iban, openingBalance, openingBalanceDate required" });
    }
    const acc = await createBankAccount(prisma, {
      bankName, alias, accountHolder, iban, bic: bic ?? null, currency: currency ?? "EUR",
      openingBalance: Number(openingBalance), openingBalanceDate: new Date(openingBalanceDate),
      accountingCode: accountingCode ?? null, notes: notes ?? null,
    });
    res.json(acc);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.put("/bank-accounts/:id", async (req: Request, res: Response) => {
  try {
    const { bankName, alias, accountHolder, bic, accountingCode, notes } = req.body ?? {};
    res.json(await updateBankAccount(prisma, req.params.id, { bankName, alias, accountHolder, bic, accountingCode, notes }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.delete("/bank-accounts/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivateBankAccount(prisma, req.params.id));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
```

- [ ] **Step 4: Mount the router**

In `backend/src/server.ts`, add the import near the other route imports and mount it near the other `app.use("/api/...")` lines (`backend/src/server.ts:144-149`), with `requireAuth` only — **no** `amazonAccountMiddleware`, this module has no Amazon-account concept:

```typescript
import { masterDataRouter } from "./purchasing/routes/master-data.routes";
// ...
app.use("/api/purchasing", requireAuth, masterDataRouter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/integration/purchasing-master-data.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/purchasing/routes/master-data.routes.ts backend/src/server.ts backend/tests/integration/purchasing-master-data.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(purchasing): add master-data REST routes for warehouses/payment-terms/bank-accounts"
```

---

### Task 6: Frontend — `/anagrafiche` page (Banche, Magazzini, Condizioni di pagamento tabs)

**Files:**
- Create: `frontend/src/lib/api/purchasing.ts`
- Create: `frontend/src/app/anagrafiche/page.tsx`
- Modify: `frontend/src/lib/api/index.ts` (wire the new client in)
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx` (add the "Anagrafiche" entry)

**Interfaces:**
- Consumes: the 3 REST endpoint groups from Task 5.
- Produces: a single page at `/anagrafiche` with three active tabs (Banche, Magazzini, Condizioni di pagamento) and four disabled "Prossimamente" tabs (Fornitori, Clienti, Categorie contabili, Trasportatori — not built yet, same disabled-badge pattern already used in the nav-reorg sidebar for not-yet-built entries).

- [ ] **Step 1: Read the existing API client pattern before writing new code**

Read `frontend/src/lib/api/product-performance.ts` (already used as a template earlier in this session) and `frontend/src/lib/api/client.ts` (for `get`/`apiUrl`) to match the exact style — do not invent a different client pattern.

- [ ] **Step 2: Create the API client module**

Create `frontend/src/lib/api/purchasing.ts`:

```typescript
// lib/api/purchasing.ts — Warehouse, PaymentTerm, BankAccount master data.
import { apiUrl, get } from "./client";

export interface Warehouse {
  id: string; name: string; code: string; address: string | null; isActive: boolean;
}

export interface PaymentTermInstallmentRule {
  id: string; installmentNumber: number; offsetDays: number; percentage: number;
}

export interface PaymentTerm {
  id: string; name: string; type: string; endOfMonth: boolean; fixedDay: number | null;
  paymentMethod: string; isActive: boolean; installments: PaymentTermInstallmentRule[];
}

export interface BankAccount {
  id: string; bankName: string; alias: string; accountHolder: string; iban: string;
  bic: string | null; currency: string; openingBalance: number; openingBalanceDate: string;
  isActive: boolean; accountingCode: string | null; notes: string | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
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
    deactivate: (id: string) => del(`/api/purchasing/warehouses/${id}`),
  },
  paymentTerms: {
    list: () => get<PaymentTerm[]>("/api/purchasing/payment-terms"),
    create: (data: { name: string; type: string; endOfMonth: boolean; fixedDay?: number; paymentMethod: string; installments: { installmentNumber: number; offsetDays: number; percentage: number }[] }) =>
      post<PaymentTerm>("/api/purchasing/payment-terms", data),
    deactivate: (id: string) => del(`/api/purchasing/payment-terms/${id}`),
  },
  bankAccounts: {
    list: () => get<BankAccount[]>("/api/purchasing/bank-accounts"),
    create: (data: { bankName: string; alias: string; accountHolder: string; iban: string; bic?: string; currency?: string; openingBalance: number; openingBalanceDate: string; accountingCode?: string; notes?: string }) =>
      post<BankAccount>("/api/purchasing/bank-accounts", data),
    deactivate: (id: string) => del(`/api/purchasing/bank-accounts/${id}`),
  },
};
```

Add `export { purchasing } from "./purchasing";` to `frontend/src/lib/api/index.ts` and add `purchasing` to the exported `api` object, matching how `productPerformance` is wired in there today.

- [ ] **Step 3: Create the page**

Create `frontend/src/app/anagrafiche/page.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { Warehouse, PaymentTerm, BankAccount } from "@/lib/api/purchasing";

type Tab = "banche" | "magazzini" | "condizioni-pagamento";
const COMING_SOON = ["Fornitori", "Clienti", "Categorie contabili", "Trasportatori"];

function BancheTab() {
  const [rows, setRows] = useState<BankAccount[]>([]);
  const load = useCallback(() => { api.purchasing.bankAccounts.list().then(setRows); }, []);
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
  useEffect(() => { api.purchasing.warehouses.list().then(setRows); }, []);
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
  useEffect(() => { api.purchasing.paymentTerms.list().then(setRows); }, []);
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
                <span key={label} className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 border border-bg-border cursor-not-allowed" title="Prossimamente">
                  {label}
                </span>
              ))}
            </div>
            {tab === "banche" && <BancheTab />}
            {tab === "magazzini" && <MagazziniTab />}
            {tab === "condizioni-pagamento" && <CondizioniPagamentoTab />}
          </main>
        </div>
      </div>
    </div>
  );
}
```
No create/edit forms in this first pass — read-only tables wired to real data, matching "ogni branch autonoma, testata e integrabile" with the smallest useful slice; forms arrive with FASE C (Supplier) when there's a second consumer of the same modal pattern to share.

- [ ] **Step 4: Add the sidebar entry**

Read `frontend/src/components/layout/GlobalSidebar.tsx` in full first (it was rewritten from scratch by the nav-reorg — confirm the exact category/link data structure before editing) and add an "Anagrafiche" entry pointing to `/anagrafiche`, in the same category grouping style already used for the other business areas (Finance/Inventory/Marketing/Supporto/Admin) — place it under **Inventory** alongside "Prodotti"/"COGS"/"Magazzino", matching where the PDF spec's own sidebar sketch groups Fornitori/Magazzini.

- [ ] **Step 5: Manual verification in the browser**

Start the dev servers if not already running (`cd backend && npm run dev`, `cd frontend && npm run dev`), navigate to `/anagrafiche`, confirm all three tabs render (empty states are fine — no seed data yet), confirm the "Prossimamente" entries are visibly disabled and non-interactive, confirm the sidebar link navigates correctly.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api/purchasing.ts frontend/src/lib/api/index.ts frontend/src/app/anagrafiche/page.tsx frontend/src/components/layout/GlobalSidebar.tsx
git commit -m "feat(purchasing): add /anagrafiche page with Banche/Magazzini/Condizioni-pagamento tabs"
```

---

## Final verification (after all tasks)

- [ ] Full backend test suite: `cd backend && npx vitest run` — no regressions.
- [ ] `npx tsc --noEmit` (backend and frontend) — clean.
- [ ] Manual browser check of `/anagrafiche` per Task 6 Step 5.
- [ ] Push `feature/master-data` and open a PR against `develop`.

## Self-Review

**Spec coverage:** covers exactly the 3 entities + enum + RBAC field this plan claims (Warehouse, PaymentTerm/PaymentTermInstallmentRule, BankAccount, PurchasePaymentMethod, User.purchasingRole) — the remaining ~22 entities of the full architecture doc are explicitly out of scope for FASE B, deferred to FASE C onward per the roadmap.

**Deviations from the architecture doc, confirmed with the user before this plan was written:** no `organizationId` anywhere; `User.purchasingRole` as a separate nullable field rather than extending `User.role`.

**Additional deviation surfaced while writing this plan:** `PaymentTermInstallmentRule.percentage` uses `Decimal(5,2)` rather than `Float`, a deliberate exception to the project's general "ratios stay Float" rule — flagged in Global Constraints with rationale (it splits real money and must sum to exactly 100).

**Placeholder scan:** no TBD/vague steps — every step has real, complete code.

**Type consistency:** `Warehouse`/`PaymentTerm`/`PaymentTermInstallmentRule`/`BankAccount` field names match exactly between Task 1's schema, Tasks 2-4's repository signatures, Task 5's route bodies, and Task 6's frontend types.
