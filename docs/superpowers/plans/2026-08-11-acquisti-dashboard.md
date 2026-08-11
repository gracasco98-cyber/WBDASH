# Acquisti/Amministrazione Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the purchasing area a landing dashboard at `/acquisti` — KPI tiles, a status breakdown, an orders-over-time chart, a top-suppliers chart, a recent-orders table, and a quick-links hub — built from real `PurchaseOrder`/`Supplier` data, with `Prossimamente` placeholders for the two data sources that don't exist yet (Magazzino/FASE F, Fatture/FASE G). Also renames the sidebar's `ACQUISTI` group to `AMMINISTRAZIONE` and repositions it first in the nav (requested in the same session), and adds a `Panoramica` link to this new page.

**Architecture:** One new backend aggregation function (`getDashboardSummary`) behind one new route (`GET /api/purchasing/dashboard`), no new Prisma models. Frontend: one new API client module, three chart components (Recharts, following the dataviz skill's form/color rules — magnitude comparisons use a single hue, not a categorical rainbow), three supporting components, and the page itself. The existing `KpiCard` component (`frontend/src/components/dashboard/KpiCard.tsx`) is reused as-is for the three real KPI tiles.

**Tech Stack:** Same as the rest of WBDASH — Express + TypeScript + Prisma + PostgreSQL, Next.js 14 + Tailwind + Recharts, Vitest + Testcontainers for the backend.

**Design doc:** `docs/superpowers/specs/2026-08-11-acquisti-dashboard-design.md`

## Global Constraints

- No new Prisma models or migrations — this plan only reads existing `PurchaseOrder`, `PurchaseOrderLine`, `Supplier` data.
- Repo-layer rule (absolute): only `backend/src/repositories/**` calls Prisma directly.
- Company-wide (no `amazonAccountId`), same as the rest of the purchasing module.
- Reachable `PurchaseOrderLogisticStatus` values today are exactly 8: `DRAFT, SENT, CONFIRMED, IN_PRODUCTION, READY, PARTIALLY_SHIPPED, SHIPPED, CANCELLED` (per `backend/src/purchasing/purchase-order-state-machine.ts`) — the status breakdown always returns all 8, zero-padded, never a partial list.
- Chart color jobs (per the dataviz skill, already applied in the approved design): status breakdown and top-suppliers are magnitude comparisons → single hue each (`#6ee7b7` and `#60a5fa` respectively), not one color per bar. Orders-over-time is a single series → one hue (`#6ee7b7`), matching `frontend/src/components/dashboard/SalesChart.tsx`'s existing gradient-area style.
- Frontend verification is `tsc --noEmit` (no test suite exists for purchasing UI components in this codebase — established precedent, not introduced here).
- Backend verification is TDD with Testcontainers, matching every other purchasing repository/route in this codebase.
- Branch: `feature/acquisti-dashboard`, already created off `develop` and currently checked out — it already holds one commit (the design doc). Do not create a new branch.

---

### Task 0: Verify branch state

**Files:** none (verification only).

- [ ] **Step 1:** Confirm you're on the right branch with the design doc already committed:
```bash
cd ~/Developer/WBDASH
git status --short --branch
git log -1 --oneline
```
Expected: `## feature/acquisti-dashboard` and the last commit is `docs: add Acquisti/Amministrazione dashboard design spec`.

---

### Task 1: `dashboard.repo.ts` + repository tests

**Files:**
- Create: `backend/src/repositories/purchasing/dashboard.repo.ts`
- Test: `backend/tests/repositories/purchasing/dashboard.repo.test.ts`

**Interfaces:**
- Consumes: `PurchaseOrder`, `PurchaseOrderLine`, `Supplier` models (all pre-existing).
- Produces: `getDashboardSummary(prisma): Promise<DashboardSummary>` and the `DashboardSummary`/`StatusBreakdownEntry`/`OrdersOverTimePoint`/`TopSupplierEntry`/`RecentOrderEntry` types — used by Task 2's route.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/purchasing/dashboard.repo.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { getDashboardSummary } from "../../../src/repositories/purchasing/dashboard.repo";
import { createPurchaseOrder, transitionPurchaseOrderStatus } from "../../../src/repositories/purchasing/purchase-orders.repo";

let db: TestDb;
let warehouseId: string;
let paymentTermId: string;
let productId: string;
let userId: string;
let supplierAId: string;
let supplierBId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });

beforeEach(async () => {
  await truncateAll(db.prisma);
  supplierAId = (await db.prisma.supplier.create({
    data: { legalName: "Fornitore A", internalCode: "F-A", supplierType: "Produttore", country: "IT" },
  })).id;
  supplierBId = (await db.prisma.supplier.create({
    data: { legalName: "Fornitore B", internalCode: "F-B", supplierType: "Produttore", country: "IT", isActive: false },
  })).id;
  warehouseId = (await db.prisma.warehouse.create({ data: { name: "Magazzino", code: "MAG-1" } })).id;
  paymentTermId = (await db.prisma.paymentTerm.create({ data: { name: "30gg", type: "STANDARD", paymentMethod: "BONIFICO" } })).id;
  productId = (await db.prisma.product.create({ data: { name: "Widget" } })).id;
  userId = (await db.prisma.user.create({ data: { email: "buyer@example.com", passwordHash: "x", role: "user" } })).id;
});

function baseOrder(supplierId: string, unitPrice = 5) {
  const taxable = 10 * unitPrice;
  const vat = Math.round(taxable * 0.22 * 100) / 100;
  return {
    supplierId, orderDate: new Date(), currency: "EUR", buyerId: userId, warehouseId, paymentTermId,
    lines: [{
      productId, description: "Widget", orderedQty: 10, unitOfMeasure: "PZ", unitPrice,
      taxableAmount: taxable, vatAmount: vat, totalAmount: taxable + vat,
    }],
  };
}

describe("dashboard.repo", () => {
  it("counts only active suppliers", async () => {
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.activeSuppliers).toBe(1);
  });

  it("counts orders in progress and excludes CANCELLED, sums their value", async () => {
    const po1 = await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    const po2 = await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    await transitionPurchaseOrderStatus(db.prisma, po2.id, "CANCELLED", userId);
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.ordersInProgress).toBe(1);
    expect(summary.valueInProgress).toBe(61);
  });

  it("breaks down orders by logistic status, including zero-count statuses, always 8 entries", async () => {
    const po = await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    await transitionPurchaseOrderStatus(db.prisma, po.id, "SENT", userId);
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.statusBreakdown).toHaveLength(8);
    expect(summary.statusBreakdown.find(s => s.status === "SENT")?.count).toBe(1);
    expect(summary.statusBreakdown.find(s => s.status === "DRAFT")?.count).toBe(0);
    expect(summary.statusBreakdown.find(s => s.status === "CANCELLED")?.count).toBe(0);
  });

  it("returns a 30-day time series, zero-padded, with today's order counted", async () => {
    await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.ordersOverTime).toHaveLength(30);
    const total = summary.ordersOverTime.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(1);
    expect(summary.ordersOverTime[29].count).toBe(1);
  });

  it("ranks top suppliers by order value, descending", async () => {
    await createPurchaseOrder(db.prisma, baseOrder(supplierAId, 100));
    await createPurchaseOrder(db.prisma, baseOrder(supplierBId, 1));
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.topSuppliers[0].legalName).toBe("Fornitore A");
    expect(summary.topSuppliers[0].orderCount).toBe(1);
    expect(summary.topSuppliers[0].totalValue).toBeCloseTo(1220, 1);
    expect(summary.topSuppliers[1].legalName).toBe("Fornitore B");
  });

  it("lists recent orders newest first with a computed total value", async () => {
    await createPurchaseOrder(db.prisma, baseOrder(supplierAId));
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.recentOrders).toHaveLength(1);
    expect(summary.recentOrders[0].totalValue).toBe(61);
    expect(summary.recentOrders[0].supplierName).toBe("Fornitore A");
  });

  it("returns a fully-populated, empty-but-valid summary on an empty database", async () => {
    await truncateAll(db.prisma);
    const summary = await getDashboardSummary(db.prisma);
    expect(summary.ordersInProgress).toBe(0);
    expect(summary.valueInProgress).toBe(0);
    expect(summary.activeSuppliers).toBe(0);
    expect(summary.statusBreakdown).toHaveLength(8);
    expect(summary.ordersOverTime).toHaveLength(30);
    expect(summary.topSuppliers).toEqual([]);
    expect(summary.recentOrders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/repositories/purchasing/dashboard.repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/repositories/purchasing/dashboard.repo.ts`:
```ts
// repositories/purchasing/dashboard.repo.ts — Aggregate summary for the
// Acquisti/Amministrazione dashboard. Company-wide, no amazonAccountId.
// Read-only: no writes, safe to call as often as the frontend needs.
import type { PrismaClient, PurchaseOrderLogisticStatus } from "@prisma/client";

const REACHABLE_STATUSES: PurchaseOrderLogisticStatus[] = [
  "DRAFT", "SENT", "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED",
];

export interface StatusBreakdownEntry {
  status: PurchaseOrderLogisticStatus;
  count: number;
}

export interface OrdersOverTimePoint {
  date: string;
  count: number;
}

export interface TopSupplierEntry {
  supplierId: string;
  legalName: string;
  orderCount: number;
  totalValue: number;
}

export interface RecentOrderEntry {
  id: string;
  poNumber: string;
  supplierName: string;
  orderDate: Date;
  logisticStatus: PurchaseOrderLogisticStatus;
  totalValue: number;
}

export interface DashboardSummary {
  ordersInProgress: number;
  valueInProgress: number;
  activeSuppliers: number;
  statusBreakdown: StatusBreakdownEntry[];
  ordersOverTime: OrdersOverTimePoint[];
  topSuppliers: TopSupplierEntry[];
  recentOrders: RecentOrderEntry[];
}

export async function getDashboardSummary(prisma: PrismaClient): Promise<DashboardSummary> {
  const [
    ordersInProgress, valueAgg, activeSuppliers, statusGroups,
    timeSeriesRaw, topSuppliersRaw, recentOrdersRaw,
  ] = await Promise.all([
    prisma.purchaseOrder.count({ where: { logisticStatus: { not: "CANCELLED" } } }),
    prisma.purchaseOrderLine.aggregate({
      _sum: { totalAmount: true },
      where: { purchaseOrder: { logisticStatus: { not: "CANCELLED" } } },
    }),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.purchaseOrder.groupBy({ by: ["logisticStatus"], _count: { id: true } }),
    prisma.$queryRaw<{ date: string; count: number }[]>`
      SELECT TO_CHAR("orderDate", 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
      FROM "PurchaseOrder"
      WHERE "orderDate" >= NOW() - INTERVAL '30 days'
      GROUP BY TO_CHAR("orderDate", 'YYYY-MM-DD')
      ORDER BY date ASC
    `,
    prisma.$queryRaw<{ supplierId: string; legalName: string; orderCount: number; totalValue: number }[]>`
      SELECT s.id AS "supplierId", s."legalName" AS "legalName",
             COUNT(DISTINCT po.id)::int AS "orderCount",
             COALESCE(SUM(pol."totalAmount"), 0)::float AS "totalValue"
      FROM "Supplier" s
      JOIN "PurchaseOrder" po ON po."supplierId" = s.id
      JOIN "PurchaseOrderLine" pol ON pol."purchaseOrderId" = po.id
      GROUP BY s.id, s."legalName"
      ORDER BY "totalValue" DESC
      LIMIT 5
    `,
    prisma.purchaseOrder.findMany({
      take: 10,
      orderBy: { orderDate: "desc" },
      include: { supplier: { select: { legalName: true } }, lines: { select: { totalAmount: true } } },
    }),
  ]);

  const statusCounts = new Map(statusGroups.map((g) => [g.logisticStatus, g._count.id]));
  const statusBreakdown: StatusBreakdownEntry[] = REACHABLE_STATUSES.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }));

  const recentOrders: RecentOrderEntry[] = recentOrdersRaw.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplier.legalName,
    orderDate: po.orderDate,
    logisticStatus: po.logisticStatus,
    totalValue: po.lines.reduce((sum, l) => sum + Number(l.totalAmount), 0),
  }));

  return {
    ordersInProgress,
    valueInProgress: Number(valueAgg._sum.totalAmount ?? 0),
    activeSuppliers,
    statusBreakdown,
    ordersOverTime: padDailySeries(timeSeriesRaw, 30),
    topSuppliers: topSuppliersRaw,
    recentOrders,
  };
}

/** Fills every missing day in the last `days` days with count=0, so the chart is a continuous series, never sparse. */
function padDailySeries(raw: { date: string; count: number }[], days: number): OrdersOverTimePoint[] {
  const map = new Map(raw.map((r) => [r.date, r.count]));
  const result: OrdersOverTimePoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) ?? 0 });
  }
  return result;
}
```

- [ ] **Step 4: Run it and confirm it passes**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/repositories/purchasing/dashboard.repo.test.ts
```
Expected: PASS, 7/7.

- [ ] **Step 5: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
git add backend/src/repositories/purchasing/dashboard.repo.ts backend/tests/repositories/purchasing/dashboard.repo.test.ts
git commit -m "feat(purchasing): add dashboard summary repository"
```

---

### Task 2: `dashboard.routes.ts` + integration test + mount

**Files:**
- Create: `backend/src/purchasing/routes/dashboard.routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/integration/purchasing-dashboard.test.ts`

**Interfaces:**
- Consumes: `getDashboardSummary` (Task 1).
- Produces: `dashboardRouter` mounted at `/api/purchasing`, route `GET /dashboard` — used by Task 3's frontend API client.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/purchasing-dashboard.test.ts`:
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
  const { dashboardRouter } = await import("../../src/purchasing/routes/dashboard.routes");
  app = express();
  app.use(express.json());
  app.use("/api/purchasing", dashboardRouter);
}, 60_000);

afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("dashboard routes", () => {
  it("GET /dashboard returns a fully-populated summary on an empty database", async () => {
    const res = await request(app).get("/api/purchasing/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.ordersInProgress).toBe(0);
    expect(res.body.valueInProgress).toBe(0);
    expect(res.body.activeSuppliers).toBe(0);
    expect(res.body.statusBreakdown).toHaveLength(8);
    expect(res.body.ordersOverTime).toHaveLength(30);
    expect(res.body.topSuppliers).toEqual([]);
    expect(res.body.recentOrders).toEqual([]);
  });

  it("GET /dashboard reflects a real supplier", async () => {
    await db.prisma.supplier.create({
      data: { legalName: "Acme", internalCode: "F1", supplierType: "Produttore", country: "IT" },
    });
    const res = await request(app).get("/api/purchasing/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.activeSuppliers).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/integration/purchasing-dashboard.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `backend/src/purchasing/routes/dashboard.routes.ts`:
```ts
// purchasing/routes/dashboard.routes.ts — Acquisti/Amministrazione dashboard summary.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { getDashboardSummary } from "../../repositories/purchasing/dashboard.repo";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    res.json(await getDashboardSummary(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
```

- [ ] **Step 4: Mount the router in `backend/src/server.ts`**

Near the existing purchasing imports (around line 29-31):
```ts
import { dashboardRouter } from "./purchasing/routes/dashboard.routes";
```

Near the existing purchasing mounts (around line 153-155):
```ts
app.use("/api/purchasing", requireAuth, dashboardRouter);
```

- [ ] **Step 5: Run the test and confirm it passes**
```bash
cd ~/Developer/WBDASH/backend && npx vitest run tests/integration/purchasing-dashboard.test.ts
```
Expected: PASS, 2/2.

- [ ] **Step 6: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
git add backend/src/purchasing/routes/dashboard.routes.ts backend/src/server.ts backend/tests/integration/purchasing-dashboard.test.ts
git commit -m "feat(purchasing): add dashboard summary REST route"
```

---

### Task 3: Frontend API client

**Files:**
- Create: `frontend/src/lib/api/acquisti-dashboard.ts`
- Modify: `frontend/src/lib/api/index.ts`

**Interfaces:**
- Consumes: `GET /api/purchasing/dashboard` (Task 2), `LogisticStatus` type from `./purchase-orders`.
- Produces: `api.acquistiDashboard.get()` returning `DashboardSummary` — used by Tasks 4-6.

- [ ] **Step 1: Create `frontend/src/lib/api/acquisti-dashboard.ts`**
```ts
// lib/api/acquisti-dashboard.ts — Acquisti/Amministrazione dashboard summary.
import { get } from "./client";
import type { LogisticStatus } from "./purchase-orders";

export interface StatusBreakdownEntry { status: LogisticStatus; count: number }
export interface OrdersOverTimePoint { date: string; count: number }
export interface TopSupplierEntry { supplierId: string; legalName: string; orderCount: number; totalValue: number }
export interface RecentOrderEntry {
  id: string; poNumber: string; supplierName: string; orderDate: string;
  logisticStatus: LogisticStatus; totalValue: number;
}

export interface DashboardSummary {
  ordersInProgress: number;
  valueInProgress: number;
  activeSuppliers: number;
  statusBreakdown: StatusBreakdownEntry[];
  ordersOverTime: OrdersOverTimePoint[];
  topSuppliers: TopSupplierEntry[];
  recentOrders: RecentOrderEntry[];
}

export const acquistiDashboard = {
  get: () => get<DashboardSummary>("/api/purchasing/dashboard"),
};
```

- [ ] **Step 2: Register it in `frontend/src/lib/api/index.ts`**

Add to the imports block:
```ts
import { acquistiDashboard } from "./acquisti-dashboard";
```
Add inside the `api` object, under the `// ── Purchasing / master data ──` comment:
```ts
  acquistiDashboard,
```

- [ ] **Step 3: Typecheck**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/lib/api/acquisti-dashboard.ts frontend/src/lib/api/index.ts
git commit -m "feat(purchasing): add dashboard frontend API client"
```

---

### Task 4: Chart components

**Files:**
- Create: `frontend/src/components/purchasing/dashboard/StatusBreakdownChart.tsx`
- Create: `frontend/src/components/purchasing/dashboard/OrdersOverTimeChart.tsx`
- Create: `frontend/src/components/purchasing/dashboard/TopSuppliersChart.tsx`

**Interfaces:**
- Consumes: `StatusBreakdownEntry[]`, `OrdersOverTimePoint[]`, `TopSupplierEntry[]` (Task 3), `formatEUR` from `@/lib/marketplaces`.
- Produces: three chart components — used by Task 6's page.

- [ ] **Step 1: Create `frontend/src/components/purchasing/dashboard/StatusBreakdownChart.tsx`**

```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { StatusBreakdownEntry } from "@/lib/api/acquisti-dashboard";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito", CANCELLED: "Annullato",
};

interface Props { data: StatusBreakdownEntry[] }

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      <div className="text-white font-medium">{payload[0].value} ordini</div>
    </div>
  );
};

export default function StatusBreakdownChart({ data }: Props) {
  const chartData = data.map(d => ({ status: STATUS_LABEL[d.status] ?? d.status, count: d.count }));
  const isEmpty = data.every(d => d.count === 0);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3 sm:p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Ordini per stato</h2>
      {isEmpty ? (
        <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">Nessun ordine ancora</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="status" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(110,231,183,0.06)" }} />
            <Bar dataKey="count" fill="#6ee7b7" radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/purchasing/dashboard/OrdersOverTimeChart.tsx`**

```tsx
"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { OrdersOverTimePoint } from "@/lib/api/acquisti-dashboard";

interface Props { data: OrdersOverTimePoint[] }

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-400 mb-1">{formatDay(label)}</div>
      <div className="text-white font-medium">{payload[0].value} ordini</div>
    </div>
  );
};

export default function OrdersOverTimeChart({ data }: Props) {
  const isEmpty = data.every(d => d.count === 0);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3 sm:p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Ordini creati — ultimi 30 giorni</h2>
      {isEmpty ? (
        <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">Nessun ordine negli ultimi 30 giorni</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradOrdersOverTime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              interval="preserveStartEnd" tickFormatter={formatDay} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#2a2a3e", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="count" stroke="#6ee7b7" strokeWidth={2} fill="url(#gradOrdersOverTime)"
              dot={false} activeDot={{ r: 4, fill: "#6ee7b7", stroke: "#0a0a0f", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/components/purchasing/dashboard/TopSuppliersChart.tsx`**

```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatEUR } from "@/lib/marketplaces";
import type { TopSupplierEntry } from "@/lib/api/acquisti-dashboard";

interface Props { data: TopSupplierEntry[] }

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      <div className="text-white font-medium">{formatEUR(payload[0].value)}</div>
    </div>
  );
};

export default function TopSuppliersChart({ data }: Props) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3 sm:p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Top fornitori per valore ordini</h2>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">Nessun ordine ancora</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`} />
            <YAxis type="category" dataKey="legalName" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(96,165,250,0.06)" }} />
            <Bar dataKey="totalValue" fill="#60a5fa" radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/components/purchasing/dashboard/StatusBreakdownChart.tsx frontend/src/components/purchasing/dashboard/OrdersOverTimeChart.tsx frontend/src/components/purchasing/dashboard/TopSuppliersChart.tsx
git commit -m "feat(purchasing): add dashboard chart components"
```

---

### Task 5: Supporting components

**Files:**
- Create: `frontend/src/components/purchasing/dashboard/ComingSoonKpiTile.tsx`
- Create: `frontend/src/components/purchasing/dashboard/RecentOrdersTable.tsx`
- Create: `frontend/src/components/purchasing/dashboard/WorkAreasHub.tsx`

**Interfaces:**
- Consumes: `RecentOrderEntry[]` (Task 3), `LogisticStatus` type from `@/lib/api/purchase-orders`, `formatEUR` from `@/lib/marketplaces`.
- Produces: three components — used by Task 6's page.

- [ ] **Step 1: Create `frontend/src/components/purchasing/dashboard/ComingSoonKpiTile.tsx`**

```tsx
interface Props { label: string; note: string }

export default function ComingSoonKpiTile({ label, note }: Props) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3 sm:p-4 opacity-60">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <span className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-zinc-500">{label}</span>
        <span className="text-[9px] uppercase tracking-wide text-zinc-700 border border-zinc-800 rounded px-1 py-0.5 shrink-0">Prossimamente</span>
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-zinc-700">—</div>
      <div className="text-xs text-zinc-600 mt-1">{note}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/purchasing/dashboard/RecentOrdersTable.tsx`**

```tsx
"use client";
import Link from "next/link";
import { formatEUR } from "@/lib/marketplaces";
import type { RecentOrderEntry } from "@/lib/api/acquisti-dashboard";
import type { LogisticStatus } from "@/lib/api/purchase-orders";

const STATUS_LABEL: Record<LogisticStatus, string> = {
  DRAFT: "Bozza", SENT: "Inviato", CONFIRMED: "Confermato", IN_PRODUCTION: "In produzione",
  READY: "Pronto", PARTIALLY_SHIPPED: "Parz. spedito", SHIPPED: "Spedito",
  PARTIALLY_RECEIVED: "Parz. ricevuto", RECEIVED: "Ricevuto", COMPLETED: "Completato", CANCELLED: "Annullato",
};

interface Props { orders: RecentOrderEntry[] }

export default function RecentOrdersTable({ orders }: Props) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <h2 className="text-sm font-semibold text-white px-4 py-3 border-b border-bg-border">Ultimi ordini</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
            <th className="px-3 py-2.5">Numero</th><th className="px-3 py-2.5">Fornitore</th>
            <th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Stato</th><th className="px-3 py-2.5">Totale</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
              <td className="px-3 py-2.5">
                <Link href={`/acquisti/ordini/${o.id}`} className="font-mono text-accent-primary hover:underline">{o.poNumber}</Link>
              </td>
              <td className="px-3 py-2.5">{o.supplierName}</td>
              <td className="px-3 py-2.5">{new Date(o.orderDate).toLocaleDateString("it-IT")}</td>
              <td className="px-3 py-2.5">{STATUS_LABEL[o.logisticStatus]}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatEUR(o.totalValue)}</td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun ordine ancora</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/components/purchasing/dashboard/WorkAreasHub.tsx`**

```tsx
"use client";
import Link from "next/link";
import { Truck, ShoppingCart, Boxes, Landmark, CalendarClock } from "lucide-react";

const AREAS = [
  { href: "/acquisti/fornitori", label: "Fornitori", icon: Truck },
  { href: "/acquisti/ordini", label: "Ordini Fornitore", icon: ShoppingCart },
  { href: "/acquisti/magazzini", label: "Magazzini", icon: Boxes },
  { href: "/acquisti/banche", label: "Banche", icon: Landmark },
  { href: "/acquisti/condizioni-pagamento", label: "Condizioni pagamento", icon: CalendarClock },
];

export default function WorkAreasHub() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {AREAS.map(a => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-bg-border bg-bg-card p-4 text-center hover:border-accent-primary/30 hover:bg-bg-hover transition-colors"
          >
            <Icon size={20} className="text-accent-primary" />
            <span className="text-xs text-zinc-300 font-medium">{a.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/components/purchasing/dashboard/ComingSoonKpiTile.tsx frontend/src/components/purchasing/dashboard/RecentOrdersTable.tsx frontend/src/components/purchasing/dashboard/WorkAreasHub.tsx
git commit -m "feat(purchasing): add dashboard supporting components"
```

---

### Task 6: `/acquisti` dashboard page

**Files:**
- Create: `frontend/src/app/acquisti/page.tsx`

**Interfaces:**
- Consumes: `api.acquistiDashboard.get()` (Task 3), `KpiCard` (pre-existing, `@/components/dashboard/KpiCard`), all six components from Tasks 4-5.

- [ ] **Step 1: Implement**

Create `frontend/src/app/acquisti/page.tsx`:
```tsx
"use client";
import { useState, useEffect } from "react";
import { ClipboardList, Euro, Truck } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import KpiCard from "@/components/dashboard/KpiCard";
import ComingSoonKpiTile from "@/components/purchasing/dashboard/ComingSoonKpiTile";
import StatusBreakdownChart from "@/components/purchasing/dashboard/StatusBreakdownChart";
import OrdersOverTimeChart from "@/components/purchasing/dashboard/OrdersOverTimeChart";
import TopSuppliersChart from "@/components/purchasing/dashboard/TopSuppliersChart";
import RecentOrdersTable from "@/components/purchasing/dashboard/RecentOrdersTable";
import WorkAreasHub from "@/components/purchasing/dashboard/WorkAreasHub";
import { api } from "@/lib/api";
import { formatEUR } from "@/lib/marketplaces";
import type { DashboardSummary } from "@/lib/api/acquisti-dashboard";

export default function AcquistiDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.acquistiDashboard.get().then(setSummary).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-6">
            <h1 className="text-lg sm:text-xl font-bold text-white">Amministrazione — Panoramica</h1>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Ordini in corso" icon={<ClipboardList size={14} />} accent="green" loading={loading}
                value={summary ? String(summary.ordersInProgress) : "—"}
              />
              <KpiCard
                label="Valore ordini in corso" icon={<Euro size={14} />} accent="blue" loading={loading}
                value={summary ? formatEUR(summary.valueInProgress) : "—"}
              />
              <KpiCard
                label="Fornitori attivi" icon={<Truck size={14} />} accent="purple" loading={loading}
                value={summary ? String(summary.activeSuppliers) : "—"}
              />
              <ComingSoonKpiTile label="Magazzino" note="Arriva con FASE F" />
              <ComingSoonKpiTile label="Fatture da riconciliare" note="Arriva con FASE G" />
            </div>

            {summary && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <StatusBreakdownChart data={summary.statusBreakdown} />
                  <TopSuppliersChart data={summary.topSuppliers} />
                </div>
                <OrdersOverTimeChart data={summary.ordersOverTime} />
                <RecentOrdersTable orders={summary.recentOrders} />
              </>
            )}

            <div>
              <h2 className="text-sm font-semibold text-white mb-3">Aree di lavoro</h2>
              <WorkAreasHub />
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
git add frontend/src/app/acquisti/page.tsx
git commit -m "feat(purchasing): add /acquisti dashboard page"
```

---

### Task 7: Sidebar — rename ACQUISTI → AMMINISTRAZIONE, reposition first, add Panoramica

**Files:**
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx`
- Modify: `frontend/src/components/layout/GlobalSidebar.test.tsx`

**Interfaces:**
- Consumes: `/acquisti` (Task 6, the new page this links to).
- Produces: updated `GROUPS` array — the group formerly at index 2 (`acquisti`) becomes index 0 (`amministrazione`), with a new first item.

- [ ] **Step 1: Move and rename the group in `GROUPS`**

In `frontend/src/components/layout/GlobalSidebar.tsx`, remove the group currently between `inventory` and `marketing`:
```tsx
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
and insert this renamed version as the **first** entry of the `GROUPS` array (before the `finance` group):
```tsx
  {
    key: "amministrazione", label: "AMMINISTRAZIONE", icon: ShoppingBag,
    items: [
      { href: "/acquisti", label: "Panoramica" },
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
so `GROUPS` reads, in order: `amministrazione, finance, inventory, marketing, supporto, admin`.

- [ ] **Step 2: Update `openGroups` initial state**

Change:
```tsx
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    finance: true, inventory: true, acquisti: true, marketing: true, supporto: true, admin: true,
  });
```
to:
```tsx
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    amministrazione: true, finance: true, inventory: true, marketing: true, supporto: true, admin: true,
  });
```

- [ ] **Step 3: Fix the stale comment and add coverage in `GlobalSidebar.test.tsx`**

The existing comment (added when "Ordini Fornitore" first collided with the top-level "Ordini" link) says "INVENTORY group's" — it was already stale before this task (that link has lived in the ACQUISTI/soon-AMMINISTRAZIONE group, never INVENTORY, since the nav-reorg branch). Fix it while touching this file:

Change:
```tsx
    // Exact match (not /ordini/i) — the INVENTORY group's "Ordini Fornitore"
    // link also contains "Ordini" as a substring, so a case-insensitive
    // substring regex matches both this top-level link and that one.
    expect(screen.getByRole("link", { name: "Ordini" })).toHaveAttribute("href", "/ordini");
```
to:
```tsx
    // Exact match (not /ordini/i) — the AMMINISTRAZIONE group's "Ordini
    // Fornitore" link also contains "Ordini" as a substring, so a
    // case-insensitive substring regex matches both this top-level link and
    // that one.
    expect(screen.getByRole("link", { name: "Ordini" })).toHaveAttribute("href", "/ordini");
```

Add a new test case, after the existing `"renders the FINANCE, INVENTORY, MARKETING, SUPPORTO, ADMIN group headers"` test:
```tsx
  it("renders the AMMINISTRAZIONE group with a Panoramica link to /acquisti", () => {
    render(<GlobalSidebar />);
    expect(screen.getByText("AMMINISTRAZIONE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panoramica" })).toHaveAttribute("href", "/acquisti");
  });
```

- [ ] **Step 4: Run the test suite and confirm it passes**
```bash
cd ~/Developer/WBDASH/frontend && npx vitest run src/components/layout/GlobalSidebar.test.tsx
```
Expected: PASS, 6/6.

- [ ] **Step 5: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/components/layout/GlobalSidebar.tsx frontend/src/components/layout/GlobalSidebar.test.tsx
git commit -m "feat(purchasing): rename ACQUISTI to AMMINISTRAZIONE, move it first, add Panoramica link"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend test suite for this module, run individually to avoid Testcontainers contention**
```bash
cd ~/Developer/WBDASH/backend
for f in tests/repositories/purchasing/dashboard.repo.test.ts tests/integration/purchasing-dashboard.test.ts; do
  npx vitest run "$f"
done
```
Expected: both green.

- [ ] **Step 2: Typecheck both apps**
```bash
cd ~/Developer/WBDASH/backend && npx tsc --noEmit
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
```
Expected: no errors in either.

- [ ] **Step 3: Frontend sidebar test**
```bash
cd ~/Developer/WBDASH/frontend && npx vitest run src/components/layout/GlobalSidebar.test.tsx
```
Expected: PASS, 6/6.

- [ ] **Step 4: Manual browser verification**

With both dev servers running (`docker start wbdash-dev-postgres`, then `npm run dev` in `backend/` and `frontend/`):
1. Sidebar shows "AMMINISTRAZIONE" as the first group, right after Dashboard/Ordini, before FINANCE.
2. Click "Panoramica" → `/acquisti` loads the new dashboard.
3. KPI tiles show real numbers for Ordini in corso / Valore ordini in corso / Fornitori attivi (matching what's actually in the dev DB), and "Prossimamente" tiles for Magazzino / Fatture da riconciliare.
4. Status breakdown chart, orders-over-time chart, and top-suppliers chart render (or show their empty-state message if the dev DB has little data).
5. Recent orders table lists real orders with working links to their detail pages.
6. "Aree di lavoro" hub links to Fornitori/Ordini/Magazzini/Banche/Condizioni pagamento all work.
7. Confirm the rest of the sidebar (FINANCE, INVENTORY, MARKETING, SUPPORTO, ADMIN) is otherwise unchanged.

- [ ] **Step 5: Final commit if Step 4 surfaced any fixes**

If manual verification found an issue, fix it, re-run the relevant automated tests, and commit the fix separately with a `fix(purchasing): ...` message.

---

## After this plan

Once merged, the third and final agreed piece of work — brainstormed fresh, not assumed from here — is the visual/color redesign across the whole app, including the lightness-band finding on the existing accent palette noted in the design doc (§3.2).
