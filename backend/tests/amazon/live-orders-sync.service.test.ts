import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountId: "account-live-orders",
  fetchOrders: vi.fn(),
  fetchItems: vi.fn(),
  findStates: vi.fn(),
  ingest: vi.fn(),
  broadcast: vi.fn(),
  hasNA: vi.fn(),
}));

vi.mock("../../src/db", () => ({ prisma: {} }));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => mocks.accountId),
}));
vi.mock("../../src/amazon/sp-api.service", () => ({
  fetchOrdersCreatedSince: mocks.fetchOrders,
  fetchOrderItems: mocks.fetchItems,
}));
vi.mock("../../src/repositories/amazon/orders.repo", () => ({
  findAmazonOrderSyncStates: mocks.findStates,
}));
vi.mock("../../src/amazon/ingest.service", () => ({
  ingestOrderRows: mocks.ingest,
}));
vi.mock("../../src/amazon/token.service", () => ({ hasNACredentials: mocks.hasNA }));
vi.mock("../../src/sse/sse", () => ({ broadcast: mocks.broadcast }));

import { mapLiveOrderRows, runAmazonLiveOrdersSync } from "../../src/amazon/live-orders-sync.service";

const order = {
  AmazonOrderId: "ORDER-1",
  PurchaseDate: "2026-10-16T08:00:00Z",
  LastUpdateDate: "2026-10-16T08:01:00Z",
  OrderStatus: "Unshipped",
  SalesChannel: "Amazon.it",
  MarketplaceId: "APJ6JRA9NG5V4",
  FulfillmentChannel: "MFN",
  ShippingAddress: { CountryCode: "IT" },
  OrderTotal: { Amount: "21.90", CurrencyCode: "EUR" },
  IsBusinessOrder: true,
};
const item = {
  ASIN: "B0LIVE",
  SellerSKU: "LIVE-SKU",
  Title: "Live product",
  QuantityOrdered: 2,
  QuantityShipped: 0,
  ItemPrice: { Amount: "21.90", CurrencyCode: "EUR" },
  ItemTax: { Amount: "1.97", CurrencyCode: "EUR" },
  PromotionDiscount: { Amount: "2.00", CurrencyCode: "EUR" },
};

describe("live Orders API sync", () => {
  beforeEach(() => {
    mocks.accountId = "account-live-orders";
    mocks.fetchOrders.mockReset().mockResolvedValue([order]);
    mocks.fetchItems.mockReset().mockResolvedValue([item]);
    mocks.findStates.mockReset().mockResolvedValue([]);
    mocks.ingest.mockReset().mockResolvedValue({
      recordsIn: 1, recordsImported: 1, recordsUpdated: 0, recordsRejected: 0,
    });
    mocks.broadcast.mockReset();
    mocks.hasNA.mockReset().mockResolvedValue(false);
  });

  it("maps product and economic detail into report-compatible fields", () => {
    expect(mapLiveOrderRows(order, [item])).toEqual([expect.objectContaining({
      "amazon-order-id": "ORDER-1",
      "fulfillment-channel": "Merchant",
      asin: "B0LIVE",
      sku: "LIVE-SKU",
      quantity: "2",
      "item-price": "21.9",
      "item-tax": "1.97",
      "item-promotion-discount": "2",
    })]);
  });

  it("fetches items only for missing orders, ingests them, and broadcasts", async () => {
    await runAmazonLiveOrdersSync();

    expect(mocks.fetchItems).toHaveBeenCalledWith("ORDER-1", "EU");
    expect(mocks.findStates).toHaveBeenCalledTimes(2);
    expect(mocks.ingest).toHaveBeenCalledWith([
      expect.objectContaining({ "amazon-order-id": "ORDER-1", asin: "B0LIVE" }),
    ]);
    expect(mocks.broadcast).toHaveBeenCalledWith("amazon:sync", expect.objectContaining({
      source: "orders_api", recordsImported: 1,
    }));
  });

  it("does not overwrite a report row that arrives while item detail is loading", async () => {
    mocks.findStates
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        amazonOrderId: "ORDER-1",
        lastUpdatedDate: new Date(order.LastUpdateDate),
        itemCount: 1,
      }]);
    mocks.ingest.mockResolvedValue({
      recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0,
    });

    await runAmazonLiveOrdersSync();

    expect(mocks.fetchItems).toHaveBeenCalledOnce();
    expect(mocks.ingest).toHaveBeenCalledWith([]);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("does not overlap two live syncs for the same account", async () => {
    let release!: (orders: unknown[]) => void;
    mocks.fetchOrders.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));

    const first = runAmazonLiveOrdersSync();
    await vi.waitFor(() => expect(mocks.fetchOrders).toHaveBeenCalledTimes(1));
    await runAmazonLiveOrdersSync();
    expect(mocks.fetchOrders).toHaveBeenCalledTimes(1);

    release([]);
    await first;
  });
});
