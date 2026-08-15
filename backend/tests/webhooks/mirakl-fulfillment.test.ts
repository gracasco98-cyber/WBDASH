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
    await waitForProcessed("999", "fulfillments/create");

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
});
