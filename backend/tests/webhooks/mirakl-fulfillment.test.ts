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

  // Async processing runs inside `setImmediate` in webhooks.ts and chains
  // several real awaits (Testcontainers Postgres queries, an MSW-mocked
  // fetch call) — those don't settle within a single event-loop tick, so a
  // bare `await new Promise((r) => setImmediate(r))` races the handler and
  // is flaky. Poll the WebhookEventLog row instead: webhooks.ts marks it
  // `processed: true` as the very last step of the try block, regardless of
  // which topic branch ran, so this is a reliable "processing has finished"
  // signal for every test below (including the two where no MiraklOrder row
  // is touched).
  async function waitForProcessed(shopifyId: string, topic: string) {
    await vi.waitFor(
      async () => {
        const logEntry = await db.prisma.webhookEventLog.findFirst({
          where: { shopifyId, topic, processed: true },
        });
        expect(logEntry).not.toBeNull();
      },
      { timeout: 5000, interval: 20 },
    );
  }

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
    let shipCalls = 0;
    server.use(
      http.put(/mirakl\.net\/api\/orders\/MK-1\/tracking/, async ({ request }) => {
        capturedTracking = await request.json();
        return HttpResponse.json({});
      }),
      // OR24: senza questa chiamata Mirakl non marcherebbe mai l'ordine spedito.
      http.put(/mirakl\.net\/api\/orders\/MK-1\/ship/, async () => {
        shipCalls++;
        return HttpResponse.json({});
      }),
    );

    const { req, res } = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-order-id": "999", "x-shopify-hmac-sha256": "" },
      { order_id: 999, tracking_number: "TRACK-1", tracking_company: "BRT" },
    );

    await handleWebhook(req, res);
    await waitForProcessed("999", "fulfillments/create");

    expect(capturedTracking).toEqual({
      carrier_name: "BRT",
      tracking_number: "TRACK-1",
      carrier_url: undefined,
    });
    expect(shipCalls).toBe(1);

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
    await waitForProcessed("111", "fulfillments/create");

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
    await waitForProcessed("2", "fulfillments/create");

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-2" } });
    expect(row?.trackingNumber).toBe("TRACK-2"); // unchanged
  });

  it("falls back to payload.order_id when x-shopify-order-id header is missing", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-3",
        shopifyOrderId: "gid://shopify/Order/333",
        country: "IT",
        miraklState: "ACCEPTED",
      },
    });

    let capturedTracking: any = null;
    server.use(
      http.put(/mirakl\.net\/api\/orders\/MK-3\/tracking/, async ({ request }) => {
        capturedTracking = await request.json();
        return HttpResponse.json({});
      }),
      miraklMocks.shipConfirm(),
    );

    // No "x-shopify-order-id" header at all — fulfillments/create doesn't
    // guarantee it the way orders/* topics do. The order id must come from
    // the payload instead.
    const { req, res } = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-hmac-sha256": "" },
      { order_id: 333, tracking_number: "TRACK-3", tracking_company: "GLS" },
    );

    await handleWebhook(req, res);
    // shopifyId is now derived from payload.order_id when the header is
    // missing (see webhooks.ts) — the WebhookEventLog row is keyed on "333",
    // not "".
    await waitForProcessed("333", "fulfillments/create");

    expect(capturedTracking).toEqual({
      carrier_name: "GLS",
      tracking_number: "TRACK-3",
      carrier_url: undefined,
    });

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-3" } });
    expect(row?.miraklState).toBe("SHIPPED");
    expect(row?.trackingNumber).toBe("TRACK-3");
  });

  it("does not collapse the idempotency key across different orders when the header is missing for both", async () => {
    // Regression test for the dedup-collision bug: if shopifyId fell back to
    // the raw (empty) header instead of payload.order_id, both webhooks below
    // would share WebhookEventLog key {shopifyId: "", topic: "fulfillments/create"}.
    // The first to finish would mark that row processed:true, and the second
    // would hit the idempotency short-circuit and return before ever reaching
    // the fulfillments/create branch — silently dropping tracking sync for
    // every order after the first.
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-5",
        shopifyOrderId: "gid://shopify/Order/444",
        country: "IT",
        miraklState: "ACCEPTED",
      },
    });
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-6",
        shopifyOrderId: "gid://shopify/Order/555",
        country: "IT",
        miraklState: "ACCEPTED",
      },
    });

    const captured: Record<string, any> = {};
    server.use(
      http.put(/mirakl\.net\/api\/orders\/MK-5\/tracking/, async ({ request }) => {
        captured["MK-5"] = await request.json();
        return HttpResponse.json({});
      }),
      http.put(/mirakl\.net\/api\/orders\/MK-6\/tracking/, async ({ request }) => {
        captured["MK-6"] = await request.json();
        return HttpResponse.json({});
      }),
      miraklMocks.shipConfirm(),
    );

    const first = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-hmac-sha256": "" },
      { order_id: 444, tracking_number: "TRACK-444", tracking_company: "BRT" },
    );
    const second = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-hmac-sha256": "" },
      { order_id: 555, tracking_number: "TRACK-555", tracking_company: "DHL" },
    );

    await handleWebhook(first.req, first.res);
    await waitForProcessed("444", "fulfillments/create");

    await handleWebhook(second.req, second.res);
    await waitForProcessed("555", "fulfillments/create");

    expect(captured["MK-5"]).toEqual({
      carrier_name: "BRT",
      tracking_number: "TRACK-444",
      carrier_url: undefined,
    });
    expect(captured["MK-6"]).toEqual({
      carrier_name: "DHL",
      tracking_number: "TRACK-555",
      carrier_url: undefined,
    });

    const row5 = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-5" } });
    const row6 = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-6" } });
    expect(row5?.miraklState).toBe("SHIPPED");
    expect(row6?.miraklState).toBe("SHIPPED");
  });

  it("does not call Mirakl when the local row is still PENDING_ACCEPT", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-4",
        shopifyOrderId: "gid://shopify/Order/4",
        country: "IT",
        miraklState: "PENDING_ACCEPT",
      },
    });

    // No miraklMocks.shipOrder registered on purpose — calling Mirakl here
    // would race ahead of local acceptance state and hit onUnhandledRequest.
    const { req, res } = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-order-id": "4", "x-shopify-hmac-sha256": "" },
      { order_id: 4, tracking_number: "TRACK-4", tracking_company: "BRT" },
    );

    await handleWebhook(req, res);
    await waitForProcessed("4", "fulfillments/create");

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-4" } });
    expect(row?.miraklState).toBe("PENDING_ACCEPT");
    expect(row?.trackingNumber).toBeNull();
    expect(row?.trackingSyncedAt).toBeNull();

    // Il no-op non deve essere silenzioso: caso realistico è l'accettazione
    // manuale nel back-office Mirakl, che lascia lo stato locale indietro.
    const errors = await db.prisma.appErrorLog.findMany({ where: { source: "webhook-fulfillment" } });
    expect(errors.length).toBe(1);
    expect(errors[0].context).toMatchObject({
      shopifyOrderId: "gid://shopify/Order/4",
      miraklOrderId: "MK-4",
      miraklState: "PENDING_ACCEPT",
    });
  });

  it("logs (and does not crash) when the fulfillment payload has no tracking number", async () => {
    await db.prisma.miraklOrder.create({
      data: {
        miraklOrderId: "MK-7",
        shopifyOrderId: "gid://shopify/Order/7",
        country: "IT",
        miraklState: "ACCEPTED",
      },
    });

    // Nessun handler Mirakl registrato: senza tracking number non deve partire
    // alcuna chiamata (finirebbe in onUnhandledRequest:'error').
    const { req, res } = makeReqRes(
      { "x-shopify-topic": "fulfillments/create", "x-shopify-order-id": "7", "x-shopify-hmac-sha256": "" },
      { order_id: 7, tracking_company: "BRT" },
    );

    await handleWebhook(req, res);
    await waitForProcessed("7", "fulfillments/create");

    const row = await db.prisma.miraklOrder.findUnique({ where: { miraklOrderId: "MK-7" } });
    expect(row?.miraklState).toBe("ACCEPTED"); // invariato, nessun crash
    expect(row?.trackingSyncedAt).toBeNull();

    const errors = await db.prisma.appErrorLog.findMany({ where: { source: "webhook-fulfillment" } });
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/tracking number/i);
    expect(errors[0].context).toMatchObject({
      shopifyOrderId: "gid://shopify/Order/7",
      miraklOrderId: "MK-7",
    });
  });
});
