# FASE D — Ordini Fornitore (PurchaseOrder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the third phase of the Purchasing/ERP module — `PurchaseOrder` + `PurchaseOrderLine` with an atomic numbering system (`DocumentSequence`) and a validated logistics-status state machine, plus a real product-picker (closing the gap FASE C left open), full repository/route layer, and an end-to-end demoable frontend (list, multi-line create, detail with status transitions).

**Architecture:** Company-wide (not Amazon-account-scoped) entities under the existing `backend/src/repositories/purchasing/` and `backend/src/purchasing/` domains, following the exact repository-layer/Decimal/cuid conventions already established by FASE B (master data) and FASE C (suppliers). The status machine is a pure, DB-free module. `DocumentSequence` is a new shared numbering primitive, generic across document types so later phases (goods receipts, invoices) reuse it.

**Tech Stack:** Same as the rest of WBDASH — Express + TypeScript + Prisma + PostgreSQL, Next.js 14 + Tailwind, Vitest + Testcontainers.

**Design doc:** `docs/superpowers/specs/2026-08-08-purchasing-fase-d-purchase-orders-design.md` — read it for the full rationale; this plan only restates what each task needs.

## Global Constraints

- **Repo-layer rule (absolute):** only `backend/src/repositories/**` calls Prisma directly. Routes call repository functions, never `prisma.*` themselves.
- **No `amazonAccountId` / no `getCurrentAccountId()`** anywhere in this module — company-wide, same as FASE B/C.
- **Schema conventions:** `id String @id @default(cuid())`; `createdAt`/`updatedAt` on every mutable model; monetary fields `Decimal @db.Decimal(14, 4)`; percentages that split money `Decimal @db.Decimal(5, 2)` (not `Float`); Prisma enum for closed value sets; index on every FK.
- **`remainingQty` is never a persisted column** — always computed in the repository layer as `orderedQty - receivedQty`.
- **Migrations:** `prisma migrate dev` only, never `db push`. **Every migration step requires explicit user confirmation before running**, same gate as every schema change in this project.
- **Known risk carried over from FASE C** (see its PR #4 description): the test harness uses `prisma db push` while dev/prod use `prisma migrate dev`, so a schema/migration drift can be invisible to the entire test suite (this is exactly how FASE C's `Supplier.defaultPaymentMethod` enum-vs-TEXT bug slipped through). Task 1 below includes an explicit live drift check against the actually-migrated database — do not skip it.
- **Branch:** `feature/purchase-orders`, already created off `develop` at commit `b3409ab` (merge of PR #4) and currently checked out — it already holds one commit (the design doc). Do not create a new branch.
- **Test command:** `cd backend && npx vitest run <path>` for a single file; `npx tsc --noEmit` for typecheck (run in both `backend/` and `frontend/`).
- **Frontend testing precedent:** FASE B/C did **not** add component-level (Vitest/RTL) tests for purchasing UI (`SupplierForm.tsx`, `FornitoriTab.tsx` have none) — verification there was `tsc --noEmit` + manual browser E2E. This plan follows the same precedent for the new frontend tasks; backend tasks keep full TDD with Testcontainers.

---

### Task 0: Verify branch state

**Files:** none (verification only).

- [ ] **Step 1:** Confirm you're on the right branch with the design doc already committed:
```bash
cd ~/Developer/WBDASH
git status --short --branch
git log -1 --oneline
```
Expected: `## feature/purchase-orders` and the last commit is `docs: add FASE D (purchase orders) design spec`. If instead you're on `develop` or the branch doesn't exist, stop and re-read Task 0's constraints above — do not create a second branch.

---

### Task 1: Prisma schema — `DocumentSequence`, `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderStatusHistory`, enums

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create (generated): `backend/prisma/migrations/<timestamp>_add_purchase_orders/migration.sql`

**Interfaces:**
- Produces: Prisma models `DocumentSequence`, `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderStatusHistory`; enums `PurchaseOrderLogisticStatus`, `PurchaseOrderFinancialStatus` — every later task's Prisma calls and TypeScript types depend on these exact names.

- [ ] **Step 1: Append the new models to `backend/prisma/schema.prisma`**

Add at the end of the file, after the existing `SupplierProductPriceHistory` model:

```prisma
// ─── Purchasing module — FASE D: purchase orders ───────────────────────────
// See docs/superpowers/specs/2026-08-08-purchasing-fase-d-purchase-orders-design.md.
// Company-wide (no amazonAccountId) — same as FASE B/C.

// Generic atomic document numbering, reused by later phases (goods receipts,
// supplier invoices) with a different documentType. Incremented via a single
// INSERT...ON CONFLICT...RETURNING statement — see document-sequence.repo.ts.
model DocumentSequence {
  id           String @id @default(cuid())
  documentType String
  year         Int
  lastValue    Int    @default(0)

  @@unique([documentType, year])
}

enum PurchaseOrderLogisticStatus {
  DRAFT
  SENT
  CONFIRMED
  IN_PRODUCTION
  READY
  PARTIALLY_SHIPPED
  SHIPPED
  PARTIALLY_RECEIVED // not reachable yet — FASE E (goods receipts) adds the transitions into this state
  RECEIVED           // not reachable yet — FASE E
  COMPLETED          // not reachable yet — FASE E/G/M
  CANCELLED
}

enum PurchaseOrderFinancialStatus {
  OPEN
  PARTIALLY_INVOICED // not reachable yet — FASE G (supplier invoices)
  INVOICED           // not reachable yet — FASE G
  PARTIALLY_PAID     // not reachable yet — FASE M (payment reconciliation)
  PAID               // not reachable yet — FASE M
}

model PurchaseOrder {
  id                   String                       @id @default(cuid())
  poNumber             String                       @unique
  supplierId           String
  supplier             Supplier                     @relation(fields: [supplierId], references: [id])
  orderDate            DateTime
  currency             String
  logisticStatus       PurchaseOrderLogisticStatus  @default(DRAFT)
  financialStatus      PurchaseOrderFinancialStatus @default(OPEN)
  buyerId              String
  buyer                User                         @relation(fields: [buyerId], references: [id])
  warehouseId          String
  warehouse            Warehouse                    @relation(fields: [warehouseId], references: [id])
  expectedDeliveryDate DateTime?
  deliveryAddress      String?
  shippingMethod       String?
  incoterm             String?
  paymentTermId        String
  paymentTerm          PaymentTerm                  @relation(fields: [paymentTermId], references: [id])
  internalNotes        String?
  supplierNotes        String?
  quoteReference       String?
  createdAt            DateTime                     @default(now())
  updatedAt            DateTime                     @updatedAt

  lines         PurchaseOrderLine[]
  statusHistory PurchaseOrderStatusHistory[]

  @@index([supplierId])
  @@index([logisticStatus])
  @@index([orderDate])
}

model PurchaseOrderLine {
  id              String        @id @default(cuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  productId       String
  product         Product       @relation(fields: [productId], references: [id])
  supplierSku     String?
  description     String
  orderedQty      Decimal       @db.Decimal(14, 4)
  receivedQty     Decimal       @default(0) @db.Decimal(14, 4) // written only from FASE E onward; stays 0 here
  unitOfMeasure   String
  unitPrice       Decimal       @db.Decimal(14, 4)
  discountPct     Decimal?      @db.Decimal(5, 2)
  taxableAmount   Decimal       @db.Decimal(14, 4)
  vatAmount       Decimal       @db.Decimal(14, 4)
  totalAmount     Decimal       @db.Decimal(14, 4)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([purchaseOrderId])
  @@index([productId])
}

// Append-only — never updated or deleted, one row per status transition.
model PurchaseOrderStatusHistory {
  id              String                      @id @default(cuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder               @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  fromStatus      PurchaseOrderLogisticStatus
  toStatus        PurchaseOrderLogisticStatus
  changedById     String
  changedBy       User                        @relation(fields: [changedById], references: [id])
  changedAt       DateTime                    @default(now())
  note            String?

  @@index([purchaseOrderId])
}
```

- [ ] **Step 2: Add the back-relation fields Prisma requires on the related models**

In `Supplier` (after the existing `products SupplierProduct[]` line):
```prisma
  purchaseOrders  PurchaseOrder[]
```

In `Warehouse` (after `updatedAt DateTime @updatedAt`, before the `@@index([isActive])` line):
```prisma
  purchaseOrders PurchaseOrder[]
```

In `PaymentTerm` (after the existing `suppliers Supplier[]` line):
```prisma
  purchaseOrders PurchaseOrder[]
```

In `Product` (after the existing `supplierProducts SupplierProduct[]` line):
```prisma
  purchaseOrderLines PurchaseOrderLine[]
```

In `User` (after the existing `mfaDevices MfaDevice[]` line, before the closing `@@index` block):
```prisma
  purchaseOrdersAsBuyer      PurchaseOrder[]
  purchaseOrderStatusChanges PurchaseOrderStatusHistory[]
```

- [ ] **Step 3: Generate and apply the migration — STOP and get explicit user confirmation before running this**

```bash
cd ~/Developer/WBDASH/backend
npx prisma migrate dev --name add_purchase_orders
```
Expected: a new `backend/prisma/migrations/<timestamp>_add_purchase_orders/` directory is created, the migration applies cleanly to your local dev Postgres, and `npx prisma generate` runs automatically at the end (Prisma Client types now include `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderStatusHistory`, `DocumentSequence`, `PurchaseOrderLogisticStatus`, `PurchaseOrderFinancialStatus`).

- [ ] **Step 4: Live drift check — required, do not skip (see Global Constraints)**

Verify the migration that was actually applied matches the schema, independent of the test harness (which uses `db push` and would not catch this class of bug — this is exactly the check that would have caught FASE C's `Supplier.defaultPaymentMethod` TEXT-vs-enum drift):
```bash
cd ~/Developer/WBDASH/backend
set -a; source .env; set +a
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```
Expected: an empty script (no `ALTER TABLE`/`CREATE`/`DROP` statements) — the live local dev database already matches the schema exactly. If it prints any DDL, the applied migration and the schema have diverged; stop and investigate before continuing — do not proceed to Task 2 with a drifted schema.

- [ ] **Step 5: Commit**
```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(purchasing): add PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatusHistory, DocumentSequence models"
```

---

### Task 2: `purchase-order-state-machine.ts` (pure module) + unit test

**Files:**
- Create: `backend/src/purchasing/purchase-order-state-machine.ts`
- Test: `backend/tests/unit/purchase-order-state-machine.test.ts`

**Interfaces:**
- Consumes: `PurchaseOrderLogisticStatus` enum from `@prisma/client` (produced by Task 1).
- Produces: `isValidTransition(from, to): boolean` and `allowedNextStatuses(from): PurchaseOrderLogisticStatus[]` — used by Task 5's `transitionPurchaseOrderStatus`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/purchase-order-state-machine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isValidTransition, allowedNextStatuses } from "../../src/purchasing/purchase-order-state-machine";

describe("purchase-order-state-machine", () => {
  it("allows each step of the linear happy path", () => {
    expect(isValidTransition("DRAFT", "SENT")).toBe(true);
    expect(isValidTransition("SENT", "CONFIRMED")).toBe(true);
    expect(isValidTransition("CONFIRMED", "IN_PRODUCTION")).toBe(true);
    expect(isValidTransition("IN_PRODUCTION", "READY")).toBe(true);
    expect(isValidTransition("READY", "PARTIALLY_SHIPPED")).toBe(true);
    expect(isValidTransition("PARTIALLY_SHIPPED", "SHIPPED")).toBe(true);
  });

  it("rejects skipping a state", () => {
    expect(isValidTransition("DRAFT", "CONFIRMED")).toBe(false);
    expect(isValidTransition("READY", "SHIPPED")).toBe(false);
  });

  it("rejects moving backwards", () => {
    expect(isValidTransition("SENT", "DRAFT")).toBe(false);
  });

  it("allows CANCELLED from any pre-COMPLETED state", () => {
    const preCompleted = ["DRAFT", "SENT", "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED"] as const;
    for (const s of preCompleted) {
      expect(isValidTransition(s, "CANCELLED")).toBe(true);
    }
  });

  it("rejects any transition out of CANCELLED", () => {
    expect(allowedNextStatuses("CANCELLED")).toEqual([]);
  });

  it("rejects transitions into or out of the not-yet-reachable receiving states", () => {
    expect(isValidTransition("SHIPPED", "PARTIALLY_RECEIVED")).toBe(false);
    expect(allowedNextStatuses("PARTIALLY_RECEIVED")).toEqual([]);
    expect(allowedNextStatuses("RECEIVED")).toEqual([]);
    expect(allowedNextStatuses("COMPLETED")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/unit/purchase-order-state-machine.test.ts
```
Expected: FAIL — `Cannot find module '../../src/purchasing/purchase-order-state-machine'`.

- [ ] **Step 3: Implement**

Create `backend/src/purchasing/purchase-order-state-machine.ts`:
```ts
// purchasing/purchase-order-state-machine.ts — pure module, no Prisma import.
// Whitelist of allowed logisticStatus transitions. Only the linear happy path
// plus a universal escape to CANCELLED from any pre-COMPLETED state is
// reachable in FASE D — PARTIALLY_RECEIVED/RECEIVED/COMPLETED become reachable
// when FASE E (goods receipts) extends this table.
import type { PurchaseOrderLogisticStatus } from "@prisma/client";

const TRANSITIONS: Record<PurchaseOrderLogisticStatus, PurchaseOrderLogisticStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["READY", "CANCELLED"],
  READY: ["PARTIALLY_SHIPPED", "CANCELLED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["CANCELLED"],
  PARTIALLY_RECEIVED: [],
  RECEIVED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedNextStatuses(from: PurchaseOrderLogisticStatus): PurchaseOrderLogisticStatus[] {
  return TRANSITIONS[from];
}

export function isValidTransition(from: PurchaseOrderLogisticStatus, to: PurchaseOrderLogisticStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
```

- [ ] **Step 4: Run it and confirm it passes**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/unit/purchase-order-state-machine.test.ts
```
Expected: PASS, 6/6.

- [ ] **Step 5: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
git add backend/src/purchasing/purchase-order-state-machine.ts backend/tests/unit/purchase-order-state-machine.test.ts
git commit -m "feat(purchasing): add purchase-order status transition whitelist"
```

---

### Task 3: `document-sequence.repo.ts` + concurrency test

**Files:**
- Create: `backend/src/repositories/purchasing/document-sequence.repo.ts`
- Test: `backend/tests/repositories/purchasing/document-sequence.repo.test.ts`

**Interfaces:**
- Consumes: `DocumentSequence` model from Task 1.
- Produces: `nextSequenceValue(tx, documentType, year): Promise<number>` and `formatPoNumber(year, value): string` — used by Task 5's `createPurchaseOrder`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/document-sequence.repo.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { nextSequenceValue, formatPoNumber } from "../../../src/repositories/purchasing/document-sequence.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("document-sequence.repo", () => {
  it("starts at 1 for a new (documentType, year)", async () => {
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(1);
  });

  it("increments on each call for the same (documentType, year)", async () => {
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(1);
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(2);
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(3);
  });

  it("keeps separate counters per year", async () => {
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(1);
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2027)).toBe(1);
  });

  it("keeps separate counters per documentType", async () => {
    expect(await nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026)).toBe(1);
    expect(await nextSequenceValue(db.prisma, "GOODS_RECEIPT", 2026)).toBe(1);
  });

  it("produces no duplicate values under concurrent calls", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => nextSequenceValue(db.prisma, "PURCHASE_ORDER", 2026))
    );
    expect(new Set(results).size).toBe(20);
    expect(Math.max(...results)).toBe(20);
  });

  it("formatPoNumber pads to 6 digits", () => {
    expect(formatPoNumber(2026, 1)).toBe("PO-2026-000001");
    expect(formatPoNumber(2026, 123456)).toBe("PO-2026-123456");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/repositories/purchasing/document-sequence.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/document-sequence.repo.ts`:
```ts
// repositories/purchasing/document-sequence.repo.ts — Atomic document numbering.
// Company-wide. Reused by any purchasing document needing a sequential
// human-readable number (PurchaseOrder now; GoodsReceipt/SupplierInvoice in
// later phases reuse this with a different documentType).
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Atomically increments and returns the next sequence value for
 * (documentType, year), creating the row with lastValue=1 on first use.
 * Single INSERT...ON CONFLICT...RETURNING statement — no read-then-write
 * race window, safe under concurrent callers without an explicit lock.
 * Pass a transaction client so the caller's document creation commits or
 * rolls back atomically together with the number it consumed.
 */
export async function nextSequenceValue(
  tx: PrismaClient | Prisma.TransactionClient,
  documentType: string,
  year: number
): Promise<number> {
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "DocumentSequence" (id, "documentType", year, "lastValue")
    VALUES (gen_random_uuid()::text, ${documentType}, ${year}, 1)
    ON CONFLICT ("documentType", year)
    DO UPDATE SET "lastValue" = "DocumentSequence"."lastValue" + 1
    RETURNING "lastValue"
  `;
  return rows[0].lastValue;
}

export function formatPoNumber(year: number, value: number): string {
  return `PO-${year}-${String(value).padStart(6, "0")}`;
}
```

- [ ] **Step 4: Run it and confirm it passes**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/repositories/purchasing/document-sequence.repo.test.ts
```
Expected: PASS, 6/6.

- [ ] **Step 5: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
git add backend/src/repositories/purchasing/document-sequence.repo.ts backend/tests/repositories/purchasing/document-sequence.repo.test.ts
git commit -m "feat(purchasing): add document-sequence repository with concurrency-safe numbering"
```

---

### Task 4: `products.repo.ts` (picker projection) + test

**Files:**
- Create: `backend/src/repositories/purchasing/products.repo.ts`
- Test: `backend/tests/repositories/purchasing/products.repo.test.ts`

**Interfaces:**
- Consumes: existing `Product` model (`status`, `name`, `brand`).
- Produces: `listActiveProductsForPicker(prisma): Promise<PickerProduct[]>`, `PickerProduct = { id, name, brand }` — used by Task 6's routes and Task 8's frontend picker.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/products.repo.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { listActiveProductsForPicker } from "../../../src/repositories/purchasing/products.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("products.repo (picker)", () => {
  it("lists active products ordered by name", async () => {
    await db.prisma.product.create({ data: { name: "Zeta Widget" } });
    await db.prisma.product.create({ data: { name: "Alpha Widget", brand: "Acme" } });
    const rows = await listActiveProductsForPicker(db.prisma);
    expect(rows.map(r => r.name)).toEqual(["Alpha Widget", "Zeta Widget"]);
    expect(rows[0].brand).toBe("Acme");
  });

  it("excludes archived products", async () => {
    await db.prisma.product.create({ data: { name: "Active One", status: "ACTIVE" } });
    await db.prisma.product.create({ data: { name: "Archived One", status: "ARCHIVED" } });
    const rows = await listActiveProductsForPicker(db.prisma);
    expect(rows.map(r => r.name)).toEqual(["Active One"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/repositories/purchasing/products.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/products.repo.ts`:
```ts
// repositories/purchasing/products.repo.ts — read-only projection of Product for
// the purchase-order line picker. Company-wide. Deliberately separate from
// repositories/amazon/product.repo.ts's findAllProducts (which includes full
// ProductIdentifier relations not needed here) to keep this query minimal for
// a picker that runs on every search keystroke.
import type { PrismaClient } from "@prisma/client";

export interface PickerProduct {
  id: string;
  name: string;
  brand: string | null;
}

export async function listActiveProductsForPicker(prisma: PrismaClient): Promise<PickerProduct[]> {
  return prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, brand: true },
    orderBy: { name: "asc" },
  });
}
```

- [ ] **Step 4: Run it and confirm it passes**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/repositories/purchasing/products.repo.test.ts
```
Expected: PASS, 2/2.

- [ ] **Step 5: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
git add backend/src/repositories/purchasing/products.repo.ts backend/tests/repositories/purchasing/products.repo.test.ts
git commit -m "feat(purchasing): add product picker repository"
```

---

### Task 5: `purchase-orders.repo.ts` + repository tests

**Files:**
- Create: `backend/src/repositories/purchasing/purchase-orders.repo.ts`
- Test: `backend/tests/repositories/purchasing/purchase-orders.repo.test.ts`

**Interfaces:**
- Consumes: `nextSequenceValue`/`formatPoNumber` (Task 3), `isValidTransition` (Task 2), `PurchaseOrder`/`PurchaseOrderLine`/`PurchaseOrderStatusHistory` models (Task 1).
- Produces: `createPurchaseOrder`, `findAllPurchaseOrders`, `findPurchaseOrderById`, `transitionPurchaseOrderStatus`, `InvalidTransitionError` — used by Task 6's routes.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/purchase-orders.repo.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  createPurchaseOrder, findAllPurchaseOrders, findPurchaseOrderById,
  transitionPurchaseOrderStatus, InvalidTransitionError,
  type CreatePurchaseOrderInput,
} from "../../../src/repositories/purchasing/purchase-orders.repo";

let db: TestDb;
let supplierId: string;
let warehouseId: string;
let paymentTermId: string;
let productId: string;
let userId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  supplierId = (await db.prisma.supplier.create({
    data: { legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT" },
  })).id;
  warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino Centrale", code: "MAG-1" } })).id;
  paymentTermId = (await db.prisma.paymentTerm.create({
    data: { name: "30 giorni fine mese", type: "STANDARD", paymentMethod: "BONIFICO" },
  })).id;
  productId = (await db.prisma.product.create({ data: { name: "Widget Test" } })).id;
  userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
});

function baseOrder(overrides: Partial<CreatePurchaseOrderInput> = {}): CreatePurchaseOrderInput {
  return {
    supplierId, orderDate: new Date("2026-08-08"), currency: "EUR", buyerId: userId,
    warehouseId, paymentTermId,
    lines: [{
      productId, description: "Widget Test", orderedQty: 100, unitOfMeasure: "PZ",
      unitPrice: 2.5, taxableAmount: 250, vatAmount: 55, totalAmount: 305,
    }],
    ...overrides,
  };
}

describe("purchase-orders.repo", () => {
  it("creates a purchase order with a poNumber and a DRAFT/OPEN status", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    expect(po.poNumber).toBe("PO-2026-000001");
    expect(po.logisticStatus).toBe("DRAFT");
    expect(po.financialStatus).toBe("OPEN");
  });

  it("numbers a second order in the same year sequentially", async () => {
    await createPurchaseOrder(db.prisma, baseOrder());
    const second = await createPurchaseOrder(db.prisma, baseOrder());
    expect(second.poNumber).toBe("PO-2026-000002");
  });

  it("findPurchaseOrderById returns lines with a computed remainingQty", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    const found = await findPurchaseOrderById(db.prisma, po.id);
    expect(found!.lines).toHaveLength(1);
    expect(found!.lines[0].remainingQty).toBe(100);
    expect(found!.lines[0].receivedQty).toBe(0);
  });

  it("findPurchaseOrderById returns null for an unknown id", async () => {
    expect(await findPurchaseOrderById(db.prisma, "does-not-exist")).toBeNull();
  });

  it("findAllPurchaseOrders filters by logisticStatus", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    await transitionPurchaseOrderStatus(db.prisma, po.id, "SENT", userId);
    expect(await findAllPurchaseOrders(db.prisma, { logisticStatus: "SENT" })).toHaveLength(1);
    expect(await findAllPurchaseOrders(db.prisma, { logisticStatus: "DRAFT" })).toHaveLength(0);
  });

  it("transitions status and records history", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    const updated = await transitionPurchaseOrderStatus(db.prisma, po.id, "SENT", userId, "inviato via email");
    expect(updated.logisticStatus).toBe("SENT");
    const found = await findPurchaseOrderById(db.prisma, po.id);
    expect(found!.statusHistory).toHaveLength(1);
    expect(found!.statusHistory[0]).toMatchObject({
      fromStatus: "DRAFT", toStatus: "SENT", changedById: userId, note: "inviato via email",
    });
  });

  it("rejects an invalid transition and leaves status/history unchanged", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder());
    await expect(transitionPurchaseOrderStatus(db.prisma, po.id, "CONFIRMED", userId)).rejects.toThrow(InvalidTransitionError);
    const found = await findPurchaseOrderById(db.prisma, po.id);
    expect(found!.logisticStatus).toBe("DRAFT");
    expect(found!.statusHistory).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/repositories/purchasing/purchase-orders.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/purchase-orders.repo.ts`:
```ts
// repositories/purchasing/purchase-orders.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, PurchaseOrder, PurchaseOrderLine, PurchaseOrderLogisticStatus } from "@prisma/client";
import { nextSequenceValue, formatPoNumber } from "./document-sequence.repo";
import { isValidTransition } from "../../purchasing/purchase-order-state-machine";

export type PurchaseOrderLineWithRemaining = PurchaseOrderLine & { remainingQty: number };

export type PurchaseOrderWithLines = PurchaseOrder & {
  lines: PurchaseOrderLineWithRemaining[];
  statusHistory: {
    id: string; fromStatus: PurchaseOrderLogisticStatus; toStatus: PurchaseOrderLogisticStatus;
    changedById: string; changedAt: Date; note: string | null;
  }[];
  supplier: { id: string; legalName: string };
  warehouse: { id: string; name: string };
};

function withRemaining(line: PurchaseOrderLine): PurchaseOrderLineWithRemaining {
  return { ...line, remainingQty: Number(line.orderedQty) - Number(line.receivedQty) };
}

export interface CreatePurchaseOrderLineInput {
  productId: string;
  supplierSku?: string | null;
  description: string;
  orderedQty: number;
  unitOfMeasure: string;
  unitPrice: number;
  discountPct?: number | null;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  orderDate: Date;
  currency: string;
  buyerId: string;
  warehouseId: string;
  expectedDeliveryDate?: Date | null;
  deliveryAddress?: string | null;
  shippingMethod?: string | null;
  incoterm?: string | null;
  paymentTermId: string;
  internalNotes?: string | null;
  supplierNotes?: string | null;
  quoteReference?: string | null;
  lines: CreatePurchaseOrderLineInput[];
}

export async function createPurchaseOrder(prisma: PrismaClient, data: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  const year = data.orderDate.getFullYear();
  return prisma.$transaction(async (tx) => {
    const seq = await nextSequenceValue(tx, "PURCHASE_ORDER", year);
    return tx.purchaseOrder.create({
      data: {
        poNumber: formatPoNumber(year, seq),
        supplierId: data.supplierId,
        orderDate: data.orderDate,
        currency: data.currency,
        buyerId: data.buyerId,
        warehouseId: data.warehouseId,
        expectedDeliveryDate: data.expectedDeliveryDate ?? null,
        deliveryAddress: data.deliveryAddress ?? null,
        shippingMethod: data.shippingMethod ?? null,
        incoterm: data.incoterm ?? null,
        paymentTermId: data.paymentTermId,
        internalNotes: data.internalNotes ?? null,
        supplierNotes: data.supplierNotes ?? null,
        quoteReference: data.quoteReference ?? null,
        lines: {
          create: data.lines.map((l) => ({
            productId: l.productId,
            supplierSku: l.supplierSku ?? null,
            description: l.description,
            orderedQty: l.orderedQty,
            unitOfMeasure: l.unitOfMeasure,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct ?? null,
            taxableAmount: l.taxableAmount,
            vatAmount: l.vatAmount,
            totalAmount: l.totalAmount,
          })),
        },
      },
    });
  });
}

export async function findAllPurchaseOrders(
  prisma: PrismaClient,
  filters?: { logisticStatus?: PurchaseOrderLogisticStatus; supplierId?: string }
): Promise<(PurchaseOrder & { supplier: { legalName: string }; warehouse: { name: string } })[]> {
  return prisma.purchaseOrder.findMany({
    where: { logisticStatus: filters?.logisticStatus, supplierId: filters?.supplierId },
    include: { supplier: { select: { legalName: true } }, warehouse: { select: { name: true } } },
    orderBy: { orderDate: "desc" },
  });
}

export async function findPurchaseOrderById(prisma: PrismaClient, id: string): Promise<PurchaseOrderWithLines | null> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: true,
      statusHistory: { orderBy: { changedAt: "desc" } },
      supplier: { select: { id: true, legalName: true } },
      warehouse: { select: { id: true, name: true } },
    },
  });
  if (!po) return null;
  return { ...po, lines: po.lines.map(withRemaining) };
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transizione non valida: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export async function transitionPurchaseOrderStatus(
  prisma: PrismaClient,
  id: string,
  toStatus: PurchaseOrderLogisticStatus,
  changedById: string,
  note?: string | null
): Promise<PurchaseOrder> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { logisticStatus: true } });
    if (!isValidTransition(current.logisticStatus, toStatus)) {
      throw new InvalidTransitionError(current.logisticStatus, toStatus);
    }
    await tx.purchaseOrderStatusHistory.create({
      data: { purchaseOrderId: id, fromStatus: current.logisticStatus, toStatus, changedById, note: note ?? null },
    });
    return tx.purchaseOrder.update({ where: { id }, data: { logisticStatus: toStatus } });
  });
}
```

- [ ] **Step 4: Run it and confirm it passes**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/repositories/purchasing/purchase-orders.repo.test.ts
```
Expected: PASS, 7/7.

- [ ] **Step 5: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
git add backend/src/repositories/purchasing/purchase-orders.repo.ts backend/tests/repositories/purchasing/purchase-orders.repo.test.ts
git commit -m "feat(purchasing): add purchase-orders repository with transactional create and status transitions"
```

---

### Task 6: REST routes — `purchase-orders.routes.ts` + integration tests + mount

**Files:**
- Create: `backend/src/purchasing/routes/purchase-orders.routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/integration/purchasing-purchase-orders.test.ts`

**Interfaces:**
- Consumes: everything from Task 4 and Task 5, plus `req.user!.id` (set by `requireAuth`, same pattern as `backend/src/auth/admin.routes.ts`).
- Produces: `purchaseOrdersRouter` mounted at `/api/purchasing` — routes `GET /products`, `GET /purchase-orders`, `GET /purchase-orders/:id`, `POST /purchase-orders`, `POST /purchase-orders/:id/transition`. Used by Task 7's frontend API client.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/purchasing-purchase-orders.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";

let db: TestDb;
let app: Express;
let supplierId: string;
let warehouseId: string;
let paymentTermId: string;
let productId: string;
const userId = "test-user-id";

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { purchaseOrdersRouter } = await import("../../src/purchasing/routes/purchase-orders.routes");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId, role: "user" }; next(); });
  app.use("/api/purchasing", purchaseOrdersRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  supplierId = (await db.prisma.supplier.create({
    data: { legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT" },
  })).id;
  warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino", code: "MAG-1" } })).id;
  paymentTermId = (await db.prisma.paymentTerm.create({ data: { name: "30gg", type: "STANDARD", paymentMethod: "BONIFICO" } })).id;
  productId = (await db.prisma.product.create({ data: { name: "Widget" } })).id;
});

function baseBody() {
  return {
    supplierId, orderDate: "2026-08-08", currency: "EUR", warehouseId, paymentTermId,
    lines: [{ productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ", unitPrice: 5, taxableAmount: 50, vatAmount: 11, totalAmount: 61 }],
  };
}

describe("purchase-orders routes", () => {
  it("GET /products returns active products", async () => {
    const res = await request(app).get("/api/purchasing/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Widget");
  });

  it("POST creates an order, GET list finds it, GET :id returns lines", async () => {
    const post = await request(app).post("/api/purchasing/purchase-orders").send(baseBody());
    expect(post.status).toBe(200);
    expect(post.body.poNumber).toBe("PO-2026-000001");
    const list = await request(app).get("/api/purchasing/purchase-orders");
    expect(list.body).toHaveLength(1);
    const detail = await request(app).get(`/api/purchasing/purchase-orders/${post.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.lines).toHaveLength(1);
    expect(detail.body.lines[0].remainingQty).toBe(10);
  });

  it("POST rejects an order with no lines", async () => {
    const res = await request(app).post("/api/purchasing/purchase-orders").send({ ...baseBody(), lines: [] });
    expect(res.status).toBe(400);
  });

  it("GET :id returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/purchasing/purchase-orders/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("POST /:id/transition moves status and returns 409 for an invalid jump", async () => {
    const post = await request(app).post("/api/purchasing/purchase-orders").send(baseBody());
    const sent = await request(app).post(`/api/purchasing/purchase-orders/${post.body.id}/transition`).send({ toStatus: "SENT" });
    expect(sent.status).toBe(200);
    expect(sent.body.logisticStatus).toBe("SENT");
    const jump = await request(app).post(`/api/purchasing/purchase-orders/${post.body.id}/transition`).send({ toStatus: "READY" });
    expect(jump.status).toBe(409);
  });

  it("POST /:id/transition returns 404 for an unknown order", async () => {
    const res = await request(app).post("/api/purchasing/purchase-orders/does-not-exist/transition").send({ toStatus: "SENT" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/integration/purchasing-purchase-orders.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the routes**

Create `backend/src/purchasing/routes/purchase-orders.routes.ts`:
```ts
// purchasing/routes/purchase-orders.routes.ts — PurchaseOrder CRUD + status transitions + product picker.
import { Router, Request, Response } from "express";
import type { PurchaseOrderLogisticStatus } from "@prisma/client";
import { prisma } from "../../db";
import {
  createPurchaseOrder, findAllPurchaseOrders, findPurchaseOrderById,
  transitionPurchaseOrderStatus, InvalidTransitionError,
} from "../../repositories/purchasing/purchase-orders.repo";
import { listActiveProductsForPicker } from "../../repositories/purchasing/products.repo";

export const purchaseOrdersRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}

// ─── Products (picker) ───────────────────────────────────────────────────────
purchaseOrdersRouter.get("/products", async (_req: Request, res: Response) => {
  try {
    res.json(await listActiveProductsForPicker(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─── Purchase orders ──────────────────────────────────────────────────────────
purchaseOrdersRouter.get("/purchase-orders", async (req: Request, res: Response) => {
  try {
    const { logisticStatus, supplierId } = req.query as Record<string, string>;
    res.json(await findAllPurchaseOrders(prisma, {
      logisticStatus: (logisticStatus as PurchaseOrderLogisticStatus) || undefined,
      supplierId: supplierId || undefined,
    }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

purchaseOrdersRouter.get("/purchase-orders/:id", async (req: Request, res: Response) => {
  try {
    const po = await findPurchaseOrderById(prisma, req.params.id);
    if (!po) return res.status(404).json({ error: "Purchase order not found" });
    res.json(po);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

interface LineInput {
  productId: string; supplierSku?: string; description: string; orderedQty: number;
  unitOfMeasure: string; unitPrice: number; discountPct?: number;
  taxableAmount: number; vatAmount: number; totalAmount: number;
}

purchaseOrdersRouter.post("/purchase-orders", async (req: Request, res: Response) => {
  try {
    const {
      supplierId, orderDate, currency, warehouseId, paymentTermId,
      expectedDeliveryDate, deliveryAddress, shippingMethod, incoterm,
      internalNotes, supplierNotes, quoteReference, lines,
    } = req.body ?? {};
    if (!supplierId || !orderDate || !currency || !warehouseId || !paymentTermId) {
      return res.status(400).json({ error: "supplierId, orderDate, currency, warehouseId, paymentTermId required" });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "At least one line is required" });
    }
    for (const l of lines as LineInput[]) {
      if (!l.productId || !l.description || !l.orderedQty || !l.unitOfMeasure || l.unitPrice === undefined) {
        return res.status(400).json({ error: "Each line requires productId, description, orderedQty, unitOfMeasure, unitPrice" });
      }
    }
    const po = await createPurchaseOrder(prisma, {
      supplierId, orderDate: new Date(orderDate), currency, buyerId: req.user!.id, warehouseId, paymentTermId,
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      deliveryAddress: deliveryAddress ?? null, shippingMethod: shippingMethod ?? null, incoterm: incoterm ?? null,
      internalNotes: internalNotes ?? null, supplierNotes: supplierNotes ?? null, quoteReference: quoteReference ?? null,
      lines: (lines as LineInput[]).map(l => ({
        productId: l.productId, supplierSku: l.supplierSku ?? null, description: l.description,
        orderedQty: Number(l.orderedQty), unitOfMeasure: l.unitOfMeasure, unitPrice: Number(l.unitPrice),
        discountPct: l.discountPct !== undefined ? Number(l.discountPct) : null,
        taxableAmount: Number(l.taxableAmount), vatAmount: Number(l.vatAmount), totalAmount: Number(l.totalAmount),
      })),
    });
    res.json(po);
  } catch (err) {
    if ((err as any)?.code === "P2003") return res.status(404).json({ error: "Supplier, warehouse, payment term or product not found" });
    res.status(500).json({ error: String(err) });
  }
});

purchaseOrdersRouter.post("/purchase-orders/:id/transition", async (req: Request, res: Response) => {
  try {
    const { toStatus, note } = req.body ?? {};
    if (!toStatus) return res.status(400).json({ error: "toStatus required" });
    const po = await transitionPurchaseOrderStatus(prisma, req.params.id, toStatus, req.user!.id, note ?? null);
    res.json(po);
  } catch (err) {
    if (err instanceof InvalidTransitionError) return res.status(409).json({ error: err.message });
    if (notFound(err)) return res.status(404).json({ error: "Purchase order not found" });
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Mount the router in `backend/src/server.ts`**

Near the existing purchasing imports (around line 29-30):
```ts
import { purchaseOrdersRouter } from "./purchasing/routes/purchase-orders.routes";
```

Near the existing purchasing mounts (around line 152-153):
```ts
app.use("/api/purchasing", requireAuth, purchaseOrdersRouter);
```

- [ ] **Step 5: Run the test and confirm it passes**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/integration/purchasing-purchase-orders.test.ts
```
Expected: PASS, 6/6.

- [ ] **Step 6: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
git add backend/src/purchasing/routes/purchase-orders.routes.ts backend/src/server.ts backend/tests/integration/purchasing-purchase-orders.test.ts
git commit -m "feat(purchasing): add purchase-orders REST routes with product picker endpoint"
```

---

### Task 7: Frontend API client — `purchase-orders.ts`

**Files:**
- Create: `frontend/src/lib/api/purchase-orders.ts`
- Modify: `frontend/src/lib/api/index.ts`

**Interfaces:**
- Consumes: routes from Task 6 (`/api/purchasing/products`, `/api/purchasing/purchase-orders`, `/api/purchasing/purchase-orders/:id`, `/api/purchasing/purchase-orders/:id/transition`), `apiUrl`/`get` from `./client`.
- Produces: `api.purchaseOrders.*` object, types `PurchaseOrder`, `PurchaseOrderDetail`, `PurchaseOrderLine`, `LogisticStatus`, `PickerProduct`, `CreatePurchaseOrderInput` — used by Tasks 8, 9, 10, 11.

- [ ] **Step 1: Create `frontend/src/lib/api/purchase-orders.ts`**
```ts
// lib/api/purchase-orders.ts — PurchaseOrder + product picker.
import { apiUrl, get } from "./client";

export interface PickerProduct { id: string; name: string; brand: string | null; }

export type LogisticStatus =
  | "DRAFT" | "SENT" | "CONFIRMED" | "IN_PRODUCTION" | "READY" | "PARTIALLY_SHIPPED" | "SHIPPED"
  | "PARTIALLY_RECEIVED" | "RECEIVED" | "COMPLETED" | "CANCELLED";

export interface PurchaseOrderLine {
  id: string; productId: string; supplierSku: string | null; description: string;
  orderedQty: number; receivedQty: number; remainingQty: number; unitOfMeasure: string;
  unitPrice: number; discountPct: number | null; taxableAmount: number; vatAmount: number; totalAmount: number;
}

export interface PurchaseOrderStatusHistoryEntry {
  id: string; fromStatus: LogisticStatus; toStatus: LogisticStatus; changedById: string; changedAt: string; note: string | null;
}

export interface PurchaseOrder {
  id: string; poNumber: string; supplierId: string; orderDate: string; currency: string;
  logisticStatus: LogisticStatus; financialStatus: string; buyerId: string; warehouseId: string;
  expectedDeliveryDate: string | null; deliveryAddress: string | null; shippingMethod: string | null;
  incoterm: string | null; paymentTermId: string; internalNotes: string | null; supplierNotes: string | null;
  quoteReference: string | null;
  supplier?: { id: string; legalName: string };
  warehouse?: { id: string; name: string };
}

export type PurchaseOrderDetail = PurchaseOrder & {
  lines: PurchaseOrderLine[];
  statusHistory: PurchaseOrderStatusHistoryEntry[];
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export interface CreatePurchaseOrderLineInput {
  productId: string; supplierSku?: string; description: string; orderedQty: number;
  unitOfMeasure: string; unitPrice: number; discountPct?: number;
  taxableAmount: number; vatAmount: number; totalAmount: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string; orderDate: string; currency: string; warehouseId: string; paymentTermId: string;
  expectedDeliveryDate?: string; deliveryAddress?: string; shippingMethod?: string; incoterm?: string;
  internalNotes?: string; supplierNotes?: string; quoteReference?: string;
  lines: CreatePurchaseOrderLineInput[];
}

export const purchaseOrders = {
  list: (filters?: { logisticStatus?: string; supplierId?: string }) =>
    get<PurchaseOrder[]>("/api/purchasing/purchase-orders", filters as Record<string, string>),
  get: (id: string) => get<PurchaseOrderDetail>(`/api/purchasing/purchase-orders/${id}`),
  create: (data: CreatePurchaseOrderInput) => post<PurchaseOrder>("/api/purchasing/purchase-orders", data),
  transition: (id: string, toStatus: string, note?: string) =>
    post<PurchaseOrder>(`/api/purchasing/purchase-orders/${id}/transition`, { toStatus, note }),
  products: {
    listForPicker: () => get<PickerProduct[]>("/api/purchasing/products"),
  },
};
```

- [ ] **Step 2: Register it in `frontend/src/lib/api/index.ts`**

Add to the imports block:
```ts
import { purchaseOrders } from "./purchase-orders";
```
Add inside the `api` object, under the `// ── Purchasing / master data ──` comment:
```ts
  purchaseOrders,
```

- [ ] **Step 3: Typecheck**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/lib/api/purchase-orders.ts frontend/src/lib/api/index.ts
git commit -m "feat(purchasing): add purchase-orders frontend API client"
```

---

### Task 8: `ProductPicker.tsx` component

**Files:**
- Create: `frontend/src/components/purchasing/ProductPicker.tsx`

**Interfaces:**
- Consumes: `api.purchaseOrders.products.listForPicker()` (Task 7), `PickerProduct` type.
- Produces: `<ProductPicker value={string|null} onChange={(product: PickerProduct|null) => void} />` — used by Task 10's create-order form.

- [ ] **Step 1: Implement**

Create `frontend/src/components/purchasing/ProductPicker.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { PickerProduct } from "@/lib/api/purchase-orders";

interface Props {
  value: string | null;
  onChange: (product: PickerProduct | null) => void;
}

export default function ProductPicker({ value, onChange }: Props) {
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => { api.purchaseOrders.products.listForPicker().then(setProducts).catch(() => {}); }, []);

  const selected = useMemo(() => products.find(p => p.id === value) ?? null, [products, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.brand ?? "").toLowerCase().includes(q));
  }, [products, query]);

  return (
    <div className="relative">
      <input
        className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-primary/50 w-full"
        placeholder="Cerca prodotto…"
        value={open ? query : (selected?.name ?? "")}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={e => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-bg-border bg-bg-card shadow-lg">
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-zinc-600">Nessun prodotto</div>}
          {filtered.map(p => (
            <button
              type="button"
              key={p.id}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-bg-hover"
              onMouseDown={() => { onChange(p); setOpen(false); }}
            >
              {p.name}{p.brand ? ` — ${p.brand}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/components/purchasing/ProductPicker.tsx
git commit -m "feat(purchasing): add product picker component for order lines"
```

---

### Task 9: Frontend — `/acquisti/ordini` list page

**Files:**
- Create: `frontend/src/app/acquisti/ordini/page.tsx`

**Interfaces:**
- Consumes: `api.purchaseOrders.list()` (Task 7).

- [ ] **Step 1: Implement**

Create `frontend/src/app/acquisti/ordini/page.tsx`:
```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { PurchaseOrder, LogisticStatus } from "@/lib/api/purchase-orders";

const STATUS_LABEL: Record<LogisticStatus, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito",
  PARTIALLY_RECEIVED: "Parz. ricevuto", RECEIVED: "Ricevuto", COMPLETED: "Completato", CANCELLED: "Annullato",
};

export default function OrdiniFornitorePage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(() => {
    api.purchaseOrders.list(statusFilter ? { logisticStatus: statusFilter } : undefined).then(setRows).catch(() => {});
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-5xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg sm:text-xl font-bold text-white">Ordini Fornitore</h1>
              <Link
                href="/acquisti/ordini/nuovo"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
              >
                <Plus size={13} /> Nuovo Ordine
              </Link>
            </div>

            <select
              className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">Tutti gli stati</option>
              {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>

            <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
                    <th className="px-3 py-2.5">Numero</th><th className="px-3 py-2.5">Fornitore</th>
                    <th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Magazzino</th>
                    <th className="px-3 py-2.5">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                      <td className="px-3 py-2.5">
                        <Link href={`/acquisti/ordini/${r.id}`} className="font-mono text-accent-primary hover:underline">{r.poNumber}</Link>
                      </td>
                      <td className="px-3 py-2.5">{r.supplier?.legalName ?? "—"}</td>
                      <td className="px-3 py-2.5">{new Date(r.orderDate).toLocaleDateString("it-IT")}</td>
                      <td className="px-3 py-2.5">{r.warehouse?.name ?? "—"}</td>
                      <td className="px-3 py-2.5">{STATUS_LABEL[r.logisticStatus]}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun ordine — inizia creandone uno</td></tr>}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/app/acquisti/ordini/page.tsx
git commit -m "feat(purchasing): add purchase orders list page"
```

---

### Task 10: Frontend — `/acquisti/ordini/nuovo` create page

**Files:**
- Create: `frontend/src/app/acquisti/ordini/nuovo/page.tsx`

**Interfaces:**
- Consumes: `api.suppliers.list()`, `api.purchasing.warehouses.list()`, `api.purchasing.paymentTerms.list()`, `api.purchaseOrders.create()` (Task 7), `<ProductPicker>` (Task 8).

- [ ] **Step 1: Implement**

Create `frontend/src/app/acquisti/ordini/nuovo/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ProductPicker from "@/components/purchasing/ProductPicker";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/api/suppliers";
import type { Warehouse, PaymentTerm } from "@/lib/api/purchasing";
import type { CreatePurchaseOrderLineInput } from "@/lib/api/purchase-orders";

const VAT_RATE = 0.22;

interface LineRow {
  productId: string; productName: string; orderedQty: string; unitPrice: string;
}

const EMPTY_LINE: LineRow = { productId: "", productName: "", orderedQty: "1", unitPrice: "0" };

function computeAmounts(qty: number, unitPrice: number) {
  const taxableAmount = Math.round(qty * unitPrice * 100) / 100;
  const vatAmount = Math.round(taxableAmount * VAT_RATE * 100) / 100;
  const totalAmount = Math.round((taxableAmount + vatAmount) * 100) / 100;
  return { taxableAmount, vatAmount, totalAmount };
}

const inputClass = "bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-primary/50";

export default function NuovoOrdinePage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [paymentTermId, setPaymentTermId] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineRow[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.suppliers.list().then(setSuppliers).catch(() => {});
    api.purchasing.warehouses.list().then(setWarehouses).catch(() => {});
    api.purchasing.paymentTerms.list().then(setPaymentTerms).catch(() => {});
  }, []);

  const setLine = (i: number, patch: Partial<LineRow>) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const totals = lines.reduce((acc, l) => {
    const { taxableAmount, vatAmount, totalAmount } = computeAmounts(Number(l.orderedQty) || 0, Number(l.unitPrice) || 0);
    return { taxable: acc.taxable + taxableAmount, vat: acc.vat + vatAmount, total: acc.total + totalAmount };
  }, { taxable: 0, vat: 0, total: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (lines.some(l => !l.productId)) throw new Error("Seleziona un prodotto per ogni riga");
      const payloadLines: CreatePurchaseOrderLineInput[] = lines.map(l => {
        const qty = Number(l.orderedQty) || 0;
        const unitPrice = Number(l.unitPrice) || 0;
        const { taxableAmount, vatAmount, totalAmount } = computeAmounts(qty, unitPrice);
        return {
          productId: l.productId, description: l.productName,
          orderedQty: qty, unitOfMeasure: "PZ", unitPrice, taxableAmount, vatAmount, totalAmount,
        };
      });
      const po = await api.purchaseOrders.create({
        supplierId, orderDate, currency: "EUR", warehouseId, paymentTermId, lines: payloadLines,
      });
      router.push(`/acquisti/ordini/${po.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-4xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Ordine Fornitore</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">
                    Fornitore *
                    <select required className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.legalName}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">
                    Magazzino *
                    <select required className={inputClass} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">
                    Condizione di pagamento *
                    <select required className={inputClass} value={paymentTermId} onChange={e => setPaymentTermId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {paymentTerms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">
                    Data ordine *
                    <input required type="date" className={inputClass} value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-white pb-2 border-b border-bg-border">Righe ordine</h2>
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
                    <label className="text-xs text-zinc-400 flex flex-col gap-1">
                      Prodotto *
                      <ProductPicker
                        value={line.productId || null}
                        onChange={p => setLine(i, { productId: p?.id ?? "", productName: p?.name ?? "" })}
                      />
                    </label>
                    <label className="text-xs text-zinc-400 flex flex-col gap-1">
                      Quantità *
                      <input required type="number" min="0.01" step="0.01" className={inputClass} value={line.orderedQty} onChange={e => setLine(i, { orderedQty: e.target.value })} />
                    </label>
                    <label className="text-xs text-zinc-400 flex flex-col gap-1">
                      Prezzo unitario *
                      <input required type="number" min="0" step="0.01" className={inputClass} value={line.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value })} />
                    </label>
                    <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="text-xs text-accent-red disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1.5">Rimuovi</button>
                  </div>
                ))}
                <button type="button" onClick={addLine} className="text-xs text-accent-primary hover:underline">+ Aggiungi riga</button>

                <div className="pt-3 border-t border-bg-border text-xs text-zinc-400 space-y-1">
                  <div>Imponibile: € {totals.taxable.toFixed(2)}</div>
                  <div>IVA (22%): € {totals.vat.toFixed(2)}</div>
                  <div className="text-white font-semibold">Totale: € {totals.total.toFixed(2)}</div>
                </div>
              </div>

              {error && <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">{error}</div>}

              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-accent-primary text-bg-base text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? "Salvataggio…" : "Crea Ordine"}
              </button>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/app/acquisti/ordini/nuovo/page.tsx
git commit -m "feat(purchasing): add multi-line purchase order creation form"
```

---

### Task 11: Frontend — `/acquisti/ordini/[id]` detail page + sidebar update

**Files:**
- Create: `frontend/src/app/acquisti/ordini/[id]/page.tsx`
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx`

**Interfaces:**
- Consumes: `api.purchaseOrders.get()`, `api.purchaseOrders.transition()` (Task 7).

- [ ] **Step 1: Implement the detail page**

Create `frontend/src/app/acquisti/ordini/[id]/page.tsx`:
```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { PurchaseOrderDetail, LogisticStatus } from "@/lib/api/purchase-orders";

const STATUS_LABEL: Record<LogisticStatus, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito",
  PARTIALLY_RECEIVED: "Parz. ricevuto", RECEIVED: "Ricevuto", COMPLETED: "Completato", CANCELLED: "Annullato",
};

// Mirrors backend/src/purchasing/purchase-order-state-machine.ts — only used to
// decide which buttons to show. The server independently re-validates every
// transition, so a stale copy here can only ever be overly permissive in the
// UI (an extra button that then 409s), never actually bypass a rule.
const NEXT_STATUSES: Record<LogisticStatus, LogisticStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"], SENT: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["READY", "CANCELLED"], READY: ["PARTIALLY_SHIPPED", "CANCELLED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "CANCELLED"], SHIPPED: ["CANCELLED"],
  PARTIALLY_RECEIVED: [], RECEIVED: [], COMPLETED: [], CANCELLED: [],
};

export default function OrdineDettaglioPage() {
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(() => { api.purchaseOrders.get(id).then(setPo).catch(() => setError("Ordine non trovato")); }, [id]);
  useEffect(() => { load(); }, [load]);

  const handleTransition = async (toStatus: LogisticStatus) => {
    setTransitioning(true);
    setError(null);
    try {
      await api.purchaseOrders.transition(id, toStatus);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la transizione di stato");
    } finally {
      setTransitioning(false);
    }
  };

  if (error && !po) {
    return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">{error}</div>;
  }
  if (!po) return null;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-4xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg sm:text-xl font-bold text-white font-mono">{po.poNumber}</h1>
              <span className="text-xs px-2.5 py-1 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary">
                {STATUS_LABEL[po.logisticStatus]}
              </span>
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><div className="text-zinc-500">Fornitore</div><div className="text-zinc-200">{po.supplier?.legalName}</div></div>
              <div><div className="text-zinc-500">Magazzino</div><div className="text-zinc-200">{po.warehouse?.name}</div></div>
              <div><div className="text-zinc-500">Data ordine</div><div className="text-zinc-200">{new Date(po.orderDate).toLocaleDateString("it-IT")}</div></div>
              <div><div className="text-zinc-500">Valuta</div><div className="text-zinc-200">{po.currency}</div></div>
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
              <h2 className="text-sm font-semibold text-white px-4 py-3 border-b border-bg-border">Righe</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
                    <th className="px-3 py-2.5">Descrizione</th><th className="px-3 py-2.5">Ordinata</th>
                    <th className="px-3 py-2.5">Ricevuta</th><th className="px-3 py-2.5">Residua</th>
                    <th className="px-3 py-2.5">Prezzo unit.</th><th className="px-3 py-2.5">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map(l => (
                    <tr key={l.id} className="border-b border-bg-border/40 text-zinc-300">
                      <td className="px-3 py-2.5">{l.description}</td>
                      <td className="px-3 py-2.5">{l.orderedQty}</td>
                      <td className="px-3 py-2.5">{l.receivedQty}</td>
                      <td className="px-3 py-2.5">{l.remainingQty}</td>
                      <td className="px-3 py-2.5">€ {l.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-2.5">€ {l.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">Azioni di stato</h2>
              <div className="flex gap-2 flex-wrap">
                {NEXT_STATUSES[po.logisticStatus].map(next => (
                  <button
                    key={next}
                    disabled={transitioning}
                    onClick={() => handleTransition(next)}
                    className="px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 disabled:opacity-50 transition-colors"
                  >
                    → {STATUS_LABEL[next]}
                  </button>
                ))}
                {NEXT_STATUSES[po.logisticStatus].length === 0 && <span className="text-xs text-zinc-600">Nessuna transizione disponibile da questo stato</span>}
              </div>
              {error && <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">{error}</div>}
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-2">
              <h2 className="text-sm font-semibold text-white">Storico stato</h2>
              {po.statusHistory.length === 0 && <div className="text-xs text-zinc-600">Nessuna transizione registrata</div>}
              {po.statusHistory.map(h => (
                <div key={h.id} className="text-xs text-zinc-400">
                  {new Date(h.changedAt).toLocaleString("it-IT")} — {STATUS_LABEL[h.fromStatus]} → {STATUS_LABEL[h.toStatus]}
                  {h.note ? ` (${h.note})` : ""}
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the sidebar**

In `frontend/src/components/layout/GlobalSidebar.tsx`, in the `INVENTORY` group's `items` array, replace:
```ts
      { label: "Purchase Orders", comingSoon: true },
```
with:
```ts
      { href: "/acquisti/ordini", label: "Ordini Fornitore" },
```
(Labeled "Ordini Fornitore", not "Ordini", to stay distinct from the existing top-level `/ordini` link which is customer sales orders.)

- [ ] **Step 3: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add "frontend/src/app/acquisti/ordini/[id]/page.tsx" frontend/src/components/layout/GlobalSidebar.tsx
git commit -m "feat(purchasing): add purchase order detail page with status transitions, wire up sidebar"
```

---

### Task 12: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend test suite for this module**
```bash
cd ~/Developer/WBDASH/backend
npx vitest run tests/unit/purchase-order-state-machine.test.ts tests/repositories/purchasing tests/integration/purchasing-purchase-orders.test.ts tests/integration/purchasing-suppliers.test.ts tests/integration/purchasing-master-data.test.ts
```
Expected: all green. (Scoped to the purchasing module rather than the full `npx vitest run` — FASE C's PR noted severe pre-existing Testcontainers/Docker resource contention on a long-running session; if you hit that, verify affected files individually rather than treating it as a regression here.)

- [ ] **Step 2: Typecheck both apps**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
```
Expected: no errors in either.

- [ ] **Step 3: Manual browser E2E verification**

Start both dev servers (`docker start wbdash-dev-postgres`, then `npm run dev` in `backend/` and `frontend/`), log in, and walk through:
1. Sidebar → Inventory → "Ordini Fornitore" opens `/acquisti/ordini` (empty state visible).
2. "Nuovo Ordine" → fill supplier/warehouse/payment term/date, use the product picker to add at least 2 lines with different quantities/prices, submit.
3. Redirected to the detail page — confirm `poNumber` is `PO-2026-000001` (or the next sequential number if you've created others), lines and computed totals match what was entered, status is "Bozza".
4. Click "→ Inviato" — confirm status updates and a row appears in "Storico stato".
5. Go back to the list page — confirm the new order appears with the updated status, and the status filter dropdown correctly narrows the list.
6. Create a second order — confirm its `poNumber` increments to `...000002`.

- [ ] **Step 4: Final commit if Step 3 required any fixes**

If manual verification surfaced issues, fix them, re-run the relevant automated tests, and commit each fix separately with a `fix(purchasing): ...` message — do not silently fold fixes into earlier task commits.

---

## After this plan

Once all tasks are green and manually verified, open a PR from `feature/purchase-orders` into `develop` (same flow as PR #3/#4), following `CLAUDE.md`'s response format and `CONTRIBUTING.md`'s PR template. The next phase in the roadmap is **FASE E — Ricezione merce e DDT** (`docs/superpowers/specs/2026-08-05-purchasing-erp-architecture.md`, branch `feature/goods-receipts-ddt`), which is what finally makes `PARTIALLY_RECEIVED`/`RECEIVED`/`COMPLETED` reachable — brainstorm that phase fresh rather than assuming this plan's scope carries over.
