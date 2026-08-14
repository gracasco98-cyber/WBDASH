# Sync ordini Mirakl (Redcare/Shop-Apotheke) → Shopify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni nuovo ordine Mirakl (Redcare/Shop-Apotheke, `shopapotheke.mirakl.net`) diventa un ordine Shopify reale (con scarico inventario e tag `redcare_it`/`redcare_de`), e quando quell'ordine viene evaso su Shopify il tracking torna automaticamente a Mirakl.

**Architecture:** Nuovo dominio `backend/src/mirakl/` (client REST Mirakl + mapper puro + job periodico), completamente separato da `amazon/` — nessun import incrociato. Riusa i pattern esistenti del dominio Shopify: repository layer (`repositories/mirakl/orders.repo.ts`), error logging (`services/shopify.service.ts#logError`), e il webhook handler esistente (`webhooks/webhooks.ts`) esteso con un nuovo topic. Vedi design doc: `docs/superpowers/specs/2026-08-14-mirakl-redcare-shopify-sync-design.md`.

**Tech Stack:** Node/Express/TypeScript, Prisma, Vitest + Testcontainers (Postgres reale) + MSW per i test, `fetch` nativo per le chiamate HTTP (stesso stile di `shopify.service.ts`, nessuna nuova dipendenza).

## Global Constraints

- Route/service/webhook/job non chiamano mai Prisma direttamente — solo `repositories/**` (regola assoluta del `CLAUDE.md` del repo).
- Nessuna scrittura verso Mirakl (accept/ship) senza che la scrittura Shopify corrispondente sia già confermata.
- `mirakl/` non importa nulla da `amazon/` e viceversa — vincolo esplicito dell'utente.
- Tutte le chiamate esterne (Mirakl, Shopify) sono wrappate in try/catch con logging su `AppErrorLog` via `logError()` — mai un errore silenzioso.
- Nessun segreto nel repo: `MIRAKL_API_URL`/`MIRAKL_API_KEY` solo in `.env`/Railway.
- Migrazioni via `prisma migrate dev`, mai `db push`, per tutto ciò che arriva su `develop`/`main`.
- Branch corrente: `feature/mirakl-redcare-shopify-sync` (già creato, contiene il design doc committato).

---

## Rischio noto da validare durante l'implementazione

I nomi di campo usati sotto per l'API Mirakl (OR11/OR23/OR24) e per la mutation Shopify `orderCreate` sono basati sullo standard Mirakl Connector API e sullo schema pubblico Shopify Admin GraphQL — **vanno confermati contro la documentazione reale** esposta nella sezione API del pannello venditore Mirakl (`shopapotheke.mirakl.net` → Impostazioni → API) e contro l'introspection GraphQL dello store Shopify prima di considerare Task 2 e Task 4 conclusi. Se qualche nome di campo risultasse diverso, va corretto lì (i test del task stesso, basati su mock, continuano a passare finché mock e implementazione restano coerenti fra loro — è la validazione contro l'API reale che va fatta a parte, con una chiamata di prova).

---

### Task 1: Modello dati `MiraklOrder` + repository layer

**Files:**
- Modify: `backend/prisma/schema.prisma` (aggiunta in fondo al file, dopo `model ProductDailySnapshot`)
- Create: `backend/src/repositories/mirakl/orders.repo.ts`
- Test: `backend/tests/repositories/mirakl/orders.repo.test.ts`

**Interfaces:**
- Produces: `MiraklOrder` (Prisma model — campi `miraklOrderId`, `shopifyOrderId`, `country`, `miraklState`, `trackingNumber`, `trackingSyncedAt`), e le funzioni repo `findByMiraklOrderId`, `findByShopifyOrderId`, `createPendingAcceptOrder`, `markAccepted`, `markShipped` — usate da Task 5 e Task 6.

- [ ] **Step 1: Aggiungere il modello Prisma**

Aggiungi in fondo a `backend/prisma/schema.prisma`:

```prisma
model MiraklOrder {
  id               String    @id @default(cuid())
  miraklOrderId    String    @unique
  shopifyOrderId   String    @unique
  country          String
  miraklState      String    @default("PENDING_ACCEPT")
  trackingNumber   String?
  trackingSyncedAt DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([miraklState])
}
```

`miraklState` traccia la nostra macchina a stati interna (non lo stato grezzo di Mirakl): `PENDING_ACCEPT` (ordine creato su Shopify, non ancora accettato su Mirakl) → `ACCEPTED` → `SHIPPED`.

- [ ] **Step 2: Generare la migrazione**

Run: `cd backend && npx prisma migrate dev --name add_mirakl_order`
Expected: crea `backend/prisma/migrations/<timestamp>_add_mirakl_order/migration.sql` con una singola `CREATE TABLE "MiraklOrder"`, applicata al DB locale senza errori.

Rollback: `DROP TABLE "MiraklOrder";` (nessuna tabella esistente modificata, rollback sicuro e isolato).

- [ ] **Step 3: Scrivere il test del repository (fallente)**

```typescript
// backend/tests/repositories/mirakl/orders.repo.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  findByMiraklOrderId,
  findByShopifyOrderId,
  createPendingAcceptOrder,
  markAccepted,
  markShipped,
} from "../../../src/repositories/mirakl/orders.repo";

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
});

describe("createPendingAcceptOrder / findByMiraklOrderId", () => {
  it("creates a row with miraklState=PENDING_ACCEPT", async () => {
    const row = await createPendingAcceptOrder(db.prisma, {
      miraklOrderId: "MK-1",
      shopifyOrderId: "gid://shopify/Order/1",
      country: "IT",
    });
    expect(row.miraklState).toBe("PENDING_ACCEPT");

    const found = await findByMiraklOrderId(db.prisma, "MK-1");
    expect(found?.shopifyOrderId).toBe("gid://shopify/Order/1");
  });

  it("returns null when not found", async () => {
    const found = await findByMiraklOrderId(db.prisma, "MISSING");
    expect(found).toBeNull();
  });
});

describe("markAccepted / markShipped", () => {
  it("transitions PENDING_ACCEPT -> ACCEPTED -> SHIPPED", async () => {
    await createPendingAcceptOrder(db.prisma, {
      miraklOrderId: "MK-2",
      shopifyOrderId: "gid://shopify/Order/2",
      country: "DE",
    });

    const accepted = await markAccepted(db.prisma, "MK-2");
    expect(accepted.miraklState).toBe("ACCEPTED");

    const shipped = await markShipped(db.prisma, "gid://shopify/Order/2", "TRACK-123");
    expect(shipped.miraklState).toBe("SHIPPED");
    expect(shipped.trackingNumber).toBe("TRACK-123");
    expect(shipped.trackingSyncedAt).not.toBeNull();

    const byShopifyId = await findByShopifyOrderId(db.prisma, "gid://shopify/Order/2");
    expect(byShopifyId?.miraklState).toBe("SHIPPED");
  });
});
```

- [ ] **Step 4: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx vitest run tests/repositories/mirakl/orders.repo.test.ts`
Expected: FAIL — `Cannot find module '../../../src/repositories/mirakl/orders.repo'`

- [ ] **Step 5: Implementare il repository**

```typescript
// backend/src/repositories/mirakl/orders.repo.ts
// orders.repo.ts — Repository layer for MiraklOrder entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, MiraklOrder } from "@prisma/client";

export async function findByMiraklOrderId(
  prisma: PrismaClient,
  miraklOrderId: string
): Promise<MiraklOrder | null> {
  return prisma.miraklOrder.findUnique({ where: { miraklOrderId } });
}

export async function findByShopifyOrderId(
  prisma: PrismaClient,
  shopifyOrderId: string
): Promise<MiraklOrder | null> {
  return prisma.miraklOrder.findUnique({ where: { shopifyOrderId } });
}

export async function createPendingAcceptOrder(
  prisma: PrismaClient,
  data: { miraklOrderId: string; shopifyOrderId: string; country: string }
): Promise<MiraklOrder> {
  return prisma.miraklOrder.create({
    data: { ...data, miraklState: "PENDING_ACCEPT" },
  });
}

export async function markAccepted(
  prisma: PrismaClient,
  miraklOrderId: string
): Promise<MiraklOrder> {
  return prisma.miraklOrder.update({
    where: { miraklOrderId },
    data: { miraklState: "ACCEPTED" },
  });
}

export async function markShipped(
  prisma: PrismaClient,
  shopifyOrderId: string,
  trackingNumber: string
): Promise<MiraklOrder> {
  return prisma.miraklOrder.update({
    where: { shopifyOrderId },
    data: {
      miraklState: "SHIPPED",
      trackingNumber,
      trackingSyncedAt: new Date(),
    },
  });
}
```

- [ ] **Step 6: Eseguire il test e verificare che passi**

Run: `cd backend && npx vitest run tests/repositories/mirakl/orders.repo.test.ts`
Expected: PASS (3 test)

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/repositories/mirakl/orders.repo.ts backend/tests/repositories/mirakl/orders.repo.test.ts
git commit -m "feat(mirakl): add MiraklOrder model and repository layer"
```

---

### Task 2: Client REST Mirakl (`client.ts`)

**Files:**
- Create: `backend/src/mirakl/client.ts`
- Test: `backend/tests/mirakl/client.test.ts`
- Modify: `backend/tests/helpers/msw-server.ts` (nuova sezione `miraklMocks`, in fondo al file, dopo `amazonMocks`)
- Modify: `backend/.env.example` (nuove variabili)

**Interfaces:**
- Consumes: nessuna dipendenza da task precedenti.
- Produces: `MiraklOrder` (tipo — non il modello Prisma, attenzione al nome duplicato: qui è il tipo del client, importato in Task 3 e Task 5 come `import type { MiraklOrder } from "../mirakl/client"`), `fetchNewOrders(): Promise<MiraklOrder[]>`, `acceptOrder(orderId: string, lineIds: string[]): Promise<void>`, `shipOrder(orderId: string, tracking: { carrierName: string; trackingNumber: string; carrierUrl?: string }): Promise<void>`.

- [ ] **Step 1: Aggiungere le variabili d'ambiente**

Aggiungi a `backend/.env.example`:

```
# Mirakl (Redcare / Shop-Apotheke)
MIRAKL_API_URL=https://shopapotheke.mirakl.net/api
MIRAKL_API_KEY=
```

- [ ] **Step 2: Aggiungere i mock MSW per Mirakl**

Aggiungi in fondo a `backend/tests/helpers/msw-server.ts` (dopo `amazonMocks`, prima di `export { http, HttpResponse };`):

```typescript
// ─── Mirakl mock factories ────────────────────────────────────────────────────
export const miraklMocks = {
  /** OR11 — GET /orders?order_state_codes=WAITING_ACCEPTANCE */
  newOrders: (orders: Array<Record<string, any>>) =>
    http.get(
      /mirakl\.net\/api\/orders/,
      async () => HttpResponse.json({ orders, total_count: orders.length }),
    ),

  /** OR23 — PUT /orders/:id/accept */
  acceptOrder: () =>
    http.put(
      /mirakl\.net\/api\/orders\/[^/]+\/accept/,
      async () => HttpResponse.json({}),
    ),

  /** OR24 — PUT /orders/:id/tracking */
  shipOrder: () =>
    http.put(
      /mirakl\.net\/api\/orders\/[^/]+\/tracking/,
      async () => HttpResponse.json({}),
    ),

  /** Generic non-2xx error for any Mirakl endpoint */
  httpError: (status: number, body = "Mirakl API Error") =>
    http.all(
      /mirakl\.net\/api\//,
      async () => new HttpResponse(body, { status }),
    ),
};
```

- [ ] **Step 3: Scrivere il test del client (fallente)**

```typescript
// backend/tests/mirakl/client.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { miraklMocks, http, HttpResponse } from "../helpers/msw-server";

const server = setupServer();

describe("Mirakl client", () => {
  let fetchNewOrders: typeof import("../../src/mirakl/client").fetchNewOrders;
  let acceptOrder: typeof import("../../src/mirakl/client").acceptOrder;
  let shipOrder: typeof import("../../src/mirakl/client").shipOrder;

  beforeAll(async () => {
    process.env.MIRAKL_API_URL = "https://shopapotheke.mirakl.net/api";
    process.env.MIRAKL_API_KEY = "test-key";

    const client = await import("../../src/mirakl/client");
    fetchNewOrders = client.fetchNewOrders;
    acceptOrder = client.acceptOrder;
    shipOrder = client.shipOrder;

    server.listen({ onUnhandledRequest: "error" });
  });

  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it("fetchNewOrders maps snake_case Mirakl payload to camelCase MiraklOrder[]", async () => {
    server.use(
      miraklMocks.newOrders([
        {
          order_id: "MK-100",
          order_state: "WAITING_ACCEPTANCE",
          created_date: "2026-08-01T10:00:00Z",
          currency_iso_code: "EUR",
          total_price: 44.97,
          customer: {
            email: "cliente@example.com",
            shipping_address: {
              firstname: "Mario",
              lastname: "Rossi",
              street_1: "Via Roma 1",
              street_2: null,
              zip_code: "00100",
              city: "Roma",
              country: "Italy",
              country_iso_code: "IT",
              phone: null,
            },
          },
          order_lines: [
            { id: "L1", offer_sku: "SKU-001", product_title: "Prodotto A", quantity: 2, price: 19.99, total_price: 39.98 },
          ],
        },
      ]),
    );

    const orders = await fetchNewOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderId: "MK-100",
      currencyIsoCode: "EUR",
      totalPrice: 44.97,
      customer: {
        email: "cliente@example.com",
        shippingAddress: { firstname: "Mario", countryIsoCode: "IT" },
      },
      orderLines: [{ id: "L1", offerSku: "SKU-001", quantity: 2 }],
    });
  });

  it("acceptOrder sends a PUT with accepted:true for each line id", async () => {
    let capturedBody: any = null;
    server.use(
      http.put(/mirakl\.net\/api\/orders\/MK-100\/accept/, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    await acceptOrder("MK-100", ["L1", "L2"]);
    expect(capturedBody).toEqual({
      order_lines: [
        { id: "L1", accepted: true },
        { id: "L2", accepted: true },
      ],
    });
  });

  it("shipOrder sends tracking info as snake_case", async () => {
    let capturedBody: any = null;
    server.use(
      http.put(/mirakl\.net\/api\/orders\/MK-100\/tracking/, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    await shipOrder("MK-100", { carrierName: "BRT", trackingNumber: "T123" });
    expect(capturedBody).toEqual({
      carrier_name: "BRT",
      tracking_number: "T123",
      carrier_url: undefined,
    });
  });

  it("throws with status and body on non-2xx response", async () => {
    server.use(miraklMocks.httpError(500, "boom"));
    await expect(fetchNewOrders()).rejects.toThrow(/Mirakl API error 500/);
  });
});
```

- [ ] **Step 4: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx vitest run tests/mirakl/client.test.ts`
Expected: FAIL — `Cannot find module '../../src/mirakl/client'`

- [ ] **Step 5: Implementare il client**

```typescript
// backend/src/mirakl/client.ts
// client.ts — Mirakl Connector API client (Redcare/Shop-Apotheke marketplace).
// Standalone: nessuna dipendenza da backend/src/amazon/**.
const MIRAKL_API_URL = process.env.MIRAKL_API_URL!;
const MIRAKL_API_KEY = process.env.MIRAKL_API_KEY!;

// ─── Public types (camelCase) ──────────────────────────────────────────────────
export interface MiraklShippingAddress {
  firstname: string;
  lastname: string;
  street1: string;
  street2: string | null;
  zipCode: string;
  city: string;
  country: string;
  countryIsoCode: string;
  phone: string | null;
}

export interface MiraklOrderLine {
  id: string;
  offerSku: string;
  productTitle: string;
  quantity: number;
  price: number;
  totalPrice: number;
}

export interface MiraklOrder {
  orderId: string;
  orderState: string;
  createdDate: string;
  currencyIsoCode: string;
  totalPrice: number;
  customer: {
    email: string | null;
    shippingAddress: MiraklShippingAddress;
  };
  orderLines: MiraklOrderLine[];
}

// ─── Raw wire types (snake_case, as documented in the Mirakl seller API) ──────
interface RawMiraklOrder {
  order_id: string;
  order_state: string;
  created_date: string;
  currency_iso_code: string;
  total_price: number;
  customer: {
    email: string | null;
    shipping_address: {
      firstname: string;
      lastname: string;
      street_1: string;
      street_2: string | null;
      zip_code: string;
      city: string;
      country: string;
      country_iso_code: string;
      phone: string | null;
    };
  };
  order_lines: Array<{
    id: string;
    offer_sku: string;
    product_title: string;
    quantity: number;
    price: number;
    total_price: number;
  }>;
}

interface MiraklOrdersResponse {
  orders: RawMiraklOrder[];
  total_count: number;
}

function mapOrder(raw: RawMiraklOrder): MiraklOrder {
  return {
    orderId: raw.order_id,
    orderState: raw.order_state,
    createdDate: raw.created_date,
    currencyIsoCode: raw.currency_iso_code,
    totalPrice: raw.total_price,
    customer: {
      email: raw.customer.email,
      shippingAddress: {
        firstname: raw.customer.shipping_address.firstname,
        lastname: raw.customer.shipping_address.lastname,
        street1: raw.customer.shipping_address.street_1,
        street2: raw.customer.shipping_address.street_2,
        zipCode: raw.customer.shipping_address.zip_code,
        city: raw.customer.shipping_address.city,
        country: raw.customer.shipping_address.country,
        countryIsoCode: raw.customer.shipping_address.country_iso_code,
        phone: raw.customer.shipping_address.phone,
      },
    },
    orderLines: raw.order_lines.map((l) => ({
      id: l.id,
      offerSku: l.offer_sku,
      productTitle: l.product_title,
      quantity: l.quantity,
      price: l.price,
      totalPrice: l.total_price,
    })),
  };
}

// ─── HTTP executor ──────────────────────────────────────────────────────────────
async function miraklRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MIRAKL_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: MIRAKL_API_KEY,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mirakl API error ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

// ─── OR11 — fetch orders waiting for seller acceptance ─────────────────────────
export async function fetchNewOrders(): Promise<MiraklOrder[]> {
  const data = await miraklRequest<MiraklOrdersResponse>(
    "/orders?order_state_codes=WAITING_ACCEPTANCE"
  );
  return data.orders.map(mapOrder);
}

// ─── OR23 — accept an order (all lines) ────────────────────────────────────────
export async function acceptOrder(orderId: string, lineIds: string[]): Promise<void> {
  await miraklRequest(`/orders/${orderId}/accept`, {
    method: "PUT",
    body: JSON.stringify({
      order_lines: lineIds.map((id) => ({ id, accepted: true })),
    }),
  });
}

// ─── OR24 — push tracking info for a shipped order ─────────────────────────────
export async function shipOrder(
  orderId: string,
  tracking: { carrierName: string; trackingNumber: string; carrierUrl?: string }
): Promise<void> {
  await miraklRequest(`/orders/${orderId}/tracking`, {
    method: "PUT",
    body: JSON.stringify({
      carrier_name: tracking.carrierName,
      tracking_number: tracking.trackingNumber,
      carrier_url: tracking.carrierUrl,
    }),
  });
}
```

- [ ] **Step 6: Eseguire il test e verificare che passi**

Run: `cd backend && npx vitest run tests/mirakl/client.test.ts`
Expected: PASS (4 test)

- [ ] **Step 7: Validare contro l'API Mirakl reale (checkpoint, non automatizzabile)**

Con `MIRAKL_API_KEY` valida in `.env` (rigenerata dopo l'esposizione in chat, vedi design doc §8), esegui una chiamata di prova reale (es. uno script one-off temporaneo che chiama `fetchNewOrders()` e stampa il risultato) contro `https://shopapotheke.mirakl.net/api`. Confronta i nomi di campo effettivi con `RawMiraklOrder` sopra — se differiscono, correggi `mapOrder()` e i mock del test di conseguenza prima di procedere al Task 3.

- [ ] **Step 8: Commit**

```bash
git add backend/src/mirakl/client.ts backend/tests/mirakl/client.test.ts backend/tests/helpers/msw-server.ts backend/.env.example
git commit -m "feat(mirakl): add Mirakl Connector API client (fetch/accept/ship orders)"
```

---

### Task 3: Mapper puro Mirakl → Shopify (`orderMapper.ts`)

**Files:**
- Create: `backend/src/mirakl/orderMapper.ts`
- Test: `backend/tests/mirakl/orderMapper.test.ts`

**Interfaces:**
- Consumes: `MiraklOrder` da `../mirakl/client` (Task 2).
- Produces: `MappedOrder`, `MappedLineItem`, `mapMiraklOrder(order: MiraklOrder): MappedOrder` — usato da Task 5 (`syncOrders.job.ts`) e deve produrre l'input diretto per `CreateOrderInput` di Task 4 (stessa forma di `shippingAddress`, `lineItems: { sku, quantity }[]`).

- [ ] **Step 1: Scrivere il test (fallente)**

```typescript
// backend/tests/mirakl/orderMapper.test.ts
import { describe, it, expect } from "vitest";
import { mapMiraklOrder } from "../../src/mirakl/orderMapper";
import type { MiraklOrder } from "../../src/mirakl/client";

function makeOrder(overrides: Partial<MiraklOrder> = {}): MiraklOrder {
  return {
    orderId: "MK-1",
    orderState: "WAITING_ACCEPTANCE",
    createdDate: "2026-08-01T10:00:00Z",
    currencyIsoCode: "EUR",
    totalPrice: 44.97,
    customer: {
      email: "cliente@example.com",
      shippingAddress: {
        firstname: "Mario",
        lastname: "Rossi",
        street1: "Via Roma 1",
        street2: null,
        zipCode: "00100",
        city: "Roma",
        country: "Italy",
        countryIsoCode: "IT",
        phone: null,
      },
    },
    orderLines: [
      { id: "L1", offerSku: "SKU-001", productTitle: "Prodotto A", quantity: 2, price: 19.99, totalPrice: 39.98 },
    ],
    ...overrides,
  };
}

describe("mapMiraklOrder", () => {
  it("tags IT orders as redcare_it", () => {
    const mapped = mapMiraklOrder(makeOrder());
    expect(mapped.tag).toBe("redcare_it");
    expect(mapped.country).toBe("IT");
  });

  it("tags DE orders as redcare_de", () => {
    const order = makeOrder({
      customer: {
        email: "kunde@example.de",
        shippingAddress: {
          firstname: "Hans", lastname: "Muller", street1: "Hauptstr 1", street2: null,
          zipCode: "10115", city: "Berlin", country: "Germany", countryIsoCode: "DE", phone: null,
        },
      },
    });
    const mapped = mapMiraklOrder(order);
    expect(mapped.tag).toBe("redcare_de");
    expect(mapped.country).toBe("DE");
  });

  it("maps order lines to sku/quantity pairs", () => {
    const mapped = mapMiraklOrder(makeOrder());
    expect(mapped.lineItems).toEqual([{ sku: "SKU-001", quantity: 2 }]);
  });

  it("maps shipping address fields", () => {
    const mapped = mapMiraklOrder(makeOrder());
    expect(mapped.shippingAddress).toEqual({
      firstName: "Mario",
      lastName: "Rossi",
      address1: "Via Roma 1",
      address2: null,
      zip: "00100",
      city: "Roma",
      country: "IT",
      phone: null,
    });
  });

  it("carries currency, email and totalAmount through", () => {
    const mapped = mapMiraklOrder(makeOrder());
    expect(mapped.currency).toBe("EUR");
    expect(mapped.email).toBe("cliente@example.com");
    expect(mapped.totalAmount).toBe(44.97);
  });

  it("throws when the order has no line items", () => {
    const order = makeOrder({ orderLines: [] });
    expect(() => mapMiraklOrder(order)).toThrow(/nessuna riga|non ha righe/i);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx vitest run tests/mirakl/orderMapper.test.ts`
Expected: FAIL — `Cannot find module '../../src/mirakl/orderMapper'`

- [ ] **Step 3: Implementare il mapper**

```typescript
// backend/src/mirakl/orderMapper.ts
// orderMapper.ts — Pure mapping from a Mirakl order to the shape needed to
// create a Shopify order. No network calls, no Prisma — easy to unit test.
import type { MiraklOrder } from "./client";

export interface MappedLineItem {
  sku: string;
  quantity: number;
}

export interface MappedShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string | null;
  zip: string;
  city: string;
  country: string;
  phone: string | null;
}

export interface MappedOrder {
  tag: "redcare_it" | "redcare_de";
  country: "IT" | "DE";
  currency: string;
  email: string | null;
  totalAmount: number;
  shippingAddress: MappedShippingAddress;
  lineItems: MappedLineItem[];
}

export function mapMiraklOrder(order: MiraklOrder): MappedOrder {
  if (order.orderLines.length === 0) {
    throw new Error(`Ordine Mirakl ${order.orderId} non ha righe`);
  }

  const addr = order.customer.shippingAddress;
  const country: "IT" | "DE" = addr.countryIsoCode.toUpperCase() === "DE" ? "DE" : "IT";
  const tag: "redcare_it" | "redcare_de" = country === "DE" ? "redcare_de" : "redcare_it";

  return {
    tag,
    country,
    currency: order.currencyIsoCode,
    email: order.customer.email,
    totalAmount: order.totalPrice,
    shippingAddress: {
      firstName: addr.firstname,
      lastName: addr.lastname,
      address1: addr.street1,
      address2: addr.street2,
      zip: addr.zipCode,
      city: addr.city,
      country: addr.countryIsoCode,
      phone: addr.phone,
    },
    lineItems: order.orderLines.map((l) => ({
      sku: l.offerSku,
      quantity: l.quantity,
    })),
  };
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && npx vitest run tests/mirakl/orderMapper.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/mirakl/orderMapper.ts backend/tests/mirakl/orderMapper.test.ts
git commit -m "feat(mirakl): add pure Mirakl order -> Shopify input mapper"
```

---

### Task 4: Estendere `shopify.service.ts` con lookup SKU e `createOrder`

**Files:**
- Modify: `backend/src/services/shopify.service.ts` (aggiunte in fondo al file, dopo `logError`)
- Test: `backend/tests/services/shopify-create-order.test.ts`
- Modify: `backend/tests/helpers/msw-server.ts` (nuovi handler dentro `shopifyMocks`)

**Interfaces:**
- Consumes: `MappedOrder`/`MappedShippingAddress` — non importati direttamente, ma `CreateOrderInput` qui definito ha la stessa forma di `MappedOrder` meno `tag`/`lineItems.sku` (Task 5 fa il ponte, risolvendo `sku` → `variantId`).
- Produces: `findVariantIdBySku(sku: string): Promise<string | null>`, `CreateOrderInput`, `createOrder(input: CreateOrderInput): Promise<{ id: string; name: string }>` — usati da Task 5.

- [ ] **Step 1: Aggiungere i nuovi mock MSW**

Aggiungi dentro l'oggetto `shopifyMocks` in `backend/tests/helpers/msw-server.ts` (dopo `networkError`, prima della `}` di chiusura):

```typescript
  /** productVariants(query: "sku:...") — usato da findVariantIdBySku */
  variantBySku: (skuToVariantId: Record<string, string>) =>
    http.post(
      /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
      async ({ request }) => {
        const body: any = await request.json();
        const query: string = body.variables?.query ?? "";
        const sku = query.replace("sku:", "");
        const variantId = skuToVariantId[sku];
        return HttpResponse.json({
          data: {
            productVariants: {
              edges: variantId ? [{ node: { id: variantId } }] : [],
            },
          },
        });
      },
    ),

  /** orderCreate mutation */
  orderCreate: (result: { id: string; name: string } | { userErrors: Array<{ field: string[]; message: string }> }) =>
    http.post(
      /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
      async () =>
        HttpResponse.json({
          data: {
            orderCreate:
              "id" in result
                ? { order: result, userErrors: [] }
                : { order: null, userErrors: result.userErrors },
          },
        }),
    ),
```

- [ ] **Step 2: Scrivere il test (fallente)**

```typescript
// backend/tests/services/shopify-create-order.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { shopifyMocks } from "../helpers/msw-server";

const server = setupServer();

describe("shopify.service — findVariantIdBySku / createOrder", () => {
  let findVariantIdBySku: typeof import("../../src/services/shopify.service").findVariantIdBySku;
  let createOrder: typeof import("../../src/services/shopify.service").createOrder;

  beforeAll(async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test-shop.myshopify.com";
    process.env.SHOPIFY_ADMIN_TOKEN = "shpat_test_token";

    const svc = await import("../../src/services/shopify.service");
    findVariantIdBySku = svc.findVariantIdBySku;
    createOrder = svc.createOrder;

    server.listen({ onUnhandledRequest: "error" });
  });

  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it("findVariantIdBySku returns the variant gid when found", async () => {
    server.use(shopifyMocks.variantBySku({ "SKU-001": "gid://shopify/ProductVariant/1" }));
    const id = await findVariantIdBySku("SKU-001");
    expect(id).toBe("gid://shopify/ProductVariant/1");
  });

  it("findVariantIdBySku returns null when not found", async () => {
    server.use(shopifyMocks.variantBySku({}));
    const id = await findVariantIdBySku("UNKNOWN");
    expect(id).toBeNull();
  });

  it("createOrder returns the created order id/name on success", async () => {
    server.use(shopifyMocks.orderCreate({ id: "gid://shopify/Order/999", name: "#999" }));

    const order = await createOrder({
      email: "cliente@example.com",
      tags: ["redcare_it"],
      note: "Importato da Mirakl — ordine MK-1",
      currency: "EUR",
      totalAmount: 44.97,
      shippingAddress: {
        firstName: "Mario", lastName: "Rossi", address1: "Via Roma 1", address2: null,
        zip: "00100", city: "Roma", country: "IT", phone: null,
      },
      lineItems: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 2 }],
    });

    expect(order).toEqual({ id: "gid://shopify/Order/999", name: "#999" });
  });

  it("createOrder throws when Shopify returns userErrors", async () => {
    server.use(shopifyMocks.orderCreate({ userErrors: [{ field: ["order", "lineItems"], message: "Invalid variant" }] }));

    await expect(
      createOrder({
        email: null,
        tags: ["redcare_it"],
        note: "test",
        currency: "EUR",
        totalAmount: 10,
        shippingAddress: {
          firstName: "A", lastName: "B", address1: "X", address2: null,
          zip: "00100", city: "Roma", country: "IT", phone: null,
        },
        lineItems: [{ variantId: "gid://shopify/ProductVariant/bad", quantity: 1 }],
      }),
    ).rejects.toThrow(/Invalid variant/);
  });
});
```

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx vitest run tests/services/shopify-create-order.test.ts`
Expected: FAIL — `findVariantIdBySku is not a function` / `createOrder is not a function`

- [ ] **Step 4: Implementare in `shopify.service.ts`**

Aggiungi in fondo a `backend/src/services/shopify.service.ts` (dopo `logError`, riga 251):

```typescript
// ─── Find variant by SKU (used by Mirakl order sync) ──────────────────────────
const VARIANT_BY_SKU_QUERY = `
  query FindVariantBySku($query: String!) {
    productVariants(first: 1, query: $query) {
      edges { node { id } }
    }
  }
`;

export async function findVariantIdBySku(sku: string): Promise<string | null> {
  const data = await gqlRequest<{
    productVariants: { edges: Array<{ node: { id: string } }> };
  }>(VARIANT_BY_SKU_QUERY, { query: `sku:${sku}` });
  return data.productVariants.edges[0]?.node.id ?? null;
}

// ─── Create order (used by Mirakl sync — orders arrive already paid) ─────────
const ORDER_CREATE_MUTATION = `
  mutation CreateOrder($order: OrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order { id name }
      userErrors { field message }
    }
  }
`;

export interface CreateOrderInput {
  email: string | null;
  tags: string[];
  note: string;
  currency: string;
  totalAmount: number;
  shippingAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string | null;
    zip: string;
    city: string;
    country: string;
    phone: string | null;
  };
  lineItems: Array<{ variantId: string; quantity: number }>;
}

export async function createOrder(
  input: CreateOrderInput
): Promise<{ id: string; name: string }> {
  const data = await gqlRequest<{
    orderCreate: {
      order: { id: string; name: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(ORDER_CREATE_MUTATION, {
    order: {
      email: input.email,
      tags: input.tags,
      note: input.note,
      currency: input.currency,
      lineItems: input.lineItems.map((li) => ({
        variantId: li.variantId,
        quantity: li.quantity,
      })),
      shippingAddress: input.shippingAddress,
      transactions: [
        {
          kind: "SALE",
          status: "SUCCESS",
          gateway: "Mirakl",
          amountSet: {
            shopMoney: { amount: input.totalAmount.toFixed(2), currencyCode: input.currency },
          },
        },
      ],
    },
    options: {
      inventoryBehaviour: "DECREMENT_OBEYING_POLICY",
    },
  });

  if (data.orderCreate.userErrors.length > 0) {
    throw new Error(`Shopify orderCreate errors: ${JSON.stringify(data.orderCreate.userErrors)}`);
  }
  if (!data.orderCreate.order) {
    throw new Error("Shopify orderCreate returned no order and no userErrors");
  }

  return data.orderCreate.order;
}
```

- [ ] **Step 5: Eseguire il test e verificare che passi**

Run: `cd backend && npx vitest run tests/services/shopify-create-order.test.ts`
Expected: PASS (4 test)

- [ ] **Step 6: Validare contro l'Admin GraphQL reale (checkpoint, non automatizzabile)**

Con `SHOPIFY_ADMIN_TOKEN` reale, esegui la mutation `orderCreate` (con `options.inventoryBehaviour: BYPASS` per non toccare scorte reali) contro un ordine di prova per confermare che l'app custom abbia lo scope `write_orders` con permesso di creazione ordini — è il rischio esplicitamente segnalato nel design doc §10. Se la mutation viene rifiutata per permessi, fermarsi e discutere col proprietario dello store prima di proseguire al Task 5 (l'intero flusso dipende da questo).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/shopify.service.ts backend/tests/services/shopify-create-order.test.ts backend/tests/helpers/msw-server.ts
git commit -m "feat(shopify): add findVariantIdBySku and createOrder to shopify.service"
```

---

### Task 5: Job periodico di sync (`syncOrders.job.ts`)

**Files:**
- Create: `backend/src/mirakl/syncOrders.job.ts`
- Test: `backend/tests/mirakl/syncOrders.job.test.ts`

**Interfaces:**
- Consumes: `fetchNewOrders`, `acceptOrder` (Task 2), `mapMiraklOrder` (Task 3), `findVariantIdBySku`, `createOrder`, `logError` (Task 4 / esistente), `findByMiraklOrderId`, `createPendingAcceptOrder`, `markAccepted` (Task 1).
- Produces: `runMiraklSync(): Promise<{ created: number; accepted: number; errors: number }>`, `startMiraklPolling(intervalMs?: number): void` — usati da Task 7 (`server.ts`).

- [ ] **Step 1: Scrivere il test di integrazione (fallente)**

```typescript
// backend/tests/mirakl/syncOrders.job.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";
import { miraklMocks, shopifyMocks, http, HttpResponse } from "../helpers/msw-server";

const server = setupServer();

function miraklOrderPayload(overrides: Record<string, any> = {}) {
  return {
    order_id: "MK-1",
    order_state: "WAITING_ACCEPTANCE",
    created_date: "2026-08-01T10:00:00Z",
    currency_iso_code: "EUR",
    total_price: 39.98,
    customer: {
      email: "cliente@example.com",
      shipping_address: {
        firstname: "Mario", lastname: "Rossi", street_1: "Via Roma 1", street_2: null,
        zip_code: "00100", city: "Roma", country: "Italy", country_iso_code: "IT", phone: null,
      },
    },
    order_lines: [
      { id: "L1", offer_sku: "SKU-001", product_title: "Prodotto A", quantity: 2, price: 19.99, total_price: 39.98 },
    ],
    ...overrides,
  };
}

describe("runMiraklSync", () => {
  let db: TestDb;
  let runMiraklSync: typeof import("../../src/mirakl/syncOrders.job").runMiraklSync;

  beforeAll(async () => {
    db = await setupTestDb();

    process.env.DATABASE_URL = db.databaseUrl;
    process.env.SHOPIFY_STORE_DOMAIN = "test-shop.myshopify.com";
    process.env.SHOPIFY_ADMIN_TOKEN = "shpat_test_token";
    process.env.MIRAKL_API_URL = "https://shopapotheke.mirakl.net/api";
    process.env.MIRAKL_API_KEY = "test-key";

    const job = await import("../../src/mirakl/syncOrders.job");
    runMiraklSync = job.runMiraklSync;

    server.listen({ onUnhandledRequest: "error" });
  }, 120_000);

  afterAll(async () => {
    server.close();
    await db.cleanup();
  });

  beforeEach(async () => {
    await truncateAll(db.prisma);
  });

  afterEach(() => server.resetHandlers());

  it("happy path: creates a Shopify order, saves MiraklOrder, accepts on Mirakl", async () => {
    server.use(miraklMocks.newOrders([miraklOrderPayload()]));
    server.use(shopifyMocks.variantBySku({ "SKU-001": "gid://shopify/ProductVariant/1" }));
    server.use(shopifyMocks.orderCreate({ id: "gid://shopify/Order/999", name: "#999" }));
    server.use(miraklMocks.acceptOrder());

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 1, accepted: 1, errors: 0 });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-1" } });
    expect(row?.shopifyOrderId).toBe("gid://shopify/Order/999");
    expect(row?.miraklState).toBe("ACCEPTED");
    expect(row?.country).toBe("IT");
  });

  it("idempotency: an order already synced (state ACCEPTED) is not recreated on Shopify", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-1",
        shopifyOrderId: "gid://shopify/Order/999",
        country: "IT",
        miraklState: "ACCEPTED",
      },
    });

    // No orderCreate/accept handler registered — if the job tried to call them
    // with onUnhandledRequest:'error' the test would fail.
    server.use(miraklMocks.newOrders([miraklOrderPayload()]));

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 0, accepted: 0, errors: 0 });

    const count = await db.prisma.miraklOrder.count();
    expect(count).toBe(1);
  });

  it("retries only acceptOrder when Shopify order exists but is still PENDING_ACCEPT", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-1",
        shopifyOrderId: "gid://shopify/Order/999",
        country: "IT",
        miraklState: "PENDING_ACCEPT",
      },
    });

    server.use(miraklMocks.newOrders([miraklOrderPayload()]));
    server.use(miraklMocks.acceptOrder());
    // No orderCreate/variantBySku handler — creating a Shopify order here
    // would hit onUnhandledRequest:'error' and fail the test.

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 0, accepted: 1, errors: 0 });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-1" } });
    expect(row?.miraklState).toBe("ACCEPTED");
  });

  it("missing SKU: logs the error, does not accept on Mirakl, no MiraklOrder row created", async () => {
    server.use(miraklMocks.newOrders([miraklOrderPayload()]));
    server.use(shopifyMocks.variantBySku({})); // SKU-001 not found

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 0, accepted: 0, errors: 1 });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-1" } });
    expect(row).toBeNull();

    const errors = await db.prisma.appErrorLog.findMany({ where: { source: "mirakl-sync" } });
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/SKU-001/);
  });

  it("Mirakl OR11 failure: returns errors=1, no orders processed", async () => {
    server.use(miraklMocks.httpError(500, "boom"));

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 0, accepted: 0, errors: 1 });
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx vitest run tests/mirakl/syncOrders.job.test.ts`
Expected: FAIL — `Cannot find module '../../src/mirakl/syncOrders.job'`

- [ ] **Step 3: Implementare il job**

```typescript
// backend/src/mirakl/syncOrders.job.ts
// syncOrders.job.ts — Mirakl (Redcare) order sync: WAITING_ACCEPTANCE -> Shopify order -> Mirakl accept.
// Standalone: nessuna dipendenza da backend/src/amazon/**.
import { prisma } from "../db";
import { fetchNewOrders, acceptOrder } from "./client";
import { mapMiraklOrder } from "./orderMapper";
import { findVariantIdBySku, createOrder, logError } from "../services/shopify.service";
import {
  findByMiraklOrderId,
  createPendingAcceptOrder,
  markAccepted,
} from "../repositories/mirakl/orders.repo";

export async function runMiraklSync(): Promise<{ created: number; accepted: number; errors: number }> {
  let created = 0;
  let accepted = 0;
  let errors = 0;

  let orders;
  try {
    orders = await fetchNewOrders();
  } catch (err) {
    await logError("mirakl-sync", err);
    return { created, accepted, errors: 1 };
  }

  for (const order of orders) {
    try {
      let existing = await findByMiraklOrderId(prisma, order.orderId);

      if (!existing) {
        const mapped = mapMiraklOrder(order);

        const lineItems: Array<{ variantId: string; quantity: number }> = [];
        for (const item of mapped.lineItems) {
          const variantId = await findVariantIdBySku(item.sku);
          if (!variantId) {
            throw new Error(
              `Nessuna variante Shopify trovata per SKU "${item.sku}" (ordine Mirakl ${order.orderId})`
            );
          }
          lineItems.push({ variantId, quantity: item.quantity });
        }

        const shopifyOrder = await createOrder({
          email: mapped.email,
          tags: [mapped.tag],
          note: `Importato da Mirakl — ordine ${order.orderId}`,
          currency: mapped.currency,
          totalAmount: mapped.totalAmount,
          shippingAddress: mapped.shippingAddress,
          lineItems,
        });

        existing = await createPendingAcceptOrder(prisma, {
          miraklOrderId: order.orderId,
          shopifyOrderId: shopifyOrder.id,
          country: mapped.country,
        });
        created++;
      }

      if (existing.miraklState === "PENDING_ACCEPT") {
        await acceptOrder(order.orderId, order.orderLines.map((l) => l.id));
        await markAccepted(prisma, order.orderId);
        accepted++;
      }
    } catch (err) {
      errors++;
      await logError("mirakl-sync", err, { miraklOrderId: order.orderId });
    }
  }

  return { created, accepted, errors };
}

export function startMiraklPolling(intervalMs = 300_000): void {
  console.log(`[Mirakl] Polling started (every ${intervalMs / 1000}s)`);
  setInterval(() => {
    runMiraklSync().catch((err) => logError("mirakl-polling", err));
  }, intervalMs);
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && npx vitest run tests/mirakl/syncOrders.job.test.ts`
Expected: PASS (5 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/mirakl/syncOrders.job.ts backend/tests/mirakl/syncOrders.job.test.ts
git commit -m "feat(mirakl): add periodic sync job (Mirakl orders -> Shopify -> Mirakl accept)"
```

---

### Task 6: Webhook `fulfillments/create` → tracking verso Mirakl

**Files:**
- Modify: `backend/src/webhooks/webhooks.ts`
- Test: `backend/tests/webhooks/mirakl-fulfillment.test.ts`

**Interfaces:**
- Consumes: `shipOrder` (Task 2), `findByShopifyOrderId`, `markShipped` (Task 1).
- Produces: nessuna nuova funzione esportata — comportamento osservabile via side-effect (chiamata Mirakl + riga `MiraklOrder` aggiornata).

- [ ] **Step 1: Scrivere il test (fallente)**

```typescript
// backend/tests/webhooks/mirakl-fulfillment.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";
import { miraklMocks, http, HttpResponse } from "../helpers/msw-server";

const server = setupServer();

function makeReqRes(headers: Record<string, string>, body: Record<string, any>) {
  const req: any = {
    headers,
    body,
    rawBody: Buffer.from(JSON.stringify(body)),
  };
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.payload = payload; return this; },
  };
  return { req, res };
}

describe("webhook: fulfillments/create -> Mirakl tracking", () => {
  let db: TestDb;
  let handleWebhook: typeof import("../../src/webhooks/webhooks").handleWebhook;

  beforeAll(async () => {
    db = await setupTestDb();

    process.env.DATABASE_URL = db.databaseUrl;
    process.env.SHOPIFY_STORE_DOMAIN = "test-shop.myshopify.com";
    process.env.SHOPIFY_ADMIN_TOKEN = "shpat_test_token";
    process.env.SHOPIFY_WEBHOOK_SECRET = ""; // dev mode: HMAC check skipped
    process.env.MIRAKL_API_URL = "https://shopapotheke.mirakl.net/api";
    process.env.MIRAKL_API_KEY = "test-key";

    const webhooks = await import("../../src/webhooks/webhooks");
    handleWebhook = webhooks.handleWebhook;

    server.listen({ onUnhandledRequest: "error" });
  }, 120_000);

  afterAll(async () => {
    server.close();
    await db.cleanup();
  });

  beforeEach(async () => {
    await truncateAll(db.prisma);
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  it("pushes tracking to Mirakl and marks the row SHIPPED", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-1",
        shopifyOrderId: "gid://shopify/Order/999",
        country: "IT",
        miraklState: "ACCEPTED",
      },
    });

    let capturedTracking: any = null;
    server.use(
      http.put(/mirakl\.net\/api\/orders\/MK-1\/tracking/, async ({ request }) => {
        capturedTracking = await request.json();
        return HttpResponse.json({});
      }),
    );

    const { req, res } = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-order-id": "999", "x-shopify-hmac-sha256": "" },
      { order_id: 999, tracking_number: "TRACK-1", tracking_company: "BRT" },
    );

    await handleWebhook(req, res);
    // Processing happens in setImmediate — wait one tick.
    await new Promise((r) => setImmediate(r));

    expect(capturedTracking).toEqual({
      carrier_name: "BRT",
      tracking_number: "TRACK-1",
      carrier_url: undefined,
    });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-1" } });
    expect(row?.miraklState).toBe("SHIPPED");
    expect(row?.trackingNumber).toBe("TRACK-1");
  });

  it("no-op for a Shopify order with no MiraklOrder row (non-Redcare order)", async () => {
    // No miraklMocks.shipOrder registered — if the webhook called Mirakl it
    // would hit onUnhandledRequest:'error' and fail the test.
    const { req, res } = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-order-id": "111", "x-shopify-hmac-sha256": "" },
      { order_id: 111, tracking_number: "TRACK-X", tracking_company: "DHL" },
    );

    await handleWebhook(req, res);
    await new Promise((r) => setImmediate(r));

    const count = await db.prisma.miraklOrder.count();
    expect(count).toBe(0); // nothing created, nothing crashed
  });

  it("idempotent: a second fulfillment webhook for an already-synced order does not call Mirakl again", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-2",
        shopifyOrderId: "gid://shopify/Order/2",
        country: "IT",
        miraklState: "SHIPPED",
        trackingNumber: "TRACK-2",
        trackingSyncedAt: new Date(),
      },
    });

    // No miraklMocks.shipOrder registered on purpose.
    const { req, res } = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-order-id": "2", "x-shopify-hmac-sha256": "" },
      { order_id: 2, tracking_number: "TRACK-2-RETRY", tracking_company: "BRT" },
    );

    await handleWebhook(req, res);
    await new Promise((r) => setImmediate(r));

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-2" } });
    expect(row?.trackingNumber).toBe("TRACK-2"); // unchanged
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx vitest run tests/webhooks/mirakl-fulfillment.test.ts`
Expected: FAIL — il caso `fulfillments/create` non esiste ancora, i tre test falliscono sulle asserzioni.

- [ ] **Step 3: Estendere `webhooks.ts`**

Modifica gli import in cima a `backend/src/webhooks/webhooks.ts` (righe 1-8):

```typescript
// webhooks.ts — Shopify webhook endpoint with HMAC verification
import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../db";
import { fetchOrderById, logError } from "../services/shopify.service";
import { upsertOrder } from "../services/order.service";
import { broadcast } from "../sse/sse";
import { findOrderForBroadcast } from "../repositories/shopify/orders.repo";
import { findByShopifyOrderId, markShipped } from "../repositories/mirakl/orders.repo";
import { shipOrder } from "../mirakl/client";
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";
```

Modifica il blocco `if (topic === "orders/create" ...)` (righe 54-83) aggiungendo un `else if` per il nuovo topic:

```typescript
      if (
        topic === "orders/create" ||
        topic === "orders/updated" ||
        topic === "orders/cancelled"
      ) {
        // Re-fetch from Shopify API for full payload (webhook body may be partial)
        const gid = `gid://shopify/Order/${shopifyId}`;
        const fullOrder = await fetchOrderById(gid);
        if (fullOrder) {
          await upsertOrder(fullOrder);

          // Broadcast live event to SSE clients (only for new orders, not updates/cancellations)
          if (topic === "orders/create") {
            try {
              const saved = await findOrderForBroadcast(prisma, shopifyId);
              if (saved) {
                broadcast("order:new", {
                  source:      "shopify",
                  orderName:   saved.orderName,
                  total:       saved.totalAmount,
                  marketplace: saved.marketplaceDetected,
                  ts:          saved.createdAt.toISOString(),
                });
              }
            } catch {
              // broadcast failure must never crash the webhook handler
            }
          }
        }
      } else if (topic === "fulfillments/create") {
        // Order shipped on Shopify -> push tracking to Mirakl if this order
        // was created from a Mirakl (Redcare) order and tracking wasn't
        // already synced (idempotency across duplicate/retried webhooks).
        const gid = `gid://shopify/Order/${shopifyId}`;
        const miraklOrder = await findByShopifyOrderId(prisma, gid);
        if (miraklOrder && !miraklOrder.trackingSyncedAt) {
          const trackingNumber: string | null =
            payload.tracking_number ?? payload.tracking_numbers?.[0] ?? null;
          if (trackingNumber) {
            await shipOrder(miraklOrder.miraklOrderId, {
              carrierName: payload.tracking_company ?? "N/D",
              trackingNumber,
              carrierUrl: payload.tracking_url ?? payload.tracking_urls?.[0],
            });
            await markShipped(prisma, gid, trackingNumber);
          }
        }
      }
```

- [ ] **Step 4: Registrare il nuovo topic nel webhook Shopify**

Il topic `fulfillments/create` va anche abilitato lato Shopify (Impostazioni → Notifiche → Webhook, oppure via `webhookSubscriptionCreate` se gestito a codice altrove nel repo — verificare se esiste già un meccanismo di registrazione webhook prima di aggiungerne uno nuovo; se i webhook sono configurati manualmente da pannello Shopify, come sembra dal codice attuale che non contiene chiamate `webhookSubscriptionCreate`, questo è un passo operativo da fare a mano nell'admin Shopify, non un task di codice).

- [ ] **Step 5: Eseguire il test e verificare che passi**

Run: `cd backend && npx vitest run tests/webhooks/mirakl-fulfillment.test.ts`
Expected: PASS (3 test)

- [ ] **Step 6: Eseguire l'intera suite webhook esistente per verificare nessuna regressione**

Run: `cd backend && npx vitest run tests/webhooks`
Expected: PASS — tutti i test esistenti (`orders/create`, `orders/updated`, `orders/cancelled`) continuano a passare invariati.

- [ ] **Step 7: Commit**

```bash
git add backend/src/webhooks/webhooks.ts backend/tests/webhooks/mirakl-fulfillment.test.ts
git commit -m "feat(webhooks): push shipment tracking to Mirakl on fulfillments/create"
```

---

### Task 7: Wiring in `server.ts` + configurazione

**Files:**
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `startMiraklPolling` (Task 5).
- Produces: nessuna — task di collegamento finale.

- [ ] **Step 1: Aggiungere l'import**

Modifica l'import esistente in `backend/src/server.ts` riga 21 (subito dopo l'import Amazon, per chiarezza di lettura ma senza alcuna dipendenza tra i due):

```typescript
import { startAmazonPolling, startAmazonSnapshotPolling, forEachActiveAccount } from "./amazon/sync.job";
import { startMiraklPolling } from "./mirakl/syncOrders.job";
```

- [ ] **Step 2: Avviare il polling, gated dalla presenza della API key**

Modifica il blocco finale di `bootstrap()` in `backend/src/server.ts` (dopo il blocco `// ── Amazon module ──`, righe 194-224), aggiungendo un blocco analogo ma indipendente:

```typescript
  // ── Mirakl module (Redcare / Shop-Apotheke) ──
  if (process.env.MIRAKL_API_KEY) {
    startMiraklPolling();
  } else {
    console.log("[Server] Mirakl module disabled (MIRAKL_API_KEY not set)");
  }
```

- [ ] **Step 3: Verificare la build TypeScript**

Run: `cd backend && npx tsc --noEmit`
Expected: nessun errore di tipo.

- [ ] **Step 4: Eseguire l'intera suite di test del backend**

Run: `cd backend && npm test`
Expected: PASS — tutti i test esistenti più i nuovi test Mirakl (Task 1-6), nessuna regressione.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat(server): wire up Mirakl polling job, gated by MIRAKL_API_KEY"
```

---

## Self-Review

**1. Copertura spec:** §3 Componenti → Task 1-6 (un file per task). §4 Modello dati → Task 1. §5 Flusso Mirakl→Shopify → Task 2, 3, 4, 5. §6 Flusso Shopify→Mirakl → Task 6. §7 Errori/coerenza → gestito in Task 5 (try/catch per ordine, nessun accept senza Shopify confermato) e Task 6 (idempotenza via `trackingSyncedAt`). §8 Configurazione → Task 2 (.env.example) e Task 7 (gating). §9 Testing → un file di test per componente, stesso pattern Testcontainers+MSW del resto del repo. Nessuna sezione del design senza task corrispondente.

**2. Placeholder:** nessun TBD/TODO residuo; ogni step ha codice completo o un comando eseguibile con output atteso esplicito.

**3. Coerenza dei tipi:** `MiraklOrder` (client, Task 2) → consumato identico in Task 3 e Task 5. `MappedOrder`/`MappedLineItem`/`MappedShippingAddress` (Task 3) → i campi di `shippingAddress` e `lineItems` combaciano esattamente con `CreateOrderInput` (Task 4) come consumato in Task 5. `MiraklOrder` (modello Prisma, Task 1) → stessi nomi di funzione (`findByMiraklOrderId`, `findByShopifyOrderId`, `createPendingAcceptOrder`, `markAccepted`, `markShipped`) usati identicamente in Task 5 e Task 6, nessuna divergenza tra le firme dichiarate nei blocchi "Produces" e quelle usate a valle.

---

## Prossimo step

Piano pronto per l'esecuzione. Due opzioni:

1. **Subagent-Driven (consigliato)** — un subagent per task, review tra un task e l'altro.
2. **Inline Execution** — esecuzione in questa sessione con checkpoint di revisione a batch.
