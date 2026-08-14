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
        lineItems: [{ variantId: "gid://shopify/ProductVariant/bad", quantity: 1, unitPrice: 5 }],
      }),
    ).rejects.toThrow(/Invalid variant/);
  });
});
