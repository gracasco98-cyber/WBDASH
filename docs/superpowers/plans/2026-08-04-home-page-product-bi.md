# Home Page Product BI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two Critical bugs and one pre-existing data bug the prior plan's final review found, then relocate `PeriodTiles`/`ProductsPerformanceTable` from the abandoned `/prodotti` route onto the home page's existing "BUSINESS INTELLIGENCE"/"PRODOTTI" sections (replacing `SellerboardKpiCards`/`CrossChannelProducts`), with the approved visual refinements (5 tiles, blue/teal palette, product thumbnails, estimated-data disclosure).

**Architecture:** No changes to the Product entity data layer (`Product`/`ProductIdentifier` schema, `resolveProductPerformance`, the route's core shape) — all already implemented and reviewed on this same branch. This plan adds a small new synced table for per-ASIN ad spend (replacing a synchronous Amazon API call in the request path with a background job + repo read), extends the two frontend components already built, and rewires `frontend/src/app/page.tsx` instead of a standalone route.

**Tech Stack:** Express + TypeScript + Prisma (backend), Next.js 14 + Tailwind (frontend), Vitest + Testcontainers (backend tests), Vitest + React Testing Library (frontend tests).

## Global Constraints

- Repository layer only accesses Prisma — routes/services never call `PrismaClient` directly.
- No economic number is ever estimated/allocated without a real data source — where there's no source, the field is `null`/absent, never a computed guess.
- All monetary amounts use `Decimal` in the schema, converted to `number` at the repository boundary via `toNum()`.
- Every repository function takes `prisma: PrismaClient` as its first parameter and is scoped to `getCurrentAccountId()` where the underlying data is account-scoped (the new ad-spend snapshot table is; `Product`/`ProductIdentifier` deliberately are not, per the existing design).
- No Prisma migration lands without being generated via `prisma migrate dev --name <name>`.
- Route/service files ≤400 LOC, React components ≤300 LOC, repo/service files ≤500 LOC.
- `ProductPerformanceRow`/`ProductPerformanceGroup` field names and nullability must stay identical between `backend/src/repositories/amazon/product-performance.repo.ts` and `frontend/src/lib/api/types.ts` at every task — this plan's Task 5 changes both together, on purpose, to avoid the exact cross-task drift the prior plan's Task 9 review caught (`identifierId` was added to the backend interface without ever reaching the frontend).

---

## File Structure

**Backend — new files:**
- `backend/prisma/migrations/<timestamp>_add_advertised_product_snapshot/migration.sql` — generated
- `backend/tests/repositories/amazon/ad-spend.repo.test.ts`
- `backend/tests/routes/products-performance-period-filter.routes.test.ts`

**Backend — modified files:**
- `backend/src/repositories/amazon/cogs.repo.ts` — fix `findCogsForAsins` marketplace="all" bug
- `backend/src/amazon/routes/products-performance.routes.ts` — fix period filter bug; read ads from the new synced table instead of a live API call
- `backend/prisma/schema.prisma` — add `AmazonAdvertisedProductSnapshot`
- `backend/src/repositories/amazon/ad-spend.repo.ts` — **new file**: `upsertAdvertisedProductSnapshot`, `findAdSpendForAsins`
- `backend/src/amazon/ads-sync.service.ts` — add `syncAdvertisedProductDaily`
- `backend/src/amazon/sync.job.ts` — schedule the new sync job
- `backend/src/repositories/amazon/product-performance.repo.ts` — add `hasRealCogs` field
- `backend/tests/repositories/amazon/product-performance.repo.test.ts` — extend for `hasRealCogs`
- `backend/tests/repositories/amazon/cogs.repo.test.ts` — extend for the marketplace="all" fix
- `backend/tests/routes/products-performance.routes.test.ts` — extend for the ads-from-snapshot change

**Frontend — modified files:**
- `frontend/src/lib/api/types.ts` — add `hasRealCogs`
- `frontend/src/components/products/PeriodTiles.tsx` — 5 tiles, blue/teal palette, local-timezone date fix, `hasRealCogs`
- `frontend/src/components/products/PeriodTiles.test.tsx`
- `frontend/src/components/products/ProductsPerformanceTable.tsx` — product thumbnails, teal accents, `hasRealCogs` badge, error handling on rename/move
- `frontend/src/components/products/ProductsPerformanceTable.test.tsx`
- `frontend/src/app/page.tsx` — replace `SellerboardKpiCards`→`PeriodTiles`, `CrossChannelProducts`→`ProductsPerformanceTable`
- `frontend/src/app/page.test.tsx` — extend for the swap (create if it doesn't exist — check first)
- `frontend/src/components/layout/GlobalSidebar.tsx` — remove "Prodotti" entry
- `frontend/src/components/layout/GlobalSidebar.test.tsx` — remove the corresponding assertion

**Frontend — deleted files:**
- `frontend/src/app/prodotti/page.tsx`
- `frontend/src/app/prodotti/page.test.tsx`

---

### Task 1: Fix `findCogsForAsins` marketplace="all" bug

**Files:**
- Modify: `backend/src/repositories/amazon/cogs.repo.ts:47-62`
- Test: `backend/tests/repositories/amazon/cogs.repo.test.ts` (extend existing file — check its current imports/setup first, add a new `describe` block)

**Interfaces:**
- Produces: `findCogsForAsins(prisma, { asins, marketplace? })` — same signature, corrected behavior: when `marketplace` is `"all"` or omitted, returns COGS rows for **every** marketplace (plus `"ALL"` fallback rows) instead of hardcoding `"IT"`.

Today, `backend/src/repositories/amazon/cogs.repo.ts:56-58` reads:

```typescript
      OR: (marketplace && marketplace !== "all")
        ? [{ marketplace }, { marketplace: "ALL" }]
        : [{ marketplace: "IT" }, { marketplace: "ALL" }],
```

This means when the global marketplace filter is "all", DE/FR/ES-specific COGS rows never reach any caller — including `resolveProductPerformance`'s marketplace-priority lookup (already fixed in a prior task to prefer the exact marketplace over `"ALL"`, but that fix is useless if this function never returns the DE/FR/ES rows to prefer among).

- [ ] **Step 1: Write the failing test**

Read `backend/tests/repositories/amazon/cogs.repo.test.ts` first to see its existing imports/setup (`setupTestDb`, `truncateAll`, `createTestAmazonAccount`, `runWithAccount` — same pattern as every other repo test in this codebase) and follow it exactly. Add:

```typescript
describe("findCogsForAsins with marketplace=all", () => {
  it("returns COGS rows for every marketplace, not just IT", async () => {
    await runWithAccount(accountId, async () => {
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0.5 });
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "DE", cogsPerUnit: 9, shippingCost: 1 });

      const rows = await findCogsForAsins(db.prisma, { asins: ["B0ABC123"], marketplace: "all" });
      const marketplaces = rows.map((r: any) => r.marketplace).sort();
      expect(marketplaces).toEqual(["DE", "IT"]);
    });
  });

  it("still returns only the requested marketplace + ALL fallback when a specific marketplace is passed", async () => {
    await runWithAccount(accountId, async () => {
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "IT", cogsPerUnit: 4, shippingCost: 0.5 });
      await upsertCogs(db.prisma, { asin: "B0ABC123", marketplace: "DE", cogsPerUnit: 9, shippingCost: 1 });

      const rows = await findCogsForAsins(db.prisma, { asins: ["B0ABC123"], marketplace: "DE" });
      const marketplaces = rows.map((r: any) => r.marketplace).sort();
      expect(marketplaces).toEqual(["DE"]);
    });
  });
});
```

Add `upsertCogs` and `findCogsForAsins` to the file's existing imports from `cogs.repo` if not already imported.

- [ ] **Step 2: Run test to verify the first case fails**

Run: `cd backend && npx vitest run tests/repositories/amazon/cogs.repo.test.ts`
Expected: the "returns COGS rows for every marketplace" test FAILS (only `["IT"]` returned, not `["DE", "IT"]`); the second test already PASSES (behavior unchanged for that path)

- [ ] **Step 3: Fix the function**

```typescript
export async function findCogsForAsins(
  prisma: PrismaClient,
  params: { asins: string[]; marketplace?: string }
): Promise<any[]> {
  const { asins, marketplace } = params;
  const rows = await (prisma as any).amazonProductCogs.findMany({
    where: {
      amazonAccountId: getCurrentAccountId(),
      asin: { in: asins },
      ...(marketplace && marketplace !== "all"
        ? { OR: [{ marketplace }, { marketplace: "ALL" }] }
        : {}),
    },
  });
  return rows.map(normalizeCogsRow);
}
```

When `marketplace` is `"all"` or omitted, the `OR` clause is dropped entirely — the query returns every COGS row for the given ASINs regardless of marketplace, letting callers apply their own priority logic (as `resolveProductPerformance` already does).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/repositories/amazon/cogs.repo.test.ts`
Expected: PASS (both new tests, plus all pre-existing tests in the file)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all pass — this function has two other callers (`products.routes.ts`, `product-performance.repo.ts`); confirm neither regresses (`products.routes.ts`'s own `preferredMarketplace` logic already tie-breaks toward `"IT"` among whatever rows it receives, so receiving more rows only helps it, never breaks it — the existing test suite for `/amazon/products` should still pass unchanged, verifying this claim).

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/amazon/cogs.repo.ts backend/tests/repositories/amazon/cogs.repo.test.ts
git commit -m "fix(cogs): return all-marketplace COGS rows when marketplace=all instead of hardcoding IT"
```

---

### Task 2: Fix the dead period filter in `GET /products/performance`

**Files:**
- Modify: `backend/src/amazon/routes/products-performance.routes.ts:40-62`
- Test: `backend/tests/routes/products-performance-period-filter.routes.test.ts` (new file)

**Interfaces:**
- No signature change — same route, corrected date-range resolution.

Today (`backend/src/amazon/routes/products-performance.routes.ts:42-43`):

```typescript
    const { filter = "last30", from, to, marketplace = "all", productIds } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
```

`getDateRange` (`backend/src/amazon/utils/datetime.ts:36-68`) only reads `from`/`to` inside its `"custom"` case. No caller of this route ever sends `filter` — `frontend/src/lib/api/product-performance.ts`'s `get()` sends `{marketplace, from, to, productIds?}` only — so every request silently falls through to the `"last30"` default and `from`/`to` are discarded.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/routes/products-performance-period-filter.routes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../helpers/db";
import { runWithAccount } from "../../src/context/account-context";
import { createProduct, createIdentifier } from "../../src/repositories/amazon/product.repo";

vi.mock("../../src/amazon/ads-api.service", () => ({
  isAdsConfigured: vi.fn(async () => false),
  getConfiguredProfiles: vi.fn(async () => []),
  fetchSPAdvertisedProductReport: vi.fn(async () => []),
}));

// dynamic import after DATABASE_URL is set by setupTestDb — same pattern as
// tests/integration/sync-amazon.test.ts and products-performance.routes.test.ts,
// required because src/db.ts's PrismaClient singleton captures env at module load time
let productsPerformanceRouter: import("../../src/amazon/routes/products-performance.routes").productsPerformanceRouter;

let db: TestDb;
let accountId: string;
let app: express.Express;

beforeAll(async () => {
  db = await setupTestDb();
  ({ productsPerformanceRouter } = await import("../../src/amazon/routes/products-performance.routes"));
}, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => runWithAccount(accountId, () => next()));
  app.use("/", productsPerformanceRouter);
});

describe("GET /products/performance — period filter", () => {
  it("excludes an order outside the requested from/to window", async () => {
    await runWithAccount(accountId, async () => {
      const product = await createProduct(db.prisma, { name: "In Window" });
      await createIdentifier(db.prisma, { productId: product.id, channelType: "AMAZON", marketplace: "IT", asin: "B0IN", sku: "SKU-IN" });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-IN", orderItemId: "I-IN", asin: "B0IN", sku: "SKU-IN", productTitle: "In Window", marketplace: "IT", quantityOrdered: 3, quantityShipped: 3, itemPrice: 60, promotionDiscount: 0, purchaseDate: new Date("2026-06-15") } as any,
      });

      const outOfWindow = await createProduct(db.prisma, { name: "Out Of Window" });
      await createIdentifier(db.prisma, { productId: outOfWindow.id, channelType: "AMAZON", marketplace: "IT", asin: "B0OUT", sku: "SKU-OUT" });
      await db.prisma.amazonOrderItem.create({
        data: { amazonAccountId: accountId, amazonOrderId: "O-OUT", orderItemId: "I-OUT", asin: "B0OUT", sku: "SKU-OUT", productTitle: "Out Of Window", marketplace: "IT", quantityOrdered: 5, quantityShipped: 5, itemPrice: 100, promotionDiscount: 0, purchaseDate: new Date("2026-01-01") } as any,
      });
    });

    const res = await request(app).get("/products/performance").query({ marketplace: "all", from: "2026-06-01", to: "2026-06-30" });
    expect(res.status).toBe(200);
    const names = res.body.groups.map((g: any) => g.product.name);
    expect(names).toContain("In Window");
    expect(names).not.toContain("Out Of Window");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/routes/products-performance-period-filter.routes.test.ts`
Expected: FAIL — both products appear in the result (the `from`/`to` window is silently ignored, so the route falls back to `last30`, which — depending on today's date relative to these fixture dates — either includes both or neither correctly, but not specifically "In Window only"; the point is the test proves the window isn't being honored, not any particular wrong output)

- [ ] **Step 3: Fix the route**

In `backend/src/amazon/routes/products-performance.routes.ts`, change line 43:

```typescript
    const range = getDateRange(from && to ? "custom" : filter, from, to);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/routes/products-performance-period-filter.routes.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all pass, including the existing `products-performance.routes.test.ts`'s own tests (they don't pass `from`/`to` explicitly in a way this change would break — verify by reading that file if any test relies on the old default-fallback behavior)

- [ ] **Step 6: Commit**

```bash
git add backend/src/amazon/routes/products-performance.routes.ts backend/tests/routes/products-performance-period-filter.routes.test.ts
git commit -m "fix(products): honor from/to query params on GET /products/performance"
```

---

### Task 3: `AmazonAdvertisedProductSnapshot` — new synced table for per-ASIN ad spend

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_advertised_product_snapshot/` (generated)
- Create: `backend/src/repositories/amazon/ad-spend.repo.ts`
- Test: `backend/tests/repositories/amazon/ad-spend.repo.test.ts`

**Interfaces:**
- Consumes: nothing new (Prisma only)
- Produces:
  - Prisma model `AmazonAdvertisedProductSnapshot`
  - `upsertAdvertisedProductSnapshot(prisma, params: { snapshotDate: Date; marketplace: string; asin: string; campaignId: string; spend: number; sales: number; impressions: number; clicks: number; orders: number }): Promise<void>`
  - `findAdSpendForAsins(prisma, params: { asins: string[]; marketplace?: string; dateFrom: Date; dateTo: Date }): Promise<Array<{ asin: string; spend: number }>>` — sums spend per ASIN across the date range and (if provided) all campaigns, one row per ASIN

This table mirrors the existing `AmazonAdSnapshot` model (campaign-level, already synced daily) at ASIN granularity — populated by a new background job (Task 4), read by the route (Task 5) instead of calling the Amazon Ads API live.

- [ ] **Step 1: Add the model to `backend/prisma/schema.prisma`**

Append near `AmazonAdSnapshot` (for readability, not required by Prisma):

```prisma
model AmazonAdvertisedProductSnapshot {
  id              String   @id @default(cuid())
  amazonAccountId String
  amazonAccount   AmazonAccount @relation(fields: [amazonAccountId], references: [id])
  snapshotDate    DateTime @db.Date
  marketplace     String
  asin            String
  campaignId      String
  spend           Decimal  @default(0) @db.Decimal(14, 4)
  sales           Decimal  @default(0) @db.Decimal(14, 4)
  impressions     Int      @default(0)
  clicks          Int      @default(0)
  orders          Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([amazonAccountId, snapshotDate, marketplace, asin, campaignId])
  @@index([amazonAccountId])
  @@index([snapshotDate])
  @@index([asin])
  @@index([marketplace])
}
```

You also need to add the back-relation on `AmazonAccount`. Find this line on the `AmazonAccount` model (confirmed present, `backend/prisma/schema.prisma` around line 180):

```prisma
  adSnapshots          AmazonAdSnapshot[]
```

Add a new line directly after it, matching the same short-name convention (not prefixed with "amazon", since the type name already says that):

```prisma
  advertisedProductSnapshots AmazonAdvertisedProductSnapshot[]
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && npx prisma migrate dev --name add_advertised_product_snapshot`
Expected: creates the migration, applies cleanly, regenerates the Prisma client. (A local dev Postgres should already be configured via `backend/.env`'s `DATABASE_URL` from earlier work on this branch — if `.env` is missing, that means a fresh environment; set one up the same way documented in this plan's setup notes before continuing.)

- [ ] **Step 3: Verify migration status**

Run: `cd backend && npx prisma migrate status`
Expected: "Database schema is up to date"

- [ ] **Step 4: Write the failing tests**

```typescript
// backend/tests/repositories/amazon/ad-spend.repo.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import { upsertAdvertisedProductSnapshot, findAdSpendForAsins } from "../../../src/repositories/amazon/ad-spend.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

describe("ad-spend.repo", () => {
  it("upserts a snapshot and sums spend per ASIN across the date range", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 10, sales: 100, impressions: 500, clicks: 20, orders: 3,
      });
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-02"), marketplace: "IT", asin: "B0ABC123", campaignId: "C2",
        spend: 5, sales: 50, impressions: 200, clicks: 8, orders: 1,
      });

      const rows = await findAdSpendForAsins(db.prisma, {
        asins: ["B0ABC123"], dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-03"),
      });
      expect(rows).toEqual([{ asin: "B0ABC123", spend: 15 }]);
    });
  });

  it("re-upserting the same snapshotDate+marketplace+asin+campaignId updates instead of duplicating", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 10, sales: 100, impressions: 500, clicks: 20, orders: 3,
      });
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 12, sales: 110, impressions: 550, clicks: 22, orders: 4,
      });

      const rows = await findAdSpendForAsins(db.prisma, {
        asins: ["B0ABC123"], dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-01"),
      });
      expect(rows).toEqual([{ asin: "B0ABC123", spend: 12 }]);
    });
  });

  it("filters by marketplace when provided", async () => {
    await runWithAccount(accountId, async () => {
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "IT", asin: "B0ABC123", campaignId: "C1",
        spend: 10, sales: 100, impressions: 500, clicks: 20, orders: 3,
      });
      await upsertAdvertisedProductSnapshot(db.prisma, {
        snapshotDate: new Date("2026-08-01"), marketplace: "DE", asin: "B0ABC123", campaignId: "C1",
        spend: 7, sales: 70, impressions: 300, clicks: 12, orders: 2,
      });

      const rows = await findAdSpendForAsins(db.prisma, {
        asins: ["B0ABC123"], marketplace: "DE", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-01"),
      });
      expect(rows).toEqual([{ asin: "B0ABC123", spend: 7 }]);
    });
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/repositories/amazon/ad-spend.repo.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 6: Implement `ad-spend.repo.ts`**

```typescript
// ad-spend.repo.ts — Repository layer for AmazonAdvertisedProductSnapshot.
// Populated by a background sync job (ads-sync.service.ts's
// syncAdvertisedProductDaily), read by the products/performance route.
// Never call the Amazon Ads API from here — this file only touches Prisma.
import type { PrismaClient } from "@prisma/client";
import { getCurrentAccountId } from "../../context/account-context";
import { toNum } from "../../utils/decimal";

export async function upsertAdvertisedProductSnapshot(
  prisma: PrismaClient,
  params: {
    snapshotDate: Date;
    marketplace: string;
    asin: string;
    campaignId: string;
    spend: number;
    sales: number;
    impressions: number;
    clicks: number;
    orders: number;
  }
): Promise<void> {
  const amazonAccountId = getCurrentAccountId();
  await prisma.amazonAdvertisedProductSnapshot.upsert({
    where: {
      amazonAccountId_snapshotDate_marketplace_asin_campaignId: {
        amazonAccountId,
        snapshotDate: params.snapshotDate,
        marketplace: params.marketplace,
        asin: params.asin,
        campaignId: params.campaignId,
      },
    },
    create: {
      amazonAccountId,
      snapshotDate: params.snapshotDate,
      marketplace: params.marketplace,
      asin: params.asin,
      campaignId: params.campaignId,
      spend: params.spend,
      sales: params.sales,
      impressions: params.impressions,
      clicks: params.clicks,
      orders: params.orders,
    },
    update: {
      spend: params.spend,
      sales: params.sales,
      impressions: params.impressions,
      clicks: params.clicks,
      orders: params.orders,
    },
  });
}

/**
 * Sums spend per ASIN across the date range (and every campaign), current
 * account only. Used by the products/performance route to build its ads
 * spend map without ever calling the Amazon Ads API in the request path.
 */
export async function findAdSpendForAsins(
  prisma: PrismaClient,
  params: { asins: string[]; marketplace?: string; dateFrom: Date; dateTo: Date }
): Promise<Array<{ asin: string; spend: number }>> {
  if (params.asins.length === 0) return [];
  const rows = await prisma.amazonAdvertisedProductSnapshot.groupBy({
    by: ["asin"],
    where: {
      amazonAccountId: getCurrentAccountId(),
      asin: { in: params.asins },
      snapshotDate: { gte: params.dateFrom, lte: params.dateTo },
      ...(params.marketplace && params.marketplace !== "all" ? { marketplace: params.marketplace } : {}),
    },
    _sum: { spend: true },
  });
  return rows.map((r) => ({ asin: r.asin, spend: toNum(r._sum.spend ?? 0) }));
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/repositories/amazon/ad-spend.repo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/src/repositories/amazon/ad-spend.repo.ts backend/tests/repositories/amazon/ad-spend.repo.test.ts
git commit -m "feat(ads): add AmazonAdvertisedProductSnapshot table and repository"
```

---

### Task 4: Background sync job for per-ASIN ad spend

**Files:**
- Modify: `backend/src/amazon/ads-sync.service.ts`
- Modify: `backend/src/amazon/sync.job.ts`
- Test: `backend/tests/amazon/ads-sync-advertised-product.test.ts` (new)

**Interfaces:**
- Consumes: `fetchSPAdvertisedProductReport`, `getConfiguredProfiles`, `isAdsConfigured` (existing, `ads-api.service.ts`); `upsertAdvertisedProductSnapshot` (Task 3)
- Produces: `syncAdvertisedProductDaily(): Promise<void>` — exported from `ads-sync.service.ts`, scheduled the same way `syncAdsDaily` already is

This deliberately does **not** replicate `syncMarketplaceDateRange`'s cooldown/concurrency-lock machinery — that exists because campaign reports can be triggered by live user requests elsewhere in the app; this is a single daily background batch, closer in shape to `syncAdsDaily` itself.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/amazon/ads-sync-advertised-product.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/amazon/ads-api.service", () => ({
  isAdsConfigured: vi.fn(async () => true),
  getConfiguredProfiles: vi.fn(async () => [{ profileId: "p1", marketplace: "IT", countryCode: "IT", currency: "EUR" }]),
  fetchSPAdvertisedProductReport: vi.fn(async () => [
    { campaignId: "C1", adGroupId: "AG1", advertisedAsin: "B0ABC123", advertisedSku: "SKU-1", impressions: 100, clicks: 5, spend: 12.5, sales: 60, orders: 3 },
  ]),
}));

const upsertMock = vi.fn(async () => {});
vi.mock("../../src/repositories/amazon/ad-spend.repo", () => ({
  upsertAdvertisedProductSnapshot: upsertMock,
}));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => "account-1"),
}));
vi.mock("../../src/db", () => ({ prisma: {} }));

import { syncAdvertisedProductDaily } from "../../src/amazon/ads-sync.service";

describe("syncAdvertisedProductDaily", () => {
  beforeEach(() => { upsertMock.mockClear(); });

  it("fetches the advertised-product report for each configured profile and upserts one snapshot per ASIN+campaign", async () => {
    await syncAdvertisedProductDaily();
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        marketplace: "IT", asin: "B0ABC123", campaignId: "C1", spend: 12.5, sales: 60, impressions: 100, clicks: 5, orders: 3,
      })
    );
  });

  it("does nothing when Ads is not configured", async () => {
    const adsApi = await import("../../src/amazon/ads-api.service");
    vi.mocked(adsApi.isAdsConfigured).mockResolvedValueOnce(false);
    await syncAdvertisedProductDaily();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/amazon/ads-sync-advertised-product.test.ts`
Expected: FAIL (`syncAdvertisedProductDaily` not exported)

- [ ] **Step 3: Implement `syncAdvertisedProductDaily`**

Add this new import line near the top of `backend/src/amazon/ads-sync.service.ts` (the file already imports `prisma` from `"../db"` at line 3 and `getCurrentAccountId` at line 4 — do not duplicate those):

```typescript
import { upsertAdvertisedProductSnapshot } from "../repositories/amazon/ad-spend.repo";
```

Then add the function itself near `syncAdsDaily`:

```typescript
/**
 * Daily sync for per-ASIN Sponsored Products spend/sales, one report call
 * per configured profile. Persists to AmazonAdvertisedProductSnapshot so
 * request-time reads (products/performance route) never call the Ads API
 * directly — that report can take up to 45 minutes to generate.
 */
export async function syncAdvertisedProductDaily(): Promise<void> {
  if (!(await isAdsConfigured())) {
    console.log("[Ads Sync] Advertising API not configured — skipping advertised-product sync");
    return;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = dateStr(yesterday);

  const profiles = await getConfiguredProfiles();
  console.log(`[Ads Sync] Advertised-product daily sync for ${date} — ${profiles.length} marketplaces`);

  for (const profile of profiles) {
    try {
      const rows = await fetchSPAdvertisedProductReport(profile.profileId, date, date);
      for (const row of rows) {
        if (!row.advertisedAsin) continue;
        await upsertAdvertisedProductSnapshot(prisma, {
          snapshotDate: new Date(date),
          marketplace: profile.marketplace,
          asin: row.advertisedAsin,
          campaignId: row.campaignId,
          spend: row.spend,
          sales: row.sales,
          impressions: row.impressions,
          clicks: row.clicks,
          orders: row.orders,
        });
      }
      console.log(`[Ads Sync] ${profile.marketplace} advertised-product — saved ${rows.length} rows`);
      await sleep(2000);
    } catch (err) {
      console.error(`[Ads Sync] ${profile.marketplace} advertised-product sync failed:`, err);
    }
  }
  console.log("[Ads Sync] Advertised-product daily sync complete");
}
```

Add `fetchSPAdvertisedProductReport` to the existing import from `"./ads-api.service"` at the top of the file (it already imports `getConfiguredProfiles`, `fetchSPCampaignReport`, etc. from there — add this one name to that same import line).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/amazon/ads-sync-advertised-product.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Schedule the job**

In `backend/src/amazon/sync.job.ts`, add `syncAdvertisedProductDaily` to the existing import from `"./ads-sync.service"` (same line as `syncAdsDaily`, `syncAdsBackfill`, etc.), then add near the existing "Ads daily metrics sync" block:

```typescript
  // ── Advertised-product (per-ASIN ad spend) sync: every 24h ──────────────
  setInterval(() => {
    console.log("[Amazon Sync] Running scheduled advertised-product sync...");
    forEachActiveAccount("advertised-product sync", syncAdvertisedProductDaily).catch(console.error);
  }, 24 * 3_600_000);

  // Advertised-product sync: run 100s after startup (staggered after the
  // 90s ads daily sync above, avoiding both hitting the Ads API at once)
  setTimeout(() => {
    forEachActiveAccount("advertised-product sync", syncAdvertisedProductDaily).catch(console.error);
  }, 100_000);
```

- [ ] **Step 6: Typecheck and run the full backend suite**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: clean, all pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/amazon/ads-sync.service.ts backend/src/amazon/sync.job.ts backend/tests/amazon/ads-sync-advertised-product.test.ts
git commit -m "feat(ads): add background sync for per-ASIN advertised-product spend"
```

---

### Task 5: Read ads spend from the synced table; add `hasRealCogs`

**Files:**
- Modify: `backend/src/amazon/routes/products-performance.routes.ts`
- Modify: `backend/src/repositories/amazon/product-performance.repo.ts`
- Test: extend `backend/tests/routes/products-performance.routes.test.ts` and `backend/tests/repositories/amazon/product-performance.repo.test.ts`

**Interfaces:**
- Consumes: `findAdSpendForAsins` (Task 3)
- Produces:
  - `ProductPerformanceRow` gains `hasRealCogs: boolean` (backend interface — this is one of 4 places this shape is constructed across the whole codebase; Task 6 handles the frontend mirror and its own 2 construction sites, listed there)
  - Route no longer imports `fetchSPAdvertisedProductReport`/`getConfiguredProfiles` from `ads-api.service` — imports `findAdSpendForAsins` from the repo instead

- [ ] **Step 1: Update the route's `buildAdsSpendMap`**

Replace the whole function in `backend/src/amazon/routes/products-performance.routes.ts` (currently lines 12-38) with:

```typescript
async function buildAdsSpendMap(
  asins: string[],
  marketplace: string,
  dateFrom: Date,
  dateTo: Date
): Promise<Map<string, { spend: number }> | undefined> {
  if (asins.length === 0) return undefined;
  const rows = await findAdSpendForAsins(prisma, { asins, marketplace, dateFrom, dateTo });
  if (rows.length === 0) return undefined;
  return new Map(rows.map((r) => [r.asin, { spend: r.spend }]));
}
```

Update the imports at the top: remove `isAdsConfigured, getConfiguredProfiles, fetchSPAdvertisedProductReport` from the `ads-api.service` import (delete that whole import line if nothing else from it is used), add `import { findAdSpendForAsins } from "../../repositories/amazon/ad-spend.repo";`.

Update the call site inside the `GET /products/performance` handler — `buildAdsSpendMap` now needs the ASIN list, which isn't computed yet at that point in the handler. The simplest correct fix: call `resolveProductPerformance` first WITHOUT the ads map, collect the ASINs from its result, then call `buildAdsSpendMap`, then apply ads spend as a second pass — but that means computing derived metrics twice. Instead, resolve the ASIN list independently first:

```typescript
productsPerformanceRouter.get("/products/performance", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace = "all", productIds } = req.query as Record<string, string>;
    const range = getDateRange(from && to ? "custom" : filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo = range.lte ?? new Date();

    const productIdList = productIds ? productIds.split(",") : undefined;
    const products = await findAllProducts(prisma, { status: "ACTIVE" });
    const scoped = productIdList ? products.filter((p) => productIdList.includes(p.id)) : products;
    const asins = scoped.flatMap((p) => p.identifiers.filter((i) => i.channelType === "AMAZON" && i.asin).map((i) => i.asin as string));

    const adsSpendByAsin = await buildAdsSpendMap(asins, marketplace, dateFrom, dateTo);

    const groups = await resolveProductPerformance(prisma, {
      productIds: productIdList,
      marketplace,
      dateFrom,
      dateTo,
      adsSpendByAsin,
    });

    res.json({ groups });
  } catch (err) {
    console.error("[GET /products/performance]", err);
    res.status(500).json({ error: "Failed to resolve product performance" });
  }
});
```

Add `import { findAllProducts } from "../../repositories/amazon/product.repo";` to the top of the file (the route already imports `moveIdentifier, renameProduct` from that same module — add `findAllProducts` to that same import line).

- [ ] **Step 2: Update `product-performance.repo.ts` to add `hasRealCogs`**

In `backend/src/repositories/amazon/product-performance.repo.ts`, the current code (confirmed by reading the file — a prior fix round already switched `hasRealFees`'s aggregate to AND-logic with a `true` seed, so match that exact shape for `hasRealCogs`):

1. Add `hasRealCogs: boolean;` to the `ProductPerformanceRow` interface, right after `hasRealFees: boolean;`.

2. In the per-identifier row-building code (inside `productIdentifiers.map((ident) => {...})`), right after the line `const cogsInfo = cogsByKey.get(key) ?? cogsByKey.get(\`ALL::${ident.asin}\`);`, add:

```typescript
      const hasRealCogs = cogsInfo !== undefined;
```

Then in the returned row object, add `hasRealCogs,` on its own line right after `hasRealFees,`.

3. In the `aggBase` reduce (`rows.reduce((acc, r) => ({...}), {...})`), add to the callback's returned object, right after the existing `hasRealFees: acc.hasRealFees && r.hasRealFees,` line:

```typescript
        hasRealCogs: acc.hasRealCogs && r.hasRealCogs,
```

And add `hasRealCogs: true` to the reduce's initial seed object, right after the existing `hasRealFees: true` entry (same `true`-as-AND-identity reasoning already documented in the comment above that line — no need to duplicate the comment, just the field).

4. In the final `aggregate` object construction, add `hasRealCogs: aggBase.hasRealCogs,` right after the existing `hasRealFees: aggBase.hasRealFees,` on that same line (`amazonFees: aggBase.amazonFees, hasRealFees: aggBase.hasRealFees, cogs: aggBase.cogs, stock: aggBase.stock,` — append `hasRealCogs: aggBase.hasRealCogs,` to this line).

- [ ] **Step 3: Extend the tests**

In `backend/tests/repositories/amazon/product-performance.repo.test.ts`, add one test case: a product with a COGS row present asserts `hasRealCogs: true`; a product with no COGS row asserts `hasRealCogs: false, cogs: 0`. Follow the exact style of the existing "falls back to the 15%/€3.80 fee estimate" test in that file.

In `backend/tests/routes/products-performance.routes.test.ts`, update the existing `vi.mock("../../src/amazon/ads-api.service", ...)` block — it's no longer the right thing to mock, since the route no longer calls that module. Replace it with a mock of `../../src/repositories/amazon/ad-spend.repo` instead:

```typescript
vi.mock("../../src/repositories/amazon/ad-spend.repo", () => ({
  findAdSpendForAsins: vi.fn(async () => []),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/repositories/amazon/product-performance.repo.test.ts tests/routes/products-performance.routes.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full backend suite and typecheck**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add backend/src/amazon/routes/products-performance.routes.ts backend/src/repositories/amazon/product-performance.repo.ts backend/tests/repositories/amazon/product-performance.repo.test.ts backend/tests/routes/products-performance.routes.test.ts
git commit -m "fix(products): read ads spend from synced snapshot instead of the request path; add hasRealCogs"
```

---

### Task 6: Frontend types — add `hasRealCogs`

**Files:**
- Modify: `frontend/src/lib/api/types.ts`

**Interfaces:**
- Produces: `ProductPerformanceRow.hasRealCogs: boolean` — mirrors Task 5's backend field exactly

- [ ] **Step 1: Add the field**

In `frontend/src/lib/api/types.ts`, find the `ProductPerformanceRow` interface and add `hasRealCogs: boolean;` next to `hasRealFees: boolean;` — same position as the backend interface, for easy side-by-side comparison.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: **errors** — this is expected at this point; `ProductPerformanceRow` object literals in `PeriodTiles.tsx` and `ProductsPerformanceTable.tsx` don't set this field yet. Do not fix those here — Tasks 7 and 8 handle each file. Note in your task report which files/lines `tsc` flagged, so the next tasks know exactly where to add it.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/types.ts
git commit -m "feat(products): add hasRealCogs to frontend ProductPerformanceRow type"
```

---

### Task 7: `PeriodTiles.tsx` — 5 tiles, blue/teal palette, timezone fix

**Files:**
- Modify: `frontend/src/components/products/PeriodTiles.tsx`
- Modify: `frontend/src/components/products/PeriodTiles.test.tsx`

**Interfaces:**
- Consumes: `ProductPerformanceRow` (now with `hasRealCogs`, Task 6)
- No external signature change — same `export default function PeriodTiles()`, no props.

- [ ] **Step 1: Add the "30 giorni" tile and switch to the blue/teal palette**

In `frontend/src/components/products/PeriodTiles.tsx`, change the `TILES` array (currently lines 8-13):

```typescript
const TILES: { preset: PeriodPreset; label: string; color: string }[] = [
  { preset: "today", label: "Oggi", color: "linear-gradient(135deg,#4f7fe8,#3b6fd8)" },
  { preset: "yesterday", label: "Ieri", color: "linear-gradient(135deg,#4aa89a,#3d9188)" },
  { preset: "last7", label: "7 giorni", color: "linear-gradient(135deg,#4aa89a,#3d9188)" },
  { preset: "last14", label: "14 giorni", color: "linear-gradient(135deg,#4aa89a,#3d9188)" },
  { preset: "last30", label: "30 giorni", color: "linear-gradient(135deg,#4aa89a,#3d9188)" },
];
```

Update `presetDateRange` (currently lines 15-26) to handle `"last30"`:

```typescript
function presetDateRange(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  switch (preset) {
    case "today": return { from: formatDateToIso(today), to: formatDateToIso(today) };
    case "yesterday": return { from: formatDateToIso(daysAgo(1)), to: formatDateToIso(daysAgo(1)) };
    case "last7": return { from: formatDateToIso(daysAgo(6)), to: formatDateToIso(today) };
    case "last14": return { from: formatDateToIso(daysAgo(13)), to: formatDateToIso(today) };
    case "last30": return { from: formatDateToIso(daysAgo(29)), to: formatDateToIso(today) };
    default: return { from: formatDateToIso(today), to: formatDateToIso(today) };
  }
}
```

This also fixes the UTC-vs-local timezone bug the prior plan's final review flagged (`toISOString().slice(0,10)` converts to UTC; `formatDateToIso` — already used correctly by `frontend/src/lib/periodUtils.ts` and by `frontend/src/app/page.tsx` — uses local `getFullYear()/getMonth()/getDate()`). Import it: `import { formatDateToIso } from "@/lib/periodUtils";` — read that file first to confirm the exact exported name/signature before using it.

Delete the now-unused `iso` local helper (the old `const iso = (d: Date) => d.toISOString().slice(0, 10);` line) since `formatDateToIso` replaces it everywhere.

Update the grid to fit 5 tiles instead of 4: change `gridTemplateColumns: "repeat(4, 1fr)"` to `"repeat(5, 1fr)"`.

Update the tile's background style: the `color` field is now a full `background` CSS value (a gradient), not a solid color — change `background: color` to stay as `background: color` (works unchanged, since `background` accepts both solid colors and gradients as a string — no other code change needed there).

- [ ] **Step 2: Add `hasRealCogs` to `sumAggregate`**

In `sumAggregate`'s `reduce` seed object and the returned aggregate object (currently lines 33-59), add `hasRealCogs` following the exact same AND-logic pattern already used for `hasRealFees` in that function — read the current file to see exactly how `hasRealFees` is threaded through the seed and the final `hasRealFees:` line in the returned object, then add `hasRealCogs` right next to it with identical structure.

- [ ] **Step 3: Update the test file**

In `frontend/src/components/products/PeriodTiles.test.tsx`:
- Update the mock aggregate object to include `hasRealCogs: true` (or `false`, matching whatever `hasRealFees` value is already used in that mock)
- Update any assertion that counts/checks the tile grid columns if one exists (check the file — if a test asserts `mockGet` is called a specific number of times, it needs to become 5 instead of 4, matching the new `TILES` array length)
- If the timezone-fix test pattern from `frontend/src/app/prodotti/page.test.tsx` (a regression test using `formatDateToIso`/`addDays` from `periodUtils.ts` instead of hand-rolled UTC math) is worth mirroring here too, add an equivalent test — but first check whether `frontend/src/app/prodotti/page.test.tsx` still exists at this point in the plan (Task 10 deletes it) — if you're doing tasks in order, it still exists now; read it for the pattern, then write an equivalent for `PeriodTiles`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/products/PeriodTiles.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: the `hasRealCogs` error in this file (flagged by Task 6) should now be gone; other files' errors (if any remain from Task 6) are not this task's job to fix.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/products/PeriodTiles.tsx frontend/src/components/products/PeriodTiles.test.tsx
git commit -m "feat(products): extend PeriodTiles to 5 presets, blue/teal palette, fix UTC date bug"
```

---

### Task 8: `ProductsPerformanceTable.tsx` — thumbnails, teal accents, `hasRealCogs`, error handling

**Files:**
- Modify: `frontend/src/components/products/ProductsPerformanceTable.tsx`
- Modify: `frontend/src/components/products/ProductsPerformanceTable.test.tsx`

**Interfaces:**
- Consumes: `api.amazon.catalogImages(asins: string[]): Promise<Record<string, string | null>>` (existing, `frontend/src/lib/api/amazon.ts:122`)
- No prop signature change.

- [ ] **Step 1: Add product thumbnails**

Add local state for resolved images and an effect to fetch them once per render of `groups`:

```typescript
const [images, setImages] = useState<Record<string, string | null>>({});

useEffect(() => {
  const asins = [...new Set(groups.flatMap((g) => g.rows.map((r) => r.asin)).filter(Boolean))];
  if (asins.length === 0) return;
  let cancelled = false;
  api.amazon.catalogImages(asins).then((map) => { if (!cancelled) setImages(map); }).catch((err) => console.error("[ProductsPerformanceTable] Failed to load thumbnails:", err));
  return () => { cancelled = true; };
}, [groups]);
```

Add `useEffect` to the existing `import { useState, Fragment } from "react";` line.

Render a thumbnail next to the label in both the parent row and child row `<MetricCell>` for the label column. For the parent row (product-grouping mode), use the first child's `asin` to look up an image (a product-level row doesn't have its own single ASIN); for the marketplace-grouping mode's parent row, there's no single ASIN either — only child rows have one. So: **thumbnails render on child rows only** (they're the only rows with a concrete `asin`), not on parent rows. Update the child row's label `<MetricCell>` (currently around line 206-209):

```tsx
<MetricCell>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {images[child.metrics.asin] ? (
      <img src={images[child.metrics.asin]!} alt="" style={{ width: 22, height: 22, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
    ) : (
      <div style={{ width: 22, height: 22, borderRadius: 5, background: "#eef0ff", flexShrink: 0 }} />
    )}
    <span style={{ marginLeft: 4, color: "#6b7280" }}>
      ↳ {child.label} — <span>{child.metrics.asin}</span>
    </span>
  </div>
  {groupBy === "product" && (
    /* ...existing "Sposta in un altro prodotto…" button and moving-input block, unchanged... */
  )}
</MetricCell>
```

Keep the existing `marginLeft: 20` indentation by moving it to the outer wrapping `<div>` instead of the removed `<span>`.

- [ ] **Step 2: Update color accents to teal**

Replace `#2563eb` (blue link color, used for "Sposta in un altro prodotto…") — no change needed, blue is correct there (matches the approved mockup's link styling). Replace any green success-style color the file currently uses for positive values — check the current file for hardcoded green hex values in `fmtEur`/`fmtPct` rendering (the current file, per the read above, does NOT color-code positive/negative values at all — every `<MetricCell>` renders plain black text). Add teal coloring for `grossProfit`/`netProfit`/`margin`/`roi` when positive, red when negative, matching the approved mockup:

```typescript
const profitColor = (n: number) => (n < 0 ? "#dc2626" : "#0d9488");
```

Apply `style={{ color: profitColor(m.grossProfit), fontWeight: 600 }}` (or similar) to the `grossProfit`, `netProfit`, `margin`, `roi` cells in both parent and child rows — read the current cell markup first and apply consistently to all 4 metrics × 2 row types (8 cells total).

- [ ] **Step 3: Add `hasRealCogs` disclosure**

Next to the existing (already-present) implicit lack of `hasRealFees` disclosure — the table currently computes `hasRealFees`/`hasRealCogs` but never shows them. Add a small superscript/marker on the COGS and Fee Amazon cells when the value is estimated, not real:

```tsx
<MetricCell>
  {fmtEur(m.amazonFees)}
  {!m.hasRealFees && <span title="Stimato — settlement non ancora disponibile" style={{ color: "#f59e0b", fontSize: 9, marginLeft: 3 }}>≈</span>}
</MetricCell>
```

Apply the same pattern to the COGS cell using `m.hasRealCogs` (`title="Stimato — nessun COGS configurato per questo ASIN"`). Apply to both parent (`m.*`) and child (`child.metrics.*`) rows — 4 cells total (2 metrics × 2 row types).

- [ ] **Step 4: Add error handling to `handleRename`/`handleMove`**

```typescript
const handleRename = async (productId: string, currentName: string) => {
  const name = window.prompt("Nuovo nome prodotto:", currentName);
  if (!name || name === currentName) return;
  try {
    await api.productPerformance.rename(productId, name);
    onRenamed();
  } catch (err) {
    console.error("[ProductsPerformanceTable] Rename failed:", err);
    window.alert("Impossibile rinominare il prodotto. Riprova.");
  }
};

const handleMove = async (identifierId: string) => {
  if (!targetProductId) return;
  try {
    await api.productPerformance.moveIdentifier(identifierId, targetProductId);
    setMovingId(null);
    setTargetProductId("");
    onMoved();
  } catch (err) {
    console.error("[ProductsPerformanceTable] Move failed:", err);
    window.alert("Impossibile spostare il prodotto. Riprova.");
  }
};
```

- [ ] **Step 5: Update the test file**

In `frontend/src/components/products/ProductsPerformanceTable.test.tsx`:
- Add `hasRealCogs: true` to the existing `baseRow` mock object
- Add a test: mock `api.amazon.catalogImages` to resolve `{ B0ABC123: "https://example.com/img.jpg" }`, render, expand the row, assert an `<img>` with that `src` appears
- Add a test: mock `api.productPerformance.rename` to reject, click rename (mock `window.prompt` to return a new name), assert `window.alert` was called and the component didn't crash — use `vi.spyOn(window, "alert").mockImplementation(() => {})` and `vi.spyOn(window, "prompt").mockReturnValue("New Name")`

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/products/ProductsPerformanceTable.test.tsx`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean — this was the last file with a `hasRealCogs`-shaped object literal (Task 6 flagged this file and `PeriodTiles.tsx`; Task 7 handled `PeriodTiles.tsx`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/products/ProductsPerformanceTable.tsx frontend/src/components/products/ProductsPerformanceTable.test.tsx
git commit -m "feat(products): add thumbnails, teal accents, estimated-data badges, error handling"
```

---

### Task 9: Wire `frontend/src/app/page.tsx` — replace the two home-page sections

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Test: `frontend/src/app/page.test.tsx` (create if it doesn't exist — check first)

**Interfaces:**
- Consumes: `PeriodTiles` (Task 7), `ProductsPerformanceTable`+`GroupBy` (Task 8), `api.productPerformance.get` (existing)

- [ ] **Step 1: Read the current file's relevant sections first**

Read `frontend/src/app/page.tsx` around lines 1-30 (imports, `isAmazonMp`/`amazonMpCode` derivation), lines 300-340 (the "BUSINESS INTELLIGENCE" section, gated by `activeView === "tiles"` AND `!selectedProduct`), and lines 444-457 (the "PRODOTTI" section, **not** gated by `activeView` — it renders on every tab, this is existing behavior to preserve, not a bug to fix).

- [ ] **Step 2: Add page-level state for the products table**

Near the existing `filter`/`marketplace`/`selectedProduct` state declarations, add:

```typescript
const [productsGroupBy, setProductsGroupBy] = useState<GroupBy>("marketplace");
const [productGroups, setProductGroups] = useState<ProductPerformanceGroup[]>([]);

const loadProductGroups = useCallback(async () => {
  const productMarketplace = isAmazonMp ? (amazonMpCode ?? "all") : "all";
  const { groups } = await api.productPerformance.get({ marketplace: productMarketplace, from: apiFrom, to: apiTo });
  setProductGroups(groups);
}, [isAmazonMp, amazonMpCode, apiFrom, apiTo]);

useEffect(() => { loadProductGroups(); }, [loadProductGroups]);
```

Add `GroupBy` and `ProductPerformanceGroup` to the file's existing type imports from `@/lib/api` (add `ProductPerformanceGroup` to whatever's already imported from there); import `GroupBy` as a type from `@/components/products/ProductsPerformanceTable`. `useCallback` needs to be added to the existing `import React, { useState, useEffect, useCallback, useRef } from "react";` line if not already present (per the file's current imports, `useCallback` is already there — confirm before adding a duplicate).

- [ ] **Step 3: Replace the BUSINESS INTELLIGENCE section**

Change the `<SellerboardKpiCards ... />` block (the `else` branch of `selectedProduct ? <ProductBIOverview .../> : (...)`) to `<PeriodTiles />`. Keep the `selectedProduct ? <ProductBIOverview .../> : <PeriodTiles />` structure — this preserves the existing product-search drill-down behavior unchanged, since `ProductsPerformanceTable`'s own expand-row mechanism is a separate, already-built interaction that doesn't feed into `selectedProduct`.

Remove the `import SellerboardKpiCards from "@/components/dashboard/SellerboardKpiCards";` line and add `import PeriodTiles from "@/components/products/PeriodTiles";`.

- [ ] **Step 4: Replace the PRODOTTI section**

Change:

```tsx
<CrossChannelProducts
  filter={filter}
  from={apiFrom}
  to={apiTo}
  marketplace={marketplace}
/>
```

to:

```tsx
<ProductsPerformanceTable
  groups={productGroups}
  groupBy={productsGroupBy}
  onGroupByChange={setProductsGroupBy}
  onRenamed={loadProductGroups}
  onMoved={loadProductGroups}
/>
```

Remove the `import CrossChannelProducts from "@/components/dashboard/CrossChannelProducts";` line and add `import ProductsPerformanceTable, { GroupBy } from "@/components/products/ProductsPerformanceTable";`.

Do not remove `SellerboardKpiCards.tsx`, `CrossChannelProducts.tsx`, or their subcomponents from the codebase in this task — they may still be referenced elsewhere (check with `grep -rn "SellerboardKpiCards\|CrossChannelProducts" frontend/src --include="*.tsx" | grep -v page.tsx` before assuming they're now dead; if genuinely unused anywhere, note it in your report as a candidate for a future cleanup task, don't delete it in this task, which is scoped to wiring, not cleanup).

- [ ] **Step 5: Write/extend the page test**

```tsx
// frontend/src/app/page.test.tsx — add or extend
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      productPerformance: { get: vi.fn(async () => ({ groups: [] })), rename: vi.fn(), moveIdentifier: vi.fn() },
    },
  };
});

// ... follow whatever mocking pattern the rest of this file already uses for
// api.overview/api.summary/etc. (read the file first) — add the same style
// of mock for the other api.* calls this page makes, since a full render
// exercises all of them, not just the new one.

import HomePage from "./page";

describe("HomePage — product BI section", () => {
  it("renders PeriodTiles and ProductsPerformanceTable instead of the old components", async () => {
    render(<HomePage />);
    await waitFor(() => expect(screen.getByText(/prodotti/i)).toBeInTheDocument());
  });
});
```

Adjust based on what you find reading the file's existing mock setup (it very likely already mocks most `api.*` calls for its existing tests, if any exist — check `frontend/src/app/page.test.tsx` first before assuming it doesn't exist).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/page.test.tsx`
Expected: PASS

- [ ] **Step 7: Typecheck and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: clean, all pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/page.test.tsx
git commit -m "feat(products): wire PeriodTiles and ProductsPerformanceTable into the home page"
```

---

### Task 10: Remove `/prodotti` and its sidebar entry

**Files:**
- Delete: `frontend/src/app/prodotti/page.tsx`
- Delete: `frontend/src/app/prodotti/page.test.tsx`
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx`
- Modify: `frontend/src/components/layout/GlobalSidebar.test.tsx`

**Interfaces:** none (pure removal)

- [ ] **Step 1: Delete the route**

```bash
rm frontend/src/app/prodotti/page.tsx frontend/src/app/prodotti/page.test.tsx
rmdir frontend/src/app/prodotti
```

- [ ] **Step 2: Remove the sidebar entry**

Read `frontend/src/components/layout/GlobalSidebar.tsx`'s `GROUPS` array first — this branch was created before a separate, unrelated sidebar-cleanup branch was merged, so it may still contain "Prossimamente" placeholder items alongside the real ones (`Fisco`, `Fornitori`, etc.) — **do not touch those**, they're out of scope for this task and belong to different, already-in-progress work. Only remove the single line `{ href: "/prodotti", label: "Prodotti" }` from the `INVENTORY` group's `items` array.

- [ ] **Step 3: Update the sidebar test**

In `frontend/src/components/layout/GlobalSidebar.test.tsx`, find and remove the assertion checking for the "Prodotti" link (`screen.getByRole("link", { name: "Prodotti" })...`) — read the file first to find its exact current form and remove only that specific assertion, leaving everything else (including any "Prossimamente" tests, if present in this branch's version of the file) untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/layout/GlobalSidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Search for any remaining references to `/prodotti`**

Run: `grep -rn "/prodotti" frontend/src --include="*.tsx" --include="*.ts"`
Expected: no results (or only results that are clearly unrelated, e.g. a coincidental substring match — verify each one)

- [ ] **Step 6: Run the full frontend suite and typecheck**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: clean, all pass

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/app/prodotti frontend/src/components/layout/GlobalSidebar.tsx frontend/src/components/layout/GlobalSidebar.test.tsx
git commit -m "chore(products): remove /prodotti route and its sidebar entry now that the home page hosts the table"
```

---

## Self-Review Notes

**Spec coverage:** Task 1 covers the `cogs.repo.ts` bug; Task 2 covers the dead period filter; Tasks 3-5 cover moving Ads off the request path (new table, new sync job, route rewire) plus `hasRealCogs`; Tasks 6-8 cover the frontend type + both components' visual/disclosure/error-handling requirements from the spec; Tasks 9-10 cover the actual relocation onto the home page and cleanup of the abandoned route. Every numbered item in the spec's "Cosa cambia" section has a task.

**Type consistency:** `hasRealCogs` is added to exactly the 4 places `ProductPerformanceRow`-shaped objects are constructed across the codebase (grep-verified before writing this plan): `product-performance.repo.ts`'s two construction sites (Task 5), `PeriodTiles.tsx`'s `sumAggregate` (Task 7), `ProductsPerformanceTable.tsx`'s `buildRowsByMarketplace` aggregate (Task 8) — Task 6 adds the interface field first and deliberately leaves the resulting `tsc` errors in place as a checklist for Tasks 7-8, rather than the plan silently assuming they'll be found.

**Known ambiguity flagged inline, not hidden:** Task 5's Step 2 explicitly tells the implementer to read the current file's exact `hasRealFees` reduce/aggregate-construction code before mirroring it for `hasRealCogs`, rather than pasting exact line numbers that may not match after this branch's prior fix rounds already changed that function once.
