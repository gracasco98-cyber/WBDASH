// backend/tests/services/shopify-create-order.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { shopifyMocks, http, HttpResponse } from "../helpers/msw-server";

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

  it("findVariantIdBySku falls back to barcode: some Mirakl channels (Redcare/parafarmacia) send the EAN as offer_sku, not Shopify's internal SKU", async () => {
    let sentQuery: string | null = null;
    server.use(
      http.post(/myshopify\.com\/admin\/api\/.*\/graphql\.json/, async ({ request }) => {
        const body: any = await request.clone().json();
        if (!body?.query?.includes("productVariants")) return;
        sentQuery = body.variables?.query ?? null;
        // Nessuna variante ha questo valore come sku, ma una lo ha come barcode.
        return HttpResponse.json({
          data: { productVariants: { edges: [{ node: { id: "gid://shopify/ProductVariant/42" } }] } },
        });
      }),
    );

    const id = await findVariantIdBySku("8057358390019");

    expect(id).toBe("gid://shopify/ProductVariant/42");
    expect(sentQuery).toBe("(sku:8057358390019) OR (barcode:8057358390019)");
  });

  it("createOrder returns the created order id/name on success", async () => {
    server.use(shopifyMocks.orderCreate({ id: "gid://shopify/Order/999", name: "#999" }));

    const order = await createOrder({
      email: "cliente@example.com",
      tags: ["redcare_it"],
      note: "Importato da Mirakl — ordine MK-1",
      currency: "EUR",
      totalAmount: 44.97,
      shippingAmount: 4.99,
      shippingAddress: {
        firstName: "Mario", lastName: "Rossi", address1: "Via Roma 1", address2: null,
        zip: "00100", city: "Roma", country: "IT", phone: null,
      },
      lineItems: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 2, unitPrice: 19.99 }],
    });

    expect(order).toEqual({ id: "gid://shopify/Order/999", name: "#999" });
  });

  it("createOrder sends the transaction amount and line item prices as correctly formatted strings", async () => {
    let capturedBody: any = null;
    server.use(
      http.post(
        /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
        async ({ request }) => {
          capturedBody = await request.json();
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
    );

    await createOrder({
      email: "cliente@example.com",
      tags: ["redcare_it"],
      note: "Importato da Mirakl — ordine MK-1",
      currency: "EUR",
      totalAmount: 44.97,
      shippingAmount: 4.99,
      shippingAddress: {
        firstName: "Mario", lastName: "Rossi", address1: "Via Roma 1", address2: null,
        zip: "00100", city: "Roma", country: "IT", phone: null,
      },
      lineItems: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 2, unitPrice: 19.99 }],
    });

    expect(capturedBody).not.toBeNull();
    const amount = capturedBody.variables.order.transactions[0].amountSet.shopMoney.amount;
    expect(amount).toBe("44.97");
    expect(typeof amount).toBe("string");

    const lineItem = capturedBody.variables.order.lineItems[0];
    expect(lineItem.priceSet.shopMoney.amount).toBe("19.99");
    expect(typeof lineItem.priceSet.shopMoney.amount).toBe("string");
    expect(lineItem.priceSet.shopMoney.currencyCode).toBe("EUR");

    // requiresShipping va inviato esplicitamente: nello schema 2025-01 il
    // default è false (non eredita l'impostazione della variante), e una riga
    // non spedibile romperebbe il flusso fulfillment -> tracking Mirakl.
    expect(lineItem.requiresShipping).toBe(true);

    // La spedizione (inclusa in totalAmount) viaggia come shippingLines,
    // altrimenti il totale calcolato da Shopify non riconcilia con la transazione.
    expect(capturedBody.variables.order.shippingLines).toEqual([
      { title: "Spedizione", priceSet: { shopMoney: { amount: "4.99", currencyCode: "EUR" } } },
    ]);
  });

  it("createOrder omits shippingLines when the shipping amount is zero", async () => {
    let capturedBody: any = null;
    server.use(
      http.post(
        /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
        async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            data: {
              orderCreate: {
                order: { id: "gid://shopify/Order/1000", name: "#1000" },
                userErrors: [],
              },
            },
          });
        },
      ),
    );

    await createOrder({
      email: null,
      tags: ["redcare_it"],
      note: "Importato da Mirakl — ordine MK-2",
      currency: "EUR",
      totalAmount: 39.98,
      shippingAmount: 0,
      shippingAddress: {
        firstName: "Mario", lastName: "Rossi", address1: "Via Roma 1", address2: null,
        zip: "00100", city: "Roma", country: "IT", phone: null,
      },
      lineItems: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 2, unitPrice: 19.99 }],
    });

    expect(capturedBody.variables.order.shippingLines).toBeUndefined();
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
        shippingAmount: 0,
        shippingAddress: {
          firstName: "A", lastName: "B", address1: "X", address2: null,
          zip: "00100", city: "Roma", country: "IT", phone: null,
        },
        lineItems: [{ variantId: "gid://shopify/ProductVariant/bad", quantity: 1, unitPrice: 5 }],
      }),
    ).rejects.toThrow(/Invalid variant/);
  });
});
