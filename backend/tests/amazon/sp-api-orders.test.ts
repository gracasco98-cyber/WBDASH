import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/amazon/token.service", () => ({
  getSpApiToken: vi.fn(async () => "token-eu"),
  getSpApiTokenNA: vi.fn(async () => "token-na"),
  invalidateTokens: vi.fn(),
}));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => "account-orders"),
}));

import { fetchOrderItems, fetchOrdersCreatedSince } from "../../src/amazon/sp-api.service";

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => ({ payload }) };
}

describe("Orders API client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("paginates recent orders without repeating filters on NextToken", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ Orders: [{ AmazonOrderId: "A-1" }], NextToken: "next orders" }))
      .mockResolvedValueOnce(ok({ Orders: [{ AmazonOrderId: "A-2" }] }));

    const orders = await fetchOrdersCreatedSince(
      ["MP-IT", "MP-DE"],
      new Date("2026-10-15T22:00:00Z")
    );

    expect(orders.map((order) => order.AmazonOrderId)).toEqual(["A-1", "A-2"]);
    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(firstUrl.searchParams.getAll("MarketplaceIds")).toEqual(["MP-IT", "MP-DE"]);
    expect(firstUrl.searchParams.get("CreatedAfter")).toBe("2026-10-15T22:00:00.000Z");
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(secondUrl.searchParams.get("NextToken")).toBe("next orders");
    expect(secondUrl.searchParams.has("CreatedAfter")).toBe(false);
  });

  it("paginates and URL-encodes order item requests", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ OrderItems: [{ ASIN: "ASIN-1" }], NextToken: "next items" }))
      .mockResolvedValueOnce(ok({ OrderItems: [{ ASIN: "ASIN-2" }] }));

    const items = await fetchOrderItems("ORDER/1");

    expect(items.map((item) => item.ASIN)).toEqual(["ASIN-1", "ASIN-2"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ORDER%2F1/orderItems");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("NextToken")).toBe("next items");
  });
});
