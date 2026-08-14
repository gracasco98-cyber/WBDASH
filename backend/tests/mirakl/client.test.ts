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
