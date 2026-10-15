import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/amazon/token.service", () => ({
  getSpApiToken: vi.fn(async () => "token-eu"),
  getSpApiTokenNA: vi.fn(async () => "token-na"),
  invalidateTokens: vi.fn(),
}));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => "account-live-sales"),
}));

import { fetchTodayOrderMetrics } from "../../src/amazon/sp-api.service";

describe("fetchTodayOrderMetrics", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        payload: [{
          orderCount: 15,
          orderItemCount: 15,
          unitCount: 18,
          totalSales: { amount: 204, currencyCode: "EUR" },
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns and caches today's Sales API total for one marketplace", async () => {
    const first = await fetchTodayOrderMetrics("IT");
    const second = await fetchTodayOrderMetrics("IT");

    expect(first.IT).toMatchObject({
      marketplace: "IT",
      totalSales: 204,
      orderCount: 15,
      unitCount: 18,
      currencyCode: "EUR",
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/sales/v1/orderMetrics");
    expect(url.searchParams.get("marketplaceIds")).toBe("APJ6JRA9NG5V4");
    expect(url.searchParams.get("granularity")).toBe("Total");
    expect(url.searchParams.get("interval")).toBe(
      "2026-10-15T00:00:00+02:00--2026-10-15T23:59:59+02:00"
    );
  });
});
