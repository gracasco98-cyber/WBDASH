import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { miraklMocks, http, HttpResponse } from "../helpers/msw-server";

const server = setupServer();

function miraklRawOrder(orderId: string) {
  return {
    order_id: orderId,
    order_state: "RECEIVED",
    created_date: "2026-08-01T10:00:00Z",
    currency_iso_code: "EUR",
    total_price: 11.9,
    shipping_price: 0,
    shipping_tracking: null,
    shipping_tracking_url: null,
    shipping_company: null,
    channel: { code: "IT", label: "Canale IT" },
    customer_notification_email: "cliente@example.com",
    customer: {
      shipping_address: {
        firstname: "Mario", lastname: "Rossi", street_1: "Via Roma 1", street_2: null,
        zip_code: "00100", city: "Roma", country: "Italy", country_iso_code: "ITA", phone: null,
      },
    },
    order_lines: [
      { order_line_id: "L1", offer_sku: "SKU-001", product_title: "Prodotto A", quantity: 1, price_unit: 11.9, price: 11.9, total_price: 11.9 },
    ],
  };
}

describe("Mirakl client", () => {
  let fetchNewOrders: typeof import("../../src/mirakl/client").fetchNewOrders;
  let fetchShippedOrders: typeof import("../../src/mirakl/client").fetchShippedOrders;
  let acceptOrder: typeof import("../../src/mirakl/client").acceptOrder;
  let shipOrder: typeof import("../../src/mirakl/client").shipOrder;

  beforeAll(async () => {
    process.env.MIRAKL_API_URL = "https://shopapotheke.mirakl.net/api";
    process.env.MIRAKL_API_KEY = "test-key";

    const client = await import("../../src/mirakl/client");
    fetchNewOrders = client.fetchNewOrders;
    fetchShippedOrders = client.fetchShippedOrders;
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
          shipping_price: 4.99,
          shipping_tracking: null,
          shipping_tracking_url: null,
          shipping_company: null,
          channel: { code: "IT", label: "Canale IT" },
          customer_notification_email: "cliente@example.com",
          customer: {
            shipping_address: {
              firstname: "Mario",
              lastname: "Rossi",
              street_1: "Via Roma 1",
              street_2: null,
              zip_code: "00100",
              city: "Roma",
              country: "Italy",
              // Verificato contro l'API reale: ISO-3166-1 alpha-3, non alpha-2.
              country_iso_code: "ITA",
              phone: null,
            },
          },
          order_lines: [
            // price_unit = prezzo unitario, price = totale di riga (2 * 19.99)
            { order_line_id: "L1", offer_sku: "SKU-001", product_title: "Prodotto A", quantity: 2, price_unit: 19.99, price: 39.98, total_price: 44.97 },
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
      shippingPrice: 4.99,
      channelCode: "IT",
      customer: {
        email: "cliente@example.com",
        shippingAddress: { firstname: "Mario", countryIsoCode: "ITA" },
      },
      // id viene da order_line_id (non esiste alcun campo `id` sul wire OR11),
      // priceUnit dal prezzo unitario e price dal totale di riga.
      orderLines: [{ id: "L1", offerSku: "SKU-001", quantity: 2, priceUnit: 19.99, price: 39.98 }],
    });
  });

  it("fetchNewOrders queries WAITING_ACCEPTANCE, RECEIVED and SHIPPED — un ordine può passare a SHIPPED tra un poll e l'altro e non deve sparire dalla vista del job", async () => {
    let requestedUrl: string | null = null;
    server.use(
      http.get(/mirakl\.net\/api\/orders/, async ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ orders: [], total_count: 0 });
      }),
    );

    await fetchNewOrders();

    expect(requestedUrl).toContain("order_state_codes=WAITING_ACCEPTANCE,RECEIVED,SHIPPING,SHIPPED");
  });

  it("fetchNewOrders scorre tutte le pagine quando total_count supera la dimensione di una pagina", async () => {
    // OR11 pagina di default a 10 per pagina — total_count=15 con 2 pagine
    // (10 + 5) verifica che venga raccolto l'intero risultato, non solo la
    // prima pagina (bug reale confermato in produzione: total_count=27,
    // solo i primi 10 venivano sincronizzati).
    const page1 = Array.from({ length: 10 }, (_, i) => miraklRawOrder(`MK-P1-${i}`));
    const page2 = Array.from({ length: 5 }, (_, i) => miraklRawOrder(`MK-P2-${i}`));
    const requestedOffsets: number[] = [];

    server.use(
      http.get(/mirakl\.net\/api\/orders/, async ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset") ?? "0");
        requestedOffsets.push(offset);
        const orders = offset === 0 ? page1 : offset === 10 ? page2 : [];
        return HttpResponse.json({ orders, total_count: 15 });
      }),
    );

    const orders = await fetchNewOrders();

    expect(requestedOffsets).toEqual([0, 10]);
    expect(orders).toHaveLength(15);
    expect(orders.map((o) => o.orderId)).toEqual([
      ...page1.map((o) => o.order_id),
      ...page2.map((o) => o.order_id),
    ]);
  });

  it("fetchNewOrders skips a malformed order (es. shipping_address ancora nullo appena dopo la creazione) invece di far fallire l'intero batch", async () => {
    const goodOrder = miraklRawOrder("MK-GOOD");
    const malformedOrder = { ...miraklRawOrder("MK-BAD"), customer: { shipping_address: null } };

    server.use(miraklMocks.newOrders([goodOrder, malformedOrder]));

    const orders = await fetchNewOrders();

    expect(orders).toHaveLength(1);
    expect(orders[0].orderId).toBe("MK-GOOD");
  });

  it("fetchShippedOrders queries order_state_codes=SHIPPED and maps tracking fields", async () => {
    server.use(
      miraklMocks.newOrders([
        {
          order_id: "MK-200",
          order_state: "SHIPPED",
          created_date: "2026-07-01T10:00:00Z",
          currency_iso_code: "EUR",
          total_price: 11.9,
          shipping_price: 0,
          shipping_tracking: "1UW1TJV560728",
          shipping_tracking_url: "https://www.poste.it/cerca/index.html#/risultati-spedizioni/1UW1TJV560728",
          shipping_company: "Poste Italiane",
          channel: { code: "IT", label: "Canale IT" },
          customer_notification_email: "cliente@example.com",
          customer: {
            shipping_address: {
              firstname: "Mario", lastname: "Rossi", street_1: "Via Roma 1", street_2: null,
              zip_code: "00100", city: "Roma", country: "Italy", country_iso_code: "ITA", phone: null,
            },
          },
          order_lines: [
            { order_line_id: "L1", offer_sku: "SKU-001", product_title: "Prodotto A", quantity: 1, price_unit: 11.9, price: 11.9, total_price: 11.9 },
          ],
        },
      ]),
    );

    const orders = await fetchShippedOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderId: "MK-200",
      orderState: "SHIPPED",
      shippingTracking: "1UW1TJV560728",
      shippingTrackingUrl: "https://www.poste.it/cerca/index.html#/risultati-spedizioni/1UW1TJV560728",
      shippingCompany: "Poste Italiane",
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

  it("shipOrder sends tracking info as snake_case (OR23) and then confirms the shipment (OR24)", async () => {
    let capturedBody: any = null;
    let shipCalls = 0;
    const callOrder: string[] = [];
    server.use(
      http.put(/mirakl\.net\/api\/orders\/MK-100\/tracking/, async ({ request }) => {
        capturedBody = await request.json();
        callOrder.push("tracking");
        return HttpResponse.json({});
      }),
      http.put(/mirakl\.net\/api\/orders\/MK-100\/ship/, async () => {
        shipCalls++;
        callOrder.push("ship");
        return HttpResponse.json({});
      }),
    );

    await shipOrder("MK-100", { carrierName: "BRT", trackingNumber: "T123" });
    expect(capturedBody).toEqual({
      carrier_name: "BRT",
      tracking_number: "T123",
      carrier_url: undefined,
    });
    // OR23 aggiorna solo il tracking: senza OR24 l'ordine non passa mai a SHIPPED.
    expect(shipCalls).toBe(1);
    expect(callOrder).toEqual(["tracking", "ship"]);
  });

  it("shipOrder does NOT call OR24 when the tracking update (OR23) fails", async () => {
    let shipCalls = 0;
    server.use(
      http.put(/mirakl\.net\/api\/orders\/MK-100\/tracking/, async () =>
        new HttpResponse("boom", { status: 500 })),
      http.put(/mirakl\.net\/api\/orders\/MK-100\/ship/, async () => {
        shipCalls++;
        return HttpResponse.json({});
      }),
    );

    await expect(
      shipOrder("MK-100", { carrierName: "BRT", trackingNumber: "T123" }),
    ).rejects.toThrow(/Mirakl API error 500/);
    expect(shipCalls).toBe(0);
  });

  it("throws with status and body on non-2xx response", async () => {
    server.use(miraklMocks.httpError(500, "boom"));
    await expect(fetchNewOrders()).rejects.toThrow(/Mirakl API error 500/);
  });

  it("acceptOrder handles 204 No Content (empty body) response", async () => {
    server.use(miraklMocks.acceptOrder(204));
    await expect(acceptOrder("MK-100", ["L1", "L2"])).resolves.toBeUndefined();
  });

  it("shipOrder handles 204 No Content (empty body) response", async () => {
    server.use(miraklMocks.shipOrder(204), miraklMocks.shipConfirm(204));
    await expect(shipOrder("MK-100", { carrierName: "BRT", trackingNumber: "T123" })).resolves.toBeUndefined();
  });
});
