# Scadenzario Fornitori Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate supplier payment due dates when a purchase order is fully received, computed from the order's payment term (end-of-month rounding, fixed-day-of-month, per-installment offset days and percentage split), and expose a dedicated "Scadenzario" page to view and mark them paid.

**Architecture:** A pure, dependency-free function (`payment-schedule.ts`) computes due dates and per-installment amounts from an anchor date + a `PaymentTerm`. `createGoodsReceipt()` calls it inside its existing transaction the moment an order reaches `RECEIVED`, persisting `SupplierPaymentDue` rows. A new repository + routes expose listing (with filters) and a "mark paid" action. A new frontend page lists all dues across every order.

**Tech Stack:** Node.js/TypeScript (backend, existing `purchasing/**` module), Prisma, Vitest + Testcontainers (repository/integration tests), pure unit tests for the date-math (no DB), Next.js 14 + Tailwind (frontend, existing `acquisti/**` page patterns).

## Global Constraints

- Repository layer only: only `backend/src/repositories/**` calls Prisma directly.
- `payment-schedule.ts` is a pure module — no Prisma import, no `Date.now()`/timezone-host-dependent methods. Use `getUTC*`/`Date.UTC(...)` exclusively (never `getFullYear()`/`getMonth()`/`getDate()` without the `UTC` prefix) — this project has a documented pre-existing bug class from exactly this mistake (`italyDayStart()` in `backend/src/amazon/utils/datetime.ts`, assumes the host process runs in UTC); this new code must not repeat it.
- Money fields stay `Decimal` in the schema (`SupplierPaymentDue.amount`/`paidAmount`); the pure `payment-schedule.ts` module works in plain `number` (cents-based internally to avoid float drift) since it has no Prisma dependency — the repository layer converts at the boundary, same pattern as `purchase-orders.repo.ts`'s `withRemaining()`.
- Generation trigger: exactly once per order, inside `createGoodsReceipt()`'s existing transaction, only when the computed `newStatus` transitions TO `RECEIVED` (not `PARTIALLY_RECEIVED`, not when already `RECEIVED`... impossible per the state machine, but never re-generate — `RECEIVED` has no outbound transitions so this is naturally a one-time event).
- No new document numbering (`DocumentSequence`) — payment dues aren't a numbered document type.
- One migration, generated via `prisma migrate dev --name add_supplier_payment_due` (never hand-write a migration folder name — see this project's documented migration-folder-ordering incident).
- Exact due-date algorithm (validated against the approved design example: receipt 2026-03-05, 30 days, end-of-month on, fixed day 10 → 2026-05-10):
  1. If `endOfMonth`, roll the anchor date forward to the last day of that month.
  2. Add the installment's `offsetDays`.
  3. If `fixedDay` is set, move to that day-of-month in the month AFTER the one the step-2 result falls in (always the next month, never the same month).

---

### Task 1: Prisma schema — `SupplierPaymentDue` model + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<generated>_add_supplier_payment_due/` (generated, not hand-written)

**Interfaces:**
- Produces: Prisma Client types `SupplierPaymentDue`, `SupplierPaymentDueStatus` (used by Task 3/4).

- [ ] **Step 1: Add the relation field to `PurchaseOrder`**

In `backend/prisma/schema.prisma`, find the `PurchaseOrder` model and add `paymentDues SupplierPaymentDue[]` right after the existing `goodsReceipts` relation line:

```prisma
  lines         PurchaseOrderLine[]
  statusHistory PurchaseOrderStatusHistory[]
  goodsReceipts GoodsReceipt[]
  paymentDues   SupplierPaymentDue[]
```

- [ ] **Step 2: Add the new enum and model**

At the end of `backend/prisma/schema.prisma` (after the `GoodsReceiptLine` model, currently the last lines of the file), append:

```prisma

// ─── Purchasing module — Scadenzario: supplier payment due dates ───────────────
// See docs/superpowers/specs/2026-08-24-scadenzario-design.md. Generated
// automatically once per order (backend/src/repositories/purchasing/goods-receipts.repo.ts,
// when the order reaches RECEIVED) — never created directly by a route.
enum SupplierPaymentDueStatus {
  PENDING
  PAID
}

model SupplierPaymentDue {
  id                String                    @id @default(cuid())
  purchaseOrderId   String
  purchaseOrder     PurchaseOrder             @relation(fields: [purchaseOrderId], references: [id])
  installmentNumber Int
  dueDate           DateTime
  amount            Decimal                   @db.Decimal(14, 4)
  status            SupplierPaymentDueStatus  @default(PENDING)
  paidDate          DateTime?
  paidAmount        Decimal?                  @db.Decimal(14, 4)
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt

  @@index([purchaseOrderId])
  @@index([status])
  @@index([dueDate])
}
```

- [ ] **Step 3: Generate the migration**

Run: `cd backend && npx prisma migrate dev --name add_supplier_payment_due`
Expected: a new folder under `backend/prisma/migrations/` with a full `YYYYMMDDHHMMSS_add_supplier_payment_due` name, containing `CREATE TYPE`/`CREATE TABLE "SupplierPaymentDue"` plus the three indexes and the FK to `PurchaseOrder`. If the dev database shows drift or asks for a destructive reset, STOP and report BLOCKED rather than forcing it through — check whether the dev DB needs the same dedicated-container treatment used earlier in this project's history (see `.superpowers/sdd/` ledgers from prior purchasing phases for the pattern) before proceeding.

- [ ] **Step 4: Verify the client compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add SupplierPaymentDue model (scadenzario)"
```

---

### Task 2: `payment-schedule.ts` — pure due-date/amount calculation

**Files:**
- Create: `backend/src/purchasing/payment-schedule.ts`
- Test: `backend/tests/purchasing/payment-schedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function computeDueDate(anchorDate: Date, endOfMonth: boolean, fixedDay: number | null, offsetDays: number): Date
  export interface PaymentTermInstallmentForSchedule { installmentNumber: number; offsetDays: number; percentage: number; }
  export interface PaymentTermForSchedule { endOfMonth: boolean; fixedDay: number | null; installments: PaymentTermInstallmentForSchedule[]; }
  export interface ScheduledInstallment { installmentNumber: number; dueDate: Date; amount: number; }
  export function computePaymentSchedule(anchorDate: Date, paymentTerm: PaymentTermForSchedule, totalAmount: number): ScheduledInstallment[]
  ```
  Consumed by Task 3 (`goods-receipts.repo.ts`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/purchasing/payment-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDueDate, computePaymentSchedule } from "../../src/purchasing/payment-schedule";

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
    // step 2 result would be 2026-04-05 (no end-of-month); fixedDay=20 is later
    // in April than the 5th, but must still land in May, not April.
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), false, 20, 31);
    expect(due.toISOString().slice(0, 10)).toBe("2026-05-20");
  });

  it("handles December end-of-month rollover into January correctly", () => {
    const due = computeDueDate(new Date("2026-12-15T00:00:00.000Z"), true, null, 0);
    expect(due.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("fixed day rollover from December lands in January of the next year", () => {
    const due = computeDueDate(new Date("2026-12-15T00:00:00.000Z"), false, 10, 5);
    // step 2: 2026-12-20; fixed day -> January (next month) the 10th
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
    const sum = schedule.reduce((s, i) => s + i.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/purchasing/payment-schedule.test.ts`
Expected: FAIL — `payment-schedule.ts` does not exist yet.

- [ ] **Step 3: Implement `payment-schedule.ts`**

Create `backend/src/purchasing/payment-schedule.ts`:

```ts
// purchasing/payment-schedule.ts — pure module, no Prisma import, no Date.now().
// Computes supplier payment due dates/amounts from a PaymentTerm and an anchor
// date (the receipt date of the DDT that completes an order — see
// repositories/purchasing/goods-receipts.repo.ts, the only caller).
//
// Deliberately uses ONLY getUTC*/Date.UTC(...) — never getFullYear()/getMonth()/
// getDate() without the UTC prefix. This project has a documented pre-existing
// bug class from exactly that mistake (italyDayStart() in
// amazon/utils/datetime.ts assumes the host process runs in UTC, which breaks
// on a non-UTC dev machine) — this module must not repeat it.

/**
 * Computes a single installment's due date.
 * 1. If endOfMonth, roll the anchor date forward to the last day of that month.
 * 2. Add offsetDays.
 * 3. If fixedDay is set, move to that day-of-month in the month AFTER the one
 *    the step-2 result falls in — always the next month, never the same one.
 */
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
    // Day 0 of the following month = the last day of the anchor's month.
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

export interface PaymentTermInstallmentForSchedule {
  installmentNumber: number;
  offsetDays: number;
  percentage: number;
}

export interface PaymentTermForSchedule {
  endOfMonth: boolean;
  fixedDay: number | null;
  installments: PaymentTermInstallmentForSchedule[];
}

export interface ScheduledInstallment {
  installmentNumber: number;
  dueDate: Date;
  amount: number;
}

/**
 * Splits totalAmount across the payment term's installments by percentage.
 * Works in integer cents internally so the sum of returned amounts always
 * equals totalAmount exactly (the last installment, by installmentNumber,
 * absorbs any rounding remainder) rather than drifting a cent or two from
 * independently-rounded percentages.
 */
export function computePaymentSchedule(
  anchorDate: Date,
  paymentTerm: PaymentTermForSchedule,
  totalAmount: number
): ScheduledInstallment[] {
  const sorted = [...paymentTerm.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const totalCents = Math.round(totalAmount * 100);
  let allocatedCents = 0;

  return sorted.map((inst, i) => {
    const isLast = i === sorted.length - 1;
    const cents = isLast
      ? totalCents - allocatedCents
      : Math.round(totalCents * (inst.percentage / 100));
    allocatedCents += cents;

    return {
      installmentNumber: inst.installmentNumber,
      dueDate: computeDueDate(anchorDate, paymentTerm.endOfMonth, paymentTerm.fixedDay, inst.offsetDays),
      amount: cents / 100,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/purchasing/payment-schedule.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/purchasing/payment-schedule.ts backend/tests/purchasing/payment-schedule.test.ts
git commit -m "feat(purchasing): add payment-schedule due-date/amount calculation"
```

---

### Task 3: Wire schedule generation into `createGoodsReceipt()`

**Files:**
- Modify: `backend/src/repositories/purchasing/goods-receipts.repo.ts`
- Modify: `backend/tests/repositories/purchasing/goods-receipts.repo.test.ts`

**Interfaces:**
- Consumes: `computePaymentSchedule` (Task 2, `../../purchasing/payment-schedule`).
- Produces: no new exports — `createGoodsReceipt()`'s existing signature/return type is unchanged; it now has a side effect (creates `SupplierPaymentDue` rows) exactly when it transitions an order to `RECEIVED`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/repositories/purchasing/goods-receipts.repo.test.ts`, add these test cases (place them after the existing `"a second receipt completing a PARTIALLY_RECEIVED order transitions it to RECEIVED"` test, using the same `confirmedOrder()` helper already in this file):

```ts
  it("generates the payment schedule when a full receipt completes the order", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-03-05"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-03-04"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 100 }],
    });

    const dues = await db.prisma.supplierPaymentDue.findMany({ where: { purchaseOrderId: po.id }, orderBy: { installmentNumber: "asc" } });
    expect(dues).toHaveLength(1);
    expect(dues[0].status).toBe("PENDING");
    expect(Number(dues[0].amount)).toBe(305); // baseOrder()'s single line totalAmount
  });

  it("does NOT generate a payment schedule for a partial receipt", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-03-05"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-03-04"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 40 }],
    });

    const dues = await db.prisma.supplierPaymentDue.findMany({ where: { purchaseOrderId: po.id } });
    expect(dues).toHaveLength(0);
  });

  it("generates the schedule only once, on the receipt that completes the order (not the earlier partial one)", async () => {
    const po = await confirmedOrder();
    const full = await findPurchaseOrderById(db.prisma, po.id);
    const lineId = full!.lines[0].id;

    await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-03-01"),
      supplierDdtNumber: "DDT-1001", supplierDdtDate: new Date("2026-02-28"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 40 }],
    });
    await createGoodsReceipt(db.prisma, {
      purchaseOrderId: po.id, receiptDate: new Date("2026-03-10"),
      supplierDdtNumber: "DDT-1002", supplierDdtDate: new Date("2026-03-09"),
      receivedById: userId, lines: [{ purchaseOrderLineId: lineId, receivedQty: 60 }],
    });

    const dues = await db.prisma.supplierPaymentDue.findMany({ where: { purchaseOrderId: po.id } });
    expect(dues).toHaveLength(1); // not generated on the first (partial) receipt, generated once on the second
  });
```

Note: `baseOrder()` (already defined earlier in this test file) creates a `paymentTermId` fixture via `db.prisma.paymentTerm.create({ data: { name: "30 giorni fine mese", type: "STANDARD", paymentMethod: "BONIFICO" } })` with NO `installments` — you must add one installment to that fixture (or create a dedicated one for these three new tests) so `computePaymentSchedule` has something to iterate. Read the existing `beforeEach` in this file first and extend the `paymentTerm.create` call to include:

```ts
    installments: { create: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }] },
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/repositories/purchasing/goods-receipts.repo.test.ts`
Expected: FAIL — no `SupplierPaymentDue` rows are ever created yet.

- [ ] **Step 3: Implement the wiring**

In `backend/src/repositories/purchasing/goods-receipts.repo.ts`, add the import:

```ts
import { computePaymentSchedule } from "../../purchasing/payment-schedule";
```

Change the initial order fetch to also include the payment term and its installments:

```ts
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: data.purchaseOrderId },
      include: { lines: true, paymentTerm: { include: { installments: true } } },
    });
```

Change the status-transition block at the end of the transaction to also generate the schedule when the new status is `RECEIVED`:

```ts
    if (newStatus !== order.logisticStatus) {
      if (!isValidTransition(order.logisticStatus, newStatus)) {
        throw new InvalidTransitionError(order.logisticStatus, newStatus);
      }
      await tx.purchaseOrderStatusHistory.create({
        data: {
          purchaseOrderId: data.purchaseOrderId,
          fromStatus: order.logisticStatus,
          toStatus: newStatus,
          changedById: data.receivedById,
          note: `Ricezione DDT ${data.supplierDdtNumber}`,
        },
      });
      await tx.purchaseOrder.update({ where: { id: data.purchaseOrderId }, data: { logisticStatus: newStatus } });

      if (newStatus === "RECEIVED") {
        const totalAmount = updatedLines.reduce((sum, l) => sum + Number(l.totalAmount), 0);
        const schedule = computePaymentSchedule(data.receiptDate, order.paymentTerm, totalAmount);
        await tx.supplierPaymentDue.createMany({
          data: schedule.map((s) => ({
            purchaseOrderId: data.purchaseOrderId,
            installmentNumber: s.installmentNumber,
            dueDate: s.dueDate,
            amount: s.amount,
          })),
        });
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/repositories/purchasing/goods-receipts.repo.test.ts`
Expected: PASS (all tests, old + 3 new).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/purchasing/goods-receipts.repo.ts backend/tests/repositories/purchasing/goods-receipts.repo.test.ts
git commit -m "feat(purchasing): generate payment schedule when an order is fully received"
```

---

### Task 4: Repository + routes for listing and marking dues paid

**Files:**
- Create: `backend/src/repositories/purchasing/payment-dues.repo.ts`
- Create: `backend/src/purchasing/routes/payment-dues.routes.ts`
- Modify: `backend/src/server.ts` (mount the new router)
- Create: `backend/tests/repositories/purchasing/payment-dues.repo.test.ts`
- Create: `backend/tests/integration/purchasing-payment-dues.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SupplierPaymentDueWithOrder = SupplierPaymentDue & { purchaseOrder: { poNumber: string; supplier: { legalName: string } } };
  export async function findAllPaymentDues(prisma: PrismaClient, filters?: { status?: SupplierPaymentDueStatus; supplierId?: string }): Promise<SupplierPaymentDueWithOrder[]>
  export class PaymentDueNotFoundError extends Error {}
  export async function markPaymentDuePaid(prisma: PrismaClient, id: string, paidDate: Date, paidAmount: number): Promise<SupplierPaymentDue>
  ```
  Consumed by Task 5 (frontend client).

- [ ] **Step 1: Write the failing repository tests**

Create `backend/tests/repositories/purchasing/payment-dues.repo.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllPaymentDues, markPaymentDuePaid } from "../../../src/repositories/purchasing/payment-dues.repo";

let db: TestDb;
let supplierId: string;
let warehouseId: string;
let paymentTermId: string;
let productId: string;
let userId: string;
let poId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  supplierId = (await db.prisma.supplier.create({
    data: { legalName: "Acme Supply Srl", internalCode: "FORN-001", supplierType: "Produttore", country: "IT" },
  })).id;
  warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino Centrale", code: "MAG-1" } })).id;
  paymentTermId = (await db.prisma.paymentTerm.create({
    data: { name: "30gg", type: "STANDARD", paymentMethod: "BONIFICO" },
  })).id;
  productId = (await db.prisma.product.create({ data: { name: "Widget Test" } })).id;
  userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
  const po = await db.prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-000001", supplierId, orderDate: new Date("2026-03-01"), currency: "EUR",
      buyerId: userId, warehouseId, paymentTermId,
      lines: { create: [{ productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ", unitPrice: 5, taxableAmount: 50, vatAmount: 11, totalAmount: 61 }] },
    },
  });
  poId = po.id;
});

describe("payment-dues.repo", () => {
  it("findAllPaymentDues returns dues with supplier/order info, ordered by dueDate ascending", async () => {
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-05-10"), amount: 61 } });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 2, dueDate: new Date("2026-04-10"), amount: 30 } });

    const dues = await findAllPaymentDues(db.prisma);
    expect(dues).toHaveLength(2);
    expect(dues[0].dueDate.toISOString().slice(0, 10)).toBe("2026-04-10"); // earliest first
    expect(dues[0].purchaseOrder.poNumber).toBe("PO-2026-000001");
    expect(dues[0].purchaseOrder.supplier.legalName).toBe("Acme Supply Srl");
  });

  it("findAllPaymentDues filters by status", async () => {
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-04-10"), amount: 61, status: "PAID", paidDate: new Date("2026-04-09"), paidAmount: 61 } });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 2, dueDate: new Date("2026-05-10"), amount: 30 } });

    expect(await findAllPaymentDues(db.prisma, { status: "PENDING" })).toHaveLength(1);
    expect(await findAllPaymentDues(db.prisma, { status: "PAID" })).toHaveLength(1);
  });

  it("findAllPaymentDues filters by supplierId", async () => {
    const otherSupplier = await db.prisma.supplier.create({ data: { legalName: "Other Srl", internalCode: "FORN-002", supplierType: "Produttore", country: "IT" } });
    const otherPo = await db.prisma.purchaseOrder.create({
      data: { poNumber: "PO-2026-000002", supplierId: otherSupplier.id, orderDate: new Date(), currency: "EUR", buyerId: userId, warehouseId, paymentTermId },
    });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date(), amount: 61 } });
    await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: otherPo.id, installmentNumber: 1, dueDate: new Date(), amount: 40 } });

    const filtered = await findAllPaymentDues(db.prisma, { supplierId });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].purchaseOrder.poNumber).toBe("PO-2026-000001");
  });

  it("markPaymentDuePaid sets status/paidDate/paidAmount", async () => {
    const due = await db.prisma.supplierPaymentDue.create({ data: { purchaseOrderId: poId, installmentNumber: 1, dueDate: new Date("2026-04-10"), amount: 61 } });
    const updated = await markPaymentDuePaid(db.prisma, due.id, new Date("2026-04-08"), 61);
    expect(updated.status).toBe("PAID");
    expect(Number(updated.paidAmount)).toBe(61);
    expect(updated.paidDate!.toISOString().slice(0, 10)).toBe("2026-04-08");
  });

  it("markPaymentDuePaid throws on an unknown id", async () => {
    await expect(markPaymentDuePaid(db.prisma, "does-not-exist", new Date(), 0)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/repositories/purchasing/payment-dues.repo.test.ts`
Expected: FAIL — `payment-dues.repo.ts` does not exist yet.

- [ ] **Step 3: Implement the repository**

Create `backend/src/repositories/purchasing/payment-dues.repo.ts`:

```ts
// repositories/purchasing/payment-dues.repo.ts — SupplierPaymentDue rows are
// created exclusively by createGoodsReceipt() (goods-receipts.repo.ts) — this
// file only reads them and records a payment as made.
import type { PrismaClient, SupplierPaymentDue, SupplierPaymentDueStatus } from "@prisma/client";

export type SupplierPaymentDueWithOrder = SupplierPaymentDue & {
  purchaseOrder: { poNumber: string; supplier: { legalName: string } };
};

export async function findAllPaymentDues(
  prisma: PrismaClient,
  filters?: { status?: SupplierPaymentDueStatus; supplierId?: string }
): Promise<SupplierPaymentDueWithOrder[]> {
  return prisma.supplierPaymentDue.findMany({
    where: {
      status: filters?.status,
      purchaseOrder: filters?.supplierId ? { supplierId: filters.supplierId } : undefined,
    },
    include: { purchaseOrder: { select: { poNumber: true, supplier: { select: { legalName: true } } } } },
    orderBy: { dueDate: "asc" },
  });
}

export async function markPaymentDuePaid(
  prisma: PrismaClient,
  id: string,
  paidDate: Date,
  paidAmount: number
): Promise<SupplierPaymentDue> {
  return prisma.supplierPaymentDue.update({
    where: { id },
    data: { status: "PAID", paidDate, paidAmount },
  });
}
```

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `cd backend && npx vitest run tests/repositories/purchasing/payment-dues.repo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the routes**

Create `backend/src/purchasing/routes/payment-dues.routes.ts`:

```ts
// purchasing/routes/payment-dues.routes.ts — list supplier payment dues, mark one paid.
import { Router, Request, Response } from "express";
import type { SupplierPaymentDueStatus } from "@prisma/client";
import { prisma } from "../../db";
import { findAllPaymentDues, markPaymentDuePaid } from "../../repositories/purchasing/payment-dues.repo";

export const paymentDuesRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}

paymentDuesRouter.get("/payment-dues", async (req: Request, res: Response) => {
  try {
    const { status, supplierId } = req.query as Record<string, string>;
    const dues = await findAllPaymentDues(prisma, {
      status: (status as SupplierPaymentDueStatus) || undefined,
      supplierId: supplierId || undefined,
    });
    res.json(dues);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

paymentDuesRouter.post("/payment-dues/:id/mark-paid", async (req: Request, res: Response) => {
  try {
    const { paidDate, paidAmount } = req.body ?? {};
    if (!paidDate || paidAmount === undefined) {
      return res.status(400).json({ error: "paidDate and paidAmount required" });
    }
    const due = await markPaymentDuePaid(prisma, req.params.id, new Date(paidDate), Number(paidAmount));
    res.json(due);
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Payment due not found" });
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 6: Mount the router**

In `backend/src/server.ts`, add the import next to the other purchasing route imports:

```ts
import { paymentDuesRouter } from "./purchasing/routes/payment-dues.routes";
```

And mount it next to the other purchasing routers:

```ts
app.use("/api/purchasing", requireAuth, paymentDuesRouter);
```

- [ ] **Step 7: Write the integration tests**

Read `backend/tests/integration/purchasing-goods-receipts.test.ts` first to copy its exact app-setup/fixture pattern (same one already used across this module). Create `backend/tests/integration/purchasing-payment-dues.test.ts` following that pattern, covering:
- `GET /payment-dues` with no filters → 200, array including a seeded due.
- `GET /payment-dues?status=PAID` → 200, only paid ones.
- `POST /payment-dues/:id/mark-paid` with valid body → 200, `status: "PAID"`.
- `POST /payment-dues/:id/mark-paid` with missing `paidDate` → 400.
- `POST /payment-dues/:id/mark-paid` on an unknown id → 404.

- [ ] **Step 8: Run the test suite**

Run: `cd backend && npx vitest run tests/integration/purchasing-payment-dues.test.ts`
Expected: PASS (all cases above green).

- [ ] **Step 9: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add backend/src/repositories/purchasing/payment-dues.repo.ts backend/src/purchasing/routes/payment-dues.routes.ts backend/src/server.ts backend/tests/repositories/purchasing/payment-dues.repo.test.ts backend/tests/integration/purchasing-payment-dues.test.ts
git commit -m "feat(purchasing): add payment-dues repository and routes"
```

---

### Task 5: Frontend — Scadenzario page

**Files:**
- Create: `frontend/src/lib/api/payment-dues.ts`
- Modify: `frontend/src/lib/api/index.ts` (register the new resource)
- Create: `frontend/src/app/acquisti/scadenzario/page.tsx`
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx` (turn the "Scadenzario" placeholder into a real link)

**Interfaces:**
- Consumes: `GET /api/purchasing/payment-dues`, `POST /api/purchasing/payment-dues/:id/mark-paid` (Task 4).

- [ ] **Step 1: Add the frontend API client**

Create `frontend/src/lib/api/payment-dues.ts`:

```ts
// lib/api/payment-dues.ts — Scadenzario: supplier payment due dates.
import { apiUrl, get } from "./client";

export type PaymentDueStatus = "PENDING" | "PAID";

export interface SupplierPaymentDue {
  id: string;
  purchaseOrderId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  status: PaymentDueStatus;
  paidDate: string | null;
  paidAmount: number | null;
  purchaseOrder: { poNumber: string; supplier: { legalName: string } };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const paymentDues = {
  list: (filters?: { status?: PaymentDueStatus; supplierId?: string }) =>
    get<SupplierPaymentDue[]>("/api/purchasing/payment-dues", filters as Record<string, string>),
  markPaid: (id: string, paidDate: string, paidAmount: number) =>
    post<SupplierPaymentDue>(`/api/purchasing/payment-dues/${id}/mark-paid`, { paidDate, paidAmount }),
};
```

- [ ] **Step 2: Register it in the api index**

In `frontend/src/lib/api/index.ts`, add the import next to `purchaseOrders`:

```ts
import { paymentDues } from "./payment-dues";
```

And add it to the exported `api` object next to `purchaseOrders,`:

```ts
  paymentDues,
```

- [ ] **Step 3: Build the Scadenzario page**

Create `frontend/src/app/acquisti/scadenzario/page.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { SupplierPaymentDue, PaymentDueStatus } from "@/lib/api/payment-dues";

export default function ScadenzarioPage() {
  const [rows, setRows] = useState<SupplierPaymentDue[]>([]);
  const [statusFilter, setStatusFilter] = useState<PaymentDueStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.paymentDues.list(statusFilter ? { status: statusFilter } : undefined).then(setRows).catch(() => {});
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (id: string, amount: number) => {
    setPayingId(id);
    setError(null);
    try {
      await api.paymentDues.markPaid(id, new Date().toISOString().slice(0, 10), amount);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la registrazione del pagamento");
    } finally {
      setPayingId(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-5xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Scadenzario</h1>

            <select
              className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as PaymentDueStatus | "")}
            >
              <option value="">Tutte le scadenze</option>
              <option value="PENDING">Da pagare</option>
              <option value="PAID">Pagate</option>
            </select>

            {error && <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">{error}</div>}

            <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
                    <th className="px-3 py-2.5">Scadenza</th><th className="px-3 py-2.5">Ordine</th>
                    <th className="px-3 py-2.5">Fornitore</th><th className="px-3 py-2.5">Rata</th>
                    <th className="px-3 py-2.5">Importo</th><th className="px-3 py-2.5">Stato</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isOverdue = r.status === "PENDING" && r.dueDate.slice(0, 10) < today;
                    return (
                      <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                        <td className={`px-3 py-2.5 ${isOverdue ? "text-accent-red font-medium" : ""}`}>
                          {new Date(r.dueDate).toLocaleDateString("it-IT")}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/acquisti/ordini/${r.purchaseOrderId}`} className="font-mono text-accent-primary hover:underline">
                            {r.purchaseOrder.poNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">{r.purchaseOrder.supplier.legalName}</td>
                        <td className="px-3 py-2.5">{r.installmentNumber}</td>
                        <td className="px-3 py-2.5">€ {r.amount.toFixed(2)}</td>
                        <td className="px-3 py-2.5">
                          {r.status === "PAID" ? (
                            <span className="text-accent-primary">Pagato{r.paidDate ? ` il ${new Date(r.paidDate).toLocaleDateString("it-IT")}` : ""}</span>
                          ) : isOverdue ? (
                            <span className="text-accent-red">Scaduta</span>
                          ) : (
                            <span className="text-zinc-500">Da pagare</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.status === "PENDING" && (
                            <button
                              onClick={() => handleMarkPaid(r.id, r.amount)}
                              disabled={payingId === r.id}
                              className="px-2.5 py-1 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 disabled:opacity-50 transition-colors"
                            >
                              Segna come pagato
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7} className="text-center text-zinc-600 py-8">Nessuna scadenza</td></tr>}
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

- [ ] **Step 4: Turn the sidebar placeholder into a real link**

In `frontend/src/components/layout/GlobalSidebar.tsx`, change:

```tsx
      { label: "Scadenzario", comingSoon: true },
```

to:

```tsx
      { href: "/acquisti/scadenzario", label: "Scadenzario" },
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the sidebar test**

Run: `cd frontend && npx vitest run src/components/layout/GlobalSidebar.test.tsx`
Expected: PASS — confirm no existing test asserted `Scadenzario` was `comingSoon`/disabled (if one does, that assertion needs updating to match the new real link, following the exact pattern already used for the "Ricezioni / DDT" sidebar fix earlier in this project's history).

- [ ] **Step 7: Manual verification**

Start both dev servers. Open `/acquisti/scadenzario` — confirm it loads (empty state if no dues exist yet, or real rows if a test order was completed earlier this session). If any `SupplierPaymentDue` rows exist from manual testing, confirm the "Segna come pagato" button works and the row updates to "Pagato" without a page reload.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api/payment-dues.ts frontend/src/lib/api/index.ts frontend/src/app/acquisti/scadenzario/page.tsx frontend/src/components/layout/GlobalSidebar.tsx
git commit -m "feat(purchasing): add Scadenzario page"
```

---

## Self-Review Notes

- Spec coverage: §2 (trigger/anchor) → Task 3; §3 (due-date algorithm, validated example) → Task 2's tests assert the exact example plus edge cases (December rollover, fixed-day-always-next-month); §4 (entity + components) → Tasks 1, 2, 3, 4, 5 map 1:1 to the design's component list; §5 (explicit non-goals: no Prima Nota link, no financialStatus change, no reminders, no partial payments) → none of these appear anywhere in the plan; §6 (risks: algorithm correctness, rounding, missing PaymentTerm) → Task 2's rounding-remainder test directly addresses the rounding risk, Task 3's tests confirm generation is scoped correctly, and `paymentTermId` being required on `PurchaseOrder` since FASE D means the "missing PaymentTerm" risk is structurally impossible (not tested separately, per the design's own §6 note).
- No placeholders: every step has complete, exact code.
- Type consistency checked: `PaymentTermForSchedule`/`ScheduledInstallment` (Task 2) match exactly how Task 3 constructs/consumes them (`order.paymentTerm` from the extended Prisma `include` has `endOfMonth`/`fixedDay`/`installments` — the same shape `PaymentTermForSchedule` expects structurally, since Prisma's generated type is a structural superset). `SupplierPaymentDueWithOrder`/`findAllPaymentDues`/`markPaymentDuePaid` (Task 4) match exactly what Task 4's routes call and what Task 5's frontend client types expect field-for-field (`dueDate`, `amount`, `status`, `paidDate`, `paidAmount`, `purchaseOrder.poNumber`, `purchaseOrder.supplier.legalName`).
