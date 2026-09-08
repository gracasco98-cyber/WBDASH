# Fatture Fornitore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual supplier-invoice registry (Fatture Fornitore) to the Acquisti module: register invoices received from suppliers, optionally link one to a purchase order, keep `PurchaseOrder.financialStatus` in sync, and activate the sidebar entry that has been "Prossimamente" since it was added.

**Architecture:** Follows the existing purchasing-module pattern exactly (`goods-receipts.repo.ts` / `payment-dues.repo.ts` as the closest analogs): a new Prisma model + migration, a repository file under `backend/src/repositories/purchasing/`, a routes file under `backend/src/purchasing/routes/` mounted on `/api/purchasing`, a typed frontend API client under `frontend/src/lib/api/`, and three Next.js pages (list / new / detail) under `frontend/src/app/acquisti/fatture/`.

**Tech Stack:** Express + TypeScript, Prisma/PostgreSQL, Vitest + Testcontainers + Supertest (backend), Next.js 14 + Vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-09-08-fatture-fornitore-design.md`

## Global Constraints

- All monetary fields are `Decimal(14,4)` in Postgres, never `Float` (CLAUDE.md §13). The shared `prisma` client (`backend/src/db.ts`) converts every `Decimal` to a plain JS `number` on the way out (`convertDecimalsDeep`) — repository code reads/writes plain numbers, never `Prisma.Decimal` instances directly.
- Only `backend/src/repositories/**` may call Prisma directly — routes call repository functions, never `prisma.*` themselves (CLAUDE.md, "Regola assoluta").
- No hard deletes of financial documents — a `SupplierInvoice` is voided (`voidedAt` timestamp), never `DELETE`d (CLAUDE.md §11/§16).
- `createdById` on any write is always `req.user!.id` from the authenticated session, never a client-supplied field (matches `buyerId` in `purchase-orders.routes.ts`).
- No SDI/Agenzia delle Entrate integration in this phase — `SupplierInvoiceSource.SDI` exists in the enum only as a placeholder for later.
- No changes to `SupplierPaymentDue`/scadenzario generation (still driven by `createGoodsReceipt()`) and no changes to the "Fatture da riconciliare" `ComingSoonKpiTile` in `acquisti/page.tsx` (different phase, FASE M).
- Schema changes require a committed migration (`prisma migrate dev`, never bare `db push` for anything landing on `develop`/`main`) — Task 1 produces one.

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration folder via `prisma migrate dev --name add_supplier_invoices`

**Interfaces:**
- Produces: `SupplierInvoice` model, `SupplierInvoiceSource` enum (`MANUAL | SDI`) — Task 2's repository imports both from `@prisma/client`.

- [ ] **Step 1: Add the `SupplierInvoiceSource` enum and `SupplierInvoice` model**

Insert immediately after the `PurchaseOrderStatusHistory` model (which currently ends right before `model Supplier {`... actually it sits earlier in the file; the exact anchor is the closing brace of `PurchaseOrderStatusHistory`, shown below). Find this exact block:

```prisma
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
  @@index([changedById])
}
```

Append this new block directly after its closing `}`:

```prisma

enum SupplierInvoiceSource {
  MANUAL
  SDI // riservato per la futura integrazione Agenzia delle Entrate/SDI — non usato in questa fase
}

// Registro fatture fornitore (FASE G). Nessuna cancellazione reale: si
// annulla (voidedAt), mai DELETE — documento fiscale, storico da conservare.
model SupplierInvoice {
  id              String                @id @default(cuid())
  invoiceNumber   String
  supplierId      String
  supplier        Supplier              @relation(fields: [supplierId], references: [id])
  purchaseOrderId String?
  purchaseOrder   PurchaseOrder?        @relation(fields: [purchaseOrderId], references: [id])
  invoiceDate     DateTime
  receivedDate    DateTime              @default(now())
  taxableAmount   Decimal               @db.Decimal(14, 4)
  vatAmount       Decimal               @db.Decimal(14, 4)
  totalAmount     Decimal               @db.Decimal(14, 4)
  currency        String                @default("EUR")
  source          SupplierInvoiceSource @default(MANUAL)
  notes           String?
  voidedAt        DateTime?
  createdById     String
  createdBy       User                  @relation(fields: [createdById], references: [id])
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@unique([supplierId, invoiceNumber])
  @@index([supplierId])
  @@index([purchaseOrderId])
}
```

- [ ] **Step 2: Add the back-relation on `Supplier`**

Find (inside `model Supplier`):

```prisma
  contacts       SupplierContact[]
  products       SupplierProduct[]
  purchaseOrders PurchaseOrder[]

  @@index([isActive])
  @@index([vatNumber])
}
```

Replace with:

```prisma
  contacts         SupplierContact[]
  products         SupplierProduct[]
  purchaseOrders   PurchaseOrder[]
  supplierInvoices SupplierInvoice[]

  @@index([isActive])
  @@index([vatNumber])
}
```

- [ ] **Step 3: Add the back-relation on `PurchaseOrder`**

Find (inside `model PurchaseOrder`):

```prisma
  lines         PurchaseOrderLine[]
  statusHistory PurchaseOrderStatusHistory[]
  goodsReceipts GoodsReceipt[]
  paymentDues   SupplierPaymentDue[]

  @@index([supplierId])
```

Replace with:

```prisma
  lines            PurchaseOrderLine[]
  statusHistory    PurchaseOrderStatusHistory[]
  goodsReceipts    GoodsReceipt[]
  paymentDues      SupplierPaymentDue[]
  supplierInvoices SupplierInvoice[]

  @@index([supplierId])
```

- [ ] **Step 4: Add the back-relation on `User`**

Find (inside `model User`):

```prisma
  purchaseOrdersAsBuyer      PurchaseOrder[]
  purchaseOrderStatusChanges PurchaseOrderStatusHistory[]
  goodsReceiptsReceived      GoodsReceipt[]
```

Replace with:

```prisma
  purchaseOrdersAsBuyer      PurchaseOrder[]
  purchaseOrderStatusChanges PurchaseOrderStatusHistory[]
  goodsReceiptsReceived      GoodsReceipt[]
  supplierInvoicesCreated    SupplierInvoice[]
```

- [ ] **Step 5: Also drop the now-stale "not reachable yet" comments**

Find:

```prisma
enum PurchaseOrderFinancialStatus {
  OPEN
  PARTIALLY_INVOICED // not reachable yet — FASE G (supplier invoices)
  INVOICED // not reachable yet — FASE G
  PARTIALLY_PAID // not reachable yet — FASE M (payment reconciliation)
  PAID // not reachable yet — FASE M
}
```

Replace with:

```prisma
enum PurchaseOrderFinancialStatus {
  OPEN
  PARTIALLY_INVOICED
  INVOICED
  PARTIALLY_PAID // not reachable yet — FASE M (payment reconciliation)
  PAID // not reachable yet — FASE M
}
```

- [ ] **Step 6: Generate and apply the migration**

Run: `cd backend && npx prisma migrate dev --name add_supplier_invoices`

Expected: a new folder under `backend/prisma/migrations/<timestamp>_add_supplier_invoices/migration.sql`, Prisma Client regenerated, no errors. This also runs against your local dev database — if it fails because the dev DB is unreachable, that's an environment problem to fix before continuing, not a plan defect.

- [ ] **Step 7: Verify schema compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors introduced by this change (pre-existing unrelated errors, if any, are not this task's concern).

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(acquisti): add SupplierInvoice model and migration"
```

---

### Task 2: Repository layer + repo tests

**Files:**
- Create: `backend/src/repositories/purchasing/supplier-invoices.repo.ts`
- Test: `backend/tests/repositories/purchasing/supplier-invoices.repo.test.ts`

**Interfaces:**
- Consumes: `PurchaseOrderFinancialStatus`, `SupplierInvoiceSource` from `@prisma/client` (Task 1).
- Produces: `createSupplierInvoice(prisma, input, createdById)`, `findAllSupplierInvoices(prisma, filters?)`, `findSupplierInvoiceById(prisma, id)`, `voidSupplierInvoice(prisma, id)`, and the exported types `CreateSupplierInvoiceInput`, `SupplierInvoiceWithRelations` — Task 3's routes import all of these by exact name.

- [ ] **Step 1: Write the failing repo tests**

Create `backend/tests/repositories/purchasing/supplier-invoices.repo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  createSupplierInvoice,
  findAllSupplierInvoices,
  findSupplierInvoiceById,
  voidSupplierInvoice,
} from "../../../src/repositories/purchasing/supplier-invoices.repo";

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
      lines: { create: [{ productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ", unitPrice: 10, taxableAmount: 100, vatAmount: 22, totalAmount: 122 }] },
    },
  });
  poId = po.id;
});

describe("supplier-invoices.repo", () => {
  it("createSupplierInvoice without a purchaseOrderId leaves the order's financialStatus untouched (there is no order)", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-001", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    expect(invoice.purchaseOrderId).toBeNull();
    expect(invoice.source).toBe("MANUAL");
    expect(invoice.voidedAt).toBeNull();
  });

  it("createSupplierInvoice with a purchaseOrderId covering less than the order total sets PARTIALLY_INVOICED", async () => {
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-002", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("PARTIALLY_INVOICED");
  });

  it("a second invoice that brings the total to the order's full value sets INVOICED", async () => {
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-003", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-004", invoiceDate: new Date("2026-03-06"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("INVOICED");
  });

  it("voidSupplierInvoice sets voidedAt and recomputes the linked order back down", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-005", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 100, vatAmount: 22, totalAmount: 122,
    }, userId);
    let po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("INVOICED");

    const voided = await voidSupplierInvoice(db.prisma, invoice.id);
    expect(voided.voidedAt).not.toBeNull();
    po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("OPEN");
  });

  it("voidSupplierInvoice is a no-op when the invoice is already voided", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-006", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    const firstVoid = await voidSupplierInvoice(db.prisma, invoice.id);
    const secondVoid = await voidSupplierInvoice(db.prisma, invoice.id);
    expect(secondVoid.voidedAt).toEqual(firstVoid.voidedAt);
  });

  it("createSupplierInvoice does not overwrite a financialStatus outside FASE G scope (PARTIALLY_PAID/PAID)", async () => {
    await db.prisma.purchaseOrder.update({ where: { id: poId }, data: { financialStatus: "PAID" } });
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-007", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("PAID");
  });

  it("findAllSupplierInvoices excludes voided invoices by default and includes them with includeVoided", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-008", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);
    await voidSupplierInvoice(db.prisma, invoice.id);
    await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-009", invoiceDate: new Date("2026-03-06"),
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    }, userId);

    expect(await findAllSupplierInvoices(db.prisma)).toHaveLength(1);
    expect(await findAllSupplierInvoices(db.prisma, { includeVoided: true })).toHaveLength(2);
  });

  it("findAllSupplierInvoices filters by supplierId and purchaseOrderId, ordered by invoiceDate desc", async () => {
    const otherSupplier = await db.prisma.supplier.create({
      data: { legalName: "Other Srl", internalCode: "FORN-002", supplierType: "Produttore", country: "IT" },
    });
    await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-010", invoiceDate: new Date("2026-03-01"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);
    await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-011", invoiceDate: new Date("2026-03-10"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);
    await createSupplierInvoice(db.prisma, {
      supplierId: otherSupplier.id, invoiceNumber: "FT-012", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);

    const bySupplier = await findAllSupplierInvoices(db.prisma, { supplierId });
    expect(bySupplier).toHaveLength(2);
    expect(bySupplier[0].invoiceNumber).toBe("FT-011"); // most recent invoiceDate first

    const byOrder = await findAllSupplierInvoices(db.prisma, { purchaseOrderId: poId });
    expect(byOrder).toHaveLength(1);
    expect(byOrder[0].invoiceNumber).toBe("FT-010");
  });

  it("findSupplierInvoiceById returns the invoice with supplier and order joined, or throws on unknown id", async () => {
    const invoice = await createSupplierInvoice(db.prisma, {
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-013", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);
    const found = await findSupplierInvoiceById(db.prisma, invoice.id);
    expect(found.supplier.legalName).toBe("Acme Supply Srl");
    expect(found.purchaseOrder?.poNumber).toBe("PO-2026-000001");

    await expect(findSupplierInvoiceById(db.prisma, "does-not-exist")).rejects.toThrow();
  });

  it("createSupplierInvoice rejects a duplicate (supplierId, invoiceNumber) pair", async () => {
    await createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-014", invoiceDate: new Date("2026-03-05"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId);
    await expect(createSupplierInvoice(db.prisma, {
      supplierId, invoiceNumber: "FT-014", invoiceDate: new Date("2026-03-06"),
      taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    }, userId)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run tests/repositories/purchasing/supplier-invoices.repo.test.ts`
Expected: FAIL — `Cannot find module '../../../src/repositories/purchasing/supplier-invoices.repo'`.

- [ ] **Step 3: Write the repository**

Create `backend/src/repositories/purchasing/supplier-invoices.repo.ts`:

```typescript
// repositories/purchasing/supplier-invoices.repo.ts — FASE G: manual supplier
// invoice registry. Optionally linked to one PurchaseOrder, whose
// financialStatus this file keeps in sync (OPEN/PARTIALLY_INVOICED/INVOICED
// only — PARTIALLY_PAID/PAID belong to FASE M and are never touched here).
import type { PrismaClient, SupplierInvoice, SupplierInvoiceSource, PurchaseOrderFinancialStatus } from "@prisma/client";

export type SupplierInvoiceWithRelations = SupplierInvoice & {
  supplier: { id: string; legalName: string };
  purchaseOrder: { id: string; poNumber: string } | null;
};

export interface CreateSupplierInvoiceInput {
  supplierId: string;
  purchaseOrderId?: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  receivedDate?: Date;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  currency?: string;
  source?: SupplierInvoiceSource;
  notes?: string | null;
}

const FASE_G_STATUSES: PurchaseOrderFinancialStatus[] = ["OPEN", "PARTIALLY_INVOICED", "INVOICED"];

/** Recomputes and writes financialStatus for one purchase order, comparing
 *  its lines' total against its non-voided invoices' total. No-op if the
 *  order's current status is outside FASE G scope (PARTIALLY_PAID/PAID —
 *  FASE M territory, never overwritten by this phase). */
async function syncPurchaseOrderFinancialStatus(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  purchaseOrderId: string
): Promise<void> {
  const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId }, select: { financialStatus: true } });
  if (!FASE_G_STATUSES.includes(order.financialStatus)) return;

  const [linesAgg, invoicesAgg] = await Promise.all([
    tx.purchaseOrderLine.aggregate({ _sum: { totalAmount: true }, where: { purchaseOrderId } }),
    tx.supplierInvoice.aggregate({ _sum: { totalAmount: true }, where: { purchaseOrderId, voidedAt: null } }),
  ]);
  const orderTotal = Number(linesAgg._sum.totalAmount ?? 0);
  const invoicedTotal = Number(invoicesAgg._sum.totalAmount ?? 0);

  const next: PurchaseOrderFinancialStatus =
    invoicedTotal <= 0 ? "OPEN" : invoicedTotal >= orderTotal ? "INVOICED" : "PARTIALLY_INVOICED";

  if (next !== order.financialStatus) {
    await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { financialStatus: next } });
  }
}

export async function createSupplierInvoice(
  prisma: PrismaClient,
  input: CreateSupplierInvoiceInput,
  createdById: string
): Promise<SupplierInvoiceWithRelations> {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.supplierInvoice.create({
      data: {
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        receivedDate: input.receivedDate ?? new Date(),
        taxableAmount: input.taxableAmount,
        vatAmount: input.vatAmount,
        totalAmount: input.totalAmount,
        currency: input.currency ?? "EUR",
        source: input.source ?? "MANUAL",
        notes: input.notes ?? null,
        createdById,
      },
      include: {
        supplier: { select: { id: true, legalName: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
      },
    });
    if (invoice.purchaseOrderId) {
      await syncPurchaseOrderFinancialStatus(tx, invoice.purchaseOrderId);
    }
    return invoice;
  });
}

export async function voidSupplierInvoice(prisma: PrismaClient, id: string): Promise<SupplierInvoiceWithRelations> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.supplierInvoice.findUniqueOrThrow({ where: { id } });
    if (current.voidedAt) {
      return tx.supplierInvoice.findUniqueOrThrow({
        where: { id },
        include: { supplier: { select: { id: true, legalName: true } }, purchaseOrder: { select: { id: true, poNumber: true } } },
      });
    }
    const voided = await tx.supplierInvoice.update({
      where: { id },
      data: { voidedAt: new Date() },
      include: { supplier: { select: { id: true, legalName: true } }, purchaseOrder: { select: { id: true, poNumber: true } } },
    });
    if (voided.purchaseOrderId) {
      await syncPurchaseOrderFinancialStatus(tx, voided.purchaseOrderId);
    }
    return voided;
  });
}

export async function findAllSupplierInvoices(
  prisma: PrismaClient,
  filters?: { supplierId?: string; purchaseOrderId?: string; includeVoided?: boolean }
): Promise<SupplierInvoiceWithRelations[]> {
  return prisma.supplierInvoice.findMany({
    where: {
      supplierId: filters?.supplierId,
      purchaseOrderId: filters?.purchaseOrderId,
      voidedAt: filters?.includeVoided ? undefined : null,
    },
    include: {
      supplier: { select: { id: true, legalName: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });
}

export async function findSupplierInvoiceById(prisma: PrismaClient, id: string): Promise<SupplierInvoiceWithRelations> {
  return prisma.supplierInvoice.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: { select: { id: true, legalName: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/repositories/purchasing/supplier-invoices.repo.test.ts`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/purchasing/supplier-invoices.repo.ts backend/tests/repositories/purchasing/supplier-invoices.repo.test.ts
git commit -m "feat(acquisti): add supplier-invoices repository"
```

---

### Task 3: Routes + mount + integration tests

**Files:**
- Create: `backend/src/purchasing/routes/supplier-invoices.routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/integration/purchasing-supplier-invoices.test.ts`

**Interfaces:**
- Consumes: `createSupplierInvoice`, `findAllSupplierInvoices`, `findSupplierInvoiceById`, `voidSupplierInvoice`, `CreateSupplierInvoiceInput` from Task 2.
- Produces: `supplierInvoicesRouter` (Express `Router`) exposing `GET /supplier-invoices`, `GET /supplier-invoices/:id`, `POST /supplier-invoices`, `POST /supplier-invoices/:id/void` under the `/api/purchasing` prefix — Task 4's frontend client calls these exact paths.

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/integration/purchasing-supplier-invoices.test.ts`:

```typescript
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
let userId: string;
let poId: string;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  const { supplierInvoicesRouter } = await import("../../src/purchasing/routes/supplier-invoices.routes");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId, role: "user" }; next(); });
  app.use("/api/purchasing", supplierInvoicesRouter);
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
  userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;

  const po = await db.prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-000001",
      supplierId, orderDate: new Date("2026-08-08"), currency: "EUR",
      logisticStatus: "CONFIRMED",
      buyerId: userId, warehouseId, paymentTermId,
      lines: {
        create: [{
          productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ",
          unitPrice: 5, taxableAmount: 50, vatAmount: 11, totalAmount: 61,
        }],
      },
    },
  });
  poId = po.id;
});

describe("supplier-invoices routes", () => {
  it("POST /supplier-invoices with a valid body returns 201 and updates the linked order's financialStatus", async () => {
    const res = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-001", invoiceDate: "2026-08-10",
      taxableAmount: 50, vatAmount: 11, totalAmount: 61,
    });
    expect(res.status).toBe(201);
    expect(res.body.invoiceNumber).toBe("FT-001");

    const po = await db.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.financialStatus).toBe("INVOICED");
  });

  it("POST /supplier-invoices with missing required fields returns 400", async () => {
    const res = await request(app).post("/api/purchasing/supplier-invoices").send({ supplierId });
    expect(res.status).toBe(400);
  });

  it("POST /supplier-invoices with a duplicate (supplierId, invoiceNumber) returns 409", async () => {
    await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-002", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    const res = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-002", invoiceDate: "2026-08-11", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    expect(res.status).toBe(409);
  });

  it("GET /supplier-invoices with no filters returns 200 and excludes voided invoices", async () => {
    const created = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-003", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    await request(app).post(`/api/purchasing/supplier-invoices/${created.body.id}/void`);

    const res = await request(app).get("/api/purchasing/supplier-invoices");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("GET /supplier-invoices?includeVoided=true includes voided invoices", async () => {
    const created = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-004", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    await request(app).post(`/api/purchasing/supplier-invoices/${created.body.id}/void`);

    const res = await request(app).get("/api/purchasing/supplier-invoices").query({ includeVoided: "true" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /supplier-invoices?supplierId=X filters by supplier", async () => {
    await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-005", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    const res = await request(app).get("/api/purchasing/supplier-invoices").query({ supplierId });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /supplier-invoices/:id returns 200 with supplier/order joined, 404 on unknown id", async () => {
    const created = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, purchaseOrderId: poId, invoiceNumber: "FT-006", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    const res = await request(app).get(`/api/purchasing/supplier-invoices/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.supplier.legalName).toBe("Acme");
    expect(res.body.purchaseOrder.poNumber).toBe("PO-2026-000001");

    const notFound = await request(app).get("/api/purchasing/supplier-invoices/does-not-exist");
    expect(notFound.status).toBe(404);
  });

  it("POST /supplier-invoices/:id/void returns 200 with voidedAt set, 404 on unknown id", async () => {
    const created = await request(app).post("/api/purchasing/supplier-invoices").send({
      supplierId, invoiceNumber: "FT-007", invoiceDate: "2026-08-10", taxableAmount: 10, vatAmount: 2, totalAmount: 12,
    });
    const res = await request(app).post(`/api/purchasing/supplier-invoices/${created.body.id}/void`);
    expect(res.status).toBe(200);
    expect(res.body.voidedAt).not.toBeNull();

    const notFound = await request(app).post("/api/purchasing/supplier-invoices/does-not-exist/void");
    expect(notFound.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run tests/integration/purchasing-supplier-invoices.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the routes**

Create `backend/src/purchasing/routes/supplier-invoices.routes.ts`:

```typescript
// purchasing/routes/supplier-invoices.routes.ts — FASE G: list/create/void
// supplier invoices. See repositories/purchasing/supplier-invoices.repo.ts
// for the financialStatus side effect on the linked order.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  createSupplierInvoice,
  findAllSupplierInvoices,
  findSupplierInvoiceById,
  voidSupplierInvoice,
} from "../../repositories/purchasing/supplier-invoices.repo";

export const supplierInvoicesRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}
function duplicate(err: unknown): boolean {
  return (err as any)?.code === "P2002";
}

supplierInvoicesRouter.get("/supplier-invoices", async (req: Request, res: Response) => {
  try {
    const { supplierId, purchaseOrderId, includeVoided } = req.query as Record<string, string>;
    const invoices = await findAllSupplierInvoices(prisma, {
      supplierId: supplierId || undefined,
      purchaseOrderId: purchaseOrderId || undefined,
      includeVoided: includeVoided === "true",
    });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

supplierInvoicesRouter.get("/supplier-invoices/:id", async (req: Request, res: Response) => {
  try {
    const invoice = await findSupplierInvoiceById(prisma, req.params.id);
    res.json(invoice);
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Fattura non trovata" });
    res.status(500).json({ error: String(err) });
  }
});

supplierInvoicesRouter.post("/supplier-invoices", async (req: Request, res: Response) => {
  try {
    const { supplierId, purchaseOrderId, invoiceNumber, invoiceDate, taxableAmount, vatAmount, totalAmount, notes } = req.body ?? {};
    if (!supplierId || !invoiceNumber || !invoiceDate || taxableAmount === undefined || vatAmount === undefined || totalAmount === undefined) {
      return res.status(400).json({ error: "supplierId, invoiceNumber, invoiceDate, taxableAmount, vatAmount, totalAmount sono richiesti" });
    }
    const invoice = await createSupplierInvoice(prisma, {
      supplierId,
      purchaseOrderId: purchaseOrderId || null,
      invoiceNumber,
      invoiceDate: new Date(invoiceDate),
      taxableAmount: Number(taxableAmount),
      vatAmount: Number(vatAmount),
      totalAmount: Number(totalAmount),
      notes: notes || null,
    }, req.user!.id);
    res.status(201).json(invoice);
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ error: "Esiste già una fattura con questo numero per questo fornitore" });
    res.status(500).json({ error: String(err) });
  }
});

supplierInvoicesRouter.post("/supplier-invoices/:id/void", async (req: Request, res: Response) => {
  try {
    const invoice = await voidSupplierInvoice(prisma, req.params.id);
    res.json(invoice);
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Fattura non trovata" });
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Mount the router in `server.ts`**

Find:

```typescript
import { paymentDuesRouter } from "./purchasing/routes/payment-dues.routes";
```

Replace with:

```typescript
import { paymentDuesRouter } from "./purchasing/routes/payment-dues.routes";
import { supplierInvoicesRouter } from "./purchasing/routes/supplier-invoices.routes";
```

Find:

```typescript
app.use("/api/purchasing", requireAuth, paymentDuesRouter);
```

Replace with:

```typescript
app.use("/api/purchasing", requireAuth, paymentDuesRouter);
app.use("/api/purchasing", requireAuth, supplierInvoicesRouter);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/integration/purchasing-supplier-invoices.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/src/purchasing/routes/supplier-invoices.routes.ts backend/src/server.ts backend/tests/integration/purchasing-supplier-invoices.test.ts
git commit -m "feat(acquisti): add supplier-invoices routes, mount on /api/purchasing"
```

---

### Task 4: Frontend API client

**Files:**
- Create: `frontend/src/lib/api/supplier-invoices.ts`
- Modify: `frontend/src/lib/api/index.ts`

**Interfaces:**
- Produces: `api.supplierInvoices.{list, get, create, void}`, exported types `SupplierInvoice`, `CreateSupplierInvoiceInput` — Tasks 5-7's pages import these.

- [ ] **Step 1: Write the client**

Create `frontend/src/lib/api/supplier-invoices.ts`:

```typescript
// lib/api/supplier-invoices.ts — Fatture Fornitore (FASE G): manual
// supplier-invoice registry, optionally linked to a purchase order.
import { apiUrl, get } from "./client";

export type SupplierInvoiceSource = "MANUAL" | "SDI";

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  purchaseOrderId: string | null;
  invoiceDate: string;
  receivedDate: string;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  source: SupplierInvoiceSource;
  notes: string | null;
  voidedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; legalName: string };
  purchaseOrder: { id: string; poNumber: string } | null;
}

export interface CreateSupplierInvoiceInput {
  supplierId: string;
  purchaseOrderId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  notes?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export const supplierInvoices = {
  list: (filters?: { supplierId?: string; purchaseOrderId?: string; includeVoided?: boolean }) =>
    get<SupplierInvoice[]>("/api/purchasing/supplier-invoices", {
      ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters?.purchaseOrderId ? { purchaseOrderId: filters.purchaseOrderId } : {}),
      ...(filters?.includeVoided ? { includeVoided: "true" } : {}),
    }),
  get: (id: string) => get<SupplierInvoice>(`/api/purchasing/supplier-invoices/${id}`),
  create: (data: CreateSupplierInvoiceInput) => post<SupplierInvoice>("/api/purchasing/supplier-invoices", data),
  void: (id: string) => post<SupplierInvoice>(`/api/purchasing/supplier-invoices/${id}/void`, {}),
};
```

- [ ] **Step 2: Wire it into `index.ts`**

Find:

```typescript
import { tasks } from "./tasks";
import { board } from "./board";
```

Replace with:

```typescript
import { tasks } from "./tasks";
import { board } from "./board";
import { supplierInvoices } from "./supplier-invoices";
```

Find:

```typescript
  // ── Bacheca / Task Manager ────────────────────────────────────────────────
  tasks,
  board,
```

Replace with:

```typescript
  // ── Bacheca / Task Manager ────────────────────────────────────────────────
  tasks,
  board,

  // ── Acquisti / Fatture Fornitore ──────────────────────────────────────────
  supplierInvoices,
```

Also find the `export type { Task, ... }` line group and add the new types alongside them:

```typescript
export type { Task, TaskStatus, AssignableUser } from "./tasks";
export type { BoardWidget } from "./board";
```

Replace with:

```typescript
export type { Task, TaskStatus, AssignableUser } from "./tasks";
export type { BoardWidget } from "./board";
export type { SupplierInvoice, SupplierInvoiceSource, CreateSupplierInvoiceInput } from "./supplier-invoices";
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/supplier-invoices.ts frontend/src/lib/api/index.ts
git commit -m "feat(acquisti): add supplierInvoices frontend API client"
```

---

### Task 5: List page

**Files:**
- Create: `frontend/src/app/acquisti/fatture/page.tsx`
- Test: `frontend/src/app/acquisti/fatture/page.test.tsx`

**Interfaces:**
- Consumes: `api.supplierInvoices.list`, `api.supplierInvoices.void`, `SupplierInvoice` type (Task 4).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/acquisti/fatture/page.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FatturePage from "./page";
import type { SupplierInvoice } from "@/lib/api/supplier-invoices";

const mockList = vi.fn(async (_filters?: unknown) => [] as SupplierInvoice[]);
const mockVoid = vi.fn(async (_id: string) => ({} as SupplierInvoice));

vi.mock("@/lib/api", () => ({
  api: {
    supplierInvoices: {
      list: (filters?: unknown) => mockList(filters),
      void: (id: string) => mockVoid(id),
    },
  },
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));

const baseInvoice: SupplierInvoice = {
  id: "inv-1", invoiceNumber: "FT-001", supplierId: "s1", purchaseOrderId: "po-1",
  invoiceDate: "2026-08-10", receivedDate: "2026-08-10", taxableAmount: 100, vatAmount: 22, totalAmount: 122,
  currency: "EUR", source: "MANUAL", notes: null, voidedAt: null, createdById: "u1",
  createdAt: "2026-08-10", updatedAt: "2026-08-10",
  supplier: { id: "s1", legalName: "Acme Supply Srl" },
  purchaseOrder: { id: "po-1", poNumber: "PO-2026-000001" },
};

describe("FatturePage", () => {
  beforeEach(() => {
    mockList.mockClear();
    mockVoid.mockClear();
    mockList.mockResolvedValue([baseInvoice]);
    mockVoid.mockResolvedValue({ ...baseInvoice, voidedAt: "2026-08-11" });
  });

  it("renders one row per invoice with supplier, order and amount", async () => {
    render(<FatturePage />);
    expect(await screen.findByText("FT-001")).toBeInTheDocument();
    expect(screen.getByText("Acme Supply Srl")).toBeInTheDocument();
    expect(screen.getByText("PO-2026-000001")).toBeInTheDocument();
  });

  it("shows an empty state when there are no invoices", async () => {
    mockList.mockResolvedValue([]);
    render(<FatturePage />);
    expect(await screen.findByText(/nessuna fattura/i)).toBeInTheDocument();
  });

  it("voids an invoice and reloads the list", async () => {
    const user = userEvent.setup();
    render(<FatturePage />);
    await screen.findByText("FT-001");

    await user.click(screen.getByRole("button", { name: /annulla/i }));

    expect(mockVoid).toHaveBeenCalledWith("inv-1");
    expect(mockList).toHaveBeenCalledTimes(2); // initial load + reload after void
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/app/acquisti/fatture/page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the page**

Create `frontend/src/app/acquisti/fatture/page.tsx`:

```typescript
"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ReceiptText, Plus } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { SupplierInvoice } from "@/lib/api/supplier-invoices";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" });

export default function FatturePage() {
  const [rows, setRows] = useState<SupplierInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.supplierInvoices.list().then(setRows).catch(() => setError("Impossibile caricare le fatture"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleVoid = async (id: string) => {
    if (!window.confirm("Annullare questa fattura? L'operazione non è reversibile dall'interfaccia.")) return;
    setVoidingId(id);
    setError(null);
    try {
      await api.supplierInvoices.void(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'annullamento");
    } finally {
      setVoidingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-4">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText size={20} className="text-emerald-600" />
                  <h1 className="text-2xl font-bold tracking-tight">Fatture Fornitore</h1>
                </div>
                <p className="text-sm text-slate-500 mt-1">Registro delle fatture ricevute dai fornitori</p>
              </div>
              <Link
                href="/acquisti/fatture/nuovo"
                className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 w-fit"
              >
                <Plus size={15} /> Nuova fattura
              </Link>
            </header>

            {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider">
                      <th className="px-3 py-2.5">Numero</th><th className="px-3 py-2.5">Data</th>
                      <th className="px-3 py-2.5">Fornitore</th><th className="px-3 py-2.5">Ordine</th>
                      <th className="px-3 py-2.5">Totale</th><th className="px-3 py-2.5">Stato</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(inv => (
                      <tr key={inv.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/40">
                        <td className="px-3 py-2.5 font-mono">
                          <Link href={`/acquisti/fatture/${inv.id}`} className="text-emerald-700 hover:underline">{inv.invoiceNumber}</Link>
                        </td>
                        <td className="px-3 py-2.5">{dateFmt.format(new Date(inv.invoiceDate))}</td>
                        <td className="px-3 py-2.5">{inv.supplier.legalName}</td>
                        <td className="px-3 py-2.5">
                          {inv.purchaseOrder ? (
                            <Link href={`/acquisti/ordini/${inv.purchaseOrder.id}`} className="font-mono text-emerald-700 hover:underline">
                              {inv.purchaseOrder.poNumber}
                            </Link>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">{eur.format(inv.totalAmount)}</td>
                        <td className="px-3 py-2.5">
                          {inv.voidedAt ? (
                            <span className="rounded-full bg-rose-50 text-rose-700 px-2 py-1 text-[10px] font-semibold">Annullata</span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[10px] font-semibold">Attiva</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!inv.voidedAt && (
                            <button
                              onClick={() => handleVoid(inv.id)}
                              disabled={voidingId === inv.id}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium hover:bg-rose-100 disabled:opacity-50 transition-colors"
                            >
                              Annulla
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-slate-400 py-8">Nessuna fattura registrata</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/app/acquisti/fatture/page.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/acquisti/fatture/page.tsx frontend/src/app/acquisti/fatture/page.test.tsx
git commit -m "feat(acquisti): add Fatture Fornitore list page"
```

---

### Task 6: Create form page

**Files:**
- Create: `frontend/src/app/acquisti/fatture/nuovo/page.tsx`
- Test: `frontend/src/app/acquisti/fatture/nuovo/page.test.tsx`

**Interfaces:**
- Consumes: `api.suppliers.list`, `api.purchaseOrders.list`, `api.supplierInvoices.create` (Task 4 + existing clients).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/acquisti/fatture/nuovo/page.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NuovaFatturaPage from "./page";

const mockPush = vi.fn();
const mockSuppliersList = vi.fn(async () => [{ id: "s1", legalName: "Acme Supply Srl" }]);
const mockOrdersList = vi.fn(async (_filters?: unknown) => [{ id: "po-1", poNumber: "PO-2026-000001" }]);
const mockCreate = vi.fn(async (_data: unknown) => ({ id: "inv-1" }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/lib/api", () => ({
  api: {
    suppliers: { list: () => mockSuppliersList() },
    purchaseOrders: { list: (filters?: unknown) => mockOrdersList(filters) },
    supplierInvoices: { create: (data: unknown) => mockCreate(data) },
  },
}));

describe("NuovaFatturaPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSuppliersList.mockClear();
    mockOrdersList.mockClear();
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({ id: "inv-1" });
  });

  it("loads suppliers and lets the user fill the form", async () => {
    render(<NuovaFatturaPage />);
    expect(await screen.findByText("Acme Supply Srl")).toBeInTheDocument();
  });

  it("auto-computes totalAmount from taxableAmount + vatAmount", async () => {
    const user = userEvent.setup();
    render(<NuovaFatturaPage />);
    await screen.findByText("Acme Supply Srl");

    await user.selectOptions(screen.getByLabelText(/fornitore/i), "s1");
    await user.type(screen.getByLabelText(/numero fattura/i), "FT-001");
    await user.type(screen.getByLabelText(/imponibile/i), "100");
    await user.type(screen.getByLabelText(/^iva/i), "22");

    expect(screen.getByLabelText(/totale/i)).toHaveValue(122);
  });

  it("submits the form and redirects to the list on success", async () => {
    const user = userEvent.setup();
    render(<NuovaFatturaPage />);
    await screen.findByText("Acme Supply Srl");

    await user.selectOptions(screen.getByLabelText(/fornitore/i), "s1");
    await user.type(screen.getByLabelText(/numero fattura/i), "FT-001");
    await user.type(screen.getByLabelText(/data fattura/i), "2026-08-10");
    await user.type(screen.getByLabelText(/imponibile/i), "100");
    await user.type(screen.getByLabelText(/^iva/i), "22");
    await user.click(screen.getByRole("button", { name: /salva/i }));

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      supplierId: "s1", invoiceNumber: "FT-001", taxableAmount: 100, vatAmount: 22, totalAmount: 122,
    }));
    expect(mockPush).toHaveBeenCalledWith("/acquisti/fatture");
  });

  it("loads the supplier's purchase orders when a supplier is selected", async () => {
    const user = userEvent.setup();
    render(<NuovaFatturaPage />);
    await screen.findByText("Acme Supply Srl");

    await user.selectOptions(screen.getByLabelText(/fornitore/i), "s1");

    expect(await screen.findByText("PO-2026-000001")).toBeInTheDocument();
    expect(mockOrdersList).toHaveBeenCalledWith({ supplierId: "s1" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/app/acquisti/fatture/nuovo/page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the page**

Create `frontend/src/app/acquisti/fatture/nuovo/page.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/api/suppliers";
import type { PurchaseOrder } from "@/lib/api/purchase-orders";

const inputClass = "bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-400";

export default function NuovaFatturaPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxableAmount, setTaxableAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.suppliers.list().then(setSuppliers).catch(() => setLoadError("Impossibile caricare i fornitori. Ricarica la pagina e riprova."));
  }, []);

  useEffect(() => {
    setPurchaseOrderId("");
    if (!supplierId) { setOrders([]); return; }
    api.purchaseOrders.list({ supplierId }).then(setOrders).catch(() => setOrders([]));
  }, [supplierId]);

  const totalAmount = (Number(taxableAmount) || 0) + (Number(vatAmount) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.supplierInvoices.create({
        supplierId,
        purchaseOrderId: purchaseOrderId || undefined,
        invoiceNumber,
        invoiceDate,
        taxableAmount: Number(taxableAmount) || 0,
        vatAmount: Number(vatAmount) || 0,
        totalAmount,
        notes: notes || undefined,
      });
      router.push("/acquisti/fatture");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-2xl mx-auto px-4 md:px-6 py-5 space-y-4">
            <h1 className="text-2xl font-bold tracking-tight">Nuova Fattura Fornitore</h1>
            {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{loadError}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Fornitore *
                    <select required id="supplierId" className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.legalName}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Ordine collegato (opzionale)
                    <select id="purchaseOrderId" className={inputClass} value={purchaseOrderId} onChange={e => setPurchaseOrderId(e.target.value)} disabled={!supplierId}>
                      <option value="">— nessuno —</option>
                      {orders.map(o => <option key={o.id} value={o.id}>{o.poNumber}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Numero fattura *
                    <input required id="invoiceNumber" className={inputClass} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Data fattura *
                    <input required id="invoiceDate" type="date" className={inputClass} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Imponibile *
                    <input required id="taxableAmount" type="number" min="0" step="0.01" className={inputClass} value={taxableAmount} onChange={e => setTaxableAmount(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    IVA *
                    <input required id="vatAmount" type="number" min="0" step="0.01" className={inputClass} value={vatAmount} onChange={e => setVatAmount(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-500 flex flex-col gap-1">
                    Totale
                    <input id="totalAmount" type="number" className={inputClass} value={totalAmount} readOnly disabled />
                  </label>
                </div>
                <label className="text-xs text-slate-500 flex flex-col gap-1">
                  Note
                  <textarea id="notes" className={inputClass} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
                </label>
              </div>

              {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? "Salvataggio…" : "Salva fattura"}
              </button>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
```

Note: the `<label>` elements wrap their `<input>`/`<select>` directly (no explicit `htmlFor`/`id` pairing needed for `getByLabelText` to work — but each control also carries a matching `id` above for robustness and to keep the association unambiguous when labels are styled apart from their control later).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/app/acquisti/fatture/nuovo/page.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/acquisti/fatture/nuovo/page.tsx frontend/src/app/acquisti/fatture/nuovo/page.test.tsx
git commit -m "feat(acquisti): add Fatture Fornitore create form"
```

---

### Task 7: Detail page

**Files:**
- Create: `frontend/src/app/acquisti/fatture/[id]/page.tsx`
- Test: `frontend/src/app/acquisti/fatture/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `api.supplierInvoices.get`, `api.supplierInvoices.void` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/acquisti/fatture/[id]/page.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FatturaDetailPage from "./page";
import type { SupplierInvoice } from "@/lib/api/supplier-invoices";

const mockGet = vi.fn(async (_id: string) => baseInvoice);
const mockVoid = vi.fn(async (_id: string) => ({ ...baseInvoice, voidedAt: "2026-08-11" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "inv-1" }) }));
vi.mock("@/lib/api", () => ({
  api: { supplierInvoices: { get: (id: string) => mockGet(id), void: (id: string) => mockVoid(id) } },
}));

const baseInvoice: SupplierInvoice = {
  id: "inv-1", invoiceNumber: "FT-001", supplierId: "s1", purchaseOrderId: "po-1",
  invoiceDate: "2026-08-10", receivedDate: "2026-08-10", taxableAmount: 100, vatAmount: 22, totalAmount: 122,
  currency: "EUR", source: "MANUAL", notes: "Nota di test", voidedAt: null, createdById: "u1",
  createdAt: "2026-08-10", updatedAt: "2026-08-10",
  supplier: { id: "s1", legalName: "Acme Supply Srl" },
  purchaseOrder: { id: "po-1", poNumber: "PO-2026-000001" },
};

describe("FatturaDetailPage", () => {
  beforeEach(() => {
    mockGet.mockClear();
    mockVoid.mockClear();
    mockGet.mockResolvedValue(baseInvoice);
    mockVoid.mockResolvedValue({ ...baseInvoice, voidedAt: "2026-08-11" });
  });

  it("shows the invoice details", async () => {
    render(<FatturaDetailPage />);
    expect(await screen.findByText("FT-001")).toBeInTheDocument();
    expect(screen.getByText("Acme Supply Srl")).toBeInTheDocument();
    expect(screen.getByText("Nota di test")).toBeInTheDocument();
  });

  it("shows an 'Annulla fattura' action for an active invoice, hides it once voided", async () => {
    const user = userEvent.setup();
    render(<FatturaDetailPage />);
    await screen.findByText("FT-001");

    const button = screen.getByRole("button", { name: /annulla fattura/i });
    await user.click(button);

    expect(mockVoid).toHaveBeenCalledWith("inv-1");
    expect(await screen.findByText(/annullata/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /annulla fattura/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run "src/app/acquisti/fatture/[id]/page.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the page**

Create `frontend/src/app/acquisti/fatture/[id]/page.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { SupplierInvoice } from "@/lib/api/supplier-invoices";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" });

export default function FatturaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<SupplierInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);

  const load = () => { api.supplierInvoices.get(id).then(setInvoice).catch(() => setError("Impossibile caricare la fattura")); };
  useEffect(() => { load(); }, [id]);

  const handleVoid = async () => {
    if (!window.confirm("Annullare questa fattura? L'operazione non è reversibile dall'interfaccia.")) return;
    setVoiding(true);
    setError(null);
    try {
      const updated = await api.supplierInvoices.void(id);
      setInvoice(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'annullamento");
    } finally {
      setVoiding(false);
    }
  };

  if (!invoice) {
    return (
      <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
        <AppHeader accentColor="primary" />
        <div className="flex"><GlobalSidebar /><main className="flex-1 min-w-0 p-6 text-sm text-slate-500">{error ?? "Caricamento…"}</main></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Fattura Fornitore</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
                <p className="mt-1 text-sm text-slate-500">{invoice.supplier.legalName}</p>
              </div>
              {invoice.voidedAt ? (
                <span className="rounded-full bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-semibold">Annullata</span>
              ) : (
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-semibold">Attiva</span>
              )}
            </div>

            {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[10px] uppercase text-slate-500">Data fattura</p><p className="mt-1 text-sm">{dateFmt.format(new Date(invoice.invoiceDate))}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500">Ricevuta il</p><p className="mt-1 text-sm">{dateFmt.format(new Date(invoice.receivedDate))}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500">Imponibile</p><p className="mt-1 text-sm font-mono">{eur.format(invoice.taxableAmount)}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500">IVA</p><p className="mt-1 text-sm font-mono">{eur.format(invoice.vatAmount)}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500">Totale</p><p className="mt-1 text-sm font-mono font-bold">{eur.format(invoice.totalAmount)}</p></div>
                <div>
                  <p className="text-[10px] uppercase text-slate-500">Ordine collegato</p>
                  {invoice.purchaseOrder ? (
                    <Link href={`/acquisti/ordini/${invoice.purchaseOrder.id}`} className="mt-1 block text-sm font-mono text-emerald-700 hover:underline">
                      {invoice.purchaseOrder.poNumber}
                    </Link>
                  ) : <p className="mt-1 text-sm text-slate-400">—</p>}
                </div>
              </div>
              {invoice.notes && (
                <div><p className="text-[10px] uppercase text-slate-500">Note</p><p className="mt-1 text-sm">{invoice.notes}</p></div>
              )}
            </section>

            {!invoice.voidedAt && (
              <button
                onClick={handleVoid}
                disabled={voiding}
                className="px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 disabled:opacity-50 transition-colors"
              >
                {voiding ? "Annullamento…" : "Annulla fattura"}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run "src/app/acquisti/fatture/[id]/page.test.tsx"`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/acquisti/fatture/[id]/page.tsx" "frontend/src/app/acquisti/fatture/[id]/page.test.tsx"
git commit -m "feat(acquisti): add Fatture Fornitore detail page with void action"
```

---

### Task 8: Activate the sidebar entry

**Files:**
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx`

**Interfaces:**
- Consumes: nothing new — this is the final visibility switch for Tasks 5-7's pages.

- [ ] **Step 1: Replace the coming-soon entry**

Find:

```typescript
      { label: "Fatture Fornitore", comingSoon: true },
```

Replace with:

```typescript
      { href: "/acquisti/fatture", label: "Fatture Fornitore" },
```

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, no regressions (including any existing `GlobalSidebar.test.tsx`, if one exists — check for it first and skip this expectation only if none does).

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual smoke check**

Start the dev servers (or use the existing local/staging environment) and click through: Sidebar → "Fatture Fornitore" → list loads → "Nuova fattura" → pick a supplier → pick an order → save → redirected to list → open the new row → "Annulla fattura" → confirm → status flips to "Annullata".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/GlobalSidebar.tsx
git commit -m "feat(acquisti): activate Fatture Fornitore nav entry"
```

---

## Self-Review Notes

- **Spec coverage**: every section of `2026-09-08-fatture-fornitore-design.md` maps to a task — §3 model → Task 1, §4 financialStatus sync → Task 2, §5 components → Tasks 2-8, §6 risks (P2002 race, double-void, unique constraint) → covered in Task 2/3 tests, §7 test plan → Tasks 2/3/5/6/7.
- **Out-of-scope guard**: Task 2's repo includes a test proving `financialStatus` outside `OPEN/PARTIALLY_INVOICED/INVOICED` (i.e. a future FASE M `PAID`) is never overwritten — this wasn't explicit in the spec's field list but follows directly from §4's own wording and closes a real latent bug (a stray invoice write silently reverting a paid order to `INVOICED`).
- **Type consistency checked**: `SupplierInvoice` (frontend, Task 4) field names match `SupplierInvoiceWithRelations` (backend, Task 2) exactly; `CreateSupplierInvoiceInput` shape matches between Task 4's client and Task 3's route body parsing; `api.supplierInvoices.*` method names match every call site used in Tasks 5-7.
