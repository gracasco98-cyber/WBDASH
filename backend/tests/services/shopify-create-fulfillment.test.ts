// backend/tests/services/shopify-create-fulfillment.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "../helpers/msw-server";

const server = setupServer();

describe("shopify.service — createFulfillment", () => {
  let createFulfillment: typeof import("../../src/services/shopify.service").createFulfillment;

  beforeAll(async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test-shop.myshopify.com";
    process.env.SHOPIFY_ADMIN_TOKEN = "shpat_test_token";

    const svc = await import("../../src/services/shopify.service");
    createFulfillment = svc.createFulfillment;

    server.listen({ onUnhandledRequest: "error" });
  });

  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  function mockFulfillmentFlow(opts: {
    fulfillmentOrderId?: string | null;
    fulfillmentResult?: { id: string; status: string } | { userErrors: Array<{ field: string[]; message: string }> };
    captureCreateBody?: (body: any) => void;
  }) {
    return http.post(
      /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
      async ({ request }) => {
        const body: any = await request.clone().json();

        if (body?.query?.includes("GetFulfillmentOrders")) {
          return HttpResponse.json({
            data: {
              order: opts.fulfillmentOrderId === null
                ? null
                : {
                    fulfillmentOrders: {
                      edges: [{ node: { id: opts.fulfillmentOrderId ?? "gid://shopify/FulfillmentOrder/1" } }],
                    },
                  },
            },
          });
        }

        if (body?.query?.includes("CreateFulfillment")) {
          opts.captureCreateBody?.(body.variables);
          const result = opts.fulfillmentResult ?? { id: "gid://shopify/Fulfillment/1", status: "SUCCESS" };
          return HttpResponse.json({
            data: {
              fulfillmentCreateV2:
                "id" in result
                  ? { fulfillment: result, userErrors: [] }
                  : { fulfillment: null, userErrors: result.userErrors },
            },
          });
        }

        return undefined; // non è mio
      },
    );
  }

  it("looks up the fulfillment order then creates a fulfillment with tracking info", async () => {
    let capturedVars: any = null;
    server.use(mockFulfillmentFlow({
      fulfillmentOrderId: "gid://shopify/FulfillmentOrder/42",
      fulfillmentResult: { id: "gid://shopify/Fulfillment/777", status: "SUCCESS" },
      captureCreateBody: (vars) => { capturedVars = vars; },
    }));

    const result = await createFulfillment({
      orderId: "gid://shopify/Order/999",
      trackingNumber: "1UW1TJV560728",
      trackingUrl: "https://www.poste.it/cerca/index.html#/risultati-spedizioni/1UW1TJV560728",
      trackingCompany: "Poste Italiane",
    });

    expect(result).toEqual({ id: "gid://shopify/Fulfillment/777", status: "SUCCESS" });
    expect(capturedVars.fulfillment.lineItemsByFulfillmentOrder).toEqual([
      { fulfillmentOrderId: "gid://shopify/FulfillmentOrder/42" },
    ]);
    expect(capturedVars.fulfillment.trackingInfo).toEqual({
      number: "1UW1TJV560728",
      url: "https://www.poste.it/cerca/index.html#/risultati-spedizioni/1UW1TJV560728",
      company: "Poste Italiane",
    });
    // Import storico: non deve notificare il cliente per una spedizione passata.
    expect(capturedVars.fulfillment.notifyCustomer).toBe(false);
  });

  it("throws when the order has no fulfillment orders", async () => {
    server.use(mockFulfillmentFlow({ fulfillmentOrderId: null }));

    await expect(
      createFulfillment({
        orderId: "gid://shopify/Order/999",
        trackingNumber: "T1",
        trackingCompany: "BRT",
      }),
    ).rejects.toThrow(/Nessun FulfillmentOrder trovato/);
  });

  it("throws when Shopify returns userErrors", async () => {
    server.use(mockFulfillmentFlow({
      fulfillmentOrderId: "gid://shopify/FulfillmentOrder/42",
      fulfillmentResult: { userErrors: [{ field: ["fulfillment"], message: "Already fulfilled" }] },
    }));

    await expect(
      createFulfillment({
        orderId: "gid://shopify/Order/999",
        trackingNumber: "T1",
        trackingCompany: "BRT",
      }),
    ).rejects.toThrow(/Already fulfilled/);
  });
});
