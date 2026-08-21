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
    total_price: 44.97,   // 39.98 di righe + 4.99 di spedizione
    shipping_price: 4.99,
    channel: { code: "IT", label: "Canale IT" },
    customer_notification_email: "cliente@example.com",
    customer: {
      shipping_address: {
        firstname: "Mario", lastname: "Rossi", street_1: "Via Roma 1", street_2: null,
        zip_code: "00100", city: "Roma", country: "Italy", country_iso_code: "ITA", phone: null,
      },
    },
    order_lines: [
      // price_unit = prezzo unitario, price = totale di riga (2 * 19.99)
      { order_line_id: "L1", offer_sku: "SKU-001", product_title: "Prodotto A", quantity: 2, price_unit: 19.99, price: 39.98, total_price: 44.97 },
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
    server.use(shopifyMocks.orderByTag(null)); // no recovery match — proceeds to create
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

  it("RECEIVED order (Mirakl already accepted it): creates the Shopify order but does NOT call Mirakl's accept endpoint", async () => {
    // Verificato contro l'account reale (2026-08-16): questo canale non produce
    // mai ordini in WAITING_ACCEPTANCE, arrivano già RECEIVED/AUTO_RECEIVED —
    // chiamare comunque l'accettazione sarebbe una scrittura Mirakl inutile
    // (nessun handler miraklMocks.acceptOrder() registrato: se il job la
    // chiamasse comunque, onUnhandledRequest:'error' farebbe fallire il test).
    server.use(miraklMocks.newOrders([miraklOrderPayload({ order_state: "RECEIVED" })]));
    server.use(shopifyMocks.orderByTag(null));
    server.use(shopifyMocks.variantBySku({ "SKU-001": "gid://shopify/ProductVariant/1" }));
    server.use(shopifyMocks.orderCreate({ id: "gid://shopify/Order/998", name: "#998" }));

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 1, accepted: 1, errors: 0 });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-1" } });
    expect(row?.shopifyOrderId).toBe("gid://shopify/Order/998");
    expect(row?.miraklState).toBe("ACCEPTED");
  });

  it("sends the UNIT price, a shipping line and the real Mirakl line ids downstream", async () => {
    let orderCreateVars: any = null;
    let acceptBody: any = null;

    server.use(
      miraklMocks.newOrders([miraklOrderPayload()]),
      shopifyMocks.orderByTag(null),
      shopifyMocks.variantBySku({ "SKU-001": "gid://shopify/ProductVariant/1" }),
      http.post(
        /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
        async ({ request }) => {
          const body: any = await request.clone().json();
          if (!body?.query?.includes("orderCreate")) return; // non è mio
          orderCreateVars = body.variables;
          return HttpResponse.json({
            data: {
              orderCreate: {
                order: { id: "gid://shopify/Order/999", name: "#999" },
                userErrors: [],
              },
            },
          });
        },
      ),
      http.put(/mirakl\.net\/api\/orders\/MK-1\/accept/, async ({ request }) => {
        acceptBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 1, accepted: 1, errors: 0 });

    // Prezzo unitario (19.99), NON il totale di riga (39.98): altrimenti
    // Shopify calcolerebbe 39.98 * 2 e il fatturato risulterebbe doppio.
    const lineItem = orderCreateVars.order.lineItems[0];
    expect(lineItem.priceSet.shopMoney.amount).toBe("19.99");
    expect(lineItem.quantity).toBe(2);
    expect(lineItem.requiresShipping).toBe(true);

    // La spedizione viaggia come shippingLines, così la somma delle righe
    // riconcilia con l'importo della transazione (44.97).
    expect(orderCreateVars.order.shippingLines).toEqual([
      { title: "Spedizione", priceSet: { shopMoney: { amount: "4.99", currencyCode: "EUR" } } },
    ]);
    expect(orderCreateVars.order.transactions[0].amountSet.shopMoney.amount).toBe("44.97");

    // Gli id riga vengono da order_line_id sul wire: se leggessimo un campo
    // `id` inesistente, JSON.stringify li eliminerebbe e Mirakl non
    // accetterebbe nulla.
    expect(acceptBody).toEqual({ order_lines: [{ id: "L1", accepted: true }] });
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
    server.use(shopifyMocks.orderByTag(null)); // no recovery match — proceeds to create
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

  it("recovery: a Shopify order already tagged for this Mirakl order is reused, not recreated", async () => {
    // No MiraklOrder row locally (as if createPendingAcceptOrder failed after
    // a prior createOrder() succeeded) — the job must find the existing
    // Shopify order by its mirakl:<id> tag instead of creating a duplicate.
    server.use(miraklMocks.newOrders([miraklOrderPayload()]));
    server.use(shopifyMocks.orderByTag({ id: "gid://shopify/Order/999", name: "#999" }));
    server.use(miraklMocks.acceptOrder());
    // No variantBySku/orderCreate handler registered — with onUnhandledRequest:
    // 'error' the test fails if the job tries to create a Shopify order again.

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 1, accepted: 1, errors: 0 });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-1" } });
    expect(row?.shopifyOrderId).toBe("gid://shopify/Order/999");
    expect(row?.miraklState).toBe("ACCEPTED");
  });

  it("ordine con tracking già presente su Mirakl (spedito prima ancora di essere sincronizzato): viene creato, accettato E marcato spedito su Shopify nello stesso run", async () => {
    server.use(miraklMocks.newOrders([miraklOrderPayload({
      order_state: "RECEIVED",
      shipping_tracking: "1UW1TJV556027",
      shipping_tracking_url: "https://www.poste.it/cerca/index.html#/risultati-spedizioni/1UW1TJV556027",
      shipping_company: "Poste Italiane",
    })]));
    server.use(shopifyMocks.orderByTag(null));
    server.use(shopifyMocks.variantBySku({ "SKU-001": "gid://shopify/ProductVariant/1" }));
    server.use(shopifyMocks.orderCreate({ id: "gid://shopify/Order/999", name: "#999" }));
    server.use(shopifyMocks.fulfillment({
      fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
      result: { id: "gid://shopify/Fulfillment/1", status: "SUCCESS" },
    }));

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 1, accepted: 1, errors: 0 });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-1" } });
    expect(row?.miraklState).toBe("SHIPPED");
    expect(row?.trackingNumber).toBe("1UW1TJV556027");
    expect(row?.trackingSyncedAt).not.toBeNull();
  });

  it("ordine già ACCEPTED in un run precedente: se il tracking compare solo ora su Mirakl, viene marcato spedito", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-1",
        shopifyOrderId: "gid://shopify/Order/999",
        country: "IT",
        miraklState: "ACCEPTED",
      },
    });

    server.use(miraklMocks.newOrders([miraklOrderPayload({
      order_state: "RECEIVED",
      shipping_tracking: "1UW1TJV556027",
      shipping_company: "Poste Italiane",
    })]));
    // Nessun handler orderCreate/variantBySku/orderByTag: l'ordine esiste già
    // localmente come ACCEPTED, ricrearlo su Shopify farebbe fallire il test
    // (onUnhandledRequest: 'error').
    server.use(shopifyMocks.fulfillment({
      fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
      result: { id: "gid://shopify/Fulfillment/1", status: "SUCCESS" },
    }));

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 0, accepted: 0, errors: 0 });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-1" } });
    expect(row?.miraklState).toBe("SHIPPED");
    expect(row?.trackingNumber).toBe("1UW1TJV556027");
  });

  it("ordine già SHIPPED localmente: non tenta di rifare la fulfillment (idempotente)", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-1",
        shopifyOrderId: "gid://shopify/Order/999",
        country: "IT",
        miraklState: "SHIPPED",
        trackingNumber: "1UW1TJV556027",
        trackingSyncedAt: new Date(),
      },
    });

    // Nessun handler orderCreate/fulfillment registrato: se il job tentasse di
    // rifare la fulfillment fallirebbe per onUnhandledRequest: 'error'.
    server.use(miraklMocks.newOrders([miraklOrderPayload({
      order_state: "RECEIVED",
      shipping_tracking: "1UW1TJV556027",
      shipping_company: "Poste Italiane",
    })]));

    const result = await runMiraklSync();
    expect(result).toEqual({ created: 0, accepted: 0, errors: 0 });
  });

  it("markAcceptedWithRetry: logs distinctly under source 'mirakl-sync-stuck' and rethrows when the local write keeps failing", async () => {
    const job = await import("../../src/mirakl/syncOrders.job");

    // No MiraklOrder row exists for this id, so markAccepted's findUniqueOrThrow
    // fails on every attempt — simulates acceptOrder succeeding on Mirakl while
    // the local state write is permanently broken.
    await expect(job.markAcceptedWithRetry("MK-DOES-NOT-EXIST", 2)).rejects.toThrow();

    const errors = await db.prisma.appErrorLog.findMany({ where: { source: "mirakl-sync-stuck" } });
    expect(errors.length).toBe(1);
    expect(errors[0].context).toMatchObject({ miraklOrderId: "MK-DOES-NOT-EXIST" });
  });
});
