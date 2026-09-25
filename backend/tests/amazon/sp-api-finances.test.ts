import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/amazon/token.service", () => ({
  getSpApiToken: vi.fn(async () => "token-eu"),
  getSpApiTokenNA: vi.fn(async () => "token-na"),
  invalidateTokens: vi.fn(),
}));

import { fetchProductAdsPaymentEvents } from "../../src/amazon/sp-api.service";

const page = (events: unknown[], nextToken?: string) => ({
  ok: true,
  status: 200,
  json: async () => ({
    payload: {
      FinancialEvents: { ProductAdsPaymentEventList: events },
      ...(nextToken ? { NextToken: nextToken } : {}),
    },
  }),
});

describe("fetchProductAdsPaymentEvents", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows NextToken with the same arguments and flattens every page", async () => {
    fetchMock
      .mockResolvedValueOnce(page([{ invoiceId: "A" }], "token/2"))
      .mockResolvedValueOnce(page([{ invoiceId: "B" }]));

    const events = await fetchProductAdsPaymentEvents(new Date("2026-06-27T12:00:00Z"), 0);

    expect(events).toEqual([{ invoiceId: "A" }, { invoiceId: "B" }]);
    const [firstUrl, secondUrl] = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(firstUrl.pathname).toBe("/finances/v0/financialEvents");
    expect(firstUrl.searchParams.get("PostedAfter")).toBe("2026-06-27T12:00:00.000Z");
    expect(firstUrl.searchParams.get("MaxResultsPerPage")).toBe("100");
    expect(secondUrl.searchParams.get("PostedAfter")).toBe("2026-06-27T12:00:00.000Z");
    expect(secondUrl.searchParams.get("NextToken")).toBe("token/2");
  });

  it("treats a page without the ads list as empty", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ payload: { FinancialEvents: {} } }) });

    await expect(fetchProductAdsPaymentEvents(new Date("2026-09-01T00:00:00Z"), 0)).resolves.toEqual([]);
  });
});
