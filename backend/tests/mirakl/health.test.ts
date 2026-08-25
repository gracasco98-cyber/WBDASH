import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";
import { miraklMocks } from "../helpers/msw-server";

const server = setupServer();

function summary(overrides: Partial<{ order_id: string; order_state: string; created_date: string }> = {}) {
  return {
    order_id: "IT-1",
    order_state: "RECEIVED",
    created_date: new Date().toISOString(),
    currency_iso_code: "EUR",
    total_price: 10,
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
      { order_line_id: "L1", offer_sku: "SKU-001", product_title: "Prodotto A", quantity: 1, price_unit: 10, price: 10, total_price: 10 },
    ],
    ...overrides,
  };
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

describe("findStuckMiraklOrders", () => {
  let db: TestDb;
  let findStuckMiraklOrders: typeof import("../../src/mirakl/health").findStuckMiraklOrders;

  beforeAll(async () => {
    db = await setupTestDb();
    process.env.DATABASE_URL = db.databaseUrl;
    process.env.MIRAKL_API_URL = "https://shopapotheke.mirakl.net/api";
    process.env.MIRAKL_API_KEY = "test-key";

    const health = await import("../../src/mirakl/health");
    findStuckMiraklOrders = health.findStuckMiraklOrders;

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

  it("ignores an order already synced into WBDASH, regardless of state or age", async () => {
    await db.prisma.miraklOrder.create({
      data: { miraklOrderId: "IT-1", shopifyOrderId: "gid://shopify/Order/1", country: "IT", miraklState: "ACCEPTED" },
    });
    server.use(miraklMocks.newOrders([summary({ order_id: "IT-1", created_date: hoursAgo(10) })]));

    expect(await findStuckMiraklOrders()).toEqual([]);
  });

  it("ignores an order in a known-negative terminal state (e.g. CANCELED), even if old and unsynced", async () => {
    server.use(miraklMocks.newOrders([summary({ order_id: "IT-2", order_state: "CANCELED", created_date: hoursAgo(10) })]));

    expect(await findStuckMiraklOrders()).toEqual([]);
  });

  it("does not flag a known-safe order that's still within the normal sync delay", async () => {
    server.use(miraklMocks.newOrders([summary({ order_id: "IT-3", order_state: "RECEIVED", created_date: hoursAgo(0.5) })]));

    expect(await findStuckMiraklOrders(3, 2)).toEqual([]);
  });

  it("flags a known-safe order stuck past the stale threshold as 'unsynced'", async () => {
    server.use(miraklMocks.newOrders([summary({ order_id: "IT-4", order_state: "RECEIVED", created_date: hoursAgo(3) })]));

    const stuck = await findStuckMiraklOrders(3, 2);
    expect(stuck).toHaveLength(1);
    expect(stuck[0]).toMatchObject({ orderId: "IT-4", orderState: "RECEIVED", reason: "unsynced" });
    expect(stuck[0].ageHours).toBeGreaterThan(2);
  });

  it("flags an order in a state outside both the safe and ignored lists as 'unrecognized' (e.g. a future Mirakl state never mapped before)", async () => {
    server.use(miraklMocks.newOrders([summary({ order_id: "IT-5", order_state: "SOME_FUTURE_STATE", created_date: hoursAgo(3) })]));

    const stuck = await findStuckMiraklOrders(3, 2);
    expect(stuck).toEqual([
      expect.objectContaining({ orderId: "IT-5", orderState: "SOME_FUTURE_STATE", reason: "unrecognized" }),
    ]);
  });

  it("gives an unrecognized-state order the same grace period as a safe one, instead of alerting immediately", async () => {
    server.use(miraklMocks.newOrders([summary({ order_id: "IT-6", order_state: "SOME_FUTURE_STATE", created_date: hoursAgo(0.5) })]));

    expect(await findStuckMiraklOrders(3, 2)).toEqual([]);
  });
});
